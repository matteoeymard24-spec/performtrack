import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      setError("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    setError("");
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("Cet email est déjà utilisé");
      } else if (err.code === "auth/weak-password") {
        setError("Le mot de passe doit contenir au moins 6 caractères");
      } else {
        setError("Erreur lors de la création du compte");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isRegister) {
      register();
    } else {
      login();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#2a2a2a",
          borderRadius: 16,
          padding: "40px 30px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          border: "1px solid #444",
        }}
      >
        {/* Logo/Title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              width: 80,
              height: 80,
              margin: "0 auto 20px",
              background: "linear-gradient(135deg, #2f80ed 0%, #1a5fb4 100%)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            🏋️
          </div>
          <h1
            style={{
              margin: "0 0 8px 0",
              color: "#ffffff",
              fontSize: 28,
              fontWeight: "bold",
            }}
          >
            PerformTrack
          </h1>
          <p style={{ margin: 0, color: "#888", fontSize: 14 }}>
            Suivi d'entraînement et de performance
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 30,
            background: "#1a1a1a",
            borderRadius: 10,
            padding: 4,
          }}
        >
          <button
            onClick={() => setIsRegister(false)}
            style={{
              flex: 1,
              padding: 12,
              background: !isRegister ? "#2f80ed" : "transparent",
              color: !isRegister ? "white" : "#888",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: !isRegister ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            Connexion
          </button>
          <button
            onClick={() => setIsRegister(true)}
            style={{
              flex: 1,
              padding: 12,
              background: isRegister ? "#2f80ed" : "transparent",
              color: isRegister ? "white" : "#888",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: isRegister ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            Inscription
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "#e0e0e0",
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              Email
            </label>
            <input
              type="email"
              placeholder="exemple@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 10,
                border: "1px solid #444",
                background: "#1a1a1a",
                color: "#ffffff",
                fontSize: 16,
                outline: "none",
                transition: "border 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2f80ed")}
              onBlur={(e) => (e.target.style.borderColor = "#444")}
            />
          </div>

          <div style={{ marginBottom: 25 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "#e0e0e0",
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 10,
                border: "1px solid #444",
                background: "#1a1a1a",
                color: "#ffffff",
                fontSize: 16,
                outline: "none",
                transition: "border 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2f80ed")}
              onBlur={(e) => (e.target.style.borderColor = "#444")}
            />
          </div>

          {error && (
            <div
              style={{
                padding: 12,
                marginBottom: 20,
                background: "#3a1f1f",
                border: "1px solid #e74c3c",
                borderRadius: 8,
                color: "#ff6b6b",
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 16,
              background: loading
                ? "#555"
                : "linear-gradient(135deg, #2f80ed 0%, #1a5fb4 100%)",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 12px rgba(47,128,237,0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(47,128,237,0.4)";
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 12px rgba(47,128,237,0.3)";
            }}
          >
            {loading
              ? "Chargement..."
              : isRegister
              ? "Créer mon compte"
              : "Se connecter"}
          </button>
        </form>

        {/* Info */}
        {isRegister && (
          <p
            style={{
              marginTop: 20,
              fontSize: 12,
              color: "#888",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            En créant un compte, vous acceptez nos conditions d'utilisation et
            notre politique de confidentialité.
          </p>
        )}
      </div>
    </div>
  );
}
