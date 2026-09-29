import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  writeBatch,
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
} from "recharts";
import BodyScan from "../component/BodyScan";
import {
  rediRatio,
  rediRatioHistory,
  getREDIStatus,
  zScore,
  loadZScoreHistory,
  wellnessZScoreHistory,
  getWellnessZScoreStatus,
  crossRiskStatus,
  crossRiskStatusFull,
  rpeVariability,
  getRPEReliabilityStatus,
  cmjStatus,
} from "../component/loadMetrics";

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Retourne les ids des groupes personnalisés (collection "groups") dont fait partie un athlète
const getAthleteGroupIds = (athleteId, customGroups) =>
  (customGroups || [])
    .filter((g) => (g.athleteIds || []).includes(athleteId))
    .map((g) => g.id);

export default function Dashboard() {
  const { currentUser, userRole, userProfile, isSuperAdmin } = useAuth();

  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customGroups, setCustomGroups] = useState([]);
  const [wellnessFilter, setWellnessFilter] = useState("total");
  const [showAthleteDetail, setShowAthleteDetail] = useState(null);
  const [athleteDetails, setAthleteDetails] = useState(null);
  const [detailedAthleteRMHistory, setDetailedAthleteRMHistory] = useState({});
  const [acwrHistory, setAcwrHistory] = useState([]);

  const [athleteRMHistory, setAthleteRMHistory] = useState([]);
  const [athleteWeight, setAthleteWeight] = useState("");
  const [editingWeight, setEditingWeight] = useState(false);
  const [todayWellness, setTodayWellness] = useState(null);
  const [wellnessHistory, setWellnessHistory] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [selfCrossStatus, setSelfCrossStatus] = useState(null);
  const [selfRediRatio, setSelfRediRatio] = useState(null);
  const [selfWellnessZ, setSelfWellnessZ] = useState(null);
  const [selfCmjStatus, setSelfCmjStatus] = useState(null);
  const [selfRpeReliability, setSelfRpeReliability] = useState(null);
  const [selfInjuries, setSelfInjuries] = useState([]);
  const [selfPainZone, setSelfPainZone] = useState(null);
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
        getDocs(collection(db, "workout")),
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
    if (userRole !== "athlete" || !currentUser || !userProfile) return;

    const load = async () => {
      try {
        const today = getLocalDateStr(new Date());

        const rmSnap = await getDocs(
          collection(db, "users", currentUser.uid, "rm")
        );
        setAthleteRMHistory(
          rmSnap.docs.map((d) => ({
            exercise: d.data().exerciseName || d.id,
            kg: d.data().kg,
            date: d.data().updatedAt,
            autoAdjusted: d.data().autoAdjusted || false,
          }))
        );

        const allWellness = await getDocs(collection(db, "wellness"));
        const myWellness = allWellness.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((w) => w.userId === currentUser.uid)
          .sort((a, b) => b.date.localeCompare(a.date));

        const todayW = myWellness.find((w) => w.date === today);
        if (todayW) setTodayWellness(todayW);

        const last7 = myWellness.slice(0, 7).reverse();
        setWellnessHistory(
          last7.map((d) => ({
            ...d,
            normalizedScore: calculateWellnessScore(d),
          }))
        );

        const whtSnap = await getDocs(
          collection(db, "users", currentUser.uid, "weight_history")
        );
        const whtData = whtSnap.docs
          .map((d) => ({ weight: d.data().weight, date: d.data().date }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setWeightHistory(whtData);

        if (whtData.length > 0) {
          const lastDate = new Date(
            whtData[whtData.length - 1].date + "T12:00:00"
          );
          setLastWeightDate(lastDate);
          setCanUpdateWeight((new Date() - lastDate) / 86400000 >= 7);
        }

        const allWorkouts = (await getDocs(collection(db, "workout"))).docs.map(
          (d) => ({ id: d.id, ...d.data() })
        );
        const userGrp = userProfile?.group || "total";
        const myGroupIds = getAthleteGroupIds(currentUser.uid, customGroups);

        const userWorkouts = allWorkouts.filter((w) => {
          return (
            w.group === "total" ||
            w.group === userGrp ||
            (w.group === "moi" && w.createdBy === currentUser.uid) ||
            w.targetUserId === currentUser.uid ||
            myGroupIds.includes(w.group)
          );
        });

        setTotalSessions(userWorkouts.length);
        setCompletedSessions(
          userWorkouts.filter((w) => isWorkoutCompleted(w, currentUser.uid)).length
        );

        const todayWorkouts = allWorkouts.filter((w) => {
          if (w.date !== today) return false;
          return (
            w.group === "total" ||
            w.group === userGrp ||
            (w.group === "moi" && w.createdBy === currentUser.uid) ||
            w.targetUserId === currentUser.uid ||
            myGroupIds.includes(w.group)
          );
        });

        if (todayWorkouts.length > 0) setTodayWorkout(todayWorkouts[0]);

        // REDI × wellness (z-score), recalculé à chaque chargement du
        // dashboard donc renouvelé chaque jour.
        const myDailyLoads = buildDailyLoads(userWorkouts, currentUser.uid);
        const ratio = rediRatio(myDailyLoads, today);
        setSelfRediRatio(ratio);

        const todayScoreForZ = todayW ? calculateWellnessScore(todayW) : null;
        const myWellnessHistoryForZ = wellnessZScoreHistory(myWellness, today);
        const wZ = todayScoreForZ !== null ? zScore(todayScoreForZ, myWellnessHistoryForZ) : null;
        setSelfWellnessZ(wZ);

        // Fiabilité RPE (variance sur les dernières séances) + CMJ du jour
        // vs baseline propre — croisés avec REDI × wellness, chacun ignoré
        // s'il est indisponible (aucune donnée bloquante).
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

        // Journal de blessures — dernières déclarations personnelles.
        try {
          const injSnap = await getDocs(collection(db, "injuries"));
          const myInjuries = injSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((inj) => inj.userId === currentUser.uid)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .slice(0, 5);
          setSelfInjuries(myInjuries);
        } catch (e) {
          console.error("Erreur chargement blessures:", e);
        }
      } catch (e) {
        console.error("Erreur athlète:", e);
      }
    };
    load();
  }, [userRole, currentUser, userProfile, customGroups]);

  useEffect(() => {
    if (userRole === "athlete" && userProfile)
      setAthleteWeight(userProfile.weight || "");
  }, [userRole, userProfile]);

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
        const allWorkouts = (await getDocs(collection(db, "workout"))).docs.map(
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

          const cross = crossRiskStatusFull({
            rediRatioValue: acwrNum,
            wellnessZ,
            cmjPctChange: uCmjStatus.pctChange,
            rpeReliability: uRpeReliability,
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
            status: wScore !== null ? getWellnessStatus(wScore) : null,
            wellnessZ,
            wellnessZStatus: getWellnessZScoreStatus(wellnessZ),
            crossStatus: cross,
            cmjStatus: uCmjStatus,
            rpeReliability: uRpeReliability,
            rpeReliabilityStatus: getRPEReliabilityStatus(uRpeReliability),
            injuries: uInjuries.slice(0, 5),
            acwr: acwr,
            acwrStatus: getACWRStatus(acwr),
            todayCompleted: todayWorkout ? isWorkoutCompleted(todayWorkout, u.id) : false,
            todayWorkoutTitle: todayWorkout?.title || null,
            todayWorkoutInProgress: todayWorkout ? isWorkoutInProgress(todayWorkout, u.id) : false,
            totalSessions: totalSessions,
            completedSessions: completedSessions,
          };
        });

        result.sort((a, b) => (b.wellnessScore || 0) - (a.wellnessScore || 0));
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

      const rmSnap = await getDocs(collection(db, "users", athlete.id, "rm"));
      const rmByEx = {};
      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = data.exerciseName || d.id;
        if (!rmByEx[name]) rmByEx[name] = [];
        rmByEx[name].push({
          kg: data.kg,
          date: data.updatedAt,
          autoAdjusted: data.autoAdjusted || false,
        });
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

      const allW = (await getDocs(collection(db, "workout"))).docs.map((d) => ({
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
      setDetailedAthleteRMHistory(rmByEx);
      setAcwrHistory(acwrHist);
      setAthleteDetails({
        wellness: wellnessData,
        dailyScore,
        weeklyAvg,
        weightHistory: weightData,
        todayWorkout: todayW,
      });
    } catch (e) {
      console.error("❌ Erreur détails:", e);
      alert("Erreur chargement: " + e.message);
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
    if (wellnessFilter === "risque")
      return a.wellnessScore !== null && a.wellnessScore < 5;
    if (wellnessFilter === "fatigue")
      return (
        a.wellnessScore !== null &&
        a.wellnessScore >= 5 &&
        a.wellnessScore < 7.5
      );
    if (wellnessFilter === "forme")
      return a.wellnessScore !== null && a.wellnessScore >= 7.5;
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

  if (userRole !== "admin") {
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
        <p style={{ color: "#a8a199", marginBottom: 30, fontSize: 14 }}>
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>

        {!todayWellness && (
          <div
            style={{
              background: "rgba(217,164,65,0.14)",
              padding: 20,
              borderRadius: 12,
              border: "2px solid #d9a441",
              marginBottom: 20,
            }}
          >
            <h3
              style={{ margin: "0 0 10px 0", fontSize: 18, color: "#d9a441" }}
            >
              ⚠️ Wellness non rempli
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#f0c98a" }}>
              N'oublie pas de remplir ton questionnaire wellness d'aujourd'hui !
            </p>
          </div>
        )}

        {todayScore !== null && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "2px solid #e0a13d",
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: "0 0 15px 0", fontSize: 18 }}>🧘 Wellness</h3>
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
                  borderRadius: 8,
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
                  borderRadius: 8,
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                  <XAxis
                    dataKey="date"
                    stroke="#a8a199"
                    fontSize={10}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis domain={[0, 10]} stroke="#a8a199" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#0d0c0a",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="normalizedScore"
                    stroke="#e0a13d"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {selfCrossStatus && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: `2px solid ${selfCrossStatus.color}`,
              marginBottom: 20,
            }}
          >
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: 16,
                color: selfCrossStatus.color,
              }}
            >
              🔀 {selfCrossStatus.label}
            </h3>
            <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#a8a199", lineHeight: 1.5 }}>
              {selfCrossStatus.detail}
            </p>
            <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#a8a199" }}>
              {selfRediRatio !== null && (
                <span>
                  Ratio REDI : <strong style={{ color: "#f3f0ea" }}>{selfRediRatio.toFixed(2)}</strong>
                </span>
              )}
              {selfWellnessZ !== null && (
                <span>
                  Z-score wellness : <strong style={{ color: "#f3f0ea" }}>{selfWellnessZ.toFixed(1)}</strong>
                </span>
              )}
              {selfCmjStatus?.pctChange !== null && selfCmjStatus?.pctChange !== undefined && (
                <span>
                  CMJ vs baseline :{" "}
                  <strong style={{ color: selfCmjStatus.color }}>
                    {selfCmjStatus.pctChange > 0 ? "+" : ""}
                    {selfCmjStatus.pctChange}%
                  </strong>
                </span>
              )}
              {selfRpeReliability?.sd !== null && selfRpeReliability?.sd !== undefined && (
                <span>
                  Écart-type RPE :{" "}
                  <strong style={{ color: selfRpeReliability.flag ? "#d9a441" : "#f3f0ea" }}>
                    {selfRpeReliability.sd}
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}

        {selfInjuries.length > 0 && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#d9695a" }}>
              🚑 Blessures déclarées récemment
            </h3>
            {selfInjuries.map((inj) => (
              <div key={inj.id} style={{ fontSize: 13, color: "#a8a199", marginBottom: 6 }}>
                <strong style={{ color: "#f3f0ea" }}>{inj.date}</strong>
                {inj.zone ? ` — ${inj.zone}` : ""}
                {inj.daysLost !== null && inj.daysLost !== undefined ? ` (${inj.daysLost}j d'arrêt)` : ""}
              </div>
            ))}
          </div>
        )}

        {todayWellness?.painMap &&
          Object.keys(todayWellness.painMap).length > 0 && (
            <div
              style={{
                background: "#151310",
                padding: 20,
                borderRadius: 12,
                border: "2px solid #d9695a",
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: "0 0 15px 0", fontSize: 18, color: "#d9695a" }}>
                🩹 Localisation de la douleur (aujourd'hui)
              </h3>
              <BodyScan
                painMap={todayWellness.painMap}
                setPainMap={() => {}}
                selectedZone={selfPainZone}
                setSelectedZone={setSelfPainZone}
              />
            </div>
          )}

        <div
          style={{
            background: "#151310",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #4fae7d",
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", fontSize: 18 }}>
            📊 Progression des séances
          </h3>
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
                borderRadius: 8,
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
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                Total
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
              Taux de complétion
            </div>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#4fae7d" }}>
              {totalSessions > 0
                ? Math.round((completedSessions / totalSessions) * 100)
                : 0}
              %
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#151310",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #e0a13d",
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", fontSize: 18 }}>
            🏋️ Séance du jour
          </h3>
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
                  }}
                >
                  ✅ Séance validée
                </div>
              ) : isWorkoutInProgress(todayWorkout) ? (
                <div
                  style={{
                    padding: 12,
                    background: "rgba(217,164,65,0.14)",
                    borderRadius: 8,
                    color: "#d9a441",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  ⏳ En cours
                </div>
              ) : (
                <>
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
                  <button
                    onClick={() => (window.location.href = "/workout")}
                    style={{
                      width: "100%",
                      padding: 12,
                      background: "#e0a13d",
                      color: "#1a1306",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    🏋️ Commencer la séance
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: "#a8a199" }}>
              Pas de séance programmée aujourd'hui
            </div>
          )}
        </div>

        <div
          style={{
            background: "#151310",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #e0a13d",
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", color: "#e0a13d", fontSize: 18 }}>
            ⚖️ Mon Poids
          </h3>
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
                    contentStyle={{
                      background: "#0d0c0a",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      fontSize: 12,
                    }}
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
        </div>

        {athleteRMHistory.length > 0 && (
          <div
            style={{
              background: "#151310",
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 18, marginBottom: 15 }}>
              💪 Mes RM
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {athleteRMHistory
                .sort((a, b) => b.kg - a.kg)
                .map((rm, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#0d0c0a",
                      padding: 15,
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 14, color: "#a8a199", marginBottom: 4 }}
                      >
                        {rm.exercise}
                      </div>
                      {rm.date && (
                        <div style={{ fontSize: 11, color: "#a8a199" }}>
                          {new Date(rm.date).toLocaleDateString("fr-FR")}
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
                      {rm.kg} <span style={{ fontSize: 14 }}>kg</span>
                      {rm.autoAdjusted && (
                        <span
                          style={{
                            fontSize: 14,
                            marginLeft: 6,
                            color: "#d9a441",
                          }}
                        >
                          ⚡
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
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
          {todayWorkout && (
            <button
              onClick={() => (window.location.href = "/workout")}
              style={{
                padding: "12px 20px",
                background: "#e0a13d",
                color: "#1a1306",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: 14,
              }}
            >
              🏋️ Ma séance du jour
            </button>
          )}
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
              athletes.filter(
                (a) => a.wellnessScore !== null && a.wellnessScore < 5
              ).length
            })`,
            color: "#d9695a",
          },
          {
            key: "fatigue",
            label: `😌 Fatigue (${
              athletes.filter(
                (a) =>
                  a.wellnessScore !== null &&
                  a.wellnessScore >= 5 &&
                  a.wellnessScore < 7.5
              ).length
            })`,
            color: "#d9a441",
          },
          {
            key: "forme",
            label: `💪 En forme (${
              athletes.filter(
                (a) => a.wellnessScore !== null && a.wellnessScore >= 7.5
              ).length
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
                      {athlete.crossStatus.label}
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
                          color: athlete.status.color,
                        }}
                      >
                        {athlete.wellnessScore.toFixed(1)}
                      </div>
                      <div
                        style={{ fontSize: 11, color: athlete.status.color }}
                      >
                        {athlete.status.emoji} {athlete.status.label}
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
                      color: showAthleteDetail.status.color,
                    }}
                  >
                    {showAthleteDetail.wellnessScore.toFixed(1)}/10
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: showAthleteDetail.status.color,
                      marginTop: 4,
                    }}
                  >
                    {showAthleteDetail.status.emoji}{" "}
                    {showAthleteDetail.status.label}
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

            {showAthleteDetail.crossStatus && (
              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  border: `2px solid ${showAthleteDetail.crossStatus.color}`,
                  marginBottom: 25,
                }}
              >
                <h3
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: 16,
                    color: showAthleteDetail.crossStatus.color,
                  }}
                >
                  🔀 Statut croisé REDI × Wellness : {showAthleteDetail.crossStatus.label}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: "#a8a199", lineHeight: 1.5 }}>
                  {showAthleteDetail.crossStatus.detail}
                </p>
              </div>
            )}

            {showAthleteDetail.injuries && showAthleteDetail.injuries.length > 0 && (
              <div
                style={{
                  background: "#151310",
                  padding: 18,
                  borderRadius: 10,
                  marginBottom: 25,
                  border: "1px solid rgba(217,105,90,0.4)",
                }}
              >
                <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#d9695a" }}>
                  🚑 Blessures déclarées récemment
                </h3>
                {showAthleteDetail.injuries.map((inj) => (
                  <div key={inj.id} style={{ fontSize: 13, color: "#a8a199", marginBottom: 6 }}>
                    <strong style={{ color: "#f3f0ea" }}>{inj.date}</strong>
                    {inj.zone ? ` — ${inj.zone}` : ""}
                    {" "}
                    {inj.tissueType && `(${inj.tissueType}${inj.mechanism ? `, ${inj.mechanism}` : ""})`}
                    {inj.daysLost !== null && inj.daysLost !== undefined ? ` — ${inj.daysLost}j d'arrêt` : ""}
                  </div>
                ))}
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
              <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>
                🏋️ Séance aujourd'hui
              </h3>
              {athleteDetails.todayWorkout ? (
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
              )}
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
                  <h4
                    style={{
                      margin: "0 0 12px 0",
                      color: "#d9695a",
                      fontSize: 16,
                    }}
                  >
                    ⚠️ Douleurs signalées
                  </h4>

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
                          setPainMap={() => {}}
                        />
                      </div>
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
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17 }}>
                  📊 Évolution REDI
                </h3>
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
              <div
                style={{
                  background: "#151310",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                }}
              >
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17 }}>
                  🧘 Détail Wellness
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={athleteDetails.wellness}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis
                      dataKey="date"
                      stroke="#a8a199"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis domain={[0, 10]} stroke="#a8a199" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#0d0c0a",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="sommeil"
                      name="Sommeil"
                      stroke="#3498db"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigue"
                      name="Fatigue"
                      stroke="#d9695a"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="stress"
                      name="Stress"
                      stroke="#d9a441"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="douleur"
                      name="Douleur"
                      stroke="#c0392b"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="motivation"
                      name="Motivation"
                      stroke="#e0a13d"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="nutrition"
                      name="Nutrition"
                      stroke="#1abc9c"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hydratation"
                      name="Hydratation"
                      stroke="#16a085"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17 }}>
                  ⚖️ Évolution du poids
                </h3>
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
              </div>
            )}

            {Object.keys(detailedAthleteRMHistory).length > 0 && (
              <div
                style={{ background: "#151310", padding: 20, borderRadius: 10 }}
              >
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17 }}>
                  💪 Évolution des RM
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
                    gap: 20,
                  }}
                >
                  {Object.entries(detailedAthleteRMHistory).map(
                    ([exercise, history]) => (
                      <div
                        key={exercise}
                        style={{
                          background: "#0d0c0a",
                          padding: 15,
                          borderRadius: 8,
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 12px 0",
                            fontSize: 15,
                            textTransform: "capitalize",
                            color: "#e0a13d",
                          }}
                        >
                          {exercise}
                        </h4>
                        {history.length > 1 ? (
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart
                              data={history.map((item) => ({
                                ...item,
                                dateShort: new Date(
                                  item.date
                                ).toLocaleDateString("fr-FR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                }),
                              }))}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#333"
                              />
                              <XAxis
                                dataKey="dateShort"
                                stroke="#a8a199"
                                fontSize={10}
                              />
                              <YAxis stroke="#a8a199" fontSize={10} />
                              <Tooltip
                                contentStyle={{
                                  background: "#000",
                                  border: "1px solid rgba(255, 255, 255, 0.05)",
                                  fontSize: 11,
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="kg"
                                stroke="#e0a13d"
                                strokeWidth={2}
                                dot={{ fill: "#e0a13d", r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div
                            style={{
                              textAlign: "center",
                              padding: 20,
                              color: "#a8a199",
                              fontSize: 14,
                            }}
                          >
                            1 seul point
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: "#a8a199",
                            textAlign: "center",
                          }}
                        >
                          RM actuel :{" "}
                          <strong style={{ color: "#e0a13d" }}>
                            {history[history.length - 1].kg} kg
                          </strong>
                          {history[history.length - 1].autoAdjusted && (
                            <span style={{ marginLeft: 8, color: "#d9a441" }}>
                              ⚡
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
