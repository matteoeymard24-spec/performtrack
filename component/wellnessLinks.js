/* =====================================================================
   wellnessLinks.js — relie le wellness (score 0-10 et z-score) aux données
   MESURÉES : sommeil (journal des nuits), hydratation et nutrition (journal).

   Convention de dates (questionnaire rempli le matin du jour D) :
   • sommeil      = la nuit qui se TERMINE le jour D (doc sleep/D) ;
   • eau, repas   = la VEILLE (jour D−1) : c'est ce qui pèse sur l'état du matin.

   Le score wellness et son z-score NE CHANGENT PAS (calcul historique du dashboard) :
   les données mesurées servent à (1) proposer une note objective dans le questionnaire,
   (2) expliquer un z-score bas, (3) calculer les corrélations propres à chaque athlète.
   ===================================================================== */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { calculateWellnessScore } from "./loadMetrics";
import { nightStats } from "./sleepCalc";
import { computeTargets, sumN, shiftISO, todayISO } from "./nutritionData";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

/* ---------- Scores mesurés 0-10 ---------- */
/* Sommeil : durée vs besoin (10 au besoin, 0 à besoin − 4 h), qualité ressentie (1-5) pour 30 % si notée */
export function sleepScore(night, needH = 8.5) {
  const s = nightStats(night);
  if (!s) return null;
  const need = needH * 60;
  const dur = clamp(10 - ((need - s.sleep) / 240) * 10, 0, 10);
  const q = Number(night.quality) > 0 ? ((Number(night.quality) - 1) / 4) * 10 : null;
  return { min: s.sleep, eff: s.eff, quality: Number(night.quality) || null, score: r1(q == null ? dur : 0.7 * dur + 0.3 * q) };
}
/* Hydratation : % de l'objectif d'eau (10 à ≥ 100 %, 0 à ≤ 40 %) */
export function hydrationScore(day, targetMl) {
  if (!day || !targetMl || !(Number(day.water) > 0)) return null;
  const pct = (Number(day.water) / targetMl) * 100;
  return { pct: Math.round(pct), score: r1(clamp(((pct - 40) / 60) * 10, 0, 10)) };
}
/* Nutrition : écart aux calories (10 si ±10 %, 0 si ±50 %) et couverture des protéines (10 à 100 %, 0 à 50 %) */
export function nutritionScore(day, settings) {
  if (!day || !(day.entries || []).length || !settings) return null;
  const t = computeTargets(settings, day.dayType || "modere");
  if (!t) return null;
  const n = sumN(day.entries.map((e) => e.n));
  const kcalPct = (n.kcal / t.kcal) * 100;
  const protPct = (n.p / t.p) * 100;
  const sk = clamp(10 - ((Math.abs(kcalPct - 100) - 10) / 40) * 10, 0, 10);
  const sp = clamp(((protPct - 50) / 50) * 10, 0, 10);
  return { kcalPct: Math.round(kcalPct), protPct: Math.round(protPct), kcal: Math.round(n.kcal), score: r1(0.5 * sk + 0.5 * sp) };
}

/* Valeurs mesurées pour un questionnaire du jour `date` */
export function objectiveFor(date, logs) {
  const { nights = [], days = [], nutriSettings = null, sleepSettings = {} } = logs || {};
  const night = nights.find((n) => n.date === date);
  const prev = shiftISO(date, -1);
  const day = days.find((d) => d.date === prev);
  const tWater = day?.targetWater || (nutriSettings ? computeTargets(nutriSettings, day?.dayType || "modere")?.water : null);
  return {
    sleep: night ? sleepScore(night, Number(sleepSettings.needH) || 8.5) : null,
    water: day ? hydrationScore(day, tWater) : null,
    food: day ? nutritionScore(day, nutriSettings) : null,
  };
}

/* ---------- Chargement des journaux d'une personne ---------- */
export async function loadLinkData(uid) {
  const out = { nights: [], days: [], nutriSettings: null, sleepSettings: {}, wellness: [] };
  if (!uid) return out;
  const [sl, nu, we] = await Promise.allSettled([
    getDocs(collection(db, "users", uid, "sleep")),
    getDocs(collection(db, "users", uid, "nutrition")),
    getDocs(query(collection(db, "wellness"), where("userId", "==", uid))),
  ]);
  if (sl.status === "fulfilled")
    sl.value.docs.forEach((d) => {
      if (d.id === "_settings") out.sleepSettings = d.data();
      else if (/^\d{4}-\d{2}-\d{2}$/.test(d.id)) out.nights.push({ date: d.id, ...d.data() });
    });
  if (nu.status === "fulfilled")
    nu.value.docs.forEach((d) => {
      if (d.id === "settings") out.nutriSettings = d.data();
      else if (d.id.startsWith("day_")) out.days.push({ date: d.id.slice(4), ...d.data() });
    });
  if (we.status === "fulfilled") out.wellness = we.value.docs.map((d) => ({ id: d.id, ...d.data() })).filter((w) => w.date);
  return out;
}

/* ---------- Série jour par jour : wellness (score, z) + mesures ---------- */
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export function buildLinkSeries(wellness, logs, days = 90) {
  const list = (wellness || [])
    .map((w) => ({ ...w, score: calculateWellnessScore(w) }))
    .filter((w) => w.score != null && Number.isFinite(w.score))
    .sort((a, b) => a.date.localeCompare(b.date));
  const since = shiftISO(todayISO(), -days);
  return list
    .map((w, i) => {
      // z-score du jour vs les 28 jours précédents (≥ 5 valeurs), comme le dashboard
      const hist = list.slice(0, i).filter((x) => x.date >= shiftISO(w.date, -28) && x.date < w.date).map((x) => x.score);
      let z = null;
      if (hist.length >= 5) {
        const m = mean(hist);
        const sd = Math.sqrt(hist.reduce((s, x) => s + (x - m) ** 2, 0) / (hist.length - 1));
        if (sd > 0) z = (w.score - m) / sd;
      }
      const o = objectiveFor(w.date, logs);
      return {
        date: w.date,
        score: w.score,
        z: z == null ? null : Math.round(z * 100) / 100,
        subjSleep: Number(w.sommeil),
        subjWater: Number(w.hydratation),
        subjFood: Number(w.nutrition),
        sleepH: o.sleep ? r1(o.sleep.min / 60) : null,
        sleepScore: o.sleep?.score ?? null,
        sleepQ: o.sleep?.quality ?? null,
        waterPct: o.water?.pct ?? null,
        kcalPct: o.food?.kcalPct ?? null,
        protPct: o.food?.protPct ?? null,
      };
    })
    .filter((r) => r.date >= since);
}

/* ---------- Corrélations ---------- */
export function pearson(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null && Number.isFinite(x) && Number.isFinite(y));
  const n = pts.length;
  if (n < 3) return { r: null, n };
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  pts.forEach(([x, y]) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  if (!sxx || !syy) return { r: null, n, flat: true };
  const r = sxy / Math.sqrt(sxx * syy);
  // droite de tendance y = a + b x
  const b = sxy / sxx;
  return { r: Math.round(r * 100) / 100, n, a: my - b * mx, b };
}
/* Lecture d'un r (Cohen) — avec moins de 10 points, prudence */
export function strengthOf(r, n) {
  if (r == null) return { t: "pas assez de données", c: "#a8a199" };
  if (n < 8) return { t: "trop peu de jours pour conclure", c: "#a8a199" };
  const a = Math.abs(r);
  const dir = r > 0 ? "" : " (inverse)";
  if (a >= 0.5) return { t: `lien fort${dir}`, c: r > 0 ? "#4fae7d" : "#d9695a" };
  if (a >= 0.3) return { t: `lien modéré${dir}`, c: r > 0 ? "#4fae7d" : "#e0a13d" };
  if (a >= 0.1) return { t: `lien faible${dir}`, c: "#e0a13d" };
  return { t: "pas de lien net", c: "#a8a199" };
}

export const LINK_FACTORS = [
  { id: "sleepH", label: "Durée de sommeil", unit: "h", icon: "😴", when: "la nuit d'avant" },
  { id: "sleepQ", label: "Qualité du sommeil", unit: "/5", icon: "🌙", when: "la nuit d'avant" },
  { id: "waterPct", label: "Eau (% de l'objectif)", unit: "%", icon: "💧", when: "la veille" },
  { id: "kcalPct", label: "Calories (% de l'objectif)", unit: "%", icon: "🔥", when: "la veille" },
  { id: "protPct", label: "Protéines (% de l'objectif)", unit: "%", icon: "🥩", when: "la veille" },
];

/* Facteurs probables d'un wellness bas ce jour-là (seuils simples) */
export function dayFlags(row, needH = 8.5) {
  if (!row) return [];
  const f = [];
  if (row.sleepH != null && row.sleepH < needH - 1) f.push({ icon: "😴", t: `nuit courte (${String(row.sleepH).replace(".", ",")} h)`, bad: true });
  else if (row.sleepH != null) f.push({ icon: "😴", t: `nuit de ${String(row.sleepH).replace(".", ",")} h`, bad: false });
  if (row.sleepQ != null && row.sleepQ <= 2) f.push({ icon: "🌙", t: "sommeil de mauvaise qualité", bad: true });
  if (row.waterPct != null && row.waterPct < 70) f.push({ icon: "💧", t: `peu bu la veille (${row.waterPct} %)`, bad: true });
  else if (row.waterPct != null) f.push({ icon: "💧", t: `eau ${row.waterPct} %`, bad: false });
  if (row.kcalPct != null && row.kcalPct < 80) f.push({ icon: "🔥", t: `manque d'énergie la veille (${row.kcalPct} % des kcal)`, bad: true });
  else if (row.kcalPct != null && row.kcalPct > 125) f.push({ icon: "🔥", t: `repas très copieux la veille (${row.kcalPct} %)`, bad: true });
  if (row.protPct != null && row.protPct < 70) f.push({ icon: "🥩", t: `protéines basses (${row.protPct} %)`, bad: true });
  return f;
}
