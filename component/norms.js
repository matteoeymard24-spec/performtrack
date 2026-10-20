/* =====================================================================
   norms.js — comparaison des résultats aux valeurs normatives, par sport
   et par poste.
   Rugby : barème du SU Agen (PP agen 2026-2027 / data / Barème.xlsx),
   note de 0 à 20 pour chaque test et chaque poste.
   Pour ajouter un sport : ajouter son barème dans BAREMES + ses postes.
   ===================================================================== */
import { RUGBY_BAREME, RUGBY_MATCH_REF } from "./rugbyBareme";
import { parseTime, num } from "./testsCalc";
import { LEVELS, SENS, SOURCED, GROUP } from "./rugbyLevels";

export { LEVELS, levelLabel } from "./rugbyLevels";

export const SPORTS = [{ id: "rugby", label: "Rugby" }];

export const POSTES = {
  rugby: [
    { key: "PILIER", label: "Pilier (1 / 3)" },
    { key: "TALON", label: "Talonneur (2)" },
    { key: "2L", label: "2e ligne (4 / 5)" },
    { key: "3L", label: "3e ligne (6 / 7 / 8)" },
    { key: "9", label: "Demi de mêlée (9)" },
    { key: "10", label: "Demi d'ouverture (10)" },
    { key: "Centre", label: "Centre (12 / 13)" },
    { key: "Ailier", label: "Ailier (11 / 14)" },
    { key: "Arriere", label: "Arrière (15)" },
  ],
};

const BAREMES = { rugby: { bareme: RUGBY_BAREME, matchRef: RUGBY_MATCH_REF } };

export const posteLabel = (sport, key) =>
  (POSTES[sport] || []).find((p) => p.key === key)?.label || key;

export const hasNorms = (sport, poste) =>
  !!(sport && poste && BAREMES[sport] && POSTES[sport]?.some((p) => p.key === poste));

/* Référence match (GPS SU Agen) : valable UNIQUEMENT pour le niveau Pro D2.
   Ramenée à 38 min de ballon en jeu (BIP du Pro D2) ; plus bas le BIP est plus court
   et les clubs n'ont pas de GPS ;
   et la moyenne d'un poste cache des profils très différents (ex. 3e ligne athlétique
   vs 3e ligne momentum) : on n'extrapole donc pas aux autres niveaux. */
export const MATCH_REF_LEVEL = "prod2";
export const getMatchRef = (sport, poste, level) =>
  level === MATCH_REF_LEVEL ? BAREMES[sport]?.matchRef?.[poste] || null : null;

/* Note /20 : plus haute note dont le seuil est atteint (sens auto : si les
   seuils baissent quand la note monte, c'est un temps → plus petit = mieux). */
export function scoreNorm(sport, normKey, poste, value) {
  const table = BAREMES[sport]?.bareme?.[normKey]?.[poste];
  if (!table || value == null || isNaN(value)) return null;
  const defined = table.map((v, n) => (v == null ? null : n)).filter((n) => n != null);
  if (defined.length < 2) return null;
  const first = table[defined[0]];
  const last = table[defined[defined.length - 1]];
  const dir = last < first ? "low" : "high";
  let note = 0;
  for (let i = defined.length - 1; i >= 0; i--) {
    const n = defined[i];
    const thr = table[n];
    if (dir === "high" ? value >= thr : value <= thr) {
      note = n;
      break;
    }
  }
  const thrAt = (n) => {
    if (table[n] != null) return table[n];
    const near = defined.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
    return table[near];
  };
  return {
    note,
    dir,
    thr10: thrAt(10),
    thr15: thrAt(15),
    thr20: thrAt(20),
    next: note < 20 ? thrAt(Math.min(20, note + 1)) : null,
  };
}


/* ---------------------------------------------------------------------
   Standards par NIVEAU (voir rugbyLevels.js pour la méthode)
   --------------------------------------------------------------------- */
const toSec = (x) => {
  const m = Math.floor(x + 1e-9);
  return m * 60 + Math.round((x - m) * 100);
};
const fromSec = (s) => Math.floor(s / 60) + (s % 60) / 100;

/* Échelle de seuils pour un test et un poste : [{id,label,jeunes,thr,tag,src}] du + au - exigeant */
export function buildLadder(sport, normKey, poste) {
  const table = BAREMES[sport]?.bareme?.[normKey]?.[poste];
  if (!table) return null;
  const defined = table.map((v, n) => (v == null ? null : n)).filter((n) => n != null);
  if (defined.length < 2) return null;
  const dir = table[defined[defined.length - 1]] < table[defined[0]] ? "low" : "high";
  const bronco = normKey === "Bronco";
  const cv = (v) => (bronco ? toSec(v) : v);
  const back = (x) => (bronco ? fromSec(x) : x);
  const W = (x) => (dir === "high" ? x : -x);
  const at = (n) => {
    const near = table[n] != null ? n : defined.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
    return cv(table[near]);
  };
  const p = W(at(10));
  const n15 = W(at(15));
  const n20 = W(at(20));
  const gi = GROUP[poste];
  const srcOf = (lvl) => {
    const e = SOURCED[normKey]?.[lvl];
    return e && gi != null && e.v[gi] != null ? { w: W(cv(e.v[gi])), src: e.src } : null;
  };

  let iTag = { tag: "barème", src: "Barème Agen, note 20/20" };
  let i = n20;
  const si = srcOf("international");
  if (si && si.w > p) {
    i = si.w;
    iTag = { tag: "doc", src: si.src };
  }
  if (!(i > p)) i = p + Math.abs(p) * 0.08;

  let tTag = { tag: "barème", src: "Barème Agen, note 15/20" };
  let t = n15;
  const st = srcOf("top14");
  if (st && st.w > p && st.w < i) {
    t = st.w;
    tTag = { tag: "doc", src: st.src };
  } else if (!(n15 > p && n15 < i)) {
    t = (p + i) / 2;
    tTag = { tag: "barème", src: "Milieu entre Pro D2 et International" };
  }

  const sens = SENS[normKey] ?? 0.5;
  const real = (w) => back(dir === "high" ? w : -w);
  const rows = [];
  LEVELS.forEach((l) => {
    let w, meta;
    if (l.id === "international") [w, meta] = [i, iTag];
    else if (l.id === "top14") [w, meta] = [t, tTag];
    else if (l.id === "prod2") [w, meta] = [p, { tag: "barème", src: "Barème Agen, note 10/20 (≈ moyenne des tops Pro D2)" }];
    else {
      const eff = 1 - (1 - l.f) * sens;
      const pReal = dir === "high" ? p : -p; // valeur réelle Pro D2 (secondes pour Bronco)
      const val = dir === "high" ? pReal * eff : pReal / eff;
      w = W(val);
      meta = { tag: "estimé", src: "Estimation : niveau Pro D2 × coefficient (pas de valeur dans le référentiel)" };
    }
    rows.push({ id: l.id, label: l.label, jeunes: !!l.jeunes, w, thr: real(w), ...meta });
  });
  // sécurité : jamais plus facile en montant
  for (let k = rows.length - 2; k >= 0; k--) if (rows[k].w < rows[k + 1].w) rows[k].w = rows[k + 1].w, (rows[k].thr = real(rows[k].w));
  return { dir, rows, cv, W };
}

/* Niveau atteint pour une valeur + écart à l'objectif (levelId) */
export function levelInfo(sport, normKey, poste, value, targetId, fmt) {
  const L = buildLadder(sport, normKey, poste);
  if (!L) return null;
  const f = fmt || ((x) => String(Math.round(x * 100) / 100));
  const hasVal = value != null && !isNaN(value);
  const w = hasVal ? L.W(L.cv(value)) : null;
  let reachedIdx = -1;
  if (hasVal) reachedIdx = L.rows.findIndex((r) => w >= r.w - 1e-9);
  const items = L.rows.map((r, k) => ({
    id: r.id,
    label: r.label,
    jeunes: r.jeunes,
    tag: r.tag,
    src: r.src,
    thr: f(r.thr),
    met: hasVal ? reachedIdx !== -1 && k >= reachedIdx : null,
    isTarget: r.id === targetId,
  }));
  const reached = reachedIdx >= 0 ? items[reachedIdx] : null;
  const nextIdx = hasVal ? (reachedIdx === -1 ? items.length - 1 : reachedIdx - 1) : -1;
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  const tIdx = items.findIndex((x) => x.isTarget);
  const target = tIdx >= 0 ? { ...items[tIdx], ok: hasVal ? reachedIdx !== -1 && reachedIdx <= tIdx : null } : null;
  return { items, reached, next, target, below: hasVal && reachedIdx === -1 };
}

export const noteColor = (n) =>
  n >= 15 ? "#4fae7d" : n >= 10 ? "#8cc36a" : n >= 5 ? "#e0a13d" : "#d9534f";
export const noteLabel = (n) =>
  n >= 15 ? "Très bon niveau" : n >= 10 ? "Dans la norme" : n >= 5 ? "Sous la norme" : "À développer";

const fmtBronco = (x) => {
  if (x == null) return "—";
  const m = Math.floor(x + 1e-9);
  const s = Math.round((x - m) * 100);
  return `${m}'${String(s).padStart(2, "0")}"`;
};
const fmtNum = (x) => (x == null ? "—" : String(Math.round(x * 100) / 100));

/* Quels champs de quels tests se comparent à quelle ligne du barème */
export const TEST_NORMS = {
  bronco: [
    {
      normKey: "Bronco",
      label: "Bronco",
      unit: "",
      get: (v) => {
        const t = parseTime(v.time);
        if (!t) return null;
        const s = Math.round(t);
        return Math.floor(s / 60) + (s % 60) / 100;
      },
      fmt: fmtBronco,
    },
  ],
  cmj: [{ normKey: "CMJ", label: "CMJ", unit: "cm", get: (v) => num(v.height), fmt: fmtNum }],
  sprint: [
    { normKey: "5m", label: "Sprint 5 m", unit: "s", get: (v) => num(v.t5), fmt: fmtNum },
    { normKey: "10m", label: "Sprint 10 m", unit: "s", get: (v) => num(v.t10), fmt: fmtNum },
    { normKey: "15m", label: "Sprint 15 m", unit: "s", get: (v) => num(v.t15), fmt: fmtNum },
    { normKey: "20m", label: "Sprint 20 m", unit: "s", get: (v) => num(v.t20), fmt: fmtNum },
    { normKey: "Vitesse GPS", label: "Vitesse max (GPS)", unit: "km/h", get: (v) => num(v.vmax), fmt: fmtNum },
    { normKey: "Prowler 85Kg 10m", label: "Prowler 85 kg · 10 m", unit: "s", get: (v) => num(v.prowler), fmt: fmtNum },
  ],
  iso_neck: [
    { normKey: "Cervicales Flexion", label: "Cervicales — flexion", unit: "kg", get: (v) => num(v.flex), fmt: fmtNum },
    { normKey: "Cervicales extension", label: "Cervicales — extension", unit: "kg", get: (v) => num(v.ext), fmt: fmtNum },
  ],
};

/* Compare les valeurs saisies d'un test au barème du poste. [] si rien à comparer. */
export function evaluateTestNorms(testId, values, sport, poste, level) {
  const defs = TEST_NORMS[testId];
  if (!defs || !hasNorms(sport, poste) || !values) return [];
  const out = [];
  defs.forEach((d) => {
    const value = d.get(values);
    if (value == null) return;
    const sc = scoreNorm(sport, d.normKey, poste, value);
    if (!sc) return;
    out.push({
      label: d.label,
      unit: d.unit,
      value,
      display: d.fmt(value),
      ...sc,
      t10: d.fmt(sc.thr10),
      t15: d.fmt(sc.thr15),
      t20: d.fmt(sc.thr20),
      tNext: sc.next != null ? d.fmt(sc.next) : null,
      lv: levelInfo(sport, d.normKey, poste, value, level, d.fmt),
    });
  });
  return out;
}

/* Force : les 1RM de « Mes RM » face au barème (correspondance automatique par nom) */
export const STRENGTH_NORMS = [
  { normKey: "SQUAT", label: "Squat", all: ["squat"], none: ["bulgar", "split", "goblet", "front", "avant", "saut", "jump", "pistol", "cossack", "zercher", "overhead", "box"] },
  { normKey: "DEVELOPPE COUCHE", label: "Développé couché", all: ["developpe", "couche"], none: ["incline", "haltere", "inclin"] },
  { normKey: "DEVELOPPE MILITAIRE", label: "Développé militaire", all: ["developpe", "militaire"], none: ["haltere"] },
  { normKey: "RDL", label: "Soulevé de terre roumain (RDL)", any: ["rdl", "souleve de terre roumain", "romanian"], none: ["unilat", "1 jambe"] },
  { normKey: "TRAP BARRE", label: "Trap bar", all: ["trap"], none: [] },
  { normKey: "TIRAGE PLANCHE", label: "Tirage planche", all: ["tirage", "planche"], none: [] },
  { normKey: "TRACTION", label: "Traction (charge totale)", all: ["traction"], none: ["australienne", "elastique", "assist"] },
];

const strip = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

/* rmDocs : [{name, kg}] — retourne la meilleure fiche RM correspondante */
export function findRM(rmDocs, spec) {
  let best = null;
  (rmDocs || []).forEach((r) => {
    const n = strip(r.name);
    if (!(r.kg > 0)) return;
    if (spec.none.some((w) => n.includes(w))) return;
    const okAll = spec.all ? spec.all.every((w) => n.includes(w)) : true;
    const okAny = spec.any ? spec.any.some((w) => n.includes(w)) : true;
    if (!(okAll && okAny)) return;
    if (!best || r.kg > best.kg) best = r;
  });
  return best;
}

export function evaluateStrength(rmDocs, sport, poste, level) {
  if (!hasNorms(sport, poste)) return [];
  return STRENGTH_NORMS.map((spec) => {
    const rm = findRM(rmDocs, spec);
    const table = BAREMES[sport].bareme[spec.normKey]?.[poste];
    if (!table) return null;
    const sc = rm ? scoreNorm(sport, spec.normKey, poste, rm.kg) : null;
    const t = (n) => (table[n] != null ? table[n] : null);
    return {
      label: spec.label,
      matched: rm ? rm.name : null,
      value: rm ? rm.kg : null,
      display: rm ? fmtNum(rm.kg) : null,
      unit: "kg",
      ...(sc || {}),
      t10: fmtNum(t(10)),
      t15: fmtNum(t(15)),
      t20: fmtNum(t(20)),
      tNext: sc && sc.next != null ? fmtNum(sc.next) : null,
      lv: levelInfo(sport, spec.normKey, poste, rm ? rm.kg : null, level, fmtNum),
    };
  }).filter(Boolean);
}
