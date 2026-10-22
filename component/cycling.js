/* =====================================================================
   cycling.js — standards et notes /20 pour le CYCLISME SUR ROUTE (radar des qualités).

   SOURCES (rien n'est caché)
   • Puissance maximale par durée, coureurs professionnels : Valenzuela et al. 2022, Int J Sports Physiol Perform
     17(5):701-710 (144 coureurs pros WorldTour / ProTeam, 8 saisons). Médiane (P50) et écart interdécile (P10-P90)
     relevés dans un tableau relayé par le site the-scientists-notebook.com (je n'ai pas pu ouvrir l'article complet) :
       5 s 17,99 W/kg (P10 15,71 · P90 20,83) · 1 min 10,10 (8,87 · 11,33) · 5 min 7,06 (6,52 · 7,65) · 20 min 6,03 (5,47 · 6,59).
     Écart-type estimé = (P90 − P10) / 2,563 (loi normale).
   • Coureurs pros / U23 / juniors : Alejo et al. 2022, Front Physiol 13:945552 (14 pros, 24 U23, 13 juniors) : VO2max
     relative 82,6 / 79,8 / 74,5 ml/kg/min ; puissance au seuil RCP 6,34 / 6,10 / 5,59 W/kg ; squat 1RM (machine guidée,
     1RM estimé par les auteurs) 93,3 / 87,2 / 81,4 kg pour 66,6 / 65,6 / 61,9 kg de poids du corps, soit 1,40 / 1,33 / 1,32 × poids.
   • Niveaux amateurs : percentiles des hommes utilisateurs de capteurs de puissance, Cycling Analytics 2018 (population
     auto-sélectionnée, pas un niveau de course) : P90 / P80 / P50.
   • VO2max estimée d'après la puissance sur 5 min : VO2max = 16,6 + 8,87 × W/kg (test de 5 min en cyclisme sur route,
     Int J Sports Physiol Perform 2021, PMID 34225254).

   • FEMMES : puissances des professionnelles = Mateo-March et al. 2022, Int J Sports Physiol Perform (44 coureuses pros,
     PMID 35168197) : P50 5 s 15,3 · 1 min 8,4 · 5 min 5,8 · 20 min 5,0 W/kg ; P10 13,1 / 7,3 / 5,1 / 4,3 ; P90 17,2 / 9,4 / 6,5 / 5,5.
     Niveaux amateurs : percentiles des utilisatrices de capteurs de puissance (Cycling Analytics 2018) : P90 / P80 / P50.
     Force : seul repère = cyclistes féminines compétitives (Frontiers 2021, 586113) : squat 1RM estimé 48-54 kg pour ≈ 58 kg, soit 0,83-0,93 × poids.

   CE QUI EST UNE ESTIMATION DE MA PART
   • Élite/U23 = niveau pro × 0,962 (rapport des puissances au seuil RCP U23 / pro, Alejo 2022), appliqué à toutes les durées.
   • VO2max des niveaux amateurs = équation ci-dessus appliquée à leur puissance sur 5 min.
   • Force : aucune étude ne donne de repère de force relative pour les amateurs ; on reprend la valeur U23.
   • L'écart-type de chaque niveau = même coefficient de variation que les pros.
   • Les priorités par type de coureur sont un avis indicatif (Valenzuela 2022 montre seulement que les sprinteurs ont
     les puissances 5-30 s les plus élevées et les leaders de classement général les plus hautes sur effort long).
   ===================================================================== */

export const CYCLING_LEVELS = [
  { id: "c_pro", label: "Pro (WorldTour / ProTeam)" },
  { id: "c_u23", label: "Élite / U23" },
  { id: "c_comp", label: "Compétiteur amateur" },
  { id: "c_sport", label: "Cyclosportif" },
  { id: "c_loisir", label: "Loisir régulier" },
];
export const isCyclingLevel = (id) => CYCLING_LEVELS.some((l) => l.id === id);

/* « Postes » du cyclisme : profils de coureur (typologies de Valenzuela 2022) */
export const CYCLING_TYPES = [
  { key: "polyvalent", label: "Polyvalent / rouleur-puncheur" },
  { key: "sprinteur", label: "Sprinteur" },
  { key: "grimpeur", label: "Grimpeur" },
  { key: "rouleur", label: "Rouleur / contre-la-montre" },
  { key: "leader", label: "Leader de classement général" },
];

export const CYCLING_AXES = [
  { id: "mobilite", label: "Mobilité" },
  { id: "force_haut", label: "Force haut" },
  { id: "force_bas", label: "Force bas" },
  { id: "tirage", label: "Tirage" },
  { id: "vitesse", label: "Vitesse" },
  { id: "puissance", label: "Puissance" },
  { id: "endurance", label: "Endurance" },
];

/* Priorité 0-3 de chaque qualité selon le type de coureur : INDICATIF (avis). Cible = 10 + 2 × priorité.
   L'endurance prime partout (demande de l'athlète) ; le sprinteur garde la vitesse / puissance en tête. */
export const CYCLING_PRIORITY = {
  //            mob hautF basF tir vit puis end
  polyvalent: [1, 1, 2, 1, 1, 1, 3],
  sprinteur: [1, 1, 3, 1, 3, 3, 2],
  grimpeur: [1, 0, 1, 0, 0, 0, 3],
  rouleur: [2, 1, 2, 1, 0, 1, 3],
  leader: [1, 0, 2, 0, 0, 1, 3],
};

export const CYCLING_SEXES = [
  { id: "H", label: "Homme" },
  { id: "F", label: "Femme" },
];
export const normSex = (s) => (/^f/i.test(String(s || "")) ? "F" : "H");

/* ---- Standards de puissance / endurance (W/kg ; VO2max en ml/kg/min) ---- */
const vo2From5 = (w) => Math.round((16.6 + 8.87 * w) * 10) / 10;
const U23K = 0.962;
const MEN_PRO = { p5s: 17.99, p20: 6.03, p5m: 7.06, vo2: 82.6 };
const WOM_PRO = { p5s: 15.3, p20: 5.0, p5m: 5.8, vo2: vo2From5(5.8) };
const scaleStd = (b, k, vo2) => ({ p5s: b.p5s * k, p20: b.p20 * k, p5m: b.p5m * k, vo2 });
export const CYCLING_STD = {
  H: {
    c_pro: { ...MEN_PRO },
    c_u23: scaleStd(MEN_PRO, U23K, 79.8),
    c_comp: { p5s: 16.74, p20: 4.86, p5m: 5.73, vo2: vo2From5(5.73) },
    c_sport: { p5s: 15.3, p20: 4.5, p5m: 5.3, vo2: vo2From5(5.3) },
    c_loisir: { p5s: 12.14, p20: 3.8, p5m: 4.48, vo2: vo2From5(4.48) },
  },
  F: {
    c_pro: { ...WOM_PRO },
    c_u23: scaleStd(WOM_PRO, U23K, vo2From5(5.8 * U23K)),
    c_comp: { p5s: 14.27, p20: 4.61, p5m: 5.43, vo2: vo2From5(5.43) },
    c_sport: { p5s: 13.06, p20: 4.33, p5m: 4.95, vo2: vo2From5(4.95) },
    c_loisir: { p5s: 10.03, p20: 3.8, p5m: 4.29, vo2: vo2From5(4.29) },
  },
};
/* Écart-type de la puissance chez les pros : (P90 − P10) / 2,563 ; niveaux inférieurs : même coefficient de variation. */
const SD_PRO = {
  H: { p5s: 2.0, p20: 0.44, p5m: 0.44, vo2: 4.0 },
  F: { p5s: 1.6, p20: 0.47, p5m: 0.55, vo2: 4.0 },
};
const PRO_OF = { H: MEN_PRO, F: WOM_PRO };

/* ---- Force et puissance neuromusculaire (rapportées au poids du corps) ----
   Repères publiés : squat et hip thrust des cyclistes pros / U23 (Alejo 2022, hommes) ; squat de cyclistes féminines
   compétitives (Frontiers 2021). RIEN de publié pour développé couché, militaire, tirages, CMJ : valeurs PROVISOIRES (mon avis). */
const W_LOW = 0.67; // femmes / hommes, bas du corps (estimation)
const W_UP = 0.6; // femmes / hommes, haut du corps et tirages (estimation)
export const CYCLING_LIFTS = {
  SQUAT: { axis: "force_bas", pro: 1.4, other: 1.33, tag: "doc", w: W_LOW },
  "TRAP BARRE": { axis: "force_bas", pro: 1.75, other: 1.66, tag: "estimé", w: W_LOW },
  "HIP THRUST": { axis: "force_bas", pro: 1.71, other: 1.61, tag: "doc", w: W_LOW },
  RDL: { axis: "force_bas", pro: 1.28, other: 1.2, tag: "estimé", w: W_LOW },
  "DEVELOPPE COUCHE": { axis: "force_haut", pro: 0.85, other: 0.85, tag: "provisoire", w: W_UP },
  "DEVELOPPE MILITAIRE": { axis: "force_haut", pro: 0.55, other: 0.55, tag: "provisoire", w: W_UP },
  "TIRAGE PLANCHE": { axis: "tirage", pro: 0.75, other: 0.75, tag: "provisoire", w: W_UP },
  TRACTION: { axis: "tirage", pro: 1.1, other: 1.1, tag: "provisoire", w: W_UP },
};
export const liftStd = (normKey, level, sex) => {
  const l = CYCLING_LIFTS[normKey];
  if (!l) return null;
  const base = level === "c_pro" ? l.pro : l.other;
  return Math.round(base * (sex === "F" ? l.w : 1) * 100) / 100;
};
/* Le squat des femmes est confirmé par un échantillon (0,83-0,93 × poids) : on le marque « doc ». */
export const liftTag = (normKey, sex) => {
  const l = CYCLING_LIFTS[normKey];
  if (!l) return null;
  if (sex === "F") return normKey === "SQUAT" ? "estimé" : l.tag === "doc" ? "estimé" : l.tag;
  return l.tag;
};
/* CMJ (cm) : AUCUNE norme cycliste publiée trouvée → valeurs provisoires. */
const CMJ_M = { c_pro: 36, c_u23: 35, c_comp: 34, c_sport: 32, c_loisir: 30 };
const CMJ_SD_M = 4;
export const cmjStd = (level, sex) => (CMJ_M[level] != null ? Math.round(CMJ_M[level] * (sex === "F" ? 0.8 : 1) * 10) / 10 : null);

export const cyclingStd = (axisId, level, sex) => CYCLING_STD[sex]?.[level]?.[axisId] ?? null;
export const cyclingSd = (axisId, level, sex) => {
  if (axisId === "vo2") return 4.0;
  if (axisId === "cmj") return CMJ_SD_M * (sex === "F" ? 0.8 : 1);
  const std = cyclingStd(axisId, level, sex);
  const pro = PRO_OF[sex]?.[axisId];
  const sd = SD_PRO[sex]?.[axisId];
  if (std == null || !pro || !sd) return null;
  return sd * (std / pro);
};
export const CYCLING_TAGS = (level, sex) => {
  const pw = level === "c_pro" ? "doc" : "estimé";
  return { p5s: pw, p20: pw, p5m: pw, vo2: sex === "H" && (level === "c_pro" || level === "c_u23") ? "doc" : "estimé", cmj: "provisoire" };
};

const clamp20 = (x) => Math.max(0, Math.min(20, x));
/* Note /20 : 10 = standard du niveau, +5 par écart-type (15 = +1 ET, 20 = +2 ET) */
const toNote = (value, std, sd) =>
  std == null || sd == null || value == null ? null : Math.round(clamp20(10 + (5 * (value - std)) / sd) * 10) / 10;
export const cyclingNote = (axisId, level, sex, value) => toNote(value, cyclingStd(axisId, level, sex), cyclingSd(axisId, level, sex));
export const cmjNote = (level, sex, cm) => toNote(cm, cmjStd(level, sex), cyclingSd("cmj", level, sex));
export const liftNote = (normKey, level, sex, ratio) => {
  const std = liftStd(normKey, level, sex);
  return toNote(ratio, std, std == null ? null : std * 0.22);
};

export const CYCLING_NOTE =
  "Standards cyclisme : pros = Valenzuela 2022 (hommes) et Mateo-March 2022 (femmes) ; Élite/U23 = pros × 0,962 (Alejo 2022) ; amateurs = percentiles d'utilisateurs de capteurs de puissance (Cycling Analytics 2018). Force : squat et hip thrust (Alejo 2022) ; le reste est provisoire.";
