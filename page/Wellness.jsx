import WellbeingTabs from "../component/WellbeingTabs";
import WellnessLinks from "../component/WellnessLinks";
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
import { useNavigate, useSearchParams } from "react-router-dom";
import BodyScan from "../component/BodyScan";
import { WellnessScoreChart, WellnessIndicators } from "../component/WellnessCharts";
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

const PERIODS = [
  { id: "7", label: "7 j", days: 7 },
  { id: "30", label: "30 j", days: 30 },
  { id: "90", label: "3 mois", days: 90 },
  { id: "all", label: "Tout", days: null },
];
const zoneColor = (v) => (v >= 7 ? "#4fae7d" : v >= 5 ? "#d9a441" : "#d9695a");
export default function Wellness() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  // Ouvert depuis le dashboard : bouton retour + le questionnaire y ramène aussi
  const [searchParams] = useSearchParams();
  const fromDash = searchParams.get("from") === "dashboard";
  const formUrl = fromDash ? "/wellness-form?from=dashboard" : "/wellness-form";
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
      <WellbeingTabs />
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
          <>
          {fromDash && (
            <button className="pt-btn" onClick={() => navigate("/dashboard")}>
              ← Retour au dashboard
            </button>
          )}
          <button className="pt-btn pt-btn--primary" onClick={() => navigate(formUrl)}>
            📝 {todayEntry ? "Modifier le questionnaire" : "Remplir le questionnaire"}
          </button>
          </>
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
              onClick={() => navigate(formUrl)}
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
              onClick={() => navigate(formUrl)}
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
              <WellnessScoreChart data={chartData} />
            </FoldCard>

            {/* Les 7 indicateurs en petits graphiques (un par indicateur) */}
            <FoldCard id="indic" fold={fold} title="🔎 Détail des indicateurs" subtitle="Classés en négatifs (idéalement bas) et positifs (idéalement haut) · dernière valeur, évolution sur une semaine, moyenne de la période">
              <WellnessIndicators data={chartData} all={entries} />
            </FoldCard>
            <FoldCard id="links" fold={fold} title="🔗 Wellness × sommeil × nutrition" subtitle="Ton wellness relié à tes nuits (Sommeil) et à ton eau / tes repas de la veille (Nutrition) : explication du jour et corrélations sur ton historique.">
              <WellnessLinks uid={currentUser?.uid} />
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
