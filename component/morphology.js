/* =====================================================================
   morphology.js — morphologie (masse, masse maigre, masse grasse) par poste et par niveau.

   SOURCES
   • Standards de poids du corps et de masse maigre (FFM) PAR POSTE : document « USA Rugby Player Profiles and
     Performance Standards » (tableaux « Standards - Body Weight » et « Standards - Fat Free Mass »).
     Notes USA : poids 2 à 8 (8 = vert = cible) ; masse maigre 2 à 10 (10 = or). Note /20 de l'app = 2 × note USA
     (cible verte = 16 / 20, or = 20 / 20).
   • Poids de référence par poste utilisés pour ramener la force au poids : ceux du tableau « Standards - Squat »
     du même document (prop 125, talonneur 115, 2e ligne 110, 3e ligne 110, 9 85, 10 90, centre 105, ailier 95, arrière 95).
   • Normalisation de la force : exposants dérivés chez des joueurs élite de rugby union — Crewther et al. 2009, J Sports Sci
     27(14):1575-80 : box squat 0,33 ± 0,31 ; développé couché 0,45 ± 0,30 ; bench throw 0,46 ± 0,36 ; squat jump 0,64 ± 0,31 ;
     exposant théorique 0,67 (Jaric 2002). Le ratio simple (÷ masse) avantage les légers (Crewther 2009, 2011, 2012).
   • Masse grasse : Posthumus et al. 2020 (Sports 8(6):85), pros, DXA : avants 17,8 ± 2,4 %, arrières 14,8 ± 1,2 %.
     Les plis cutanés donnent des valeurs plus basses (≈ 14,0 % avants / 10,5 % arrières en élite, revue J Funct Morphol
     Kinesiol 2026) : la méthode de mesure change beaucoup le chiffre.
   • Niveau : les standards USA sont des standards de haut niveau. Pour les niveaux inférieurs on multiplie les seuils
     de masse par le coefficient f du niveau (LEVELS). ESTIMATION cohérente avec la revue 2026 (avants amateurs ≈ 91 kg
     contre ≈ 116 kg en élite, soit ≈ 0,78), pas une mesure poste par poste.
   ===================================================================== */
import { LEVELS } from "./rugbyLevels";

export const REF_MASS = { PILIER: 125, TALON: 115, "2L": 110, "3L": 110, "9": 85, "10": 90, Centre: 105, Ailier: 95, Arriere: 95 };

/* points [valeur kg → note USA], note la plus haute en premier */
const BM = {
  PILIER: [[117, 8], [115, 6], [112, 5], [110, 4], [108, 3], [106, 2]],
  TALON: [[108, 8], [105, 6], [104, 5], [103, 4], [102, 3], [101, 2]],
  "2L": [[117, 8], [115, 6], [112, 5], [110, 4], [108, 3], [106, 2]],
  "3L": [[106, 8], [102, 6], [100, 5], [98, 4], [96, 3], [94, 2]],
  "9": [[92, 8], [88, 6], [86, 5], [84, 4], [82, 3], [80, 2]],
  "10": [[92, 8], [88, 6], [86, 5], [84, 4], [82, 3], [80, 2]],
  Centre: [[102.5, 8], [97.5, 6], [95, 5], [92.5, 4], [90, 3], [87.5, 2]],
  Ailier: [[100, 8], [95, 6], [92.5, 5], [90, 4], [87.5, 3], [85, 2]],
  Arriere: [[100, 8], [95, 6], [92.5, 5], [90, 4], [87.5, 3], [85, 2]],
};
const FFM = {
  PILIER: [[102, 10], [99, 8], [91, 4], [89, 3], [87, 2]],
  TALON: [[100, 10], [97, 8], [90, 4], [88, 3], [86, 2]],
  "2L": [[105, 10], [102, 8], [94, 4], [92, 3], [90, 2]],
  "3L": [[100, 10], [96, 8], [84, 4], [81, 3], [79, 2]],
  "9": [[87, 10], [84, 8], [76, 4], [74, 3], [72, 2]],
  "10": [[87, 10], [84, 8], [76, 4], [74, 3], [72, 2]],
  Centre: [[100, 10], [96, 8], [84, 4], [81, 3], [79, 2]],
  Ailier: [[92, 10], [89, 8], [78, 4], [75, 3], [72, 2]],
  Arriere: [[92, 10], [89, 8], [78, 4], [75, 3], [72, 2]],
};

/* Coefficient de niveau appliqué aux seuils de masse (1 pour Pro D2 et au-dessus, ou sans niveau) */
export const massLevelFactor = (levelId) => {
  const l = LEVELS.find((x) => x.id === levelId);
  return l && l.f ? l.f : 1;
};

/* Note USA (0 à max) par interpolation linéaire entre les points ; extrapolation vers 0 sous le plus bas point */
function interp(points, value, factor) {
  const pts = points.map(([v, s]) => [v * factor, s]); // valeurs décroissantes
  if (value >= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [v1, s1] = pts[i];
    const [v2, s2] = pts[i + 1];
    if (value >= v2) return s2 + ((value - v2) / (v1 - v2)) * (s1 - s2);
  }
  const [vl, sl] = pts[pts.length - 1];
  const [vp, sp] = pts[pts.length - 2];
  const slope = (sp - sl) / (vp - vl); // points de note par kg
  return Math.max(0, sl - (vl - value) * slope);
}

export const hasMorph = (poste) => !!BM[poste];

/* Standard « vert » (cible) du poste au niveau donné : poids et masse maigre */
export function morphTargets(poste, levelId) {
  const f = massLevelFactor(levelId);
  if (!BM[poste]) return null;
  return { bm: Math.round(BM[poste][0][0] * f * 10) / 10, ffm: Math.round(FFM[poste][1][0] * f * 10) / 10, f };
}

/* Évalue la morphologie. bw en kg, bf en % (optionnel). Retourne la note /20 de l'axe « Masse » + détails */
export function evaluateMorph(poste, levelId, bw, bf) {
  if (!BM[poste] || !(bw > 0)) return null;
  const f = massLevelFactor(levelId);
  const ffm = bf > 0 && bf < 60 ? bw * (1 - bf / 100) : null;
  const sBm = Math.min(8, interp(BM[poste], bw, f));
  const sFfm = ffm != null ? interp(FFM[poste], ffm, f) : null;
  const note = Math.round((sFfm != null ? sFfm : sBm) * 2 * 10) / 10;
  const t = morphTargets(poste, levelId);
  return {
    note,
    basis: sFfm != null ? "masse maigre" : "poids du corps",
    noteBm: Math.round(sBm * 2 * 10) / 10,
    noteFfm: sFfm != null ? Math.round(sFfm * 2 * 10) / 10 : null,
    bw,
    ffm: ffm != null ? Math.round(ffm * 10) / 10 : null,
    fatKg: ffm != null ? Math.round((bw - ffm) * 10) / 10 : null,
    target: t,
    gapBm: Math.round((t.bm - bw) * 10) / 10,
    gapFfm: ffm != null ? Math.round((t.ffm - ffm) * 10) / 10 : null,
  };
}

/* Profils d'un même poste : « athlétique » (plus mobile, plus léger) et « momentum » (plus de masse, plus de poids
   dans les collisions). AUCUNE norme publiée ne sépare ces profils : écart ESTIMÉ de ± 4 % sur le poids et la masse
   maigre du standard du poste (à corriger si tu as des données de club). */
export const PROFILE_FACTOR = { athletique: 0.96, standard: 1, momentum: 1.04 };
export const profileTargets = (poste, levelId) => {
  const t = morphTargets(poste, levelId);
  if (!t) return null;
  const r1 = (x) => Math.round(x * 10) / 10;
  const out = {};
  Object.entries(PROFILE_FACTOR).forEach(([k, f]) => {
    out[k] = { bm: r1(t.bm * f), ffm: r1(t.ffm * f) };
  });
  return out;
};

export const FORWARDS = ["PILIER", "TALON", "2L", "3L"];

/* Références de masse grasse (%) : [moyenne, écart-type] — DXA pros (Posthumus 2020) */
export const BF_DXA = { forwards: [17.8, 2.4], backs: [14.8, 1.2] };
/* Plis cutanés, élite (valeurs moyennes citées dans la revue 2026) */
export const BF_SKINFOLD = { forwards: 14.0, backs: 10.5 };
