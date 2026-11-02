/* =====================================================================
   contraction.js — RÉGIME DE CONTRACTION d'un exercice de muscu.

   • classique      : concentrique + excentrique normal. Tout fonctionne comme avant
                      (RIR prédit, ajustement de charge, mise à jour du RM). Max 100 %.
   • excentrique    : excentrique accentué / supramaximal (105-120 % du RM concentrique).
                      La force excentrique dépasse la force concentrique de ≈ 20 à 60 %
                      (Hollander et al. 2007, J Strength Cond Res 21:34) : on peut donc
                      freiner une charge que l'on ne peut pas soulever.
   • iso_overcoming : isométrie « surmontante » : pousser / tirer au maximum contre des
                      butées. Au-dessus de 100 %, la barre ne peut pas bouger : l'intensité
                      réelle est l'effort maximal (Oranchuk et al. 2019, Scand J Med Sci Sports 29:484).
   • iso_yielding   : isométrie « cédante » : maintenir la charge immobile à un angle donné.

   Pour tous les régimes sauf « classique » :
     – la charge se calcule normalement (RM × %), jusqu'à 120 % ;
     – PAS de RIR prédit ni d'ajustement automatique : la table %RM ↔ reps (Zourdos 2016)
       n'est valable qu'en concentrique ;
     – les séries ne servent PAS à calculer / mettre à jour le RM (sinon 3 reps excentriques
       à 110 % donneraient un « RM » d'≈ 120 % du vrai et fausseraient toutes les charges).
   Compatibilité : un ancien exercice au tempo « ISO » est traité comme iso cédante.
   ===================================================================== */

export const CONTRACTIONS = [
  { id: "classique", label: "Classique (concentrique)", short: "" },
  { id: "excentrique", label: "Excentrique (supramax)", short: "EXC" },
  { id: "iso_overcoming", label: "Iso overcoming (contre butées)", short: "ISO-O" },
  { id: "iso_yielding", label: "Iso yielding (maintien)", short: "ISO-Y" },
];

export const SUPRA_MAX_PCT = 120;

export const contractionOf = (ex) => {
  const c = ex?.contraction;
  if (c && CONTRACTIONS.some((x) => x.id === c)) return c;
  return /^ISO\b/i.test(String(ex?.tempo || "").trim()) ? "iso_yielding" : "classique";
};

// La méthode 120-80 (excentrique supramaximal) suit les mêmes règles : pas de RIR prédit, pas de RM.
export const isSpecialContraction = (ex) => contractionOf(ex) !== "classique" || ex?.method === "m12080";

export const contractionLabel = (ex) => CONTRACTIONS.find((x) => x.id === contractionOf(ex))?.label || "";
export const contractionShort = (ex) => CONTRACTIONS.find((x) => x.id === contractionOf(ex))?.short || "";

/* Conseil affiché dans la construction de séance */
export const contractionTip = (ex) => {
  switch (contractionOf(ex)) {
    case "excentrique":
      return "Descente lente (3-5 s), 1 à 5 reps, 105-120 % du RM. Pareurs ou butées obligatoires ; la remontée se fait aidée. Pas de RIR prédit et pas de mise à jour du RM (la table %RM ↔ reps ne vaut qu'en concentrique).";
    case "iso_overcoming":
      return "Pousser au maximum contre les butées, 3-6 s par effort. À ≥ 100 % la barre ne bouge pas : c'est l'effort maximal qui compte, pas le %. Dans « Reps », mets le nombre d'efforts. Pas de mise à jour du RM.";
    case "iso_yielding":
      return "Maintenir la charge immobile à l'angle choisi. Dans « Reps », mets le nombre de maintiens (durée dans le tempo ou la description). Pas de RIR prédit ni de mise à jour du RM.";
    default:
      return "";
  }
};
