/* =====================================================================
   morphology.js — morphologie (poids, taille, masse maigre) par poste et par niveau.

   DONNÉES RÉELLES (saison 2026-27, fiches officielles LNR : top14.lnr.fr / prod2.lnr.fr)
   • Top 14 : 804 joueurs ; Pro D2 : 686 joueurs ; XV de France (Tournoi 2026) : 42 joueurs.
     Piliers et talonneurs séparés à partir des postes déclarés par les clubs.
   • Résultat clé : en haut, la masse bouge TRÈS PEU entre niveaux. Pro D2 ≈ Top 14 ≈ XV de France
     (écarts de 0 à 3 % selon le poste ; aux postes 10 et ailier, les joueurs de Pro D2 sont même un peu
     plus lourds). Ce sont les écarts AU SEIN d'un poste (écart-type 6 à 10 kg) qui sont grands.
   • Exemple demi de mêlée Top 14 : moyenne 80,6 kg, 75e centile 83, 90e centile 88, max 93.

   CONSTRUCTION
   • Bronze = moyenne du niveau ; argent = moyenne + 0,6 écart-type (≈ 75e-80e centile) ;
     or = moyenne + 1,4 écart-type (≈ 90e centile : très peu de joueurs au-dessus).
     → 9 international : ≈ 81 / 85 / 90 kg.
   • International = moyenne Top 14 + 1 % quand le XV de France est plus lourd que le Top 14 (sinon = Top 14).
     Quand Pro D2 ≥ Top 14 au poste : une seule moyenne « pro » pour Pro D2, Top 14 et International.
   • Niveaux amateurs = moyenne Pro D2 × rapport ESTIMÉ (aucune base de données publique en Fédérale) :
     écart plus marqué pour les avants que pour les arrières, et grand saut entre Nationale et Fédérale 1.
     Appuis : Fontana et al. 2015 (IJSPP 10:1003, Italie : divisions inférieures plus légères, plus grasses,
     plus hétérogènes) ; Sedeaud et al. 2013 (masse des internationaux français + 12 kg en 20 ans) ;
     revue 2026 (J Funct Morphol Kinesiol : avants amateurs ≈ 91 kg contre ≈ 116 kg en élite).
     L'écart-type est élargi de 10 % aux niveaux amateurs (populations plus hétérogènes).
   • Masse maigre = poids × (1 − % de masse grasse de référence DXA) : pros avants 17,8 %, arrières 14,8 %
     (Posthumus et al. 2020, Sports 8(6):85), + 0,5 à 4,5 points aux niveaux inférieurs (Fontana 2015).
   • Note /20 : moyenne du niveau = 10, argent = 15, or = 20, moyenne − 4 écarts-types = 0 (barème plus doux que les qualités physiques)
     (même logique que le reste de l'app : 10/20 = le standard du niveau).
   • Normalisation de la force (radar) : exposants de Crewther et al. 2009 (J Sports Sci 27:1575) ; masse de
     référence = moyenne du poste au niveau.
   ===================================================================== */
import { LEVELS } from "./rugbyLevels";

export const FORWARDS = ["PILIER", "TALON", "2L", "3L"];

/* Données LNR 2026-27 : [moyenne kg, écart-type kg, effectif] et taille moyenne (cm) */
export const PRO_DATA = {
  PILIER: { t14: [121.2, 9.8, 108], p2: [120.3, 10.0, 117], fr: [125.4, 8], h: { t14: 184.1, p2: 184.2, fr: 184.9 } },
  TALON: { t14: [107.1, 7.8, 57], p2: [106.1, 8.1, 60], fr: [110.3, 3], h: { t14: 181.6, p2: 181.5, fr: 182.7 } },
  "2L": { t14: [118.6, 9.6, 84], p2: [115.9, 7.5, 88], fr: [120.6, 5], h: { t14: 199.3, p2: 198.4, fr: 200.2 } },
  "3L": { t14: [107.3, 8.2, 129], p2: [105.2, 8.1, 134], fr: [105.9, 9], h: { t14: 191.5, p2: 189.4, fr: 193.3 } },
  "9": { t14: [80.6, 5.9, 45], p2: [79.8, 6.9, 54], fr: [83.7, 3], h: { t14: 174.9, p2: 175.1, fr: 178.0 } },
  "10": { t14: [85.5, 7.2, 40], p2: [86.6, 5.6, 58], fr: [79.5, 2], h: { t14: 182.6, p2: 181.8, fr: 183.0 } },
  Centre: { t14: [97.1, 7.0, 84], p2: [93.9, 7.7, 86], fr: [96.6, 5], h: { t14: 185.6, p2: 184.1, fr: 188.2 } },
  Ailier: { t14: [88.8, 8.1, 62], p2: [91.5, 8.7, 49], fr: [86.2, 5], h: { t14: 182.6, p2: 183.0, fr: 185.6 } },
  Arriere: { t14: [87.7, 6.5, 33], p2: [85.3, 7.8, 39], fr: [88.5, 2], h: { t14: 183.3, p2: 182.6, fr: 182.5 } },
};

/* Rapport à la moyenne Pro D2 (poids), avants / arrières — ESTIMATION (voir en-tête) */
export const MASS_RATIO = {
  nationale: { fw: 0.97, bk: 0.98 },
  espoirs: { fw: 0.92, bk: 0.94 },
  federale1: { fw: 0.93, bk: 0.95 },
  federale2: { fw: 0.9, bk: 0.93 },
  federale3: { fw: 0.87, bk: 0.91 },
  regionale: { fw: 0.84, bk: 0.89 },
  u18: { fw: 0.84, bk: 0.88 },
};
/* Taille : écart très faible entre niveaux (sélection précoce sur le gabarit) */
export const HEIGHT_RATIO = { nationale: 0.997, espoirs: 0.995, federale1: 0.992, federale2: 0.988, federale3: 0.984, regionale: 0.98, u18: 0.985 };
/* % de masse grasse de référence (DXA) ; ajouté aux niveaux inférieurs */
export const BF_DXA = { forwards: [17.8, 2.4], backs: [14.8, 1.2] };
export const BF_SKINFOLD = { forwards: 14.0, backs: 10.5 };
export const BF_ADD = { international: 0, top14: 0, prod2: 0, nationale: 0.5, espoirs: 1, federale1: 1.5, federale2: 2.5, federale3: 3.5, regionale: 4.5, u18: 1.5 };

export const SILVER_SD = 0.6;
export const GOLD_SD = 1.4;
const r1 = (x) => Math.round(x * 10) / 10;

const RED_O = "#d9695a";
export const hasMorph = (poste) => !!PRO_DATA[poste];

/* Moyenne / écart-type / taille du poste à un niveau (sans niveau : Pro D2) */
export function massRef(poste, levelId) {
  const d = PRO_DATA[poste];
  if (!d) return null;
  const fw = FORWARDS.includes(poste);
  const lvl = levelId || "prod2";
  const [mT, sdT, nT] = d.t14;
  const [mP, sdP, nP] = d.p2;
  const pooled = mP >= mT ? (mT * nT + mP * nP) / (nT + nP) : null; // Pro D2 ≥ Top 14 → une seule moyenne pro
  const sdPro = (sdT * nT + sdP * nP) / (nT + nP);
  const top14 = pooled ?? mT;
  const prod2 = pooled ?? mP;
  const intl = pooled ?? (d.fr[0] > mT ? mT * 1.01 : mT);
  let m, sd, h, src;
  if (lvl === "international") {
    m = intl; sd = sdPro; h = Math.max(d.h.t14, (d.h.t14 + d.h.fr) / 2);
    src = pooled ? "LNR 2026-27 : moyenne pro (Pro D2 ≥ Top 14 à ce poste)" : d.fr[0] > mT ? "LNR 2026-27 : Top 14 + 1 % (XV de France plus lourd)" : "LNR 2026-27 : = Top 14 (XV de France pas plus lourd)";
  } else if (lvl === "top14") {
    m = top14; sd = sdPro; h = d.h.t14;
    src = pooled ? "LNR 2026-27 : moyenne pro (Top 14 + Pro D2)" : `LNR 2026-27 : ${nT} joueurs de Top 14`;
  } else if (lvl === "prod2") {
    m = prod2; sd = sdPro; h = d.h.p2;
    src = pooled ? "LNR 2026-27 : moyenne pro (Top 14 + Pro D2)" : `LNR 2026-27 : ${nP} joueurs de Pro D2`;
  } else {
    const k = MASS_RATIO[lvl] ? MASS_RATIO[lvl][fw ? "fw" : "bk"] : 1;
    m = prod2 * k; sd = sdPro * k * 1.1; h = d.h.p2 * (HEIGHT_RATIO[lvl] || 1);
    src = `Estimé : moyenne Pro D2 × ${String(k).replace(".", ",")}`;
  }
  const bfPct = (fw ? BF_DXA.forwards[0] : BF_DXA.backs[0]) + (BF_ADD[lvl] || 0);
  return { m, sd, h, bfPct, src, est: !!LEVELS.find((l) => l.id === lvl)?.est };
}

/* Bronze / argent / or du poste au niveau : poids, masse maigre, taille */
export function medalTargets(poste, levelId) {
  const R = massRef(poste, levelId);
  if (!R) return null;
  const lean = 1 - R.bfPct / 100;
  const bm = { bronze: r1(R.m), silver: r1(R.m + SILVER_SD * R.sd), gold: r1(R.m + GOLD_SD * R.sd) };
  const ffm = { bronze: r1(bm.bronze * lean), silver: r1(bm.silver * lean), gold: r1(bm.gold * lean) };
  return { bm, ffm, h: Math.round(R.h), sd: r1(R.sd), bfPct: r1(R.bfPct), src: R.src, est: R.est };
}

/* Compatibilité : « cible » du poste = l'argent */
export function morphTargets(poste, levelId) {
  const t = medalTargets(poste, levelId);
  return t ? { bm: t.bm.silver, ffm: t.ffm.silver } : null;
}

/* Masse de référence pour ramener la force au poids (radar) = moyenne du poste au niveau */
export const refMassFor = (poste, levelId) => {
  const R = massRef(poste, levelId);
  return R ? R.m : null;
};

/* Note /20 de la masse : moyenne − 4 écarts-types = 0, moyenne = 10, argent = 15, or = 20 (plafonnée à 20).
   Barème plus doux sous la moyenne que celui des qualités physiques (− 2 ET = 0) : la masse est de
   l'anthropométrie (gabarit, génétique, âge), pas une qualité qui se travaille au même rythme ;
   un athlète plus léger que la moyenne du poste ne doit pas « s'effondrer » sur le radar. */
export const MASS_ZERO_SD = 4;
function noteOf(value, mean, sd) {
  if (!(sd > 0)) return null;
  const z = (value - mean) / sd;
  let n;
  if (z <= 0) n = 10 + (10 / MASS_ZERO_SD) * z;
  else if (z <= SILVER_SD) n = 10 + (5 * z) / SILVER_SD;
  else n = 15 + (5 * (z - SILVER_SD)) / (GOLD_SD - SILVER_SD);
  return Math.max(0, Math.min(20, n));
}

/* Masse grasse de référence du poste au niveau, selon la méthode de mesure (les plis cutanés donnent
   des valeurs plus basses que la DXA) + marge tolérée avant pénalité (≈ 1 écart-type DXA, plis : 3 points). */
export function bfReference(poste, levelId, method = "dxa") {
  const R = massRef(poste, levelId);
  if (!R) return null;
  const fw = FORWARDS.includes(poste);
  if (method === "dxa") return { ref: r1(R.bfPct), tol: fw ? BF_DXA.forwards[1] : Math.max(2, BF_DXA.backs[1]), method };
  // impédancemètre : valeurs proches de la DXA en moyenne mais bien moins précises → marge plus large
  if (method === "impedance") return { ref: r1(R.bfPct), tol: fw ? 4 : 3, method };
  const lvl = LEVELS.find((l) => l.id === levelId) ? levelId : "prod2";
  return { ref: r1((fw ? BF_SKINFOLD.forwards : BF_SKINFOLD.backs) + (BF_ADD[lvl] || 0)), tol: 3, method };
}
export const FAT_PENALTY_PER_PT = 0.8; // points /20 retirés par point de % de gras au-delà de la marge
export const FAT_PENALTY_MAX = 8;

/* Évalue la morphologie. bw en kg, bf en % (optionnel), method "dxa" | "plis"… Note /20 de l'axe « Masse » + détails.
   Avec le % de gras : note sur la MASSE MAIGRE, moins une pénalité si le gras dépasse la référence du poste
   (un pilier lourd mais trop gras n'est pas « dans les standards ») ; orientation prise de masse / recomposition /
   perte de poids / maintien. */
export function evaluateMorph(poste, levelId, bw, bf, method = "dxa") {
  const R = massRef(poste, levelId);
  if (!R || !(bw > 0)) return null;
  const hasBf = bf > 0 && bf < 60;
  const ffm = hasBf ? bw * (1 - bf / 100) : null;
  const lean = 1 - R.bfPct / 100;
  const nBm = noteOf(bw, R.m, R.sd);
  const nFfm = ffm != null ? noteOf(ffm, R.m * lean, R.sd * lean) : null;
  const B = bfReference(poste, levelId, method);
  const fatExcess = hasBf && B ? r1(bf - B.ref) : null;
  const fatPenalty = fatExcess != null && fatExcess > B.tol ? Math.min(FAT_PENALTY_MAX, (fatExcess - B.tol) * FAT_PENALTY_PER_PT) : 0;
  const note = r1(Math.max(0, (nFfm != null ? nFfm : nBm) - fatPenalty));
  const t = medalTargets(poste, levelId);
  const medal = (v, set) => (v >= set.gold ? "gold" : v >= set.silver ? "silver" : v >= set.bronze ? "bronze" : null);

  /* Orientation */
  let orientation;
  const fatHigh = fatExcess != null && fatExcess > B.tol;
  if (hasBf) {
    // cible : au moins la masse maigre de l'argent du poste, avec le % de gras de référence
    const tFfm = Math.max(ffm, t.ffm.silver);
    const tBw = tFfm / (1 - B.ref / 100);
    const muscle = r1(tFfm - ffm); // kg de masse maigre à gagner
    const fatNow = bw - ffm;
    const fatLose = r1(Math.max(0, fatNow - (tBw - tFfm))); // kg de gras à perdre
    const net = r1(tBw - bw); // variation de poids visée
    const tgt = `objectif ≈ ${r1(tBw)} kg à ${B.ref} % de gras`;
    if (!fatHigh && muscle <= 0.5)
      orientation = { id: "maintien", label: "Maintien", color: "#4fae7d", text: `Masse maigre au standard du poste et gras dans la norme (${bf} % pour ${B.ref} % de référence) : garder ce gabarit.` };
    else if (!fatHigh)
      orientation = { id: "prise", label: "Prise de masse", color: "#5b9bd5", kg: muscle, text: `Gras correct (${bf} %), masse maigre sous le standard : ≈ ${muscle} kg de muscle à gagner pour l'argent du poste (${t.ffm.silver} kg de masse maigre). Bloc d'hypertrophie + léger surplus calorique.` };
    else if (muscle <= 0.5)
      orientation = { id: "perte", label: "Perte de poids", color: RED_O, kg: fatLose, text: `Masse maigre au standard, mais trop de gras (${bf} % pour ${B.ref} % de référence) : ≈ ${fatLose} kg de gras à perdre (${tgt}) en gardant le muscle. Déficit modéré, muscu maintenue.` };
    else if (fatLose < 1)
      orientation = { id: "prise", label: "Prise de masse (propre)", color: "#5b9bd5", kg: muscle, text: `Gras un peu au-dessus de la référence (${bf} % pour ${B.ref} %), mais le vrai manque est le muscle : ≈ ${muscle} kg de masse maigre à gagner (${tgt}). Prendre du muscle SANS ajouter de gras : surplus calorique léger, muscu lourde, protéines élevées, suivre le % de gras.` };
    else if (net <= -2)
      orientation = { id: "perte", label: "Perte de poids", color: RED_O, kg: -net, text: `Trop de gras (${bf} % pour ${B.ref} % de référence) et masse maigre sous le standard : ≈ ${fatLose} kg de gras à perdre et ≈ ${muscle} kg de muscle à gagner, soit ≈ ${-net} kg de moins sur la balance (${tgt}). Léger déficit, muscu lourde, protéines élevées.` };
    else
      orientation = { id: "recompo", label: net >= 2 ? "Recomposition (+ muscle)" : "Recomposition", color: "#d9a441", kg: muscle, text: `Trop de gras (${bf} % pour ${B.ref} % de référence) et masse maigre sous le standard : ≈ ${fatLose} kg de gras à perdre et ≈ ${muscle} kg de muscle à gagner (${tgt}, ${net >= 0 ? "+" : ""}${net} kg). Muscu lourde, calories à l'équilibre, protéines élevées.` };
  } else {
    const gap = r1(t.bm.silver - bw);
    orientation =
      gap > 0
        ? { id: "prise", label: "Prise de masse ?", color: "#5b9bd5", kg: gap, text: `${gap} kg sous l'argent du poste (${t.bm.silver} kg). Renseigne le % de masse grasse : sans lui, impossible de savoir s'il faut du muscle ou si le poids est déjà trop gras.` }
        : { id: "inconnu", label: "À préciser", color: "#a8a199", text: `Poids au standard du poste, mais sans % de masse grasse on ne sait pas si c'est du muscle ou du gras : renseigne-le pour une note et une orientation fiables.` };
  }

  // poids cible : masse maigre de l'argent du poste au % de gras de référence (avec le % de gras), sinon l'argent du poste
  const targetBw = hasBf && B ? r1(Math.max(ffm, t.ffm.silver) / (1 - B.ref / 100)) : orientation.id === "prise" ? t.bm.silver : null;
  orientation = { ...orientation, targetBw, text: orientation.text.replace(/(\d)\.(\d)/g, "$1,$2") }; // décimales à la française
  return {
    note,
    basis: nFfm != null ? "masse maigre" : "poids du corps",
    noteBm: r1(nBm),
    noteFfm: nFfm != null ? r1(nFfm) : null,
    bw,
    ffm: ffm != null ? r1(ffm) : null,
    fatKg: ffm != null ? r1(bw - ffm) : null,
    bfRef: B ? B.ref : null,
    bfTol: B ? B.tol : null,
    fatExcess,
    fatPenalty: r1(fatPenalty),
    orientation,
    target: { bm: t.bm.silver, ffm: t.ffm.silver },
    medals: t,
    medal: ffm != null ? medal(ffm, t.ffm) : medal(bw, t.bm),
    gapBm: r1(t.bm.silver - bw),
    gapFfm: ffm != null ? r1(t.ffm.silver - ffm) : null,
  };
}

/* Orientation du bilan → objectif nutritionnel (GOALS de nutritionData.js) : { goal, rate (kg/sem), targetWeight } */
export function nutritionGoalFor(orientation) {
  if (!orientation) return null;
  const tw = orientation.targetBw || null;
  if (orientation.id === "perte") return { goal: "seche", rate: (orientation.kg || 0) >= 6 ? 0.5 : 0.25, targetWeight: tw };
  if (orientation.id === "prise") return { goal: "prise", rate: 0.25, targetWeight: tw };
  if (orientation.id === "recompo") return { goal: "recompo", rate: 0, targetWeight: tw };
  if (orientation.id === "maintien") return { goal: "maintien", rate: 0, targetWeight: null };
  return null;
}

