import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  deleteField,
} from "firebase/firestore";

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Fonction de normalisation pour les noms d'exercices
// Permet de matcher les exercices peu importe l'orthographe
const normalizeExerciseName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()                           // minuscules
    .normalize("NFD")                        // décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, "")        // supprime les accents
    // "/" (et les autres caractères interdits dans un identifiant de
    // document Firestore) sont remplacés par un espace : un nom comme
    // "flexion/extension ischio" faisait planter toute la page, Firestore
    // lisant le "/" comme un séparateur de dossier dans l'identifiant du
    // document exerciseMedia (erreur "Invalid document reference" non
    // rattrapée = écran noir figé).
    .replace(/[/\\.]/g, " ")
    .trim()                                  // supprime espaces début/fin
    .replace(/\s+/g, " ");                  // normalise espaces multiples en un seul
};

// Catégories d'exercices pour "Mes RM" — utilisées pour classer la banque
// d'exercices (gestionnaire "🔤 Noms d'exercices") et filtrer/regrouper
// côté athlète (MyRM) et côté coach (Dashboard, détail athlète).
const EXERCISE_CATEGORIES = [
  { value: "bas_corps", label: "🦵 Bas du corps" },
  { value: "haut_tirage", label: "💪 Haut du corps — Tirage" },
  { value: "haut_pousse", label: "💪 Haut du corps — Poussée" },
  { value: "gainage", label: "🧱 Gainage" },
  { value: "autre", label: "📦 Autre" },
];
// Anciennes fiches catégorisées avant la fusion "Chaîne antérieure" /
// "Chaîne postérieure" en une seule catégorie "Bas du corps" — pour que ces
// exercices restent correctement classés sans avoir à être retapés.
const normalizeCategoryValue = (value) =>
  value === "bas_anterieure" || value === "bas_posterieure" ? "bas_corps" : value;
const getExerciseCategoryLabel = (value) =>
  EXERCISE_CATEGORIES.find((c) => c.value === normalizeCategoryValue(value))?.label ||
  "📦 Autre";

// Harmonise UNIQUEMENT la casse d'un nom d'exercice (une majuscule à
// chaque mot/segment) — jamais l'orthographe : les noms sont un mélange de
// français ("Développé couché") et d'anglais ("Hip Thrust", "Nordic Curl"),
// et une correction automatique risquerait de "corriger" un terme anglais
// correct en le traitant comme une faute de français (ou l'inverse). La
// correction orthographique reste volontairement manuelle, via le
// gestionnaire de noms d'exercices — c'est le coach qui sait quels termes
// sont volontairement en anglais.
const formatExerciseDisplayName = (name) => {
  if (!name) return name;
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        )
        .join("-")
    )
    .join(" ");
};

/* ===================== ESTIMATION DE DURÉE (formule unique, normalisée) =====================
   Une seule et même règle pour les trois types de séance, utilisée à la
   création, à la modification ET par le bouton "Recalculer toutes les
   séances" du gestionnaire d'exercices — pour que le chiffre affiché soit
   TOUJOURS cohérent avec les champs réellement saisis, et augmente
   toujours quand on ajoute des séries/reps/sets (plus jamais de calcul
   "par round partagé" qui pouvait donner un total plus bas après une
   simple modification).
   - Muscu : pour chaque exercice, séries × (reps × 3s + repos). Chaque
     exercice compte pour lui-même (pas de repos mutualisé entre exercices
     d'un même bloc) : simple à suivre, et ajouter une série ou un exercice
     ne peut jamais faire baisser le total.
   - Sprint : pour chaque exercice, sets × reps × (temps de course estimé
     [distance / 7 m/s, vitesse de sprint moyenne approximative] + repos
     entre répétitions).
   - Endurance/VMA : pour chaque exercice, reps × (temps d'effort + repos
     entre répétitions) + repos après le bloc (une fois, pas par rep). */
const estimateSessionDurationSeconds = (type, blocks) => {
  if (!Array.isArray(blocks)) return 0;
  if (type === "sprint") {
    return blocks.reduce(
      (t, b) =>
        t +
        (b.exercises || []).reduce((st, ex) => {
          const sets = ex.sets || 3;
          const reps = ex.reps || 6;
          const runTime = (ex.distance || 30) / 7;
          const recovery = (ex.recoveryMin || 0) * 60 + (ex.recoverySec || 0);
          return st + sets * reps * (runTime + recovery);
        }, 0),
      0
    );
  }
  if (type === "endurance" || type === "vma") {
    return blocks.reduce(
      (t, b) =>
        t +
        (b.exercises || []).reduce((st, ex) => {
          const reps = ex.reps || 10;
          const effort = ex.effortTime || 30;
          const recovery = (ex.recoveryMin || 0) * 60 + (ex.recoverySec || 0);
          const blockRecovery =
            (ex.blockRecoveryMin || 0) * 60 + (ex.blockRecoverySec || 0);
          return st + reps * (effort + recovery) + blockRecovery;
        }, 0),
      0
    );
  }
  // Muscu (et tout type inconnu) : formule simple, additive, par exercice.
  return blocks.reduce(
    (t, b) =>
      t +
      (b.exercises || []).reduce(
        (st, ex) =>
          st + (ex.series || 3) * ((ex.reps || 8) * 3 + (ex.restMin ?? b.restMin ?? 2) * 60),
        0
      ),
    0
  );
};

// Cadre fixe d'affichage des photos/gifs de démonstration + zoom réglable
const MEDIA_FRAME_HEIGHT = 220;
const DEFAULT_MEDIA_ZOOM = 100; // en %
const MIN_MEDIA_ZOOM = 40;
const MAX_MEDIA_ZOOM = 250;

export default function Workout() {
  const { currentUser, userRole, userGroup, isSuperAdmin } = useAuth();
  const isAdminLike = userRole === "admin" || isSuperAdmin;

  const [events, setEvents] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);

  const [title, setTitle] = useState("");
  const [group, setGroup] = useState("total");
  const [targetUserId, setTargetUserId] = useState("");
  const [formDate, setFormDate] = useState(new Date());
  const [workoutType, setWorkoutType] = useState("muscu");

  const [athletes, setAthletes] = useState([]);
  // Filtres calendrier (admin) : filtrent le calendrier MENSUEL en place
  // (pas de vue séparée) sur les séances visibles par un athlète OU par un
  // groupe personnalisé donné. Mutuellement exclusifs — choisir l'un
  // réinitialise l'autre, pour ne pas avoir un filtrage ambigu des deux à
  // la fois. Laisser les deux vides redonne le calendrier complet.
  const [athleteFilterId, setAthleteFilterId] = useState("");
  const [groupFilterId, setGroupFilterId] = useState("");
  const [blocks, setBlocks] = useState([
    {
      name: "Bloc A",
      restMin: 2,
      exercises: [
        {
          name: "",
          description: "",
          series: 3,
          reps: 8,
          tempo: "2-0-2",
          restMin: 2,
          rmPercent: 70,
          rmName: "",
        },
      ],
    },
  ]);

  const [selectedSession, setSelectedSession] = useState(null);
  const [userRM, setUserRM] = useState({});
  // Noms d'exercices repérés dans "Mes RM" (base des séries en % de charge) :
  // pas forcément tapés dans une séance, mais on veut qu'ils apparaissent
  // aussi dans le gestionnaire "🔤 Noms d'exercices" pour pouvoir leur
  // associer une photo. Clé = nom normalisé -> { name: nom d'origine }.
  const [rmExerciseNames, setRmExerciseNames] = useState({});
  const [vma, setVma] = useState(null);

  const [sessionInProgress, setSessionInProgress] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState({});
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [currentExerciseFeedback, setCurrentExerciseFeedback] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateWeekStart, setDuplicateWeekStart] = useState(null);
  const [showDuplicateSessionModal, setShowDuplicateSessionModal] = useState(false);
  const [sessionToDuplicate, setSessionToDuplicate] = useState(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState(null);
  const [showDuplicateDayModal, setShowDuplicateDayModal] = useState(false);
  const [duplicateDaySource, setDuplicateDaySource] = useState(null);
  const [duplicateDayTarget, setDuplicateDayTarget] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState({});
  // Verrous anti-double-soumission (clic multiple / double-tap mobile) pour
  // les duplications — un état seul ne suffit pas car deux clics rapides
  // peuvent partir avant le premier re-render, d'où l'usage d'une ref
  // (synchrone, contrairement à setState).
  const [isDuplicatingWeek, setIsDuplicatingWeek] = useState(false);
  const [isDuplicatingSession, setIsDuplicatingSession] = useState(false);
  const [isDuplicatingDay, setIsDuplicatingDay] = useState(false);
  const duplicatingDayLock = useRef(false);
  const duplicatingWeekLock = useRef(false);
  const duplicatingSessionLock = useRef(false);
  const [recalculatingDurations, setRecalculatingDurations] = useState(false);

  // Rattrapage ponctuel : recalcule et réécrit "estimatedDuration" pour
  // TOUTES les séances déjà en base avec la formule unique ci-dessus (voir
  // estimateSessionDurationSeconds), pour que les séances créées avant ce
  // correctif affichent, elles aussi, un temps cohérent et à jour.
  const recalculateAllDurations = async () => {
    if (
      !window.confirm(
        "Recalculer la durée prévue de TOUTES les séances (passées et futures) avec la formule à jour ? Les séances déjà correctes ne changeront pas."
      )
    )
      return;
    setRecalculatingDurations(true);
    try {
      const snap = await getDocs(collection(db, "workout"));
      let updated = 0;
      for (const d of snap.docs) {
        const w = d.data();
        const newDuration = Math.round(
          estimateSessionDurationSeconds(w.type || "muscu", w.blocks || []) / 60
        );
        if (newDuration !== w.estimatedDuration) {
          await updateDoc(doc(db, "workout", d.id), { estimatedDuration: newDuration });
          updated++;
        }
      }
      alert(`✅ ${updated} séance(s) mise(s) à jour sur ${snap.docs.length}.`);
      await fetchSessions();
    } catch (e) {
      console.error("Erreur recalcul des durées:", e);
      alert("❌ Erreur lors du recalcul : " + e.message);
    } finally {
      setRecalculatingDurations(false);
    }
  };

  /* ===================== GROUPES PERSONNALISÉS ===================== */
  const [customGroups, setCustomGroups] = useState([]);
  const [showGroupsManager, setShowGroupsManager] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupAthleteIds, setGroupAthleteIds] = useState([]);

  /* ===================== RM + VMA ===================== */
  useEffect(() => {
    if (!currentUser) return;
    const fetchRM = async () => {
      try {
        const snap = await getDocs(
          collection(db, "users", currentUser.uid, "rm")
        );
        const rmData = {};
        const rmNames = {};
        let vmaEntry = null;

        snap.docs.forEach((d) => {
          const data = d.data();
          if (d.id === "VMA" || data.exerciseName === "VMA") {
            vmaEntry = data;
          } else {
            // Normaliser le nom de l'exercice pour la clé
            const normalizedName = normalizeExerciseName(d.id);
            rmData[normalizedName] = data.kg;
            if (normalizedName) {
              rmNames[normalizedName] = { name: data.exerciseName || d.id };
            }
          }
        });

        setUserRM(rmData);
        setRmExerciseNames(rmNames);
        setVma(vmaEntry?.kg || null);
      } catch (e) {
        console.error("Erreur RM:", e);
      }
    };
    fetchRM();
  }, [currentUser]);

  /* ===================== SÉANCES ===================== */
  const fetchSessions = async () => {
    if (!currentUser) return;
    try {
      // SIMPLIFICATION : Charger TOUS les workouts (les règles Firestore autorisent la lecture)
      const q = query(collection(db, "workout"));
      const snap = await getDocs(q);
      const allWorkouts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      let filtered;
      
      if (userRole === "admin") {
        // Admin voit tout
        filtered = allWorkouts;
      } else {
        // Athlète voit :
        // 1. Séances "total" (pour tous)
        // 2. Séances de son groupe
        // 3. Séances "moi" créées par lui
        // 4. Séances individuelles ciblées sur lui
        // 5. Séances ciblées sur un groupe personnalisé dont il fait partie
        const myGroupIds = customGroups
          .filter((g) => (g.athleteIds || []).includes(currentUser.uid))
          .map((g) => g.id);
        filtered = allWorkouts.filter((w) => {
          if (w.group === "total") return true;
          if (w.group === userGroup) return true;
          if (w.group === "moi" && w.createdBy === currentUser.uid) return true;
          if (w.targetUserId === currentUser.uid) return true;
          if (myGroupIds.includes(w.group)) return true;
          return false;
        });
      }

      // Trier par date
      filtered.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(filtered);
    } catch (e) {
      console.error("Erreur séances:", e);
      alert("Erreur lors du chargement des séances : " + e.message);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentUser, userRole, userGroup, customGroups]);

  /* ===================== OUVERTURE DIRECTE DEPUIS LE DASHBOARD =====================
     Le Dashboard peut envoyer ici avec ?sessionId=xxx (et éventuellement
     &autostart=1) pour ouvrir directement la séance du jour en vue complète,
     sans que l'athlète ait à la rechercher dans le calendrier. */
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpenedSessionRef = useRef(false);

  useEffect(() => {
    if (autoOpenedSessionRef.current) return;
    const targetId = searchParams.get("sessionId");
    if (!targetId || events.length === 0) return;
    const target = events.find((e) => e.id === targetId);
    if (!target) return;
    autoOpenedSessionRef.current = true;
    setSelectedSession(target);
    if (searchParams.get("autostart") === "1") {
      startSession(target);
    }
    setSearchParams({}, { replace: true });
  }, [events, searchParams]);

  /* ===================== GROUPES PERSONNALISÉS : chargement ===================== */
  const fetchGroupsList = async () => {
    try {
      const snap = await getDocs(collection(db, "groups"));
      setCustomGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Erreur chargement groupes:", e);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchGroupsList();
  }, [currentUser]);

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupNameInput("");
    setGroupAthleteIds([]);
  };

  const startEditGroup = (g) => {
    setEditingGroupId(g.id);
    setGroupNameInput(g.name || "");
    setGroupAthleteIds(g.athleteIds || []);
  };

  const toggleNewGroupAthlete = (athleteId) => {
    setGroupAthleteIds((prev) =>
      prev.includes(athleteId)
        ? prev.filter((id) => id !== athleteId)
        : [...prev, athleteId]
    );
  };

  const saveGroup = async () => {
    if (!groupNameInput.trim()) {
      alert("Merci de donner un nom au groupe");
      return;
    }
    if (groupAthleteIds.length === 0) {
      alert("Merci de sélectionner au moins un athlète");
      return;
    }
    try {
      if (editingGroupId) {
        await updateDoc(doc(db, "groups", editingGroupId), {
          name: groupNameInput.trim(),
          athleteIds: groupAthleteIds,
        });
      } else {
        await addDoc(collection(db, "groups"), {
          name: groupNameInput.trim(),
          athleteIds: groupAthleteIds,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      resetGroupForm();
      await fetchGroupsList();
    } catch (e) {
      console.error("Erreur enregistrement groupe:", e);
      alert("❌ Erreur lors de l'enregistrement du groupe : " + e.message);
    }
  };

  const deleteGroup = async (groupId) => {
    if (!window.confirm("Supprimer ce groupe ? Les séances déjà créées pour ce groupe resteront mais ne seront plus visibles par personne.")) return;
    try {
      await deleteDoc(doc(db, "groups", groupId));
      if (editingGroupId === groupId) resetGroupForm();
      await fetchGroupsList();
    } catch (e) {
      console.error("Erreur suppression groupe:", e);
      alert("❌ Erreur lors de la suppression du groupe : " + e.message);
    }
  };

  /* ===================== ATHLÈTES (ADMIN) ===================== */
  useEffect(() => {
    if (userRole !== "admin") return;
    const fetch = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        setAthletes(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((u) => u.role !== "admin")
        );
      } catch (e) {
        console.error(e);
      }
    };
    fetch();
  }, [userRole]);

  /* ===================== CALCULS ===================== */
  const calculateWeight = (rmName, percent) => {
    if (!rmName || !percent) return "-";
    // Normaliser le nom recherché
    const normalizedName = normalizeExerciseName(rmName);
    const rm = userRM[normalizedName];
    if (!rm) return "-";
    return Math.round((rm * percent) / 100);
  };

  /* ===================== CRÉATION AUTO DES RM ===================== */
  const ensureRMsExist = async (session) => {
    if (!currentUser || !session.blocks || session.type !== "muscu") return;
    
    try {
      // Collecter tous les rmName uniques de la séance
      const rmNames = new Set();
      
      session.blocks.forEach((block) => {
        block.exercises?.forEach((exercise) => {
          if (exercise.rmName && exercise.rmPercent !== "PDC") {
            const normalized = normalizeExerciseName(exercise.rmName);
            if (normalized) {
              rmNames.add(normalized);
            }
          }
        });
      });
      
      if (rmNames.size === 0) return;
      
      // Récupérer les RM existants
      const rmSnap = await getDocs(collection(db, "users", currentUser.uid, "rm"));
      const existingRMs = new Set();
      rmSnap.docs.forEach((d) => {
        const normalized = normalizeExerciseName(d.id);
        existingRMs.add(normalized);
      });
      
      // Créer les RM manquants
      const promises = [];
      rmNames.forEach((rmName) => {
        if (!existingRMs.has(rmName)) {
          // RM n'existe pas, le créer avec valeur nulle
          promises.push(
            setDoc(doc(db, "users", currentUser.uid, "rm", rmName), {
              kg: null, // Valeur nulle = l'athlète doit le remplir
              exerciseName: rmName,
              updatedAt: new Date().toISOString(),
              autoCreated: true, // Marqueur pour savoir que c'est auto-créé
            })
          );
        }
      });
      
      if (promises.length > 0) {
        await Promise.all(promises);
        console.log(`✅ ${promises.length} RM(s) créé(s) automatiquement:`, Array.from(rmNames));
        
        // Recharger les RM
        await fetchRM();
      }
    } catch (e) {
      console.error("Erreur création auto RM:", e);
      // Ne pas bloquer la séance si erreur
    }
  };
  
  // Fonction pour recharger les RM
  const fetchRM = async () => {
    if (!currentUser) return;
    try {
      const snap = await getDocs(
        collection(db, "users", currentUser.uid, "rm")
      );
      const rmData = {};
      let vmaEntry = null;

      snap.docs.forEach((d) => {
        const data = d.data();
        if (d.id === "VMA" || data.exerciseName === "VMA") {
          vmaEntry = data;
        } else {
          // Normaliser le nom de l'exercice pour la clé
          const normalizedName = normalizeExerciseName(d.id);
          rmData[normalizedName] = data.kg;
        }
      });

      setUserRM(rmData);
      setVma(vmaEntry?.kg || null);
    } catch (e) {
      console.error("Erreur RM:", e);
    }
  };

  const calculateEnduranceMetrics = (exercise) => {
    if (!vma) return null;
    const vmaMs = (vma * 1000) / 3600;
    const targetSpeed = vmaMs * (exercise.vmaPercentage / 100);
    let distancePerRep = targetSpeed * exercise.effortTime;
    let totalDistance = distancePerRep * exercise.reps;

    if (exercise.groundWork) {
      totalDistance *= 0.88;
      distancePerRep *= 0.88;
    }

    const paceKmh = targetSpeed * 3.6;
    const paceMinPerKm = 60 / paceKmh;
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);

    return {
      totalDistance: Math.round(totalDistance),
      distancePerRep: Math.round(distancePerRep),
      paceKmh: paceKmh.toFixed(1),
      paceDisplay: `${paceMin}:${String(paceSec).padStart(2, "0")}/km`,
    };
  };

  const RPE_TABLE = {
    1: { 10: 100, 9.5: 97.8, 9: 95.5, 8.5: 93.9, 8: 92.2, 7.5: 90.7, 7: 89.2 },
    2: { 10: 95.5, 9.5: 93.9, 9: 92.2, 8.5: 90.7, 8: 89.2, 7.5: 87.8, 7: 86.3 },
    3: { 10: 92.2, 9.5: 90.7, 9: 89.2, 8.5: 87.8, 8: 86.3, 7.5: 85.0, 7: 83.7 },
    4: { 10: 89.2, 9.5: 87.8, 9: 86.3, 8.5: 85.0, 8: 83.7, 7.5: 82.4, 7: 81.1 },
    5: { 10: 86.3, 9.5: 85.0, 9: 83.7, 8.5: 82.4, 8: 81.1, 7.5: 79.9, 7: 78.6 },
    6: { 10: 83.7, 9.5: 82.4, 9: 81.1, 8.5: 79.9, 8: 78.6, 7.5: 77.4, 7: 76.2 },
  };

  const calculatePredictedRM = (weight, reps, rpe) => {
    if (reps > 6 || rpe < 8) return null;
    const repsData = RPE_TABLE[reps];
    if (!repsData) return null;
    const roundedRPE = Math.round(rpe * 2) / 2;
    const pct = repsData[roundedRPE];
    if (!pct) return null;
    return Math.round((weight / (pct / 100)) * 10) / 10;
  };

  const getFosterDescription = (rpe) => {
    if (rpe === 0) return "Repos";
    if (rpe <= 2) return "Très facile";
    if (rpe <= 4) return "Facile";
    if (rpe <= 6) return "Modéré";
    if (rpe <= 8) return "Difficile";
    if (rpe === 9) return "Très difficile";
    return "Maximal";
  };

  /* ===================== HELPERS MULTI-UTILISATEURS ===================== */
  const getUserProgress = (session, userId = currentUser?.uid) => {
    if (!session || !userId) return null;
    return session.userProgress?.[userId] || null;
  };

  const isUserSessionCompleted = (session, userId = currentUser?.uid) => {
    const progress = getUserProgress(session, userId);
    return progress?.completedAt ? true : false;
  };

  const isUserSessionInProgress = (session, userId = currentUser?.uid) => {
    const progress = getUserProgress(session, userId);
    return progress?.inProgress === true && !progress?.completedAt;
  };

  const getUserFeedback = (session, userId = currentUser?.uid) => {
    const progress = getUserProgress(session, userId);
    return progress?.feedback || {};
  };

  /* ===================== HELPERS FEEDBACK ===================== */
  const isCMJ = (exerciseName) => {
    if (!exerciseName) return false;
    const name = exerciseName.toLowerCase().trim();
    return name === "cmj" || name.includes("counter movement jump");
  };

  // Normaliser le feedback pour rétrocompatibilité
  const normalizeFeedback = (feedback) => {
    if (!feedback) return null;
    // Si ancien format (actualWeight direct)
    if (feedback.actualWeight !== undefined && !feedback.series) {
      return {
        series: [{
          set: 1,
          actualWeight: feedback.actualWeight,
          actualReps: feedback.actualReps,
          rpe: feedback.rpe
        }],
        notes: feedback.notes || ""
      };
    }
    // Si nouveau format avec series
    return feedback;
  };

  /* ===================== GESTION SÉANCE ===================== */
  const startSession = async (session) => {
    try {
      const startTime = new Date().toISOString();
      
      // Modifier UNIQUEMENT userProgress[currentUser.uid] avec notation pointée
      // Cela respecte les règles Firestore pour les athlètes
      await updateDoc(doc(db, "workout", session.id), {
        [`userProgress.${currentUser.uid}`]: {
          startedAt: startTime,
          inProgress: true,
        }
      });
      
      // Mettre à jour l'état local
      const userProgress = session.userProgress || {};
      userProgress[currentUser.uid] = {
        startedAt: startTime,
        inProgress: true,
      };
      
      const updatedSession = {
        ...session,
        userProgress,
      };
      
      setSessionInProgress(updatedSession);
      setSelectedSession(updatedSession); // Synchroniser selectedSession
      setSessionStartTime(startTime);
      setSessionFeedback({});
      await fetchSessions();
    } catch (e) {
      console.error("[startSession] Erreur:", e);
      alert(`❌ Erreur démarrage: ${e.message}`);
    }
  };

  const openFeedbackModal = (
    blockIndex,
    exerciseIndex,
    exercise,
    sessionType
  ) => {
    const key = `${blockIndex}-${exerciseIndex}`;
    const userFeedback = getUserFeedback(selectedSession);
    const existing = sessionFeedback[key] || userFeedback?.[key] || {};
    const normalized = normalizeFeedback(existing);

    if (sessionType === "muscu") {
      // Initialiser un tableau de séries
      const numSeries = exercise.series || 3;
      let series = [];
      
      if (normalized && normalized.series) {
        // Réutiliser les séries existantes
        series = normalized.series;
      } else {
        // Créer de nouvelles séries
        const defaultWeight = calculateWeight(exercise.rmName || exercise.name, exercise.rmPercent) || 0;
        for (let i = 0; i < numSeries; i++) {
          series.push({
            set: i + 1,
            actualWeight: defaultWeight,
            actualReps: exercise.reps || 0,
            rpe: 5
          });
        }
      }

      setCurrentExerciseFeedback({
        key,
        blockIndex,
        exerciseIndex,
        exercise,
        sessionType,
        series: series,
        notes: normalized?.notes || ""
      });
    } else if (sessionType === "sprint") {
      setCurrentExerciseFeedback({
        key,
        blockIndex,
        exerciseIndex,
        exercise,
        sessionType,
        actualDistance:
          existing.actualDistance ||
          exercise.distance * exercise.reps * exercise.sets ||
          0,
        rpe: existing.rpe || 5,
        notes: existing.notes || "",
      });
    } else if (sessionType === "endurance") {
      const metrics = calculateEnduranceMetrics(exercise);
      setCurrentExerciseFeedback({
        key,
        blockIndex,
        exerciseIndex,
        exercise,
        sessionType,
        actualDistance: existing.actualDistance || metrics?.totalDistance || 0,
        rpe: existing.rpe || 5,
        notes: existing.notes || "",
      });
    }

    setShowFeedbackModal(true);
  };

  const saveFeedback = () => {
    if (!currentExerciseFeedback) return;

    if (currentExerciseFeedback.sessionType === "muscu") {
      setSessionFeedback({
        ...sessionFeedback,
        [currentExerciseFeedback.key]: {
          series: currentExerciseFeedback.series,
          notes: currentExerciseFeedback.notes || ""
        },
      });
    } else {
      setSessionFeedback({
        ...sessionFeedback,
        [currentExerciseFeedback.key]: {
          actualDistance: Number(currentExerciseFeedback.actualDistance),
          rpe: Number(currentExerciseFeedback.rpe),
          notes: currentExerciseFeedback.notes || "",
        },
      });
    }

    setShowFeedbackModal(false);
    setCurrentExerciseFeedback(null);
  };

  const adjustRMFromFeedback = async (feedback, session) => {
    // Comme ailleurs dans ce fichier (workoutType par défaut "muscu"), une
    // séance sans champ "type" explicite est une séance muscu : un test
    // strict "session.type !== 'muscu'" excluait à tort TOUTES ces séances
    // (type undefined) et empêchait silencieusement toute création/mise à
    // jour de RM, même quand les séries saisies respectaient bien le filtre
    // ≤6 répétitions / RPE≥8.
    if (!currentUser || !session.blocks || (session.type || "muscu") !== "muscu") return;
    try {
      for (const [key, fb] of Object.entries(feedback)) {
        const [bIdx, eIdx] = key.split("-").map(Number);
        const block = session.blocks[bIdx];
        const exercise = block?.exercises[eIdx];
        if (!exercise) continue;

        // Bloc d'échauffement : jamais pris en compte pour le RM, quel que
        // soit le poids/RPE déclaré (repéré par le nom du bloc — "Bloc 1"
        // reste inclus, "Échauffement"/"Warm up"/"Activation" est exclu).
        if (/échauffement|echauffement|warm.?up|activation/i.test(block?.name || "")) {
          continue;
        }

        // Poids du corps (PDC) : pas de charge externe pertinente pour un RM.
        if (exercise.rmPercent === "PDC") continue;

        // Nom utilisé pour la fiche RM : celui choisi explicitement par le
        // coach (rmName, quand l'exercice sert de référence pour calculer
        // des % de charge), sinon le nom de l'exercice réalisé lui-même —
        // pour que TOUT exercice fait proche du max (filtré juste en dessous
        // sur reps≤6 et RPE≥8) alimente "Mes RM" automatiquement, sans
        // réglage manuel préalable.
        const rmName = exercise.rmName || exercise.name;
        if (!rmName) continue;

        // Normaliser le feedback (rétrocompatibilité)
        const normalized = normalizeFeedback(fb);
        if (!normalized || !normalized.series || normalized.series.length === 0) continue;
        
        // Ignorer CMJ (pas de calcul RM pour le CMJ)
        if (isCMJ(exercise.name)) continue;
        
        // Régression e1RM multi-séries : au lieu de ne garder que la série
        // la plus lourde (une seule mesure = sensible au bruit d'une série
        // mal exécutée ou mal déclarée), on calcule la RM prédite à partir
        // de TOUTES les séries valides (reps≤6, RPE≥8) de la séance pour cet
        // exercice, puis on prend la MÉDIANE de ces prédictions — plus
        // robuste qu'une moyenne face à une valeur aberrante isolée.
        const validPredictions = [];
        normalized.series.forEach((s) => {
          const w = Number(s.actualWeight);
          const r = Number(s.actualReps);
          const rpeVal = Number(s.rpe);
          if (!w || !r || !rpeVal) return;
          const p = calculatePredictedRM(w, r, rpeVal);
          if (p) validPredictions.push({ predicted: p, weight: w, reps: r, rpe: rpeVal });
        });
        if (validPredictions.length === 0) continue;

        const sortedPreds = [...validPredictions].sort((a, b) => a.predicted - b.predicted);
        const mid = Math.floor(sortedPreds.length / 2);
        const medianPredicted =
          sortedPreds.length % 2 !== 0
            ? sortedPreds[mid].predicted
            : (sortedPreds[mid - 1].predicted + sortedPreds[mid].predicted) / 2;
        // Série de référence (la plus proche de la médiane) pour la
        // traçabilité (lastRPE/lastWeight/lastReps affichés dans MyRM).
        const refSeries = sortedPreds.reduce((best, cur) =>
          Math.abs(cur.predicted - medianPredicted) < Math.abs(best.predicted - medianPredicted) ? cur : best
        );

        // Normaliser le nom de l'exercice — on relit toujours la fiche à
        // jour depuis Firestore (plutôt que le state local "userRM", qui
        // peut être périmé) pour récupérer sa vraie valeur ET son
        // historique complet (nécessaire pour le graphique d'évolution).
        const normalizedRmName = normalizeExerciseName(rmName);
        const rmRef = doc(db, "users", currentUser.uid, "rm", normalizedRmName);
        const existingSnap = await getDoc(rmRef);
        const existingData = existingSnap.exists() ? existingSnap.data() : null;
        const currentRM = existingData?.kg || null;
        const predicted = medianPredicted;
        if (predicted) {
          let finalRM = predicted;
          const isNewRM = !currentRM; // Nouveau RM si currentRM est null/undefined

          if (currentRM) {
            const change = ((predicted - currentRM) / currentRM) * 100;
            if (change > 10) finalRM = currentRM * 1.1;
            if (change < -10) finalRM = currentRM * 0.9;
          }
          const roundedRM = Math.round(finalRM * 10) / 10;
          const nowIso = new Date().toISOString();

          // Catégorie : celle déjà sur la fiche (priorité — posée
          // manuellement), sinon celle de la banque d'exercices
          // (gestionnaire "🔤 Noms d'exercices"), sinon "Autre" par défaut.
          const catalogCategory = exerciseMediaLibrary[normalizedRmName]?.category;

          // Historique complet (comme VMA/CMJ) : chaque ajustement ajoute un
          // point, plutôt que d'écraser l'unique valeur — c'est ce qui rend
          // le graphique d'évolution possible avec plus d'un point.
          const history = [...(existingData?.history || [])];
          history.push({ date: nowIso, kg: roundedRM, autoAdjusted: true });

          // Sauvegarder avec le nom normalisé (merge pour ne jamais écraser
          // le reste de la fiche). La banque d'exercices est la source de
          // référence pour la catégorie : elle prime sur ce qui était déjà
          // écrit (souvent juste "Autre", posé par défaut avant que
          // l'exercice soit catégorisé) — sinon une correction faite dans
          // le gestionnaire n'atteignait jamais les fiches déjà créées.
          await setDoc(
            rmRef,
            {
              kg: roundedRM,
              exerciseName: normalizedRmName,
              category: catalogCategory || existingData?.category || "autre",
              previousRM: currentRM || 0,
              updatedAt: nowIso,
              autoAdjusted: true,
              autoCreated: false,
              lastRPE: refSeries.rpe,
              lastWeight: refSeries.weight,
              lastReps: refSeries.reps,
              seriesUsedForRM: validPredictions.length,
              history: history.slice(-20),
            },
            { merge: true }
          );

          // Log si c'est un nouveau RM créé
          if (isNewRM) {
            console.log(`✅ Nouveau RM créé : "${normalizedRmName}" = ${roundedRM} kg (médiane de ${validPredictions.length} série(s) valide(s))`);
          }
        }
      }
      const snap = await getDocs(
        collection(db, "users", currentUser.uid, "rm")
      );
      const rmData = {};
      snap.docs.forEach((d) => {
        // Normaliser le nom pour la clé
        const normalizedName = normalizeExerciseName(d.id);
        rmData[normalizedName] = d.data().kg;
      });
      setUserRM(rmData);
    } catch (e) {
      console.error("Erreur ajustement RM:", e);
    }
  };

  const endSession = async () => {
    // Utiliser sessionInProgress ou selectedSession comme fallback
    const workoutSession = sessionInProgress || selectedSession;
    
    if (!workoutSession) {
      console.log("[endSession] ❌ Aucune session disponible");
      alert("⚠️ Aucune séance sélectionnée");
      return;
    }
    
    console.log("[endSession] ✅ Session trouvée:", workoutSession.id);
    console.log("[endSession] sessionInProgress:", !!sessionInProgress);
    console.log("[endSession] selectedSession:", !!selectedSession);

    // Avertir AVANT de terminer si des exercices muscu n'ont pas reçu de
    // feedback (poids/reps/RPE) via le bouton "✅ Valider" de la popup —
    // sans ce clic, rien n'est enregistré dans sessionFeedback, et ces
    // exercices ne pourront donc jamais alimenter "Mes RM". Une fois la
    // séance terminée, sessionFeedback est réinitialisé : sans cet
    // avertissement, l'oubli est silencieux et irrécupérable.
    if ((workoutSession.type || "muscu") === "muscu" && workoutSession.blocks) {
      const missing = [];
      workoutSession.blocks.forEach((block, bIdx) => {
        if (/échauffement|echauffement|warm.?up|activation/i.test(block?.name || "")) {
          return;
        }
        (block.exercises || []).forEach((exercise, eIdx) => {
          if (exercise.rmPercent === "PDC") return;
          const key = `${bIdx}-${eIdx}`;
          if (!sessionFeedback[key]) {
            missing.push(exercise.name || "Exercice sans nom");
          }
        });
      });
      if (missing.length > 0) {
        const confirmEnd = window.confirm(
          `⚠️ ${missing.length} exercice(s) n'ont pas de feedback enregistré (tu n'as pas cliqué sur "✅ Valider" dans leur popup) :\n\n${missing.join("\n")}\n\nSans ce feedback, ces exercices ne pourront pas mettre à jour tes RM dans "Mes RM".\n\nTerminer quand même la séance ?`
        );
        if (!confirmEnd) return;
      }
    }

    try {
      console.log("[endSession] 🏁 Début de la terminaison de séance", workoutSession.id);
      const endTime = new Date().toISOString();
      
      // IMPORTANT: Récupérer la séance à jour depuis la DB
      const sessionRef = doc(db, "workout", workoutSession.id);
      const sessionSnap = await getDoc(sessionRef);
      
      if (!sessionSnap.exists()) {
        console.error("[endSession] ❌ Séance introuvable dans Firestore !");
        alert("❌ Erreur : Séance introuvable dans la base de données");
        return;
      }
      
      const currentSessionData = sessionSnap.data();
      console.log("[endSession] 📊 Données séance récupérées:", {
        id: workoutSession.id,
        title: currentSessionData.title,
        hasUserProgress: !!currentSessionData.userProgress,
        userIds: Object.keys(currentSessionData.userProgress || {})
      });
      
      const userProgressData = currentSessionData.userProgress?.[currentUser.uid] || {};
      console.log("[endSession] 👤 UserProgress actuel:", userProgressData);
      
      const startTime = userProgressData.startedAt || sessionStartTime;
      const duration = Math.round(
        (new Date(endTime) - new Date(startTime)) / 60000
      );
      
      console.log("[endSession] ⏱️ Durée calculée:", duration, "min");
      console.log("[endSession] 📝 Feedback à sauvegarder:", sessionFeedback);
      
      // Préparer les nouvelles données pour cet utilisateur
      const newUserProgressData = {
        ...userProgressData,
        completedAt: endTime,
        actualDuration: duration,
        feedback: sessionFeedback,
        inProgress: false,
      };
      
      console.log("[endSession] 💾 Mise à jour userProgress pour", currentUser.uid);
      
      // Modifier UNIQUEMENT userProgress[currentUser.uid] avec notation pointée
      await updateDoc(sessionRef, {
        [`userProgress.${currentUser.uid}`]: newUserProgressData
      });
      
      console.log("[endSession] ✅ Séance mise à jour avec succès dans Firestore");
      
      await adjustRMFromFeedback(sessionFeedback, workoutSession);
      alert("Séance terminée ! Bravo 🎉");
      setSessionInProgress(null);
      setSessionFeedback({});
      setSelectedSession(null);
      await fetchSessions();
      console.log("[endSession] 🎉 Terminé avec succès !");
    } catch (e) {
      console.error("[endSession] ❌ Erreur complète:", e);
      console.error("[endSession] ❌ Stack trace:", e.stack);
      alert(`❌ Erreur fin séance: ${e.message}`);
    }
  };

  /* ===================== DUPLICATION SEMAINE ===================== */
  const duplicateWeek = async () => {
    // Verrou anti-double-soumission : un double-clic (ou double-tap mobile,
    // très fréquent avec la latence réseau) relançait deux fois toute la
    // boucle ci-dessous, créant donc deux copies de chaque séance de la
    // semaine sur les jours dupliqués. Le ref est vérifié en synchrone donc
    // le 2e appel est bloqué avant même de commencer, contrairement à un
    // simple useState qui peut ne pas être encore à jour entre deux clics
    // rapprochés.
    if (duplicatingWeekLock.current) return;
    if (!duplicateWeekStart) {
      alert("Choisissez un lundi");
      return;
    }
    duplicatingWeekLock.current = true;
    setIsDuplicatingWeek(true);
    try {
      const start = new Date(duplicateWeekStart + "T12:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      // dédoublonnage défensif par id, au cas où le state "events" contienne
      // déjà une entrée en double (ex. données historiques corrompues par
      // une précédente double-soumission).
      const seenIds = new Set();
      const weekSessions = events.filter((s) => {
        const d = new Date(s.date + "T12:00:00");
        if (d < start || d > end) return false;
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });
      if (weekSessions.length === 0) {
        alert("Aucune séance cette semaine");
        return;
      }

      // Séances déjà présentes sur la semaine cible (+7j) : on relit
      // Firestore à cet instant (pas le state local, potentiellement
      // périmé) pour éviter de recréer un doublon si la même semaine a déjà
      // été dupliquée précédemment.
      const targetDates = new Set(
        weekSessions.map((s) => {
          const d = new Date(s.date + "T12:00:00");
          d.setDate(d.getDate() + 7);
          return getLocalDateStr(d);
        })
      );
      const existingSnap = await getDocs(collection(db, "workout"));
      const existingKeys = new Set(
        existingSnap.docs
          .map((d) => d.data())
          .filter((w) => targetDates.has(w.date))
          .map((w) => `${w.date}|${w.title}|${w.group}|${w.targetUserId || ""}`)
      );

      let created = 0;
      let skipped = 0;
      for (const s of weekSessions) {
        const origDate = new Date(s.date + "T12:00:00");
        origDate.setDate(origDate.getDate() + 7);
        const newDate = getLocalDateStr(origDate);
        const key = `${newDate}|${s.title}|${s.group}|${s.targetUserId || ""}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key); // évite aussi un doublon interne à cette même boucle
        await addDoc(collection(db, "workout"), {
          title: s.title,
          date: newDate,
          group: s.group,
          targetUserId: s.targetUserId || null,
          blocks: s.blocks,
          type: s.type || "muscu",
          estimatedDuration: s.estimatedDuration,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          duplicatedFrom: s.id,
          userProgress: {},
        });
        created++;
      }
      alert(
        `${created} séance(s) dupliquée(s)` +
          (skipped > 0 ? ` (${skipped} déjà existante(s) ignorée(s))` : "") +
          " !"
      );
      setShowDuplicateModal(false);
      setDuplicateWeekStart(null);
      await fetchSessions();
    } catch (e) {
      console.error(e);
      alert("Erreur duplication");
    } finally {
      duplicatingWeekLock.current = false;
      setIsDuplicatingWeek(false);
    }
  };

  /* ===================== DUPLICATION D'UNE JOURNÉE =====================
     Comme "Dupliquer semaine", mais pour UN seul jour choisi librement (pas
     forcément +7j) : toutes les séances (tous groupes/athlètes confondus)
     présentes à la date source sont recréées à la date cible en une seule
     fois, au lieu de dupliquer chaque séance une par une. */
  const duplicateDay = async () => {
    if (duplicatingDayLock.current) return;
    if (!duplicateDaySource || !duplicateDayTarget) {
      alert("Choisissez la date source et la date cible");
      return;
    }
    duplicatingDayLock.current = true;
    setIsDuplicatingDay(true);
    try {
      const seenIds = new Set();
      const daySessions = events.filter((s) => {
        if (s.date !== duplicateDaySource) return false;
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });
      if (daySessions.length === 0) {
        alert("Aucune séance à cette date");
        return;
      }

      // Même garde-fou anti-doublon que "Dupliquer semaine" : on relit
      // Firestore à cet instant pour ne pas recréer une séance déjà présente
      // à la date cible (si ce jour a déjà été dupliqué précédemment).
      const existingSnap = await getDocs(collection(db, "workout"));
      const existingKeys = new Set(
        existingSnap.docs
          .map((d) => d.data())
          .filter((w) => w.date === duplicateDayTarget)
          .map((w) => `${w.date}|${w.title}|${w.group}|${w.targetUserId || ""}`)
      );

      let created = 0;
      let skipped = 0;
      for (const s of daySessions) {
        const key = `${duplicateDayTarget}|${s.title}|${s.group}|${s.targetUserId || ""}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);
        await addDoc(collection(db, "workout"), {
          title: s.title,
          date: duplicateDayTarget,
          group: s.group,
          targetUserId: s.targetUserId || null,
          blocks: s.blocks,
          type: s.type || "muscu",
          estimatedDuration: s.estimatedDuration,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          duplicatedFrom: s.id,
          userProgress: {},
        });
        created++;
      }
      alert(
        `${created} séance(s) dupliquée(s)` +
          (skipped > 0 ? ` (${skipped} déjà existante(s) ignorée(s))` : "") +
          " !"
      );
      setShowDuplicateDayModal(false);
      setDuplicateDaySource(null);
      setDuplicateDayTarget(null);
      await fetchSessions();
    } catch (e) {
      console.error(e);
      alert("Erreur duplication");
    } finally {
      duplicatingDayLock.current = false;
      setIsDuplicatingDay(false);
    }
  };

  /* ===================== DUPLICATION SÉANCE UNIQUE ===================== */
  const duplicateSession = async () => {
    if (duplicatingSessionLock.current) return;
    if (!sessionToDuplicate || !duplicateTargetDate) {
      alert("⚠️ Veuillez sélectionner une date");
      return;
    }
    duplicatingSessionLock.current = true;
    setIsDuplicatingSession(true);
    try {
      // Créer la nouvelle séance dupliquée
      await addDoc(collection(db, "workout"), {
        title: sessionToDuplicate.title,
        date: duplicateTargetDate,
        group: sessionToDuplicate.group,
        targetUserId: sessionToDuplicate.targetUserId || null,
        blocks: sessionToDuplicate.blocks,
        type: sessionToDuplicate.type || "muscu",
        estimatedDuration: sessionToDuplicate.estimatedDuration,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        duplicatedFrom: sessionToDuplicate.id,
        userProgress: {},
      });

      alert("✅ Séance dupliquée avec succès !");
      setShowDuplicateSessionModal(false);
      setSessionToDuplicate(null);
      setDuplicateTargetDate(null);
      await fetchSessions();
    } catch (e) {
      console.error("[duplicateSession] Erreur:", e);
      alert(`❌ Erreur duplication: ${e.message}`);
    } finally {
      duplicatingSessionLock.current = false;
      setIsDuplicatingSession(false);
    }
  };

  /* ===================== CRÉER / MODIFIER SÉANCE ===================== */
  const handleSubmit = async () => {
    if (!title || blocks.length === 0) {
      alert("Titre + au moins 1 bloc requis");
      return;
    }

    // Vérifier qu'on ne dépasse pas la limite Firestore (~1 Mo par document)
    const blocksSize = new Blob([JSON.stringify(blocks)]).size;
    if (blocksSize > 900000) {
      alert(
        "⚠️ Les photos ajoutées sont trop volumineuses au total (limite ~1 Mo par séance). Retire une ou plusieurs photos, ou utilise des images plus simples."
      );
      return;
    }

    const dur = estimateSessionDurationSeconds(workoutType, blocks);

    const payload = {
      title,
      date: getLocalDateStr(formDate),
      group,
      targetUserId: group === "individuel" ? targetUserId : null,
      blocks,
      type: workoutType,
      estimatedDuration: Math.round(dur / 60),
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
    };

    try {
      if (isEdit && editId) {
        await updateDoc(doc(db, "workout", editId), payload);
        alert("Séance modifiée !");
      } else {
        // userProgress: {} est indispensable dès la création — sans ce
        // champ initial, la première tentative d'un athlète pour démarrer
        // la séance (updateDoc sur userProgress.<uid>) peut être rejetée
        // par les règles Firestore qui comparent resource.data.userProgress
        // à l'ancienne valeur : si le champ n'existe pas du tout, cette
        // comparaison échoue et l'écriture est refusée.
        await addDoc(collection(db, "workout"), { ...payload, userProgress: {} });
        alert("Séance créée !");
      }
      resetForm();
      await fetchSessions();
    } catch (e) {
      console.error(e);
      alert("Erreur");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setIsEdit(false);
    setEditId(null);
    setTitle("");
    setGroup("total");
    setTargetUserId("");
    setWorkoutType("muscu");
    setBlocks([
      {
        name: "Bloc A",
        restMin: 2,
        exercises: [
          {
            name: "",
            description: "",
            series: 3,
            reps: 8,
            tempo: "2-0-2",
            restMin: 2,
            rmPercent: 70,
            rmName: "",
          },
        ],
      },
    ]);
  };

  const editSession = (session) => {
    setIsEdit(true);
    setEditId(session.id);
    setTitle(session.title);
    setFormDate(new Date(session.date + "T12:00:00"));
    setGroup(session.group || "total");
    setTargetUserId(session.targetUserId || "");
    setWorkoutType(session.type || "muscu");
    setBlocks(session.blocks || []);
    setShowForm(true);
  };

  const deleteSession = async (id) => {
    if (!window.confirm("Supprimer cette séance ?")) return;
    try {
      await deleteDoc(doc(db, "workout", id));
      alert("Supprimée !");
      await fetchSessions();
      setSelectedSession(null);
    } catch (e) {
      console.error(e);
      alert("Erreur suppression");
    }
  };

  // Suppression groupée : toutes les séances d'un jour donné, tous
  // athlètes/groupes confondus (celles visibles par l'admin dans "events").
  const deleteSessionsForDay = async (dateStr) => {
    const dayEvents = events.filter((e) => e.date === dateStr);
    if (dayEvents.length === 0) return;
    if (
      !window.confirm(
        `Supprimer les ${dayEvents.length} séance(s) du ${new Date(
          dateStr + "T12:00:00"
        ).toLocaleDateString("fr-FR")} ? Cette action est irréversible.`
      )
    )
      return;
    try {
      await Promise.all(dayEvents.map((e) => deleteDoc(doc(db, "workout", e.id))));
      alert(`${dayEvents.length} séance(s) supprimée(s) !`);
      await fetchSessions();
      setSelectedSession(null);
    } catch (e) {
      console.error(e);
      alert("Erreur suppression");
    }
  };

  // Suppression groupée : toutes les séances de la semaine (lundi → dimanche)
  // contenant la date donnée.
  const deleteSessionsForWeek = async (dateStr) => {
    const ref = new Date(dateStr + "T12:00:00");
    const dow = ref.getDay(); // 0 = dimanche
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(ref);
    monday.setDate(monday.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const mondayStr = getLocalDateStr(monday);
    const sundayStr = getLocalDateStr(sunday);
    const weekEvents = events.filter(
      (e) => e.date >= mondayStr && e.date <= sundayStr
    );
    if (weekEvents.length === 0) return;
    if (
      !window.confirm(
        `Supprimer les ${weekEvents.length} séance(s) de la semaine du ${monday.toLocaleDateString(
          "fr-FR"
        )} au ${sunday.toLocaleDateString("fr-FR")} ? Cette action est irréversible.`
      )
    )
      return;
    try {
      await Promise.all(weekEvents.map((e) => deleteDoc(doc(db, "workout", e.id))));
      alert(`${weekEvents.length} séance(s) supprimée(s) !`);
      await fetchSessions();
      setSelectedSession(null);
    } catch (e) {
      console.error(e);
      alert("Erreur suppression");
    }
  };

  /* ===================== BLOCS / EXERCICES ===================== */
  const addBlock = () => {
    let newExercise;
    if (workoutType === "muscu") {
      newExercise = {
        name: "",
        description: "",
        series: 3,
        reps: 8,
        tempo: "2-0-2",
        restMin: 2,
        rmPercent: 70,
        rmName: "",
      };
    } else if (workoutType === "sprint") {
      newExercise = {
        name: "",
        description: "",
        distance: 30,
        recoveryMin: 1,
        recoverySec: 0,
        reps: 6,
        sets: 3,
        intensity: "Max",
      };
    } else {
      newExercise = {
        name: "",
        description: "",
        vmaPercentage: 85,
        effortTime: 30,
        recoveryMin: 0,
        recoverySec: 30,
        reps: 10,
        groundWork: false,
        blockRecoveryMin: 3,
        blockRecoverySec: 0,
      };
    }
    setBlocks([
      ...blocks,
      {
        name: `Bloc ${String.fromCharCode(65 + blocks.length)}`,
        restMin: 2,
        exercises: [newExercise],
      },
    ]);
  };

  const removeBlock = (i) => setBlocks(blocks.filter((_, idx) => idx !== i));

  /* ===================== RÉORDONNER LES BLOCS PAR GLISSER-DÉPOSER =====================
     Poignée "⠿" sur chaque bloc : au clic maintenu (souris) ou au toucher
     maintenu (mobile), on suit le pointeur via les Pointer Events (une seule
     API pour les deux) et on déplace le bloc dans la liste au relâchement,
     en fonction de sur quel autre bloc on l'a lâché. Les fonctions sont
     stabilisées avec useCallback (deps vides + refs pour les données
     mutables) pour que addEventListener/removeEventListener retirent bien
     le même écouteur qu'ils ont ajouté. */
  const blockRefs = useRef([]);
  const dragInfoRef = useRef({ from: null, over: null });
  const [dragBlockIndex, setDragBlockIndex] = useState(null);
  const [dragOverBlockIndex, setDragOverBlockIndex] = useState(null);

  const onBlockDragMove = useCallback((e) => {
    const y = e.clientY;
    if (typeof y !== "number") return;
    const refs = blockRefs.current;
    let found = null;
    for (let idx = 0; idx < refs.length; idx++) {
      const el = refs[idx];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        found = idx;
        break;
      }
    }
    if (found === null && refs.length > 0) {
      const firstRect = refs[0]?.getBoundingClientRect();
      const lastRect = refs[refs.length - 1]?.getBoundingClientRect();
      if (firstRect && y < firstRect.top) found = 0;
      else if (lastRect && y > lastRect.bottom) found = refs.length - 1;
    }
    if (found !== null && found !== dragInfoRef.current.over) {
      dragInfoRef.current.over = found;
      setDragOverBlockIndex(found);
    }
  }, []);

  const onBlockDragEnd = useCallback(() => {
    window.removeEventListener("pointermove", onBlockDragMove);
    window.removeEventListener("pointerup", onBlockDragEnd);
    document.body.style.userSelect = "";
    const { from, over } = dragInfoRef.current;
    if (from !== null && over !== null && from !== over) {
      setBlocks((prev) => {
        const nb = [...prev];
        const [moved] = nb.splice(from, 1);
        nb.splice(over, 0, moved);
        return nb;
      });
    }
    dragInfoRef.current = { from: null, over: null };
    setDragBlockIndex(null);
    setDragOverBlockIndex(null);
  }, [onBlockDragMove]);

  const startBlockDrag = (bIdx) => (e) => {
    e.preventDefault();
    dragInfoRef.current = { from: bIdx, over: bIdx };
    setDragBlockIndex(bIdx);
    setDragOverBlockIndex(bIdx);
    window.addEventListener("pointermove", onBlockDragMove);
    window.addEventListener("pointerup", onBlockDragEnd);
    document.body.style.userSelect = "none";
  };

  // Bascule replier/déplier les exercices d'un bloc, pour y voir plus clair
  // pendant la création d'une séance avec plusieurs blocs.
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const toggleBlockCollapsed = (bIdx) =>
    setCollapsedBlocks((prev) => ({ ...prev, [bIdx]: !prev[bIdx] }));

  const addExercise = (bIdx) => {
    const nb = [...blocks];
    let newExercise;
    if (workoutType === "muscu") {
      newExercise = {
        name: "",
        description: "",
        series: 3,
        reps: 8,
        tempo: "2-0-2",
        restMin: 2,
        rmPercent: 70,
        rmName: "",
      };
    } else if (workoutType === "sprint") {
      newExercise = {
        name: "",
        description: "",
        distance: 30,
        recoveryMin: 1,
        recoverySec: 0,
        reps: 6,
        sets: 3,
        intensity: "Max",
      };
    } else {
      newExercise = {
        name: "",
        description: "",
        vmaPercentage: 85,
        effortTime: 30,
        recoveryMin: 0,
        recoverySec: 30,
        reps: 10,
        groundWork: false,
        blockRecoveryMin: 3,
        blockRecoverySec: 0,
      };
    }
    nb[bIdx].exercises.push(newExercise);
    setBlocks(nb);
  };

  const removeExercise = (bIdx, eIdx) => {
    const nb = [...blocks];
    nb[bIdx].exercises = nb[bIdx].exercises.filter((_, i) => i !== eIdx);
    setBlocks(nb);
  };
  const updateBlock = (bIdx, field, val) => {
    const nb = [...blocks];
    nb[bIdx][field] = val;
    setBlocks(nb);
  };
  const updateExercise = (bIdx, eIdx, field, val) => {
    const nb = [...blocks];
    nb[bIdx].exercises[eIdx][field] = val;
    setBlocks(nb);
  };

  /* ===================== BIBLIOTHÈQUE D'EXERCICES (autocomplete + image partagée) =====================
     Le NOM des exercices déjà utilisés vient toujours des séances déjà
     chargées (`events`, aucune lecture Firestore supplémentaire) — ça permet
     de retrouver par autocomplétion n'importe quel exercice déjà tapé, même
     sans photo.
     L'IMAGE, elle, vient d'une petite collection Firestore dédiée,
     "exerciseMedia" (une seule lecture, une seule fois à l'ouverture de la
     page) : chaque exercice n'y a QU'UN SEUL document, quel que soit le
     nombre de séances qui l'utilisent. Avant, l'image était recopiée en
     base64 dans CHAQUE exercice de CHAQUE séance dès qu'on cliquait une
     suggestion : "Squat" avec une photo réutilisé dans 100 séances
     dupliquait 100 fois les mêmes octets dans Firestore, qui facture au
     volume stocké. Désormais une séance ne retient que le NOM de l'exercice
     ; l'image est retrouvée par nom au moment de l'affichage, et modifier ou
     supprimer une photo met à jour TOUTES les séances qui utilisent ce nom
     d'un coup, sans rien recopier nulle part. (Firebase Storage n'est pas
     utilisé ici : il nécessite le plan payant Blaze, alors que Firestore a
     un palier gratuit.) */
  const [exerciseNames, setExerciseNames] = useState({});
  const [exerciseMediaLibrary, setExerciseMediaLibrary] = useState({});
  const [mediaLibraryLoaded, setMediaLibraryLoaded] = useState(false);
  const [legacyExerciseMedia, setLegacyExerciseMedia] = useState({});
  const [openSuggestFor, setOpenSuggestFor] = useState(null);
  const migratedMediaKeysRef = useRef(new Set());

  useEffect(() => {
    const names = {};
    // Anciennes séances (créées avant le passage à la bibliothèque
    // partagée) : leur image était enregistrée directement sur l'exercice
    // (ex.mediaUrl). On les repère ici pour pouvoir (a) les afficher quand
    // même tout de suite, et (b) les migrer une fois vers "exerciseMedia".
    const legacy = {};
    events.forEach((w) => {
      (w.blocks || []).forEach((block) => {
        (block.exercises || []).forEach((ex) => {
          if (!ex.name) return;
          const key = normalizeExerciseName(ex.name);
          if (!key) return;
          names[key] = { name: ex.name };
          if (ex.mediaUrl && !legacy[key]) {
            legacy[key] = {
              name: ex.name,
              mediaUrl: ex.mediaUrl,
              mediaType: ex.mediaType || "image",
              mediaZoom: ex.mediaZoom || DEFAULT_MEDIA_ZOOM,
            };
          }
        });
      });
    });
    setExerciseNames(names);
    setLegacyExerciseMedia(legacy);
  }, [events]);

  const loadExerciseMediaLibrary = async () => {
    try {
      const snap = await getDocs(collection(db, "exerciseMedia"));
      const lib = {};
      snap.docs.forEach((d) => {
        lib[d.id] = d.data();
      });
      setExerciseMediaLibrary(lib);
    } catch (e) {
      console.error("Erreur chargement bibliothèque média des exercices:", e);
    } finally {
      setMediaLibraryLoaded(true);
    }
  };

  useEffect(() => {
    loadExerciseMediaLibrary();
  }, []);

  // Migration ponctuelle : la première fois qu'un exercice avec une image
  // "ancien format" (stockée directement sur la séance) est rencontré et
  // qu'il n'a pas encore de fiche dans "exerciseMedia", on la crée — une
  // seule fois par exercice, jamais recopiée ensuite. Seul le coach a le
  // droit d'écrire dans "exerciseMedia" (règles Firestore), donc cette
  // migration ne se déclenche que pour lui.
  useEffect(() => {
    if (!isAdminLike || !mediaLibraryLoaded) return;
    Object.entries(legacyExerciseMedia).forEach(([key, entry]) => {
      if (exerciseMediaLibrary[key] || migratedMediaKeysRef.current.has(key)) return;
      migratedMediaKeysRef.current.add(key);
      setDoc(doc(db, "exerciseMedia", key), {
        name: entry.name,
        mediaUrl: entry.mediaUrl,
        mediaType: entry.mediaType,
        mediaZoom: entry.mediaZoom,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          setExerciseMediaLibrary((prev) => ({ ...prev, [key]: entry }));
        })
        .catch((e) => {
          console.error("Erreur migration media exercice:", key, e);
          migratedMediaKeysRef.current.delete(key);
        });
    });
  }, [isAdminLike, mediaLibraryLoaded, legacyExerciseMedia, exerciseMediaLibrary]);

  // Résout l'image d'un exercice par son nom : d'abord dans la bibliothèque
  // partagée "exerciseMedia" (cas normal), sinon en repli sur l'ancien
  // champ ex.mediaUrl s'il existe encore sur cette séance précise (le temps
  // que la migration ci-dessus passe, ou pour un athlète qui n'a pas le
  // droit d'écrire dans "exerciseMedia" mais peut toujours lire l'ancien
  // champ sur sa propre séance).
  const getExerciseMedia = (ex) => {
    if (!ex) return null;
    const key = normalizeExerciseName(ex.name);
    const shared = key ? exerciseMediaLibrary[key] : null;
    if (shared && shared.mediaUrl) return shared;
    if (ex.mediaUrl) {
      return {
        mediaUrl: ex.mediaUrl,
        mediaType: ex.mediaType || "image",
        mediaZoom: ex.mediaZoom || DEFAULT_MEDIA_ZOOM,
      };
    }
    return null;
  };

  const getExerciseSuggestions = (typed) => {
    const q = normalizeExerciseName(typed);
    if (!q) return [];
    // Réutilise la même liste fusionnée que le gestionnaire "🔤 Noms
    // d'exercices" (séances + Mes RM + bibliothèque photo, en excluant les
    // fiches masquées) pour que l'autocomplétion et la liste affichent
    // toujours exactement les mêmes exercices.
    return getExerciseNameEntries()
      .filter((entry) => normalizeExerciseName(entry.name).includes(q))
      .slice(0, 6);
  };

  // Cliquer une suggestion ne fait que compléter le NOM de l'exercice —
  // l'image associée (s'il y en a une) s'affiche automatiquement via la
  // bibliothèque partagée, sans jamais être recopiée dans cette séance.
  const selectExerciseFromLibrary = (bIdx, eIdx, entry) => {
    updateExercise(bIdx, eIdx, "name", formatExerciseDisplayName(entry.name));
    setOpenSuggestFor(null);
  };

  /* ===================== GESTIONNAIRE DE NOMS D'EXERCICES (casse + orthographe) =====================
     Renommer un exercice ici le met à jour PARTOUT d'un coup : dans toutes
     les séances (déjà chargées) qui l'utilisent, et dans sa fiche média
     partagée — jamais un renommage manuel séance par séance. La correction
     orthographique reste volontairement manuelle (voir formatExerciseDisplayName
     plus haut) : le coach seul sait quels noms sont volontairement en
     anglais ("Hip Thrust") et lesquels sont de vraies fautes. */
  const [showExerciseNameManager, setShowExerciseNameManager] = useState(false);
  const [exerciseNameFilter, setExerciseNameFilter] = useState("");
  const [renamingKey, setRenamingKey] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const getExerciseNameEntries = () => {
    const merged = {};
    Object.entries(exerciseNames).forEach(([key, v]) => {
      merged[key] = { key, name: v.name, usedInSessions: true };
    });
    // Complète avec les noms venus de "Mes RM" (exercices de base pour le
    // calcul des % de charge) qui n'ont jamais été tapés tels quels dans
    // une séance.
    Object.entries(rmExerciseNames).forEach(([key, v]) => {
      if (!merged[key]) {
        merged[key] = { key, name: v.name, usedInSessions: false, fromRM: true };
      }
    });
    Object.entries(exerciseMediaLibrary).forEach(([key, v]) => {
      if (v.hidden) {
        // Fiche "masquée" (supprimée depuis ce gestionnaire) : on la retire
        // de la liste même si elle vient d'une séance ou de "Mes RM".
        delete merged[key];
        return;
      }
      merged[key] = {
        key,
        name: merged[key]?.name || v.name,
        usedInSessions: !!merged[key]?.usedInSessions,
        fromRM: !!merged[key]?.fromRM,
        mediaUrl: v.mediaUrl,
        mediaType: v.mediaType,
        category: v.category || null,
        isWarmup: !!v.isWarmup,
        isPDC: !!v.isPDC,
        videoUrl: v.videoUrl || null,
      };
    });
    return Object.values(merged).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  };

  const [propagatingCategory, setPropagatingCategory] = useState(null);

  // Dès qu'un exercice de la banque reçoit une catégorie (hors échauffement
  // et poids du corps), crée une fiche "en attente" (kg: null) dans le
  // "Mes RM" de CHAQUE athlète — pour qu'il apparaisse tout de suite dans
  // leur liste/recherche, même avant d'avoir été testé. Une fiche déjà
  // remplie (vraie valeur testée) n'est jamais écrasée : on complète
  // seulement sa catégorie si elle n'en a pas.
  const propagateExerciseToAllAthletes = async (key, category) => {
    if (!key || !category) return;
    setPropagatingCategory(key);
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const athleteIds = usersSnap.docs
        .filter((d) => d.data().role !== "admin" && d.data().superAdmin !== true)
        .map((d) => d.id);
      for (const uid of athleteIds) {
        const rmRef = doc(db, "users", uid, "rm", key);
        const rmSnap = await getDoc(rmRef);
        if (rmSnap.exists()) {
          // La banque d'exercices est la source de référence pour la
          // catégorie : on la resynchronise à chaque (re)catégorisation,
          // même si la fiche en avait déjà une (souvent juste "Autre" par
          // défaut) — sinon une correction faite ici depuis le gestionnaire
          // ne se propageait jamais aux fiches déjà créées.
          if (rmSnap.data().category !== category) {
            await updateDoc(rmRef, { category });
          }
          continue;
        }
        await setDoc(rmRef, {
          kg: null,
          exerciseName: key,
          category,
          autoCreated: true,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Erreur propagation exercice aux athlètes:", e);
      alert("❌ Erreur lors de la diffusion aux athlètes : " + e.message);
    } finally {
      setPropagatingCategory(null);
    }
  };

  // Supprime la fiche RM correspondante ("users/{uid}/rm/{key}") chez TOUS
  // les athlètes — utilisé quand un exercice disparaît réellement de la
  // banque (masqué ou supprimé), puisque "Mes RM" est désormais alimenté
  // automatiquement par la banque : plus besoin (ni possibilité) d'ajouter/
  // supprimer un exercice à la main côté athlète ou admin dans My RM.
  const deleteExerciseFromAllAthletesRM = async (key) => {
    if (!key) return;
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const athleteIds = usersSnap.docs
        .filter((d) => d.data().role !== "admin" && d.data().superAdmin !== true)
        .map((d) => d.id);
      for (const uid of athleteIds) {
        const rmRef = doc(db, "users", uid, "rm", key);
        const rmSnap = await getDoc(rmRef);
        if (rmSnap.exists()) {
          await deleteDoc(rmRef);
        }
      }
    } catch (e) {
      console.error("Erreur suppression RM athlètes:", e);
      alert("❌ Erreur lors de la suppression de cet exercice chez les athlètes : " + e.message);
    }
  };

  const startRenameExercise = (entry) => {
    setRenamingKey(entry.key);
    setRenameDraft(entry.name);
  };

  const cancelRenameExercise = () => {
    setRenamingKey(null);
    setRenameDraft("");
  };

  const confirmRenameExercise = async (oldKey) => {
    const newName = renameDraft.trim();
    if (!newName) {
      alert("Le nom ne peut pas être vide");
      return;
    }
    const newKey = normalizeExerciseName(newName);
    const oldName =
      exerciseNames[oldKey]?.name || exerciseMediaLibrary[oldKey]?.name || oldKey;
    if (newName === oldName) {
      cancelRenameExercise();
      return;
    }
    if (
      !window.confirm(
        `Renommer "${oldName}" en "${newName}" ?\n\nÇa mettra à jour TOUTES les séances (passées et futures) qui utilisent ce nom, ainsi que sa photo/gif partagé.`
      )
    ) {
      return;
    }
    setRenameBusy(true);
    try {
      // 1) Met à jour TOUTES les séances en base (requête directe Firestore,
      // pas seulement celles déjà chargées dans "events" — qui peuvent être
      // incomplètes si une séance a été créée pendant que ce gestionnaire
      // était ouvert). Firestore ne permet pas de modifier un seul champ
      // imbriqué dans un tableau d'objets : on réécrit le tableau "blocks"
      // en entier pour chaque séance concernée.
      const workoutSnap = await getDocs(collection(db, "workout"));
      const sessionsToUpdate = workoutSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((w) =>
          (w.blocks || []).some((block) =>
            (block.exercises || []).some(
              (ex) => normalizeExerciseName(ex.name) === oldKey
            )
          )
        );
      for (const session of sessionsToUpdate) {
        const newBlocks = session.blocks.map((block) => ({
          ...block,
          exercises: block.exercises.map((ex) =>
            normalizeExerciseName(ex.name) === oldKey ? { ...ex, name: newName } : ex
          ),
        }));
        await updateDoc(doc(db, "workout", session.id), { blocks: newBlocks });
      }

      // 2) Déplace la fiche média partagée si elle existe (conserve TOUS ses
      // champs — photo, catégorie, lien vidéo... — en les recopiant sur la
      // nouvelle fiche avant de supprimer l'ancienne).
      if (exerciseMediaLibrary[oldKey]) {
        const mediaEntry = { ...exerciseMediaLibrary[oldKey], name: newName };
        if (newKey !== oldKey) {
          await setDoc(doc(db, "exerciseMedia", newKey), {
            ...mediaEntry,
            updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, "exerciseMedia", oldKey));
        } else {
          await updateDoc(doc(db, "exerciseMedia", oldKey), { name: newName });
        }
        setExerciseMediaLibrary((prev) => {
          const next = { ...prev };
          delete next[oldKey];
          next[newKey] = mediaEntry;
          return next;
        });
      }

      // 3) Déplace la fiche "Mes RM" correspondante chez CHAQUE athlète.
      // Sans ça, l'ancienne fiche (toujours présente sous l'ancien nom chez
      // tous les athlètes, créée automatiquement dès qu'un exercice est
      // catégorisé) continuait d'apparaître dans ce gestionnaire — donnant
      // l'impression que le renommage n'avait rien fait et que l'image avait
      // disparu (en réalité déplacée sur une fiche différente).
      const usersSnap = await getDocs(collection(db, "users"));
      const athleteIds = usersSnap.docs
        .filter((d) => d.data().role !== "admin" && d.data().superAdmin !== true)
        .map((d) => d.id);
      for (const uid of athleteIds) {
        const oldRmRef = doc(db, "users", uid, "rm", oldKey);
        const oldRmSnap = await getDoc(oldRmRef);
        if (!oldRmSnap.exists()) continue;
        if (newKey === oldKey) {
          await updateDoc(oldRmRef, { exerciseName: newName });
          continue;
        }
        const newRmRef = doc(db, "users", uid, "rm", newKey);
        const newRmSnap = await getDoc(newRmRef);
        if (!newRmSnap.exists()) {
          await setDoc(newRmRef, {
            ...oldRmSnap.data(),
            exerciseName: newName,
            updatedAt: new Date().toISOString(),
          });
        }
        await deleteDoc(oldRmRef);
      }

      // 3bis) Le compte du coach lui-même (currentUser) a sa PROPRE fiche
      // "Mes RM" (users/{currentUser.uid}/rm), volontairement EXCLUE de la
      // boucle ci-dessus (qui ne traite que les athlètes, pas les
      // admins/superAdmin). Or c'est justement cette fiche qui alimente
      // "rmExerciseNames" (voir le useEffect "RM + VMA" plus haut) — sans ce
      // bloc, l'ancienne fiche du coach restait donc affichée sous l'ancien
      // nom après un renommage, donnant l'impression que rien ne s'était
      // passé (le renommage fonctionnait pourtant bien pour les séances et
      // la photo partagée).
      if (currentUser?.uid) {
        const ownOldRmRef = doc(db, "users", currentUser.uid, "rm", oldKey);
        const ownOldRmSnap = await getDoc(ownOldRmRef);
        if (ownOldRmSnap.exists()) {
          if (newKey === oldKey) {
            await updateDoc(ownOldRmRef, { exerciseName: newName });
          } else {
            const ownNewRmRef = doc(db, "users", currentUser.uid, "rm", newKey);
            const ownNewRmSnap = await getDoc(ownNewRmRef);
            if (!ownNewRmSnap.exists()) {
              await setDoc(ownNewRmRef, {
                ...ownOldRmSnap.data(),
                exerciseName: newName,
                updatedAt: new Date().toISOString(),
              });
            }
            await deleteDoc(ownOldRmRef);
          }
          setRmExerciseNames((prev) => {
            const next = { ...prev };
            delete next[oldKey];
            next[newKey] = { name: newName };
            return next;
          });
        }
      }

      await fetchSessions();
      cancelRenameExercise();
    } catch (e) {
      console.error("Erreur renommage exercice:", e);
      alert("❌ Erreur lors du renommage : " + e.message);
    } finally {
      setRenameBusy(false);
    }
  };

  // Ajouter / supprimer / changer l'image d'un exercice directement depuis
  // le gestionnaire de noms, sans avoir besoin de créer une séance d'abord.
  // saveExerciseMedia est défini un peu plus bas (section MEDIA EXERCICE) ;
  // comme ces fonctions ne sont appelées qu'au clic (jamais pendant le
  // rendu), l'ordre de déclaration dans le fichier n'a pas d'importance.
  const [newExerciseDraftName, setNewExerciseDraftName] = useState("");
  const [newExerciseDraftFile, setNewExerciseDraftFile] = useState(null);
  const [newExerciseDraftCategory, setNewExerciseDraftCategory] = useState("");
  const [newExerciseDraftWarmup, setNewExerciseDraftWarmup] = useState(false);
  const [newExerciseDraftPDC, setNewExerciseDraftPDC] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);

  const addNewExerciseName = async () => {
    const name = formatExerciseDisplayName(newExerciseDraftName.trim());
    if (!name) {
      alert("Merci d'indiquer un nom d'exercice");
      return;
    }
    const key = normalizeExerciseName(name);
    const alreadyVisible = getExerciseNameEntries().some((e) => e.key === key);
    if (alreadyVisible) {
      alert(`"${name}" existe déjà dans la liste.`);
      return;
    }
    // Échauffement / poids du corps : jamais de catégorie RM, donc jamais
    // diffusé dans "Mes RM" des athlètes.
    const isExcluded = newExerciseDraftWarmup || newExerciseDraftPDC;
    const category = isExcluded ? null : newExerciseDraftCategory || "autre";
    setAddingExercise(true);
    try {
      if (newExerciseDraftFile) {
        await saveExerciseMedia(name, newExerciseDraftFile, "catalog-new", {
          category,
          isWarmup: newExerciseDraftWarmup,
          isPDC: newExerciseDraftPDC,
        });
      } else {
        // Pas de photo pour l'instant : on enregistre quand même le nom,
        // pour qu'il apparaisse tout de suite dans l'autocomplétion — la
        // photo pourra être ajoutée plus tard (ici ou depuis une séance).
        await setDoc(doc(db, "exerciseMedia", key), {
          name,
          category,
          isWarmup: newExerciseDraftWarmup,
          isPDC: newExerciseDraftPDC,
          updatedAt: serverTimestamp(),
        });
        setExerciseMediaLibrary((prev) => ({
          ...prev,
          [key]: { name, category, isWarmup: newExerciseDraftWarmup, isPDC: newExerciseDraftPDC },
        }));
      }
      if (!isExcluded) {
        await propagateExerciseToAllAthletes(key, category);
      }
      setNewExerciseDraftName("");
      setNewExerciseDraftFile(null);
      setNewExerciseDraftCategory("");
      setNewExerciseDraftWarmup(false);
      setNewExerciseDraftPDC(false);
    } catch (e) {
      console.error("Erreur ajout exercice:", e);
      alert("❌ Erreur lors de l'ajout : " + e.message);
    } finally {
      setAddingExercise(false);
    }
  };

  const changeExerciseCatalogImage = (entry, file) => {
    saveExerciseMedia(entry.name, file, `catalog-${entry.key}`);
  };

  // Modifier la catégorie / échauffement / PDC d'un exercice déjà présent
  // dans la banque (nouveau OU ancien — voir EXERCISE_CATEGORIES). Diffuse
  // aussitôt vers "Mes RM" de tous les athlètes, sauf si l'exercice est
  // marqué échauffement ou poids du corps.
  const [categorizingKey, setCategorizingKey] = useState(null);
  const [categorizeDraft, setCategorizeDraft] = useState({
    category: "autre",
    isWarmup: false,
    isPDC: false,
  });

  // Lien vidéo de démonstration d'un exercice de la banque (ex: YouTube non
  // répertorié, Google Drive...). Stocké en simple URL sur la fiche partagée
  // "exerciseMedia" — jamais de fichier vidéo uploadé (trop volumineux pour
  // Firestore, voir le garde-fou ~1 Mo sur les photos).
  const [editingVideoKey, setEditingVideoKey] = useState(null);
  const [videoDraft, setVideoDraft] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);

  const startEditVideo = (entry) => {
    setEditingVideoKey(entry.key);
    setVideoDraft(entry.videoUrl || "");
  };

  const cancelEditVideo = () => {
    setEditingVideoKey(null);
  };

  const confirmEditVideo = async (entry) => {
    const url = videoDraft.trim();
    setSavingVideo(true);
    try {
      await setDoc(
        doc(db, "exerciseMedia", entry.key),
        {
          name: entry.name,
          videoUrl: url || deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setExerciseMediaLibrary((prev) => ({
        ...prev,
        [entry.key]: {
          ...(prev[entry.key] || { name: entry.name }),
          videoUrl: url || undefined,
        },
      }));
      setEditingVideoKey(null);
    } catch (e) {
      console.error("Erreur enregistrement lien vidéo:", e);
      alert("❌ Erreur lors de l'enregistrement du lien vidéo : " + e.message);
    } finally {
      setSavingVideo(false);
    }
  };

  const startCategorizeExercise = (entry) => {
    setCategorizingKey(entry.key);
    setCategorizeDraft({
      category: normalizeCategoryValue(entry.category) || "autre",
      isWarmup: !!entry.isWarmup,
      isPDC: !!entry.isPDC,
    });
  };

  const cancelCategorizeExercise = () => {
    setCategorizingKey(null);
  };

  const confirmCategorizeExercise = async (entry) => {
    const isExcluded = categorizeDraft.isWarmup || categorizeDraft.isPDC;
    const category = isExcluded ? null : categorizeDraft.category || "autre";
    try {
      await setDoc(
        doc(db, "exerciseMedia", entry.key),
        {
          name: entry.name,
          category,
          isWarmup: categorizeDraft.isWarmup,
          isPDC: categorizeDraft.isPDC,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setExerciseMediaLibrary((prev) => ({
        ...prev,
        [entry.key]: {
          ...(prev[entry.key] || { name: entry.name }),
          category,
          isWarmup: categorizeDraft.isWarmup,
          isPDC: categorizeDraft.isPDC,
        },
      }));
      if (!isExcluded) {
        await propagateExerciseToAllAthletes(entry.key, category);
      }
      setCategorizingKey(null);
    } catch (e) {
      console.error("Erreur catégorisation exercice:", e);
      alert("❌ Erreur lors de l'enregistrement de la catégorie : " + e.message);
    }
  };

  const deleteExerciseCatalogEntry = async (entry) => {
    const hasMedia = !!entry.mediaUrl;
    // Trois cas :
    // 1) A une photo + utilisé dans des séances -> on retire juste la
    //    photo, le nom reste utilisable.
    // 2) Pas de photo mais utilisé dans des séances (ou issu de "Mes RM")
    //    -> impossible de le faire disparaître des séances existantes,
    //    donc on le "masque" (fiche hidden:true) : il quitte cette liste
    //    et les suggestions, sans toucher aux séances déjà créées.
    // 3) Ni photo ni usage -> suppression complète de la fiche.
    const msg = hasMedia && entry.usedInSessions
      ? `Supprimer la photo de "${entry.name}" ? Le nom reste disponible (il est utilisé dans des séances existantes) — seule l'image sera retirée.`
      : entry.usedInSessions || entry.fromRM
      ? `Retirer "${entry.name}" de cette liste ? Les séances existantes qui l'utilisent ne sont pas modifiées, mais il n'apparaîtra plus ici ni dans les suggestions tant que tu ne l'auras pas rajouté.`
      : `Supprimer "${entry.name}" de la liste ? Il n'est utilisé dans aucune séance pour l'instant, il disparaîtra complètement (tu pourras toujours le retaper à la main plus tard).`;
    if (!window.confirm(msg)) return;
    try {
      if (hasMedia && entry.usedInSessions) {
        await updateDoc(doc(db, "exerciseMedia", entry.key), {
          mediaUrl: deleteField(),
          mediaType: deleteField(),
          mediaZoom: deleteField(),
          updatedAt: serverTimestamp(),
        });
        setExerciseMediaLibrary((prev) => ({
          ...prev,
          [entry.key]: {
            name: entry.name,
            category: entry.category || null,
            isWarmup: !!entry.isWarmup,
            isPDC: !!entry.isPDC,
          },
        }));
      } else if (entry.usedInSessions || entry.fromRM) {
        await setDoc(
          doc(db, "exerciseMedia", entry.key),
          {
            name: entry.name,
            category: entry.category || null,
            isWarmup: !!entry.isWarmup,
            isPDC: !!entry.isPDC,
            hidden: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setExerciseMediaLibrary((prev) => ({
          ...prev,
          [entry.key]: {
            name: entry.name,
            category: entry.category || null,
            isWarmup: !!entry.isWarmup,
            isPDC: !!entry.isPDC,
            hidden: true,
          },
        }));
        // L'exercice quitte la banque (même s'il reste techniquement
        // présent dans d'anciennes séances) -> il doit aussi disparaître de
        // "Mes RM" chez tous les athlètes.
        await deleteExerciseFromAllAthletesRM(entry.key);
      } else {
        await deleteDoc(doc(db, "exerciseMedia", entry.key));
        setExerciseMediaLibrary((prev) => {
          const next = { ...prev };
          delete next[entry.key];
          return next;
        });
        await deleteExerciseFromAllAthletesRM(entry.key);
      }
    } catch (e) {
      console.error("Erreur suppression exercice:", e);
      alert("❌ Erreur lors de la suppression : " + e.message);
    }
  };

  /* ===================== MEDIA EXERCICE (PHOTO/GIF) =====================
     Enregistrée UNE SEULE FOIS par nom d'exercice dans la collection
     Firestore "exerciseMedia" (compressée en base64, comme avant Storage) —
     jamais copiée dans le document de la séance. C'est ce qui évite la
     duplication de stockage : quel que soit le nombre de séances qui
     utilisent "Squat", une seule image "Squat" existe dans la base.
     saveExerciseMedia() est le cœur partagé : utilisé à la fois depuis une
     séance (handleMediaUpload) ET depuis le gestionnaire de noms
     d'exercices (ajout/modification d'image sans passer par une séance). */
  const saveExerciseMedia = (exerciseName, file, progressKey, extra = {}) => {
    return new Promise((resolve, reject) => {
      if (!file) return resolve();
      if (!file.type.startsWith("image/")) {
        alert("Merci de choisir une image ou un GIF");
        return resolve();
      }

      const mediaKey = normalizeExerciseName(exerciseName);
      const isGif = file.type === "image/gif";
      const stopProgress = () => {
        if (progressKey) setUploadingMedia((prev) => ({ ...prev, [progressKey]: false }));
      };

      const persist = async (dataUrl, mediaType) => {
        try {
          const existing = exerciseMediaLibrary[mediaKey];
          // Ajouter/changer une photo ne doit jamais effacer la catégorie ou
          // les flags échauffement/PDC déjà enregistrés — on les préserve
          // depuis la fiche existante, sauf si "extra" en fournit de nouveaux
          // (cas de l'ajout initial depuis le formulaire du gestionnaire).
          const entry = {
            name: exerciseName,
            mediaUrl: dataUrl,
            mediaType,
            mediaZoom: existing?.mediaZoom || DEFAULT_MEDIA_ZOOM,
            category: extra.category !== undefined ? extra.category : existing?.category ?? null,
            isWarmup: extra.isWarmup !== undefined ? extra.isWarmup : !!existing?.isWarmup,
            isPDC: extra.isPDC !== undefined ? extra.isPDC : !!existing?.isPDC,
            // Préserve le lien vidéo déjà renseigné — ajouter/changer une
            // photo ne doit jamais l'effacer (setDoc ci-dessous est un
            // remplacement complet du document, merge:true en plus par
            // sécurité).
            ...(existing?.videoUrl ? { videoUrl: existing.videoUrl } : {}),
          };
          await setDoc(
            doc(db, "exerciseMedia", mediaKey),
            {
              ...entry,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          setExerciseMediaLibrary((prev) => ({ ...prev, [mediaKey]: entry }));
          resolve();
        } catch (e) {
          console.error("Erreur enregistrement media:", e);
          alert("❌ Erreur lors de l'enregistrement du fichier : " + e.message);
          reject(e);
        } finally {
          stopProgress();
        }
      };

      if (isGif) {
        // Les GIF ne peuvent pas passer par un <canvas> (l'animation serait
        // perdue) : on les encode tels quels en base64, avec une limite de
        // taille plus stricte que les images fixes puisqu'un GIF non
        // compressé pèse vite lourd dans Firestore (limite 1 Mo/document).
        const maxGifSize = 700 * 1024; // ~700 Ko max pour un GIF
        if (file.size > maxGifSize) {
          alert(
            "⚠️ Ce GIF est trop volumineux (" +
              Math.round(file.size / 1024) +
              " Ko, max ~700 Ko). Essaie un GIF plus court/léger, ou utilise une image fixe (JPEG/PNG)."
          );
          return resolve();
        }
        if (progressKey) setUploadingMedia((prev) => ({ ...prev, [progressKey]: true }));
        const reader = new FileReader();
        reader.onload = (event) => persist(event.target.result, "gif");
        reader.onerror = () => {
          alert("❌ Erreur lors de la lecture du fichier");
          stopProgress();
          reject(new Error("read error"));
        };
        reader.readAsDataURL(file);
        return;
      }

      const maxOriginalSize = 15 * 1024 * 1024; // 15 Mo avant compression
      if (file.size > maxOriginalSize) {
        alert("Image trop volumineuse (max 15 Mo avant compression)");
        return resolve();
      }

      if (progressKey) setUploadingMedia((prev) => ({ ...prev, [progressKey]: true }));

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height >= width && height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // toDataURL (base64) car stocké dans Firestore, mais UNE SEULE fois
          // par exercice grâce à la bibliothèque partagée ci-dessus.
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          persist(dataUrl, "image");
        };
        img.onerror = () => {
          alert("❌ Erreur lors du chargement de l'image");
          stopProgress();
          reject(new Error("img load error"));
        };
        img.src = event.target.result;
      };
      reader.onerror = () => {
        alert("❌ Erreur lors de la lecture du fichier");
        stopProgress();
        reject(new Error("read error"));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleMediaUpload = (bIdx, eIdx, file) => {
    const exerciseName = blocks[bIdx]?.exercises[eIdx]?.name?.trim();
    if (!exerciseName) {
      alert("Merci de donner un nom à l'exercice avant d'ajouter une photo/gif");
      return;
    }
    saveExerciseMedia(exerciseName, file, `${bIdx}-${eIdx}`);
  };

  const removeMedia = (bIdx, eIdx) => {
    const exerciseName = blocks[bIdx]?.exercises[eIdx]?.name?.trim();
    const mediaKey = normalizeExerciseName(exerciseName);
    if (!mediaKey || !exerciseMediaLibrary[mediaKey]) return;
    if (
      !window.confirm(
        `Supprimer la photo/gif de "${exerciseName}" ? Elle disparaîtra de TOUTES les séances qui utilisent cet exercice.`
      )
    ) {
      return;
    }
    deleteDoc(doc(db, "exerciseMedia", mediaKey)).catch((e) => {
      console.error("Erreur suppression media:", e);
    });
    setExerciseMediaLibrary((prev) => {
      const next = { ...prev };
      delete next[mediaKey];
      return next;
    });
  };

  const setMediaZoom = (bIdx, eIdx, zoom) => {
    const exerciseName = blocks[bIdx]?.exercises[eIdx]?.name?.trim();
    const mediaKey = normalizeExerciseName(exerciseName);
    if (!mediaKey || !exerciseMediaLibrary[mediaKey]) return;
    setExerciseMediaLibrary((prev) => ({
      ...prev,
      [mediaKey]: { ...prev[mediaKey], mediaZoom: zoom },
    }));
    updateDoc(doc(db, "exerciseMedia", mediaKey), { mediaZoom: zoom }).catch((e) => {
      console.error("Erreur mise à jour zoom:", e);
    });
  };

  /* ===================== COULEURS ===================== */
  const getColor = (session) => {
    // Couleur spéciale pour le groupe "moi"
    if (session.group === "moi") {
      return "#d9a441"; // Or/Doré pour les séances personnelles
    }
    
    // Couleurs par type pour les autres groupes
    const type = session.type || "muscu";
    if (type === "sprint") return "#d9695a";
    if (type === "endurance") return "#4fae7d";
    return "#9b59b6";
  };

  /* ===================== FILTRE CALENDRIER PAR ATHLÈTE (ADMIN) =====================
     Réutilise exactement la même logique de visibilité que le filtrage
     côté athlète dans fetchSessions (total / son groupe / groupes
     personnalisés / ciblage individuel "individuel"+targetUserId), pour que
     "ce que l'admin voit en filtrant sur un athlète" corresponde exactement
     à "ce que cet athlète voit lui-même". */
  const getAthleteDisplayName = (a) =>
    a.firstName && a.lastName
      ? `${a.firstName} ${a.lastName}`
      : a.displayName || a.email || "Athlète";

  const isEventVisibleToAthlete = (evt, athlete) => {
    if (!athlete) return true;
    if (evt.group === "total") return true;
    if (evt.targetUserId === athlete.id) return true;
    if (evt.group === "moi") return evt.createdBy === athlete.id;
    if (athlete.group && evt.group === athlete.group) return true;
    const memberGroupIds = customGroups
      .filter((g) => (g.athleteIds || []).includes(athlete.id))
      .map((g) => g.id);
    return memberGroupIds.includes(evt.group);
  };

  // Ouvre le formulaire de création pré-rempli pour CET athlète (ciblage
  // individuel par défaut) — l'admin peut toujours changer le groupe dans le
  // formulaire s'il préfère cibler tout son groupe plutôt que lui seul.
  const openCreateForAthlete = (athlete, date) => {
    resetForm();
    setFormDate(date);
    setGroup("individuel");
    setTargetUserId(athlete.id);
    setShowForm(true);
  };

  // Une séance n'est visible pour un groupe donné que si elle cible ce
  // groupe précisément, ou "total" (visible par tout le monde).
  const isEventVisibleToGroup = (evt, groupId) => {
    if (!groupId) return true;
    if (evt.group === "total") return true;
    return evt.group === groupId;
  };

  // Ouvre le formulaire de création pré-rempli pour CE groupe.
  const openCreateForGroup = (groupId, date) => {
    resetForm();
    setFormDate(date);
    setGroup(groupId);
    setShowForm(true);
  };

  // Filtre actif dans le calendrier (athlète OU groupe, mutuellement
  // exclusifs — voir la déclaration des states). Calculé une fois, réutilisé
  // partout (grille mensuelle + panneau "Séances du ...") pour rester
  // cohérent entre ce que montre chaque jour et ce que montre le panneau.
  const filterAthlete = athletes.find((a) => a.id === athleteFilterId) || null;
  const filterGroup = customGroups.find((g) => g.id === groupFilterId) || null;
  const isEventVisibleToFilter = (evt) => {
    if (filterAthlete) return isEventVisibleToAthlete(evt, filterAthlete);
    if (filterGroup) return isEventVisibleToGroup(evt, filterGroup.id);
    return true;
  };

  /* ===================== CALENDRIER MENSUEL ===================== */
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const todayStr = getLocalDateStr(new Date());
    const cells = [];

    for (let i = 0; i < startDow; i++) {
      const isMobile = window.innerWidth <= 768;
      cells.push(
        <div
          key={`e${i}`}
          style={{ 
            height: isMobile ? 70 : 90,  // height fixe au lieu de minHeight
            background: "#0d0c0a", 
            borderRadius: isMobile ? 3 : 6 
          }}
        />
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = getLocalDateStr(new Date(year, month, day));
      const isToday = dateStr === todayStr;
      const isSelected = selectedDate === dateStr;
      const dayEvents = events.filter(
        (e) => e.date === dateStr && isEventVisibleToFilter(e)
      );
      const isMobile = window.innerWidth <= 768;

      cells.push(
        <div
          key={day}
          onClick={() => setSelectedDate(isSelected ? null : dateStr)}
          style={{
            background: isToday ? "rgba(79,174,125,0.14)" : "#1a1815",
            border: isSelected
              ? "2px solid #4fae7d"
              : isToday
              ? "2px solid #4fae7d"
              : "1px solid rgba(255,255,255,0.16)",
            borderRadius: isMobile ? 3 : 6,
            padding: isMobile ? 2 : 6,
            height: isMobile ? 70 : 90,  // height fixe au lieu de minHeight
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            transition: "border 0.15s",
            overflow: "hidden",  // Empêcher le débordement
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 10 : 13,
              fontWeight: isToday ? "bold" : 500,
              color: isToday ? "#4fae7d" : "#a8a199",
              marginBottom: isMobile ? 1 : 4,
              flexShrink: 0,  // Le numéro ne rétrécit pas
            }}
          >
            {day}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? 1 : 2,
              overflow: "hidden",  // Cache les événements qui dépassent
            }}
          >
            {dayEvents.slice(0, isMobile ? 1 : 3).map((evt, i) => (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(dateStr);
                  setSelectedSession(evt);
                }}
                style={{
                  background: getColor(evt),
                  borderRadius: 2,
                  padding: isMobile ? "1px 2px" : "1px 5px",
                  fontSize: isMobile ? 7 : 10,
                  fontWeight: "bold",
                  color: "#f3f0ea",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  cursor: "pointer",
                  flexShrink: 0,  // Les événements ne rétrécissent pas
                }}
              >
                {evt.group === "moi" && "🌟 "}{evt.title}
              </div>
            ))}
            {isMobile && dayEvents.length > 1 && (
              <div
                style={{
                  fontSize: 7,
                  color: "#a8a199",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                +{dayEvents.length - 1}
              </div>
            )}
          </div>
        </div>
      );
    }
    return cells;
  };

  /* ===================== RENDER ===================== */
  const sessionType = selectedSession?.type || "muscu";

  return (
    <div
      style={{
        padding: window.innerWidth <= 768 ? "5px" : "20px",
        background: "#0d0c0a",
        minHeight: "100vh",
        color: "#f3f0ea",
        maxWidth: window.innerWidth <= 768 ? "100%" : "1200px",
        margin: "0 auto",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>🏋️ Workout</h2>
      <p style={{ color: "#a8a199", marginBottom: 20, fontSize: 14 }}>
        Planifie et suis tes séances
      </p>

      {/* Boutons Admin */}
      {userRole === "admin" && !showForm && !selectedSession && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => {
              const date = selectedDate
                ? new Date(selectedDate + "T12:00:00")
                : new Date();
              if (filterAthlete) {
                // Un filtre athlète est actif : la séance créée depuis le
                // calendrier est individualisée pour lui par défaut (le
                // formulaire permet ensuite de viser son groupe à la place).
                openCreateForAthlete(filterAthlete, date);
              } else if (filterGroup) {
                // Un filtre groupe est actif : la séance créée cible ce
                // groupe par défaut.
                openCreateForGroup(filterGroup.id, date);
              } else {
                setShowForm(true);
                setFormDate(date);
              }
            }}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#4fae7d",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {athleteFilterId
              ? "➕ Créer séance pour cet athlète"
              : groupFilterId
              ? "➕ Créer séance pour ce groupe"
              : "➕ Créer séance"}
          </button>
          <button
            onClick={() => setShowDuplicateModal(true)}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#e0a13d",
              color: "#1a1306",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            📋 Dupliquer semaine
          </button>
          <button
            onClick={() => setShowDuplicateDayModal(true)}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#e0a13d",
              color: "#1a1306",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            📅 Dupliquer journée
          </button>
          <button
            disabled={recalculatingDurations}
            onClick={recalculateAllDurations}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#2a2620",
              color: "#f3f0ea",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: recalculatingDurations ? "wait" : "pointer",
            }}
          >
            {recalculatingDurations
              ? "⏱️ Recalcul en cours…"
              : "⏱️ Recalculer la durée de toutes les séances"}
          </button>
          <button
            onClick={() => {
              resetGroupForm();
              setShowGroupsManager(true);
            }}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#e0a13d",
              color: "#1a1306",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            👥 Gérer les groupes
          </button>
          <button
            onClick={() => setShowExerciseNameManager(true)}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "#e0a13d",
              color: "#1a1306",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            🔤 Noms d'exercices
          </button>
        </div>
      )}

      {/* Modal Gestion des noms d'exercices : harmonise la casse et corrige
          les fautes d'orthographe — le renommage se répercute automatiquement
          sur TOUTES les séances (passées et futures) qui utilisent ce nom,
          plus la photo/gif partagé associé, sans rien dupliquer. La
          correction orthographique reste manuelle (jamais automatique) car
          les noms mélangent français et anglais (ex: "Hip Thrust", "Nordic
          Curl") et une correction automatique risquerait de "corriger" un
          terme anglais correct. */}
      {showExerciseNameManager && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => {
            setShowExerciseNameManager(false);
            cancelRenameExercise();
            setExerciseNameFilter("");
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#151310",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              overflowY: "auto",
              border: "1px solid rgba(224,161,61,0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>🔤 Noms d'exercices</h3>
              <button
                onClick={() => {
                  setShowExerciseNameManager(false);
                  cancelRenameExercise();
                  setExerciseNameFilter("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#a8a199",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#a8a199", marginTop: 0, marginBottom: 16 }}>
              Renommer un exercice met à jour toutes les séances (passées et
              futures) qui l'utilisent, ainsi que sa photo/gif partagé — en
              une fois, sans rien dupliquer. Tu peux aussi toujours en
              ajouter directement en tapant le nom dans une séance.
            </p>

            {/* Ajouter un nouvel exercice (avec ou sans photo tout de
                suite) sans avoir à créer une séance. */}
            <div
              style={{
                background: "#0d0c0a",
                borderRadius: 8,
                padding: 10,
                marginBottom: 14,
                display: "grid",
                gap: 8,
              }}
            >
              <input
                type="text"
                placeholder="➕ Nom du nouvel exercice..."
                value={newExerciseDraftName}
                onChange={(e) => setNewExerciseDraftName(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #2a2620",
                  background: "#151310",
                  color: "#f3f0ea",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={newExerciseDraftCategory}
                  onChange={(e) => setNewExerciseDraftCategory(e.target.value)}
                  disabled={newExerciseDraftWarmup || newExerciseDraftPDC}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #2a2620",
                    background: "#151310",
                    color: "#f3f0ea",
                    fontSize: 12,
                    opacity: newExerciseDraftWarmup || newExerciseDraftPDC ? 0.5 : 1,
                  }}
                >
                  <option value="">Catégorie (défaut : Autre)</option>
                  {EXERCISE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: 12, color: "#a8a199", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newExerciseDraftWarmup}
                    onChange={(e) => setNewExerciseDraftWarmup(e.target.checked)}
                  />
                  Échauffement
                </label>
                <label style={{ fontSize: 12, color: "#a8a199", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newExerciseDraftPDC}
                    onChange={(e) => setNewExerciseDraftPDC(e.target.checked)}
                  />
                  Poids du corps
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label
                  style={{
                    fontSize: 12,
                    color: "#a8a199",
                    padding: "6px 10px",
                    background: "#151310",
                    borderRadius: 6,
                    border: "1px solid #2a2620",
                    cursor: "pointer",
                  }}
                >
                  📷 {newExerciseDraftFile ? newExerciseDraftFile.name : "Photo (optionnel)"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewExerciseDraftFile(e.target.files?.[0] || null)}
                    style={{ display: "none" }}
                  />
                </label>
                <button
                  disabled={addingExercise}
                  onClick={addNewExerciseName}
                  style={{
                    marginLeft: "auto",
                    padding: "8px 16px",
                    background: "#4fae7d",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: addingExercise ? "wait" : "pointer",
                    fontWeight: "bold",
                    fontSize: 13,
                  }}
                >
                  {addingExercise ? "…" : "➕ Ajouter"}
                </button>
              </div>
              {!newExerciseDraftWarmup && !newExerciseDraftPDC && (
                <p style={{ fontSize: 11, color: "#a8a199", margin: 0 }}>
                  Sera automatiquement ajouté dans "Mes RM" de tous les athlètes (en attente de test).
                </p>
              )}
            </div>

            <input
              type="text"
              placeholder="🔍 Rechercher un exercice..."
              value={exerciseNameFilter}
              onChange={(e) => setExerciseNameFilter(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                boxSizing: "border-box",
                marginBottom: 14,
              }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              {getExerciseNameEntries()
                .filter((entry) =>
                  normalizeExerciseName(entry.name).includes(
                    normalizeExerciseName(exerciseNameFilter)
                  )
                )
                .map((entry) => (
                  <div
                    key={entry.key}
                    style={{
                      background: "#0d0c0a",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    {renamingKey === entry.key ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #e0a13d",
                            background: "#151310",
                            color: "#f3f0ea",
                          }}
                        />
                        <button
                          disabled={renameBusy}
                          onClick={() => confirmRenameExercise(entry.key)}
                          style={{
                            padding: "0 14px",
                            background: "#4fae7d",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: renameBusy ? "wait" : "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          {renameBusy ? "…" : "✅"}
                        </button>
                        <button
                          disabled={renameBusy}
                          onClick={cancelRenameExercise}
                          style={{
                            padding: "0 14px",
                            background: "#d9695a",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : categorizingKey === entry.key ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            value={categorizeDraft.category}
                            onChange={(e) =>
                              setCategorizeDraft((d) => ({ ...d, category: e.target.value }))
                            }
                            disabled={categorizeDraft.isWarmup || categorizeDraft.isPDC}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#151310",
                              color: "#f3f0ea",
                              fontSize: 12,
                              opacity: categorizeDraft.isWarmup || categorizeDraft.isPDC ? 0.5 : 1,
                            }}
                          >
                            {EXERCISE_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <label style={{ fontSize: 12, color: "#a8a199", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={categorizeDraft.isWarmup}
                              onChange={(e) =>
                                setCategorizeDraft((d) => ({ ...d, isWarmup: e.target.checked }))
                              }
                            />
                            Échauffement
                          </label>
                          <label style={{ fontSize: 12, color: "#a8a199", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={categorizeDraft.isPDC}
                              onChange={(e) =>
                                setCategorizeDraft((d) => ({ ...d, isPDC: e.target.checked }))
                              }
                            />
                            Poids du corps
                          </label>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            disabled={propagatingCategory === entry.key}
                            onClick={() => confirmCategorizeExercise(entry)}
                            style={{
                              padding: "6px 14px",
                              background: "#4fae7d",
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: propagatingCategory === entry.key ? "wait" : "pointer",
                              fontWeight: "bold",
                              fontSize: 13,
                            }}
                          >
                            {propagatingCategory === entry.key ? "Diffusion…" : "✅ Enregistrer"}
                          </button>
                          <button
                            onClick={cancelCategorizeExercise}
                            style={{
                              padding: "6px 14px",
                              background: "#2a2620",
                              color: "#f3f0ea",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : editingVideoKey === entry.key ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#a8a199" }}>
                          🎬 Lien vidéo (YouTube non répertorié, Drive...) — laisse vide pour retirer
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={videoDraft}
                            onChange={(e) => setVideoDraft(e.target.value)}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #e0a13d",
                              background: "#151310",
                              color: "#f3f0ea",
                            }}
                          />
                          <button
                            disabled={savingVideo}
                            onClick={() => confirmEditVideo(entry)}
                            style={{
                              padding: "0 14px",
                              background: "#4fae7d",
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: savingVideo ? "wait" : "pointer",
                              fontWeight: "bold",
                            }}
                          >
                            {savingVideo ? "…" : "✅"}
                          </button>
                          <button
                            disabled={savingVideo}
                            onClick={cancelEditVideo}
                            style={{
                              padding: "0 14px",
                              background: "#d9695a",
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          {entry.mediaUrl ? (
                            <img
                              src={entry.mediaUrl}
                              alt=""
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 6,
                                objectFit: "cover",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 6,
                                background: "#151310",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {entry.name}
                            </div>
                            <div style={{ fontSize: 11, color: "#a8a199", marginTop: 2 }}>
                              {entry.isWarmup
                                ? "🔥 Échauffement"
                                : entry.isPDC
                                ? "🧍 Poids du corps"
                                : getExerciseCategoryLabel(entry.category)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            onClick={() => startCategorizeExercise(entry)}
                            style={{
                              padding: "6px 10px",
                              background: "#2a2620",
                              color: "#f3f0ea",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            🏷️ Catégorie
                          </button>
                          <label
                            style={{
                              padding: "6px 10px",
                              background: "#2a2620",
                              color: "#f3f0ea",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              cursor: uploadingMedia[`catalog-${entry.key}`] ? "wait" : "pointer",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {uploadingMedia[`catalog-${entry.key}`]
                              ? "…"
                              : entry.mediaUrl
                              ? "📷 Changer"
                              : "📷 Ajouter photo"}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingMedia[`catalog-${entry.key}`]}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) changeExerciseCatalogImage(entry, file);
                                e.target.value = "";
                              }}
                              style={{ display: "none" }}
                            />
                          </label>
                          <button
                            onClick={() => startEditVideo(entry)}
                            style={{
                              padding: "6px 10px",
                              background: entry.videoUrl ? "rgba(224,161,61,0.18)" : "#2a2620",
                              color: entry.videoUrl ? "#e0a13d" : "#f3f0ea",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.videoUrl ? "🎬 Vidéo ✓" : "🎬 Vidéo"}
                          </button>
                          <button
                            onClick={() => startRenameExercise(entry)}
                            style={{
                              padding: "6px 10px",
                              background: "#2a2620",
                              color: "#f3f0ea",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            ✏️ Renommer
                          </button>
                          <button
                            onClick={() => deleteExerciseCatalogEntry(entry)}
                            title={
                              entry.mediaUrl && entry.usedInSessions
                                ? "Supprimer la photo"
                                : "Retirer de la liste"
                            }
                            style={{
                              padding: "6px 10px",
                              background: "#d9695a",
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              {getExerciseNameEntries().length === 0 && (
                <div style={{ textAlign: "center", color: "#a8a199", padding: 20 }}>
                  Aucun exercice enregistré pour le moment.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestion des groupes personnalisés */}
      {showGroupsManager && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowGroupsManager(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#151310",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              overflowY: "auto",
              border: "1px solid rgba(123,47,247,0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>👥 Groupes personnalisés</h3>
              <button
                onClick={() => setShowGroupsManager(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f3f0ea",
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#a8a199", marginBottom: 16 }}>
              Crée des groupes libres avec les athlètes de ton choix (un athlète peut
              appartenir à plusieurs groupes en même temps). Une fois créé, le groupe
              apparaît dans la liste "Groupe cible" lors de la création d'une séance.
            </p>

            {/* Liste des groupes existants */}
            {customGroups.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                {customGroups.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      background: "#0d0c0a",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                      border:
                        editingGroupId === g.id
                          ? "1px solid #e0a13d"
                          : "1px solid rgba(255,255,255,0.16)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: 14 }}>
                          {g.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#a8a199" }}>
                          {(g.athleteIds || [])
                            .map((id) => {
                              const a = athletes.find((ath) => ath.id === id);
                              if (!a) return "?";
                              return a.firstName && a.lastName
                                ? `${a.firstName} ${a.lastName}`
                                : a.displayName || a.email || "?";
                            })
                            .join(", ")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => startEditGroup(g)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #e0a13d",
                            background: "transparent",
                            color: "#e0a13d",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteGroup(g.id)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #d9695a",
                            background: "transparent",
                            color: "#d9695a",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire création / édition */}
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.16)",
                paddingTop: 16,
              }}
            >
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>
                {editingGroupId ? "✏️ Modifier le groupe" : "➕ Nouveau groupe"}
              </h4>
              <input
                type="text"
                placeholder="Nom du groupe (ex: Groupe 1)"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #2a2620",
                  background: "#0d0c0a",
                  color: "#f3f0ea",
                  fontSize: 14,
                  marginBottom: 10,
                }}
              />
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 10,
                }}
              >
                {athletes.map((a) => (
                  <label
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 2px",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={groupAthleteIds.includes(a.id)}
                      onChange={() => toggleNewGroupAthlete(a.id)}
                    />
                    {a.firstName && a.lastName
                      ? `${a.firstName} ${a.lastName}`
                      : a.displayName || a.email || "Athlète sans nom"}
                  </label>
                ))}
                {athletes.length === 0 && (
                  <div style={{ fontSize: 12, color: "#a8a199" }}>
                    Aucun athlète trouvé.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={saveGroup}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 6,
                    border: "none",
                    background: "#4fae7d",
                    color: "white",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  {editingGroupId ? "Enregistrer" : "Créer le groupe"}
                </button>
                {editingGroupId && (
                  <button
                    onClick={resetGroupForm}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      border: "1px solid #2a2620",
                      background: "transparent",
                      color: "#f3f0ea",
                      cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Légende couleurs */}
      {!showForm && !selectedSession && (
        <div
          style={{
            background: "#151310",
            padding: 15,
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "center",
            gap: 30,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                background: "#e0a13d",
                borderRadius: 4,
              }}
            ></div>
            <span style={{ fontSize: 14 }}>💪 Musculation</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                background: "#d9695a",
                borderRadius: 4,
              }}
            ></div>
            <span style={{ fontSize: 14 }}>⚡ Sprint</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                background: "#4fae7d",
                borderRadius: 4,
              }}
            ></div>
            <span style={{ fontSize: 14 }}>🏃 Endurance</span>
          </div>
        </div>
      )}

      {/* ============ MODAL DUPLICATION ============ */}
      {showDuplicateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151310",
              padding: 30,
              borderRadius: 12,
              maxWidth: 460,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>📋 Dupliquer une semaine</h3>
            <p style={{ fontSize: 14, color: "#a8a199", marginBottom: 15 }}>
              Sélectionnez le <strong>lundi</strong> de la semaine à copier.
            </p>
            <input
              type="date"
              value={duplicateWeekStart || ""}
              onChange={(e) => setDuplicateWeekStart(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(102, 126, 234, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                marginBottom: 18,
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.6)";
                e.target.style.boxShadow = "0 0 15px rgba(102, 126, 234, 0.3)";
              }}
              onBlur={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.3)";
                e.target.style.boxShadow = "none";
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={duplicateWeek}
                disabled={isDuplicatingWeek}
                style={{
                  flex: 1,
                  padding: 14,
                  background: isDuplicatingWeek ? "#a8a199" : "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: isDuplicatingWeek ? "not-allowed" : "pointer",
                }}
              >
                {isDuplicatingWeek ? "Duplication..." : "✅ Dupliquer"}
              </button>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateWeekStart(null);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#a8a199",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL DUPLICATION D'UNE JOURNÉE ============ */}
      {showDuplicateDayModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151310",
              padding: 30,
              borderRadius: 12,
              maxWidth: 460,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>📅 Dupliquer une journée</h3>
            <p style={{ fontSize: 14, color: "#a8a199", marginBottom: 15 }}>
              Toutes les séances (tous groupes/athlètes confondus) de la date
              source seront recréées à la date cible, en une seule fois.
            </p>
            <label style={{ fontSize: 13, color: "#a8a199", display: "block", marginBottom: 6 }}>
              Date source (le jour à copier)
            </label>
            <input
              type="date"
              value={duplicateDaySource || ""}
              onChange={(e) => setDuplicateDaySource(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(102, 126, 234, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                marginBottom: 14,
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            />
            <label style={{ fontSize: 13, color: "#a8a199", display: "block", marginBottom: 6 }}>
              Date cible (où les copier)
            </label>
            <input
              type="date"
              value={duplicateDayTarget || ""}
              onChange={(e) => setDuplicateDayTarget(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(102, 126, 234, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                marginBottom: 18,
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={duplicateDay}
                disabled={isDuplicatingDay}
                style={{
                  flex: 1,
                  padding: 14,
                  background: isDuplicatingDay ? "#a8a199" : "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: isDuplicatingDay ? "not-allowed" : "pointer",
                }}
              >
                {isDuplicatingDay ? "Duplication..." : "✅ Dupliquer"}
              </button>
              <button
                onClick={() => {
                  setShowDuplicateDayModal(false);
                  setDuplicateDaySource(null);
                  setDuplicateDayTarget(null);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#a8a199",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL DUPLICATION SÉANCE UNIQUE ============ */}
      {showDuplicateSessionModal && sessionToDuplicate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151310",
              padding: 30,
              borderRadius: 12,
              maxWidth: 500,
              width: "100%",
              border: "2px solid #11998e",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#38ef7d" }}>
              📋 Dupliquer la séance
            </h3>
            <div
              style={{
                padding: 15,
                background: "#0d0c0a",
                borderRadius: 8,
                marginBottom: 20,
                borderLeft: "3px solid #e0a13d",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
                {sessionToDuplicate.title}
              </div>
              <div style={{ fontSize: 13, color: "#a8a199" }}>
                Date originale :{" "}
                {new Date(
                  sessionToDuplicate.date + "T12:00:00"
                ).toLocaleDateString("fr-FR")}
              </div>
              <div style={{ fontSize: 13, color: "#a8a199" }}>
                Type :{" "}
                {sessionToDuplicate.type === "sprint"
                  ? "⚡ Sprint"
                  : sessionToDuplicate.type === "endurance"
                  ? "🏃 Endurance"
                  : "💪 Muscu"}
              </div>
            </div>

            <label
              style={{
                display: "block",
                fontSize: 14,
                color: "#a8a199",
                marginBottom: 8,
                fontWeight: "bold",
              }}
            >
              📅 Nouvelle date :
            </label>
            <input
              type="date"
              value={duplicateTargetDate || ""}
              onChange={(e) => setDuplicateTargetDate(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(56, 239, 125, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                marginBottom: 20,
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.border = "2px solid rgba(56, 239, 125, 0.6)";
                e.target.style.boxShadow = "0 0 15px rgba(56, 239, 125, 0.3)";
              }}
              onBlur={(e) => {
                e.target.style.border = "2px solid rgba(56, 239, 125, 0.3)";
                e.target.style.boxShadow = "none";
              }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={duplicateSession}
                disabled={isDuplicatingSession}
                style={{
                  flex: 1,
                  padding: 14,
                  background: isDuplicatingSession ? "#a8a199" : "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: isDuplicatingSession ? "not-allowed" : "pointer",
                }}
              >
                {isDuplicatingSession ? "Duplication..." : "✅ Dupliquer"}
              </button>
              <button
                onClick={() => {
                  setShowDuplicateSessionModal(false);
                  setSessionToDuplicate(null);
                  setDuplicateTargetDate(null);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#a8a199",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ FORMULAIRE CRÉATION/MODIFICATION ============ */}
      {showForm && userRole === "admin" && (
        <div
          style={{
            background: "#151310",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #4fae7d",
            marginBottom: 25,
          }}
        >
          <h3 style={{ margin: "0 0 20px 0", fontSize: 18 }}>
            {isEdit ? "✏️ Modifier séance" : "➕ Nouvelle séance"}
          </h3>

          {/* Type de séance */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              Type de séance
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { value: "muscu", label: "💪 Musculation", color: "#9b59b6" },
                { value: "sprint", label: "⚡ Sprint", color: "#d9695a" },
                { value: "endurance", label: "🏃 Endurance", color: "#4fae7d" },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setWorkoutType(type.value);
                    if (type.value === "muscu") {
                      setBlocks([
                        {
                          name: "Bloc A",
                          restMin: 2,
                          exercises: [
                            {
                              name: "",
                              series: 3,
                              reps: 8,
                              tempo: "2-0-2",
                              restMin: 2,
                              rmPercent: 70,
                              rmName: "",
                            },
                          ],
                        },
                      ]);
                    } else if (type.value === "sprint") {
                      setBlocks([
                        {
                          name: "Bloc A",
                          exercises: [
                            {
                              name: "",
                              distance: 30,
                              recoveryMin: 1,
                              recoverySec: 0,
                              reps: 6,
                              sets: 3,
                              intensity: "Max",
                            },
                          ],
                        },
                      ]);
                    } else {
                      setBlocks([
                        {
                          name: "Bloc A",
                          exercises: [
                            {
                              name: "",
                              vmaPercentage: 85,
                              effortTime: 30,
                              recoveryMin: 0,
                              recoverySec: 30,
                              reps: 10,
                              groundWork: false,
                              blockRecoveryMin: 3,
                              blockRecoverySec: 0,
                            },
                          ],
                        },
                      ]);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    background:
                      workoutType === type.value ? type.color : "#151310",
                    color: "white",
                    border: `2px solid ${type.color}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Force jambes"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 16,
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              Date
            </label>
            <input
              type="date"
              value={getLocalDateStr(formDate)}
              onChange={(e) =>
                setFormDate(new Date(e.target.value + "T12:00:00"))
              }
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(102, 126, 234, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.6)";
                e.target.style.boxShadow = "0 0 15px rgba(102, 126, 234, 0.3)";
              }}
              onBlur={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.3)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              Groupe cible
            </label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid rgba(102, 126, 234, 0.3)",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.6)";
                e.target.style.boxShadow = "0 0 15px rgba(102, 126, 234, 0.3)";
              }}
              onBlur={(e) => {
                e.target.style.border = "2px solid rgba(102, 126, 234, 0.3)";
                e.target.style.boxShadow = "none";
              }}
            >
              <option value="total">Total (tous)</option>
              <option value="moi">🌟 Moi (privé)</option>
              <option value="individuel">Individuel</option>
              {customGroups.length > 0 && (
                <optgroup label="Groupes personnalisés">
                  {customGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      👥 {g.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {group === "individuel" && (
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: "bold",
                }}
              >
                Athlète
              </label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "2px solid rgba(102, 126, 234, 0.3)",
                  background: "#151310",
                  color: "#f3f0ea",
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onFocus={(e) => {
                  e.target.style.border = "2px solid rgba(102, 126, 234, 0.6)";
                  e.target.style.boxShadow = "0 0 15px rgba(102, 126, 234, 0.3)";
                }}
                onBlur={(e) => {
                  e.target.style.border = "2px solid rgba(102, 126, 234, 0.3)";
                  e.target.style.boxShadow = "none";
                }}
              >
                <option value="">-- Choisir --</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName && a.lastName
                      ? `${a.firstName} ${a.lastName}`
                      : a.displayName || a.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Blocs */}
          {blocks.map((block, bIdx) => (
            <div
              key={bIdx}
              ref={(el) => (blockRefs.current[bIdx] = el)}
              style={{
                background: "#0d0c0a",
                padding: 18,
                borderRadius: 10,
                marginBottom: 16,
                border:
                  dragOverBlockIndex === bIdx && dragBlockIndex !== null
                    ? "2px solid #e0a13d"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                opacity: dragBlockIndex === bIdx ? 0.5 : 1,
                transition: "opacity 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <span
                  onPointerDown={startBlockDrag(bIdx)}
                  title="Glisser pour réordonner ce bloc"
                  style={{
                    cursor: "grab",
                    fontSize: 20,
                    color: "#a8a199",
                    padding: "4px 6px",
                    touchAction: "none",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  ⠿
                </span>
                <input
                  type="text"
                  value={block.name}
                  onChange={(e) => updateBlock(bIdx, "name", e.target.value)}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid #2a2620",
                    background: "#151310",
                    color: "#f3f0ea",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                />
                <button
                  onClick={() => toggleBlockCollapsed(bIdx)}
                  title={collapsedBlocks[bIdx] ? "Déplier ce bloc" : "Replier ce bloc"}
                  style={{
                    padding: "6px 10px",
                    background: "#2a2620",
                    color: "#f3f0ea",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {collapsedBlocks[bIdx] ? "▸" : "▾"}
                </button>
                <button
                  onClick={() => removeBlock(bIdx)}
                  style={{
                    padding: "6px 12px",
                    background: "#d9695a",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  🗑️
                </button>
              </div>

              {!collapsedBlocks[bIdx] && workoutType === "muscu" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                    padding: "8px 10px",
                    background: "rgba(224,161,61,0.08)",
                    borderRadius: 6,
                  }}
                >
                  <label style={{ fontSize: 13, color: "#e0a13d", fontWeight: "bold", whiteSpace: "nowrap" }}>
                    ⏱️ Repos après ce bloc (min)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={block.restMin ?? 2}
                    onChange={(e) => updateBlock(bIdx, "restMin", Number(e.target.value))}
                    style={{
                      width: 80,
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid #2a2620",
                      background: "#0d0c0a",
                      color: "#f3f0ea",
                    }}
                  />
                  {block.exercises.length > 1 && (
                    <span style={{ fontSize: 12, color: "#a8a199" }}>
                      Les {block.exercises.length} exercices s'enchaînent sans pause, puis ce repos s'applique une fois.
                    </span>
                  )}
                </div>
              )}

              {collapsedBlocks[bIdx] && (
                <div style={{ fontSize: 13, color: "#a8a199", padding: "4px 2px 8px" }}>
                  {block.exercises.length} exercice{block.exercises.length > 1 ? "s" : ""} —{" "}
                  {block.exercises.map((ex) => ex.name || "sans nom").join(", ") || "vide"}
                </div>
              )}

              {!collapsedBlocks[bIdx] && (
              <>
              {block.exercises.map((ex, eIdx) => (
                <div
                  key={eIdx}
                  style={{
                    background: "#151310",
                    padding: 14,
                    borderRadius: 8,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        placeholder="Nom exercice"
                        value={ex.name}
                        onChange={(e) => {
                          updateExercise(bIdx, eIdx, "name", e.target.value);
                          setOpenSuggestFor(`${bIdx}-${eIdx}`);
                        }}
                        onFocus={() => setOpenSuggestFor(`${bIdx}-${eIdx}`)}
                        onBlur={() => {
                          // Harmonise la casse à la fin de la saisie (pas à
                          // chaque frappe, pour ne pas gêner en tapant).
                          const formatted = formatExerciseDisplayName(ex.name);
                          if (formatted !== ex.name) {
                            updateExercise(bIdx, eIdx, "name", formatted);
                          }
                          setTimeout(() => setOpenSuggestFor(null), 150);
                        }}
                        autoComplete="off"
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 6,
                          border: "1px solid #2a2620",
                          background: "#0d0c0a",
                          color: "#f3f0ea",
                          boxSizing: "border-box",
                        }}
                      />
                      {openSuggestFor === `${bIdx}-${eIdx}` &&
                        getExerciseSuggestions(ex.name).length > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 20,
                              background: "#1a1815",
                              border: "1px solid rgba(255,255,255,0.16)",
                              borderRadius: 8,
                              marginTop: 4,
                              maxHeight: 260,
                              overflowY: "auto",
                              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                            }}
                          >
                            {getExerciseSuggestions(ex.name).map((entry, i) => (
                              <div
                                key={i}
                                onMouseDown={() =>
                                  selectExerciseFromLibrary(bIdx, eIdx, entry)
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 10px",
                                  cursor: "pointer",
                                  borderBottom:
                                    i < getExerciseSuggestions(ex.name).length - 1
                                      ? "1px solid rgba(255,255,255,0.08)"
                                      : "none",
                                }}
                              >
                                {entry.mediaUrl ? (
                                  <img
                                    src={entry.mediaUrl}
                                    alt=""
                                    style={{
                                      width: 32,
                                      height: 32,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                      flexShrink: 0,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 6,
                                      background: "#0d0c0a",
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                                <span
                                  style={{
                                    fontSize: 13,
                                    color: "#f3f0ea",
                                    textTransform: "capitalize",
                                  }}
                                >
                                  {entry.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                    <button
                      onClick={() => removeExercise(bIdx, eIdx)}
                      style={{
                        padding: "8px 12px",
                        background: "#a8a199",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Champ description */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#a8a199", marginBottom: 4, display: "block" }}>
                      Description / Notes
                    </label>
                    <textarea
                      placeholder="Ex: Position des mains, consignes techniques, etc."
                      value={ex.description || ""}
                      onChange={(e) =>
                        updateExercise(bIdx, eIdx, "description", e.target.value)
                      }
                      rows={2}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #2a2620",
                        background: "#0d0c0a",
                        color: "#f3f0ea",
                        fontSize: 13,
                        resize: "vertical",
                      }}
                    />
                  </div>

                  {/* Champ photo/gif de démonstration */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#a8a199", marginBottom: 4, display: "block" }}>
                      📸 Photo / GIF de démonstration
                    </label>
                    {getExerciseMedia(ex)?.mediaUrl ? (
                      <div style={{ position: "relative", marginBottom: 8 }}>
                        <div
                          style={{
                            width: "100%",
                            height: MEDIA_FRAME_HEIGHT,
                            overflow: "hidden",
                            borderRadius: 8,
                            background: "#0d0c0a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <img
                            src={getExerciseMedia(ex)?.mediaUrl}
                            alt="Démo exercice"
                            style={{
                              maxWidth: "100%",
                              maxHeight: "100%",
                              objectFit: "contain",
                              transform: `scale(${
                                (getExerciseMedia(ex)?.mediaZoom || DEFAULT_MEDIA_ZOOM) / 100
                              })`,
                              transition: "transform 0.1s ease-out",
                            }}
                          />
                        </div>
                        <button
                          onClick={() => removeMedia(bIdx, eIdx)}
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            background: "#d9695a",
                            color: "white",
                            border: "none",
                            borderRadius: "50%",
                            width: 30,
                            height: 30,
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          ✕
                        </button>
                        {getExerciseMedia(ex)?.mediaType === "gif" && (
                          <span
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              background: "rgba(0,0,0,0.7)",
                              color: "#f3f0ea",
                              fontSize: 11,
                              fontWeight: "bold",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            GIF animé
                          </span>
                        )}
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 8,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 14 }}>🔍−</span>
                          <input
                            type="range"
                            min={MIN_MEDIA_ZOOM}
                            max={MAX_MEDIA_ZOOM}
                            step={5}
                            value={getExerciseMedia(ex)?.mediaZoom || DEFAULT_MEDIA_ZOOM}
                            onChange={(e) =>
                              setMediaZoom(bIdx, eIdx, Number(e.target.value))
                            }
                            style={{ flex: 1, accentColor: "#e0a13d" }}
                          />
                          <span style={{ fontSize: 14 }}>🔍+</span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#a8a199",
                              minWidth: 40,
                              textAlign: "right",
                            }}
                          >
                            {getExerciseMedia(ex)?.mediaZoom || DEFAULT_MEDIA_ZOOM}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleMediaUpload(bIdx, eIdx, e.target.files[0])
                          }
                          disabled={uploadingMedia[`${bIdx}-${eIdx}`]}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 6,
                            border: "1px dashed #2a2620",
                            background: "#0d0c0a",
                            color: "#f3f0ea",
                            fontSize: 13,
                          }}
                        />
                        <div style={{ fontSize: 11, color: "#a8a199", marginTop: 4 }}>
                          Les GIF sont acceptés et resteront animés (max 800 Ko).
                        </div>
                        {uploadingMedia[`${bIdx}-${eIdx}`] && (
                          <div style={{ fontSize: 12, color: "#d9a441", marginTop: 4 }}>
                            ⏳ Traitement en cours...
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lien vidéo de démonstration (renseigné dans la banque
                      d'exercices, apparaît automatiquement dès que le nom
                      de l'exercice correspond). */}
                  {getExerciseMedia(ex)?.videoUrl && (
                    <div style={{ marginBottom: 10 }}>
                      <a
                        href={getExerciseMedia(ex).videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          background: "rgba(224,161,61,0.12)",
                          color: "#e0a13d",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: "bold",
                          textDecoration: "none",
                        }}
                      >
                        🎬 Voir la vidéo de démonstration
                      </a>
                    </div>
                  )}

                  {/* FORMULAIRE MUSCU */}
                  {workoutType === "muscu" && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Séries
                          </label>
                          <input
                            type="number"
                            value={ex.series}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "series",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Reps
                          </label>
                          <input
                            type="number"
                            value={ex.reps}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "reps",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        {/* Le repos n'est plus réglé par exercice : quand un
                            bloc contient 2+ exercices, ils s'enchaînent sans
                            pause entre eux, et le repos ne vient qu'une fois
                            à la fin du bloc (réglé plus haut, au niveau du
                            bloc). */}
                        <label style={{ fontSize: 12, color: "#a8a199" }}>
                          Tempo
                        </label>
                        <input
                          type="text"
                          value={ex.tempo}
                          onChange={(e) =>
                            updateExercise(
                              bIdx,
                              eIdx,
                              "tempo",
                              e.target.value
                            )
                          }
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #2a2620",
                            background: "#0d0c0a",
                            color: "#f3f0ea",
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        {/* Le champ "Nom RM" a été retiré : le RM utilisé
                            pour calculer le poids cible est désormais
                            toujours celui du nom de l'exercice lui-même
                            (ex.name), qui correspond déjà à la fiche créée
                            automatiquement dans "Mes RM" depuis la banque
                            d'exercices — plus besoin de ressaisir un nom à
                            part. Les anciennes séances qui avaient un "Nom
                            RM" différent du nom de l'exercice continuent de
                            fonctionner (repli sur ex.rmName s'il est
                            présent, voir calculateWeight). */}
                        <label style={{ fontSize: 12, color: "#a8a199" }}>
                          Intensité
                        </label>
                        <select
                          value={ex.rmPercent === "PDC" ? "PDC" : ex.rmPercent || 70}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateExercise(
                              bIdx,
                              eIdx,
                              "rmPercent",
                              val === "PDC" ? "PDC" : Number(val)
                            );
                          }}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #2a2620",
                            background: "#0d0c0a",
                            color: "#f3f0ea",
                          }}
                        >
                          <option value="PDC">PDC (Poids du corps)</option>
                          {[...Array(19)].map((_, i) => {
                            const percent = (i + 1) * 5;
                            return (
                              <option key={percent} value={percent}>
                                {percent}% RM
                              </option>
                            );
                          })}
                          <option value={100}>100% RM</option>
                          <option value={105}>105% RM</option>
                          <option value={110}>110% RM</option>
                          <option value={115}>115% RM</option>
                          <option value={120}>120% RM</option>
                        </select>
                      </div>
                      {/* CALCUL POIDS CIBLE — basé sur ex.rmName s'il existe
                          encore (anciennes séances), sinon directement sur
                          le nom de l'exercice. */}
                      {ex.rmPercent !== "PDC" && (ex.rmName || ex.name) &&
                        ex.rmPercent &&
                        (() => {
                          const lookupName = ex.rmName || ex.name;
                          const normalizedName = normalizeExerciseName(lookupName);
                          const rm = userRM[normalizedName];
                          if (rm) {
                            const targetWeight = Math.round(
                              (rm * ex.rmPercent) / 100
                            );
                            return (
                              <div
                                style={{
                                  padding: 12,
                                  background: "rgba(224,161,61,0.14)",
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: "#f0c98a",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: "bold",
                                    marginBottom: 5,
                                  }}
                                >
                                  📏 Poids cible calculé :
                                </div>
                                <div>
                                  • RM {lookupName} : <strong>{rm} kg</strong>
                                </div>
                                <div>
                                  • {ex.rmPercent}% de {rm} kg ={" "}
                                  <strong>{targetWeight} kg</strong>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div
                                style={{
                                  padding: 12,
                                  background: "rgba(217,164,65,0.14)",
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: "#f0c98a",
                                }}
                              >
                                ⚠️ <strong>RM "{lookupName}" non trouvé</strong>{" "}
                                dans "My RM" (renseigné automatiquement dès
                                qu'une séance avec cet exercice est terminée,
                                ou manuellement par l'athlète)
                              </div>
                            );
                          }
                        })()}
                      {ex.rmPercent === "PDC" && (
                        <div
                          style={{
                            padding: 12,
                            background: "rgba(224,161,61,0.14)",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#f0c98a",
                          }}
                        >
                          💪 <strong>Poids du corps</strong> - Aucun poids additionnel
                        </div>
                      )}
                    </>
                  )}

                  {/* FORMULAIRE SPRINT */}
                  {workoutType === "sprint" && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Distance (m)
                          </label>
                          <input
                            type="number"
                            value={ex.distance}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "distance",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Reps
                          </label>
                          <input
                            type="number"
                            value={ex.reps}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "reps",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Séries
                          </label>
                          <input
                            type="number"
                            value={ex.sets}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "sets",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup (min)
                          </label>
                          <input
                            type="number"
                            value={ex.recoveryMin || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "recoveryMin",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup (sec)
                          </label>
                          <input
                            type="number"
                            value={ex.recoverySec || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "recoverySec",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Intensité
                          </label>
                          <select
                            value={ex.intensity}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "intensity",
                                e.target.value
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          >
                            <option value="Max">Max</option>
                            <option value="95%">95%</option>
                            <option value="90%">90%</option>
                            <option value="Sous-max">Sous-max</option>
                          </select>
                        </div>
                      </div>
                      {/* CALCUL DISTANCE TOTALE */}
                      {ex.distance && ex.reps && ex.sets && (
                        <div
                          style={{
                            padding: 12,
                            background: "rgba(217,105,90,0.14)",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#e8998c",
                          }}
                        >
                          <div style={{ fontWeight: "bold", marginBottom: 5 }}>
                            📏 Calculs automatiques :
                          </div>
                          <div>
                            • Total de sprints :{" "}
                            <strong>{ex.reps * ex.sets}</strong>
                          </div>
                          <div>
                            • Distance totale :{" "}
                            <strong>{ex.distance * ex.reps * ex.sets}m</strong>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* FORMULAIRE ENDURANCE */}
                  {workoutType === "endurance" && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            % VMA
                          </label>
                          <input
                            type="number"
                            value={ex.vmaPercentage}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "vmaPercentage",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Effort (s)
                          </label>
                          <input
                            type="number"
                            value={ex.effortTime}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "effortTime",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup (min)
                          </label>
                          <input
                            type="number"
                            value={ex.recoveryMin || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "recoveryMin",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup (sec)
                          </label>
                          <input
                            type="number"
                            value={ex.recoverySec || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "recoverySec",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr auto",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Reps
                          </label>
                          <input
                            type="number"
                            value={ex.reps}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "reps",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup blocs (min)
                          </label>
                          <input
                            type="number"
                            value={ex.blockRecoveryMin || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "blockRecoveryMin",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#a8a199" }}>
                            Récup blocs (sec)
                          </label>
                          <input
                            type="number"
                            value={ex.blockRecoverySec || 0}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "blockRecoverySec",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#0d0c0a",
                              color: "#f3f0ea",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            background: "#0d0c0a",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={ex.groundWork}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "groundWork",
                                e.target.checked
                              )
                            }
                            style={{ cursor: "pointer" }}
                          />
                          Passage sol
                        </label>
                      </div>
                      {/* CALCUL DISTANCE */}
                      {vma &&
                        ex.vmaPercentage &&
                        ex.effortTime &&
                        ex.reps &&
                        (() => {
                          const vmaMs = (vma * 1000) / 3600;
                          const targetSpeed = vmaMs * (ex.vmaPercentage / 100);
                          let distancePerRep = targetSpeed * ex.effortTime;
                          let totalDistance = distancePerRep * ex.reps;

                          if (ex.groundWork) {
                            totalDistance *= 0.88;
                            distancePerRep *= 0.88;
                          }

                          const paceKmh = targetSpeed * 3.6;
                          const paceMinPerKm = 60 / paceKmh;
                          const paceMin = Math.floor(paceMinPerKm);
                          const paceSec = Math.round(
                            (paceMinPerKm - paceMin) * 60
                          );

                          return (
                            <div
                              style={{
                                padding: 12,
                                background: "rgba(79,174,125,0.14)",
                                borderRadius: 8,
                                fontSize: 13,
                                color: "#9fd4b0",
                              }}
                            >
                              <div
                                style={{ fontWeight: "bold", marginBottom: 5 }}
                              >
                                📏 Calculs automatiques :
                              </div>
                              <div>
                                • Allure :{" "}
                                <strong>{paceKmh.toFixed(1)} km/h</strong> (
                                {paceMin}:{String(paceSec).padStart(2, "0")}/km)
                              </div>
                              <div>
                                • Distance par rep :{" "}
                                <strong>{Math.round(distancePerRep)}m</strong>
                              </div>
                              <div>
                                • Distance totale :{" "}
                                <strong>{Math.round(totalDistance)}m</strong>
                              </div>
                              {ex.groundWork && (
                                <div style={{ color: "#d9a441", marginTop: 5 }}>
                                  ⚠️ Passage au sol : -12% de distance
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      {!vma && (
                        <div
                          style={{
                            padding: 12,
                            background: "rgba(217,164,65,0.14)",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#f0c98a",
                          }}
                        >
                          ⚠️ <strong>Renseigne ta VMA</strong> dans "My RM" pour
                          voir les calculs de distance automatiques
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              <button
                onClick={() => addExercise(bIdx)}
                style={{
                  width: "100%",
                  padding: 10,
                  background: "#e0a13d",
                  color: "#1a1306",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ➕ Ajouter exercice
              </button>
              </>
              )}
            </div>
          ))}

          <button
            onClick={addBlock}
            style={{
              width: "100%",
              padding: 12,
              background: "#d9a441",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: "bold",
              marginBottom: 18,
            }}
          >
            ➕ Ajouter un bloc
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSubmit}
              style={{
                flex: 1,
                padding: 14,
                background: "#4fae7d",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              {isEdit ? "💾 Enregistrer" : "✅ Créer"}
            </button>
            <button
              onClick={resetForm}
              style={{
                flex: 1,
                padding: 14,
                background: "#a8a199",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ============ DÉTAIL SÉANCE ============ */}
      {selectedSession && !showForm && (
        <div
          style={{
            background: "#151310",
            padding: 25,
            borderRadius: 12,
            border: `2px solid ${getColor(selectedSession)}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <div style={{ marginBottom: 6 }}>
                <span
                  style={{
                    background: getColor(selectedSession),
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  {sessionType === "sprint"
                    ? "⚡ SPRINT"
                    : sessionType === "endurance"
                    ? "🏃 ENDURANCE"
                    : "💪 MUSCU"}
                </span>
                {selectedSession.group === "moi" && (
                  <span
                    style={{
                      background: "#d9a441",
                      padding: "4px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: "bold",
                      marginLeft: 8,
                    }}
                  >
                    🌟 PRIVÉ
                  </span>
                )}
              </div>
              <h3 style={{ margin: 0, fontSize: 20 }}>
                {selectedSession.title}
              </h3>
              <div style={{ fontSize: 13, color: "#a8a199", marginTop: 4 }}>
                {new Date(
                  selectedSession.date + "T12:00:00"
                ).toLocaleDateString("fr-FR")}{" "}
                • {selectedSession.estimatedDuration || "?"} min
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {userRole === "admin" && (
                <>
                  <button
                    onClick={() => editSession(selectedSession)}
                    style={{
                      padding: "8px 16px",
                      background: "#e0a13d",
                      color: "#1a1306",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => {
                      setSessionToDuplicate(selectedSession);
                      setDuplicateTargetDate(selectedSession.date);
                      setShowDuplicateSessionModal(true);
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "#4fae7d",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    📋 Dupliquer
                  </button>
                  <button
                    onClick={() => deleteSession(selectedSession.id)}
                    style={{
                      padding: "8px 16px",
                      background: "#d9695a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    🗑️
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedSession(null)}
                style={{
                  padding: "8px 16px",
                  background: "#a8a199",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ← Retour
              </button>
            </div>
          </div>

          {/* Alerte VMA manquante */}
          {sessionType === "endurance" && !vma && (
            <div
              style={{
                background: "rgba(217,164,65,0.14)",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #d9a441",
                marginBottom: 15,
              }}
            >
              <div style={{ fontSize: 13, color: "#f0c98a" }}>
                ⚠️ <strong>VMA non renseignée.</strong> Rends-toi dans "My RM"
                pour ajouter ta VMA.
              </div>
            </div>
          )}

          {/* Contrôles séance - Pour tous (athlètes ET admins) */}
          {(
            <div style={{ marginBottom: 20 }}>
              {isUserSessionCompleted(selectedSession) ? (
                <div
                  style={{
                    padding: 14,
                    background: "rgba(79,174,125,0.14)",
                    borderRadius: 10,
                    textAlign: "center",
                    color: "#4fae7d",
                    fontWeight: "bold",
                    fontSize: 16,
                  }}
                >
                  ✅ Séance complétée –{" "}
                  {new Date(getUserProgress(selectedSession)?.completedAt).toLocaleString(
                    "fr-FR"
                  )}
                </div>
              ) : isUserSessionInProgress(selectedSession) ? (
                <>
                  <div
                    style={{
                      padding: 12,
                      background: "rgba(79,174,125,0.14)",
                      borderRadius: 10,
                      textAlign: "center",
                      color: "#4fae7d",
                      fontWeight: "bold",
                      marginBottom: 10,
                    }}
                  >
                    ⏱️ En cours –{" "}
                    {Math.floor(
                      (new Date() - new Date(sessionStartTime)) / 60000
                    )}{" "}
                    min
                  </div>
                  <button
                    onClick={endSession}
                    style={{
                      width: "100%",
                      padding: 16,
                      background: "#d9695a",
                      color: "white",
                      border: "none",
                      borderRadius: 12,
                      fontSize: 18,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ⏹️ Terminer la séance
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startSession(selectedSession)}
                  style={{
                    width: "100%",
                    padding: 16,
                    background: "#4fae7d",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  ▶️ Démarrer la séance
                </button>
              )}
            </div>
          )}

          {/* Blocs exercices */}
          {selectedSession.blocks?.map((block, bIdx) => (
            <div
              key={bIdx}
              style={{
                background: "#0d0c0a",
                padding: 18,
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              <h4
                style={{
                  margin: "0 0 12px 0",
                  fontSize: 17,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {block.name}
                {sessionType === "muscu" && (
                  <span style={{ fontSize: 13, color: "#e0a13d", fontWeight: "normal" }}>
                    ⏱️ Repos après le bloc : {block.restMin ?? block.exercises?.[0]?.restMin ?? 2} min
                    {block.exercises?.length > 1 && " (exercices enchaînés sans pause)"}
                  </span>
                )}
              </h4>
              {block.exercises.map((ex, eIdx) => {
                const key = `${bIdx}-${eIdx}`;
                const userFeedback = getUserFeedback(selectedSession);
                const fb =
                  sessionFeedback[key] || userFeedback?.[key];

                return (
                  <div
                    key={eIdx}
                    style={{
                      background: "#151310",
                      padding: 15,
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <h5 style={{ margin: "0 0 8px 0", fontSize: 16 }}>
                      {ex.name}
                    </h5>
                    
                    {/* Description si présente */}
                    {ex.description && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#a8a199",
                          marginBottom: 8,
                          fontStyle: "italic",
                          padding: 8,
                          background: "#0d0c0a",
                          borderRadius: 6,
                          borderLeft: "3px solid #e0a13d",
                        }}
                      >
                        📝 {ex.description}
                      </div>
                    )}

                    {/* Photo/gif de démonstration si présente (résolue par nom
                        d'exercice depuis la bibliothèque partagée) */}
                    {getExerciseMedia(ex)?.mediaUrl && (
                      <div style={{ marginBottom: 10, position: "relative" }}>
                        <div
                          style={{
                            width: "100%",
                            height: MEDIA_FRAME_HEIGHT,
                            overflow: "hidden",
                            borderRadius: 8,
                            background: "#0d0c0a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <img
                            src={getExerciseMedia(ex)?.mediaUrl}
                            alt={ex.name}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "100%",
                              objectFit: "contain",
                              transform: `scale(${
                                (getExerciseMedia(ex)?.mediaZoom || DEFAULT_MEDIA_ZOOM) / 100
                              })`,
                            }}
                          />
                        </div>
                        {getExerciseMedia(ex)?.mediaType === "gif" && (
                          <span
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              background: "rgba(0,0,0,0.7)",
                              color: "#f3f0ea",
                              fontSize: 11,
                              fontWeight: "bold",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            GIF animé
                          </span>
                        )}
                      </div>
                    )}

                    {/* Lien vidéo de démonstration si présent */}
                    {getExerciseMedia(ex)?.videoUrl && (
                      <div style={{ marginBottom: 10 }}>
                        <a
                          href={getExerciseMedia(ex).videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 12px",
                            background: "rgba(224,161,61,0.12)",
                            color: "#e0a13d",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: "bold",
                            textDecoration: "none",
                          }}
                        >
                          🎬 Voir la vidéo de démonstration
                        </a>
                      </div>
                    )}

                    {/* AFFICHAGE MUSCU */}
                    {sessionType === "muscu" && (
                      <>
                        <div
                          style={{
                            fontSize: 14,
                            color: "#a8a199",
                            marginBottom: 10,
                          }}
                        >
                          {ex.series} × {ex.reps} @{" "}
                          {ex.rmPercent === "PDC" ? (
                            <strong style={{ color: "#e0a13d" }}>PDC</strong>
                          ) : (
                            <>
                              {ex.rmPercent}% ({calculateWeight(ex.rmName || ex.name, ex.rmPercent)} kg)
                            </>
                          )}
                          {" • "}
                          Tempo: {ex.tempo}
                        </div>
                        {fb && (() => {
                          const normalized = normalizeFeedback(fb);
                          const isCMJEx = isCMJ(ex.name);
                          return (
                            <div
                              style={{
                                padding: 10,
                                background: "rgba(79,174,125,0.14)",
                                borderRadius: 8,
                                marginBottom: 10,
                                border: "1px solid #4fae7d",
                              }}
                            >
                              {normalized && normalized.series && normalized.series.map((serie, sIdx) => (
                                <div key={sIdx} style={{ fontSize: 13, marginBottom: sIdx < normalized.series.length - 1 ? 6 : 0 }}>
                                  <strong>Série {serie.set || (sIdx + 1)}:</strong>{" "}
                                  {isCMJEx ? (
                                    <>
                                      <strong>Hauteur:</strong> {serie.actualWeight} cm
                                    </>
                                  ) : (
                                    <>
                                      <strong>Charge:</strong> {serie.actualWeight} kg
                                    </>
                                  )}
                                  {" • "}
                                  <strong>Reps:</strong> {serie.actualReps} •{" "}
                                  <strong>RPE:</strong> {serie.rpe}/10
                                </div>
                              ))}
                              {normalized && normalized.notes && (
                                <div style={{ fontSize: 12, color: "#9fd4b0", marginTop: 8, fontStyle: "italic" }}>
                                  📝 {normalized.notes}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* AFFICHAGE SPRINT */}
                    {sessionType === "sprint" && (
                      <>
                        <div
                          style={{
                            fontSize: 14,
                            color: "#a8a199",
                            marginBottom: 10,
                          }}
                        >
                          {ex.distance}m × {ex.reps} reps × {ex.sets} séries ={" "}
                          <strong>{ex.distance * ex.reps * ex.sets}m</strong> •
                          Récup: {(() => {
                            const min = ex.recoveryMin || 0;
                            const sec = ex.recoverySec || 0;
                            if (min > 0 && sec > 0) return `${min}min${sec}`;
                            if (min > 0) return `${min}min`;
                            if (sec > 0) return `${sec}sec`;
                            return "0sec";
                          })()} • Intensité: {ex.intensity}
                        </div>
                        {fb && (
                          <div
                            style={{
                              padding: 10,
                              background: "rgba(217,105,90,0.14)",
                              borderRadius: 8,
                              marginBottom: 10,
                              border: "1px solid #d9695a",
                            }}
                          >
                            <div style={{ fontSize: 13 }}>
                              <strong>Distance réelle :</strong>{" "}
                              {fb.actualDistance}m • <strong>RPE :</strong>{" "}
                              {fb.rpe}/10
                              {fb.notes && (
                                <div style={{ marginTop: 5, color: "#e8998c" }}>
                                  {fb.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* AFFICHAGE ENDURANCE */}
                    {sessionType === "endurance" && (
                      <>
                        {vma ? (
                          <>
                            {(() => {
                              const metrics = calculateEnduranceMetrics(ex);
                              return (
                                <>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      color: "#a8a199",
                                      marginBottom: 10,
                                    }}
                                  >
                                    {ex.vmaPercentage}% VMA →{" "}
                                    <strong>{metrics.paceKmh} km/h</strong> (
                                    {metrics.paceDisplay}) •{ex.effortTime}s/
                                    {(() => {
                                      const min = ex.recoveryMin || 0;
                                      const sec = ex.recoverySec || 0;
                                      if (min > 0 && sec > 0) return `${min}min${sec}`;
                                      if (min > 0) return `${min}min`;
                                      if (sec > 0) return `${sec}sec`;
                                      return "0sec";
                                    })()} × {ex.reps} reps
                                    {(ex.blockRecoveryMin > 0 || ex.blockRecoverySec > 0) && (
                                      <span>
                                        {" "}
                                        • Récup blocs:{" "}
                                        <strong>
                                          {(() => {
                                            const min = ex.blockRecoveryMin || 0;
                                            const sec = ex.blockRecoverySec || 0;
                                            if (min > 0 && sec > 0) return `${min}min${sec}`;
                                            if (min > 0) return `${min}min`;
                                            if (sec > 0) return `${sec}sec`;
                                            return "0sec";
                                          })()}
                                        </strong>
                                      </span>
                                    )}{" "}
                                    • Distance/rep:{" "}
                                    <strong>{metrics.distancePerRep}m</strong>
                                    {" "}• Distance totale:{" "}
                                    <strong>{metrics.totalDistance}m</strong>
                                    {ex.groundWork && (
                                      <span style={{ color: "#d9a441" }}>
                                        {" "}
                                        • Passage sol
                                      </span>
                                    )}
                                  </div>
                                  {fb && (
                                    <div
                                      style={{
                                        padding: 10,
                                        background: "rgba(79,174,125,0.14)",
                                        borderRadius: 8,
                                        marginBottom: 10,
                                        border: "1px solid #4fae7d",
                                      }}
                                    >
                                      <div style={{ fontSize: 13 }}>
                                        <strong>Distance réelle :</strong>{" "}
                                        {fb.actualDistance}m •{" "}
                                        <strong>RPE :</strong> {fb.rpe}/10
                                        {fb.notes && (
                                          <div
                                            style={{
                                              marginTop: 5,
                                              color: "#9fd4b0",
                                            }}
                                          >
                                            {fb.notes}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        ) : (
                          <div
                            style={{
                              padding: 10,
                              background: "rgba(217,164,65,0.14)",
                              borderRadius: 8,
                              fontSize: 13,
                              color: "#f0c98a",
                            }}
                          >
                            ⚠️ VMA non renseignée
                          </div>
                        )}
                      </>
                    )}

                    {/* Bouton feedback - Pour tous (athlètes ET admins) */}
                    {(
                      <button
                        onClick={() =>
                          openFeedbackModal(bIdx, eIdx, ex, sessionType)
                        }
                        disabled={
                          !isUserSessionInProgress(selectedSession) && !isUserSessionCompleted(selectedSession)
                        }
                        style={{
                          width: "100%",
                          padding: "10px 16px",
                          background: fb ? "#e0a13d" : "#4fae7d",
                          color: "white",
                          border: "none",
                          borderRadius: 8,
                          cursor:
                            isUserSessionInProgress(selectedSession) || isUserSessionCompleted(selectedSession)
                              ? "pointer"
                              : "not-allowed",
                          opacity:
                            isUserSessionInProgress(selectedSession) || isUserSessionCompleted(selectedSession)
                              ? 1
                              : 0.5,
                          fontSize: 14,
                        }}
                      >
                        {fb ? "✏️ Modifier feedback" : "➕ Donner feedback"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ============ FILTRES PAR ATHLÈTE / PAR GROUPE (ADMIN) ============
          Filtrent le calendrier MENSUEL lui-même (pas une vue séparée) : le
          mois entier reste affiché, seules les séances visibles par
          l'athlète ou le groupe choisi sont montrées dans chaque jour.
          Mutuellement exclusifs. "Tous les athlètes" / "Tous les groupes"
          redonnent instantanément le calendrier complet — rien n'est jamais
          perdu. */}
      {isAdminLike && !showForm && !selectedSession && (
        <div
          style={{
            background: "#151310",
            padding: window.innerWidth <= 768 ? "12px" : "16px 18px",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <label style={{ fontSize: 14, fontWeight: "bold", whiteSpace: "nowrap" }}>
              👤 Filtrer par athlète
            </label>
            <select
              value={athleteFilterId}
              onChange={(e) => {
                setAthleteFilterId(e.target.value);
                if (e.target.value) setGroupFilterId("");
              }}
              style={{
                flex: "1 1 220px",
                padding: 10,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
              }}
            >
              <option value="">Tous les athlètes</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {getAthleteDisplayName(a)}
                </option>
              ))}
            </select>
            {athleteFilterId && (
              <button
                onClick={() => setAthleteFilterId("")}
                style={{
                  padding: "8px 14px",
                  background: "rgba(255,255,255,0.1)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: 14, fontWeight: "bold", whiteSpace: "nowrap" }}>
              🏷️ Filtrer par groupe
            </label>
            <select
              value={groupFilterId}
              onChange={(e) => {
                setGroupFilterId(e.target.value);
                if (e.target.value) setAthleteFilterId("");
              }}
              style={{
                flex: "1 1 220px",
                padding: 10,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
              }}
            >
              <option value="">Tous les groupes</option>
              {customGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {groupFilterId && (
              <button
                onClick={() => setGroupFilterId("")}
                style={{
                  padding: "8px 14px",
                  background: "rgba(255,255,255,0.1)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {(athleteFilterId || groupFilterId) && (
            <p style={{ fontSize: 12, color: "#6f685f", margin: "10px 0 0 0" }}>
              💡 Le calendrier ci-dessous n'affiche que les séances vues par{" "}
              {filterAthlete ? "cet athlète" : "ce groupe"}. Une séance créée
              depuis ce filtre cible{" "}
              {filterAthlete ? "cet athlète seul" : "ce groupe"} par défaut —
              change le ciblage dans le formulaire si besoin.
            </p>
          )}
        </div>
      )}

      {/* ============ CALENDRIER MENSUEL ============ */}
      {!showForm && !selectedSession && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              background: "#151310",
              padding: window.innerWidth <= 768 ? "8px 12px" : "10px 18px",
              borderRadius: 8,
            }}
          >
            <button
              onClick={() => {
                const d = new Date(currentMonth);
                d.setMonth(d.getMonth() - 1);
                setCurrentMonth(d);
              }}
              style={{
                padding: window.innerWidth <= 768 ? "4px 10px" : "6px 16px",
                background: "rgba(255,255,255,0.16)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: window.innerWidth <= 768 ? 16 : 18,
              }}
            >
              ←
            </button>
            <h3
              style={{ 
                margin: 0, 
                fontSize: window.innerWidth <= 768 ? 16 : 20, 
                textTransform: "capitalize" 
              }}
            >
              {currentMonth.toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              onClick={() => {
                const d = new Date(currentMonth);
                d.setMonth(d.getMonth() + 1);
                setCurrentMonth(d);
              }}
              style={{
                padding: window.innerWidth <= 768 ? "4px 10px" : "6px 16px",
                background: "rgba(255,255,255,0.16)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: window.innerWidth <= 768 ? 16 : 18,
              }}
            >
              →
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: window.innerWidth <= 768 ? 1 : 5,
              marginBottom: 6,
            }}
          >
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: window.innerWidth <= 768 ? 9 : 12,
                  color: "#a8a199",
                  fontWeight: "bold",
                  paddingBottom: 4,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gridAutoRows: window.innerWidth <= 768 ? "70px" : "90px",  // Force la hauteur des lignes
              gap: window.innerWidth <= 768 ? 1 : 5,
              marginBottom: 25,
              alignItems: "stretch",  // Force les cellules à s'étirer
            }}
          >
            {renderCalendar()}
          </div>

          {selectedDate && (
            <div
              style={{
                background: "#151310",
                padding: 20,
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 15,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Séances du{" "}
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                    "fr-FR",
                    { weekday: "long", day: "numeric", month: "long" }
                  )}
                </h3>
                {isAdminLike && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {events.filter((e) => e.date === selectedDate).length > 0 && (
                      <button
                        onClick={() => deleteSessionsForDay(selectedDate)}
                        style={{
                          padding: "8px 12px",
                          background: "rgba(217,105,90,0.14)",
                          color: "#d9695a",
                          border: "1px solid #d9695a",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        🗑️ Supprimer la journée
                      </button>
                    )}
                    <button
                      onClick={() => deleteSessionsForWeek(selectedDate)}
                      style={{
                        padding: "8px 12px",
                        background: "rgba(217,105,90,0.14)",
                        color: "#d9695a",
                        border: "1px solid #d9695a",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      🗑️ Supprimer la semaine
                    </button>
                  </div>
                )}
              </div>
              {events.filter(
                (e) => e.date === selectedDate && isEventVisibleToFilter(e)
              ).length === 0 ? (
                <div style={{ color: "#a8a199", fontSize: 14 }}>
                  {filterAthlete
                    ? "Aucune séance ce jour pour cet athlète"
                    : filterGroup
                    ? "Aucune séance ce jour pour ce groupe"
                    : "Aucune séance ce jour"}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {events
                    .filter(
                      (e) => e.date === selectedDate && isEventVisibleToFilter(e)
                    )
                    .map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        style={{
                          background: "#0d0c0a",
                          padding: 18,
                          borderRadius: 10,
                          border: `2px solid ${getColor(session)}`,
                          cursor: "pointer",
                        }}
                      >
                        <h4 style={{ margin: "0 0 6px 0", fontSize: 16 }}>
                          {session.title}
                        </h4>
                        <div style={{ fontSize: 13, color: "#a8a199" }}>
                          <span
                            style={{
                              color: getColor(session),
                              fontWeight: "bold",
                            }}
                          >
                            {sessionType === "sprint"
                              ? "Sprint"
                              : sessionType === "endurance"
                              ? "Endurance"
                              : "Musculation"}
                          </span>
                          {" • "}
                          {session.estimatedDuration || "?"} min
                          {isUserSessionCompleted(session) && (
                            <span
                              style={{
                                marginLeft: 10,
                                color: "#4fae7d",
                                fontWeight: "bold",
                              }}
                            >
                              ✅ Complétée
                            </span>
                          )}
                          {isUserSessionInProgress(session) && (
                            <span
                              style={{
                                marginLeft: 10,
                                color: "#d9a441",
                                fontWeight: "bold",
                              }}
                            >
                              ⏳ En cours
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ MODAL FEEDBACK ============ */}
      {showFeedbackModal && currentExerciseFeedback && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151310",
              padding: 28,
              borderRadius: 12,
              maxWidth: 480,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              border: "2px solid #4fae7d",
            }}
          >
            <h3 style={{ margin: "0 0 18px 0", fontSize: 18 }}>
              {currentExerciseFeedback.exercise.name}
            </h3>

            {/* FEEDBACK MUSCU */}
            {currentExerciseFeedback.sessionType === "muscu" && (
              <>
                {currentExerciseFeedback.series && currentExerciseFeedback.series.map((serie, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 24,
                      padding: 16,
                      background: "#151310",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.16)"
                    }}
                  >
                    <h4 style={{ 
                      margin: "0 0 14px 0", 
                      fontSize: 16,
                      color: "#4fae7d"
                    }}>
                      Série {idx + 1}
                    </h4>

                    {/* Charge ou Hauteur selon exercice */}
                    <div style={{ marginBottom: 14 }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 14,
                          fontWeight: "bold",
                        }}
                      >
                        {isCMJ(currentExerciseFeedback.exercise.name) 
                          ? "Hauteur de saut (cm)" 
                          : "Charge réelle (kg)"}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={serie.actualWeight}
                        onChange={(e) => {
                          const newSeries = [...currentExerciseFeedback.series];
                          newSeries[idx] = {
                            ...newSeries[idx],
                            actualWeight: e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                          };
                          setCurrentExerciseFeedback({
                            ...currentExerciseFeedback,
                            series: newSeries
                          });
                        }}
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 8,
                          border: "1px solid #2a2620",
                          background: "#0d0c0a",
                          color: "#f3f0ea",
                          fontSize: 16,
                        }}
                      />
                    </div>

                    {/* Répétitions */}
                    <div style={{ marginBottom: 14 }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 14,
                          fontWeight: "bold",
                        }}
                      >
                        Répétitions effectuées
                      </label>
                      <input
                        type="number"
                        value={serie.actualReps}
                        onChange={(e) => {
                          const newSeries = [...currentExerciseFeedback.series];
                          newSeries[idx] = {
                            ...newSeries[idx],
                            actualReps: Number(e.target.value)
                          };
                          setCurrentExerciseFeedback({
                            ...currentExerciseFeedback,
                            series: newSeries
                          });
                        }}
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 8,
                          border: "1px solid #2a2620",
                          background: "#0d0c0a",
                          color: "#f3f0ea",
                          fontSize: 16,
                        }}
                      />
                    </div>

                    {/* RPE par série */}
                    <div style={{ marginBottom: 8 }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 14,
                          fontWeight: "bold",
                        }}
                      >
                        RPE – Échelle Foster (0–10)
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={serie.rpe}
                        onChange={(e) => {
                          const newSeries = [...currentExerciseFeedback.series];
                          newSeries[idx] = {
                            ...newSeries[idx],
                            rpe: Number(e.target.value)
                          };
                          setCurrentExerciseFeedback({
                            ...currentExerciseFeedback,
                            series: newSeries
                          });
                        }}
                        style={{
                          width: "100%",
                          height: 6,
                          borderRadius: 3,
                          outline: "none",
                          background:
                            "linear-gradient(to right, #4fae7d, #d9a441, #d9695a)",
                          WebkitAppearance: "none",
                          appearance: "none",
                          cursor: "pointer",
                        }}
                      />
                      <div style={{ textAlign: "center", marginTop: 6 }}>
                        <span
                          style={{
                            fontSize: 32,
                            fontWeight: "bold",
                            color:
                              serie.rpe <= 4
                                ? "#4fae7d"
                                : serie.rpe <= 6
                                ? "#e0a13d"
                                : serie.rpe <= 8
                                ? "#d9a441"
                                : "#d9695a",
                          }}
                        >
                          {serie.rpe}/10
                        </span>
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 13,
                          color: "#a8a199",
                          marginTop: 2,
                        }}
                      >
                        {getFosterDescription(serie.rpe)}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Notes globales */}
                <div style={{ marginBottom: 18 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: "bold",
                    }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={currentExerciseFeedback.notes || ""}
                    onChange={(e) =>
                      setCurrentExerciseFeedback({
                        ...currentExerciseFeedback,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Notes sur l'exercice..."
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #2a2620",
                      background: "#0d0c0a",
                      color: "#f3f0ea",
                      fontSize: 14,
                      resize: "vertical",
                      minHeight: 80,
                    }}
                  />
                </div>
              </>
            )}

            {/* FEEDBACK SPRINT/ENDURANCE */}
            {(currentExerciseFeedback.sessionType === "sprint" ||
              currentExerciseFeedback.sessionType === "endurance") && (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: "bold",
                    }}
                  >
                    Distance réelle (m)
                  </label>
                  <input
                    type="number"
                    value={currentExerciseFeedback.actualDistance}
                    onChange={(e) =>
                      setCurrentExerciseFeedback({
                        ...currentExerciseFeedback,
                        actualDistance: Number(e.target.value),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #2a2620",
                      background: "#0d0c0a",
                      color: "#f3f0ea",
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: "bold",
                    }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={currentExerciseFeedback.notes || ""}
                    onChange={(e) =>
                      setCurrentExerciseFeedback({
                        ...currentExerciseFeedback,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Observations..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #2a2620",
                      background: "#0d0c0a",
                      color: "#f3f0ea",
                      fontSize: 14,
                      resize: "vertical",
                    }}
                  />
                </div>
              </>
            )}

            {/* RPE (pour sprint/endurance seulement, muscu a RPE par série) */}
            {(currentExerciseFeedback.sessionType === "sprint" ||
              currentExerciseFeedback.sessionType === "endurance") && (
              <div style={{ marginBottom: 22 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  RPE – Échelle Foster (0–10)
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={currentExerciseFeedback.rpe}
                  onChange={(e) =>
                    setCurrentExerciseFeedback({
                      ...currentExerciseFeedback,
                      rpe: Number(e.target.value),
                    })
                  }
                  style={{
                    width: "100%",
                    height: 8,
                    borderRadius: 5,
                    outline: "none",
                    background:
                      "linear-gradient(to right, #4fae7d, #d9a441, #d9695a)",
                    WebkitAppearance: "none",
                    appearance: "none",
                    cursor: "pointer",
                  }}
                />
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <span
                    style={{
                      fontSize: 48,
                      fontWeight: "bold",
                      color:
                        currentExerciseFeedback.rpe <= 4
                          ? "#4fae7d"
                          : currentExerciseFeedback.rpe <= 6
                          ? "#e0a13d"
                          : currentExerciseFeedback.rpe <= 8
                          ? "#d9a441"
                          : "#d9695a",
                    }}
                  >
                    {currentExerciseFeedback.rpe}/10
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 15,
                    color: "#a8a199",
                    marginTop: 4,
                    fontWeight: "bold",
                  }}
                >
                  {getFosterDescription(currentExerciseFeedback.rpe)}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveFeedback}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                ✅ Valider
              </button>
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setCurrentExerciseFeedback(null);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#a8a199",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Style global pour inputs et selects */}
      <style>{`
        /* Force le style des inputs date */
        input[type="date"] {
          color-scheme: dark !important;
        }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 1;
          background-color: #e0a13d;
          border-radius: 6px;
          padding: 4px;
          margin-right: 2px;
        }

        /* Force le style des selects et options */
        select {
          color: #f3f0ea !important;
          background: #151310 !important;
        }
        
        select option {
          background: #151310 !important;
          color: #f3f0ea !important;
          padding: 8px !important;
        }
        
        select option:hover {
          background: #1a1815 !important;
        }
        
        /* Style pour inputs text et number */
        input[type="text"],
        input[type="number"] {
          color: #f3f0ea !important;
          background: #151310 !important;
        }
        
        input[type="text"]::placeholder,
        input[type="number"]::placeholder {
          color: #a8a199 !important;
        }
      `}</style>
    </div>
  );
}
