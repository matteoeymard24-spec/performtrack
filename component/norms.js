/* =====================================================================
   norms.js — comparaison des résultats aux valeurs normatives, par sport
   et par poste.
   Rugby : barème du SU Agen (PP agen 2026-2027 / data / Barème.xlsx),
   note de 0 à 20 pour chaque test et chaque poste.
   Pour ajouter un sport : ajouter son barème dans BAREMES + ses postes.
   ===================================================================== */
import { RUGBY_BAREME, RUGBY_MATCH_REF } from "./rugbyBareme";
import { parseTime, num } from "./testsCalc";
import { LEVELS, SENS, SOURCED, GROUP, levelLabel, BRONCO_RECORD_S, BRONCO_POSTE_RATIO } from "./rugbyLevels";

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

/* Hip thrust : AUCUN barème Agen. Barème ESTIMÉ = barème du squat du même poste × HIP_THRUST_FACTOR
   (le hip thrust se charge plus lourd que le squat). À ajuster ici si le staff a de vraies valeurs. */
export const HIP_THRUST_FACTOR = 1.2;
const hipThrustTable = () => {
  const out = {};
  Object.entries(RUGBY_BAREME["SQUAT"] || {}).forEach(([poste, arr]) => {
    out[poste] = arr.map((v) => (v == null ? null : Math.round((v * HIP_THRUST_FACTOR) / 2.5) * 2.5));
  });
  return out;
};
/* Sprint 60 m : AUCUN barème Agen, et aucune norme 60 m publiée trouvée en rugby (la littérature
   rugby rapporte surtout 10 / 20 / 40 m). Barème ESTIMÉ avec le modèle mono-exponentiel de la course
   de vitesse, v(t) = Vmax·(1 − e^(−t/τ)) (Furusawa 1927 ; validé en terrain par Samozino et al. 2016,
   Scand J Med Sci Sports 26:648-658) : pour chaque poste et chaque note du barème Agen, τ est calé sur
   le temps au 20 m, puis le temps au 60 m est calculé avec la Vmax (GPS) du barème. */
export const SPRINT60_NOTE =
  "Barème estimé (modèle mono-exponentiel de course, Samozino 2016) à partir du 20 m et de la Vmax du barème Agen — pas de norme 60 m publiée en rugby";
const dist = (t, vmax, tau) => vmax * (t - tau * (1 - Math.exp(-t / tau)));
const solve = (f, lo, hi) => {
  // dichotomie : f croissante entre lo et hi
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
const time60 = (t20, vKmh) => {
  const vmax = vKmh / 3.6;
  if (!(t20 > 0) || !(vmax > 0) || vmax * t20 <= 20) return null;
  // τ tel que dist(t20) = 20 m : dist décroît quand τ augmente
  const tau = solve((x) => dist(t20, vmax, x) - 20 > 0 ? -1 : 1, 0.05, 3);
  const t60 = solve((t) => dist(t, vmax, tau) - 60, t20, 20);
  return Math.round(t60 * 100) / 100;
};
const sprint60Table = () => {
  const out = {};
  Object.entries(RUGBY_BAREME["20m"] || {}).forEach(([poste, t20]) => {
    const vg = RUGBY_BAREME["Vitesse GPS"]?.[poste];
    if (!vg) return;
    out[poste] = t20.map((t, i) => (t == null || vg[i] == null ? null : time60(t, vg[i])));
  });
  return out;
};
/* Broad jump (saut en longueur sans élan) : AUCUN barème Agen. Deux sources, combinées (estimation) :
   1) NIVEAU = étude publiée Posthumus et al. (2020), Sports 8(6):85, 39 pros de Super Rugby (NZ) :
      avants 252,3 ± 25,3 cm, trois-quarts 269,0 ± 13,0 cm, ensemble 261,3 ± 18,6 cm (mesures réelles) ;
   2) ÉCART ENTRE POSTES = standards de broad jump par poste du document « USA Rugby Player Profiles and
      Performance Standards » (équipes nationales juniors et Eagles). C'est un document fédéral : la
      méthode de calcul n'y est pas indiquée, ce ne sont pas des moyennes publiées dans une revue. On n'en
      garde que la position relative des postes (milieu de l'échelle de chaque poste).
   Construction : moyenne du poste = moyenne publiée du groupe (avants / trois-quarts) + (milieu USA du poste
   − moyenne pondérée des milieux USA du groupe, pondérée par le nombre de joueurs au poste sur le terrain).
   Note 10/20 (« Pro D2 ») = cette moyenne (hypothèse : Pro D2 ≈ Super Rugby, non vérifiée) ; chaque note vaut
   BROAD_SD / 5 cm (note 15 = +1 écart-type, note 20 = +2) avec l'écart-type de l'ensemble (18,6 cm), car celui
   des trois-quarts (n = 16) est très étroit. À ajuster ici si le staff a de vraies valeurs. */
export const BROAD_MEAN = { avants: 252.3, arrieres: 269.0 };
export const BROAD_SD = 18.6;
/* Milieu de l'échelle USA Rugby (cm, entre les scores 5 et 6) et nombre de joueurs au poste */
export const BROAD_USA_MID = { PILIER: 252.5, TALON: 262.5, "2L": 272.5, "3L": 282.5, "9": 287.5, "10": 287.5, Centre: 292.5, Ailier: 292.5, Arriere: 292.5 };
const BROAD_COUNT = { PILIER: 2, TALON: 1, "2L": 2, "3L": 3, "9": 1, "10": 1, Centre: 2, Ailier: 2, Arriere: 1 };
const BROAD_FORWARDS = ["PILIER", "TALON", "2L", "3L"];
export const BROAD_NOTE =
  "Barème estimé : niveau = moyennes mesurées Super Rugby (Posthumus 2020), écart entre postes = standards USA Rugby (document fédéral, méthode non publiée). Aucune étude publiée ne donne le broad jump poste par poste.";
export const broadPosteMean = (poste) => {
  const fw = BROAD_FORWARDS.includes(poste);
  const grp = (POSTES.rugby || []).map((x) => x.key).filter((k) => BROAD_FORWARDS.includes(k) === fw);
  const wsum = grp.reduce((a, k) => a + BROAD_COUNT[k], 0);
  const avgUsa = grp.reduce((a, k) => a + BROAD_USA_MID[k] * BROAD_COUNT[k], 0) / wsum;
  return (fw ? BROAD_MEAN.avants : BROAD_MEAN.arrieres) + (BROAD_USA_MID[poste] - avgUsa);
};
const broadTable = () => {
  const out = {};
  (POSTES.rugby || []).forEach(({ key }) => {
    const mean = broadPosteMean(key);
    out[key] = Array.from({ length: 21 }, (_, n) => Math.round(mean + (n - 10) * (BROAD_SD / 5)));
  });
  return out;
};
/* ===================== ENDURANCE : Yo-Yo IR1 et 30-15 IFT (VIFT) =====================
   YO-YO IR1 : standards du CLUB (basés sur des clubs de Top 14) = niveau Pro D2 de l'app : BR bronze, AR argent,
   OR or, par poste (Pilier = moyenne Piliers D et G). Top 14 et International : ESTIMÉS, décalés d'un
   demi-écart (OR - BR) par niveau ; mêmes écarts de médailles que le niveau Pro D2.
   VIFT 30-15 : rugby union, 114 joueurs (Darrall-Jones et al., IJSPP 2016) : 18,9 à 19,2 km/h selon la
   catégorie d'âge, écart-type ≈ 1,1 ; l'étude ne distingue pas les postes → même barème pour tous.
   Note 10 = 19,0 km/h ; chaque note = 0,22 km/h (≈ écart-type / 5). */
export const CLUB_YOYO = {
  PILIER: { or: 1420, ar: 1280, br: 1160 },
  TALON: { or: 1760, ar: 1600, br: 1480 },
  "2L": { or: 1800, ar: 1640, br: 1520 },
  "3L": { or: 2200, ar: 2000, br: 1840 },
  "9": { or: 2200, ar: 2040, br: 1920 },
  "10": { or: 2000, ar: 1840, br: 1680 },
  Centre: { or: 2080, ar: 1920, br: 1840 },
  Ailier: { or: 2000, ar: 1840, br: 1720 },
  Arriere: { or: 2200, ar: 2000, br: 1840 },
};
const VIFT_MEAN = 19.0;
const VIFT_STEP = 0.22;
export const ENDURANCE_NOTE =
  "Barème estimé : 30-15 = moyenne rugby union (Darrall-Jones 2016), sans distinction de poste.";
/* Seuils des 3 niveaux pour un poste (bronze du niveau). Le tableau du club = niveau Pro D2 :
   bronze BR, argent AR, or OR. Top 14 et International : estimés, décalés d'un demi-écart (OR - BR) par niveau. */
const yoyoLevels = (poste) => {
  const c = CLUB_YOYO[poste];
  if (!c) return null;
  const s = (c.or - c.br) / 2;
  return { s, prod2: c.br, top14: c.br + s, intl: c.br + 2 * s, dAr: c.ar - c.br, dOr: c.or - c.br };
};
const yoyoTable = () => {
  const out = {};
  (POSTES.rugby || []).forEach(({ key }) => {
    const L = yoyoLevels(key);
    out[key] = Array.from({ length: 21 }, (_, n) => {
      if (n <= 10) return Math.round(L.prod2 - ((10 - n) * L.s) / 5);
      if (n <= 15) return Math.round(L.prod2 + ((n - 10) * (L.top14 - L.prod2)) / 5);
      return Math.round(L.top14 + ((n - 15) * (L.intl - L.top14)) / 5);
    });
  });
  return out;
};
const iftTable = () => {
  const out = {};
  (POSTES.rugby || []).forEach(({ key }) => {
    out[key] = Array.from({ length: 21 }, (_, n) => Math.round((VIFT_MEAN + (n - 10) * VIFT_STEP) * 10) / 10);
  });
  return out;
};
const RUGBY_BAREME_X = { ...RUGBY_BAREME, "HIP THRUST": hipThrustTable(), "60m": sprint60Table(), BROAD: broadTable(), YOYO1: yoyoTable(), VIFT: iftTable() };

/* Source affichée pour certaines échelles (sinon : texte par défaut du barème Agen) */
const LADDER_META = {
  YOYO1: {
    prod2: { tag: "doc", src: "Standards du club (clubs de Top 14) : BR / AR / OR" },
    top14: { tag: "estimé", src: "Estimé : niveau du club + un demi-écart (OR - BR)" },
    international: { tag: "estimé", src: "Estimé : niveau du club + un écart (OR - BR)" },
  },
  VIFT: {
    prod2: { tag: "estimé", src: "Moyenne rugby union 19,0 km/h (Darrall-Jones 2016), sans distinction de poste" },
    top14: { tag: "estimé", src: "Moyenne + 1 écart-type (≈ 1,1 km/h)" },
    international: { tag: "estimé", src: "Moyenne + 2 écarts-types (≈ 1,1 km/h)" },
  },
  BROAD: {
    prod2: { tag: "estimé", src: "Moyenne Super Rugby (Posthumus 2020) ajustée au poste avec les standards USA Rugby" },
    top14: { tag: "estimé", src: "Moyenne du poste + 1 écart-type (18,6 cm)" },
    international: { tag: "estimé", src: "Moyenne du poste + 2 écarts-types (18,6 cm)" },
  },
};

const BAREMES = { rugby: { bareme: RUGBY_BAREME_X, matchRef: RUGBY_MATCH_REF } };

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
  const srcOf0 = (lvl) => {
    const e = SOURCED[normKey]?.[lvl];
    return e && GROUP[poste] != null && e.v[GROUP[poste]] != null ? { w: W(cv(e.v[GROUP[poste]])), src: e.src, est: /^Estimé/.test(e.src) } : null;
  };
  const sp = srcOf0("prod2");
  const p = sp ? sp.w : W(at(10));
  const n15 = W(at(15));
  const n20 = W(at(20));
  const gi = GROUP[poste];
  const srcOf = (lvl) => {
    const e = SOURCED[normKey]?.[lvl];
    return e && gi != null && e.v[gi] != null ? { w: W(cv(e.v[gi])), src: e.src, est: /^Estimé/.test(e.src) } : null;
  };

  const meta0 = LADDER_META[normKey] || {};
  let iTag = meta0.international || { tag: "barème", src: "Barème Agen, note 20/20" };
  let i = n20;
  const si = srcOf("international");
  if (si && si.w > p) {
    i = si.w;
    iTag = { tag: si.est ? "estimé" : "doc", src: si.src };
  }
  if (!(i > p)) i = p + Math.abs(p) * 0.08;

  let tTag = meta0.top14 || { tag: "barème", src: "Barème Agen, note 15/20" };
  let t = n15;
  const st = srcOf("top14");
  if (st && st.w > p && st.w < i) {
    t = st.w;
    tTag = { tag: st.est ? "estimé" : "doc", src: st.src };
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
    else if (l.id === "prod2") [w, meta] = [p, sp ? { tag: "estimé", src: sp.src } : meta0.prod2 || { tag: "barème", src: "Barème Agen, note 10/20 (≈ moyenne des tops Pro D2)" }];
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
  // Médailles : bronze = moyenne du niveau (déjà dans row.thr) ; argent / or = écart du barème
  // entre la note 10 et les notes 15 / 20, ramené au niveau (réduit pour les niveaux plus bas,
  // jamais gonflé pour les niveaux plus hauts).
  const prodRow = rows.find((r) => r.id === "prod2");
  const aCv = prodRow ? cv(prodRow.thr) : null;
  rows.forEach((r) => {
    const bCv = cv(r.thr);
    const s = aCv > 0 && bCv > 0 ? Math.min(1, bCv / aCv) : 1;
    const med = (nNote) => back(bCv + (at(nNote) - at(10)) * s);
    r.silver = med(15);
    r.gold = med(20);
  });
  // Yo-Yo IR1 : niveaux et médailles à partir des standards du club (= niveau Pro D2)
  const cy = normKey === "YOYO1" ? yoyoLevels(poste) : null;
  if (cy) {
    const thrs = { prod2: cy.prod2, top14: cy.top14, international: cy.intl };
    rows.forEach((r) => {
      if (thrs[r.id] != null) (r.thr = thrs[r.id]), (r.w = thrs[r.id]);
      const k = Math.min(1, r.thr / cy.prod2);
      r.thr = Math.round(r.thr);
      r.silver = Math.round(r.thr + cy.dAr * k);
      r.gold = Math.round(r.thr + cy.dOr * k);
    });
  }
  // Bronco : médailles déduites des écarts entre niveaux (et plus de l'écart du barème Agen, trop large).
  // Pro D2 : argent = seuil Top 14, or = seuil International. Top 14 : argent = International, or = 1 pas plus vite.
  // International : argent / or = 1 et 2 pas plus vite. Niveaux plus bas : pas réduit proportionnellement.
  if (bronco) {
    const rp = rows.find((r) => r.id === "prod2");
    const rt = rows.find((r) => r.id === "top14");
    const ri = rows.find((r) => r.id === "international");
    if (rp && rt && ri) {
      const P = cv(rp.thr), T = cv(rt.thr), I = cv(ri.thr);
      const step = Math.max(2, (P - I) / 2);
      rows.forEach((r) => {
        const b = cv(r.thr);
        const k = Math.min(1, P / b);
        r.silver = back(Math.round(b - step * k));
        r.gold = back(Math.round(b - 2 * step * k));
      });
      rp.silver = back(T); rp.gold = back(I);
      rt.silver = back(I); rt.gold = back(Math.round(I - step));
      ri.silver = back(Math.round(I - step)); ri.gold = back(Math.round(I - 2 * step));
    }
  }
  // Bronco : l'or ne peut pas être plus rapide que le meilleur temps connu (record ramené au poste), un peu
  // moins exigeant quand le niveau baisse ; l'argent est recalé proportionnellement.
  if (bronco && gi != null && BRONCO_POSTE_RATIO[gi]) {
    const floor = BRONCO_RECORD_S * BRONCO_POSTE_RATIO[gi];
    const intl = rows.find((r) => r.id === "international");
    const bIntl = intl ? cv(intl.thr) : floor;
    rows.forEach((r) => {
      const b = cv(r.thr);
      const fl = floor + 0.5 * Math.max(0, b - bIntl);
      const sd = cv(r.silver);
      const gd = cv(r.gold);
      if (gd < fl && b > fl) {
        const frac = b - gd > 0 ? (b - sd) / (b - gd) : 0.5;
        r.gold = back(fl);
        r.silver = back(b - (b - fl) * frac);
      }
    });
  }
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
  const reachesAt = (real, k) => hasVal && w >= L.W(L.cv(real)) - 1e-9;
  const items = L.rows.map((r, k) => {
    const medal = !hasVal
      ? null
      : reachesAt(r.gold, k)
      ? "gold"
      : reachesAt(r.silver, k)
      ? "silver"
      : w >= r.w - 1e-9
      ? "bronze"
      : null;
    return {
      id: r.id,
      label: r.label,
      jeunes: r.jeunes,
      tag: r.tag,
      src: r.src,
      thr: f(r.thr),
      silver: f(r.silver),
      gold: f(r.gold),
      medal,
      met: hasVal ? reachedIdx !== -1 && k >= reachedIdx : null,
      isTarget: r.id === targetId,
    };
  });
  const reached = reachedIdx >= 0 ? items[reachedIdx] : null;
  const nextIdx = hasVal ? (reachedIdx === -1 ? items.length - 1 : reachedIdx - 1) : -1;
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  const tIdx = items.findIndex((x) => x.isTarget);
  const target = tIdx >= 0 ? { ...items[tIdx], ok: hasVal ? reachedIdx !== -1 && reachedIdx <= tIdx : null } : null;
  return { items, reached, next, target, below: hasVal && reachedIdx === -1 };
}

/* Note /20 RELATIVE AU NIVEAU VISÉ.
   Avant : la note comparait toujours à l'échelle Pro D2 du barème Agen, alors que
   le tableau "Standards par niveau" disait qu'on avait atteint Fédérale 3 → notes
   incohérentes (ex. squat au-dessus du standard Fédérale 3 mais 3/20).
   Maintenant : 10/20 = le standard du niveau visé (même valeur que dans le tableau
   des niveaux) ; l'échelle du barème est ramenée proportionnellement à ce niveau.
   Sans niveau (ou Pro D2) : barème Agen tel quel. */
export function levelRatio(sport, normKey, poste, levelId) {
  if (!levelId || levelId === MATCH_REF_LEVEL) return null;
  const L = buildLadder(sport, normKey, poste);
  const row = L?.rows.find((r) => r.id === levelId);
  const pr = L?.rows.find((r) => r.id === MATCH_REF_LEVEL);
  if (!row || !pr) return null;
  const a = L.cv(pr.thr);
  const b = L.cv(row.thr);
  if (!(a > 0) || !(b > 0)) return null;
  const bronco = normKey === "Bronco";
  return { ratio: a / b, cv: L.cv, back: bronco ? fromSec : (x) => x };
}

export function scoreForLevel(sport, normKey, poste, value, levelId) {
  const lr = levelRatio(sport, normKey, poste, levelId);
  if (!lr) {
    const base = scoreNorm(sport, normKey, poste, value);
    return base ? { ...base, adapted: false, refLabel: "du poste" } : null;
  }
  if (value == null || isNaN(value)) return null;
  const eq = lr.back(lr.cv(value) * lr.ratio);
  const sc = scoreNorm(sport, normKey, poste, eq);
  if (!sc) return null;
  const un = (x) => (x == null ? null : lr.back(lr.cv(x) / lr.ratio));
  return {
    ...sc,
    thr10: un(sc.thr10),
    thr15: un(sc.thr15),
    thr20: un(sc.thr20),
    next: un(sc.next),
    adapted: true,
    refLabel: `niveau ${levelLabel(levelId)}`,
  };
}

export const MEDALS = {
  gold: { icon: "🥇", label: "Or", color: "#e0c13d" },
  silver: { icon: "🥈", label: "Argent", color: "#c4c9d1" },
  bronze: { icon: "🥉", label: "Bronze", color: "#cd8a4b" },
};
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
  yoyo_ir1: [{ normKey: "YOYO1", label: "Yo-Yo IR1", unit: "m", get: (v) => num(v.distance), fmt: (x) => (x == null ? "—" : String(Math.round(x))), estimated: null }],
  ift3015: [{ normKey: "VIFT", label: "30-15 IFT (VIFT)", unit: "km/h", get: (v) => num(v.speed), fmt: (x) => (x == null ? "—" : String(Math.round(x * 10) / 10)), estimated: ENDURANCE_NOTE }],
  cmj: [{ normKey: "CMJ", label: "CMJ", unit: "cm", get: (v) => num(v.height), fmt: fmtNum }],
  broad_jump: [{ normKey: "BROAD", label: "Broad jump", unit: "cm", get: (v) => { const a = [v.d1, v.d2, v.d3].map(num).filter((x) => x != null && x > 0); return a.length ? Math.max(...a) : null; }, fmt: (x) => (x == null ? "—" : String(Math.round(x))), estimated: BROAD_NOTE }],
  sprint: [
    { normKey: "10m", label: "Sprint 10 m", unit: "s", get: (v) => num(v.t10), fmt: fmtNum },
    { normKey: "15m", label: "Sprint 15 m", unit: "s", get: (v) => num(v.t15), fmt: fmtNum },
    { normKey: "20m", label: "Sprint 20 m", unit: "s", get: (v) => num(v.t20), fmt: fmtNum },
    { normKey: "60m", label: "Sprint 60 m", unit: "s", get: (v) => num(v.t60), fmt: fmtNum, estimated: SPRINT60_NOTE },
    { normKey: "Vitesse GPS", label: "Vitesse max (GPS)", unit: "km/h", get: (v) => num(v.vmax), fmt: fmtNum },
  ],
  iso_neck: [
    { normKey: "Cervicales Flexion", label: "Cervicales — flexion", unit: "kg", get: (v) => num(v.flex), fmt: fmtNum },
    { normKey: "Cervicales extension", label: "Cervicales — extension", unit: "kg", get: (v) => num(v.ext), fmt: fmtNum },
  ],
};

/* Lignes « standards par niveau » d'un test (même sans valeur saisie) : [{label,unit,display,lv}] */
export function evaluateLadderRows(testId, values, sport, poste, level) {
  const defs = TEST_NORMS[testId];
  if (!defs || !hasNorms(sport, poste)) return [];
  const out = [];
  defs.forEach((d) => {
    const value = values ? d.get(values) : null;
    const lv = levelInfo(sport, d.normKey, poste, value, level, d.fmt);
    if (!lv) return;
    out.push({ label: d.label, unit: d.unit, display: value != null ? d.fmt(value) : null, lv, estNote: d.estimated || null });
  });
  return out;
}

/* Compare les valeurs saisies d'un test au barème du poste. [] si rien à comparer. */
export function evaluateTestNorms(testId, values, sport, poste, level) {
  const defs = TEST_NORMS[testId];
  if (!defs || !hasNorms(sport, poste) || !values) return [];
  const out = [];
  defs.forEach((d) => {
    const value = d.get(values);
    if (value == null) return;
    const sc = scoreForLevel(sport, d.normKey, poste, value, level);
    if (!sc) return;
    out.push({
      label: d.label,
      unit: d.unit,
      estNote: d.estimated || null,
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
  { normKey: "SQUAT", pattern: "push_v_lower", label: "Squat", all: ["squat"], none: ["bulgar", "split", "goblet", "front", "avant", "saut", "jump", "pistol", "cossack", "zercher", "overhead", "box"] },
  { normKey: "DEVELOPPE COUCHE", pattern: "push_h_upper", label: "Développé couché", all: ["developpe", "couche"], none: ["incline", "haltere", "inclin"] },
  { normKey: "DEVELOPPE MILITAIRE", pattern: "push_v_upper", label: "Développé militaire", all: ["developpe", "militaire"], none: ["haltere"] },
  { normKey: "RDL", pattern: "push_h_lower", label: "Soulevé de terre roumain (RDL)", any: ["rdl", "souleve de terre roumain", "romanian"], none: ["unilat", "1 jambe"] },
  { normKey: "HIP THRUST", pattern: "push_h_lower", label: "Hip thrust", any: ["hip thrust", "hip trust", "hipthrust", "poussee de hanche"], none: ["unilat", "1 jambe", "single"], estimated: `Barème estimé : squat du poste × ${HIP_THRUST_FACTOR} (pas de barème Agen pour le hip thrust)` },
  { normKey: "TRAP BARRE", pattern: "push_v_lower", label: "Trap bar", all: ["trap"], none: [] },
  { normKey: "TIRAGE PLANCHE", pattern: "pull_h", label: "Tirage planche", all: ["tirage", "planche"], none: [] },
  { normKey: "TRACTION", pattern: "pull_v", label: "Traction (charge totale)", all: ["traction"], none: ["australienne", "elastique", "assist"] },
];

/* Schémas de mouvement : les notes de force sont regroupées par pattern */
export const STRENGTH_PATTERNS = [
  { id: "push_v_upper", label: "Poussée verticale — haut du corps" },
  { id: "push_v_lower", label: "Poussée verticale — bas du corps" },
  { id: "push_h_upper", label: "Poussée horizontale — haut du corps" },
  { id: "push_h_lower", label: "Poussée horizontale — bas du corps" },
  { id: "pull_v", label: "Tirage vertical" },
  { id: "pull_h", label: "Tirage horizontal" },
];

/* [{id,label,rows,avg}] — avg = moyenne des notes /20 du pattern (null si aucune) */
export function groupByPattern(rows) {
  const out = STRENGTH_PATTERNS.map((p) => {
    const rs = (rows || []).filter((r) => r.pattern === p.id);
    const notes = rs.filter((r) => r.note != null).map((r) => r.note);
    return { ...p, rows: rs, avg: notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null };
  }).filter((g) => g.rows.length > 0);
  const rest = (rows || []).filter((r) => !STRENGTH_PATTERNS.some((p) => p.id === r.pattern));
  if (rest.length) out.push({ id: "autre", label: "Autres", rows: rest, avg: null });
  return out;
}

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
    const sc = rm ? scoreForLevel(sport, spec.normKey, poste, rm.kg, level) : null;
    const lr = levelRatio(sport, spec.normKey, poste, level);
    const t = (n) => (table[n] != null ? (lr ? table[n] / lr.ratio : table[n]) : null);
    return {
      label: spec.label,
      matched: rm ? rm.name : null,
      value: rm ? rm.kg : null,
      display: rm ? fmtNum(rm.kg) : null,
      unit: "kg",
      pattern: spec.pattern,
      estNote: spec.estimated || null,
      refLabel: lr ? `niveau ${levelLabel(level)}` : "du poste",
      ...(sc || {}),
      t10: fmtNum(t(10)),
      t15: fmtNum(t(15)),
      t20: fmtNum(t(20)),
      tNext: sc && sc.next != null ? fmtNum(sc.next) : null,
      lv: levelInfo(sport, spec.normKey, poste, rm ? rm.kg : null, level, fmtNum),
    };
  }).filter(Boolean);
}
