// mediaStore.js — photos / GIF des exercices, à part de la banque d'exos.
//
// Avant : l'image (base64, jusqu'à ~1 Mo) était DANS la fiche exerciseMedia,
// et toutes les pages (Séances, Dashboard, Mes RM, Tests...) relisaient toute
// la banque — donc retéléchargeaient toutes les photos à chaque ouverture.
// C'est ce transfert qui menaçait le quota gratuit (10 Go / mois).
//
// Maintenant :
//   exerciseMedia/{clé}   = fiche légère (nom, catégorie, hasMedia, mediaV...)
//   exerciseImages/{clé}  = { mediaUrl, mediaType, v }  (l'image seule)
// L'image n'est téléchargée qu'une fois par appareil puis gardée dans le
// navigateur (IndexedDB) ; on ne la relit que si sa version (mediaV) change.
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

const DB_NAME = "pt-media";
const STORE = "img";
let dbPromise = null;

const openIdb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
};

const idbGet = async (key) => {
  try {
    const d = await openIdb();
    return await new Promise((resolve) => {
      const r = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
};

const idbSet = async (key, value) => {
  try {
    const d = await openIdb();
    await new Promise((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
  } catch (e) {
    /* navigateur sans stockage (navigation privée...) : on relira simplement en ligne */
  }
};

const idbDel = async (key) => {
  try {
    const d = await openIdb();
    await new Promise((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch (e) {
    /* ignore */
  }
};

const mem = new Map(); // clé -> { v, url }

// Image d'un exercice (version v attendue = fiche.mediaV). Cache mémoire,
// puis navigateur, puis Firestore en dernier recours.
export const loadExerciseImage = async (key, v) => {
  if (!key) return null;
  const m = mem.get(key);
  if (m && (v === undefined || m.v === v)) return m.url;
  const c = await idbGet(key);
  if (c && c.url && (v === undefined || c.v === v)) {
    mem.set(key, c);
    return c.url;
  }
  const snap = await getDoc(doc(db, "exerciseImages", key));
  if (!snap.exists()) return null;
  const d = snap.data();
  const rec = { v: d.v ?? v, url: d.mediaUrl };
  mem.set(key, rec);
  idbSet(key, rec);
  return rec.url;
};

// Enregistre l'image ; renvoie la version à reporter dans la fiche (mediaV).
export const saveExerciseImage = async (key, url, mediaType = "image") => {
  const v = Date.now();
  await setDoc(doc(db, "exerciseImages", key), { mediaUrl: url, mediaType, v });
  const rec = { v, url };
  mem.set(key, rec);
  idbSet(key, rec);
  return v;
};

export const deleteExerciseImage = async (key) => {
  mem.delete(key);
  idbDel(key);
  try {
    await deleteDoc(doc(db, "exerciseImages", key));
  } catch (e) {
    console.warn("Suppression image exercice:", e);
  }
};
