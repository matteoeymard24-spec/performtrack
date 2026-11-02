/* =====================================================================
   weekRealized.js — volume et intensité RÉELLEMENT EFFECTUÉS, semaine par semaine,
   à partir des séances TERMINÉES (pour la frise de planification).

   Le coach garde son volume / intensité PRÉVUS (saisis à la main) ; ceci calcule ce qui a été fait.
   Pour chaque athlète et chaque semaine (semaine où la séance a réellement été faite, doneDate) :
     • minutes = Σ durée réelle des séances terminées ; charge = Σ note de séance × durée (sRPE, Foster) ;
     • intensité réelle (1-10) = charge / minutes = RPE moyen pondéré par la durée (échelle absolue :
       c'est déjà le ressenti propre de l'athlète, on ne la normalise pas) ;
     • volume réel (1-10) = Z-SCORE INDIVIDUEL des minutes de la semaine par rapport aux semaines
       précédentes DE CET ATHLÈTE, ramené sur 1-10 : note = 5 + 2 × z (bornée 1-10).
       5 = semaine habituelle pour lui, 7 = +1 écart-type, 9 = +2 écarts-types, 3 = −1.
   Base de comparaison : les 8 semaines précédentes (semaines sans séance comptées à 0 à partir de sa
   1re semaine d'activité).
   Peu d'historique (limite du z-score) :
     • < 4 semaines : moyenne et écart-type « tirés » vers ceux du groupe (chaque semaine manquante pour
       arriver à 4 est remplacée par la norme du groupe = médiane des athlètes ayant ≥ 4 semaines) —
       rétrécissement bayésien empirique ;
     • écart-type plancher = 15 % de la moyenne (et ≥ 5 min) : deux ou trois semaines presque
       identiques ne donnent pas un z-score démesuré ;
     • < 2 semaines et pas de norme de groupe : pas de z-score → ancien calcul relatif (semaine la plus
       chargée = 10), signalé « provisoire ».
   Plusieurs athlètes (groupe) : moyenne des z-scores de chacun (un gros volume individuel ne tire plus
   tout le groupe), puis même conversion 1-10.
   ===================================================================== */
import { sessionDurationMin, sessionLoad, sessionRpe, doneDateOf } from "./sessionLoad";
import { mondayOf } from "./cycles";

const r1 = (x) => Math.round(x * 10) / 10;
export const Z_LOOKBACK_WEEKS = 8;
export const Z_MIN_WEEKS = 4;
export const Z_SD_FLOOR_CV = 0.15;
export const Z_SD_FLOOR_MIN = 5;
export const zToScore = (z) => Math.max(1, Math.min(10, r1(5 + 2 * z)));

const addDaysStr = (d, n) => {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sdOf = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/* uid à prendre en compte selon la portée affichée ("user:<uid>" = une personne, sinon tous) */
const scopeUid = (scope) => (typeof scope === "string" && scope.startsWith("user:") ? scope.slice(5) : null);

/* Minutes / charge par athlète et par semaine (toutes les personnes présentes dans les séances) */
function weeklyByUid(events) {
  const per = {}; // uid -> wk -> { minutes, load, sessions }
  (events || []).forEach((w) => {
    if (!w?.date) return;
    const prog = w.userProgress || {};
    Object.keys(prog).forEach((uid) => {
      if (!prog[uid]?.completedAt) return;
      if (sessionRpe(w, uid) == null) return; // terminée sans aucune note : pas de charge mesurable
      const wk = mondayOf(doneDateOf(w, uid));
      per[uid] = per[uid] || {};
      const a = (per[uid][wk] = per[uid][wk] || { minutes: 0, load: 0, sessions: 0 });
      a.minutes += sessionDurationMin(w, uid);
      a.load += sessionLoad(w, uid);
      a.sessions += 1;
    });
  });
  return per;
}

/* Série continue de minutes (0 les semaines sans séance) depuis la 1re semaine d'activité */
function seriesOf(byWk, lastWk) {
  const wks = Object.keys(byWk).sort();
  if (!wks.length) return { weeks: [], minutes: [] };
  const weeks = [];
  for (let wk = wks[0]; wk <= lastWk && weeks.length < 200; wk = addDaysStr(wk, 7)) weeks.push(wk);
  return { weeks, minutes: weeks.map((wk) => byWk[wk]?.minutes || 0) };
}

/* Norme du groupe : médiane des moyennes et des écarts-types des athlètes ayant assez d'historique */
function groupPrior(series) {
  const ms = [];
  const sds = [];
  Object.values(series).forEach(({ minutes }) => {
    const hist = minutes.slice(-Z_LOOKBACK_WEEKS);
    if (hist.length >= Z_MIN_WEEKS) {
      ms.push(mean(hist));
      sds.push(sdOf(hist));
    }
  });
  return ms.length ? { m: median(ms), sd: median(sds), n: ms.length } : null;
}

/* z-score des minutes de la semaine idx d'une série, avec rétrécissement vers la norme du groupe */
function zAt(minutes, idx, prior) {
  const past = minutes.slice(Math.max(0, idx - Z_LOOKBACK_WEEKS), idx);
  const n = past.length;
  let m = n ? mean(past) : null;
  let sd = n >= 2 ? sdOf(past) : null;
  let shrunk = false;
  if (n < Z_MIN_WEEKS) {
    if (prior) {
      const k = Z_MIN_WEEKS - n; // semaines « empruntées » à la norme du groupe
      m = ((m ?? 0) * n + prior.m * k) / (n + k);
      const v = ((sd ?? 0) ** 2 * Math.max(0, n - 1) + prior.sd ** 2 * k) / (Math.max(0, n - 1) + k);
      sd = Math.sqrt(v);
      shrunk = true;
    } else if (n < 2) {
      return null;
    }
  }
  const sdUsed = Math.max(sd || 0, Z_SD_FLOOR_CV * (m || 0), Z_SD_FLOOR_MIN);
  return { z: (minutes[idx] - m) / sdUsed, n, shrunk, base: m };
}

/* { "AAAA-MM-JJ (lundi)": { minutes, load, intensity, volume, volumeZ, volumeMode, provisional, ... } } */
export function realizedByWeek(events, scope) {
  const per = weeklyByUid(events);
  const only = scopeUid(scope);
  const allWks = Object.values(per).flatMap((o) => Object.keys(o)).sort();
  if (!allWks.length) return {};
  const lastWk = allWks[allWks.length - 1];
  const series = {};
  Object.entries(per).forEach(([uid, byWk]) => {
    series[uid] = seriesOf(byWk, lastWk);
  });
  const prior = groupPrior(series);
  const uids = only ? (per[only] ? [only] : []) : Object.keys(per);

  const out = {};
  const weeks = [...new Set(uids.flatMap((u) => Object.keys(per[u] || {})))].sort();
  weeks.forEach((wk) => {
    const active = uids.filter((u) => per[u]?.[wk]);
    if (!active.length) return;
    const n = active.length;
    const minutes = active.reduce((s, u) => s + per[u][wk].minutes, 0) / n;
    const load = active.reduce((s, u) => s + per[u][wk].load, 0) / n;
    const sessions = active.reduce((s, u) => s + per[u][wk].sessions, 0) / n;
    const zs = active
      .map((u) => {
        const S = series[u];
        const i = S.weeks.indexOf(wk);
        return i >= 0 ? zAt(S.minutes, i, prior) : null;
      })
      .filter(Boolean);
    const z = zs.length ? mean(zs.map((x) => x.z)) : null;
    out[wk] = {
      minutes: Math.round(minutes),
      load: Math.round(load),
      sessions: r1(sessions),
      athletes: n,
      intensity: minutes > 0 ? r1(load / minutes) : null,
      volumeZ: z != null ? Math.round(z * 100) / 100 : null,
      zWeeks: zs.length ? Math.min(...zs.map((x) => x.n)) : 0,
      shrunk: zs.some((x) => x.shrunk),
      zCount: zs.length,
    };
  });
  // repli (aucun z-score possible) : ancien calcul relatif à la semaine la plus chargée
  const maxMin = Math.max(0, ...Object.values(out).map((x) => x.minutes));
  Object.values(out).forEach((x) => {
    x.maxMinutes = maxMin;
    if (x.volumeZ != null) {
      x.volume = zToScore(x.volumeZ);
      x.volumeMode = "z";
      x.provisional = x.shrunk;
    } else {
      x.volume = maxMin > 0 ? Math.max(1, Math.round((x.minutes / maxMin) * 10)) : null;
      x.volumeMode = "relative";
      x.provisional = true;
    }
  });
  return out;
}
