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

  // ─── Journal de blessures structuré ───────────────────────────────────
  // Distinct du slider "douleur" (qui capte une gêne quotidienne) : ici on
  // structure un événement de blessure (tissu, mécanisme, jours d'arrêt
  // estimés) pour permettre plus tard un calcul d'incidence (blessures /
  // 1000h d'exposition) et un croisement rétrospectif avec REDI/wellness.
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [injuryZone, setInjuryZone] = useState("");
  const [injuryTissue, setInjuryTissue] = useState("muscle");
  const [injuryMechanism, setInjuryMechanism] = useState("surcharge");
  const [injuryDaysLost, setInjuryDaysLost] = useState("");
  const [injuryNotes, setInjuryNotes] = useState("");
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryMessage, setInjuryMessage] = useState("");
  const [recentInjuries, setRecentInjuries] = useState([]);

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

  useEffect(() => {
    if (!currentUser) return;
    const loadInjuries = async () => {
      try {
        const q = query(
          collection(db, "injuries"),
          where("userId", "==", currentUser.uid)
        );
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .slice(0, 5);
        setRecentInjuries(list);
      } catch (e) {
        console.error("Erreur chargement blessures:", e);
      }
    };
    loadInjuries();
  }, [currentUser]);

  const TISSUE_LABELS = {
    muscle: "Muscle",
    tendon: "Tendon",
    ligament: "Ligament",
    os: "Os / articulation",
    autre: "Autre",
  };
  const MECHANISM_LABELS = {
    contact: "Contact / traumatique",
    non_contact: "Non-contact (sans contact)",
    surcharge: "Surcharge / usure",
    autre: "Autre",
  };

  const saveInjury = async () => {
    if (!currentUser) return;
    setInjurySaving(true);
    setInjuryMessage("");
    try {
      const injuryId = `${currentUser.uid}_${Date.now()}`;
      await setDoc(doc(db, "injuries", injuryId), {
        userId: currentUser.uid,
        date: today,
        zone: injuryZone || (selectedZone ?? "") || "",
        tissueType: injuryTissue,
        mechanism: injuryMechanism,
        daysLost: injuryDaysLost ? Number(injuryDaysLost) : null,
        notes: injuryNotes || "",
        createdAt: Timestamp.now(),
      });
      setInjuryMessage("✅ Blessure enregistrée.");
      setRecentInjuries((prev) => [
        { id: injuryId, date: today, zone: injuryZone, tissueType: injuryTissue, mechanism: injuryMechanism, daysLost: injuryDaysLost ? Number(injuryDaysLost) : null, notes: injuryNotes },
        ...prev,
      ].slice(0, 5));
      setInjuryZone("");
      setInjuryDaysLost("");
      setInjuryNotes("");
      setTimeout(() => setShowInjuryForm(false), 1200);
    } catch (e) {
      setInjuryMessage("❌ Erreur : " + e.message);
    } finally {
      setInjurySaving(false);
    }
  };

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
        background: "#151310",
        minHeight: "100vh",
        color: "#f3f0ea",
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
            color: "#e0a13d",
            fontSize: 16,
            cursor: "pointer",
            padding: "8px 0",
            marginBottom: 10,
          }}
        >
          ← Retour au Wellness
        </button>
        <h2 style={{ margin: "0 0 5px 0", color: "#f3f0ea" }}>
          Questionnaire Wellness
        </h2>
        <p style={{ margin: 0, color: "#a8a199", fontSize: 14 }}>
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
            background: "#1a1815",
            padding: 20,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#d9695a" }}>
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

      {/* Journal de blessures structuré */}
      <div
        style={{
          marginBottom: 30,
          background: "#1a1815",
          padding: 20,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.16)",
        }}
      >
        <button
          onClick={() => setShowInjuryForm(!showInjuryForm)}
          style={{
            width: "100%",
            padding: 12,
            background: "transparent",
            color: "#d9695a",
            border: "1px solid #d9695a",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🚑 {showInjuryForm ? "Annuler la déclaration" : "Déclarer une blessure"}
        </button>

        {showInjuryForm && (
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>
              Zone touchée
            </label>
            <input
              type="text"
              value={injuryZone}
              onChange={(e) => setInjuryZone(e.target.value)}
              placeholder={selectedZone || "ex: ischio-jambiers droit"}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
                marginBottom: 14,
              }}
            />

            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>
              Type de tissu
            </label>
            <select
              value={injuryTissue}
              onChange={(e) => setInjuryTissue(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
                marginBottom: 14,
              }}
            >
              {Object.entries(TISSUE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>

            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>
              Mécanisme
            </label>
            <select
              value={injuryMechanism}
              onChange={(e) => setInjuryMechanism(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
                marginBottom: 14,
              }}
            >
              {Object.entries(MECHANISM_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>

            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>
              Jours d'arrêt estimés
            </label>
            <input
              type="number"
              min="0"
              value={injuryDaysLost}
              onChange={(e) => setInjuryDaysLost(e.target.value)}
              placeholder="ex: 7"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
                marginBottom: 14,
              }}
            />

            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>
              Notes (contexte, circonstances)
            </label>
            <textarea
              value={injuryNotes}
              onChange={(e) => setInjuryNotes(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#0d0c0a",
                color: "#f3f0ea",
                fontSize: 14,
                marginBottom: 14,
                resize: "vertical",
              }}
            />

            <button
              onClick={saveInjury}
              disabled={injurySaving}
              style={{
                width: "100%",
                padding: 12,
                background: injurySaving ? "#a8a199" : "#d9695a",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: "bold",
                cursor: injurySaving ? "not-allowed" : "pointer",
              }}
            >
              {injurySaving ? "Enregistrement..." : "Enregistrer la blessure"}
            </button>

            {injuryMessage && (
              <div style={{ marginTop: 10, fontSize: 13, color: injuryMessage.includes("✅") ? "#4fae7d" : "#d9695a" }}>
                {injuryMessage}
              </div>
            )}
          </div>
        )}

        {recentInjuries.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 8 }}>
              Dernières blessures déclarées
            </div>
            {recentInjuries.map((inj) => (
              <div key={inj.id} style={{ fontSize: 13, color: "#f3f0ea", marginBottom: 6 }}>
                <strong style={{ color: "#d9695a" }}>{inj.date}</strong>
                {inj.zone ? ` — ${inj.zone}` : ""}
                {" "}({TISSUE_LABELS[inj.tissueType] || inj.tissueType}, {MECHANISM_LABELS[inj.mechanism] || inj.mechanism})
                {inj.daysLost !== null && inj.daysLost !== undefined ? `, ${inj.daysLost}j d'arrêt` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Boutons */}
      <div style={{ position: "sticky", bottom: 20 }}>
        <button
          onClick={saveWellness}
          disabled={loading}
          style={{
            width: "100%",
            padding: 16,
            background: loading ? "#a8a199" : "#4fae7d",
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
              background: message.includes("✅") ? "#4fae7d" : "#d9695a",
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
