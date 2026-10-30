/* =====================================================================
   sessionLoad.js — charge interne d'une séance (méthode sRPE de Foster).

   Méthode de référence : sRPE = note GLOBALE de la séance (échelle CR-10 de Foster, 0 à 10)
   × durée de la séance en minutes (Foster et al. 2001, J Strength Cond Res 15:109). Validée en
   musculation (Day et al. 2004 ; Sweet et al. 2004) et chez les sprinteurs (IJSPP 2024 19(8):792).
   Foster recommande de demander la note ~30 min après la fin ; on la demande au clic sur
   « Terminer la séance » (compromis pratique, l'athlète peut juger la séance entière).

   Pourquoi pas la moyenne des RPE des séries : en muscu le RPE vient des reps en réserve
   (RIR, Zourdos 2016), en sprint / endurance c'est l'effort perçu de Foster — deux échelles
   différentes. Les mélanger dans une moyenne fausse la charge et crée des marches dans le REDI
   quand la façon de saisir change. Les RIR servent aux RM et aux alertes de prescription,
   la note globale sert à la charge.

   Repli (séances sans note globale, ex. anciennes) : moyenne des RPE saisis × durée.
   Durée : celle confirmée par l'athlète, sinon la durée prévue de la séance, sinon 60 min.
   ===================================================================== */
import { feedbackRpeValues } from "./sprintFeedback";

export const FOSTER_CR10 = {
  0: "Repos",
  1: "Très, très facile",
  2: "Facile",
  3: "Modéré",
  4: "Un peu difficile",
  5: "Difficile",
  6: "Difficile +",
  7: "Très difficile",
  8: "Très difficile +",
  9: "Très, très difficile",
  10: "Maximal",
};

const progressOf = (w, uid) => (w && uid ? w.userProgress?.[uid] || null : null);
const validRpe = (v) => v !== null && v !== undefined && v !== "" && Number(v) >= 0 && Number(v) <= 10;

/* Durée retenue pour la charge (min) */
export function sessionDurationMin(w, uid) {
  const p = progressOf(w, uid);
  const d = Number(p?.sessionDuration);
  if (d > 0 && d <= 300) return d;
  return Number(w?.estimatedDuration) > 0 ? Number(w.estimatedDuration) : 60;
}

/* RPE de la séance : note globale si elle existe, sinon moyenne des RPE saisis (null si rien) */
export function sessionRpe(w, uid) {
  const p = progressOf(w, uid);
  if (validRpe(p?.sessionRpe)) return Number(p.sessionRpe);
  const vals = [];
  Object.values(p?.feedback || {}).forEach((fb) => feedbackRpeValues(fb).forEach((v) => vals.push(v)));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/* Charge (UA) = RPE de séance × durée ; 0 si aucune note */
export function sessionLoad(w, uid) {
  const r = sessionRpe(w, uid);
  return r == null ? 0 : r * sessionDurationMin(w, uid);
}

/* La charge vient-elle de la note globale (méthode de Foster) ? */
export const hasSessionRpe = (w, uid) => validRpe(progressOf(w, uid)?.sessionRpe);
