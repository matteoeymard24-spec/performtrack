/* =====================================================================
   rugbyLevels.js — standards du rugby français PAR NIVEAU.

   Comment les valeurs sont construites (rien n'est caché) :
   • Pro D2        = barème SU Agen, note 10/20 (≈ moyenne des tops Pro D2).
   • Pro D2 validé par les 1RM des pros d'Agen (STANDARDS MUSCU 2026-27) :
     la médiane du poste tombe sur la note 9 à 12 du barème.
   • Top 14 / International = Pro D2 × écart de la famille (petit). Les
     objectifs FFR 2020 / V3 World Class du référentiel sont affichés comme
     repère « objectif » mais ne fixent plus le seuil (ce sont des cibles
     d'élite, pas des moyennes). Exception : Bronco (centiles publiés).
   • Les autres niveaux (et Top 14 / International sans valeur publiée) =
     ESTIMATION : niveau Pro D2 × un écart PROPRE À CHAQUE FAMILLE DE QUALITÉ
     et à chaque étage (FAMILY_RATIO ci-dessous) — petit en haut, grand entre
     Nationale et Fédérale 1, plus fort pour la force que pour la vitesse.
   ===================================================================== */

/* Du plus exigeant au moins exigeant */
export const LEVELS = [
  { id: "international", label: "International" },
  { id: "top14", label: "Top 14" },
  { id: "prod2", label: "Pro D2" },
  { id: "nationale", label: "Nationale", est: true },
  { id: "espoirs", label: "Espoirs (U21)", est: true, jeunes: true },
  { id: "federale1", label: "Fédérale 1", est: true },
  { id: "federale2", label: "Fédérale 2", est: true },
  { id: "federale3", label: "Fédérale 3", est: true },
  { id: "regionale", label: "Régionale", est: true },
  { id: "u18", label: "U18", est: true, jeunes: true },
];

import { CYCLING_LEVELS } from "./cycling";
export const levelLabel = (id) => LEVELS.find((l) => l.id === id)?.label || CYCLING_LEVELS.find((l) => l.id === id)?.label || id;

/* ÉCARTS ENTRE NIVEAUX PAR FAMILLE DE QUALITÉ (remplace l'ancien « coefficient × sensibilité » unique).
   Valeur = rapport au niveau Pro D2 dans le sens « meilleur » : 1,06 = 6 % de mieux que Pro D2 ;
   pour un TEMPS (sprint, Bronco, prowler) le temps du niveau = temps Pro D2 ÷ rapport.
   Pourquoi des écarts différents selon la qualité et selon l'étage :
   • En haut (Pro D2 → Top 14 → International) les écarts sont PETITS : Smart et al. 2013 (JSCR, 1 161 joueurs
     NZ) : International vs Super Rugby ≈ 2 % au sprint 20 m ; Argus et al. 2012 (JSCR) : pros vs semi-pros, pas
     de différence de force maximale, c'est la puissance qui sépare. Données LNR 2026-27 : masse Pro D2 ≈ Top 14
     ≈ XV de France (± 3 %).
   • Le GROS écart est entre le monde pro / semi-pro (Pro D2, Nationale) et l'amateur (Fédérale 1 et dessous) :
     Smart 2013 : provinciaux vs clubs 1 à 14 % selon le test ; Fontana et al. 2015 (IJSPP, Italie) : divisions
     inférieures plus légères, plus grasses, plus hétérogènes ; revue systématique Payne et al. 2025 (JSCR) : la
     force maximale (5 études / 5) et la force rapide (3 / 3) distinguent toujours les niveaux, la vitesse
     maximale moins nettement (3 / 6).
   • Selon la qualité : la FORCE maximale (1RM) varie le plus entre niveaux, puis l'endurance (distance Yo-Yo),
     la puissance (sauts), et la VITESSE le moins (quelques % seulement).
   Ordre des colonnes : international, top14, nationale, espoirs, federale1, federale2, federale3, regionale, u18.
   Les chiffres sont des ESTIMATIONS calées sur ces études (aucune étude ne mesure chaque niveau français). */
export const LEVEL_ORDER = ["international", "top14", "nationale", "espoirs", "federale1", "federale2", "federale3", "regionale", "u18"];
export const FAMILY_RATIO = {
  force: [1.11, 1.06, 0.94, 0.85, 0.85, 0.79, 0.75, 0.71, 0.68],
  puissance: [1.07, 1.04, 0.96, 0.93, 0.91, 0.87, 0.84, 0.81, 0.82],
  broad: [1.04, 1.025, 0.98, 0.96, 0.945, 0.92, 0.9, 0.88, 0.89],
  sprint: [1.025, 1.015, 0.985, 0.975, 0.96, 0.948, 0.935, 0.922, 0.925],
  vmax: [1.035, 1.02, 0.98, 0.97, 0.955, 0.94, 0.925, 0.91, 0.92],
  yoyo: [1.12, 1.06, 0.92, 0.88, 0.82, 0.76, 0.7, 0.65, 0.75],
  vift: [1.04, 1.02, 0.98, 0.97, 0.95, 0.93, 0.91, 0.89, 0.93],
  bronco: [1.06, 1.03, 0.975, 0.965, 0.945, 0.925, 0.905, 0.885, 0.93],
};
export const FAMILY_LABEL = {
  force: "force maximale",
  puissance: "puissance / sauts",
  broad: "saut horizontal",
  sprint: "accélération (temps)",
  vmax: "vitesse maximale",
  yoyo: "endurance (distance)",
  vift: "endurance (vitesse)",
  bronco: "endurance (temps)",
};
export const FAMILY = {
  SQUAT: "force",
  "DEVELOPPE COUCHE": "force",
  "DEVELOPPE MILITAIRE": "force",
  RDL: "force",
  "TRAP BARRE": "force",
  "TIRAGE PLANCHE": "force",
  "HIP THRUST": "force",
  TRACTION: "force",
  "Cervicales Flexion": "force",
  "Cervicales extension": "force",
  "Prowler 85Kg 10m": "sprint",
  "Keiser R150": "puissance",
  "1080 R30": "puissance",
  "1080 R30 - 10m Pmax": "puissance",
  CMJ: "puissance",
  CMJB: "puissance",
  BROAD: "broad",
  Bronco: "bronco",
  YOYO1: "yoyo",
  VIFT: "vift",
  "Vitesse GPS": "vmax",
  "5m": "sprint",
  "10m": "sprint",
  "15m": "sprint",
  "20m": "sprint",
  "60m": "sprint",
};
export const familyRatio = (normKey, levelId) => {
  const fam = FAMILY[normKey] || "puissance";
  const i = LEVEL_ORDER.indexOf(levelId);
  return i < 0 ? 1 : FAMILY_RATIO[fam][i];
};

/* Colonnes du référentiel : Pilier, Talonneur, 2e ligne, 3e ligne, 9, 10, Centre, Ailier/Arrière */
export const GROUP = { PILIER: 0, TALON: 1, "2L": 2, "3L": 3, "9": 4, "10": 5, Centre: 6, Ailier: 7, Arriere: 7 };

/* Bronco (solution 2) : le 30e centile Super Rugby sert de niveau Pro D2, le 10e centile reste le niveau
   International, Top 14 = milieu des deux (calculé en secondes puis reconverti en min.ss). */
const _bs = (x) => Math.floor(x + 1e-9) * 60 + Math.round((x - Math.floor(x + 1e-9)) * 100);
const _bm = (sec) => Math.floor(sec / 60) + (sec % 60) / 100;
const BRONCO_P30 = [5.22, 5.22, 5.06, 4.56, 4.39, 4.39, 4.56, 4.51];
const BRONCO_P10 = [5.05, 5.05, 4.55, 4.43, 4.31, 4.31, 4.44, 4.38];
const BRONCO_MID = BRONCO_P30.map((v, i) => _bm(Math.round((_bs(v) + _bs(BRONCO_P10[i])) / 2)));

/* Valeurs sourcées du "Référentiel standards rugby" (Bronco en min.ss : 5.04 = 5'04") */
export const SOURCED = {
  SQUAT: {
    international: { v: [230, 215, 205, 205, 180, 185, 190, 190], src: "Objectif FFR 2020 (back squat)" },
    top14: { v: [232.5, 200, 180, 185, 125, 158, 211, 185], src: "Meilleure perf Top 14 2021-22" },
  },
  "DEVELOPPE COUCHE": {
    top14: { v: [175, 175, 140, 144, 130, 130, 140, 144], src: "Meilleure perf Top 14 2021-22" },
  },
  "TRAP BARRE": {
    international: { v: [305, 297.5, 285, 285, 250, 257.5, 277.5, 277.5], src: "Objectif FFR 2020 (trap bar deadlift)" },
  },
  /* Bronco : ÉTUDE PUBLIÉE — Weakley et al. (2026), J Strength Cond Res, « A 10-Year Analysis of the Bronco
     Fitness Test in Male and Female Super Rugby Athletes » : 303 hommes, 1 376 mesures, centiles par groupe
     de poste (tableau 4). International = 10e centile (les 10 % les plus rapides), Top 14 = 30e centile.
     Groupes de l'étude : 1re ligne (pilier, talonneur), 2e ligne, 3e ligne, charnière (9-10), centres, trois-quarts
     aile/arrière. Recoupement : les objectifs FFR 2020 (4.36 à 5.04) sont du même ordre que ce 10e centile.
     Corroboré par Hamlin et al. (pros NZ, n = 133) : 3e ligne/avants 5:11, arrières 4:54. */
  Bronco: {
    international: { v: [5.05, 5.05, 4.55, 4.43, 4.31, 4.31, 4.44, 4.38], src: "Étude Weakley et al. 2026 (Super Rugby, 10e centile)" },
    top14: { v: BRONCO_MID, src: "Estimé : milieu entre le 30e et le 10e centile Super Rugby (Weakley 2026)" },
    /* Pro D2 = moyenne entre les DONNÉES DU SU AGEN (data/Bronco.xlsx, meilleur temps de chaque joueur 2023-2025,
       médiane du poste : pilier 5'30, talonneur 5'07, 2e ligne 5'10, 3e ligne 4'53, 9 4'25, 10 4'45, centre 4'56,
       ailier 4'41, arrière 4'36) et le 30e centile Super Rugby ; chaque poste est gardé au moins 3 s plus lent
       que le Top 14 (talonneur, 9, ailier/arrière). */
    prod2: { v: [5.26, 5.17, 5.08, 4.55, 4.38, 4.42, 4.56, 4.48], src: "Données SU Agen (Bronco 2023-25) + 30e centile Super Rugby" },
  },
  CMJ: {
    international: { v: [50, 55, 55, 55, 55, 55, 60, 62], src: "Références physiques V3 World Class" },
  },
  "Vitesse GPS": {
    international: { v: [30, 32, 32, 33, 35, 34, 34, 36], src: "Références physiques V3 World Class" },
  },
};

/* Bronco : PLANCHER RÉALISTE de la médaille d'or. Les médailles argent/or sont déduites de l'écart du barème
   (notes 10 → 15 → 20), ce qui donnait des temps impossibles (ex. 3'46" pour un demi de mêlée).
   On borne donc l'or par le meilleur temps connu : record 4'08" (248 s, demandé par le coach ; Barrett a
   publiquement réalisé 4'12" avec les Blues en 2020), ramené à chaque poste avec le rapport des 10e centiles
   publiés (Weakley et al. 2026) : charnière = 1, 3e ligne 1.044, 2e ligne 1.089, 1re ligne 1.125, etc.
   Ordre des colonnes = GROUP (pilier, talonneur, 2L, 3L, 9, 10, centre, ailier/arrière). */
export const BRONCO_RECORD_S = 248;
export const BRONCO_POSTE_RATIO = [1.1255, 1.1255, 1.0886, 1.0443, 1, 1, 1.048, 1.0258];
