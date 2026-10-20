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
  CMJ: 0.5,
  CMJB: 0.5,
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
  Bronco: {
    international: { v: [5.04, 4.46, 4.5, 4.42, 4.24, 4.38, 4.42, 4.36], src: "Objectif FFR 2020" },
    top14: { v: [5.05, 4.48, 4.43, 4.46, 4.15, 4.27, 4.37, 4.26], src: "Meilleure perf Top 14 2021-22" },
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
