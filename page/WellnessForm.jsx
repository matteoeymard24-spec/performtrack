import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import BodyScan from "../component/BodyScan";
import WellnessSlider from "../component/WellnessSlider";

export default function WellnessForm() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [fatigue, setFatigue] = useState(5);
  const [stress, setStress] = useState(5);
  const [douleur, setDouleur] = useState(5);
  const [nutrition, setNutrition] = useState(5);
  const [hydratation, setHydratation] = useState(5);
  const [sommeil, setSommeil] = useState(5);
  const [motivation, setMotivation] = useState(5);

  const [painMap, setPainMap] = useState({});
  const [selectedZone, setSelectedZone] = useState(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!currentUser) return;
    const loadToday = async () => {
      const q = query(
        collection(db, "wellness"),
        where("userId", "==", currentUser.uid),
        where("date", "==", today)
      );

      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        setFatigue(docData.fatigue || 5);
        setStress(docData.stress || 5);
        setDouleur(docData.douleur || 5);
        setNutrition(docData.nutrition || 5);
        setHydratation(docData.hydratation || 5);
        setSommeil(docData.sommeil || 5);
        setMotivation(docData.motivation || 5);
        setPainMap(docData.painMap || {});
      }
    };
    loadToday();
  }, [currentUser, today]);

  const saveWellness = async () => {
    if (!currentUser) {
      setMessage("Tu dois être connecté pour enregistrer.");
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, "wellness"),
        where("userId", "==", currentUser.uid),
        where("date", "==", today)
      );
      const snap = await getDocs(q);

      const payload = {
        userId: currentUser.uid,
        date: today,
        fatigue,
        stress,
        douleur,
        nutrition,
        hydratation,
        sommeil,
        motivation,
        painMap,
        updatedAt: Timestamp.now(),
      };

      if (!snap.empty) {
        const docRef = snap.docs[0].ref;
        await updateDoc(docRef, payload);
      } else {
        await setDoc(
          doc(db, "wellness", `${currentUser.uid}_${today}`),
          payload
        );
      }

      setMessage("✅ Wellness enregistré avec succès !");
      setTimeout(() => {
        navigate("/wellness");
      }, 1500);
    } catch (error) {
      setMessage("❌ Erreur : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#ffffff",
        padding: "20px",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 30 }}>
        <button
          onClick={() => navigate("/wellness")}
          style={{
            background: "transparent",
            border: "none",
            color: "#2f80ed",
            fontSize: 16,
            cursor: "pointer",
            padding: "8px 0",
            marginBottom: 10,
          }}
        >
          ← Retour au Wellness
        </button>
        <h2 style={{ margin: "0 0 5px 0", color: "#ffffff" }}>
          Questionnaire Wellness
        </h2>
        <p style={{ margin: 0, color: "#888", fontSize: 14 }}>
          {new Date(today).toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Sliders */}
      <div style={{ marginBottom: 30 }}>
        <WellnessSlider
          label="Fatigue"
          value={fatigue}
          setValue={setFatigue}
          type="bad"
          leftLabel="Pas fatigué"
          rightLabel="Très fatigué"
        />
        <WellnessSlider
          label="Stress"
          value={stress}
          setValue={setStress}
          type="bad"
          leftLabel="Calme"
          rightLabel="Très stressé"
        />
        <WellnessSlider
          label="Douleur"
          value={douleur}
          setValue={setDouleur}
          type="bad"
          leftLabel="Aucune"
          rightLabel="Intense"
        />
        <WellnessSlider
          label="Nutrition"
          value={nutrition}
          setValue={setNutrition}
          type="good"
          leftLabel="Mauvaise"
          rightLabel="Excellente"
        />
        <WellnessSlider
          label="Hydratation"
          value={hydratation}
          setValue={setHydratation}
          type="good"
          leftLabel="Peu hydraté"
          rightLabel="Très hydraté"
        />
        <WellnessSlider
          label="Sommeil"
          value={sommeil}
          setValue={setSommeil}
          type="good"
          leftLabel="Mauvais"
          rightLabel="Excellent"
        />
        <WellnessSlider
          label="Motivation"
          value={motivation}
          setValue={setMotivation}
          type="good"
          leftLabel="Pas motivé"
          rightLabel="Très motivé"
        />
      </div>

      {/* BodyScan si douleur */}
      {douleur >= 4 && (
        <div
          style={{
            marginTop: 30,
            marginBottom: 30,
            background: "#2a2a2a",
            padding: 20,
            borderRadius: 12,
            border: "1px solid #444",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#e74c3c" }}>
            🩹 Localisation des douleurs
          </h3>
          <BodyScan
            painMap={painMap}
            setPainMap={setPainMap}
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        </div>
      )}

      {/* Boutons */}
      <div style={{ position: "sticky", bottom: 20 }}>
        <button
          onClick={saveWellness}
          disabled={loading}
          style={{
            width: "100%",
            padding: 16,
            background: loading ? "#95a5a6" : "#27ae60",
            color: "white",
            border: "none",
            borderRadius: 12,
            fontSize: 18,
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 10,
          }}
        >
          {loading ? "Enregistrement..." : "✅ Enregistrer"}
        </button>

        {message && (
          <div
            style={{
              padding: 12,
              background: message.includes("✅") ? "#27ae60" : "#e74c3c",
              color: "white",
              borderRadius: 8,
              textAlign: "center",
              fontSize: 14,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
