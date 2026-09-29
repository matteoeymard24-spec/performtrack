import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
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
import {
  rediRatioHistory,
  rediAcute,
  rediChronic,
  rediRatio,
  getREDIStatus,
  dataCompleteness,
  loadZScoreHistory,
  zScore,
  getZScoreStatus,
  getLocalDateStr,
  monotonyStrain,
  getMonotonyStatus,
  monotonyStrainHistory,
  getStrainStatus,
  rediRatioZScoreHistory,
  getIndividualREDIStatus,
} from "../component/loadMetrics";

export default function ACWRMonitoring() {
  const { userRole } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [rediData, setRediData] = useState([]);
  const [currentStats, setCurrentStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAthlete, setLoadingAthlete] = useState(false);
  const [customGroups, setCustomGroups] = useState([]);

  // 🔒 Sécurité : Admin uniquement
  if (userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

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

  // Charge d'une séance (sRPE = RPE moyen × durée), même logique que
  // l'ancien ACWR : gère les deux formats de feedback (musculation /
  // sprint-endurance).
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

  // Une entrée de charge par jour (somme si plusieurs séances le même jour).
  // C'est cette série {date, load} que REDI pondère par décroissance
  // exponentielle — les jours sans séance sont simplement absents du
  // tableau, ce qui est justement ce que REDI sait gérer nativement.
  const buildDailyLoads = (workouts, userId) => {
    const map = {};
    workouts.forEach((w) => {
      const progress = getUserProgress(w, userId);
      if (!progress?.completedAt) return;
      const load = calculateLoad(w, userId);
      if (load <= 0) return;
      map[w.date] = (map[w.date] || 0) + load;
    });
    return Object.entries(map).map(([date, load]) => ({ date, load }));
  };

  const loadAthleteREDI = async (athlete) => {
    setSelectedAthlete(athlete);
    setRediData([]);
    setCurrentStats(null);
    setLoadingAthlete(true);

    try {
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

      const dailyLoads = buildDailyLoads(relevantWorkouts, athlete.id);
      const todayStr = getLocalDateStr(new Date());

      const timeline = rediRatioHistory(dailyLoads, 60);
      const acute = rediAcute(dailyLoads, todayStr);
      const chronic = rediChronic(dailyLoads, todayStr);
      const ratio = rediRatio(dailyLoads, todayStr);
      const completeness = dataCompleteness(dailyLoads, todayStr);
      const zHistory = loadZScoreHistory(dailyLoads, todayStr);
      const z = zScore(acute, zHistory);

      // Monotonie & Strain (Foster, 1998) sur la semaine glissante.
      const { monotony, strain, weeklyLoad } = monotonyStrain(dailyLoads, todayStr);
      const strainHistory = monotonyStrainHistory(dailyLoads, 60)
        .filter((e) => e.date < todayStr && e.strain !== null)
        .map((e) => e.strain);
      const strainZ = strain !== null ? zScore(strain, strainHistory) : null;

      // Seuil REDI individualisé : le ratio du jour comparé à l'historique
      // PROPRE de l'athlète, en complément des zones littérature fixes.
      const ratioZHistory = rediRatioZScoreHistory(dailyLoads, todayStr);
      const ratioZ = ratio !== null ? zScore(ratio, ratioZHistory) : null;

      setRediData(timeline);
      setCurrentStats({
        acute,
        chronic,
        ratio,
        completeness,
        z,
        dailyCount: dailyLoads.length,
        monotony,
        strain,
        weeklyLoad,
        strainZ,
        ratioZ,
      });
    } catch (error) {
      console.error("Erreur chargement REDI:", error);
    } finally {
      setLoadingAthlete(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#f3f0ea" }}>
        Chargement...
      </div>
    );
  }

  const rediStatus = currentStats ? getREDIStatus(currentStats.ratio) : null;
  const zStatus = currentStats ? getZScoreStatus(currentStats.z) : null;
  const individualRediStatus = currentStats
    ? getIndividualREDIStatus(currentStats.ratio, currentStats.ratioZ)
    : null;
  const monotonyStatus = currentStats ? getMonotonyStatus(currentStats.monotony) : null;
  const strainStatus = currentStats ? getStrainStatus(currentStats.strainZ) : null;

  return (
    <div
      style={{
        padding: 20,
        background: "#151310",
        minHeight: "100vh",
        color: "#f3f0ea",
      }}
    >
      <h2 style={{ color: "#f3f0ea", marginBottom: 10 }}>Monitoring REDI</h2>
      <p style={{ color: "#a8a199", marginBottom: 8, maxWidth: 720 }}>
        Charge d'entraînement (sRPE) pondérée par décroissance exponentielle
        (Robust Exponential Decreasing Index — Moussa et al., 2020), plus
        fiable que l'ACWR classique quand des séances ou des feedbacks
        manquent : les jours sans donnée sont ignorés au lieu d'être comptés
        comme nuls.
      </p>
      <p style={{ color: "#a8a199", marginBottom: 30, maxWidth: 720, fontSize: 13 }}>
        Le ratio REDI (aigu / chronique) est complété par un{" "}
        <strong style={{ color: "#e0a13d" }}>z-score individualisé</strong> :
        il compare la charge du jour à la moyenne et l'écart-type propres à
        cet athlète (pas à une norme générale), ce qui repère une charge
        inhabituelle même quand le ratio reste en "zone optimale".
      </p>

      {/* Sélection athlète */}
      <div style={{ marginBottom: 30 }}>
        <label
          style={{
            display: "block",
            marginBottom: 10,
            fontSize: 16,
            fontWeight: "bold",
            color: "#f3f0ea",
          }}
        >
          Sélectionner un athlète :
        </label>
        <select
          value={selectedAthlete?.id || ""}
          onChange={(e) => {
            const athlete = athletes.find((a) => a.id === e.target.value);
            if (athlete) loadAthleteREDI(athlete);
          }}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #2a2620",
            background: "#1a1815",
            color: "#f3f0ea",
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
        <div style={{ textAlign: "center", padding: 20, color: "#a8a199" }}>
          Chargement des données...
        </div>
      )}

      {/* Affichage REDI */}
      {selectedAthlete && !loadingAthlete && (
        <div>
          <div
            style={{
              background: "#1a1815",
              padding: 25,
              borderRadius: 12,
              border: "2px solid #e0a13d",
              marginBottom: 30,
            }}
          >
            <h3 style={{ margin: "0 0 20px 0", color: "#f3f0ea" }}>
              {selectedAthlete.firstName && selectedAthlete.lastName
                ? `${selectedAthlete.firstName} ${selectedAthlete.lastName}`
                : selectedAthlete.displayName || selectedAthlete.email}
            </h3>

            {currentStats && currentStats.ratio !== null ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 15,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      background: "#151310",
                      padding: 20,
                      borderRadius: 8,
                      border: `2px solid ${rediStatus.color}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                      RATIO REDI
                    </div>
                    <div style={{ fontSize: 36, fontWeight: "bold", color: rediStatus.color }}>
                      {currentStats.ratio.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 13, color: rediStatus.color, marginTop: 5 }}>
                      {rediStatus.label}
                    </div>
                    {individualRediStatus?.individualized && (
                      <div style={{ fontSize: 11, color: "#706a61", marginTop: 4 }}>
                        {individualRediStatus.detail}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      background: "#151310",
                      padding: 20,
                      borderRadius: 8,
                      border: `2px solid ${zStatus.color}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                      Z-SCORE CHARGE (vs propre historique)
                    </div>
                    <div style={{ fontSize: 36, fontWeight: "bold", color: zStatus.color }}>
                      {currentStats.z !== null ? currentStats.z.toFixed(2) : "—"}
                    </div>
                    <div style={{ fontSize: 13, color: zStatus.color, marginTop: 5 }}>
                      {zStatus.label}
                    </div>
                  </div>

                  <div style={{ background: "#151310", padding: 20, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                      CHARGE AIGÜE REDI (~7j)
                    </div>
                    <div style={{ fontSize: 28, fontWeight: "bold", color: "#e0a13d" }}>
                      {Math.round(currentStats.acute)}
                    </div>
                  </div>

                  <div style={{ background: "#151310", padding: 20, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                      CHARGE CHRONIQUE REDI (~28j)
                    </div>
                    <div style={{ fontSize: 28, fontWeight: "bold", color: "#4fae7d" }}>
                      {Math.round(currentStats.chronic)}
                    </div>
                  </div>

                  {currentStats.monotony !== null && (
                    <div
                      style={{
                        background: "#151310",
                        padding: 20,
                        borderRadius: 8,
                        border: `2px solid ${monotonyStatus.color}`,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                        MONOTONIE (7j — Foster 1998)
                      </div>
                      <div style={{ fontSize: 28, fontWeight: "bold", color: monotonyStatus.color }}>
                        {currentStats.monotony.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 13, color: monotonyStatus.color, marginTop: 5 }}>
                        {monotonyStatus.label}
                      </div>
                    </div>
                  )}

                  {currentStats.strain !== null && (
                    <div
                      style={{
                        background: "#151310",
                        padding: 20,
                        borderRadius: 8,
                        border: `2px solid ${strainStatus.color}`,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 5 }}>
                        STRAIN (charge × monotonie)
                      </div>
                      <div style={{ fontSize: 28, fontWeight: "bold", color: strainStatus.color }}>
                        {currentStats.strain}
                      </div>
                      <div style={{ fontSize: 13, color: strainStatus.color, marginTop: 5 }}>
                        {strainStatus.label}
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#a8a199",
                    marginBottom: 30,
                    padding: "8px 12px",
                    background: "#151310",
                    borderRadius: 8,
                    display: "inline-block",
                  }}
                >
                  Complétude des données sur 28j :{" "}
                  <strong style={{ color: "#f3f0ea" }}>
                    {Math.round(currentStats.completeness * 100)}%
                  </strong>{" "}
                  ({currentStats.dailyCount} jours avec séance renseignée)
                </div>

                {/* Graphique REDI */}
                <div>
                  <h4 style={{ color: "#f3f0ea", marginBottom: 15 }}>
                    Évolution du ratio REDI (60 derniers jours)
                  </h4>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={rediData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                      <XAxis
                        dataKey="date"
                        stroke="#a8a199"
                        tickFormatter={(d) => d.slice(5)}
                      />
                      <YAxis domain={[0, 2]} stroke="#a8a199" />
                      <Tooltip
                        contentStyle={{
                          background: "#151310",
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: "#f3f0ea" }}
                      />
                      <Legend />

                      <ReferenceLine y={0.8} stroke="#3498db" strokeDasharray="3 3" label="Sous-charge" />
                      <ReferenceLine y={1.3} stroke="#4fae7d" strokeDasharray="3 3" label="Optimal" />
                      <ReferenceLine y={1.5} stroke="#d9a441" strokeDasharray="3 3" label="Attention" />

                      <Line
                        type="monotone"
                        dataKey="redi"
                        stroke="#e0a13d"
                        strokeWidth={3}
                        name="Ratio REDI"
                        dot={{ fill: "#e0a13d", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Légende */}
                <div
                  style={{
                    marginTop: 30,
                    padding: 20,
                    background: "#151310",
                    borderRadius: 8,
                  }}
                >
                  <h4 style={{ margin: "0 0 15px 0", color: "#f3f0ea" }}>
                    Interprétation
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 15,
                      marginBottom: 20,
                    }}
                  >
                    <div>
                      <div style={{ color: "#3498db", fontWeight: "bold", marginBottom: 5 }}>
                        Sous-chargé (&lt; 0.8)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#a8a199" }}>
                        L'athlète peut supporter plus de charge. Possibilité
                        d'augmenter le volume.
                      </p>
                    </div>
                    <div>
                      <div style={{ color: "#4fae7d", fontWeight: "bold", marginBottom: 5 }}>
                        Zone optimale (0.8 - 1.3)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#a8a199" }}>
                        Charge cohérente avec l'historique récent de l'athlète.
                      </p>
                    </div>
                    <div>
                      <div style={{ color: "#d9a441", fontWeight: "bold", marginBottom: 5 }}>
                        Attention (1.3 - 1.5)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#a8a199" }}>
                        Charge élevée. Surveiller la récupération, le
                        wellness et le z-score de charge.
                      </p>
                    </div>
                    <div>
                      <div style={{ color: "#d9695a", fontWeight: "bold", marginBottom: 5 }}>
                        Surcharge (&gt; 1.5)
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#a8a199" }}>
                        Écart important par rapport à la charge chronique.
                        Réduire le volume si le wellness confirme la fatigue.
                      </p>
                    </div>
                  </div>
                  <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#706a61", lineHeight: 1.5 }}>
                    À noter : la littérature (sur des pentathlètes) a montré
                    que la majorité des blessures étudiées survenaient malgré
                    un ratio dans la "zone optimale" — un ratio correct ne
                    suffit pas à écarter le risque. C'est pourquoi le
                    z-score de charge et le wellness (croisés sur le
                    Dashboard) sont à lire en complément du ratio, jamais
                    seuls.
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#706a61", lineHeight: 1.5 }}>
                    Monotonie et strain (Foster, 1998) : une monotonie
                    élevée signifie que la charge varie peu d'un jour à
                    l'autre sur la semaine — même à charge totale
                    raisonnable, cela est associé à un risque accru de
                    surentraînement et de maladie. Le strain (charge
                    hebdomadaire × monotonie) est ensuite comparé à
                    l'historique propre de l'athlète, car son niveau
                    "normal" dépend entièrement du profil individuel.
                  </p>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  background: "#151310",
                  borderRadius: 8,
                  color: "#a8a199",
                }}
              >
                <p style={{ fontSize: 16, margin: 0 }}>
                  Pas assez de données pour calculer le REDI.
                </p>
                <p style={{ fontSize: 14, margin: "10px 0 0 0" }}>
                  Il faut au moins quelques séances complétées avec feedback
                  RPE sur les 28 derniers jours.
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
            background: "#1a1815",
            borderRadius: 12,
            color: "#a8a199",
          }}
        >
          <p style={{ fontSize: 18, margin: 0 }}>
            Sélectionnez un athlète pour voir son REDI
          </p>
        </div>
      )}
    </div>
  );
}
