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
    return { dist, turns, label: `${rounds > 1 ? rounds + " × " : ""}(${legs.join("-")} m aller-retour)` };
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
