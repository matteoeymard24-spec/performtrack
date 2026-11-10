/* =====================================================================
   injuryZones.js — reconnaître la ZONE d'une blessure ou d'une douleur, quels que soient les mots employés.

   Chaque zone canonique a ses synonymes (« cuisse arrière », « biceps fémoral », « semi-tendineux » → ischios ;
   « LCA », « ménisque », « rotule » → genou…) et une région (bas du corps / haut du corps / tronc).
   Le côté (droit / gauche) est lu quand il est écrit (« droit », « D », « gauche », « G »…).
   Deux textes désignent la même zone s'ils ont une zone canonique en commun et pas de côtés contradictoires.
   Utilisé par : douleur sur la zone blessée (coachSynthesis.js), récidives (InjuryHistory.jsx),
   RM liés à la blessure (injuryRm.js). Sans aucune zone reconnue, on retombe sur les mots communs.
   ===================================================================== */
const norm = (t) =>
  ` ${String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/* not : mots qui annulent la zone (« triceps sural » n'est pas le bras) */
export const ZONES = [
  { key: "ischio", region: "lower", label: "Ischio-jambiers", words: ["ischio", "biceps femoral", "semi tendin", "semi membran", "cuisse arriere", "arriere de la cuisse", "arriere cuisse", "loge posterieure de la cuisse", "hamstring"] },
  { key: "quadri", region: "lower", label: "Quadriceps", words: ["quadri", "droit femoral", "droit anterieur", "vaste", "cuisse avant", "avant de la cuisse", "devant de la cuisse"] },
  { key: "adducteur", region: "lower", label: "Adducteurs / aine", words: ["adduct", " aine ", "pubalg", "pubis", "inguinal"] },
  { key: "mollet", region: "lower", label: "Mollet", words: ["mollet", "gastrocnem", "jumeau", "jumeaux", "soleaire", "triceps sural"] },
  { key: "achille", region: "lower", label: "Tendon d'Achille", words: ["achille", "calcaneen"] },
  { key: "genou", region: "lower", label: "Genou", words: ["genou", "rotul", "menisq", " lca ", " lcp ", " lli ", "croise anterieur", "croise posterieur", "ligament croise", "patell", "tendon rotulien"] },
  { key: "cheville", region: "lower", label: "Cheville", words: ["cheville", "talus", "astragal", "malleol", "syndesmo", "tibio tarsien"] },
  { key: "pied", region: "lower", label: "Pied", words: [" pied", "orteil", "plantaire", "talon", "metatars", " voute", "hallux", "fasciite"] },
  { key: "hanche", region: "lower", label: "Hanche", words: ["hanche", "psoas", "flechisseur", "coxo", "trochanter"] },
  { key: "fessier", region: "lower", label: "Fessiers", words: ["fessier", "fesse", "piriforme", "pyramidal"] },
  { key: "tibia", region: "lower", label: "Jambe (tibia)", words: ["tibia", "perone", "fibula", "periostite"] },
  { key: "lombaire", region: "trunk", label: "Bas du dos", words: ["lombaire", "lombalg", "bas du dos", "rachis lombaire", "disque", "hernie", "sciatiq", "sacro", "lumbago"] },
  { key: "dorsal", region: "trunk", label: "Haut du dos", words: ["dorsal", "haut du dos", "rachis dorsal", "thorac"], not: ["grand dorsal"] },
  { key: "cervical", region: "trunk", label: "Cou / cervicales", words: ["cervical", "nuque", " cou ", "coup du lapin"] },
  { key: "abdo", region: "trunk", label: "Abdominaux", words: ["abdo", "oblique", "grand droit", "transverse"] },
  { key: "cote", region: "trunk", label: "Côtes", words: [" cote ", " cotes ", "costal"] },
  { key: "tete", region: "trunk", label: "Tête", words: [" tete ", "commotion", "crane", "visage", " nez ", "machoire", "arcade"] },
  { key: "epaule", region: "upper", label: "Épaule", words: ["epaule", "coiffe", "sus epineux", "supra epineux", "acromio", "clavic", "labrum", "deltoid", "glenohum", "omoplate", "scapul"] },
  { key: "coude", region: "upper", label: "Coude", words: ["coude", "epicondyl", "epitrochl", "olecran"] },
  { key: "poignet", region: "upper", label: "Poignet / main", words: ["poignet", " main", "doigt", "pouce", "scaphoid", "carpe", "phalange"] },
  { key: "pectoral", region: "upper", label: "Pectoraux", words: ["pector", " pec "] },
  { key: "bras", region: "upper", label: "Bras", words: ["biceps", "triceps", " bras", "brachial", "avant bras"], not: ["femoral", "sural"] },
  { key: "trapeze", region: "upper", label: "Trapèze", words: ["trapez", "rhomboid", "grand dorsal"] },
];

const SIDE_R = [" droit ", " droite ", " dt ", " d ", " dte "];
const SIDE_L = [" gauche ", " g ", " gche "];

/* { keys: [zones], side: "R" | "L" | null } */
export function zoneInfo(text) {
  const t = norm(text);
  const keys = ZONES.filter((z) => z.words.some((w) => t.includes(w)) && !(z.not || []).some((w) => t.includes(w))).map((z) => z.key);
  const r = SIDE_R.some((w) => t.includes(w));
  const l = SIDE_L.some((w) => t.includes(w));
  return { keys, side: r && !l ? "R" : l && !r ? "L" : null };
}
export const injuryZoneInfo = (inj) => zoneInfo(`${inj?.name || ""} ${inj?.zone || ""}`);

/* repli sans zone reconnue : un mot de 5 lettres ou plus en commun */
const wordsOf = (t) => norm(t).split(" ").filter((w) => w.length >= 5);
const shareWord = (a, b) => {
  const wb = wordsOf(b);
  return wordsOf(a).some((w) => wb.some((x) => x.slice(0, 5) === w.slice(0, 5)));
};

/* Deux textes désignent-ils la même zone ? */
export function sameZoneText(a, b) {
  const A = zoneInfo(a);
  const B = zoneInfo(b);
  if (A.side && B.side && A.side !== B.side) return false;
  if (A.keys.length && B.keys.length) return A.keys.some((k) => B.keys.includes(k));
  return shareWord(a, b);
}
export const injuryText = (inj) => `${inj?.name || ""} ${inj?.zone || ""}`;
export const sameInjuryZone = (a, b) => sameZoneText(injuryText(a), injuryText(b));

/* Région du corps d'une blessure : null si aucune zone reconnue */
export function zoneRegion(text) {
  const { keys } = zoneInfo(text);
  if (!keys.length) return null;
  const regions = [...new Set(keys.map((k) => ZONES.find((z) => z.key === k).region))];
  return regions.length === 1 ? regions[0] : regions.includes("lower") ? "lower" : regions[0];
}
