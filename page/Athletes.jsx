import { db } from "../firebase";
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, query, where, deleteDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Navigate } from "react-router-dom";

export default function Athletes() {
  const { userRole, isSuperAdmin, currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  console.log("[Athletes] Render - userRole:", userRole, "isSuperAdmin:", isSuperAdmin);

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
        
        const snap = await getDocs(collection(db, "users"));
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
  const pendingUsers = users.filter((u) => u.status === "pending");

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
    } catch (err) {
      console.error("Erreur approveUser:", err);
      alert("Erreur lors de la validation de l'accès");
    }
  };

  const rejectUser = async (id) => {
    if (!window.confirm("Refuser l'accès à cet athlète ?")) return;
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
      weight: user.weight || "",
      height: user.height || "",
    });
  };

  const saveEdit = async (userId) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        weight: editForm.weight ? Number(editForm.weight) : null,
        height: editForm.height ? Number(editForm.height) : null,
        updatedAt: new Date().toISOString(),
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
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
      `• Tous ses RM\n` +
      `• Tout son historique de poids\n\n` +
      `Tapez "SUPPRIMER" en majuscules pour confirmer :`
    );

    if (confirmation !== "SUPPRIMER") {
      alert("Suppression annulée");
      return;
    }

    try {
      console.log("[DeleteAthlete] Début suppression pour:", userId);
      
      // 1. Supprimer wellness
      const wellnessSnap = await getDocs(
        query(collection(db, "wellness"), where("userId", "==", userId))
      );
      console.log("[DeleteAthlete] Wellness à supprimer:", wellnessSnap.docs.length);
      for (const d of wellnessSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Supprimer workouts individuels
      const workoutSnap = await getDocs(
        query(collection(db, "workout"), where("targetUserId", "==", userId))
      );
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
    <div
      style={{
        padding: 20,
        background: "#0d0c0a",
        minHeight: "100vh",
        color: "#f3f0ea",
      }}
    >
      <h2 style={{ marginBottom: 20, fontSize: 24, fontWeight: "bold" }}>
        👥 Gestion des Athlètes
      </h2>

      {pendingUsers.length > 0 && (
        <div
          style={{
            background: "#1a1815",
            border: "2px solid #e0a13d",
            borderRadius: 12,
            padding: 20,
            marginBottom: 25,
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", fontSize: 17, color: "#e0a13d" }}>
            🔔 Demandes d'accès en attente ({pendingUsers.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  </div>
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
          </div>
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="🔍 Rechercher un athlète par nom ou email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#151310",
            border: "2px solid #e0a13d",
            borderRadius: 8,
            color: "#f3f0ea",
            fontSize: 16,
            outline: "none",
          }}
        />
      </div>

      {users.filter((u) => {
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
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {users.filter((u) => {
            if (u.status === "pending") return false; // déjà affichés ci-dessus
            if (!searchQuery.trim()) return true;
            const search = searchQuery.toLowerCase();
            const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(search) || email.includes(search);
          }).map((user) => (
            <div
              key={user.id}
              style={{
                background: "#151310",
                padding: 20,
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 15,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 5 }}>
                    {user.firstName || "Sans nom"} {user.lastName || ""}
                  </div>
                  <div style={{ color: "#a8a199", fontSize: 14 }}>{user.email}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
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
                      boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    {user.role === "admin" ? "ADMIN" : "ATHLETE"}
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

              {editingUser === user.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                        boxShadow: "0 4px 15px rgba(79, 174, 125, 0.4)",
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
                        boxShadow: "0 4px 15px rgba(224, 161, 61, 0.4)",
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

                    {!(
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
                          boxShadow: "0 4px 15px rgba(0, 0, 0, 0.35)",
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
                          boxShadow: "0 4px 15px rgba(217, 105, 90, 0.4)",
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
