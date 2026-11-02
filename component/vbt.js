/* =====================================================================
   vbt.js — vitesse de barre (VBT), OPTIONNELLE (seulement si l'athlète a un outil de mesure).

   Vitesse cible d'un exercice :
     • saisie à la main par le coach (ex.vbtTarget, m/s) — prioritaire ;
     • sinon calculée depuis le %RM prescrit pour les exercices dont la relation charge-vitesse est publiée
       (vitesse moyenne propulsive, sujets entraînés) :
         – squat (complet, barre sur le dos / avant) : %1RM = −5,961·v² − 50,71·v + 117
           (Sánchez-Medina et al. 2017, Int J Sports Med 38:480) ;
         – développé couché : %1RM = 110,893 − 64,187·v (González-Badillo & Sánchez-Medina 2010,
           Int J Sports Med 31:347).
       Autres exercices : pas d'équation fiable → pas de cible automatique.
   Feedback : vitesse moyenne de la série (m/s), saisie libre. Comparée à la cible et à la meilleure série
   (perte de vitesse entre séries, même logique que la perte en sprint ; repères de fatigue : perte
   > 10 % = fatigue qui s'installe, > 20 % = fatigue nette — Pareja-Blanco et al. 2017, Scand J Med
   Sci Sports 27:724 ; Weakley et al. 2021, Strength Cond J 43:31).
   ===================================================================== */

const num = (v) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x : null;
};

export const VBT_LOSS_WARN = 10;
export const VBT_LOSS_STOP = 20;

const SQUAT_RE = /squat/i;
const SQUAT_EXCL = /bulgare|split|saut|jump|goblet|pistol|sumo|hack|presse|sissy/i;
const BENCH_RE = /d[ée]velopp[ée]\s*couch[ée]|bench\s*press|\bdc\b/i;
const BENCH_EXCL = /halt[eè]re|inclin|d[ée]clin|serr[ée]|machine/i;

/* Équation disponible pour cet exercice ? */
export const vbtFamily = (name) => {
  const n = String(name || "");
  if (SQUAT_RE.test(n) && !SQUAT_EXCL.test(n)) return "squat";
  if (BENCH_RE.test(n) && !BENCH_EXCL.test(n)) return "bench";
  return null;
};

/* Vitesse (m/s) attendue à un %RM, selon la famille */
export function velocityAtPct(family, pct) {
  const p = Number(pct);
  if (!(p > 0) || p > 100) return null;
  if (family === "bench") return Math.max(0.1, (110.893 - p) / 64.187);
  if (family === "squat") {
    // 5,961 v² + 50,71 v + (p − 117) = 0
    const a = 5.961;
    const b = 50.71;
    const c = p - 117;
    const d = b * b - 4 * a * c;
    if (d < 0) return null;
    return Math.max(0.1, (-b + Math.sqrt(d)) / (2 * a));
  }
  return null;
}

/* Cible de l'exercice : { v, auto, label } ou null */
export function vbtTargetOf(ex) {
  const manual = num(ex?.vbtTarget);
  if (manual) return { v: manual, auto: false, label: "cible saisie par le coach" };
  const fam = vbtFamily(ex?.name);
  const v = fam ? velocityAtPct(fam, ex?.rmPercent) : null;
  return v ? { v: Math.round(v * 100) / 100, auto: true, label: fam === "squat" ? "équation squat (Sánchez-Medina 2017)" : "équation développé couché (González-Badillo 2010)" } : null;
}

export const fmtV = (v) => (v == null ? "—" : String((Math.round(v * 100) / 100).toFixed(2)).replace(".", ","));

/* Lecture des vitesses saisies sur les séries : écart à la cible, perte vs meilleure série */
export function summarizeVbt(series, target) {
  const vs = (series || []).map((s) => num(s?.vel));
  const vals = vs.filter((x) => x != null);
  if (!vals.length) return null;
  const best = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const last = vals[vals.length - 1];
  return {
    perSet: vs.map((v) => (v == null ? null : { v, loss: ((best - v) / best) * 100, vsTarget: target ? v - target : null })),
    best,
    mean,
    loss: vals.length >= 2 ? ((best - last) / best) * 100 : null,
    advice:
      target == null
        ? null
        : mean < target - 0.05
        ? "Plus lent que la cible : charge trop lourde pour aujourd'hui (ou fatigue) → baisse un peu."
        : mean > target + 0.05
        ? "Plus rapide que la cible : la charge peut monter."
        : "Dans la cible.",
  };
}

/* Couleur d'une vitesse par rapport à la cible */
export const vbtColor = (v, target) => {
  if (v == null || target == null) return "#a8a199";
  const d = v - target;
  if (d >= -0.03) return "#4fae7d";
  if (d >= -0.08) return "#e08a3d";
  return "#d9695a";
};
