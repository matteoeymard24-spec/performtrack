/* =====================================================================
   injuryRm.js — RM des mouvements liés à une blessure.

   • Région de la blessure (bas du corps / haut du corps / tronc) : choisie sur la blessure (inj.region),
     sinon déduite des mots du nom et de la zone.
   • Mouvements liés : RM dont la catégorie (banque d'exercices) ou le nom correspond à la région.
     Tronc (dos, lombaires…) : charges lourdes debout (squat, soulevé, RDL, tirages penchés…).
   • Pour chaque mouvement : RM d'avant blessure (dernière valeur avant la date de la blessure), RM actuel,
     écart en kg et en %, et s'il a été retesté depuis. « Retrouvé » quand le RM actuel ≥ celui d'avant.
   • Recalage (bouton du Dashboard) : nouvelle valeur = RM d'avant × % de force disponible, écrite dans la
     fiche RM (historique gardé, entrée marquée injuryAdjust). Les poids cibles des séances suivent
     aussitôt, puis l'ajustement automatique des RM (± 10 % par séance) le fait remonter. La fiche est marquée
     « estimée » (c'est une projection, pas un test) : sinon les RM estimés d'après les séries sous-maximales de
     la réathlé ne pourraient pas la remplacer (Workout.jsx ne remplace jamais un RM « solide » par une estimation).
   ===================================================================== */
import { doc, getDocs, collection, setDoc } from "firebase/firestore";
import { zoneRegion } from "./injuryZones";

const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

const LOWER_INJ = ["ischio", "quadri", "cuisse", "mollet", "achille", "genou", "rotul", "menisq", "lca", "croise", "cheville", "pied", "orteil", "hanche", "adduct", "pubalg", "fessier", "psoas", "tibia", "perone", "jambe", "aine", "voute", "plantaire", "talon"];
const UPPER_INJ = ["epaule", "coiffe", "clavic", "acromio", "coude", "poignet", "main", "doigt", "pouce", "pector", "biceps", "triceps", "avant bras", "bras", "omopl", "trapez", "deltoid", "scapul"];
const TRUNK_INJ = ["lombaire", "dos", "rachis", "dorsal", "cervical", "nuque", "cou", "abdo", "cote", "sacro", "bassin", "disque", "hernie"];

export const REGIONS = {
  lower: { label: "Bas du corps", icon: "🦵" },
  upper: { label: "Haut du corps", icon: "💪" },
  trunk: { label: "Tronc / dos", icon: "🧱" },
};

export function injuryRegion(inj) {
  if (!inj) return null;
  if (inj.region && REGIONS[inj.region]) return inj.region;
  const z = zoneRegion(`${inj.name || ""} ${inj.zone || ""}`); // dictionnaire anatomique (injuryZones.js)
  if (z) return z;
  const t = ` ${norm(`${inj.name || ""} ${inj.zone || ""}`)} `;
  const has = (list) => list.some((w) => t.includes(w));
  if (has(LOWER_INJ)) return "lower";
  if (has(UPPER_INJ)) return "upper";
  if (has(TRUNK_INJ)) return "trunk";
  return null;
}

const LOWER_LIFT = ["squat", "fente", "presse", "souleve", "deadlift", "rdl", "roumain", "hip thrust", "thrust", "leg", "mollet", "step", "trap bar", "hex", "nordic", "ischio", "quadri", "pont", "good morning", "split", "bulgare", "box jump", "saut", "epaule jete", "clean", "arrache", "snatch", "sumo", "adducteur", "abducteur"];
const UPPER_LIFT = ["developpe", "bench", "dc ", "dm ", "militaire", "traction", "pull up", "chin", "tirage", "rowing", "row", "dips", "pompe", "curl", "triceps", "biceps", "elevation", "oiseau", "face pull", "pec", "butterfly", "landmine", "push press", "overhead"];
const TRUNK_LIFT = ["squat", "souleve", "deadlift", "rdl", "roumain", "good morning", "trap bar", "rowing", "row", "clean", "epaule", "arrache", "snatch", "push press", "militaire", "overhead"];

export function liftRegion(name, category) {
  const c = String(category || "");
  if (c === "bas_corps" || c === "bas_anterieure" || c === "bas_posterieure") return "lower";
  if (c === "haut_tirage" || c === "haut_pousse") return "upper";
  const t = ` ${norm(name)} `;
  if (LOWER_LIFT.some((w) => t.includes(w))) return "lower";
  if (UPPER_LIFT.some((w) => t.includes(` ${w}`) || t.includes(w))) return "upper";
  return null;
}
const liftTouchesTrunk = (name) => {
  const t = ` ${norm(name)} `;
  return TRUNK_LIFT.some((w) => t.includes(w));
};

const dayOf = (d) => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  const dt = typeof d?.toDate === "function" ? d.toDate() : new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};

/* rmHistory : { nom: [{ kg, date }] } ; categories : { nom: catégorie } (facultatif)
   → [{ name, pre, preDate, current, currentDate, retested, pct, gapKg, recovered, points }] */
export function injuryRmRows(rmHistory, categories, inj) {
  const region = injuryRegion(inj);
  if (!inj?.date || !region) return { region, rows: [] };
  const rows = [];
  Object.entries(rmHistory || {}).forEach(([name, pts0]) => {
    const r = liftRegion(name, categories?.[name]);
    const related = region === "trunk" ? liftTouchesTrunk(name) : r === region;
    if (!related) return;
    const pts = (pts0 || [])
      .map((p) => ({ kg: Number(p.kg), d: dayOf(p.date), adj: !!p.injuryAdjust }))
      .filter((p) => p.kg > 0 && p.d)
      .sort((a, b) => a.d.localeCompare(b.d));
    const before = pts.filter((p) => p.d < inj.date);
    if (!before.length) return; // pas de RM avant la blessure : rien à comparer
    const pre = before[before.length - 1];
    const after = pts.filter((p) => p.d >= inj.date);
    const cur = after.length ? after[after.length - 1] : pre;
    const pct = Math.round((cur.kg / pre.kg) * 100);
    rows.push({
      name,
      pre: pre.kg,
      preDate: pre.d,
      current: cur.kg,
      currentDate: cur.d,
      retested: after.length > 0,
      adjusted: after.some((p) => p.adj),
      pct,
      gapKg: Math.round((pre.kg - cur.kg) * 10) / 10,
      recovered: after.length > 0 && cur.kg >= pre.kg,
      points: pts.slice(-12),
    });
  });
  rows.sort((a, b) => a.pct - b.pct);
  return { region, rows };
}

/* Récupération de force mesurée par les RM : plus faible % parmi les mouvements RETESTÉS depuis la blessure */
export function rmRecoveryPct(rows) {
  const r = (rows || []).filter((x) => x.retested && !x.adjusted);
  return r.length ? Math.min(...r.map((x) => x.pct)) : null;
}

/* Recalage : RM = RM d'avant × pct / 100 (arrondi 0,5 kg), seulement s'il baisse. names = mouvements à recaler. */
export async function recalibrateInjuryRms({ db, uid, injury, rows, names, pct }) {
  const snap = await getDocs(collection(db, "users", uid, "rm"));
  const byName = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    byName[String(data.exerciseName || d.id).toLowerCase()] = { id: d.id, data };
  });
  const nowIso = new Date().toISOString();
  const done = [];
  for (const row of rows.filter((r) => names.includes(r.name))) {
    const hit = byName[row.name.toLowerCase()];
    if (!hit) continue;
    const kg = Math.round(((row.pre * pct) / 100) * 2) / 2;
    const cur = Number(hit.data.kg) || 0;
    if (!(kg > 0) || kg >= cur) continue;
    const history = [...(hit.data.history || []), { date: nowIso, kg, autoAdjusted: false, injuryAdjust: injury.id, prev: cur }];
    await setDoc(
      doc(db, "users", uid, "rm", hit.id),
      { kg, previousRM: cur, updatedAt: nowIso, autoAdjusted: false, estimated: true, injuryAdjust: { injuryId: injury.id, pct, pre: row.pre, date: nowIso }, history: history.slice(-20) },
      { merge: true }
    );
    done.push({ name: row.name, kg });
  }
  return done;
}
