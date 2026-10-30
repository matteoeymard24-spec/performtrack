// workoutQueries.js
// Lectures Firestore « à portée » ET « à période » :
//
// 1) Portée : chaque compte ne demande au serveur QUE ce que les règles
//    Firestore l'autorisent à lire (une requête qui pourrait renvoyer un seul
//    document interdit est refusée EN ENTIER par Firestore).
//      - superadmin ............ tout
//      - coach (admin) ......... séances / cycles / matchs qu'il a créés ;
//                                comptes : ses athlètes (coachId == lui) + les coachs
//      - athlète rattaché ...... ce que son coach a créé + ce qui le cible
//      - athlète sans coach .... tout, comme avant
//
// 2) Période (quota gratuit) : les anciennes séances ne sont plus supprimées ;
//    à la place, chaque page ne relit que la période dont elle a besoin
//    (option `since`, date "AAAA-MM-JJ"). Firestore facture chaque document
//    LU : relire 2 ans d'historique à chaque ouverture de page ferait exploser
//    le quota de 50 000 lectures / jour.
//
// Certaines combinaisons (ex. createdBy == X ET date >= Y) demandent un index
// composite Firestore. S'il n'existe pas encore, on retombe automatiquement
// sur la même requête sans filtre de date (résultat identique, juste plus de
// lectures) et on affiche UNE fois dans la console le lien pour créer l'index.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase";

// ---------- Profil du compte connecté (rôle, superadmin, coach) ----------
let meCache = { uid: null, value: null };

export const getMyAccess = async () => {
  try {
    if (typeof auth.authStateReady === "function") await auth.authStateReady();
  } catch (e) {
    /* ignore */
  }
  const uid = auth.currentUser?.uid || null;
  if (!uid) return { uid: null };
  if (meCache.uid === uid && meCache.value) return meCache.value;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.exists() ? snap.data() : {};
    const value = {
      uid,
      superAdmin: d.superAdmin === true,
      admin: d.role === "admin" || d.superAdmin === true,
      coachId: d.coachId || null,
    };
    meCache = { uid, value };
    return value;
  } catch (e) {
    console.error("workoutQueries: lecture du profil impossible", e);
    return { uid, superAdmin: false, admin: false, coachId: null, unknown: true };
  }
};

// ---------- Dates ----------
const pad = (n) => String(n).padStart(2, "0");
export const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Fenêtres utilisées par les pages (en jours). 120 j = 90 j d'historique
// affiché + 28 j de fenêtre chronique du REDI.
export const WINDOW = {
  analysis: 120, // Dashboard coach, REDI, fiche athlète
  athlete: 60, // Dashboard athlète (REDI du jour, semaine, CMJ récent)
  calendar: 60, // calendrier des séances (les mois plus anciens se chargent à la demande)
  feedback: 365, // courbes de feedback RM (bouton « tout l'historique » au-delà)
};

// ---------- Utilitaires ----------
const mergeSnaps = (snaps) => {
  const seen = new Set();
  const docs = [];
  snaps.forEach((s) =>
    (s?.docs || []).forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      docs.push(d);
    })
  );
  return { docs };
};

const warnedIndex = new Set();
const isIndexError = (e) =>
  e && (e.code === "failed-precondition" || /index/i.test(e.message || ""));

// Exécute une requête ; si l'index composite manque, rejoue-la sans les
// filtres « confort » (date, groupes) et filtre ensuite côté appli.
const runQuery = async (col, base, extra, localFilter, label) => {
  try {
    return await getDocs(query(col, ...base, ...extra));
  } catch (e) {
    if (!extra.length || !isIndexError(e)) throw e;
    if (!warnedIndex.has(label)) {
      warnedIndex.add(label);
      console.warn(
        `[PerformTrack] Index Firestore manquant pour « ${label} » : lecture complète en attendant. ` +
          "Clique sur le lien ci-dessous pour le créer (1 clic, gratuit) :",
        e.message
      );
    }
    const snap = await getDocs(query(col, ...base));
    return { docs: snap.docs.filter((d) => localFilter(d.data())) };
  }
};

// Groupe personnalisé (id Firestore) ou sous-groupe ("sg:<groupe>:<sous-groupe>") — pas "total" / "avant"...
export const isCustomTarget = (g) => typeof g === "string" && (g.startsWith("sg:") || /^[A-Za-z0-9]{20}$/.test(g));
const customTargets = (groups) => (groups || []).filter(isCustomTarget);

// Groupes / sous-groupes personnalisés dont l'athlète est membre (pour les pages qui ne passent pas `groups`)
let memberCache = { uid: null, at: 0, value: [] };
export const getMemberTargets = async (uid) => {
  if (!uid) return [];
  if (memberCache.uid === uid && Date.now() - memberCache.at < 5 * 60 * 1000) return memberCache.value;
  try {
    const snap = await getDocs(query(collection(db, "groups"), where("athleteIds", "array-contains", uid)));
    const out = [];
    snap.docs.forEach((d) => {
      out.push(d.id);
      (d.data().subGroups || []).forEach((sg) => {
        if ((sg.athleteIds || []).includes(uid)) out.push(`sg:${d.id}:${sg.id}`);
      });
    });
    memberCache = { uid, at: Date.now(), value: out };
    return out;
  } catch (e) {
    console.warn("workoutQueries: groupes de l'athlète illisibles", e);
    return [];
  }
};

// ---------- Cache court (évite de relire la même chose en changeant de page) ----------
const CACHE_TTL_MS = 90 * 1000;
const cache = new Map();
export const invalidateQueryCache = (prefix = "") => {
  for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix)) cache.delete(k);
};

/* Lecture d'une collection dont les documents portent createdBy (et parfois
   targetUserId / group / date) : workout, cycles, fixtures.
   options :
     since       "AAAA-MM-JJ" : seulement les documents datés à partir de ce jour
                 (les documents futurs sont toujours inclus)
     withTarget  inclure ce qui cible l'athlète (targetUserId)
     groups      pour un athlète : ne lire que ces groupes (≤ 30 valeurs)
     fresh       ignorer le cache */
export const getScopedDocs = async (colName, opts = {}) => {
  const { since = null, withTarget = false, groups = null, fresh = false } = opts;
  const me = await getMyAccess();
  if (!me.uid) return { docs: [] };
  const key = `${colName}|${me.uid}|${since}|${withTarget}|${(groups || []).join(",")}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const col = collection(db, colName);
  const dateExtra = since ? [where("date", ">=", since)] : [];
  const dateOk = (d) => !since || (d.date || "") >= since;
  const grp = groups && groups.length > 0 && groups.length <= 30 ? groups : null;
  const grpExtra = grp ? [where("group", "in", grp)] : [];
  const grpOk = (d) => !grp || grp.includes(d.group);

  let value;
  if (me.superAdmin) {
    value = since ? await runQuery(col, [], dateExtra, dateOk, `${colName} par date`) : await getDocs(col);
  } else if (me.admin) {
    value = await runQuery(
      col,
      [where("createdBy", "==", me.uid)],
      dateExtra,
      dateOk,
      `${colName} : createdBy + date`
    );
  } else {
    const reqs = [];
    if (!me.coachId) {
      // Athlète sans coach : comportement d'avant (tout est lisible)
      reqs.push(
        grp || since
          ? runQuery(col, [], [...grpExtra, ...dateExtra], (d) => grpOk(d) && dateOk(d), `${colName} : group + date`)
          : getDocs(col)
      );
    } else {
      reqs.push(
        runQuery(
          col,
          [where("createdBy", "==", me.coachId)],
          [...grpExtra, ...dateExtra],
          (d) => grpOk(d) && dateOk(d),
          `${colName} : createdBy + group + date`
        )
      );
    }
    // Athlète rattaché : séances des groupes PERSONNALISÉS dont il est membre, quel que soit le coach
    // qui les a créées (ex. un athlète de Cyril placé dans un groupe de Matteo). Une requête par groupe
    // (égalité) : la règle Firestore vérifie l'appartenance au groupe.
    const memberTg = me.coachId ? (grp ? customTargets(grp) : await getMemberTargets(me.uid)) : [];
    if (memberTg.length)
      memberTg.forEach((g) =>
        reqs.push(
          runQuery(col, [where("group", "==", g)], dateExtra, dateOk, `${colName} : group + date`)
        )
      );
    if (withTarget)
      reqs.push(
        runQuery(col, [where("targetUserId", "==", me.uid)], dateExtra, dateOk, `${colName} : targetUserId + date`)
      );
    // ce que l'athlète a créé lui-même (ex. ses propres matchs)
    reqs.push(runQuery(col, [where("createdBy", "==", me.uid)], dateExtra, dateOk, `${colName} : createdBy + date`));
    const res = await Promise.allSettled(reqs);
    res.forEach((r) => {
      if (r.status === "rejected") console.warn(`workoutQueries (${colName}):`, r.reason);
    });
    value = mergeSnaps(res.filter((r) => r.status === "fulfilled").map((r) => r.value));
  }
  cache.set(key, { at: Date.now(), value });
  return value;
};

// Séances. Sans option : TOUT l'historique (réservé aux actions rares :
// renommer un exercice partout, supprimer un groupe...). Les pages passent
// { since } pour ne lire que la période utile.
export const getWorkoutDocs = (opts = {}) => getScopedDocs("workout", { withTarget: true, ...opts });

// Comptes visibles : superadmin = tous ; coach = ses athlètes + les coachs + lui-même.
export const getScopedUserDocs = async () => {
  const me = await getMyAccess();
  const col = collection(db, "users");
  if (!me.uid) return { docs: [] };
  if (me.superAdmin) return getDocs(col);
  const [mine, admins, self] = await Promise.all([
    getDocs(query(col, where("coachId", "==", me.uid))),
    getDocs(query(col, where("role", "==", "admin"))),
    getDoc(doc(db, "users", me.uid)),
  ]);
  return mergeSnaps([mine, admins, { docs: self.exists() ? [self] : [] }]);
};

// Wellness d'une période (coach : tous ses athlètes ; filtrage par athlète côté appli).
export const getWellnessSince = async (since, userId = null) => {
  const col = collection(db, "wellness");
  if (userId) {
    return runQuery(
      col,
      [where("userId", "==", userId)],
      [where("date", ">=", since)],
      (d) => (d.date || "") >= since,
      "wellness : userId + date"
    );
  }
  return getDocs(query(col, where("date", ">=", since)));
};
