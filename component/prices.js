/* =====================================================================
   prices.js — PRIX des aliments (budget des menus + liste de courses).

   • Prix ESTIMÉS en grande surface (France, gamme courante, 2026), en € par kg TEL QU'ACHETÉ.
     Ce sont des ordres de grandeur : chacun peut corriger un prix (settings.prices, € / kg),
     depuis la liste de courses.
   • Aliments notés « cuits » (riz, pâtes, viande, légumes secs…) : on achète cru / sec. RENDEMENT =
     poids cuit / poids acheté (riz ≈ 2,5 ; pâtes ≈ 2,3 ; lentilles sèches ≈ 2,5 ; viande ≈ 0,75 :
     elle perd ~25 % d'eau à la cuisson). Coût d'une portion = grammes / rendement × prix au kg ;
     la liste de courses affiche aussi la quantité À ACHETER (cru / sec).
   • Pur (pas de Firebase) : réglages de la personne enregistrés par setUserPrices / setBudget.
   ===================================================================== */

// prix € / kg acheté par catégorie (aliment sans prix propre, aliments perso)
export const CAT_PRICE = {
  feculent: 3,
  legumineuse: 3.5,
  viande: 13,
  poisson: 18,
  oeuf: 4.5,
  vegprot: 10,
  laitier: 6,
  legume: 3.5,
  fruit: 4,
  gras: 10,
  sucre: 7,
  boisson: 2.5,
  sport: 25,
  condiment: 7,
};

// [prix € / kg acheté, rendement (poids cuit / acheté), libellé d'achat]
const P = {
  // féculents (secs → cuits)
  riz_blanc: [2.2, 2.5, "sec"], riz_basmati: [3.5, 2.5, "sec"], riz_complet: [2.8, 2.4, "sec"], riz_thai: [3, 2.5, "sec"], riz_sauvage: [8, 2.6, "sec"], riz_sushi: [4, 2.2, "sec"],
  pates: [1.8, 2.3, "sèches"], pates_comp: [2.5, 2.3, "sèches"], pates_fraiches: [6, 1.5, "fraîches"], quinoa: [7, 2.7, "sec"], semoule: [2, 2.4, "sèche"], boulgour: [3, 2.5, "sec"],
  millet: [4, 2.6, "sec"], orge: [3, 2.7, "sec"], sarrasin: [5, 2.4, "sec"], polenta: [3, 4, "sèche"], nouilles_ble: [5, 2.2, "sèches"], nouilles_soba: [7, 2.2, "sèches"],
  nouilles_udon: [5, 1.3, "précuites"], vermicelles_riz: [5, 2.5, "sèches"], lasagnes_feuilles: [3.5, 2.2, "sèches"], tortellini: [9, 1.3, "frais"], gnocchis: [4.5, 1, ""],
  pdt: [1.5, 1, ""], patate_douce: [3, 1, ""], puree: [2.5, 1, ""], frites_four: [3, 1, "surgelées"], manioc: [3, 1, ""], banane_plantain: [3, 1, ""], mais: [4, 1, "conserve égouttée"],
  avoine: [2, 1, ""], flocons_sarrasin: [5, 1, ""], muesli: [5, 1, ""], granola: [8, 1, ""], corn_flakes: [6, 1, ""],
  pain_complet: [5, 1, ""], baguette: [4.5, 1, ""], pain_cereales: [6, 1, ""], pain_mie: [4, 1, ""], pain_seigle: [5, 1, ""], pain_pita: [5, 1, ""], naan: [7, 1, ""], bagel: [8, 1, ""],
  muffin_anglais: [7, 1, ""], tortilla_ble: [6, 1, ""], tortilla_mais: [7, 1, ""], biscottes: [5, 1, ""], pain_suedois: [8, 1, ""], galette_riz: [10, 1, ""], crepe: [6, 1, ""],
  crepe_sarrasin: [8, 1, ""], pancake: [7, 1, ""],
  // légumineuses (sèches → cuites, sinon conserve / frais)
  lentilles: [3, 2.5, "sèches"], lentilles_corail: [3.5, 2.5, "sèches"], pois_casses: [3, 2.5, "secs"], pois_chiches: [3.5, 2.2, "secs"], haricots_rouges: [4, 2.3, "secs"],
  haricots_blancs: [4, 2.3, "secs"], haricots_noirs: [5, 2.3, "secs"], flageolets: [4, 1, "conserve égouttée"], feves: [4, 1, "surgelées"], edamame: [8, 1, "surgelés"],
  houmous: [10, 1, ""], falafels: [10, 1, ""], dahl: [6, 1, ""],
  // viandes (crues → cuites)
  poulet: [11, 0.75, "cru"], aiguillette_poulet: [13, 0.75, "crues"], cuisse_poulet: [7, 0.6, "crue, avec os"], poulet_roti: [8, 0.7, "entier cru"], dinde: [12, 0.75, "crue"],
  boeuf5: [12, 0.75, "cru"], boeuf15: [9, 0.72, "cru"], steak: [22, 0.75, "cru"], bavette: [20, 0.75, "crue"], roti_boeuf: [22, 0.75, "cru"], boeuf_bourguignon: [13, 0.7, "cru"],
  veau: [25, 0.75, "crue"], agneau: [20, 0.7, "cru"], porc: [11, 0.75, "cru"], cote_porc: [9, 0.65, "crue, avec os"], roti_porc: [10, 0.75, "cru"], porc_effiloche: [9, 0.7, "crue"],
  lapin: [13, 0.65, "cru"], canard: [25, 0.7, "cru"], foie_volaille: [7, 0.8, "cru"], saucisse_volaille: [9, 0.85, "crue"], merguez: [11, 0.8, "crues"], kebab: [15, 1, ""],
  chorizo: [15, 1, ""], jambon: [13, 1, ""], jambon_cru: [25, 1, ""], blanc_poulet_tranche: [18, 1, ""], bacon: [14, 0.7, "cru"], lardons: [11, 0.75, "crus"],
  // poissons
  saumon: [20, 0.8, "cru"], saumon_cru: [25, 1, ""], saumon_fume: [30, 1, ""], cabillaud: [20, 0.8, "cru"], colin: [13, 0.8, "cru"], merlu: [14, 0.8, "cru"], bar: [20, 0.8, "cru"],
  dorade: [16, 0.8, "crue"], sole: [25, 0.8, "crue"], truite: [15, 0.8, "crue"], maquereau: [9, 0.8, "cru"], thon_frais: [30, 0.8, "cru"], thon: [12, 1, "conserve égouttée"],
  sardines: [10, 1, "conserve égouttée"], anchois: [25, 1, ""], hareng: [14, 1, ""], crevettes: [18, 1, "cuites"], moules: [5, 0.3, "avec coquilles"], calamar: [14, 0.8, "cru"],
  noix_st_jacques: [45, 0.85, "crues"], crabe: [30, 1, ""], surimi: [8, 1, ""],
  // œufs (≈ 0,27 € l'œuf)
  oeuf: [4.5, 1, ""], oeuf_dur: [4.5, 1, ""], omelette: [4.5, 1, "en œufs"], blanc_oeuf: [6, 1, ""],
  // protéines végétales
  tofu: [9, 1, ""], tofu_ferme: [9, 1, ""], tofu_soyeux: [6, 1, ""], tempeh: [15, 1, ""], seitan: [15, 1, ""], steak_soja: [13, 1, ""], proteines_soja: [8, 3, "sèches"],
  boisson_soja: [2, 1, ""], yaourt_soja: [3.5, 1, ""],
  // produits laitiers
  lait: [1.1, 1, ""], lait_ecreme: [1, 1, ""], lait_entier: [1.3, 1, ""], yaourt: [2.5, 1, ""], yaourt_grec: [4, 1, ""], yaourt_grec_0: [5, 1, ""], skyr: [4.5, 1, ""],
  fromage_blanc: [2.5, 1, ""], petit_suisse: [4, 1, ""], cottage: [7, 1, ""], kefir: [4, 1, ""], creme_legere: [5, 1, ""], creme_fraiche: [6, 1, ""], emmental: [10, 1, ""],
  comte: [18, 1, ""], parmesan: [25, 1, ""], mozza: [10, 1, ""], mozza_light: [10, 1, ""], burrata: [18, 1, ""], feta: [12, 1, ""], chevre: [15, 1, ""], chevre_buche: [13, 1, ""],
  camembert: [9, 1, ""], cheddar: [12, 1, ""], raclette: [13, 1, ""], ricotta: [9, 1, ""],
  // légumes
  salade: [6, 1, ""], mache: [15, 1, ""], roquette: [15, 1, ""], epinards: [4, 1, "surgelés"], brocoli: [4, 1, ""], haricots_verts: [3.5, 1, "surgelés"], haricots_plats: [5, 1, ""],
  tomate: [3, 1, ""], tomates_cerises: [6, 1, ""], tomates_concassees: [2.5, 1, ""], carotte: [1.5, 1, ""], courgette: [2.5, 1, ""], aubergine: [3, 1, ""], poivron: [4, 1, ""],
  poivron_vert: [3.5, 1, ""], poivron_grille: [8, 1, ""], oignon: [2, 1, ""], oignon_rouge: [2.5, 1, ""], ail: [8, 1, ""], echalote: [6, 1, ""], champignons: [5, 1, ""],
  chou_fleur: [3, 1, ""], chou_kale: [8, 1, ""], chou_rouge: [2, 1, ""], chou_vert: [2, 1, ""], choux_bruxelles: [4, 1, ""], concombre: [2.5, 1, ""], petits_pois: [3.5, 1, "surgelés"],
  poireau: [3, 1, ""], potiron: [2.5, 1, ""], celeri_branche: [3, 1, ""], celeri_rave: [3, 1, ""], betterave: [3, 1, ""], navet: [2.5, 1, ""], fenouil: [4, 1, ""], radis: [4, 1, ""],
  asperges: [10, 1, ""], artichaut: [9, 1, "conserve"], pak_choi: [6, 1, ""], pousses_soja: [6, 1, ""], algues_nori: [100, 1, "feuilles"], algues_wakame: [20, 1, ""],
  kimchi: [15, 1, ""], ratatouille: [5, 1, ""], soupe_legumes: [3, 1, ""], gaspacho: [4, 1, ""],
  // fruits
  banane: [2, 1, ""], pomme: [2.5, 1, ""], poire: [3, 1, ""], orange: [2.5, 1, ""], clementine: [3, 1, ""], kiwi: [4, 1, ""], fraises: [8, 1, ""], framboises: [18, 1, ""],
  myrtilles: [15, 1, ""], fruits_rouges: [10, 1, "surgelés"], raisin: [4, 1, ""], cerises: [8, 1, ""], abricot: [4, 1, ""], peche: [3.5, 1, ""], prune: [3.5, 1, ""], mangue: [5, 1, ""],
  ananas: [3, 1, ""], melon: [3, 1, ""], pasteque: [1.5, 1, ""], figue: [9, 1, ""], grenade: [6, 1, ""], fruit_passion: [15, 1, ""], litchi: [8, 1, ""], citron: [3, 1, ""],
  pamplemousse: [3, 1, ""], compote: [3.5, 1, ""], dattes: [7, 1, ""], abricots_secs: [12, 1, ""], figues_seches: [11, 1, ""], raisins_secs: [7, 1, ""], pruneaux: [9, 1, ""],
  // matières grasses & oléagineux
  huile_olive: [9, 1, ""], huile_colza: [3, 1, ""], huile_noix: [15, 1, ""], huile_sesame: [12, 1, ""], huile_coco: [12, 1, ""], beurre: [10, 1, ""], amandes: [14, 1, ""], noix: [16, 1, ""],
  noisettes: [15, 1, ""], noix_cajou: [18, 1, ""], noix_bresil: [22, 1, ""], pistaches: [25, 1, ""], cacahuetes: [7, 1, ""], beurre_cacahuete: [9, 1, ""], puree_amandes: [22, 1, ""],
  tahini: [12, 1, ""], graines_chia: [10, 1, ""], graines_lin: [6, 1, ""], graines_courge: [15, 1, ""], graines_tournesol: [6, 1, ""], sesame: [8, 1, ""], noix_coco: [8, 1, ""],
  avocat: [6, 1, ""], guacamole: [12, 1, ""], olives: [9, 1, ""], pesto: [15, 1, ""], mayonnaise: [6, 1, ""], vinaigrette: [4, 1, ""], lait_coco: [4, 1, ""], lait_coco_light: [4, 1, ""],
  chocolat_noir: [12, 1, ""],
  // sucré
  sucre: [1.2, 1, ""], miel: [12, 1, ""], confiture: [5, 1, ""], sirop_erable: [20, 1, ""], chocolat_lait: [10, 1, ""], pate_tartiner: [7, 1, ""], cookie: [9, 1, ""], biscuits_secs: [5, 1, ""],
  barre_cereales: [10, 1, ""], croissant: [10, 1, ""], pain_epices: [6, 1, ""], glace: [6, 1, ""], creme_dessert: [4, 1, ""], gateau_riz: [5, 1, ""], pate_fruits: [12, 1, ""], mochi: [20, 1, ""],
  // boissons
  jus_orange: [2, 1, ""], jus_pomme: [1.5, 1, ""], smoothie: [5, 1, ""], lait_amande: [2.5, 1, ""], boisson_avoine: [2, 1, ""], lait_chocolat: [2, 1, ""], eau_coco: [4, 1, ""],
  // sport
  whey_food: [25, 1, ""], caseine: [30, 1, ""], proteine_vegetale: [28, 1, ""], barre_proteinee: [30, 1, ""], boisson_recup: [20, 1, ""], boisson_sport: [10, 1, ""], gel_energetique: [40, 1, ""],
  // sauces & condiments
  bouillon: [0.5, 1, "préparé"], sauce_soja: [6, 1, ""], moutarde: [5, 1, ""], ketchup: [4, 1, ""], harissa: [10, 1, ""], miso: [15, 1, ""], pate_curry: [15, 1, ""], salsa: [8, 1, ""],
  sauce_bbq: [6, 1, ""], sauce_cacahuete: [12, 1, ""], sauce_nuoc_mam: [8, 1, ""], sauce_teriyaki: [10, 1, ""], sauce_tomate: [3.5, 1, ""], coulis_tomate: [2.5, 1, ""], tzatziki: [9, 1, ""],
};

/* ---- Réglages de la personne (prix corrigés, budget) ---- */
let USER_PRICES = {};
let BUDGET_WEEK = 0;
export const setUserPrices = (m) => {
  USER_PRICES = m && typeof m === "object" ? m : {};
};
export const setBudget = (weekly) => {
  BUDGET_WEEK = Number(weekly) > 0 ? Number(weekly) : 0;
};
export const budgetWeek = () => BUDGET_WEEK;
export const budgetDay = () => (BUDGET_WEEK > 0 ? BUDGET_WEEK / 7 : 0);

/* Prix d'un aliment : { kg: € / kg acheté, yield, buy: libellé, src: "perso" | "base" | "cat" } */
export function priceInfo(food) {
  if (!food) return null;
  const base = P[food.id];
  const yld = base ? base[1] : Number(food.yield) > 0 ? Number(food.yield) : 1;
  const buy = base ? base[2] : "";
  const user = Number(USER_PRICES[food.id]);
  if (user > 0) return { kg: user, yield: yld, buy, src: "perso" };
  if (Number(food.price) > 0) return { kg: Number(food.price), yield: yld, buy, src: "aliment" };
  if (base) return { kg: base[0], yield: yld, buy, src: "base" };
  return { kg: CAT_PRICE[food.cat] || 6, yield: 1, buy: "", src: "cat" };
}
/* Coût (€) de g grammes MANGÉS */
export function costOf(food, g) {
  const p = priceInfo(food);
  if (!p || !(g > 0)) return 0;
  return ((g / p.yield) * p.kg) / 1000;
}
/* Quantité à acheter pour g grammes mangés : { g: grammes achetés, txt: « 300 g sec », count?: « 4 œufs » } */
export function buyOf(food, g) {
  const p = priceInfo(food) || { yield: 1, buy: "" };
  const raw = g / (p.yield || 1);
  const r = raw >= 1000 ? Math.round(raw / 50) * 50 : raw >= 100 ? Math.round(raw / 10) * 10 : Math.max(5, Math.round(raw / 5) * 5);
  const unit = /lait|jus|boisson|bouillon|soupe|gaspacho|smoothie|kefir|eau_coco|sirop|huile/.test(food?.id || "") ? "ml" : "g";
  const amount = r >= 1000 ? `${String(Math.round(r / 100) / 10).replace(".", ",")} ${unit === "ml" ? "L" : "kg"}` : `${r} ${unit}`;
  let count = null;
  if (unit === "g" && food?.portion && food.portion[1] > 0 && p.yield === 1) {
    const n = Math.ceil(raw / food.portion[1] - 0.15);
    if (n >= 1 && n <= 60) {
      const [w0, ...rest] = String(food.portion[0]).split(" ");
      const w = n > 1 && !/[sx]$/.test(w0) ? `${w0}s` : w0;
      count = `${n} ${[w, ...rest].join(" ")}`;
    }
  }
  return { g: r, txt: `${amount}${p.buy ? ` ${p.buy}` : ""}`, count };
}
export const fmtEur = (v) => `${(Math.round((Number(v) || 0) * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
