import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { DEFAULTS, setThresholds, allThresholds } from "./thresholdsCore";
export * from "./thresholdsCore";

let loadedFor = null;
let pending = null;

/* =====================================================================
   thresholds.js — seuils et normes réglables (page ⚙️ Paramètres).

   • TH("cle") renvoie la valeur active (réglage du coach, sinon valeur par défaut) : lecture
     synchrone, utilisable partout dans les calculs.
   • Stockage : users/{coach}/config/thresholds. À l'enregistrement, une copie est écrite chez
     chacun de ses athlètes (users/{athlète}/config/thresholds) : les règles Firestore laissent
     un coach écrire dans l'espace de ses athlètes, et l'appli de l'athlète calcule ainsi avec
     les seuils de son coach (nutrition, effort perçu…). Aucune règle à modifier.
   • ensureThresholds() charge les réglages de la personne connectée (une fois, mis en cache).
   ===================================================================== */

/* Charge les réglages de la personne connectée (ses propres réglages, ou la copie de son coach) */
export async function ensureThresholds(force = false) {
  const uid = auth.currentUser?.uid;
  if (!uid) return allThresholds();
  if (!force && loadedFor === uid) return allThresholds();
  if (!force && pending) return pending;
  pending = (async () => {
    try {
      const snap = await getDoc(doc(db, "users", uid, "config", "thresholds"));
      setThresholds(snap.exists() ? snap.data().values : {});
    } catch (e) {
      setThresholds({});
    }
    loadedFor = uid;
    pending = null;
    try {
      window.dispatchEvent(new Event("pt-thresholds"));
    } catch (e) {
      /* ignore */
    }
    return allThresholds();
  })();
  return pending;
}

/* Enregistre (coach) : chez lui + copie chez chacun de ses athlètes. Renvoie { ok, failed } */
export async function saveThresholds(values, athleteIds = []) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Non connecté");
  const vals = Object.fromEntries(Object.entries(values || {}).filter(([k, v]) => k in DEFAULTS && v !== "" && v !== null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  const data = { values: vals, updatedAt: new Date().toISOString(), by: uid };
  await setDoc(doc(db, "users", uid, "config", "thresholds"), data);
  setThresholds(vals);
  loadedFor = uid;
  let ok = 0;
  const failed = [];
  await Promise.all(
    athleteIds.map(async (aid) => {
      try {
        await setDoc(doc(db, "users", aid, "config", "thresholds"), data);
        ok++;
      } catch (e) {
        failed.push(aid);
      }
    })
  );
  try {
    window.dispatchEvent(new Event("pt-thresholds"));
  } catch (e) {
    /* ignore */
  }
  return { ok, failed };
}
