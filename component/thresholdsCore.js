/* =====================================================================
   thresholdsCore.js — seuils et normes réglables (sans Firebase : utilisable par les calculs purs).
   TH("cle") = valeur active (réglage du coach, sinon défaut). setThresholds() est appelé par
   thresholds.js après lecture Firestore. Page de réglage : ⚙️ Paramètres (page/Settings.jsx).
   ===================================================================== */

export const THRESHOLD_SECTIONS = [
  {
    id: "forme",
    title: "🩺 État de forme",
    intro: "Croisement charge (REDI) × wellness × fatigue nerveuse (force, CMJ) × effort perçu.",
    params: [
      { k: "rediUnder", label: "REDI : sous-charge en dessous de", def: 0.8, step: 0.05, min: 0.3, max: 1.2, src: "Gabbett 2016 (zone 0,8-1,3)" },
      { k: "rediHigh", label: "REDI : charge élevée au-dessus de", def: 1.3, step: 0.05, min: 1, max: 2 },
      { k: "rediVeryHigh", label: "REDI : charge très élevée au-dessus de", def: 1.5, step: 0.05, min: 1.1, max: 2.5 },
      { k: "wellZLow", label: "Wellness en baisse : z ≤", def: -0.5, step: 0.1, min: -3, max: 0 },
      { k: "wellZVeryLow", label: "Wellness très dégradé : z ≤", def: -1.5, step: 0.1, min: -4, max: -0.2 },
      { k: "wellScoreMid", label: "Sans z-score : wellness moyen sous", def: 6.5, step: 0.5, min: 3, max: 9, unit: "/10" },
      { k: "wellScoreLow", label: "Sans z-score : wellness bas sous", def: 5, step: 0.5, min: 2, max: 8, unit: "/10" },
      { k: "cmjDrop", label: "CMJ : baisse à partir de", def: 5, step: 1, min: 1, max: 20, unit: "%", src: "Claudino et al. 2017" },
      { k: "cmjBigDrop", label: "CMJ : chute à partir de", def: 10, step: 1, min: 2, max: 30, unit: "%" },
      { k: "cmjMinTests", label: "CMJ : tests minimum pour la référence", def: 3, step: 1, min: 2, max: 10 },
      { k: "neuralDrop", label: "Force : chute d'e1RM vs séance précédente", def: 15, step: 1, min: 5, max: 40, unit: "%" },
      { k: "neuralRmFloor", label: "Force : e1RM sous ce % du RM enregistré", def: 80, step: 1, min: 50, max: 95, unit: "%" },
      { k: "effortZHard", label: "Effort perçu : séance « bien plus dure » si z ≥", def: 1.5, step: 0.1, min: 0.5, max: 4, help: "Compte dans le domaine bien-être de l'état de forme." },
      { k: "effortZSoft", label: "Effort perçu : « plus dure / plus facile » si |z| ≥", def: 0.75, step: 0.05, min: 0.2, max: 2 },
      { k: "effortMinN", label: "Effort perçu : séances minimum pour un z-score", def: 5, step: 1, min: 3, max: 20 },
      { k: "effortWindow", label: "Effort perçu : historique utilisé", def: 120, step: 10, min: 30, max: 365, unit: "jours" },
      { k: "effortSignalDays", label: "Effort perçu : séance prise en compte si faite depuis moins de", def: 4, step: 1, min: 1, max: 14, unit: "jours" },
    ],
  },
  {
    id: "rpe",
    title: "🎯 RPE prévu automatique",
    intro: "RPE de séance calculé d'après la prescription (%RM, reps, RIR, intensité), puis ajusté pour chaque athlète.",
    params: [
      { k: "rpeMeanWeight", label: "Poids de la moyenne des séries (le reste = série la plus dure)", def: 75, step: 5, min: 0, max: 100, unit: "%" },
      { k: "rpeNoRm", label: "RPE d'un exercice PDC / élastique / kg fixe sans RIR", def: 6.5, step: 0.5, min: 1, max: 10 },
      { k: "rpeVolHigh", label: "+0,5 au-delà de ce nombre de séries (muscu)", def: 24, step: 1, min: 8, max: 60, unit: "séries" },
      { k: "rpeVolLow", label: "−0,5 en dessous de ce nombre de séries", def: 8, step: 1, min: 1, max: 20, unit: "séries" },
      { k: "biasWindow", label: "Séances utilisées pour l'écart personnel", def: 12, step: 1, min: 3, max: 40 },
      { k: "biasShrink", label: "Prudence de l'écart personnel (écart × n / (n + k), k =)", def: 3, step: 1, min: 0, max: 15, help: "Plus k est grand, plus il faut de séances avant d'appliquer tout l'écart." },
    ],
  },
  {
    id: "charge",
    title: "⚖️ Charge de la journée (nutrition)",
    intro: "Charge = RPE × minutes (UA). Classée par rapport à la charge habituelle de l'athlète, sinon avec des repères fixes.",
    params: [
      { k: "dayZLight", label: "Journée légère si z de charge <", def: -0.6, step: 0.1, min: -3, max: 0 },
      { k: "dayZHard", label: "Journée intense si z de charge >", def: 0.8, step: 0.1, min: 0, max: 3 },
      { k: "dayZTwo", label: "Avec 2 séances, intense si z >", def: 0.3, step: 0.1, min: -1, max: 3 },
      { k: "loadRefDays", label: "Historique pour la charge habituelle", def: 90, step: 10, min: 21, max: 365, unit: "jours" },
      { k: "loadRefMinDays", label: "Journées d'entraînement minimum pour l'individualiser", def: 8, step: 1, min: 3, max: 40 },
      { k: "loadLight", label: "Repère fixe : légère sous", def: 300, step: 10, min: 50, max: 1500, unit: "UA" },
      { k: "loadHard", label: "Repère fixe : intense à partir de", def: 600, step: 10, min: 100, max: 3000, unit: "UA" },
      { k: "defaultRpe", label: "RPE si rien n'est prévu ni calculable", def: 5, step: 0.5, min: 1, max: 10 },
    ],
  },
  {
    id: "nutri",
    title: "🥗 Nutrition & hydratation",
    intro: "Repères d'hydratation et tolérances de « dans les clous ».",
    params: [
      { k: "waterPerKg", label: "Eau de base", def: 35, step: 1, min: 20, max: 60, unit: "ml/kg" },
      { k: "waterPerHour", label: "Eau en plus par heure d'entraînement", def: 600, step: 50, min: 0, max: 1500, unit: "ml/h", src: "ACSM 2016 : 0,4-0,8 L/h" },
      { k: "kcalTol", label: "Énergie dans les clous à ±", def: 10, step: 1, min: 3, max: 25, unit: "%" },
      { k: "protMin", label: "Protéines dans les clous à partir de", def: 90, step: 5, min: 60, max: 100, unit: "%" },
      { k: "microMin", label: "Vitamines / minéraux : signalés sous", def: 70, step: 5, min: 30, max: 100, unit: "%" },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(THRESHOLD_SECTIONS.flatMap((s) => s.params.map((p) => [p.k, p.def])));
let current = { ...DEFAULTS };

/* Valeur active d'un seuil */
export const TH = (k) => (current[k] !== undefined && current[k] !== null && current[k] !== "" && Number.isFinite(Number(current[k])) ? Number(current[k]) : DEFAULTS[k]);
export const allThresholds = () => ({ ...current });

const clean = (obj) => {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (k in DEFAULTS && v !== "" && v !== null && Number.isFinite(Number(v))) out[k] = Number(v);
  });
  return out;
};

export const setThresholds = (vals) => {
  current = { ...DEFAULTS, ...clean(vals) };
};
