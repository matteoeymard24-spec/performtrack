import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

const ACCENT = "#e0a13d";
const BG = "#0d0c0a";
const SURFACE = "#151310";
const SURFACE_2 = "#1a1815";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_STRONG = "rgba(255,255,255,0.16)";
const TEXT_MUTED = "#a8a199";

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
      setError("Email ou mot de passe incorrect.");
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
        setError("Cet email est déjà utilisé.");
      } else if (err.code === "auth/weak-password") {
        setError("Le mot de passe doit contenir au moins 6 caractères.");
      } else {
        setError("La création du compte a échoué. Réessaie.");
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
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Outfit', -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: SURFACE,
          borderRadius: 16,
          padding: "36px 30px",
          border: `1px solid ${BORDER}`,
        }}
      >
        {/* Logo / titre */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 18px",
              background: SURFACE_2,
              border: `1px solid ${BORDER_STRONG}`,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              color: ACCENT,
              fontWeight: 800,
            }}
          >
            P
          </div>
          <h1
            style={{
              margin: "0 0 6px 0",
              color: "#f3f0ea",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            PerformTrack
          </h1>
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 14 }}>
            Suivi de charge et de performance
          </p>
        </div>

        {/* Onglets */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 26,
            background: SURFACE_2,
            borderRadius: 10,
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            style={{
              flex: 1,
              padding: 11,
              background: !isRegister ? ACCENT : "transparent",
              color: !isRegister ? "#1a1306" : TEXT_MUTED,
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.15s ease",
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            style={{
              flex: 1,
              padding: 11,
              background: isRegister ? ACCENT : "transparent",
              color: isRegister ? "#1a1306" : TEXT_MUTED,
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.15s ease",
            }}
          >
            Inscription
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 7,
                color: TEXT_MUTED,
                fontSize: 13,
                fontWeight: 500,
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
                padding: 13,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                background: SURFACE_2,
                color: "#f3f0ea",
                fontSize: 15,
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
              onBlur={(e) => (e.target.style.borderColor = BORDER)}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label
              style={{
                display: "block",
                marginBottom: 7,
                color: TEXT_MUTED,
                fontSize: 13,
                fontWeight: 500,
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
                padding: 13,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                background: SURFACE_2,
                color: "#f3f0ea",
                fontSize: 15,
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
              onBlur={(e) => (e.target.style.borderColor = BORDER)}
            />
          </div>

          {error && (
            <div
              style={{
                padding: 11,
                marginBottom: 18,
                background: "rgba(217,105,90,0.12)",
                border: "1px solid rgba(217,105,90,0.35)",
                borderRadius: 8,
                color: "#e8998c",
                fontSize: 13,
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
              padding: 14,
              background: loading ? SURFACE_2 : ACCENT,
              color: loading ? TEXT_MUTED : "#1a1306",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s ease, transform 0.1s ease",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = "#edb454";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = ACCENT;
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              if (!loading) e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {loading ? "Chargement…" : isRegister ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        {isRegister && (
          <p
            style={{
              marginTop: 18,
              fontSize: 12,
              color: TEXT_MUTED,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            En créant un compte, tu acceptes nos conditions d'utilisation et
            notre politique de confidentialité.
          </p>
        )}
      </div>
    </div>
  );
}
