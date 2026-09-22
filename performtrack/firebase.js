// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableNetwork } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDY0iydgYRHQqGiTxYSypMEZDIvW3yisbA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "performtrack-52878.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "performtrack-52878",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "performtrack-52878.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "374235344751",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:374235344751:web:29b79b17c25df63bebc29a",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-161H68DMC3",
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