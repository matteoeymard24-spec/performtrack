import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export default function MyProfile() {
  const { currentUser, userRole } = useAuth();
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    age: "",
    height: "", // en cm
    weight: "", // en kg
    email: "",
    group: "",
  });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            age: data.age || "",
            height: data.height || "",
            weight: data.weight || "",
            email: data.email || currentUser.email,
            group: data.group || "",
          });
        } else {
          // Créer le profil initial
          await setDoc(docRef, {
            email: currentUser.email,
            role: userRole,
            createdAt: new Date().toISOString(),
          });
          setProfile((prev) => ({ ...prev, email: currentUser.email }));
        }
        setLoading(false);
      } catch (error) {
        console.error("Erreur chargement profil:", error);
        setLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser, userRole]);

  const handleSave = async () => {
    if (!currentUser) return;

    try {
      const docRef = doc(db, "users", currentUser.uid);
      await updateDoc(docRef, {
        firstName: profile.firstName,
        lastName: profile.lastName,
        age: profile.age ? Number(profile.age) : null,
        height: profile.height ? Number(profile.height) : null,
        weight: profile.weight ? Number(profile.weight) : null,
        displayName:
          `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
        updatedAt: new Date().toISOString(),
      });

      alert("Profil mis à jour avec succès !");
      setEditing(false);
    } catch (error) {
      console.error("Erreur mise à jour profil:", error);
      alert("Erreur lors de la mise à jour du profil");
    }
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
        maxWidth: 600,
        margin: "0 auto",
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#ffffff",
      }}
    >
      <h2 style={{ color: "#ffffff", marginBottom: 10, fontSize: 24 }}>
        Mon Profil
      </h2>
      <p style={{ color: "#b0b0b0", marginBottom: 30, fontSize: 14 }}>
        Gérez vos informations personnelles
      </p>

      {/* Carte principale */}
      <div
        style={{
          background: "#2a2a2a",
          padding: 30,
          borderRadius: 12,
          border: "1px solid #444",
          marginBottom: 20,
        }}
      >
        {/* En-tête avec avatar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 30,
            paddingBottom: 20,
            borderBottom: "1px solid #444",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "#2f80ed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: "bold",
              marginRight: 20,
            }}
          >
            {profile.firstName ? profile.firstName[0].toUpperCase() : "A"}
          </div>
          <div>
            <h3 style={{ margin: "0 0 5px 0", color: "#ffffff", fontSize: 24 }}>
              {profile.firstName && profile.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : "Athlète"}
            </h3>
            <p style={{ margin: 0, color: "#b0b0b0", fontSize: 14 }}>
              {profile.email}
            </p>
            <p style={{ margin: "5px 0 0 0", color: "#888", fontSize: 12 }}>
              Rôle : {userRole === "admin" ? "Administrateur" : "Athlète"}
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Prénom
            </label>
            <input
              type="text"
              value={profile.firstName}
              onChange={(e) =>
                setProfile({ ...profile, firstName: e.target.value })
              }
              disabled={!editing}
              placeholder="Votre prénom"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background: editing ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Nom
            </label>
            <input
              type="text"
              value={profile.lastName}
              onChange={(e) =>
                setProfile({ ...profile, lastName: e.target.value })
              }
              disabled={!editing}
              placeholder="Votre nom"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background: editing ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Âge
            </label>
            <input
              type="number"
              value={profile.age}
              onChange={(e) => setProfile({ ...profile, age: e.target.value })}
              disabled={!editing}
              placeholder="Votre âge"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background: editing ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Groupe
            </label>
            <select
              value={profile.group}
              onChange={(e) =>
                setProfile({ ...profile, group: e.target.value })
              }
              disabled={!editing || userRole === "admin"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background:
                  editing && userRole !== "admin" ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            >
              <option value="">Non défini</option>
              <option value="total">Total</option>
              <option value="avant">Avant</option>
              <option value="trois-quarts">Trois-quarts</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Taille (cm)
            </label>
            <input
              type="number"
              value={profile.height}
              onChange={(e) =>
                setProfile({ ...profile, height: e.target.value })
              }
              disabled={!editing}
              placeholder="ex: 180"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background: editing ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                fontSize: 14,
                color: "#e0e0e0",
                fontWeight: "bold",
              }}
            >
              Poids (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={profile.weight}
              onChange={(e) =>
                setProfile({ ...profile, weight: e.target.value })
              }
              disabled={!editing}
              placeholder="ex: 75"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #555",
                background: editing ? "#1a1a1a" : "#333",
                color: "#ffffff",
                fontSize: 16,
              }}
            />
          </div>
        </div>

        {/* Boutons */}
        <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "12px 24px",
                background: "#2f80ed",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              ✏️ Modifier
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                style={{
                  padding: "12px 24px",
                  background: "#27ae60",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                ✅ Enregistrer
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  // Recharger les données
                  window.location.reload();
                }}
                style={{
                  padding: "12px 24px",
                  background: "#95a5a6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                Annuler
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info */}
      <div
        style={{
          marginTop: 20,
          padding: 20,
          background: "#3a2f1f",
          borderRadius: 10,
          border: "2px solid #8b6914",
        }}
      >
        <h4 style={{ marginTop: 0, color: "#f1c40f" }}>
          💡 Pourquoi remplir mon profil ?
        </h4>
        <ul style={{ color: "#f8e6a0", lineHeight: 1.8, margin: 0 }}>
          <li>
            Votre <strong>prénom</strong> apparaît dans les messages de
            bienvenue
          </li>
          <li>
            Les <strong>admins</strong> vous identifient facilement dans les
            listes
          </li>
          <li>
            Vos <strong>stats physiques</strong> permettent un suivi
            personnalisé
          </li>
          <li>
            Votre <strong>poids</strong> peut être mis à jour directement depuis
            le Dashboard
          </li>
        </ul>
      </div>
    </div>
  );
}
