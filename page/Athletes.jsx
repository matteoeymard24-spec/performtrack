import { db } from "../firebase";
import { getWorkoutDocs, getScopedUserDocs } from "../component/workoutQueries";
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, query, where, deleteDoc } from "firebase/firestore";
import { useEffect, useState, useRef } from "react";
import { generateCoachCode } from "../component/coachScope";
import { useAuth } from "../auth/AuthProvider";
import { Page, CARD_STYLE, CARD_ACCENT_BORDER, CARD_TITLE, PAGE_TITLE, FIELD_STYLE, FoldBtn } from "../component/ui";
import { Navigate } from "react-router-dom";
import { appConfirm, appAlert as alert } from "../component/appDialog";

// Durée de vie d'une archive d'athlète supprimé : passé ce délai, ses RM /
// tests ne sont plus représentatifs (progrès ou régression) → supprimée.
const ARCHIVE_TTL_DAYS = 60;
const ARCHIVE_TTL_MS = ARCHIVE_TTL_DAYS * 86400000;

export default function Athletes() {
  const { userRole, isSuperAdmin, currentUser, userProfile, coachScope } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  // Fiches athlètes repliées par défaut (liste plus lisible) ; en édition elle s'ouvre seule.
  const [openUsers, setOpenUsers] = useState({});
  const [pendingOpen, setPendingOpen] = useState(true);

  console.log("[Athletes] Render - userRole:", userRole, "isSuperAdmin:", isSuperAdmin);

  // Nettoyage automatique : archives d'athlètes supprimés dépassant leur durée
  // de vie → supprimées définitivement à l'ouverture de cette page.
  useEffect(() => {
    if (!currentUser || (userRole !== "admin" && !isSuperAdmin)) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "archivedAthletes"));
        for (const d of snap.docs) {
          const exp = d.data().expiresAt;
          if (!exp || new Date(exp).getTime() < Date.now()) await deleteDoc(d.ref);
        }
      } catch (e) {
        console.warn("Purge archives:", e);
      }
    })();
  }, [currentUser, userRole, isSuperAdmin]);

  useEffect(() => {
    let isMounted = true;
    let timeout = null;
    console.log("[Athletes] useEffect - Démarrage");

    const fetchUsers = async () => {
      // Vérification rapide sans bloquer le useEffect
      if (!currentUser) {
        console.log("[Athletes] Pas de currentUser - Attente");
        setLoading(false);
        if (timeout) clearTimeout(timeout);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log("[Athletes] Requête Firestore - collection(users)");
        
        const snap = await getScopedUserDocs();
        console.log("[Athletes] Firestore - Réponse reçue:", snap.docs.length, "documents");
        
        if (!isMounted) {
          console.log("[Athletes] Composant démonté - Annulation");
          if (timeout) clearTimeout(timeout);
          return;
        }

        const usersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Trier par nom ou email (avec vérification stricte)
        usersData.sort((a, b) => {
          // Construire les noms avec fallback
          let nameA = a.firstName || a.lastName || a.email || a.id || "Inconnu";
          let nameB = b.firstName || b.lastName || b.email || b.id || "Inconnu";
          
          // S'assurer que ce sont des strings
          if (typeof nameA !== 'string') nameA = String(nameA);
          if (typeof nameB !== 'string') nameB = String(nameB);
          
          return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
        });
        
        console.log("[Athletes] Users triés:", usersData.length);
        setUsers(usersData);
        setLoading(false);
        if (timeout) clearTimeout(timeout); // Clear le timeout si succès
      } catch (err) {
        console.error("[Athletes] Erreur fetchUsers:", err);
        if (timeout) clearTimeout(timeout); // Clear le timeout en cas d'erreur
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    // Timeout de sécurité (10 secondes)
    timeout = setTimeout(() => {
      if (isMounted) {
        console.error("[Athletes] TIMEOUT - La requête a pris plus de 10 secondes");
        setError("La requête a pris trop de temps. Vérifiez votre connexion.");
        setLoading(false);
      }
    }, 10000);

    fetchUsers();

    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
      console.log("[Athletes] useEffect - Cleanup");
    };
  }, []); // Pas de dépendances = s'exécute UNE SEULE FOIS
  
  // ===================== CODE COACH + RATTACHEMENT =====================
  const [myCode, setMyCode] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const codeInit = useRef(false);
  const displayNameOf = (u) =>
    `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.displayName || u?.email || "Coach";

  const createCoachCode = async (oldCode) => {
    if (!currentUser) return null;
    for (let i = 0; i < 8; i++) {
      const code = generateCoachCode();
      const ref = doc(db, "coachCodes", code);
      const ex = await getDoc(ref);
      if (ex.exists()) continue;
      await setDoc(ref, {
        coachId: currentUser.uid,
        coachName: displayNameOf(userProfile),
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "users", currentUser.uid), { coachCode: code });
      if (oldCode && oldCode !== code) {
        try {
          await deleteDoc(doc(db, "coachCodes", oldCode));
        } catch (e) {
          console.warn("Ancien code coach non supprimé:", e);
        }
      }
      setMyCode(code);
      return code;
    }
    return null;
  };

  // Un coach sans code en reçoit un automatiquement à l'ouverture de la page.
  useEffect(() => {
    if (!currentUser || !userProfile || (userRole !== "admin" && !isSuperAdmin)) return;
    if (userProfile.coachCode) {
      setMyCode(userProfile.coachCode);
      return;
    }
    if (codeInit.current) return;
    codeInit.current = true;
    createCoachCode(null).catch((e) => {
      console.error("Création du code coach:", e);
      codeInit.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userProfile, userRole, isSuperAdmin]);

  const regenerateCode = async () => {
    if (!await appConfirm("Générer un nouveau code ? L'ancien ne fonctionnera plus pour les nouvelles inscriptions (tes athlètes déjà rattachés ne changent pas).")) return;
    setCodeBusy(true);
    try {
      await createCoachCode(myCode);
    } catch (e) {
      alert("❌ Impossible de générer le code : " + e.message);
    } finally {
      setCodeBusy(false);
    }
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      alert("📋 Code copié : " + myCode);
    } catch (e) {
      alert("Ton code : " + myCode);
    }
  };

  // Rattache un athlète déjà inscrit à un coach (superadmin uniquement).
  const assignCoach = async (id, coachId) => {
    try {
      await updateDoc(doc(db, "users", id), { coachId: coachId || null });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, coachId: coachId || null } : u)));
      coachScope?.refresh?.();
    } catch (err) {
      console.error("Erreur assignCoach:", err);
      alert("❌ Rattachement impossible : " + err.message);
    }
  };

  // 🔒 Sécurité FRONT : Attendre que userRole soit chargé
  if (userRole === undefined || userRole === null) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#f3f0ea" }}>
        Chargement de vos permissions...
      </div>
    );
  }

  // Si pas admin → redirection
  if (userRole !== "admin" && !isSuperAdmin) {
    console.log("[Athletes] Accès refusé - Redirection vers /");
    return <Navigate to="/" replace />;
  }

  const updateRole = async (id, role, email) => {
    // Garde-fou : le créateur de l'app ne peut jamais être rétrogradé en
    // athlète, même si ce bouton venait à être ré-affiché par erreur.
    if (role === "athlete" && (email || "").toLowerCase() === "matteo.eymard24@gmail.com") {
      alert("Ce compte est le créateur de l'application, il ne peut pas être rétrogradé en athlète.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", id), { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (err) {
      console.error("Erreur updateRole:", err);
      alert("Erreur lors de la mise à jour du rôle");
    }
  };

  // ===================== AUTORISATION D'ACCÈS (1ère connexion) =====================
  // Un athlète qui s'inscrit lui-même arrive avec status: "pending" (voir
  // Login.jsx) et reste bloqué par ProtectedRoute.jsx tant que le coach n'a
  // pas approuvé ou refusé sa demande ici.
  // Portée coach : un coach ne voit que ses athlètes ; le superadmin voit les siens + les
  // athlètes sans coach (tout si l'interrupteur « tout voir » est activé) et les coachs.
  const scopedUsers = users.filter((u) => {
    if (u.id === currentUser?.uid) return !!isSuperAdmin;
    if (u.role === "admin" || u.superAdmin === true) return !!isSuperAdmin;
    return coachScope ? coachScope.ownsUser(u) : true;
  });
  const coachNameById = {};
  users.forEach((u) => {
    if (u.role === "admin" || u.superAdmin === true) coachNameById[u.id] = displayNameOf(u);
  });
  const coachList = users.filter((u) => u.role === "admin" || u.superAdmin === true);
  const pendingUsers = scopedUsers.filter((u) => u.status === "pending");

  // Initialise "Mes RM" pour un athlète qui vient d'être approuvé : une
  // fiche (en attente, kg: null) pour chaque exercice déjà catégorisé dans
  // la banque d'exercices (hors échauffement/PDC/masqués), comme le fait
  // déjà "propagateExerciseToAllAthletes" côté Workout.jsx pour les
  // athlètes existants à chaque (re)catégorisation. Sans ça, un athlète créé
  // APRÈS la catégorisation d'un exercice n'a jamais reçu sa fiche — "Mes
  // RM" restait vide tant qu'aucun exercice n'était re-catégorisé.
  const initRMForNewAthlete = async (uid) => {
    try {
      const catalogSnap = await getDocs(collection(db, "exerciseMedia"));
      const entries = catalogSnap.docs.filter((d) => {
        const data = d.data();
        return data.category && !data.isWarmup && !data.isPDC && !data.hidden;
      });
      for (const entry of entries) {
        const rmRef = doc(db, "users", uid, "rm", entry.id);
        const rmSnap = await getDoc(rmRef);
        if (rmSnap.exists()) continue;
        await setDoc(rmRef, {
          kg: null,
          exerciseName: entry.id,
          category: entry.data().category,
          autoCreated: true,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Erreur initialisation Mes RM pour nouvel athlète:", e);
    }
  };

  const approveUser = async (id) => {
    try {
      await updateDoc(doc(db, "users", id), { status: "approved" });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "approved" } : u))
      );
      await initRMForNewAthlete(id);
      // Retour d'un athlète supprimé avec archive : on lui rend ses RM / tests / poids.
      try {
        const arch = await getDoc(doc(db, "archivedAthletes", id));
        if (arch.exists()) {
          const a = arch.data();
          const expired = !a.expiresAt || new Date(a.expiresAt).getTime() < Date.now();
          if (expired) {
            await deleteDoc(arch.ref);
            alert(`🗑️ Son archive datait de plus de ${ARCHIVE_TTL_DAYS} jours : supprimée, ses RM repartent de zéro.`);
            return;
          }
          for (const sub of ["rm", "tests", "weight_history"]) {
            for (const it of a[sub] || []) {
              await setDoc(doc(db, "users", id, sub, it.id), it.data);
            }
          }
          await deleteDoc(arch.ref);
          alert("♻️ Ses anciens RM, tests et historique de poids ont été restaurés.");
        }
      } catch (e) {
        console.error("Restauration archive:", e);
      }
    } catch (err) {
      console.error("Erreur approveUser:", err);
      alert("Erreur lors de la validation de l'accès");
    }
  };

  const rejectUser = async (id) => {
    if (!await appConfirm("Refuser l'accès à cet athlète ?")) return;
    try {
      await updateDoc(doc(db, "users", id), { status: "rejected" });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "rejected" } : u))
      );
    } catch (err) {
      console.error("Erreur rejectUser:", err);
      alert("Erreur lors du refus de l'accès");
    }
  };

  const startEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      weight: user.weight || "",
      height: user.height || "",
    });
  };

  const saveEdit = async (userId) => {
    try {
      const firstName = (editForm.firstName || "").trim();
      const lastName = (editForm.lastName || "").trim();
      const email = (editForm.email || "").trim();
      const displayName = `${firstName} ${lastName}`.trim() || email || null;
      await updateDoc(doc(db, "users", userId), {
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        displayName,
        weight: editForm.weight ? Number(editForm.weight) : null,
        height: editForm.height ? Number(editForm.height) : null,
        updatedAt: new Date().toISOString(),
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                firstName: firstName || null,
                lastName: lastName || null,
                email: email || null,
                displayName,
                weight: editForm.weight ? Number(editForm.weight) : null,
                height: editForm.height ? Number(editForm.height) : null,
              }
            : u
        )
      );

      setEditingUser(null);
      setEditForm({});
    } catch (error) {
      console.error("Erreur saveEdit:", error);
      alert("Erreur lors de la mise à jour");
    }
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setEditForm({});
  };

  const deleteAthlete = async (userId, userEmail) => {
    if (!isSuperAdmin) {
      alert("Seuls les superadmins peuvent supprimer des utilisateurs");
      return;
    }

    // Garde-fou : le créateur de l'app ne peut jamais être supprimé, même si
    // ce bouton venait à être ré-affiché par erreur pour ce compte.
    if ((userEmail || "").toLowerCase() === "matteo.eymard24@gmail.com") {
      alert("Ce compte est le créateur de l'application, il ne peut pas être supprimé.");
      return;
    }

    const confirmation = prompt(
      `⚠️ ATTENTION : Cette action est IRRÉVERSIBLE !\n\n` +
      `Vous êtes sur le point de supprimer DÉFINITIVEMENT :\n` +
      `• L'utilisateur : ${userEmail}\n` +
      `• Toutes ses données wellness\n` +
      `• Tous ses workouts individuels\n` +
      `• Tous ses RM, tests, blessures, cycles individuels\n` +
      `• Il sera retiré de tous ses groupes\n` +
      `• Tout son historique de poids\n\n` +
      `Tapez "SUPPRIMER" en majuscules pour confirmer :`
    );

    if (confirmation !== "SUPPRIMER") {
      alert("Suppression annulée");
      return;
    }

    // Option : garder une archive de ses RM / tests / poids. S'il revient
    // (même compte), elle est restaurée automatiquement à la validation de
    // son accès. OK = archiver, Annuler = tout effacer sans rien garder.
    const keepArchive = await appConfirm(
      "Garder une ARCHIVE de ses RM, tests et historique de poids ?\n\n" +
        `• Archiver : mis de côté ${ARCHIVE_TTL_DAYS} jours, restaurés s'il revient dans ce délai (même compte), puis supprimés définitivement.\n` +
        "• Tout effacer : rien n'est conservé.",
      { ok: "Archiver", cancel: "Tout effacer", danger: false }
    );

    try {
      console.log("[DeleteAthlete] Début suppression pour:", userId);

      // 0. Archive optionnelle (écrite AVANT toute suppression)
      if (keepArchive) {
        const dump = async (sub) =>
          (await getDocs(collection(db, "users", userId, sub))).docs.map((d) => ({ id: d.id, data: d.data() }));
        const [rmA, testsA, weightA] = await Promise.all([dump("rm"), dump("tests"), dump("weight_history")]);
        await setDoc(doc(db, "archivedAthletes", userId), {
          email: userEmail || "",
          archivedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
          rm: rmA,
          tests: testsA,
          weight_history: weightA,
        });
      }

      // 0b. Sortir l'athlète de tous ses groupes / sous-groupes
      const groupsSnap = await getDocs(collection(db, "groups"));
      for (const g of groupsSnap.docs) {
        const gd = g.data();
        const inGroup = (gd.athleteIds || []).includes(userId);
        const inSub = (gd.subGroups || []).some((sg) => (sg.athleteIds || []).includes(userId));
        if (!inGroup && !inSub) continue;
        await updateDoc(g.ref, {
          athleteIds: (gd.athleteIds || []).filter((id) => id !== userId),
          subGroups: (gd.subGroups || []).map((sg) => ({
            ...sg,
            athleteIds: (sg.athleteIds || []).filter((id) => id !== userId),
          })),
        });
      }

      // 0b-bis. Compte coach supprimé : ses athlètes repassent « sans coach »
      // (ils réapparaissent chez le superadmin) et son code ne sert plus.
      const asCoach = await getDocs(query(collection(db, "users"), where("coachId", "==", userId)));
      for (const d of asCoach.docs) await updateDoc(d.ref, { coachId: null });
      const codes = await getDocs(query(collection(db, "coachCodes"), where("coachId", "==", userId)));
      for (const d of codes.docs) await deleteDoc(d.ref);

      // 0c. Blessures, tests, cycles / échéances individuels
      const injSnap = await getDocs(query(collection(db, "injuries"), where("userId", "==", userId)));
      for (const d of injSnap.docs) await deleteDoc(d.ref);
      const testsSnap = await getDocs(collection(db, "users", userId, "tests"));
      for (const d of testsSnap.docs) await deleteDoc(d.ref);
      for (const col of ["cycles", "fixtures"]) {
        const sn = await getDocs(query(collection(db, col), where("scope", "==", "user:" + userId)));
        for (const d of sn.docs) await deleteDoc(d.ref);
      }
      
      // 1. Supprimer wellness
      const wellnessSnap = await getDocs(
        query(collection(db, "wellness"), where("userId", "==", userId))
      );
      console.log("[DeleteAthlete] Wellness à supprimer:", wellnessSnap.docs.length);
      for (const d of wellnessSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Supprimer workouts individuels
      const allWorkoutSnap = await getWorkoutDocs();
      const workoutSnap = {
        docs: allWorkoutSnap.docs.filter(
          (d) => d.data().targetUserId === userId
        ),
      };
      console.log("[DeleteAthlete] Workouts à supprimer:", workoutSnap.docs.length);
      for (const d of workoutSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 3. Supprimer RM subcollection
      const rmSnap = await getDocs(collection(db, "users", userId, "rm"));
      console.log("[DeleteAthlete] RM à supprimer:", rmSnap.docs.length);
      for (const d of rmSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 4. Supprimer weight_history subcollection
      const weightSnap = await getDocs(
        collection(db, "users", userId, "weight_history")
      );
      console.log("[DeleteAthlete] Weight history à supprimer:", weightSnap.docs.length);
      for (const d of weightSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 5. Supprimer le document user
      await deleteDoc(doc(db, "users", userId));
      console.log("[DeleteAthlete] User supprimé");

      // Mettre à jour l'UI
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      alert("✅ Utilisateur supprimé avec succès");
    } catch (err) {
      console.error("[DeleteAthlete] Erreur:", err);
      alert("❌ Erreur lors de la suppression : " + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        padding: 20, 
        textAlign: "center", 
        color: "#f3f0ea",
        background: "#0d0c0a",
        minHeight: "100vh"
      }}>
        <div style={{ fontSize: 18, marginBottom: 10 }}>⏳ Chargement des athlètes...</div>
        <div style={{ fontSize: 14, color: "#a8a199" }}>
          Si le chargement dure plus de 10 secondes, vérifiez votre connexion.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: 20, 
        textAlign: "center", 
        color: "#f3f0ea",
        background: "#0d0c0a",
        minHeight: "100vh"
      }}>
        <div style={{ fontSize: 18, marginBottom: 10, color: "#d9695a" }}>
          ❌ Erreur de chargement
        </div>
        <div style={{ fontSize: 14, color: "#a8a199", marginBottom: 20 }}>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 24px",
            background: "#e0a13d",
            color: "#1a1306",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          🔄 Réessayer
        </button>
      </div>
    );
  }

  return (
    <Page>
      <h2 style={{ ...PAGE_TITLE, marginBottom: 18 }}>👥 Gestion des Athlètes</h2>

      {/* Mon code coach : à donner aux athlètes pour qu'ils te rejoignent à l'inscription */}
      <div style={{ ...CARD_STYLE, border: CARD_ACCENT_BORDER }}>
        <h3 style={{ ...CARD_TITLE, marginBottom: 8 }}>🔑 Mon code coach</h3>
        <div style={{ fontSize: 13, color: "#a8a199", marginBottom: 10, lineHeight: 1.5 }}>
          Donne ce code à tes athlètes : ils le saisissent à l'inscription, leur demande arrive ici et tu les
          autorises. Tu ne vois que tes athlètes et leurs séances.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 4,
              color: "#e0a13d",
              background: "#151310",
              padding: "8px 16px",
              borderRadius: 10,
              minWidth: 150,
              textAlign: "center",
            }}
          >
            {myCode || "…"}
          </div>
          <button
            onClick={copyCode}
            disabled={!myCode}
            style={{ padding: "10px 16px", background: "#e0a13d", color: "#1a1306", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, minHeight: 44 }}
          >
            📋 Copier
          </button>
          <button
            onClick={regenerateCode}
            disabled={codeBusy || !myCode}
            style={{ padding: "10px 16px", background: "transparent", color: "#a8a199", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, cursor: "pointer", minHeight: 44 }}
          >
            🔄 Nouveau code
          </button>
        </div>
        {isSuperAdmin && (
          <div style={{ fontSize: 12, color: "#a8a199", marginTop: 12 }}>
            Mode superadmin : {coachScope?.seeAll ? "tu vois TOUS les athlètes de tous les coachs" : "tu vois tes athlètes + ceux sans coach"}.
            {" "}
            <button
              onClick={() => coachScope?.setSeeAll?.(!coachScope.seeAll)}
              style={{ background: "none", border: "none", color: "#e0a13d", cursor: "pointer", textDecoration: "underline", fontSize: 12, padding: 0 }}
            >
              {coachScope?.seeAll ? "Revenir à mes athlètes" : "Tout voir"}
            </button>
          </div>
        )}
      </div>

      {pendingUsers.length > 0 && (
        <div style={{ ...CARD_STYLE, border: CARD_ACCENT_BORDER }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: pendingOpen ? 14 : 0 }}>
            <h3 style={{ ...CARD_TITLE, color: "#e0a13d" }}>
              🔔 Demandes d'accès en attente ({pendingUsers.length})
            </h3>
            <FoldBtn open={pendingOpen} onClick={() => setPendingOpen((v) => !v)} />
          </div>
          {pendingOpen && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  background: "#151310",
                  padding: 14,
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold" }}>{u.email}</div>
                  <div style={{ fontSize: 12, color: "#a8a199" }}>
                    Souhaite rejoindre en tant qu'athlète
                    {u.coachId ? ` · code de ${coachNameById[u.coachId] || "un coach"}` : " · sans code coach"}
                  </div>
                  {isSuperAdmin && (
                    <select
                      value={u.coachId || ""}
                      onChange={(e) => assignCoach(u.id, e.target.value)}
                      style={{ marginTop: 6, background: "#1a1815", color: "#f3f0ea", border: "1px solid #2a2620", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
                    >
                      <option value="">Aucun coach</option>
                      {coachList.map((c) => (
                        <option key={c.id} value={c.id}>{displayNameOf(c)}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => approveUser(u.id)}
                    style={{
                      padding: "8px 16px",
                      background: "#4fae7d",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    ✅ Autoriser
                  </button>
                  <button
                    onClick={() => rejectUser(u.id)}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      color: "#d9695a",
                      border: "1px solid #d9695a",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    ❌ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="🔍 Rechercher un athlète par nom ou email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={FIELD_STYLE}
        />
      </div>

      {scopedUsers.filter((u) => {
        if (u.status === "pending") return false; // déjà affichés ci-dessus
        if (!searchQuery.trim()) return true;
        const search = searchQuery.toLowerCase();
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(search) || email.includes(search);
      }).length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#a8a199" }}>
          Aucun utilisateur trouvé
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scopedUsers.filter((u) => {
            if (u.status === "pending") return false; // déjà affichés ci-dessus
            if (!searchQuery.trim()) return true;
            const search = searchQuery.toLowerCase();
            const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(search) || email.includes(search);
          }).map((user) => (
            <div
              key={user.id}
              style={{ ...CARD_STYLE, marginBottom: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: openUsers[user.id] || editingUser === user.id ? 15 : 0,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 5 }}>
                    {user.firstName || "Sans nom"} {user.lastName || ""}
                  </div>
                  <div
                    style={{
                      color: user.email ? "#a8a199" : "#d9695a",
                      fontSize: 14,
                      fontStyle: user.email ? "normal" : "italic",
                    }}
                  >
                    {user.email || "Email non renseigné"}
                  </div>
                  {user.role !== "admin" && (
                    <div style={{ fontSize: 12, color: user.coachId ? "#e0a13d" : "#6f6a62", marginTop: 3 }}>
                      🎯 {user.coachId ? `Coach : ${coachNameById[user.coachId] || "—"}` : "Sans coach"}
                    </div>
                  )}
                  {user.role === "admin" && user.coachCode && isSuperAdmin && (
                    <div style={{ fontSize: 12, color: "#a8a199", marginTop: 3 }}>🔑 Code : {user.coachCode}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      background:
                        user.role === "admin"
                          ? "#2a2620"
                          : "#e0a13d",
                      color: user.role === "admin" ? "#f3f0ea" : "#1a1306",
                                          }}
                  >
                    {user.role === "admin" ? "ADMIN" : "ATHLETE"}
                  </div>
                  <FoldBtn
                    open={!!openUsers[user.id] || editingUser === user.id}
                    onClick={() => setOpenUsers((p) => ({ ...p, [user.id]: !p[user.id] }))}
                  />
                  </div>
                  {user.status === "rejected" && (
                    <button
                      onClick={() => approveUser(user.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 14,
                        fontSize: 10,
                        fontWeight: "700",
                        textTransform: "uppercase",
                        background: "rgba(217,105,90,0.14)",
                        color: "#d9695a",
                        border: "1px solid rgba(217,105,90,0.4)",
                        cursor: "pointer",
                      }}
                      title="Cliquer pour autoriser l'accès malgré tout"
                    >
                      🚫 Refusé — réautoriser
                    </button>
                  )}
                </div>
              </div>

              {(openUsers[user.id] || editingUser === user.id) && (editingUser === user.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Prénom"
                      value={editForm.firstName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, firstName: e.target.value })
                      }
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "#151310",
                        color: "white",
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Nom"
                      value={editForm.lastName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lastName: e.target.value })
                      }
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "#151310",
                        color: "white",
                      }}
                    />
                  </div>

                  <input
                    type="email"
                    placeholder="Email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      background: "#151310",
                      color: "white",
                    }}
                  />

                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="number"
                      placeholder="Poids (kg)"
                      value={editForm.weight}
                      onChange={(e) =>
                        setEditForm({ ...editForm, weight: e.target.value })
                      }
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "#151310",
                        color: "white",
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Taille (cm)"
                      value={editForm.height}
                      onChange={(e) =>
                        setEditForm({ ...editForm, height: e.target.value })
                      }
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "#151310",
                        color: "white",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => saveEdit(user.id)}
                      style={{
                        flex: 1,
                        padding: 12,
                        background: "#4fae7d",
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                                              }}
                    >
                      ✅ Enregistrer
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        flex: 1,
                        padding: 12,
                        background: "rgba(255, 255, 255, 0.1)",
                        color: "white",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                      }}
                    >
                      ❌ Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 10,
                      marginBottom: 15,
                    }}
                  >
                    <div>
                      <div style={{ color: "#a8a199", fontSize: 12, marginBottom: 3 }}>
                        Poids
                      </div>
                      <div style={{ fontSize: 16, fontWeight: "600" }}>
                        {user.weight ? `${user.weight} kg` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#a8a199", fontSize: 12, marginBottom: 3 }}>
                        Taille
                      </div>
                      <div style={{ fontSize: 16, fontWeight: "600" }}>
                        {user.height ? `${user.height} cm` : "—"}
                      </div>
                    </div>
                  </div>

                  {isSuperAdmin && user.role !== "admin" && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ color: "#a8a199", fontSize: 12, marginBottom: 4 }}>Coach de cet athlète</div>
                      <select
                        value={user.coachId || ""}
                        onChange={(e) => assignCoach(user.id, e.target.value)}
                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "#151310", color: "#f3f0ea", border: "1px solid rgba(255,255,255,0.12)", fontSize: 15 }}
                      >
                        <option value="">— Aucun coach (visible par le superadmin) —</option>
                        {coachList.map((c) => (
                          <option key={c.id} value={c.id}>{displayNameOf(c)}{c.id === currentUser?.uid ? " (moi)" : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => startEdit(user)}
                      style={{
                        flex: "1 1 120px",
                        padding: 12,
                        background: "#e0a13d",
                        color: "#1a1306",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                                                transition: "all 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 20px rgba(224, 161, 61, 0.6)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 15px rgba(224, 161, 61, 0.4)";
                      }}
                    >
                      ✏️ Modifier
                    </button>

                    {isSuperAdmin && !(
                      user.role === "admin" &&
                      (user.email || "").toLowerCase() === "matteo.eymard24@gmail.com"
                    ) && (
                      <button
                        onClick={() =>
                          updateRole(
                            user.id,
                            user.role === "admin" ? "athlete" : "admin",
                            user.email
                          )
                        }
                        style={{
                          flex: "1 1 120px",
                          padding: 12,
                          background: "#2a2620",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontWeight: "600",
                                                    transition: "all 0.3s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = "translateY(-2px)";
                          e.target.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.45)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = "translateY(0)";
                          e.target.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.35)";
                        }}
                      >
                        {user.role === "admin" ? "👤 → Athlete" : "🛡️ → Admin"}
                      </button>
                    )}

                    {isSuperAdmin &&
                      (user.email || "").toLowerCase() !==
                        "matteo.eymard24@gmail.com" && (
                      <button
                        onClick={() => deleteAthlete(user.id, user.email)}
                        style={{
                          flex: "1 1 120px",
                          padding: 12,
                          background: "#d9695a",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontWeight: "600",
                                                    transition: "all 0.3s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = "translateY(-2px)";
                          e.target.style.boxShadow = "0 6px 20px rgba(217, 105, 90, 0.6)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = "translateY(0)";
                          e.target.style.boxShadow = "0 4px 15px rgba(217, 105, 90, 0.4)";
                        }}
                      >
                        🗑️ Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
