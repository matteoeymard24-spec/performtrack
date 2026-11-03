/* =====================================================================
   mealPlan.js — planification des menus de la semaine (Nutrition › Planning).

   • recommendDay : essaie TOUTES les combinaisons de modèles de repas de la journée et les classe
     selon l'écart aux besoins (énergie, protéines, glucides, lipides) ET la couverture des
     vitamines / minéraux. rank = 0 → meilleure proposition, 1 → suivante (« Autre proposition »).
   • dayCheck : « dans les clous » ou non, avec ce qui dépasse / manque.
   • alternatives / rebalanceMeal : remplacer un aliment, puis recalculer les quantités du repas.
   Firestore : users/{uid}/nutrition/plan_AAAA-MM-JJ = { date, dayType, meals: [{ id, items: [{ foodId, name, g, role, n }] }] }
   ===================================================================== */
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
export const foodOf = (id, customFoods = []) => FOOD_BY_ID[id] || (customFoods || []).find((f) => f.id === id) || null;

/* Item stockable (nutriments recalculés depuis l'aliment) */
export const makeItem = (food, g, role = "fixe") => ({ foodId: food.id, name: food.name, g: round5(g) || Math.round(g), role, n: scaleN(food.n, g) });
const fromSolved = (items) => items.map((x) => makeItem(x.food, x.g, x.role));

/* Part de l'objectif de chaque repas selon l'énergie du jour */
export const mealTarget = (targets, mealId) => {
  const sh = menuShares(targets.kcal)[mealId] || 0;
  return { share: sh, kcal: targets.kcal * sh, p: targets.p * sh, c: targets.c * sh, f: targets.f * sh };
};
export const planMeals = (targets) => MEALS.filter((m) => (menuShares(targets.kcal)[m.id] || 0) > 0);

/* Totaux d'un plan */
export const mealTotal = (meal) => sumN((meal?.items || []).map((x) => x.n));
export const planTotal = (plan) => sumN((plan?.meals || []).map(mealTotal));

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

/* Propositions classées pour une journée. Retourne { meals, score, rank, count } */
export function recommendDay(targets, { diet = "omni", rank = 0 } = {}) {
  if (!targets) return null;
  const meals = planMeals(targets);
  // options résolues par repas (un modèle = une option)
  const options = meals.map((m) => {
    const t = mealTarget(targets, m.id);
    return (MENU_TEMPLATES[m.id] || []).map((tpl) => {
      const items = solveMeal(tpl, t, diet);
      return { items, total: sumN(items.map((x) => x.n)) };
    });
  });
  // produit cartésien des options (≈ 100 à 300 combinaisons)
  const combos = [];
  const walk = (i, picked) => {
    if (i === options.length) {
      const T = sumN(picked.map((o) => o.total));
      combos.push({ picked: picked.slice(), score: scoreTotals(T, targets) });
      return;
    }
    options[i].forEach((o) => {
      picked.push(o);
      walk(i + 1, picked);
      picked.pop();
    });
  };
  walk(0, []);
  combos.sort((a, b) => a.score - b.score);
  const k = ((rank % combos.length) + combos.length) % combos.length;
  const best = combos[k];
  return {
    meals: meals.map((m, i) => ({ id: m.id, items: fromSolved(best.picked[i].items) })),
    score: best.score,
    rank: k,
    count: combos.length,
  };
}

/* Autre proposition pour UN repas (modèle suivant), mêmes cibles */
export function nextMealOption(targets, mealId, diet, idx) {
  const list = MENU_TEMPLATES[mealId] || [];
  if (!list.length) return null;
  const tpl = list[((idx % list.length) + list.length) % list.length];
  return fromSolved(solveMeal(tpl, mealTarget(targets, mealId), diet));
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
  return [...FOODS, ...(customFoods || []).map((f) => ({ ...f, cat: f.cat || "perso" }))]
    .filter((f) => f.id !== food.id && cats.includes(f.cat) && allowedByDiet(f, diet))
    .filter((f) => (item.role === "P" ? f.n.p >= 8 : true));
}

/* « Dans les clous » ? status : ok | close | off ; issues = ce qui coince */
export function dayCheck(T, t) {
  if (!T || !t) return null;
  const r = (a, b) => (b > 0 ? a / b : 1);
  const checks = [];
  const kc = r(T.kcal, t.kcal);
  checks.push({ k: "kcal", st: Math.abs(kc - 1) <= 0.1 ? "ok" : Math.abs(kc - 1) <= 0.15 ? "close" : "off", txt: `${kc > 1 ? "+" : "−"}${Math.abs(Math.round(T.kcal - t.kcal))} kcal` });
  const p = r(T.p, t.p);
  checks.push({ k: "p", st: p >= 0.9 ? "ok" : p >= 0.8 ? "close" : "off", txt: `protéines ${Math.round(p * 100)} %` });
  const c = r(T.c, t.c);
  checks.push({ k: "c", st: Math.abs(c - 1) <= 0.15 ? "ok" : Math.abs(c - 1) <= 0.25 ? "close" : "off", txt: `glucides ${Math.round(c * 100)} %` });
  const f = r(T.f, t.f);
  checks.push({ k: "f", st: Math.abs(f - 1) <= 0.2 ? "ok" : Math.abs(f - 1) <= 0.3 ? "close" : "off", txt: `lipides ${Math.round(f * 100)} %` });
  const lowMicros = SCORED_MICROS.filter((m) => (T[m.k] || 0) < 0.7 * (t.micro[m.k] || 0));
  const microSt = lowMicros.length === 0 ? "ok" : lowMicros.length <= 2 ? "close" : "off";
  const order = { ok: 0, close: 1, off: 2 };
  const worst = [...checks.map((x) => x.st), microSt].reduce((a, b) => (order[b] > order[a] ? b : a), "ok");
  return {
    status: worst,
    checks,
    lowMicros,
    issues: [...checks.filter((x) => x.st !== "ok").map((x) => x.txt), ...(lowMicros.length ? [`${lowMicros.map((m) => m.label.toLowerCase()).join(", ")} < 70 %`] : [])],
  };
}
export const STATUS_UI = {
  ok: { icon: "✅", label: "Dans les clous", color: "#4fae7d" },
  close: { icon: "🟠", label: "Presque", color: "#e0a13d" },
  off: { icon: "⚠️", label: "À ajuster", color: "#d9695a" },
};
export { MEAL_BY_ID };
