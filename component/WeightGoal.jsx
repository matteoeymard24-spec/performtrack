import React from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { GOAL_BY_ID } from "./nutritionData";

/* =====================================================================
   WeightGoal.jsx — courbe du poids LIÉE À L'OBJECTIF NUTRITIONNEL ACTUEL.

   Objectif = users/{uid}/nutrition/settings : goal (seche | recompo | maintien | perf | prise),
   rate (kg/semaine), targetWeight (kg, facultatif), goalSince (date de début de l'objectif).
   Affiche : poids réel, trajectoire prévue (depuis le début de l'objectif, au rythme choisi, jusqu'au
   poids cible), ligne du poids cible, rythme réel des 4 dernières semaines vs prévu → verdict.
   ===================================================================== */
const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";
const AMBER = "#e0a13d";
const GREEN = "#4fae7d";
const RED = "#d9695a";
const BLUE = "#5b9bd5";
const fr = (x, d = 1) => String(Math.round(Number(x) * 10 ** d) / 10 ** d).replace(".", ",");
const dayMs = 86400000;
const toT = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).getTime();
const isoOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* pente (kg / semaine) par moindres carrés sur les pesées des `days` derniers jours */
export function weightSlope(points, days = 28) {
  const pts = (points || []).filter((p) => p && p.date && Number(p.weight) > 0);
  if (pts.length < 2) return null;
  const last = toT(pts[pts.length - 1].date);
  const win = pts.filter((p) => toT(p.date) >= last - days * dayMs);
  if (win.length < 2) return null;
  const xs = win.map((p) => (toT(p.date) - last) / (7 * dayMs));
  const ys = win.map((p) => Number(p.weight));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den > 0 ? num / den : null;
}

/* Objectif + verdict */
export function weightGoalState(settings, points) {
  const pts = (points || []).filter((p) => p && p.date && Number(p.weight) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const g = settings?.goal ? GOAL_BY_ID[settings.goal] : null;
  if (!g) return { goal: null, pts };
  const sign = g.sign || 0;
  const rate = sign !== 0 ? Number(settings.rate) || g.defRate || 0 : 0; // kg/sem (valeur absolue)
  const perWeek = sign * rate;
  const cur = pts.length ? Number(pts[pts.length - 1].weight) : null;
  const target = Number(settings.targetWeight) > 0 ? Number(settings.targetWeight) : null;
  // début : date de l'objectif (ou 8 semaines avant la dernière pesée), poids = pesée la plus proche
  const lastT = pts.length ? toT(pts[pts.length - 1].date) : Date.now();
  const sinceT = settings.goalSince ? toT(settings.goalSince) : lastT - 56 * dayMs;
  const near = pts.length ? pts.reduce((b, p) => (Math.abs(toT(p.date) - sinceT) < Math.abs(toT(b.date) - sinceT) ? p : b), pts[0]) : null;
  const start = near ? { t: sinceT, w: Number(near.weight) } : null;
  const slope = weightSlope(pts, 28);
  let verdict = null;
  if (slope != null) {
    if (sign > 0) {
      verdict = slope >= rate * 0.6 ? { k: "ok", c: GREEN, t: "✓ Dans le rythme" } : slope > -0.1 ? { k: "slow", c: AMBER, t: "⚠️ Trop lent" } : { k: "wrong", c: RED, t: "✕ À l'opposé de l'objectif" };
    } else if (sign < 0) {
      verdict = slope <= -rate * 0.6 ? { k: "ok", c: GREEN, t: "✓ Dans le rythme" } : slope < 0.1 ? { k: "slow", c: AMBER, t: "⚠️ Trop lent" } : { k: "wrong", c: RED, t: "✕ À l'opposé de l'objectif" };
    } else {
      verdict = Math.abs(slope) <= 0.25 ? { k: "ok", c: GREEN, t: "✓ Poids stable" } : { k: "drift", c: AMBER, t: `⚠️ Dérive ${slope > 0 ? "+" : "−"}${fr(Math.abs(slope), 2)} kg/sem` };
    }
  }
  if (target != null && cur != null && Math.abs(target - cur) < 0.5) verdict = { k: "reached", c: GREEN, t: "🎯 Poids cible atteint" };
  const weeksLeft = target != null && cur != null && rate > 0 && Math.sign(target - cur) === sign ? Math.ceil(Math.abs(target - cur) / rate) : null;
  return { goal: g, sign, rate, perWeek, cur, target, start, slope, verdict, weeksLeft, pts, since: settings.goalSince || null };
}

/* Points du graphique : pesées + trajectoire prévue (du début de l'objectif à aujourd'hui + 4 semaines, bornée au poids cible) */
function chartData(st) {
  const rows = st.pts.map((p) => ({ t: toT(p.date), date: p.date.slice(0, 10), weight: Number(p.weight) }));
  if (!st.goal || !st.start) return rows;
  const planAt = (t) => {
    let w = st.start.w + (st.perWeek * (t - st.start.t)) / (7 * dayMs);
    if (st.target != null && st.sign !== 0) w = st.sign > 0 ? Math.min(w, st.target) : Math.max(w, st.target);
    return Math.round(w * 10) / 10;
  };
  const endT = Math.max(Date.now(), rows.length ? rows[rows.length - 1].t : 0) + 28 * dayMs;
  const byT = new Map(rows.map((r) => [r.t, r]));
  for (let t = st.start.t; t <= endT; t += 7 * dayMs) {
    const k = toT(isoOf(t));
    if (!byT.has(k)) byT.set(k, { t: k, date: isoOf(k) });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t).map((r) => (r.t >= st.start.t ? { ...r, plan: planAt(r.t) } : r));
}

export function WeightGoalChart({ points, settings, orientation, you = false, height = 220, onGoNutrition }) {
  const st = weightGoalState(settings, points);
  const data = chartData(st);
  if (!data.length) return null;
  const ws = data.map((d) => d.weight).filter((x) => x != null).concat(data.map((d) => d.plan).filter((x) => x != null));
  // cible proche : dans l'échelle (ligne verte) ; cible lointaine : en légende, pour ne pas écraser la courbe
  const targetIn = st.target != null && st.cur != null && Math.abs(st.target - st.cur) <= 6;
  if (targetIn) ws.push(st.target);
  const lo = Math.floor(Math.min(...ws) - 1);
  const hi = Math.ceil(Math.max(...ws) + 1);
  const goalChip = st.goal
    ? `${st.goal.icon} ${st.goal.label}${st.sign !== 0 ? ` · ${st.sign < 0 ? "−" : "+"}${fr(st.rate, 2)} kg/sem` : ""}`
    : null;
  const mismatch = orientation && st.goal && orientationGoal(orientation) && orientationGoal(orientation) !== st.goal.id && !(orientationGoal(orientation) === "recompo" && st.goal.id === "maintien");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {goalChip ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: TEXT, border: `1px solid ${BLUE}66`, background: `${BLUE}14`, borderRadius: 999, padding: "3px 10px" }}>
            Objectif actuel : {goalChip}
            {st.target != null ? ` → ${fr(st.target)} kg` : ""}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: MUTED }}>
            Pas d'objectif nutritionnel défini.{" "}
            {onGoNutrition && (
              <button type="button" onClick={onGoNutrition} style={{ background: "none", border: "none", color: AMBER, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12 }}>
                Le définir dans Nutrition › Objectifs
              </button>
            )}
          </span>
        )}
        {st.verdict && <span style={{ fontSize: 12, fontWeight: 800, color: st.verdict.c }}>{st.verdict.t}</span>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="wgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={AMBER} stopOpacity={0.55} />
              <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
          <XAxis dataKey="date" stroke={MUTED} fontSize={11} tickFormatter={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} minTickGap={18} />
          <YAxis stroke={MUTED} fontSize={11} domain={[lo, hi]} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#0d0c0a", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            formatter={(v, n) => [`${fr(v)} kg`, n]}
          />
          {targetIn && (
            <ReferenceLine y={st.target} stroke={GREEN} strokeDasharray="6 4" label={{ value: `Cible ${fr(st.target)} kg`, position: "insideTopRight", fill: GREEN, fontSize: 11 }} />
          )}
          <Area type="monotone" dataKey="weight" name="Poids" stroke={AMBER} strokeWidth={2} fill="url(#wgGrad)" connectNulls dot={{ r: 2.5, fill: AMBER }} />
          {st.goal && <Line type="linear" dataKey="plan" name="Trajectoire prévue" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: MUTED, marginTop: 4 }}>
        <span><span style={{ color: AMBER }}>━</span> poids réel</span>
        {st.goal && <span><span style={{ color: BLUE }}>┅</span> trajectoire prévue{st.since ? ` depuis le ${new Date(`${st.since}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}</span>}
        {st.target != null &&
          (targetIn ? (
            <span><span style={{ color: GREEN }}>┅</span> poids cible</span>
          ) : (
            <span style={{ color: GREEN }}>
              🎯 cible {fr(st.target)} kg (hors graphique {st.target > st.cur ? "↑" : "↓"})
            </span>
          ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10 }}>
        <Mini label="Poids actuel" value={st.cur != null ? `${fr(st.cur)} kg` : "—"} />
        {st.target != null && <Mini label="Poids cible" value={`${fr(st.target)} kg`} sub={st.cur != null ? `${st.target - st.cur > 0 ? "+" : "−"}${fr(Math.abs(st.target - st.cur))} kg` : ""} color={GREEN} />}
        <Mini
          label="Rythme réel (4 sem.)"
          value={st.slope != null ? `${st.slope > 0 ? "+" : st.slope < 0 ? "−" : ""}${fr(Math.abs(st.slope), 2)} kg/sem` : "—"}
          sub={st.goal ? `prévu : ${st.perWeek > 0 ? "+" : st.perWeek < 0 ? "−" : ""}${fr(Math.abs(st.perWeek), 2)} kg/sem` : ""}
          color={st.verdict?.c}
        />
        {st.weeksLeft != null && <Mini label="Temps estimé" value={`≈ ${st.weeksLeft} sem.`} sub="au rythme prévu" />}
      </div>
      {mismatch && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#e8dcc4", padding: "8px 10px", borderRadius: 8, background: "rgba(217,164,65,0.08)", border: "1px solid #d9a44144", lineHeight: 1.45 }}>
          ⚠️ Le bilan (Tests) oriente vers <b>{orientation.label}</b>, mais l'objectif nutritionnel est « {st.goal.label} ».{" "}
          {onGoNutrition ? (
            <button type="button" onClick={onGoNutrition} style={{ background: "none", border: "none", color: AMBER, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12.5 }}>
              Ajuster dans Nutrition › Objectifs
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const orientationGoal = (o) => (o?.id === "perte" ? "seche" : o?.id === "prise" ? "prise" : o?.id === "recompo" ? "recompo" : o?.id === "maintien" ? "maintien" : null);

function Mini({ label, value, sub, color = TEXT }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: MUTED }}>{sub}</div> : null}
    </div>
  );
}
