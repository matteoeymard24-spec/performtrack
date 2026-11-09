/* =====================================================================
   mealPlan.js — planification des menus de la semaine (Nutrition › Planning).

   • recommendDay : essaie TOUTES les combinaisons de modèles de repas de la journée et les classe
     selon l'écart aux besoins (énergie, protéines, glucides, lipides) ET la couverture des
     vitamines / minéraux. rank = 0 → meilleure proposition, 1 → suivante (« Autre proposition »).
   • dayCheck : « dans les clous » ou non, avec ce qui dépasse / manque.
   • alternatives / rebalanceMeal : remplacer un aliment, puis recalculer les quantités du repas.
   Firestore : users/{uid}/nutrition/plan_AAAA-MM-JJ = { date, dayType, meals: [{ id, items: [{ foodId, name, g, role, n }] }] }
   ===================================================================== */
import { TH } from "./thresholdsCore";
import { bankFoods, bankTemplates, normName } from "./bankCore";
import { costOf, budgetDay, priceVersion, isAvailable } from "./prices";
import {
  FOODS,
  FOOD_BY_ID,
  MEALS,
  MICROS,
  MENU_TEMPLATES,
  menuShares,
  capsOf,
  solveMeal,
  allowedByDiet,
  scaleN,
  sumN,
} from "./nutritionData";

const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));
const SCORED_MICROS = MICROS.filter((m) => !m.limit && m.k !== "vd"); // vit. D : rarement couverte par l'alimentation seule

const round5 = (x) => Math.max(0, Math.round(x / 5) * 5);
/* ---- Aliments perso dans les menus ----
   Catégorie (choisie à la création, sinon devinée d'après les macros) → rôle dans un repas
   (P = protéines, C = glucides, F = lipides, fixe = accompagnement) + repas où il a sa place. */
export const guessCat = (f) => {
  const n = f?.n || {};
  const kcal = Number(n.kcal) || 1;
  const pS = (4 * (Number(n.p) || 0)) / kcal;
  const cS = (4 * (Number(n.c) || 0)) / kcal;
  const fS = (9 * (Number(n.f) || 0)) / kcal;
  if (fS >= 0.6) return "gras";
  // protéines : « Viandes » par défaut (jamais proposé à un végétarien) ; à changer si c'est végétal
  if (pS >= 0.3 && (Number(n.p) || 0) >= 8) return "viande";
  if (kcal < 60) return "legume";
  if (cS >= 0.5) return (Number(n.p) || 0) < 4 && (Number(n.fib) || 0) < 3 && kcal > 250 ? "sucre" : "feculent";
  return "feculent";
};
export const roleOfCat = (cat, f) =>
  ["viande", "poisson", "oeuf", "vegprot", "legumineuse"].includes(cat)
    ? "P"
    : cat === "laitier"
    ? (Number(f?.n?.p) || 0) >= 7 ? "P" : "fixe"
    : cat === "feculent" || cat === "sucre" || cat === "sport"
    ? "C"
    : cat === "gras"
    ? "F"
    : cat === "legume" || cat === "fruit"
    ? "fixe"
    : null;
export const DEFAULT_MEALS_BY_CAT = {
  feculent: ["petitdej", "dejeuner", "collation", "seance", "diner"],
  legumineuse: ["dejeuner", "diner"],
  viande: ["dejeuner", "diner"],
  poisson: ["dejeuner", "diner"],
  vegprot: ["dejeuner", "diner"],
  oeuf: ["petitdej", "dejeuner", "seance", "diner"],
  laitier: ["petitdej", "collation", "seance"],
  legume: ["dejeuner", "diner"],
  fruit: ["petitdej", "collation", "seance"],
  gras: ["petitdej", "dejeuner", "collation", "seance", "diner"],
  sucre: ["collation", "seance"],
  sport: ["collation", "seance"],
  boisson: [],
};
/* Repas par défaut, affinés : céréales / pain / barres (secs, > 300 kcal/100 g) le matin et autour des
   séances, féculents cuits midi et soir ; huiles midi et soir, oléagineux le matin et en collation */
export const defaultMeals = (cat, n) => {
  const kcal = Number(n?.kcal) || 0;
  if (cat === "feculent") return kcal > 300 ? ["petitdej", "collation", "seance"] : ["dejeuner", "diner"];
  if (cat === "gras") return (Number(n?.f) || 0) > 90 ? ["dejeuner", "diner"] : ["petitdej", "collation", "seance"];
  return DEFAULT_MEALS_BY_CAT[cat] || [];
};
let BASE_NAMES = null;
/* Aliments perso + aliments de la BANQUE COMMUNE (partagés par les autres ; sans doublon de nom
   avec un aliment de base ou un de tes aliments) */
export const prepCustom = (customFoods) => {
  if (!BASE_NAMES) BASE_NAMES = new Set(FOODS.map((f) => normName(f.name)));
  const mine = customFoods || [];
  const ids = new Set(mine.map((f) => f.id));
  const names = new Set(mine.map((f) => normName(f.name)));
  const shared = bankFoods().filter((f) => !ids.has(f.id) && !names.has(normName(f.name)) && !BASE_NAMES.has(normName(f.name)));
  return [...mine, ...shared].map((f) => {
    const cat = f.cat && f.cat !== "perso" ? f.cat : guessCat(f);
    return { ...f, cat, custom: true, meals: Array.isArray(f.meals) && f.meals.length ? f.meals : defaultMeals(cat, f.n) };
  });
};

/* Bibliothèque de menus : aliments de base (avec tes valeurs corrigées) + tes aliments perso.
   Chaque aliment perso est essayé dans chaque modèle de ses repas, à la place de l'aliment du même rôle
   → plus tu crées d'aliments, plus il y a de menus possibles. */
export function buildLibrary(customFoods = [], overrides = {}, diet = "omni") {
  const customs = prepCustom(customFoods);
  const byId = new Map(customs.map((f) => [f.id, f]));
  const lookup = (id) => byId.get(id) || (FOOD_BY_ID[id] && overrides?.[id] ? { ...FOOD_BY_ID[id], n: { ...FOOD_BY_ID[id].n, ...overrides[id] } } : FOOD_BY_ID[id]) || null;
  const templates = {};
  Object.entries(MENU_TEMPLATES).forEach(([mid, list0]) => {
    // recettes de base + recettes partagées dans la banque commune
    const list = [...list0, ...bankTemplates(mid)];
    const out = list.map((tpl) => ({ ...tpl, src: tpl.bank ? "banque" : "base" }));
    const handMade = list.filter((tpl) => !tpl.gen); // variantes « aliment perso » : sur les recettes écrites à la main seulement
    customs.forEach((f) => {
      if (!f.meals.includes(mid) || !allowedByDiet(f, diet)) return;
      const role = roleOfCat(f.cat, f);
      if (!role) return;
      const dry = (Number(f.n?.kcal) || 0) > 200;
      handMade.forEach((tpl) => {
        // un féculent remplace un féculent « du même genre » (cuit ↔ cuit, pain/céréales ↔ pain/céréales)
        if (role === "C") {
          const c0 = FOOD_BY_ID[(tpl.C || [])[0]];
          if (c0 && (c0.n.kcal > 200) !== dry) return;
        }
        if (role === "fixe") {
          const fx = tpl.fixed || [];
          const i = fx.findIndex(([id]) => FOOD_BY_ID[id]?.cat === f.cat);
          const g = f.portion?.[1] || (f.cat === "fruit" ? 120 : 150);
          const fixed = i >= 0 ? fx.map((x, j) => (j === i ? [f.id, g] : x)) : [...fx, [f.id, g]];
          out.push({ ...tpl, fixed, src: f.id, withFood: f.name });
        } else {
          out.push({ ...tpl, [role]: [f.id], src: f.id, withFood: f.name });
        }
      });
    });
    // magasin choisi : recettes dont un ingrédient n'y est pas vendu → retirées (titres justes) ;
    // un levier avec plusieurs choix garde les choix disponibles
    templates[mid] = out
      .filter((tpl) => (tpl.fixed || []).every(([id]) => isAvailable(id) || byId.has(id)) && (!(tpl.P || []).length || isAvailable(tpl.P[0]) || byId.has(tpl.P[0]) || !tpl.gen) && (!(tpl.C || []).length || (tpl.C || []).some((id) => isAvailable(id) || byId.has(id))))
      .map((tpl) => {
        const keep = (ids) => {
          const k = (ids || []).filter((id) => isAvailable(id) || byId.has(id));
          return k.length ? k : ids || [];
        };
        return { ...tpl, P: keep(tpl.P), C: keep(tpl.C), F: (tpl.F || []).filter((id) => isAvailable(id) || byId.has(id)) };
      })
      .filter((tpl) => (tpl.P || []).length === 0 || (tpl.P || []).some((id) => isAvailable(id) || byId.has(id)));
  });
  return { lookup, templates, customs };
}

export const foodOf = (id, customFoods = []) => FOOD_BY_ID[id] || prepCustom(customFoods).find((f) => f.id === id) || null;

/* Item stockable (nutriments recalculés depuis l'aliment) */
export const makeItem = (food, g, role = "fixe") => ({ foodId: food.id, name: food.name, g: round5(g) || Math.round(g), role, n: scaleN(food.n, g) });
const fromSolved = (items) => items.map((x) => makeItem(x.food, x.g, x.role));

/* Part de l'objectif de chaque repas selon l'énergie du jour */
export const mealTarget = (targets, mealId) => {
  const sh = menuShares(targets.kcal, targets.day?.id)[mealId] || 0;
  return { share: sh, kcal: targets.kcal * sh, p: targets.p * sh, c: targets.c * sh, f: targets.f * sh };
};
export const planMeals = (targets) => MEALS.filter((m) => (menuShares(targets.kcal, targets.day?.id)[m.id] || 0) > 0);

/* Totaux d'un plan */
export const mealTotal = (meal) => sumN((meal?.items || []).map((x) => x.n));
export const planTotal = (plan) => sumN((plan?.meals || []).map(mealTotal));

/* Coût (€) d'une liste d'items { foodId | food, g } / d'un repas / d'un plan (prix : prices.js) */
export const itemsCost = (items, customFoods = []) =>
  (items || []).reduce((s, x) => s + costOf(x.food || foodOf(x.foodId, customFoods), Number(x.g) || 0), 0);
export const mealCost = (meal, customFoods = []) => itemsCost(meal?.items, customFoods);
export const planCost = (plan, customFoods = []) => (plan?.meals || []).reduce((s, m) => s + mealCost(m, customFoods), 0);
/* Prix d'une PORTION type (1 personne, portions moyennes : protéine 130 g, féculent 200 g cuit,
   matière grasse 10 g + aliments fixes) — pour filtrer / trier le catalogue sans tout calculer */
const NOMINAL = { P: 130, C: 200, F: 10 };
const nominalCache = new Map();
export function portionCost(tpl, customFoods = [], diet = "omni") {
  const key = `${tpl.rid || tpl.id}|${diet}|${customFoods.length}|${priceVersion()}`;
  if (nominalCache.has(key)) return nominalCache.get(key);
  const fd = (id) => foodOf(id, customFoods);
  const pick = (ids) => (ids || []).map(fd).find((f) => f && allowedByDiet(f, diet)) || null;
  let c = (tpl.fixed || []).reduce((s0, [id, g]) => s0 + costOf(fd(id), g), 0);
  ["P", "C", "F"].forEach((r) => {
    const f = pick(tpl[r]);
    if (!f) return;
    const g = r === "C" && f.n?.kcal > 300 ? 70 : NOMINAL[r]; // féculent sec (flocons, muesli…) : 70 g
    c += costOf(f, g);
  });
  if (nominalCache.size > 60000) nominalCache.clear();
  nominalCache.set(key, c);
  return c;
}
export const clearPortionCost = () => nominalCache.clear();

/* Pénalité budget (0 si pas de budget) : au-dessus du budget → forte ; en dessous → légère préférence pour le moins cher */
const budgetPen = (cost, budget, w = 1) => (budget > 0 ? w * (3 * Math.max(0, cost / budget - 1) + 0.15 * Math.min(2, cost / budget)) : 0);

/* Écart d'un total aux besoins (plus petit = mieux) */
function scoreTotals(T, t) {
  const rel = (a, b) => (b > 0 ? a / b : 1);
  const macro =
    3 * Math.abs(rel(T.kcal, t.kcal) - 1) +
    2 * Math.max(0, 1 - rel(T.p, t.p)) +
    0.5 * Math.max(0, rel(T.p, t.p) - 1.3) +
    Math.abs(rel(T.c, t.c) - 1) +
    Math.abs(rel(T.f, t.f) - 1);
  const micro = SCORED_MICROS.reduce((s, m) => s + Math.max(0, 1 - Math.min(1, (T[m.k] || 0) / (t.micro[m.k] || 1))), 0) / SCORED_MICROS.length;
  const fiber = Math.max(0, 1 - Math.min(1, (T.fib || 0) / (t.fib || 30)));
  return macro + 1.5 * micro + 0.5 * fiber;
}

/* Tirage pseudo-aléatoire reproductible (même rang → même proposition) */
const rng = (seed) => {
  let x = (seed * 2654435761) % 4294967296 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
};
// titre de la recette ; protéine principale remplacée pour le régime → « (version végé / poisson) »
const recipeMeta = (tpl, diet = "omni", lookup = null) => {
  if (!tpl?.rid) return null;
  const p0 = lookup && (tpl.P || [])[0] ? lookup(tpl.P[0]) : null;
  const adapted = diet !== "omni" && p0 && !allowedByDiet(p0, diet);
  return { rid: tpl.rid, name: adapted ? `${tpl.name} (version ${diet === "vege" ? "végé" : "poisson"})` : tpl.name, cuisine: tpl.cuisine, ...(tpl.withFood ? { withFood: tpl.withFood } : {}) };
};
const byCuisine = (list, cuisines) => {
  if (!cuisines || !cuisines.length) return list;
  const f = list.filter((t) => cuisines.includes(t.cuisine));
  return f.length ? f : list; // aucune recette de ces cuisines pour ce repas → toutes
};

/* Propositions pour une journée. Retourne { meals, score, rank, count }
   rank 0 = la meilleure ; rank > 0 = tirage parmi les meilleures recettes de chaque repas
   (variété : « Autre proposition », remplissage de la semaine). cuisines = filtre facultatif. */
export function recommendDay(targets, { diet = "omni", rank = 0, customFoods = [], overrides = {}, cuisines = [], avoid = [] } = {}) {
  if (!targets) return null;
  const lib = buildLibrary(customFoods, overrides, diet);
  const meals = planMeals(targets);
  const rand = rng(rank + 1);
  const K = 4; // recettes retenues par repas → 4^5 combinaisons au plus
  const bDay = budgetDay(); // budget du jour (0 = pas de budget)
  let total = 1;
  const options = meals.map((m) => {
    const t = mealTarget(targets, m.id);
    const tm = { ...t, fib: (targets.fib || 30) * t.share, micro: Object.fromEntries(Object.entries(targets.micro || {}).map(([key, v]) => [key, v * t.share])) };
    const list0 = byCuisine(lib.templates[m.id] || [], cuisines);
    total *= Math.max(1, list0.length);
    // catalogue généré (plusieurs milliers de recettes) : on en tire un échantillon par proposition
    // (toujours toutes les recettes écrites à la main / perso / partagées) ; avec un budget, on garde
    // les moins chères de l'échantillon élargi
    const hand = list0.filter((x) => !x.gen);
    // recettes générées : seulement celles dont la protéine principale convient au régime (le titre reste juste ;
    // les versions végétariennes existent déjà dans le catalogue : tofu, pois chiches, tempeh…)
    const gen = list0.filter((x) => x.gen && (!x.P.length || allowedByDiet(lib.lookup(x.P[0]), diet)));
    let sample = gen;
    const N = 70;
    if (gen.length > N) {
      const r2 = rng((rank + 1) * 7919 + meals.indexOf(m) * 104729 + 13);
      const want = bDay > 0 ? N * 3 : N;
      const picked = new Set();
      while (picked.size < Math.min(want, gen.length)) picked.add(Math.floor(r2() * gen.length));
      sample = [...picked].map((i) => gen[i]);
      if (bDay > 0) sample = sample.sort((a, b) => portionCost(a, customFoods, diet) - portionCost(b, customFoods, diet)).slice(0, N);
    }
    const list = [...hand, ...sample];
    const scored = list
      .map((tpl) => {
        const items = solveMeal(tpl, t, diet, lib.lookup);
        const tot = sumN(items.map((x) => x.n));
        const cost = itemsCost(items);
        // recette déjà au menu cette semaine → légère pénalité (variété) ; budget : part du repas
        return { tpl, items, total: tot, cost, sc: scoreTotals(tot, tm) + (avoid.includes(tpl.rid) ? 0.4 : 0) + budgetPen(cost, bDay * t.share, 0.6) };
      })
      .sort((a, b) => a.sc - b.sc);
    if (rank === 0) return scored.slice(0, K);
    // tirage parmi la meilleure moitié (au moins 8) : on reste dans les clous tout en variant
    const pool = scored.slice(0, Math.max(8, Math.ceil(scored.length / 2)));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, K);
  });
  let best = null;
  const walk = (i, picked) => {
    if (i === options.length) {
      const T = sumN(picked.map((o) => o.total));
      const rids = picked.map((o) => o.tpl.rid);
      const dupPen = rids.length - new Set(rids).size; // même recette midi et soir
      const cost = picked.reduce((s, o) => s + o.cost, 0);
      const sc = scoreTotals(T, targets) + 0.5 * dupPen + budgetPen(cost, bDay);
      if (!best || sc < best.score) best = { picked: picked.slice(), score: sc };
      return;
    }
    options[i].forEach((o) => {
      picked.push(o);
      walk(i + 1, picked);
      picked.pop();
    });
  };
  walk(0, []);
  if (!best) return null;
  return {
    meals: meals.map((m, i) => ({ id: m.id, items: fromSolved(best.picked[i].items), recipe: recipeMeta(best.picked[i].tpl, diet, lib.lookup) })),
    score: best.score,
    rank,
    count: total,
  };
}

/* Recettes possibles pour UN repas (cuisines filtrées), pour le 🔄 du repas */
export function mealRecipes(mealId, { diet = "omni", customFoods = [], overrides = {}, cuisines = [] } = {}) {
  const lib = buildLibrary(customFoods, overrides, diet);
  const okGen = (t) => !t.gen || !(t.P || []).length || allowedByDiet(lib.lookup(t.P[0]), diet);
  return { lib, list: byCuisine((lib.templates[mealId] || []).filter(okGen), cuisines) };
}

/* Autre recette pour UN repas (la suivante dans la liste), mêmes cibles → { items, recipe } */
export function nextMealOption(targets, mealId, diet, idx, customFoods = [], overrides = {}, cuisines = []) {
  const { lib, list } = mealRecipes(mealId, { diet, customFoods, overrides, cuisines });
  if (!list.length) return null;
  const tpl = list[((idx % list.length) + list.length) % list.length];
  return { items: fromSolved(solveMeal(tpl, mealTarget(targets, mealId), diet, lib.lookup)), recipe: recipeMeta(tpl, diet, lib.lookup) };
}

/* Une recette précise mise à l'échelle d'un repas → { items, recipe } */
export function recipeForMeal(targets, mealId, tpl, diet, customFoods = [], overrides = {}) {
  const lib = buildLibrary(customFoods, overrides, diet);
  return { items: fromSolved(solveMeal(tpl, mealTarget(targets, mealId), diet, lib.lookup)), recipe: recipeMeta(tpl, diet, lib.lookup) };
}

/* Recalcule les quantités des aliments « leviers » (P, C, F) d'un repas pour coller à sa part des besoins.
   Les aliments fixes (légumes, fruits…) et ajoutés à la main gardent leur quantité. */
export function rebalanceMeal(meal, targets, customFoods = []) {
  const t = mealTarget(targets, meal.id);
  const items = (meal.items || []).map((x) => ({ ...x, food: foodOf(x.foodId, customFoods) })).filter((x) => x.food);
  const levers = ["P", "C", "F"].map((r) => items.find((x) => x.role === r)).filter(Boolean);
  if (!levers.length) return meal;
  const keyOf = { P: "p", C: "c", F: "f" };
  const fixedN = sumN(items.filter((x) => !levers.includes(x)).map((x) => scaleN(x.food.n, x.g)));
  const caps = levers.map((l) => capsOf(l.food, l.role));
  const g = levers.map((l, i) => Math.min(caps[i][1], Math.max(caps[i][0], Number(l.g) || caps[i][0])));
  const tot = (k) => fixedN[k] + levers.reduce((s, l, i) => s + (l.food.n[k] * g[i]) / 100, 0);
  for (let it = 0; it < 60; it++) {
    levers.forEach((l, i) => {
      const k = keyOf[l.role];
      const per = l.food.n[k] / 100;
      if (per <= 0) return;
      g[i] = Math.min(caps[i][1], Math.max(caps[i][0], g[i] + (t[k] - tot(k)) / per));
    });
  }
  return {
    ...meal,
    items: items.map((x) => {
      const i = levers.indexOf(x);
      const grams = i >= 0 ? Math.max(x.role === "F" ? 0 : caps[i][0], round5(g[i])) : x.g;
      const { food, ...rest } = x;
      return { ...rest, g: grams, n: scaleN(food.n, grams) };
    }).filter((x) => x.g > 0),
  };
}

/* Aliments de remplacement : même famille (protéines / féculents / gras / légumes / fruits…), compatibles avec le régime */
const PROT_CATS = ["viande", "poisson", "oeuf", "vegprot", "laitier", "legumineuse"];
export function alternatives(item, diet = "omni", customFoods = []) {
  const food = foodOf(item.foodId, customFoods);
  if (!food) return [];
  const cats = item.role === "P" ? PROT_CATS : item.role === "F" ? ["gras"] : item.role === "C" ? ["feculent", "legumineuse"] : [food.cat];
  return [...FOODS, ...prepCustom(customFoods)]
    .filter((f) => f.id !== food.id && cats.includes(f.cat) && allowedByDiet(f, diet))
    .filter((f) => (item.role === "P" ? f.n.p >= 8 : true));
}

/* « Dans les clous » ? status : ok | close | off ; issues = ce qui coince */
export function dayCheck(T, t, diet = "omni") { // eslint-disable-line no-unused-vars
  if (!T || !t) return null;
  const r = (a, b) => (b > 0 ? a / b : 1);
  const checks = [];
  const kc = r(T.kcal, t.kcal);
  const tol = TH("kcalTol") / 100;
  checks.push({ k: "kcal", st: Math.abs(kc - 1) <= tol ? "ok" : Math.abs(kc - 1) <= tol * 1.5 ? "close" : "off", txt: `${kc > 1 ? "+" : "−"}${Math.abs(Math.round(T.kcal - t.kcal))} kcal` });
  const p = r(T.p, t.p);
  const pm = TH("protMin") / 100;
  checks.push({ k: "p", st: p >= pm ? "ok" : p >= pm - 0.1 ? "close" : "off", txt: `protéines ${Math.round(p * 100)} %` });
  const c = r(T.c, t.c);
  checks.push({ k: "c", st: Math.abs(c - 1) <= 0.15 ? "ok" : Math.abs(c - 1) <= 0.25 ? "close" : "off", txt: `glucides ${Math.round(c * 100)} %` });
  const f = r(T.f, t.f);
  checks.push({ k: "f", st: Math.abs(f - 1) <= 0.2 ? "ok" : Math.abs(f - 1) <= 0.3 ? "close" : "off", txt: `lipides ${Math.round(f * 100)} %` });
  // oméga-3 EPA/DHA : repère moyen sur la SEMAINE (poisson 2 fois / semaine dont 1 gras) → jugé sur la semaine
  // dans le Planning, pas jour par jour (en végétarien : complément d'algues, conseil affiché)
  const lowMicros = SCORED_MICROS.filter((m) => m.k !== "o3" && (T[m.k] || 0) < (TH("microMin") / 100) * (t.micro[m.k] || 0));
  const microSt = lowMicros.length === 0 ? "ok" : lowMicros.length <= 2 ? "close" : "off";
  const order = { ok: 0, close: 1, off: 2 };
  const worst = [...checks.map((x) => x.st), microSt].reduce((a, b) => (order[b] > order[a] ? b : a), "ok");
  return {
    status: worst,
    checks,
    lowMicros,
    issues: [...checks.filter((x) => x.st !== "ok").map((x) => x.txt), ...(lowMicros.length ? [`${lowMicros.map((m) => m.label.toLowerCase()).join(", ")} < ${TH("microMin")} %`] : [])],
  };
}
export const STATUS_UI = {
  ok: { icon: "✅", label: "Dans les clous", color: "#4fae7d" },
  close: { icon: "🟠", label: "Presque", color: "#e0a13d" },
  off: { icon: "⚠️", label: "À ajuster", color: "#d9695a" },
};
export { MEAL_BY_ID };
