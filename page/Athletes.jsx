import { db } from "../firebase";
import { collection, getDocs, updateDoc, doc, deleteDoc, query, where } from "firebase/firestore";
import { getAuth, deleteUser as deleteAuthUser } from "firebase/auth";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Navigate } from "react-router-dom";

export default function Athletes() {
  const { userRole, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  if (userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const usersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      usersData.sort((a, b) => {
        const nameA = a.firstName || a.email;
        const nameB = b.firstName || b.email;
        return nameA.localeCompare(nameB);
      });
      setUsers(usersData);
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const updateRole = async (id, role) => {
    await updateDoc(doc(db, "users", id), { role });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  };

  const deleteAthlete = async (user) => {
    const confirmMsg = `⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de SUPPRIMER DÉFINITIVEMENT :\n\n${user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}\n\nCela supprimera :\n✗ Le compte utilisateur\n✗ Toutes les données wellness\n✗ Tous les workouts\n✗ Toutes les données RM\n\nCette action est IRRÉVERSIBLE !\n\nTapez "SUPPRIMER" pour confirmer :`;
    
    const confirmation = window.prompt(confirmMsg);
    
    if (confirmation !== "SUPPRIMER") {
      alert("Suppression annulée");
      return;
    }

    try {
      // 1. Supprimer toutes les données wellness
      const wellnessSnap = await getDocs(
        query(collection(db, "wellness"), where("userId", "==", user.id))
      );
      for (const d of wellnessSnap.docs) {
        await deleteDoc(doc(db, "wellness", d.id));
      }

      // 2. Supprimer tous les workouts individuels
      const workoutsSnap = await getDocs(
        query(collection(db, "workout"), where("targetUserId", "==", user.id))
      );
      for (const d of workoutsSnap.docs) {
        await deleteDoc(doc(db, "workout", d.id));
      }

      // 3. Supprimer la sous-collection RM
      const rmSnap = await getDocs(collection(db, "users", user.id, "rm"));
      for (const d of rmSnap.docs) {
        await deleteDoc(doc(db, "users", user.id, "rm", d.id));
      }

      // 4. Supprimer la sous-collection weight_history
      const weightSnap = await getDocs(collection(db, "users", user.id, "weight_history"));
      for (const d of weightSnap.docs) {
        await deleteDoc(doc(db, "users", user.id, "weight_history", d.id));
      }

      // 5. Supprimer le document utilisateur
      await deleteDoc(doc(db, "users", user.id));

      // 6. Supprimer de Firebase Auth (optionnel - nécessite des privilèges admin)
      // Note: Cela ne fonctionnera que si l'utilisateur est connecté
      // Pour une suppression complète, utilisez Cloud Functions
      
      // Mettre à jour l'état local
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      
      alert(`✅ ${user.firstName || user.email} a été supprimé avec succès`);
    } catch (error) {
      console.error("Erreur suppression:", error);
      alert(`❌ Erreur lors de la suppression: ${error.message}`);
    }
  };

  const startEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      weight: user.weight || "",
      height: user.height || "",
      group: user.group || "total",
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
      console.error("Erreur mise à jour:", error);
      alert("Erreur lors de la mise à jour");
    }
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setEditForm({});
  };

  if (loading) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#ffffff",
        background: "#0a0a0a",
        minHeight: "100vh"
      }}>
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{
      padding: 20,
      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
      minHeight: "100vh",
      color: "#ffffff",
    }}>
      <h2 style={{ 
        fontSize: 28,
        fontWeight: "800",
        marginBottom: 10,
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        Gestion des Athlètes
      </h2>
      <p style={{ color: "#888", marginBottom: 30, fontSize: 14 }}>
        Gérez les profils et groupes de vos athlètes
      </p>

      <div style={{ display: "grid", gap: 15 }}>
        {users.map((u) => {
          const isEditing = editingUser === u.id;

          return (
            <div
              key={u.id}
              style={{
                background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                padding: 20,
                borderRadius: 12,
                border: isEditing ? "2px solid #667eea" : "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: isEditing ? "0 8px 30px rgba(102, 126, 234, 0.3)" : "0 4px 20px rgba(0, 0, 0, 0.5)",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 15,
                flexWrap: "wrap",
              }}>
                {/* Infos utilisateur */}
                <div style={{ flex: 1, minWidth: 250 }}>
                  <h3 style={{ margin: "0 0 8px 0", color: "#ffffff", fontSize: 18, fontWeight: "700" }}>
                    {u.firstName && u.lastName
                      ? `${u.firstName} ${u.lastName}`
                      : u.displayName || u.email}
                  </h3>
                  <p style={{
                    margin: "0 0 15px 0",
                    color: "#666",
                    fontSize: 13,
                  }}>
                    {u.email}
                  </p>

                  {!isEditing ? (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 10,
                      fontSize: 13,
                    }}>
                      <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: 10,
                        borderRadius: 8,
                      }}>
                        <span style={{ color: "#666" }}>Rôle : </span>
                        <span style={{
                          color: u.role === "admin" ? "#f093fb" : "#4facfe",
                          fontWeight: "bold",
                        }}>
                          {u.role === "admin" ? "Admin" : "Athlète"}
                        </span>
                      </div>
                      <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: 10,
                        borderRadius: 8,
                      }}>
                        <span style={{ color: "#666" }}>Groupe : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.group || "total"}
                        </span>
                      </div>
                      <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: 10,
                        borderRadius: 8,
                      }}>
                        <span style={{ color: "#666" }}>Poids : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.weight ? `${u.weight} kg` : "Non renseigné"}
                        </span>
                      </div>
                      <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: 10,
                        borderRadius: 8,
                      }}>
                        <span style={{ color: "#666" }}>Taille : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.height ? `${u.height} cm` : "Non renseigné"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 15,
                    }}>
                      <div>
                        <label style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 12,
                          color: "#888",
                          fontWeight: "600",
                        }}>
                          Poids (kg)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.weight}
                          onChange={(e) =>
                            setEditForm({ ...editForm, weight: e.target.value })
                          }
                          placeholder="75"
                          style={{
                            width: "100%",
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            background: "rgba(0, 0, 0, 0.5)",
                            color: "#ffffff",
                            fontSize: 14,
                          }}
                        />
                      </div>

                      <div>
                        <label style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 12,
                          color: "#888",
                          fontWeight: "600",
                        }}>
                          Taille (cm)
                        </label>
                        <input
                          type="number"
                          value={editForm.height}
                          onChange={(e) =>
                            setEditForm({ ...editForm, height: e.target.value })
                          }
                          placeholder="180"
                          style={{
                            width: "100%",
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            background: "rgba(0, 0, 0, 0.5)",
                            color: "#ffffff",
                            fontSize: 14,
                          }}
                        />
                      </div>

                      <div>
                        <label style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 12,
                          color: "#888",
                          fontWeight: "600",
                        }}>
                          Groupe additionnel
                        </label>
                        <select
                          value={editForm.group}
                          onChange={(e) =>
                            setEditForm({ ...editForm, group: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            background: "rgba(0, 0, 0, 0.5)",
                            color: "#ffffff",
                            fontSize: 14,
                          }}
                        >
                          <option value="total">Total uniquement</option>
                          <option value="avant">Total + Avant</option>
                          <option value="trois-quarts">Total + Trois-quarts</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Boutons d'action */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!isEditing ? (
                    <>
                      <button
                        onClick={() => startEdit(u)}
                        style={{
                          padding: "10px 18px",
                          background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontSize: 14,
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

                      {u.role !== "admin" ? (
                        <button
                          onClick={() => updateRole(u.id, "admin")}
                          style={{
                            padding: "10px 18px",
                            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: "600",
                            boxShadow: "0 4px 15px rgba(240, 147, 251, 0.4)",
                            transition: "all 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = "translateY(-2px)";
                            e.target.style.boxShadow = "0 6px 20px rgba(240, 147, 251, 0.6)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = "translateY(0)";
                            e.target.style.boxShadow = "0 4px 15px rgba(240, 147, 251, 0.4)";
                          }}
                        >
                          👑 Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => updateRole(u.id, "athlete")}
                          style={{
                            padding: "10px 18px",
                            background: "rgba(255, 255, 255, 0.1)",
                            color: "white",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: "600",
                            transition: "all 0.3s ease",
                          }}
                        >
                          ↓ Athlète
                        </button>
                      )}

                      {/* BOUTON SUPPRIMER - VISIBLE UNIQUEMENT POUR SUPERADMIN */}
                      {isSuperAdmin && (
                        <button
                          onClick={() => deleteAthlete(u)}
                          style={{
                            padding: "10px 18px",
                            background: "linear-gradient(135deg, #ff0844 0%, #ff4b2b 100%)",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontSize: 14,
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
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => saveEdit(u.id)}
                        style={{
                          padding: "10px 18px",
                          background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: "600",
                          boxShadow: "0 4px 15px rgba(17, 153, 142, 0.4)",
                        }}
                      >
                        ✅ Enregistrer
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: "10px 18px",
                          background: "rgba(255, 255, 255, 0.1)",
                          color: "white",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        ✕ Annuler
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: 60,
          background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
          borderRadius: 16,
          color: "#666",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 15 }}>👥</div>
          <p style={{ fontSize: 16 }}>Aucun athlète enregistré pour le moment.</p>
        </div>
      )}
    </div>
  );
}