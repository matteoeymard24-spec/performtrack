/* =====================================================================
   recipeGen.js — CATALOGUE de recettes générées (≈ 5 000), sur le principe des applis type Jow :
   beaucoup de recettes simples et rapides, classées par cuisine, avec un prix par portion.

   Les recettes ne sont PAS copiées d'une autre appli : chaque cuisine a des PRÉPARATIONS réelles
   (sauce, cuisson, assaisonnement : « à la crème et aux champignons », « curry coco »,
   « teriyaki »…) combinées à des protéines, féculents et légumes qui vont ensemble.
   Format identique à recipes.js : aliments fixes (g pour 1 personne) + leviers P / C / F dont les
   grammes sont calculés selon les besoins du repas. P = [protéine, alternative végétarienne].
   Les identifiants inexistants sont filtrés à la construction des menus (nutritionData.js).
   ===================================================================== */

const PLAT = ["dejeuner", "diner"];

// noms courts (dans les titres)
const L = {
  // protéines
  poulet: "Poulet", cuisse_poulet: "Cuisse de poulet", aiguillette_poulet: "Aiguillettes de poulet", dinde: "Dinde", boeuf5: "Bœuf haché", steak: "Steak", bavette: "Bavette",
  porc: "Filet de porc", cote_porc: "Côte de porc", veau: "Veau", agneau: "Agneau", canard: "Canard", lapin: "Lapin", saucisse_volaille: "Saucisses de volaille", merguez: "Merguez",
  porc_effiloche: "Porc effiloché", roti_boeuf: "Rôti de bœuf", saumon: "Saumon", cabillaud: "Cabillaud", colin: "Colin", merlu: "Merlu", truite: "Truite", dorade: "Dorade",
  bar: "Bar", maquereau: "Maquereau", sardines: "Sardines", thon: "Thon", thon_frais: "Thon frais", crevettes: "Crevettes", calamar: "Calamars", moules: "Moules",
  noix_st_jacques: "Saint-Jacques", oeuf: "Œufs", omelette: "Omelette", tofu_ferme: "Tofu", tofu: "Tofu", tempeh: "Tempeh", seitan: "Seitan", steak_soja: "Steak de soja",
  pois_chiches: "Pois chiches", lentilles_corail: "Lentilles corail", haricots_rouges: "Haricots rouges", haricots_noirs: "Haricots noirs", falafels: "Falafels",
  jambon: "Jambon", saumon_fume: "Saumon fumé", feta: "Feta", halloumi: "Halloumi", mozza: "Mozzarella", chevre: "Chèvre", ricotta: "Ricotta",
  // féculents
  riz_blanc: "riz", riz_basmati: "riz basmati", riz_complet: "riz complet", riz_thai: "riz thaï", riz_sauvage: "riz sauvage", pates: "pâtes", pates_comp: "pâtes complètes",
  pates_fraiches: "tagliatelles fraîches", gnocchis: "gnocchis", tortellini: "tortellini", pdt: "pommes de terre", puree: "purée", patate_douce: "patate douce",
  frites_four: "frites au four", quinoa: "quinoa", boulgour: "boulgour", semoule: "semoule", polenta: "polenta", lentilles: "lentilles", nouilles_ble: "nouilles",
  nouilles_udon: "udon", nouilles_soba: "soba", vermicelles_riz: "vermicelles de riz", tortilla_ble: "tortillas", tortilla_mais: "tortillas de maïs", pain_pita: "pita",
  naan: "naan", baguette: "baguette", pain_complet: "pain complet", manioc: "manioc", banane_plantain: "banane plantain", sarrasin: "sarrasin", orge: "orge perlé",
  riz_sushi: "riz vinaigré", crepe_sarrasin: "galette de sarrasin", millet: "millet", haricots_blancs: "haricots blancs", flageolets: "flageolets", mais: "maïs",
};
const lab = (id) => L[id] || id.replace(/_/g, " ");
const V = (label, ...fixed) => ({ label, fixed });
const ALT_DEFAULT = "tofu_ferme";
const ALT = { oeuf: "tofu_ferme", omelette: "tofu_ferme", tofu_ferme: "oeuf", tofu: "oeuf", tempeh: "oeuf", seitan: "oeuf", pois_chiches: "oeuf", lentilles_corail: "oeuf", haricots_rouges: "oeuf", haricots_noirs: "oeuf", falafels: "oeuf", steak_soja: "oeuf", feta: "oeuf", halloumi: "oeuf", mozza: "oeuf", chevre: "oeuf", ricotta: "oeuf" };

/* Une préparation : n = titre ({P} protéine, {C} féculent, {V} légumes), P / C / V = choix compatibles,
   fx = aliments fixes de la préparation (sauce, aromates), F = matière grasse, t = minutes, m = repas */
const S = (n, P, C, Vs, fx, F, t, m = PLAT) => ({ n, P, C, V: Vs, fx, F, t, m });

/* ---------- légumes réutilisés ---------- */
const HV = V("haricots verts", ["haricots_verts", 150]);
const BRO = V("brocolis", ["brocoli", 150]);
const COU = V("courgettes", ["courgette", 150]);
const EPI = V("épinards", ["epinards", 120]);
const CAR = V("carottes", ["carotte", 130]);
const POI = V("poivrons", ["poivron", 120]);
const CHA = V("champignons", ["champignons", 120]);
const SAL = V("salade verte", ["salade", 60], ["tomate", 80]);
const RAT = V("ratatouille", ["ratatouille", 200]);
const PET = V("petits pois-carottes", ["petits_pois", 80], ["carotte", 80]);
const POIR = V("poireaux", ["poireau", 150]);
const CHF = V("chou-fleur", ["chou_fleur", 150]);
const AUB = V("aubergines", ["aubergine", 150]);
const TOM = V("tomates", ["tomate", 150]);
const ASP = V("asperges", ["asperges", 130]);
const FEN = V("fenouil", ["fenouil", 130]);
const PAK = V("pak choï", ["pak_choi", 130]);
const SOJ = V("pousses de soja & carottes", ["pousses_soja", 70], ["carotte", 60]);
const CHR = V("chou rouge", ["chou_rouge", 120]);
const KAL = V("chou kale", ["chou_kale", 100]);
const BRX = V("choux de Bruxelles", ["choux_bruxelles", 130]);
const POT = V("potiron", ["potiron", 160]);
const CON = V("concombre & tomates", ["concombre", 80], ["tomate", 80]);
const MAI = V("maïs & poivrons", ["mais", 60], ["poivron", 80]);
const PDP = V("poêlée de légumes", ["courgette", 80], ["poivron", 60], ["oignon", 30]);
const HAP = V("haricots plats", ["haricots_plats", 150]);
const BET = V("betteraves", ["betterave", 100], ["mache", 30]);
const ART = V("artichauts", ["artichaut", 100], ["tomates_cerises", 60]);
const ROQ = V("roquette & tomates cerises", ["roquette", 40], ["tomates_cerises", 80]);

/* ---------- protéines par famille ---------- */
const VOL = ["poulet", "dinde", "cuisse_poulet", "aiguillette_poulet"];
const ROUGE = ["boeuf5", "steak", "bavette"];
const POISB = ["cabillaud", "colin", "merlu", "bar", "dorade"];
const POISG = ["saumon", "truite", "maquereau"];
const VEGE = ["tofu_ferme", "tempeh", "pois_chiches"];

const CUIS = {
  fr: [
    S("{P} à la crème et aux champignons, {C}", [...VOL, "veau", "porc", "lapin", "tofu_ferme"], ["riz_blanc", "pates_fraiches", "pdt", "puree", "boulgour"], [HV, EPI, CAR], [["champignons", 100], ["creme_legere", 30], ["oignon", 30]], ["beurre"], 25),
    S("{P} à la moutarde, {C} et {V}", [...VOL, "porc", "lapin", "saucisse_volaille", "tofu_ferme"], ["pdt", "puree", "riz_blanc", "pates", "lentilles"], [HV, CAR, BRO, POIR], [["moutarde", 10], ["creme_legere", 20], ["echalote", 20]], ["huile_colza"], 25),
    S("{P} en papillote citron-thym, {C} et {V}", [...POISB, ...POISG, "poulet", "tofu_ferme"], ["riz_basmati", "pdt", "quinoa", "boulgour"], [COU, FEN, POIR, HV, ASP], [["citron", 20], ["tomates_cerises", 60]], ["huile_olive"], 30),
    S("{P} poêlé au beurre, {C} et {V}", [...ROUGE, "cote_porc", "canard", "veau", "steak_soja"], ["pdt", "frites_four", "puree", "patate_douce"], [HV, SAL, CHA, HAP], [["echalote", 15]], ["beurre"], 20),
    S("{P} façon grand-mère, {C} et {V}", [...VOL, "roti_boeuf", "porc", "lapin", "seitan"], ["pdt", "puree", "pates", "riz_blanc"], [CAR, PET, CHA, HV], [["oignon", 40], ["bouillon", 100]], ["huile_colza"], 40),
    S("{P} au four et légumes rôtis, {C}", [...VOL, ...POISG, "porc", "tofu_ferme"], ["patate_douce", "pdt", "quinoa", "riz_complet"], [CAR, POT, CHF, BRX, BET], [["oignon_rouge", 40], ["ail", 5]], ["huile_olive"], 35),
    S("Gratin de {C} au {P} et {V}", ["jambon", "poulet", "thon", "saumon", "oeuf"], ["pates", "pdt", "gnocchis", "pates_comp"], [BRO, CHF, EPI, POIR], [["emmental", 25], ["lait", 80]], ["beurre"], 35),
    S("{P} à la provençale, {C}", [...VOL, ...POISB, "agneau", "tofu_ferme"], ["riz_blanc", "semoule", "pates", "polenta", "boulgour"], [RAT, TOM, COU, AUB], [["tomates_concassees", 80], ["oignon", 30], ["olives", 10]], ["huile_olive"], 30),
  ],
  it: [
    S("Pâtes {P} pesto, {V}", [...VOL, "crevettes", "thon", "mozza", "tofu_ferme"], ["pates", "pates_comp", "pates_fraiches", "gnocchis"], [COU, ROQ, BRO, TOM, HV], [["parmesan", 10]], ["pesto"], 20),
    S("{C} sauce tomate-basilic, {P}", ["boeuf5", "poulet", "thon", "crevettes", "ricotta", "lentilles_corail"], ["pates", "pates_comp", "gnocchis", "tortellini", "polenta"], [AUB, COU, CHA, EPI], [["sauce_tomate", 100], ["parmesan", 10], ["oignon", 30]], ["huile_olive"], 25),
    S("Risotto {V} et {P}", [...VOL, "crevettes", "noix_st_jacques", "saumon", "tofu_ferme"], ["riz_blanc"], [CHA, ASP, POT, EPI, PET], [["parmesan", 15], ["oignon", 30], ["bouillon", 150]], ["beurre"], 35),
    S("{P} alla piccata (citron-câpres), {C} et {V}", ["veau", "poulet", "dinde", "colin", "tofu_ferme"], ["pates", "pates_fraiches", "pdt", "polenta"], [EPI, HV, ROQ, ASP], [["citron", 20]], ["beurre"], 20),
    S("{P} saltimbocca, {C} et {V}", ["veau", "poulet", "dinde", "porc", "tofu_ferme"], ["pates_fraiches", "pdt", "polenta", "riz_blanc"], [EPI, HV, COU, ART], [["jambon_cru", 15]], ["huile_olive"], 20),
    S("Salade de {C} à l'italienne, {P}", ["mozza", "thon", "poulet", "jambon", "pois_chiches"], ["pates", "pates_comp", "quinoa", "orge"], [ROQ, TOM, ART, POI], [["olives", 15], ["parmesan", 10]], ["huile_olive"], 15),
    S("Lasagnes express {P} et {V}", ["boeuf5", "poulet", "ricotta", "saumon", "lentilles_corail"], ["lasagnes_feuilles"], [EPI, COU, AUB, CHA], [["sauce_tomate", 100], ["mozza_light", 30]], ["huile_olive"], 45),
  ],
  es: [
    S("Paella express {P}, {V}", ["poulet", "crevettes", "calamar", "moules", "cuisse_poulet", "tofu_ferme"], ["riz_blanc", "riz_complet"], [POI, PET, HV, TOM], [["tomate", 60], ["oignon", 30], ["citron", 15]], ["huile_olive"], 35),
    S("{P} a la plancha, {C} et {V}", [...VOL, "calamar", "crevettes", "merlu", "porc", "tofu_ferme"], ["pdt", "riz_blanc", "patate_douce", "pain_complet"], [POI, COU, SAL, AUB, TOM], [["ail", 5], ["citron", 15]], ["huile_olive"], 20),
    S("{P} au chorizo et poivrons, {C}", ["poulet", "cuisse_poulet", "cabillaud", "pois_chiches", "oeuf"], ["riz_blanc", "pdt", "boulgour", "semoule"], [POI, TOM, COU], [["chorizo", 15], ["oignon", 30], ["tomates_concassees", 60]], ["huile_olive"], 30),
    S("Tortilla de patatas, {P} et {V}", ["oeuf", "omelette"], ["pdt"], [SAL, POI, EPI, ROQ], [["oignon", 50]], ["huile_olive"], 30),
    S("{P} sauce romesco, {C} et {V}", [...POISB, "poulet", "dinde", "tofu_ferme"], ["pdt", "riz_basmati", "quinoa", "boulgour"], [ASP, POI, HV, COU], [["poivron_grille", 50], ["amandes", 10]], ["huile_olive"], 25),
  ],
  gr: [
    S("{P} souvlaki, {C} et {V}", [...VOL, "porc", "agneau", "halloumi", "tofu_ferme"], ["pain_pita", "riz_blanc", "boulgour", "pdt"], [CON, SAL, TOM, POI], [["tzatziki", 40], ["oignon_rouge", 20]], ["huile_olive"], 25),
    S("Bowl grec {P}, {C} et {V}", ["poulet", "feta", "pois_chiches", "crevettes", "thon"], ["quinoa", "boulgour", "orge", "riz_complet"], [CON, TOM, ROQ, ART], [["olives", 15], ["oignon_rouge", 20]], ["huile_olive"], 15),
    S("{P} au citron et origan, {C} et {V}", [...VOL, ...POISB, "agneau", "tofu_ferme"], ["pdt", "riz_blanc", "boulgour", "orge"], [HV, COU, AUB, FEN], [["citron", 20], ["ail", 5]], ["huile_olive"], 30),
    S("{P} façon moussaka, {C}", ["boeuf5", "agneau", "lentilles_corail", "dinde"], ["pdt", "boulgour", "riz_blanc"], [AUB, COU], [["tomates_concassees", 80], ["oignon", 30], ["yaourt_grec", 40]], ["huile_olive"], 45),
  ],
  ma: [
    S("Tajine de {P} aux légumes, {C}", [...VOL, "agneau", "boeuf5", "pois_chiches", "tofu_ferme"], ["semoule", "boulgour", "quinoa", "riz_basmati"], [CAR, COU, POT, V("navets & carottes", ["navet", 80], ["carotte", 80])], [["oignon", 40], ["tomates_concassees", 60], ["abricots_secs", 15]], ["huile_olive"], 45),
    S("Couscous {P}, {V}", ["poulet", "cuisse_poulet", "merguez", "agneau", "pois_chiches"], ["semoule"], [V("légumes du couscous", ["courgette", 80], ["carotte", 80], ["navet", 50]), COU, CAR, POT], [["bouillon", 150], ["harissa", 5], ["pois_chiches", 40]], ["huile_olive"], 40),
    S("{P} chermoula, {C} et {V}", [...POISB, "poulet", "crevettes", "tofu_ferme"], ["semoule", "riz_basmati", "boulgour", "pdt"], [POI, TOM, COU, CAR], [["citron", 20], ["ail", 5]], ["huile_olive"], 25),
    S("Keftas de {P} sauce tomate, {C}", ["boeuf5", "agneau", "dinde", "lentilles_corail"], ["semoule", "riz_blanc", "boulgour", "pain_pita"], [TOM, POI, COU], [["tomates_concassees", 80], ["oignon", 30]], ["huile_olive"], 30),
  ],
  or: [
    S("{P} shawarma, {C} et {V}", [...VOL, "boeuf5", "agneau", "falafels", "tofu_ferme"], ["pain_pita", "riz_basmati", "boulgour", "naan"], [CON, SAL, CHR, TOM], [["tahini", 10], ["oignon_rouge", 20]], ["huile_olive"], 25),
    S("Bowl libanais {P}, {C} et {V}", ["falafels", "poulet", "pois_chiches", "agneau", "halloumi"], ["boulgour", "quinoa", "riz_basmati", "semoule"], [CON, TOM, CHR, ROQ], [["houmous", 40]], ["huile_olive"], 15),
    S("Köfte de {P}, {C} et {V}", ["boeuf5", "agneau", "dinde", "lentilles_corail"], ["boulgour", "riz_blanc", "pain_pita", "pdt"], [AUB, POI, TOM, CON], [["yaourt_grec", 50], ["oignon", 20]], ["huile_olive"], 30),
  ],
  in: [
    S("Curry de {P} au lait de coco, {C}", [...VOL, "crevettes", "cabillaud", "pois_chiches", "lentilles_corail", "tofu_ferme"], ["riz_basmati", "naan", "riz_complet", "quinoa"], [EPI, CHF, POI, PET, POT], [["pate_curry", 15], ["oignon", 40], ["tomates_concassees", 60]], ["lait_coco_light"], 30),
    S("{P} tikka masala, {C} et {V}", [...VOL, "crevettes", "tofu_ferme", "pois_chiches"], ["riz_basmati", "naan", "riz_blanc"], [EPI, PET, CHF, HV], [["sauce_tomate", 80], ["yaourt", 50], ["oignon", 30]], ["huile_colza"], 35),
    S("Dahl de {P}, {C} et {V}", ["lentilles_corail", "pois_chiches", "oeuf", "poulet"], ["riz_basmati", "naan", "riz_complet"], [EPI, CHF, CAR, POT], [["tomates_concassees", 80], ["oignon", 40]], ["lait_coco_light"], 30),
    S("{P} tandoori, {C} et {V}", [...VOL, "saumon", "crevettes", "tofu_ferme"], ["riz_basmati", "naan", "boulgour", "pdt"], [CON, HV, BRO, CHF], [["yaourt", 60], ["citron", 15]], ["huile_colza"], 30),
  ],
  jp: [
    S("{P} teriyaki, {C} et {V}", [...VOL, "saumon", "boeuf5", "tofu_ferme", "tempeh"], ["riz_sushi", "riz_blanc", "nouilles_udon", "nouilles_soba"], [BRO, PAK, HV, EPI, SOJ], [["sauce_teriyaki", 25], ["sesame", 5]], ["huile_sesame"], 20),
    S("Donburi {P}, {V}", ["poulet", "boeuf5", "saumon", "oeuf", "tofu_ferme"], ["riz_blanc", "riz_sushi"], [EPI, PAK, CHA, POI], [["oignon", 40], ["sauce_soja", 15]], ["huile_sesame"], 20),
    S("Poke bowl {P}, {V}", ["saumon_cru", "thon_frais", "crevettes", "tofu_ferme", "poulet"], ["riz_sushi", "quinoa", "riz_complet"], [CON, V("edamame & chou rouge", ["edamame", 50], ["chou_rouge", 60]), V("mangue & concombre", ["mangue", 60], ["concombre", 60]), V("avocat & radis", ["radis", 40], ["concombre", 60])], [["sauce_soja", 15], ["algues_wakame", 10], ["sesame", 5]], ["avocat"], 15),
    S("Soupe udon {P} et {V}", ["poulet", "crevettes", "tofu_ferme", "oeuf", "boeuf5"], ["nouilles_udon", "nouilles_soba"], [PAK, CHA, EPI, POIR], [["miso", 20], ["bouillon", 250]], ["huile_sesame"], 20),
  ],
  cn: [
    S("{P} sauté aux légumes, {C}", [...VOL, "boeuf5", "bavette", "crevettes", "porc", "tofu_ferme"], ["riz_blanc", "nouilles_ble", "riz_thai", "vermicelles_riz"], [BRO, POI, PAK, SOJ, CHA, HV], [["sauce_soja", 20], ["ail", 5], ["oignon", 30]], ["huile_sesame"], 20),
    S("{P} aigre-douce, {C} et {V}", ["poulet", "porc", "crevettes", "tofu_ferme", "dinde"], ["riz_blanc", "riz_thai", "nouilles_ble"], [POI, V("ananas & poivrons", ["ananas", 70], ["poivron", 70]), BRO, CAR], [["ketchup", 15], ["sauce_soja", 10]], ["huile_colza"], 25),
    S("Riz cantonais {P}, {V}", ["oeuf", "crevettes", "jambon", "poulet", "tofu_ferme"], ["riz_blanc", "riz_thai"], [PET, SOJ, CAR, POI], [["oignon", 20], ["sauce_soja", 10]], ["huile_colza"], 20),
    S("Nouilles sautées {P}, {V}", ["boeuf5", "poulet", "crevettes", "tofu_ferme", "porc"], ["nouilles_ble", "nouilles_udon", "vermicelles_riz"], [PAK, SOJ, CHA, BRO, CHR], [["sauce_soja", 20], ["ail", 5]], ["huile_sesame"], 20),
  ],
  th: [
    S("Curry vert de {P}, {C} et {V}", [...VOL, "crevettes", "cabillaud", "tofu_ferme"], ["riz_thai", "riz_basmati", "vermicelles_riz"], [HV, AUB, POI, COU, BRO], [["pate_curry", 15], ["oignon", 20]], ["lait_coco_light"], 25),
    S("Pad thaï {P}, {V}", ["crevettes", "poulet", "tofu_ferme", "oeuf"], ["vermicelles_riz", "nouilles_ble"], [SOJ, CAR, CHR, POI], [["cacahuetes", 10], ["citron", 15], ["sauce_nuoc_mam", 10]], ["huile_colza"], 25),
    S("{P} sauté basilic thaï, {C} et {V}", ["poulet", "boeuf5", "dinde", "porc", "tofu_ferme"], ["riz_thai", "riz_blanc", "riz_complet"], [HV, POI, BRO, CHA], [["sauce_nuoc_mam", 10], ["ail", 5]], ["huile_colza"], 15),
    S("Salade thaï {P}, {C} et {V}", ["boeuf5", "bavette", "crevettes", "poulet", "tofu_ferme"], ["vermicelles_riz", "riz_thai", "quinoa"], [CON, SOJ, CHR, V("mangue & concombre", ["mangue", 60], ["concombre", 60])], [["citron", 15], ["cacahuetes", 10], ["sauce_nuoc_mam", 10]], ["huile_colza"], 20),
  ],
  vn: [
    S("Bo bun {P}, {V}", ["boeuf5", "bavette", "poulet", "crevettes", "tofu_ferme"], ["vermicelles_riz"], [SOJ, CON, CAR, SAL], [["cacahuetes", 10], ["sauce_nuoc_mam", 15], ["oignon", 20]], ["huile_colza"], 25),
    S("Soupe pho {P}, {V}", ["boeuf5", "roti_boeuf", "poulet", "tofu_ferme", "crevettes"], ["vermicelles_riz", "nouilles_ble"], [SOJ, PAK, BRO], [["bouillon", 300], ["citron", 15], ["oignon", 20]], ["huile_colza"], 30),
    S("{P} caramélisé, {C} et {V}", ["porc", "poulet", "saumon", "tofu_ferme", "dinde"], ["riz_thai", "riz_blanc", "vermicelles_riz"], [HV, PAK, BRO, CON], [["sauce_nuoc_mam", 10], ["sucre", 8], ["oignon", 30]], ["huile_colza"], 25),
  ],
  kr: [
    S("Bibimbap {P}, {V}", ["boeuf5", "poulet", "tofu_ferme", "oeuf"], ["riz_blanc", "riz_complet"], [V("épinards, carottes & soja", ["epinards", 60], ["carotte", 50], ["pousses_soja", 50]), V("courgette & champignons", ["courgette", 70], ["champignons", 60]), SOJ], [["kimchi", 40], ["oeuf", 50], ["sauce_soja", 10]], ["huile_sesame"], 25),
    S("{P} bulgogi, {C} et {V}", ["boeuf5", "bavette", "porc", "poulet", "tofu_ferme"], ["riz_blanc", "nouilles_ble", "riz_complet"], [SOJ, PAK, CAR, CHR], [["sauce_soja", 20], ["oignon", 30], ["poire", 30]], ["huile_sesame"], 25),
    S("{P} sauce gochujang, {C} et {V}", ["poulet", "porc", "tofu_ferme", "crevettes", "dinde"], ["riz_blanc", "nouilles_udon", "riz_complet"], [BRO, PAK, CHR, COU], [["harissa", 8], ["miel", 8], ["sauce_soja", 10]], ["huile_sesame"], 25),
  ],
  mx: [
    S("Tacos de {P}, {V}", ["boeuf5", "poulet", "porc_effiloche", "crevettes", "haricots_noirs"], ["tortilla_mais", "tortilla_ble"], [MAI, CHR, SAL, TOM], [["salsa", 40], ["oignon_rouge", 20]], ["guacamole"], 20),
    S("Burrito bowl {P}, {C} et {V}", ["poulet", "boeuf5", "haricots_rouges", "haricots_noirs", "dinde"], ["riz_blanc", "riz_complet", "quinoa"], [MAI, TOM, SAL, POI], [["salsa", 40], ["haricots_rouges", 40]], ["avocat"], 20),
    S("Chili con carne de {P}, {C}", ["boeuf5", "dinde", "haricots_rouges", "lentilles_corail"], ["riz_blanc", "riz_complet", "tortilla_ble", "patate_douce"], [POI, MAI, TOM], [["tomates_concassees", 100], ["haricots_rouges", 60], ["oignon", 40]], ["huile_colza"], 35),
    S("Fajitas de {P}, {V}", [...VOL, "bavette", "crevettes", "tofu_ferme"], ["tortilla_ble", "tortilla_mais", "riz_blanc"], [POI, V("poivrons & oignons", ["poivron", 100], ["oignon", 40]), MAI], [["salsa", 30], ["yaourt_grec", 30]], ["huile_colza"], 20),
    S("Quesadillas {P}, {V}", ["poulet", "boeuf5", "haricots_noirs", "dinde", "oeuf"], ["tortilla_ble"], [MAI, POI, EPI, TOM], [["cheddar", 25], ["salsa", 30]], ["huile_colza"], 15),
  ],
  us: [
    S("Burger maison {P}, {C} et {V}", ["steak", "boeuf5", "poulet", "steak_soja", "dinde"], ["pain_cereales", "pain_complet", "frites_four", "patate_douce"], [SAL, TOM, CHR, CON], [["cheddar", 20], ["oignon_rouge", 20], ["ketchup", 15]], ["huile_colza"], 25),
    S("{P} sauce barbecue, {C} et {V}", ["cuisse_poulet", "poulet", "porc_effiloche", "porc", "tofu_ferme"], ["patate_douce", "pdt", "mais", "frites_four"], [CHR, SAL, HV, BRO], [["sauce_bbq", 30]], ["huile_colza"], 30),
    S("Bowl Cajun {P}, {C} et {V}", ["poulet", "crevettes", "dinde", "haricots_rouges", "tofu_ferme"], ["riz_blanc", "riz_complet", "quinoa", "patate_douce"], [MAI, POI, HV, KAL], [["oignon", 20], ["ail", 5]], ["huile_colza"], 20),
    S("Salade Caesar {P}, {C}", ["poulet", "crevettes", "oeuf", "saumon", "dinde"], ["pain_complet", "pates", "quinoa"], [V("romaine & tomates", ["salade", 100], ["tomates_cerises", 60]), KAL], [["parmesan", 12], ["mayonnaise", 10]], ["huile_olive"], 15),
  ],
  no: [
    S("{P} à l'aneth, {C} et {V}", [...POISG, ...POISB, "crevettes", "oeuf"], ["pdt", "riz_complet", "orge", "pain_seigle"], [CON, ASP, HV, BET], [["yaourt_grec", 40], ["citron", 15]], ["beurre"], 25),
    S("Bowl nordique {P}, {C} et {V}", ["saumon_fume", "saumon", "maquereau", "oeuf", "truite"], ["orge", "pdt", "quinoa", "pain_seigle"], [BET, CON, EPI, KAL], [["fromage_blanc", 40], ["radis", 30]], ["huile_colza"], 15),
    S("Boulettes de {P}, {C} et {V}", ["boeuf5", "dinde", "porc", "lentilles_corail"], ["puree", "pdt", "pates", "riz_blanc"], [HV, CAR, PET, BRX], [["creme_legere", 25], ["oignon", 20]], ["beurre"], 30),
  ],
  af: [
    S("Mafé de {P}, {C} et {V}", [...VOL, "boeuf5", "agneau", "pois_chiches", "tofu_ferme"], ["riz_blanc", "manioc", "patate_douce", "riz_complet"], [CAR, POT, CHR, HV], [["sauce_cacahuete", 30], ["tomates_concassees", 60], ["oignon", 40]], ["huile_colza"], 40),
    S("Yassa de {P}, {C}", ["cuisse_poulet", "poulet", "dorade", "colin", "tofu_ferme"], ["riz_blanc", "riz_complet", "banane_plantain"], [V("oignons confits & carottes", ["oignon", 100], ["carotte", 60]), POI, HV], [["citron", 25], ["moutarde", 8]], ["huile_colza"], 40),
    S("Colombo de {P}, {C} et {V}", [...VOL, "porc", "cabillaud", "crevettes", "pois_chiches"], ["riz_blanc", "patate_douce", "banane_plantain", "riz_basmati"], [AUB, COU, POT, HV], [["pate_curry", 12], ["oignon", 30], ["tomates_concassees", 60]], ["lait_coco_light"], 35),
    S("Rougail de {P}, {C} et {V}", ["saucisse_volaille", "poulet", "dinde", "haricots_rouges", "tofu_ferme"], ["riz_blanc", "riz_complet", "lentilles"], [TOM, POI, HV], [["tomates_concassees", 100], ["oignon", 40], ["ail", 5]], ["huile_colza"], 35),
  ],
  sp: [
    S("Bowl protéiné {P}, {C} et {V}", [...VOL, "boeuf5", "saumon", "thon", "oeuf", "tofu_ferme", "tempeh"], ["riz_complet", "quinoa", "patate_douce", "boulgour", "riz_basmati", "pates_comp"], [BRO, EPI, KAL, HV, SAL, CON], [["tomates_cerises", 60]], ["avocat", "huile_olive"], 15),
    S("Meal prep {P}, {C} et {V}", [...VOL, "boeuf5", "dinde", "cabillaud", "tofu_ferme"], ["riz_blanc", "riz_complet", "patate_douce", "pates_comp", "quinoa"], [BRO, HV, COU, PDP, CAR], [], ["huile_olive"], 25),
    S("Wrap {P}, {V}", ["poulet", "dinde", "thon", "saumon_fume", "falafels", "oeuf"], ["tortilla_ble", "pain_pita"], [SAL, CON, CHR, ROQ, MAI], [["fromage_blanc", 30]], ["avocat"], 10),
    S("Omelette {P}, {C} et {V}", ["oeuf", "omelette"], ["pain_complet", "pdt", "patate_douce", "riz_complet"], [EPI, CHA, POI, TOM, COU], [["emmental", 15]], ["huile_olive"], 15),
  ],
  autre: [],
};

/* ---------- petits-déjeuners, collations, autour de la séance ---------- */
const FR = { banane: "banane", pomme: "pomme", fruits_rouges: "fruits rouges", kiwi: "kiwi", poire: "poire", mangue: "mangue", myrtilles: "myrtilles", fraises: "fraises", ananas: "ananas", peche: "pêche" };
const BREAKFAST = [
  // [titre, cuisine, repas, fixes, P, C, F, minutes]
  ...["banane", "pomme", "fruits_rouges", "kiwi", "poire", "mangue", "myrtilles"].flatMap((fr) =>
    [
      ["avoine", "Porridge"],
      ["muesli", "Muesli"],
      ["granola", "Bol granola"],
      ["flocons_sarrasin", "Porridge sarrasin"],
    ].flatMap(([c, nm]) =>
      [
        ["skyr", "skyr"],
        ["fromage_blanc", "fromage blanc"],
        ["yaourt_grec", "yaourt grec"],
        ["whey_food", "whey"],
      ].flatMap(([p, pn]) =>
        [
          ["amandes", "amandes"],
          ["noix", "noix"],
          ["beurre_cacahuete", "beurre de cacahuète"],
          ["graines_chia", "chia"],
        ].map(([f, fn]) => [`${nm} ${pn}, ${FR[fr] || fr} & ${fn}`, "sp", ["petitdej"], [[fr, 120], ["lait", 150]], [p], [c], [f], 5])
      )
    )
  ),
  ...[
    ["oeuf", "Œufs brouillés"],
    ["omelette", "Omelette"],
    ["oeuf_dur", "Œufs durs"],
  ].flatMap(([p, nm]) =>
    [
      ["pain_complet", "pain complet"],
      ["pain_seigle", "pain de seigle"],
      ["baguette", "baguette"],
      ["muffin_anglais", "muffin anglais"],
      ["bagel", "bagel"],
    ].flatMap(([c, cn]) =>
      [
        [["orange", 150]],
        [["kiwi", 150]],
        [["tomate", 100], ["epinards", 50]],
        [["avocat", 50], ["tomates_cerises", 60]],
      ].map((fx, i) => [`${nm} sur ${cn}${[", orange", ", kiwi", ", tomate & épinards", ", avocat & tomates cerises"][i]}`, "fr", ["petitdej"], fx, [p], [c], ["beurre"], 10])
    )
  ),
  ...[
    ["pancake", "Pancakes"],
    ["crepe", "Crêpes"],
  ].flatMap(([c, nm]) =>
    [
      ["fruits_rouges", "fruits rouges"],
      ["banane", "banane"],
      ["pomme", "pomme-cannelle"],
      ["fraises", "fraises"],
    ].flatMap(([fr, fn]) =>
      [
        ["skyr", "skyr"],
        ["fromage_blanc", "fromage blanc"],
        ["whey_food", "whey"],
      ].map(([p, pn]) => [`${nm} ${fn} & ${pn}`, "us", ["petitdej", "collation"], [[fr, 100], ["sirop_erable", 10]], [p], [c], ["beurre"], 15])
    )
  ),
  ...["banane", "fruits_rouges", "mangue", "fraises", "ananas", "myrtilles", "peche"].flatMap((fr) =>
    [
      ["whey_food", "whey"],
      ["skyr", "skyr"],
      ["yaourt", "yaourt"],
      ["boisson_soja", "lait de soja"],
    ].map(([p, pn]) => [`Smoothie ${FR[fr] || fr} & ${pn}`, "sp", ["petitdej", "collation", "seance"], [[fr, 150], ["lait", 150]], [p], ["avoine"], ["beurre_cacahuete"], 5])
  ),
  ...[
    ["banane", "Banane"],
    ["pomme", "Pomme"],
    ["dattes", "Dattes"],
    ["compote", "Compote"],
    ["abricots_secs", "Abricots secs"],
  ].flatMap(([fr, nm]) =>
    [
      ["skyr", "skyr"],
      ["fromage_blanc", "fromage blanc"],
      ["yaourt_grec", "yaourt grec"],
      ["blanc_poulet_tranche", "blanc de poulet"],
      ["whey_food", "shaker de whey"],
    ].flatMap(([p, pn]) =>
      [
        ["galette_riz", "galettes de riz"],
        ["pain_complet", "pain complet"],
        ["barre_cereales", "barre de céréales"],
        ["biscottes", "biscottes"],
      ].map(([c, cn]) => [`${nm}, ${pn} & ${cn}`, "sp", ["collation", "seance"], [[fr, 100]], [p], [c], ["amandes"], 5])
    )
  ),
];

/* ---------- construction ---------- */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function build() {
  const out = [];
  const seen = new Set();
  const names = new Set();
  const push = (r) => {
    const k = r.name.toLowerCase();
    if (seen.has(r.id) || names.has(k)) return; // un seul exemplaire par titre
    seen.add(r.id);
    names.add(k);
    out.push(r);
  };
  Object.entries(CUIS).forEach(([cuisine, styles]) =>
    styles.forEach((st, si) =>
      st.P.forEach((p) =>
        st.C.forEach((c) =>
          st.V.forEach((v) => {
            let name = st.n.replace("{P}", st.n.startsWith("{P}") ? lab(p) : lab(p).toLowerCase()).replace("{C}", lab(c));
            name = cap(st.n.includes("{V}") ? name.replace("{V}", v.label) : `${name} & ${v.label}`);
            // légumes de la variante déjà dans le titre ? sinon on les ajoute quand même (fixes)
            const fixed = [...v.fixed, ...st.fx.filter(([id]) => !v.fixed.some(([x]) => x === id) && id !== p && id !== c)];
            push({
              id: `g_${cuisine}_${si}_${slug(p)}_${slug(c)}_${slug(v.label)}`,
              name,
              cuisine,
              meals: st.m,
              fixed,
              P: [p, ALT[p] || ALT_DEFAULT],
              C: [c],
              F: st.F,
              time: st.t,
              gen: true,
            });
          })
        )
      )
    )
  );
  BREAKFAST.forEach(([name, cuisine, meals, fixed, P, C, F, t]) =>
    push({ id: `g_${slug(name)}`, name, cuisine, meals, fixed, P: [...P, ALT[P[0]] || "skyr"].filter((x, i, a) => a.indexOf(x) === i), C, F, time: t, gen: true })
  );
  return out;
}

export const GEN_RECIPES = build();
