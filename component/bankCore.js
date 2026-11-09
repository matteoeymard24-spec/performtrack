/* =====================================================================
   bankCore.js — BANQUE COMMUNE d'aliments et de recettes (partie « calcul », sans Firebase).

   Chaque personne (athlète ou coach) peut partager ses aliments et ses recettes : ils rejoignent
   la banque commune (collection Firestore foodBank, voir foodBank.js) et servent à TOUT LE MONDE
   (recherche d'aliments, menus proposés, livre de recettes). Plus il y a de contributions, plus
   les menus sont variés.

   Recette : { id, name, cuisine, meals: [repas], fixed: [[foodId, g]], P: [ids], C: [ids], F: [ids] }
   (même forme que recipes.js : aliments fixes + leviers protéines / glucides / lipides dont les
   grammes sont calculés pour coller aux besoins du repas).
   ===================================================================== */

let FOODS_B = [];
let RECIPES_B = [];
let BY_ID = new Map();

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function setBank({ foods = [], recipes = [] } = {}) {
  FOODS_B = foods.filter((f) => f && f.id && f.name && f.n && Number(f.n.kcal) >= 0);
  RECIPES_B = recipes.filter((r) => r && r.id && r.name && Array.isArray(r.meals) && r.meals.length);
  BY_ID = new Map(FOODS_B.map((f) => [f.id, f]));
}
/* Firestore refuse les tableaux imbriqués : [[id, g]] ↔ [{ id, g }] */
const pairsIn = (a) => (a || []).map((o) => (Array.isArray(o) ? o : [o.id, Number(o.g) || 0]));
const pairsOut = (a) => (a || []).map((o) => (Array.isArray(o) ? { id: o[0], g: o[1] } : o));
export const recipeFromDoc = (x) => ({ ...x, fixed: pairsIn(x.fixed), base: x.base ? pairsIn(x.base) : undefined });
export const recipeToDoc = (r) => {
  const o = { ...r, fixed: pairsOut(r.fixed), ...(r.base ? { base: pairsOut(r.base) } : {}) };
  delete o.private;
  Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
  return o;
};
let PRIVATE_R = [];
/* Recettes perso NON partagées (settings.myRecipes) : utilisées seulement par leur auteur */
export function setPrivateRecipes(list) {
  PRIVATE_R = (list || []).filter((r) => r && r.id && r.name && Array.isArray(r.meals) && r.meals.length).map((r) => ({ ...recipeFromDoc(r), private: true }));
}
export const bankFoods = () => FOODS_B;
export const bankRecipes = () => [...PRIVATE_R, ...RECIPES_B.filter((r) => !PRIVATE_R.some((x) => x.id === r.id))];
export const bankFoodById = (id) => BY_ID.get(id) || null;
export const normName = norm;

/* Recettes de la banque pour un repas, au format des modèles de menus */
export const bankTemplates = (mealId) =>
  bankRecipes().filter((r) => r.meals.includes(mealId)).map((r) => ({
    rid: r.id,
    name: r.name,
    cuisine: r.cuisine || "autre",
    fixed: r.fixed || [],
    P: r.P || [],
    C: r.C || [],
    F: r.F || [],
    bank: true,
    byName: r.byName || "",
  }));

/* Leviers d'une recette créée à la main (liste d'ingrédients + grammes) : l'ingrédient le plus riche
   en protéines devient le levier « protéines », idem glucides et lipides (s'ils apportent une part
   réelle) ; les autres gardent leurs grammes. Ainsi la recette se met à l'échelle des besoins du repas
   comme les recettes de base. */
export function recipeFromIngredients({ id, name, cuisine, meals, steps, ingredients }, foodOf) {
  const ing = (ingredients || []).map((x) => ({ ...x, food: foodOf(x.id) })).filter((x) => x.food && Number(x.g) > 0);
  const share = (x, k) => ((x.food.n[k] || 0) * Number(x.g)) / 100;
  const tot = { p: 0, c: 0, f: 0 };
  ing.forEach((x) => ["p", "c", "f"].forEach((k) => (tot[k] += share(x, k))));
  const used = new Set();
  const lever = (k, min) => {
    const best = ing.filter((x) => !used.has(x.id) && (x.food.n[k] || 0) >= min).sort((a, b) => share(b, k) - share(a, k))[0];
    if (!best || share(best, k) < 0.3 * tot[k]) return [];
    used.add(best.id);
    return [best.id];
  };
  const P = lever("p", 8);
  const C = lever("c", 15);
  const F = lever("f", 20);
  const fixed = ing.filter((x) => !used.has(x.id)).map((x) => [x.id, Math.round(Number(x.g))]);
  return { id, name, cuisine: cuisine || "autre", meals, steps: steps || "", fixed, P, C, F, base: ing.map((x) => [x.id, Math.round(Number(x.g))]) };
}
