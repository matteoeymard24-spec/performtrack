import { TH } from "./thresholdsCore";
import { targetRir } from "./loadAdjust";
import { blockTypeOf } from "./blockType";
import { sessionRpe, sessionDurationMin, doneDateOf } from "./sessionLoad";

/* =====================================================================
   rpePredict.js — RPE de séance attendu, calculé automatiquement, puis individualisé.

   1) Prédiction générale d'après la PRESCRIPTION (aucune saisie du coach) :
      • musculation : RPE de chaque série = 10 − RIR prévu, le RIR venant du % de RM et des reps
        (targetRir, relation reps-%RM) ou du RIR saisi ; PDC / élastique / kg fixe sans RIR → 6,5.
      • sprint : intensité (Max ≈ RPE 8, 85-95 % ≈ 7…), endurance : % de VMA (≥ 100 % ≈ 9, 70 % ≈ 5,5…).
      • RPE de séance ≈ 75 % de la moyenne des séries (pondérée par le nombre de séries) + 25 % de la
        série la plus dure, ± 0,5 selon le volume (Day et al. 2004 : le RPE de séance suit l'intensité
        relative des séries ; Sweet et al. 2004).
      Échauffement exclu. Le RPE choisi à la main par le coach reste prioritaire.
   2) Individualisation au fil des séances : biais = moyenne des écarts « RPE ressenti − RPE attendu »
      de SES 12 dernières séances (même type si ≥ 3), rétréci vers 0 tant qu'il y a peu de séances
      (× n / (n + 3)). RPE attendu pour lui = RPE prévu + biais.
   3) Charge de référence individuelle (UA) : moyenne et écart-type de SES charges journalières
      (RPE × minutes) sur 90 jours, pour classer une journée légère / modérée / intense par rapport
      à ce qu'il fait d'habitude (au moins 8 jours d'entraînement, sinon repères fixes 300 / 600 UA).
   ===================================================================== */

const WARM_RE = /échauffement|echauffement|warm.?up|activation/i;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r05 = (v) => Math.round(v * 2) / 2;

function exerciseRpe(ex, bt) {
  if (bt === "sprint") {
    const i = String(ex.intensity ?? "Max");
    const p = parseFloat(i.replace(",", "."));
    const pct = /max/i.test(i) || !(p > 0) ? 100 : p;
    return pct >= 95 ? 8 : pct >= 85 ? 7 : pct >= 75 ? 6 : 5;
  }
  if (bt === "endurance") {
    const p = Number(ex.vmaPercentage) || 0;
    if (!p) return 6;
    return p >= 100 ? 9 : p >= 90 ? 8 : p >= 80 ? 7 : p >= 70 ? 5.5 : 4;
  }
  const pct = ex.rmPercent;
  if (typeof pct === "number" || /^\d/.test(String(pct ?? ""))) {
    const t = targetRir(pct, ex.reps);
    if (t) return t.rpe;
  }
  if (ex.rir !== undefined && ex.rir !== null && ex.rir !== "") return clamp(10 - Number(ex.rir), 1, 10);
  return TH("rpeNoRm");
}
const weightOf = (ex, bt) => {
  if (bt === "sprint") return Math.max(1, (Number(ex.sets) || 1) * (Number(ex.reps) || 1));
  if (bt === "endurance") return Math.max(1, Number(ex.reps) || 1);
  return Math.max(1, Number(ex.series) || 1);
};

/* Prédiction générale d'après la prescription → { rpe, sets } (null si séance vide) */
export function predictSessionRpe(w) {
  let sum = 0;
  let wsum = 0;
  let max = 0;
  let muscuSets = 0;
  (w?.blocks || []).forEach((b) => {
    if (WARM_RE.test(b?.name || "")) return;
    const bt = blockTypeOf(b, w.type || "muscu");
    (b.exercises || []).forEach((ex) => {
      if (!ex || !(ex.name || ex.distance || ex.vmaPercentage)) return;
      const r = exerciseRpe(ex, bt);
      const k = weightOf(ex, bt);
      sum += r * k;
      wsum += k;
      max = Math.max(max, r);
      if (bt === "muscu") muscuSets += Number(ex.series) || 0;
    });
  });
  if (!wsum) return null;
  const wm = Math.max(0, Math.min(100, TH("rpeMeanWeight"))) / 100;
  let rpe = wm * (sum / wsum) + (1 - wm) * max;
  if (muscuSets > TH("rpeVolHigh")) rpe += 0.5;
  else if (muscuSets > 0 && muscuSets < TH("rpeVolLow")) rpe -= 0.5;
  return { rpe: r05(clamp(rpe, 1, 10)), sets: muscuSets };
}

/* RPE « de base » d'une séance : celui choisi par le coach, sinon la prédiction automatique */
export function baseRpe(w) {
  if (Number(w?.plannedRpe) > 0) return { rpe: Number(w.plannedRpe), auto: false };
  const p = predictSessionRpe(w);
  return p ? { rpe: p.rpe, auto: true } : null;
}

/* Biais individuel (ressenti − attendu) d'après ses séances terminées avant `beforeDate` */
export function athleteRpeBias(workouts, uid, type, beforeDate, excludeId) {
  const hist = (workouts || [])
    .filter((x) => x.id !== excludeId && x.userProgress?.[uid]?.completedAt)
    .map((x) => ({ x, d: doneDateOf(x, uid), felt: sessionRpe(x, uid), base: baseRpe(x) }))
    .filter((o) => o.felt != null && o.base && (!beforeDate || o.d < beforeDate))
    .sort((a, b) => b.d.localeCompare(a.d));
  const same = hist.filter((o) => (o.x.type || "muscu") === (type || "muscu"));
  const win = Math.max(1, Math.round(TH("biasWindow")));
  const pool = (same.length >= 3 ? same : hist).slice(0, win);
  if (!pool.length) return { bias: 0, n: 0 };
  const mean = pool.reduce((a, o) => a + (o.felt - o.base.rpe), 0) / pool.length;
  const k = Math.max(0, TH("biasShrink"));
  return { bias: Math.round(mean * (pool.length / (pool.length + k)) * 10) / 10, n: pool.length, scope: same.length >= 3 ? type : "tout" };
}

/* RPE attendu pour CET athlète sur la séance w */
export function expectedRpeFor(workouts, uid, w) {
  const b = baseRpe(w);
  if (!b) return null;
  const bias = athleteRpeBias(workouts, uid, w.type, w.userProgress?.[uid]?.completedAt ? doneDateOf(w, uid) : null, w.id);
  return { rpe: r05(clamp(b.rpe + bias.bias, 1, 10)), base: b.rpe, auto: b.auto, bias: bias.bias, n: bias.n };
}

/* Charge de référence individuelle (UA par jour d'entraînement, 90 jours avant `today`) */
export function athleteLoadRef(workouts, uid, today) {
  const [y, m, d] = today.split("-").map(Number);
  const from = new Date(y, m - 1, d - TH("loadRefDays"));
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  const byDay = {};
  (workouts || []).forEach((w) => {
    if (!w.userProgress?.[uid]?.completedAt) return;
    const dd = doneDateOf(w, uid);
    if (dd < fromIso || dd >= today) return;
    const felt = sessionRpe(w, uid);
    if (felt == null) return;
    byDay[dd] = (byDay[dd] || 0) + felt * sessionDurationMin(w, uid);
  });
  const vals = Object.values(byDay);
  if (vals.length < TH("loadRefMinDays")) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  return { mean: Math.round(mean), sd: Math.round(Math.max(sd, mean * 0.15)), n: vals.length };
}
