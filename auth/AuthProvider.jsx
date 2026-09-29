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
            setLoading(false);
            return;
          }

          const data = userDoc.data();

          if (data) {
            const roleValue = data.role || "athlete";
            const groupValue = data.group || "total";
            const superAdminValue = data.superAdmin === true;

            setUserRole(roleValue);
            setUserGroup(groupValue);
            setUserProfile(data);
            setIsSuperAdmin(superAdminValue);
          } else {
            setUserProfile(null);
            setIsSuperAdmin(false);
          }
        } catch (err) {
          console.error("Erreur lors du chargement du profil Firestore:", err.message);
          setUserProfile(null);
          setIsSuperAdmin(false);
        }
      } else {
        setUserRole("athlete");
        setUserGroup("total");
        setUserProfile(null);
        setIsSuperAdmin(false);
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
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
