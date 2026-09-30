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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

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
          setUserProfile(null);
          setIsSuperAdmin(false);
          setUserStatus("approved");
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
  }, []);

  const logout = () => {
    return auth.signOut();
  };

  const value = {
    currentUser,
    userRole,
    userGroup,
    userProfile,
    isSuperAdmin,
    userStatus,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
