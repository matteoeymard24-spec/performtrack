/* =====================================================================
   testsCalc.js — catalogue des tests physiques + formules de calcul
   Utilisé par page/Tests.jsx (saisie coach) et component/TestsSummary.jsx
   (affichage athlète / détail athlète du Dashboard).

   Les seuils de mobilité / force isométrique sont des REPÈRES INDICATIFS
   (littérature + pratique terrain) : à adapter par le coach selon le sport,
   l'âge et le matériel. Ils sont regroupés dans le catalogue ci-dessous.
   ===================================================================== */

export const TEST_GROUPS = [
  { id: "endurance", label: "🏃 Endurance" },
  { id: "mobilite", label: "🤸 Mobilité" },
  { id: "force_iso", label: "💥 Force iso" },
  { id: "saut", label: "🦘 Saut (CMJ)" },
  { id: "vitesse", label: "⚡ Vitesse" },
];

const yt = (id) => ({
  video: `https://www.youtube.com/watch?v=${id}`,
  thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});
const ytSearch = (q) => ({
  video: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  thumb: null,
  isSearch: true,
});

export const num = (v) => {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/* mm:ss ou secondes → secondes */
export const parseTime = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim().replace(",", ".");
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    const mm = parseFloat(m);
    const ss = parseFloat(sec);
    if (isNaN(mm) || isNaN(ss)) return null;
    return mm * 60 + ss;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
export const fmtTime = (sec) => {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round((sec - m * 60) * 10) / 10;
  return `${m}:${String(s.toFixed(s % 1 ? 1 : 0)).padStart(s % 1 ? 4 : 2, "0")}`;
};

const vo2FromVma = (v) => r1(5.857 * v - 19.458);

/* Régression linéaire distance = CS * temps + D' (vitesse critique) */
export function criticalSpeed(trials) {
  const pts = trials.filter((p) => p.d > 0 && p.t > 0);
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.t, 0);
  const sy = pts.reduce((a, p) => a + p.d, 0);
  const sxx = pts.reduce((a, p) => a + p.t * p.t, 0);
  const sxy = pts.reduce((a, p) => a + p.t * p.d, 0);
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const cs = (n * sxy - sx * sy) / den;
  const dPrime = (sy - cs * sx) / n;
  let r2v = null;
  if (n >= 3) {
    const my = sy / n;
    const ssTot = pts.reduce((a, p) => a + (p.d - my) ** 2, 0);
    const ssRes = pts.reduce((a, p) => a + (p.d - (cs * p.t + dPrime)) ** 2, 0);
    r2v = ssTot > 0 ? 1 - ssRes / ssTot : null;
  }
  return { cs, dPrime, r2: r2v };
}

/* ---------------------------------------------------------------------
   Statut d'une mesure de mobilité / force
   dir "high" : plus grand = mieux ; "low" : plus petit = mieux
   --------------------------------------------------------------------- */
export const STATUS = {
  ok: { label: "OK", color: "#4fae7d", rank: 0 },
  watch: { label: "À surveiller", color: "#e0a13d", rank: 1 },
  deficit: { label: "Déficitaire", color: "#d9534f", rank: 2 },
};

export function measureStatus(m, v) {
  if (v == null || m.ok == null) return null;
  if (m.dir === "low") {
    if (v <= m.ok) return "ok";
    if (v <= m.watch) return "watch";
    return "deficit";
  }
  if (v >= m.ok) return "ok";
  if (v >= m.watch) return "watch";
  return "deficit";
}

export function asymmetryStatus(l, r, watchPct = 10, deficitPct = 20) {
  if (l == null || r == null) return null;
  const mx = Math.max(Math.abs(l), Math.abs(r));
  if (mx === 0) return { pct: 0, status: "ok" };
  const pct = (Math.abs(l - r) / mx) * 100;
  return {
    pct: r1(pct),
    status: pct >= deficitPct ? "deficit" : pct >= watchPct ? "watch" : "ok",
  };
}

const worst = (arr) =>
  arr.filter(Boolean).sort((a, b) => STATUS[b].rank - STATUS[a].rank)[0] || null;

/* Évalue un test à mesures (mobilité, force iso). Retourne
   { items:[{key,label,zone,side,value,unit,status}], asym:[...], ratios:[...], status, zones:{zone:status} } */
export function evaluateMeasures(test, values) {
  const items = [];
  const asym = [];
  const ratios = [];
  const get = (k, side) => num(values[side ? `${k}_${side}` : k]);

  (test.measures || []).forEach((m) => {
    if (m.sided) {
      const l = get(m.key, "L");
      const r = get(m.key, "R");
      if (l != null) items.push({ ...m, side: "G", value: l, status: measureStatus(m, l) });
      if (r != null) items.push({ ...m, side: "D", value: r, status: measureStatus(m, r) });
      let a = null;
      if (l != null && r != null) {
        a = test.scoreOnly
          ? { pct: Math.abs(l - r), status: l === r ? "ok" : "watch" }
          : asymmetryStatus(l, r, test.asymWatch ?? 10, test.asymDeficit ?? 20);
      }
      if (a) asym.push({ key: m.key, label: m.label, zone: m.zone, ...a, l, r, scoreOnly: !!test.scoreOnly });
    } else {
      const v = get(m.key);
      if (v != null) items.push({ ...m, side: null, value: v, status: measureStatus(m, v) });
    }
  });

  (test.ratios || []).forEach((rt) => {
    ["L", "R"].forEach((side) => {
      const a = get(rt.num, side);
      const b = get(rt.den, side);
      if (a != null && b != null && b > 0) {
        const value = r2(a / b);
        const status =
          value >= rt.ok ? "ok" : value >= rt.watch ? "watch" : "deficit";
        ratios.push({ ...rt, side: side === "L" ? "G" : "D", value, status });
      }
    });
  });

  const zones = {};
  const bump = (zone, st) => {
    if (!zone || !st) return;
    zones[zone] = worst([zones[zone], st]);
  };
  items.forEach((i) => bump(i.zone, i.status));
  asym.forEach((a) => bump(a.zone, a.status));
  ratios.forEach((r) => bump(r.zone, r.status));

  const status = worst([
    ...items.map((i) => i.status),
    ...asym.map((a) => a.status),
    ...ratios.map((r) => r.status),
  ]);
  return { items, asym, ratios, status, zones };
}

/* ---------------------------------------------------------------------
   CATALOGUE
   fields : [{key,label,unit,placeholder,time?}]
   compute(values) → { main:{label,value,unit}, vma?, vmi?, cs?, vo2max?, lines:[string] } | null
   --------------------------------------------------------------------- */
export const TESTS = [
  /* ======================= ENDURANCE ======================= */
  {
    id: "leger",
    group: "endurance",
    name: "Luc Léger (navette 20 m)",
    sports: "Tous sports de course",
    equipment: "Terrain plat 20 m, plots, bande son du test",
    howTo:
      "Aller-retours de 20 m au rythme des bips. Vitesse de départ 8,5 km/h, +0,5 km/h chaque minute. L'athlète s'arrête quand il ne peut plus suivre (2 bips ratés d'affilée). Noter la vitesse du dernier palier COMPLÉTÉ.",
    ...ytSearch("test Luc Léger navette 20 m protocole"),
    fields: [{ key: "speed", label: "Vitesse du dernier palier", unit: "km/h", placeholder: "ex : 15.5" }],
    compute: (v) => {
      const s = num(v.speed);
      if (!s) return null;
      return {
        main: { label: "VMA", value: r1(s), unit: "km/h" },
        vma: r1(s),
        vo2max: vo2FromVma(s),
        lines: [`VO2max estimée ≈ ${vo2FromVma(s)} ml/kg/min (5,857×VMA − 19,458)`],
      };
    },
  },
  {
    id: "vameval",
    group: "endurance",
    name: "VAMEVAL (piste 400 m)",
    sports: "Sports collectifs, course",
    equipment: "Piste d'athlétisme avec plots tous les 20 m, bande son",
    howTo:
      "Départ à 8 km/h, +0,5 km/h chaque minute, plots tous les 20 m. L'athlète doit être au plot au bip. Arrêt quand il n'arrive plus à tenir le rythme. Noter la vitesse du dernier palier complété.",
    ...ytSearch("test VAMEVAL protocole piste"),
    fields: [{ key: "speed", label: "Vitesse du dernier palier", unit: "km/h", placeholder: "ex : 16" }],
    compute: (v) => {
      const s = num(v.speed);
      if (!s) return null;
      return {
        main: { label: "VMA", value: r1(s), unit: "km/h" },
        vma: r1(s),
        vo2max: vo2FromVma(s),
        lines: [`VO2max estimée ≈ ${vo2FromVma(s)} ml/kg/min`],
      };
    },
  },
  {
    id: "cooper",
    group: "endurance",
    name: "Cooper (12 min)",
    sports: "Tous sports de course",
    equipment: "Piste de 400 m, chronomètre",
    howTo:
      "Courir la plus grande distance possible en 12 minutes à allure régulière. Noter la distance totale en mètres. La VMA estimée = vitesse moyenne (légèrement sous-estimée).",
    ...ytSearch("test de Cooper 12 minutes comment le passer"),
    fields: [{ key: "distance", label: "Distance en 12 min", unit: "m", placeholder: "ex : 2900" }],
    compute: (v) => {
      const d = num(v.distance);
      if (!d) return null;
      const vma = r1(d / 200);
      return {
        main: { label: "VMA estimée", value: vma, unit: "km/h" },
        vma,
        vo2max: r1((d - 504.9) / 44.73),
        lines: [`Vitesse moyenne ${vma} km/h · VO2max ≈ ${r1((d - 504.9) / 44.73)} ml/kg/min`],
      };
    },
  },
  {
    id: "six_min",
    group: "endurance",
    name: "6 minutes (vitesse moyenne)",
    sports: "Tous sports de course",
    equipment: "Piste de 400 m, chronomètre",
    howTo:
      "Courir la plus grande distance en 6 minutes (effort maximal régulier). Noter la distance en mètres. VMA estimée = vitesse moyenne sur 6 min.",
    ...ytSearch("test 6 minutes course VMA piste"),
    fields: [{ key: "distance", label: "Distance en 6 min", unit: "m", placeholder: "ex : 1650" }],
    compute: (v) => {
      const d = num(v.distance);
      if (!d) return null;
      const vma = r1(d / 100);
      return { main: { label: "VMA estimée", value: vma, unit: "km/h" }, vma, vo2max: vo2FromVma(vma), lines: [] };
    },
  },
  {
    id: "ift3015",
    group: "endurance",
    name: "30-15 IFT (VMI)",
    sports: "Sports collectifs, sports à changements de direction",
    equipment: "Terrain 40 m, plots à 0 / 20 / 40 m, bande son 30-15",
    howTo:
      "Séquences de 30 s de course navette (20 m) + 15 s de récupération marchée. Départ 8 km/h, +0,5 km/h par palier. Noter la vitesse du dernier palier complété = VIFT (vitesse de référence intermittente).",
    ...ytSearch("30-15 intermittent fitness test protocole Buchheit"),
    fields: [{ key: "speed", label: "VIFT (dernier palier)", unit: "km/h", placeholder: "ex : 19.5" }],
    compute: (v) => {
      const s = num(v.speed);
      if (!s) return null;
      return {
        main: { label: "VIFT (VMI)", value: r1(s), unit: "km/h" },
        vmi: r1(s),
        lines: ["Sert de vitesse de référence pour les séances intermittentes / répétitions de sprints."],
      };
    },
  },
  {
    id: "vc",
    group: "endurance",
    name: "Vitesse critique (2-4 chronos)",
    sports: "Course, rameur, vélo (adapté par sport)",
    equipment: "Piste / ergomètre, chronomètre. 2 à 4 efforts maximaux de 2 à 15 min sur des jours différents",
    howTo:
      "Réaliser 2 à 4 efforts maximaux de durées différentes (ex : 3, 7 et 12 min) idéalement sur des jours différents. Noter pour chacun la distance parcourue et le temps. L'app calcule la vitesse critique (pente de la droite distance/temps) et D' (réserve anaérobie en mètres).",
    ...ytSearch("critical speed test vitesse critique 3 minutes 12 minutes"),
    fields: [1, 2, 3, 4].flatMap((i) => [
      { key: `d${i}`, label: `Effort ${i} — distance`, unit: "m", placeholder: i <= 2 ? "obligatoire" : "optionnel" },
      { key: `t${i}`, label: `Effort ${i} — temps`, unit: "mm:ss", time: true, placeholder: "ex : 12:00" },
    ]),
    compute: (v) => {
      const trials = [1, 2, 3, 4].map((i) => ({ d: num(v[`d${i}`]), t: parseTime(v[`t${i}`]) }));
      const res = criticalSpeed(trials.map((p) => ({ d: p.d || 0, t: p.t || 0 })));
      if (!res || res.cs <= 0) return null;
      const kmh = r1(res.cs * 3.6);
      return {
        main: { label: "Vitesse critique", value: kmh, unit: "km/h" },
        cs: kmh,
        lines: [
          `CS = ${r2(res.cs)} m/s · D' ≈ ${Math.round(res.dPrime)} m`,
          res.r2 != null ? `Qualité de l'ajustement R² = ${r2(res.r2)}` : "Avec 2 efforts seulement, ajoute un 3e effort pour valider (R²).",
        ],
      };
    },
  },
  {
    id: "yoyo_ir1",
    group: "endurance",
    name: "Yo-Yo Intermittent Recovery 1",
    sports: "Sports collectifs",
    equipment: "Terrain 20 m, plots, bande son Yo-Yo IR1",
    howTo:
      "Navettes 2×20 m à vitesse croissante avec 10 s de récupération active entre chaque. Arrêt quand l'athlète rate 2 fois le bip. Noter la distance totale parcourue (en mètres).",
    ...ytSearch("Yo-Yo intermittent recovery test level 1 protocol"),
    fields: [{ key: "distance", label: "Distance totale", unit: "m", placeholder: "ex : 2040" }],
    compute: (v) => {
      const d = num(v.distance);
      if (!d) return null;
      return {
        main: { label: "Distance Yo-Yo IR1", value: Math.round(d), unit: "m" },
        vo2max: r1(d * 0.0084 + 36.4),
        lines: [`VO2max estimée ≈ ${r1(d * 0.0084 + 36.4)} ml/kg/min (Bangsbo)`],
      };
    },
  },
  {
    id: "yoyo_ir2",
    group: "endurance",
    name: "Yo-Yo Intermittent Recovery 2",
    sports: "Sports collectifs (haut niveau)",
    equipment: "Terrain 20 m, plots, bande son Yo-Yo IR2",
    howTo:
      "Même principe que l'IR1 mais démarrage plus rapide (13 km/h). Noter la distance totale en mètres.",
    ...ytSearch("Yo-Yo intermittent recovery test level 2"),
    fields: [{ key: "distance", label: "Distance totale", unit: "m", placeholder: "ex : 880" }],
    compute: (v) => {
      const d = num(v.distance);
      if (!d) return null;
      return {
        main: { label: "Distance Yo-Yo IR2", value: Math.round(d), unit: "m" },
        vo2max: r1(d * 0.0136 + 45.3),
        lines: [`VO2max estimée ≈ ${r1(d * 0.0136 + 45.3)} ml/kg/min`],
      };
    },
  },
  {
    id: "bronco",
    group: "endurance",
    name: "Bronco (rugby)",
    sports: "Rugby, sports collectifs",
    equipment: "Plots à 20 / 40 / 60 m, chronomètre",
    howTo:
      "5 allers-retours enchaînés 20 m → 40 m → 60 m (1 série = 240 m), soit 1 200 m au total, sans pause. Noter le temps total (mm:ss).",
    ...ytSearch("Bronco test rugby 1200 m protocole"),
    fields: [{ key: "time", label: "Temps total", unit: "mm:ss", time: true, placeholder: "ex : 4:45" }],
    compute: (v) => {
      const t = parseTime(v.time);
      if (!t) return null;
      return {
        main: { label: "Temps Bronco", value: fmtTime(t), unit: "" },
        lines: [`Vitesse moyenne ${r1((1200 / t) * 3.6)} km/h sur 1 200 m`],
      };
    },
  },
  {
    id: "rfu",
    group: "endurance",
    name: "RFU / AST (endurance anaérobie rugby)",
    sports: "Rugby",
    equipment: "Plots 5-10-20 m (avants) ou +30 m (arrières), chronomètre",
    howTo:
      "Test de navettes de 7 minutes en séries (course, récupération). Noter le temps total des navettes et, si possible, le premier et le dernier temps de série pour l'indice de fatigue. Protocole exact à valider avec le staff.",
    ...ytSearch("RFU anaerobic speed test rugby England protocole"),
    fields: [
      { key: "total", label: "Temps total", unit: "s", placeholder: "ex : 183" },
      { key: "first", label: "Temps 1re série", unit: "s", placeholder: "optionnel" },
      { key: "last", label: "Temps dernière série", unit: "s", placeholder: "optionnel" },
    ],
    compute: (v) => {
      const total = num(v.total);
      if (!total) return null;
      const f = num(v.first);
      const l = num(v.last);
      const lines = [];
      if (f && l) lines.push(`Indice de fatigue : ${r1(((l - f) / f) * 100)} %`);
      return { main: { label: "Temps total", value: r1(total), unit: "s" }, lines };
    },
  },
  {
    id: "ftp",
    group: "endurance",
    name: "Vélo — FTP (20 min)",
    sports: "Vélo / Wattbike",
    equipment: "Wattbike ou vélo avec capteur de puissance",
    howTo:
      "Après échauffement, rouler 20 minutes à puissance moyenne maximale régulière. Noter la puissance moyenne. FTP estimée = 95 % de cette puissance.",
    ...ytSearch("test FTP 20 minutes Wattbike protocole"),
    fields: [
      { key: "p20", label: "Puissance moyenne 20 min", unit: "W", placeholder: "ex : 280" },
      { key: "weight", label: "Poids du corps", unit: "kg", placeholder: "optionnel" },
    ],
    compute: (v) => {
      const p = num(v.p20);
      if (!p) return null;
      const ftp = Math.round(p * 0.95);
      const w = num(v.weight);
      return {
        main: { label: "FTP", value: ftp, unit: "W" },
        lines: w ? [`${r2(ftp / w)} W/kg`] : [],
      };
    },
  },
  {
    id: "pma",
    group: "endurance",
    name: "Vélo — PMA (test par paliers)",
    sports: "Vélo / Wattbike",
    equipment: "Wattbike ou ergomètre",
    howTo:
      "Test par paliers progressifs (ex : départ 100 W, +25 W/min, ou +20 W/min) jusqu'à l'épuisement. Noter la puissance du dernier palier complété (PMA).",
    ...ytSearch("test PMA vélo paliers Wattbike protocole"),
    fields: [
      { key: "pma", label: "Puissance dernier palier", unit: "W", placeholder: "ex : 350" },
      { key: "weight", label: "Poids du corps", unit: "kg", placeholder: "optionnel" },
    ],
    compute: (v) => {
      const p = num(v.pma);
      if (!p) return null;
      const w = num(v.weight);
      return { main: { label: "PMA", value: Math.round(p), unit: "W" }, lines: w ? [`${r2(p / w)} W/kg`] : [] };
    },
  },
  {
    id: "rower2000",
    group: "endurance",
    name: "Rameur — 2 000 m",
    sports: "Rameur / aviron / sports de force-endurance",
    equipment: "Rameur Concept2, drag réglé à 120-130",
    howTo:
      "Ramer 2 000 m le plus vite possible. Noter le temps final (mm:ss). L'app calcule l'allure /500 m et la puissance moyenne.",
    ...ytSearch("test rameur 2000 m Concept2 technique"),
    fields: [{ key: "time", label: "Temps sur 2 000 m", unit: "mm:ss", time: true, placeholder: "ex : 7:10" }],
    compute: (v) => {
      const t = parseTime(v.time);
      if (!t) return null;
      const pace = t / 4;
      const watts = Math.round(2.8 / Math.pow(pace / 500, 3));
      return {
        main: { label: "Allure /500 m", value: fmtTime(pace), unit: "" },
        lines: [`Puissance moyenne ≈ ${watts} W`],
      };
    },
  },

  /* ======================= SAUT ======================= */
  {
    id: "cmj",
    group: "saut",
    name: "CMJ (Counter Movement Jump)",
    sports: "Tous sports",
    equipment: "Tapis de saut, Optojump, plateforme de force ou application (My Jump)",
    howTo:
      "Mains sur les hanches, flexion rapide puis saut vertical maximal, réception pieds au même endroit. Faire 3 essais, noter le meilleur (hauteur en cm). Cette valeur met aussi à jour la fiche « CMJ » utilisée dans le Dashboard.",
    ...ytSearch("test CMJ counter movement jump comment le passer"),
    fields: [{ key: "height", label: "Meilleure hauteur", unit: "cm", placeholder: "ex : 42" }],
    compute: (v) => {
      const h = num(v.height);
      if (!h) return null;
      return { main: { label: "CMJ", value: r1(h), unit: "cm" }, cmj: r1(h), lines: [] };
    },
  },

  /* ======================= VITESSE ======================= */
  {
    id: "sprint",
    group: "vitesse",
    name: "Sprint 5-10-15-20 m, Vmax, Prowler",
    sports: "Rugby, sports collectifs",
    equipment: "Cellules photoélectriques (ou radar), plots, GPS pour la Vmax, Prowler 85 kg",
    howTo:
      "Départ debout, pied avant 30-50 cm derrière la 1re cellule, sprint maximal. Noter les temps intermédiaires à 5, 10, 15 et 20 m (secondes, au centième). Vmax : pic de vitesse (km/h) relevé au GPS ou au radar. Prowler : temps sur 10 m avec 85 kg. Tous les champs sont optionnels.",
    ...ytSearch("test sprint 20 m cellules photoélectriques départ debout rugby"),
    fields: [
      { key: "t5", label: "Temps 5 m", unit: "s", placeholder: "ex : 1.02" },
      { key: "t10", label: "Temps 10 m", unit: "s", placeholder: "ex : 1.75" },
      { key: "t15", label: "Temps 15 m", unit: "s", placeholder: "ex : 2.40" },
      { key: "t20", label: "Temps 20 m", unit: "s", placeholder: "ex : 3.05" },
      { key: "vmax", label: "Vitesse max (GPS / radar)", unit: "km/h", placeholder: "ex : 31.5" },
      { key: "prowler", label: "Prowler 85 kg — 10 m", unit: "s", placeholder: "ex : 2.9" },
    ],
    compute: (v) => {
      const t20 = num(v.t20);
      const t10 = num(v.t10);
      const vm = num(v.vmax);
      const main = t20
        ? { label: "20 m", value: r2(t20), unit: "s" }
        : t10
        ? { label: "10 m", value: r2(t10), unit: "s" }
        : vm
        ? { label: "Vmax", value: r1(vm), unit: "km/h" }
        : num(v.t5)
        ? { label: "5 m", value: r2(num(v.t5)), unit: "s" }
        : num(v.prowler)
        ? { label: "Prowler", value: r2(num(v.prowler)), unit: "s" }
        : null;
      if (!main) return null;
      const lines = [];
      if (t10 && t20 && t20 > t10) lines.push(`10→20 m : ${r2(t20 - t10)} s (${r1((10 / (t20 - t10)) * 3.6)} km/h moyens)`);
      return { main, lines };
    },
  },

  /* ======================= MOBILITÉ ======================= */
  {
    id: "ktw",
    group: "mobilite",
    name: "Knee-to-wall (dorsiflexion cheville)",
    zoneLabel: "Cheville",
    equipment: "Mur, mètre ruban",
    howTo:
      "Pied à plat face au mur, genou qui avance vers le mur sans décoller le talon. Mesurer la distance maximale pied-mur (cm) avec le genou touchant le mur. Tester chaque côté.",
    ...ytSearch("knee to wall test dorsiflexion"),
    measures: [{ key: "ktw", label: "Distance pied-mur", unit: "cm", sided: true, dir: "high", ok: 12, watch: 10, zone: "Cheville" }],
  },
  {
    id: "slr",
    group: "mobilite",
    name: "Straight Leg Raise (ischios)",
    equipment: "Table / sol, inclinomètre ou smartphone",
    howTo:
      "Allongé sur le dos, lever une jambe tendue sans fléchir le genou ni décoller le bassin. Mesurer l'angle jambe/sol. Tester chaque côté.",
    ...ytSearch("straight leg raise test hamstring flexibility"),
    measures: [{ key: "slr", label: "Angle SLR", unit: "°", sided: true, dir: "high", ok: 80, watch: 70, zone: "Chaîne postérieure" }],
  },
  {
    id: "hip_rot",
    group: "mobilite",
    name: "Rotations de hanche (RI / RE)",
    equipment: "Table, goniomètre ou inclinomètre",
    howTo:
      "Assis ou allongé sur le ventre, genou à 90°. Rotation interne (RI) puis externe (RE) de hanche en gardant le bassin stable. Mesurer l'angle de la jambe par rapport à la verticale. Tester chaque côté.",
    ...ytSearch("hip internal external rotation range of motion test"),
    measures: [
      { key: "ri", label: "Rotation interne", unit: "°", sided: true, dir: "high", ok: 35, watch: 25, zone: "Hanche" },
      { key: "re", label: "Rotation externe", unit: "°", sided: true, dir: "high", ok: 40, watch: 30, zone: "Hanche" },
    ],
  },
  {
    id: "thomas",
    group: "mobilite",
    name: "Test de Thomas (psoas / quadriceps)",
    equipment: "Table, goniomètre",
    howTo:
      "Assis au bord de la table, ramener un genou à la poitrine en s'allongeant. La cuisse de l'autre jambe doit rester à plat. Mesurer l'écart de la cuisse par rapport à l'horizontale (psoas) et l'angle du genou (quadriceps). Tester chaque côté.",
    ...ytSearch("Thomas test hip flexor length"),
    measures: [
      { key: "psoas", label: "Écart cuisse / horizontale (psoas)", unit: "°", sided: true, dir: "low", ok: 5, watch: 15, zone: "Hanche" },
      { key: "quad", label: "Angle genou (quadriceps)", unit: "°", sided: true, dir: "high", ok: 80, watch: 65, zone: "Genou / Quadriceps" },
    ],
  },
  {
    id: "thoracic",
    group: "mobilite",
    name: "Rotation thoracique",
    equipment: "Chaise, bâton, goniomètre",
    howTo:
      "Assis, bassin stable (genoux serrés), bâton sur les épaules. Rotation maximale du tronc de chaque côté. Mesurer l'angle de rotation.",
    ...ytSearch("thoracic rotation mobility test seated"),
    measures: [{ key: "rot", label: "Rotation thoracique", unit: "°", sided: true, dir: "high", ok: 45, watch: 35, zone: "Colonne thoracique" }],
  },
  {
    id: "shoulder_mob",
    group: "mobilite",
    name: "Épaule (rotations / élévation)",
    equipment: "Goniomètre ou inclinomètre, table",
    howTo:
      "Allongé sur le dos, bras à 90° d'abduction, coude à 90°. Mesurer la rotation externe puis interne passives. Tester chaque côté.",
    ...ytSearch("shoulder internal external rotation range of motion measurement"),
    measures: [
      { key: "er", label: "Rotation externe", unit: "°", sided: true, dir: "high", ok: 90, watch: 75, zone: "Épaule" },
      { key: "ir", label: "Rotation interne", unit: "°", sided: true, dir: "high", ok: 60, watch: 45, zone: "Épaule" },
    ],
  },
  {
    id: "cervical",
    group: "mobilite",
    name: "Cervicales (rotation)",
    equipment: "Goniomètre / application inclinomètre",
    howTo:
      "Assis, dos droit. Rotation maximale de la tête à gauche puis à droite, sans compenser avec les épaules. Mesurer l'angle de rotation.",
    ...ytSearch("cervical rotation range of motion test"),
    measures: [{ key: "rot", label: "Rotation cervicale", unit: "°", sided: true, dir: "high", ok: 70, watch: 60, zone: "Cervicales" }],
  },
  {
    id: "fms",
    group: "mobilite",
    name: "FMS (mouvements au choix)",
    equipment: "Bâton, planche FMS, élastique",
    howTo:
      "Sélectionne les mouvements que tu veux tester. Note chacun de 0 à 3 (3 = parfait, 2 = compensation, 1 = incapable, 0 = douleur). Les mouvements latéralisés se notent à gauche et à droite.",
    ...ytSearch("Functional Movement Screen FMS scoring explained"),
    selectable: true,
    asymWatch: 1,
    asymDeficit: 1,
    scoreOnly: true,
    measures: [
      { key: "deep_squat", label: "Deep squat", unit: "/3", sided: false, dir: "high", ok: 3, watch: 2, zone: "Mobilité globale" },
      { key: "hurdle", label: "Hurdle step", unit: "/3", sided: true, dir: "high", ok: 3, watch: 2, zone: "Hanche" },
      { key: "lunge", label: "In-line lunge", unit: "/3", sided: true, dir: "high", ok: 3, watch: 2, zone: "Hanche" },
      { key: "shoulder", label: "Shoulder mobility", unit: "/3", sided: true, dir: "high", ok: 3, watch: 2, zone: "Épaule" },
      { key: "aslr", label: "Active straight leg raise", unit: "/3", sided: true, dir: "high", ok: 3, watch: 2, zone: "Chaîne postérieure" },
      { key: "pushup", label: "Trunk stability push-up", unit: "/3", sided: false, dir: "high", ok: 3, watch: 2, zone: "Gainage" },
      { key: "rotary", label: "Rotary stability", unit: "/3", sided: true, dir: "high", ok: 3, watch: 2, zone: "Gainage" },
    ],
  },

  /* ======================= FORCE ISO ======================= */
  {
    id: "iso_neck",
    group: "force_iso",
    name: "Cervicales — force isométrique",
    equipment: "Plateforme de force / dynamomètre / ForceFrame",
    howTo:
      "Assis, tête neutre, contre-résistance fixe. Pousser au maximum 3-5 s en flexion, extension, flexion latérale et rotation. 3 essais, noter le meilleur. Valeurs en kg (même unité que le barème du club).",
    ...yt("PWff8OaTpzc"),
    asymWatch: 10,
    asymDeficit: 15,
    measures: [
      { key: "flex", label: "Flexion", unit: "kg", sided: false, zone: "Cervicales" },
      { key: "ext", label: "Extension", unit: "kg", sided: false, zone: "Cervicales" },
      { key: "lat", label: "Flexion latérale", unit: "kg", sided: true, zone: "Cervicales" },
      { key: "rot", label: "Rotation", unit: "kg", sided: true, zone: "Cervicales" },
    ],
  },
  {
    id: "iso_shoulder",
    group: "force_iso",
    name: "Épaule — RE / RI isométrique",
    equipment: "Dynamomètre fixe / ForceFrame / dynamomètre manuel",
    howTo:
      "Allongé ou assis, coude à 90° le long du corps (ou bras à 90° d'abduction). Pousser en rotation externe puis interne au maximum 3-5 s. Noter le meilleur essai à gauche et à droite. Rapport RE/RI visé ≥ 0,66.",
    ...yt("XUrnMQxckC4"),
    asymWatch: 10,
    asymDeficit: 15,
    measures: [
      { key: "er", label: "Rotation externe", unit: "N", sided: true, zone: "Épaule" },
      { key: "ir", label: "Rotation interne", unit: "N", sided: true, zone: "Épaule" },
    ],
    ratios: [{ label: "Ratio RE/RI", num: "er", den: "ir", ok: 0.66, watch: 0.55, zone: "Épaule" }],
  },
  {
    id: "iso_hip",
    group: "force_iso",
    name: "Hanche — adducteurs / abducteurs",
    equipment: "Dynamomètre manuel / ForceFrame / squeeze test",
    howTo:
      "Allongé sur le dos, hanches à 45° (squeeze) ou jambe tendue. Adduction maximale 3-5 s, puis abduction. Noter le meilleur essai à gauche et à droite. Rapport ADD/ABD indicatif ≥ 0,9.",
    ...yt("XmXKu01z_Co"),
    asymWatch: 10,
    asymDeficit: 15,
    measures: [
      { key: "add", label: "Adduction", unit: "N", sided: true, zone: "Hanche" },
      { key: "abd", label: "Abduction", unit: "N", sided: true, zone: "Hanche" },
    ],
    ratios: [{ label: "Ratio ADD/ABD", num: "add", den: "abd", ok: 0.9, watch: 0.8, zone: "Hanche" }],
  },
  {
    id: "iso_ham",
    group: "force_iso",
    name: "Ischios / Quadriceps — isométrique",
    equipment: "Plateforme de force / dynamomètre / NordBord",
    howTo:
      "Test à 90° de flexion de genou (ischios) et 60-90° (quadriceps). Pousser/tirer au maximum 3-5 s. Noter le meilleur essai à gauche et à droite. Ratio ischios/quadriceps visé ≈ 0,6.",
    ...yt("QdKJltHOa5g"),
    asymWatch: 10,
    asymDeficit: 15,
    measures: [
      { key: "ham", label: "Ischios", unit: "N", sided: true, zone: "Chaîne postérieure" },
      { key: "quad", label: "Quadriceps", unit: "N", sided: true, zone: "Genou / Quadriceps" },
    ],
    ratios: [{ label: "Ratio H:Q", num: "ham", den: "quad", ok: 0.6, watch: 0.5, zone: "Chaîne postérieure" }],
  },
  {
    id: "iso_ankle",
    group: "force_iso",
    name: "Cheville — flexion plantaire / dorsale",
    equipment: "Dynamomètre manuel / plateforme de force",
    howTo:
      "Assis, cheville à 90°. Pousser en flexion plantaire puis dorsale au maximum 3-5 s. Noter le meilleur essai à gauche et à droite.",
    ...ytSearch("ankle plantarflexion dorsiflexion isometric strength test dynamometer"),
    asymWatch: 10,
    asymDeficit: 15,
    measures: [
      { key: "pf", label: "Flexion plantaire", unit: "N", sided: true, zone: "Cheville" },
      { key: "df", label: "Flexion dorsale", unit: "N", sided: true, zone: "Cheville" },
    ],
  },
];

export const getTest = (id) => TESTS.find((t) => t.id === id);

/* Calcule le résultat d'un test (endurance/saut → compute ; mobilité/force → evaluateMeasures) */
export function computeResult(test, values) {
  if (!test) return null;
  if (test.compute) return test.compute(values);
  const ev = evaluateMeasures(test, values);
  if (ev.items.length === 0 && ev.asym.length === 0) return null;
  return {
    main: {
      label: "Statut",
      value: ev.status ? STATUS[ev.status].label : "—",
      unit: "",
    },
    status: ev.status,
    zones: ev.zones,
    lines: [],
    eval: ev,
  };
}

/* Version compacte à stocker dans Firestore (pas d'objets imbriqués lourds) */
export function toStoredResult(res) {
  if (!res) return null;
  const out = {
    main: res.main,
    lines: res.lines || [],
  };
  ["vma", "vmi", "cs", "vo2max", "cmj", "status"].forEach((k) => {
    if (res[k] !== undefined) out[k] = res[k];
  });
  if (res.zones) out.zones = res.zones;
  return out;
}
