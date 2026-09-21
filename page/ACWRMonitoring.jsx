import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Navigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

const getLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export default function ACWRMonitoring() {
  const { userRole } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [acwrData, setAcwrData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAthlete, setLoadingAthlete] = useState(false);
  const [customGroups, setCustomGroups] = useState([]);

  // 🔒 Sécurité : Admin uniquement
  if (userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  // Charger la liste des athlètes
  useEffect(() => {
    const fetchAthletes = async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const athletesData = usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.superAdmin !== true && u.role !== "admin");

        athletesData.sort((a, b) => {
          const nameA = a.firstName || a.email || "";
          const nameB = b.firstName || b.email || "";
          return nameA.localeCompare(nameB);
        });

        setAthletes(athletesData);
        setLoading(false);
      } catch (error) {
        console.error("Erreur chargement athlètes:", error);
        setLoading(false);
      }
    };

    fetchAthletes();
  }, []);

  // Charger les groupes personnalisés (pour que l'ACWR compte aussi les séances
  // ciblées sur un groupe personnalisé dont fait partie l'athlète)
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const snap = await getDocs(collection(db, "groups"));
        setCustomGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Erreur chargement groupes:", error);
      }
    };
    fetchGroups();
  }, []);

  /* ===================== HELPERS ===================== */
  const getUserProgress = (workout, userId) => {
    if (!workout || !userId) return null;
    return workout.userProgress?.[userId] || null;
  };

  // Calcule la charge d'une séance pour un athlète donné
  // Gère les deux formats de feedback :
  // - muscu : { series: [{ rpe, ... }, ...], notes }
  // - sprint/endurance : { rpe, actualDistance, notes }
  const calculateLoad = (workout, userId) => {
    const progress = getUserProgress(workout, userId);
    const feedback = progress?.feedback;
    if (!feedback) return 0;

    let totalRPE = 0;
    let count = 0;

    Object.values(feedback).forEach((fb) => {
      if (fb.series && Array.isArray(fb.series)) {
        fb.series.forEach((serie) => {
          if (serie.rpe !== undefined && serie.rpe !== null) {
            totalRPE += Number(serie.rpe);
            count++;
          }
        });
      } else if (fb.rpe !== undefined && fb.rpe !== null) {
        totalRPE += Number(fb.rpe);
        count++;
      }
    });

    const avgRPE = count > 0 ? totalRPE / count : 0;
    const duration = workout.estimatedDuration || 60;
    return avgRPE * duration;
  };

  // Calculer l'ACWR pour chaque jour sur les 60 derniers jours
  const calculateACWRTimeline = (workouts, userId) => {
    if (!workouts || workouts.length === 0) return [];

    // Ne garder que les séances effectivement complétées par cet athlète
    const completedWorkouts = workouts.filter(
      (w) => getUserProgress(w, userId)?.completedAt
    );

    if (completedWorkouts.length === 0) return [];

    const timeline = [];
    const today = new Date();

    for (let i = 60; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getLocalDateStr(date);

      const last7Days = [];
      const last28Days = [];

      completedWorkouts.forEach((w) => {
        const workoutDate = new Date(w.date + "T12:00:00");
        const diff = (date - workoutDate) / (1000 * 60 * 60 * 24);

        if (diff >= 0 && diff < 7) last7Days.push(w);
        if (diff >= 0 && diff < 28) last28Days.push(w);
      });

      // Seuil minimum de fiabilité : au moins 10 séances complétées sur 28 jours
      if (last28Days.length < 10) continue;

      const acuteLoad = last7Days.reduce(
        (sum, w) => sum + calculateLoad(w, userId),
        0
      );
      const chronicLoad =
        last28Days.reduce((sum, w) => sum + calculateLoad(w, userId), 0) / 4;

      const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : null;

      if (acwr !== null) {
        timeline.push({
          date: dateStr,
          acwr: Number(acwr.toFixed(2)),
          acuteLoad: Math.round(acuteLoad),
          chronicLoad: Math.round(chronicLoad),
        });
      }
    }

    return timeline;
  };

  // Charger les données ACWR de l'athlète sélectionné
  const loadAthleteACWR = async (athlete) => {
    setSelectedAthlete(athlete);
    setAcwrData([]);
    setLoadingAthlete(true);

    try {
      // Charger TOUTES les séances (les règles Firestore autorisent la lecture),
      // puis filtrer celles concernant cet athlète (total / son groupe / individuelle ciblée)
      const workoutsSnap = await getDocs(collection(db, "workout"));
      const allWorkouts = workoutsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const athleteGroup = athlete.group || "total";
      const myGroupIds = customGroups
        .filter((g) => (g.athleteIds || []).includes(athlete.id))
        .map((g) => g.id);
      const relevantWorkouts = allWorkouts.filter(
        (w) =>
          w.group === "total" ||
          w.group === athleteGroup ||
          w.targetUserId === athlete.id ||
          myGroupIds.includes(w.group)
      );

      const timeline = calculateACWRTimeline(relevantWorkouts, athlete.id);
      setAcwrData(timeline);
    } catch (error) {
      console.error("Erreur chargement ACWR:", error);
    } finally {
      setLoadingAthlete(false);
    }
  };

  const getACWRColor = (value) => {
    if (value === null || value === undefined) return "#888";
    if (value < 0.8) return "#3498db"; // Sous-chargé
    if (value <= 1.3) return "#27ae60"; // Optimal
    if (value <= 1.5) return "#f39c12"; // Attention
    return "#e74c3c"; // Surcharge
  };

  const currentACWR =
    acwrData.length > 0 ? acwrData[acwrData.length - 1].acwr : null;

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#ffffff" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#ffffff",
      }}
    >
      <h2 style={{ color: "#ffffff", marginBottom: 10 }}>Monitoring ACWR</h2>
      <p style={{ color: "#b0b0b0", marginBottom: 30 }}>
        Suivez la charge d'entraînement de vos athlètes
      </p>

      {/* Sélection athlète */}
      <div style={{ marginBottom: 30 }}>
        <label
          style={{
            display: "block",
            marginBottom: 10,
            fontSize: 16,
            fontWeight: "bold",
            color: "#e0e0e0",
          }}
        >
          Sélectionner un athlète :
        </label>
        <select
          value={selectedAthlete?.id || ""}
          onChange={(e) => {
            const athlete = athletes.find((a) => a.id === e.target.value);
            if (athlete) loadAthleteACWR(athlete);
          }}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #555",
            background: "#2a2a2a",
            color: "#ffffff",
            fontSize: 16,
            minWidth: 300,
          }}
        >
          <option value="">-- Choisir un athlète --</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.firstName && a.lastName
                ? `${a.firstName} ${a.lastName}`
                : a.displayName || a.email}
            </option>
          ))}
        </select>
      </div>

      {loadingAthlete && (
        <div style={{ textAlign: "center", padding: 20, color: "#888" }}>
          ⏳ Chargement des données...
        </div>
      )}

      {/* Affichage ACWR */}
      {selectedAthlete && !loadingAthlete && (
        <div>
          <div
            style={{
              background: "#2a2a2a",
              padding: 25,
              borderRadius: 12,
              border: "2px solid #2f80ed",
              marginBottom: 30,
            }}
          >
            <h3 style={{ margin: "0 0 20px 0", color: "#ffffff" }}>
              {selectedAthlete.firstName && selectedAthlete.lastName
                ? `${selectedAthlete.firstName} ${selectedAthlete.lastName}`
                : selectedAthlete.displayName || selectedAthlete.email}
            </h3>

            {acwrData.length > 0 ? (
              <>
                {/* ACWR actuel */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 15,
                    marginBottom: 30,
                  }}
                >
                  <div
                    style={{
                      background: "#1a1a1a",
                      padding: 20,
                      borderRadius: 8,
                      border: `2px solid ${getACWRColor(currentACWR)}`,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, color: "#888", marginBottom: 5 }}
                    >
                      ACWR ACTUEL
                    </div>
                    <div
                      style={{
                        fontSize: 40,
                        fontWeight: "bold",
                        color: getACWRColor(currentACWR),
                      }}
                    >
                      {currentACWR}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: getACWRColor(currentACWR),
                        marginTop: 5,
                      }}
                    >
                      {currentACWR < 0.8 && "Sous-chargé"}
                      {currentACWR >= 0.8 &&
                        currentACWR <= 1.3 &&
                        "Zone optimale ✅"}
                      {currentACWR > 1.3 &&
                        currentACWR <= 1.5 &&
                        "Attention ⚠️"}
                      {currentACWR > 1.5 && "Surcharge 🔴"}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1a1a1a",
                      padding: 20,
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, color: "#888", marginBottom: 5 }}
                    >
                      CHARGE AIGÜE (7j)
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: "bold",
                        color: "#2f80ed",
                      }}
                    >
                      {acwrData[acwrData.length - 1].acuteLoad}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1a1a1a",
                      padding: 20,
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, color: "#888", marginBottom: 5 }}
                    >
                      CHARGE CHRONIQUE (28j)
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: "bold",
                        color: "#27ae60",
                      }}
                    >
                      {acwrData[acwrData.length - 1].chronicLoad}
                    </div>
                  </div>
                </div>

                {/* Graphique ACWR */}
                <div>
                  <h4 style={{ color: "#ffffff", marginBottom: 15 }}>
                    📈 Évolution ACWR (60 derniers jours)
                  </h4>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={acwrData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis
                        dataKey="date"
                        stroke="#888"
                        tickFormatter={(d) => d.slice(5)}
                      />
                      <YAxis domain={[0, 2]} stroke="#888" />
                      <Tooltip
                        contentStyle={{
                          background: "#1a1a1a",
                          border: "1px solid #444",
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: "#ffffff" }}
                      />
                      <Legend />

                      {/* Zones de référence */}
                      <ReferenceLine
                        y={0.8}
                        stroke="#3498db"
                        strokeDasharray="3 3"
                        label="Sous-charge"
                      />
                      <ReferenceLine
                        y={1.3}
                        stroke="#27ae60"
                        strokeDasharray="3 3"
                        label="Optimal"
                      />
                      <ReferenceLine
                        y={1.5}
                        stroke="#f39c12"
                        strokeDasharray="3 3"
                        label="Attention"
                      />

                      <Line
                        type="monotone"
                        dataKey="acwr"
                        stroke="#2f80ed"
                        strokeWidth={3}
                        name="ACWR"
                        dot={{ fill: "#2f80ed", r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Légende des zones */}
                <div
                  style={{
                    marginTop: 30,
                    padding: 20,
                    background: "#1a1a1a",
                    borderRadius: 8,
                  }}
                >
                  <h4 style={{ margin: "0 0 15px 0", color: "#ffffff" }}>
                    📊 Interprétation ACWR
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 15,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#3498db",
                          fontWeight: "bold",
                          marginBottom: 5,
                        }}
                      >
                        🔵 Sous-chargé (&lt; 0.8)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#b0b0b0" }}>
                        L'athlète peut supporter plus de charge. Possibilité
                        d'augmenter le volume.
                      </p>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#27ae60",
                          fontWeight: "bold",
                          marginBottom: 5,
                        }}
                      >
                        🟢 Zone optimale (0.8 - 1.3)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#b0b0b0" }}>
                        Charge idéale pour la progression. Maintenir ce niveau.
                      </p>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#f39c12",
                          fontWeight: "bold",
                          marginBottom: 5,
                        }}
                      >
                        🟠 Attention (1.3 - 1.5)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#b0b0b0" }}>
                        Charge élevée. Surveiller la récupération et le
                        wellness.
                      </p>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#e74c3c",
                          fontWeight: "bold",
                          marginBottom: 5,
                        }}
                      >
                        🔴 Surcharge (&gt; 1.5)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#b0b0b0" }}>
                        Risque de blessure élevé. Réduire le volume
                        immédiatement.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  background: "#1a1a1a",
                  borderRadius: 8,
                  color: "#b0b0b0",
                }}
              >
                <p style={{ fontSize: 16, margin: 0 }}>
                  Pas assez de données pour calculer l'ACWR.
                </p>
                <p style={{ fontSize: 14, margin: "10px 0 0 0" }}>
                  Il faut au moins 10 séances complétées avec feedback RPE sur
                  les 28 derniers jours.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedAthlete && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            background: "#2a2a2a",
            borderRadius: 12,
            color: "#b0b0b0",
          }}
        >
          <p style={{ fontSize: 18, margin: 0 }}>
            Sélectionnez un athlète pour voir son ACWR
          </p>
        </div>
      )}
    </div>
  );
}
