import React, { useEffect, useState } from "react";
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
} from "firebase/firestore";

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export default function Workout() {
  const { currentUser, userRole, userGroup } = useAuth();

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
  const [blocks, setBlocks] = useState([
    {
      name: "Bloc A",
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

  /* ===================== RM + VMA ===================== */
  useEffect(() => {
    if (!currentUser) return;
    const fetchRM = async () => {
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
            rmData[d.id] = data.kg;
          }
        });

        setUserRM(rmData);
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
      let allWorkouts = [];
      
      if (userRole === "admin") {
        // Admin : charge tout
        const q = query(collection(db, "workout"));
        const snap = await getDocs(q);
        allWorkouts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        // Athlète : 4 queries séparées (sans orderBy pour éviter les problèmes d'index)
        
        // 1. Workouts groupe "total"
        const qTotal = query(
          collection(db, "workout"),
          where("group", "==", "total")
        );
        const snapTotal = await getDocs(qTotal);
        
        // 2. Workouts de son groupe
        const qGroup = query(
          collection(db, "workout"),
          where("group", "==", userGroup)
        );
        const snapGroup = await getDocs(qGroup);
        
        // 3. Workouts privés créés par lui (group "moi")
        const qMoi = query(
          collection(db, "workout"),
          where("group", "==", "moi"),
          where("createdBy", "==", currentUser.uid)
        );
        const snapMoi = await getDocs(qMoi);
        
        // 4. Workouts ciblés sur lui
        const qTarget = query(
          collection(db, "workout"),
          where("targetUserId", "==", currentUser.uid)
        );
        const snapTarget = await getDocs(qTarget);
        
        // Combiner tous les résultats (sans doublons)
        const workoutsMap = new Map();
        [...snapTotal.docs, ...snapGroup.docs, ...snapMoi.docs, ...snapTarget.docs].forEach((d) => {
          workoutsMap.set(d.id, { id: d.id, ...d.data() });
        });
        allWorkouts = Array.from(workoutsMap.values());
      }
      
      // Trier par date côté client
      allWorkouts.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(allWorkouts);
    } catch (e) {
      console.error("Erreur séances:", e);
      alert("Erreur lors du chargement des séances : " + e.message);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentUser, userRole, userGroup]);

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
    const rm = userRM[rmName.toLowerCase()];
    if (!rm) return "-";
    return Math.round((rm * percent) / 100);
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
        const defaultWeight = calculateWeight(exercise.rmName, exercise.rmPercent) || 0;
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
    if (!currentUser || !session.blocks || session.type !== "muscu") return;
    try {
      for (const [key, fb] of Object.entries(feedback)) {
        const [bIdx, eIdx] = key.split("-").map(Number);
        const exercise = session.blocks[bIdx]?.exercises[eIdx];
        if (!exercise?.rmName) continue;
        
        // Normaliser le feedback (rétrocompatibilité)
        const normalized = normalizeFeedback(fb);
        if (!normalized || !normalized.series || normalized.series.length === 0) continue;
        
        // Ignorer CMJ (pas de calcul RM pour le CMJ)
        if (isCMJ(exercise.name)) continue;
        
        // Trouver la meilleure série (charge maximale)
        const bestSeries = normalized.series.reduce((best, current) => {
          const currentWeight = Number(current.actualWeight) || 0;
          const bestWeight = Number(best.actualWeight) || 0;
          return currentWeight > bestWeight ? current : best;
        }, normalized.series[0]);
        
        // Vérifier que la meilleure série a toutes les données
        if (!bestSeries.rpe || !bestSeries.actualWeight || !bestSeries.actualReps) continue;
        
        const rmName = exercise.rmName.toLowerCase();
        const currentRM = userRM[rmName];
        const predicted = calculatePredictedRM(
          bestSeries.actualWeight,
          bestSeries.actualReps,
          bestSeries.rpe
        );
        if (predicted) {
          let finalRM = predicted;
          if (currentRM) {
            const change = ((predicted - currentRM) / currentRM) * 100;
            if (change > 10) finalRM = currentRM * 1.1;
            if (change < -10) finalRM = currentRM * 0.9;
          }
          await setDoc(doc(db, "users", currentUser.uid, "rm", rmName), {
            kg: Math.round(finalRM * 10) / 10,
            exerciseName: rmName,
            previousRM: currentRM || 0,
            updatedAt: new Date().toISOString(),
            autoAdjusted: true,
            lastRPE: bestSeries.rpe,
            lastWeight: bestSeries.actualWeight,
            lastReps: bestSeries.actualReps,
          });
        }
      }
      const snap = await getDocs(
        collection(db, "users", currentUser.uid, "rm")
      );
      const rmData = {};
      snap.docs.forEach((d) => {
        rmData[d.id] = d.data().kg;
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
    if (!duplicateWeekStart) {
      alert("Choisissez un lundi");
      return;
    }
    try {
      const start = new Date(duplicateWeekStart + "T12:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const weekSessions = events.filter((s) => {
        const d = new Date(s.date + "T12:00:00");
        return d >= start && d <= end;
      });
      if (weekSessions.length === 0) {
        alert("Aucune séance cette semaine");
        return;
      }
      for (const s of weekSessions) {
        const origDate = new Date(s.date + "T12:00:00");
        origDate.setDate(origDate.getDate() + 7);
        await addDoc(collection(db, "workout"), {
          title: s.title,
          date: getLocalDateStr(origDate),
          group: s.group,
          targetUserId: s.targetUserId || null,
          blocks: s.blocks,
          type: s.type || "muscu",
          estimatedDuration: s.estimatedDuration,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          duplicatedFrom: s.id,
        });
      }
      alert(`${weekSessions.length} séance(s) dupliquée(s) !`);
      setShowDuplicateModal(false);
      setDuplicateWeekStart(null);
      await fetchSessions();
    } catch (e) {
      console.error(e);
      alert("Erreur duplication");
    }
  };

  /* ===================== DUPLICATION SÉANCE UNIQUE ===================== */
  const duplicateSession = async () => {
    if (!sessionToDuplicate || !duplicateTargetDate) {
      alert("⚠️ Veuillez sélectionner une date");
      return;
    }
    
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
      });
      
      alert("✅ Séance dupliquée avec succès !");
      setShowDuplicateSessionModal(false);
      setSessionToDuplicate(null);
      setDuplicateTargetDate(null);
      await fetchSessions();
    } catch (e) {
      console.error("[duplicateSession] Erreur:", e);
      alert(`❌ Erreur duplication: ${e.message}`);
    }
  };

  /* ===================== CRÉER / MODIFIER SÉANCE ===================== */
  const handleSubmit = async () => {
    if (!title || blocks.length === 0) {
      alert("Titre + au moins 1 bloc requis");
      return;
    }
    const dur = blocks.reduce(
      (t, b) =>
        t +
        b.exercises.reduce(
          (st, ex) =>
            st +
            (ex.series || 3) * ((ex.reps || 8) * 3 + (ex.restMin || 2) * 60),
          0
        ),
      0
    );

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
        await addDoc(collection(db, "workout"), payload);
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
        exercises: [newExercise],
      },
    ]);
  };

  const removeBlock = (i) => setBlocks(blocks.filter((_, idx) => idx !== i));

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

  /* ===================== COULEURS ===================== */
  const getColor = (session) => {
    // Couleur spéciale pour le groupe "moi"
    if (session.group === "moi") {
      return "#f39c12"; // Or/Doré pour les séances personnelles
    }
    
    // Couleurs par type pour les autres groupes
    const type = session.type || "muscu";
    if (type === "sprint") return "#e74c3c";
    if (type === "endurance") return "#27ae60";
    return "#9b59b6";
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
            background: "#111", 
            borderRadius: isMobile ? 3 : 6 
          }}
        />
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = getLocalDateStr(new Date(year, month, day));
      const isToday = dateStr === todayStr;
      const isSelected = selectedDate === dateStr;
      const dayEvents = events.filter((e) => e.date === dateStr);
      const isMobile = window.innerWidth <= 768;

      cells.push(
        <div
          key={day}
          onClick={() => setSelectedDate(isSelected ? null : dateStr)}
          style={{
            background: isToday ? "#1a3a2a" : "#1e1e1e",
            border: isSelected
              ? "2px solid #27ae60"
              : isToday
              ? "2px solid #27ae60"
              : "1px solid #333",
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
              color: isToday ? "#27ae60" : "#ccc",
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
                  color: "#fff",
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
                  color: "#888",
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
        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
        minHeight: "100vh",
        color: "#fff",
        maxWidth: window.innerWidth <= 768 ? "100%" : "1200px",
        margin: "0 auto",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>🏋️ Workout</h2>
      <p style={{ color: "#888", marginBottom: 20, fontSize: 14 }}>
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
              setShowForm(true);
              setFormDate(
                selectedDate ? new Date(selectedDate + "T12:00:00") : new Date()
              );
            }}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ➕ Créer séance
          </button>
          <button
            onClick={() => setShowDuplicateModal(true)}
            style={{
              padding: window.innerWidth <= 768 ? "10px 16px" : "12px 24px",
              background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: window.innerWidth <= 768 ? 13 : 15,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            📋 Dupliquer semaine
          </button>
        </div>
      )}

      {/* Légende couleurs */}
      {!showForm && !selectedSession && (
        <div
          style={{
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
                background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
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
                background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
              padding: 30,
              borderRadius: 12,
              maxWidth: 460,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>📋 Dupliquer une semaine</h3>
            <p style={{ fontSize: 14, color: "#aaa", marginBottom: 15 }}>
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
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                color: "#fff",
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
                style={{
                  flex: 1,
                  padding: 14,
                  background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                ✅ Dupliquer
              </button>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateWeekStart(null);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#95a5a6",
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
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                background: "#0a0a0a",
                borderRadius: 8,
                marginBottom: 20,
                borderLeft: "3px solid #2f80ed",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
                {sessionToDuplicate.title}
              </div>
              <div style={{ fontSize: 13, color: "#888" }}>
                Date originale :{" "}
                {new Date(
                  sessionToDuplicate.date + "T12:00:00"
                ).toLocaleDateString("fr-FR")}
              </div>
              <div style={{ fontSize: 13, color: "#888" }}>
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
                color: "#aaa",
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
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                color: "#fff",
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
                style={{
                  flex: 1,
                  padding: 14,
                  background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                ✅ Dupliquer
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
                  background: "#95a5a6",
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
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #27ae60",
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
                { value: "sprint", label: "⚡ Sprint", color: "#e74c3c" },
                { value: "endurance", label: "🏃 Endurance", color: "#27ae60" },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setWorkoutType(type.value);
                    if (type.value === "muscu") {
                      setBlocks([
                        {
                          name: "Bloc A",
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
                      workoutType === type.value ? type.color : "#1a1a1a",
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
                border: "1px solid #555",
                background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                color: "#fff",
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
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                color: "#fff",
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
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                color: "#fff",
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
              <option value="avant">Avant</option>
              <option value="trois quart">Trois Quart</option>
              <option value="individuel">Individuel</option>
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
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                  color: "#fff",
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
              style={{
                background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                padding: 18,
                borderRadius: 10,
                marginBottom: 16,
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <input
                  type="text"
                  value={block.name}
                  onChange={(e) => updateBlock(bIdx, "name", e.target.value)}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid #555",
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                />
                <button
                  onClick={() => removeBlock(bIdx)}
                  style={{
                    marginLeft: 10,
                    padding: "6px 12px",
                    background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  🗑️
                </button>
              </div>

              {block.exercises.map((ex, eIdx) => (
                <div
                  key={eIdx}
                  style={{
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                    <input
                      type="text"
                      placeholder="Nom exercice"
                      value={ex.name}
                      onChange={(e) =>
                        updateExercise(bIdx, eIdx, "name", e.target.value)
                      }
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        border: "1px solid #555",
                        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                        color: "#fff",
                      }}
                    />
                    <button
                      onClick={() => removeExercise(bIdx, eIdx)}
                      style={{
                        padding: "8px 12px",
                        background: "#95a5a6",
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
                    <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
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
                        border: "1px solid #555",
                        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                        color: "#fff",
                        fontSize: 13,
                        resize: "vertical",
                      }}
                    />
                  </div>

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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
                            Repos (min)
                          </label>
                          <input
                            type="number"
                            value={ex.restMin}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "restMin",
                                Number(e.target.value)
                              )
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
                            Nom RM
                          </label>
                          <input
                            type="text"
                            placeholder="squat"
                            value={ex.rmName}
                            onChange={(e) =>
                              updateExercise(
                                bIdx,
                                eIdx,
                                "rmName",
                                e.target.value
                              )
                            }
                            disabled={ex.rmPercent === "PDC"}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid #555",
                              background: ex.rmPercent === "PDC" 
                                ? "#1a1a1a" 
                                : "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: ex.rmPercent === "PDC" ? "#666" : "#fff",
                              cursor: ex.rmPercent === "PDC" ? "not-allowed" : "text",
                            }}
                          />
                        </div>
                      </div>
                      {/* CALCUL POIDS CIBLE */}
                      {ex.rmPercent !== "PDC" && ex.rmName &&
                        ex.rmPercent &&
                        (() => {
                          const rm = userRM[ex.rmName.toLowerCase()];
                          if (rm) {
                            const targetWeight = Math.round(
                              (rm * ex.rmPercent) / 100
                            );
                            return (
                              <div
                                style={{
                                  padding: 12,
                                  background: "#2a1a3a",
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: "#d4b4f8",
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
                                  • RM {ex.rmName} : <strong>{rm} kg</strong>
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
                                  background: "#3a2f1f",
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: "#f8d7a0",
                                }}
                              >
                                ⚠️ <strong>RM "{ex.rmName}" non trouvé</strong>{" "}
                                dans "My RM"
                              </div>
                            );
                          }
                        })()}
                      {ex.rmPercent === "PDC" && (
                        <div
                          style={{
                            padding: 12,
                            background: "#1a2a3a",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#b4d4f8",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                            background: "#2a1a1a",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#f8b4b4",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#888" }}>
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
                              border: "1px solid #555",
                              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                              color: "#fff",
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
                            background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
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
                                background: "#1a3a2a",
                                borderRadius: 8,
                                fontSize: 13,
                                color: "#a0d0a0",
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
                                <div style={{ color: "#f39c12", marginTop: 5 }}>
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
                            background: "#3a2f1f",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#f8d7a0",
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
                  background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ➕ Ajouter exercice
              </button>
            </div>
          ))}

          <button
            onClick={addBlock}
            style={{
              width: "100%",
              padding: 12,
              background: "#f39c12",
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
                background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
                background: "#95a5a6",
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
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                      background: "linear-gradient(135deg, #f39c12 0%, #e67e22 100%)",
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
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
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
                      background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                      color: "white",
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
                      background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
                      background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
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
                  background: "#95a5a6",
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
                background: "#3a2f1f",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #f39c12",
                marginBottom: 15,
              }}
            >
              <div style={{ fontSize: 13, color: "#f8d7a0" }}>
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
                    background: "#1a3a2a",
                    borderRadius: 10,
                    textAlign: "center",
                    color: "#27ae60",
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
                      background: "#1a3a2a",
                      borderRadius: 10,
                      textAlign: "center",
                      color: "#27ae60",
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
                      background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
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
                    background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
                background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                padding: 18,
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              <h4 style={{ margin: "0 0 12px 0", fontSize: 17 }}>
                {block.name}
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
                      background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                          color: "#aaa",
                          marginBottom: 8,
                          fontStyle: "italic",
                          padding: 8,
                          background: "#0a0a0a",
                          borderRadius: 6,
                          borderLeft: "3px solid #2f80ed",
                        }}
                      >
                        📝 {ex.description}
                      </div>
                    )}

                    {/* AFFICHAGE MUSCU */}
                    {sessionType === "muscu" && (
                      <>
                        <div
                          style={{
                            fontSize: 14,
                            color: "#888",
                            marginBottom: 10,
                          }}
                        >
                          {ex.series} × {ex.reps} @{" "}
                          {ex.rmPercent === "PDC" ? (
                            <strong style={{ color: "#2f80ed" }}>PDC</strong>
                          ) : (
                            <>
                              {ex.rmPercent}% ({calculateWeight(ex.rmName, ex.rmPercent)} kg)
                            </>
                          )}
                          {" • "}
                          Tempo: {ex.tempo} • Repos: {ex.restMin} min
                        </div>
                        {fb && (() => {
                          const normalized = normalizeFeedback(fb);
                          const isCMJEx = isCMJ(ex.name);
                          return (
                            <div
                              style={{
                                padding: 10,
                                background: "#1a3a2a",
                                borderRadius: 8,
                                marginBottom: 10,
                                border: "1px solid #27ae60",
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
                                <div style={{ fontSize: 12, color: "#a0d0a0", marginTop: 8, fontStyle: "italic" }}>
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
                            color: "#888",
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
                              background: "#2a1a1a",
                              borderRadius: 8,
                              marginBottom: 10,
                              border: "1px solid #e74c3c",
                            }}
                          >
                            <div style={{ fontSize: 13 }}>
                              <strong>Distance réelle :</strong>{" "}
                              {fb.actualDistance}m • <strong>RPE :</strong>{" "}
                              {fb.rpe}/10
                              {fb.notes && (
                                <div style={{ marginTop: 5, color: "#f8b4b4" }}>
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
                                      color: "#888",
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
                                      <span style={{ color: "#f39c12" }}>
                                        {" "}
                                        • Passage sol
                                      </span>
                                    )}
                                  </div>
                                  {fb && (
                                    <div
                                      style={{
                                        padding: 10,
                                        background: "#1a3a2a",
                                        borderRadius: 8,
                                        marginBottom: 10,
                                        border: "1px solid #27ae60",
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
                                              color: "#a0d0a0",
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
                              background: "#3a2f1f",
                              borderRadius: 8,
                              fontSize: 13,
                              color: "#f8d7a0",
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
                          background: fb ? "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" : "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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

      {/* ============ CALENDRIER MENSUEL ============ */}
      {!showForm && !selectedSession && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                background: "#444",
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
                background: "#444",
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
                  color: "#888",
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
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                padding: 20,
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: "0 0 15px 0", fontSize: 18 }}>
                Séances du{" "}
                {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                  "fr-FR",
                  { weekday: "long", day: "numeric", month: "long" }
                )}
              </h3>
              {events.filter((e) => e.date === selectedDate).length === 0 ? (
                <div style={{ color: "#888", fontSize: 14 }}>
                  Aucune séance ce jour
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {events
                    .filter((e) => e.date === selectedDate)
                    .map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        style={{
                          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                          padding: 18,
                          borderRadius: 10,
                          border: `2px solid ${getColor(session)}`,
                          cursor: "pointer",
                        }}
                      >
                        <h4 style={{ margin: "0 0 6px 0", fontSize: 16 }}>
                          {session.title}
                        </h4>
                        <div style={{ fontSize: 13, color: "#888" }}>
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
                                color: "#27ae60",
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
                                color: "#f39c12",
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
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
              padding: 28,
              borderRadius: 12,
              maxWidth: 480,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              border: "2px solid #27ae60",
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
                      background: "#1a1a1a",
                      borderRadius: 8,
                      border: "1px solid #333"
                    }}
                  >
                    <h4 style={{ 
                      margin: "0 0 14px 0", 
                      fontSize: 16,
                      color: "#27ae60"
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
                          border: "1px solid #555",
                          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                          color: "#fff",
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
                          border: "1px solid #555",
                          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                          color: "#fff",
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
                            "linear-gradient(to right, #27ae60, #f39c12, #e74c3c)",
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
                                ? "#27ae60"
                                : serie.rpe <= 6
                                ? "#2f80ed"
                                : serie.rpe <= 8
                                ? "#f39c12"
                                : "#e74c3c",
                          }}
                        >
                          {serie.rpe}/10
                        </span>
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 13,
                          color: "#888",
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
                      border: "1px solid #555",
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      color: "#fff",
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
                      border: "1px solid #555",
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      color: "#fff",
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
                      border: "1px solid #555",
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      color: "#fff",
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
                      "linear-gradient(to right, #27ae60, #f39c12, #e74c3c)",
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
                          ? "#27ae60"
                          : currentExerciseFeedback.rpe <= 6
                          ? "#2f80ed"
                          : currentExerciseFeedback.rpe <= 8
                          ? "#f39c12"
                          : "#e74c3c",
                    }}
                  >
                    {currentExerciseFeedback.rpe}/10
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 15,
                    color: "#888",
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
                  background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
                  background: "#95a5a6",
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
          filter: invert(1);
          cursor: pointer;
        }
        
        /* Force le style des selects et options */
        select {
          color: #ffffff !important;
          background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%) !important;
        }
        
        select option {
          background: #1a1a1a !important;
          color: #ffffff !important;
          padding: 8px !important;
        }
        
        select option:hover {
          background: #2a2a2a !important;
        }
        
        /* Style pour inputs text et number */
        input[type="text"],
        input[type="number"] {
          color: #ffffff !important;
          background: #1a1a1a !important;
        }
        
        input[type="text"]::placeholder,
        input[type="number"]::placeholder {
          color: #666 !important;
        }
      `}</style>
    </div>
  );
}
