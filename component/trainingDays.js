import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { getWorkoutDocs, getScopedDocs, getMyAccess } from "./workoutQueries";
import { groupTargetMatches, hasProgress } from "./groupHistory";

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

/* Type de journée d'après les séances du jour (et un éventuel match) */
export function dayTypeOf(info) {
  if (!info) return "repos";
  if (info.match) return "match";
  const n = info.sessions.length;
  if (!n) return "repos";
  const min = info.minutes;
  if (n >= 2 || min >= 100) return "intense";
  if (min <= 40) return "leger";
  return "modere";
}
export function whyOf(info) {
  if (!info) return "pas de séance prévue";
  if (info.match) return `${info.match.name}`;
  if (!info.sessions.length) return "pas de séance prévue";
  const s = info.sessions;
  return s.length === 1
    ? `${s[0].title || TYPE_LABEL[s[0].type] || "Séance"} · ~${s[0].min} min${s[0].time ? ` à ${s[0].time}` : ""}`
    : `${s.length} séances · ~${info.minutes} min au total`;
}

async function computeTrainingDays(uid, from, to) {
  if (!uid) return {};
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

  // ---- séances ----
  try {
    const snap = await getWorkoutDocs({ since: from });
    snap.docs.forEach((d) => {
      const w = { id: d.id, ...d.data() };
      if (!w.date || w.date < from || w.date > to) return;
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
      const min = durationOf(w, uid);
      const s = slot(w.date);
      s.sessions.push({ id: w.id, title: w.title || "", type: w.type || "muscu", min, time: w.time || "", done: !!w.userProgress?.[uid]?.completedAt });
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

  return finalize(out);
}

function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const finalize = (out) => {
  Object.values(out).forEach((v) => {
    v.minutes = v.sessions.reduce((a, x) => a + (Number(x.min) || 0), 0);
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
      days[d] = { sessions: v.sessions.map(({ id, title, type, min, time, done }) => ({ id, title, type, min, time, done })), match: v.match || null };
    });
    const json = JSON.stringify(days);
    lastPublished = { uid, at: Date.now(), json: lastPublished.uid === uid ? lastPublished.json : "" };
    if (json === lastPublished.json) return; // rien de changé : pas d'écriture
    await setDoc(doc(db, "users", uid, "nutrition", "training"), { from, to, days, updatedAt: new Date().toISOString() });
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
    const pub = snap.exists() ? snap.data().days || {} : {};
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
  return finalize(live);
}

/* Type « auto » d'un jour : séance(s) / match, sinon repos */
export const autoDayType = (map, date) => (map && map[date] ? map[date].dayType : "repos");
