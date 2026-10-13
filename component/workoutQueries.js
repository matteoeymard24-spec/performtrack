// workoutQueries.js
// Lecture de la collection "workout" compatible avec les règles Firestore qui
// cachent les séances "moi" (privées) aux autres utilisateurs.
//
// Les règles Firestore ne filtrent pas les résultats : une requête qui
// pourrait renvoyer un document interdit est refusée EN ENTIER. On ne peut donc
// plus faire getDocs(collection(db, "workout")) sauf pour le superadmin.
// Pour tous les autres, on fait deux requêtes que les règles peuvent valider :
//   1. toutes les séances dont le groupe n'est pas "moi"
//   2. leurs propres séances "moi"
//
// Robustesse : on attend que l'authentification soit prête, on ne met en cache
// le statut superadmin que s'il a été lu avec succès, et si les requêtes ciblées
// échouent on retombe sur la lecture complète plutôt que de renvoyer une liste
// vide.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase";

// Cache du statut superadmin (évite de relire users/{uid} à chaque appel).
let superAdminCache = { uid: null, value: false };

const isSuperAdminUser = async (uid) => {
  if (superAdminCache.uid === uid) return superAdminCache.value;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const value = snap.exists() && snap.data().superAdmin === true;
    superAdminCache = { uid, value };
    return value;
  } catch (e) {
    console.error("workoutQueries: lecture du statut superAdmin impossible", e);
    return false; // pas de mise en cache : on réessaiera au prochain appel
  }
};

// Renvoie un objet { docs } comme getDocs(), à utiliser à sa place.
export const getWorkoutDocs = async () => {
  try {
    if (typeof auth.authStateReady === "function") await auth.authStateReady();
  } catch (e) {
    /* ignore */
  }
  const uid = auth.currentUser?.uid;
  const col = collection(db, "workout");
  if (!uid) {
    console.warn("workoutQueries: aucun utilisateur connecté");
    return { docs: [] };
  }

  if (await isSuperAdminUser(uid)) {
    return getDocs(col);
  }

  try {
    const [others, mine] = await Promise.all([
      getDocs(query(col, where("group", "!=", "moi"))),
      getDocs(
        query(col, where("group", "==", "moi"), where("createdBy", "==", uid))
      ),
    ]);
    return { docs: [...others.docs, ...mine.docs] };
  } catch (e) {
    console.error(
      "workoutQueries: requêtes ciblées refusées, repli sur la lecture complète",
      e
    );
    return getDocs(col);
  }
};
