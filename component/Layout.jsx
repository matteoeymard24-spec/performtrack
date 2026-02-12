import React, { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Layout() {
  const { currentUser, userRole, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // 🔥🔥🔥 DEBUG ULTRA IMPORTANT - REGARDE LA CONSOLE ! 🔥🔥🔥
  useEffect(() => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔥🔥🔥 DEBUG LAYOUT.JS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("4iqF1o7YVBbvUyQTLDrqrnHwzq52:", currentUser?.uid);
    console.log("matteo.eymard24@gmail.com:", currentUser?.email);
    console.log("userRole:", userRole);
    console.log("isSuperAdmin:", isSuperAdmin);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }, [currentUser, userRole, isSuperAdmin]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const menuItems = [
    {
      path: "/dashboard",
      label: "📊 Dashboard",
      roles: ["superadmin", "admin", "athlete"],
    },
    {
      path: "/workout",
      label: "🏋️ Workout",
      roles: ["superadmin", "admin", "athlete"],
    },
    {
      path: "/wellness",
      label: "💚 Wellness",
      roles: ["superadmin", "admin", "athlete"],
    },
    {
      path: "/myrm",
      label: "💪 My RM",
      roles: ["superadmin", "admin", "athlete"],
    },
    { path: "/acwr", label: "📈 ACWR", roles: ["superadmin", "admin"] },
    { path: "/athletes", label: "👥 Athletes", roles: ["superadmin", "admin"] },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    // Si superadmin, on accepte tous les items qui ont "admin" dans roles
    if (isSuperAdmin) {
      return item.roles.includes("admin") || item.roles.includes("superadmin");
    }
    return item.roles.includes(userRole);
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#1a1a1a",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#2a2a2a",
          padding: "15px 20px",
          borderBottom: "2px solid #444",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            ⚡ PerformTrack
          </h1>
          <span
            style={{
              background: isSuperAdmin
                ? "#9b59b6"
                : userRole === "admin"
                ? "#e74c3c"
                : "#27ae60",
              color: "white",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: "bold",
            }}
          >
            {isSuperAdmin
              ? "SUPERADMIN"
              : userRole === "admin"
              ? "ADMIN"
              : "ATHLETE"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          {/* Desktop Menu */}
          <nav style={{ display: "flex", gap: 10 }} className="desktop-menu">
            {visibleMenuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: "8px 16px",
                  background:
                    location.pathname === item.path ? "#2f80ed" : "#444",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight:
                    location.pathname === item.path ? "bold" : "normal",
                  transition: "all 0.2s",
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Profile & Logout */}
          <button
            onClick={() => navigate("/MyProfile")}
            style={{
              padding: "8px 16px",
              background: "#9b59b6",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            👤 Profil
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              background: "#e74c3c",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            🚪 Logout
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: "none",
              padding: "8px 12px",
              background: "#444",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 18,
            }}
            className="mobile-menu-toggle"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div
          style={{
            background: "#2a2a2a",
            padding: 15,
            borderBottom: "2px solid #444",
          }}
          className="mobile-menu"
        >
          {visibleMenuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setMenuOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                marginBottom: 8,
                background:
                  location.pathname === item.path ? "#2f80ed" : "#444",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                textAlign: "left",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main style={{ flex: 1, padding: 20 }}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        style={{
          background: "#2a2a2a",
          padding: 15,
          borderTop: "2px solid #444",
          textAlign: "center",
          color: "#888",
          fontSize: 12,
        }}
      >
        PerformTrack © 2025 - {currentUser?.email}
      </footer>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-menu {
            display: none !important;
          }
          .mobile-menu-toggle {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
