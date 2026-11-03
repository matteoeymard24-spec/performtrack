/* =====================================================================
   tempo.js — tempo d'exécution d'un exercice de musculation.

   Notation des préparateurs (4 phases, dans cet ordre) : EXCENTRIQUE - PAUSE ÉTIRÉE - CONCENTRIQUE - PAUSE CONTRACTÉE
   ex. « 3-1-X-0 » = 3 s d'excentrique, 1 s de pause en position étirée, concentrique explosif (X), pas de pause.
   Anciens tempos à 3 chiffres (« 2-0-2 ») = excentrique - pause - concentrique, pause contractée 0.
   Spéciaux : « ISO » (maintien isométrique), « EXPLO (VMAX) » (intention de vitesse maximale).

   Montée / descente : la phase CONCENTRIQUE n'est pas toujours la montée.
     • « up »      concentrique = montée (squat, développé couché, traction, soulevé de terre…) ;
     • « down »    concentrique = descente (tirage vertical, extension triceps à la poulie…) ;
     • « neutral » mouvement horizontal (rowing, presse, face pull…) : on parle de concentrique / excentrique.
   Deviné d'après le nom de l'exercice, modifiable par exercice (ex.tempoDir).
   ===================================================================== */

export const TEMPO_PRESETS = [
  { tempo: "2-0-2-0", label: "Contrôlé" },
  { tempo: "3-0-1-0", label: "Excentrique lent" },
  { tempo: "3-2-1-0", label: "Pause étirée" },
  { tempo: "2-0-X-0", label: "Concentrique explosif" },
  { tempo: "4-1-X-1", label: "Tempo lent + explosif" },
];

const clampVal = (p) => {
  if (/^x$/i.test(p)) return "X";
  const n = Number(String(p).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.min(20, Math.round(n))) : null;
};

/* « 3-1-X-0 » → { e, pb, c, pt } ; { special: "ISO" | "EXPLO" } ; { raw } si illisible ; null si vide */
export function parseTempo(str) {
  const s = String(str ?? "").trim();
  if (!s) return null;
  if (/^iso/i.test(s)) return { special: "ISO" };
  if (/^explo/i.test(s)) return { special: "EXPLO" };
  const parts = s.split(/[-/\s.:]+/).filter(Boolean).map(clampVal);
  if (parts.some((v) => v == null)) return { raw: s };
  if (parts.length === 3) return { e: parts[0], pb: parts[1], c: parts[2], pt: 0, legacy: true };
  if (parts.length === 4) return { e: parts[0], pb: parts[1], c: parts[2], pt: parts[3] };
  return { raw: s };
}

export const formatTempo = (t) => `${t.e}-${t.pb}-${t.c}-${t.pt}`;

const secOf = (v) => (v === "X" ? 0.5 : Number(v) || 0);
/* Durée d'une répétition (s) ; X compte 0,5 s ; null si tempo spécial / illisible */
export const repSeconds = (t) => (t && !t.special && !t.raw ? secOf(t.e) + secOf(t.pb) + secOf(t.c) + secOf(t.pt) : null);

const DOWN_RE = /tirage\s*(vertical|poulie\s*haute|nuque|devant)|lat\s*-?\s*pull|pull\s*-?\s*down|push\s*-?\s*down|triceps.*poulie|poulie.*triceps|kick\s*-?\s*back/i;
const NEUTRAL_RE = /rowing|\brow\b|tirage\s*horizontal|face\s*-?\s*pull|pallof|pec\s*-?\s*deck|butterfly|chest\s*press|leg\s*press|presse\s*(à\s*cuisses|horizontale|inclinée)?|ecart[ée]|écart[ée]/i;
export const guessTempoDir = (name) => {
  const n = String(name || "");
  if (DOWN_RE.test(n)) return "down";
  if (NEUTRAL_RE.test(n)) return "neutral";
  return "up";
};
export const tempoDirOf = (ex) => (["up", "down", "neutral"].includes(ex?.tempoDir) ? ex.tempoDir : guessTempoDir(ex?.name));

/* Les 4 phases avec leur nom selon le sens du mouvement */
export function tempoPhases(t, dir = "up") {
  const up = dir === "up";
  const down = dir === "down";
  return [
    { key: "e", kind: "ecc", icon: up ? "⬇" : down ? "⬆" : "↩", label: up ? "Descente" : down ? "Montée" : "Retour", sub: "excentrique", v: t.e },
    { key: "pb", kind: "pause", icon: "⏸", label: up ? "Pause en bas" : down ? "Pause en haut" : "Pause étirée", sub: "position étirée", v: t.pb },
    { key: "c", kind: "con", icon: up ? "⬆" : down ? "⬇" : "↪", label: up ? "Montée" : down ? "Descente" : "Effort", sub: "concentrique", v: t.c },
    { key: "pt", kind: "pause", icon: "⏸", label: up ? "Pause en haut" : down ? "Pause en bas" : "Pause contractée", sub: "position contractée", v: t.pt },
  ];
}

export const fmtPhase = (v) => (v === "X" ? "X" : `${v} s`);

/* ISO : durée du maintien (s) et angle articulaire (°) réglés sur l'exercice (ex.isoSec, ex.isoAngle) */
export const ISO_SEC_PRESETS = [3, 5, 10, 20, 30];
export const ISO_ANGLE_PRESETS = [45, 60, 90, 110, 135];
export const isoInfoOf = (ex) => ({
  sec: Number(ex?.isoSec) > 0 ? Number(ex.isoSec) : null,
  angle: Number(ex?.isoAngle) > 0 ? Number(ex.isoAngle) : null,
});
/* Exercice en isométrie (tempo « ISO » ou ancien régime iso) : on compte des SÉRIES de maintiens.
   reps 0 ou 1 = un seul maintien par série ; reps > 1 = plusieurs maintiens séparés par ex.isoRepRest secondes
   (récup indiquée, sans chrono). */
export const isIsoEx = (ex) => parseTempo(ex?.tempo)?.special === "ISO" || String(ex?.contraction || "").startsWith("iso");
export const isoSchemeText = (ex) => {
  const s = Number(ex?.series) || 1;
  const r = Number(ex?.reps) || 0;
  const base = r > 1 ? `${s} × ${r} maintiens` : `${s} série${s > 1 ? "s" : ""}`;
  const rest = r > 1 && Number(ex?.isoRepRest) > 0 ? ` · ${ex.isoRepRest} s de récup entre les maintiens` : "";
  return base + rest;
};

/* Durée d'une rep pour un exercice (tempo en secondes, ou durée du maintien ISO) */
export const exRepSeconds = (ex) => {
  const t = parseTempo(ex?.tempo);
  if (t && t.special === "ISO") return isoInfoOf(ex).sec;
  return repSeconds(t);
};
