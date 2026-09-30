import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
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
} from "recharts";

export default function MyRM() {
  const { currentUser } = useAuth();

  // États VMA
  const [vma, setVma] = useState(null);
  const [editingVMA, setEditingVMA] = useState(false);
  const [vmaValue, setVmaValue] = useState("");
  const [vmaHistory, setVmaHistory] = useState([]);

  // États CMJ
  const [cmj, setCmj] = useState(null);
  const [editingCMJ, setEditingCMJ] = useState(false);
  const [cmjValue, setCmjValue] = useState("");
  const [cmjHistory, setCmjHistory] = useState([]);
  // CMJ détecté automatiquement quand un test CMJ est fait dans une séance
  // (même convention que Dashboard.jsx : hauteur stockée dans
  // series[].actualWeight quand l'exercice s'appelle "CMJ" / "Counter
  // Movement Jump"). Pas besoin de le ressaisir à la main.
  const [sessionCmjEntries, setSessionCmjEntries] = useState([]);

  // États RM
  const [rmHistory, setRmHistory] = useState({});
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(true);

  // Formulaire RM
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRM, setEditingRM] = useState(null);
  const [exerciseName, setExerciseName] = useState("");
  const [testWeight, setTestWeight] = useState("");
  const [testReps, setTestReps] = useState(1);
  const [calculated1RM, setCalculated1RM] = useState(null);

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

    try {
      const rmSnap = await getDocs(
        collection(db, "users", currentUser.uid, "rm")
      );

      // Séparer VMA, CMJ et RM
      const grouped = {};
      let vmaData = null;
      let vmaHist = [];
      let cmjData = null;
      let cmjHist = [];

      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = (data.exerciseName || d.id).toLowerCase();

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
          // RM normaux
          if (!grouped[name]) {
            grouped[name] = [];
          }

          grouped[name].push({
            date: data.updatedAt,
            kg: data.kg,
            originalWeight: data.originalWeight,
            originalReps: data.originalReps,
            autoAdjusted: data.autoAdjusted,
          });
        }
      });

      // Trier par date pour chaque exercice
      Object.keys(grouped).forEach((ex) => {
        grouped[ex].sort((a, b) => new Date(a.date) - new Date(b.date));
      });

      setRmHistory(grouped);
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
    loadRM();
  }, [currentUser]);

  const isCMJName = (exerciseName) => {
    if (!exerciseName) return false;
    const name = exerciseName.toLowerCase().trim();
    return name === "cmj" || name.includes("counter movement jump");
  };

  const loadSessionCmj = async () => {
    if (!currentUser) return;
    try {
      const snap = await getDocs(collection(db, "workout"));
      const map = {};
      snap.docs.forEach((docSnap) => {
        const w = docSnap.data();
        const progress = w.userProgress?.[currentUser.uid];
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
  }, [currentUser]);

  // Fusion CMJ manuel (saisi ici) + CMJ automatique (détecté dans les
  // séances) en une seule série chronologique, pour que l'athlète voie son
  // évolution complète sans avoir à ressaisir ce qui a déjà été mesuré en
  // séance. À date égale, la valeur de séance prime (mesure réelle).
  const mergedCmjSeries = (() => {
    const map = {};
    cmjHistory.forEach((h) => {
      const d = (h.date || "").slice(0, 10);
      if (d) map[d] = { date: d, heightCm: h.kg, source: "manuel" };
    });
    sessionCmjEntries.forEach((e) => {
      map[e.date] = { date: e.date, heightCm: e.heightCm, source: "séance" };
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  })();

  /* ===================== VMA ===================== */
  const saveVMA = async () => {
    if (!currentUser || !vmaValue) return;

    try {
      const history = [...vmaHistory];

      // Ajouter nouvelle entrée à l'historique
      if (vma && vma.kg !== Number(vmaValue)) {
        history.push({
          date: new Date().toISOString(),
          kg: Number(vmaValue),
        });
      } else if (!vma) {
        history.push({
          date: new Date().toISOString(),
          kg: Number(vmaValue),
        });
      }

      await setDoc(doc(db, "users", currentUser.uid, "rm", "VMA"), {
        kg: Number(vmaValue),
        exerciseName: "VMA",
        updatedAt: new Date().toISOString(),
        autoAdjusted: false,
        history: history.slice(-20),
      });

      setVma({
        kg: Number(vmaValue),
        exerciseName: "VMA",
        updatedAt: new Date().toISOString(),
        history: history.slice(-20),
      });
      setVmaHistory(history.slice(-20));
      setEditingVMA(false);
      setVmaValue("");
      alert("✅ VMA mise à jour !");
    } catch (e) {
      console.error("Erreur save VMA:", e);
      alert("Erreur: " + e.message);
    }
  };

  const deleteVMA = async () => {
    if (!window.confirm("Supprimer ta VMA ?")) return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "rm", "VMA"));
      setVma(null);
      setVmaHistory([]);
      alert("✅ VMA supprimée !");
    } catch (e) {
      console.error("Erreur suppression VMA:", e);
      alert("Erreur: " + e.message);
    }
  };

  /* ===================== CMJ ===================== */
  const saveCMJ = async () => {
    if (!currentUser || !cmjValue) return;

    try {
      const history = [...cmjHistory];

      // Ajouter nouvelle entrée à l'historique
      if (cmj && cmj.kg !== Number(cmjValue)) {
        history.push({
          date: new Date().toISOString(),
          kg: Number(cmjValue),
        });
      } else if (!cmj) {
        history.push({
          date: new Date().toISOString(),
          kg: Number(cmjValue),
        });
      }

      await setDoc(doc(db, "users", currentUser.uid, "rm", "CMJ"), {
        kg: Number(cmjValue),
        exerciseName: "CMJ",
        updatedAt: new Date().toISOString(),
        autoAdjusted: false,
        history: history.slice(-20),
      });

      setCmj({
        kg: Number(cmjValue),
        exerciseName: "CMJ",
        updatedAt: new Date().toISOString(),
        history: history.slice(-20),
      });
      setCmjHistory(history.slice(-20));
      setEditingCMJ(false);
      setCmjValue("");
      alert("✅ CMJ mis à jour !");
    } catch (e) {
      console.error("Erreur save CMJ:", e);
      alert("Erreur: " + e.message);
    }
  };

  const deleteCMJ = async () => {
    if (!window.confirm("Supprimer ton CMJ ?")) return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "rm", "CMJ"));
      setCmj(null);
      setCmjHistory([]);
      alert("✅ CMJ supprimé !");
    } catch (e) {
      console.error("Erreur suppression CMJ:", e);
      alert("Erreur: " + e.message);
    }
  };

  /* ===================== RM ===================== */
  const handleSaveRM = async () => {
    if (!currentUser || !exerciseName || !testWeight || !testReps) {
      alert("Remplis tous les champs");
      return;
    }

    const normalizedName = exerciseName.trim().toLowerCase();
    const rm1 = calculate1RM(testWeight, testReps);

    try {
      const rmData = {
        exerciseName: normalizedName,
        kg: rm1,
        originalWeight: Number(testWeight),
        originalReps: Number(testReps),
        updatedAt: new Date().toISOString(),
        autoAdjusted: false,
        lastRPE: null,
      };

      // Si on modifie et que le nom change, supprimer l'ancien
      if (editingRM && editingRM !== normalizedName) {
        await deleteDoc(doc(db, "users", currentUser.uid, "rm", editingRM));
      }

      await setDoc(
        doc(db, "users", currentUser.uid, "rm", normalizedName),
        rmData
      );

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

  const handleEditRM = (exerciseName) => {
    const history = rmHistory[exerciseName];
    const latest = history[history.length - 1];

    setEditingRM(exerciseName);
    setExerciseName(exerciseName);
    setTestWeight(latest.originalWeight || latest.kg);
    setTestReps(latest.originalReps || 1);
    setShowAddForm(true);
  };

  const handleDeleteRM = async (exerciseName) => {
    if (
      !window.confirm(`Supprimer tous les enregistrements de ${exerciseName} ?`)
    )
      return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "rm", exerciseName));
      alert("RM supprimé");
      loadRM();
      if (selectedExercise === exerciseName) {
        setSelectedExercise(null);
      }
    } catch (error) {
      console.error("Erreur suppression:", error);
      alert("Erreur lors de la suppression");
    }
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingRM(null);
    setExerciseName("");
    setTestWeight("");
    setTestReps(1);
    setCalculated1RM(null);
  };

  const exercises = Object.keys(rmHistory)
    .filter((ex) => ex !== "vma")
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
    <div
      style={{
        padding: 20,
        background: "#151310",
        minHeight: "100vh",
        color: "#f3f0ea",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>💪 Mes RM, VMA & CMJ</h2>
      <p style={{ color: "#a8a199", marginBottom: 30, fontSize: 14 }}>
        Tes charges maximales se mettent à jour automatiquement après chaque
        séance (à partir des séries proches du max : ≤6 reps, RPE≥8 — hors
        échauffement et poids du corps), mais tu peux aussi les ajouter ou
        les corriger toi-même ici, comme ta VMA et ton CMJ.
      </p>

      {/* ==================== VMA CARD ==================== */}
      <div
        style={{
          background: "#1a1815",
          padding: 20,
          borderRadius: 12,
          border: "2px solid #4fae7d",
          marginBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, color: "#4fae7d" }}>
            🏃 VMA (Vitesse Maximale Aérobie)
          </h3>
        </div>

        {!editingVMA ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: vmaHistory.length > 1 ? 15 : 0,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 36, fontWeight: "bold", color: "#4fae7d" }}
                >
                  {vma ? `${vma.kg} km/h` : "Non renseignée"}
                </div>
                {vma && vma.updatedAt && (
                  <div style={{ fontSize: 12, color: "#a8a199", marginTop: 5 }}>
                    Mis à jour le{" "}
                    {new Date(vma.updatedAt).toLocaleDateString("fr-FR")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setEditingVMA(true);
                    setVmaValue(vma?.kg || "");
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "#4fae7d",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  {vma ? "✏️ Modifier" : "➕ Ajouter"}
                </button>
                {vma && (
                  <button
                    onClick={deleteVMA}
                    style={{
                      padding: "10px 20px",
                      background: "#d9695a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: "bold",
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Courbe évolution VMA */}
            {vmaHistory.length > 1 && (
              <div
                style={{
                  marginTop: 20,
                  background: "#151310",
                  padding: 15,
                  borderRadius: 8,
                }}
              >
                <h4
                  style={{ fontSize: 14, marginBottom: 10, color: "#4fae7d" }}
                >
                  📈 Évolution
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={vmaHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) =>
                        new Date(date).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })
                      }
                      stroke="#a8a199"
                      style={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#a8a199"
                      style={{ fontSize: 12 }}
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1a1815",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      labelFormatter={(date) =>
                        new Date(date).toLocaleDateString("fr-FR")
                      }
                      formatter={(value) => [`${value} km/h`, "VMA"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      name="VMA (km/h)"
                      stroke="#4fae7d"
                      strokeWidth={2.5}
                      dot={{ fill: "#4fae7d", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#a8a199",
                    textAlign: "center",
                  }}
                >
                  {vmaHistory.length} entrée(s) • Progression:{" "}
                  {vmaHistory.length > 1
                    ? `${(
                        ((vmaHistory[vmaHistory.length - 1].kg -
                          vmaHistory[0].kg) /
                          vmaHistory[0].kg) *
                        100
                      ).toFixed(1)}%`
                    : "N/A"}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="number"
              step="0.1"
              value={vmaValue}
              onChange={(e) => setVmaValue(e.target.value)}
              placeholder="Ex: 16.5"
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                background: "#151310",
                border: "1px solid #2a2620",
                borderRadius: 8,
                color: "#f3f0ea",
                fontSize: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveVMA}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ✅ Enregistrer
              </button>
              <button
                onClick={() => {
                  setEditingVMA(false);
                  setVmaValue("");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#d9695a",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ✕ Annuler
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 15,
            padding: 12,
            background: "rgba(79,174,125,0.14)",
            borderRadius: 8,
            fontSize: 13,
            color: "#9fd4b0",
          }}
        >
          💡 <strong>Info :</strong> La VMA est utilisée pour calculer
          automatiquement les allures et distances des séances d'endurance.
        </div>
      </div>

      {/* ==================== CMJ CARD ==================== */}
      <div
        style={{
          background: "#1a1815",
          padding: 20,
          borderRadius: 12,
          border: "2px solid #d9a441",
          marginBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, color: "#d9a441" }}>
            🦘 CMJ (Counter Movement Jump)
          </h3>
        </div>

        {!editingCMJ ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: cmjHistory.length > 1 ? 15 : 0,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 36, fontWeight: "bold", color: "#d9a441" }}
                >
                  {cmj
                    ? `${cmj.kg} cm`
                    : mergedCmjSeries.length > 0
                    ? `${mergedCmjSeries[mergedCmjSeries.length - 1].heightCm} cm`
                    : "Non renseigné"}
                </div>
                {cmj && cmj.updatedAt ? (
                  <div style={{ fontSize: 12, color: "#a8a199", marginTop: 5 }}>
                    Mis à jour le{" "}
                    {new Date(cmj.updatedAt).toLocaleDateString("fr-FR")}
                  </div>
                ) : mergedCmjSeries.length > 0 ? (
                  <div style={{ fontSize: 12, color: "#a8a199", marginTop: 5 }}>
                    Dernier test en séance le{" "}
                    {new Date(
                      mergedCmjSeries[mergedCmjSeries.length - 1].date
                    ).toLocaleDateString("fr-FR")}
                  </div>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setEditingCMJ(true);
                    setCmjValue(cmj?.kg || "");
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "#d9a441",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  {cmj ? "✏️ Modifier" : "➕ Ajouter"}
                </button>
                {cmj && (
                  <button
                    onClick={deleteCMJ}
                    style={{
                      padding: "10px 20px",
                      background: "#d9695a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: "bold",
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Courbe évolution CMJ — fusionne les saisies manuelles ET les
                tests CMJ détectés automatiquement dans les séances, pour
                une évolution complète sans ressaisie. */}
            {mergedCmjSeries.length > 1 && (
              <div
                style={{
                  marginTop: 20,
                  background: "#151310",
                  padding: 15,
                  borderRadius: 8,
                }}
              >
                <h4
                  style={{ fontSize: 14, marginBottom: 4, color: "#d9a441" }}
                >
                  📈 Évolution (séances + saisies manuelles)
                </h4>
                <p style={{ fontSize: 11, color: "#a8a199", margin: "0 0 10px 0" }}>
                  Les tests CMJ faits pendant une séance apparaissent
                  automatiquement ici.
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={mergedCmjSeries.map((e) => ({
                      ...e,
                      shortDate: new Date(e.date).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      }),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis
                      dataKey="shortDate"
                      stroke="#a8a199"
                      style={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#a8a199"
                      style={{ fontSize: 12 }}
                      domain={["dataMin - 2", "dataMax + 2"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1a1815",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      formatter={(value, name, props) => [
                        `${value} cm`,
                        props.payload.source === "séance" ? "CMJ (séance)" : "CMJ (manuel)",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="heightCm"
                      name="CMJ (cm)"
                      stroke="#d9a441"
                      strokeWidth={2.5}
                      dot={{ fill: "#d9a441", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#a8a199",
                    textAlign: "center",
                  }}
                >
                  {mergedCmjSeries.length} entrée(s) • Progression:{" "}
                  {(
                    ((mergedCmjSeries[mergedCmjSeries.length - 1].heightCm -
                      mergedCmjSeries[0].heightCm) /
                      mergedCmjSeries[0].heightCm) *
                    100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="number"
              step="0.5"
              value={cmjValue}
              onChange={(e) => setCmjValue(e.target.value)}
              placeholder="Ex: 45"
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                background: "#151310",
                border: "1px solid #2a2620",
                borderRadius: 8,
                color: "#f3f0ea",
                fontSize: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveCMJ}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#d9a441",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ✅ Enregistrer
              </button>
              <button
                onClick={() => {
                  setEditingCMJ(false);
                  setCmjValue("");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#d9695a",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ✕ Annuler
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 15,
            padding: 12,
            background: "rgba(217,164,65,0.14)",
            borderRadius: 8,
            fontSize: 13,
            color: "#f0c98a",
          }}
        >
          💡 <strong>Info :</strong> Le CMJ mesure ta détente verticale en
          centimètres. Utilisé pour suivre ta puissance explosive.
        </div>
      </div>

      {/* ==================== BOUTON AJOUTER RM ==================== */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%",
            padding: 16,
            background: "#e0a13d",
            color: "#1a1306",
            border: "none",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 30,
          }}
        >
          ➕ Ajouter un exercice
        </button>
      )}

      {/* ==================== FORMULAIRE RM ==================== */}
      {showAddForm && (
        <div
          style={{
            background: "#1a1815",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #e0a13d",
            marginBottom: 30,
          }}
        >
          <h3 style={{ margin: "0 0 20px 0", fontSize: 18 }}>
            {editingRM ? "✏️ Modifier" : "➕ Nouvel exercice"}
          </h3>

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
              Nom de l'exercice
            </label>
            <input
              type="text"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder="Ex: squat, bench press, deadlift..."
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
            <p style={{ fontSize: 12, color: "#a8a199", margin: "5px 0 0 0" }}>
              💡{" "}
              {editingRM
                ? "Tu peux modifier le nom de l'exercice"
                : "Le nom doit être identique à celui utilisé dans les séances"}
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
              Poids du test (kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={testWeight}
              onChange={(e) => setTestWeight(e.target.value)}
              placeholder="100"
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
            <button
              onClick={handleSaveRM}
              style={{
                flex: 1,
                padding: 14,
                background: "#e0a13d",
                color: "#1a1306",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              ✅ Enregistrer
            </button>
            <button
              onClick={cancelForm}
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

      {/* ==================== LISTE DES EXERCICES ==================== */}
      {exercises.length > 0 ? (
        <>
          <div style={{ marginBottom: 30 }}>
            <h3 style={{ fontSize: 18, marginBottom: 15 }}>
              📋 Mes Exercices ({exercises.length})
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {exercises.map((exercise) => {
                const history = rmHistory[exercise];
                const latest = history[history.length - 1];
                const first = history[0];
                const progression = latest.kg - first.kg;
                const progressionPercent = (
                  (progression / first.kg) *
                  100
                ).toFixed(1);

                return (
                  <div
                    key={exercise}
                    onClick={() => setSelectedExercise(exercise)}
                    style={{
                      background: "#1a1815",
                      padding: 15,
                      borderRadius: 10,
                      border: `2px solid ${
                        selectedExercise === exercise ? "#e0a13d" : "rgba(255,255,255,0.16)"
                      }`,
                      cursor: "pointer",
                      transition: "all 0.2s",
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
                            fontSize: 16,
                            textTransform: "capitalize",
                          }}
                        >
                          {exercise}
                        </h4>
                        <div style={{ fontSize: 12, color: "#a8a199" }}>
                          {history.length} enregistrement
                          {history.length > 1 ? "s" : ""}
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
                              fontSize: 20,
                              fontWeight: "bold",
                              color: "#e0a13d",
                            }}
                          >
                            {latest.kg} kg
                          </div>
                        </div>

                        {history.length > 1 && (
                          <div style={{ textAlign: "center" }}>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#a8a199",
                                marginBottom: 3,
                              }}
                            >
                              PROGRESSION
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
                                fontSize: 11,
                                color: progression >= 0 ? "#4fae7d" : "#d9695a",
                              }}
                            >
                              {progression >= 0 ? "+" : ""}
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
          </div>

          {/* ==================== DÉTAILS EXERCICE ==================== */}
          {selectedExercise && rmHistory[selectedExercise] && (
            <div
              style={{
                background: "#1a1815",
                padding: 20,
                borderRadius: 12,
                border: "2px solid #e0a13d",
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
                  <button
                    onClick={() => handleEditRM(selectedExercise)}
                    style={{
                      padding: "8px 14px",
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
                    onClick={() => handleDeleteRM(selectedExercise)}
                    style={{
                      padding: "8px 14px",
                      background: "#d9695a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                  <button
                    onClick={() => setSelectedExercise(null)}
                    style={{
                      padding: "8px 14px",
                      background: "#a8a199",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {/* Graphique d'évolution */}
              <div style={{ marginBottom: 25 }}>
                <h4 style={{ fontSize: 16, marginBottom: 15 }}>
                  📈 Évolution du 1RM
                </h4>
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
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      formatter={(value) => [`${value} kg`, "1RM"]}
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
                    .map((entry, index) => (
                      <div
                        key={index}
                        style={{
                          background: "#151310",
                          padding: 15,
                          borderRadius: 8,
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
                            {entry.kg} kg
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        !showAddForm && (
          <div
            style={{
              background: "#1a1815",
              padding: 40,
              borderRadius: 12,
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            <p style={{ fontSize: 16, margin: "0 0 10px 0" }}>
              Aucun RM enregistré
            </p>
            <p style={{ fontSize: 14, color: "#a8a199", margin: 0 }}>
              Ajoute tes exercices pour commencer !
            </p>
          </div>
        )
      )}

      {/* Info */}
      <div
        style={{
          marginTop: 30,
          padding: 20,
          background: "rgba(217,164,65,0.14)",
          borderRadius: 10,
          border: "2px solid #b8862e",
        }}
      >
        <h4 style={{ marginTop: 0, color: "#d9a441", fontSize: 16 }}>
          💡 Comment ça fonctionne ?
        </h4>
        <ul
          style={{ color: "#f0c98a", lineHeight: 1.8, margin: 0, fontSize: 14 }}
        >
          <li>
            Le <strong>1RM théorique</strong> est calculé avec la formule
            d'Epley, à partir des séries proches du maximum (≤6 répétitions,
            RPE≥8)
          </li>
          <li>
            Pas besoin d'écrire le nom de l'exercice au caractère près
            (majuscules/accents ignorés) — il doit juste désigner le même
            exercice que dans tes séances
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
            La <strong>VMA</strong> est utilisée pour calculer les séances
            d'endurance
          </li>
        </ul>
      </div>
    </div>
  );
}
