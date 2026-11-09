import React, { useEffect, useRef, useState } from "react";
import { isDumbbell, perHand } from "../component/dumbbell";
import { e1rmFromSet } from "../component/loadMetrics";
import { isLoadedBodyweight } from "../component/bodyweightLoad";
import { FeedbackList, extractFeedbackExercises } from "../component/ExerciseFeedbackList";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { getWorkoutDocs, getScopedUserDocs, daysAgoStr, WINDOW } from "../component/workoutQueries";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { getTest, computeResult, toStoredResult, sprintVmax } from "../component/testsCalc";
import PersonPicker from "../component/PersonPicker";
import { Page, FoldCard, useFold, CARD_STYLE, CARD_ACCENT_BORDER, PAGE_TITLE, PageHeader, Kpi, KpiGrid } from "../component/ui";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { appConfirm, appAlert as alert } from "../component/appDialog";

// Mêmes catégories que la banque d'exercices (gestionnaire "🔤 Noms
// d'exercices" dans Workout.jsx) — utilisées ici pour filtrer/regrouper.
const EXERCISE_CATEGORIES = [
  { value: "bas_corps", label: "🦵 Bas du corps" },
  { value: "haut_tirage", label: "💪 Haut du corps — Tirage" },
  { value: "haut_pousse", label: "💪 Haut du corps — Poussée" },
  { value: "gainage", label: "🧱 Gainage" },
  { value: "autre", label: "📦 Autre" },
];
// Anciennes fiches catégorisées avant la fusion "Chaîne antérieure" /
// "Chaîne postérieure" en une seule catégorie "Bas du corps".
const normalizeCategoryValue = (value) =>
  value === "bas_anterieure" || value === "bas_posterieure" ? "bas_corps" : value;
const getExerciseCategoryLabel = (value) =>
  EXERCISE_CATEGORIES.find((c) => c.value === normalizeCategoryValue(value))?.label ||
  "📦 Autre";

// Même normalisation que la banque d'exercices (Workout.jsx) : sans accents,
// "/" "\\" "." remplacés par un espace. Sans ça, "épaulé" (Mes RM) et
// "epaule" (banque) étaient deux clés différentes → catégories divergentes.
const normKey = (name) =>
  (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/\\.]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export default function MyRM() {
  const { currentUser, userRole, isSuperAdmin, coachScope } = useAuth();
  const navigate = useNavigate();
  const isAdminLike = userRole === "admin" || isSuperAdmin;
  // Coach : peut consulter / modifier les RM d'un athlète ("" = les siens)
  const [viewUid, setViewUid] = useState("");
  const [rmAthletes, setRmAthletes] = useState([]);
  const [rmAdmins, setRmAdmins] = useState([]);
  const [rmGroups, setRmGroups] = useState([]);
  const [viewMode, setViewMode] = useState("moi"); // moi | admin | athlete
  const [viewGroup, setViewGroup] = useState(""); // "" = tous, "none" = sans groupe, idGroupe, "sg:gid:sid"
  const uid = viewUid || currentUser?.uid;
  // Poids du corps (profil) : RM des tractions = poids du corps + lest saisi
  const [bodyWeight, setBodyWeight] = useState(null);
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid))
      .then((d) => setBodyWeight(Number(d.data()?.weight) || null))
      .catch(() => setBodyWeight(null));
  }, [uid]);
  const setE1rm = (st, exName) =>
    e1rmFromSet(isLoadedBodyweight(exName) && bodyWeight ? (Number(st.weight) || 0) + bodyWeight : st.weight, st.reps, st.rpe);
  // Anti-mélange : si on change d'athlète pendant un chargement, la réponse
  // tardive de l'ancien athlète est ignorée (sinon ses RM s'afficheraient sous
  // le nom du nouveau, et « Modifier » écrirait sur le mauvais compte).
  const uidRef = useRef(uid);
  uidRef.current = uid;
  useEffect(() => {
    if (!isAdminLike) return;
    (async () => {
      try {
        const snap = await getScopedUserDocs();
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRmAthletes(
          all.filter(
            (u) => u.id !== currentUser?.uid && u.role !== "admin" && (!coachScope || coachScope.ownsUser(u))
          )
        );
        // les autres coachs ne sont accessibles qu'au superadmin
        setRmAdmins(all.filter((u) => u.id !== currentUser?.uid && u.role === "admin" && isSuperAdmin));
        try {
          const g = await getDocs(collection(db, "groups"));
          setRmGroups(g.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !coachScope || coachScope.ownsGroup(x)));
        } catch (e) {
          console.warn("Groupes:", e);
        }
      } catch (e) {
        console.warn("Liste athlètes:", e);
      }
    })();
  }, [isAdminLike, currentUser]);

  // États VMA
  const [vma, setVma] = useState(null);
  const [vmaHistory, setVmaHistory] = useState([]);

  // États CMJ
  const [cmj, setCmj] = useState(null);
  const [cmjHistory, setCmjHistory] = useState([]);
  // CMJ détecté automatiquement quand un test CMJ est fait dans une séance
  // (même convention que Dashboard.jsx : hauteur stockée dans
  // series[].actualWeight quand l'exercice s'appelle "CMJ" / "Counter
  // Movement Jump"). Pas besoin de le ressaisir à la main.
  const [sessionCmjEntries, setSessionCmjEntries] = useState([]);
  const [fbEntries, setFbEntries] = useState([]);
  // Feedbacks : 12 derniers mois par défaut (quota gratuit), tout sur demande.
  const [fbAllHistory, setFbAllHistory] = useState(false);

  // États RM
  const [rmHistory, setRmHistory] = useState({});
  const [rmCategories, setRmCategories] = useState({});
  const [rmAutoCreated, setRmAutoCreated] = useState({});
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rmSearchQuery, setRmSearchQuery] = useState("");
  const [bankUni, setBankUni] = useState([]);
  const [showRmSuggest, setShowRmSuggest] = useState(false);
  const [rmCategoryFilter, setRmCategoryFilter] = useState("all");
  const [rmDocIds, setRmDocIds] = useState({}); // nom normalisé -> ids des fiches users/{uid}/rm
  const [bankDocs, setBankDocs] = useState({}); // nom normalisé -> { id, createdBy } (banque exerciseMedia)
  const [reclassMode, setReclassMode] = useState(false);
  const [reclassBusy, setReclassBusy] = useState(null); // nom de l'exo en cours d'enregistrement
  // Temps de sprint saisis ici (enregistrés comme un test « sprint » : visibles dans Tests, Dashboard et normes)
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [sprintVals, setSprintVals] = useState({ t10: "", t20: "", t60: "" });
  const [sprintDate, setSprintDate] = useState(todayIso());
  const [sprintHist, setSprintHist] = useState([]);
  const [allTests, setAllTests] = useState([]); // tous les tests de l'athlète (users/{uid}/tests)
  const [refDoc, setRefDoc] = useState({}); // tests/_reference : VMA / VMI / VC de référence + choix « preferred »
  const [kpiOpen, setKpiOpen] = useState(null); // tuile ouverte : "vmax" | "cmj" | "endu" | null
  const [savingSprint, setSavingSprint] = useState(false);

  // Pour amener le graphique juste sous l'exercice cliqué (plutôt que de
  // laisser l'utilisateur scroller jusqu'en bas de la page pour le voir).
  const detailRef = useRef(null);
  useEffect(() => {
    if (selectedExercise && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedExercise]);

  // Formulaire RM
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRM, setEditingRM] = useState(null);

  // Le formulaire "Modifier" s'ouvre en haut de la page (au-dessus de la
  // liste), loin du bouton "✏️ Modifier" cliqué en bas dans le détail d'un
  // exercice — sans ça, rien ne semblait se passer au clic (le formulaire
  // s'ouvrait bien mais hors écran). On l'amène automatiquement en vue.
  const formRef = useRef(null);
  useEffect(() => {
    if (showAddForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showAddForm]);
  const [exerciseName, setExerciseName] = useState("");
  const [testWeight, setTestWeight] = useState("");
  const [testReps, setTestReps] = useState(1);
  const [calculated1RM, setCalculated1RM] = useState(null);
  const fold = useFold("myrm", ["info"]);

  // Calculer le 1RM théorique (formule d'Epley)
  const calculate1RM = (weight, reps) => {
    if (!weight || !reps) return null;
    const w = Number(weight);
    const r = Number(reps);
    if (r === 1) return w;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  };

  // Mise à jour du calcul en temps réel
  useEffect(() => {
    const rm = calculate1RM(testWeight, testReps);
    setCalculated1RM(rm);
  }, [testWeight, testReps]);

  const loadRM = async () => {
    if (!currentUser) return;
    const loadedFor = uid;

    try {
      const [rmSnap, exerciseMediaSnap] = await Promise.all([
        getDocs(collection(db, "users", uid, "rm")),
        getDocs(collection(db, "exerciseMedia")),
      ]);
      // La banque d'exercices (exerciseMedia) est la source de vérité pour la
      // catégorie — priorité sur la catégorie stockée sur la fiche RM
      // elle-même, qui peut être restée "autre" tant qu'elle n'a pas été
      // resynchronisée (voir bouton admin "Resynchroniser les catégories").
      const catalogCategoryByKey = {};
      setBankUni(exerciseMediaSnap.docs.filter((d) => d.data().unilateral).map((d) => normKey(d.id)));
      const bank = {};
      exerciseMediaSnap.docs.forEach((d) => {
        const cat = d.data().category;
        if (cat) catalogCategoryByKey[normKey(d.id)] = normalizeCategoryValue(cat);
        bank[normKey(d.id)] = { id: d.id, createdBy: d.data().createdBy || null };
      });
      setBankDocs(bank);
      const docIds = {};

      // Séparer VMA, CMJ et RM
      const grouped = {};
      const categories = {};
      const autoCreatedMap = {};
      let vmaData = null;
      let vmaHist = [];
      let cmjData = null;
      let cmjHist = [];

      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = normKey(data.exerciseName || d.id);

        // VMA
        if (name === "vma" || d.id === "VMA") {
          vmaData = data;
          vmaHist = data.history || [];
        }
        // CMJ
        else if (name === "cmj" || d.id === "CMJ") {
          cmjData = data;
          cmjHist = data.history || [];
        } else {
          docIds[name] = [...(docIds[name] || []), d.id];
          // Doublon accentué / non accentué du même exo : on garde la fiche qui a des données.
          if (grouped[name] && grouped[name].length > 0 && (data.kg === null || data.kg === undefined) && !(data.history || []).length) return;
          // RM normaux — l'historique complet (plusieurs points dans le
          // temps) vient du champ "history" ; à défaut (anciennes fiches
          // sans historique, ou fiche jamais testée avec kg:null), on
          // retombe sur un point unique tiré de kg/updatedAt.
          categories[name] =
            catalogCategoryByKey[normKey(d.id)] ||
            catalogCategoryByKey[normKey(data.exerciseName)] ||
            normalizeCategoryValue(data.category) ||
            "autre";
          autoCreatedMap[name] = data.kg === null || data.kg === undefined;
          if (Array.isArray(data.history) && data.history.length > 0) {
            grouped[name] = data.history.map((h) => ({
              date: h.date,
              kg: h.kg,
              autoAdjusted: h.autoAdjusted,
            }));
          } else if (data.kg !== null && data.kg !== undefined) {
            grouped[name] = [
              {
                date: data.updatedAt,
                kg: data.kg,
                originalWeight: data.originalWeight,
                originalReps: data.originalReps,
                autoAdjusted: data.autoAdjusted,
              },
            ];
          } else {
            // Fiche "en attente" (créée automatiquement depuis la banque
            // d'exercices) : pas encore de valeur testée.
            grouped[name] = [];
          }
        }
      });

      // Auto-synchro avec la banque d'exercices : tout exercice catégorisé
      // (hors échauffement / poids du corps) qui n'a pas encore de fiche chez
      // cet utilisateur est ajouté en "attente" (kg: null). Rattrape les
      // exercices marqués après coup, les comptes admin et les nouveaux
      // athlètes, que la diffusion depuis la banque ne touchait pas.
      const existingIds = new Set(rmSnap.docs.map((d) => normKey(d.id)));
      const toCreate = [];
      exerciseMediaSnap.docs.forEach((d) => {
        const m = d.data();
        const key = d.id;
        const lk = key.toLowerCase();
        if (!m.category || m.isWarmup || m.isPDC || m.hidden || key.startsWith("test_")) return;
        if (existingIds.has(normKey(key)) || grouped[lk] || Object.keys(grouped).some((g) => normKey(g) === normKey(key)) || lk === "vma" || lk === "cmj") return;
        toCreate.push({ key, lk, category: normalizeCategoryValue(m.category) || "autre" });
      });
      toCreate.forEach(({ lk, category }) => {
        grouped[lk] = [];
        categories[lk] = category;
        autoCreatedMap[lk] = true;
      });
      if (toCreate.length > 0 && uid === currentUser.uid) {
        Promise.all(
          toCreate.map(({ key, category }) =>
            setDoc(
              doc(db, "users", uid, "rm", key),
              {
                kg: null,
                exerciseName: key,
                category,
                autoCreated: true,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            )
          )
        ).catch((e) => console.warn("Synchro RM (écriture) :", e));
      }

      // Trier par date pour chaque exercice
      Object.keys(grouped).forEach((ex) => {
        grouped[ex].sort((a, b) => new Date(a.date) - new Date(b.date));
      });

      if (uidRef.current !== loadedFor) return;
      setRmHistory(grouped);
      setRmCategories(categories);
      setRmDocIds(docIds);
      setRmAutoCreated(autoCreatedMap);
      setVma(vmaData);
      setVmaHistory(vmaHist);
      setCmj(cmjData);
      setCmjHistory(cmjHist);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    setRmHistory({});
    setFbEntries([]);
    loadRM();
  }, [currentUser, uid]);

  // Arrivée depuis le Dashboard (« Voir tout ») : ouvre le bloc et descend dessus.
  useEffect(() => {
    if (window.location.hash !== "#feedbacks" || fbEntries.length === 0) return;
    if (!fold.isOpen("fbhist")) fold.toggle("fbhist");
    const t = setTimeout(() => {
      const el = document.getElementById("feedbacks");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbEntries.length]);

  const isCMJName = (exerciseName) => {
    if (!exerciseName) return false;
    const name = exerciseName.toLowerCase().trim();
    return name === "cmj" || name.includes("counter movement jump");
  };

  const loadSessionCmj = async () => {
    if (!currentUser) return;
    const loadedFor = uid;
    try {
      const snap = await getWorkoutDocs(fbAllHistory ? {} : { since: daysAgoStr(WINDOW.feedback) });
      if (uidRef.current !== loadedFor) return;
      setFbEntries(
        extractFeedbackExercises(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          uid
        )
      );
      const map = {};
      snap.docs.forEach((docSnap) => {
        const w = docSnap.data();
        const progress = w.userProgress?.[uid];
        if (!progress?.completedAt || !w.blocks) return;
        const feedback = progress.feedback || {};
        w.blocks.forEach((block, bIdx) => {
          (block.exercises || []).forEach((ex, eIdx) => {
            if (!isCMJName(ex.name)) return;
            const fb = feedback[`${bIdx}-${eIdx}`];
            if (!fb || !fb.series) return;
            const heights = fb.series
              .map((s) => Number(s.actualWeight))
              .filter((h) => !Number.isNaN(h) && h > 0);
            if (heights.length === 0) return;
            const best = Math.max(...heights);
            map[w.date] = map[w.date] ? Math.max(map[w.date], best) : best;
          });
        });
      });
      const entries = Object.entries(map)
        .map(([date, heightCm]) => ({ date, heightCm }))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setSessionCmjEntries(entries);
    } catch (e) {
      console.error("Erreur chargement CMJ séances:", e);
    }
  };

  useEffect(() => {
    loadSessionCmj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, uid, fbAllHistory]);

  /* ===================== SPRINT (10 / 20 / 60 m) ===================== */
  const loadSprints = async () => {
    if (!currentUser) return;
    try {
      const snap = await getDocs(collection(db, "users", uid, "tests"));
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRefDoc(raw.find((t) => t.id === "_reference") || {});
      setAllTests(raw.filter((t) => t.id !== "_reference"));
      const all = raw
        .filter((t) => t.testId === "sprint")
        .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
      setSprintHist(all);
    } catch (e) {
      console.error("Erreur chargement sprints:", e);
    }
  };
  useEffect(() => {
    loadSprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, uid]);

  const saveSprint = async () => {
    if (!currentUser) return;
    const clean = {};
    ["t10", "t20", "t60"].forEach((k) => {
      const v = String(sprintVals[k] ?? "").trim().replace(",", ".");
      if (v !== "" && Number(v) > 0) clean[k] = v;
    });
    if (Object.keys(clean).length === 0) return alert("Saisis au moins un temps (10 m, 20 m ou 60 m), en secondes.");
    setSavingSprint(true);
    try {
      const test = getTest("sprint");
      const result = computeResult(test, clean);
      await addDoc(collection(db, "users", uid, "tests"), {
        testId: "sprint",
        group: test.group,
        date: sprintDate || todayIso(),
        values: clean,
        result: toStoredResult(result),
        notes: "",
        createdAt: new Date().toISOString(),
        createdBy: uid,
      });
      setSprintVals({ t10: "", t20: "", t60: "" });
      await loadSprints();
      alert("✅ Temps de sprint enregistrés !");
    } catch (e) {
      console.error("Erreur save sprint:", e);
      alert("❌ Erreur : " + e.message);
    } finally {
      setSavingSprint(false);
    }
  };

  const deleteSprint = async (id) => {
    if (!await appConfirm("Supprimer cette saisie de sprint ?")) return;
    try {
      await deleteDoc(doc(db, "users", uid, "tests", id));
      await loadSprints();
    } catch (e) {
      alert("❌ Erreur : " + e.message);
    }
  };

  /* ===================== RM ===================== */
  const handleSaveRM = async () => {
    if (!currentUser || !exerciseName || !testWeight || !testReps) {
      alert("Remplis tous les champs");
      return;
    }

    const normalizedName = normKey(exerciseName);
    const rm1 = calculate1RM(testWeight, testReps);

    try {
      // Si on modifie et que le nom change, supprimer l'ancien
      if (editingRM && editingRM !== normalizedName) {
        await deleteDoc(doc(db, "users", uid, "rm", editingRM));
      }

      // Relit la fiche existante pour ne jamais écraser son historique (le
      // graphique d'évolution a besoin de tous les points, pas seulement du
      // dernier). Pour la catégorie, la banque d'exercices (gestionnaire
      // "🔤 Noms d'exercices") reste la référence — elle prime sur ce qui
      // était déjà écrit sur la fiche RM.
      const targetRef = doc(db, "users", uid, "rm", normalizedName);
      const [existingSnap, catalogSnap] = await Promise.all([
        getDoc(targetRef),
        getDoc(doc(db, "exerciseMedia", normalizedName)),
      ]);
      const existingData = existingSnap.exists() ? existingSnap.data() : null;
      const catalogCategory = catalogSnap.exists() ? catalogSnap.data().category : null;
      const nowIso = new Date().toISOString();
      const history = [...(existingData?.history || [])];
      history.push({ date: nowIso, kg: rm1, autoAdjusted: false });

      const rmData = {
        exerciseName: normalizedName,
        kg: rm1,
        category: normalizeCategoryValue(catalogCategory) || existingData?.category || "autre",
        originalWeight: Number(testWeight),
        originalReps: Number(testReps),
        updatedAt: nowIso,
        autoAdjusted: false,
        autoCreated: false,
        lastRPE: null,
        history: history.slice(-20),
      };

      await setDoc(targetRef, rmData, { merge: true });

      if (editingRM && editingRM !== normalizedName) {
        alert("Exercice renommé et mis à jour !");
      } else if (editingRM) {
        alert("RM mis à jour !");
      } else {
        alert("RM enregistré !");
      }

      // Reset form
      setExerciseName("");
      setTestWeight("");
      setTestReps(1);
      setCalculated1RM(null);
      setShowAddForm(false);
      setEditingRM(null);
      loadRM();
    } catch (error) {
      console.error("Erreur sauvegarde RM:", error);
      alert("Erreur lors de la sauvegarde");
    }
  };

  /* Reconstruit les fiches RM (valeur + courbe) à partir des retours déjà saisis.
     Pour chaque exercice et chaque séance : médiane des e1RM des séries
     exploitables (≤ 10 reps, RPE ≥ 7). La fiche prend la valeur de la séance
     la plus récente ; les points de la courbe manquants sont ajoutés. Une
     valeur testée à la main (bouton Modifier) n'est jamais écrasée. */
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildFromFeedback = async () => {
    if (!uid || rebuilding) return;
    if (!await appConfirm("Reconstruire les RM à partir de tous les retours de séance ? Les valeurs testées à la main ne sont pas modifiées.")) return;
    setRebuilding(true);
    try {
      const byEx = {};
      fbEntries.forEach((e) => {
        if (/^(cmj|counter movement jump)$/i.test((e.exercise || "").trim())) return;
        if (e.special) return; // excentrique / iso : pas de RM
        const vals = (e.sets || [])
          .filter((st) => st.reps && st.reps <= 10 && st.rpe && st.rpe >= 7)
          .map((st) => setE1rm(st, e.exercise))
          .filter((v) => v !== null)
          .sort((x, y) => x - y);
        if (!vals.length) return;
        const m = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
        const key = normKey(e.exercise);
        (byEx[key] = byEx[key] || []).push({ date: e.date, kg: Math.round(m * 10) / 10, name: e.exercise, n: vals.length });
      });
      let created = 0, updated = 0, kept = 0;
      for (const [key, pts] of Object.entries(byEx)) {
        pts.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
        const ref = doc(db, "users", uid, "rm", key);
        const snap = await getDoc(ref);
        const ex = snap.exists() ? snap.data() : null;
        const manual = ex && ex.kg && ex.autoAdjusted === false && ex.autoCreated === false;
        const hist = [...(ex?.history || [])];
        const haveDays = new Set(hist.map((h) => String(h.date || "").slice(0, 10)));
        pts.forEach((pt) => {
          if (!haveDays.has(pt.date)) hist.push({ date: `${pt.date}T12:00:00.000Z`, kg: pt.kg, autoAdjusted: true, rebuilt: true });
        });
        hist.sort((x, y) => String(x.date).localeCompare(String(y.date)));
        const last = pts[pts.length - 1];
        const base = { history: hist.slice(-20) };
        if (manual) {
          await setDoc(ref, base, { merge: true });
          kept++;
          continue;
        }
        const cat = (await getDoc(doc(db, "exerciseMedia", key))).data()?.category;
        await setDoc(
          ref,
          {
            ...base,
            kg: last.kg,
            exerciseName: key,
            category: normalizeCategoryValue(cat) || ex?.category || "autre",
            updatedAt: new Date().toISOString(),
            autoAdjusted: true,
            autoCreated: false,
            seriesUsedForRM: last.n,
          },
          { merge: true }
        );
        ex && ex.kg ? updated++ : created++;
      }
      alert(`RM reconstruits : ${created} créé(s), ${updated} mis à jour, ${kept} testé(s) à la main conservé(s). Exercices sans série exploitable (plus de 10 reps ou RPE < 7) ignorés.`);
      loadRM();
    } catch (e) {
      console.error("Reconstruction RM:", e);
      alert("Erreur pendant la reconstruction : " + e.message);
    } finally {
      setRebuilding(false);
    }
  };

  /* Remet UN exercice au calcul des retours (corrige un RM faussé) : la valeur
     devient celle de la dernière séance exploitable et la courbe est refaite
     à partir des séances (≤ 10 reps, RPE ≥ 7). Remplace aussi une valeur testée. */
  const resetFromFeedback = async (name) => {
    const key = normKey(name);
    const pts = [];
    fbEntries.forEach((e) => {
      if (normKey(e.exercise) !== key) return;
      if (e.special) return; // excentrique / iso : pas de RM
      const vals = (e.sets || [])
        .filter((st) => st.reps && st.reps <= 10 && st.rpe && st.rpe >= 7)
        .map((st) => setE1rm(st, e.exercise))
        .filter((v) => v !== null)
        .sort((x, y) => x - y);
      if (!vals.length) return;
      const m = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
      pts.push({ date: e.date, kg: Math.round(m * 10) / 10, n: vals.length });
    });
    if (!pts.length) {
      alert("Aucune série exploitable dans les retours (il faut au moins une série à 10 reps maximum avec RPE 7 ou plus).");
      return;
    }
    pts.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
    const last = pts[pts.length - 1];
    if (!await appConfirm(`Remettre « ${name} » à ${last.kg} kg (calculé depuis ${pts.length} séance(s)) ? La valeur actuelle et la courbe seront remplacées.`)) return;
    try {
      await setDoc(
        doc(db, "users", uid, "rm", key),
        {
          exerciseName: key,
          kg: last.kg,
          updatedAt: new Date().toISOString(),
          autoAdjusted: true,
          autoCreated: false,
          seriesUsedForRM: last.n,
          history: pts.slice(-20).map((pt) => ({ date: `${pt.date}T12:00:00.000Z`, kg: pt.kg, autoAdjusted: true, rebuilt: true })),
        },
        { merge: true }
      );
      loadRM();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const handleEditRM = (exerciseName) => {
    const history = rmHistory[exerciseName];
    const latest = history && history.length > 0 ? history[history.length - 1] : null;

    setEditingRM(exerciseName);
    setExerciseName(exerciseName);
    setTestWeight(latest ? latest.originalWeight || latest.kg : "");
    setTestReps(latest ? latest.originalReps || 1 : 1);
    setShowAddForm(true);
  };

  // Suppression obsolète : un exercice ne se supprime plus depuis "Mes RM"
  // (ni pour un athlète, ni pour un admin) — la banque d'exercices est
  // l'unique source : supprimer un exercice de la banque le retire
  // automatiquement de "Mes RM" chez tous les athlètes.

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingRM(null);
    setExerciseName("");
    setTestWeight("");
    setTestReps(1);
    setCalculated1RM(null);
  };

  /* Précision de charge selon le type d'exercice (déduit du nom + du réglage
     « Unilatéral » des séances où l'exo a été fait). */
  const uniKeys = new Set([...fbEntries.filter((e) => e.unilateral).map((e) => normKey(e.exercise)), ...bankUni]);
  const loadNote = (name, kg) => {
    const isDb = /halt[eè]re|dumbbell|\bdb\b/i.test(name || "");
    const isUni = uniKeys.has(normKey(name)) || /unilat|bulgare|1 bras|un bras|single/i.test(name || "");
    if (isUni && isDb) return "Unilatéral : la charge = UN haltère (un côté)";
    if (isUni) return "Unilatéral : la charge = un seul côté";
    if (isDb) {
      const half = kg ? ` ≈ ${Math.round((kg / 2) * 2) / 2} kg par haltère` : "";
      return `Haltères : la charge = total des deux${half}`;
    }
    return null;
  };

  // Fiche en cours de modification = exercice bilatéral aux haltères → saisie par haltère
  const editDb =
    !!editingRM &&
    isDumbbell(editingRM) &&
    !(uniKeys.has(normKey(editingRM)) || /unilat|bulgare|1 bras|un bras|single/i.test(editingRM));

  const rmSuggestions = (() => {
    const q = normKey(rmSearchQuery);
    if (!q) return [];
    return Object.keys(rmHistory)
      .filter((ex) => ex !== "vma" && normKey(ex).includes(q) && normKey(ex) !== q)
      .sort()
      .slice(0, 8);
  })();

  /* ---- Reclasser un exercice (coach) ----
     La banque d'exercices (exerciseMedia) est la source de vérité de la catégorie : on la met à jour,
     puis on resynchronise les fiches RM existantes de la personne affichée et des athlètes du coach
     (même principe que « propagateExerciseToAllAthletes » dans Workout). Règles Firestore : un coach
     ne modifie que les fiches de banque qu'il a créées ; le superadmin, toutes. */
  const setExerciseCategory = async (name, category) => {
    if (!isAdminLike || !name || !category || rmCategories[name] === category) return;
    const b = bankDocs[name];
    const myId = currentUser?.uid;
    if (b && b.createdBy && b.createdBy !== myId && !isSuperAdmin) {
      alert("Exercice commun créé par un autre coach : seul son auteur ou le superadmin peut changer sa catégorie.");
      return;
    }
    const bankId = b?.id || name.trim().replace(/\s+/g, " ");
    const prevCat = rmCategories[name];
    setReclassBusy(name);
    setRmCategories((c) => ({ ...c, [name]: category }));
    try {
      await setDoc(
        doc(db, "exerciseMedia", bankId),
        { category, updatedAt: new Date().toISOString(), ...(b ? {} : { name, createdBy: myId }) },
        { merge: true }
      );
      setBankDocs((m) => ({ ...m, [name]: { id: bankId, createdBy: b?.createdBy || myId } }));
      const ids = Array.from(new Set([...(rmDocIds[name] || []), bankId]));
      // fiches de la personne affichée
      await Promise.all((rmDocIds[name] || []).map((id) => updateDoc(doc(db, "users", uid, "rm", id), { category }).catch(() => null)));
      // fiches des athlètes du coach (sans en créer : la banque les crée déjà au besoin)
      const usersSnap = await getScopedUserDocs();
      const others = usersSnap.docs.map((d) => d.id).filter((id) => id !== uid);
      await Promise.all(
        others.flatMap((u) =>
          ids.map(async (id) => {
            const ref = doc(db, "users", u, "rm", id);
            const snap = await getDoc(ref).catch(() => null);
            if (snap && snap.exists() && snap.data().category !== category) await updateDoc(ref, { category }).catch(() => null);
          })
        )
      );
    } catch (e) {
      setRmCategories((c) => ({ ...c, [name]: prevCat }));
      alert("❌ Catégorie non enregistrée : " + e.message);
    } finally {
      setReclassBusy(null);
    }
  };

  const exercises = Object.keys(rmHistory)
    .filter((ex) => ex !== "vma")
    .filter((ex) =>
      rmCategoryFilter === "all" ? true : rmCategories[ex] === rmCategoryFilter
    )
    .filter((ex) =>
      rmSearchQuery.trim()
        ? normKey(ex).includes(normKey(rmSearchQuery))
        : true
    )
    .sort();

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#f3f0ea",
          background: "#151310",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        title={`💪 ${viewUid ? "RM de l'athlète" : "Mes RM"}`}
        subtitle="Charges maximales estimées, mises à jour à chaque séance"
        actions={
          new URLSearchParams(window.location.search).get("from") === "dashboard" ? (
            <button className="pt-btn" onClick={() => navigate("/dashboard")}>
              ← Retour au dashboard
            </button>
          ) : null
        }
      />

      {isAdminLike && (() => {
        const reset = () => { setSelectedExercise(null); setShowAddForm(false); setEditingRM(null); setRmSearchQuery(""); };
        return (
          <PersonPicker
            mode={viewMode === "athlete" ? "athletes" : viewMode === "admin" ? "admins" : "moi"}
            onMode={(m) => {
              setViewMode(m === "athletes" ? "athlete" : m === "admins" ? "admin" : "moi");
              setViewUid("");
              setViewGroup("");
              reset();
            }}
            athletes={rmAthletes}
            admins={rmAdmins}
            groups={rmGroups}
            selectedId={viewUid}
            onSelect={(id) => {
              setViewUid(id);
              reset();
            }}
            showAdmins={rmAdmins.length > 0}
            note={viewUid ? "tu modifies ses données : chaque changement est enregistré sur son compte." : null}
          />
        );
      })()}

      {(() => {
        const list = Object.keys(rmHistory).filter((ex) => ex !== "vma");
        const lastOf = (ex) => (rmHistory[ex] || [])[rmHistory[ex].length - 1];
        const filled = list.filter((ex) => lastOf(ex) && lastOf(ex).kg != null);
        const nb = (x) => { const v = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };
        const day = (d) => String(d || "").slice(0, 10);
        const fr = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "");
        const r1 = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");

        /* ---- Vmax : un point par séance de sprint (GPS / radar, sinon modèle mono-exponentiel, cf. sprintVmax) ---- */
        const vmaxOf = (t) => sprintVmax(t.values || {});
        const vmaxPts = sprintHist
          .map((t) => ({ t, c: vmaxOf(t) }))
          .filter((x) => x.c && x.c.v < 45)
          .map((x) => ({ date: day(x.t.date), v: x.c.v, how: x.c.how, id: x.t.id }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const vmaxBest = vmaxPts.reduce((m, p) => (!m || p.v > m.v ? p : m), null);

        /* ---- CMJ : tests + fiche CMJ + séances (meilleur saut du jour) ---- */
        const cmjMap = {};
        const addCmj = (d, v, src) => {
          if (!d || !(v > 0)) return;
          if (!cmjMap[d] || v > cmjMap[d].v) cmjMap[d] = { date: d, v, how: src };
        };
        allTests.filter((t) => nb(t.result?.cmj)).forEach((t) => addCmj(day(t.date), nb(t.result.cmj), "test"));
        (cmjHistory || []).forEach((h) => addCmj(day(h.date), nb(h.kg), "saisie"));
        (sessionCmjEntries || []).forEach((h) => addCmj(day(h.date), nb(h.heightCm), "séance"));
        const cmjPts = Object.values(cmjMap).sort((a, b) => a.date.localeCompare(b.date));
        const cmjLast = cmjPts.length ? cmjPts[cmjPts.length - 1] : cmj && nb(cmj.kg) ? { v: nb(cmj.kg) } : null;

        /* ---- Endurance : VMA / VMI / VC (tests + historique VMA) ---- */
        const ENDU = [
          { k: "vma", label: "VMA", long: "Vitesse maximale aérobie" },
          { k: "vmi", label: "VMI", long: "Vitesse intermittente (30-15 IFT)" },
          { k: "cs", label: "VC", long: "Vitesse critique" },
        ];
        const enduPts = (k) => {
          const m = {};
          allTests
            .filter((t) => nb(t.result?.[k]))
            .forEach((t) => {
              const d = day(t.date);
              const name = getTest(t.testId)?.name || t.testId;
              if (!m[d] || nb(t.result[k]) > m[d].v) m[d] = { date: d, v: nb(t.result[k]), how: name };
            });
          if (k === "vma")
            (vmaHistory || []).forEach((h) => {
              const d = day(h.date);
              if (nb(h.kg) && !m[d]) m[d] = { date: d, v: nb(h.kg), how: "fiche VMA" };
            });
          return Object.values(m).sort((a, b) => a.date.localeCompare(b.date));
        };
        const enduAvail = ENDU.filter((e) => refDoc[e.k]?.value || enduPts(e.k).length || (e.k === "vma" && vma));
        const preferred = ENDU.some((e) => e.k === refDoc.preferred) ? refDoc.preferred : enduAvail[0]?.k || "vma";
        const prefDef = ENDU.find((e) => e.k === preferred);
        const prefPts = enduPts(preferred);
        const prefVal = nb(refDoc[preferred]?.value) || (prefPts.length ? prefPts[prefPts.length - 1].v : preferred === "vma" && vma ? nb(vma.kg) : null);
        const setPreferred = async (k) => {
          try {
            await setDoc(doc(db, "users", uid, "tests", "_reference"), { preferred: k, updatedAt: new Date().toISOString() }, { merge: true });
            setRefDoc((r) => ({ ...r, preferred: k }));
          } catch (e) {
            alert("Erreur : " + e.message);
          }
        };

        /* ---- Panneau de détail commun : courbe + historique avec variation ---- */
        const panel = (title, pts, unit, color, extra, decimals = 1) => (
          <div style={{ ...CARD_STYLE, border: `1px solid ${color}66`, marginTop: -6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
              <button className="pt-btn" onClick={() => setKpiOpen(null)}>✕ Fermer</button>
            </div>
            {extra}
            {pts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#a8a199", textAlign: "center", padding: "16px 8px" }}>Pas encore de mesure.</div>
            ) : (
              <>
                {pts.length > 1 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={pts.map((p) => ({ ...p, d: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}` }))} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="d" stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} />
                      <YAxis stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} axisLine={false} width={40} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => Math.round(v)} />
                      <Tooltip
                        contentStyle={{ background: "#151310", border: "1px solid #3a342a", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "#f3f0ea" }}
                        formatter={(v, n, it) => [`${r1(v)} ${unit}`, it?.payload?.how || ""]}
                      />
                      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color, stroke: "#151310", strokeWidth: 1.5 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {pts
                    .slice()
                    .reverse()
                    .map((p, i, arr) => {
                      const prev = arr[i + 1];
                      const d = prev ? p.v - prev.v : null;
                      const pc = prev ? (d / prev.v) * 100 : null;
                      return (
                        <div key={p.date + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "#f3f0ea", fontWeight: 600 }}>{fr(p.date)}</div>
                            <div style={{ fontSize: 11.5, color: "#7d766c" }}>{p.how}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {d !== null && Math.abs(d) >= 0.05 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: d > 0 ? "#4fae7d" : "#d9695a" }}>
                                {d > 0 ? "▲ +" : "▼ "}{r1(d)} ({d > 0 ? "+" : ""}{r1(pc)} %)
                              </span>
                            )}
                            <span style={{ fontSize: 17, fontWeight: 800, color }}>{decimals ? r1(p.v) : Math.round(p.v)} <span style={{ fontSize: 12 }}>{unit}</span></span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        );
        const toggle = (k) => setKpiOpen((o) => (o === k ? null : k));
        return (
          <>
            <KpiGrid>
              <Kpi icon="💪" label="RM enregistrés" value={filled.length} color="#e0a13d" sub={`${list.length - filled.length} en attente d'une séance`} />
              <Kpi
                icon="⚡"
                label="Vmax"
                value={vmaxBest ? `${r1(vmaxBest.v)} km/h` : "—"}
                color={vmaxBest ? "#4a90d9" : "#6f6a62"}
                sub={vmaxBest ? `${vmaxBest.how} · ${fr(vmaxBest.date)} · détail ▾` : "GPS, ou 60 m + 10/20 m · saisir ▾"}
                onClick={() => toggle("vmax")}
                active={kpiOpen === "vmax"}
              />
              <Kpi
                icon="🦘"
                label="CMJ"
                value={cmjLast ? `${r1(cmjLast.v)} cm` : "—"}
                color={cmjLast ? "#e0a13d" : "#6f6a62"}
                sub={cmjPts.length ? `${cmjPts.length} mesure${cmjPts.length > 1 ? "s" : ""} · détail ▾` : "Détente verticale"}
                onClick={() => toggle("cmj")}
                active={kpiOpen === "cmj"}
              />
              <Kpi
                icon="🏃"
                label={prefDef.label}
                value={prefVal ? `${r1(prefVal)} km/h` : "—"}
                color={prefVal ? "#4fae7d" : "#6f6a62"}
                sub={`Référence de tes séances · changer ▾`}
                onClick={() => toggle("endu")}
                active={kpiOpen === "endu"}
              />
            </KpiGrid>

            {kpiOpen === "vmax" &&
              panel(
                "⚡ Évolution de la Vmax",
                vmaxPts,
                "km/h",
                "#4a90d9",
                <>
                  <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 10, lineHeight: 1.5 }}>
                    La vitesse max n'est atteinte qu'entre ≈ 30 et 40 m : un 10 ou un 20 m ne la mesure pas. Vmax retenue : celle du GPS / radar si elle est saisie,
                    sinon estimée par le modèle mono-exponentiel (Samozino et al. 2016) à partir d'un temps ≥ 30 m (ex. 60 m) ET d'un temps court (10 ou 20 m).
                  </div>
                  <div style={{ background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#a8a199", fontWeight: 800, marginBottom: 8 }}>➕ Ajouter des temps</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 110px), 1fr))", gap: 8, alignItems: "end" }}>
                      <div style={{ gridColumn: "1 / -1", maxWidth: 220 }}>
                        <label style={{ fontSize: 11, color: "#a8a199" }}>📅 Date</label>
                        <input type="date" value={sprintDate} onChange={(e) => setSprintDate(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #3a342a", background: "#151310", color: "#f3f0ea", fontSize: 15, boxSizing: "border-box" }} />
                      </div>
                      {[["t10", "10 m", "1.72"], ["t20", "20 m", "3.05"], ["t60", "60 m", "7.90"]].map(([k, l, ph]) => (
                        <div key={k}>
                          <label style={{ fontSize: 11, color: "#a8a199" }}>{l} (s)</label>
                          <input type="text" inputMode="decimal" value={sprintVals[k]} placeholder={`ex : ${ph}`} onChange={(e) => setSprintVals((v) => ({ ...v, [k]: e.target.value }))} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #3a342a", background: "#151310", color: "#f3f0ea", fontSize: 15, boxSizing: "border-box" }} />
                        </div>
                      ))}
                    </div>
                    <button className="pt-btn pt-btn--primary" style={{ marginTop: 10 }} onClick={saveSprint} disabled={savingSprint}>
                      {savingSprint ? "…" : "💾 Enregistrer"}
                    </button>
                  </div>
                  {sprintHist.length > 0 && (
                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ fontSize: 12.5, color: "#e0a13d", cursor: "pointer" }}>⏱️ Tous mes temps ({sprintHist.length})</summary>
                      <div style={{ marginTop: 6 }}>
                        {sprintHist.map((t) => {
                          const c = vmaxOf(t);
                          return (
                            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #1d1a16", fontSize: 12.5 }}>
                              <span>
                                <span style={{ color: "#a8a199" }}>{fr(day(t.date))}</span> ·{" "}
                                {["t5", "t10", "t20", "t60"].filter((k) => t.values?.[k]).map((k) => `${k.slice(1)} m : ${t.values[k]} s`).join(" · ") || "—"}
                                {c ? <span style={{ color: "#4a90d9" }}> → {r1(c.v)} km/h</span> : null}
                              </span>
                              <button onClick={() => deleteSprint(t.id)} style={{ background: "none", border: "none", color: "#d9695a", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </>
              )}

            {kpiOpen === "cmj" &&
              panel(
                "🦘 Évolution du CMJ",
                cmjPts,
                "cm",
                "#e0a13d",
                <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 10 }}>
                  Meilleur saut de chaque jour : tests (onglet Tests), séances où un CMJ a été fait, et saisies manuelles.
                </div>
              )}

            {kpiOpen === "endu" &&
              panel(
                `🏃 Évolution de la ${prefDef.label}`,
                prefPts,
                "km/h",
                "#4fae7d",
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {ENDU.map((e) => {
                      const on = preferred === e.k;
                      const ok = enduAvail.some((x) => x.k === e.k);
                      return (
                        <button
                          key={e.k}
                          type="button"
                          onClick={() => setPreferred(e.k)}
                          title={e.long}
                          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#4fae7d" : "#2a2620"}`, background: on ? "rgba(79,174,125,0.16)" : "#0d0c0a", color: on ? "#4fae7d" : ok ? "#f3f0ea" : "#6f6a62" }}
                        >
                          {on ? "⭐ " : ""}{e.label}
                          {nb(refDoc[e.k]?.value) ? <span style={{ fontWeight: 400, color: "#a8a199" }}> · {r1(nb(refDoc[e.k].value))}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 10, lineHeight: 1.5 }}>
                    ⭐ = référence utilisée par défaut dans tes séances d'endurance : un nouvel exercice sera réglé en « % {prefDef.label} ».
                    {refDoc[preferred]?.testName ? ` Valeur de référence : ${refDoc[preferred].testName} (${fr(day(refDoc[preferred].date))}).` : ""}
                    {!prefPts.length ? " Pas encore de test pour cette référence (onglet Tests)." : ""}
                  </div>
                </>
              )}
          </>
        );
      })()}

      {/* Info */}
      <FoldCard id="info" fold={fold} title="💡 Comment ça fonctionne ?">
        <ul
          style={{ color: "#a8a199", lineHeight: 1.7, margin: 0, fontSize: 13, paddingLeft: 18 }}
        >
          <li>
            Le <strong>1RM théorique</strong> est calculé avec la formule
            d'Epley, à partir des séries proches du maximum (≤6 répétitions,
            RPE≥8)
          </li>
          <li>
            Tes RM se mettent à jour <strong>automatiquement</strong> après
            chaque séance validée, uniquement sur les séries proches du max
            (échauffement et poids du corps exclus)
          </li>
          <li>
            Tu peux modifier ton RM réel à tout moment si tu fais un vrai test
          </li>
          <li>Les ajustements automatiques sont signalés par ⚡</li>
          <li>
            Ta <strong>VMA</strong> (issue des tests faits par ton coach) sert à
            calculer les séances d'endurance
          </li>
        </ul>
      </FoldCard>

      {/* ==================== DERNIERS EXERCICES AVEC FEEDBACK ==================== */}
      <div id="feedbacks">
        <FoldCard
          id="fbhist"
          fold={fold}
          title={`🕘 Mes feedbacks d'exercices (${fbEntries.length})`}
          subtitle="Tous les exercices de tes séances pour lesquels tu as donné un feedback (charge, reps, RPE). Touche une ligne pour voir toutes les séries."
        >
          <FeedbackList entries={fbEntries} mode="all" limit={15} searchable />
          {!fbAllHistory && (
            <button className="pt-btn pt-btn--accent"
              type="button"
              onClick={() => setFbAllHistory(true)}
              style={{ marginTop: 10, minHeight: 40 }}
            >
              🕘 Afficher aussi les feedbacks de plus de 12 mois
            </button>
          )}
        </FoldCard>
      </div>

      {/* ==================== BOUTON AJOUTER RM ==================== */}
      {/* Le bouton "Ajouter un exercice" a été retiré : la liste des
          exercices est désormais entièrement alimentée par la banque
          d'exercices (automatique). Le formulaire ci-dessous ne sert plus
          qu'à enregistrer le 1RM réel d'un exercice déjà présent, via le
          bouton "✏️ Modifier" sur sa fiche — pour remplacer le 1RM
          théorique par la valeur effectivement testée. */}

      {/* ==================== FORMULAIRE RM (édition uniquement) ==================== */}
      {showAddForm && (
        <div
          ref={formRef}
          style={{
            ...CARD_STYLE,
            border: CARD_ACCENT_BORDER,
            scrollMarginTop: 90,
          }}
        >
          <h3 style={{ margin: "0 0 20px 0", fontSize: 18, textTransform: "capitalize" }}>
            ✏️ Modifier — {editingRM}
          </h3>
          {editDb ? (
            <div style={{ fontSize: 13, color: "#e0a13d", margin: "-12px 0 14px" }}>
              ⚖️ Haltères : saisis le poids d'UN haltère. L'app enregistre le total des deux (c'est lui qui sert au RM et aux % de charge).
              {Number(testWeight) > 0 ? ` Ici : 2 × ${perHand(testWeight)} kg = ${Number(testWeight)} kg.` : ""}
            </div>
          ) : loadNote(editingRM, null) && (
            <div style={{ fontSize: 13, color: "#e0a13d", margin: "-12px 0 14px" }}>
              ⚖️ {loadNote(editingRM, null)}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: "#a8a199", margin: "0 0 5px 0" }}>
              💡 Renseigne ici le poids et les répétitions réellement effectués
              pour remplacer le 1RM théorique par ta vraie valeur testée.
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 14,
                color: "#f3f0ea",
                fontWeight: "bold",
              }}
            >
              {editDb ? "Poids PAR HALTÈRE du test (kg)" : "Poids du test (kg)"}
            </label>
            <input
              type="number"
              step="0.5"
              // Haltères (bilatéral) : saisie par haltère, enregistrée en TOTAL (× 2) comme le reste de l'app
              value={editDb && testWeight !== "" && testWeight != null ? perHand(testWeight) : testWeight}
              onChange={(e) => setTestWeight(editDb && e.target.value !== "" ? String(Number(e.target.value) * 2) : e.target.value)}
              placeholder={editDb ? "30" : "100"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 14,
                color: "#f3f0ea",
                fontWeight: "bold",
              }}
            >
              Nombre de répétitions (1-10)
            </label>
            <select
              value={testReps}
              onChange={(e) => setTestReps(Number(e.target.value))}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} rep{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Aperçu */}
          {calculated1RM && (
            <div
              style={{
                background: "rgba(224,161,61,0.14)",
                padding: 20,
                borderRadius: 10,
                border: "2px solid #e0a13d",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, color: "#a8a199", marginBottom: 8 }}>
                1RM THÉORIQUE ESTIMÉ
              </div>
              <div
                style={{ fontSize: 48, fontWeight: "bold", color: "#e0a13d" }}
              >
                {calculated1RM} kg
              </div>
              <div style={{ fontSize: 12, color: "#a8a199", marginTop: 8 }}>
                Basé sur {testWeight} kg × {testReps} rep
                {testReps > 1 ? "s" : ""}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="pt-btn pt-btn--accent"
              onClick={handleSaveRM}
              style={{ flex: 1 }}
            >
              ✅ Enregistrer
            </button>
            <button className="pt-btn"
              onClick={cancelForm}
              style={{ flex: 1 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ==================== RECHERCHE + CATÉGORIES ==================== */}
      {Object.keys(rmHistory).length > 0 && (
        <div style={{ ...CARD_STYLE, padding: 14 }}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="text"
              placeholder="🔍 Rechercher un exercice..."
              value={rmSearchQuery}
              onChange={(e) => { setRmSearchQuery(e.target.value); setShowRmSuggest(true); }}
              onFocus={() => setShowRmSuggest(true)}
              onBlur={() => setTimeout(() => setShowRmSuggest(false), 150)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#1a1815",
                color: "#f3f0ea",
                boxSizing: "border-box",
                fontSize: 16,
              }}
            />
            {showRmSuggest && rmSuggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  background: "#1a1815",
                  border: "1px solid #3a342a",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 260,
                  overflowY: "auto",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                }}
              >
                {rmSuggestions.map((name, i) => (
                  <div
                    key={name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setRmSearchQuery(name);
                      setRmCategoryFilter("all");
                      setSelectedExercise(name);
                      setShowRmSuggest(false);
                    }}
                    style={{
                      padding: "12px 12px",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#f3f0ea",
                      textTransform: "capitalize",
                      borderBottom: i < rmSuggestions.length - 1 ? "1px solid #2a2620" : "none",
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setRmCategoryFilter("all")}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid #2a2620",
                background: rmCategoryFilter === "all" ? "#e0a13d" : "#1a1815",
                color: rmCategoryFilter === "all" ? "#1a1306" : "#f3f0ea",
                fontSize: 12,
                fontWeight: rmCategoryFilter === "all" ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              Toutes
            </button>
            {EXERCISE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setRmCategoryFilter(c.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #2a2620",
                  background: rmCategoryFilter === c.value ? "#e0a13d" : "#1a1815",
                  color: rmCategoryFilter === c.value ? "#1a1306" : "#f3f0ea",
                  fontSize: 12,
                  fontWeight: rmCategoryFilter === c.value ? "bold" : "normal",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </button>
            ))}
            {isAdminLike && (
              <button
                type="button"
                onClick={() => setReclassMode((v) => !v)}
                title="Changer la catégorie des exercices (mise à jour de la banque d'exercices)"
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: `1px solid ${reclassMode ? "#4fae7d" : "#3a342a"}`,
                  background: reclassMode ? "rgba(79,174,125,0.18)" : "transparent",
                  color: reclassMode ? "#4fae7d" : "#a8a199",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                {reclassMode ? "✓ Terminer" : "🏷️ Reclasser"}
              </button>
            )}
          </div>
          {reclassMode && (
            <div style={{ fontSize: 12, color: "#a8a199", marginTop: 8 }}>
              Choisis la catégorie de chaque exercice dans sa fiche ci-dessous. Elle est enregistrée dans la banque d'exercices et
              appliquée aux « Mes RM » de tes athlètes.
            </div>
          )}
        </div>
      )}

      {/* ==================== LISTE DES EXERCICES ==================== */}
      {exercises.length > 0 ? (
        <>
          <FoldCard id="list" fold={fold} title={`📋 Mes exercices (${exercises.length})`}>
            <div style={{ display: "grid", gap: 10 }}>
              {exercises.map((exercise) => {
                const history = rmHistory[exercise];
                const hasData = history.length > 0;
                const latest = hasData ? history[history.length - 1] : null;
                // Progression = dernier test vs test PRÉCÉDENT (pas vs le tout
                // premier), kg arrondis à l'unité.
                const previous = history.length > 1 ? history[history.length - 2] : null;
                const progression = previous
                  ? Math.round(latest.kg) - Math.round(previous.kg)
                  : 0;
                const progressionPercent =
                  previous && previous.kg
                    ? (((latest.kg - previous.kg) / previous.kg) * 100).toFixed(1)
                    : "0";

                return (
                  <div
                    key={exercise}
                    onClick={() => setSelectedExercise(exercise)}
                    style={{
                      background: "#0d0c0a",
                      padding: 14,
                      borderRadius: 10,
                      border: `1px solid ${
                        selectedExercise === exercise ? "#e0a13d" : "rgba(255,255,255,0.08)"
                      }`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      opacity: hasData ? 1 : 0.75,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: "1 1 200px" }}>
                        <h4
                          style={{
                            margin: "0 0 4px 0",
                            fontSize: 16,
                            textTransform: "capitalize",
                          }}
                        >
                          {exercise}
                        </h4>
                        {reclassMode && isAdminLike ? (
                          <select
                            value={normalizeCategoryValue(rmCategories[exercise]) || "autre"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setExerciseCategory(exercise, e.target.value)}
                            disabled={reclassBusy === exercise}
                            style={{ margin: "2px 0 6px", padding: "5px 8px", borderRadius: 8, border: "1px solid #4fae7d88", background: "#0d0c0a", color: "#f3f0ea", fontSize: 12.5 }}
                          >
                            {EXERCISE_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                            {getExerciseCategoryLabel(rmCategories[exercise])}
                            {reclassBusy === exercise ? " · enregistrement…" : ""}
                          </div>
                        )}
                        {loadNote(exercise, hasData ? latest.kg : null) && (
                          <div style={{ fontSize: 11, color: "#e0a13d", marginBottom: 4 }}>
                            ⚖️ {loadNote(exercise, hasData ? latest.kg : null)}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#a8a199" }}>
                          {hasData
                            ? `${history.length} enregistrement${history.length > 1 ? "s" : ""}`
                            : "Pas encore testé"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 20 }}>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#a8a199",
                              marginBottom: 3,
                            }}
                          >
                            RM ACTUEL
                          </div>
                          <div
                            style={{
                              fontSize: hasData ? 20 : 13,
                              fontWeight: "bold",
                              color: hasData ? "#e0a13d" : "#a8a199",
                            }}
                          >
                            {hasData ? `${Math.round(latest.kg)} kg` : "En attente"}
                          </div>
                          {hasData && isDumbbell(exercise) && !(uniKeys.has(normKey(exercise)) || /unilat|bulgare|1 bras|un bras|single/i.test(exercise)) && (
                            <div style={{ fontSize: 11.5, color: "#e0a13d", fontWeight: 700 }}>2 × {perHand(latest.kg)} kg</div>
                          )}
                        </div>

                        {hasData && history.length > 1 && (
                          <div style={{ textAlign: "center" }}>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#a8a199",
                                marginBottom: 3,
                              }}
                            >
                              VS PRÉCÉDENT
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: "bold",
                                color: progression >= 0 ? "#4fae7d" : "#d9695a",
                              }}
                            >
                              {progression >= 0 ? "+" : ""}
                              {progression} kg
                            </div>
                            <div
                              style={{
                                display: "inline-block",
                                marginTop: 4,
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 15,
                                fontWeight: "bold",
                                color:
                                  Number(progressionPercent) === 0
                                    ? "#a8a199"
                                    : progression >= 0
                                    ? "#4fae7d"
                                    : "#d9695a",
                                background:
                                  Number(progressionPercent) === 0
                                    ? "rgba(168,161,153,0.16)"
                                    : progression >= 0
                                    ? "rgba(79,174,125,0.16)"
                                    : "rgba(217,105,90,0.16)",
                              }}
                            >
                              {Number(progressionPercent) === 0
                                ? "= "
                                : Number(progressionPercent) > 0
                                ? "▲ +"
                                : "▼ "}
                              {progressionPercent}%
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </FoldCard>

          {/* ==================== DÉTAILS EXERCICE ==================== */}
          {selectedExercise && rmHistory[selectedExercise] && (
            <div
              ref={detailRef}
              style={{
                ...CARD_STYLE,
                border: CARD_ACCENT_BORDER,
                scrollMarginTop: 90,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    textTransform: "capitalize",
                  }}
                >
                  📊 {selectedExercise}
                </h3>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="pt-btn pt-btn--accent"
                    onClick={() => handleEditRM(selectedExercise)}
                  >
                    ✏️ Modifier
                  </button>
                  {fbEntries.some((e) => normKey(e.exercise) === normKey(selectedExercise)) && (
                    <button className="pt-btn pt-btn--accent"
                      onClick={() => resetFromFeedback(selectedExercise)}
                      title="Recalculer le RM depuis les retours de séance"
                    >
                      🔄 Recalculer
                    </button>
                  )}
                  <button className="pt-btn"
                    onClick={() => setSelectedExercise(null)}
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {isAdminLike && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "-8px 0 18px" }}>
                  <span style={{ fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#a8a199", fontWeight: 700, marginRight: 2 }}>🏷️ Catégorie</span>
                  {EXERCISE_CATEGORIES.map((c) => {
                    const on = (normalizeCategoryValue(rmCategories[selectedExercise]) || "autre") === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        disabled={reclassBusy === selectedExercise}
                        onClick={() => setExerciseCategory(selectedExercise, c.value)}
                        style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#e0a13d" : "#2a2620"}`, background: on ? "rgba(224,161,61,0.18)" : "#0d0c0a", color: on ? "#e0a13d" : "#a8a199" }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                  {reclassBusy === selectedExercise && <span style={{ fontSize: 12, color: "#a8a199" }}>enregistrement…</span>}
                </div>
              )}

              {/* Graphique d'évolution */}
              <div style={{ marginBottom: 25 }}>
                <h4 style={{ fontSize: 16, marginBottom: 15 }}>
                  📈 Évolution du 1RM
                </h4>
                {rmHistory[selectedExercise].length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "#a8a199",
                      fontSize: 14,
                    }}
                  >
                    Pas encore testé — complète une séance avec cet exercice
                    (série proche du max, ≤6 reps, RPE≥8) ou ajoute une valeur
                    toi-même avec "✏️ Modifier".
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={rmHistory[selectedExercise].map((item, index) => ({
                      ...item,
                      index: index + 1,
                      dateShort: new Date(item.date).toLocaleDateString(
                        "fr-FR",
                        { day: "2-digit", month: "2-digit" }
                      ),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={11} />
                    <YAxis
                      stroke="#a8a199"
                      fontSize={11}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#151310",
                        border: "1px solid #3a342a",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      formatter={(value) => [`${Math.round(value)} kg`, "1RM"]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      name="1RM (kg)"
                      stroke="#e0a13d"
                      strokeWidth={3}
                      dot={{ fill: "#e0a13d", r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>

              {/* Historique détaillé */}
              <div>
                <h4 style={{ fontSize: 16, marginBottom: 15 }}>
                  📜 Historique
                </h4>
                <div style={{ display: "grid", gap: 10 }}>
                  {rmHistory[selectedExercise]
                    .slice()
                    .reverse()
                    .map((entry, index, arr) => {
                      // arr est inversé (plus récent d'abord) : le test
                      // précédent dans le temps est l'élément suivant.
                      const prevEntry = arr[index + 1];
                      const pct =
                        prevEntry && prevEntry.kg
                          ? ((entry.kg - prevEntry.kg) / prevEntry.kg) * 100
                          : null;
                      const dKg = prevEntry
                        ? Math.round(entry.kg) - Math.round(prevEntry.kg)
                        : null;
                      return (
                      <div
                        key={index}
                        style={{
                          background: "#0d0c0a",
                          padding: 14,
                          borderRadius: 10,
                          border: "1px solid #2a2620",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                color: "#a8a199",
                                marginBottom: 5,
                              }}
                            >
                              {new Date(entry.date).toLocaleDateString(
                                "fr-FR",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                }
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "#a8a199" }}>
                              Test : {entry.originalWeight} kg ×{" "}
                              {entry.originalReps} reps
                            </div>
                            {entry.autoAdjusted && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#d9a441",
                                  marginTop: 3,
                                }}
                              >
                                ⚡ Ajusté automatiquement (RPE)
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: "bold",
                              color: "#e0a13d",
                            }}
                          >
                            {Math.round(entry.kg)} kg
                            {pct !== null && (
                              <span
                                style={{
                                  marginLeft: 10,
                                  padding: "3px 10px",
                                  borderRadius: 999,
                                  fontSize: 14,
                                  color:
                                    pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                      ? "#a8a199"
                                      : pct > 0
                                      ? "#4fae7d"
                                      : "#d9695a",
                                  background:
                                    pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                      ? "rgba(168,161,153,0.16)"
                                      : pct > 0
                                      ? "rgba(79,174,125,0.16)"
                                      : "rgba(217,105,90,0.16)",
                                }}
                              >
                                {pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                  ? "= "
                                  : pct > 0
                                  ? "▲ +"
                                  : "▼ "}
                                {pct.toFixed(1)}%
                                {dKg !== null && ` (${dKg >= 0 ? "+" : ""}${dKg} kg)`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        !showAddForm && (
          <div
            style={{
              ...CARD_STYLE,
              padding: 32,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 16, margin: "0 0 10px 0" }}>
              Aucun exercice pour l'instant
            </p>
            <p style={{ fontSize: 14, color: "#a8a199", margin: 0 }}>
              Tes exercices apparaîtront ici automatiquement dès qu'un
              coach les ajoute à la banque d'exercices.
            </p>
          </div>
        )
      )}
    </Page>
  );
}
