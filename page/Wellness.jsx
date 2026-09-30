import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Palette cohérente (au lieu d'un arc-en-ciel arbitraire) ────────────────
// Un seul hue par famille de sens : rouge/ambre pour ce qu'on veut voir BAS
// (fatigue, stress, douleur), vert pour ce qu'on veut voir HAUT (sommeil,
// nutrition, hydratation, motivation), ambre pour le score global. Les
// séries d'un même graphique sont en plus différenciées par un style de
// trait (plein / tirets / pointillés) pour rester lisibles sans dépendre
// uniquement de la couleur.
const ACCENT = "#e0a13d";
const NEGATIVE_COLORS = { fatigue: "#d9695a", stress: "#e0a13d", douleur: "#b06fd9" };
// Familles de teintes plus espacées (vert profond / bleu / cyan / olive) pour
// que les 4 courbes positives restent distinguables même sans regarder la
// légende, au lieu de plusieurs verts trop proches visuellement.
const POSITIVE_COLORS = { sommeil: "#2f9e78", nutrition: "#3d7fd9", hydratation: "#29b6c9", motivation: "#a4c639" };
const DASH_BY_INDEX = ["0", "6 4", "2 3", "8 3 2 3"];

const formatShortDate = (d) => {
  if (!d) return "";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
};

const tooltipStyle = {
  background: "#151310",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
};

export default function Wellness() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);

  // ─── Journal de blessures (déplacé ici depuis le questionnaire, pour que
  // l'athlète puisse consulter et corriger son historique à tout moment,
  // pas seulement au moment de remplir le wellness du jour) ───────────────
  const [injuries, setInjuries] = useState([]);
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [editingInjuryId, setEditingInjuryId] = useState(null);
  const [injuryZone, setInjuryZone] = useState("");
  const [injuryTissue, setInjuryTissue] = useState("muscle");
  const [injuryMechanism, setInjuryMechanism] = useState("surcharge");
  const [injuryDaysLost, setInjuryDaysLost] = useState("");
  const [injuryNotes, setInjuryNotes] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryMessage, setInjuryMessage] = useState("");

  const TISSUE_LABELS = {
    muscle: "Muscle",
    tendon: "Tendon",
    ligament: "Ligament",
    os: "Os / articulation",
    autre: "Autre",
  };
  const MECHANISM_LABELS = {
    contact: "Contact / traumatique",
    surcharge: "Surcharge / usure",
    autre: "Autre",
  };

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      const q = query(
        collection(db, "wellness"),
        where("userId", "==", currentUser.uid),
        orderBy("date", "asc")
      );

      const snap = await getDocs(q);

      const data = snap.docs.map((doc) => {
        const d = doc.data();

        const normalized =
          (d.sommeil +
            d.motivation +
            d.nutrition +
            d.hydratation +
            (10 - d.fatigue) +
            (10 - d.stress) +
            (10 - d.douleur)) /
          7;

        return {
          ...d,
          normalizedScore: Number(normalized.toFixed(2)),
          shortDate: formatShortDate(d.date),
        };
      });

      setEntries(data);
    };

    fetchData();
  }, [currentUser]);

  const loadInjuries = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, "injuries"), where("userId", "==", currentUser.uid));
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setInjuries(list);
    } catch (e) {
      console.error("Erreur chargement blessures:", e);
    }
  };

  useEffect(() => {
    loadInjuries();
  }, [currentUser]);

  const resetInjuryForm = () => {
    setEditingInjuryId(null);
    setInjuryZone("");
    setInjuryTissue("muscle");
    setInjuryMechanism("surcharge");
    setInjuryDaysLost("");
    setInjuryNotes("");
    setInjuryDate(today);
    setInjuryMessage("");
  };

  const startEditInjury = (inj) => {
    setEditingInjuryId(inj.id);
    setInjuryZone(inj.zone || "");
    setInjuryTissue(inj.tissueType || "muscle");
    setInjuryMechanism(inj.mechanism || "surcharge");
    setInjuryDaysLost(inj.daysLost !== null && inj.daysLost !== undefined ? String(inj.daysLost) : "");
    setInjuryNotes(inj.notes || "");
    setInjuryDate(inj.date || today);
    setShowInjuryForm(true);
  };

  const saveInjury = async () => {
    if (!currentUser) return;
    setInjurySaving(true);
    setInjuryMessage("");
    try {
      const payload = {
        userId: currentUser.uid,
        date: injuryDate || today,
        zone: injuryZone || "",
        tissueType: injuryTissue,
        mechanism: injuryMechanism,
        daysLost: injuryDaysLost ? Number(injuryDaysLost) : null,
        notes: injuryNotes || "",
      };
      if (editingInjuryId) {
        await updateDoc(doc(db, "injuries", editingInjuryId), payload);
      } else {
        const injuryId = `${currentUser.uid}_${Date.now()}`;
        await setDoc(doc(db, "injuries", injuryId), { ...payload, createdAt: Timestamp.now() });
      }
      setInjuryMessage("✅ Enregistré.");
      await loadInjuries();
      setTimeout(() => {
        setShowInjuryForm(false);
        resetInjuryForm();
      }, 900);
    } catch (e) {
      setInjuryMessage("❌ Erreur : " + e.message);
    } finally {
      setInjurySaving(false);
    }
  };

  const removeInjury = async (id) => {
    if (!window.confirm("Supprimer cette blessure de l'historique ?")) return;
    try {
      await deleteDoc(doc(db, "injuries", id));
      setInjuries((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert("Erreur suppression : " + e.message);
    }
  };

  // Score quotidien : uniquement pour aujourd'hui
  const todayEntry = entries.find((e) => e.date === today);
  const dailyScore = todayEntry ? todayEntry.normalizedScore.toFixed(1) : null;

  // Score hebdomadaire : uniquement pour la semaine en cours
  const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  };

  const currentWeek = getWeekNumber(new Date());
  const currentYear = new Date().getFullYear();

  const thisWeekEntries = entries.filter((e) => {
    const entryDate = new Date(e.date);
    return (
      getWeekNumber(entryDate) === currentWeek &&
      entryDate.getFullYear() === currentYear
    );
  });

  const weeklyAverage =
    thisWeekEntries.length > 0
      ? (
          thisWeekEntries.reduce((sum, e) => sum + e.normalizedScore, 0) /
          thisWeekEntries.length
        ).toFixed(1)
      : null;

  return (
    <div
      style={{
        padding: 20,
        background: "#151310",
        minHeight: "100vh",
        color: "#f3f0ea",
      }}
    >
      <h2 style={{ color: "#f3f0ea", marginBottom: 10 }}>
        Wellness – Suivi détaillé
      </h2>
      <p style={{ color: "#a8a199", marginBottom: 30 }}>
        Suivez votre état de forme quotidien et votre récupération
      </p>

      <button
        onClick={() => navigate("/wellness-form")}
        style={{
          padding: "12px 24px",
          background: "#4fae7d",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 30,
        }}
      >
        📝 Remplir le questionnaire
      </button>

      {/* Scores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            background: "#1a1815",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #e0a13d",
          }}
        >
          <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 8 }}>
            SCORE D'AUJOURD'HUI
          </div>
          {dailyScore !== null ? (
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#e0a13d" }}>
              {dailyScore}
              <span style={{ fontSize: 24, marginLeft: 5 }}>/10</span>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "#a8a199", padding: "20px 0" }}>
              Pas encore rempli aujourd'hui
            </div>
          )}
        </div>

        <div
          style={{
            background: "#1a1815",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #4fae7d",
          }}
        >
          <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 8 }}>
            MOYENNE CETTE SEMAINE
          </div>
          {weeklyAverage !== null ? (
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#4fae7d" }}>
              {weeklyAverage}
              <span style={{ fontSize: 24, marginLeft: 5 }}>/10</span>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "#a8a199", padding: "20px 0" }}>
              Aucune donnée cette semaine
            </div>
          )}
        </div>
      </div>

      {/* Graphiques */}
      <div
        style={{
          background: "#1a1815",
          padding: 25,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.16)",
          marginBottom: 30,
        }}
      >
        {entries.length > 0 ? (
          <>
            {/* Graphique principal : score global, mis en avant */}
            <div style={{ marginBottom: 35 }}>
              <h4 style={{ color: "#f3f0ea", marginBottom: 4 }}>Score global</h4>
              <p style={{ color: "#706a61", fontSize: 12, marginBottom: 12 }}>
                Moyenne des 7 indicateurs (fatigue, stress et douleur inversés) — 10 = meilleur état
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={entries}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shortDate" stroke="#a8a199" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis domain={[0, 10]} stroke="#a8a199" tick={{ fontSize: 12 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#f3f0ea" }} />
                  <Area
                    type="monotone"
                    dataKey="normalizedScore"
                    name="Score global"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Indicateurs à surveiller (on veut les voir BAS) */}
            <div style={{ marginBottom: 35 }}>
              <h4 style={{ color: "#f3f0ea", marginBottom: 4 }}>Indicateurs à surveiller</h4>
              <p style={{ color: "#706a61", fontSize: 12, marginBottom: 12 }}>
                Fatigue, stress, douleur — idéalement bas
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={entries}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shortDate" stroke="#a8a199" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis domain={[0, 10]} stroke="#a8a199" tick={{ fontSize: 12 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#f3f0ea" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={NEGATIVE_COLORS.fatigue} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[0]} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="stress" name="Stress" stroke={NEGATIVE_COLORS.stress} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[1]} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="douleur" name="Douleur" stroke={NEGATIVE_COLORS.douleur} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[2]} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Indicateurs positifs (on veut les voir HAUT) */}
            <div>
              <h4 style={{ color: "#f3f0ea", marginBottom: 4 }}>Indicateurs positifs</h4>
              <p style={{ color: "#706a61", fontSize: 12, marginBottom: 12 }}>
                Sommeil, nutrition, hydratation, motivation — idéalement haut
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={entries}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shortDate" stroke="#a8a199" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis domain={[0, 10]} stroke="#a8a199" tick={{ fontSize: 12 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#f3f0ea" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="sommeil" name="Sommeil" stroke={POSITIVE_COLORS.sommeil} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[0]} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="nutrition" name="Nutrition" stroke={POSITIVE_COLORS.nutrition} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[1]} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="hydratation" name="Hydratation" stroke={POSITIVE_COLORS.hydratation} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[2]} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="motivation" name="Motivation" stroke={POSITIVE_COLORS.motivation} strokeWidth={2} strokeDasharray={DASH_BY_INDEX[3]} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "#a8a199",
            }}
          >
            <p style={{ fontSize: 18, margin: 0 }}>
              Aucune donnée pour le moment
            </p>
            <p style={{ fontSize: 14, margin: "10px 0 0 0" }}>
              Commencez à remplir votre questionnaire quotidien !
            </p>
          </div>
        )}
      </div>

      {/* Historique de blessures — déplacé ici depuis le questionnaire pour
          rester consultable et modifiable à tout moment. */}
      <div
        style={{
          background: "#1a1815",
          padding: 25,
          borderRadius: 12,
          border: "1px solid rgba(217,105,90,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#d9695a" }}>🚑 Historique de blessures</h3>
          <button
            onClick={() => {
              if (showInjuryForm && !editingInjuryId) {
                setShowInjuryForm(false);
              } else {
                resetInjuryForm();
                setShowInjuryForm(true);
              }
            }}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "#d9695a",
              border: "1px solid #d9695a",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {showInjuryForm ? "Annuler" : "+ Déclarer une blessure"}
          </button>
        </div>

        {showInjuryForm && (
          <div style={{ marginBottom: 20, padding: 16, background: "#151310", borderRadius: 10 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Date</label>
            <input
              type="date"
              value={injuryDate}
              onChange={(e) => setInjuryDate(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Zone touchée</label>
            <input
              type="text"
              value={injuryZone}
              onChange={(e) => setInjuryZone(e.target.value)}
              placeholder="ex: ischio-jambiers droit"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Type de tissu</label>
            <select
              value={injuryTissue}
              onChange={(e) => setInjuryTissue(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14 }}
            >
              {Object.entries(TISSUE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Mécanisme</label>
            <select
              value={injuryMechanism}
              onChange={(e) => setInjuryMechanism(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14 }}
            >
              {Object.entries(MECHANISM_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Jours d'arrêt estimés</label>
            <input
              type="number"
              min="0"
              value={injuryDaysLost}
              onChange={(e) => setInjuryDaysLost(e.target.value)}
              placeholder="ex: 7"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: "bold" }}>Notes</label>
            <textarea
              value={injuryNotes}
              onChange={(e) => setInjuryNotes(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#0d0c0a", color: "#f3f0ea", fontSize: 14, marginBottom: 14, resize: "vertical" }}
            />
            <button
              onClick={saveInjury}
              disabled={injurySaving}
              style={{ width: "100%", padding: 12, background: injurySaving ? "#a8a199" : "#d9695a", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: injurySaving ? "not-allowed" : "pointer" }}
            >
              {injurySaving ? "Enregistrement..." : editingInjuryId ? "Mettre à jour" : "Enregistrer la blessure"}
            </button>
            {injuryMessage && (
              <div style={{ marginTop: 10, fontSize: 13, color: injuryMessage.includes("✅") ? "#4fae7d" : "#d9695a" }}>
                {injuryMessage}
              </div>
            )}
          </div>
        )}

        {injuries.length > 0 ? (
          injuries.map((inj) => (
            <div
              key={inj.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, color: "#f3f0ea" }}>
                <strong style={{ color: "#d9695a" }}>{inj.date}</strong>
                {inj.zone ? ` — ${inj.zone}` : ""}{" "}
                <span style={{ color: "#a8a199" }}>
                  ({TISSUE_LABELS[inj.tissueType] || inj.tissueType}, {MECHANISM_LABELS[inj.mechanism] || inj.mechanism})
                  {inj.daysLost !== null && inj.daysLost !== undefined ? `, ${inj.daysLost}j d'arrêt` : ""}
                </span>
                {inj.notes && <div style={{ color: "#706a61", fontSize: 12, marginTop: 2 }}>{inj.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => startEditInjury(inj)}
                  style={{ padding: "6px 10px", background: "transparent", color: "#e0a13d", border: "1px solid #e0a13d", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                >
                  Modifier
                </button>
                <button
                  onClick={() => removeInjury(inj.id)}
                  style={{ padding: "6px 10px", background: "transparent", color: "#d9695a", border: "1px solid #d9695a", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))
        ) : (
          <p style={{ color: "#a8a199", fontSize: 14, margin: 0 }}>Aucune blessure déclarée.</p>
        )}
      </div>
    </div>
  );
}
