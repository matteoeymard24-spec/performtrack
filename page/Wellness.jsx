import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  doc as fsDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import BodyScan from "../component/BodyScan";
import { Page, FoldCard, useFold, CARD_STYLE, PAGE_TITLE, PAGE_SUB } from "../component/ui";

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
  const [confirmId, setConfirmId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

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
          id: doc.id,
          normalizedScore: Number(normalized.toFixed(2)),
          shortDate: formatShortDate(d.date),
        };
      });

      setEntries(data);
    };

    fetchData();
  }, [currentUser]);

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

  const fold = useFold("wellness");

  // Suppression d'un questionnaire saisi par erreur (confirmation en deux temps).
  const deleteEntry = async (id) => {
    try {
      await deleteDoc(fsDoc(db, "wellness", id));
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setConfirmId(null);
      setDeleteError("");
    } catch (err) {
      console.error("Erreur suppression wellness:", err);
      setDeleteError("Suppression impossible : " + (err.message || "erreur inconnue"));
    }
  };
  const recentEntries = [...entries].reverse().slice(0, 7);

  const weeklyAverage =
    thisWeekEntries.length > 0
      ? (
          thisWeekEntries.reduce((sum, e) => sum + e.normalizedScore, 0) /
          thisWeekEntries.length
        ).toFixed(1)
      : null;

  return (
    <Page>
      <h2 style={PAGE_TITLE}>Wellness – Suivi détaillé</h2>
      <p style={PAGE_SUB}>Suivez votre état de forme quotidien et votre récupération</p>

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
          marginBottom: 20,
        }}
      >
        📝 Remplir le questionnaire
      </button>

      {/* Scores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            ...CARD_STYLE,
            marginBottom: 0,
            border: "1px solid #e0a13d88",
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
            ...CARD_STYLE,
            marginBottom: 0,
            border: "1px solid #4fae7d88",
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

      {/* Douleurs du jour (zone, intensité, type et sensation) */}
      {todayEntry && todayEntry.painMap && Object.values(todayEntry.painMap).some((v) => v > 0) && (
        <FoldCard
          id="pain"
          fold={fold}
          title="🩹 Douleurs d'aujourd'hui"
          subtitle="Zone, intensité, type et sensation — touche une zone pour le détail"
          right={
            <button
              type="button"
              onClick={() => navigate("/wellness-form")}
              style={{ padding: "6px 12px", background: "transparent", color: "#e0a13d", border: "1px solid #e0a13d66", borderRadius: 8, cursor: "pointer", fontSize: 12 }}
            >
              Modifier
            </button>
          }
        >
          <BodyScan
            painMap={todayEntry.painMap}
            painTypes={todayEntry.painTypes || {}}
            setPainMap={() => {}}
          />
        </FoldCard>
      )}

      {/* Questionnaires récents : suppression en cas d'erreur de saisie */}
      {recentEntries.length > 0 && (
        <FoldCard
          id="recent"
          fold={fold}
          title="🗂️ Mes questionnaires récents"
          subtitle="Tu t'es trompé ? Supprime le questionnaire puis remplis-le à nouveau."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  background: "#0d0c0a",
                  borderRadius: 10,
                  border: e.date === today ? "1px solid #e0a13d66" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f3f0ea" }}>
                    {e.shortDate}
                    {e.date === today ? " · aujourd'hui" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#a8a199" }}>Score {e.normalizedScore}/10</div>
                </div>
                {confirmId === e.id ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#d9695a" }}>Supprimer définitivement ?</span>
                    <button
                      type="button"
                      onClick={() => deleteEntry(e.id)}
                      style={{ padding: "7px 12px", background: "#d9695a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                    >
                      Oui, supprimer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      style={{ padding: "7px 12px", background: "transparent", color: "#a8a199", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setConfirmId(e.id); setDeleteError(""); }}
                    style={{ padding: "7px 12px", background: "transparent", color: "#d9695a", border: "1px solid #d9695a88", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
                  >
                    🗑️ Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
          {deleteError && <div style={{ marginTop: 8, fontSize: 12, color: "#d9695a" }}>{deleteError}</div>}
        </FoldCard>
      )}

      {/* Graphiques */}
      {entries.length > 0 ? (
          <>
            {/* Graphique principal : score global, mis en avant */}
            <FoldCard id="global" fold={fold} title="Score global" subtitle="Moyenne des 7 indicateurs (fatigue, stress et douleur inversés) — 10 = meilleur état">
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
            </FoldCard>

            {/* Indicateurs à surveiller (on veut les voir BAS) */}
            <FoldCard id="watch" fold={fold} title="Indicateurs à surveiller" subtitle="Fatigue, stress, douleur — idéalement bas">
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
            </FoldCard>

            {/* Indicateurs positifs (on veut les voir HAUT) */}
            <FoldCard id="pos" fold={fold} title="Indicateurs positifs" subtitle="Sommeil, nutrition, hydratation, motivation — idéalement haut">
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
            </FoldCard>
          </>
      ) : (
          <div
            style={{
              ...CARD_STYLE,
              textAlign: "center",
              padding: 40,
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
    </Page>
  );
}
