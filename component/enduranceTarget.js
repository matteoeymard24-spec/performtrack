/* =====================================================================
   enduranceTarget.js — exercice d'endurance défini en TEMPS ou en DISTANCE.

   Deux façons de construire une rep :
   • « temps » (comme avant) : effort de X s à Y % de la VMA / VC → distance à parcourir.
       Option « navette (m) » : course en aller-retour sur N m → nombre de navettes à faire.
   • « distance » : distance fixée → CHRONO VISÉ à Y % de la référence.
       – ligne droite ou navettes de N m : « 400 m en navettes de 20 m » ;
       – parcours en aller-retours : « 20-40-60 » = 20 m aller-retour, puis 40 m A/R, puis 60 m A/R
         (Bronco / broken Bronco), répété « tours » fois par rep. Bronco = 5 tours de 20-40-60 = 1200 m.

   Demi-tours : chaque changement de direction à 180° fait perdre du temps (freiner, tourner, relancer).
   Règle pratique utilisée pour les courses en navette : ≈ 0,7 s perdue par demi-tour
   (correction de Buchheit pour individualiser les distances des intermittents en navette ;
   Buchheit & Laursen 2013, Sports Med 43:313). ESTIMATION : le coût réel dépend de la vitesse
   et de l'athlète.
     chrono visé = distance / vitesse cible + nb de demi-tours × 0,7 s
     distance en temps donné (navette N m) = vitesse × (temps − demi-tours × 0,7 s)
   « Passage sol » : comme avant, −12 % de distance en temps fixé, donc chrono ÷ 0,88 en distance fixée.
   ===================================================================== */

export const COD_SEC = 0.7;
export const GROUND_FACTOR = 0.88;
/* Vitesse de secours (km/h) pour estimer la durée d'effort quand aucune VMA n'est connue
   (durée de séance, frise des zones) — l'athlète, lui, voit son propre chrono. */
export const FALLBACK_VMA_KMH = 15;

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const isDistanceMode = (ex) => ex?.targetMode === "distance";

export const parseLegs = (s) =>
  String(s || "")
    .split(/[-–+/;,\s]+/)
    .map(num)
    .filter((x) => x > 0 && x < 1000);

/* Parcours d'une rep en mode distance : { dist (m), turns, label } ou null */
export function courseOf(ex) {
  if (!isDistanceMode(ex)) return null;
  const legs = parseLegs(ex.legs);
  if (legs.length) {
    const rounds = Math.max(1, Math.round(num(ex.rounds) || 1));
    const dist = 2 * legs.reduce((a, b) => a + b, 0) * rounds;
    const turns = 2 * legs.length * rounds - 1;
    return { dist, turns, label: `${rounds > 1 ? rounds + " tours de " : ""}${legs.join("-")} m aller-retour` };
  }
  const dist = num(ex.distanceM);
  if (!(dist > 0)) return null;
  const sh = num(ex.shuttleM);
  const turns = sh > 0 && sh < dist ? Math.ceil(dist / sh - 1e-9) - 1 : 0;
  return { dist, turns, label: sh > 0 && sh < dist ? `navettes de ${sh} m` : "ligne droite" };
}

/* Chrono visé (s) d'une rep en mode distance, à une vitesse (m/s) */
export function targetTimeSec(ex, speedMs) {
  const c = courseOf(ex);
  if (!c || !(speedMs > 0)) return null;
  const t = c.dist / speedMs + c.turns * COD_SEC;
  return ex.groundWork ? t / GROUND_FACTOR : t;
}

/* Distance à parcourir en un temps donné (mode temps), avec navette éventuelle */
export function distanceInTime(timeSec, speedMs, shuttleM) {
  const t = num(timeSec);
  if (!(t > 0) || !(speedMs > 0)) return null;
  const sh = num(shuttleM);
  if (!(sh > 0)) return { dist: speedMs * t, turns: 0, shuttles: null };
  let d = speedMs * t;
  for (let i = 0; i < 8; i++) {
    const turns = Math.max(0, Math.ceil(d / sh - 1e-9) - 1);
    d = Math.max(0, speedMs * (t - turns * COD_SEC));
  }
  const turns = Math.max(0, Math.ceil(d / sh - 1e-9) - 1);
  return { dist: d, turns, shuttles: d / sh };
}

/* Durée d'effort estimée (s) pour la durée de séance / la frise des zones */
export function estimatedEffortSec(ex, refKmh) {
  const kmh = refKmh > 0 ? refKmh : ex?.intensityRef === "cs" ? FALLBACK_VMA_KMH * 0.88 : FALLBACK_VMA_KMH;
  const speed = ((kmh * 1000) / 3600) * ((num(ex?.vmaPercentage) || 100) / 100);
  const t = targetTimeSec(ex, speed);
  return t ? Math.round(t) : null;
}

/* Temps « m:ss » ou « 1:02:03 » ou secondes → secondes */
export function parseTime(v) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((x) => parseFloat(x));
    if (parts.some((x) => !Number.isFinite(x))) return null;
    const sec = parts.reduce((a, x) => a * 60 + x, 0);
    return sec > 0 ? sec : null;
  }
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

/* Secondes → « 4:52 » (ou « 38,5 s » sous 1 min) */
export function fmtTime(sec) {
  if (!(sec > 0)) return "—";
  if (sec < 60) return `${String(Math.round(sec * 10) / 10).replace(".", ",")} s`;
  const r = Math.round(sec);
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  const s = r % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/* =====================================================================
   BLOCS EMOM / AMRAP en endurance.
   Un « tour » = les exercices du bloc enchaînés dans l'ordre. Pour chaque exercice :
     – défini en DISTANCE : distance fixe, durée = chrono visé ;
     – défini en TEMPS    : durée = effort (s), distance = mètres à faire à ce % (navettes déduites).
   EMOM  : départ toutes les I s pendant R tours → récup par tour = I − durée du tour
           (impossible si la durée du tour dépasse l'intervalle).
   AMRAP : durée totale T → tours visés = T / durée du tour ; distance visée = tours × distance du tour.
   metricsOf(ex) = métriques de l'exercice (chrono visé, distance) avec la référence de la personne.
   ===================================================================== */
export function timerBlockPlan(block, metricsOf) {
  const exs = block?.exercises || [];
  if (!exs.length || (block.timerMode !== "emom" && block.timerMode !== "amrap")) return null;
  let D = 0, T = 0, dOk = true, tOk = true, allDist = true;
  exs.forEach((ex) => {
    const m = metricsOf ? metricsOf(ex) : null;
    const c = courseOf(ex);
    if (c) {
      D += c.dist;
      if (m?.targetTime) T += Math.round(m.targetTime);
      else tOk = false;
    } else {
      allDist = false;
      const e = num(ex.effortTime);
      if (e > 0) T += e;
      else tOk = false;
      if (m?.distancePerRep) D += m.distancePerRep;
      else dOk = false;
    }
  });
  const plan = {
    mode: allDist ? "distance" : "time",
    timerMode: block.timerMode,
    roundDist: dOk && D > 0 ? Math.round(D) : null,
    // Chrono du tour arrondi à la SECONDE, une seule fois (même valeur que l'affichage de l'exercice)
    roundTime: tOk && T > 0 ? Math.round(T) : null,
    pct: num(exs[0]?.vmaPercentage) || null,
  };
  if (block.timerMode === "emom") {
    const I = num(block.timerIntervalSec) || 60;
    const R = Math.max(1, Math.round(num(block.timerRounds) || 10));
    plan.interval = I;
    plan.rounds = R;
    plan.restSec = plan.roundTime != null ? I - plan.roundTime : null;
    plan.impossible = plan.roundTime != null && plan.roundTime >= I;
    plan.totalDist = plan.roundDist != null ? plan.roundDist * R : null;
  } else {
    const total = num(block.timerIntervalSec) || 600;
    plan.total = total;
    plan.targetRounds = plan.roundTime ? Math.round((total / plan.roundTime) * 10) / 10 : null;
    plan.totalDist = plan.roundDist != null && plan.targetRounds != null ? Math.round(plan.roundDist * plan.targetRounds) : null;
  }
  return plan;
}

/* Plan avec un facteur d'ajustement (bloc précédent) : chrono ÷ f, distance × f */
export function adjustPlan(plan, factor) {
  if (!plan || !factor || factor === 1) return plan;
  const p = { ...plan, factor };
  if (p.mode === "distance") {
    if (p.roundTime) p.roundTime = Math.round(p.roundTime / factor);
  } else if (p.roundDist) p.roundDist = Math.round(p.roundDist * factor);
  if (p.timerMode === "emom") {
    p.restSec = p.roundTime != null ? p.interval - p.roundTime : null;
    p.impossible = p.roundTime != null && p.roundTime >= p.interval;
    p.totalDist = p.roundDist != null ? p.roundDist * p.rounds : null;
  } else {
    p.targetRounds = p.roundTime ? Math.round((p.total / p.roundTime) * 10) / 10 : null;
    p.totalDist = p.roundDist != null && p.targetRounds != null ? Math.round(p.roundDist * p.targetRounds) : null;
  }
  if (p.pct) p.pct = Math.round(p.pct * factor);
  return p;
}

/* Texte court du plan (construction + séance) */
export function planText(p) {
  if (!p) return "";
  const per = p.mode === "distance"
    ? `${p.roundDist ?? "?"} m en ${p.roundTime ? fmtTime(p.roundTime) : "? (VMA manquante)"}`
    : `${p.roundTime ? fmtTime(p.roundTime) : "?"} d'effort${p.roundDist ? ` ≈ ${p.roundDist} m` : ""}`;
  if (p.timerMode === "emom")
    return `Chaque tour : ${per}${p.restSec != null ? (p.impossible ? " — plus long que l'intervalle !" : ` → ${fmtTime(p.restSec)} de récup`) : ""} · ${p.rounds} tours${p.totalDist ? ` = ${p.totalDist} m` : ""}`;
  return `Un tour : ${per}${p.targetRounds ? ` → ≈ ${String(p.targetRounds).replace(".", ",")} tours visés en ${Math.round(p.total / 60)} min` : ""}${p.totalDist ? ` (≈ ${p.totalDist} m)` : ""}`;
}
