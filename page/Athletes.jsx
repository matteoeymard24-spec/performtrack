import { db } from "../firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Navigate } from "react-router-dom";

export default function Athletes() {
  const { userRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  // 🔒 Sécurité FRONT : si pas admin → dehors
  if (userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const usersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Trier par nom ou email
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
      <div style={{ padding: 20, textAlign: "center", color: "#ffffff" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#ffffff",
      }}
    >
      <h2 style={{ color: "#ffffff", marginBottom: 10 }}>
        Gestion des Athlètes
      </h2>
      <p style={{ color: "#b0b0b0", marginBottom: 30 }}>
        Gérez les profils et groupes de vos athlètes
      </p>

      <div style={{ display: "grid", gap: 15 }}>
        {users.map((u) => {
          const isEditing = editingUser === u.id;

          return (
            <div
              key={u.id}
              style={{
                background: "#2a2a2a",
                padding: 20,
                borderRadius: 10,
                border: isEditing ? "2px solid #2f80ed" : "2px solid #444",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                {/* Infos utilisateur */}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: "0 0 8px 0", color: "#ffffff" }}>
                    {u.firstName && u.lastName
                      ? `${u.firstName} ${u.lastName}`
                      : u.displayName || u.email}
                  </h3>
                  <p
                    style={{
                      margin: "0 0 15px 0",
                      color: "#888",
                      fontSize: 14,
                    }}
                  >
                    {u.email}
                  </p>

                  {!isEditing ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 10,
                        fontSize: 14,
                      }}
                    >
                      <div>
                        <span style={{ color: "#888" }}>Rôle : </span>
                        <span
                          style={{
                            color: u.role === "admin" ? "#f39c12" : "#2f80ed",
                            fontWeight: "bold",
                          }}
                        >
                          {u.role === "admin" ? "Admin" : "Athlète"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#888" }}>Groupe : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.group || "total"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#888" }}>Poids : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.weight ? `${u.weight} kg` : "Non renseigné"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#888" }}>Taille : </span>
                        <span style={{ color: "#e0e0e0" }}>
                          {u.height ? `${u.height} cm` : "Non renseigné"}
                        </span>
                      </div>
                      {u.age && (
                        <div>
                          <span style={{ color: "#888" }}>Âge : </span>
                          <span style={{ color: "#e0e0e0" }}>{u.age} ans</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 15,
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: 5,
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
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
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #555",
                            background: "#1a1a1a",
                            color: "#ffffff",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: 5,
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
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
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #555",
                            background: "#1a1a1a",
                            color: "#ffffff",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: 5,
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          Groupe additionnel
                        </label>
                        <select
                          value={editForm.group}
                          onChange={(e) =>
                            setEditForm({ ...editForm, group: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #555",
                            background: "#1a1a1a",
                            color: "#ffffff",
                          }}
                        >
                          <option value="total">
                            Total uniquement (par défaut)
                          </option>
                          <option value="avant">Total + Avant</option>
                          <option value="trois-quarts">
                            Total + Trois-quarts
                          </option>
                        </select>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#666",
                            margin: "5px 0 0 0",
                          }}
                        >
                          💡 Tous les athlètes voient les séances "Total" + leur
                          groupe additionnel
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Boutons d'action */}
                <div style={{ display: "flex", gap: 10, marginLeft: 20 }}>
                  {!isEditing ? (
                    <>
                      <button
                        onClick={() => startEdit(u)}
                        style={{
                          padding: "8px 16px",
                          background: "#2f80ed",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        ✏️ Modifier
                      </button>

                      {u.role !== "admin" ? (
                        <button
                          onClick={() => updateRole(u.id, "admin")}
                          style={{
                            padding: "8px 16px",
                            background: "#f39c12",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          👑 Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => updateRole(u.id, "athlete")}
                          style={{
                            padding: "8px 16px",
                            background: "#95a5a6",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          ↓ Athlète
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => saveEdit(u.id)}
                        style={{
                          padding: "8px 16px",
                          background: "#27ae60",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        ✅ Enregistrer
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: "8px 16px",
                          background: "#e74c3c",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        ✕
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
        <div
          style={{
            textAlign: "center",
            padding: 40,
            background: "#2a2a2a",
            borderRadius: 12,
            color: "#b0b0b0",
          }}
        >
          <p>Aucun athlète enregistré pour le moment.</p>
        </div>
      )}
    </div>
  );
}
