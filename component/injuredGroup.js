/* =====================================================================
   injuredGroup.js — groupe « 🏥 Blessés » automatique (un par coach).

   • Un athlète y ENTRE dès qu'il a une blessure suivie (en cours, ou reprise dont le retour au jeu n'est
     pas fini) et qu'il n'a pas encore repris l'entraînement collectif complet (étape 5 du retour au jeu).
   • Il en SORT à l'étape 5 (il retrouve les séances de son groupe), ou quand la blessure est guérie /
     supprimée. Dates d'entrée / sortie gardées par groupHistory.js (memberSince / formerMembers).
   • Pendant qu'il y est (hideOthers ≠ false) : il ne voit plus les séances des autres groupes datées
     d'après son entrée (sauf celles qu'il a commencées, ses séances individuelles et « Moi »),
     et sa planification affichée est celle du groupe Blessés + la sienne (voir groupHistory.js).
   • La synchro est faite par le COACH : à l'ouverture du Dashboard, à chaque changement d'étape du retour
     au jeu et quand il saisit une blessure. Un athlète qui déclare LUI-MÊME une blessure s'y ajoute tout de
     suite (joinInjuredGroupSelf : la règle Firestore ne lui permet que de s'ajouter lui-même).
   • Bascule MANUELLE par le coach (bouton du Dashboard, pour un athlète ou pour lui-même) :
       forcedIn  = dedans même sans blessure suivie ; forcedOut = dehors même avec une blessure suivie.
     Un forcedOut devenu inutile (blessure terminée) est nettoyé à la synchro suivante.
   Document : groups/{id auto} = { name, system: "injured", hideOthers, color, createdBy, athleteIds,
              memberSince, formerMembers, subGroups, forcedIn, forcedOut, createdAt }
   ===================================================================== */
import { collection, addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { withMembershipHistory } from "./groupHistory";
import { needsInjuredGroup } from "./coachSynthesis";
import { coachIdsOf } from "./coachScope";

export const INJURED = "injured";
export const isInjuredGroup = (g) => g?.system === INJURED;
export const injuredGroupOf = (groups, coachUid) => (groups || []).find((g) => isInjuredGroup(g) && g.createdBy === coachUid) || null;

/* Athlètes dont ce coach gère le groupe Blessés : les siens (et ceux sans coach pour le superadmin) */
const managedBy = (a, coachUid, isSuperAdmin) => {
  const c = coachIdsOf(a);
  return c.includes(coachUid) || (!c.length && !!isSuperAdmin);
};

/* Met le groupe à jour. athletes : [{ id, coachIds?, coachId?, injuries }].
   Relit toujours les groupes du coach dans Firestore (la liste en mémoire peut ne pas être chargée : on
   créerait un 2e groupe). Une seule synchro à la fois. Retourne le groupe à jour, ou null si rien n'a changé. */
let running = Promise.resolve();
export function syncInjuredGroup(args) {
  const next = running.then(() => doSync(args)).catch((e) => {
    console.warn("Groupe Blessés non synchronisé :", e);
    return null;
  });
  running = next;
  return next;
}
const readGroup = async (db, coachUid) => {
  const snap = await getDocs(query(collection(db, "groups"), where("createdBy", "==", coachUid)));
  return injuredGroupOf(
    snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    coachUid
  );
};
const newGroupData = (coachUid, ids, today, extra = {}) => ({
  name: "🏥 Blessés",
  system: INJURED,
  hideOthers: true,
  color: "#d9695a",
  createdBy: coachUid,
  athleteIds: ids,
  subGroups: [],
  memberSince: Object.fromEntries(ids.map((u) => [u, today])),
  formerMembers: {},
  forcedIn: [],
  forcedOut: [],
  createdAt: serverTimestamp(),
  ...extra,
});

async function doSync({ db, coachUid, isSuperAdmin, athletes, today }) {
  if (!db || !coachUid) return null;
  const g = await readGroup(db, coachUid);
  const mine = (athletes || []).filter((a) => a && a.id && managedBy(a, coachUid, isSuperAdmin));
  const forcedIn = g?.forcedIn || [];
  const forcedOut0 = g?.forcedOut || [];
  const needs = Object.fromEntries(mine.map((a) => [a.id, needsInjuredGroup(a.injuries, today)]));
  // forcedOut d'un athlète géré qui n'a plus de blessure suivie : inutile, on le retire
  const forcedOut = forcedOut0.filter((u) => !(u in needs) || needs[u]);
  const want = mine.filter((a) => (needs[a.id] && !forcedOut.includes(a.id)) || forcedIn.includes(a.id)).map((a) => a.id);
  if (!g) {
    if (!want.length) return null;
    const data = newGroupData(coachUid, want, today);
    const ref = await addDoc(collection(db, "groups"), data);
    return { id: ref.id, ...data };
  }
  // on ne touche qu'aux athlètes gérés par ce coach (les autres restent tels quels)
  const mineIds = new Set(mine.map((a) => a.id));
  const keep = (g.athleteIds || []).filter((u) => !mineIds.has(u));
  const next = [...new Set([...keep, ...want])];
  const same = next.length === (g.athleteIds || []).length && next.every((u) => (g.athleteIds || []).includes(u));
  const outChanged = forcedOut.length !== forcedOut0.length;
  if (same && !outChanged) return null;
  const patch = same ? { forcedOut } : { ...withMembershipHistory(g, { athleteIds: next }), forcedOut };
  await updateDoc(doc(db, "groups", g.id), patch);
  return { ...g, ...patch };
}

/* Bascule manuelle (bouton du Dashboard). uid = athlète ou le coach lui-même ; on = le mettre dans le groupe.
   needs = a-t-il une blessure suivie (sert à choisir forcedOut ou simple retrait). Retourne le groupe à jour. */
export function setInjuredManual(args) {
  const next = running.then(() => doManual(args)).catch((e) => {
    console.warn("Groupe Blessés : bascule impossible", e);
    throw e;
  });
  running = next.catch(() => null);
  return next;
}
async function doManual({ db, coachUid, uid, on, needs, today }) {
  const g = await readGroup(db, coachUid);
  if (!g) {
    if (!on) return null;
    const data = newGroupData(coachUid, [uid], today, { forcedIn: needs ? [] : [uid] });
    const ref = await addDoc(collection(db, "groups"), data);
    return { id: ref.id, ...data };
  }
  const ids = new Set(g.athleteIds || []);
  let forcedIn = (g.forcedIn || []).filter((u) => u !== uid);
  let forcedOut = (g.forcedOut || []).filter((u) => u !== uid);
  if (on) {
    ids.add(uid);
    if (!needs) forcedIn = [...forcedIn, uid];
  } else {
    ids.delete(uid);
    if (needs) forcedOut = [...forcedOut, uid];
  }
  const patch = { ...withMembershipHistory(g, { athleteIds: [...ids] }), forcedIn, forcedOut };
  await updateDoc(doc(db, "groups", g.id), patch);
  return { ...g, ...patch };
}

/* Retire un compte de TOUS les groupes (membre, sous-groupes, bascules manuelles) : à la suppression d'un
   athlète, sinon il resterait comme membre fantôme (la synchro ne retire que les athlètes qu'elle connaît). */
export async function removeUserFromGroups(db, uid) {
  const gs = await getDocs(query(collection(db, "groups"), where("athleteIds", "array-contains", uid)));
  for (const g of gs.docs) {
    const data = { id: g.id, ...g.data() };
    const subGroups = (data.subGroups || []).map((sg) => ({ ...sg, athleteIds: (sg.athleteIds || []).filter((u) => u !== uid) }));
    const patch = withMembershipHistory(data, { athleteIds: (data.athleteIds || []).filter((u) => u !== uid), ...(data.subGroups ? { subGroups } : {}) });
    if (data.forcedIn) patch.forcedIn = data.forcedIn.filter((u) => u !== uid);
    if (data.forcedOut) patch.forcedOut = data.forcedOut.filter((u) => u !== uid);
    await updateDoc(doc(db, "groups", g.id), patch);
  }
  return gs.size;
}

/* L'ATHLÈTE lui-même, quand il déclare une blessure : il s'ajoute au groupe « Blessés » de ses coachs (s'il
   existe et que le coach ne l'en a pas sorti à la main). La règle Firestore ne l'autorise qu'à s'ajouter
   LUI-MÊME (athleteIds + sa date dans memberSince), rien d'autre. Retourne les groupes modifiés. */
export async function joinInjuredGroupSelf({ db, uid, coachIds, injuries, today }) {
  if (!db || !uid || !needsInjuredGroup(injuries, today)) return [];
  const out = [];
  for (const c of [...new Set(coachIds || [])]) {
    try {
      const g = await readGroup(db, c);
      if (!g || (g.athleteIds || []).includes(uid) || (g.forcedOut || []).includes(uid)) continue;
      const patch = withMembershipHistory(g, { athleteIds: [...(g.athleteIds || []), uid] });
      await updateDoc(doc(db, "groups", g.id), { athleteIds: patch.athleteIds, memberSince: patch.memberSince });
      out.push({ ...g, athleteIds: patch.athleteIds, memberSince: patch.memberSince });
    } catch (e) {
      console.warn("Groupe Blessés : ajout impossible", e);
    }
  }
  return out;
}
