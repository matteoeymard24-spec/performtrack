import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { athleteCanSeeWorkout, coachIdsOf } from "../component/coachScope";

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

  // ===== Portée coach : quels athlètes / séances ce compte a-t-il le droit de voir ? =====
  // Coach (admin) : ses athlètes (users.coachId == son uid).
  // Superadmin : tous les comptes sont chargés ; il voit les siens + ceux sans coach,
  // ou TOUT si l'interrupteur « tout voir » est activé (mémorisé sur l'appareil).
  const uid = currentUser?.uid || null;
  const rawAdmin = userRole === "admin" || isSuperAdmin;
  const seeAllKey = `pt_seeAll_${uid || "anon"}`;
  const [seeAllFlag, setSeeAllFlag] = useState(false);
  useEffect(() => {
    try {
      setSeeAllFlag(localStorage.getItem(seeAllKey) === "1");
    } catch (e) {
      setSeeAllFlag(false);
    }
  }, [seeAllKey]);
  const setSeeAll = (on) => {
    try {
      localStorage.setItem(seeAllKey, on ? "1" : "0");
    } catch (e) {
      /* stockage indisponible */
    }
    // Recharge : toutes les pages recalculent leurs listes avec la nouvelle portée.
    window.location.reload();
  };
  const [scopeMap, setScopeMap] = useState({}); // id -> [coachIds] (liste vide = sans coach)
  const [scopeReady, setScopeReady] = useState(false);
  const [scopeKey, setScopeKey] = useState(0);
  const refreshScope = useCallback(() => setScopeKey((k) => k + 1), []);
  useEffect(() => {
    if (!uid || !rawAdmin) {
      setScopeMap({});
      setScopeReady(true);
      return;
    }
    let cancelled = false;
    setScopeReady(false);
    (async () => {
      try {
        const snaps = isSuperAdmin
          ? [await getDocs(collection(db, "users"))]
          : await Promise.all([
              getDocs(query(collection(db, "users"), where("coachId", "==", uid))),
              getDocs(query(collection(db, "users"), where("coachIds", "array-contains", uid))),
            ]);
        if (cancelled) return;
        const map = {};
        snaps.forEach((snap) =>
          snap.docs.forEach((d) => {
            map[d.id] = coachIdsOf(d.data());
          })
        );
        setScopeMap(map);
      } catch (e) {
        console.warn("Portée coach: lecture des athlètes impossible", e);
        if (!cancelled) setScopeMap({});
      } finally {
        if (!cancelled) setScopeReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, rawAdmin, isSuperAdmin, scopeKey, retryKey]);

  const seeAll = isSuperAdmin && seeAllFlag;
  const ownsCoachId = useCallback(
    (coachIdsOfUser, userId) => {
      if (!rawAdmin) return false;
      if (userId && userId === uid) return true;
      const ids = Array.isArray(coachIdsOfUser) ? coachIdsOfUser : coachIdsOfUser ? [coachIdsOfUser] : [];
      if (isSuperAdmin) return seeAll || ids.length === 0 || ids.includes(uid);
      return ids.includes(uid);
    },
    [rawAdmin, isSuperAdmin, seeAll, uid]
  );
  // Ce document users (athlète) fait-il partie de mes athlètes ?
  const ownsUser = useCallback((u) => !!u && ownsCoachId(coachIdsOf(u), u.id), [ownsCoachId]);
  // Idem à partir d'un simple identifiant (séances ciblant un athlète...).
  const ownsId = useCallback(
    (id) => {
      if (!id) return false;
      if (id === uid) return true;
      if (!(id in scopeMap)) return isSuperAdmin; // inconnu : seul le superadmin le garde
      return ownsCoachId(scopeMap[id], id);
    },
    [scopeMap, ownsCoachId, isSuperAdmin, uid]
  );
  // Cette séance est-elle visible pour ce compte ?
  const canViewWorkout = useCallback(
    (w) => {
      if (!w) return false;
      if (rawAdmin && !previewAthlete) {
        if (isSuperAdmin && seeAll) return true;
        if (!w.createdBy || w.createdBy === uid) return true;
        if (w.targetUserId && ownsId(w.targetUserId)) return true;
        return false;
      }
      return athleteCanSeeWorkout(w, { id: uid, coachId: userProfile?.coachId || null, coachIds: userProfile?.coachIds || [] });
    },
    [rawAdmin, previewAthlete, isSuperAdmin, seeAll, uid, ownsId, userProfile]
  );
  // Ce groupe personnalisé est-il à moi ? (un coach ne voit que ses groupes)
  const ownsGroup = useCallback(
    (g) => {
      if (!rawAdmin) return true;
      if (isSuperAdmin && seeAll) return true;
      return g?.createdBy === uid || (isSuperAdmin && !g?.createdBy);
    },
    [rawAdmin, isSuperAdmin, seeAll, uid]
  );
  const coachScope = useMemo(
    () => ({ ready: scopeReady, seeAll, ownsUser, ownsId, ownsGroup, canViewWorkout, refresh: refreshScope, setSeeAll }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeReady, seeAll, ownsUser, ownsId, ownsGroup, canViewWorkout, refreshScope]
  );

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
    coachScope,
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
