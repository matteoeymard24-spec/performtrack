import { TH } from "./thresholdsCore";
import { ensureThresholds } from "./thresholds";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { getWorkoutDocs, getScopedDocs, getMyAccess } from "./workoutQueries";
import { groupTargetMatches, hasProgress } from "./groupHistory";
import { sessionRpe } from "./sessionLoad";
import { expectedRpeFor, athleteLoadRef } from "./rpePredict";

/* =====================================================================
   trainingDays.js — entraînement prévu (Workout) et matchs (Planification) d'une personne,
   jour par jour, pour adapter la nutrition :
     • type de journée (repos / légère / modérée / intense / match) → calories et glucides
     • prise « autour de la séance » seulement les jours d'entraînement
   loadTrainingDays(uid, from, to) → { "AAAA-MM-JJ": { dayType, sessions:[…], match, minutes, why } }

   Séances créées par un AUTRE coach : les règles Firestore ne laissent un coach lire que ses propres
   séances. L'athlète, lui, voit toutes les siennes : à chaque ouverture de l'app il publie un résumé
   (users/{uid}/nutrition/training, lisible par ses coachs) que le coach fusionne avec ce qu'il voit.
   ===================================================================== */

const MATCH_KINDS = ["match", "amical", "tournoi"];
const TYPE_LABEL = { muscu: "Musculation", sprint: "Sprint", endurance: "Endurance" };

const durationOf = (w, uid) => {
  const p = w?.userProgress?.[uid];
  const real = Number(p?.sessionDuration ?? p?.actualDuration);
  if (real > 0) return Math.round(real);
  return Number(w?.estimatedDuration) || 60;
};

/* Charge d'une journée = somme des charges de séance (méthode sRPE de Foster : RPE × minutes, en UA).
   RPE : ressenti de l'athlète si la séance est faite ; sinon RPE ATTENDU POUR LUI (RPE prévu par le coach,
   ou calculé d'après la prescription %RM / RIR / intensité, + son biais personnel — rpePredict.js).
   Type de journée : comparé à SA charge habituelle (moyenne ± écart-type de ses journées d'entraînement
   sur 90 jours) → légère si z < −0,6, intense si z > 0,8 (ou 2 séances et z > 0,3), sinon modérée.
   Moins de 8 jours d'historique : repères fixes < 300 légère · 300-599 modérée · ≥ 600 intense. */
const DEFAULT_RPE = () => TH("defaultRpe");
const loadOf = (x) => (Number(x.rpe) > 0 ? Number(x.rpe) : DEFAULT_RPE()) * (Number(x.min) || 0);
/* Type de journée = le plus élevé de deux critères :
   1) CHARGE (RPE × minutes) comparée à l'habitude de l'athlète (z), sinon repères fixes ;
   2) INTENSITÉ : une séance dure n'est jamais « légère » même courte (RPE ≥ 7 → au moins modérée),
      et une séance très dure et assez longue est « intense » (RPE ≥ 8 pendant ≥ 45 min). Les besoins en
      glucides dépendent de la durée ET de l'intensité (Burke et al. 2011, J Sports Sci 29:S17). */
const RANK = { leger: 0, modere: 1, intense: 2 };
export function dayTypeOf(info) {
  if (!info) return "repos";
  if (info.match) return "match";
  const n = info.sessions.length;
  if (!n) return "repos";
  const L = info.load;
  const ref = info.ref;
  let byLoad;
  if (ref && ref.sd > 0) {
    const z = (L - ref.mean) / ref.sd;
    info.z = Math.round(z * 10) / 10;
    byLoad = z > TH("dayZHard") || (n >= 2 && z > TH("dayZTwo")) ? "intense" : z < TH("dayZLight") ? "leger" : "modere";
  } else byLoad = L >= TH("loadHard") || (n >= 2 && L >= 0.75 * TH("loadHard")) ? "intense" : L >= TH("loadLight") ? "modere" : "leger";
  // intensité : séance la plus dure de la journée
  let byRpe = "leger";
  info.sessions.forEach((x) => {
    const r = Number(x.rpe) > 0 ? Number(x.rpe) : DEFAULT_RPE();
    const m = Number(x.min) || 0;
    const t = r >= TH("dayRpeHard") && m >= TH("dayRpeHardMin") ? "intense" : r >= TH("dayRpeMod") ? "modere" : "leger";
    if (RANK[t] > RANK[byRpe]) byRpe = t;
  });
  info.byRpe = byRpe;
  info.byLoad = byLoad;
  return RANK[byRpe] > RANK[byLoad] ? byRpe : byLoad;
}
const SRC_TXT = { ressenti: "ressenti", prevu: "prévu", auto: "attendu pour lui", estime: "estimé" };
export function whyOf(info) {
  if (!info) return "pas de séance prévue";
  if (info.match) return `${info.match.name}`;
  if (!info.sessions.length) return "pas de séance prévue";
  const s = info.sessions;
  const vs = info.ref ? ` · sa moyenne ${info.ref.mean} UA (z ${info.z > 0 ? "+" : ""}${String(info.z ?? 0).replace(".", ",")})` : "";
  if (s.length === 1) {
    const x = s[0];
    const r = Number(x.rpe) > 0 ? String(Math.round(x.rpe * 10) / 10).replace(".", ",") : DEFAULT_RPE();
    return `${x.title || TYPE_LABEL[x.type] || "Séance"} · ${x.min} min × RPE ${r} (${SRC_TXT[x.rpeSrc] || "estimé"}) = ${Math.round(info.load)} UA${vs}${info.byRpe && RANK[info.byRpe] > RANK[info.byLoad] ? ` · RPE ${r} → journée au moins ${info.byRpe === "intense" ? "intense" : "modérée"}` : ""}${x.time ? ` · ${x.time}` : ""}`;
  }
  return `${s.length} séances · ${info.minutes} min · charge ${Math.round(info.load)} UA${vs}${info.byRpe && RANK[info.byRpe] > RANK[info.byLoad] ? " · relevée par l'intensité" : ""}`;
}

async function computeTrainingDays(uid, from, to) {
  if (!uid) return {};
  await ensureThresholds(); // seuils du coach (⚙️ Paramètres)
  // profil de la personne (groupe, rôle) + groupes personnalisés
  let profile = {};
  let groups = [];
  try {
    const p = await getDoc(doc(db, "users", uid));
    profile = p.exists() ? p.data() : {};
  } catch (e) {
    console.warn("trainingDays: profil", e);
  }
  try {
    groups = (await getDocs(collection(db, "groups"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    /* règles : groupes illisibles → on se contente du groupe principal */
  }
  const isCoach = profile.role === "admin" || profile.superAdmin === true;
  const myGroupIds = groups.filter((g) => (g.athleteIds || []).includes(uid)).map((g) => g.id);

  const out = {};
  const slot = (d) => (out[d] = out[d] || { sessions: [], match: null, minutes: 0 });

  // ---- séances (+ 90 jours d'historique pour l'individualisation : biais RPE et charge habituelle) ----
  let ref = null;
  try {
    const histFrom = shiftIso(from < todayIso() ? from : todayIso(), -90);
    const snap = await getWorkoutDocs({ since: histFrom });
    const mineList = [];
    snap.docs.forEach((d) => {
      const w = { id: d.id, ...d.data() };
      if (!w.date) return;
      const mine =
        hasProgress(w, uid) ||
        w.targetUserId === uid ||
        (w.group === "moi" && w.createdBy === uid) ||
        (!isCoach &&
          (w.group === "total" ||
            (profile.group && w.group === profile.group) ||
            myGroupIds.includes(w.group) ||
            groupTargetMatches(w, uid, groups)));
      if (!mine) return;
      mineList.push(w);
    });
    ref = athleteLoadRef(mineList, uid, todayIso());
    mineList.forEach((w) => {
      if (w.date < from || w.date > to) return;
      const min = durationOf(w, uid);
      const s = slot(w.date);
      const done = !!w.userProgress?.[uid]?.completedAt;
      const felt = done ? sessionRpe(w, uid) : null;
      const exp = felt == null ? expectedRpeFor(mineList, uid, w) : null;
      const rpe = felt != null ? felt : exp ? exp.rpe : null;
      const rpeSrc = felt != null ? "ressenti" : !exp ? "estime" : exp.auto || exp.bias ? "auto" : "prevu";
      s.sessions.push({ id: w.id, title: w.title || "", type: w.type || "muscu", min, time: w.time || "", done, rpe, rpeSrc });
      s.minutes += min;
    });
  } catch (e) {
    console.warn("trainingDays: séances", e);
  }

  // ---- matchs / compétitions (Planification) ----
  try {
    const fx = await getScopedDocs("fixtures");
    fx.docs.forEach((d) => {
      const f = d.data();
      if (!MATCH_KINDS.includes(f.kind || "match") || !f.date) return;
      const sc = f.scope || "total";
      const forMe = sc === `user:${uid}` || (!isCoach && (sc === "total" || sc === profile.group || myGroupIds.includes(sc)));
      if (!forMe) return;
      const end = f.endDate && f.endDate >= f.date ? f.endDate : f.date;
      for (let day = f.date; day <= end; day = nextDay(day)) {
        if (day < from || day > to) continue;
        slot(day).match = { name: f.name || "Match", kind: f.kind || "match" };
      }
    });
  } catch (e) {
    console.warn("trainingDays: matchs", e);
  }

  return finalize(out, ref);
}

function todayIso() {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function shiftIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const finalize = (out, ref = null) => {
  // référence de charge individuelle : propriété non énumérable (la carte reste « date → jour »)
  Object.defineProperty(out, "ref", { value: ref, enumerable: false, configurable: true, writable: true });
  Object.values(out).forEach((v) => {
    v.ref = ref;
    v.minutes = v.sessions.reduce((a, x) => a + (Number(x.min) || 0), 0);
    v.load = v.sessions.reduce((a, x) => a + loadOf(x), 0);
    v.dayType = dayTypeOf(v);
    v.why = whyOf(v);
  });
  return out;
};

/* ---------- Résumé publié par l'athlète (fenêtre : J-14 → J+56) ---------- */
const isoOf = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const shift = (n) => {
  const x = new Date();
  x.setDate(x.getDate() + n);
  return isoOf(x);
};
let lastPublished = { uid: null, at: 0, json: "" };
export async function publishTrainingSummary(uid, { force = false } = {}) {
  try {
    const me = await getMyAccess();
    if (!uid || me.uid !== uid || me.admin) return; // seul l'athlète publie SON résumé
    if (!force && lastPublished.uid === uid && Date.now() - lastPublished.at < 5 * 60 * 1000) return;
    const from = shift(-14);
    const to = shift(56);
    const map = await computeTrainingDays(uid, from, to);
    const days = {};
    Object.entries(map).forEach(([d, v]) => {
      days[d] = { sessions: v.sessions.map(({ id, title, type, min, time, done, rpe, rpeSrc }) => ({ id, title, type, min, time, done, rpe: rpe ?? null, rpeSrc: rpeSrc || "estime" })), match: v.match || null };
    });
    const json = JSON.stringify({ days, ref: map.ref || null });
    lastPublished = { uid, at: Date.now(), json: lastPublished.uid === uid ? lastPublished.json : "" };
    if (json === lastPublished.json) return; // rien de changé : pas d'écriture
    await setDoc(doc(db, "users", uid, "nutrition", "training"), { from, to, days, ref: map.ref || null, updatedAt: new Date().toISOString() });
    lastPublished.json = json;
  } catch (e) {
    console.warn("trainingDays: publication du résumé", e);
  }
}

export async function loadTrainingDays(uid, from, to) {
  if (!uid) return {};
  const me = await getMyAccess();
  const live = await computeTrainingDays(uid, from, to);
  if (me.uid === uid) {
    if (!me.admin) publishTrainingSummary(uid); // tient à jour le résumé lu par le(s) coach(s)
    return live;
  }
  // coach (ou superadmin) qui regarde un athlète : + séances des autres coachs, via le résumé de l'athlète
  try {
    const snap = await getDoc(doc(db, "users", uid, "nutrition", "training"));
    const data = snap.exists() ? snap.data() : {};
    const pub = data.days || {};
    if (data.ref) live.ref = data.ref; // charge habituelle calculée chez l'athlète (toutes ses séances)
    Object.entries(pub).forEach(([d, v]) => {
      if (d < from || d > to) return;
      const slot = (live[d] = live[d] || { sessions: [], match: null, minutes: 0 });
      const ids = new Set(slot.sessions.map((x) => x.id));
      (v.sessions || []).forEach((x) => !ids.has(x.id) && slot.sessions.push(x));
      if (!slot.match && v.match) slot.match = v.match;
    });
  } catch (e) {
    /* pas de résumé ou lecture refusée : on garde ce que le coach voit */
  }
  return finalize(live, live.ref || null);
}

/* Type « auto » d'un jour : séance(s) / match, sinon repos */
export const autoDayType = (map, date) => (map && map[date] ? map[date].dayType : "repos");
