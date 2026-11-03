import { isMobileView } from "./viewMode";
import React, { useState } from "react";

/* ===== Charte graphique commune à toute l'app =====
   Fond de page #0d0c0a, cartes #151310, rayon 12, bordure 1px, titres 16px,
   accent #e0a13d. Chaque carte peut être repliée avec ▾/▸ (le titre reste
   visible) ; le choix est mémorisé sur l'appareil, par page. */
export const PAGE_BG = "#0d0c0a";
export const TEXT = "#f3f0ea";
export const MUTED = "#a8a199";
export const ACCENT = "#e0a13d";
export const CARD_STYLE = {
  background: "#151310",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #2a2620",
  marginBottom: 16,
};
export const CARD_ACCENT_BORDER = "1px solid rgba(224,161,61,0.55)";
export const CARD_TITLE = { margin: 0, fontSize: 16, fontWeight: 700, color: TEXT };
export const PAGE_TITLE = { margin: "0 0 4px 0", fontSize: 24, fontWeight: 700, color: TEXT };
export const PAGE_SUB = { margin: "0 0 18px 0", fontSize: 14, color: MUTED };
export const CHART_TOOLTIP = {
  background: "#1a1815",
  border: "1px solid #3a342a",
  borderRadius: 8,
  fontSize: 12,
};
export const FIELD_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  background: "#0d0c0a",
  border: "1px solid #2a2620",
  borderRadius: 8,
  color: TEXT,
  fontSize: 14,
  outline: "none",
};

/* Conteneur de page : même largeur / fond partout */
export function Page({ children, wide = false }) {
  return (
    <div
      style={{
        padding: isMobileView() ? 12 : 20,
        background: PAGE_BG,
        minHeight: "100vh",
        color: TEXT,
        maxWidth: wide ? 1200 : 760,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/* Cartes repliées, mémorisées par page. `isOpen(k)` / `toggle(k)`. */
export function useFold(pageKey, defaultClosed = []) {
  const storeKey = `pt_fold_${pageKey}`;
  const [closed, setClosed] = useState(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      return raw ? JSON.parse(raw) : defaultClosed;
    } catch (e) {
      return defaultClosed;
    }
  });
  const isOpen = (k) => !closed.includes(k);
  const toggle = (k) =>
    setClosed((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch (e) {
        /* stockage indisponible : valable jusqu'au rechargement */
      }
      return next;
    });
  return { isOpen, toggle };
}

export function FoldBtn({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      title={open ? "Masquer" : "Afficher"}
      style={{
        padding: "3px 10px",
        background: "transparent",
        color: MUTED,
        border: "1px solid #2a2620",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {open ? "▾" : "▸"}
    </button>
  );
}

/* Carte repliable. `fold` = retour de useFold ; `id` = clé de la carte ;
   `right` = éléments optionnels à gauche du bouton (compteur, action…). */
export function FoldCard({ id, fold, title, subtitle, right, accent = false, style, children }) {
  const open = fold ? fold.isOpen(id) : true;
  return (
    <div style={{ ...CARD_STYLE, ...(accent ? { border: CARD_ACCENT_BORDER } : {}), ...style }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: open ? (subtitle ? 4 : 14) : 0,
        }}
      >
        <h3 style={CARD_TITLE}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {right}
          {fold && <FoldBtn open={open} onClick={() => fold.toggle(id)} />}
        </div>
      </div>
      {open && subtitle && <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>{subtitle}</div>}
      {open && children}
    </div>
  );
}

/* ===== En-tête de page (même DA que le tableau de bord) =====
   eyebrow : petite ligne ambre au-dessus du titre (par défaut la date du jour) ;
   actions : boutons à droite (className="pt-btn"). */
export const todayLabel = () => new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export function PageHeader({ title, subtitle, eyebrow, actions, style }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10, marginBottom: 16, ...style }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: ACCENT, fontWeight: 700, textTransform: "capitalize" }}>{eyebrow ?? todayLabel()}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0", color: TEXT }}>{title}</h2>
        {subtitle && <div style={{ color: MUTED, margin: "2px 0 0", fontSize: 13.5 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/* Petit titre de section en majuscules */
export function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED, fontWeight: 700, margin: "0 2px 6px", ...style }}>
      {children}
    </div>
  );
}

/* Tuile chiffre clé : libellé, grande valeur colorée, sous-texte. Cliquable si onClick. */
export function Kpi({ icon, label, value, color = TEXT, sub, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        cursor: onClick ? "pointer" : "default",
        background: active ? `${color}22` : "#151310",
        border: `1px solid ${active ? color : "#2a2620"}`,
        boxShadow: active ? `0 0 0 1px ${color}` : "none",
        color: TEXT,
        minWidth: 0,
        font: "inherit",
      }}
    >
      <div style={{ fontSize: 12, color: MUTED, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </button>
  );
}
export function KpiGrid({ children, min = 150, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 10, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}
