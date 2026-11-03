/* =====================================================================
   groupHistory.js — HISTORIQUE D'APPARTENANCE AUX GROUPES.

   Sur chaque groupe (et chaque sous-groupe) :
     • memberSince   { uid: "AAAA-MM-JJ" }              date d'entrée de l'athlète
     • formerMembers { uid: [{ since, until }, …] }     périodes passées (il a quitté le groupe)
   Membre sans date (anciens membres, groupe créé avant l'historique) = membre « depuis toujours ».

   Règle d'affichage d'une séance pour un athlète :
     1. séance qu'il a commencée / terminée → toujours visible (même s'il a changé de groupe) ;
     2. séance de son groupe / sous-groupe ACTUEL → seulement à partir de sa date d'entrée ;
     3. séance d'un ANCIEN groupe qu'il n'a pas faite → plus visible.
   Les feedbacks, charges et RM ne sont jamais touchés : ils vivent dans userProgress de la séance.
   ===================================================================== */

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* Calcule memberSince / formerMembers après un changement de athleteIds (prev → nextIds) */
function diffHistory(prev, nextIds, today) {
  const prevIds = new Set(prev?.athleteIds || []);
  const next = new Set(nextIds || []);
  const memberSince = { ...(prev?.memberSince || {}) };
  const formerMembers = { ...(prev?.formerMembers || {}) };
  next.forEach((uid) => {
    if (!prevIds.has(uid)) memberSince[uid] = today; // arrivée
  });
  prevIds.forEach((uid) => {
    if (!next.has(uid)) {
      // départ : on garde la période, pour l'historique
      formerMembers[uid] = [...(formerMembers[uid] || []), { since: memberSince[uid] || null, until: today }].slice(-5);
      delete memberSince[uid];
    }
  });
  return { memberSince, formerMembers };
}

/* À appliquer à un patch de groupe avant updateDoc. prevGroup = le groupe tel qu'il était.
   Gère athleteIds du groupe et ceux de chaque sous-groupe (patch.subGroups). */
export function withMembershipHistory(prevGroup, patch) {
  const today = todayIso();
  const out = { ...patch };
  if (patch.athleteIds) Object.assign(out, diffHistory(prevGroup, patch.athleteIds, today));
  if (patch.subGroups)
    out.subGroups = patch.subGroups.map((sg) => {
      const before = (prevGroup?.subGroups || []).find((x) => x.id === sg.id);
      // nouveau sous-groupe : membres « depuis toujours » au sein du groupe (pas de date)
      if (!before) return { ...sg, memberSince: sg.memberSince || {}, formerMembers: sg.formerMembers || {} };
      return { ...sg, ...diffHistory(before, sg.athleteIds || [], today) };
    });
  return out;
}

/* Le groupe / sous-groupe ciblé par une séance (champ group) : { g, sg } ou null */
const targetOf = (target, groups) => {
  if (typeof target !== "string") return null;
  if (target.startsWith("sg:")) {
    const [gid, sid] = target.slice(3).split(":");
    const g = (groups || []).find((x) => x.id === gid);
    const sg = g ? (g.subGroups || []).find((x) => x.id === sid) : null;
    return sg ? { g, sg } : null;
  }
  const g = (groups || []).find((x) => x.id === target);
  return g ? { g, sg: null } : null;
};

/* Date d'entrée de l'athlète dans la cible : undefined = pas membre ; "" = membre sans date */
export function memberSinceFor(target, uid, groups) {
  const t = targetOf(target, groups);
  if (!t) return undefined;
  const holder = t.sg || t.g;
  if (!(holder.athleteIds || []).includes(uid)) return undefined;
  return (t.sg && t.sg.memberSince?.[uid]) || t.g.memberSince?.[uid] || "";
}

/* La séance cible un groupe / sous-groupe dont l'athlète est membre, et elle date d'après son arrivée */
export function groupTargetMatches(w, uid, groups) {
  const since = memberSinceFor(w?.group, uid, groups);
  if (since === undefined) return false;
  return !since || (w.date || "") >= since;
}

/* L'athlète a commencé ou terminé cette séance */
export const hasProgress = (w, uid) => {
  const p = w?.userProgress?.[uid];
  return !!(p && (p.completedAt || p.startedAt || p.feedback));
};

/* Cibles (groupes / sous-groupes) que l'athlète a quittées — à lire aussi pour retrouver ses séances faites */
export function formerTargetsOf(uid, groups) {
  const out = [];
  (groups || []).forEach((g) => {
    if (g.formerMembers?.[uid]) out.push(g.id);
    (g.subGroups || []).forEach((sg) => {
      if (sg.formerMembers?.[uid]) out.push(`sg:${g.id}:${sg.id}`);
    });
  });
  return out;
}
