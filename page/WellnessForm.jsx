import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { loadLinkData, objectiveFor } from "../component/wellnessLinks";

export default function WellnessForm() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  // Ouvert depuis le dashboard : annuler / valider y ramène (sinon : onglet Wellness)
  const [searchParams] = useSearchParams();
  const fromDash = searchParams.get("from") === "dashboard";
  const backTo = fromDash ? "/dashboard" : "/wellness";

  const [fatigue, setFatigue] = useState(5);
  const [stress, setStress] = useState(5);
  const [douleur, setDouleur] = useState(5);
  const [nutrition, setNutrition] = useState(5);
  const [hydratation, setHydratation] = useState(5);
  const [sommeil, setSommeil] = useState(5);
  const [motivation, setMotivation] = useState(5);

  const [sick, setSick] = useState(false);
  const [sickType, setSickType] = useState("");
  const [painMap, setPainMap] = useState({});
  const [painTypes, setPainTypes] = useState({});
  const [selectedZone, setSelectedZone] = useState(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Données MESURÉES (journaux Sommeil / Nutrition) → note proposée pour sommeil, hydratation, nutrition
  const [objective, setObjective] = useState(null);

  // Date LOCALE (toISOString donnait la date UTC : avant 1-2 h du matin en France, c'était encore « hier »).
  const today = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })();

  useEffect(() => {
    if (!currentUser) return;
    loadLinkData(currentUser.uid)
      .then((logs) => setObjective(objectiveFor(today, logs)))
      .catch(() => setObjective(null));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setSick(!!docData.sick);
        setSickType(docData.sickType || "");
        setPainMap(docData.painMap || {});
        setPainTypes(docData.painTypes || {});
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
        sick,
        sickType: sick ? sickType : "",
        painMap,
        painTypes,
        // instantané des mesures du jour (sommeil de la nuit, eau / repas de la veille) : sert aux corrélations
        objective: objective
          ? {
              sleepMin: objective.sleep?.min ?? null,
              sleepScore: objective.sleep?.score ?? null,
              waterPct: objective.water?.pct ?? null,
              hydrationScore: objective.water?.score ?? null,
              kcalPct: objective.food?.kcalPct ?? null,
              protPct: objective.food?.protPct ?? null,
              nutritionScore: objective.food?.score ?? null,
            }
          : null,
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
        navigate(backTo);
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
          onClick={() => navigate(backTo)}
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
          {fromDash ? "← Retour au dashboard" : "← Retour au Wellness"}
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
        {(() => {
          const o = objective;
          const items = o
            ? [
                o.sleep && { k: "Sommeil", icon: "😴", txt: `${Math.floor(o.sleep.min / 60)} h ${String(o.sleep.min % 60).padStart(2, "0")} cette nuit${o.sleep.quality ? ` · qualité ${o.sleep.quality}/5` : ""}`, score: o.sleep.score, set: setSommeil, cur: sommeil },
                o.water && { k: "Hydratation", icon: "💧", txt: `${o.water.pct} % de l'objectif d'eau hier`, score: o.water.score, set: setHydratation, cur: hydratation },
                o.food && { k: "Nutrition", icon: "🥗", txt: `hier : ${o.food.kcalPct} % des calories, ${o.food.protPct} % des protéines`, score: o.food.score, set: setNutrition, cur: nutrition },
              ].filter(Boolean)
            : [];
          if (!items.length)
            return (
              <div style={{ marginBottom: 25, padding: "12px 14px", borderRadius: 12, background: "#1a1815", border: "1px dashed rgba(255,255,255,0.16)", fontSize: 13, color: "#a8a199" }}>
                📊 Note ta nuit (Sommeil) et ton eau / tes repas d'hier (Nutrition) : le questionnaire te proposera une note mesurée et ton wellness sera relié à ces données.
              </div>
            );
          return (
            <div style={{ marginBottom: 25, padding: "14px 16px", borderRadius: 12, background: "rgba(123,143,217,0.08)", border: "1px solid rgba(123,143,217,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: "#f3f0ea", fontSize: 15 }}>📊 D'après tes journaux</div>
                <button
                  type="button"
                  onClick={() => items.forEach((it) => it.set(Math.round(it.score)))}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #7b8fd9", background: "rgba(123,143,217,0.18)", color: "#f3f0ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  Tout appliquer
                </button>
              </div>
              {items.map((it) => (
                <div key={it.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 13.5 }}>
                  <span style={{ color: "#f3f0ea", minWidth: 0 }}>
                    {it.icon} <b>{it.k}</b> <span style={{ color: "#a8a199" }}>· {it.txt}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => it.set(Math.round(it.score))}
                    title="Mettre cette note sur le curseur"
                    style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${Math.round(it.score) === it.cur ? "#4fae7d" : "#3a342a"}`, background: "transparent", color: Math.round(it.score) === it.cur ? "#4fae7d" : "#f3f0ea", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                  >
                    {Math.round(it.score) === it.cur ? "✓ " : ""}
                    {Math.round(it.score)}/10
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "#a8a199", marginTop: 6 }}>Note proposée à partir des mesures : garde ou ajuste ton ressenti sur les curseurs.</div>
            </div>
          );
        })()}
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

      {/* Malade ou non (en plus des douleurs / blessures) */}
      <div
        style={{
          marginBottom: 30,
          padding: 16,
          background: sick ? "rgba(217,105,90,0.12)" : "#1a1815",
          borderRadius: 12,
          border: `1px solid ${sick ? "rgba(217,105,90,0.6)" : "rgba(255,255,255,0.16)"}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#f3f0ea", fontSize: 16 }}>🤒 Malade aujourd'hui ?</div>
            <div style={{ fontSize: 12, color: "#a8a199", marginTop: 2 }}>
              Rhume, fièvre, gastro… (à part des douleurs et blessures). Ton coach le voit dans le tableau de bord.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSick(!sick)}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: sick ? "#d9695a" : "#4fae7d",
              color: "white",
            }}
          >
            {sick ? "Oui, malade" : "Non"}
          </button>
        </div>
        {sick && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {["Rhume / mal de gorge", "Fièvre / courbatures", "Digestif", "Autre"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSickType(sickType === t ? "" : t)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  cursor: "pointer",
                  background: sickType === t ? "#d9695a" : "transparent",
                  color: sickType === t ? "white" : "#a8a199",
                  border: `1px solid ${sickType === t ? "#d9695a" : "rgba(255,255,255,0.2)"}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
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
            border: "1px solid #3a342a",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#d9695a" }}>
            🩹 Localisation des douleurs
          </h3>
          <BodyScan
            painMap={painMap}
            setPainMap={setPainMap}
            painTypes={painTypes}
            setPainTypes={setPainTypes}
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        </div>
      )}

      {/* Le journal de blessures se remplit dans la page Tests › Bilan (athlète ou coach). */}
      {douleur >= 6 && (
        <div
          style={{
            marginBottom: 30,
            padding: 14,
            background: "#1a1815",
            borderRadius: 12,
            border: "1px solid rgba(217,105,90,0.4)",
            fontSize: 13,
            color: "#a8a199",
          }}
        >
          🚑 Douleur élevée aujourd'hui — si c'est une vraie blessure, ajoute-la dans{" "}
          <button
            onClick={() => navigate("/tests")}
            style={{ background: "none", border: "none", color: "#d9695a", fontWeight: "bold", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}
          >
            Tests › Bilan
          </button>{" "}
          (historique de blessures).
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
