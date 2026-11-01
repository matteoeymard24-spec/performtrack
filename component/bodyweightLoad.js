/* bodyweightLoad.js — exercices au POIDS DU CORPS LESTÉ (tractions).
   Le RM d'une traction = poids du corps + lest (ex. 65 kg + 10 kg de lest = 75 kg), comme dans les
   barèmes (« Traction (charge totale) », standards SU Agen). La saisie reste le LEST ajouté
   (0 = poids du corps seul) ; l'app ajoute le poids du corps de l'athlète (profil) pour tous les calculs
   (RM, RM estimé du jour, charge conseillée, fatigue), puis ré-affiche la charge à prendre en lest.
   Si % × RM est inférieur au poids du corps → lest négatif = assistance (élastique) de cette valeur. */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const isLoadedBodyweight = (name) => {
  const n = norm(name);
  if (!/traction|pull ?-?up|chin ?-?up/.test(n)) return false;
  return !/australienne|elastique|assist|inverse|row|trx|horizontal/.test(n);
};

/* Charge totale d'une série (lest + poids du corps) ; inchangée pour les autres exercices */
export const totalLoad = (name, kg, bw) => {
  const k = Number(String(kg ?? "").replace(",", "."));
  if (!isLoadedBodyweight(name)) return Number.isFinite(k) ? k : null;
  if (!(bw > 0)) return Number.isFinite(k) ? k : null; // poids du corps inconnu : on ne peut pas ajouter
  return (Number.isFinite(k) ? k : 0) + Number(bw);
};

/* Texte du lest à prendre pour une charge totale visée */
export const lestText = (total, bw) => {
  if (!(total > 0) || !(bw > 0)) return null;
  const l = Math.round(total - bw);
  if (l > 0) return `+${l} kg de lest (total ${Math.round(total)} kg)`;
  if (l === 0) return `poids du corps seul (${Math.round(total)} kg)`;
  return `assistance de ${-l} kg (élastique) — total ${Math.round(total)} kg`;
};
