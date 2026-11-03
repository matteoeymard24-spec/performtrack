/* =====================================================================
   enduranceRecovery.js — NATURE DE LA RÉCUPÉRATION en endurance.

   Deux récups par exercice :
     • « rep »  : entre deux répétitions   → recoveryMin / recoverySec, recoveryType, recoveryVmaPct
     • « set »  : après la série (avant l'exercice suivant)
                                           → blockRecoveryMin / blockRecoverySec, blockRecoveryType, blockRecoveryPct
   Nature :
     • passive : arrêt complet (debout / assis)                    → 0 % dans le profil d'effort
     • walk    : marche                                           → compté comme récup passive (≈ 0 % VC)
     • active  : trot / footing lent à un % de la VMA ou de la VC   → ce % dans le profil d'effort
   Intérêt (Dupont et al. 2004, Med Sci Sports Exerc 36:302) : en intermittent court à haute intensité,
   la récup PASSIVE permet de tenir plus longtemps (temps limite plus long) que la récup ACTIVE
   (≈ 40-50 % VMA), qui garde la sollicitation aérobie élevée mais fatigue plus vite.
   Compatibilité : sans « type » enregistré, un % > 0 = active, sinon passive.
   ===================================================================== */

export const REC_TYPES = [
  { id: "passive", icon: "🧍", label: "Passive" },
  { id: "walk", icon: "🚶", label: "Marche" },
  { id: "active", icon: "🏃", label: "Active" },
];
export const REC_PRESETS = [40, 50, 60];
export const REC_DEFAULT_PCT = 50;

const keys = (which) =>
  which === "set"
    ? { min: "blockRecoveryMin", sec: "blockRecoverySec", type: "blockRecoveryType", pct: "blockRecoveryPct" }
    : { min: "recoveryMin", sec: "recoverySec", type: "recoveryType", pct: "recoveryVmaPct" };
export const recKeys = keys;

export const recSecOf = (ex, which = "rep") => {
  const k = keys(which);
  return (Number(ex?.[k.min]) || 0) * 60 + (Number(ex?.[k.sec]) || 0);
};
export const recTypeOf = (ex, which = "rep") => {
  const k = keys(which);
  const t = ex?.[k.type];
  if (REC_TYPES.some((r) => r.id === t)) return t;
  return Number(ex?.[k.pct]) > 0 ? "active" : "passive";
};
/* % (VMA ou VC, même référence que l'effort) utilisé pour la récup ; 0 si passive / marche */
export const recPctOf = (ex, which = "rep") => {
  if (recTypeOf(ex, which) !== "active") return 0;
  return Number(ex?.[keys(which).pct]) || REC_DEFAULT_PCT;
};

export const fmtRecDur = (sec) => {
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (!m) return `${r}"`;
  return r ? `${m}'${String(r).padStart(2, "0")}"` : `${m}'`;
};

/* Texte court : « 30" active à 50 % VMA (≈ 8,5 km/h) », « 2' passive », « 1' marche » ; null si pas de récup */
export function recText(ex, which = "rep", refKmh = null) {
  const sec = recSecOf(ex, which);
  if (!sec) return null;
  const t = recTypeOf(ex, which);
  if (t === "active") {
    const pct = recPctOf(ex, which);
    const ref = ex?.intensityRef === "cs" ? "VC" : "VMA";
    const kmh = refKmh ? ` (≈ ${((refKmh * pct) / 100).toFixed(1).replace(".", ",")} km/h)` : "";
    return `${fmtRecDur(sec)} active à ${pct} % ${ref}${kmh}`;
  }
  return `${fmtRecDur(sec)} ${t === "walk" ? "en marchant" : "passive"}`;
}

/* Libellé du segment dans le profil d'effort */
export const recSegLabel = (ex, which = "rep") => {
  const t = recTypeOf(ex, which);
  const base = which === "set" ? "Récup série" : "Récup";
  return t === "active" ? `${base} active` : t === "walk" ? `${base} (marche)` : `${base} passive`;
};
