/* =====================================================================
   recipes.js — recettes du Planning, classées par cuisine.
   Une recette = ingrédients fixes (g, pour 1 personne) + 3 « leviers » dont les quantités sont
   calculées pour coller aux besoins du repas : P (protéines), C (glucides), F (lipides).
   Chaque levier liste des alternatives : la 1re compatible avec le régime est utilisée
   (ex. ["poulet", "tofu_ferme"] → tofu pour un végétarien).
   meals : pd = petit-déjeuner, dj = déjeuner, co = collation, se = autour de la séance, di = dîner
   ===================================================================== */

import { GEN_RECIPES } from "./recipeGen";

export const CUISINES = [
  { id: "fr", flag: "🇫🇷", label: "Française" },
  { id: "it", flag: "🇮🇹", label: "Italienne" },
  { id: "es", flag: "🇪🇸", label: "Espagnole" },
  { id: "gr", flag: "🇬🇷", label: "Grecque & méditerranéenne" },
  { id: "ma", flag: "🇲🇦", label: "Maghrébine" },
  { id: "or", flag: "🇱🇧", label: "Libanaise & turque" },
  { id: "in", flag: "🇮🇳", label: "Indienne" },
  { id: "jp", flag: "🇯🇵", label: "Japonaise" },
  { id: "cn", flag: "🇨🇳", label: "Chinoise" },
  { id: "th", flag: "🇹🇭", label: "Thaïlandaise" },
  { id: "vn", flag: "🇻🇳", label: "Vietnamienne" },
  { id: "kr", flag: "🇰🇷", label: "Coréenne" },
  { id: "mx", flag: "🇲🇽", label: "Mexicaine" },
  { id: "us", flag: "🇺🇸", label: "Américaine" },
  { id: "no", flag: "🇸🇪", label: "Scandinave" },
  { id: "af", flag: "🌍", label: "Africaine & antillaise" },
  { id: "sp", flag: "🏃", label: "Sportive express" },
  { id: "autre", flag: "🍽️", label: "Maison / autre" },
];
export const CUISINE_BY_ID = Object.fromEntries(CUISINES.map((c) => [c.id, c]));

const MEAL_CODES = { pd: "petitdej", dj: "dejeuner", co: "collation", se: "seance", di: "diner" };
const R = (id, name, cuisine, meals, fixed, P, C, F) => ({
  id,
  name,
  cuisine,
  meals: meals.split(" ").map((m) => MEAL_CODES[m]),
  fixed,
  P,
  C,
  F,
});
const PLAT = "dj di";

export const RECIPES = [
  // ======================= 🇫🇷 FRANÇAISE =======================
  R("fr_tartines", "Tartines beurre-confiture, yaourt", "fr", "pd", [["orange", 150], ["confiture", 20]], ["yaourt", "skyr"], ["pain_complet"], ["beurre"]),
  R("fr_oeufs_coque", "Œufs à la coque & mouillettes", "fr", "pd", [["orange", 150], ["epinards", 60]], ["oeuf"], ["pain_complet"], ["beurre"]),
  R("fr_porridge", "Porridge banane-amandes", "fr", "pd se", [["lait", 250], ["banane", 120]], ["skyr"], ["avoine"], ["amandes"]),
  R("fr_muesli", "Bol de muesli, kiwi & noix", "fr", "pd", [["kiwi", 150], ["lait", 200]], ["fromage_blanc"], ["muesli"], ["noix"]),
  R("fr_crepes", "Crêpes, fromage blanc & fruits rouges", "fr", "pd co", [["fruits_rouges", 100], ["sirop_erable", 15]], ["fromage_blanc"], ["crepe"], ["beurre"]),
  R("fr_galette_complete", "Galette complète jambon-œuf-fromage", "fr", PLAT, [["salade", 60], ["champignons", 60], ["emmental", 20]], ["jambon", "oeuf"], ["crepe_sarrasin"], ["beurre"]),
  R("fr_poulet_haricots", "Poulet rôti, haricots verts & pommes vapeur", "fr", PLAT, [["haricots_verts", 200], ["salade", 40]], ["cuisse_poulet", "tofu_ferme"], ["pdt"], ["beurre", "huile_olive"]),
  R("fr_steak_puree", "Steak haché, purée & carottes", "fr", PLAT, [["carotte", 120], ["salade", 40]], ["boeuf5", "steak_soja"], ["puree"], ["huile_colza"]),
  R("fr_boeuf_bourguignon", "Bœuf bourguignon & tagliatelles", "fr", PLAT, [["carotte", 100], ["champignons", 80], ["oignon", 50]], ["boeuf_bourguignon", "seitan"], ["pates_fraiches"], ["huile_colza"]),
  R("fr_blanquette", "Blanquette de veau & riz", "fr", PLAT, [["carotte", 100], ["champignons", 80], ["creme_legere", 30]], ["veau", "tofu_ferme"], ["riz_blanc"], ["beurre"]),
  R("fr_cabillaud_beurre", "Dos de cabillaud, poireaux & riz", "fr", PLAT, [["poireau", 200], ["citron", 15]], ["cabillaud", "oeuf"], ["riz_basmati"], ["beurre"]),
  R("fr_saumon_lentilles", "Pavé de saumon & lentilles vertes", "fr", PLAT, [["carotte", 80], ["oignon", 40], ["mache", 30]], ["saumon", "oeuf"], ["lentilles"], ["huile_colza"]),
  R("fr_lentilles_saucisse", "Petit salé aux lentilles (version légère)", "fr", PLAT, [["carotte", 100], ["oignon", 50]], ["saucisse_volaille", "tofu_ferme"], ["lentilles"], ["huile_colza"]),
  R("fr_quiche", "Quiche-salade (œufs, lardons, crème)", "fr", PLAT, [["salade", 80], ["lardons", 30], ["creme_legere", 30], ["tomate", 100]], ["oeuf"], ["pain_complet"], ["emmental"]),
  R("fr_salade_lyonnaise", "Salade lyonnaise, œuf poché & croûtons", "fr", PLAT, [["salade", 100], ["lardons", 30], ["tomate", 100]], ["oeuf"], ["pain_cereales"], ["vinaigrette"]),
  R("fr_salade_nicoise", "Salade niçoise", "fr", PLAT, [["tomate", 150], ["haricots_verts", 100], ["poivron", 60], ["olives", 15], ["anchois", 8]], ["thon", "oeuf_dur"], ["pdt"], ["huile_olive"]),
  R("fr_hachis", "Hachis parmentier & salade", "fr", PLAT, [["oignon", 50], ["salade", 60], ["tomate", 80]], ["boeuf5", "proteines_soja"], ["puree"], ["emmental"]),
  R("fr_gratin_dauph", "Rôti de porc, gratin & haricots", "fr", PLAT, [["haricots_verts", 150], ["creme_legere", 30]], ["roti_porc", "oeuf"], ["pdt"], ["emmental"]),
  R("fr_croque", "Croque-monsieur & salade", "fr", PLAT, [["salade", 80], ["tomate", 100]], ["jambon", "oeuf"], ["pain_mie"], ["emmental"]),
  R("fr_tartiflette", "Tartiflette légère & salade", "fr", PLAT, [["oignon", 60], ["lardons", 30], ["salade", 80]], ["blanc_poulet_tranche", "oeuf"], ["pdt"], ["raclette"]),
  R("fr_soupe_pain", "Soupe de légumes, pain & fromage", "fr", "di", [["soupe_legumes", 350], ["salade", 40]], ["oeuf_dur", "cottage"], ["pain_seigle"], ["comte"]),
  R("fr_omelette", "Omelette aux champignons, pommes sautées", "fr", PLAT, [["champignons", 120], ["salade", 60]], ["oeuf"], ["pdt"], ["beurre", "huile_olive"]),
  R("fr_magret", "Magret de canard, haricots & patate douce", "fr", PLAT, [["haricots_verts", 180]], ["canard", "tofu_ferme"], ["patate_douce"], ["huile_olive"]),
  R("fr_lapin_moutarde", "Lapin à la moutarde & tagliatelles", "fr", PLAT, [["moutarde", 10], ["creme_legere", 30], ["champignons", 80]], ["lapin", "seitan"], ["pates_fraiches"], ["huile_olive"]),
  R("fr_moules", "Moules marinières & frites au four", "fr", PLAT, [["oignon", 40], ["salade", 60], ["creme_legere", 20]], ["moules"], ["frites_four"], ["beurre"]),
  R("fr_goûter_pain_choco", "Pain & chocolat, verre de lait", "fr", "co se", [["chocolat_noir", 15]], ["lait"], ["baguette"], ["amandes"]),
  R("fr_compote_yaourt", "Yaourt, compote & biscuits", "fr", "co", [["compote", 90]], ["yaourt", "skyr"], ["biscuits_secs"], ["noisettes"]),

  // ======================= 🇮🇹 ITALIENNE =======================
  R("it_bolo", "Spaghetti bolognaise", "it", PLAT, [["sauce_tomate", 120], ["oignon", 40], ["carotte", 40], ["parmesan", 10]], ["boeuf5", "proteines_soja"], ["pates"], ["huile_olive"]),
  R("it_carbo", "Pâtes carbonara (version œuf)", "it", PLAT, [["lardons", 25], ["parmesan", 12], ["salade", 60]], ["oeuf", "blanc_oeuf"], ["pates"], ["huile_olive"]),
  R("it_pesto_poulet", "Penne au pesto & poulet", "it", PLAT, [["tomates_cerises", 100], ["roquette", 30], ["parmesan", 8]], ["poulet", "tofu_ferme"], ["pates_comp"], ["pesto"]),
  R("it_risotto", "Risotto aux champignons & poulet", "it", PLAT, [["champignons", 150], ["oignon", 40], ["parmesan", 12]], ["poulet", "oeuf"], ["riz_blanc"], ["beurre"]),
  R("it_lasagnes", "Lasagnes à la bolognaise", "it", PLAT, [["sauce_tomate", 120], ["epinards", 80], ["parmesan", 10]], ["boeuf5", "ricotta"], ["lasagnes_feuilles"], ["mozza"]),
  R("it_caprese", "Salade caprese & pâtes froides", "it", PLAT, [["tomate", 200], ["roquette", 30]], ["mozza_light", "mozza"], ["pates"], ["huile_olive"]),
  R("it_minestrone", "Minestrone & pain", "it", "di", [["soupe_legumes", 300], ["haricots_blancs", 80], ["parmesan", 10]], ["poulet", "oeuf_dur"], ["pain_complet"], ["huile_olive"]),
  R("it_gnocchi", "Gnocchis sauce tomate & mozzarella", "it", PLAT, [["sauce_tomate", 120], ["epinards", 100]], ["mozza_light", "ricotta"], ["gnocchis"], ["huile_olive"]),
  R("it_saltimbocca", "Escalope de veau, polenta & légumes grillés", "it", PLAT, [["courgette", 150], ["poivron_grille", 80], ["jambon_cru", 15]], ["veau", "tofu_ferme"], ["polenta"], ["huile_olive"]),
  R("it_tortellini", "Tortellini ricotta-épinards", "it", PLAT, [["sauce_tomate", 100], ["roquette", 40]], ["poulet", "ricotta"], ["tortellini"], ["huile_olive"]),
  R("it_pizza_maison", "Pizza maison jambon-champignons", "it", PLAT, [["sauce_tomate", 80], ["champignons", 60], ["roquette", 30]], ["jambon", "mozza_light"], ["pain_pita"], ["mozza"]),
  R("it_ossobuco", "Mijoté de veau à la tomate & orge", "it", PLAT, [["tomates_concassees", 150], ["carotte", 60], ["celeri_branche", 40]], ["veau", "seitan"], ["orge"], ["huile_olive"]),
  R("it_frittata", "Frittata courgettes-feta & pain", "it", PLAT, [["courgette", 150], ["tomate", 100]], ["oeuf"], ["pain_cereales"], ["feta"]),
  R("it_burrata", "Burrata, tomates & jambon cru sur pain", "it", PLAT, [["tomate", 200], ["roquette", 30], ["jambon_cru", 30]], ["burrata"], ["pain_complet"], ["huile_olive"]),
  R("it_colazione", "Ricotta, miel & fruits sur pain", "it", "pd", [["figue", 100], ["miel", 10]], ["ricotta", "fromage_blanc"], ["pain_complet"], ["noix"]),

  // ======================= 🇪🇸 ESPAGNOLE =======================
  R("es_paella", "Paella poulet-crevettes", "es", PLAT, [["poivron", 80], ["petits_pois", 60], ["tomate", 80], ["crevettes", 50]], ["poulet", "tofu_ferme"], ["riz_blanc"], ["huile_olive"]),
  R("es_tortilla", "Tortilla de patatas & salade", "es", PLAT, [["oignon", 60], ["salade", 80], ["tomate", 100]], ["oeuf"], ["pdt"], ["huile_olive"]),
  R("es_pan_tomate", "Pan con tomate & jamón", "es", "pd se", [["tomate", 100], ["orange", 150]], ["jambon_cru", "oeuf"], ["baguette"], ["huile_olive"]),
  R("es_gazpacho", "Gaspacho, œuf & croûtons", "es", PLAT, [["gaspacho", 300], ["concombre", 80]], ["oeuf_dur", "thon"], ["pain_complet"], ["huile_olive"]),
  R("es_poulet_chorizo", "Poulet au chorizo, poivrons & riz", "es", PLAT, [["poivron", 120], ["oignon", 50], ["chorizo", 15], ["tomates_concassees", 100]], ["cuisse_poulet", "pois_chiches"], ["riz_blanc"], ["huile_olive"]),
  R("es_merlu", "Merlu a la plancha, pommes de terre & poivrons", "es", PLAT, [["poivron_grille", 120], ["citron", 15]], ["merlu", "oeuf"], ["pdt"], ["huile_olive"]),
  R("es_calamars", "Calamars a la plancha, riz & salade", "es", PLAT, [["salade", 80], ["tomate", 100], ["ail", 5]], ["calamar", "tofu_ferme"], ["riz_blanc"], ["huile_olive"]),
  R("es_fabada", "Haricots blancs mijotés au chorizo (fabada)", "es", PLAT, [["chorizo", 15], ["oignon", 40], ["tomates_concassees", 80]], ["saucisse_volaille", "tofu_ferme"], ["haricots_blancs"], ["huile_olive"]),
  R("es_pisto", "Pisto (ratatouille espagnole) & œufs", "es", PLAT, [["ratatouille", 250]], ["oeuf"], ["pain_complet"], ["huile_olive"]),

  // ======================= 🇬🇷 GRECQUE & MÉDITERRANÉENNE =======================
  R("gr_yaourt_miel", "Yaourt grec, miel & noix", "gr", "pd co", [["miel", 10], ["fruits_rouges", 80]], ["yaourt_grec_0", "skyr"], ["granola"], ["noix"]),
  R("gr_salade_grecque", "Salade grecque & pita", "gr", PLAT, [["tomate", 150], ["concombre", 120], ["oignon_rouge", 30], ["olives", 20]], ["poulet", "pois_chiches"], ["pain_pita"], ["feta"]),
  R("gr_souvlaki", "Souvlaki de poulet, tzatziki & riz", "gr", PLAT, [["tzatziki", 50], ["tomate", 100], ["oignon_rouge", 30]], ["poulet", "seitan"], ["riz_basmati"], ["huile_olive"]),
  R("gr_moussaka", "Moussaka légère", "gr", PLAT, [["aubergine", 200], ["tomates_concassees", 100], ["oignon", 40]], ["agneau", "lentilles"], ["pdt"], ["feta"]),
  R("gr_dorade", "Dorade grillée, boulgour & légumes", "gr", PLAT, [["courgette", 150], ["tomate", 100], ["citron", 15]], ["dorade", "pois_chiches"], ["boulgour"], ["huile_olive"]),
  R("gr_bar_fenouil", "Bar rôti au fenouil & quinoa", "gr", PLAT, [["fenouil", 150], ["tomates_cerises", 80], ["citron", 15]], ["bar", "tofu_ferme"], ["quinoa"], ["huile_olive"]),
  R("gr_gyros", "Gyros (pita porc, tzatziki)", "gr", PLAT, [["tzatziki", 50], ["tomate", 80], ["oignon_rouge", 30], ["salade", 30]], ["porc_effiloche", "seitan"], ["pain_pita"], ["huile_olive"]),

  // ======================= 🇲🇦 MAGHRÉBINE =======================
  R("ma_couscous", "Couscous poulet & légumes", "ma", PLAT, [["carotte", 80], ["courgette", 100], ["navet", 60], ["pois_chiches", 60], ["harissa", 5]], ["cuisse_poulet", "pois_chiches"], ["semoule"], ["huile_olive"]),
  R("ma_couscous_merguez", "Couscous merguez", "ma", PLAT, [["carotte", 80], ["courgette", 100], ["pois_chiches", 50], ["harissa", 5]], ["merguez", "pois_chiches"], ["semoule"], ["huile_olive"]),
  R("ma_tajine_poulet", "Tajine de poulet citron-olives", "ma", PLAT, [["oignon", 60], ["olives", 20], ["citron", 20], ["carotte", 80]], ["cuisse_poulet", "pois_chiches"], ["semoule"], ["huile_olive"]),
  R("ma_tajine_agneau", "Tajine d'agneau pruneaux & amandes", "ma", PLAT, [["oignon", 60], ["pruneaux", 30], ["courgette", 100]], ["agneau", "pois_chiches"], ["semoule"], ["amandes"]),
  R("ma_chakchouka", "Chakchouka (œufs, poivrons, tomate)", "ma", "pd dj di", [["poivron", 150], ["tomates_concassees", 150], ["oignon", 40]], ["oeuf"], ["pain_complet"], ["huile_olive"]),
  R("ma_harira", "Harira (soupe lentilles-pois chiches)", "ma", "di", [["tomates_concassees", 120], ["celeri_branche", 40], ["oignon", 40], ["pois_chiches", 50]], ["agneau", "lentilles"], ["pain_complet"], ["huile_olive"]),
  R("ma_msemen", "Msemen, miel & lait", "ma", "pd co", [["miel", 15], ["dattes", 16]], ["lait", "yaourt"], ["crepe"], ["beurre"]),

  // ======================= 🇱🇧 LIBANAISE & TURQUE =======================
  R("or_taboule", "Taboulé libanais & poulet grillé", "or", PLAT, [["tomate", 150], ["concombre", 100], ["oignon_rouge", 20], ["citron", 20]], ["poulet", "pois_chiches"], ["boulgour"], ["huile_olive"]),
  R("or_falafel", "Assiette falafels, houmous & pita", "or", PLAT, [["houmous", 50], ["tomate", 100], ["concombre", 80], ["chou_rouge", 50]], ["falafels"], ["pain_pita"], ["tahini"]),
  R("or_chawarma", "Chawarma poulet & sauce tahini", "or", PLAT, [["tomate", 80], ["oignon_rouge", 30], ["salade", 40]], ["poulet", "falafels"], ["pain_pita"], ["tahini"]),
  R("or_kefta", "Keftas d'agneau, boulgour & yaourt", "or", PLAT, [["yaourt", 80], ["tomate", 100], ["concombre", 80]], ["agneau", "lentilles_corail"], ["boulgour"], ["huile_olive"]),
  R("or_mezze", "Mezze (houmous, taboulé, légumes)", "or", PLAT, [["houmous", 80], ["carotte", 80], ["concombre", 80], ["tomate", 80]], ["pois_chiches", "edamame"], ["pain_pita"], ["huile_olive"]),
  R("or_menemen", "Menemen (œufs brouillés tomate-poivron)", "or", "pd", [["tomate", 120], ["poivron_vert", 80], ["olives", 15]], ["oeuf"], ["pain_complet"], ["feta"]),
  R("or_kebab", "Kebab assiette, frites au four & salade", "or", PLAT, [["salade", 60], ["tomate", 80], ["oignon_rouge", 30], ["tzatziki", 40]], ["kebab", "falafels"], ["frites_four"], ["huile_olive"]),

  // ======================= 🇮🇳 INDIENNE =======================
  R("in_butter_chicken", "Poulet tikka masala & riz basmati", "in", PLAT, [["tomates_concassees", 120], ["oignon", 50], ["yaourt", 60], ["epinards", 80]], ["poulet", "tofu_ferme"], ["riz_basmati"], ["creme_legere"]),
  R("in_dahl", "Dahl de lentilles corail & riz", "in", PLAT, [["tomates_concassees", 100], ["oignon", 40], ["epinards", 80]], ["lentilles_corail"], ["riz_basmati"], ["lait_coco"]),
  R("in_chana", "Chana masala (pois chiches) & naan", "in", PLAT, [["tomates_concassees", 120], ["oignon", 50], ["epinards", 80]], ["pois_chiches"], ["naan"], ["huile_colza"]),
  R("in_palak", "Palak tofu (épinards) & riz", "in", PLAT, [["epinards", 200], ["oignon", 40], ["tomate", 60]], ["tofu_ferme"], ["riz_basmati"], ["creme_legere"]),
  R("in_curry_crevettes", "Curry de crevettes au lait de coco", "in", PLAT, [["tomates_concassees", 100], ["oignon", 40], ["chou_fleur", 120]], ["crevettes", "pois_chiches"], ["riz_basmati"], ["lait_coco"]),
  R("in_tandoori", "Poulet tandoori, raïta & riz", "in", PLAT, [["yaourt", 100], ["concombre", 80], ["tomate", 80]], ["poulet", "tofu_ferme"], ["riz_basmati"], ["huile_colza"]),
  R("in_lassi", "Lassi mangue & granola", "in", "pd co se", [["mangue", 120]], ["yaourt", "yaourt_soja"], ["granola"], ["pistaches"]),

  // ======================= 🇯🇵 JAPONAISE =======================
  R("jp_teriyaki", "Bol saumon teriyaki, riz & edamame", "jp", PLAT, [["edamame", 60], ["brocoli", 120], ["sauce_teriyaki", 20], ["sesame", 5]], ["saumon", "tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("jp_poke", "Poke bowl saumon-avocat", "jp", PLAT, [["concombre", 80], ["carotte", 60], ["edamame", 50], ["sauce_soja", 15], ["algues_wakame", 30]], ["saumon_cru", "tofu_ferme"], ["riz_sushi"], ["avocat"]),
  R("jp_sushi", "Assiette sushis & maki", "jp", PLAT, [["algues_nori", 6], ["concombre", 60], ["sauce_soja", 15], ["algues_wakame", 30]], ["saumon_cru", "tofu_ferme"], ["riz_sushi"], ["avocat"]),
  R("jp_ramen", "Ramen au porc & œuf mollet", "jp", PLAT, [["bouillon", 400], ["miso", 15], ["pak_choi", 100], ["pousses_soja", 50], ["oeuf", 50]], ["roti_porc", "tofu_ferme"], ["nouilles_ble"], ["huile_sesame"]),
  R("jp_soba", "Soba froides, tofu & légumes", "jp", PLAT, [["concombre", 80], ["carotte", 60], ["sauce_soja", 15], ["algues_wakame", 30]], ["tofu_ferme"], ["nouilles_soba"], ["huile_sesame"]),
  R("jp_udon", "Udon sautées au bœuf", "jp", PLAT, [["chou_vert", 100], ["oignon", 40], ["champignons", 60], ["sauce_soja", 15]], ["steak", "tofu_ferme"], ["nouilles_udon"], ["huile_sesame"]),
  R("jp_donburi", "Oyakodon (poulet & œuf sur riz)", "jp", PLAT, [["oignon", 60], ["oeuf", 50], ["sauce_soja", 15], ["epinards", 80]], ["cuisse_poulet", "tofu_ferme"], ["riz_blanc"], ["huile_colza"]),
  R("jp_cabillaud_miso", "Cabillaud au miso, riz & brocoli", "jp", PLAT, [["miso", 15], ["brocoli", 150], ["algues_wakame", 30]], ["cabillaud", "tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("jp_petitdej", "Petit-déj japonais (riz, miso, saumon, œuf)", "jp", "pd", [["miso", 15], ["algues_wakame", 20], ["tofu_soyeux", 50]], ["saumon", "oeuf"], ["riz_blanc"], ["huile_sesame"]),
  R("jp_onigiri", "Onigiri thon-mayo & edamame", "jp", "co se", [["algues_nori", 3], ["edamame", 50]], ["thon", "tofu_ferme"], ["riz_sushi"], ["mayonnaise"]),

  // ======================= 🇨🇳 CHINOISE =======================
  R("cn_poulet_cajou", "Poulet sauté aux noix de cajou", "cn", PLAT, [["poivron", 100], ["oignon", 40], ["brocoli", 100], ["sauce_soja", 15]], ["poulet", "tofu_ferme"], ["riz_thai"], ["noix_cajou"]),
  R("cn_boeuf_brocoli", "Bœuf sauté au brocoli", "cn", PLAT, [["brocoli", 200], ["ail", 5], ["sauce_soja", 15]], ["steak", "tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("cn_riz_cantonais", "Riz cantonais (œuf, jambon, petits pois)", "cn", PLAT, [["petits_pois", 80], ["oeuf", 50], ["oignon", 30], ["sauce_soja", 10]], ["jambon", "tofu_ferme"], ["riz_blanc"], ["huile_colza"]),
  R("cn_porc_aigre", "Porc aigre-doux, ananas & riz", "cn", PLAT, [["ananas", 80], ["poivron", 100], ["oignon", 40], ["ketchup", 15]], ["roti_porc", "tofu_ferme"], ["riz_thai"], ["huile_colza"]),
  R("cn_mapo", "Mapo tofu & riz", "cn", PLAT, [["pak_choi", 120], ["sauce_soja", 15], ["oignon", 30]], ["tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("cn_nouilles_sautees", "Nouilles sautées crevettes-légumes", "cn", PLAT, [["pousses_soja", 80], ["carotte", 60], ["chou_vert", 80], ["sauce_soja", 15]], ["crevettes", "tofu_ferme"], ["nouilles_ble"], ["huile_sesame"]),
  R("cn_canard_laque", "Canard laqué, crêpes & concombre", "cn", PLAT, [["concombre", 100], ["oignon", 30], ["sauce_teriyaki", 15]], ["canard", "seitan"], ["crepe"], ["huile_sesame"]),

  // ======================= 🇹🇭 THAÏLANDAISE =======================
  R("th_curry_vert", "Curry vert de poulet & riz thaï", "th", PLAT, [["pate_curry", 15], ["courgette", 100], ["haricots_plats", 80], ["poivron", 60]], ["poulet", "tofu_ferme"], ["riz_thai"], ["lait_coco"]),
  R("th_pad_thai", "Pad thaï aux crevettes", "th", PLAT, [["pousses_soja", 80], ["oeuf", 50], ["citron", 10], ["sauce_nuoc_mam", 10]], ["crevettes", "tofu_ferme"], ["vermicelles_riz"], ["cacahuetes"]),
  R("th_curry_rouge", "Curry rouge de bœuf & légumes", "th", PLAT, [["pate_curry", 15], ["poivron", 100], ["aubergine", 100]], ["steak", "tofu_ferme"], ["riz_thai"], ["lait_coco"]),
  R("th_salade_boeuf", "Salade thaïe au bœuf (yam neua)", "th", PLAT, [["concombre", 100], ["tomates_cerises", 80], ["oignon_rouge", 30], ["citron", 15], ["sauce_nuoc_mam", 10]], ["bavette", "tofu_ferme"], ["vermicelles_riz"], ["cacahuetes"]),
  R("th_tom_kha", "Soupe tom kha gai (coco-poulet)", "th", "di", [["champignons", 100], ["citron", 15], ["bouillon", 250]], ["poulet", "tofu_ferme"], ["riz_thai"], ["lait_coco"]),
  R("th_riz_saute", "Riz sauté au basilic & œuf (kra pao)", "th", PLAT, [["haricots_plats", 100], ["oignon", 30], ["oeuf", 50], ["sauce_soja", 10]], ["aiguillette_poulet", "tofu_ferme"], ["riz_thai"], ["huile_colza"]),

  // ======================= 🇻🇳 VIETNAMIENNE =======================
  R("vn_pho", "Phở au bœuf", "vn", PLAT, [["bouillon", 400], ["pousses_soja", 80], ["oignon", 30], ["citron", 10]], ["steak", "tofu_ferme"], ["vermicelles_riz"], ["huile_colza"]),
  R("vn_bobun", "Bò bún (bœuf citronnelle, vermicelles)", "vn", PLAT, [["salade", 60], ["carotte", 60], ["concombre", 60], ["pousses_soja", 50], ["sauce_nuoc_mam", 10]], ["bavette", "tofu_ferme"], ["vermicelles_riz"], ["cacahuetes"]),
  R("vn_rouleaux", "Rouleaux de printemps crevettes", "vn", PLAT, [["salade", 60], ["carotte", 60], ["concombre", 60], ["sauce_cacahuete", 20]], ["crevettes", "tofu_ferme"], ["vermicelles_riz"], ["cacahuetes"]),
  R("vn_banh_mi", "Bánh mì au porc", "vn", PLAT, [["carotte", 50], ["concombre", 50], ["radis", 30]], ["porc_effiloche", "tofu_ferme"], ["baguette"], ["mayonnaise"]),
  R("vn_poulet_caramel", "Poulet au caramel & riz", "vn", PLAT, [["oignon", 40], ["pak_choi", 120], ["sauce_nuoc_mam", 10], ["sucre", 8]], ["cuisse_poulet", "tofu_ferme"], ["riz_thai"], ["huile_colza"]),

  // ======================= 🇰🇷 CORÉENNE =======================
  R("kr_bibimbap", "Bibimbap (bœuf, légumes, œuf)", "kr", PLAT, [["epinards", 80], ["carotte", 60], ["pousses_soja", 60], ["kimchi", 50], ["oeuf", 50]], ["boeuf5", "tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("kr_bulgogi", "Bulgogi de bœuf & riz", "kr", PLAT, [["oignon", 50], ["carotte", 50], ["kimchi", 50], ["sauce_soja", 15]], ["steak", "tofu_ferme"], ["riz_blanc"], ["huile_sesame"]),
  R("kr_poulet", "Poulet coréen sauce épicée & riz", "kr", PLAT, [["brocoli", 120], ["sesame", 5], ["sauce_soja", 10], ["miel", 10]], ["cuisse_poulet", "tofu_ferme"], ["riz_blanc"], ["huile_colza"]),
  R("kr_japchae", "Japchae (nouilles sautées légumes)", "kr", PLAT, [["epinards", 80], ["carotte", 60], ["champignons", 60], ["oignon", 30], ["sauce_soja", 15]], ["steak", "tofu_ferme"], ["vermicelles_riz"], ["huile_sesame"]),

  // ======================= 🇲🇽 MEXICAINE =======================
  R("mx_chili", "Chili con carne & riz", "mx", PLAT, [["haricots_rouges", 100], ["tomates_concassees", 120], ["oignon", 40], ["poivron", 60]], ["boeuf5", "proteines_soja"], ["riz_blanc"], ["huile_olive"]),
  R("mx_burrito_bowl", "Burrito bowl poulet-haricots noirs", "mx", PLAT, [["haricots_noirs", 80], ["mais", 60], ["salsa", 50], ["salade", 40]], ["poulet", "haricots_noirs"], ["riz_blanc"], ["guacamole"]),
  R("mx_tacos", "Tacos de poulet, salsa & guacamole", "mx", PLAT, [["salsa", 60], ["oignon_rouge", 30], ["chou_rouge", 50]], ["aiguillette_poulet", "haricots_noirs"], ["tortilla_mais"], ["guacamole"]),
  R("mx_fajitas", "Fajitas bœuf-poivrons", "mx", PLAT, [["poivron", 120], ["oignon", 60], ["salsa", 40]], ["bavette", "haricots_noirs"], ["tortilla_ble"], ["guacamole"]),
  R("mx_quesadilla", "Quesadillas poulet-fromage", "mx", PLAT, [["poivron", 80], ["mais", 50], ["salsa", 40], ["salade", 40]], ["aiguillette_poulet", "haricots_noirs"], ["tortilla_ble"], ["cheddar"]),
  R("mx_huevos", "Huevos rancheros", "mx", "pd dj", [["haricots_noirs", 60], ["salsa", 60], ["tomate", 80]], ["oeuf"], ["tortilla_mais"], ["avocat"]),
  R("mx_poisson_tacos", "Tacos de poisson & chou", "mx", PLAT, [["chou_rouge", 80], ["citron", 10], ["salsa", 40]], ["colin", "haricots_noirs"], ["tortilla_mais"], ["guacamole"]),

  // ======================= 🇺🇸 AMÉRICAINE =======================
  R("us_pancakes", "Pancakes, myrtilles & sirop d'érable", "us", "pd se", [["myrtilles", 80], ["sirop_erable", 20]], ["yaourt_grec_0", "skyr"], ["pancake"], ["beurre"]),
  R("us_bagel_saumon", "Bagel saumon fumé & fromage frais", "us", "pd dj", [["concombre", 50], ["roquette", 20]], ["saumon_fume", "oeuf"], ["bagel"], ["chevre"]),
  R("us_eggs_bacon", "Œufs brouillés, bacon & toasts", "us", "pd", [["bacon", 20], ["tomate", 100], ["orange", 150]], ["oeuf"], ["pain_mie"], ["beurre"]),
  R("us_burger", "Burger maison & frites au four", "us", PLAT, [["salade", 30], ["tomate", 60], ["oignon_rouge", 20], ["ketchup", 15]], ["boeuf5", "steak_soja"], ["bagel"], ["cheddar"]),
  R("us_bbq", "Poulet BBQ, maïs & patate douce", "us", PLAT, [["mais", 100], ["chou_rouge", 80], ["sauce_bbq", 20]], ["cuisse_poulet", "seitan"], ["patate_douce"], ["huile_colza"]),
  R("us_pulled_pork", "Pulled pork & coleslaw", "us", PLAT, [["chou_rouge", 100], ["carotte", 60], ["sauce_bbq", 20]], ["porc_effiloche", "seitan"], ["pain_mie"], ["mayonnaise"]),
  R("us_cobb", "Cobb salad", "us", PLAT, [["salade", 120], ["tomate", 100], ["bacon", 15], ["oeuf_dur", 50]], ["poulet", "oeuf_dur"], ["pain_cereales"], ["avocat"]),
  R("us_overnight", "Overnight oats beurre de cacahuète", "us", "pd se", [["lait", 200], ["banane", 100]], ["yaourt_grec_0", "skyr"], ["avoine"], ["beurre_cacahuete"]),
  R("us_pb_toast", "Toast beurre de cacahuète & banane", "us", "co se", [["banane", 100]], ["lait", "skyr"], ["pain_complet"], ["beurre_cacahuete"]),

  // ======================= 🇸🇪 SCANDINAVE =======================
  R("no_smorrebrod", "Smørrebrød saumon fumé & œuf", "no", "pd dj", [["concombre", 60], ["oignon_rouge", 15], ["citron", 10]], ["saumon_fume", "oeuf_dur"], ["pain_seigle"], ["creme_fraiche"]),
  R("no_skyr_bowl", "Skyr bowl, baies & graines", "no", "pd co", [["myrtilles", 100], ["miel", 10]], ["skyr"], ["muesli"], ["graines_courge"]),
  R("no_saumon_aneth", "Saumon à l'aneth, pommes vapeur & concombre", "no", PLAT, [["concombre", 100], ["haricots_verts", 120], ["citron", 15]], ["saumon", "oeuf"], ["pdt"], ["creme_legere"]),
  R("no_boulettes", "Boulettes suédoises, purée & airelles", "no", PLAT, [["confiture", 20], ["haricots_verts", 120]], ["boeuf5", "steak_soja"], ["puree"], ["creme_legere"]),
  R("no_hareng", "Hareng, pommes de terre & betterave", "no", PLAT, [["betterave", 100], ["oignon_rouge", 20], ["salade", 40]], ["hareng", "oeuf"], ["pdt"], ["creme_fraiche"]),
  R("no_knackebrod", "Pain suédois, cottage & concombre", "no", "co se", [["concombre", 80], ["tomates_cerises", 60]], ["cottage"], ["pain_suedois"], ["graines_tournesol"]),

  // ======================= 🌍 AFRICAINE & ANTILLAISE =======================
  R("af_mafe", "Mafé de poulet (sauce arachide) & riz", "af", PLAT, [["tomates_concassees", 100], ["carotte", 80], ["patate_douce", 80], ["oignon", 40]], ["cuisse_poulet", "pois_chiches"], ["riz_blanc"], ["beurre_cacahuete"]),
  R("af_yassa", "Poulet yassa (oignons-citron) & riz", "af", PLAT, [["oignon", 120], ["citron", 20], ["moutarde", 5]], ["cuisse_poulet", "tofu_ferme"], ["riz_blanc"], ["huile_colza"]),
  R("af_colombo", "Colombo de porc & riz", "af", PLAT, [["courgette", 100], ["pdt", 80], ["oignon", 40]], ["cote_porc", "pois_chiches"], ["riz_blanc"], ["huile_colza"]),
  R("af_poisson_plantain", "Poisson grillé & bananes plantain", "af", PLAT, [["tomate", 100], ["oignon", 40], ["citron", 15]], ["dorade", "haricots_rouges"], ["banane_plantain"], ["huile_colza"]),
  R("af_riz_haricots", "Riz-haricots rouges créole & poulet", "af", PLAT, [["haricots_rouges", 80], ["oignon", 40], ["poivron", 60]], ["cuisse_poulet", "haricots_rouges"], ["riz_blanc"], ["lait_coco_light"]),

  // ======================= 🏃 SPORTIVE EXPRESS =======================
  R("sp_poulet_riz", "Poulet-riz-brocoli", "sp", PLAT, [["brocoli", 200], ["salade", 40]], ["poulet", "tofu_ferme"], ["riz_blanc"], ["huile_olive"]),
  R("sp_boeuf_pates", "Bœuf haché, pâtes complètes & courgettes", "sp", PLAT, [["tomate", 150], ["courgette", 150]], ["boeuf5", "tempeh"], ["pates_comp"], ["huile_olive"]),
  R("sp_saumon_quinoa", "Saumon, quinoa & épinards", "sp", PLAT, [["epinards", 150], ["poivron", 100]], ["saumon", "lentilles"], ["quinoa"], ["avocat"]),
  R("sp_dinde_pdt", "Dinde, pommes de terre & champignons", "sp", PLAT, [["champignons", 150], ["salade", 50]], ["dinde", "tofu"], ["pdt"], ["huile_colza"]),
  R("sp_cabillaud_patate", "Cabillaud, patate douce & haricots verts", "sp", PLAT, [["haricots_verts", 200]], ["cabillaud", "oeuf"], ["patate_douce"], ["huile_colza"]),
  R("sp_maquereau", "Maquereau, riz complet & brocoli", "sp", PLAT, [["brocoli", 200]], ["maquereau", "tofu"], ["riz_complet"], ["huile_colza"]),
  R("sp_sardines", "Sardines, semoule & crudités", "sp", PLAT, [["carotte", 100], ["epinards", 100]], ["sardines", "pois_chiches"], ["semoule"], ["huile_olive"]),
  R("sp_semoule_poulet", "Semoule, poulet & crudités", "sp", PLAT, [["carotte", 120], ["salade", 50]], ["poulet", "pois_chiches"], ["semoule"], ["huile_olive"]),
  R("sp_pre_seance", "Collation pré-séance (fromage blanc, muesli, banane)", "sp", "se co", [["banane", 120], ["lait", 300]], ["fromage_blanc"], ["muesli"], ["beurre_cacahuete"]),
  R("sp_sandwich", "Sandwich jambon-beurre & jus d'orange", "sp", "se", [["jus_orange", 200]], ["jambon", "oeuf"], ["baguette"], ["beurre"]),
  R("sp_recup", "Récup : lait chocolaté, banane & barre", "sp", "se", [["banane", 120]], ["lait_chocolat"], ["barre_cereales"], ["amandes"]),
  R("sp_shaker", "Shaker whey, flocons d'avoine & fruit", "sp", "se co", [["pomme", 150], ["lait", 250]], ["whey_food", "proteine_vegetale"], ["avoine"], ["amandes"]),
  R("sp_galettes", "Galettes de riz, skyr & dattes", "sp", "co se", [["pomme", 150]], ["skyr"], ["galette_riz"], ["amandes"]),
  R("sp_fromage_blanc", "Fromage blanc, fruits rouges & noix", "sp", "co", [["fruits_rouges", 100]], ["fromage_blanc"], ["galette_riz"], ["noix"]),
  R("sp_skyr_dattes", "Skyr, pomme & dattes", "sp", "co", [["pomme", 150]], ["skyr"], ["dattes"], ["amandes"]),
];
// durée de préparation par défaut des recettes écrites à la main (minutes)
RECIPES.forEach((r) => {
  if (!r.time) r.time = r.meals.includes("dejeuner") || r.meals.includes("diner") ? 25 : 10;
});
/* Catalogue complet : recettes écrites à la main + recettes générées (recipeGen.js, ≈ 6 800) */
export const ALL_RECIPES = [...RECIPES, ...GEN_RECIPES];
export const RECIPE_BY_ID = Object.fromEntries(ALL_RECIPES.map((r) => [r.id, r]));
