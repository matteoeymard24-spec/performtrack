/* =====================================================================
   nutritionData.js — données et calculs du module Nutrition.

   • Aliments : valeurs moyennes pour 100 g (ou 100 ml), arrondies, d'après les tables
     Ciqual (ANSES) et USDA. Glucides = glucides disponibles (fibres à part, convention
     européenne). Ce sont des ordres de grandeur : une étiquette précise prime toujours.
   • Références vitamines / minéraux : ANSES (adultes 18 ans et +), RNP ou AS.
   • Repères sportifs : ACSM / AND / Dietitians of Canada 2016 (glucides g/kg selon la charge),
     ISSN (protéines 1,4-2,0 g/kg ; plus en déficit), ACSM (hydratation).
   ===================================================================== */

/* ---- Nutriments suivis ---- */
import { MORE_FOODS } from "./foodsMore";
import { RECIPES } from "./recipes";

export const MACROS = [
  { k: "kcal", label: "Énergie", unit: "kcal", dec: 0 },
  { k: "p", label: "Protéines", unit: "g", dec: 0 },
  { k: "c", label: "Glucides", unit: "g", dec: 0 },
  { k: "f", label: "Lipides", unit: "g", dec: 0 },
  { k: "fib", label: "Fibres", unit: "g", dec: 0 },
];
export const MICROS = [
  { k: "fe", label: "Fer", unit: "mg", dec: 1, why: "transport de l'oxygène, fatigue si carence" },
  { k: "ca", label: "Calcium", unit: "mg", dec: 0, why: "os, contraction musculaire" },
  { k: "mg", label: "Magnésium", unit: "mg", dec: 0, why: "énergie, fonction neuromusculaire" },
  { k: "k", label: "Potassium", unit: "mg", dec: 0, why: "équilibre hydrique, contraction" },
  { k: "na", label: "Sodium", unit: "mg", dec: 0, why: "hydratation (pertes par la sueur)", limit: true },
  { k: "zn", label: "Zinc", unit: "mg", dec: 1, why: "immunité, récupération" },
  { k: "vc", label: "Vitamine C", unit: "mg", dec: 0, why: "immunité, collagène, absorption du fer" },
  { k: "vd", label: "Vitamine D", unit: "µg", dec: 1, why: "os, muscle, immunité (souvent basse en hiver)" },
  { k: "b12", label: "Vitamine B12", unit: "µg", dec: 1, why: "globules rouges, système nerveux" },
  { k: "b9", label: "Folates (B9)", unit: "µg", dec: 0, why: "globules rouges, renouvellement cellulaire" },
  { k: "o3", label: "Oméga-3 EPA + DHA", unit: "mg", dec: 0, why: "anti-inflammatoire, cœur, cerveau" },
];
export const NUTRIENT_KEYS = [...MACROS, ...MICROS].map((n) => n.k);
export const NUT = Object.fromEntries([...MACROS, ...MICROS].map((n) => [n.k, n]));

/* Références ANSES adultes (18 ans et +). sex : "M" | "F". ironHigh : pertes menstruelles élevées.
   Oméga-3 EPA+DHA : 250 mg/j chacun (ANSES 2011) → 500 mg ; sodium : AS 1500 mg (et plafond conseillé ~2300 mg). */
export function microTargets({ sex = "M", age = 25, ironHigh = false } = {}) {
  const F = sex === "F";
  return {
    fe: F && ironHigh ? 16 : 11,
    ca: age && age < 25 ? 1000 : 950,
    mg: F ? 300 : 380,
    k: 3500,
    na: 1500,
    zn: F ? 9.3 : 11.7, // apport en phytates « moyen » (600 mg/j)
    vc: 110,
    vd: 15,
    b12: 4,
    b9: 330,
    o3: 500,
    fib: 30,
  };
}

/* ---- Aliments ----
   [id, nom, catégorie, kcal, prot, gluc, lip, fib, fer, Ca, Mg, K, Na, Zn, vitC, vitD, B12, B9, O3, portion?]
   portion = [libellé, grammes] pour saisir « 2 œufs », « 1 banane »… */
const F = (id, name, cat, kcal, p, c, f, fib, fe, ca, mg, k, na, zn, vc, vd, b12, b9, o3, portion) => ({
  id, name, cat, n: { kcal, p, c, f, fib, fe, ca, mg, k, na, zn, vc, vd, b12, b9, o3 }, portion,
});
export const FOOD_CATS = {
  feculent: "🍚 Féculents & céréales",
  legumineuse: "🫘 Légumineuses",
  viande: "🍗 Viandes",
  poisson: "🐟 Poissons",
  oeuf: "🥚 Œufs",
  vegprot: "🌱 Protéines végétales",
  laitier: "🥛 Produits laitiers",
  legume: "🥦 Légumes",
  fruit: "🍎 Fruits",
  gras: "🥑 Matières grasses & oléagineux",
  sucre: "🍯 Sucré",
  boisson: "🥤 Boissons",
  sport: "🏃 Produits du sport",
  condiment: "🧂 Sauces & condiments",
};
export const FOODS = [
  // féculents (cuits sauf mention)
  F("riz_blanc", "Riz blanc cuit", "feculent", 130, 2.7, 28, 0.3, 0.4, 0.2, 10, 12, 35, 1, 0.5, 0, 0, 0, 3, 0),
  F("riz_complet", "Riz complet cuit", "feculent", 123, 2.7, 24, 1, 1.6, 0.6, 3, 39, 86, 4, 0.7, 0, 0, 0, 4, 0),
  F("pates", "Pâtes cuites", "feculent", 158, 5.8, 30, 0.9, 1.8, 0.5, 7, 18, 44, 1, 0.5, 0, 0, 0, 7, 0),
  F("pates_comp", "Pâtes complètes cuites", "feculent", 149, 6, 26, 1.7, 3.9, 1.7, 18, 54, 96, 4, 1.1, 0, 0, 0, 5, 0),
  F("quinoa", "Quinoa cuit", "feculent", 120, 4.4, 18.5, 1.9, 2.8, 1.5, 17, 64, 172, 7, 1.1, 0, 0, 0, 42, 0),
  F("semoule", "Semoule / couscous cuit", "feculent", 112, 3.8, 22, 0.2, 1.4, 0.4, 8, 8, 58, 5, 0.3, 0, 0, 0, 15, 0),
  F("pdt", "Pomme de terre cuite à l'eau", "feculent", 86, 1.9, 18, 0.1, 1.8, 0.3, 5, 22, 379, 4, 0.3, 13, 0, 0, 10, 0),
  F("patate_douce", "Patate douce cuite", "feculent", 90, 2, 17.5, 0.2, 3.3, 0.7, 38, 27, 475, 36, 0.3, 19.6, 0, 0, 6, 0),
  F("avoine", "Flocons d'avoine (crus)", "feculent", 379, 13.2, 58, 6.5, 10.1, 4.3, 52, 138, 362, 6, 3.6, 0, 0, 0, 32, 0, ["portion de 40 g", 40]),
  F("pain_complet", "Pain complet", "feculent", 245, 9, 41, 2.5, 7, 2.5, 30, 80, 250, 480, 1.8, 0, 0, 0, 40, 0, ["tranche", 35]),
  F("baguette", "Baguette", "feculent", 272, 9, 55, 1.5, 3, 1, 20, 25, 140, 500, 0.8, 0, 0, 0, 30, 0, ["1/4 de baguette", 60]),
  F("galette_riz", "Galettes de riz soufflé", "feculent", 387, 8, 80, 3, 4, 0.9, 11, 131, 290, 10, 2.4, 0, 0, 0, 20, 0, ["galette", 9]),
  F("muesli", "Muesli sans sucre ajouté", "feculent", 360, 10, 60, 6, 8, 3, 50, 100, 400, 20, 2.2, 1, 0, 0, 40, 0, ["bol de 50 g", 50]),
  // légumineuses
  F("lentilles", "Lentilles cuites", "legumineuse", 116, 9, 16, 0.4, 7.9, 3.3, 19, 36, 369, 2, 1.3, 1.5, 0, 0, 181, 0),
  F("pois_chiches", "Pois chiches cuits", "legumineuse", 164, 8.9, 20, 2.6, 7.6, 2.9, 49, 48, 291, 7, 1.5, 1.3, 0, 0, 172, 0),
  F("haricots_rouges", "Haricots rouges cuits", "legumineuse", 127, 8.7, 16.5, 0.5, 6.4, 2.9, 35, 45, 405, 2, 1, 1.2, 0, 0, 130, 0),
  // viandes (cuites)
  F("poulet", "Blanc de poulet cuit", "viande", 165, 31, 0, 3.6, 0, 1, 15, 29, 256, 74, 1, 0, 0.1, 0.3, 4, 20),
  F("dinde", "Escalope de dinde cuite", "viande", 135, 29, 0, 1.7, 0, 0.7, 10, 30, 300, 60, 1.7, 0, 0.1, 0.4, 7, 10),
  F("boeuf5", "Bœuf haché 5 % cuit", "viande", 164, 25.4, 0, 6.4, 0, 2.9, 7, 25, 390, 66, 6.2, 0, 0.1, 2.4, 9, 20, ["steak haché", 100]),
  F("boeuf15", "Bœuf haché 15 % cuit", "viande", 250, 26, 0, 16, 0, 2.6, 15, 21, 360, 75, 6, 0, 0.1, 2.6, 9, 30, ["steak haché", 100]),
  F("porc", "Filet de porc cuit", "viande", 143, 26, 0, 3.5, 0, 1, 6, 28, 420, 57, 2.4, 0.3, 0.5, 0.6, 1, 0),
  F("jambon", "Jambon blanc", "viande", 115, 20, 1, 3.5, 0, 0.6, 8, 20, 300, 760, 1.6, 0, 0.3, 0.5, 3, 0, ["tranche", 40]),
  // poissons
  F("saumon", "Saumon cuit", "poisson", 206, 22, 0, 12.4, 0, 0.3, 15, 30, 384, 61, 0.4, 0, 11, 2.8, 34, 2000),
  F("thon", "Thon au naturel (égoutté)", "poisson", 116, 26, 0, 1, 0, 1.3, 11, 27, 237, 300, 0.8, 0, 1.7, 2.5, 4, 270, ["boîte égouttée", 112]),
  F("cabillaud", "Cabillaud cuit", "poisson", 105, 23, 0, 0.9, 0, 0.5, 14, 42, 244, 78, 0.6, 1, 1.2, 1, 8, 160),
  F("sardines", "Sardines à l'huile (égouttées)", "poisson", 208, 24.6, 0, 11.5, 0, 2.9, 382, 39, 397, 307, 1.3, 0, 4.8, 8.9, 10, 980, ["boîte égouttée", 90]),
  F("maquereau", "Maquereau cuit", "poisson", 262, 23.9, 0, 17.8, 0, 1.6, 15, 97, 401, 83, 0.9, 0.4, 16, 19, 2, 1600),
  F("crevettes", "Crevettes cuites", "poisson", 99, 24, 0.2, 0.3, 0, 0.5, 70, 39, 260, 400, 1.6, 0, 0, 1.5, 3, 300),
  // œufs
  F("oeuf", "Œuf entier", "oeuf", 143, 12.6, 0.7, 9.5, 0, 1.8, 56, 12, 138, 142, 1.3, 0, 2, 0.9, 47, 60, ["œuf", 50]),
  F("blanc_oeuf", "Blanc d'œuf", "oeuf", 52, 10.9, 0.7, 0.2, 0, 0.1, 7, 11, 163, 166, 0, 0, 0, 0.1, 4, 0, ["blanc", 33]),
  // protéines végétales
  F("tofu", "Tofu nature", "vegprot", 125, 13, 1.5, 7.5, 1, 2.2, 350, 50, 150, 10, 1.3, 0, 0, 0, 25, 0),
  F("tempeh", "Tempeh", "vegprot", 192, 20, 7.6, 10.8, 5, 2.7, 111, 81, 412, 9, 1.1, 0, 0, 0.1, 24, 0),
  // laitiers
  F("lait", "Lait demi-écrémé", "laitier", 46, 3.3, 4.8, 1.6, 0, 0, 120, 11, 150, 44, 0.4, 1, 0, 0.4, 5, 0, ["verre de 250 ml", 250]),
  F("yaourt", "Yaourt nature", "laitier", 55, 4.3, 5.5, 1.4, 0, 0.1, 150, 14, 190, 55, 0.5, 1, 0, 0.3, 10, 0, ["pot", 125]),
  F("fromage_blanc", "Fromage blanc 3 %", "laitier", 75, 7.5, 3.8, 3.2, 0, 0.1, 115, 10, 150, 40, 0.5, 0, 0, 0.5, 13, 0, ["pot de 100 g", 100]),
  F("skyr", "Skyr nature", "laitier", 63, 11, 4, 0.2, 0, 0.1, 150, 12, 150, 50, 0.6, 0, 0, 0.6, 10, 0, ["pot", 150]),
  F("emmental", "Emmental", "laitier", 380, 28.5, 0, 29.5, 0, 0.3, 1050, 38, 100, 280, 4.4, 0, 0.6, 3, 10, 0, ["portion", 30]),
  F("camembert", "Camembert", "laitier", 270, 20, 0.5, 21, 0, 0.3, 380, 20, 150, 650, 2.4, 0, 0.4, 1.3, 60, 0, ["portion", 30]),
  F("mozza", "Mozzarella", "laitier", 250, 18, 1, 19.5, 0, 0.4, 500, 20, 76, 400, 2.9, 0, 0.4, 2.3, 7, 0, ["boule", 125]),
  // légumes
  F("brocoli", "Brocoli cuit", "legume", 35, 2.4, 3.9, 0.4, 3.3, 0.7, 40, 21, 293, 41, 0.5, 65, 0, 0, 108, 0),
  F("epinards", "Épinards cuits", "legume", 23, 3, 1.4, 0.3, 2.4, 3.6, 136, 87, 466, 70, 0.8, 9.8, 0, 0, 146, 0),
  F("haricots_verts", "Haricots verts cuits", "legume", 35, 1.9, 4.7, 0.3, 3.2, 0.7, 44, 18, 146, 1, 0.3, 9.7, 0, 0, 33, 0),
  F("carotte", "Carotte crue", "legume", 41, 0.9, 6.8, 0.2, 2.8, 0.3, 33, 12, 320, 69, 0.2, 5.9, 0, 0, 19, 0, ["carotte", 80]),
  F("tomate", "Tomate", "legume", 18, 0.9, 2.7, 0.2, 1.2, 0.3, 10, 11, 237, 5, 0.2, 13.7, 0, 0, 15, 0, ["tomate", 120]),
  F("salade", "Salade verte", "legume", 15, 1.4, 1.5, 0.2, 1.3, 0.9, 36, 13, 194, 28, 0.2, 9, 0, 0, 38, 0, ["bol", 50]),
  F("courgette", "Courgette cuite", "legume", 17, 1.1, 2.7, 0.4, 1, 0.4, 18, 18, 260, 3, 0.3, 13, 0, 0, 20, 0),
  F("poivron", "Poivron rouge cru", "legume", 31, 1, 4, 0.3, 2.1, 0.4, 7, 12, 211, 4, 0.3, 128, 0, 0, 46, 0, ["poivron", 150]),
  F("champignons", "Champignons de Paris cuits", "legume", 28, 2.2, 3.3, 0.5, 2.2, 1.7, 6, 12, 356, 2, 0.9, 4, 0.2, 0, 18, 0),
  // fruits
  F("banane", "Banane", "fruit", 90, 1.1, 20, 0.3, 2.6, 0.3, 5, 27, 360, 1, 0.2, 8.7, 0, 0, 20, 0, ["banane", 120]),
  F("pomme", "Pomme", "fruit", 52, 0.3, 12, 0.2, 2.4, 0.1, 6, 5, 107, 1, 0, 4.6, 0, 0, 3, 0, ["pomme", 150]),
  F("orange", "Orange", "fruit", 47, 0.9, 9.4, 0.1, 2.4, 0.1, 40, 10, 181, 0, 0.1, 53, 0, 0, 30, 0, ["orange", 150]),
  F("kiwi", "Kiwi", "fruit", 61, 1.1, 11.7, 0.5, 3, 0.3, 34, 17, 312, 3, 0.1, 93, 0, 0, 25, 0, ["kiwi", 75]),
  F("fruits_rouges", "Fruits rouges (myrtilles…)", "fruit", 57, 0.7, 12, 0.3, 2.4, 0.3, 6, 6, 77, 1, 0.2, 9.7, 0, 0, 6, 0, ["poignée", 80]),
  F("raisins_secs", "Raisins secs", "fruit", 299, 3.1, 75, 0.5, 3.7, 1.9, 50, 32, 749, 11, 0.2, 2.3, 0, 0, 5, 0, ["poignée", 30]),
  F("dattes", "Dattes sèches", "fruit", 282, 2.5, 67, 0.4, 8, 1, 39, 43, 656, 2, 0.3, 0.4, 0, 0, 19, 0, ["datte", 8]),
  F("compote", "Compote sans sucre ajouté", "fruit", 50, 0.2, 11, 0.1, 1.5, 0.2, 4, 3, 75, 2, 0, 2, 0, 0, 1, 0, ["gourde", 90]),
  // matières grasses / oléagineux
  F("huile_olive", "Huile d'olive", "gras", 899, 0, 0, 100, 0, 0.6, 1, 0, 1, 2, 0, 0, 0, 0, 0, 0, ["cuillère à soupe", 10]),
  F("huile_colza", "Huile de colza", "gras", 899, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ["cuillère à soupe", 10]),
  F("beurre", "Beurre doux", "gras", 745, 0.7, 0.6, 82, 0, 0, 15, 2, 24, 11, 0.1, 0, 1.5, 0.2, 3, 0, ["noisette", 10]),
  F("amandes", "Amandes", "gras", 600, 21, 9, 50, 12.5, 3.7, 270, 270, 733, 1, 3.1, 0, 0, 0, 44, 0, ["poignée", 25]),
  F("noix", "Noix", "gras", 654, 15.2, 7, 65, 6.7, 2.9, 98, 158, 441, 2, 3.1, 1.3, 0, 0, 98, 0, ["poignée", 25]),
  F("beurre_cacahuete", "Beurre de cacahuète", "gras", 590, 25, 14, 50, 6, 1.9, 45, 170, 560, 400, 2.8, 0, 0, 0, 90, 0, ["cuillère à soupe", 15]),
  F("avocat", "Avocat", "gras", 160, 2, 1.8, 14.7, 6.7, 0.6, 12, 29, 485, 7, 0.6, 10, 0, 0, 81, 0, ["demi-avocat", 75]),
  F("chocolat_noir", "Chocolat noir 70 %", "gras", 580, 7.8, 35, 42.6, 10.9, 11.9, 73, 228, 715, 20, 3.3, 0, 0, 0, 10, 0, ["carré", 10]),
  // sucré / boissons / sport
  F("miel", "Miel", "sucre", 304, 0.3, 82, 0, 0.2, 0.4, 6, 2, 52, 4, 0.2, 0.5, 0, 0, 2, 0, ["cuillère à café", 7]),
  F("confiture", "Confiture", "sucre", 250, 0.4, 62, 0.1, 1, 0.3, 15, 5, 80, 20, 0, 5, 0, 0, 2, 0, ["cuillère à café", 10]),
  F("croissant", "Croissant", "sucre", 406, 8.2, 43, 21, 2.6, 1.5, 37, 16, 118, 380, 0.8, 0, 0.3, 0.2, 40, 0, ["croissant", 60]),
  F("barre_cereales", "Barre de céréales", "sucre", 400, 6, 68, 12, 4, 1.5, 40, 50, 200, 100, 1, 0, 0, 0, 15, 0, ["barre", 25]),
  F("jus_orange", "Jus d'orange", "boisson", 45, 0.7, 10, 0.2, 0.2, 0.2, 11, 11, 200, 1, 0.1, 50, 0, 0, 30, 0, ["verre de 200 ml", 200]),
  F("boisson_sport", "Boisson de l'effort", "sport", 24, 0, 6, 0, 0, 0, 1, 1, 12, 41, 0, 0, 0, 0, 0, 0, ["gourde de 500 ml", 500]),
  F("whey_food", "Whey (poudre)", "sport", 380, 78, 8, 5, 0, 0.5, 500, 120, 600, 200, 2, 0, 0, 1, 10, 0, ["dose de 30 g", 30]),
  // base étendue (foodsMore.js)
  ...MORE_FOODS.map((r) => F(...r)),
];
// origine animale cachée dans une autre catégorie (filtrage végétarien / pescétarien)
const SRC = { sauce_nuoc_mam: "poisson", anchois: "poisson" };
FOODS.forEach((f) => {
  if (SRC[f.id]) f.src = SRC[f.id];
});
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export const MEAT_CATS = ["viande"];
export const FISH_CATS = ["poisson"];
export const DIETS = [
  { id: "omni", label: "Omnivore" },
  { id: "pesce", label: "Pescétarien" },
  { id: "vege", label: "Végétarien" },
];
export const allowedByDiet = (food, diet) => {
  const c = food?.src || food?.cat;
  return diet === "vege" ? !MEAT_CATS.includes(c) && !FISH_CATS.includes(c) : diet === "pesce" ? !MEAT_CATS.includes(c) : true;
};

/* Nutriments d'une quantité d'aliment (n = valeurs pour 100 g) */
export const scaleN = (n, grams) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, ((Number(n?.[k]) || 0) * (Number(grams) || 0)) / 100]));
export const sumN = (list) => {
  const out = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  (list || []).forEach((n) => NUTRIENT_KEYS.forEach((k) => (out[k] += Number(n?.[k]) || 0)));
  return out;
};

/* ---- Repas ---- */
export const MEALS = [
  { id: "petitdej", label: "Petit-déjeuner", icon: "🌅", share: 0.25 },
  { id: "dejeuner", label: "Déjeuner", icon: "☀️", share: 0.35 },
  { id: "collation", label: "Collation", icon: "🍎", share: 0.1 },
  { id: "seance", label: "Autour de la séance", icon: "🏃", share: 0 },
  { id: "diner", label: "Dîner", icon: "🌙", share: 0.3 },
];
/* Répartition du menu selon la journée :
   • jour d'entraînement / match : une prise « autour de la séance » (avant ou après), plus grosse si les besoins sont élevés
   • jour de repos : pas de prise autour de la séance (4 repas, ou 5 si les besoins sont très élevés → collation plus grosse)
   dayId absent (anciens appels) : comportement d'avant (5e prise au-delà de ~3 200 kcal) */
export const menuShares = (kcal, dayId) => {
  if (dayId === "repos")
    return kcal > 3200
      ? { petitdej: 0.25, dejeuner: 0.32, collation: 0.15, seance: 0, diner: 0.28 }
      : { petitdej: 0.25, dejeuner: 0.35, collation: 0.1, seance: 0, diner: 0.3 };
  if (dayId)
    return kcal > 3200
      ? { petitdej: 0.22, dejeuner: 0.28, collation: 0.1, seance: 0.15, diner: 0.25 }
      : { petitdej: 0.23, dejeuner: 0.32, collation: 0.08, seance: 0.1, diner: 0.27 };
  return kcal > 3200
    ? { petitdej: 0.22, dejeuner: 0.28, collation: 0.12, seance: 0.13, diner: 0.25 }
    : { petitdej: 0.25, dejeuner: 0.35, collation: 0.1, seance: 0, diner: 0.3 };
};

/* ---- Objectifs ---- */
export const GOALS = [
  { id: "seche", label: "Sèche / perte de gras", icon: "🔥", protein: 2.2, fatPct: 0.25, rates: [0.25, 0.5, 0.75], defRate: 0.5, sign: -1 },
  { id: "recompo", label: "Recomposition", icon: "⚖️", protein: 2.2, fatPct: 0.25, rates: [], defRate: 0, sign: 0, pct: -0.1 },
  { id: "maintien", label: "Maintien", icon: "🎯", protein: 1.6, fatPct: 0.28, rates: [], defRate: 0, sign: 0 },
  { id: "perf", label: "Performance (charge élevée)", icon: "⚡", protein: 1.7, fatPct: 0.25, rates: [], defRate: 0, sign: 0 },
  { id: "prise", label: "Prise de masse", icon: "💪", protein: 1.8, fatPct: 0.27, rates: [0.1, 0.25, 0.5], defRate: 0.25, sign: 1 },
];
export const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g]));
/* Niveau d'activité global (sport compris) : facteur multiplié au métabolisme de base */
export const PAL = [
  { id: 1.4, label: "Peu actif", sub: "travail assis, sport ≤ 2×/sem" },
  { id: 1.55, label: "Actif", sub: "sport 3-4×/sem" },
  { id: 1.7, label: "Très actif", sub: "sport 5-6×/sem" },
  { id: 1.9, label: "Athlète", sub: "entraînement quotidien" },
  { id: 2.1, label: "Athlète ++", sub: "2 séances / jour" },
];
/* Type de journée : ajuste l'énergie et donne la fourchette de glucides (g/kg, ACSM 2016) */
export const DAY_TYPES = [
  { id: "repos", label: "Repos", icon: "😴", kcal: -0.1, carbs: [3, 5], trainMin: 0 },
  { id: "leger", label: "Séance légère", icon: "🚶", kcal: 0, carbs: [4, 5], trainMin: 45 },
  { id: "modere", label: "Séance modérée (~1 h)", icon: "🏋️", kcal: 0.05, carbs: [5, 7], trainMin: 60 },
  { id: "intense", label: "Intense / 2 séances", icon: "🔥", kcal: 0.12, carbs: [6, 10], trainMin: 120 },
  { id: "match", label: "Match / compétition", icon: "🏉", kcal: 0.15, carbs: [7, 10], trainMin: 90 },
];
export const DAY_BY_ID = Object.fromEntries(DAY_TYPES.map((d) => [d.id, d]));

/* Métabolisme de base : Katch-McArdle si % de masse grasse connu, sinon Mifflin-St Jeor */
export function bmrOf({ sex = "M", age = 25, height = 175, weight = 75, bodyFat = null }) {
  const w = Number(weight) || 0;
  const bf = Number(bodyFat);
  if (bf > 3 && bf < 60) return { v: 370 + 21.6 * w * (1 - bf / 100), how: "Katch-McArdle (masse maigre)" };
  return { v: 10 * w + 6.25 * (Number(height) || 0) - 5 * (Number(age) || 25) + (sex === "F" ? -161 : 5), how: "Mifflin-St Jeor" };
}

/* Besoins du jour. s = réglages ; dayType = id de DAY_TYPES */
export function computeTargets(s, dayType = "modere") {
  const w = Number(s.weight) || 0;
  if (!w || !s.height) return null;
  const goal = GOAL_BY_ID[s.goal] || GOAL_BY_ID.maintien;
  const bmr = bmrOf(s);
  const tdee = bmr.v * (Number(s.pal) || 1.7);
  const day = DAY_BY_ID[dayType] || DAY_BY_ID.modere;
  // écart lié à l'objectif : vitesse (kg/sem) × 7700 kcal/kg ÷ 7, plafonné à 25 % de la dépense
  let adj = 0;
  if (goal.sign && s.rate) adj = (goal.sign * Number(s.rate) * 7700) / 7;
  if (goal.pct) adj = goal.pct * tdee;
  adj = Math.max(-0.25 * tdee, Math.min(0.2 * tdee, adj));
  const kcal = Math.round((tdee + adj) * (1 + day.kcal));
  const protein = Math.round((Number(s.proteinPerKg) || goal.protein) * w);
  const fat = Math.round(Math.max(0.7 * w, ((Number(s.fatPct) || goal.fatPct) * kcal) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const micro = microTargets({ sex: s.sex, age: Number(s.age) || 25, ironHigh: !!s.ironHigh });
  // eau : ~35 ml/kg + ~600 ml par heure d'entraînement (à ajuster selon la sueur)
  const water = Math.round((35 * w + (day.trainMin / 60) * 600) / 50) * 50;
  return {
    kcal,
    p: protein,
    c: carbs,
    f: fat,
    fib: micro.fib,
    micro,
    water,
    bmr: Math.round(bmr.v),
    bmrHow: bmr.how,
    tdee: Math.round(tdee),
    adj: Math.round(adj),
    day,
    carbsPerKg: Math.round((carbs / w) * 10) / 10,
    carbsRange: day.carbs,
    proteinPerKg: Math.round((protein / w) * 10) / 10,
  };
}

/* ---- Compléments ----
   n = apports par unité ; evidence : A (preuves solides en sport, AIS/IOC 2018), B (possible), C (seulement si carence). */
export const SUPPLEMENTS = [
  { id: "whey", name: "Whey (protéines)", unit: "dose de 30 g", n: { kcal: 113, p: 23.4, c: 2.4, f: 1.5, ca: 150, k: 180, na: 60, mg: 36 }, evidence: "A", tip: "Pratique pour atteindre l'objectif protéique, surtout après la séance (20-40 g)." },
  { id: "creatine", name: "Créatine monohydrate", unit: "dose de 5 g", n: {}, evidence: "A", tip: "3-5 g/jour, tous les jours, à n'importe quelle heure. Améliore force, puissance et efforts répétés." },
  { id: "cafeine", name: "Caféine", unit: "gélule de 200 mg", n: {}, evidence: "A", tip: "3 mg/kg 30-60 min avant l'effort. Pas dans les 8 h avant le coucher (sommeil).", caffeineMg: 200 },
  { id: "vitd", name: "Vitamine D3", unit: "dose de 1 000 UI (25 µg)", n: { vd: 25 }, evidence: "C", tip: "Utile d'octobre à mars ou si un dosage sanguin est bas." },
  { id: "omega3", name: "Oméga-3 (huile de poisson)", unit: "capsule (≈ 300 mg EPA+DHA)", n: { kcal: 9, f: 1, o3: 300 }, evidence: "B", tip: "Si tu manges peu de poisson gras (< 2 fois/semaine)." },
  { id: "magnesium", name: "Magnésium", unit: "dose de 150 mg", n: { mg: 150 }, evidence: "C", tip: "Seulement si les apports sont bas ; au-delà de 250 mg/j en complément, risque de troubles digestifs." },
  { id: "fer", name: "Fer", unit: "comprimé de 14 mg", n: { fe: 14 }, evidence: "C", tip: "Uniquement sur avis médical après une prise de sang (ferritine basse) : un excès de fer est nocif." },
  { id: "multi", name: "Multivitamines", unit: "comprimé (100 % VNR)", n: { vc: 80, vd: 5, b12: 2.5, b9: 200, zn: 10, fe: 14, mg: 56, ca: 120 }, evidence: "C", tip: "Peu utile si l'alimentation est variée ; dépanne en période de restriction." },
  { id: "electrolytes", name: "Électrolytes", unit: "comprimé (pour 500 ml)", n: { na: 450, k: 100, mg: 50 }, evidence: "B", tip: "Séances longues, chaleur, gros sueurs (sel sur les vêtements)." },
  { id: "malto", name: "Maltodextrine", unit: "dose de 30 g", n: { kcal: 114, c: 28.5 }, evidence: "A", tip: "Glucides pendant l'effort > 60-90 min (30-60 g/h)." },
  { id: "collagene", name: "Collagène + vitamine C", unit: "dose de 15 g + 50 mg vit. C", n: { kcal: 54, p: 13.5, vc: 50 }, evidence: "B", tip: "30-60 min avant une séance de prévention / rééducation tendons et ligaments." },
  { id: "betterave", name: "Jus de betterave (nitrates)", unit: "shot de 70 ml", n: { kcal: 70, c: 15, k: 300 }, evidence: "A", tip: "2-3 h avant un effort de 1 à 30 min ; effet plus faible chez les très entraînés." },
];
export const SUPP_BY_ID = Object.fromEntries(SUPPLEMENTS.map((s) => [s.id, s]));
export const EVIDENCE = {
  A: { label: "Preuves solides", color: "#4fae7d" },
  B: { label: "Preuves possibles", color: "#e0a13d" },
  C: { label: "Si carence / besoin", color: "#a8a199" },
};

/* ---- Menus : recettes (recipes.js), classées par cuisine ----
   Chaque recette : aliments fixes (g) + 3 « leviers » (P = source de protéines, C = glucides, F = lipides)
   dont on calcule les grammes pour coller à la part du repas (MEALS.share) de l'objectif. */
export const MENU_TEMPLATES = Object.fromEntries(
  ["petitdej", "dejeuner", "collation", "seance", "diner"].map((mid) => [
    mid,
    RECIPES.filter((r) => r.meals.includes(mid)).map((r) => ({ rid: r.id, name: r.name, cuisine: r.cuisine, fixed: r.fixed, P: r.P, C: r.C, F: r.F })),
  ])
);

/* Portions réalistes (g) d'un levier selon le type d'aliment */
export function capsOf(food, role) {
  const id = food.id;
  const n = food.n || {};
  // aliment perso avec une portion déclarée : de ½ à 3 portions
  if (food.custom && food.portion && food.portion[1] > 0 && role !== "F") return [Math.round(food.portion[1] * 0.5), Math.round(food.portion[1] * 3)];
  if (food.custom && role === "C" && (food.cat === "sucre" || food.cat === "sport")) return [10, 120];
  if (role === "P") {
    if (food.cat === "sport") return [20, 60]; // poudres
    if (food.cat === "laitier" || food.cat === "vegprot" && n.kcal < 70) return n.kcal > 200 ? [20, 120] : [100, 500]; // laitages, boissons / yaourts soja
    if (food.cat === "oeuf") return [50, 250];
    if (food.cat === "legumineuse") return n.kcal > 200 ? [50, 220] : [120, 400]; // houmous, falafels
    if ((n.na || 0) > 700) return [30, 160]; // charcuterie, saumon fumé, surimi
    return [90, 280]; // viande, poisson, tofu, tempeh, seitan
  }
  if (role === "C") {
    if (food.cat === "laitier" || food.cat === "boisson") return [100, 500];
    if (food.cat === "fruit") return n.kcal > 200 ? [16, 100] : [80, 300]; // fruits secs / frais
    if (food.cat === "sucre" || food.cat === "sport") return [15, 90];
    // portions « qu'on mange vraiment »
    if (/^tortilla/.test(id)) return [25, 160]; // 1 à ~6 tortillas
    if (id === "naan" || id === "pain_pita" || id === "bagel" || id === "muffin_anglais") return [50, 180];
    if (id === "crepe" || id === "crepe_sarrasin" || id === "pancake") return [40, 240];
    if (id === "biscottes" || id === "pain_suedois") return [10, 60];
    if (id === "pain_mie") return [25, 150];
    if (/pain|baguette/.test(id)) return [35, 200];
    if (id === "galette_riz") return [9, 60];
    if (n.kcal > 300) return [30, 160]; // flocons, muesli, céréales sèches
    if (id === "frites_four" || id === "puree" || id === "gnocchis" || id === "tortellini") return [120, 400];
    if (id === "banane_plantain" || id === "manioc" || id === "mais") return [100, 400];
    return [60, 550]; // féculents cuits
  }
  if (n.f > 90) return [5, 45]; // huiles, beurre
  if (id === "avocat" || id === "guacamole") return [0, 200];
  if (id === "lait_coco" || id === "lait_coco_light") return [0, 200];
  if (food.cat === "laitier") return [0, 100]; // fromages, crème
  if (id === "pesto" || id === "mayonnaise" || id === "vinaigrette" || id === "tahini") return [0, 45];
  return [0, 70]; // oléagineux
}

/* Grammes des 3 leviers (P, C, F) : chaque levier corrige SON macro (Gauss-Seidel), dans des portions réalistes */
export function solveMeal(tpl, target, diet, lookup = (id) => FOOD_BY_ID[id]) {
  const pick = (ids) => ids.map((id) => lookup(id)).find((f) => f && allowedByDiet(f, diet)) || lookup(ids[ids.length - 1]);
  const levers = [
    { food: pick(tpl.P), k: "p", role: "P" },
    { food: pick(tpl.C), k: "c", role: "C" },
    { food: pick(tpl.F), k: "f", role: "F" },
  ];
  const fixed = tpl.fixed.map(([id, g]) => ({ food: lookup(id), g })).filter((x) => x.food && allowedByDiet(x.food, diet));
  const base = sumN(fixed.map((x) => scaleN(x.food.n, x.g)));
  const caps = levers.map((l) => capsOf(l.food, l.role));
  const g = caps.map((c) => c[0]);
  const tot = (key) => base[key] + levers.reduce((s, l, i) => s + (l.food.n[key] * g[i]) / 100, 0);
  for (let it = 0; it < 60; it++) {
    levers.forEach((l, i) => {
      const per = l.food.n[l.k] / 100;
      if (per <= 0) return;
      g[i] = Math.min(caps[i][1], Math.max(caps[i][0], g[i] + (target[l.k] - tot(l.k)) / per));
    });
  }
  const round5 = (x) => Math.round(x / 5) * 5;
  const items = [
    ...fixed.map((x) => ({ food: x.food, g: x.g, role: "fixe" })),
    ...levers.map((l, i) => ({ food: l.food, g: Math.max(l.role === "F" ? 0 : caps[i][0], round5(g[i])), role: l.role })),
  ].filter((x) => x.g > 0);
  return items.map((x) => ({ ...x, n: scaleN(x.food.n, x.g) }));
}

/* Menu d'une journée : variant = numéro de variante (tourne dans les modèles) */
export function generateMenu(targets, { diet = "omni", variant = 0 } = {}) {
  if (!targets) return null;
  const shares = menuShares(targets.kcal, targets.day?.id);
  const meals = MEALS.filter((m) => shares[m.id] > 0).map((m, i) => {
    const list = MENU_TEMPLATES[m.id];
    const tpl = list[(variant + i) % list.length];
    const sh = shares[m.id];
    const t = { p: targets.p * sh, c: targets.c * sh, f: targets.f * sh };
    const items = solveMeal(tpl, t, diet);
    return { ...m, share: sh, items, total: sumN(items.map((x) => x.n)) };
  });
  return { meals, total: sumN(meals.map((m) => m.total)) };
}

/* Portion habituelle (g) d'un aliment : sa portion déclarée, sinon une portion type de sa catégorie */
const PORTION_BY_CAT = { feculent: 200, legumineuse: 150, viande: 120, poisson: 130, oeuf: 100, vegprot: 120, laitier: 125, legume: 150, fruit: 120, gras: 20, sucre: 20, boisson: 200, sport: 30 };
export const usualPortion = (f) => (f.portion ? f.portion[1] : PORTION_BY_CAT[f.cat] || 100);

/* Meilleures sources d'un nutriment, en quantité apportée par une PORTION habituelle (et non pour 100 g
   ou 100 kcal, qui favorisent des aliments qu'on ne mange pas en grande quantité) */
export function bestSources(k, diet = "omni", n = 4) {
  return FOODS.filter((f) => allowedByDiet(f, diet) && (f.n[k] || 0) > 0 && f.cat !== "sport" && f.cat !== "boisson" && f.cat !== "condiment")
    .map((f) => ({ f, g: usualPortion(f), v: ((f.n[k] || 0) * usualPortion(f)) / 100 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n);
}

export const fmtN = (k, v) => {
  const d = NUT[k]?.dec ?? 0;
  const x = Number(v) || 0;
  return (d ? Math.round(x * 10 ** d) / 10 ** d : Math.round(x)).toLocaleString("fr-FR");
};
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const shiftISO = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
