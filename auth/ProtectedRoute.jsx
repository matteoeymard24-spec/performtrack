// auth/ProtectedRoute.js
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const ACCENT = "#e0a13d";

export default function ProtectedRoute() {
  const { currentUser, userRole, isSuperAdmin, userStatus, logout } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Un coach/admin n'est jamais bloqué par le statut d'approbation — cette
  // porte ne concerne que les athlètes qui se sont inscrits eux-mêmes et
  // attendent (ou ont reçu) une décision du coach.
  const isAdminLike = userRole === "admin" || isSuperAdmin;

  if (!isAdminLike && userStatus === "pending") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0d0c0a",
          color: "#f3f0ea",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <h2 style={{ margin: "0 0 12px 0" }}>Compte en attente de validation</h2>
          <p style={{ color: "#a8a199", fontSize: 15, lineHeight: 1.6 }}>
            Ton inscription a bien été reçue. Ton coach doit valider ton accès
            avant que tu puisses utiliser l'application — reviens un peu plus
            tard ou contacte-le directement.
          </p>
          <button
            onClick={logout}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "transparent",
              border: `1px solid ${ACCENT}`,
              color: ACCENT,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (!isAdminLike && userStatus === "rejected") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0d0c0a",
          color: "#f3f0ea",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <h2 style={{ margin: "0 0 12px 0" }}>Accès refusé</h2>
          <p style={{ color: "#a8a199", fontSize: 15, lineHeight: 1.6 }}>
            Ton coach n'a pas validé ton accès à l'application. Contacte-le
            directement si tu penses qu'il s'agit d'une erreur.
          </p>
          <button
            onClick={logout}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "transparent",
              border: "1px solid #d9695a",
              color: "#d9695a",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
