/* =====================================================================
   cyclingRows.js — lignes « comme le rugby » pour le cyclisme : force par pattern (en kg), CMJ, sprint 5 s, endurance.
   Chaque ligne a les mêmes champs que evaluateStrength (label, display, unit, pattern, note, lv…) pour que LevelTable
   et la carte « Notes /20 par domaine » fonctionnent sans changement.
   Seuils : bronze = standard du niveau (10/20), argent = +1 écart-type (15/20), or = +2 écarts-types (20/20).
   ===================================================================== */
import { STRENGTH_NORMS, findRM } from "./norms";
import {
  CYCLING_LEVELS,
  CYCLING_LIFTS,
  CYCLING_STD,
  CYCLING_TAGS,
  cyclingSd,
  cmjStd,
  cmjNote,
  cyclingNote,
  liftStd,
  liftTag,
  liftNote,
} from "./cycling";

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return isFinite(x) && x > 0 ? x : null;
};
const tagFor = (t) => (t === "doc" ? "doc" : "estimé"); // « provisoire » est signalé par estNote

/* stdOf(levelId) → { std, sd, tag } ; value : valeur de l'athlète (même unité) ; fmt : mise en forme des seuils */
function makeLv(stdOf, value, targetId, fmt) {
  const hasVal = value != null && !isNaN(value);
  const items = CYCLING_LEVELS.map((l) => {
    const { std, sd, tag } = stdOf(l.id);
    const silver = std + sd;
    const gold = std + 2 * sd;
    const medal = !hasVal ? null : value >= gold ? "gold" : value >= silver ? "silver" : value >= std ? "bronze" : null;
    return { id: l.id, label: l.label, tag: tagFor(tag), src: "", thr: fmt(std), silver: fmt(silver), gold: fmt(gold), medal, _std: std, isTarget: l.id === targetId };
  });
  const reachedIdx = hasVal ? items.findIndex((it) => value >= it._std - 1e-9) : -1;
  items.forEach((it, k) => {
    it.met = hasVal ? reachedIdx !== -1 && k >= reachedIdx : null;
  });
  const reached = reachedIdx >= 0 ? items[reachedIdx] : null;
  const nextIdx = hasVal ? (reachedIdx === -1 ? items.length - 1 : reachedIdx - 1) : -1;
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  const tIdx = items.findIndex((x) => x.isTarget);
  const target = tIdx >= 0 ? { ...items[tIdx], ok: hasVal ? reachedIdx !== -1 && reachedIdx <= tIdx : null } : null;
  return { items, reached, next, target, below: hasVal && reachedIdx === -1 };
}

const latestBy = (tests, pred) =>
  [...(tests || [])].filter(pred).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null;

/* Renvoie { strength, cmj, sprint, endu } : listes de lignes */
export function cyclingBilan({ tests, rmDocs, bw, level, sex }) {
  const lvl = CYCLING_LEVELS.some((l) => l.id === level) ? level : null;
  const kg = (x) => String(Math.round(x * 2) / 2);

  const strength = STRENGTH_NORMS.filter((sp) => CYCLING_LIFTS[sp.normKey]).map((sp) => {
    const rm = findRM(rmDocs, sp);
    const tag = liftTag(sp.normKey, sex);
    const stdOf = (id) => {
      const ratio = liftStd(sp.normKey, id, sex);
      return { std: bw ? ratio * bw : ratio, sd: (bw ? ratio * bw : ratio) * 0.22, tag };
    };
    const value = rm && bw ? rm.kg : null;
    const ratio = rm && bw ? r2(rm.kg / bw) : null;
    return {
      label: sp.label,
      matched: rm ? rm.name : null,
      value,
      display: rm ? String(rm.kg) : null,
      unit: "kg",
      pattern: sp.pattern,
      estNote: tag === "provisoire" ? "Barème provisoire : aucune norme cycliste publiée trouvée" : tag === "estimé" ? "Barème estimé à partir d'une étude" : null,
      note: lvl && ratio != null ? liftNote(sp.normKey, lvl, sex, ratio) : null,
      lv: makeLv(stdOf, value, lvl, bw ? kg : (x) => String(r2(x))),
      noWeight: !bw,
    };
  });

  const cmjT = latestBy(tests, (t) => t.result?.cmj != null);
  const cmjV = cmjT ? Number(cmjT.result.cmj) : null;
  const cmj = [
    {
      label: "CMJ",
      display: cmjV != null ? String(r1(cmjV)) : null,
      unit: "cm",
      value: cmjV,
      note: lvl && cmjV != null ? cmjNote(lvl, sex, cmjV) : null,
      extra: cmjT ? cmjT.date : "",
      estNote: "Barème provisoire : aucune norme cycliste publiée trouvée",
      lv: makeLv((id) => ({ std: cmjStd(id, sex), sd: cyclingSd("cmj", id, sex), tag: "provisoire" }), cmjV, lvl, (x) => String(r1(x))),
    },
  ];

  const wkg = (testId, key) => {
    const t = latestBy(tests, (x) => x.testId === testId);
    if (!t) return null;
    const p = num(t.values?.[key]);
    const w = num(t.values?.weight) || bw;
    return p && w ? { v: r2(p / w), date: t.date } : null;
  };
  const mk = (id, label, unit, got, std0) => {
    const v = got ? got.v : null;
    return {
      label,
      display: v != null ? String(v) : null,
      unit,
      value: v,
      note: lvl && v != null ? cyclingNote(id, lvl, sex, v) : null,
      extra: got?.date || "",
      lv: makeLv(
        (lid) => ({ std: CYCLING_STD[sex][lid][id], sd: cyclingSd(id, lid, sex), tag: CYCLING_TAGS(lid, sex)[id] }),
        v,
        lvl,
        (x) => String(r1(x))
      ),
    };
  };
  const sprint = [mk("p5s", "Sprint 5 s", "W/kg", wkg("cycle_p5s", "p"))];
  const vo2T = latestBy(tests, (t) => t.result?.vo2max != null);
  const endu = [
    mk("p20", "Seuil 20 min / FTP", "W/kg", wkg("ftp", "p20")),
    mk("p5m", "PMA 5 min", "W/kg", wkg("cycle_p5m", "p5")),
    mk("vo2", "VO2max (estimée)", "ml/kg/min", vo2T ? { v: Number(vo2T.result.vo2max), date: vo2T.date } : null),
  ];
  return { strength, cmj, sprint, endu };
}
