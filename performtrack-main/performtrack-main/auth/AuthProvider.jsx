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
    console.log("\n\n========================================");
    console.log("🔐 AUTHPROVIDER - INITIALISATION");
    console.log("========================================");

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("\n📡 onAuthStateChanged triggered");
      console.log("user:", user);

      setCurrentUser(user);

      if (user) {
        console.log("\n✅ User connecté:");
        console.log("  UID:", user.uid);
        console.log("  Email:", user.email);

        try {
          console.log("\n📊 Chargement profil Firestore...");
          console.log("  Path: users/" + user.uid);

          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

          console.log("\n📄 Document Firestore:");
          console.log("  Exists?", userDoc.exists());

          if (!userDoc.exists()) {
            console.error("❌ DOCUMENT N'EXISTE PAS DANS FIRESTORE !");
            console.error(
              "  → Crée le document manuellement dans Firebase Console"
            );
            setUserProfile(null);
            setIsSuperAdmin(false);
            setUserRole("athlete");
            setUserGroup("total");
            setLoading(false);
            return;
          }

          const data = userDoc.data();
          console.log("\n📦 Données brutes du document:");
          console.log(JSON.stringify(data, null, 2));

          if (data) {
            const roleValue = data.role || "athlete";
            const groupValue = data.group || "total";
            const superAdminValue = data.superAdmin === true;

            console.log("\n🎯 VALEURS EXTRAITES:");
            console.log("  role:", roleValue, "(type:", typeof roleValue, ")");
            console.log(
              "  group:",
              groupValue,
              "(type:",
              typeof groupValue,
              ")"
            );
            console.log(
              "  superAdmin:",
              superAdminValue,
              "(type:",
              typeof superAdminValue,
              ")"
            );

            console.log("\n✅ MISE À JOUR STATE:");
            setUserRole(roleValue);
            setUserGroup(groupValue);
            setUserProfile(data);
            setIsSuperAdmin(superAdminValue);

            console.log("  → userRole SET TO:", roleValue);
            console.log("  → isSuperAdmin SET TO:", superAdminValue);

            // ✅ VÉRIFICATION CRITIQUE
            if (roleValue !== "admin" && roleValue !== "athlete") {
              console.warn("⚠️ ATTENTION: Role invalide détecté:", roleValue);
              console.warn(
                "  → Les valeurs acceptées sont: 'admin' ou 'athlete'"
              );
            }

            if (data.role === undefined) {
              console.warn("⚠️ ATTENTION: Champ 'role' absent du document !");
              console.warn(
                "  → Ajoute le champ 'role: admin' dans Firebase Console"
              );
            }
          } else {
            console.error("❌ data est null/undefined !");
            setUserProfile(null);
            setIsSuperAdmin(false);
          }
        } catch (err) {
          console.error("\n❌ ERREUR lors du chargement Firestore:");
          console.error(err);
          setUserProfile(null);
          setIsSuperAdmin(false);
        }
      } else {
        console.log("\n❌ Aucun user connecté (déconnecté)");
        setUserRole("athlete");
        setUserGroup("total");
        setUserProfile(null);
        setIsSuperAdmin(false);
      }

      console.log("\n🏁 AuthProvider - État final:");
      console.log("  currentUser:", user?.email || "null");
      console.log("  userRole:", userRole);
      console.log("  isSuperAdmin:", isSuperAdmin);
      console.log("========================================\n");

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = () => {
    console.log("🚪 Déconnexion...");
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
