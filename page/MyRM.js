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

      // Séparer VMA et RM
      const grouped = {};
      let vmaData = null;
      let vmaHist = [];

      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = (data.exerciseName || d.id).toLowerCase();

        // VMA
        if (name === "vma" || d.id === "VMA") {
          vmaData = data;
          vmaHist = data.history || [];
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
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRM();
  }, [currentUser]);

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
          color: "#fff",
          background: "#1a1a1a",
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
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#fff",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>💪 Mes RM & VMA</h2>
      <p style={{ color: "#b0b0b0", marginBottom: 30, fontSize: 14 }}>
        Gère tes charges maximales, ta VMA et suis ta progression
      </p>

      {/* ==================== VMA CARD ==================== */}
      <div
        style={{
          background: "#2a2a2a",
          padding: 20,
          borderRadius: 12,
          border: "2px solid #27ae60",
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
          <h3 style={{ margin: 0, fontSize: 18, color: "#27ae60" }}>
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
                  style={{ fontSize: 36, fontWeight: "bold", color: "#27ae60" }}
                >
                  {vma ? `${vma.kg} km/h` : "Non renseignée"}
                </div>
                {vma && vma.updatedAt && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 5 }}>
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
                    background: "#27ae60",
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
                      background: "#e74c3c",
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
                  background: "#1a1a1a",
                  padding: 15,
                  borderRadius: 8,
                }}
              >
                <h4
                  style={{ fontSize: 14, marginBottom: 10, color: "#27ae60" }}
                >
                  📈 Évolution
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={vmaHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) =>
                        new Date(date).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })
                      }
                      stroke="#888"
                      style={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#888" style={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#2a2a2a",
                        border: "1px solid #27ae60",
                        borderRadius: 8,
                      }}
                      labelFormatter={(date) =>
                        new Date(date).toLocaleDateString("fr-FR")
                      }
                      formatter={(value) => [`${value} km/h`, "VMA"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="#27ae60"
                      strokeWidth={2}
                      dot={{ fill: "#27ae60" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#888",
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
                background: "#1a1a1a",
                border: "1px solid #555",
                borderRadius: 8,
                color: "#fff",
                fontSize: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveVMA}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#27ae60",
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
                  background: "#e74c3c",
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
            background: "#1a3a2a",
            borderRadius: 8,
            fontSize: 13,
            color: "#a0d0a0",
          }}
        >
          💡 <strong>Info :</strong> La VMA est utilisée pour calculer
          automatiquement les allures et distances des séances d'endurance.
        </div>
      </div>

      {/* ==================== BOUTON AJOUTER RM ==================== */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%",
            padding: 16,
            background: "#2f80ed",
            color: "white",
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
            background: "#2a2a2a",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #2f80ed",
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
                color: "#e0e0e0",
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
                border: "1px solid #555",
                background: "#1a1a1a",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
            <p style={{ fontSize: 12, color: "#888", margin: "5px 0 0 0" }}>
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
                color: "#e0e0e0",
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
                border: "1px solid #555",
                background: "#1a1a1a",
                color: "#ffffff",
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
                color: "#e0e0e0",
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
                border: "1px solid #555",
                background: "#1a1a1a",
                color: "#ffffff",
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
                background: "#1a2a3a",
                padding: 20,
                borderRadius: 10,
                border: "2px solid #2f80ed",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>
                1RM THÉORIQUE ESTIMÉ
              </div>
              <div
                style={{ fontSize: 48, fontWeight: "bold", color: "#2f80ed" }}
              >
                {calculated1RM} kg
              </div>
              <div style={{ fontSize: 12, color: "#b0b0b0", marginTop: 8 }}>
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
                background: "#2f80ed",
                color: "white",
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
                      background: "#2a2a2a",
                      padding: 15,
                      borderRadius: 10,
                      border: `2px solid ${
                        selectedExercise === exercise ? "#2f80ed" : "#444"
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
                        <div style={{ fontSize: 12, color: "#888" }}>
                          {history.length} enregistrement
                          {history.length > 1 ? "s" : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 20 }}>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#888",
                              marginBottom: 3,
                            }}
                          >
                            RM ACTUEL
                          </div>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: "bold",
                              color: "#2f80ed",
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
                                color: "#888",
                                marginBottom: 3,
                              }}
                            >
                              PROGRESSION
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: "bold",
                                color: progression >= 0 ? "#27ae60" : "#e74c3c",
                              }}
                            >
                              {progression >= 0 ? "+" : ""}
                              {progression} kg
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: progression >= 0 ? "#27ae60" : "#e74c3c",
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
                background: "#2a2a2a",
                padding: 20,
                borderRadius: 12,
                border: "2px solid #2f80ed",
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
                      background: "#2f80ed",
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
                    onClick={() => handleDeleteRM(selectedExercise)}
                    style={{
                      padding: "8px 14px",
                      background: "#e74c3c",
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
                      background: "#95a5a6",
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="dateShort" stroke="#888" fontSize={11} />
                    <YAxis stroke="#888" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#1a1a1a",
                        border: "1px solid #444",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#ffffff" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      name="1RM (kg)"
                      stroke="#2f80ed"
                      strokeWidth={3}
                      dot={{ fill: "#2f80ed", r: 5 }}
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
                          background: "#1a1a1a",
                          padding: 15,
                          borderRadius: 8,
                          border: "1px solid #555",
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
                                color: "#888",
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
                            <div style={{ fontSize: 12, color: "#666" }}>
                              Test : {entry.originalWeight} kg ×{" "}
                              {entry.originalReps} reps
                            </div>
                            {entry.autoAdjusted && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#f39c12",
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
                              color: "#2f80ed",
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
              background: "#2a2a2a",
              padding: 40,
              borderRadius: 12,
              textAlign: "center",
              border: "1px solid #444",
            }}
          >
            <p style={{ fontSize: 16, margin: "0 0 10px 0" }}>
              Aucun RM enregistré
            </p>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
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
          background: "#3a2f1f",
          borderRadius: 10,
          border: "2px solid #8b6914",
        }}
      >
        <h4 style={{ marginTop: 0, color: "#f1c40f", fontSize: 16 }}>
          💡 Comment ça fonctionne ?
        </h4>
        <ul
          style={{ color: "#f8e6a0", lineHeight: 1.8, margin: 0, fontSize: 14 }}
        >
          <li>
            Le <strong>1RM théorique</strong> est calculé avec la formule
            d'Epley
          </li>
          <li>
            Le nom de l'exercice doit être <strong>identique</strong> à celui
            dans les séances
          </li>
          <li>Tes RM s'ajustent automatiquement selon tes feedbacks RPE</li>
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
