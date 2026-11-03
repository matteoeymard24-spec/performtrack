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
import { Page, FoldCard, useFold, CARD_STYLE, PAGE_TITLE, PAGE_SUB, PageHeader, Kpi, KpiGrid } from "../component/ui";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceArea,
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
  border: "1px solid #3a342a",
  borderRadius: 8,
};

// Indicateurs du questionnaire : sens « bon » (low = idéalement bas) et couleur propre.
const INDICATORS = [
  { key: "fatigue", label: "Fatigue", icon: "😮‍💨", low: true, color: NEGATIVE_COLORS.fatigue },
  { key: "stress", label: "Stress", icon: "😬", low: true, color: NEGATIVE_COLORS.stress },
  { key: "douleur", label: "Douleur", icon: "🩹", low: true, color: NEGATIVE_COLORS.douleur },
  { key: "sommeil", label: "Sommeil", icon: "😴", low: false, color: POSITIVE_COLORS.sommeil },
  { key: "nutrition", label: "Nutrition", icon: "🥗", low: false, color: POSITIVE_COLORS.nutrition },
  { key: "hydratation", label: "Hydratation", icon: "💧", low: false, color: POSITIVE_COLORS.hydratation },
  { key: "motivation", label: "Motivation", icon: "🔥", low: false, color: POSITIVE_COLORS.motivation },
];
const PERIODS = [
  { id: "7", label: "7 j", days: 7 },
  { id: "30", label: "30 j", days: 30 },
  { id: "90", label: "3 mois", days: 90 },
  { id: "all", label: "Tout", days: null },
];
const zoneColor = (v) => (v >= 7 ? "#4fae7d" : v >= 5 ? "#d9a441" : "#d9695a");
const longDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";

/* Infobulle du score global */
function ScoreTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#151310", border: "1px solid #3a342a", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}>
      <div style={{ color: "#a8a199", textTransform: "capitalize", marginBottom: 4 }}>{longDate(d.date)}</div>
      <div style={{ color: "#f3f0ea" }}>
        Score : <b style={{ color: zoneColor(d.normalizedScore) }}>{Number(d.normalizedScore).toFixed(1)}/10</b>
      </div>
      {d.avg7 != null && <div style={{ color: "#a8a199" }}>Moyenne 7 j : {Number(d.avg7).toFixed(1)}</div>}
      {d.sick && <div style={{ color: "#d9695a", marginTop: 2 }}>🤒 Malade</div>}
    </div>
  );
}
/* Infobulle des petits graphiques */
function MiniTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#151310", border: "1px solid #3a342a", borderRadius: 8, padding: "5px 9px", fontSize: 12 }}>
      <span style={{ color: "#a8a199", textTransform: "capitalize" }}>{longDate(d.date)}</span>
      <span style={{ color: "#f3f0ea", fontWeight: 700 }}> · {label} {payload[0].value}/10</span>
    </div>
  );
}
/* Point coloré selon la zone du score */
function ZoneDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill={zoneColor(payload.normalizedScore)} stroke="#151310" strokeWidth={1.5} />;
}

export default function Wellness() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  // 6 derniers mois par défaut (quota gratuit Firestore), tout sur demande.
  const [allHistory, setAllHistory] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  // Date LOCALE (toISOString donnait la date UTC : avant 1-2 h du matin en France, c'était encore « hier »).
  const today = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })();

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      const since = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 182);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const q = allHistory
        ? query(collection(db, "wellness"), where("userId", "==", currentUser.uid), orderBy("date", "asc"))
        : query(
            collection(db, "wellness"),
            where("userId", "==", currentUser.uid),
            where("date", ">=", since),
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
  }, [currentUser, allHistory]);

  // Score quotidien : uniquement pour aujourd'hui
  const todayEntry = entries.find((e) => e.date === today);
  const dailyScore = todayEntry ? todayEntry.normalizedScore.toFixed(1) : null;

  // Score hebdomadaire : uniquement pour la semaine en cours
  // Semaine ISO + année ISO (l'année du jeudi de la semaine) : sinon la
  // semaine à cheval sur le 31/12 - 1/1 était coupée en deux.
  const getIsoWeekKey = (date) => {
    const d = typeof date === "string" ? new Date(date + "T12:00:00") : new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return `${d.getFullYear()}-${Math.ceil(((d - yearStart) / 86400000 + 1) / 7)}`;
  };

  const currentWeekKey = getIsoWeekKey(new Date());

  const thisWeekEntries = entries.filter((e) => getIsoWeekKey(e.date) === currentWeekKey);

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

  // ---- Données des graphiques : période choisie + moyenne glissante 7 jours ----
  const [period, setPeriod] = useState(() => {
    try { return localStorage.getItem("pt_well_period") || "30"; } catch (e) { return "30"; }
  });
  const pickPeriod = (id) => {
    setPeriod(id);
    try { localStorage.setItem("pt_well_period", id); } catch (e) { /* stockage indisponible */ }
    if (id === "all") setAllHistory(true);
  };
  const dayN = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const todayN = dayN(today);
  const per = PERIODS.find((x) => x.id === period) || PERIODS[1];
  const withAvg = entries.map((e) => {
    const n = dayN(e.date);
    const win = entries.filter((x) => { const m = dayN(x.date); return m <= n && m > n - 7; });
    return { ...e, avg7: win.length ? Number((win.reduce((t, x) => t + x.normalizedScore, 0) / win.length).toFixed(2)) : null };
  });
  const chartData = per.days ? withAvg.filter((e) => dayN(e.date) > todayN - per.days) : withAvg;
  const meanOf = (arr, k) => (arr.length ? arr.reduce((t, x) => t + (Number(x[k]) || 0), 0) / arr.length : null);
  const lastWeek = entries.filter((e) => dayN(e.date) > todayN - 7);
  const prevWeek = entries.filter((e) => dayN(e.date) <= todayN - 7 && dayN(e.date) > todayN - 14);
  const lastScore = chartData.length ? chartData[chartData.length - 1].normalizedScore : null;
  const scoreDelta = lastWeek.length && prevWeek.length ? meanOf(lastWeek, "normalizedScore") - meanOf(prevWeek, "normalizedScore") : null;
  const indicatorStats = (k) => {
    const vals = chartData.filter((e) => e[k] !== undefined && e[k] !== null);
    return {
      last: vals.length ? vals[vals.length - 1][k] : null,
      avg: meanOf(vals, k),
      delta: lastWeek.length && prevWeek.length ? meanOf(lastWeek, k) - meanOf(prevWeek, k) : null,
    };
  };

  return (
    <Page>
      <PageHeader
        title="🧘 Wellness"
        subtitle={
          <>
            Ton état de forme quotidien et ta récupération
            {!allHistory && (
              <>
                {" "}· 6 derniers mois{" "}
                <button
                  type="button"
                  onClick={() => setAllHistory(true)}
                  style={{ background: "none", border: "none", color: "#e0a13d", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                >
                  (tout afficher)
                </button>
              </>
            )}
          </>
        }
        actions={
          <button className="pt-btn pt-btn--primary" onClick={() => navigate("/wellness-form")}>
            📝 {todayEntry ? "Modifier le questionnaire" : "Remplir le questionnaire"}
          </button>
        }
      />

      {(() => {
        const sc = (v) => (v === null ? "#6f6a62" : Number(v) >= 7 ? "#4fae7d" : Number(v) >= 5 ? "#d9a441" : "#d9695a");
        const dow = (new Date().getDay() + 6) % 7 + 1; // jours écoulés de la semaine (lundi = 1)
        return (
          <KpiGrid>
            <Kpi
              icon="📅"
              label="Aujourd'hui"
              value={dailyScore !== null ? `${dailyScore}/10` : "À remplir"}
              color={dailyScore !== null ? sc(dailyScore) : "#e0a13d"}
              sub={dailyScore !== null ? "Questionnaire rempli" : "Touche pour le remplir"}
              onClick={() => navigate("/wellness-form")}
            />
            <Kpi
              icon="📊"
              label="Moyenne semaine"
              value={weeklyAverage !== null ? `${weeklyAverage}/10` : "—"}
              color={sc(weeklyAverage)}
              sub={weeklyAverage !== null ? "Semaine en cours" : "Aucune donnée cette semaine"}
            />
            <Kpi
              icon="✅"
              label="Régularité"
              value={`${thisWeekEntries.length}/${dow}`}
              color={thisWeekEntries.length >= dow ? "#4fae7d" : thisWeekEntries.length >= dow / 2 ? "#d9a441" : "#d9695a"}
              sub="Questionnaires remplis cette semaine"
            />
          </KpiGrid>
        );
      })()}

      {todayEntry && todayEntry.sick && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(217,105,90,0.12)", border: "1px solid rgba(217,105,90,0.5)", color: "#f0b3aa", fontSize: 14 }}>
          🤒 Malade aujourd'hui{todayEntry.sickType ? ` — ${todayEntry.sickType}` : ""}
        </div>
      )}

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
                  border: e.date === today ? "1px solid #e0a13d66" : "1px solid #2a2620",
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
                      style={{ padding: "7px 12px", background: "transparent", color: "#a8a199", border: "1px solid #3a342a", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
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
            {/* Période affichée (mémorisée sur l'appareil) */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#a8a199", fontWeight: 700, marginRight: 4 }}>Période</span>
              {PERIODS.map((pp) => (
                <button
                  key={pp.id}
                  type="button"
                  onClick={() => pickPeriod(pp.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: period === pp.id ? "rgba(224,161,61,0.18)" : "transparent",
                    color: period === pp.id ? "#e0a13d" : "#a8a199",
                    border: `1px solid ${period === pp.id ? "#e0a13d" : "#2a2620"}`,
                  }}
                >
                  {pp.label}
                </button>
              ))}
              <span style={{ fontSize: 12, color: "#6f6a62", marginLeft: 4 }}>{chartData.length} questionnaire{chartData.length > 1 ? "s" : ""}</span>
            </div>

            {chartData.length === 0 ? (
              <div style={{ ...CARD_STYLE, textAlign: "center", color: "#a8a199", fontSize: 14 }}>
                Aucun questionnaire sur cette période.
              </div>
            ) : (
            <>
            {/* Graphique principal : score global, avec zones et moyenne glissante */}
            <FoldCard
              id="global"
              fold={fold}
              title="📈 Score global"
              subtitle="Moyenne des 7 indicateurs (fatigue, stress et douleur inversés) · 10 = meilleur état"
              right={
                lastScore !== null && (
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: zoneColor(lastScore) }}>{lastScore.toFixed(1)}</span>
                    {scoreDelta !== null && Math.abs(scoreDelta) >= 0.1 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: scoreDelta > 0 ? "#4fae7d" : "#d9695a" }} title="Écart avec la moyenne de la semaine précédente">
                        {scoreDelta > 0 ? "▲" : "▼"} {Math.abs(scoreDelta).toFixed(1)}
                      </span>
                    )}
                  </span>
                )
              }
            >
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <ReferenceArea y1={7} y2={10} fill="#4fae7d" fillOpacity={0.06} ifOverflow="hidden" />
                  <ReferenceArea y1={5} y2={7} fill="#d9a441" fillOpacity={0.05} ifOverflow="hidden" />
                  <ReferenceArea y1={0} y2={5} fill="#d9695a" fillOpacity={0.06} ifOverflow="hidden" />
                  <CartesianGrid vertical={false} stroke="#2a2620" />
                  <XAxis dataKey="shortDate" stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} axisLine={{ stroke: "#2a2620" }} minTickGap={28} />
                  <YAxis domain={[0, 10]} ticks={[0, 5, 7, 10]} stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip content={<ScoreTip />} cursor={{ stroke: "#3a342a", strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="normalizedScore"
                    name="Score du jour"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={chartData.length <= 45 ? <ZoneDot /> : false}
                    activeDot={{ r: 5, stroke: "#0d0c0a", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  {chartData.length >= 4 && (
                    <Line type="monotone" dataKey="avg7" name="Moyenne 7 jours" stroke="#f3f0ea" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "#a8a199", marginTop: 6 }}>
                <span><span style={{ display: "inline-block", width: 14, height: 3, background: ACCENT, verticalAlign: "middle", marginRight: 5, borderRadius: 2 }} />Score du jour</span>
                {chartData.length >= 4 && (
                  <span><span style={{ display: "inline-block", width: 14, borderTop: "2px dashed rgba(243,240,234,0.55)", verticalAlign: "middle", marginRight: 5 }} />Moyenne 7 jours</span>
                )}
                <span><span style={{ color: "#4fae7d" }}>■</span> ≥ 7 bon · <span style={{ color: "#d9a441" }}>■</span> 5-7 moyen · <span style={{ color: "#d9695a" }}>■</span> &lt; 5 bas</span>
              </div>
            </FoldCard>

            {/* Les 7 indicateurs en petits graphiques (un par indicateur) */}
            <FoldCard id="indic" fold={fold} title="🔎 Détail des indicateurs" subtitle="Dernière valeur, évolution sur une semaine et moyenne de la période">
              {[
                { title: "À surveiller · idéalement bas", list: INDICATORS.filter((x) => x.low) },
                { title: "Positifs · idéalement haut", list: INDICATORS.filter((x) => !x.low) },
              ].map((grp) => (
                <div key={grp.title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#a8a199", fontWeight: 700, margin: "0 2px 8px" }}>{grp.title}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
                    {grp.list.map((ind) => {
                      const st = indicatorStats(ind.key);
                      const good = st.delta === null ? null : ind.low ? st.delta < 0 : st.delta > 0;
                      const valCol = st.last === null ? "#6f6a62" : (ind.low ? 10 - st.last : st.last) >= 7 ? "#4fae7d" : (ind.low ? 10 - st.last : st.last) >= 5 ? "#d9a441" : "#d9695a";
                      return (
                        <div key={ind.key} style={{ background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 10, padding: "10px 12px 6px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#f3f0ea" }}>{ind.icon} {ind.label}</span>
                            {st.delta !== null && Math.abs(st.delta) >= 0.1 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: good ? "#4fae7d" : "#d9695a" }} title="Écart avec la moyenne de la semaine précédente">
                                {st.delta > 0 ? "▲" : "▼"} {Math.abs(st.delta).toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                            <span style={{ fontSize: 22, fontWeight: 800, color: valCol }}>{st.last === null ? "—" : st.last}</span>
                            <span style={{ fontSize: 11.5, color: "#a8a199" }}>/10 · moy. {st.avg === null ? "—" : st.avg.toFixed(1)}</span>
                          </div>
                          <ResponsiveContainer width="100%" height={56}>
                            <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`g_${ind.key}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={ind.color} stopOpacity={0.3} />
                                  <stop offset="100%" stopColor={ind.color} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <YAxis hide domain={[0, 10]} />
                              <XAxis hide dataKey="shortDate" />
                              <Tooltip content={<MiniTip label={ind.label} />} cursor={{ stroke: "#3a342a" }} />
                              <Area type="monotone" dataKey={ind.key} stroke={ind.color} strokeWidth={2} fill={`url(#g_${ind.key})`} dot={false} activeDot={{ r: 3.5, stroke: "#0d0c0a", strokeWidth: 1.5 }} isAnimationActive={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </FoldCard>
            </>
            )}
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
