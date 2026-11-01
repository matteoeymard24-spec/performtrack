/* =====================================================================
   loadAdjust.js — musculation : RIR VISÉ et AJUSTEMENT DE LA CHARGE.

   1) RIR visé à partir de la prescription (%RM × reps) :
      reps max possibles à ce % (table RPE ↔ %1RM, Zourdos et al. 2016 ; Helms et al. 2016,
      Strength Cond J 38:42) − reps prévues = reps en réserve visées.
      Ex. 75 % du RM → ~10 reps max ; 6 reps prévues → ~4 en réserve (RPE 6).
      Si les reps prévues dépassent le max possible, la prescription est irréaliste (signalé).

   2) Charge de la série suivante (méthode RPE/RTS, « e1RM du jour ») :
      chaque série remplie (charge, reps, reps en réserve) donne un RM estimé du jour
      e1RM = charge / %1RM(reps + RIR) ; la charge conseillée pour la série suivante est
      e1RM × %1RM(reps prévues + RIR visé). Arrondi à 1 kg, variation limitée à ± 10 % par série.
      Si la série était plus dure que prévu → la charge baisse ; plus facile → elle monte.

   3) Perte (fatigue) d'une série à l'autre : baisse de l'e1RM du jour par rapport à la 1re série,
      en % (même idée que la perte de vitesse en sprint). Repères pratiques : ≤ 5 % = stable,
      5-10 % = fatigue qui s'installe, > 10 % = fatigue nette (arrêter / alléger).
      ESTIMATION : le RIR déclaré a une erreur d'≈ 1 rep, plus grande loin de l'échec
      (Zourdos 2016 ; Halperin et al. 2022, Sports Med 52:377). Seules les séries ≤ 12 reps à l'échec
      théorique et RIR ≤ 4 servent au calcul.
   ===================================================================== */
import { maxRepsAtPct, pct1RMFromRepsRpe, e1rmFromSet } from "./loadMetrics";
import { isSpecialContraction } from "./contraction";

/* UNILATÉRAL (10 reps « par côté ») :
   • Le RIR se compte PAR CÔTÉ, pas sur le total : 10 reps par jambe = chaque jambe fait 10 reps et se
     rapproche de SON échec ; le RM de référence est aussi un RM par côté (charge d'un seul côté).
     Compter 20 reps serait faux (on prédirait l'échec bien trop tôt).
   • Mais à % égal de son RM unilatéral, on fait MOINS de reps par côté qu'en bilatéral :
     Costa et al. 2015, Biology of Sport 32:35 (leg extension, 50 % du RM jusqu'à l'échec, 3 séries) :
     ≈ 42 reps au total en unilatéral contre ≈ 49 en bilatéral (−14 %), RPE identique — plus de
     stabilisation, pas de « partage » de l'effort entre les deux membres, et le côté qui attend
     n'est pas totalement reposé quand on enchaîne les côtés.
   • Correction appliquée (ESTIMATION, une seule étude, sur machine) : reps max par côté =
     1 + (reps max bilatérales − 1) × 0,86. Ex. 70 % × 10/côté : bilatéral ≈ 11 reps max → RIR 1 ;
     unilatéral ≈ 10 reps max → RIR 0 (série à l'échec). */
export const UNI_FACTOR = 0.86;
const uniMax = (mx, uni) => (uni ? 1 + (mx - 1) * UNI_FACTOR : mx);
const uniToBilat = (n, uni) => (uni ? 1 + (n - 1) / UNI_FACTOR : n);

export const LOSS_WARN = 5;
export const LOSS_STOP = 10;

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/* Reps prévues (prend le 1er nombre : "8-10" → 8 ; "8/côté" → 8) */
export const plannedReps = (reps) => {
  const m = String(reps ?? "").match(/\d+(?:[.,]\d+)?/);
  return m ? num(m[0]) : null;
};

/* RIR visé (arrondi à 0,5) pour un %RM et des reps prévues. null si % non chiffré (PDC, élastique). */
export function targetRir(pct, reps, uni = false) {
  const p = num(pct);
  const r = plannedReps(reps);
  if (!(p > 0) || !(r > 0)) return null;
  const mx0 = maxRepsAtPct(p);
  if (mx0 == null) return null;
  const mx = uniMax(mx0, uni); // reps max PAR CÔTÉ en unilatéral
  const raw = mx - r;
  // Nombre ENTIER (l'athlète ne peut pas viser « 2,5 reps en réserve ») : arrondi au plus proche, et
  // les demis vers le HAUT (2,5 → 3) : un peu plus de marge, plus prudent, et les athlètes ont tendance
  // à sous-estimer leurs reps en réserve loin de l'échec.
  const rir = Math.min(5, Math.max(0, Math.floor(raw + 0.5)));
  return {
    rir,
    rpe: 10 - rir,
    maxReps: Math.round(mx * 10) / 10,
    impossible: raw < -0.5, // plus de reps prévues que le maximum possible à ce %
    uni: !!uni,
  };
}

/* RM estimé du jour d'une série (null si non exploitable) */
export function setE1rm(serie, uni = false) {
  const w = num(serie?.actualWeight);
  // unilatéral : reps du côté le plus faible (D / G)
  const rR = num(serie?.actualRepsR);
  const rL = num(serie?.actualRepsL);
  const r = rR != null && rL != null ? Math.min(rR, rL) : num(serie?.actualReps);
  const rir = serie?.rir != null && serie.rir !== "" ? Number(serie.rir) : null;
  if (!(w > 0) || !(r > 0) || rir == null || rir > 4) return null;
  if (!uni) return e1rmFromSet(w, r, 10 - rir);
  const pct = pct1RMFromRepsRpe(uniToBilat(r + rir, true), 10); // reps à l'échec par côté → équivalent table
  return pct ? w / pct : null;
}

/* Charge conseillée pour atteindre (reps prévues, RIR visé) à partir d'un e1RM */
export function weightFor(e1rm, reps, rir, uni = false) {
  const r = plannedReps(reps);
  if (!(e1rm > 0) || !(r > 0) || rir == null) return null;
  const n = r + Math.min(4, Math.max(0, rir)); // reps à l'échec visées (par côté en unilatéral)
  const pct = pct1RMFromRepsRpe(uniToBilat(n, uni), 10);
  return pct ? e1rm * pct : null;
}

/* Analyse des séries remplies : e1RM par série, perte vs 1re série, charge conseillée pour la série
   suivante et pour la prochaine séance au même schéma. */
// bw : poids du corps à AJOUTER à la charge saisie (tractions lestées : charge totale = PDC + lest) ;
// les charges conseillées sont alors rendues en LEST (total − bw).
export function analyzeSets(series, exercise, uni = false, bw = 0) {
  // Excentrique supramax / isométrie : pas d'e1RM ni de charge conseillée (table valable en concentrique seulement)
  if (isSpecialContraction(exercise)) return { target: null, rows: (series || []).map((s) => ({ e1rm: null, loss: null, next: null, weight: num(s.actualWeight) })), maxLoss: null, nextSession: null, special: true };
  const tgt = targetRir(exercise?.rmPercent, exercise?.reps, uni);
  const add = bw > 0 ? Number(bw) : 0;
  const rows = (series || []).map((s) => {
    const lest = num(s.actualWeight);
    const tot = add ? (lest ?? 0) + add : lest;
    return { e1rm: setE1rm({ ...s, actualWeight: tot }, uni), weight: tot, lest, reps: num(s.actualReps), rir: s.rir };
  });
  const firstIdx = rows.findIndex((x) => x.e1rm);
  const first = firstIdx >= 0 ? rows[firstIdx].e1rm : null;
  const out = rows.map((x, i) => {
    const loss = x.e1rm && first && i > firstIdx ? Math.round(((first - x.e1rm) / first) * 1000) / 10 : null;
    let next = null;
    if (x.e1rm && tgt && x.weight > 0) {
      const w = weightFor(x.e1rm, exercise?.reps, tgt.rir, uni);
      if (w) {
        const capped = Math.min(x.weight * 1.1, Math.max(x.weight * 0.9, w));
        next = Math.round(capped - add); // en lest pour les tractions
      }
    }
    return { ...x, loss, next };
  });
  const valid = out.filter((x) => x.e1rm);
  const lastE1 = valid.length ? valid[valid.length - 1].e1rm : null;
  const ns = lastE1 && tgt ? weightFor(Math.max(...valid.map((x) => x.e1rm)), exercise?.reps, tgt.rir, uni) : null;
  const nextSession = ns ? Math.round(ns - add) : null; // en lest pour les tractions
  const maxLoss = out.reduce((m, x) => (x.loss != null && x.loss > m ? x.loss : m), 0);
  // rows[i].weight = charge TOTALE ; on rend aussi la charge saisie (lest) pour comparer avec « next »
  return { target: tgt, rows: out.map((x) => ({ ...x, weight: add ? x.lest ?? 0 : x.weight })), maxLoss: valid.length >= 2 ? maxLoss : null, nextSession };
}

export const fr = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
export const rirTxt = (r) => (r >= 5 ? "5+" : String(Math.round(r)));
