import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

/* =====================================================================
   WellbeingTabs.jsx — Wellness, Nutrition et Sommeil regroupés sous « Wellness »
   (un seul onglet dans la barre du haut ; ces pastilles passent d'une page à l'autre).
   ===================================================================== */
export const WELLBEING_PATHS = ["/wellness", "/wellness-form", "/nutrition", "/sommeil"];
const TABS = [
  { path: "/wellness", label: "🧘 Wellness", match: ["/wellness", "/wellness-form"] },
  { path: "/nutrition", label: "🥗 Nutrition", match: ["/nutrition"] },
  { path: "/sommeil", label: "😴 Sommeil", match: ["/sommeil"] },
];

export default function WellbeingTabs() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const fromDash = new URLSearchParams(search).get("from") === "dashboard";
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "#151310", border: "1px solid #2a2620", marginBottom: 16, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
      {TABS.map((t) => {
        const on = t.match.includes(pathname);
        return (
          <button
            key={t.path}
            type="button"
            onClick={() => !on && navigate(t.path + (fromDash ? "?from=dashboard" : ""))}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: on ? "rgba(224,161,61,0.18)" : "transparent",
              color: on ? "#f3f0ea" : "#a8a199",
              fontWeight: on ? 800 : 600,
              fontSize: 14,
              cursor: on ? "default" : "pointer",
              whiteSpace: "nowrap",
              boxShadow: on ? "inset 0 0 0 1px rgba(224,161,61,0.6)" : "none",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
