/* =====================================================================
   recipeSteps.js — PRÉPARATION d'un repas du Planning, déduite de ses ingrédients.

   Les recettes du catalogue (recipeGen.js) n'ont pas de texte de préparation écrit : les étapes
   sont construites à partir des aliments et de leurs quantités (féculent → cuisson et temps
   habituels, protéine → mode de cuisson, légumes, sauce / assaisonnement, dressage). Les recettes
   créées par les membres affichent en plus le texte de leur auteur.
   Temps de cuisson = repères courants (emballages, guides de cuisson) : à ajuster selon le produit.
   ===================================================================== */
import { FOOD_BY_ID } from "./nutritionData";
import { priceInfo } from "./prices";

const r5 = (g) => Math.max(5, Math.round(g / 5) * 5);

// féculents : [verbe + temps, rendement par défaut si absent des prix]
const STARCH = {
  riz_blanc: "Rincer le riz puis le cuire dans 2 fois son volume d'eau bouillante salée, 11-12 min ; égoutter si besoin",
  riz_basmati: "Rincer le riz basmati puis le cuire dans 1,5 fois son volume d'eau, à couvert, 10-12 min ; laisser reposer 5 min",
  riz_thai: "Rincer le riz thaï puis le cuire dans 1,5 fois son volume d'eau, à couvert, 10-12 min ; laisser reposer 5 min",
  riz_complet: "Cuire le riz complet dans 2,5 fois son volume d'eau, 25-30 min",
  riz_sauvage: "Cuire le riz sauvage dans un grand volume d'eau, 35-40 min",
  riz_sushi: "Rincer le riz jusqu'à ce que l'eau soit claire, cuire 12 min à couvert, puis ajouter un filet de vinaigre de riz",
  pates: "Cuire les pâtes dans une grande casserole d'eau bouillante salée, 9-11 min (selon le paquet)",
  pates_comp: "Cuire les pâtes complètes dans une grande casserole d'eau bouillante salée, 10-12 min",
  pates_fraiches: "Cuire les pâtes fraîches 2-3 min dans l'eau bouillante salée",
  tortellini: "Cuire les tortellini 2-3 min dans l'eau bouillante salée",
  gnocchis: "Faire dorer les gnocchis à la poêle 5-6 min (ou 2 min dans l'eau bouillante, jusqu'à ce qu'ils remontent)",
  lasagnes_feuilles: "Monter les lasagnes en couches (feuilles, garniture, sauce) et cuire au four 35-40 min à 180 °C",
  semoule: "Verser autant d'eau bouillante salée que de semoule, couvrir 5 min puis égrainer à la fourchette",
  boulgour: "Cuire le boulgour dans 2 fois son volume d'eau, à couvert, 10-12 min",
  quinoa: "Rincer le quinoa puis le cuire dans 2 fois son volume d'eau, 12-15 min",
  polenta: "Verser la polenta en pluie dans l'eau bouillante salée (4 fois son volume) et remuer 5 min",
  sarrasin: "Cuire le sarrasin dans 2 fois son volume d'eau, 10-12 min",
  millet: "Cuire le millet dans 2,5 fois son volume d'eau, 15-20 min",
  orge: "Cuire l'orge perlé dans 3 fois son volume d'eau, 25-30 min",
  lentilles: "Rincer les lentilles et les cuire dans 3 fois leur volume d'eau non salée, 20-25 min ; saler en fin de cuisson",
  lentilles_corail: "Cuire les lentilles corail dans 2,5 fois leur volume d'eau, 12-15 min",
  pdt: "Éplucher (ou non) les pommes de terre, les couper et les cuire à l'eau salée ou à la vapeur, 20 min",
  patate_douce: "Couper la patate douce en cubes, l'enrober d'un peu d'huile et la rôtir au four à 200 °C, 25-30 min",
  frites_four: "Étaler les frites sur une plaque et les cuire au four à 220 °C, 20-25 min en les retournant",
  puree: "Cuire les pommes de terre à l'eau 20 min, puis les écraser avec un peu de lait et de beurre",
  nouilles_ble: "Cuire les nouilles 3-4 min dans l'eau bouillante, puis les égoutter",
  nouilles_udon: "Plonger les udon 2-3 min dans l'eau bouillante (ou directement dans le bouillon)",
  nouilles_soba: "Cuire les soba 4-5 min dans l'eau bouillante puis les rincer à l'eau froide",
  vermicelles_riz: "Réhydrater les vermicelles de riz 4-5 min dans de l'eau bouillante hors du feu, puis égoutter",
  manioc: "Éplucher le manioc et le cuire à l'eau salée, 25-30 min",
  banane_plantain: "Couper la banane plantain en rondelles et la poêler 3-4 min de chaque côté",
  mais: "Égoutter le maïs",
  avoine: "Faire chauffer les flocons d'avoine avec le lait 3-4 min en remuant (ou les laisser gonfler une nuit au frais)",
  flocons_sarrasin: "Faire chauffer les flocons avec le lait 3-4 min en remuant",
};
const BREAD = /pain|baguette|tortilla|pita|naan|bagel|muffin|biscotte|wasa|galette_riz|crepe|pancake|muesli|granola|corn_flakes|barre|gateau_riz/;
const TOAST = /pain|baguette|bagel|muffin|tortilla|pita|naan|crepe|pancake/;
const PROT = (f) => {
  const id = f.id;
  if (/blanc_poulet_tranche/.test(id)) return null; // se mange tel quel
  if (/^(poulet|aiguillette_poulet|dinde)/.test(id)) return `Couper ${f.name.toLowerCase()} en morceaux et les poêler 6-8 min à feu moyen, jusqu'à ce que le cœur ne soit plus rosé`;
  if (/cuisse_poulet|poulet_roti/.test(id)) return "Rôtir les cuisses de poulet au four à 200 °C, 35-40 min";
  if (/boeuf5|boeuf15|steak_soja/.test(id)) return "Faire revenir la viande hachée (ou les steaks) 3-4 min de chaque côté à feu vif";
  if (/steak|bavette|roti_boeuf/.test(id)) return "Saisir la viande 2-3 min de chaque côté à feu vif (saignant), puis la laisser reposer 2 min avant de la trancher";
  if (/boeuf_bourguignon/.test(id)) return "Faire revenir la viande en morceaux, couvrir de bouillon et laisser mijoter à couvert 2 h";
  if (/porc|veau|agneau|lapin|canard/.test(id)) return `Cuire ${f.name.toLowerCase()} à la poêle 4-6 min de chaque côté (ou au four à 180 °C, 20-25 min)`;
  if (/saucisse|merguez|chorizo/.test(id)) return "Griller les saucisses 8-10 min en les retournant";
  if (/saumon_fume|saumon_cru|thon_frais|jambon|surimi|crabe|anchois|hareng/.test(id)) return null; // se mange tel quel
  if (/crevettes|calamar|noix_st_jacques/.test(id)) return `Faire sauter ${f.name.toLowerCase()} 2-3 min à feu vif`;
  if (/moules/.test(id)) return "Cuire les moules à couvert 5-6 min à feu vif, jusqu'à ce qu'elles s'ouvrent";
  if (f.cat === "poisson" && !/thon|sardines|maquereau_fume/.test(id)) return "Cuire le poisson à la poêle 3-4 min de chaque côté, ou au four à 180 °C, 12-15 min (en papillote si la recette le dit)";
  if (/^oeuf$|omelette/.test(id)) return "Battre les œufs, puis les cuire en omelette ou brouillés 3-4 min à feu doux";
  if (/oeuf_dur/.test(id)) return "Cuire les œufs 9-10 min dans l'eau bouillante, puis les refroidir et les écaler";
  if (/tofu|tempeh|seitan/.test(id)) return `Couper ${f.name.toLowerCase()} en dés et le faire dorer 6-8 min à la poêle`;
  if (/pois_chiches|haricots|flageolets|feves/.test(id)) return `Rincer et égoutter ${f.name.toLowerCase().replace(" cuits", "")}, puis les réchauffer 3-4 min dans la sauce`;
  if (/falafels/.test(id)) return "Réchauffer les falafels au four à 200 °C, 10 min";
  return null;
};

/* Étapes de préparation d'un repas : items [{ foodId, name, g, role }] */
export function mealSteps(meal, recipe = null, lookup = null) {
  const items = (meal?.items || []).map((x) => ({ ...x, food: FOOD_BY_ID[x.foodId] || (lookup && lookup(x.foodId)) || { id: x.foodId, name: x.name, cat: "" } }));
  const steps = [];
  if (!items.length) return steps;
  const isPlate = ["dejeuner", "diner"].includes(meal.id);
  const list = (arr, strip) => arr.map((x) => x.food.name.toLowerCase().replace(strip || /$^/, "").trim()).join(", ");
  const sauceIds = /creme|oignon|echalote|ail$|tomates_concassees|coulis|lait_coco/;
  // 1) féculent
  items
    .filter((x) => STARCH[x.food.id] || (x.food.cat === "feculent" && !BREAD.test(x.food.id) && isPlate))
    .forEach((x) => steps.push({ t: STARCH[x.food.id] || `Cuire ${x.food.name.toLowerCase()} selon les indications du paquet`, icon: "🍚" }));
  // 2) légumes à cuire
  const vegCooked = items.filter((x) => x.food.cat === "legume" && /cuit|surgel|rôti/i.test(x.food.name) && !/conserve|concass|ratatouille|soupe|gaspacho/i.test(x.food.name));
  const vegRaw = items.filter((x) => x.food.cat === "legume" && !vegCooked.includes(x) && !(isPlate && sauceIds.test(x.food.id)));
  if (vegCooked.length)
    steps.push({ icon: "🥦", t: `Légumes (${list(vegCooked, / cuits?| cuites?/g)}) : laver, couper et cuire à la vapeur ou à la poêle avec un fond d'eau, 8-12 min (ils doivent rester un peu croquants)` });
  // 3) protéine
  items.forEach((x) => {
    if (!["viande", "poisson", "vegprot", "legumineuse", "oeuf"].includes(x.food.cat)) return;
    const t = PROT(x.food);
    if (t) steps.push({ icon: x.food.cat === "oeuf" ? "🍳" : x.food.cat === "poisson" ? "🐟" : x.food.cat === "vegprot" || x.food.cat === "legumineuse" ? "🌱" : "🍗", t });
  });
  // 4) sauce / aromates / produits laitiers ajoutés
  const aroma = items.filter((x) => /oignon|echalote|^ail$/.test(x.food.id));
  const sauce = items.filter((x) => (x.food.cat === "condiment" || /creme|tomates_concassees|coulis|lait_coco/.test(x.food.id)) && !aroma.includes(x));
  if (isPlate && aroma.length) steps.splice(Math.max(0, steps.length - 1), 0, { icon: "🧅", t: `Émincer ${list(aroma)} et faire revenir 3 min dans la poêle avant le reste` });
  if (isPlate && sauce.length) steps.push({ icon: "🥄", t: `Ajouter ${sauce.map((x) => `${x.food.name.toLowerCase()} (${x.g} g)`).join(", ")} et laisser mijoter 2-3 min` });
  // 5) crudités
  if (vegRaw.length) steps.push({ icon: "🥗", t: `Crudités (${list(vegRaw, / crue?s?/g)}) : laver et couper` });
  // 6) petit-déjeuner / collation / autour de la séance
  if (!isPlate) {
    const dairy = items.filter((x) => ["laitier", "sport", "boisson"].includes(x.food.cat) || /blanc_poulet_tranche|jambon/.test(x.food.id));
    const fruit = items.filter((x) => x.food.cat === "fruit");
    const spread = items.filter((x) => /beurre|confiture|miel|pate_tartiner|puree_amandes/.test(x.food.id));
    const extra = items.filter((x) => ["gras", "sucre"].includes(x.food.cat) && !spread.includes(x) && !BREAD.test(x.food.id));
    const bread = items.filter((x) => TOAST.test(x.food.id));
    const cereal = items.filter((x) => BREAD.test(x.food.id) && !bread.includes(x));
    if (bread.length) steps.push({ icon: "🍞", t: `${list(bread).replace(/^./, (c) => c.toUpperCase())} : toaster ou réchauffer si tu veux${spread.length ? `, puis tartiner ${list(spread)}` : ""}` });
    else if (spread.length) extra.push(...spread);
    extra.unshift(...cereal);
    if (fruit.length) steps.push({ icon: "🍎", t: `Fruits (${list(fruit)}) : laver, éplucher si besoin et couper` });
    const rest = [...dairy, ...extra];
    if (rest.length) steps.push({ icon: "🥣", t: `${meal.id === "collation" || meal.id === "seance" ? "À servir ou à emporter" : "Servir"} : ${list(rest)}${fruit.length ? ", avec les fruits" : ""}` });
  } else {
    const fat = items.find((x) => x.role === "F" || x.food.cat === "gras");
    steps.push({ icon: "🍽️", t: `Dresser l'assiette${fat ? ` et ajouter ${fat.food.name.toLowerCase()} (${fat.g} g) en assaisonnement ou pour la cuisson` : ""}. Saler, poivrer, épices selon tes goûts` });
  }
  if (recipe?.steps) steps.unshift({ icon: "📝", t: recipe.steps, author: true });
  return steps;
}

/* Quantité à préparer (cru / sec) pour g grammes dans l'assiette */
export function rawOf(food, g) {
  const p = priceInfo(food);
  if (!p || !(p.yield > 0) || p.yield === 1) return null;
  return { g: r5(g / p.yield), buy: p.buy || "cru" };
}
