import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { getWorkoutDocs } from "../component/workoutQueries";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import BodyScan from "../component/BodyScan";
import TestsSummary from "../component/TestsSummary";
import {
  rediRatio,
  rediRatioHistory,
  zScore,
  wellnessZScoreHistory,
  getWellnessZScoreStatus,
  crossRiskStatusFull,
  rpeVariability,
  getRPEReliabilityStatus,
  cmjStatus,
  neuralFatigueAnalysis,
  classifyForm,
  FORM_LEVELS,
} from "../component/loadMetrics";

/* ===== Charte graphique du dashboard athlète (une seule pour toutes les cartes) ===== */
const CARD_STYLE = {
  background: "#151310",
  padding: 20,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
};
const CARD_ACCENT_BORDER = "1px solid rgba(224,161,61,0.55)";
const CARD_TITLE = { margin: "0 0 14px 0", fontSize: 16, fontWeight: 700, color: "#f3f0ea" };
const CHART_TOOLTIP = {
  background: "#1a1815",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
  fontSize: 12,
};

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Retourne les ids des groupes personnalisés (collection "groups") dont fait partie un athlète
// Inclut aussi les cibles de SOUS-GROUPES ("sg:<idGroupe>:<idSousGroupe>"),
// valeur du champ "group" d'une séance qui cible un sous-groupe : sans elles,
// ces séances n'étaient jamais rattachées à l'athlète (ni séance du jour,
// ni feedbacks, ni charge/ACWR).
const getAthleteGroupIds = (athleteId, customGroups) => {
  const ids = [];
  (customGroups || []).forEach((g) => {
    if ((g.athleteIds || []).includes(athleteId)) ids.push(g.id);
    (g.subGroups || []).forEach((sg) => {
      if ((sg.athleteIds || []).includes(athleteId)) ids.push(`sg:${g.id}:${sg.id}`);
    });
  });
  return ids;
};

// Même normalisation que Workout.jsx (voir normalizeExerciseName là-bas) —
// utilisée ici uniquement pour rapprocher le "rmName" d'un exercice de
// séance avec la clé stockée dans users/{uid}/rm (résumé post-séance).
const normalizeExerciseNameLocal = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\.]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

// Mêmes catégories que la banque d'exercices (gestionnaire "🔤 Noms
// d'exercices" dans Workout.jsx) — pour regrouper les graphiques de RM ici.
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

export default function Dashboard() {
  const { currentUser, userRole, userProfile } = useAuth();
  const navigate = useNavigate();

  // Ouvre la séance du jour dans Workout, en lecture ("voir") ou en la
  // démarrant directement ("autostart") — évite à l'athlète de devoir
  // rechercher lui-même sa séance dans le calendrier de la page Séances.
  const goToWorkout = (sessionId, autostart) => {
    const params = new URLSearchParams({ sessionId });
    if (autostart) params.set("autostart", "1");
    navigate(`/workout?${params.toString()}`);
  };

  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customGroups, setCustomGroups] = useState([]);
  const [wellnessFilter, setWellnessFilter] = useState("total");

  // Repli/dépli par partie dans la fiche détail d'un athlète — même
  // mécanisme que le repli des blocs dans la création de séance (Workout) :
  // l'en-tête de chaque partie reste toujours visible, avec un bouton ▾/▸
  // qui replie juste son contenu. Permet de se concentrer sur une seule
  // donnée (ex: juste le CMJ, sans la VMA) sans rien masquer en bloc.
  const [sectionVisibility, setSectionVisibility] = useState({
    cmjSessions: true,
    cross: true,
    todayWorkout: true,
    pain: true,
    redi: true,
    wellness: true,
    weight: true,
    vma: true,
    cmj: true,
  });
  const toggleSection = (key) =>
    setSectionVisibility((prev) => ({ ...prev, [key]: !prev[key] }));

  // Vue "Moi" du coach : il voit SON propre dashboard, exactement comme un
  // athlète le voit (mêmes blocs, mêmes réglages d'affichage).
  const [meMode, setMeMode] = useState(false);
  const viewRole = userRole === "admin" && meMode ? "athlete" : userRole;

  // Blocs du dashboard athlète que chacun peut masquer (réglage mémorisé sur
  // l'appareil, par utilisateur).
  const hiddenStoreKey = `pt_dash_hidden_${currentUser?.uid || "anon"}`;
  const [hiddenDash, setHiddenDash] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`pt_dash_hidden_${currentUser?.uid || "anon"}`) || "[]");
    } catch (e) {
      return [];
    }
  });
  const vis = (k) => !hiddenDash.includes(k);
  const toggleDash = (k) =>
    setHiddenDash((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try {
        localStorage.setItem(hiddenStoreKey, JSON.stringify(next));
      } catch (e) {
        /* stockage indisponible : réglage valable jusqu'au rechargement */
      }
      return next;
    });
  // Repli par carte (même principe que Workout) : le titre reste visible,
  // le bouton ▾/▸ replie le contenu. Mémorisé sur l'appareil.
  const foldBtn = (k) => (
    <button
      onClick={() => toggleDash(k)}
      title={vis(k) ? "Masquer" : "Afficher"}
      style={{ padding: "4px 10px", background: "#2a2620", color: "#f3f0ea", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, flexShrink: 0 }}
    >
      {vis(k) ? "▾" : "▸"}
    </button>
  );
  const foldHead = (k, text) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: vis(k) ? 14 : 0 }}>
      <h3 style={{ ...CARD_TITLE, margin: 0 }}>{text}</h3>
      {foldBtn(k)}
    </div>
  );
  const [rmSearchSelf, setRmSearchSelf] = useState("");
  const [rmOpenCats, setRmOpenCats] = useState({});
  const [rmOpenEx, setRmOpenEx] = useState({});

  const SectionToggleBtn = ({ sectionKey }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      title={sectionVisibility[sectionKey] ? "Replier" : "Déplier"}
      style={{
        padding: "4px 10px",
        background: "#2a2620",
        color: "#f3f0ea",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {sectionVisibility[sectionKey] ? "▾" : "▸"}
    </button>
  );

  const [showAthleteDetail, setShowAthleteDetail] = useState(null);
  const [athleteDetails, setAthleteDetails] = useState(null);
  const [detailedAthleteRMHistory, setDetailedAthleteRMHistory] = useState({});
  const [detailedAthleteRMCategories, setDetailedAthleteRMCategories] = useState({});
  const [acwrHistory, setAcwrHistory] = useState([]);

  const [athleteRMHistory, setAthleteRMHistory] = useState([]);
  // Historique complet par exercice (pour les graphiques d'évolution),
  // séparé de athleteRMHistory ci-dessus qui reste un instantané "dernière
  // valeur" utilisé ailleurs (bannière RM en attente, résumé post-séance).
  const [athleteRMFullHistory, setAthleteRMFullHistory] = useState({});
  const [athleteRMCategoriesMap, setAthleteRMCategoriesMap] = useState({});
  const [athleteVma, setAthleteVmaData] = useState(null);
  const [athleteCmj, setAthleteCmjData] = useState(null);
  const [athleteWeight, setAthleteWeight] = useState("");
  const [editingWeight, setEditingWeight] = useState(false);
  const [todayWellness, setTodayWellness] = useState(null);
  const [wellnessHistory, setWellnessHistory] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);
  // Séances de l'athlète (déjà filtrées par groupe/cible) et aperçu de la
  // semaine en cours — alimentent la mini-frise 7 jours et la sparkline de
  // charge, sans refaire de requête Firestore séparée.
  const [athleteWorkouts, setAthleteWorkouts] = useState([]);
  const [weekOverview, setWeekOverview] = useState([]);
  const [, setSelfCrossStatus] = useState(null);
  const [, setSelfRediRatio] = useState(null);
  const [, setSelfWellnessZ] = useState(null);
  const [, setSelfCmjStatus] = useState(null);
  const [, setSelfRpeReliability] = useState(null);
  const [selfInjuries, setSelfInjuries] = useState([]);
  const [selfPainZone, setSelfPainZone] = useState(null);
  const [painSaveError, setPainSaveError] = useState("");

  // L'athlète corrige sa localisation de douleur directement depuis le
  // dashboard : on met à jour le wellness du jour (champs painMap / painTypes).
  const savePainField = async (field, value) => {
    if (!todayWellness || !todayWellness.id) return;
    const previous = todayWellness[field];
    setTodayWellness((prev) => (prev ? { ...prev, [field]: value } : prev));
    try {
      await updateDoc(doc(db, "wellness", todayWellness.id), { [field]: value, updatedAt: Timestamp.now() });
      setPainSaveError("");
    } catch (e) {
      console.error("Erreur enregistrement douleur:", e);
      setTodayWellness((prev) => (prev ? { ...prev, [field]: previous } : prev));
      setPainSaveError("Impossible d'enregistrer la modification. Réessaie.");
    }
  };
  // Modal historique de blessures (coach) — ouvert en cliquant sur la
  // rubrique dans le détail athlète, édition/suppression sur place.
  const [showInjuryHistory, setShowInjuryHistory] = useState(false);
  const [, setShowRMEvolution] = useState(false);
  const [editingInjury, setEditingInjury] = useState(null);
  const [injuryEditDraft, setInjuryEditDraft] = useState(null);
  // Détail athlète (coach) : recherche d'un exercice pour sa courbe d'évolution
  const [rmSearch, setRmSearch] = useState("");
  const [rmSelected, setRmSelected] = useState(null);
  const [rmListOpen, setRmListOpen] = useState(true);
  // Détail athlète (coach) : séances dépliées dans la liste "Séances & feedbacks"
  const [expandedSessionIds, setExpandedSessionIds] = useState({});
  const [showAllAthleteSessions, setShowAllAthleteSessions] = useState(false);
  const TISSUE_LABELS = {
    muscle: "Muscle",
    tendon: "Tendon",
    ligament: "Ligament",
    os: "Os / articulation",
    autre: "Autre",
  };
  const MECHANISM_LABELS = {
    contact: "Contact / traumatique",
    surcharge: "Surcharge / usure",
    autre: "Autre",
  };
  const [weightHistory, setWeightHistory] = useState([]);
  const [lastWeightDate, setLastWeightDate] = useState(null);
  const [canUpdateWeight, setCanUpdateWeight] = useState(true);

  const [totalSessions, setTotalSessions] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);

  const [athleteSearchQuery, setAthleteSearchQuery] = useState("");

  /* ===================== GROUPES PERSONNALISÉS ===================== */
  useEffect(() => {
    if (!currentUser) return;
    const fetchGroups = async () => {
      try {
        const snap = await getDocs(collection(db, "groups"));
        setCustomGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Erreur chargement groupes:", e);
      }
    };
    fetchGroups();
  }, [currentUser]);

  const getUserProgress = (workout, userId = currentUser?.uid) => {
    if (!workout || !userId) {
      return null;
    }
    const progress = workout.userProgress?.[userId] || null;
    return progress;
  };

  const isWorkoutCompleted = (workout, userId = currentUser?.uid) => {
    const progress = getUserProgress(workout, userId);
    const completed = progress?.completedAt ? true : false;
    return completed;
  };

  const isWorkoutInProgress = (workout, userId = currentUser?.uid) => {
    const progress = getUserProgress(workout, userId);
    const inProgress = progress?.inProgress === true && !progress?.completedAt;
    return inProgress;
  };

  const getUserFeedback = (workout, userId = currentUser?.uid) => {
    const progress = getUserProgress(workout, userId);
    return progress?.feedback || {};
  };

  const calculateWellnessScore = (entry) => {
    if (!entry) return 0;
    const s =
      (entry.sommeil +
        entry.motivation +
        entry.nutrition +
        entry.hydratation +
        (10 - entry.fatigue) +
        (10 - entry.stress) +
        (10 - entry.douleur)) /
      7;
    return Number(s.toFixed(2));
  };

  const getWellnessStatus = (score) => {
    if (score < 5)
      return { label: "Risque de blessure", color: "#d9695a", emoji: "⚠️" };
    if (score < 7.5)
      return { label: "Fatigue fonctionnelle", color: "#d9a441", emoji: "😌" };
    return { label: "En forme", color: "#4fae7d", emoji: "💪" };
  };

  const getACWRStatus = (acwr) => {
    if (!acwr) return { label: "Données insuffisantes", color: "#95a5a6" };
    const v = Number(acwr);
    if (v < 0.8) return { label: "Sous-chargé", color: "#3498db" };
    if (v <= 1.3) return { label: "Optimal", color: "#4fae7d" };
    if (v <= 1.5) return { label: "Attention", color: "#d9a441" };
    return { label: "Surcharge", color: "#d9695a" };
  };

  // Charge d'une séance (sRPE = RPE moyen × durée) — gère les deux formats
  // de feedback (musculation par série / sprint-endurance).
  const calcSessionLoad = (w, userId) => {
    const feedback = getUserFeedback(w, userId);
    if (!feedback || Object.keys(feedback).length === 0) return 0;
    let total = 0,
      count = 0;
    Object.values(feedback).forEach((fb) => {
      if (fb.series && Array.isArray(fb.series)) {
        fb.series.forEach((serie) => {
          if (serie.rpe !== undefined && serie.rpe !== null) {
            total += Number(serie.rpe);
            count++;
          }
        });
      } else if (fb.rpe !== undefined && fb.rpe !== null) {
        total += Number(fb.rpe);
        count++;
      }
    });
    return count > 0 ? (total / count) * (w.estimatedDuration || 60) : 0;
  };

  // Série {date, load} (une entrée par jour, sommée si plusieurs séances) —
  // c'est ce que REDI pondère par décroissance exponentielle. Les jours
  // sans séance sont simplement absents, ce que REDI gère nativement
  // (contrairement à une moyenne brute sur 7/28 jours).
  const buildDailyLoads = (workouts, userId = currentUser?.uid) => {
    if (!workouts || !userId) return [];
    const map = {};
    workouts.forEach((w) => {
      if (!isWorkoutCompleted(w, userId)) return;
      const load = calcSessionLoad(w, userId);
      if (load <= 0) return;
      map[w.date] = (map[w.date] || 0) + load;
    });
    return Object.entries(map).map(([date, load]) => ({ date, load }));
  };

  // RPE moyenne d'une séance (sans la durée) — sert à juger la fiabilité de
  // la déclaration (variance anormalement faible = signal à vérifier),
  // indépendamment de la charge (sRPE) déjà utilisée pour REDI.
  const calcSessionAvgRPE = (w, userId) => {
    const feedback = getUserFeedback(w, userId);
    if (!feedback || Object.keys(feedback).length === 0) return null;
    let total = 0,
      count = 0;
    Object.values(feedback).forEach((fb) => {
      if (fb.series && Array.isArray(fb.series)) {
        fb.series.forEach((serie) => {
          if (serie.rpe !== undefined && serie.rpe !== null) {
            total += Number(serie.rpe);
            count++;
          }
        });
      } else if (fb.rpe !== undefined && fb.rpe !== null) {
        total += Number(fb.rpe);
        count++;
      }
    });
    return count > 0 ? total / count : null;
  };

  // Une RPE moyenne par jour (moyenne des séances si plusieurs le même
  // jour), sur les N dernières séances complétées — alimente
  // rpeVariability() de loadMetrics.js.
  const buildDailyRPE = (workouts, userId = currentUser?.uid, limit = 20) => {
    if (!workouts || !userId) return [];
    const map = {};
    workouts
      .filter((w) => isWorkoutCompleted(w, userId))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach((w) => {
        const rpe = calcSessionAvgRPE(w, userId);
        if (rpe === null) return;
        if (!map[w.date]) map[w.date] = [];
        map[w.date].push(rpe);
      });
    const entries = Object.entries(map)
      .map(([date, rpes]) => ({ date, rpe: rpes.reduce((s, v) => s + v, 0) / rpes.length }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return entries.slice(-limit);
  };

  // Le champ "actualWeight" des séries est réutilisé pour stocker la
  // hauteur de saut (cm) quand l'exercice est un test CMJ (cf. isCMJ() dans
  // Workout.jsx). On extrait ici la meilleure hauteur du jour (le saut le
  // plus haut du test, pratique standard en monitoring CMJ).
  const isCMJName = (exerciseName) => {
    if (!exerciseName) return false;
    const name = exerciseName.toLowerCase().trim();
    return name === "cmj" || name.includes("counter movement jump");
  };

  const extractCMJEntries = (workouts, userId = currentUser?.uid) => {
    if (!workouts || !userId) return [];
    const map = {};
    workouts.forEach((w) => {
      if (!isWorkoutCompleted(w, userId) || !w.blocks) return;
      const feedback = getUserFeedback(w, userId);
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
    return Object.entries(map).map(([date, heightCm]) => ({ date, heightCm }));
  };

  // ACWR historique → remplacé par le ratio REDI (Robust Exponential
  // Decreasing Index), robuste aux séances/feedbacks manquants. On garde
  // le même nom de fonction et la même forme de retour ("acwr" en interne)
  // pour ne pas casser les composants qui les consomment déjà ; seul
  // l'affichage a été renommé en "REDI".
  const calculateACWR = (workouts, userId = currentUser?.uid) => {
    const dailyLoads = buildDailyLoads(workouts, userId);
    if (dailyLoads.length === 0) return null;
    const todayStr = getLocalDateStr(new Date());
    const ratio = rediRatio(dailyLoads, todayStr);
    return ratio === null ? null : ratio.toFixed(2);
  };

  const calculateACWRHistory = (workouts, userId = currentUser?.uid) => {
    const dailyLoads = buildDailyLoads(workouts, userId);
    if (dailyLoads.length === 0) return [];
    return rediRatioHistory(dailyLoads, 90).map((e) => ({
      date: e.date,
      acwr: e.redi,
    }));
  };

  // Séances de musculation terminées → structure attendue par
  // neuralFatigueAnalysis (charge, reps, RPE par série). Les échauffements,
  // exercices sans charge (PDC / élastique) et CMJ sont ignorés.
  const normalizeExerciseKey = (name) =>
    (name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[/\\.]/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const extractStrengthSessions = (workouts, userId) => {
    const out = [];
    (workouts || []).forEach((w) => {
      if ((w.type || "muscu") !== "muscu" || !Array.isArray(w.blocks)) return;
      if (!isWorkoutCompleted(w, userId)) return;
      const fb = getUserFeedback(w, userId);
      if (!fb) return;
      const exercises = [];
      Object.entries(fb).forEach(([key, f]) => {
        const [bIdx, eIdx] = key.split("-").map(Number);
        const block = w.blocks[bIdx];
        const ex = block && block.exercises ? block.exercises[eIdx] : null;
        if (!ex || !f) return;
        if (/échauffement|echauffement|warm.?up|activation/i.test(block.name || "")) return;
        if (ex.rmPercent === "PDC" || ex.rmPercent === "ELASTIQUE") return;
        if (/cmj/i.test(ex.name || "")) return;
        const name = ex.rmName || ex.name;
        if (!name) return;
        const sets = Array.isArray(f.series)
          ? f.series.map((st) => ({ weight: Number(st.actualWeight), reps: Number(st.actualReps), rpe: Number(st.rpe) }))
          : f.actualWeight !== undefined
            ? [{ weight: Number(f.actualWeight), reps: Number(f.actualReps), rpe: Number(f.rpe) }]
            : [];
        if (sets.length > 0) exercises.push({ key: normalizeExerciseKey(name), name, sets });
      });
      if (exercises.length > 0) out.push({ date: w.date, exercises });
    });
    return out;
  };

  const getAthleteName = (a) => {
    if (a.firstName && a.lastName) return `${a.firstName} ${a.lastName}`;
    if (a.displayName) return a.displayName;
    if (a.email) return a.email.split("@")[0];
    return "Athlète";
  };

  /* ==================== NETTOYAGE AUTOMATIQUE (>5 semaines) ==================== */
  // Supprime les séances et wellness plus vieux que 35 jours (5 semaines)
  // pour économiser du stockage Firestore. 35 jours > 28 jours nécessaires
  // au calcul REDI (fenêtre chronique 28j), donc REDI continue de
  // fonctionner normalement.
  const CLEANUP_RETENTION_DAYS = 35;

  const cleanupOldData = async () => {
    try {
      const todayStr = getLocalDateStr(new Date());
      const lastCleanup = localStorage.getItem("performtrack_lastCleanup");
      if (lastCleanup === todayStr) return; // déjà fait aujourd'hui

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - CLEANUP_RETENTION_DAYS);
      const cutoffStr = getLocalDateStr(cutoff);

      const [workoutSnap, wellnessSnap] = await Promise.all([
        getWorkoutDocs(),
        getDocs(collection(db, "wellness")),
      ]);

      const oldWorkoutDocs = workoutSnap.docs.filter(
        (d) => d.data().date && d.data().date < cutoffStr
      );
      const oldWellnessDocs = wellnessSnap.docs.filter(
        (d) => d.data().date && d.data().date < cutoffStr
      );

      const allOldDocs = [...oldWorkoutDocs, ...oldWellnessDocs];

      if (allOldDocs.length === 0) {
        localStorage.setItem("performtrack_lastCleanup", todayStr);
        return;
      }

      // Firestore limite les batchs à 500 opérations, on découpe par sécurité
      const chunkSize = 450;
      for (let i = 0; i < allOldDocs.length; i += chunkSize) {
        const chunk = allOldDocs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
      }

      console.log(
        `🧹 Nettoyage auto : ${allOldDocs.length} document(s) supprimé(s) (> ${CLEANUP_RETENTION_DAYS} jours)`
      );
      localStorage.setItem("performtrack_lastCleanup", todayStr);
    } catch (e) {
      console.error("Erreur nettoyage automatique:", e);
    }
  };

  useEffect(() => {
    if (userRole === "admin" && currentUser) {
      cleanupOldData();
    }
  }, [userRole, currentUser]);

  useEffect(() => {
    if (viewRole !== "athlete" || !currentUser || !userProfile) return;

    // IMPORTANT : chaque section ci-dessous a son propre try/catch, isolée
    // des autres. Avant, tout était dans UN SEUL bloc try/catch : si une
    // section (wellness, poids...) plantait sur une donnée mal formée (ex.
    // un document sans champ "date"), TOUT le reste — y compris la séance
    // du jour, la section la plus visible du Dashboard — n'était jamais
    // calculé, sans aucune erreur visible pour l'athlète ("Pas de séance
    // programmée aujourd'hui" alors qu'une séance individuelle existait
    // bien). La séance du jour est volontairement calculée EN PREMIER,
    // isolée, pour ne plus jamais dépendre du succès des autres sections.
    const load = async () => {
      const today = getLocalDateStr(new Date());

      // --- Séances (séance du jour + stats globales) ---
      let userWorkouts = [];
      try {
        const allWorkouts = (await getWorkoutDocs()).docs.map(
          (d) => ({ id: d.id, ...d.data() })
        );
        const userGrp = userProfile?.group || "total";
        const myGroupIds = getAthleteGroupIds(currentUser.uid, customGroups);

        userWorkouts = allWorkouts.filter((w) => {
          return (
            w.group === "total" ||
            w.group === userGrp ||
            (w.group === "moi" && w.createdBy === currentUser.uid) ||
            w.targetUserId === currentUser.uid ||
            myGroupIds.includes(w.group)
          );
        });

        setAthleteWorkouts(userWorkouts);
        // Taux de complétion = séances RÉALISÉES parmi celles déjà passées
        // (date ≤ aujourd'hui) — les séances futures ne comptent pas dans
        // le dénominateur, sinon le taux baisse mécaniquement pour un
        // programme chargé sur plusieurs mois sans que ça reflète un
        // retard réel.
        const pastOrTodayWorkouts = userWorkouts.filter((w) => w.date <= today);
        setTotalSessions(pastOrTodayWorkouts.length);
        setCompletedSessions(
          pastOrTodayWorkouts.filter((w) => isWorkoutCompleted(w, currentUser.uid)).length
        );

        const todayWorkouts = userWorkouts.filter((w) => w.date === today);
        if (todayWorkouts.length > 0) setTodayWorkout(todayWorkouts[0]);

        // Mini-frise de la semaine en cours (lundi → dimanche) : un statut
        // par jour, pour un coup d'œil rapide sans ouvrir le calendrier.
        const todayDate = new Date(today + "T12:00:00");
        const dow = todayDate.getDay(); // 0 = dimanche
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(todayDate);
        monday.setDate(monday.getDate() + mondayOffset);
        const week = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(d.getDate() + i);
          const dateStr = getLocalDateStr(d);
          const sessionsThatDay = userWorkouts.filter((w) => w.date === dateStr);
          let status = "none"; // aucune séance ce jour-là
          let session = null;
          if (sessionsThatDay.length > 0) {
            session =
              sessionsThatDay.find((w) => isWorkoutCompleted(w, currentUser.uid)) ||
              sessionsThatDay[0];
            if (isWorkoutCompleted(session, currentUser.uid)) status = "done";
            else if (isWorkoutInProgress(session, currentUser.uid)) status = "inProgress";
            else if (dateStr < today) status = "missed";
            else if (dateStr === today) status = "today";
            else status = "upcoming";
          }
          week.push({
            date: dateStr,
            dayLabel: d.toLocaleDateString("fr-FR", { weekday: "short" }),
            dayNum: d.getDate(),
            isToday: dateStr === today,
            status,
            title: session?.title || "",
            sessionId: session?.id || null,
          });
        }
        setWeekOverview(week);
      } catch (e) {
        console.error("Erreur séances (dashboard athlète):", e);
      }

      // --- RM ---
      try {
        const [rmSnap, exerciseMediaSnap] = await Promise.all([
          getDocs(collection(db, "users", currentUser.uid, "rm")),
          getDocs(collection(db, "exerciseMedia")),
        ]);
        // La banque d'exercices (exerciseMedia) est la source de vérité pour
        // la catégorie — priorité sur la catégorie stockée sur la fiche RM
        // elle-même, qui peut être restée "autre" tant qu'elle n'a pas été
        // resynchronisée.
        const catalogCategoryByKey = {};
        exerciseMediaSnap.docs.forEach((d) => {
          const cat = d.data().category;
          if (cat) catalogCategoryByKey[d.id] = normalizeCategoryValue(cat);
        });
        setAthleteRMHistory(
          rmSnap.docs.map((d) => ({
            exercise: d.data().exerciseName || d.id,
            kg: d.data().kg,
            date: d.data().updatedAt,
            autoAdjusted: d.data().autoAdjusted || false,
            autoCreated: d.data().autoCreated || false,
          }))
        );

        // Historique complet + catégories, pour le graphique d'évolution —
        // UNIQUEMENT les exercices déjà réalisés au moins une fois (kg
        // renseigné) : une fiche "en attente" créée depuis la banque
        // d'exercices n'a encore aucune donnée à tracer.
        const fullHistory = {};
        const categoriesMap = {};
        let vmaEntry = null;
        let cmjEntry = null;
        rmSnap.docs.forEach((d) => {
          const data = d.data();
          const name = (data.exerciseName || d.id).toLowerCase();
          if (name === "vma") {
            vmaEntry = { kg: data.kg, history: data.history || [] };
            return;
          }
          if (name === "cmj") {
            cmjEntry = { kg: data.kg, history: data.history || [] };
            return;
          }
          if (data.kg === null || data.kg === undefined) return; // pas encore testé
          categoriesMap[name] =
            catalogCategoryByKey[d.id] ||
            normalizeCategoryValue(data.category) ||
            "autre";
          if (Array.isArray(data.history) && data.history.length > 0) {
            fullHistory[name] = data.history.map((h) => ({
              kg: h.kg,
              date: h.date,
              autoAdjusted: h.autoAdjusted || false,
            }));
          } else {
            fullHistory[name] = [
              { kg: data.kg, date: data.updatedAt, autoAdjusted: data.autoAdjusted || false },
            ];
          }
        });
        setAthleteRMFullHistory(fullHistory);
        setAthleteRMCategoriesMap(categoriesMap);
        setAthleteVmaData(vmaEntry);
        setAthleteCmjData(cmjEntry);
      } catch (e) {
        console.error("Erreur RM (dashboard athlète):", e);
      }

      // --- Wellness ---
      let myWellness = [];
      let todayW = null;
      try {
        // Requête filtrée côté serveur (et non collection(db,"wellness") entière) :
        // les règles Firestore n'autorisent la lecture d'un doc wellness qu'à son
        // propriétaire ou à un admin, donc une requête non filtrée sur toute la
        // collection est rejetée par Firestore pour un athlète (erreur silencieuse
        // attrapée plus bas -> le wellness du jour n'apparaissait jamais).
        const myWellnessSnap = await getDocs(
          query(collection(db, "wellness"), where("userId", "==", currentUser.uid))
        );
        myWellness = myWellnessSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        todayW = myWellness.find((w) => w.date === today) || null;
        if (todayW) setTodayWellness(todayW);

        const last7 = myWellness.slice(0, 7).reverse();
        setWellnessHistory(
          last7.map((d) => ({
            ...d,
            normalizedScore: calculateWellnessScore(d),
          }))
        );
      } catch (e) {
        console.error("Erreur wellness (dashboard athlète):", e);
      }

      // --- Poids ---
      try {
        const whtSnap = await getDocs(
          collection(db, "users", currentUser.uid, "weight_history")
        );
        const whtData = whtSnap.docs
          .map((d) => ({ weight: d.data().weight, date: d.data().date }))
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        setWeightHistory(whtData);

        if (whtData.length > 0) {
          const lastDate = new Date(
            whtData[whtData.length - 1].date + "T12:00:00"
          );
          setLastWeightDate(lastDate);
          setCanUpdateWeight((new Date() - lastDate) / 86400000 >= 7);
        }
      } catch (e) {
        console.error("Erreur poids (dashboard athlète):", e);
      }

      // --- Indicateurs croisés (REDI × wellness × RPE × CMJ) — dépendent de
      // userWorkouts/myWellness/todayW calculés ci-dessus (valeurs par
      // défaut sûres si leur section a échoué), jamais bloquant pour le
      // reste du Dashboard.
      try {
        const myDailyLoads = buildDailyLoads(userWorkouts, currentUser.uid);
        const ratio = rediRatio(myDailyLoads, today);
        setSelfRediRatio(ratio);

        const todayScoreForZ = todayW ? calculateWellnessScore(todayW) : null;
        const myWellnessHistoryForZ = wellnessZScoreHistory(myWellness, today);
        const wZ = todayScoreForZ !== null ? zScore(todayScoreForZ, myWellnessHistoryForZ) : null;
        setSelfWellnessZ(wZ);

        const myDailyRPE = buildDailyRPE(userWorkouts, currentUser.uid);
        const myRpeReliability = rpeVariability(myDailyRPE.map((e) => e.rpe));
        setSelfRpeReliability(myRpeReliability);

        const myCmjEntries = extractCMJEntries(userWorkouts, currentUser.uid);
        const todayCmjEntry = myCmjEntries.find((e) => e.date === today);
        const myCmjStatus = cmjStatus(todayCmjEntry ? todayCmjEntry.heightCm : null, myCmjEntries, today);
        setSelfCmjStatus(myCmjStatus);

        setSelfCrossStatus(
          crossRiskStatusFull({
            rediRatioValue: ratio,
            wellnessZ: wZ,
            cmjPctChange: myCmjStatus.pctChange,
            rpeReliability: myRpeReliability,
          })
        );
      } catch (e) {
        console.error("Erreur indicateurs croisés (dashboard athlète):", e);
      }

      // --- Journal de blessures — dernières déclarations personnelles. ---
      try {
        // Même raison que pour le wellness ci-dessus : requête filtrée côté
        // serveur, une lecture non filtrée de toute la collection "injuries"
        // est rejetée par les règles Firestore pour un athlète non-admin.
        const injSnap = await getDocs(
          query(collection(db, "injuries"), where("userId", "==", currentUser.uid))
        );
        const myInjuries = injSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .slice(0, 5);
        setSelfInjuries(myInjuries);
      } catch (e) {
        console.error("Erreur chargement blessures:", e);
      }
    };
    load();
  }, [viewRole, currentUser, userProfile, customGroups]);

  useEffect(() => {
    if (viewRole === "athlete" && userProfile)
      setAthleteWeight(userProfile.weight || "");
  }, [viewRole, userProfile]);

  const saveWeight = async () => {
    if (!currentUser || !athleteWeight || !canUpdateWeight) return;
    try {
      const today = getLocalDateStr(new Date());
      const newWeight = Number(athleteWeight);

      await setDoc(doc(db, "users", currentUser.uid), {
        weight: newWeight,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const historyRef = doc(
        collection(db, "users", currentUser.uid, "weight_history")
      );
      await setDoc(historyRef, {
        weight: newWeight,
        date: today,
        createdAt: new Date().toISOString(),
      });

      setCanUpdateWeight(false);
      setEditingWeight(false);
      setWeightHistory((prev) => [...prev, { weight: newWeight, date: today }]);
      alert("Poids mis à jour !");
    } catch (e) {
      console.error("Erreur poids:", e);
      alert("Erreur: " + e.message);
    }
  };

  useEffect(() => {
    if (userRole !== "admin") {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const athleteUsers = allUsers.filter(
          (u) => u.superAdmin !== true && u.role !== "admin"
        );

        if (athleteUsers.length === 0) {
          setAthletes([]);
          setLoading(false);
          return;
        }

        const allWellness = (
          await getDocs(collection(db, "wellness"))
        ).docs.map((d) => ({ id: d.id, ...d.data() }));
        const allWorkouts = (await getWorkoutDocs()).docs.map(
          (d) => ({ id: d.id, ...d.data() })
        );
        const today = getLocalDateStr(new Date());

        let allInjuries = [];
        try {
          allInjuries = (await getDocs(collection(db, "injuries"))).docs.map(
            (d) => ({ id: d.id, ...d.data() })
          );
        } catch (e) {
          console.error("Erreur chargement blessures:", e);
        }

        // RM enregistrés par athlète (sert à repérer une performance < 80 % du RM).
        const rmByUser = {};
        await Promise.all(
          athleteUsers.map(async (u) => {
            const m = {};
            try {
              const snap = await getDocs(collection(db, "users", u.id, "rm"));
              snap.docs.forEach((d) => {
                const key = normalizeExerciseKey(d.id);
                const kg = Number(d.data().kg);
                if (key === "vma" || key === "cmj" || !(kg > 0)) return;
                m[key] = kg;
              });
            } catch (e) {
              console.error("Erreur lecture RM (classification forme):", e);
            }
            rmByUser[u.id] = m;
          })
        );

        const result = athleteUsers.map((u) => {
          const userWellness = allWellness
            .filter((w) => w.userId === u.id)
            .sort((a, b) => b.date.localeCompare(a.date));

          const todayW = userWellness.find((w) => w.date === today);
          const wScore = todayW ? calculateWellnessScore(todayW) : null;

          const uGrp = u.group || "total";
          const uGroupIds = getAthleteGroupIds(u.id, customGroups);
          const uWorkouts = allWorkouts.filter(
            (w) =>
              w.group === "total" ||
              w.group === uGrp ||
              w.targetUserId === u.id ||
              uGroupIds.includes(w.group)
          );
          const todayWorkout = uWorkouts.find((w) => w.date === today);

          const acwr = calculateACWR(uWorkouts, u.id);
          const acwrNum = acwr !== null ? Number(acwr) : null;

          // Z-score wellness individualisé (vs propre historique, hors
          // aujourd'hui) + croisement REDI × wellness × CMJ × fiabilité RPE,
          // recalculés à chaque chargement du dashboard donc renouvelés
          // chaque jour. Chaque signal manquant (pas de test CMJ, pas assez
          // de séances pour juger la RPE...) est simplement ignoré.
          const wellnessHistoryForZ = wellnessZScoreHistory(userWellness, today);
          const wellnessZ = wScore !== null ? zScore(wScore, wellnessHistoryForZ) : null;

          const uDailyRPE = buildDailyRPE(uWorkouts, u.id);
          const uRpeReliability = rpeVariability(uDailyRPE.map((e) => e.rpe));

          const uCmjEntries = extractCMJEntries(uWorkouts, u.id);
          const todayCmjEntry = uCmjEntries.find((e) => e.date === today);
          const uCmjStatus = cmjStatus(todayCmjEntry ? todayCmjEntry.heightCm : null, uCmjEntries, today);

          // Fatigue nerveuse (force) puis classification de forme croisée :
          // REDI × z-score wellness × performance (chute > 15 %, < 80 % du RM).
          const neural = neuralFatigueAnalysis(
            extractStrengthSessions(uWorkouts, u.id),
            rmByUser[u.id] || {},
            today
          );
          const form = classifyForm({
            rediRatioValue: acwrNum,
            wellnessZ,
            wellnessScore: wScore,
            cmjPctChange: uCmjStatus.pctChange,
            neural,
          });

          const totalSessions = uWorkouts.length;
          const completedSessions = uWorkouts.filter((w) => isWorkoutCompleted(w, u.id)).length;

          const uInjuries = allInjuries
            .filter((inj) => inj.userId === u.id)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

          return {
            ...u,
            lastWellness: todayW || null,
            wellnessScore: wScore,
            status: form,
            wellnessStatus: wScore !== null ? getWellnessStatus(wScore) : null,
            neural,
            wellnessZ,
            wellnessZStatus: getWellnessZScoreStatus(wellnessZ),
            crossStatus: form,
            cmjStatus: uCmjStatus,
            cmjEntries: uCmjEntries
              .slice()
              .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
            rpeReliability: uRpeReliability,
            rpeReliabilityStatus: getRPEReliabilityStatus(uRpeReliability),
            injuries: uInjuries,
            acwr: acwr,
            acwrStatus: getACWRStatus(acwr),
            todayCompleted: todayWorkout ? isWorkoutCompleted(todayWorkout, u.id) : false,
            todayWorkoutTitle: todayWorkout?.title || null,
            todayWorkoutInProgress: todayWorkout ? isWorkoutInProgress(todayWorkout, u.id) : false,
            totalSessions: totalSessions,
            completedSessions: completedSessions,
          };
        });

        result.sort((a, b) => {
          const ra = (FORM_LEVELS[a.status.level] || FORM_LEVELS.nodata).rank;
          const rb = (FORM_LEVELS[b.status.level] || FORM_LEVELS.nodata).rank;
          if (ra !== rb) return ra - rb;
          return (a.wellnessScore ?? 99) - (b.wellnessScore ?? 99);
        });
        setAthletes(result);
        setLoading(false);
      } catch (e) {
        console.error("Erreur admin:", e);
        setLoading(false);
      }
    };
    load();
  }, [userRole, currentUser, customGroups]);

  const loadAthleteDetail = async (athlete) => {
    try {
      const today = getLocalDateStr(new Date());

      const allWellness = (await getDocs(collection(db, "wellness"))).docs.map(
        (d) => ({ id: d.id, ...d.data() })
      );
      const wellnessData = allWellness
        .filter((w) => w.userId === athlete.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, normalizedScore: calculateWellnessScore(d) }));

      const todayEntry = wellnessData.find((e) => e.date === today);
      const dailyScore = todayEntry ? todayEntry.normalizedScore : null;

      const getWeekNum = (d) => {
        const dd = new Date(d + "T12:00:00");
        dd.setHours(0, 0, 0, 0);
        dd.setDate(dd.getDate() + 4 - (dd.getDay() || 7));
        const ys = new Date(dd.getFullYear(), 0, 1);
        return Math.ceil(((dd - ys) / 86400000 + 1) / 7);
      };
      const curWeek = getWeekNum(today);
      const curYear = new Date().getFullYear();
      const thisWeek = wellnessData.filter(
        (e) =>
          getWeekNum(e.date) === curWeek &&
          new Date(e.date + "T12:00:00").getFullYear() === curYear
      );
      const weeklyAvg =
        thisWeek.length > 0
          ? (
              thisWeek.reduce((s, e) => s + e.normalizedScore, 0) /
              thisWeek.length
            ).toFixed(1)
          : null;

      const [rmSnap, exerciseMediaSnap] = await Promise.all([
        getDocs(collection(db, "users", athlete.id, "rm")),
        getDocs(collection(db, "exerciseMedia")),
      ]);
      // La banque d'exercices (exerciseMedia) est la source de vérité pour la
      // catégorie : on l'utilise en priorité, avant la catégorie stockée sur
      // la fiche RM individuelle de l'athlète (qui peut être restée "autre"
      // si elle n'a jamais été resynchronisée).
      const catalogCategoryByKey = {};
      exerciseMediaSnap.docs.forEach((d) => {
        const cat = d.data().category;
        if (cat) catalogCategoryByKey[d.id] = normalizeCategoryValue(cat);
      });
      const rmByEx = {};
      const rmCategories = {};
      let athleteVma = null;
      let athleteCmj = null;
      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = data.exerciseName || d.id;
        // CMJ/VMA ont leurs propres cartes (unités différentes — cm / km/h)
        // et ne doivent jamais se mélanger aux exercices de muscu classiques.
        if (name.toLowerCase() === "vma") {
          athleteVma = { kg: data.kg, history: data.history || [] };
          return;
        }
        if (name.toLowerCase() === "cmj") {
          athleteCmj = { kg: data.kg, history: data.history || [] };
          return;
        }
        rmCategories[name] =
          catalogCategoryByKey[d.id] ||
          normalizeCategoryValue(data.category) ||
          "autre";
        // Historique complet (champ "history", comme VMA/CMJ) si présent,
        // sinon repli sur le point unique kg/updatedAt pour les anciennes
        // fiches. Une fiche "en attente" (kg: null, jamais testée) n'a pas
        // de point du tout.
        if (Array.isArray(data.history) && data.history.length > 0) {
          rmByEx[name] = data.history.map((h) => ({
            kg: h.kg,
            date: h.date,
            autoAdjusted: h.autoAdjusted || false,
          }));
        } else if (data.kg !== null && data.kg !== undefined) {
          rmByEx[name] = [
            { kg: data.kg, date: data.updatedAt, autoAdjusted: data.autoAdjusted || false },
          ];
        } else {
          rmByEx[name] = [];
        }
      });
      Object.keys(rmByEx).forEach((k) =>
        rmByEx[k].sort((a, b) => new Date(a.date) - new Date(b.date))
      );

      const whSnap = await getDocs(
        collection(db, "users", athlete.id, "weight_history")
      );
      const weightData = whSnap.docs
        .map((d) => ({ weight: d.data().weight, date: d.data().date }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const allW = (await getWorkoutDocs()).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const uGrp = athlete.group || "total";
      const uGroupIds = getAthleteGroupIds(athlete.id, customGroups);
      const uWorkouts = allW.filter(
        (w) =>
          w.group === "total" ||
          w.group === uGrp ||
          w.targetUserId === athlete.id ||
          uGroupIds.includes(w.group)
      );
      const todayW = uWorkouts.find((w) => w.date === today) || null;

      const acwrHist = calculateACWRHistory(uWorkouts, athlete.id);

      setShowAthleteDetail(athlete);
      setExpandedSessionIds({});
      setShowAllAthleteSessions(false);
      setShowInjuryHistory(false);
      setEditingInjury(null);
      setInjuryEditDraft(null);
      setShowRMEvolution(false);
      setRmSearch("");
      setRmSelected(null);
      setRmListOpen(true);
      setDetailedAthleteRMHistory(rmByEx);
      setDetailedAthleteRMCategories(rmCategories);
      setAcwrHistory(acwrHist);
      setAthleteDetails({
        wellness: wellnessData,
        dailyScore,
        weeklyAvg,
        weightHistory: weightData,
        todayWorkout: todayW,
        sessions: [...uWorkouts].sort((a, b) =>
          (b.date || "").localeCompare(a.date || "")
        ),
        vma: athleteVma,
        cmj: athleteCmj,
      });
    } catch (e) {
      console.error("❌ Erreur détails:", e);
      alert("Erreur chargement: " + e.message);
    }
  };

  // Saisie manuelle de la VMA / du CMJ par le coach (vue détail athlète),
  // pour que l'évolution continue à se construire même si l'athlète oublie
  // de la renseigner lui-même depuis "Mes RM". Écrit dans la même fiche
  // Firestore (users/{id}/rm/VMA ou CMJ) et le même format d'historique, pour
  // que ça alimente exactement le même graphique.
  const [vmaCmjInput, setVmaCmjInput] = useState({ vma: "", cmj: "" });
  const [savingVmaCmj, setSavingVmaCmj] = useState(null); // "vma" | "cmj" | null

  const saveManualVmaCmj = async (type) => {
    if (!showAthleteDetail) return;
    const value = Number(vmaCmjInput[type]);
    if (!value || isNaN(value)) {
      alert("Entre une valeur valide.");
      return;
    }
    const docId = type === "vma" ? "VMA" : "CMJ";
    const existing = type === "vma" ? athleteDetails?.vma : athleteDetails?.cmj;
    const history = existing?.history ? [...existing.history] : [];
    history.push({ date: new Date().toISOString(), kg: value });
    setSavingVmaCmj(type);
    try {
      await setDoc(
        doc(db, "users", showAthleteDetail.id, "rm", docId),
        {
          kg: value,
          exerciseName: docId,
          updatedAt: new Date().toISOString(),
          autoAdjusted: false,
          history: history.slice(-20),
        },
        { merge: true }
      );
      setAthleteDetails((prev) => ({
        ...prev,
        [type]: { kg: value, history: history.slice(-20) },
      }));
      setVmaCmjInput((prev) => ({ ...prev, [type]: "" }));
    } catch (e) {
      console.error(`Erreur enregistrement ${docId} (admin):`, e);
      alert("❌ Erreur lors de l'enregistrement : " + e.message);
    } finally {
      setSavingVmaCmj(null);
    }
  };

  const filtered = athletes.filter((a) => {
    if (athleteSearchQuery.trim()) {
      const searchLower = athleteSearchQuery.toLowerCase();
      const athleteName = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
      if (!athleteName.includes(searchLower)) {
        return false;
      }
    }

    if (wellnessFilter === "total") return true;
    if (wellnessFilter === "risque") return a.status?.level === "risk";
    if (wellnessFilter === "fatigue")
      return a.status?.level === "fatigue" || a.status?.level === "watch";
    if (wellnessFilter === "forme") return a.status?.level === "fit";
    return true;
  });

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#f3f0ea",
          background: "#0d0c0a",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  if (viewRole !== "admin") {
    const todayScore = todayWellness
      ? calculateWellnessScore(todayWellness)
      : null;
    const weeklyAvg =
      wellnessHistory.length > 0
        ? (
            wellnessHistory.reduce((s, e) => s + e.normalizedScore, 0) /
            wellnessHistory.length
          ).toFixed(1)
        : null;

    // Séance non démarrée en fin d'après-midi : rappel doux, seulement
    // après 17h, pour ne pas alerter dans la matinée pour rien.
    const sessionReminderDue =
      todayWorkout &&
      !isWorkoutCompleted(todayWorkout) &&
      !isWorkoutInProgress(todayWorkout) &&
      new Date().getHours() >= 17;

    // RM auto-créés en attente d'une vraie valeur (kg null/undefined) —
    // voir ensureRMsExist dans Workout.jsx, qui les crée dès qu'un exercice
    // sert de référence à un calcul de %, à charge pour l'athlète (ou le
    // coach) de renseigner la vraie valeur.
    const pendingRM = athleteRMHistory.filter(
      (r) => r.kg === null || r.kg === undefined
    );

    // Résumé de la séance du jour une fois validée : RPE moyen déclaré +
    // comparaison charges soulevées / RM actuel, pour ne pas avoir à
    // rouvrir la séance juste pour ça.
    let todaySummary = null;
    if (todayWorkout && isWorkoutCompleted(todayWorkout)) {
      const avgRpe = calcSessionAvgRPE(todayWorkout, currentUser?.uid);
      const feedback = getUserFeedback(todayWorkout, currentUser?.uid);
      const rmByName = {};
      athleteRMHistory.forEach((r) => {
        if (r.kg) rmByName[normalizeExerciseNameLocal(r.exercise)] = r.kg;
      });
      const vsRM = [];
      (todayWorkout.blocks || []).forEach((block, bIdx) => {
        (block.exercises || []).forEach((ex, eIdx) => {
          if (!ex.rmName) return;
          const rmKg = rmByName[normalizeExerciseNameLocal(ex.rmName)];
          if (!rmKg) return;
          const fb = feedback[`${bIdx}-${eIdx}`];
          const series = fb?.series;
          if (!series || series.length === 0) return;
          const weights = series
            .map((s) => Number(s.actualWeight))
            .filter((w) => !Number.isNaN(w) && w > 0);
          if (weights.length === 0) return;
          const maxWeight = Math.max(...weights);
          vsRM.push({
            name: ex.name,
            pct: Math.round((maxWeight / rmKg) * 100),
            weight: maxWeight,
          });
        });
      });
      todaySummary = { avgRpe, vsRM: vsRM.slice(0, 3) };
    }

    // Charge (sRPE) des 21 derniers jours pour la sparkline de tendance —
    // un jour sans séance complétée vaut simplement 0.
    const loadsByDate = {};
    buildDailyLoads(athleteWorkouts, currentUser?.uid).forEach((d) => {
      loadsByDate[d.date] = d.load;
    });
    // 21 jours = 3 blocs de 7 jours qui finissent aujourd'hui (wk 0 = le plus ancien).
    const DAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
    const sparklineData = [];
    for (let i = 20; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateStr(d);
      sparklineData.push({
        date: dateStr,
        load: Math.round(loadsByDate[dateStr] || 0),
        wk: Math.floor((20 - i) / 7),
        tick: DAY_LETTERS[d.getDay()],
        isToday: i === 0,
      });
    }
    const hasSparklineData = sparklineData.some((d) => d.load > 0);
    const weekInfo = [0, 1, 2].map((w) => {
      const days = sparklineData.filter((d) => d.wk === w);
      const fmt = (ds) => `${ds.slice(8, 10)}/${ds.slice(5, 7)}`;
      return {
        total: days.reduce((acc, d) => acc + d.load, 0),
        sessions: days.filter((d) => d.load > 0).length,
        range: `${fmt(days[0].date)} → ${fmt(days[days.length - 1].date)}`,
      };
    });
    const weekDelta =
      weekInfo[1].total > 0
        ? Math.round(((weekInfo[2].total - weekInfo[1].total) / weekInfo[1].total) * 100)
        : null;
    const WEEK_OPACITY = [0.4, 0.68, 1];
    const WEEK_NAMES = ["Il y a 2 sem.", "Sem. dernière", "7 derniers jours"];

    return (
      <div
        style={{
          padding: 20,
          background: "#0d0c0a",
          minHeight: "100vh",
          color: "#f3f0ea",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 5 }}>
          Bonjour {userProfile?.firstName || "Athlète"} ! 👋
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {userRole === "admin" && meMode && (
            <button
              onClick={() => setMeMode(false)}
              style={{ padding: "6px 12px", background: "#e0a13d", color: "#1a1306", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}
            >
              ↩ Retour au dashboard admin
            </button>
          )}
        </div>
        <p style={{ color: "#a8a199", marginBottom: 20, fontSize: 14 }}>
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>

        {/* Mini-frise de la semaine : un coup d'œil sur les 7 jours (lundi
            → dimanche) sans avoir à ouvrir le calendrier. Un jour sans
            séance programmée reste un simple point neutre. */}
        {weekOverview.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              background: "#151310",
              borderRadius: 12,
              padding: "14px 10px 12px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a8a199", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 4px 10px" }}>
              Entraînements de la semaine
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              {weekOverview.map((day) => {
                const STATUS_STYLE = {
                  done: { color: "#4fae7d", icon: "✓", label: "Faite" },
                  inProgress: { color: "#e0a13d", icon: "◐", label: "En cours" },
                  missed: { color: "#e5534b", icon: "❌", label: "Non faite" },
                  today: { color: "#4a90d9", icon: "●", label: "Aujourd'hui" },
                  upcoming: { color: "#4a90d9", icon: "○", label: "À venir" },
                  none: { color: "#4a453d", icon: "·", label: "Repos" },
                };
                const s = STATUS_STYLE[day.status] || STATUS_STYLE.none;
                const hasSession = day.status !== "none";
                return (
                  <div
                    key={day.date}
                    onClick={() => day.sessionId && goToWorkout(day.sessionId, false)}
                    title={day.title ? `${day.title} — ${s.label}` : s.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      flex: 1,
                      minWidth: 0,
                      padding: "8px 2px",
                      borderRadius: 10,
                      background: hasSession ? `${s.color}26` : "transparent",
                      border: hasSession ? `1.5px solid ${s.color}` : "1.5px solid rgba(255,255,255,0.06)",
                      boxShadow: day.isToday ? "0 0 0 2px rgba(224,161,61,0.55)" : "none",
                      cursor: day.sessionId ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 10, color: day.isToday ? "#e0a13d" : "#a8a199", fontWeight: day.isToday ? "bold" : "normal", textTransform: "uppercase" }}>
                      {day.dayLabel}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: hasSession ? "#f3f0ea" : "#6f6a62", lineHeight: 1 }}>
                      {day.dayNum}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.icon}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 10, fontSize: 11, color: "#a8a199" }}>
              <span><span style={{ color: "#4fae7d" }}>●</span> Fait</span>
              <span><span style={{ color: "#e5534b" }}>●</span> Non fait</span>
              <span><span style={{ color: "#4a90d9" }}>●</span> À venir</span>
            </div>
          </div>
        )}

        {!todayWellness && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/wellness")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/wellness");
            }}
            style={{
              background: "rgba(217,164,65,0.14)",
              padding: 20,
              borderRadius: 12,
              border: "1px solid #d9a44166",
              marginBottom: 16,
              cursor: "pointer",
            }}
          >
            <h3
              style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700, color: "#d9a441" }}
            >
              ⚠️ Wellness non rempli
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#f0c98a" }}>
              N'oublie pas de remplir ton questionnaire wellness d'aujourd'hui !
            </p>
            <div
              style={{
                marginTop: 14,
                padding: "13px 16px",
                background: "#e0a13d",
                color: "#1a1308",
                borderRadius: 10,
                textAlign: "center",
                fontSize: 16,
                fontWeight: 800,
                boxShadow: "0 2px 10px rgba(224,161,61,0.35)",
              }}
            >
              👉 Touche ici pour le remplir
            </div>
          </div>
        )}

        {sessionReminderDue && (
          <div
            style={{
              background: "rgba(217,105,90,0.14)",
              padding: 20,
              borderRadius: 12,
              border: "1px solid #d9695a66",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700, color: "#d9695a" }}>
              ⏰ Séance pas encore démarrée
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#f0b5ab" }}>
              "{todayWorkout.title}" t'attend toujours aujourd'hui.
            </p>
          </div>
        )}

        {pendingRM.length > 0 && (
          <div
            style={{
              background: "rgba(224,161,61,0.14)",
              padding: 20,
              borderRadius: 12,
              border: "1px solid #e0a13d66",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700, color: "#e0a13d" }}>
              🎯 {pendingRM.length} RM en attente de validation
            </h3>
            <p style={{ margin: "0 0 12px 0", fontSize: 14, color: "#f0d9ae" }}>
              {pendingRM.map((r) => r.exercise).slice(0, 4).join(", ")}
              {pendingRM.length > 4 ? "…" : ""}
            </p>
            <button
              onClick={() => navigate("/myrm")}
              style={{
                padding: "10px 16px",
                background: "#e0a13d",
                color: "#1a1306",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: 14,
              }}
            >
              Aller sur Mes RM →
            </button>
          </div>
        )}

        {todayScore !== null && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: 16,
            }}
          >
            {foldHead("wellness", "🧘 Wellness")}
            {vis("wellness") && (
            <>
              <button
                type="button"
                onClick={() => navigate("/wellness")}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  marginBottom: 14,
                  background: "rgba(224,161,61,0.12)",
                  color: "#e0a13d",
                  border: "1px solid rgba(224,161,61,0.4)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🧘 Ouvrir l'onglet Wellness →
              </button>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 15,
              }}
            >
              <div
                style={{
                  background: "#0d0c0a",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                  Score du jour
                </div>
                <div
                  style={{ fontSize: 28, fontWeight: "bold", color: "#e0a13d" }}
                >
                  {todayScore.toFixed(1)}/10
                </div>
              </div>
              <div
                style={{
                  background: "#0d0c0a",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                  Moy. Hebdo
                </div>
                <div
                  style={{ fontSize: 28, fontWeight: "bold", color: "#4fae7d" }}
                >
                  {weeklyAvg || "–"}
                </div>
              </div>
            </div>
            {wellnessHistory.length > 1 && (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={wellnessHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="date"
                    stroke="#a8a199"
                    fontSize={10}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
                    }
                  />
                  <YAxis domain={[0, 10]} stroke="#a8a199" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1815",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#f3f0ea" }}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("fr-FR")}
                    formatter={(value) => [`${value.toFixed(1)}/10`, "Score wellness"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="normalizedScore"
                    name="Score wellness"
                    stroke="#e0a13d"
                    strokeWidth={2.5}
                    dot={{ fill: "#e0a13d", r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            </>
          )}
          </div>
        )}

        {selfInjuries.length > 0 && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: 16,
            }}
          >
            {foldHead("injuries", "🚑 Blessures récentes")}
            {vis("injuries") && (
            <>
            {selfInjuries.map((inj) => (
              <div key={inj.id} style={{ fontSize: 13, color: "#a8a199", marginBottom: 6 }}>
                <strong style={{ color: "#f3f0ea" }}>{inj.date}</strong>
                {inj.zone ? ` — ${inj.zone}` : ""}
                {inj.daysLost !== null && inj.daysLost !== undefined ? ` (${inj.daysLost}j d'arrêt)` : ""}
              </div>
            ))}
            </>
          )}
          </div>
        )}

        {todayWellness && (
            <div
              style={{
                background: "#151310",
                padding: 20,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 16,
              }}
            >
            {foldHead("pain", "🩹 Douleur (aujourd'hui)")}
            {vis("pain") && (
            <>
              <button
                type="button"
                onClick={() => navigate("/wellness")}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  marginBottom: 14,
                  background: "rgba(224,161,61,0.12)",
                  color: "#e0a13d",
                  border: "1px solid rgba(224,161,61,0.4)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🧘 Ouvrir l'onglet Wellness →
              </button>
              <BodyScan
                painMap={todayWellness.painMap || {}}
                painTypes={todayWellness.painTypes || {}}
                setPainMap={(m) => savePainField("painMap", m)}
                setPainTypes={(t) => savePainField("painTypes", t)}
                selectedZone={selfPainZone}
                setSelectedZone={setSelfPainZone}
              />
              {painSaveError && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#d9695a" }}>{painSaveError}</div>
              )}
            </>
          )}
            </div>
          )}

        {currentUser?.uid && (
          <div>
            <TestsSummary uid={currentUser.uid} title="🧪 Mes tests" simple collapsed={!vis("tests")} onToggle={() => toggleDash("tests")} />
          </div>
        )}

        {(
        <div
          style={{
            background: "#151310",
            padding: 20,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 16,
          }}
        >
            {foldHead("progress", "📊 Progression des séances")}
            {vis("progress") && (
            <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div
              style={{
                background: "#0d0c0a",
                padding: 12,
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                Complétées
              </div>
              <div
                style={{ fontSize: 28, fontWeight: "bold", color: "#4fae7d" }}
              >
                {completedSessions}
              </div>
            </div>
            <div
              style={{
                background: "#0d0c0a",
                padding: 12,
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                Passées
              </div>
              <div
                style={{ fontSize: 28, fontWeight: "bold", color: "#e0a13d" }}
              >
                {totalSessions}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 15,
              padding: 12,
              background: "rgba(79,174,125,0.14)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, color: "#a8a199", marginBottom: 4 }}>
              Taux de réalisation (séances passées)
            </div>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#4fae7d" }}>
              {totalSessions > 0
                ? Math.round((completedSessions / totalSessions) * 100)
                : 0}
              %
            </div>
          </div>

            </>
          )}
        </div>
        )}


        {(
          <div style={CARD_STYLE}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: vis("load") ? 14 : 0, flexWrap: "wrap" }}>
              <h3 style={{ ...CARD_TITLE, margin: 0 }}>📈 Charge des 3 dernières semaines</h3>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, color: "#a8a199" }}>UA = RPE × minutes</span>{foldBtn("load")}</span>
            </div>
            {vis("load") && (
              <>
            {hasSparklineData ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                  {weekInfo.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#0d0c0a",
                        padding: "10px 8px",
                        borderRadius: 10,
                        textAlign: "center",
                        border: i === 2 ? "1px solid rgba(224,161,61,0.4)" : "1px solid transparent",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "#a8a199", textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {WEEK_NAMES[i]}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: i === 2 ? "#e0a13d" : "#f3f0ea", margin: "4px 0 2px" }}>
                        {w.total}
                      </div>
                      <div style={{ fontSize: 10, color: "#6f685f" }}>
                        {w.sessions} jour{w.sessions > 1 ? "s" : ""} d'effort
                      </div>
                    </div>
                  ))}
                </div>
                {weekDelta !== null && (
                  <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 10 }}>
                    {weekDelta === 0 ? "▬" : weekDelta > 0 ? "▲" : "▼"}{" "}
                    <strong style={{ color: "#f3f0ea" }}>
                      {weekDelta > 0 ? "+" : ""}
                      {weekDelta} %
                    </strong>{" "}
                    par rapport à la semaine dernière
                  </div>
                )}
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={sparklineData} margin={{ top: 6, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="tick" interval={0} axisLine={false} tickLine={false} stroke="#a8a199" fontSize={10} />
                    <YAxis axisLine={false} tickLine={false} stroke="#a8a199" fontSize={10} width={40} tickCount={4} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ ...CHART_TOOLTIP, padding: "8px 10px" }}>
                            <div style={{ color: "#f3f0ea", textTransform: "capitalize" }}>
                              {new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                            </div>
                            <div style={{ color: "#a8a199", marginTop: 2 }}>
                              {d.load > 0 ? (
                                <>
                                  Charge : <strong style={{ color: "#e0a13d" }}>{d.load} UA</strong>
                                </>
                              ) : (
                                "Pas de séance"
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="load" radius={[4, 4, 0, 0]} maxBarSize={18} minPointSize={2}>
                      {sparklineData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.load > 0 ? "#e0a13d" : "#2a2620"}
                          fillOpacity={d.load > 0 ? WEEK_OPACITY[d.wk] : 1}
                          stroke={d.isToday ? "#f3f0ea" : "none"}
                          strokeWidth={d.isToday ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {weekInfo.map((w, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a8a199" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: "#e0a13d", opacity: WEEK_OPACITY[i], display: "inline-block" }} />
                      {w.range}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#a8a199", textAlign: "center", padding: "18px 8px" }}>
                Aucune charge enregistrée sur les 3 dernières semaines. Elle apparaît dès que tu valides une séance avec ton RPE.
              </div>
            )}
              </>
            )}
          </div>
        )}

        {(
        <div
          style={{
            ...CARD_STYLE,
            border: CARD_ACCENT_BORDER,
          }}
        >
            {foldHead("today", "🏋️ Séance du jour")}
            {vis("today") && (
            <>
          {todayWorkout ? (
            <div>
              <div
                style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}
              >
                {todayWorkout.title}
              </div>
              <div style={{ fontSize: 14, color: "#a8a199", marginBottom: 10 }}>
                Durée estimée : {todayWorkout.estimatedDuration || "N/A"} min
              </div>
              {isWorkoutCompleted(todayWorkout) ? (
                <div
                  style={{
                    padding: 12,
                    background: "rgba(79,174,125,0.14)",
                    borderRadius: 8,
                    color: "#4fae7d",
                    textAlign: "center",
                    fontWeight: "bold",
                    marginBottom: 10,
                  }}
                >
                  ✅ Séance validée
                </div>
              ) : null}
              {todaySummary && (todaySummary.avgRpe !== null || todaySummary.vsRM.length > 0) && (
                <div
                  style={{
                    padding: 12,
                    background: "#0d0c0a",
                    borderRadius: 8,
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  {todaySummary.avgRpe !== null && (
                    <div style={{ color: "#a8a199", marginBottom: todaySummary.vsRM.length > 0 ? 8 : 0 }}>
                      RPE moyen : <strong style={{ color: "#f3f0ea" }}>{todaySummary.avgRpe.toFixed(1)}</strong>
                    </div>
                  )}
                  {todaySummary.vsRM.map((v, i) => (
                    <div key={i} style={{ color: "#a8a199" }}>
                      {v.name} : <strong style={{ color: "#f3f0ea" }}>{v.weight} kg</strong>{" "}
                      ({v.pct}% du RM)
                    </div>
                  ))}
                </div>
              )}
              {isWorkoutCompleted(todayWorkout) ? null : isWorkoutInProgress(todayWorkout) ? (
                <div
                  style={{
                    padding: 12,
                    background: "rgba(217,164,65,0.14)",
                    borderRadius: 8,
                    color: "#d9a441",
                    textAlign: "center",
                    fontWeight: "bold",
                    marginBottom: 10,
                  }}
                >
                  ⏳ En cours
                </div>
              ) : (
                <div
                  style={{
                    padding: 12,
                    background: "rgba(217,105,90,0.14)",
                    borderRadius: 8,
                    color: "#d9695a",
                    textAlign: "center",
                    marginBottom: 10,
                  }}
                >
                  ❌ Non démarrée
                </div>
              )}
              {/* Deux actions toujours disponibles : voir la séance en entier
                  sans rien démarrer, ou la démarrer/reprendre directement —
                  sans avoir à aller la chercher dans le calendrier de la
                  page Séances. */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => goToWorkout(todayWorkout.id, false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: "#2a2620",
                    color: "#f3f0ea",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 14,
                  }}
                >
                  👁️ Voir la séance
                </button>
                {!isWorkoutCompleted(todayWorkout) && (
                  <button
                    onClick={() => goToWorkout(todayWorkout.id, true)}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: "#e0a13d",
                      color: "#1a1306",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: 14,
                    }}
                  >
                    {isWorkoutInProgress(todayWorkout)
                      ? "▶️ Reprendre"
                      : "▶️ Démarrer"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: "#a8a199" }}>
              Pas de séance programmée aujourd'hui
            </div>
          )}
            </>
          )}
        </div>
        )}

        {(
        <div
          style={{
            background: "#151310",
            padding: 20,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 16,
          }}
        >
            {foldHead("weight", "⚖️ Mon poids")}
            {vis("weight") && (
            <>
          {!editingWeight ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 15,
                marginBottom: 15,
              }}
            >
              <div style={{ fontSize: 32, fontWeight: "bold" }}>
                {athleteWeight ? `${athleteWeight} kg` : "Non renseigné"}
              </div>
              <button
                onClick={() => setEditingWeight(true)}
                disabled={!canUpdateWeight}
                style={{
                  padding: "10px 18px",
                  background: canUpdateWeight ? "#e0a13d" : "#2a2620",
                  color: canUpdateWeight ? "#1a1306" : "#a8a199",
                  border: "none",
                  borderRadius: 8,
                  cursor: canUpdateWeight ? "pointer" : "not-allowed",
                  fontSize: 14,
                }}
              >
                ✏️ Modifier
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 15 }}>
              <input
                type="number"
                step="0.1"
                value={athleteWeight}
                onChange={(e) => setAthleteWeight(e.target.value)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #2a2620",
                  background: "#0d0c0a",
                  color: "#f3f0ea",
                  fontSize: 16,
                  marginBottom: 10,
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={saveWeight}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: "#4fae7d",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  ✅
                </button>
                <button
                  onClick={() => {
                    setEditingWeight(false);
                    setAthleteWeight(userProfile?.weight || "");
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: "#d9695a",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {!canUpdateWeight && lastWeightDate && (
            <div style={{ fontSize: 12, color: "#d9a441", marginBottom: 10 }}>
              ⏳ Prochaine modification dans{" "}
              {Math.max(
                0,
                7 - Math.floor((new Date() - lastWeightDate) / 86400000)
              )}{" "}
              jour(s)
            </div>
          )}

          {weightHistory.length > 1 && (
            <div style={{ marginTop: 15 }}>
              <div style={{ fontSize: 13, color: "#a8a199", marginBottom: 10 }}>
                📈 Évolution du poids
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={weightHistory}>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e0a13d" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#e0a13d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                  <XAxis
                    dataKey="date"
                    stroke="#a8a199"
                    fontSize={10}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis
                    stroke="#a8a199"
                    fontSize={10}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                  />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    name="Poids (kg)"
                    stroke="#e0a13d"
                    strokeWidth={2}
                    fill="url(#wGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
            </>
          )}
        </div>
        )}

        {(athleteVma || athleteCmj) && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: 16,
            }}
          >
            {foldHead("vmacmj", "🏃 Ma VMA & 🦘 Mon CMJ")}
            {vis("vmacmj") && (
            <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              {athleteVma && athleteVma.kg != null && (
                <div style={{ background: "#0d0c0a", padding: 15, borderRadius: 10 }}>
                  <div style={{ fontSize: 13, color: "#a8a199", marginBottom: 8 }}>
                    🏃 VMA actuelle
                  </div>
                  <div style={{ fontSize: 22, fontWeight: "bold", color: "#e0a13d", marginBottom: 10 }}>
                    {athleteVma.kg} km/h
                  </div>
                  {athleteVma.history.length > 1 && (
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart
                        data={athleteVma.history.map((item) => ({
                          ...item,
                          dateShort: new Date(item.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                        }))}
                      >
                        <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={9} />
                        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                        <Tooltip
                          contentStyle={{ background: "#1a1815", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, fontSize: 12 }}
                          formatter={(value) => [`${value} km/h`, "VMA"]}
                        />
                        <Line type="monotone" dataKey="kg" stroke="#e0a13d" strokeWidth={2} dot={{ fill: "#e0a13d", r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
              {athleteCmj && athleteCmj.kg != null && (
                <div style={{ background: "#0d0c0a", padding: 15, borderRadius: 10 }}>
                  <div style={{ fontSize: 13, color: "#a8a199", marginBottom: 8 }}>
                    🦘 CMJ actuel
                  </div>
                  <div style={{ fontSize: 22, fontWeight: "bold", color: "#e0a13d", marginBottom: 10 }}>
                    {athleteCmj.kg} cm
                  </div>
                  {athleteCmj.history.length > 1 && (
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart
                        data={athleteCmj.history.map((item) => ({
                          ...item,
                          dateShort: new Date(item.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                        }))}
                      >
                        <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={9} />
                        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                        <Tooltip
                          contentStyle={{ background: "#1a1815", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, fontSize: 12 }}
                          formatter={(value) => [`${value} cm`, "CMJ"]}
                        />
                        <Line type="monotone" dataKey="kg" stroke="#e0a13d" strokeWidth={2} dot={{ fill: "#e0a13d", r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>
            </>
          )}
          </div>
        )}

        {Object.keys(athleteRMFullHistory).length > 0 && (() => {
          const q = rmSearchSelf.trim().toLowerCase();
          const fmtD = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
          const cats = EXERCISE_CATEGORIES.map((cat) => {
            const list = Object.entries(athleteRMFullHistory)
              .filter(([ex]) => (athleteRMCategoriesMap[ex] || "autre") === cat.value)
              .filter(([ex]) => !q || ex.toLowerCase().includes(q))
              .sort((a, b) => a[0].localeCompare(b[0], "fr"));
            return { cat, list };
          }).filter((c) => c.list.length > 0);
          const total = cats.reduce((n, c) => n + c.list.length, 0);
          return (
            <div style={CARD_STYLE}>
              {foldHead("rmhist", "💪 Mes RM")}
              {vis("rmhist") && (
                <>
                  <input
                    type="text"
                    value={rmSearchSelf}
                    onChange={(e) => setRmSearchSelf(e.target.value)}
                    placeholder={`🔍 Chercher un exercice (${Object.keys(athleteRMFullHistory).length})`}
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "#0d0c0a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#f3f0ea", fontSize: 14, outline: "none", marginBottom: 12 }}
                  />
                  {total === 0 && (
                    <div style={{ fontSize: 13, color: "#a8a199", textAlign: "center", padding: 12 }}>Aucun exercice trouvé.</div>
                  )}
                  {cats.map(({ cat, list }) => {
                    const open = q ? true : !!rmOpenCats[cat.value];
                    return (
                      <div key={cat.value} style={{ marginBottom: 8 }}>
                        <button
                          onClick={() => setRmOpenCats((p) => ({ ...p, [cat.value]: !p[cat.value] }))}
                          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#1d1a16", color: "#f3f0ea", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, textAlign: "left" }}
                        >
                          <span>{cat.label} <span style={{ color: "#a8a199", fontWeight: 400 }}>({list.length})</span></span>
                          <span style={{ color: "#a8a199" }}>{open ? "▾" : "▸"}</span>
                        </button>
                        {open && (
                          <div style={{ marginTop: 4 }}>
                            {list.map(([exercise, history]) => {
                              const latest = history[history.length - 1];
                              const prev = history.length > 1 ? history[history.length - 2] : null;
                              const diff = prev ? Math.round((latest.kg - prev.kg) * 10) / 10 : null;
                              const isOpen = !!rmOpenEx[exercise];
                              return (
                                <div key={exercise} style={{ borderBottom: "1px solid #1d1a16" }}>
                                  <div
                                    onClick={() => history.length > 1 && setRmOpenEx((p) => ({ ...p, [exercise]: !p[exercise] }))}
                                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 4px", cursor: history.length > 1 ? "pointer" : "default" }}
                                  >
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 14, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis" }}>{exercise}</div>
                                      <div style={{ fontSize: 11, color: "#a8a199" }}>
                                        {fmtD(latest.date)}
                                        {history.length > 1 ? ` · ${history.length} mesures ${isOpen ? "▾" : "▸"}` : ""}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e0a13d" }}>
                                        {latest.kg} <span style={{ fontSize: 12 }}>kg</span>
                                        {latest.autoAdjusted && <span style={{ fontSize: 12, marginLeft: 4 }}>⚡</span>}
                                      </div>
                                      {diff !== null && diff !== 0 && (
                                        <div style={{ fontSize: 11, color: diff > 0 ? "#4fae7d" : "#d9695a" }}>
                                          {diff > 0 ? "▲ +" : "▼ "}{diff} kg
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {isOpen && history.length > 1 && (
                                    <div style={{ paddingBottom: 10 }}>
                                      <ResponsiveContainer width="100%" height={120}>
                                        <LineChart
                                          data={history.map((item) => ({
                                            ...item,
                                            dateShort: new Date(item.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                                          }))}
                                        >
                                          <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={9} />
                                          <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                                          <Tooltip contentStyle={CHART_TOOLTIP} formatter={(value) => [`${value} kg`, "1RM"]} />
                                          <Line type="monotone" dataKey="kg" stroke="#e0a13d" strokeWidth={2} dot={{ fill: "#e0a13d", r: 3 }} />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

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
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 5px 0" }}>
            📊 Dashboard Admin
          </h2>
          <p style={{ color: "#a8a199", margin: 0, fontSize: 14 }}>
            Suivi wellness et performance
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setMeMode(true)}
            style={{ padding: "12px 20px", background: "#2a2620", color: "#f3f0ea", border: "1px solid #e0a13d", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14 }}
          >
            🌟 Moi (mon dashboard)
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="🔍 Rechercher un athlète..."
          value={athleteSearchQuery}
          onChange={(e) => setAthleteSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#151310",
            border: "2px solid #e0a13d",
            borderRadius: 8,
            color: "#f3f0ea",
            fontSize: 16,
            outline: "none",
          }}
        />
      </div>

      <div
        style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        {[
          {
            key: "total",
            label: `📋 Total (${athletes.length})`,
            color: "#e0a13d",
          },
          {
            key: "risque",
            label: `⚠️ Risque (${
              athletes.filter((a) => a.status?.level === "risk").length
            })`,
            color: "#d9695a",
          },
          {
            key: "fatigue",
            label: `😌 Fatigue (${
              athletes.filter(
                (a) => a.status?.level === "fatigue" || a.status?.level === "watch"
              ).length
            })`,
            color: "#d9a441",
          },
          {
            key: "forme",
            label: `💪 En forme (${
              athletes.filter((a) => a.status?.level === "fit").length
            })`,
            color: "#4fae7d",
          },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setWellnessFilter(f.key)}
            style={{
              padding: "10px 20px",
              background: wellnessFilter === f.key ? f.color : "#2a2a2a",
              color: "white",
              border: `2px solid ${
                wellnessFilter === f.key ? f.color : "rgba(255,255,255,0.16)"
              }`,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: "bold",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {athletes.length === 0 ? (
        <div
          style={{
            background: "#151310",
            padding: 40,
            borderRadius: 12,
            textAlign: "center",
            border: "2px solid #d9695a",
          }}
        >
          <h3 style={{ color: "#d9695a" }}>⚠️ Aucun athlète trouvé</h3>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((athlete) => (
            <div
              key={athlete.id}
              onClick={() => loadAthleteDetail(athlete)}
              style={{
                background: "#151310",
                padding: 18,
                borderRadius: 10,
                border: `2px solid ${athlete.status?.color || "rgba(255,255,255,0.16)"}`,
                cursor: "pointer",
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
                      margin: "0 0 6px 0",
                      fontSize: 18,
                      fontWeight: "bold",
                    }}
                  >
                    {getAthleteName(athlete)}
                  </h4>
                  {athlete.crossStatus && (
                    <span
                      title={athlete.crossStatus.detail}
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: "bold",
                        color: athlete.crossStatus.color,
                        background: "rgba(255,255,255,0.06)",
                        border: `1px solid ${athlete.crossStatus.color}`,
                        borderRadius: 6,
                        padding: "2px 8px",
                        marginBottom: 6,
                      }}
                    >
                      {athlete.crossStatus.emoji} {athlete.crossStatus.label}
                    </span>
                  )}
                  <div style={{ fontSize: 13, color: "#a8a199" }}>
                    Groupe : {athlete.group || "total"}
                    {athlete.todayWorkoutTitle && (
                      <span style={{ marginLeft: 12 }}>
                        {athlete.todayCompleted ? (
                          <span
                            style={{ color: "#4fae7d", fontWeight: "bold" }}
                          >
                            ✅ {athlete.todayWorkoutTitle}
                          </span>
                        ) : athlete.todayWorkoutInProgress ? (
                          <span
                            style={{ color: "#d9a441", fontWeight: "bold" }}
                          >
                            ⏳ {athlete.todayWorkoutTitle}
                          </span>
                        ) : (
                          <span style={{ color: "#d9695a" }}>
                            ❌ {athlete.todayWorkoutTitle}
                          </span>
                        )}
                      </span>
                    )}
                    {!athlete.todayWorkoutTitle && (
                      <span style={{ marginLeft: 12, color: "#a8a199" }}>
                        Pas de séance aujourd'hui
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  {athlete.wellnessScore !== null && (
                    <div style={{ textAlign: "center", minWidth: 75 }}>
                      <div
                        style={{ fontSize: 10, color: "#a8a199", marginBottom: 3 }}
                      >
                        WELLNESS
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: "bold",
                          color: athlete.wellnessStatus.color,
                        }}
                      >
                        {athlete.wellnessScore.toFixed(1)}
                      </div>
                      <div
                        style={{ fontSize: 11, color: athlete.wellnessStatus.color }}
                      >
                        {athlete.wellnessStatus.emoji} {athlete.wellnessStatus.label}
                      </div>
                    </div>
                  )}
                  {athlete.acwr !== null && (
                    <div style={{ textAlign: "center", minWidth: 75 }}>
                      <div
                        style={{ fontSize: 10, color: "#a8a199", marginBottom: 3 }}
                      >
                        REDI
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: "bold",
                          color: athlete.acwrStatus.color,
                        }}
                      >
                        {athlete.acwr}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: athlete.acwrStatus.color,
                        }}
                      >
                        {athlete.acwrStatus.label}
                      </div>
                    </div>
                  )}
                  {athlete.wellnessZ !== null && (
                    <div style={{ textAlign: "center", minWidth: 75 }}>
                      <div
                        style={{ fontSize: 10, color: "#a8a199", marginBottom: 3 }}
                      >
                        Z-SCORE
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: "bold",
                          color: athlete.wellnessZStatus.color,
                        }}
                      >
                        {athlete.wellnessZ.toFixed(1)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: athlete.wellnessZStatus.color,
                        }}
                      >
                        {athlete.wellnessZStatus.label}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAthleteDetail && athleteDetails && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.95)",
            zIndex: 1000,
            overflowY: "auto",
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              background: "#0d0c0a",
              borderRadius: 12,
              padding: 30,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 25,
                borderBottom: "2px solid #e0a13d",
                paddingBottom: 15,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 24 }}>
                📊 {getAthleteName(showAthleteDetail)}
              </h2>
              <button
                onClick={() => {
                  setShowAthleteDetail(null);
                  setAthleteDetails(null);
                  setDetailedAthleteRMHistory({});
                  setAcwrHistory([]);
                }}
                style={{
                  padding: "10px 20px",
                  background: "#d9695a",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                ✕ Fermer
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 15,
                marginBottom: 25,
              }}
            >
              {showAthleteDetail.wellnessScore !== null && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    WELLNESS
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: showAthleteDetail.wellnessStatus.color,
                    }}
                  >
                    {showAthleteDetail.wellnessScore.toFixed(1)}/10
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: showAthleteDetail.wellnessStatus.color,
                      marginTop: 4,
                    }}
                  >
                    {showAthleteDetail.wellnessStatus.emoji}{" "}
                    {showAthleteDetail.wellnessStatus.label}
                  </div>
                </div>
              )}
              {athleteDetails.weeklyAvg && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    MOY. HEBDOMADAIRE
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: "#4fae7d",
                    }}
                  >
                    {athleteDetails.weeklyAvg}/10
                  </div>
                </div>
              )}
              {showAthleteDetail.acwr !== null && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    REDI
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: showAthleteDetail.acwrStatus.color,
                    }}
                  >
                    {showAthleteDetail.acwr}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: showAthleteDetail.acwrStatus.color,
                    }}
                  >
                    {showAthleteDetail.acwrStatus.label}
                  </div>
                </div>
              )}
              {showAthleteDetail.wellnessZ !== null && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    Z-SCORE WELLNESS
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: showAthleteDetail.wellnessZStatus.color,
                    }}
                  >
                    {showAthleteDetail.wellnessZ.toFixed(1)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: showAthleteDetail.wellnessZStatus.color,
                    }}
                  >
                    {showAthleteDetail.wellnessZStatus.label}
                  </div>
                </div>
              )}
              {showAthleteDetail.cmjStatus?.pctChange !== null && showAthleteDetail.cmjStatus?.pctChange !== undefined && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    CMJ (vs baseline)
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: showAthleteDetail.cmjStatus.color,
                    }}
                  >
                    {showAthleteDetail.cmjStatus.pctChange > 0 ? "+" : ""}
                    {showAthleteDetail.cmjStatus.pctChange}%
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: showAthleteDetail.cmjStatus.color,
                    }}
                  >
                    {showAthleteDetail.cmjStatus.label}
                  </div>
                </div>
              )}
              {showAthleteDetail.rpeReliability?.sd !== null && showAthleteDetail.rpeReliability?.sd !== undefined && (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                    FIABILITÉ RPE
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: showAthleteDetail.rpeReliabilityStatus.color,
                    }}
                  >
                    σ {showAthleteDetail.rpeReliability.sd}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: showAthleteDetail.rpeReliabilityStatus.color,
                    }}
                  >
                    {showAthleteDetail.rpeReliabilityStatus.label}
                  </div>
                </div>
              )}
              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                  POIDS
                </div>
                <div
                  style={{ fontSize: 30, fontWeight: "bold", color: "#e0a13d" }}
                >
                  {showAthleteDetail.weight
                    ? `${showAthleteDetail.weight} kg`
                    : "N/A"}
                </div>
              </div>

              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 5 }}>
                  SÉANCES
                </div>
                <div
                  style={{ fontSize: 30, fontWeight: "bold", color: "#4fae7d" }}
                >
                  {showAthleteDetail.completedSessions || 0} / {showAthleteDetail.totalSessions || 0}
                </div>
                <div style={{ fontSize: 12, color: "#a8a199", marginTop: 4 }}>
                  {showAthleteDetail.totalSessions > 0
                    ? `${Math.round((showAthleteDetail.completedSessions / showAthleteDetail.totalSessions) * 100)}%`
                    : "0%"}
                </div>
              </div>
            </div>

            {showAthleteDetail.cmjEntries && showAthleteDetail.cmjEntries.length > 1 && (
              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  marginBottom: 25,
                  border: "1px solid rgba(255,255,255,0.16)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: sectionVisibility.cmjSessions ? 12 : 0,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16, color: "#d9a441" }}>
                    🦘 Évolution CMJ (détente verticale)
                  </h3>
                  <SectionToggleBtn sectionKey="cmjSessions" />
                </div>
                {sectionVisibility.cmjSessions && (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={showAthleteDetail.cmjEntries.map((e) => ({
                      ...e,
                      shortDate: new Date(e.date).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                      }),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis dataKey="shortDate" stroke="#a8a199" fontSize={11} />
                    <YAxis stroke="#a8a199" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#1a1815",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      formatter={(value) => [`${value} cm`, "CMJ"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="heightCm"
                      name="CMJ (cm)"
                      stroke="#d9a441"
                      strokeWidth={2.5}
                      dot={{ fill: "#d9a441", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            )}

            {showAthleteDetail.crossStatus && (() => {
              const cs = showAthleteDetail.crossStatus;
              const dom = cs.domains || { load: 0, wellness: 0, neural: 0 };
              const sevColor = (v) => (v >= 2 ? "#d9695a" : v === 1 ? "#d9a441" : "#4fae7d");
              const sevText = (v) => (v >= 2 ? "Alerte" : v === 1 ? "Vigilance" : "OK");
              const nl2 = showAthleteDetail.neural;
              const hasLoad = showAthleteDetail.acwr !== null && showAthleteDetail.acwr !== undefined;
              const hasWell = showAthleteDetail.wellnessZ !== null && showAthleteDetail.wellnessZ !== undefined || showAthleteDetail.wellnessScore !== null;
              const cmjPct = showAthleteDetail.cmjStatus ? showAthleteDetail.cmjStatus.pctChange : null;
              const hasNeu = (nl2 && nl2.evaluated > 0) || (cmjPct !== null && cmjPct !== undefined);
              const tiles = [
                {
                  icon: "⚙️",
                  title: "Charge d'entraînement",
                  has: hasLoad,
                  sev: dom.load,
                  value: hasLoad ? `REDI ${Number(showAthleteDetail.acwr).toFixed(2)}` : "—",
                  caption: hasLoad ? showAthleteDetail.acwrStatus.label : "Pas assez de séances",
                },
                {
                  icon: "🧘",
                  title: "Bien-être (wellness)",
                  has: hasWell,
                  sev: dom.wellness,
                  value:
                    showAthleteDetail.wellnessZ !== null && showAthleteDetail.wellnessZ !== undefined
                      ? `z = ${showAthleteDetail.wellnessZ.toFixed(1)}`
                      : showAthleteDetail.wellnessScore !== null
                        ? `${showAthleteDetail.wellnessScore.toFixed(1)}/10`
                        : "—",
                  caption: hasWell ? showAthleteDetail.wellnessZStatus.label : "Pas de questionnaire",
                },
                {
                  icon: "🧠",
                  title: "Fatigue nerveuse",
                  has: hasNeu,
                  sev: dom.neural,
                  value: hasNeu ? sevText(dom.neural) : "—",
                  caption:
                    nl2 && nl2.evaluated > 0
                      ? `Force : séance du ${nl2.date.slice(8, 10)}/${nl2.date.slice(5, 7)}`
                      : cmjPct !== null && cmjPct !== undefined
                        ? `CMJ ${cmjPct > 0 ? "+" : ""}${cmjPct}%`
                        : "Pas de séance de force récente",
                },
              ];
              return (
                <div
                  style={{
                    background: "#151310",
                    padding: 18,
                    borderRadius: 12,
                    border: `2px solid ${cs.color}`,
                    marginBottom: 25,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          background: `${cs.color}26`,
                          border: `2px solid ${cs.color}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 28,
                          flexShrink: 0,
                        }}
                      >
                        {cs.emoji}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "#a8a199", textTransform: "uppercase", letterSpacing: 0.5 }}>
                          État de forme
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: cs.color, lineHeight: 1.15 }}>{cs.label}</div>
                      </div>
                    </div>
                    <SectionToggleBtn sectionKey="cross" />
                  </div>

                  {sectionVisibility.cross && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
                        {tiles.map((t) => {
                          const col = t.has ? sevColor(t.sev) : "#4a453d";
                          return (
                            <div key={t.title} style={{ background: "#0d0c0a", borderRadius: 10, padding: 12, border: `1px solid ${t.has ? col + "66" : "rgba(255,255,255,0.06)"}` }}>
                              <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 6 }}>
                                {t.icon} {t.title}
                              </div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: t.has ? col : "#6f6a62", marginBottom: 8 }}>{t.value}</div>
                              <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                                {[0, 1, 2].map((k) => (
                                  <div
                                    key={k}
                                    style={{
                                      flex: 1,
                                      height: 7,
                                      borderRadius: 4,
                                      background: t.has && k <= t.sev ? sevColor(k === 0 && t.sev === 0 ? 0 : t.sev) : "rgba(255,255,255,0.08)",
                                    }}
                                  />
                                ))}
                              </div>
                              <div style={{ fontSize: 11, color: t.has ? col : "#6f6a62" }}>{t.caption}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f3f0ea", marginBottom: 8 }}>Pourquoi ce statut ?</div>
                        {cs.reasons && cs.reasons.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {cs.reasons.map((r, idx) => (
                              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#f0d9ae", background: "rgba(224,161,61,0.08)", border: "1px solid rgba(224,161,61,0.25)", borderRadius: 8, padding: "7px 10px" }}>
                                <span>⚠️</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "#4fae7d", background: "rgba(79,174,125,0.1)", border: "1px solid rgba(79,174,125,0.3)", borderRadius: 8, padding: "8px 10px" }}>
                            ✅ Aucun signal : charge, bien-être et performance dans la norme de l'athlète.
                          </div>
                        )}
                      </div>

                      {nl2 && nl2.evaluated > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#f3f0ea", marginBottom: 8 }}>
                            🏋️ Performance en force — séance du {nl2.date.slice(8, 10)}/{nl2.date.slice(5, 7)}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {nl2.exercises.map((e) => {
                              const ratio = e.rmRatio;
                              const bad = e.reasons.length > 0;
                              return (
                                <div key={e.key}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 4, flexWrap: "wrap" }}>
                                    <span style={{ color: bad ? "#d9695a" : "#f3f0ea", fontWeight: 600 }}>{e.name}</span>
                                    <span style={{ color: "#a8a199" }}>
                                      e1RM {e.e1rm} kg
                                      {e.dropPct !== null && (
                                        <span style={{ marginLeft: 8, fontWeight: 700, color: e.dropPct > 15 ? "#d9695a" : e.dropPct > 0 ? "#d9a441" : "#4fae7d" }}>
                                          {e.dropPct > 0 ? "−" : "+"}
                                          {Math.abs(e.dropPct)}% vs préc.
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {ratio !== null ? (
                                    <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 5 }}>
                                      <div style={{ width: `${Math.min(100, ratio)}%`, height: "100%", borderRadius: 5, background: ratio < 80 ? "#d9695a" : "#4fae7d" }} />
                                      <div style={{ position: "absolute", left: "80%", top: -3, bottom: -3, width: 2, background: "#f3f0ea" }} title="Seuil 80 % du RM" />
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 11, color: "#6f6a62" }}>RM non renseigné pour cet exercice</div>
                                  )}
                                  {ratio !== null && (
                                    <div style={{ fontSize: 11, color: ratio < 80 ? "#d9695a" : "#a8a199", marginTop: 3 }}>
                                      {ratio}% du RM enregistré (seuil 80 %)
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: 11, color: "#6f6a62", lineHeight: 1.5 }}>
                        Fatigue nerveuse : 1RM estimé via charge × reps × RPE. Signal si chute &gt; 15 % vs séance précédente ou si le 1RM estimé est &lt; 80 % du RM enregistré.
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {showAthleteDetail.injuries && (
              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  marginBottom: 25,
                  border: "1px solid rgba(217,105,90,0.4)",
                }}
              >
                <button
                  onClick={() => setShowInjuryHistory((v) => !v)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "#d9695a",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16, color: "#d9695a" }}>
                    🚑 Historique de blessures ({showAthleteDetail.injuries.length})
                  </h3>
                  <span style={{ fontSize: 13, color: "#a8a199" }}>
                    {showInjuryHistory ? "▾ Réduire" : "▸ Voir / modifier"}
                  </span>
                </button>

                {showInjuryHistory && (
                  <div style={{ marginTop: 14 }}>
                    {showAthleteDetail.injuries.length === 0 && (
                      <div style={{ fontSize: 13, color: "#a8a199" }}>
                        Aucune blessure enregistrée. Ajoute-en depuis Tests › Bilan.
                      </div>
                    )}
                    {showAthleteDetail.injuries.map((inj) =>
                      editingInjury === inj.id ? (
                        <div
                          key={inj.id}
                          style={{
                            background: "#1a1815",
                            padding: 14,
                            borderRadius: 8,
                            marginBottom: 10,
                            border: "1px solid rgba(217,105,90,0.4)",
                          }}
                        >
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <div>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Date</label>
                              <input
                                type="date"
                                value={injuryEditDraft?.date || ""}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, date: e.target.value }))}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea" }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Zone</label>
                              <input
                                type="text"
                                value={injuryEditDraft?.zone || ""}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, zone: e.target.value }))}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea" }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Tissu</label>
                              <select
                                value={injuryEditDraft?.tissueType || "muscle"}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, tissueType: e.target.value }))}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea" }}
                              >
                                {Object.entries(TISSUE_LABELS).map(([k, label]) => (
                                  <option key={k} value={k}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Mécanisme</label>
                              <select
                                value={injuryEditDraft?.mechanism || "surcharge"}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, mechanism: e.target.value }))}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea" }}
                              >
                                {Object.entries(MECHANISM_LABELS).map(([k, label]) => (
                                  <option key={k} value={k}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Jours d'arrêt</label>
                              <input
                                type="number"
                                min="0"
                                value={injuryEditDraft?.daysLost ?? ""}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, daysLost: e.target.value }))}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea" }}
                              />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={{ fontSize: 11, color: "#a8a199" }}>Notes</label>
                              <textarea
                                value={injuryEditDraft?.notes || ""}
                                onChange={(e) => setInjuryEditDraft((d) => ({ ...d, notes: e.target.value }))}
                                rows={2}
                                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "#151310", color: "#f3f0ea", resize: "vertical" }}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={async () => {
                                try {
                                  const payload = {
                                    date: injuryEditDraft.date,
                                    zone: injuryEditDraft.zone || "",
                                    tissueType: injuryEditDraft.tissueType,
                                    mechanism: injuryEditDraft.mechanism,
                                    daysLost: injuryEditDraft.daysLost !== "" ? Number(injuryEditDraft.daysLost) : null,
                                    notes: injuryEditDraft.notes || "",
                                  };
                                  await updateDoc(doc(db, "injuries", inj.id), payload);
                                  setShowAthleteDetail((prev) => ({
                                    ...prev,
                                    injuries: prev.injuries.map((i) => (i.id === inj.id ? { ...i, ...payload } : i)),
                                  }));
                                  setEditingInjury(null);
                                  setInjuryEditDraft(null);
                                } catch (e) {
                                  alert("Erreur : " + e.message);
                                }
                              }}
                              style={{ padding: "8px 14px", background: "#4fae7d", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                            >
                              ✅ Enregistrer
                            </button>
                            <button
                              onClick={() => { setEditingInjury(null); setInjuryEditDraft(null); }}
                              style={{ padding: "8px 14px", background: "transparent", color: "#a8a199", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={inj.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 13,
                            color: "#a8a199",
                            marginBottom: 8,
                            paddingBottom: 8,
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div>
                            <strong style={{ color: "#f3f0ea" }}>{inj.date}</strong>
                            {inj.zone ? ` — ${inj.zone}` : ""}{" "}
                            {inj.tissueType && `(${TISSUE_LABELS[inj.tissueType] || inj.tissueType}${inj.mechanism ? `, ${MECHANISM_LABELS[inj.mechanism] || inj.mechanism}` : ""})`}
                            {inj.daysLost !== null && inj.daysLost !== undefined ? ` — ${inj.daysLost}j d'arrêt` : ""}
                            {inj.notes ? <div style={{ fontSize: 12, marginTop: 2 }}>{inj.notes}</div> : null}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 10 }}>
                            <button
                              onClick={() => {
                                setEditingInjury(inj.id);
                                setInjuryEditDraft({
                                  date: inj.date || "",
                                  zone: inj.zone || "",
                                  tissueType: inj.tissueType || "muscle",
                                  mechanism: inj.mechanism || "surcharge",
                                  daysLost: inj.daysLost !== null && inj.daysLost !== undefined ? String(inj.daysLost) : "",
                                  notes: inj.notes || "",
                                });
                              }}
                              style={{ padding: "5px 10px", background: "transparent", color: "#e0a13d", border: "1px solid rgba(224,161,61,0.4)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                            >
                              Modifier
                            </button>
                            <button
                              onClick={async () => {
                                if (!window.confirm("Supprimer cette blessure de l'historique ?")) return;
                                try {
                                  await deleteDoc(doc(db, "injuries", inj.id));
                                  setShowAthleteDetail((prev) => ({
                                    ...prev,
                                    injuries: prev.injuries.filter((i) => i.id !== inj.id),
                                  }));
                                } catch (e) {
                                  alert("Erreur suppression : " + e.message);
                                }
                              }}
                              style={{ padding: "5px 10px", background: "transparent", color: "#d9695a", border: "1px solid rgba(217,105,90,0.4)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                background: "#151310",
                padding: 18,
                borderRadius: 10,
                marginBottom: 25,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: sectionVisibility.todayWorkout ? 12 : 0,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 17 }}>
                  🏋️ Séance aujourd'hui
                </h3>
                <SectionToggleBtn sectionKey="todayWorkout" />
              </div>
              {sectionVisibility.todayWorkout && (
              athleteDetails.todayWorkout ? (
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      marginBottom: 8,
                    }}
                  >
                    {athleteDetails.todayWorkout.title}
                  </div>
                  {isWorkoutCompleted(athleteDetails.todayWorkout, showAthleteDetail.id) ? (
                    <div
                      style={{
                        padding: 12,
                        background: "rgba(79,174,125,0.14)",
                        borderRadius: 8,
                        color: "#4fae7d",
                        fontWeight: "bold",
                      }}
                    >
                      ✅ Validée –{" "}
                      {new Date(
                        getUserProgress(athleteDetails.todayWorkout, showAthleteDetail.id)?.completedAt
                      ).toLocaleString("fr-FR")}
                    </div>
                  ) : isWorkoutInProgress(athleteDetails.todayWorkout, showAthleteDetail.id) ? (
                    <div
                      style={{
                        padding: 12,
                        background: "rgba(217,164,65,0.14)",
                        borderRadius: 8,
                        color: "#d9a441",
                        fontWeight: "bold",
                      }}
                    >
                      ⏳ En cours
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 12,
                        background: "rgba(217,105,90,0.14)",
                        borderRadius: 8,
                        color: "#d9695a",
                        fontWeight: "bold",
                      }}
                    >
                      ❌ Non démarrée
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#a8a199", fontSize: 14 }}>
                  Pas de séance programmée
                </div>
              )
              )}
            </div>

            {/* Séances de l'athlète + feedbacks (RPE, charges, commentaires) */}
            <div
              style={{
                background: "#151310",
                padding: 20,
                borderRadius: 10,
                marginBottom: 25,
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>
                📋 Séances & feedbacks
              </h3>
              {(() => {
                const all = athleteDetails.sessions || [];
                if (all.length === 0) {
                  return (
                    <div style={{ color: "#a8a199", fontSize: 14 }}>
                      Aucune séance pour cet athlète
                    </div>
                  );
                }
                const uid = showAthleteDetail.id;
                const visible = showAllAthleteSessions ? all : all.slice(0, 15);
                return (
                  <>
                    {visible.map((w) => {
                      const done = isWorkoutCompleted(w, uid);
                      const inProg = isWorkoutInProgress(w, uid);
                      const fbAll = getUserFeedback(w, uid);
                      const avg = calcSessionAvgRPE(w, uid);
                      const open = !!expandedSessionIds[w.id];
                      const status = done
                        ? { t: "✅ Validée", c: "#4fae7d" }
                        : inProg
                        ? { t: "⏳ En cours", c: "#d9a441" }
                        : { t: "Non faite", c: "#a8a199" };
                      return (
                        <div
                          key={w.id}
                          style={{
                            background: "#0d0c0a",
                            borderRadius: 8,
                            marginBottom: 8,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            onClick={() =>
                              setExpandedSessionIds((p) => ({ ...p, [w.id]: !p[w.id] }))
                            }
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                              padding: "10px 12px",
                              background: "none",
                              border: "none",
                              color: "#f3f0ea",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 14 }}>
                              <strong>{w.title || "Séance"}</strong>
                              <span style={{ color: "#a8a199", marginLeft: 8, fontSize: 12 }}>
                                {w.date
                                  ? new Date(w.date + "T12:00:00").toLocaleDateString("fr-FR")
                                  : ""}
                              </span>
                            </span>
                            <span style={{ fontSize: 12, color: status.c, whiteSpace: "nowrap" }}>
                              {status.t}
                              {avg !== null && ` · RPE moy. ${avg.toFixed(1)}`}{" "}
                              {open ? "▾" : "▸"}
                            </span>
                          </button>
                          {open && (
                            <div style={{ padding: "0 12px 12px 12px" }}>
                              {Object.keys(fbAll).length === 0 ? (
                                <div style={{ color: "#a8a199", fontSize: 13 }}>
                                  Aucun feedback saisi
                                </div>
                              ) : (
                                (w.blocks || []).map((block, bIdx) =>
                                  (block.exercises || []).map((ex, eIdx) => {
                                    const fb = fbAll[`${bIdx}-${eIdx}`];
                                    if (!fb) return null;
                                    const legacy =
                                      fb.actualWeight !== undefined && !fb.series
                                        ? [{ set: 1, actualWeight: fb.actualWeight, actualReps: fb.actualReps, rpe: fb.rpe }]
                                        : null;
                                    const series = fb.series || legacy;
                                    const cmj = isCMJName(ex.name);
                                    return (
                                      <div
                                        key={`${bIdx}-${eIdx}`}
                                        style={{
                                          padding: 10,
                                          background: "#151310",
                                          borderRadius: 6,
                                          marginTop: 8,
                                          fontSize: 13,
                                        }}
                                      >
                                        <div style={{ fontWeight: "bold", color: "#e0a13d", marginBottom: 4 }}>
                                          {ex.name || "Exercice"}
                                        </div>
                                        {series ? (
                                          series.map((s, i) => (
                                            <div key={i}>
                                              Série {s.set || i + 1} :{" "}
                                              {cmj
                                                ? `${s.actualWeight} cm`
                                                : `${s.actualWeight} kg × ${s.actualReps}`}
                                              {" · "}RPE {s.rpe}/10
                                            </div>
                                          ))
                                        ) : (
                                          <div>
                                            {fb.actualDistance !== undefined && `${fb.actualDistance} m · `}
                                            {fb.actualRounds !== undefined && `${fb.actualRounds} tours · `}
                                            RPE {fb.rpe}/10
                                          </div>
                                        )}
                                        {fb.notes && (
                                          <div style={{ marginTop: 6, color: "#9fd4b0", fontStyle: "italic" }}>
                                            📝 {fb.notes}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {all.length > 15 && (
                      <button
                        onClick={() => setShowAllAthleteSessions((v) => !v)}
                        style={{
                          marginTop: 6,
                          padding: "8px 14px",
                          background: "#2a2620",
                          color: "#f3f0ea",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        {showAllAthleteSessions
                          ? "Voir moins"
                          : `Voir toutes les séances (${all.length})`}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {showAthleteDetail.lastWellness &&
              showAthleteDetail.lastWellness.douleur > 0 && (
                <div
                  style={{
                    background: "rgba(217,105,90,0.14)",
                    padding: 18,
                    borderRadius: 10,
                    border: "2px solid #d9695a",
                    marginBottom: 25,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: sectionVisibility.pain ? 12 : 0,
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        color: "#d9695a",
                        fontSize: 16,
                      }}
                    >
                      ⚠️ Douleurs signalées
                    </h4>
                    <SectionToggleBtn sectionKey="pain" />
                  </div>
                  {sectionVisibility.pain && (
                  <>
                  <div
                    style={{
                      marginBottom: 15,
                      padding: 12,
                      background: "rgba(217,105,90,0.14)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#e8998c",
                        marginBottom: 4,
                      }}
                    >
                      INTENSITÉ GLOBALE
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: "bold",
                        color: "#d9695a",
                      }}
                    >
                      {showAthleteDetail.lastWellness.douleur}/10
                    </div>
                  </div>

                  {showAthleteDetail.lastWellness.painMap &&
                    Object.keys(showAthleteDetail.lastWellness.painMap)
                      .length > 0 && (
                      <div style={{ marginTop: 15 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#e8998c",
                            marginBottom: 15,
                            fontWeight: "bold",
                          }}
                        >
                          📍 LOCALISATION DES DOULEURS :
                        </div>
                        <BodyScan
                          painMap={showAthleteDetail.lastWellness.painMap}
                          painTypes={showAthleteDetail.lastWellness.painTypes || {}}
                          setPainMap={() => {}}
                        />
                      </div>
                    )}
                  </>
                  )}
                </div>
              )}

            {acwrHistory.length > 0 ? (
              <div
                style={{
                  background: "#151310",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: sectionVisibility.redi ? 15 : 0,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 17 }}>
                    📊 Évolution REDI
                  </h3>
                  <SectionToggleBtn sectionKey="redi" />
                </div>
                {sectionVisibility.redi && (
                <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={acwrHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis
                      dataKey="date"
                      stroke="#a8a199"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis stroke="#a8a199" fontSize={11} domain={[0, 2]} />
                    <Tooltip
                      contentStyle={{
                        background: "#0d0c0a",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="acwr"
                      name="REDI"
                      stroke="#e0a13d"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div
                  style={{
                    fontSize: 12,
                    color: "#a8a199",
                    marginTop: 10,
                    textAlign: "center",
                  }}
                >
                  Zone optimale: 0.8 - 1.3 | Zone attention: 1.3 - 1.5 |
                  Surcharge: {'>'} 1.5
                </div>
                </>
                )}
              </div>
            ) : (
              <div
                style={{
                  background: "#151310",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                  textAlign: "center",
                }}
              >
                <h3
                  style={{ margin: "0 0 10px 0", fontSize: 17, color: "#a8a199" }}
                >
                  📊 REDI
                </h3>
                <p style={{ color: "#a8a199", fontSize: 14 }}>
                  Données insuffisantes (aucune séance complétée avec RPE
                  renseigné récemment)
                </p>
              </div>
            )}

            {athleteDetails.wellness.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#a8a199", fontWeight: "bold" }}>
                    🧠 Wellness
                  </span>
                  <SectionToggleBtn sectionKey="wellness" />
                </div>
                {sectionVisibility.wellness && (
                <>
                <div
                  style={{
                    background: "#151310",
                    padding: 20,
                    borderRadius: 10,
                    marginBottom: 20,
                  }}
                >
                  <h3 style={{ margin: "0 0 4px 0", fontSize: 17, color: "#d9695a" }}>
                    ⚠️ Indicateurs à surveiller
                  </h3>
                  <p style={{ margin: "0 0 15px 0", fontSize: 12, color: "#a8a199" }}>
                    Fatigue, stress, douleur — plus haut = plus préoccupant
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={athleteDetails.wellness.map((e) => ({
                        ...e,
                        shortDate: new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="shortDate" stroke="#a8a199" fontSize={11} />
                      <YAxis domain={[0, 10]} stroke="#a8a199" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "#1a1815",
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "#f3f0ea" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="#d9695a" strokeWidth={2} strokeDasharray="0" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="stress" name="Stress" stroke="#e0a13d" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="douleur" name="Douleur" stroke="#b06fd9" strokeWidth={2} strokeDasharray="2 3" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div
                  style={{
                    background: "#151310",
                    padding: 20,
                    borderRadius: 10,
                    marginBottom: 25,
                  }}
                >
                  <h3 style={{ margin: "0 0 4px 0", fontSize: 17, color: "#4fae7d" }}>
                    ✅ Indicateurs positifs
                  </h3>
                  <p style={{ margin: "0 0 15px 0", fontSize: 12, color: "#a8a199" }}>
                    Sommeil, nutrition, hydratation, motivation — plus haut = mieux
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={athleteDetails.wellness.map((e) => ({
                        ...e,
                        shortDate: new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="shortDate" stroke="#a8a199" fontSize={11} />
                      <YAxis domain={[0, 10]} stroke="#a8a199" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "#1a1815",
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "#f3f0ea" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="sommeil" name="Sommeil" stroke="#2f9e78" strokeWidth={2} strokeDasharray="0" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="nutrition" name="Nutrition" stroke="#3d7fd9" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="hydratation" name="Hydratation" stroke="#29b6c9" strokeWidth={2} strokeDasharray="2 3" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="motivation" name="Motivation" stroke="#a4c639" strokeWidth={2} strokeDasharray="8 3 2 3" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                </>
                )}
              </>
            )}

            {athleteDetails.weightHistory.length > 0 && (
              <div
                style={{
                  background: "#151310",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: sectionVisibility.weight ? 15 : 0,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 17 }}>
                    ⚖️ Évolution du poids
                  </h3>
                  <SectionToggleBtn sectionKey="weight" />
                </div>
                {sectionVisibility.weight && (
                <>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={athleteDetails.weightHistory}>
                    <defs>
                      <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#e0a13d"
                          stopOpacity={0.7}
                        />
                        <stop
                          offset="95%"
                          stopColor="#e0a13d"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis
                      dataKey="date"
                      stroke="#a8a199"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis
                      stroke="#a8a199"
                      fontSize={11}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0d0c0a",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      name="Poids (kg)"
                      stroke="#e0a13d"
                      strokeWidth={2}
                      fill="url(#pGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div
                  style={{
                    textAlign: "center",
                    marginTop: 10,
                    fontSize: 13,
                    color: "#a8a199",
                  }}
                >
                  Poids actuel:{" "}
                  <strong style={{ color: "#e0a13d" }}>
                    {
                      athleteDetails.weightHistory[
                        athleteDetails.weightHistory.length - 1
                      ].weight
                    }{" "}
                    kg
                  </strong>
                </div>
                </>
                )}
              </div>
            )}

            {showAthleteDetail && (
              <div
                style={{ background: "#151310", padding: 20, borderRadius: 10 }}
              >
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17, color: "#f3f0ea" }}>
                  🏃 VMA & 🦘 CMJ
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 20,
                  }}
                >
                  <div style={{ background: "#0d0c0a", padding: 15, borderRadius: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: sectionVisibility.vma ? 12 : 0,
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: 15, color: "#e0a13d" }}>
                        🏃 VMA
                      </h4>
                      <SectionToggleBtn sectionKey="vma" />
                    </div>
                    {sectionVisibility.vma && (
                    <>
                    {athleteDetails.vma && athleteDetails.vma.history.length > 1 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart
                          data={athleteDetails.vma.history.map((item) => ({
                            ...item,
                            dateShort: new Date(item.date).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                            }),
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={10} />
                          <YAxis stroke="#a8a199" fontSize={10} domain={["dataMin - 1", "dataMax + 1"]} />
                          <Tooltip
                            contentStyle={{ background: "#1a1815", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "#f3f0ea" }}
                            formatter={(value) => [`${value} km/h`, "VMA"]}
                          />
                          <Line type="monotone" dataKey="kg" name="VMA (km/h)" stroke="#e0a13d" strokeWidth={2.5} dot={{ fill: "#e0a13d", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ textAlign: "center", padding: 20, color: "#a8a199", fontSize: 14 }}>
                        {athleteDetails.vma?.kg != null ? "1 seul point" : "Non renseignée"}
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 13, color: "#a8a199", textAlign: "center" }}>
                      VMA actuelle :{" "}
                      <strong style={{ color: "#e0a13d" }}>
                        {athleteDetails.vma?.kg != null ? `${athleteDetails.vma.kg} km/h` : "—"}
                      </strong>
                    </div>
                    {/* Saisie manuelle par le coach — contribue au même
                        historique que si l'athlète l'avait renseignée
                        lui-même depuis "Mes RM". */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Ex: 15.5"
                        value={vmaCmjInput.vma}
                        onChange={(e) =>
                          setVmaCmjInput((p) => ({ ...p, vma: e.target.value }))
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: 8,
                          borderRadius: 6,
                          border: "1px solid #2a2620",
                          background: "#151310",
                          color: "#f3f0ea",
                        }}
                      />
                      <button
                        disabled={savingVmaCmj === "vma"}
                        onClick={() => saveManualVmaCmj("vma")}
                        style={{
                          padding: "0 14px",
                          background: "#4fae7d",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: savingVmaCmj === "vma" ? "wait" : "pointer",
                          fontWeight: "bold",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {savingVmaCmj === "vma" ? "…" : "✅ Enregistrer"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "#a8a199", marginTop: 4 }}>
                      💡 À remplir toi-même si l'athlète oublie — contribue à son évolution.
                    </div>
                    </>
                    )}
                  </div>
                  <div style={{ background: "#0d0c0a", padding: 15, borderRadius: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: sectionVisibility.cmj ? 12 : 0,
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: 15, color: "#e0a13d" }}>
                        🦘 CMJ
                      </h4>
                      <SectionToggleBtn sectionKey="cmj" />
                    </div>
                    {sectionVisibility.cmj && (
                    <>
                    {athleteDetails.cmj && athleteDetails.cmj.history.length > 1 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart
                          data={athleteDetails.cmj.history.map((item) => ({
                            ...item,
                            dateShort: new Date(item.date).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                            }),
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={10} />
                          <YAxis stroke="#a8a199" fontSize={10} domain={["dataMin - 1", "dataMax + 1"]} />
                          <Tooltip
                            contentStyle={{ background: "#1a1815", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "#f3f0ea" }}
                            formatter={(value) => [`${value} cm`, "CMJ"]}
                          />
                          <Line type="monotone" dataKey="kg" name="CMJ (cm)" stroke="#e0a13d" strokeWidth={2.5} dot={{ fill: "#e0a13d", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ textAlign: "center", padding: 20, color: "#a8a199", fontSize: 14 }}>
                        {athleteDetails.cmj?.kg != null ? "1 seul point" : "Non renseigné"}
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 13, color: "#a8a199", textAlign: "center" }}>
                      CMJ actuel :{" "}
                      <strong style={{ color: "#e0a13d" }}>
                        {athleteDetails.cmj?.kg != null ? `${athleteDetails.cmj.kg} cm` : "—"}
                      </strong>
                    </div>
                    {/* Saisie manuelle par le coach — le CMJ DOIT contribuer
                        au graphique d'évolution même quand c'est le coach
                        qui le rentre. */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Ex: 42"
                        value={vmaCmjInput.cmj}
                        onChange={(e) =>
                          setVmaCmjInput((p) => ({ ...p, cmj: e.target.value }))
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: 8,
                          borderRadius: 6,
                          border: "1px solid #2a2620",
                          background: "#151310",
                          color: "#f3f0ea",
                        }}
                      />
                      <button
                        disabled={savingVmaCmj === "cmj"}
                        onClick={() => saveManualVmaCmj("cmj")}
                        style={{
                          padding: "0 14px",
                          background: "#4fae7d",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: savingVmaCmj === "cmj" ? "wait" : "pointer",
                          fontWeight: "bold",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {savingVmaCmj === "cmj" ? "…" : "✅ Enregistrer"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "#a8a199", marginTop: 4 }}>
                      💡 À remplir toi-même si l'athlète oublie — contribue à son évolution.
                    </div>
                    </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <TestsSummary uid={showAthleteDetail.id} title="🧪 Tests de l'athlète" simple />
            </div>

            {(() => {
              /* ===== Évolution des RM / charges : recherche par exercice =====
                 Source 1 : l'historique de la fiche "Mes RM" de l'athlète.
                 Source 2 : ses feedbacks de séance (meilleure série de chaque
                 séance → 1RM estimé avec la formule d'Epley). Ça permet de voir
                 une courbe même pour un exercice sans fiche RM, ou dont le RM
                 n'a jamais été affiné automatiquement. */
              const toDayKey = (d) => {
                if (!d) return "";
                if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
                const dt =
                  d && typeof d.toDate === "function" ? d.toDate() : new Date(d);
                return isNaN(dt.getTime()) ? "" : getLocalDateStr(dt);
              };
              const uid = showAthleteDetail.id;
              const byKey = {};
              const ensure = (name) => {
                const k = normalizeExerciseNameLocal(name);
                if (!k) return null;
                if (!byKey[k]) {
                  byKey[k] = { key: k, label: name, category: null, rm: [], sessions: [] };
                }
                return byKey[k];
              };

              Object.entries(detailedAthleteRMHistory).forEach(([name, history]) => {
                const e = ensure(name);
                if (!e) return;
                e.label = name;
                e.category = detailedAthleteRMCategories[name] || null;
                e.rm = (history || [])
                  .map((h) => ({
                    day: toDayKey(h && h.date),
                    kg: h ? Number(h.kg) : NaN,
                    auto: !!(h && h.autoAdjusted),
                  }))
                  .filter((h) => h.day && !isNaN(h.kg) && h.kg > 0);
              });

              (athleteDetails.sessions || []).forEach((w) => {
                const fbAll = getUserFeedback(w, uid);
                if (!fbAll || Object.keys(fbAll).length === 0) return;
                const day = toDayKey(w.date);
                if (!day) return;
                (w.blocks || []).forEach((block, bIdx) => {
                  (block.exercises || []).forEach((ex, eIdx) => {
                    const fb = fbAll[`${bIdx}-${eIdx}`];
                    if (!fb || !ex.name || isCMJName(ex.name)) return;
                    const series =
                      fb.series ||
                      (fb.actualWeight !== undefined
                        ? [{ actualWeight: fb.actualWeight, actualReps: fb.actualReps, rpe: fb.rpe }]
                        : null);
                    if (!series) return;
                    let best = null;
                    series.forEach((s) => {
                      const kg = parseFloat(s.actualWeight);
                      const reps = parseInt(s.actualReps, 10);
                      if (!(kg > 0) || !(reps > 0)) return;
                      const e1 = reps === 1 ? kg : kg * (1 + reps / 30);
                      if (!best || e1 > best.e1rm) best = { kg, reps, rpe: s.rpe, e1rm: e1 };
                    });
                    if (!best) return;
                    const e = ensure(ex.name);
                    if (!e) return;
                    e.sessions.push({
                      day,
                      title: w.title || "Séance",
                      kg: best.kg,
                      reps: best.reps,
                      rpe: best.rpe,
                      e1rm: Math.round(best.e1rm * 10) / 10,
                    });
                  });
                });
              });

              const entries = Object.values(byKey)
                .filter((e) => e.rm.length > 0 || e.sessions.length > 0)
                .sort((a, b) => a.label.localeCompare(b.label, "fr"));
              if (entries.length === 0) return null;

              const q = normalizeExerciseNameLocal(rmSearch);
              const matches = q ? entries.filter((e) => e.key.includes(q)) : [];
              const selected = rmSelected && byKey[rmSelected] ? byKey[rmSelected] : null;

              let chartData = [];
              if (selected) {
                const map = {};
                selected.rm.forEach((h) => {
                  (map[h.day] = map[h.day] || { day: h.day }).rm = h.kg;
                });
                selected.sessions.forEach((s) => {
                  const r = (map[s.day] = map[s.day] || { day: s.day });
                  r.e1rm = r.e1rm === undefined ? s.e1rm : Math.max(r.e1rm, s.e1rm);
                });
                chartData = Object.values(map)
                  .sort((a, b) => a.day.localeCompare(b.day))
                  .map((r) => ({
                    ...r,
                    label: new Date(r.day + "T12:00:00").toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    }),
                  }));
              }
              const lastRM = selected && selected.rm.length > 0
                ? selected.rm[selected.rm.length - 1]
                : null;
              const sessionsDesc = selected
                ? [...selected.sessions].sort((a, b) => b.day.localeCompare(a.day))
                : [];

              return (
                <div
                  style={{ background: "#151310", padding: 20, borderRadius: 10 }}
                >
                  <h3 style={{ margin: "0 0 4px 0", fontSize: 17, color: "#f3f0ea" }}>
                    💪 Évolution des RM / charges
                  </h3>
                  <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 12 }}>
                    {entries.length} exercice{entries.length > 1 ? "s" : ""} disponible
                    {entries.length > 1 ? "s" : ""} pour cet athlète (fiche RM +
                    feedbacks de séance)
                  </div>
                  <input
                    type="text"
                    value={rmSearch}
                    onChange={(e) => {
                      setRmSearch(e.target.value);
                      if (!e.target.value.trim()) setRmSelected(null);
                    }}
                    placeholder="🔍 Tape le nom d'un exercice (ex : squat, développé…)"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #2a2620",
                      background: "#0d0c0a",
                      color: "#f3f0ea",
                      fontSize: 14,
                    }}
                  />

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#a8a199" }}>
                      {q
                        ? `${matches.length} résultat${matches.length > 1 ? "s" : ""}`
                        : `Exercices faits / suivis (${entries.length})`}
                    </span>
                    <button
                      onClick={() => setRmListOpen((v) => !v)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #2a2620",
                        background: "#0d0c0a",
                        color: "#a8a199",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {rmListOpen ? "▾ Masquer la liste" : "▸ Afficher la liste"}
                    </button>
                  </div>

                  {rmListOpen && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(q ? matches : entries).length === 0 ? (
                        <div style={{ color: "#a8a199", fontSize: 13 }}>
                          Aucun exercice ne correspond à « {rmSearch} »
                        </div>
                      ) : (
                        (q ? matches : entries).map((m) => {
                          const active = selected && selected.key === m.key;
                          return (
                            <button
                              key={m.key}
                              onClick={() => {
                                setRmSelected(m.key);
                                setRmSearch("");
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 999,
                                fontSize: 13,
                                cursor: "pointer",
                                border: active ? "1px solid #e0a13d" : "1px solid #2a2620",
                                background: active ? "rgba(224,161,61,0.18)" : "#0d0c0a",
                                color: active ? "#e0a13d" : "#f3f0ea",
                                textTransform: "capitalize",
                              }}
                            >
                              {m.label}
                              <span style={{ color: "#a8a199", marginLeft: 6, fontSize: 11 }}>
                                {m.sessions.length > 0
                                  ? `${m.sessions.length} séance${m.sessions.length > 1 ? "s" : ""}`
                                  : "RM seul"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}

                  {selected && (
                    <div
                      style={{
                        marginTop: 16,
                        background: "#0d0c0a",
                        padding: 15,
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 16,
                            textTransform: "capitalize",
                            color: "#e0a13d",
                          }}
                        >
                          {selected.label}
                        </h4>
                        <span style={{ fontSize: 12, color: "#a8a199" }}>
                          {getExerciseCategoryLabel(selected.category)}
                          <button
                            onClick={() => setRmSelected(null)}
                            style={{
                              marginLeft: 10,
                              padding: "2px 8px",
                              borderRadius: 6,
                              border: "1px solid #2a2620",
                              background: "#151310",
                              color: "#a8a199",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            ✕ Fermer
                          </button>
                        </span>
                      </div>

                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="label" stroke="#a8a199" fontSize={10} />
                          <YAxis
                            stroke="#a8a199"
                            fontSize={10}
                            domain={["dataMin - 5", "dataMax + 5"]}
                            tickFormatter={(v) => Math.round(v)}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#1a1815",
                              border: "1px solid rgba(255,255,255,0.16)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelStyle={{ color: "#f3f0ea" }}
                            formatter={(value, name) => [`${value} kg`, name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line
                            type="monotone"
                            dataKey="rm"
                            name="RM enregistré"
                            stroke="#e0a13d"
                            strokeWidth={2.5}
                            dot={{ fill: "#e0a13d", r: 4 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="e1rm"
                            name="1RM estimé (séances)"
                            stroke="#4fae7d"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            dot={{ fill: "#4fae7d", r: 3 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          color: "#a8a199",
                          textAlign: "center",
                        }}
                      >
                        {lastRM ? (
                          <>
                            RM actuel :{" "}
                            <strong style={{ color: "#e0a13d" }}>{Math.round(lastRM.kg)} kg</strong>
                            {lastRM.auto && <span style={{ marginLeft: 6, color: "#d9a441" }}>⚡</span>}
                          </>
                        ) : (
                          "Pas encore de RM enregistré pour cet exercice"
                        )}
                        {" · "}
                        {selected.sessions.length} séance
                        {selected.sessions.length > 1 ? "s" : ""} avec feedback
                      </div>

                      {sessionsDesc.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 6 }}>
                            Meilleure série par séance (1RM estimé = formule d'Epley) :
                          </div>
                          {sessionsDesc.slice(0, 8).map((s, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                fontSize: 13,
                                padding: "6px 0",
                                borderTop: "1px solid #1d1a16",
                              }}
                            >
                              <span style={{ color: "#a8a199" }}>
                                {new Date(s.day + "T12:00:00").toLocaleDateString("fr-FR")} · {s.title}
                              </span>
                              <span style={{ color: "#f3f0ea", whiteSpace: "nowrap" }}>
                                {s.kg} kg × {s.reps}
                                {s.rpe ? ` · RPE ${s.rpe}` : ""}
                                <span style={{ color: "#4fae7d", marginLeft: 8 }}>
                                  ≈ {Math.round(s.e1rm)} kg
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
