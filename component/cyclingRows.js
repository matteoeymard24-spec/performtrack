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
export function cyclingBilan({ tests, rmDocs, bw: bw0, level, sex }) {
  // poids : profil, sinon dernier poids saisi dans un test
  const wTest = [...(tests || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((t) => num(t.values?.weight)).find((w) => w);
  const bw = bw0 || wTest || null;
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

  /* Puissances en watts (seuils = W/kg × poids du corps) ; la note reste calculée en W/kg */
  const pw = (testId, key) => {
    const t = latestBy(tests, (x) => x.testId === testId);
    if (!t) return null;
    const p = num(t.values?.[key]);
    const w = num(t.values?.weight) || bw;
    return p ? { p, w, v: w ? r2(p / w) : null, date: t.date } : null;
  };
  const mkW = (id, label, got) => {
    const w = got?.w || bw;
    const unit = w ? "W" : "W/kg";
    const conv = (x) => String(w ? Math.round(x) : r1(x));
    return {
      label,
      display: got ? (w ? String(Math.round(got.p)) : String(got.v)) : null,
      unit,
      value: got ? (w ? got.p : got.v) : null,
      note: lvl && got && got.v != null ? cyclingNote(id, lvl, sex, got.v) : null,
      extra: [got?.v != null ? `${got.v} W/kg` : "", got?.date || ""].filter(Boolean).join(" · "),
      lv: makeLv(
        (lid) => {
          const std = CYCLING_STD[sex][lid][id];
          const sd = cyclingSd(id, lid, sex);
          return { std: w ? std * w : std, sd: w ? sd * w : sd, tag: CYCLING_TAGS(lid, sex)[id] };
        },
        got ? (w ? got.p : got.v) : null,
        lvl,
        conv
      ),
    };
  };
  const sprint = [mkW("p5s", "Sprint 5 s", pw("cycle_p5s", "p"))];
  const vo2T = latestBy(tests, (t) => t.result?.vo2max != null);
  const vo2v = vo2T ? Number(vo2T.result.vo2max) : null;
  const endu = [
    mkW("p20", "Seuil 20 min / FTP", pw("ftp", "p20")),
    mkW("p5m", "PMA 5 min", pw("cycle_p5m", "p5")),
    {
      label: "VO2max (estimée)",
      display: vo2v != null ? String(vo2v) : null,
      unit: "ml/kg/min",
      value: vo2v,
      note: lvl && vo2v != null ? cyclingNote("vo2", lvl, sex, vo2v) : null,
      extra: vo2T?.date || "",
      lv: makeLv((lid) => ({ std: CYCLING_STD[sex][lid].vo2, sd: cyclingSd("vo2", lid, sex), tag: CYCLING_TAGS(lid, sex).vo2 }), vo2v, lvl, (x) => String(r1(x))),
    },
  ];
  return { strength, cmj, sprint, endu, bw };
}
