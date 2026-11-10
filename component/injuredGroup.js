/* =====================================================================
   injuredGroup.js — groupe « 🏥 Blessés » automatique (un par coach).

   • Un athlète y ENTRE dès qu'il a une blessure suivie (en cours, ou reprise dont le retour au jeu n'est
     pas fini) et qu'il n'a pas encore repris l'entraînement collectif complet (étape 5 du retour au jeu).
   • Il en SORT à l'étape 5 (il retrouve les séances de son groupe), ou quand la blessure est guérie /
     supprimée. Dates d'entrée / sortie gardées par groupHistory.js (memberSince / formerMembers).
   • Pendant qu'il y est (hideOthers ≠ false) : il ne voit plus les séances des autres groupes datées
     d'après son entrée (sauf celles qu'il a commencées, ses séances individuelles et « Moi »),
     et sa planification affichée est celle du groupe Blessés + la sienne (voir groupHistory.js).
   • La synchro est faite par le COACH (seul un admin peut écrire un groupe) : à l'ouverture du Dashboard
     et à chaque changement d'étape du retour au jeu. Une blessure déclarée par l'athlète lui-même compte
     donc à la prochaine ouverture du Dashboard par son coach : c'est voulu (le coach valide).
   Document : groups/{id auto} = { name, system: "injured", hideOthers, color, createdBy, athleteIds,
              memberSince, formerMembers, subGroups, createdAt }
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
async function doSync({ db, coachUid, isSuperAdmin, athletes, today }) {
  if (!db || !coachUid) return null;
  const snap = await getDocs(query(collection(db, "groups"), where("createdBy", "==", coachUid)));
  const g = injuredGroupOf(
    snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    coachUid
  );
  const mine = (athletes || []).filter((a) => a && a.id && managedBy(a, coachUid, isSuperAdmin));
  const want = mine.filter((a) => needsInjuredGroup(a.injuries, today)).map((a) => a.id);
  if (!g) {
    if (!want.length) return null;
    const data = {
      name: "🏥 Blessés",
      system: INJURED,
      hideOthers: true,
      color: "#d9695a",
      createdBy: coachUid,
      athleteIds: want,
      subGroups: [],
      memberSince: Object.fromEntries(want.map((u) => [u, today])),
      formerMembers: {},
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "groups"), data);
    return { id: ref.id, ...data };
  }
  // on ne touche qu'aux athlètes gérés par ce coach (les autres restent tels quels)
  const mineIds = new Set(mine.map((a) => a.id));
  const keep = (g.athleteIds || []).filter((u) => !mineIds.has(u));
  const next = [...new Set([...keep, ...want])];
  const same = next.length === (g.athleteIds || []).length && next.every((u) => (g.athleteIds || []).includes(u));
  if (same) return null;
  const patch = withMembershipHistory(g, { athleteIds: next });
  await updateDoc(doc(db, "groups", g.id), patch);
  return { ...g, ...patch };
}
