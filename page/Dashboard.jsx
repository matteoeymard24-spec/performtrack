import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
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

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export default function Dashboard() {
  const { currentUser, userRole, userProfile, isSuperAdmin } = useAuth();

  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [weightHistory, setWeightHistory] = useState([]);
  const [lastWeightDate, setLastWeightDate] = useState(null);
  const [canUpdateWeight, setCanUpdateWeight] = useState(true);

  /* ===================== HELPERS MULTI-UTILISATEURS ===================== */
  const getUserProgress = (workout, userId = currentUser?.uid) => {
    if (!workout || !userId) {
      console.log("[getUserProgress] workout ou userId manquant", { workout: !!workout, userId });
      return null;
    }
    const progress = workout.userProgress?.[userId] || null;
    console.log("[getUserProgress]", { 
      userId, 
      hasUserProgress: !!workout.userProgress,
      hasThisUser: !!progress,
      progress 
    });
    return progress;
  };

  const isWorkoutCompleted = (workout, userId = currentUser?.uid) => {
    const progress = getUserProgress(workout, userId);
    const completed = progress?.completedAt ? true : false;
    console.log("[isWorkoutCompleted]", { 
      userId, 
      workoutId: workout?.id,
      hasProgress: !!progress, 
      completedAt: progress?.completedAt,
      result: completed,
      // Info sur ancienne structure (pour debug)
      oldCompletedAt: workout?.completedAt,
      oldCompletedBy: workout?.completedBy
    });
    return completed;
  };

  const isWorkoutInProgress = (workout, userId = currentUser?.uid) => {
    const progress = getUserProgress(workout, userId);
    const inProgress = progress?.inProgress === true && !progress?.completedAt;
    console.log("[isWorkoutInProgress]", { userId, result: inProgress });
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
      return { label: "Risque de blessure", color: "#e74c3c", emoji: "⚠️" };
    if (score < 7.5)
      return { label: "Fatigue fonctionnelle", color: "#f39c12", emoji: "😌" };
    return { label: "En forme", color: "#27ae60", emoji: "💪" };
  };

  const getACWRStatus = (acwr) => {
    if (!acwr) return { label: "Données insuffisantes", color: "#95a5a6" };
    const v = Number(acwr);
    if (v < 0.8) return { label: "Sous-chargé", color: "#3498db" };
    if (v <= 1.3) return { label: "Optimal", color: "#27ae60" };
    if (v <= 1.5) return { label: "Attention", color: "#f39c12" };
    return { label: "Surcharge", color: "#e74c3c" };
  };

  const calculateACWR = (workouts, userId = currentUser?.uid) => {
    if (!workouts || workouts.length === 0 || !userId) return null;

    const calcLoad = (w) => {
      const feedback = getUserFeedback(w, userId);
      if (!feedback || Object.keys(feedback).length === 0) return 0;
      let total = 0,
        count = 0;
      Object.values(feedback).forEach((fb) => {
        if (fb.rpe) {
          total += Number(fb.rpe);
          count++;
        }
      });
      return count > 0 ? (total / count) * (w.estimatedDuration || 60) : 0;
    };

    const today = new Date();
    const last7 = workouts.filter((w) => {
      const diff = (today - new Date(w.date + "T12:00:00")) / 86400000;
      return diff >= 0 && diff < 7 && isWorkoutCompleted(w, userId);
    });
    const last28 = workouts.filter((w) => {
      const diff = (today - new Date(w.date + "T12:00:00")) / 86400000;
      return diff >= 0 && diff < 28 && isWorkoutCompleted(w, userId);
    });

    if (last28.length < 10) return null;

    const acute = last7.reduce((s, w) => s + calcLoad(w), 0);
    const chronic = last28.reduce((s, w) => s + calcLoad(w), 0) / 4;

    return chronic === 0 ? null : (acute / chronic).toFixed(2);
  };

  const calculateACWRHistory = (workouts, userId = currentUser?.uid) => {
    if (!workouts || workouts.length === 0 || !userId) return [];

    const calcLoad = (w) => {
      const feedback = getUserFeedback(w, userId);
      if (!feedback || Object.keys(feedback).length === 0) return 0;
      let total = 0,
        count = 0;
      Object.values(feedback).forEach((fb) => {
        if (fb.rpe) {
          total += Number(fb.rpe);
          count++;
        }
      });
      return count > 0 ? (total / count) * (w.estimatedDuration || 60) : 0;
    };

    const completedWorkouts = workouts
      .filter((w) => isWorkoutCompleted(w, userId))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (completedWorkouts.length < 10) return [];

    const history = [];
    const today = new Date();

    for (let i = 0; i < 90; i++) {
      const currentDate = new Date(today);
      currentDate.setDate(currentDate.getDate() - (89 - i));
      const dateStr = getLocalDateStr(currentDate);

      const last7 = completedWorkouts.filter((w) => {
        const wDate = new Date(w.date + "T12:00:00");
        const diff = (currentDate - wDate) / 86400000;
        return diff >= 0 && diff < 7;
      });

      const last28 = completedWorkouts.filter((w) => {
        const wDate = new Date(w.date + "T12:00:00");
        const diff = (currentDate - wDate) / 86400000;
        return diff >= 0 && diff < 28;
      });

      if (last28.length >= 10) {
        const acute = last7.reduce((s, w) => s + calcLoad(w), 0);
        const chronic = last28.reduce((s, w) => s + calcLoad(w), 0) / 4;
        const acwr =
          chronic === 0 ? null : Number((acute / chronic).toFixed(2));
        if (acwr !== null) history.push({ date: dateStr, acwr });
      }
    }
    return history;
  };

  const getAthleteName = (a) => {
    if (a.firstName && a.lastName) return `${a.firstName} ${a.lastName}`;
    if (a.displayName) return a.displayName;
    if (a.email) return a.email.split("@")[0];
    return "Athlète";
  };

  /* ==================== VUE ATHLÈTE ==================== */
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

        const todayWorkouts = allWorkouts.filter((w) => {
          if (w.date !== today) return false;
          return (
            w.group === "total" ||
            w.group === userGrp ||
            w.targetUserId === currentUser.uid
          );
        });

        if (todayWorkouts.length > 0) setTodayWorkout(todayWorkouts[0]);
      } catch (e) {
        console.error("Erreur athlète:", e);
      }
    };
    load();
  }, [userRole, currentUser, userProfile]);

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

  /* ==================== VUE ADMIN ==================== */
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

        const result = athleteUsers.map((u) => {
          const userWellness = allWellness
            .filter((w) => w.userId === u.id)
            .sort((a, b) => b.date.localeCompare(a.date));

          const todayW = userWellness.find((w) => w.date === today);
          const wScore = todayW ? calculateWellnessScore(todayW) : null;

          const uGrp = u.group || "total";
          const uWorkouts = allWorkouts.filter(
            (w) =>
              w.group === "total" || w.group === uGrp || w.targetUserId === u.id
          );
          const todayWorkout = uWorkouts.find((w) => w.date === today);

          const acwr = calculateACWR(uWorkouts, u.id);

          return {
            ...u,
            lastWellness: todayW || null,
            wellnessScore: wScore,
            status: wScore !== null ? getWellnessStatus(wScore) : null,
            acwr: acwr,
            acwrStatus: getACWRStatus(acwr),
            todayCompleted: todayWorkout ? isWorkoutCompleted(todayWorkout, u.id) : false,
            todayWorkoutTitle: todayWorkout?.title || null,
            todayWorkoutInProgress: todayWorkout ? isWorkoutInProgress(todayWorkout, u.id) : false,
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
  }, [userRole, currentUser]);

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
      const uWorkouts = allW.filter(
        (w) =>
          w.group === "total" ||
          w.group === uGrp ||
          w.targetUserId === athlete.id
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
          color: "#fff",
          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  // VUE ATHLÈTE
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
          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
          minHeight: "100vh",
          color: "#fff",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 5 }}>
          Bonjour {userProfile?.firstName || "Athlète"} ! 👋
        </h2>
        <p style={{ color: "#888", marginBottom: 30, fontSize: 14 }}>
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>

        {!todayWellness && (
          <div
            style={{
              background: "#3a2f1f",
              padding: 20,
              borderRadius: 12,
              border: "2px solid #f39c12",
              marginBottom: 20,
            }}
          >
            <h3
              style={{ margin: "0 0 10px 0", fontSize: 18, color: "#f39c12" }}
            >
              ⚠️ Wellness non rempli
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#f8d7a0" }}>
              N'oublie pas de remplir ton questionnaire wellness d'aujourd'hui !
            </p>
          </div>
        )}

        {todayScore !== null && (
          <div
            style={{
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
              padding: 20,
              borderRadius: 12,
              border: "2px solid #2f80ed",
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
                  background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                  padding: 12,
                  borderRadius: 8,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                  Score du jour
                </div>
                <div
                  style={{ fontSize: 28, fontWeight: "bold", color: "#2f80ed" }}
                >
                  {todayScore.toFixed(1)}/10
                </div>
              </div>
              <div
                style={{
                  background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                  padding: 12,
                  borderRadius: 8,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                  Moy. Hebdo
                </div>
                <div
                  style={{ fontSize: 28, fontWeight: "bold", color: "#27ae60" }}
                >
                  {weeklyAvg || "–"}
                </div>
              </div>
            </div>
            {wellnessHistory.length > 1 && (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={wellnessHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="date"
                    stroke="#888"
                    fontSize={10}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis domain={[0, 10]} stroke="#888" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="normalizedScore"
                    stroke="#2f80ed"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        <div
          style={{
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #2f80ed",
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
              <div style={{ fontSize: 14, color: "#888", marginBottom: 10 }}>
                Durée estimée : {todayWorkout.estimatedDuration || "N/A"} min
              </div>
              {isWorkoutCompleted(todayWorkout) ? (
                <div
                  style={{
                    padding: 12,
                    background: "#1a3a2a",
                    borderRadius: 8,
                    color: "#27ae60",
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
                    background: "#3a2f1f",
                    borderRadius: 8,
                    color: "#f39c12",
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
                      background: "#2a1a1a",
                      borderRadius: 8,
                      color: "#e74c3c",
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
                      background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                      color: "white",
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
            <div style={{ textAlign: "center", padding: 20, color: "#888" }}>
              Pas de séance programmée aujourd'hui
            </div>
          )}
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #9b59b6",
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", color: "#9b59b6", fontSize: 18 }}>
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
                  background: canUpdateWeight ? "#9b59b6" : "#555",
                  color: "white",
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
                  border: "1px solid #555",
                  background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                  color: "#fff",
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
                    background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
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
                    background: "#e74c3c",
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
            <div style={{ fontSize: 12, color: "#f39c12", marginBottom: 10 }}>
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
              <div style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>
                📈 Évolution du poids
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={weightHistory}>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9b59b6" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#9b59b6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="date"
                    stroke="#888"
                    fontSize={10}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis
                    stroke="#888"
                    fontSize={10}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    name="Poids (kg)"
                    stroke="#9b59b6"
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
              background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                      padding: 15,
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 14, color: "#888", marginBottom: 4 }}
                      >
                        {rm.exercise}
                      </div>
                      {rm.date && (
                        <div style={{ fontSize: 11, color: "#666" }}>
                          {new Date(rm.date).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: "bold",
                        color: "#2f80ed",
                      }}
                    >
                      {rm.kg} <span style={{ fontSize: 14 }}>kg</span>
                      {rm.autoAdjusted && (
                        <span
                          style={{
                            fontSize: 14,
                            marginLeft: 6,
                            color: "#f39c12",
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

  // VUE ADMIN
  return (
    <div
      style={{
        padding: 20,
        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
        minHeight: "100vh",
        color: "#fff",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 5px 0" }}>
            📊 Dashboard Admin
          </h2>
          <p style={{ color: "#888", margin: 0, fontSize: 14 }}>
            Suivi wellness et performance
          </p>
        </div>
        {todayWorkout && (
          <button
            onClick={() => (window.location.href = "/workout")}
            style={{
              padding: "12px 20px",
              background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
              color: "white",
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

      <div
        style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        {[
          {
            key: "total",
            label: `📋 Total (${athletes.length})`,
            color: "#2f80ed",
          },
          {
            key: "risque",
            label: `⚠️ Risque (${
              athletes.filter(
                (a) => a.wellnessScore !== null && a.wellnessScore < 5
              ).length
            })`,
            color: "#e74c3c",
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
            color: "#f39c12",
          },
          {
            key: "forme",
            label: `💪 En forme (${
              athletes.filter(
                (a) => a.wellnessScore !== null && a.wellnessScore >= 7.5
              ).length
            })`,
            color: "#27ae60",
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
                wellnessFilter === f.key ? f.color : "#444"
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
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            padding: 40,
            borderRadius: 12,
            textAlign: "center",
            border: "2px solid #e74c3c",
          }}
        >
          <h3 style={{ color: "#e74c3c" }}>⚠️ Aucun athlète trouvé</h3>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((athlete) => (
            <div
              key={athlete.id}
              onClick={() => loadAthleteDetail(athlete)}
              style={{
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                padding: 18,
                borderRadius: 10,
                border: `2px solid ${athlete.status?.color || "#444"}`,
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
                  <div style={{ fontSize: 13, color: "#888" }}>
                    Groupe : {athlete.group || "total"}
                    {athlete.todayWorkoutTitle && (
                      <span style={{ marginLeft: 12 }}>
                        {athlete.todayCompleted ? (
                          <span
                            style={{ color: "#27ae60", fontWeight: "bold" }}
                          >
                            ✅ {athlete.todayWorkoutTitle}
                          </span>
                        ) : athlete.todayWorkoutInProgress ? (
                          <span
                            style={{ color: "#f39c12", fontWeight: "bold" }}
                          >
                            ⏳ {athlete.todayWorkoutTitle}
                          </span>
                        ) : (
                          <span style={{ color: "#e74c3c" }}>
                            ❌ {athlete.todayWorkoutTitle}
                          </span>
                        )}
                      </span>
                    )}
                    {!athlete.todayWorkoutTitle && (
                      <span style={{ marginLeft: 12, color: "#666" }}>
                        Pas de séance aujourd'hui
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  {athlete.wellnessScore !== null && (
                    <div style={{ textAlign: "center", minWidth: 75 }}>
                      <div
                        style={{ fontSize: 10, color: "#888", marginBottom: 3 }}
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
                        style={{ fontSize: 10, color: "#888", marginBottom: 3 }}
                      >
                        ACWR
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DÉTAILS ATHLÈTE */}
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
              background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
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
                borderBottom: "2px solid #2f80ed",
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
                  background: "#e74c3c",
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

            {/* KPI Cards */}
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
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>
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
              {athleteDetails.dailyScore !== null && (
                <div
                  style={{
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>
                    MOY. QUOTIDIENNE
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: "#2f80ed",
                    }}
                  >
                    {athleteDetails.dailyScore.toFixed(1)}/10
                  </div>
                </div>
              )}
              {athleteDetails.weeklyAvg && (
                <div
                  style={{
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>
                    MOY. HEBDOMADAIRE
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: "bold",
                      color: "#27ae60",
                    }}
                  >
                    {athleteDetails.weeklyAvg}/10
                  </div>
                </div>
              )}
              {showAthleteDetail.acwr !== null && (
                <div
                  style={{
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                    padding: 18,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>
                    ACWR
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
              <div
                style={{
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                  padding: 18,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>
                  POIDS
                </div>
                <div
                  style={{ fontSize: 30, fontWeight: "bold", color: "#9b59b6" }}
                >
                  {showAthleteDetail.weight
                    ? `${showAthleteDetail.weight} kg`
                    : "N/A"}
                </div>
              </div>
            </div>

            {/* Séance */}
            <div
              style={{
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                        background: "#1a3a2a",
                        borderRadius: 8,
                        color: "#27ae60",
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
                        background: "#3a2f1f",
                        borderRadius: 8,
                        color: "#f39c12",
                        fontWeight: "bold",
                      }}
                    >
                      ⏳ En cours
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 12,
                        background: "#2a1a1a",
                        borderRadius: 8,
                        color: "#e74c3c",
                        fontWeight: "bold",
                      }}
                    >
                      ❌ Non démarrée
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#888", fontSize: 14 }}>
                  Pas de séance programmée
                </div>
              )}
            </div>

            {/* DOULEURS DÉTAILLÉES */}
            {showAthleteDetail.lastWellness &&
              showAthleteDetail.lastWellness.douleur > 3 && (
                <div
                  style={{
                    background: "#3a1f1f",
                    padding: 18,
                    borderRadius: 10,
                    border: "2px solid #e74c3c",
                    marginBottom: 25,
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 12px 0",
                      color: "#e74c3c",
                      fontSize: 16,
                    }}
                  >
                    ⚠️ Douleurs signalées
                  </h4>

                  {/* Intensité totale */}
                  <div
                    style={{
                      marginBottom: 15,
                      padding: 12,
                      background: "#2a1a1a",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#f8b4b4",
                        marginBottom: 4,
                      }}
                    >
                      INTENSITÉ TOTALE
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: "bold",
                        color: "#e74c3c",
                      }}
                    >
                      {showAthleteDetail.lastWellness.douleur}/10
                    </div>
                  </div>

                  {/* Douleurs spécifiques du bodyscan */}
                  {showAthleteDetail.lastWellness.bodyscan &&
                    Object.keys(showAthleteDetail.lastWellness.bodyscan)
                      .length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#f8b4b4",
                            marginBottom: 10,
                            fontWeight: "bold",
                          }}
                        >
                          LOCALISATIONS SPÉCIFIQUES :
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(150px, 1fr))",
                            gap: 10,
                          }}
                        >
                          {Object.entries(
                            showAthleteDetail.lastWellness.bodyscan
                          ).map(
                            ([zone, intensity]) =>
                              intensity > 0 && (
                                <div
                                  key={zone}
                                  style={{
                                    background: "#2a1a1a",
                                    padding: 10,
                                    borderRadius: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "#f8b4b4",
                                      marginBottom: 4,
                                    }}
                                  >
                                    {zone}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 18,
                                      fontWeight: "bold",
                                      color:
                                        intensity > 5 ? "#e74c3c" : "#f39c12",
                                    }}
                                  >
                                    {intensity}/10
                                  </div>
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}

            {/* ACWR History */}
            {acwrHistory.length > 0 ? (
              <div
                style={{
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                }}
              >
                <h3 style={{ margin: "0 0 15px 0", fontSize: 17 }}>
                  📊 Évolution ACWR
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={acwrHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="date"
                      stroke="#888"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis stroke="#888" fontSize={11} domain={[0, 2]} />
                    <Tooltip
                      contentStyle={{
                        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="acwr"
                      name="ACWR"
                      stroke="#2f80ed"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
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
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 25,
                  textAlign: "center",
                }}
              >
                <h3
                  style={{ margin: "0 0 10px 0", fontSize: 17, color: "#888" }}
                >
                  📊 ACWR
                </h3>
                <p style={{ color: "#666", fontSize: 14 }}>
                  Données insuffisantes (minimum 10 workouts complétés sur 28
                  jours)
                </p>
              </div>
            )}

            {/* Wellness détaillé */}
            {athleteDetails.wellness.length > 0 && (
              <div
                style={{
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="date"
                      stroke="#888"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis domain={[0, 10]} stroke="#888" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
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
                      stroke="#e74c3c"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="stress"
                      name="Stress"
                      stroke="#f39c12"
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
                      stroke="#9b59b6"
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

            {/* Poids */}
            {athleteDetails.weightHistory.length > 0 && (
              <div
                style={{
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                          stopColor="#9b59b6"
                          stopOpacity={0.7}
                        />
                        <stop
                          offset="95%"
                          stopColor="#9b59b6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="date"
                      stroke="#888"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis
                      stroke="#888"
                      fontSize={11}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      name="Poids (kg)"
                      stroke="#9b59b6"
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
                    color: "#888",
                  }}
                >
                  Poids actuel:{" "}
                  <strong style={{ color: "#9b59b6" }}>
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

            {/* COURBES RM PAR EXERCICE */}
            {Object.keys(detailedAthleteRMHistory).length > 0 && (
              <div
                style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)", padding: 20, borderRadius: 10 }}
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
                          background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
                          padding: 15,
                          borderRadius: 8,
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 12px 0",
                            fontSize: 15,
                            textTransform: "capitalize",
                            color: "#2f80ed",
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
                                stroke="#888"
                                fontSize={10}
                              />
                              <YAxis stroke="#888" fontSize={10} />
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
                                stroke="#2f80ed"
                                strokeWidth={2}
                                dot={{ fill: "#2f80ed", r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div
                            style={{
                              textAlign: "center",
                              padding: 20,
                              color: "#888",
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
                            color: "#888",
                            textAlign: "center",
                          }}
                        >
                          RM actuel :{" "}
                          <strong style={{ color: "#2f80ed" }}>
                            {history[history.length - 1].kg} kg
                          </strong>
                          {history[history.length - 1].autoAdjusted && (
                            <span style={{ marginLeft: 8, color: "#f39c12" }}>
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
