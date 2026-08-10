import { db } from "../firebase";
import { collection, getDocs, updateDoc, doc, query, where, deleteDoc } from "firebase/firestore";
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
      <div style={{ padding: 20, textAlign: "center", color: "#ffffff" }}>
        Chargement de vos permissions...
      </div>
    );
  }

  // Si pas admin → redirection
  if (userRole !== "admin" && !isSuperAdmin) {
    console.log("[Athletes] Accès refusé - Redirection vers /");
    return <Navigate to="/" replace />;
  }

  const updateRole = async (id, role) => {
    try {
      await updateDoc(doc(db, "users", id), { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (err) {
      console.error("Erreur updateRole:", err);
      alert("Erreur lors de la mise à jour du rôle");
    }
  };

  const startEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      weight: user.weight || "",
      height: user.height || "",
      group: user.group || "avant",
    });
  };

  const saveEdit = async (userId) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        weight: editForm.weight ? Number(editForm.weight) : null,
        height: editForm.height ? Number(editForm.height) : null,
        group: editForm.group,
        updatedAt: new Date().toISOString(),
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                weight: editForm.weight ? Number(editForm.weight) : null,
                height: editForm.height ? Number(editForm.height) : null,
                group: editForm.group,
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
        color: "#ffffff",
        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
        minHeight: "100vh"
      }}>
        <div style={{ fontSize: 18, marginBottom: 10 }}>⏳ Chargement des athlètes...</div>
        <div style={{ fontSize: 14, color: "#888" }}>
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
        color: "#ffffff",
        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
        minHeight: "100vh"
      }}>
        <div style={{ fontSize: 18, marginBottom: 10, color: "#e74c3c" }}>
          ❌ Erreur de chargement
        </div>
        <div style={{ fontSize: 14, color: "#888", marginBottom: 20 }}>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            color: "white",
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
        background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
        minHeight: "100vh",
        color: "#ffffff",
      }}
    >
      <h2 style={{ marginBottom: 20, fontSize: 24, fontWeight: "bold" }}>
        👥 Gestion des Athlètes
      </h2>

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
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            border: "2px solid #2f80ed",
            borderRadius: 8,
            color: "#fff",
            fontSize: 16,
            outline: "none",
          }}
        />
      </div>

      {users.filter((u) => {
        if (!searchQuery.trim()) return true;
        const search = searchQuery.toLowerCase();
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(search) || email.includes(search);
      }).length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          Aucun utilisateur trouvé
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {users.filter((u) => {
            if (!searchQuery.trim()) return true;
            const search = searchQuery.toLowerCase();
            const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(search) || email.includes(search);
          }).map((user) => (
            <div
              key={user.id}
              style={{
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
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
                  <div style={{ color: "#888", fontSize: 14 }}>{user.email}</div>
                </div>
                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    background:
                      user.role === "admin"
                        ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
                        : "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  {user.role === "admin" ? "ADMIN" : "ATHLETE"}
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
                        background: "#0d0d0d",
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
                        background: "#0d0d0d",
                        color: "white",
                      }}
                    />
                  </div>

                  <select
                    value={editForm.group}
                    onChange={(e) =>
                      setEditForm({ ...editForm, group: e.target.value })
                    }
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      background: "#0d0d0d",
                      color: "white",
                    }}
                  >
                    <option value="avant">Avant</option>
                    <option value="trois quart">Trois Quart</option>
                    <option value="arrière">Arrière</option>
                  </select>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => saveEdit(user.id)}
                      style={{
                        flex: 1,
                        padding: 12,
                        background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                        boxShadow: "0 4px 15px rgba(17, 153, 142, 0.4)",
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
                      <div style={{ color: "#888", fontSize: 12, marginBottom: 3 }}>
                        Poids
                      </div>
                      <div style={{ fontSize: 16, fontWeight: "600" }}>
                        {user.weight ? `${user.weight} kg` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#888", fontSize: 12, marginBottom: 3 }}>
                        Taille
                      </div>
                      <div style={{ fontSize: 16, fontWeight: "600" }}>
                        {user.height ? `${user.height} cm` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#888", fontSize: 12, marginBottom: 3 }}>
                        Groupe
                      </div>
                      <div style={{ fontSize: 16, fontWeight: "600" }}>
                        {user.group === "avant"
                          ? "Avant"
                          : user.group === "trois quart"
                          ? "Trois Quart"
                          : user.group === "arrière"
                          ? "Arrière"
                          : user.group || "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => startEdit(user)}
                      style={{
                        flex: "1 1 120px",
                        padding: 12,
                        background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                        boxShadow: "0 4px 15px rgba(79, 172, 254, 0.4)",
                        transition: "all 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 20px rgba(79, 172, 254, 0.6)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 15px rgba(79, 172, 254, 0.4)";
                      }}
                    >
                      ✏️ Modifier
                    </button>

                    <button
                      onClick={() =>
                        updateRole(user.id, user.role === "admin" ? "athlete" : "admin")
                      }
                      style={{
                        flex: "1 1 120px",
                        padding: 12,
                        background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: "600",
                        boxShadow: "0 4px 15px rgba(245, 87, 108, 0.4)",
                        transition: "all 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 20px rgba(245, 87, 108, 0.6)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 15px rgba(245, 87, 108, 0.4)";
                      }}
                    >
                      {user.role === "admin" ? "👤 → Athlete" : "🛡️ → Admin"}
                    </button>

                    {isSuperAdmin && (
                      <button
                        onClick={() => deleteAthlete(user.id, user.email)}
                        style={{
                          flex: "1 1 120px",
                          padding: 12,
                          background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontWeight: "600",
                          boxShadow: "0 4px 15px rgba(255, 8, 68, 0.4)",
                          transition: "all 0.3s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = "translateY(-2px)";
                          e.target.style.boxShadow = "0 6px 20px rgba(255, 8, 68, 0.6)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = "translateY(0)";
                          e.target.style.boxShadow = "0 4px 15px rgba(255, 8, 68, 0.4)";
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
