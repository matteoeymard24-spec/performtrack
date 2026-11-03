import React from "react";
import {
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";

/* =====================================================================
   WellnessCharts.jsx — graphiques wellness partagés (onglet Wellness + dashboard).
   • Score global : courbe seule (pas d'aire), sur des bandes de fond colorées
     comme les zones de la création de séance : vert ≥ 7, ambre 5-7, rouge < 5.
     Moyenne glissante 7 jours en pointillés.
   • Indicateurs : un petit graphique par indicateur, classés en NÉGATIFS
     (fatigue, stress, douleur : idéalement bas) et POSITIFS (sommeil, nutrition,
     hydratation, motivation : idéalement haut). Les bandes de fond suivent le
     sens de l'indicateur (pour la fatigue, le vert est en bas).
   Données attendues : [{ date: "AAAA-MM-JJ", normalizedScore, fatigue, stress, … }] triées par date.
   ===================================================================== */

export const NEG = "#d9695a";
export const POS = "#4fae7d";
export const INDICATORS = [
  { key: "fatigue", label: "Fatigue", icon: "😮‍💨", low: true, color: "#d9695a" },
  { key: "stress", label: "Stress", icon: "😬", low: true, color: "#e0a13d" },
  { key: "douleur", label: "Douleur", icon: "🩹", low: true, color: "#b06fd9" },
  { key: "sommeil", label: "Sommeil", icon: "😴", low: false, color: "#2f9e78" },
  { key: "nutrition", label: "Nutrition", icon: "🥗", low: false, color: "#3d7fd9" },
  { key: "hydratation", label: "Hydratation", icon: "💧", low: false, color: "#29b6c9" },
  { key: "motivation", label: "Motivation", icon: "🔥", low: false, color: "#a4c639" },
];

const BAND = 0.14; // opacité des bandes de fond (plus marquée qu'avant)
export const zoneColor = (v) => (v >= 7 ? "#4fae7d" : v >= 5 ? "#d9a441" : "#d9695a");
const dayN = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const longDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const mean = (arr, k) => (arr.length ? arr.reduce((t, x) => t + (Number(x[k]) || 0), 0) / arr.length : null);

/* Écart moyenne des 7 derniers jours vs les 7 jours d'avant (null si une des deux semaines est vide) */
export function weekDelta(all, k) {
  const t = dayN(todayIso());
  const last = all.filter((e) => e[k] != null && dayN(e.date) > t - 7);
  const prev = all.filter((e) => e[k] != null && dayN(e.date) <= t - 7 && dayN(e.date) > t - 14);
  return last.length && prev.length ? mean(last, k) - mean(prev, k) : null;
}

/* Ajoute shortDate et la moyenne glissante 7 jours du score */
export function prepWellness(data) {
  return (data || []).map((e) => {
    const n = dayN(e.date);
    const win = data.filter((x) => {
      const m = dayN(x.date);
      return m <= n && m > n - 7;
    });
    return {
      ...e,
      shortDate: shortDate(e.date),
      avg7: win.length ? Number((win.reduce((t, x) => t + x.normalizedScore, 0) / win.length).toFixed(2)) : null,
    };
  });
}

const Bands = ({ invert = false, labels = false }) => {
  const lab = (value, fill) => (labels ? { value, position: "insideTopRight", fill, fontSize: 11, fontWeight: 700 } : undefined);
  const top = invert ? "#d9695a" : "#4fae7d";
  const low = invert ? "#4fae7d" : "#d9695a";
  return [
    <ReferenceArea key="t" y1={7} y2={10} fill={top} fillOpacity={BAND} ifOverflow="hidden" label={lab(invert ? "Élevé" : "Bon", top)} />,
    <ReferenceArea key="m" y1={5} y2={7} fill="#d9a441" fillOpacity={BAND * 0.85} ifOverflow="hidden" label={lab("Moyen", "#d9a441")} />,
    <ReferenceArea key="b" y1={0} y2={5} fill={low} fillOpacity={BAND} ifOverflow="hidden" label={lab(invert ? "Faible" : "Bas", low)} />,
  ];
};

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
function ZoneDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill={zoneColor(payload.normalizedScore)} stroke="#151310" strokeWidth={1.5} />;
}

/* Score global : courbe + bandes + moyenne 7 jours */
export function WellnessScoreChart({ data, height = 250, legend = true }) {
  const rows = prepWellness(data);
  if (!rows.length) return null;
  const showAvg = rows.length >= 4;
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          {Bands({ labels: true })}
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="shortDate" stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} axisLine={{ stroke: "#2a2620" }} minTickGap={28} />
          <YAxis domain={[0, 10]} ticks={[0, 5, 7, 10]} stroke="#6f6a62" tick={{ fontSize: 11, fill: "#a8a199" }} tickLine={false} axisLine={false} width={34} />
          <Tooltip content={<ScoreTip />} cursor={{ stroke: "#3a342a", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="normalizedScore"
            name="Score du jour"
            stroke="#e0a13d"
            strokeWidth={2.5}
            dot={rows.length <= 45 ? <ZoneDot /> : false}
            activeDot={{ r: 5, stroke: "#0d0c0a", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {showAvg && (
            <Line type="monotone" dataKey="avg7" name="Moyenne 7 jours" stroke="#f3f0ea" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {legend && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "#a8a199", marginTop: 6 }}>
          <span>
            <span style={{ display: "inline-block", width: 14, height: 3, background: "#e0a13d", verticalAlign: "middle", marginRight: 5, borderRadius: 2 }} />
            Score du jour
          </span>
          {showAvg && (
            <span>
              <span style={{ display: "inline-block", width: 14, borderTop: "2px dashed rgba(243,240,234,0.6)", verticalAlign: "middle", marginRight: 5 }} />
              Moyenne 7 jours
            </span>
          )}
        </div>
      )}
    </>
  );
}

/* Petits graphiques par indicateur, classés négatifs / positifs.
   data = points affichés (période) ; all = historique complet (pour l'écart semaine / semaine). */
export function WellnessIndicators({ data, all }) {
  const rows = prepWellness(data);
  const full = all || data || [];
  const groups = [
    { title: "➖ Indicateurs négatifs", hint: "idéalement bas", color: NEG, list: INDICATORS.filter((x) => x.low) },
    { title: "➕ Indicateurs positifs", hint: "idéalement haut", color: POS, list: INDICATORS.filter((x) => !x.low) },
  ];
  return (
    <>
      {groups.map((grp) => (
        <div key={grp.title} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 8px" }}>
            <span style={{ fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: grp.color, fontWeight: 800 }}>{grp.title}</span>
            <span style={{ fontSize: 11.5, color: "#a8a199" }}>{grp.hint}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
            {grp.list.map((ind) => {
              const vals = rows.filter((e) => e[ind.key] != null);
              const last = vals.length ? vals[vals.length - 1][ind.key] : null;
              const avg = mean(vals, ind.key);
              const delta = weekDelta(full, ind.key);
              const good = delta === null ? null : ind.low ? delta < 0 : delta > 0;
              const q = last === null ? null : ind.low ? 10 - last : last;
              const valCol = q === null ? "#6f6a62" : q >= 7 ? "#4fae7d" : q >= 5 ? "#d9a441" : "#d9695a";
              return (
                <div key={ind.key} style={{ background: "#0d0c0a", border: "1px solid #2a2620", borderLeft: `3px solid ${grp.color}`, borderRadius: 10, padding: "10px 12px 6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#f3f0ea" }}>
                      {ind.icon} {ind.label}
                    </span>
                    {delta !== null && Math.abs(delta) >= 0.1 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: good ? "#4fae7d" : "#d9695a" }} title="Écart avec la moyenne de la semaine précédente">
                        {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: valCol }}>{last === null ? "—" : last}</span>
                    <span style={{ fontSize: 11.5, color: "#a8a199" }}>/10 · moy. {avg === null ? "—" : avg.toFixed(1)}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={60}>
                    <LineChart data={rows} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                      {Bands({ invert: ind.low })}
                      <YAxis hide domain={[0, 10]} />
                      <XAxis hide dataKey="shortDate" />
                      <Tooltip content={<MiniTip label={ind.label} />} cursor={{ stroke: "#3a342a" }} />
                      <Line type="monotone" dataKey={ind.key} stroke={ind.color} strokeWidth={2} dot={rows.length <= 14 ? { r: 2, fill: ind.color, strokeWidth: 0 } : false} activeDot={{ r: 3.5, stroke: "#0d0c0a", strokeWidth: 1.5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
