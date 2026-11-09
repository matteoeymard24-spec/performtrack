import { sessionRpe, doneDateOf } from "./sessionLoad";
import { baseRpe } from "./rpePredict";

/* =====================================================================
   effortZ.js — effort perçu d'une séance comparé à l'HISTORIQUE de l'athlète (z-score individuel).

   Mesure : écart « RPE ressenti − RPE prévu » (prévu par le coach, sinon calculé automatiquement
   d'après la prescription : rpePredict.js), sinon le RPE ressenti seul. Comparé aux séances du MÊME TYPE (muscu / sprint / endurance)
   faites par l'athlète dans les 120 jours précédents (au moins 5 ; sinon tous types confondus).
   z > 0 : plus dur que d'habitude pour lui · z < 0 : plus facile.

   Pourquoi : une même séance ressentie plus dure qu'à l'accoutumée est un signe précoce de
   fatigue (rapport effort perçu / charge, Foster 1998 ; Saw et al. 2016 : les indicateurs
   subjectifs réagissent avant les objectifs). Le z-score individuel évite de comparer un
   athlète qui note toujours « 8 » à un autre qui note toujours « 5 ».
   ===================================================================== */

const MIN_N = 5;
const WINDOW_DAYS = 120;

const metricOf = (w, uid) => {
  const felt = sessionRpe(w, uid);
  if (felt == null) return null;
  // RPE prévu par le coach, sinon calculé d'après la prescription (%RM, RIR, intensité)
  const b = baseRpe(w);
  const planned = b ? b.rpe : null;
  return { felt, planned, delta: planned != null ? felt - planned : null };
};
const shiftIso = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const stats = (vals) => {
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, mean, sd };
};

/* z-score de la séance w pour l'athlète uid (null si pas de note ou historique insuffisant) */
export function effortZ(workouts, uid, w) {
  const cur = metricOf(w, uid);
  if (!cur) return null;
  const date = doneDateOf(w, uid);
  const from = shiftIso(date, -WINDOW_DAYS);
  const past = (workouts || [])
    .filter((x) => x.id !== w.id && x.userProgress?.[uid]?.completedAt)
    .map((x) => ({ x, d: doneDateOf(x, uid), m: metricOf(x, uid) }))
    .filter((o) => o.m && o.d < date && o.d >= from);
  // écart au RPE prévu si cette séance en a un et l'historique aussi, sinon RPE ressenti brut
  const useDelta = cur.delta != null && past.filter((o) => o.m.delta != null).length >= MIN_N;
  const val = (o) => (useDelta ? o.m.delta : o.m.felt);
  const pool = past.filter((o) => (useDelta ? o.m.delta != null : true));
  const sameType = pool.filter((o) => (o.x.type || "muscu") === (w.type || "muscu"));
  const base = sameType.length >= MIN_N ? sameType : pool.length >= MIN_N ? pool : null;
  if (!base) return { z: null, n: pool.length, felt: cur.felt, planned: cur.planned, kind: useDelta ? "delta" : "felt", scope: null };
  const st = stats(base.map(val));
  const v = useDelta ? cur.delta : cur.felt;
  const sd = Math.max(st.sd, 0.5); // plancher : évite des z énormes chez un athlète très régulier
  return {
    z: Math.round(((v - st.mean) / sd) * 10) / 10,
    n: st.n,
    mean: st.mean,
    felt: cur.felt,
    planned: cur.planned,
    kind: useDelta ? "delta" : "felt",
    scope: base === sameType ? w.type || "muscu" : "tout",
  };
}

const TYPE_TXT = { muscu: "musculation", sprint: "sprint", endurance: "endurance", tout: "toutes séances" };
export const effortZText = (r) => {
  if (!r || r.z == null) return null;
  const s = `z ${r.z > 0 ? "+" : ""}${String(r.z).replace(".", ",")}`;
  const vs = `vs ses ${r.n} séances ${TYPE_TXT[r.scope] || ""}`.trim();
  if (r.z >= 1.5) return { t: `${s} · bien plus dur que d'habitude`, vs, c: "#d9695a" };
  if (r.z >= 0.75) return { t: `${s} · plus dur que d'habitude`, vs, c: "#e0a13d" };
  if (r.z <= -1.5) return { t: `${s} · bien plus facile que d'habitude`, vs, c: "#5b9bd5" };
  if (r.z <= -0.75) return { t: `${s} · plus facile que d'habitude`, vs, c: "#7fb6e0" };
  return { t: `${s} · dans ses habitudes`, vs, c: "#4fae7d" };
};

/* Signal pour l'état de forme : dernière séance terminée dans les 4 derniers jours */
export function recentEffortSignal(workouts, uid, today) {
  const from = shiftIso(today, -4);
  const done = (workouts || [])
    .filter((w) => w.userProgress?.[uid]?.completedAt)
    .map((w) => ({ w, d: doneDateOf(w, uid) }))
    .filter((o) => o.d >= from && o.d <= today)
    .sort((a, b) => b.d.localeCompare(a.d));
  for (const o of done) {
    const r = effortZ(workouts, uid, o.w);
    if (r && r.z != null) return { ...r, title: o.w.title || "Séance", date: o.d };
  }
  return null;
}
