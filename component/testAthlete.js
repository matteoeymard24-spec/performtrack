/* =====================================================================
   testAthlete.js — « 🧪 Athlète test » : un faux athlète du superadmin, rempli avec ~4 mois de données
   cohérentes pour voir le rendu complet de l'app (Paramètres › Seuils › Athlète test).

   Scénario (dates relatives à aujourd'hui, J0) :
   • J-112 → J-31 : 3 séances / semaine (force bas, force haut, sprint), progression avec semaines de
     décharge, puis une semaine en forte hausse juste avant la blessure (J-37 → J-31).
   • J-100 : 1re lésion des ischios (14 j d'arrêt). J-30 : nouvelle lésion des ischios en sprint
     → récidive précoce. Une semaine sans séance, puis réathlé individuelle qui remonte.
   • Retour au jeu à l'étape 4 (terrain), avec historique daté, critères cochés et tests de retour.
   • Wellness presque tous les jours (fatigue qui monte avec la charge, douleur de la zone qui décroît).
   • RM avec historique : bas du corps recalé après la blessure puis en remontée, RDL pas retesté, haut du
     corps stable ; CMJ, VMA, poids hebdomadaire. 3 séances à venir.
   Tout porte isTest / testOf : « Supprimer » enlève exactement ces documents.
   ===================================================================== */
import { collection, doc, getDocs, query, where, writeBatch, Timestamp, deleteDoc } from "firebase/firestore";
import { removeUserFromGroups } from "./injuredGroup";

export const testAthleteId = (coachUid) => `test_${coachUid}`;

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoTs = (offset, h = 18) => `${isoDay(offset)}T${pad(h)}:00:00.000Z`;
const dow = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getDay(); // 0 dimanche … 6 samedi
};

/* aléatoire reproductible (même athlète à chaque régénération) */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ex = (name, series, reps, pct, extra = {}) => ({ name, series, reps, rmPercent: pct, restMin: 2, ...extra });
const TEMPLATES = {
  bas: { title: "Force bas du corps", type: "muscu", dur: 70, blocks: [{ name: "Force", exercises: [ex("Squat", 4, 5, 80), ex("Soulevé de terre roumain", 3, 6, 75), ex("Hip thrust", 3, 8, 75)] }] },
  haut: { title: "Force haut du corps", type: "muscu", dur: 65, blocks: [{ name: "Force", exercises: [ex("Développé couché", 4, 5, 80), ex("Tractions lestées", 4, 5, 80), ex("Développé militaire", 3, 6, 75)] }] },
  sprint: { title: "Vitesse & appuis", type: "sprint", dur: 55, blocks: [{ name: "Sprint", exercises: [ex("Sprint 30 m", 6, 1, "PDC"), ex("Changements de direction", 4, 3, "PDC")] }] },
  reath1: { title: "Réathlé ischios : isométrie & mobilité", type: "muscu", dur: 45, blocks: [{ name: "Réathlé", exercises: [ex("Pont fessier isométrique", 4, 1, "PDC"), ex("Squat goblet", 3, 10, "PDC")] }] },
  reath2: { title: "Réathlé ischios : force & course", type: "muscu", dur: 55, blocks: [{ name: "Réathlé", exercises: [ex("Squat", 4, 6, 70), ex("Hip thrust", 3, 8, 70), ex("Nordic curl assisté", 3, 5, "PDC")] }] },
  reath3: { title: "Réathlé terrain : vitesse progressive", type: "sprint", dur: 50, blocks: [{ name: "Terrain", exercises: [ex("Course progressive 60 m", 6, 1, "PDC"), ex("Appuis prévus puis réactifs", 4, 3, "PDC")] }] },
};

const INJURY_DAY = -30;
const OLD_INJURY_DAY = -100;

/* Planning des séances : [offset, modèle, RPE prévu, RPE ressenti | null (non faite), durée réelle] */
function sessionsPlan(r) {
  const out = [];
  for (let d = -112; d <= 5; d++) {
    const wd = dow(d);
    const week = Math.floor((d + 112) / 7); // 0 … 16
    if (d > INJURY_DAY - 1 && d < INJURY_DAY + 7) continue; // semaine d'arrêt après la blessure
    if (d >= OLD_INJURY_DAY && d < OLD_INJURY_DAY + 10) continue; // 1re blessure
    let tpl = null;
    if (d < INJURY_DAY) tpl = wd === 1 ? "bas" : wd === 3 ? "haut" : wd === 5 ? "sprint" : null;
    else tpl = wd === 1 || wd === 4 ? (d < -16 ? "reath1" : "reath2") : wd === 6 ? (d < -9 ? "reath1" : "reath3") : null;
    if (!tpl) continue;
    const deload = week === 3 || week === 7 || week === 11;
    const spike = d >= INJURY_DAY - 7 && d < INJURY_DAY; // semaine en forte hausse
    let planned = TEMPLATES[tpl].type === "sprint" ? 7 : 7;
    if (deload) planned = 5;
    if (tpl.startsWith("reath")) planned = tpl === "reath1" ? 4 : 5;
    const future = d > 0;
    const skip = !future && r() < 0.08; // ~8 % de séances non faites
    let felt = null;
    let dur = TEMPLATES[tpl].dur;
    if (!future && !skip) {
      felt = Math.max(3, Math.min(10, Math.round(planned + (r() - 0.45) * 2)));
      if (spike) {
        felt = Math.min(10, felt + 2);
        dur = Math.round(dur * 1.35);
      }
      dur = Math.round(dur * (0.9 + r() * 0.2));
    }
    out.push({ d, tpl, planned, felt, dur, spike });
    if (spike && wd === 3) out.push({ d, tpl: "sprint", planned: 7, felt: 8, dur: 50, spike: true }); // séance en plus
  }
  return out;
}

/* Historique RM : [offset, kg] ; injuryAdjust marque le recalage après la blessure */
const RM_PLAN = [
  { name: "Squat", category: "bas_corps", pts: [[-110, 132.5], [-80, 140], [-52, 147.5], [-36, 150], [-20, 120, "adj"], [-12, 128], [-4, 135]] },
  { name: "Soulevé de terre roumain", category: "bas_corps", pts: [[-108, 140], [-78, 150], [-45, 160]] },
  { name: "Hip thrust", category: "bas_corps", pts: [[-106, 160], [-70, 172.5], [-40, 180], [-20, 145, "adj"], [-6, 162.5]] },
  { name: "Développé couché", category: "haut_pousse", pts: [[-109, 95], [-75, 97.5], [-44, 100], [-15, 102.5]] },
  { name: "Tractions lestées", category: "haut_tirage", pts: [[-104, 112], [-66, 114.5], [-30, 117]] }, // charge totale (poids de corps + lest)
  { name: "Développé militaire", category: "haut_pousse", pts: [[-102, 60], [-60, 62.5], [-18, 65]] },
];

export async function createTestAthlete({ db, coachUid }) {
  await deleteTestAthlete({ db, coachUid }); // on repart de zéro
  const uid = testAthleteId(coachUid);
  const r = rng(424242);
  const ops = [];
  const put = (ref, data) => ops.push({ ref, data });
  const nowTs = Timestamp.now();

  put(doc(db, "users", uid), {
    firstName: "Test",
    lastName: "Démo 🧪",
    email: "",
    role: "athlete",
    status: "approved",
    isTest: true,
    sport: "rugby",
    position: "PILIER",
    level: "federale3",
    weight: 92,
    height: 183,
    coachId: coachUid,
    coachIds: [coachUid],
    createdAt: nowTs,
  });

  // séances (+ quelques remarques dans la messagerie de séance, component/sessionChat.jsx)
  const plan = sessionsPlan(r);
  const doneIdx = plan.map((s, i) => (s.felt != null ? i : -1)).filter((i) => i >= 0);
  const CHAT = {
    [doneIdx[doneIdx.length - 1]]: [
      { from: "athlete", text: "Ischios un peu tendus sur les dernières accélérations, rien de douloureux (2/10).", h: 19 },
    ],
    [doneIdx[doneIdx.length - 2]]: [
      { from: "athlete", text: "RDL facile aujourd'hui, je pourrais monter la charge ?", h: 19 },
      { from: "coach", text: "Oui : +5 kg à la prochaine si la douleur reste ≤ 2/10 le lendemain.", h: 21 },
    ],
    [doneIdx[doneIdx.length - 4]]: [{ from: "athlete", text: "Grosse fatigue, mauvaise nuit. J'ai écourté la dernière série.", h: 20 }],
  };
  plan.forEach((s, i) => {
    const T = TEMPLATES[s.tpl];
    const done = s.felt != null;
    put(doc(db, "workout", `test_${coachUid}_${i}`), {
      title: T.title + (s.spike ? " (+)" : ""),
      date: isoDay(s.d),
      group: "individuel",
      targetUserId: uid,
      createdBy: coachUid,
      type: T.type,
      estimatedDuration: T.dur,
      plannedRpe: s.planned,
      blocks: T.blocks,
      testOf: uid,
      createdAt: nowTs,
      userProgress: done
        ? {
            [uid]: {
              completedAt: isoTs(s.d),
              doneDate: isoDay(s.d),
              sessionRpe: s.felt,
              sessionDuration: s.dur,
              ...(CHAT[i] ? { msgs: CHAT[i].map((m) => ({ from: m.from, by: m.from === "coach" ? coachUid : uid, text: m.text, at: isoTs(s.d, m.h) })) } : {}),
            },
          }
        : {},
    });
  });

  // wellness (≈ 88 % des jours)
  for (let d = -112; d <= 0; d++) {
    if (d !== 0 && r() < 0.12) continue;
    const sinceInj = d - INJURY_DAY;
    const spike = d >= INJURY_DAY - 7 && d < INJURY_DAY;
    let fatigue = 3 + Math.round(r() * 2) + (spike ? 3 : 0);
    let sommeil = 7 + Math.round((r() - 0.5) * 2) - (spike ? 2 : 0);
    let stress = 3 + Math.round(r() * 2);
    let motivation = 7 + Math.round((r() - 0.3) * 2) - (sinceInj >= 0 && sinceInj < 10 ? 2 : 0);
    const painMap = {};
    const painTypes = {};
    if (sinceInj >= 0) {
      const v = Math.max(1, Math.round(7 - sinceInj * 0.2 + (r() - 0.5)));
      painMap.ischio_d = Math.min(9, v);
      painTypes.ischio_d = sinceInj < 7 ? "aigue" : "contracture";
    } else if (d >= OLD_INJURY_DAY && d < OLD_INJURY_DAY + 12) {
      painMap.ischio_d = Math.max(1, 6 - Math.round((d - OLD_INJURY_DAY) / 2));
      painTypes.ischio_d = "aigue";
    } else if (r() < 0.15) {
      painMap.quadri_g = 2 + Math.round(r() * 2);
      painTypes.quadri_g = "courbature";
    }
    const douleur = Math.max(0, ...Object.values(painMap));
    put(doc(db, "wellness", `${uid}_${isoDay(d)}`), {
      userId: uid,
      date: isoDay(d),
      fatigue: Math.min(10, fatigue),
      stress: Math.min(10, stress),
      douleur,
      nutrition: 6 + Math.round(r() * 2),
      hydratation: 6 + Math.round(r() * 2),
      sommeil: Math.max(1, Math.min(10, sommeil)),
      motivation: Math.max(1, Math.min(10, motivation)),
      sick: false,
      sickType: "",
      painMap,
      painTypes,
      objective: { sleepMin: 420 + Math.round((r() - 0.5) * 80) - (spike ? 50 : 0), sleepScore: null, waterPct: 70 + Math.round(r() * 30), hydrationScore: null, kcalPct: 85 + Math.round(r() * 25), protPct: 80 + Math.round(r() * 30), nutritionScore: null },
      testOf: uid,
      updatedAt: nowTs,
    });
  }

  // blessures (la 2e est une récidive précoce de la 1re)
  put(doc(db, "injuries", `${uid}_old`), {
    userId: uid,
    date: isoDay(OLD_INJURY_DAY),
    name: "Lésion ischio-jambiers grade 1",
    zone: "Ischio droit",
    tissueType: "muscle",
    mechanism: "sprint",
    daysLost: 14,
    lostValue: 2,
    lostUnit: "sem",
    notes: "Ressentie en fin de séance de vitesse.",
    testOf: uid,
    createdAt: nowTs,
  });
  put(doc(db, "injuries", `${uid}_cur`), {
    userId: uid,
    date: isoDay(INJURY_DAY),
    name: "Lésion ischio-jambiers grade 1",
    zone: "Ischio droit",
    tissueType: "muscle",
    mechanism: "sprint",
    daysLost: 35,
    lostValue: 5,
    lostUnit: "sem",
    notes: "Sprint en fin de semaine très chargée.",
    testOf: uid,
    createdAt: nowTs,
    rtp: {
      v: 2,
      stage: 4,
      checks: { s1a: true, s1b: true, s1c: true, s2a: true, s2b: true, m2: true, s3a: true, m3: true },
      history: [
        { stage: 2, date: isoDay(INJURY_DAY + 6) },
        { stage: 3, date: isoDay(INJURY_DAY + 13) },
        { stage: 4, date: isoDay(INJURY_DAY + 22) },
      ],
      tests: {
        force: { inj: 88, ref: 100, date: isoDay(-3) },
        speed: { inj: 28.5, ref: 31, date: isoDay(-2) },
      },
      updatedAt: isoTs(-2),
    },
  });

  // RM (+ CMJ, VMA)
  RM_PLAN.forEach((rm) => {
    const history = rm.pts.map(([d, kg, adj]) => ({ date: isoTs(d, 12), kg, autoAdjusted: !adj, ...(adj ? { injuryAdjust: `${uid}_cur` } : {}) }));
    const last = history[history.length - 1];
    // même identifiant que normalizeExerciseName (Workout.jsx) : minuscules, sans accents
    const rmId = rm.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    put(doc(db, "users", uid, "rm", rmId), {
      exerciseName: rm.name,
      kg: last.kg,
      category: rm.category,
      updatedAt: last.date,
      autoAdjusted: last.autoAdjusted,
      estimated: false,
      history,
      testOf: uid,
    });
  });
  put(doc(db, "users", uid, "rm", "CMJ"), {
    exerciseName: "CMJ",
    kg: 41,
    updatedAt: isoTs(-3, 12),
    history: [[-105, 42], [-75, 44], [-45, 45.5], [-20, 38], [-3, 41]].map(([d, kg]) => ({ date: isoTs(d, 12), kg })),
    testOf: uid,
  });
  put(doc(db, "users", uid, "rm", "VMA"), {
    exerciseName: "VMA",
    kg: 16.5,
    updatedAt: isoTs(-60, 12),
    history: [[-110, 16], [-60, 16.5]].map(([d, kg]) => ({ date: isoTs(d, 12), kg })),
    testOf: uid,
  });
  for (let d = -112; d <= 0; d += 7) {
    put(doc(db, "users", uid, "weight_history", isoDay(d)), { weight: Math.round((92 + (r() - 0.5) * 1.2 - (d > INJURY_DAY ? 0.8 : 0)) * 10) / 10, date: isoDay(d), testOf: uid });
  }

  // écriture par lots de 400
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((o) => b.set(o.ref, o.data));
    await b.commit();
  }
  return { uid, docs: ops.length };
}

export async function deleteTestAthlete({ db, coachUid }) {
  const uid = testAthleteId(coachUid);
  const refs = [];
  const add = (snap) => snap.docs.forEach((d) => refs.push(d.ref));
  add(await getDocs(query(collection(db, "workout"), where("testOf", "==", uid))));
  add(await getDocs(query(collection(db, "wellness"), where("userId", "==", uid))));
  add(await getDocs(query(collection(db, "injuries"), where("userId", "==", uid))));
  for (const sub of ["rm", "weight_history", "tests", "nutrition", "config"]) {
    try {
      add(await getDocs(collection(db, "users", uid, sub)));
    } catch (e) {
      /* sous-collection absente */
    }
  }
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => b.delete(ref));
    await b.commit();
  }
  // le retirer des groupes (dont le groupe « Blessés ») : sinon il y resterait comme membre fantôme
  await removeUserFromGroups(db, uid);
  await deleteDoc(doc(db, "users", uid)).catch(() => null);
  return refs.length;
}
