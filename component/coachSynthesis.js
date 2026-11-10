/* =====================================================================
   coachSynthesis.js — calculs de la fiche athlète (vue coach), sans Firebase ni affichage.

   • weeklyPlanVsDone : charge PRÉVUE (RPE prévu × durée prévue) et RÉALISÉE (sRPE) par semaine, pour UN athlète.
   • loadDynamics     : 7 derniers jours vs moyenne des 3 semaines d'avant, monotonie et contrainte (Foster 1998).
   • poleSynthesis    : un feu par pôle (charge / récupération / entraînement) + une décision proposée.
   • RTP_STAGES / rtp*: retour au jeu par étapes à critères (continuum d'Ardern et al. 2016).
   • relativeStrength : RM rapportés au poids de corps + note du barème rugby quand il existe.

   Les seuils viennent de ⚙️ Paramètres (section « Synthèse de la fiche athlète »).
   Le ratio aigu/chronique (REDI) n'est utilisé ici que comme DESCRIPTION de la dynamique de charge :
   seul, il ne prédit pas la blessure (Impellizzeri et al. 2020 ; Wang et al. 2020).
   Les règles de décision sont des repères de terrain, pas des seuils validés : la page Référence les détaille.
   ===================================================================== */
import { TH } from "./thresholdsCore";
import { sessionDurationMin, sessionLoad, doneDateOf } from "./sessionLoad";
import { baseRpe } from "./rpePredict";
import { monotonyStrain, resumeInfo } from "./loadMetrics";
import { zoneLabel, PAIN_TYPES } from "./BodyScan";
import { mondayOf } from "./cycles";
import { injuryStatus } from "./InjuryHistory";
import { STRENGTH_NORMS, findRM, evaluateStrength, hasNorms } from "./norms";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return iso(new Date(y, m - 1, d + n));
};
const r1 = (x) => Math.round(x * 10) / 10;
const fr = (x) => String(x).replace(".", ",");
const done = (w, uid) => !!w?.userProgress?.[uid]?.completedAt;

/* ---------------------------------------------------------------------
   Prévu / réalisé par semaine (lundi → dimanche), n dernières semaines, la plus récente en dernier.
   Prévu : séances datées dans la semaine (RPE prévu par le coach, sinon RPE automatique) × durée prévue.
   Réalisé : séances terminées, rangées dans la semaine où elles ont VRAIMENT été faites.
   Semaine en cours : « prévu à ce jour » (dueLoad) sert au % réalisé pour ne pas pénaliser le reste de la semaine.
   --------------------------------------------------------------------- */
export function weeklyPlanVsDone(workouts, uid, today, nWeeks = 6) {
  const thisMon = mondayOf(today);
  const weeks = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const start = addDays(thisMon, -7 * i);
    weeks.push({
      start,
      end: addDays(start, 6),
      current: i === 0,
      plannedSessions: 0,
      plannedMin: 0,
      plannedLoad: 0,
      plannedUnknown: 0,
      dueSessions: 0,
      dueLoad: 0,
      doneSessions: 0,
      doneMin: 0,
      doneLoad: 0,
      doneNoRpe: 0,
    });
  }
  const byStart = Object.fromEntries(weeks.map((w) => [w.start, w]));
  (workouts || []).forEach((w) => {
    if (w.date) {
      const wk = byStart[mondayOf(w.date)];
      if (wk) {
        const dur = Number(w.estimatedDuration) > 0 ? Number(w.estimatedDuration) : 60;
        const b = baseRpe(w);
        wk.plannedSessions += 1;
        wk.plannedMin += dur;
        if (b) wk.plannedLoad += b.rpe * dur;
        else wk.plannedUnknown += 1;
        // « due » = séance dont la date est passée, ou déjà faite en avance
        if (w.date <= today || done(w, uid)) {
          wk.dueSessions += 1;
          if (b) wk.dueLoad += b.rpe * dur;
        }
      }
    }
    if (done(w, uid)) {
      const wk = byStart[mondayOf(doneDateOf(w, uid))];
      if (wk) {
        const load = sessionLoad(w, uid);
        wk.doneSessions += 1;
        wk.doneMin += sessionDurationMin(w, uid);
        if (load > 0) wk.doneLoad += load;
        else wk.doneNoRpe += 1;
      }
    }
  });
  weeks.forEach((w) => {
    w.plannedLoad = Math.round(w.plannedLoad);
    w.dueLoad = Math.round(w.dueLoad);
    w.doneLoad = Math.round(w.doneLoad);
    w.plannedMin = Math.round(w.plannedMin);
    w.doneMin = Math.round(w.doneMin);
    const refLoad = w.current ? w.dueLoad : w.plannedLoad;
    const refSessions = w.current ? w.dueSessions : w.plannedSessions;
    w.loadPct = refLoad > 0 ? Math.round((w.doneLoad / refLoad) * 100) : null; // réalisé / prévu (charge)
    w.sessionPct = refSessions > 0 ? Math.round((Math.min(w.doneSessions, refSessions) / refSessions) * 100) : null; // séances faites / prévues
  });
  return weeks;
}

/* Charge par jour { date, load } → somme sur une fenêtre de n jours finissant à `end` (inclus) */
const sumWindow = (dailyLoads, end, n) => {
  const from = addDays(end, -(n - 1));
  return (dailyLoads || []).reduce((s, e) => (e.date >= from && e.date <= end ? s + (Number(e.load) || 0) : s), 0);
};

/* ---------------------------------------------------------------------
   Dynamique de charge : 7 derniers jours vs moyenne hebdo des 3 semaines d'avant (prev7, semaines vides
   exclues), monotonie, contrainte, REDI (descriptif), reprise après coupure (resumed, restDays).
   --------------------------------------------------------------------- */
export function loadDynamics(dailyLoads, today, redi = null) {
  const last7 = Math.round(sumWindow(dailyLoads, today, 7));
  // référence = moyenne des 3 semaines d'avant (jours 8 à 28), SANS les semaines vides : une coupure
  // (vacances, maladie) ne doit pas faire croire que sa charge habituelle est plus basse
  const prevWeeks = [7, 14, 21].map((k) => sumWindow(dailyLoads, addDays(today, -k), 7));
  const trained = prevWeeks.filter((x) => x > 0);
  const prev7 = trained.length ? Math.round(trained.reduce((a, b) => a + b, 0) / trained.length) : 0;
  const resume = resumeInfo(dailyLoads || [], today);
  const last28 = Math.round(sumWindow(dailyLoads, today, 28));
  const changePct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const ms = monotonyStrain(dailyLoads || [], today);
  // contrainte habituelle : moyenne des 4 semaines précédentes (fenêtres qui ne se chevauchent pas)
  const prevStrains = [7, 14, 21, 28].map((k) => monotonyStrain(dailyLoads || [], addDays(today, -k)).strain).filter((x) => x != null && x > 0);
  const strainRef = prevStrains.length >= 2 ? Math.round(prevStrains.reduce((a, b) => a + b, 0) / prevStrains.length) : null;
  return {
    last7,
    prev7,
    last28,
    changePct,
    monotony: ms.monotony,
    strain: ms.strain,
    strainRef,
    strainPct: strainRef && ms.strain != null ? Math.round((ms.strain / strainRef) * 100) : null,
    redi: redi === null || redi === undefined || redi === "" ? null : Number(redi),
    resumed: resume.resumed,
    restDays: resume.restDays,
    hasData: last28 > 0,
  };
}

/* ---------------------------------------------------------------------
   Retour au jeu : 5 étapes, chacune validée par des critères (pas par un délai).
   auto: "loadPartial" | "loadFull" = critère calculé avec la charge réalisée (voir rtpLoadCheck).
   --------------------------------------------------------------------- */
export const RTP_STAGES = [
  {
    id: 1,
    short: "Soins",
    icon: "🧊",
    label: "Protection & soins",
    goal: "Calmer la zone, garder le reste du corps en activité.",
    criteria: [
      { id: "1a", t: "Douleur au repos ≤ 2/10" },
      { id: "1b", t: "Gonflement / inflammation contrôlés" },
      { id: "1c", t: "Diagnostic posé et consignes du médecin ou du kiné connues" },
    ],
  },
  {
    id: 2,
    short: "Réathlé",
    icon: "🧘",
    label: "Réathlétisation sans impact",
    goal: "Retrouver l'amplitude et remettre de la force sans douleur.",
    criteria: [
      { id: "2a", t: "Amplitude complète et indolore" },
      { id: "2b", t: "Marche et gestes du quotidien normaux" },
      { id: "2c", t: "Renforcement isométrique puis dynamique sans douleur (≤ 2/10)" },
    ],
  },
  {
    id: 3,
    short: "Course",
    icon: "🏃",
    label: "Course & renforcement",
    goal: "Réintroduire la course en ligne et les charges.",
    criteria: [
      { id: "3a", t: "Course en ligne à allure modérée sans douleur, pendant et le lendemain" },
      { id: "3b", t: "Force de la zone ≥ 80 % du côté sain (ou du RM d'avant blessure)" },
      { id: "3c", t: "Sauts et réceptions bilatéraux sans appréhension" },
    ],
  },
  {
    id: 4,
    short: "Spécifique",
    icon: "⚡",
    label: "Entraînement spécifique sans contact",
    goal: "Vitesse, changements de direction, gestes du poste.",
    criteria: [
      { id: "4a", t: "Sprints et changements de direction à 90-100 % sans douleur" },
      { id: "4b", t: "Force de la zone ≥ 90 % du côté sain (ou du RM d'avant blessure)" },
      { id: "4c", t: "Charge de la semaine ≥ {p} % de sa charge habituelle", auto: "loadPartial" },
    ],
  },
  {
    id: 5,
    short: "Complet",
    icon: "🤼",
    label: "Entraînement complet",
    goal: "Reprise du collectif, contact compris.",
    criteria: [
      { id: "5a", t: "Une semaine d'entraînement complet sans réaction de la zone" },
      { id: "5b", t: "Charge de la semaine ≥ {p} % de sa charge habituelle", auto: "loadFull" },
      { id: "5c", t: "Feu vert du médecin ou du kiné, et l'athlète se sent prêt" },
    ],
  },
];

/* Charge hebdo habituelle = moyenne des 4 semaines qui précèdent la blessure ; actuelle = 7 derniers jours */
export function rtpLoadCheck(dailyLoads, injuryDate, today) {
  if (!injuryDate) return { usual: null, current: 0, pct: null };
  const before = addDays(injuryDate, -1);
  const usual = Math.round(sumWindow(dailyLoads, before, 28) / 4);
  const current = Math.round(sumWindow(dailyLoads, today, 7));
  return { usual: usual > 0 ? usual : null, current, pct: usual > 0 ? Math.round((current / usual) * 100) : null };
}

/* État du protocole pour une blessure : étape en cours (1-5), 6 = retour compétition validé */
export function rtpState(inj, dailyLoads, today) {
  const rtp = inj?.rtp || {};
  const checks = rtp.checks || {};
  const load = rtpLoadCheck(dailyLoads, inj?.date, today);
  const autoOk = (kind) => (load.pct == null ? null : load.pct >= TH(kind === "loadFull" ? "rtpLoadFull" : "rtpLoadPartial"));
  const stages = RTP_STAGES.map((st) => {
    const criteria = st.criteria.map((c) => {
      if (c.auto) {
        const p = TH(c.auto === "loadFull" ? "rtpLoadFull" : "rtpLoadPartial");
        const ok = autoOk(c.auto);
        // sans charge de référence (pas d'historique avant la blessure) : le coach coche à la main
        return { ...c, t: c.t.replace("{p}", p), auto: ok !== null, ok: ok !== null ? ok : !!checks[c.id] };
      }
      return { ...c, ok: !!checks[c.id] };
    });
    return { ...st, criteria, complete: criteria.every((c) => c.ok) };
  });
  const stage = Math.max(1, Math.min(6, Number(rtp.stage) || 1));
  return { stages, stage, cleared: stage >= 6, load, started: !!inj?.rtp, updatedAt: rtp.updatedAt || null };
}

/* Blessure qui demande un suivi : en cours, ou reprise récente dont le protocole n'est pas terminé */
export function activeInjury(injuries, today) {
  const list = (injuries || [])
    .map((inj) => ({ inj, st: injuryStatus(inj, today) }))
    .filter(({ inj, st }) => st.key === "ongoing" || (inj.rtp && Number(inj.rtp.stage) < 6 && st.key !== "healed") || (st.key === "recent" && !(inj.rtp && Number(inj.rtp.stage) >= 6)));
  list.sort((a, b) => (b.inj.date || "").localeCompare(a.inj.date || ""));
  return list[0] || null;
}

/* ---------------------------------------------------------------------
   Force relative : meilleur RM de chaque mouvement de référence ÷ poids de corps,
   + note /20 du barème rugby quand le sport / poste / niveau de l'athlète en ont un.
   rmDocs : [{ name, kg }]
   --------------------------------------------------------------------- */
export function relativeStrength(rmDocs, bodyWeight, sport, poste, level) {
  const bw = Number(bodyWeight) > 0 ? Number(bodyWeight) : null;
  const normed = hasNorms(sport, poste) ? evaluateStrength(rmDocs, sport, poste, level) : [];
  const byLabel = Object.fromEntries(normed.map((r) => [r.label, r]));
  const rows = STRENGTH_NORMS.map((spec) => {
    const rm = findRM(rmDocs, spec);
    if (!rm) return null;
    const n = byLabel[spec.label];
    return {
      label: spec.label,
      matched: rm.name,
      kg: rm.kg,
      ratio: bw ? Math.round((rm.kg / bw) * 100) / 100 : null,
      note: n && n.note != null ? n.note : null,
      next: n && n.tNext ? n.tNext : null,
      refLabel: n ? n.refLabel : null,
    };
  }).filter(Boolean);
  const noted = rows.filter((r) => r.note != null);
  const weakest = noted.length >= 2 ? noted.reduce((a, b) => (b.note < a.note ? b : a)) : null;
  const strongest = noted.length >= 2 ? noted.reduce((a, b) => (b.note > a.note ? b : a)) : null;
  return { rows, bw, hasNorms: normed.length > 0, weakest, strongest: strongest && weakest && strongest.label !== weakest.label ? strongest : null };
}

/* Progression des RM : pour chaque exercice suivi, meilleur RM des `weeks` dernières semaines vs avant.
   rmHistory : { nom: [{ kg, date }] } */
export function rmTrend(rmHistory, today, weeks) {
  const cut = addDays(today, -7 * weeks);
  const dayOf = (d) => {
    if (!d) return "";
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const dt = typeof d?.toDate === "function" ? d.toDate() : new Date(d);
    return isNaN(dt.getTime()) ? "" : iso(dt);
  };
  let up = 0;
  let flat = 0;
  let stale = 0;
  const names = [];
  Object.entries(rmHistory || {}).forEach(([name, pts]) => {
    const p = (pts || []).map((x) => ({ kg: Number(x.kg), d: dayOf(x.date) })).filter((x) => x.kg > 0 && x.d);
    if (p.length < 2) return;
    const recent = p.filter((x) => x.d >= cut);
    const old = p.filter((x) => x.d < cut);
    if (!old.length) return; // exercice trop récent pour juger
    if (!recent.length) {
      stale += 1;
      return;
    }
    const bestOld = Math.max(...old.map((x) => x.kg));
    const bestRecent = Math.max(...recent.map((x) => x.kg));
    if (bestRecent > bestOld) {
      up += 1;
      names.push(name);
    } else flat += 1;
  });
  return { up, flat, stale, tracked: up + flat + stale, upNames: names };
}

/* ---------------------------------------------------------------------
   Douleurs du jour (wellness : schéma corporel painMap { zone: 0-10 } + painTypes { zone: type }).
   level : "none" | "info" (courbatures) | "watch" | "alert". onInjury = douleur sur la zone blessée.
   --------------------------------------------------------------------- */
const SHARP = ["aigue", "nerveuse", "articulaire"];
const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
const TYPE_LABEL = Object.fromEntries(PAIN_TYPES.map((t) => [t.key, t.label.toLowerCase()]));
export function painSummary(wellness, injury) {
  if (!wellness) return { level: "none", zones: [], max: 0, filled: false };
  const map = wellness.painMap || {};
  const types = wellness.painTypes || {};
  const zones = Object.entries(map)
    .map(([id, v]) => ({ id, v: Number(v) || 0, type: types[id] || null, label: zoneLabel(id) }))
    .filter((z) => z.v > 0)
    .sort((a, b) => b.v - a.v);
  const watch = TH("synthPainWatch");
  const alert = TH("synthPainAlert");
  const max = zones.length ? zones[0].v : 0;
  // zone blessée : un mot de 4 lettres ou plus en commun entre la zone du schéma et la blessure (nom + zone)
  const injWords = injury ? norm(`${injury.name || ""} ${injury.zone || ""}`).split(" ").filter((w) => w.length >= 4) : [];
  const onInjury = zones.find((z) => z.v >= 3 && norm(z.label).split(" ").some((w) => w.length >= 4 && injWords.some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) || null;
  const real = zones.filter((z) => z.v >= watch && !(z.type === "courbature" && z.v < alert)); // hors simples courbatures
  const sharp = real.find((z) => SHARP.includes(z.type)) || null;
  let level = "none";
  if (max >= alert || sharp) level = "alert";
  else if (real.length) level = "watch";
  else if (zones.some((z) => z.v >= watch)) level = "info";
  // pas de schéma rempli mais douleur globale forte déclarée
  const global = Number(wellness.douleur) || 0;
  if (!zones.length && global >= alert) level = "watch";
  const top = (sharp || real[0] || zones[0]) ?? null;
  return { level, zones, max, top, sharp, onInjury, global, filled: true, typeLabel: top && top.type ? TYPE_LABEL[top.type] : null };
}

/* ---------------------------------------------------------------------
   Synthèse : un feu par pôle + une décision.
   level : "ok" | "watch" | "alert" | "under" (sous-charge) | "nodata"
   --------------------------------------------------------------------- */
export const SYNTH_LEVELS = {
  ok: { label: "OK", color: "#4fae7d", icon: "🟢" },
  watch: { label: "Vigilance", color: "#d9a441", icon: "🟠" },
  alert: { label: "Alerte", color: "#d9695a", icon: "🔴" },
  under: { label: "Sous-charge", color: "#5b9bd5", icon: "🔵" },
  nodata: { label: "Pas de donnée", color: "#a8a199", icon: "⚪" },
};

export function poleSynthesis({ dyn, weeks, form, wellnessScore, wellnessFilled, injury, rtp, trend, strength, pain = null }) {
  /* ----- Charge ----- */
  const charge = { level: "nodata", reasons: [] };
  const lastFull = (weeks || []).filter((w) => !w.current).slice(-1)[0] || null;
  const cur = (weeks || []).find((w) => w.current) || null;
  if (dyn && dyn.hasData) {
    const jump = dyn.changePct;
    const mono = dyn.monotony;
    const monoHigh = mono != null && mono >= TH("synthMonoHigh");
    const rediHigh = dyn.redi != null && dyn.redi > TH("rediHigh");
    const rediVery = dyn.redi != null && dyn.redi > TH("rediVeryHigh");
    const lowDone = lastFull && lastFull.loadPct != null && lastFull.loadPct < TH("synthComplianceLow");
    if (dyn.resumed) {
      // Reprise après coupure : on juge seulement si la reprise est trop rapide (vs sa charge habituelle hors coupure)
      const rest = dyn.restDays != null ? `${dyn.restDays} jours sans séance` : "une coupure";
      if (jump != null && jump >= TH("synthJumpWatch")) {
        charge.level = "watch";
        charge.reasons.push(`Reprise après ${rest} : déjà ${jump} % au-dessus de sa semaine habituelle (${dyn.prev7} → ${dyn.last7} UA). Reprise trop rapide`);
      } else {
        charge.level = "ok";
        charge.reasons.push(`Reprise après ${rest} : ${dyn.last7} UA sur 7 jours${dyn.prev7 ? `, pour ${dyn.prev7} UA d'habitude` : ""}`);
        charge.reasons.push("Le ratio de charge récente (REDI) n'est pas lu comme de la fatigue pendant une reprise");
      }
      charge.resumed = true;
    } else {
    if (jump != null && jump >= TH("synthJumpWatch")) charge.reasons.push(`Charge des 7 derniers jours en hausse de ${jump} % par rapport à ses 3 semaines d'avant (${dyn.prev7} → ${dyn.last7} UA)`);
    if (monoHigh) charge.reasons.push(`Monotonie élevée (${fr(mono)}) : les jours se ressemblent trop, il manque des jours faciles`);
    if (rediHigh) charge.reasons.push(`Charge récente au-dessus de son habitude (REDI ${fr(dyn.redi.toFixed(2))})`);
    if (jump != null && jump >= TH("synthJumpAlert")) charge.level = "alert";
    else if (jump != null && jump >= TH("synthJumpWatch") && (monoHigh || rediVery)) charge.level = "alert";
    else if ((jump != null && jump >= TH("synthJumpWatch")) || monoHigh || rediHigh) charge.level = "watch";
    else if ((jump != null && jump <= -TH("synthDropUnder")) || lowDone || (dyn.redi != null && dyn.redi < TH("rediUnder"))) {
      charge.level = "under";
      if (jump != null && jump <= -TH("synthDropUnder")) charge.reasons.push(`Charge des 7 derniers jours en baisse de ${Math.abs(jump)} % par rapport à ses 3 semaines d'avant (${dyn.prev7} → ${dyn.last7} UA)`);
      if (lowDone) charge.reasons.push(`Semaine dernière : ${lastFull.loadPct} % de la charge prévue réalisée`);
      if (!charge.reasons.length) charge.reasons.push(`Charge récente sous son habitude (REDI ${fr(dyn.redi.toFixed(2))})`);
    } else {
      charge.level = "ok";
      charge.reasons.push(jump != null ? `Charge stable (${jump >= 0 ? "+" : ""}${jump} % vs ses 3 semaines d'avant)${mono != null ? `, monotonie ${fr(mono)}` : ""}` : `${dyn.last7} UA sur les 7 derniers jours`);
    }
    }
    if (cur && cur.plannedSessions > cur.dueSessions) charge.reasons.push(`Encore ${cur.plannedSessions - cur.dueSessions} séance(s) prévue(s) cette semaine`);
  } else if (weeks && weeks.some((w) => w.plannedSessions > 0)) {
    charge.reasons.push("Des séances sont prévues, mais aucune séance terminée avec RPE sur 28 jours");
  } else charge.reasons.push("Aucune séance terminée avec RPE sur 28 jours");

  /* ----- Récupération ----- */
  const recup = { level: "nodata", reasons: [] };
  const dom = form?.domains || { wellness: 0, neural: 0 };
  const well = dom.wellness || 0;
  const neu = dom.neural || 0;
  const formKnown = form && form.level && form.level !== "nodata";
  if (formKnown || wellnessFilled) {
    if (well === 2 || neu === 2 || (well >= 1 && neu >= 1)) recup.level = "alert";
    else if (well === 1 || neu === 1 || form?.sick) recup.level = "watch";
    else recup.level = "ok";
    // on reprend les raisons de l'état de forme, sauf celles qui parlent de la charge (déjà dans le pôle charge)
    (form?.reasons || []).filter((t) => !/^Charge /.test(t)).slice(0, 3).forEach((t) => recup.reasons.push(t));
    if (!recup.reasons.length) recup.reasons.push(wellnessScore != null ? `Wellness du jour ${fr(r1(wellnessScore))}/10, dans sa norme` : "Aucun signal de fatigue");
    if (!wellnessFilled) recup.reasons.push("Wellness du jour non rempli : lecture basée sur les séances");
  } else recup.reasons.push("Pas de wellness aujourd'hui, pas de CMJ ni de séance de force récente");
  // Douleurs du jour (schéma corporel) : croisées avec la blessure et la charge
  if (pain && pain.filled && pain.level !== "none") {
    const where = pain.top ? `${pain.top.label} ${pain.top.v}/10${pain.typeLabel ? ` (${pain.typeLabel})` : ""}` : `douleur globale ${pain.global}/10`;
    if (pain.level === "info") recup.reasons.push(`Courbatures : ${where}`);
    else {
      recup.reasons.unshift(`Douleur du jour : ${where}${pain.zones.length > 1 ? ` + ${pain.zones.length - 1} autre${pain.zones.length > 2 ? "s" : ""} zone${pain.zones.length > 2 ? "s" : ""}` : ""}`);
      if (pain.level === "alert") recup.level = "alert";
      else if (recup.level === "ok" || recup.level === "nodata") recup.level = "watch";
    }
    if (pain.onInjury) recup.reasons.unshift(`Douleur sur la zone blessée (${pain.onInjury.label} ${pain.onInjury.v}/10) : ne pas passer à l'étape suivante du retour au jeu`);
  }
  if (injury) {
    const stg = rtp && !rtp.cleared ? ` · retour au jeu : étape ${rtp.stage}/5` : "";
    recup.reasons.unshift(`Blessure ${injury.st.key === "ongoing" ? "en cours" : "récente"} : ${injury.inj.name || injury.inj.zone || "zone non précisée"}${stg}`);
    if (recup.level === "ok" || recup.level === "nodata") recup.level = "watch";
  }

  /* ----- Entraînement ----- */
  const train = { level: "nodata", reasons: [] };
  const recentW = (weeks || []).slice(-3);
  const due = recentW.reduce((s, w) => s + (w.current ? w.dueSessions : w.plannedSessions), 0);
  const doneN = recentW.reduce((s, w) => s + Math.min(w.doneSessions, w.current ? w.dueSessions : w.plannedSessions), 0);
  const assid = due > 0 ? Math.round((doneN / due) * 100) : null;
  const stagn = trend && trend.tracked > 0 && trend.up === 0;
  if (assid != null || (trend && trend.tracked > 0)) {
    const low = assid != null && assid < TH("synthComplianceLow");
    train.level = low || stagn ? "watch" : "ok";
    if (assid != null) train.reasons.push(`${doneN}/${due} séances prévues réalisées sur 3 semaines (${assid} %)`);
    if (trend && trend.tracked > 0) {
      if (trend.up > 0) train.reasons.push(`${trend.up} RM en progrès sur ${TH("synthStagnWeeks")} semaines${trend.upNames.length ? ` (${trend.upNames.slice(0, 2).join(", ")})` : ""}`);
      else train.reasons.push(`Aucun RM en progrès depuis ${TH("synthStagnWeeks")} semaines (${trend.tracked} exercice${trend.tracked > 1 ? "s" : ""} suivi${trend.tracked > 1 ? "s" : ""})`);
    }
    if (strength?.weakest) train.reasons.push(`Point faible : ${strength.weakest.label} (${fr(strength.weakest.note)}/20)`);
  } else train.reasons.push("Pas de séance prévue récemment ni d'historique de RM");
  train.assid = assid;

  /* ----- Décision ----- */
  let decision;
  const c = charge.level;
  const r = recup.level;
  if (r === "alert" && (c === "alert" || c === "watch"))
    decision = "Alléger la prochaine séance : 30 à 40 % de volume en moins, pas d'intensité maximale. Recontrôler wellness et CMJ avant la suivante.";
  else if (r === "alert")
    decision = "La charge n'explique pas cette fatigue : chercher la cause hors entraînement (sommeil, stress, maladie, alimentation). Alléger la prochaine séance d'environ 20 %.";
  else if (r === "watch" && c === "alert") decision = "Stabiliser : aucune augmentation cette semaine. Garder l'intensité, retirer 1 à 2 séries par exercice.";
  else if (r === "watch") decision = "Séance prévue maintenue, à ajuster selon le ressenti à l'échauffement.";
  else if (r === "ok" && c === "alert") decision = "Il encaisse pour l'instant : ne rien ajouter et lisser la charge sur les 7 prochains jours (alterner jours durs et jours faciles).";
  else if (r === "ok" && c === "watch") decision = "Feu vert avec vigilance : séance prévue, sans volume supplémentaire.";
  else if (r === "ok" && c === "under") decision = "Marge disponible : remonter la charge progressivement (10 à 15 % par semaine).";
  else if (r === "ok" && c === "ok") decision = "Feu vert : appliquer la séance prévue.";
  else if (r === "ok") decision = "Récupération correcte. Pas assez de séances avec RPE pour juger la charge : appliquer la séance prévue.";
  else if (c === "alert") decision = "Charge en forte hausse et pas de wellness du jour : demander le questionnaire avant la séance, sinon rester sur du modéré.";
  else decision = "Pas de wellness du jour : demander le questionnaire avant de décider.";
  const painReal = pain && (pain.level === "watch" || pain.level === "alert");
  if (painReal && pain.top) {
    const z = pain.top.label;
    if (pain.level === "alert") decision = `Douleur marquée (${z} ${pain.top.v}/10${pain.typeLabel ? `, ${pain.typeLabel}` : ""}) : retirer les exercices qui sollicitent cette zone et la faire évaluer avant de la recharger.${c === "alert" || c === "watch" ? " La charge est en hausse : ne rien ajouter cette semaine." : ""}`;
    else decision += ` Douleur à surveiller (${z} ${pain.top.v}/10) : adapter les exercices de cette zone${c === "alert" || c === "watch" ? ", d'autant que la charge est en hausse" : ""}.`;
  }
  if (charge.resumed && r !== "alert" && !(painReal && pain.level === "alert")) decision = charge.level === "watch" ? "Reprise trop rapide après la coupure : revenir à sa charge habituelle au plus, et étaler la remontée sur 1 à 2 semaines." : "Reprise après coupure : séance prévue, en remontant progressivement vers sa charge habituelle. Le ratio de charge n'est pas un signal de fatigue ici.";
  if (c === "under" && train.assid != null && train.assid < TH("synthComplianceLow")) decision += " Avant d'ajouter des séances, voir pourquoi certaines ne sont pas faites.";
  if (injury && !(rtp && rtp.cleared)) decision = `Blessure ${injury.st.key === "ongoing" ? "en cours" : "récente"} : suivre le retour au jeu${rtp ? ` (étape ${rtp.stage}/5 — ${RTP_STAGES[Math.min(rtp.stage, 5) - 1].label})` : ""} et adapter la séance à la zone touchée. ${r === "alert" ? "La fatigue générale est élevée : alléger aussi le reste." : ""}${pain && pain.onInjury ? ` Douleur ${pain.onInjury.v}/10 sur la zone blessée aujourd'hui : rester à l'étape en cours.` : ""}`.trim();

  /* Message pour l'athlète lui-même (son dashboard) : mêmes feux, formulation à la 2e personne, sans consigne de programmation */
  let advice;
  if (injury && !(rtp && rtp.cleared)) advice = `Tu es en retour de blessure${rtp ? ` (étape ${rtp.stage}/5 — ${RTP_STAGES[Math.min(rtp.stage, 5) - 1].label})` : ""}. Respecte les étapes${pain && pain.onInjury ? " et signale à ton coach la douleur ressentie aujourd'hui sur la zone" : ""}.`;
  else if (painReal && pain.level === "alert") advice = `Douleur marquée aujourd'hui${pain.top ? ` (${pain.top.label})` : ""} : préviens ton coach avant ta séance et ne force pas sur cette zone.`;
  else if (r === "alert") advice = "Ta récupération est en baisse : préviens ton coach, et mets la priorité sur le sommeil, l'alimentation et l'hydratation aujourd'hui.";
  else if (charge.resumed) advice = "Tu reprends après une coupure : c'est normal que la charge remonte. Reprends progressivement, sans chercher tes charges d'avant dès la première semaine.";
  else if (r === "watch" && c === "alert") advice = "Ta charge monte vite et ta récupération suit moins bien : soigne ton sommeil et dis à ton coach comment tu te sens à l'échauffement.";
  else if (r === "watch") advice = "Petite baisse de forme : fais ta séance en écoutant tes sensations à l'échauffement, et dis-le à ton coach si ça ne va pas.";
  else if (r === "ok" && c === "alert") advice = "Tu encaisses bien une charge en forte hausse : garde des jours faciles pour récupérer.";
  else if (r === "ok" && c === "under") advice = "Tu es frais et ta charge est sous ton habitude : tu as de la marge pour t'entraîner.";
  else if (r === "ok") advice = "Tout est au vert : fais ta séance comme prévu.";
  else advice = "Remplis ton wellness du jour : il sert à adapter ta séance.";
  if (painReal && pain.level === "watch" && !(injury && !(rtp && rtp.cleared)) && pain.top) advice += ` Douleur à surveiller (${pain.top.label}) : signale-la à ton coach.`;

  return { charge, recup, train, decision, advice };
}
