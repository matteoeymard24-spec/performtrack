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
  let value = false;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    value = snap.exists() && snap.data().superAdmin === true;
  } catch (e) {
    value = false;
  }
  superAdminCache = { uid, value };
  return value;
};

// Renvoie un objet { docs } comme getDocs(), à utiliser à sa place.
export const getWorkoutDocs = async () => {
  const uid = auth.currentUser?.uid;
  const col = collection(db, "workout");
  if (!uid) return { docs: [] };

  if (await isSuperAdminUser(uid)) {
    return getDocs(col);
  }

  const [others, mine] = await Promise.all([
    getDocs(query(col, where("group", "!=", "moi"))),
    getDocs(
      query(col, where("group", "==", "moi"), where("createdBy", "==", uid))
    ),
  ]);
  return { docs: [...others.docs, ...mine.docs] };
};
