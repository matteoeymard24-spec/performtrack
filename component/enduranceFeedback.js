/* =====================================================================
   enduranceFeedback.js — feedback des blocs d'ENDURANCE intermittente (30/30, 15/15, 45/15…) :
   DISTANCE PAR RÉPÉTITION, comparée à la cible, + ajustement de la cible du bloc suivant.

   Cible d'une rep = vitesse de référence (VMA ou vitesse critique) × % prescrit × temps d'effort
   (ex. 30/30 à 100 % d'une VMA de 16 km/h → 4,44 m/s × 30 s ≈ 133 m).

   Indicateurs (même logique que le chrono en sprint) :
     • % de la cible   = distance moyenne / distance cible ;
     • perte (%Sdec)   = (1 − distance moyenne / meilleure distance) × 100 — décrément de performance
       utilisé pour les efforts répétés (Fitzsimons 1993 ; Girard, Mendez-Villanueva & Bishop 2011,
       Sports Med 41:673) ;
     • perte de chaque rep par rapport à la meilleure.

   Ajustement du bloc suivant (pour « rester stable sur les mètres ») :
   en intermittent, l'objectif est de tenir la MÊME vitesse sur toutes les reps ; si la distance chute,
   l'intensité prescrite est trop haute pour l'athlète ce jour-là (Billat 2001, Sports Med 31:13 ;
   Buchheit & Laursen 2013, Sports Med 43:313 — l'intensité se règle sur ce que l'athlète tient).
   Règle de l'app (ESTIMATION pratique, pas un seuil publié) :
     • niveau tenu = moyenne de la 2e moitié des reps (ce que l'athlète tient une fois fatigué) ;
     • s'il est < 97 % de la cible → % du bloc suivant × (niveau tenu / cible), baisse plafonnée à −10 % ;
     • s'il est ≥ 103 % de la cible avec une perte ≤ 3 % → hausse prudente, plafonnée à +5 % ;
     • sinon on garde la cible.

   Exercice défini en DISTANCE (component/enduranceTarget.js) : l'athlète saisit le CHRONO de chaque rep.
   Pour réutiliser exactement les mêmes calculs, chaque chrono est converti en « distance équivalente »
   = distance × chrono visé / chrono réalisé (proportionnelle à la vitesse) : 10 % plus lent que le chrono
   visé ⇒ ≈ 91 % de la cible, même lecture qu'en temps fixé.
   ===================================================================== */
import { parseTime } from "./enduranceTarget";

const r1 = (x) => Math.round(x * 10) / 10;

export const END_LOSS_WARN = 5; // % de perte : la vitesse n'est plus tenue
export const END_LOSS_STOP = 10;
/* Règle d'ajustement du bloc suivant (lue aussi par la page Référence) */
export const END_ADJ = { low: 0.97, high: 1.03, maxDown: 0.9, maxUp: 1.05, maxSdecForUp: 3 };

const validDist = (d) => {
  const v = Number(String(d ?? "").replace(",", "."));
  return v > 0 && v < 100000 ? v : null;
};

/* Reps à remplir (une ligne par rep), en reprenant ce qui existe déjà */
export function buildEnduranceReps(exercise, existing) {
  const n = Math.max(1, Math.min(60, Number(exercise?.reps) || 1));
  const old = Array.isArray(existing?.reps) ? existing.reps : [];
  return Array.from({ length: n }, (_, i) => {
    const o = old.find((x) => x.rep === i + 1);
    return { rep: i + 1, dist: o?.dist ?? "", time: o?.time ?? "", done: o?.done ?? true };
  });
}

/* Résumé ; target = distance cible par rep (m) ou null */
export function summarizeEndurance(reps, target) {
  const done = (reps || []).filter((x) => x.done !== false);
  const d = done.map((x) => validDist(x.dist)).filter((v) => v != null);
  const best = d.length ? Math.max(...d) : null;
  const mean = d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
  const half = d.length >= 2 ? d.slice(Math.floor(d.length / 2)) : d;
  const held = half.length ? half.reduce((a, b) => a + b, 0) / half.length : null;
  const sdec = d.length >= 2 && best ? (1 - mean / best) * 100 : null;
  const loss = (x) => {
    const v = validDist(x);
    return v != null && best ? ((best - v) / best) * 100 : null;
  };
  const vsTarget = (x) => {
    const v = validDist(x);
    return v != null && target > 0 ? (v / target) * 100 : null;
  };
  return {
    nDone: done.length,
    nEntered: d.length,
    total: d.length ? Math.round(d.reduce((a, b) => a + b, 0)) : null,
    best: best != null ? Math.round(best) : null,
    mean: mean != null ? Math.round(mean) : null,
    held: held != null ? Math.round(held) : null,
    sdec: sdec != null ? r1(sdec) : null,
    pctTarget: mean != null && target > 0 ? r1((mean / target) * 100) : null,
    heldPctTarget: held != null && target > 0 ? r1((held / target) * 100) : null,
    loss,
    vsTarget,
  };
}

/* Ajustement proposé pour le bloc d'endurance suivant.
   pct = % prescrit de ce bloc ; renvoie { factor, newPct, newTarget, label } ou null */
export function nextBlockAdjustment(S, pct, target) {
  if (!S || S.held == null || !(target > 0) || !(pct > 0) || S.nEntered < 2) return null;
  const ratio = S.held / target;
  let factor = 1;
  let label = "Cible tenue : garder la même intensité au bloc suivant.";
  if (ratio < END_ADJ.low) {
    factor = Math.max(END_ADJ.maxDown, ratio);
    label = `Niveau tenu (2e moitié des reps) ${Math.round(ratio * 100)} % de la cible : baisser l'intensité du bloc suivant pour garder des reps stables.`;
  } else if (ratio >= END_ADJ.high && (S.sdec == null || S.sdec <= END_ADJ.maxSdecForUp)) {
    factor = Math.min(END_ADJ.maxUp, ratio);
    label = `Cible dépassée sans perte (${Math.round(ratio * 100)} %) : le bloc suivant peut monter un peu.`;
  }
  return {
    factor: Math.round(factor * 1000) / 1000,
    newPct: Math.round(pct * factor),
    newTarget: Math.round(target * factor),
    label,
  };
}

/* Entrée enregistrée dans Firestore */
export function enduranceEntry(reps, target, pct, rpe, notes) {
  const clean = (reps || []).map((x) => ({ rep: x.rep, dist: validDist(x.dist), done: x.done !== false }));
  const S = summarizeEndurance(clean, target);
  const adj = nextBlockAdjustment(S, pct, target);
  return {
    reps: clean,
    actualDistance: S.total || 0,
    meanDist: S.mean,
    bestDist: S.best,
    heldDist: S.held,
    sdec: S.sdec,
    pctTarget: S.pctTarget,
    targetPerRep: target || null,
    plannedPct: pct || null,
    ...(adj ? { nextFactor: adj.factor, nextPct: adj.newPct } : {}),
    rpe: Number(rpe),
    notes: notes || "",
  };
}

/* Facteur d'ajustement à appliquer à un exercice d'endurance : celui du DERNIER exercice
   d'endurance déjà renseigné AVANT lui dans la séance (blocs précédents). */
export function adjustmentBefore(blocks, feedback, bIdx, eIdx, isEndurance) {
  let found = null;
  (blocks || []).forEach((b, bi) => {
    if (!isEndurance(b)) return;
    // Bloc EMOM / AMRAP déjà renseigné avant : son feedback est au niveau du bloc
    const bf = bi < bIdx ? feedback?.[`block-${bi}`] : null;
    if (bf && bf.nextFactor) found = { factor: bf.nextFactor, from: b.name || `Bloc ${bi + 1}` };
    (b.exercises || []).forEach((_, ei) => {
      if (bi > bIdx || (bi === bIdx && ei >= eIdx)) return;
      const f = feedback?.[`${bi}-${ei}`];
      if (f && f.nextFactor) found = { factor: f.nextFactor, from: b.name || `Bloc ${bi + 1}` };
    });
  });
  return found;
}

/* ---------- Mode DISTANCE : chrono par rep ---------- */
const T0 = 100; // chrono de référence quand aucun chrono visé n'existe (seules les pertes relatives comptent)

/* Reps « chrono » → reps « distance équivalente » pour summarizeEndurance */
export function timedEquivalent(reps, dist, targetTime) {
  const ref = targetTime > 0 ? targetTime : T0;
  return (reps || []).map((x) => {
    const t = parseTime(x.time);
    return { rep: x.rep, done: x.done, dist: t && dist > 0 ? (dist * ref) / t : "" };
  });
}

/* Résumé en mode distance : mêmes indicateurs + chronos */
export function summarizeTimed(reps, dist, targetTime) {
  const eq = timedEquivalent(reps, dist, targetTime);
  const S = summarizeEndurance(eq, targetTime > 0 ? dist : null);
  const times = (reps || []).filter((x) => x.done !== false).map((x) => parseTime(x.time)).filter((t) => t > 0);
  const eqOf = (time) => {
    const t = parseTime(time);
    return t && dist > 0 ? (dist * (targetTime > 0 ? targetTime : T0)) / t : null;
  };
  return {
    ...S,
    eq,
    total: S.nDone ? Math.round(dist * S.nDone) : null, // vraie distance parcourue
    bestTime: times.length ? Math.min(...times) : null,
    meanTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    lossT: (time) => S.loss(eqOf(time)),
    vsTargetT: (time) => S.vsTarget(eqOf(time)),
  };
}

export function enduranceEntryTimed(reps, dist, targetTime, pct, rpe, notes) {
  const clean = (reps || []).map((x) => ({ rep: x.rep, time: parseTime(x.time), done: x.done !== false }));
  const S = summarizeTimed(clean, dist, targetTime);
  const adj = targetTime > 0 ? nextBlockAdjustment(S, pct, dist) : null;
  return {
    mode: "distance",
    reps: clean,
    distancePerRep: dist || null,
    targetTime: targetTime > 0 ? Math.round(targetTime * 10) / 10 : null,
    actualDistance: S.total || 0,
    bestTime: S.bestTime != null ? Math.round(S.bestTime * 10) / 10 : null,
    meanTime: S.meanTime != null ? Math.round(S.meanTime * 10) / 10 : null,
    sdec: S.sdec,
    pctTarget: S.pctTarget,
    targetPerRep: dist || null,
    plannedPct: pct || null,
    ...(adj ? { nextFactor: adj.factor, nextPct: adj.newPct } : {}),
    rpe: Number(rpe),
    notes: notes || "",
  };
}

/* Facteur d'ajustement à partir d'un rapport réalisé / visé (AMRAP : distance réelle / distance visée),
   même règle que nextBlockAdjustment */
export function factorFromRatio(ratio) {
  if (!(ratio > 0)) return 1;
  if (ratio < END_ADJ.low) return Math.round(Math.max(END_ADJ.maxDown, ratio) * 1000) / 1000;
  if (ratio >= END_ADJ.high) return Math.round(Math.min(END_ADJ.maxUp, ratio) * 1000) / 1000;
  return 1;
}
