import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";

export default function Admin() {
  const { currentUser, userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculer isSuperAdmin localement depuis userProfile
  const isSuperAdmin = userProfile?.superAdmin === true;

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const usersData = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setUsers(usersData);
        setLoading(false);
      } catch (e) {
        console.error("Erreur chargement users:", e);
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const toggleRole = async (userId, currentRole) => {
    const user = users.find((u) => u.id === userId);

    if (user.superAdmin && userId !== currentUser.uid) {
      alert("❌ Impossible de modifier le rôle d'un Super-Admin");
      return;
    }

    if (userId === currentUser.uid && user.superAdmin) {
      const confirm = window.confirm(
        "⚠️ Tu es sur le point de te rétrograder.\n\nTu perdras les privilèges Super-Admin.\n\nContinuer ?"
      );
      if (!confirm) return;
    }

    const newRole = currentRole === "admin" ? "athlete" : "admin";

    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      alert(`✅ Rôle mis à jour : ${newRole}`);
    } catch (e) {
      console.error("Erreur toggle role:", e);
      alert("Erreur: " + e.message);
    }
  };

  const deleteUserWellness = async (userId, userName) => {
    if (!isSuperAdmin) {
      alert("❌ Seuls les Super-Admins peuvent supprimer les données wellness");
      return;
    }

    const confirm = window.confirm(
      `⚠️ ATTENTION !\n\nSupprimer TOUTES les données wellness de ${userName} ?\n\nAction IRRÉVERSIBLE.`
    );
    if (!confirm) return;

    try {
      const allWellness = await getDocs(collection(db, "wellness"));
      const userWellness = allWellness.docs.filter(
        (d) => d.data().userId === userId
      );

      if (userWellness.length === 0) {
        alert("Aucune donnée wellness à supprimer");
        return;
      }

      await Promise.all(
        userWellness.map((d) => deleteDoc(doc(db, "wellness", d.id)))
      );

      alert(
        `✅ ${userWellness.length} entrées wellness supprimées pour ${userName}`
      );
    } catch (e) {
      console.error("Erreur suppression:", e);
      alert("Erreur: " + e.message);
    }
  };

  const getUserBadge = (user) => {
    if (user.superAdmin) {
      return (
        <span
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: "bold",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            boxShadow: "0 2px 10px rgba(118, 75, 162, 0.5)",
          }}
        >
          👑 SUPER-ADMIN
        </span>
      );
    }
    if (user.role === "admin") {
      return (
        <span
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: "bold",
            background: "#2f80ed",
            color: "white",
          }}
        >
          🔑 ADMIN
        </span>
      );
    }
    return (
      <span
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: "bold",
          background: "#27ae60",
          color: "white",
        }}
      >
        🏃 ATHLÈTE
      </span>
    );
  };

  const getUserName = (u) => {
    if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
    if (u.displayName) return u.displayName;
    if (u.email) return u.email.split("@")[0];
    return "Utilisateur";
  };

  const filtered = users.filter((u) => {
    const name = getUserName(u).toLowerCase();
    const email = (u.email || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#fff",
          background: "#1a1a1a",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#fff",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, marginBottom: 5 }}>
          👥 Gestion des Utilisateurs
        </h2>
        <p style={{ color: "#b0b0b0", fontSize: 14 }}>
          Gérer les rôles et permissions
        </p>
      </div>

      <input
        type="text"
        placeholder="🔍 Rechercher un utilisateur..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          marginBottom: 20,
          background: "#2a2a2a",
          border: "1px solid #444",
          borderRadius: 8,
          color: "#fff",
          fontSize: 14,
        }}
      />

      <div
        style={{ background: "#2a2a2a", borderRadius: 12, overflow: "hidden" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                background: "#1a1a1a",
                borderBottom: "2px solid #2f80ed",
              }}
            >
              <th
                style={{
                  padding: 15,
                  textAlign: "left",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#888",
                }}
              >
                UTILISATEUR
              </th>
              <th
                style={{
                  padding: 15,
                  textAlign: "left",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#888",
                }}
              >
                EMAIL
              </th>
              <th
                style={{
                  padding: 15,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#888",
                }}
              >
                STATUT
              </th>
              <th
                style={{
                  padding: 15,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#888",
                }}
              >
                GROUPE
              </th>
              <th
                style={{
                  padding: 15,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#888",
                }}
              >
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: 15 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      marginBottom: 4,
                    }}
                  >
                    {getUserName(user)}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>{user.id}</div>
                </td>
                <td style={{ padding: 15, fontSize: 14, color: "#b0b0b0" }}>
                  {user.email}
                </td>
                <td style={{ padding: 15, textAlign: "center" }}>
                  {getUserBadge(user)}
                </td>
                <td
                  style={{
                    padding: 15,
                    textAlign: "center",
                    fontSize: 14,
                    color: "#888",
                  }}
                >
                  {user.group || "–"}
                </td>
                <td style={{ padding: 15, textAlign: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      justifyContent: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => toggleRole(user.id, user.role)}
                      disabled={user.superAdmin && user.id !== currentUser.uid}
                      style={{
                        padding: "8px 16px",
                        background:
                          user.superAdmin && user.id !== currentUser.uid
                            ? "#555"
                            : user.role === "admin"
                            ? "#e74c3c"
                            : "#27ae60",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor:
                          user.superAdmin && user.id !== currentUser.uid
                            ? "not-allowed"
                            : "pointer",
                        fontSize: 13,
                        fontWeight: "bold",
                      }}
                    >
                      {user.role === "admin" ? "Rétrograder" : "Promouvoir"}
                    </button>

                    {isSuperAdmin &&
                      user.role !== "admin" &&
                      !user.superAdmin && (
                        <button
                          onClick={() =>
                            deleteUserWellness(user.id, getUserName(user))
                          }
                          style={{
                            padding: "8px 16px",
                            background: "#c0392b",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: "bold",
                          }}
                        >
                          🗑️ Wellness
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 30,
          padding: 20,
          background: "#2a2a2a",
          borderRadius: 12,
          border: "1px solid #444",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            fontSize: 16,
            marginBottom: 15,
            color: "#2f80ed",
          }}
        >
          ℹ️ Informations
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: 14,
            color: "#b0b0b0",
            lineHeight: 1.8,
          }}
        >
          <li>
            <strong>Admin :</strong> Peut créer des workouts, voir tous les
            athlètes, gérer les rôles
          </li>
          <li>
            <strong>Athlète :</strong> Peut voir et compléter ses workouts,
            remplir wellness
          </li>
          <li>
            <strong>Super-Admin :</strong> Tous les droits admin + protégé
            contre modifications + peut supprimer wellness
          </li>
          <li style={{ color: "#f39c12" }}>
            ⚠️ Les Super-Admins ne peuvent pas être rétrogradés par d'autres
            admins
          </li>
        </ul>
      </div>
    </div>
  );
}
