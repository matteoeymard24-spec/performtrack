import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState("athlete");
  const [userGroup, setUserGroup] = useState("total");
  const [userProfile, setUserProfile] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // Statut d'autorisation d'accès : "approved" (défaut, y compris pour les
  // comptes créés avant cette fonctionnalité et qui n'ont pas ce champ),
  // "pending" (inscription en attente de validation par le coach) ou
  // "rejected" (demande refusée). Voir Login.jsx (création) et Athletes.jsx
  // (validation par le coach).
  const [userStatus, setUserStatus] = useState("approved");
  const [loading, setLoading] = useState(true);
  // Échec de lecture du profil (réseau coupé, Firestore injoignable) : on ne
  // "rétrograde" JAMAIS silencieusement en athlète, on affiche un écran
  // d'erreur avec un bouton Réessayer.
  const [profileError, setProfileError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // Mode "aperçu athlète" : le coach voit l'appli exactement comme un athlète
  // (menus, pages, séances, cycles). C'est purement visuel côté interface : on
  // reste connecté avec son propre compte, rien n'est modifié en base.
  // (non mémorisé : un rechargement de la page ramène toujours à la vue coach)
  const [previewAthlete, setPreviewAthleteState] = useState(false);
  const setPreviewAthlete = (on) => setPreviewAthleteState(!!on);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          // 3 tentatives (réseau instable) avant de considérer que c'est un échec.
          let userDoc = null;
          let lastErr = null;
          for (let attempt = 1; attempt <= 3 && !userDoc; attempt++) {
            try {
              userDoc = await getDoc(userDocRef);
            } catch (e) {
              lastErr = e;
              await new Promise((r) => setTimeout(r, 1200 * attempt));
            }
          }
          if (!userDoc) throw lastErr || new Error("Profil illisible");
          setProfileError(false);

          if (!userDoc.exists()) {
            // Le document users/{uid} doit être créé manuellement (Firebase
            // Console) pour tout nouveau compte — l'app ne l'auto-crée pas.
            console.error(
              "Profil Firestore introuvable pour cet utilisateur. Créez le document users/" +
                user.uid +
                " dans la console Firebase."
            );
            setUserProfile(null);
            setIsSuperAdmin(false);
            setUserRole("athlete");
            setUserGroup("total");
            setUserStatus("approved");
            setLoading(false);
            return;
          }

          const data = userDoc.data();

          if (data) {
            const roleValue = data.role || "athlete";
            const groupValue = data.group || "total";
            const superAdminValue = data.superAdmin === true;
            // Comptes créés avant cette fonctionnalité (pas de champ status) :
            // traités comme déjà approuvés pour ne rien casser.
            const statusValue = data.status || "approved";

            setUserRole(roleValue);
            setUserGroup(groupValue);
            setUserProfile(data);
            setIsSuperAdmin(superAdminValue);
            setUserStatus(statusValue);
          } else {
            setUserProfile(null);
            setIsSuperAdmin(false);
            setUserStatus("approved");
          }
        } catch (err) {
          console.error("Erreur lors du chargement du profil Firestore:", err.message);
          setProfileError(true);
        }
      } else {
        setUserRole("athlete");
        setUserGroup("total");
        setUserProfile(null);
        setIsSuperAdmin(false);
        setUserStatus("approved");
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [retryKey]);

  const logout = () => {
    return auth.signOut();
  };

  // Le coach réel (indépendamment de l'aperçu) peut activer l'aperçu athlète.
  const canPreview = userRole === "admin" || isSuperAdmin;
  const preview = canPreview && previewAthlete;

  const value = {
    currentUser,
    // Un super admin est toujours traité comme admin partout dans l'appli
    // (beaucoup d'écrans testent userRole === "admin").
    userRole: preview ? "athlete" : isSuperAdmin ? "admin" : userRole,
    userGroup,
    userProfile,
    isSuperAdmin: preview ? false : isSuperAdmin,
    userStatus,
    logout,
    canPreview,
    previewAthlete: preview,
    setPreviewAthlete,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && profileError && currentUser ? (
        <div
          style={{
            minHeight: "100vh",
            background: "#0d0c0a",
            color: "#f3f0ea",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
            <h2 style={{ margin: "0 0 12px 0" }}>Connexion impossible</h2>
            <p style={{ color: "#a8a199", fontSize: 15, lineHeight: 1.6 }}>
              L'application n'arrive pas à joindre le serveur pour charger ton profil.
              Vérifie ta connexion (Wi-Fi, VPN, bloqueur de publicités) puis réessaie.
              Ton compte n'a pas été modifié.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button
                onClick={() => {
                  setProfileError(false);
                  setRetryKey((k) => k + 1);
                }}
                style={{ padding: "10px 20px", background: "#e0a13d", color: "#1a1306", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
              >
                Réessayer
              </button>
              <button
                onClick={logout}
                style={{ padding: "10px 20px", background: "transparent", border: "1px solid #e0a13d", color: "#e0a13d", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      ) : (
        !loading && children
      )}
    </AuthContext.Provider>
  );
}
