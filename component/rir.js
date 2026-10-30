/* rir.js — saisie muscu en « reps en réserve » (RIR), enregistrée en RPE = 10 − RIR.
   Échelle RPE basée sur les reps en réserve : Zourdos et al. 2016 (J Strength Cond Res 30:267) ;
   les athlètes estiment bien leurs reps en réserve près de l'échec (Hackett et al. 2012).
   « 5+ » = 5 reps en réserve ou plus → RPE 5 (série facile). Les calculs (e1RM, sRPE) restent en RPE. */
export const RIR_CHOICES = [0, 1, 2, 3, 4, 5]; // 5 = « 5+ »
export const rpeFromRir = (rir) => 10 - Math.min(5, Math.max(0, Number(rir)));
export const rirFromRpe = (rpe) => {
  if (rpe === null || rpe === undefined || rpe === "") return null;
  const v = Number(rpe);
  if (!(v >= 0)) return null;
  return Math.min(5, Math.max(0, 10 - v));
};
const fr = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
export const rirText = (rir) => (rir >= 5 ? "5+" : fr(rir));
/* « 2 en réserve (RPE 8) ». rir = valeur saisie avec les boutons (champ « rir » de la série).
   Sans rir (anciennes séries saisies au curseur, échelle de Foster) on n'invente pas de reps en réserve. */
export const rirLabel = (rpe, rir) => {
  const empty = rpe === null || rpe === undefined || rpe === "";
  if (rir === null || rir === undefined || rir === "") {
    return empty ? "reps en réserve : à choisir" : `RPE ${fr(Number(rpe))}/10`;
  }
  const r = Math.min(5, Math.max(0, Number(rir)));
  return `${rirText(r)} en réserve (RPE ${fr(rpeFromRir(r))})`;
};
