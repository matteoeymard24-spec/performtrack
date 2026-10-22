/* =====================================================================
   regionProfile.js — profil de mobilité / force par RÉGION du corps.

   Principe (choix de conception, pas une validation de la littérature) :
   - le FMS donne un SIGNAL de qualité de mouvement (≤1 ou asymétrie G/D) ;
   - un test spécifique de la région CONFIRME ou non (amplitude, force/contrôle,
     asymétrie G/D) ;
   - la région est « déficitaire » surtout quand la mesure spécifique le dit ;
     un FMS limité seul → « à vérifier » (on propose le test à faire) ;
   - plus il y a de tests faits dans la région, plus la précision monte.
   Le FMS ne prédit pas à lui seul la blessure (sensibilité ~42 %, spécificité
   ~47 % pour le seuil ≤14) : il oriente, il ne conclut pas.
   ===================================================================== */
import { getTest, evaluateMeasures, STATUS } from "./testsCalc";

/* Mouvements FMS qui sollicitent chaque région (descriptions standard du FMS). */
export const REGIONS = [
  {
    id: "hanche",
    label: "Hanche",
    icon: "🦵",
    zones: ["Hanche", "Chaîne postérieure"],
    fms: [
      { key: "deep_squat", why: "flexion de hanche" },
      { key: "hurdle", why: "mobilité de hanche + stabilité sur un pied" },
      { key: "lunge", why: "mobilité de hanche + stabilité" },
      { key: "aslr", why: "souplesse des ischios / contrôle du bassin" },
    ],
    specific: ["hip_rot", "thomas", "slr", "cop_plank"],
  },
  {
    id: "genou",
    label: "Genou",
    icon: "🦿",
    zones: ["Genou / Quadriceps", "Genou / Ischios"],
    fms: [
      { key: "deep_squat", why: "flexion de genou en charge" },
      { key: "hurdle", why: "stabilité du genou sur un pied" },
      { key: "lunge", why: "stabilité du genou (fente)" },
    ],
    specific: ["thomas", "bridge_sl", "sl_chair"],
  },
  {
    id: "cheville",
    label: "Cheville",
    icon: "🦶",
    zones: ["Cheville"],
    fms: [
      { key: "deep_squat", why: "dorsiflexion en squat" },
      { key: "lunge", why: "dorsiflexion + stabilité" },
    ],
    specific: ["ktw", "calf_raise", "reach_ant"],
  },
  {
    id: "thoracique",
    label: "Thoracique",
    icon: "🫁",
    zones: ["Colonne thoracique"],
    fms: [
      { key: "deep_squat", why: "extension thoracique bras en l'air" },
      { key: "shoulder", why: "mobilité thoracique / scapulaire" },
    ],
    specific: ["thoracic"],
  },
  {
    id: "cervicales",
    label: "Cervicales",
    icon: "🧣",
    zones: ["Cervicales"],
    fms: [], // le FMS ne mesure pas le cou
    specific: ["cervical", "neck_dnf"],
  },
  {
    id: "epaule",
    label: "Épaule",
    icon: "💪",
    zones: ["Épaule"],
    fms: [{ key: "shoulder", why: "mobilité de l'épaule (main dans le dos)" }],
    specific: ["shoulder_mob"],
  },
  {
    id: "tronc",
    label: "Tronc / gainage",
    icon: "🧱",
    zones: ["Gainage", "Mobilité globale"],
    fms: [
      { key: "pushup", why: "stabilité du tronc" },
      { key: "rotary", why: "stabilité rotatoire / coordination" },
    ],
    specific: [],
  },
];

const FMS_LABELS = {
  deep_squat: "Deep squat",
  hurdle: "Hurdle step",
  lunge: "In-line lunge",
  shoulder: "Shoulder mobility",
  aslr: "Active SLR",
  pushup: "Trunk push-up",
  rotary: "Rotary stability",
};

/* ---------------------------------------------------------------------
   CLASSEMENT DES TESTS PAR RÉGION (du plus au moins pertinent pour juger la région).
   Critères : ce que le test mesure vraiment dans la région (mobilité > contrôle), fiabilité de la mesure
   (reproductible d'un jour / d'un testeur à l'autre) et simplicité sur le terrain.
   C'est MA synthèse des études de fiabilité et de validité citées ci-dessous (résumés lus, pas de classement
   officiel publié) ; les coefficients de fiabilité (ICC) n'ont pas été relevés ici.
   --------------------------------------------------------------------- */
export const TEST_RANKING = {
  hanche: {
    ranked: [
      { id: "hip_rot", why: "Rotations de hanche : mesure directe de l'amplitude, fiable à l'inclinomètre, plus fiable dans une position standardisée (assis ou allongé, mêmes repères à chaque fois)." },
      { id: "thomas", why: "Test de Thomas modifié : le test de longueur des fléchisseurs de hanche le plus étudié ; fiabilité correcte, surtout à l'inclinomètre ou avec la méthode trigonométrique." },
      { id: "slr", why: "Lever de jambe tendue : bon pour la flexion de hanche et les ischios, mais mélange hanche, ischios et bascule du bassin." },
      { id: "cop_plank", why: "Gainage / contrôle du bassin : ce n'est pas une mobilité, il confirme le contrôle moteur, pas l'amplitude." },
    ],
    notInApp: "Pas de test de rotation de hanche en flexion plus complet (FABER) dans l'app : à ajouter seulement si le staff a l'habitude de le chiffrer.",
    sources: "Fiabilité rotation de hanche : J Sport Rehabil 2018 (PMID 29364046) ; inclinomètre : Knee Surg Sports Traumatol Arthrosc 2014 (PMID 24912575) ; Thomas : revue systématique PM&R 2025 (PMID 41420517).",
  },
  genou: {
    ranked: [
      { id: "thomas", why: "Angle du genou au test de Thomas : longueur du quadriceps / droit fémoral." },
      { id: "bridge_sl", why: "Pont unilatéral : force / contrôle de la chaîne postérieure autour du genou." },
      { id: "sl_chair", why: "Se lever d'une chaise sur une jambe : force fonctionnelle du quadriceps." },
    ],
    notInApp: "Aucun test de mobilité de genou dédié : le genou se juge surtout par la longueur du quadriceps et la force.",
    sources: "Jugement de conception : pas de revue de référence retenue pour le genou.",
  },
  cheville: {
    ranked: [
      { id: "ktw", why: "Knee-to-wall (fente en charge) : la mesure la plus étudiée de la dorsiflexion, reproductible ; à noter en angle (inclinomètre) pour comparer des joueurs différents, la distance dépendant du pied." },
      { id: "reach_ant", why: "Atteinte antérieure sur une jambe : test fonctionnel, mélange mobilité de cheville et équilibre." },
      { id: "calf_raise", why: "Montées de mollets : force-endurance du triceps sural, pas une mobilité." },
    ],
    notInApp: "",
    sources: "Revue systématique de fiabilité du weight-bearing lunge test : Man Ther 2015 (PMID 25704110) ; validité de l'inclinomètre : J Sci Med Sport 2017 (PMID 28108266).",
  },
  thoracique: {
    ranked: [{ id: "thoracic", why: "Rotation thoracique assise bassin bloqué : la rotation du tronc vient surtout du thoracique ; le blocage du bassin et du lombaire est ce qui rend la mesure valide." }],
    notInApp: "Variante possible : rotation en quadrupédie (lombaire verrouillé), estimée à l'œil par un évaluateur formé.",
    sources: "Fiabilité de 5 techniques : J Athl Train 2012 (PMID 22488230) ; inclinomètre numérique / iPhone : J Athl Train 2017 (PMID 28787176).",
  },
  cervicales: {
    ranked: [
      { id: "cervical", why: "Rotation cervicale mesurée (CROM ou inclinomètre) : plus fiable que l'estimation visuelle." },
      { id: "neck_dnf", why: "Endurance des fléchisseurs profonds : contrôle, pas amplitude." },
    ],
    notInApp: "",
    sources: "Comparaison CROM, goniomètre et estimation visuelle : Phys Ther 1991 (PMID 1989013).",
  },
  epaule: {
    ranked: [{ id: "shoulder_mob", why: "Rotations externe / interne mesurées à l'inclinomètre dans un protocole standardisé : fiabilité bonne, à condition de stabiliser la scapula." }],
    notInApp: "",
    sources: "Fiabilité de plusieurs protocoles : J Shoulder Elbow Surg 2014 (PMID 24726484).",
  },
  tronc: { ranked: [], notInApp: "Le tronc se juge au FMS (push-up de stabilité, stabilité rotatoire) et aux tests de gainage.", sources: "" },
};
export const rankOf = (regionId, testId) => {
  const r = TEST_RANKING[regionId]?.ranked || [];
  const i = r.findIndex((x) => x.id === testId);
  return i < 0 ? 99 : i;
};

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

const rank = (st) => (st ? STATUS[st].rank : -1);
const worst = (arr) => arr.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0] || null;

/* Signal FMS d'un mouvement : { key, label, l, r, score, level: ok|minor|flag|pain } ou null si non testé */
function fmsSignal(values, key) {
  if (!values) return null;
  const sidedKeys = ["L", "R"].map((s) => num(values[`${key}_${s}`]));
  const single = num(values[key]);
  let l = null;
  let r = null;
  let scores;
  if (sidedKeys[0] != null || sidedKeys[1] != null) {
    [l, r] = sidedKeys;
    scores = sidedKeys.filter((x) => x != null);
  } else if (single != null) {
    scores = [single];
  } else return null;
  const min = Math.min(...scores);
  const asym = l != null && r != null && l !== r;
  let level = "ok";
  if (min === 0) level = "pain";
  else if (min <= 1 || asym) level = "flag";
  else if (min === 2) level = "minor";
  return { key, label: FMS_LABELS[key] || key, l, r, score: min, asym, level };
}

export const REGION_STATE = {
  ok: { label: "OK", color: "#4fae7d", order: 5 },
  ok_fms: { label: "OK (provisoire)", color: "#7fbf9a", order: 4 },
  measured: { label: "Mesuré (sans norme)", color: "#7fbf9a", order: 3 },
  tocheck: { label: "À vérifier", color: "#4a90d9", order: 2 },
  watch: { label: "À surveiller", color: "#e0a13d", order: 1 },
  deficit: { label: "À travailler", color: "#d9534f", order: 0 },
  pain: { label: "Douleur au FMS", color: "#d9534f", order: -1 },
  nodata: { label: "Pas de donnée", color: "#a8a199", order: 6 },
};

/* latestByTest : { [testId]: { values, date } } (dernier résultat de chaque test) */
export function computeRegionProfiles(latestByTest) {
  const fmsValues = latestByTest.fms?.values || null;

  const profiles = REGIONS.map((reg) => {
    const signals = reg.fms
      .map((f) => {
        const sg = fmsSignal(fmsValues, f.key);
        return sg ? { ...sg, why: f.why } : null;
      })
      .filter(Boolean);
    const fmsFlag = signals.some((s) => s.level === "flag" || s.level === "pain");
    const fmsPain = signals.some((s) => s.level === "pain");

    const specific = [];
    const missing = [];
    reg.specific.forEach((tid) => {
      const def = getTest(tid);
      const res = latestByTest[tid];
      if (!def) return;
      if (!res || !res.values) {
        missing.push({ id: tid, name: def.name, group: def.group, noGear: !!def.noGear });
        return;
      }
      const ev = evaluateMeasures(def, res.values);
      if (ev.items.length === 0 && ev.asym.length === 0) {
        missing.push({ id: tid, name: def.name, group: def.group, noGear: !!def.noGear });
        return;
      }
      // on ne garde que ce qui concerne la région (un test peut couvrir plusieurs zones)
      const items = ev.items.filter((i) => reg.zones.includes(i.zone));
      const asym = ev.asym.filter((a) => reg.zones.includes(a.zone));
      if (items.length === 0 && asym.length === 0) return;
      const status = worst([...items.map((i) => i.status), ...asym.map((a) => a.status)]);
      specific.push({ id: tid, name: def.name, group: def.group, date: res.date, items, asym, status });
    });

    missing.sort((a, b) => rankOf(reg.id, a.id) - rankOf(reg.id, b.id));
    specific.sort((a, b) => rankOf(reg.id, a.id) - rankOf(reg.id, b.id));
    const specStatus = worst(specific.map((s) => s.status));
    const hasSpec = specific.length > 0;
    const judged = specStatus != null; // au moins une mesure avec seuil ou asymétrie calculable
    let state;
    if (fmsPain) state = "pain";
    else if (specStatus === "deficit") state = "deficit";
    else if (specStatus === "watch") state = "watch";
    else if (judged && fmsFlag) state = "watch";
    else if (hasSpec && !judged) state = fmsFlag ? "tocheck" : "measured";
    else if (!hasSpec && fmsFlag) state = "tocheck";
    else if (judged) state = "ok";
    else if (signals.length > 0) state = "ok_fms";
    else state = "nodata";

    // lecture : mobilité, force/contrôle ou asymétrie ?
    const tags = new Set();
    specific.forEach((sp) => {
      const bad = sp.items.some((i) => i.status && i.status !== "ok");
      if (bad) tags.add(sp.group === "mobilite" ? "Mobilité" : "Force / contrôle");
      if (sp.asym.some((a) => a.status !== "ok")) tags.add("Asymétrie G/D");
    });
    if (judged && fmsFlag && specStatus === "ok") tags.add("Contrôle moteur");
    if (signals.some((s) => s.asym)) tags.add("Asymétrie G/D");

    const possible = reg.fms.length + reg.specific.length;
    const done = signals.length + specific.length;
    const pct = possible ? Math.round((done / possible) * 100) : 0;
    const confidence = pct >= 67 ? "Bonne" : pct >= 34 ? "Moyenne" : "Faible";

    let note = "";
    if (judged && fmsFlag && specStatus === "ok")
      note = "FMS limité alors que la mesure est bonne : plutôt un problème de contrôle / coordination que d'amplitude.";
    else if (!hasSpec && fmsFlag && reg.specific.length > 0)
      note = "Le FMS signale quelque chose : fais un test spécifique pour confirmer.";
    else if (reg.fms.length === 0)
      note = "Le FMS ne mesure pas cette zone : seuls les tests spécifiques comptent.";

    return { ...reg, signals, specific, missing, state, tags: [...tags], pct, confidence, note, fmsFlag };
  });
  return withPriority(profiles);
}

/* Poids de chaque état dans la répartition de l'attention (choix de conception, pas une norme publiée) :
   plus la région est en difficulté, plus elle prend de place ; sans donnée = poids moyen (on ne sait pas). */
export const PRIORITY_WEIGHT = { pain: 4, deficit: 3, watch: 2, tocheck: 1.5, nodata: 1, measured: 1, ok_fms: 0.6, ok: 0.4 };

/* Répartit 100 % entre les régions testées selon leur état ; arrondi à l'entier en gardant un total de 100. */
function withPriority(profiles) {
  // les régions sans aucun test (nodata) sont masquées : elles ne prennent pas de part
  const w = profiles.map((p) => (p.state === "nodata" ? 0 : PRIORITY_WEIGHT[p.state] ?? 1));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return profiles.map((p) => ({ ...p, priority: 0 }));
  const raw = w.map((x) => (x / sum) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach((x) => {
      if (left > 0) {
        floor[x.i] += 1;
        left -= 1;
      }
    });
  return profiles.map((p, i) => ({ ...p, priority: floor[i] }));
}

/* Dernier résultat de chaque test à partir de la liste Firestore (triée ou non) */
export function latestByTestId(tests) {
  const out = {};
  [...(tests || [])]
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""))
    .forEach((t) => {
      if (t.testId && !out[t.testId]) out[t.testId] = { values: t.values, date: t.date };
    });
  return out;
}
