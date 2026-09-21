// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableNetwork } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDY0iydgYRHQqGiTxYSypMEZDIvW3yisbA",
  authDomain: "performtrack-52878.firebaseapp.com",
  projectId: "performtrack-52878",
  storageBucket: "performtrack-52878.firebasestorage.app",
  messagingSenderId: "374235344751",
  appId: "1:374235344751:web:29b79b17c25df63bebc29a",
  measurementId: "G-161H68DMC3",
};

// Vérifie si Firebase est déjà initialisé
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Firestore
const db = getFirestore(app);

// Force le réseau en ligne
enableNetwork(db)
  .then(() => {
    console.log("✅ Firestore réseau activé");
  })
  .catch((error) => {
    console.error("❌ Erreur activation réseau:", error);
  });

// AUTH
const auth = getAuth(app);

console.log("🔥 Firebase initialisé");

export { db, auth };
