/* =====================================================================
   dumbbell.js — exercices aux HALTÈRES.
   Reconnus d'après le nom (« haltère(s) », « dumbbell », « DB ») : tout nouvel exercice dont le nom
   contient « haltère » est donc traité automatiquement comme tel.
   Convention de l'app : la charge ENREGISTRÉE (feedback, RM) est le TOTAL des deux haltères pour un
   exercice bilatéral (ex. 2 × 30 kg = 60 kg) — c'est elle qui sert au RM et aux % de charge.
   L'athlète saisit et voit le poids PAR HALTÈRE ; l'app double / divise.
   Exercice unilatéral aux haltères : la charge = UN haltère (rien à diviser).
   ===================================================================== */
export const DB_RE = /halt[eè]re|dumbbell|\bdb\b/i;
export const isDumbbell = (name) => DB_RE.test(String(name || ""));
/* Exercice bilatéral aux haltères (charge enregistrée = total des deux) */
export const isDbBilateral = (name, uni = false) => isDumbbell(name) && !uni;
/* Poids par haltère, arrondi au 0,5 kg */
export const perHand = (total) => Math.round((Number(total) / 2) * 2) / 2;
/* « 60 kg · 2 × 30 kg » pour un bilatéral aux haltères, sinon « 60 kg » */
export const dbText = (kg, name, uni = false) => {
  const k = Number(kg);
  if (!(k > 0)) return null;
  return isDbBilateral(name, uni) ? `2 × ${perHand(k)} kg` : null;
};
