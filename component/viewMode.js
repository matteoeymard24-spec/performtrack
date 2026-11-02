/* =====================================================================
   viewMode.js — affichage « 📱 Téléphone » / « 🖥 Ordinateur » / « Auto », choisi en haut de l'app.
   Mémorisé sur l'appareil (localStorage). Après un changement, la page se recharge.
   • Auto        : selon la largeur de l'écran (comme avant : ≤ 768 px = téléphone).
   • Ordinateur  : sur un petit écran, la page est mise en page sur 1180 px de large (comme la
                   « version ordinateur » d'un navigateur) → mise en page en colonnes, à zoomer au doigt.
   • Téléphone   : sur un grand écran, l'app s'affiche dans une colonne de 440 px centrée, avec la
                   mise en page mobile (menu du bas, une colonne).
   ===================================================================== */
const KEY = "pt_view_mode";
const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no";

export const getViewMode = () => {
  try {
    const m = localStorage.getItem(KEY);
    return m === "mobile" || m === "desktop" ? m : "auto";
  } catch (e) {
    return "auto";
  }
};

/* Remplace les anciens tests « window.innerWidth <= 768 » */
export const isMobileView = () => {
  const m = getViewMode();
  if (m === "mobile") return true;
  if (m === "desktop") return false;
  return typeof window !== "undefined" && window.innerWidth <= 768;
};

export function applyViewMode() {
  if (typeof document === "undefined") return;
  const m = getViewMode();
  document.documentElement.dataset.view = m;
  const meta = document.querySelector('meta[name="viewport"]');
  const small = Math.min(window.screen?.width || 9999, window.innerWidth || 9999) < 900;
  if (meta) meta.setAttribute("content", m === "desktop" && small ? "width=1180" : DEFAULT_VIEWPORT);
}

export const setViewMode = (m) => {
  try {
    localStorage.setItem(KEY, m);
  } catch (e) {
    /* ignore */
  }
  applyViewMode();
  window.location.reload();
};
