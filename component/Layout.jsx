import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const ACCENT = "#e0a13d";
const BG = "#0d0c0a";
const SURFACE = "#151310";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_STRONG = "rgba(255,255,255,0.16)";
const TEXT_MUTED = "#a8a199";

export default function Layout() {
  const { currentUser, userRole, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const menuItems = [
    { path: "/dashboard", label: "Dashboard", icon: "📊", roles: ["superadmin", "admin", "athlete"] },
    { path: "/workout", label: "Workout", icon: "🏋️", roles: ["superadmin", "admin", "athlete"] },
    { path: "/wellness", label: "Wellness", icon: "🧘", roles: ["superadmin", "admin", "athlete"] },
    { path: "/myrm", label: "My RM", icon: "🏋️‍♂️", roles: ["superadmin", "admin", "athlete"] },
    { path: "/acwr", label: "ACWR", icon: "📈", roles: ["superadmin", "admin"] },
    { path: "/athletes", label: "Athlètes", icon: "👥", roles: ["superadmin", "admin"] },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    if (isSuperAdmin) {
      return item.roles.includes("admin") || item.roles.includes("superadmin");
    }
    return item.roles.includes(userRole);
  });

  const roleLabel = isSuperAdmin ? "Superadmin" : userRole === "admin" ? "Coach" : "Athlète";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        background: BG,
        position: "relative",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: SURFACE,
          padding: "14px 20px",
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: `1px solid ${BORDER}`,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            maxWidth: 1400,
            margin: "0 auto",
            gap: 16,
            width: "100%",
          }}
        >
          {/* Logo + rôle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#f3f0ea",
                letterSpacing: "-0.02em",
              }}
            >
              PerformTrack
            </h1>
            <span
              style={{
                color: ACCENT,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                border: `1px solid ${BORDER_STRONG}`,
                borderRadius: 6,
                padding: "3px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {roleLabel}
            </span>
          </div>

          {/* Navigation desktop */}
          <nav
            style={{
              display: "flex",
              gap: 4,
              flex: 1,
              justifyContent: "center",
              maxWidth: 720,
              overflow: "hidden",
            }}
            className="desktop-nav"
          >
            {visibleMenuItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  style={{
                    padding: "9px 16px",
                    background: active ? "rgba(224,161,61,0.12)" : "transparent",
                    color: active ? ACCENT : TEXT_MUTED,
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    transition: "background 0.15s ease, color 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = "#f3f0ea";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = TEXT_MUTED;
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Actions desktop */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} className="desktop-actions">
            <button
              onClick={() => navigate("/MyProfile")}
              style={{
                padding: "9px 16px",
                background: "transparent",
                color: TEXT_MUTED,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#f3f0ea";
                e.currentTarget.style.borderColor = BORDER_STRONG;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = TEXT_MUTED;
                e.currentTarget.style.borderColor = BORDER;
              }}
            >
              Profil
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: "9px 16px",
                background: ACCENT,
                color: "#1a1306",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                transition: "background 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#edb454")}
              onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
            >
              Déconnexion
            </button>
          </div>

          {/* Bouton menu mobile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: "none",
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "#f3f0ea",
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 18,
            }}
            className="mobile-menu-toggle"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* Navigation mobile basse */}
      <nav
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: SURFACE,
          padding: "6px 0 calc(6px + env(safe-area-inset-bottom))",
          zIndex: 100,
          borderTop: `1px solid ${BORDER}`,
        }}
        className="mobile-nav"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(visibleMenuItems.length, 5)}, 1fr)`,
            width: "100%",
          }}
        >
          {visibleMenuItems.slice(0, 5).map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "9px 4px",
                  background: "transparent",
                  color: active ? ACCENT : "#706a61",
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 600 : 400,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tiroir menu mobile */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            animation: "pt-fade 0.2s ease",
          }}
          className="mobile-drawer-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "85%",
              maxWidth: 320,
              background: SURFACE,
              borderLeft: `1px solid ${BORDER}`,
              padding: 20,
              animation: "pt-slide 0.25s ease",
              overflowY: "auto",
            }}
          >
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ color: "#f3f0ea", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Menu</h2>
              <p style={{ color: TEXT_MUTED, fontSize: 12, wordBreak: "break-all" }}>
                {currentUser?.email}
              </p>
            </div>
            {visibleMenuItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMenuOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "13px 14px",
                    marginBottom: 4,
                    background: active ? "rgba(224,161,61,0.12)" : "transparent",
                    color: active ? ACCENT : "#f3f0ea",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: active ? 600 : 400,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
              <button
                onClick={() => {
                  navigate("/MyProfile");
                  setMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  marginBottom: 8,
                  background: "transparent",
                  color: "#f3f0ea",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  fontSize: 15,
                  textAlign: "left",
                }}
              >
                Mon profil
              </button>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  background: ACCENT,
                  color: "#1a1306",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "100%",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="main-content"
      >
        <Outlet />
      </main>

      <style>{`
        @keyframes pt-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pt-slide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @media (min-width: 768px) {
          .desktop-nav { display: flex !important; }
          .desktop-actions { display: flex !important; }
          .mobile-menu-toggle { display: none !important; }
          .mobile-nav { display: none !important; }
          .mobile-drawer-overlay { display: none !important; }
          .main-content { padding: 24px !important; }
        }

        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .desktop-actions { display: none !important; }
          .mobile-menu-toggle { display: flex !important; }
          .mobile-nav { display: block !important; }
          .main-content {
            padding: 12px !important;
            padding-bottom: calc(66px + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
    </div>
  );
}
