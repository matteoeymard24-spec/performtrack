/* =====================================================================
   rugbyLevels.js — standards du rugby français PAR NIVEAU.

   Comment les valeurs sont construites (rien n'est caché) :
   • Pro D2        = barème SU Agen, note 10/20 (≈ moyenne des tops Pro D2).
   • Top 14 / International = valeurs du "Référentiel standards rugby"
     (objectifs FFR 2020, Références physiques V3 World Class, meilleures
     perfs Top 14 21-22) quand elles existent ET sont cohérentes avec
     l'échelle ; sinon barème Agen note 15/20 (Top 14) et 20/20 (Intl).
   • Nationale, Fédérale 1/2/3, Régionale, Espoirs, U18 = ESTIMATION :
     le référentiel ne contient aucune valeur pour ces niveaux. On part du
     niveau Pro D2 et on applique le coefficient de LEVELS[].f, atténué
     selon la qualité testée (SENS). Modifie f ou SENS ici pour ajuster.
   ===================================================================== */

/* Du plus exigeant au moins exigeant */
export const LEVELS = [
  { id: "international", label: "International" },
  { id: "top14", label: "Top 14" },
  { id: "prod2", label: "Pro D2" },
  { id: "nationale", label: "Nationale", f: 0.95 },
  { id: "espoirs", label: "Espoirs (U21)", f: 0.92, jeunes: true },
  { id: "federale1", label: "Fédérale 1", f: 0.9 },
  { id: "federale2", label: "Fédérale 2", f: 0.84 },
  { id: "federale3", label: "Fédérale 3", f: 0.78 },
  { id: "regionale", label: "Régionale", f: 0.72 },
  { id: "u18", label: "U18", f: 0.7, jeunes: true },
];

export const levelLabel = (id) => LEVELS.find((l) => l.id === id)?.label || id;

/* Sensibilité de chaque qualité à l'écart de niveau :
   1 = suit tout l'écart (force), 0.6 = vitesse (réglé à 0.6 : les joueurs de Fédérale courent nettement moins vite que Pro D2). */
export const SENS = {
  SQUAT: 1,
  "DEVELOPPE COUCHE": 1,
  "DEVELOPPE MILITAIRE": 1,
  RDL: 1,
  "TRAP BARRE": 1,
  "TIRAGE PLANCHE": 1,
  "HIP THRUST": 1,
  TRACTION: 1,
  "Cervicales Flexion": 1,
  "Cervicales extension": 1,
  "Keiser R150": 1,
  "1080 R30": 1,
  "1080 R30 - 10m Pmax": 1,
  CMJ: 1,
  CMJB: 1,
  Bronco: 0.5,
  "Prowler 85Kg 10m": 0.5,
  "Vitesse GPS": 0.6,
  "5m": 0.6,
  "10m": 0.6,
  "15m": 0.6,
  "20m": 0.6,
  "60m": 0.6,
};

/* Colonnes du référentiel : Pilier, Talonneur, 2e ligne, 3e ligne, 9, 10, Centre, Ailier/Arrière */
export const GROUP = { PILIER: 0, TALON: 1, "2L": 2, "3L": 3, "9": 4, "10": 5, Centre: 6, Ailier: 7, Arriere: 7 };

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
    top14: { v: [5.22, 5.22, 5.06, 4.56, 4.39, 4.39, 4.56, 4.51], src: "Étude Weakley et al. 2026 (Super Rugby, 30e centile)" },
  },
  CMJ: {
    international: { v: [50, 55, 55, 55, 55, 55, 60, 62], src: "Références physiques V3 World Class" },
  },
  "Vitesse GPS": {
    international: { v: [30, 32, 32, 33, 35, 34, 34, 36], src: "Références physiques V3 World Class" },
  },
  "Prowler 85Kg 10m": {
    international: { v: [2.69, 2.82, 2.67, 2.67, 3.06, 2.82, 2.82, 2.7], src: "Objectif FFR 2020 (Prowler 0-10 m)" },
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
