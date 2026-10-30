import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { normalizeCoachCode } from "../component/coachScope";
import { auth, db } from "../firebase";
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
  const [coachCode, setCoachCode] = useState("");
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
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Création du profil Firestore en attente de validation par le coach —
      // les règles Firestore interdisent explicitement de le créer avec un
      // statut différent de "pending" (voir firestore-rules-avec-groupes.rules).
      // L'accès réel à l'app est bloqué tant que le coach n'a pas approuvé
      // la demande depuis la page Athlètes.
      // Code coach (facultatif) : rattache la demande au coach qui a donné le
      // code. Code inconnu -> on annule la création du compte (il vient d'être
      // créé, on peut donc le supprimer) pour que l'athlète puisse réessayer.
      const code = normalizeCoachCode(coachCode);
      let coachData = {};
      if (code) {
        let coachSnap = null;
        try {
          coachSnap = await getDoc(doc(db, "coachCodes", code));
        } catch (e) {
          coachSnap = null;
        }
        if (!coachSnap || !coachSnap.exists() || !coachSnap.data().coachId) {
          try {
            await cred.user.delete();
          } catch (e) {
            console.warn("Annulation du compte impossible :", e);
          }
          setError("Code coach introuvable. Vérifie-le auprès de ton coach (ou laisse le champ vide).");
          return;
        }
        coachData = { coachId: coachSnap.data().coachId, coachIds: [coachSnap.data().coachId], coachCode: code };
      }
      await setDoc(doc(db, "users", cred.user.uid), {
        email: cred.user.email,
        role: "athlete",
        status: "pending",
        ...coachData,
        createdAt: serverTimestamp(),
      });
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

          {isRegister && (
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: "block", marginBottom: 7, color: TEXT_MUTED, fontSize: 13, fontWeight: 500 }}>
                Code coach <span style={{ opacity: 0.7 }}>(donné par ton coach)</span>
              </label>
              <input
                type="text"
                placeholder="ex. K7M2QX"
                value={coachCode}
                onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={12}
                style={{
                  width: "100%",
                  padding: 13,
                  borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                  background: SURFACE_2,
                  color: "#f3f0ea",
                  fontSize: 15,
                  letterSpacing: 2,
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                onBlur={(e) => (e.target.style.borderColor = BORDER)}
              />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 5 }}>
                Sans code, ta demande ira au responsable de l'application.
              </div>
            </div>
          )}

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
            Ton compte devra être validé par ton coach avant que tu puisses
            accéder à l'application. En créant un compte, tu acceptes nos
            conditions d'utilisation et notre politique de confidentialité.
          </p>
        )}
      </div>
    </div>
  );
}
