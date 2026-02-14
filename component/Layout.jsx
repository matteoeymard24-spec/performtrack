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
    { path: "/dashboard", label: "📊 Dashboard", roles: ["superadmin", "admin", "athlete"] },
    { path: "/workout", label: "🏋️ Workout", roles: ["superadmin", "admin", "athlete"] },
    { path: "/wellness", label: "💚 Wellness", roles: ["superadmin", "admin", "athlete"] },
    { path: "/myrm", label: "💪 My RM", roles: ["superadmin", "admin", "athlete"] },
    { path: "/acwr", label: "📈 ACWR", roles: ["superadmin", "admin"] },
    { path: "/athletes", label: "👥 Athletes", roles: ["superadmin", "admin"] },
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
      background: "linear-gradient(180deg, #000000 0%, #0a0a0a 100%)",
    }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
        padding: "16px 20px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto",
          gap: 15,
        }}>
          {/* Logo + Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            }}>
              {isSuperAdmin ? "SUPERADMIN" : userRole === "admin" ? "ADMIN" : "ATHLETE"}
            </span>
          </div>

          {/* Desktop Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="desktop-actions">
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

          {/* Mobile Menu Button */}
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

      {/* Bottom Navigation (Mobile) */}
      <nav style={{
        display: "none",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        padding: "8px 0",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.5)",
        zIndex: 100,
      }} className="mobile-nav">
        <div style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          maxWidth: "600px",
          margin: "0 auto",
        }}>
          {visibleMenuItems.slice(0, 5).map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 8px",
                background: "transparent",
                color: location.pathname === item.path ? "#667eea" : "#888",
                border: "none",
                cursor: "pointer",
                fontSize: 24,
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: 24 }}>{item.label.split(" ")[0]}</span>
              <span style={{
                fontSize: 10,
                fontWeight: location.pathname === item.path ? "700" : "400",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {item.label.split(" ")[1]}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
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
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "80%",
              maxWidth: "300px",
              background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
              boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.5)",
              padding: "20px",
              animation: "slideIn 0.3s ease",
              overflowY: "auto",
            }}
          >
            <div style={{ marginBottom: 30 }}>
              <h2 style={{ color: "white", fontSize: 18, marginBottom: 8 }}>Menu</h2>
              <p style={{ color: "#888", fontSize: 12 }}>{currentUser?.email}</p>
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
        padding: "20px",
        paddingBottom: "80px",
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
      }}>
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
        @media (max-width: 768px) {
          .desktop-actions {
            display: none !important;
          }
          .mobile-menu-toggle {
            display: block !important;
          }
          .mobile-nav {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}