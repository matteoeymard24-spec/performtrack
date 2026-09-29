import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export default function MyProfile() {
  const { currentUser, userRole, isSuperAdmin } = useAuth();
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    age: "",
    height: "", // en cm
    weight: "", // en kg - Seulement pour admins
    email: "",
    group: "",
  });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Détermine si c'est un admin (admin ou superadmin)
  const isAdmin = userRole === "admin" || isSuperAdmin;

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
      const updateData = {
        firstName: profile.firstName,
        lastName: profile.lastName,
        age: profile.age ? Number(profile.age) : null,
        height: profile.height ? Number(profile.height) : null,
        displayName:
          `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
        updatedAt: new Date().toISOString(),
      };

      // Ajouter le poids SEULEMENT si admin
      if (isAdmin) {
        updateData.weight = profile.weight ? Number(profile.weight) : null;
      }

      await updateDoc(docRef, updateData);

      alert("✅ Profil mis à jour avec succès !");
      setEditing(false);
    } catch (error) {
      console.error("Erreur mise à jour profil:", error);
      alert("❌ Erreur lors de la mise à jour du profil");
    }
  };

  const handleChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: "center",
          color: "#f3f0ea",
          background: "#0d0c0a",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 18, marginTop: 40 }}>⏳ Chargement du profil...</div>
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
      {/* Header */}
      <div
        style={{
          background: "#e0a13d",
          color: "#1a1306",
          padding: "24px 20px",
          borderRadius: 12,
          marginBottom: 25,
          boxShadow: "0 4px 20px rgba(224, 161, 61, 0.4)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: "800" }}>
          Mon Profil
        </h2>
        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>
          {isAdmin ? "👑 Administrateur" : "🏃 Athlète"}
        </div>
      </div>

      {/* Carte principale */}
      <div
        style={{
          background: "#151310",
          padding: 25,
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.05)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        {/* Email (non éditable) */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: "600",
              color: "#a8a199",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            📧 Email
          </label>
          <div
            style={{
              padding: 14,
              background: "#151310",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#a8a199",
              fontSize: 15,
            }}
          >
            {profile.email}
          </div>
        </div>

        {/* Prénom */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: "600",
              color: "#a8a199",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            👤 Prénom
          </label>
          <input
            type="text"
            value={profile.firstName}
            onChange={(e) => handleChange("firstName", e.target.value)}
            disabled={!editing}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 15,
              borderRadius: 10,
              border: editing
                ? "2px solid rgba(102, 126, 234, 0.5)"
                : "1px solid rgba(255, 255, 255, 0.1)",
              background: editing ? "#151310" : "#151310",
              color: "white",
              transition: "all 0.3s ease",
              outline: "none",
            }}
            placeholder="Entrez votre prénom"
          />
        </div>

        {/* Nom */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: "600",
              color: "#a8a199",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            👤 Nom
          </label>
          <input
            type="text"
            value={profile.lastName}
            onChange={(e) => handleChange("lastName", e.target.value)}
            disabled={!editing}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 15,
              borderRadius: 10,
              border: editing
                ? "2px solid rgba(102, 126, 234, 0.5)"
                : "1px solid rgba(255, 255, 255, 0.1)",
              background: editing ? "#151310" : "#151310",
              color: "white",
              transition: "all 0.3s ease",
              outline: "none",
            }}
            placeholder="Entrez votre nom"
          />
        </div>

        {/* Grid 2 colonnes : Âge + Taille */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 15,
            marginBottom: 20,
          }}
        >
          {/* Âge */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: "600",
                color: "#a8a199",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              🎂 Âge
            </label>
            <input
              type="number"
              value={profile.age}
              onChange={(e) => handleChange("age", e.target.value)}
              disabled={!editing}
              style={{
                width: "100%",
                padding: 14,
                fontSize: 15,
                borderRadius: 10,
                border: editing
                  ? "2px solid rgba(102, 126, 234, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
                background: editing ? "#151310" : "#151310",
                color: "white",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="Âge"
            />
          </div>

          {/* Taille */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: "600",
                color: "#a8a199",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              📏 Taille (cm)
            </label>
            <input
              type="number"
              value={profile.height}
              onChange={(e) => handleChange("height", e.target.value)}
              disabled={!editing}
              style={{
                width: "100%",
                padding: 14,
                fontSize: 15,
                borderRadius: 10,
                border: editing
                  ? "2px solid rgba(102, 126, 234, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
                background: editing ? "#151310" : "#151310",
                color: "white",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="Taille"
            />
          </div>
        </div>

        {/* Poids - SEULEMENT POUR LES ADMINS */}
        {isAdmin && (
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: "600",
                color: "#a8a199",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              ⚖️ Poids (kg) - Admin uniquement
            </label>
            <input
              type="number"
              value={profile.weight}
              onChange={(e) => handleChange("weight", e.target.value)}
              disabled={!editing}
              style={{
                width: "100%",
                padding: 14,
                fontSize: 15,
                borderRadius: 10,
                border: editing
                  ? "2px solid rgba(102, 126, 234, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
                background: editing ? "#151310" : "#151310",
                color: "white",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              placeholder="Poids"
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#667eea",
                fontStyle: "italic",
              }}
            >
              ℹ️ Les athlètes gèrent leur poids depuis le Dashboard
            </div>
          </div>
        )}

        {/* Groupe (non éditable, juste affiché) */}
        {profile.group && (
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: "600",
                color: "#a8a199",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              👥 Groupe
            </label>
            <div
              style={{
                padding: 14,
                background: "#151310",
                borderRadius: 10,
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#a8a199",
                fontSize: 15,
              }}
            >
              {profile.group === "total"
                ? "Groupe Total"
                : profile.group === "1"
                ? "Groupe 1"
                : profile.group === "2"
                ? "Groupe 2"
                : profile.group}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#a8a199",
                fontStyle: "italic",
              }}
            >
              ℹ️ Votre groupe est géré par les administrateurs
            </div>
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              style={{
                flex: 1,
                padding: 16,
                background: "#e0a13d",
                color: "#1a1306",
                border: "none",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: "700",
                cursor: "pointer",
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
          ) : (
            <>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: 16,
                  background: "#4fae7d",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: "700",
                  cursor: "pointer",
                  boxShadow: "0 4px 15px rgba(79, 174, 125, 0.4)",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 6px 20px rgba(79, 174, 125, 0.6)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 4px 15px rgba(79, 174, 125, 0.4)";
                }}
              >
                ✅ Enregistrer
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  flex: 1,
                  padding: 16,
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.1)";
                }}
              >
                ❌ Annuler
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info card - Athlètes uniquement */}
      {!isAdmin && (
        <div
          style={{
            maxWidth: "600px",
            margin: "20px auto 0",
            padding: 16,
            background: "#e0a13d",
            borderRadius: 12,
            boxShadow: "0 4px 15px rgba(224, 161, 61, 0.3)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: "600", display: "flex", alignItems: "center", gap: 8 }}>
            <span>💡</span>
            <span>Votre poids se gère depuis le Dashboard</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            Mettez à jour votre poids quotidiennement depuis votre tableau de bord personnel.
          </div>
        </div>
      )}
    </div>
  );
}
