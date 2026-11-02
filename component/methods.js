/* =====================================================================
   methods.js — MÉTHODES D'ENTRAÎNEMENT (musculation).

   A) Méthodes PAR EXERCICE (ex.method, réglages dans ex.mp) — comment se fait chaque série :
      • cluster    : la série est coupée en mini-séries de r reps, avec une courte pause (10-30 s)
                     → plus de reps de qualité (vitesse) à charge lourde (Tufano et al. 2017, Sports Med 47:2065 ;
                     Haff et al. 2008, Strength Cond J 30:67).
                     Feedback : reps de chaque mini-série + RIR en fin de série.
                     RM : JAMAIS — les pauses intra-série effacent une partie de la fatigue, le RIR déclaré
                     ne correspond pas à une série continue (méthode utilisée ponctuellement : le RM vient
                     des séries classiques).
      • restpause  : série principale proche de l'échec, puis k mini-séries après 10-20 s de pause
                     (Prestes et al. 2019, J Strength Cond Res 33:S113).
                     Feedback : reps de la série principale + de chaque mini-série ; RIR de la série principale.
                     RM : sur la série principale seulement.
      • dropset    : série puis baisse de charge de x % sans repos, d fois (Schoenfeld & Grgic 2018,
                     Strength Cond J 40:107 — volume équivalent en moins de temps).
                     Feedback : reps de la série + charge et reps de chaque drop ; RIR de la 1re série.
                     RM : sur la 1re série seulement.
      • m12080     : méthode 120-80 (Cometti) : excentrique à ~120 % du RM (aidé à la remontée),
                     concentrique à ~80 %. Feedback : charge excentrique + concentrique + reps.
                     RM : jamais (charge supramaximale, comme l'excentrique accentué).
   B) Méthodes PAR BLOC (block.method, réglages dans block.mp) — comment s'enchaînent les exercices :
      • superset   : exercices enchaînés sans pause, repos après le tour (fonctionnement normal d'un bloc).
      • contrast   : French contrast (Cal Dietz / méthode des contrastes, Cometti) : ① lourd (~80-90 %,
                     1-3 reps) → ② pliométrie (5 sauts) → ③ saut chargé (~20-30 %, 5 reps) →
                     ④ pliométrie assistée / rapide (5), 10-20 s entre les exercices, 3-5 min entre les tours.
                     Repose sur la potentialisation post-activation (Seitz & Haff 2016, Sports Med 46:231).
      • complex    : complex / contraste 2 temps : lourd → explosif du même geste (ex. squat 85 % → saut).
      Chaque exercice garde son propre feedback (charge/reps/RIR) ; le RM ne vient que des exercices
      chargés (pas des sauts au poids du corps).
   ===================================================================== */

export const EX_METHODS = [
  { id: "classique", icon: "", label: "Classique", short: "" },
  { id: "cluster", icon: "🧩", label: "Cluster", short: "Cluster", tip: "Série coupée en mini-séries avec une courte pause : plus de reps rapides à charge lourde." },
  { id: "restpause", icon: "⏸", label: "Rest-pause", short: "Rest-pause", tip: "Série principale proche de l'échec, puis mini-séries après 10-20 s de pause." },
  { id: "dropset", icon: "⬇", label: "Drop set", short: "Drop set", tip: "Série puis baisse immédiate de la charge, sans repos." },
  { id: "m12080", icon: "↕", label: "120-80", short: "120-80", tip: "Excentrique à ~120 % (aidé à la remontée) puis concentrique à ~80 % du RM." },
];

export const BLOCK_METHODS = [
  { id: "", icon: "", label: "Classique" },
  { id: "superset", icon: "🔗", label: "Superset / circuit", tip: "Exercices enchaînés sans pause, repos après le tour." },
  { id: "contrast", icon: "⚡", label: "French contrast", tip: "Lourd → pliométrie → saut chargé → pliométrie assistée, 10-20 s entre chaque, 3-5 min entre les tours." },
  { id: "complex", icon: "🔁", label: "Complex (lourd + explosif)", tip: "Exercice lourd puis geste explosif proche, 10-20 s entre les deux." },
];

export const EX_DEFAULTS = {
  cluster: { clusterReps: 2, clusters: 3, intraRest: 20 },
  restpause: { miniSets: 2, pauseSec: 15 },
  dropset: { drops: 2, dropPct: 20 },
  m12080: { eccPct: 120, conPct: 80 },
};
export const BLOCK_DEFAULTS = { contrast: { betweenSec: 15 }, complex: { betweenSec: 15 }, superset: {} };

/* Rôles des exercices d'un French contrast / complex */
export const CONTRAST_ROLES = {
  contrast: [
    { role: "lourd", label: "① Lourd", ex: { name: "Squat", series: 4, reps: 3, rmPercent: 85, tempo: "2-0-X-0" } },
    { role: "plio", label: "② Pliométrie", ex: { name: "Saut de haies", series: 4, reps: 5, rmPercent: "PDC", tempo: "EXPLO (VMAX)" } },
    { role: "balistique", label: "③ Saut chargé", ex: { name: "Jump squat", series: 4, reps: 5, rmPercent: 30, tempo: "EXPLO (VMAX)" } },
    { role: "rapide", label: "④ Plio assistée / rapide", ex: { name: "Saut assisté élastique", series: 4, reps: 5, rmPercent: "ELASTIQUE", tempo: "EXPLO (VMAX)" } },
  ],
  complex: [
    { role: "lourd", label: "① Lourd", ex: { name: "Squat", series: 4, reps: 3, rmPercent: 85, tempo: "2-0-X-0" } },
    { role: "explosif", label: "② Explosif", ex: { name: "CMJ", series: 4, reps: 5, rmPercent: "PDC", tempo: "EXPLO (VMAX)" } },
  ],
};
export const roleLabel = (blockMethod, role, idx) => {
  const list = CONTRAST_ROLES[blockMethod] || [];
  return (list.find((r) => r.role === role) || list[idx] || {}).label || null;
};

export const methodOf = (ex) => (EX_METHODS.some((m) => m.id === ex?.method) ? ex.method : "classique");
export const methodInfo = (ex) => EX_METHODS.find((m) => m.id === methodOf(ex));
export const mpOf = (ex) => {
  const p = { ...(EX_DEFAULTS[methodOf(ex)] || {}), ...(ex?.mp || {}) };
  if (methodOf(ex) === "cluster") p.clusterReps = Math.max(1, Math.round(Number(ex?.reps) || p.clusterReps)); // reps par mini-série = champ Reps
  return p;
};
export const blockMethodOf = (b) => (BLOCK_METHODS.some((m) => m.id === b?.method) ? b.method : "");
export const blockMpOf = (b) => ({ ...(BLOCK_DEFAULTS[blockMethodOf(b)] || {}), ...(b?.mp || {}) });
export const isContrastBlock = (b) => ["contrast", "complex"].includes(blockMethodOf(b));

const n = (v) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

/* Texte du schéma d'une série (séance + création) */
export function methodScheme(ex) {
  const m = methodOf(ex);
  const p = mpOf(ex);
  const sets = n(ex.series) || 1;
  if (m === "cluster") return `${sets} × (${Array.from({ length: p.clusters }, () => p.clusterReps).join("+")}) · ${p.intraRest} s entre les mini-séries`;
  if (m === "restpause") return `${sets} × ${ex.reps} + ${p.miniSets} mini-série${p.miniSets > 1 ? "s" : ""} · ${p.pauseSec} s de pause`;
  if (m === "dropset") return `${sets} × ${ex.reps} puis ${p.drops} drop${p.drops > 1 ? "s" : ""} de −${p.dropPct} %`;
  if (m === "m12080") return `${sets} × ${ex.reps} · excentrique ${p.eccPct} % / concentrique ${p.conPct} %`;
  return null;
}

/* Charges d'un drop set à partir de la charge de départ (arrondies à 1 kg) */
export const dropLoads = (w, ex) => {
  const p = mpOf(ex);
  const out = [];
  let cur = n(w);
  for (let i = 0; i < p.drops; i++) {
    cur = cur * (1 - p.dropPct / 100);
    out.push(Math.round(cur));
  }
  return out;
};

/* Série initiale du feedback selon la méthode */
export function methodSerieDefaults(ex, weight) {
  const m = methodOf(ex);
  const p = mpOf(ex);
  if (m === "cluster") return { clusters: Array.from({ length: p.clusters }, () => p.clusterReps), actualReps: p.clusterReps * p.clusters };
  if (m === "restpause") return { segments: [n(ex.reps), ...Array.from({ length: p.miniSets }, () => "")], actualReps: n(ex.reps) };
  if (m === "dropset") return { drops: dropLoads(weight, ex).map((w) => ({ w, r: "" })), actualReps: n(ex.reps) };
  if (m === "m12080") return { eccWeight: "" };
  return {};
}

/* Vue « RM » d'une série : reps à utiliser pour l'e1RM selon la méthode (null = ne compte pas) */
export function rmSerie(serie, ex) {
  const m = methodOf(ex);
  if (!serie) return serie;
  if (m === "m12080") return null;
  if (m === "cluster") return null; // jamais utilisé pour le RM
  if (m === "restpause" && Array.isArray(serie.segments)) return { ...serie, actualReps: n(serie.segments[0]) || serie.actualReps };
  return serie; // drop set : actualReps = reps de la 1re série
}

/* Texte court d'une série remplie (affichage du feedback) */
export function serieText(serie, ex) {
  const m = methodOf(ex);
  if (m === "cluster" && Array.isArray(serie.clusters)) return `${serie.actualWeight} kg × (${serie.clusters.map((x) => x || 0).join("+")})`;
  if (m === "restpause" && Array.isArray(serie.segments)) return `${serie.actualWeight} kg × ${serie.segments.filter((x) => x !== "" && x != null).join("+")}`;
  if (m === "dropset" && Array.isArray(serie.drops))
    return `${serie.actualWeight} kg × ${serie.actualReps}${serie.drops.map((d) => ` → ${d.w} kg × ${d.r || 0}`).join("")}`;
  if (m === "m12080") return `exc ${serie.eccWeight || "?"} kg / conc ${serie.actualWeight} kg × ${serie.actualReps}`;
  return null;
}

/* Secondes ajoutées à UNE série par la méthode (durée estimée de la séance) */
export function methodExtraSec(ex, repSec) {
  const m = methodOf(ex);
  const p = mpOf(ex);
  if (m === "cluster") return (p.clusters - 1) * p.intraRest + (p.clusterReps * p.clusters - n(ex.reps)) * repSec;
  if (m === "restpause") return p.miniSets * (p.pauseSec + 3 * repSec);
  if (m === "dropset") return p.drops * (10 + n(ex.reps) * 0.6 * repSec);
  return 0;
}
