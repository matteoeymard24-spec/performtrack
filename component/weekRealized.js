/* =====================================================================
   weekRealized.js — volume et intensité RÉELLEMENT EFFECTUÉS, semaine par semaine,
   à partir des séances TERMINÉES du calendrier (pour la frise de planification).

   Le coach garde son volume / intensité PRÉVUS (saisis à la main sur chaque semaine) ;
   ceci calcule ce qui a été fait, avec la même méthode que la charge (sRPE de Foster) :
     • minutes  = Σ durée réelle des séances terminées de la semaine (sessionDurationMin) ;
     • charge   = Σ note globale de séance × durée (UA) ;
     • intensité réelle (1-10) = charge / minutes = RPE moyen de la semaine pondéré par la durée ;
     • volume réel (1-10) = minutes de la semaine / minutes de la semaine la plus chargée
       des données chargées × 10 (échelle RELATIVE : 10 = la plus grosse semaine).
   Plusieurs athlètes (groupe) : moyenne des athlètes qui ont terminé au moins une séance dans la semaine.
   Séances non terminées : ignorées (pas « réellement effectuées »).
   ===================================================================== */
import { sessionDurationMin, sessionLoad, sessionRpe, doneDateOf } from "./sessionLoad";
import { mondayOf } from "./cycles";

const r1 = (x) => Math.round(x * 10) / 10;

/* uid à prendre en compte selon la portée affichée ("user:<uid>" = une personne, sinon tous) */
const participantsOf = (w, scope) => {
  const prog = w.userProgress || {};
  const done = Object.keys(prog).filter((u) => prog[u]?.completedAt);
  if (typeof scope === "string" && scope.startsWith("user:")) {
    const uid = scope.slice(5);
    return done.includes(uid) ? [uid] : [];
  }
  return done;
};

/* { "AAAA-MM-JJ (lundi)": { minutes, load, intensity, volume, sessions, athletes } } */
export function realizedByWeek(events, scope) {
  const perWeek = {}; // semaine -> uid -> { minutes, load, sessions }
  (events || []).forEach((w) => {
    if (!w?.date) return;
    participantsOf(w, scope).forEach((uid) => {
      const wk = mondayOf(doneDateOf(w, uid)); // semaine où la séance a réellement été faite
      if (sessionRpe(w, uid) == null) return; // terminée mais sans aucune note : pas de charge mesurable
      const m = sessionDurationMin(w, uid);
      const l = sessionLoad(w, uid);
      perWeek[wk] = perWeek[wk] || {};
      const a = (perWeek[wk][uid] = perWeek[wk][uid] || { minutes: 0, load: 0, sessions: 0 });
      a.minutes += m;
      a.load += l;
      a.sessions += 1;
    });
  });
  const out = {};
  Object.entries(perWeek).forEach(([wk, byUid]) => {
    const arr = Object.values(byUid);
    const n = arr.length;
    const minutes = arr.reduce((s, x) => s + x.minutes, 0) / n;
    const load = arr.reduce((s, x) => s + x.load, 0) / n;
    const sessions = arr.reduce((s, x) => s + x.sessions, 0) / n;
    out[wk] = { minutes: Math.round(minutes), load: Math.round(load), sessions: r1(sessions), athletes: n, intensity: minutes > 0 ? r1(load / minutes) : null };
  });
  const maxMin = Math.max(0, ...Object.values(out).map((x) => x.minutes));
  Object.values(out).forEach((x) => {
    x.volume = maxMin > 0 ? Math.max(1, Math.round((x.minutes / maxMin) * 10)) : null;
    x.maxMinutes = maxMin;
  });
  return out;
}
