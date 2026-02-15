import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

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
    { path: "/dashboard", label: "📊 Dashboard", icon: "📊", text: "Dashboard", roles: ["superadmin", "admin", "athlete"] },
    { path: "/workout", label: "🏋️ Workout", icon: "🏋️", text: "Workout", roles: ["superadmin", "admin", "athlete"] },
    { path: "/wellness", label: "💚 Wellness", icon: "💚", text: "Wellness", roles: ["superadmin", "admin", "athlete"] },
    { path: "/myrm", label: "💪 My RM", icon: "💪", text: "My RM", roles: ["superadmin", "admin", "athlete"] },
    { path: "/acwr", label: "📈 ACWR", icon: "📈", text: "ACWR", roles: ["superadmin", "admin"] },
    { path: "/athletes", label: "👥 Athletes", icon: "👥", text: "Athletes", roles: ["superadmin", "admin"] },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    if (isSuperAdmin) {
      return item.roles.includes("admin") || item.roles.includes("superadmin");
    }
    return item.roles.includes(userRole);
  });

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      width: "100%",
      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
      margin: 0,
      padding: 0,
      position: "relative",
    }}>
      {/* Header Desktop & Mobile */}
      <header style={{
        background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
        padding: "16px 20px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        width: "100%",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1400px",
          margin: "0 auto",
          gap: 15,
          width: "100%",
        }}>
          {/* Logo + Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <h1 style={{
              margin: 0,
              fontSize: 26,
              fontWeight: "800",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.5px",
            }}>
              ⚡ PerformTrack
            </h1>
            <span style={{
              background: isSuperAdmin
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : userRole === "admin"
                ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
                : "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
              color: "white",
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
              whiteSpace: "nowrap",
            }}>
              {isSuperAdmin ? "SUPERADMIN" : userRole === "admin" ? "ADMIN" : "ATHLETE"}
            </span>
          </div>

          {/* Navigation Desktop (cachée sur mobile) */}
          <nav style={{ 
            display: "flex", 
            gap: 8,
            flex: 1,
            justifyContent: "center",
            maxWidth: "800px",
            overflow: "hidden",
          }} className="desktop-nav">
            {visibleMenuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: "10px 18px",
                  background: location.pathname === item.path 
                    ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
                    : "rgba(255, 255, 255, 0.05)",
                  color: "white",
                  border: location.pathname === item.path
                    ? "1px solid rgba(102, 126, 234, 0.5)"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: location.pathname === item.path ? "700" : "500",
                  transition: "all 0.3s ease",
                  boxShadow: location.pathname === item.path 
                    ? "0 4px 15px rgba(102, 126, 234, 0.4)" 
                    : "none",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (location.pathname !== item.path) {
                    e.target.style.background = "rgba(255, 255, 255, 0.08)";
                    e.target.style.transform = "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (location.pathname !== item.path) {
                    e.target.style.background = "rgba(255, 255, 255, 0.05)";
                    e.target.style.transform = "translateY(0)";
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Actions Desktop (cachées sur mobile) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }} className="desktop-actions">
            <button
              onClick={() => navigate("/MyProfile")}
              style={{
                padding: "10px 18px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "600",
                boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                transition: "all 0.3s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
              }}
            >
              👤 Profil
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: "10px 18px",
                background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                color: "white",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "600",
                boxShadow: "0 4px 15px rgba(245, 87, 108, 0.4)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(245, 87, 108, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 15px rgba(245, 87, 108, 0.4)";
              }}
            >
              🚪 Déconnexion
            </button>
          </div>

          {/* Bouton Menu Mobile (caché sur desktop) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: "none",
              padding: "10px",
              background: "rgba(255, 255, 255, 0.1)",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 22,
              transition: "all 0.3s ease",
            }}
            className="mobile-menu-toggle"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* Bottom Navigation Mobile (cachée sur desktop) */}
      <nav style={{
        display: "none",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.5)",
        zIndex: 100,
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
      }} className="mobile-nav">
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(visibleMenuItems.length, 5)}, 1fr)`,
          gap: 0,
          width: "100%",
          maxWidth: "100%",
        }}>
          {visibleMenuItems.slice(0, 5).map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "10px 4px",
                background: "transparent",
                color: location.pathname === item.path ? "#667eea" : "#888",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{
                fontSize: 9,
                fontWeight: location.pathname === item.path ? "700" : "400",
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}>
                {item.text}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Menu Drawer Mobile (caché sur desktop) */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            zIndex: 200,
            animation: "fadeIn 0.3s ease",
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
              maxWidth: "320px",
              background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
              boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.5)",
              padding: "20px",
              animation: "slideIn 0.3s ease",
              overflowY: "auto",
            }}
          >
            <div style={{ marginBottom: 30 }}>
              <h2 style={{ color: "white", fontSize: 18, marginBottom: 8 }}>Menu</h2>
              <p style={{ color: "#888", fontSize: 12, wordBreak: "break-all" }}>{currentUser?.email}</p>
            </div>
            {visibleMenuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  marginBottom: 8,
                  background: location.pathname === item.path
                    ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                    : "rgba(255, 255, 255, 0.05)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: location.pathname === item.path ? "700" : "400",
                  textAlign: "left",
                  transition: "all 0.3s ease",
                }}
              >
                {item.label}
              </button>
            ))}
            <div style={{ marginTop: 30, paddingTop: 20, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <button
                onClick={() => {
                  navigate("/MyProfile");
                  setMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  marginBottom: 8,
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 16,
                  textAlign: "left",
                }}
              >
                👤 Mon Profil
              </button>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                🚪 Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        margin: 0,
        padding: 0,
        paddingBottom: "env(safe-area-inset-bottom)",
      }} className="main-content">
        <Outlet />
      </main>

      {/* Responsive CSS */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        /* DESKTOP (≥ 768px) */
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-actions {
            display: flex !important;
          }
          .mobile-menu-toggle {
            display: none !important;
          }
          .mobile-nav {
            display: none !important;
          }
          .mobile-drawer-overlay {
            display: none !important;
          }
          .main-content {
            padding: 20px !important;
          }
        }

        /* MOBILE (< 768px) */
        @media (max-width: 767px) {
          .desktop-nav {
            display: none !important;
          }
          .desktop-actions {
            display: none !important;
          }
          .mobile-menu-toggle {
            display: block !important;
          }
          .mobile-nav {
            display: block !important;
          }
          .main-content {
            padding: 10px !important;
            padding-bottom: calc(70px + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
    </div>
  );
}
