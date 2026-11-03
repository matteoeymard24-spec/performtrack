import React from "react";

/* =====================================================================
   ExercisePhoto.jsx — rendu unique des photos / GIF d'exercices (DA de l'app).
   Le traitement est appliqué À L'AFFICHAGE : l'original reste intact en base
   (réversible, et les GIF gardent leur animation). Toute nouvelle photo,
   même « temporaire », prend automatiquement le même rendu.

   • Teinte commune : couleurs atténuées et réchauffées (sépia léger), blancs
     adoucis pour ne pas éblouir sur le fond sombre, contraste un peu relevé.
   • Cadre : fond sombre rempli par la photo elle-même floutée (plus de bandes
     vides quand le format ne colle pas), vignettage, liseré ambre discret.
   ===================================================================== */

export const PHOTO_FILTER = "grayscale(0.5) sepia(0.5) saturate(1.15) hue-rotate(-4deg) contrast(1.05) brightness(0.86)";

/* Vignette carrée (listes, suggestions) */
export function ExerciseThumb({ src, size = 36, radius = 8 }) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-block",
        background: "#0d0c0a",
        boxShadow: "inset 0 0 0 1px rgba(224,161,61,0.22)",
      }}
    >
      <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: PHOTO_FILTER, display: "block" }} />
    </span>
  );
}

/* Grand cadre (démo d'un exercice) : height en px, zoom en % (réglage existant mediaZoom) */
export default function ExercisePhoto({ src, alt = "", height = 220, zoom = 100, transition = false }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        borderRadius: 12,
        background: "#0d0c0a",
        border: "1px solid #2a2620",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        isolation: "isolate",
      }}
    >
      {/* fond : la photo floutée et assombrie remplit les bords */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: `${PHOTO_FILTER} blur(18px) brightness(0.32)`,
          transform: "scale(1.15)",
          zIndex: 0,
        }}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          filter: PHOTO_FILTER,
          transform: `scale(${(zoom || 100) / 100})`,
          transition: transition ? "transform 0.1s ease-out" : undefined,
        }}
      />
      {/* vignettage + liseré ambre */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(13,12,10,0) 70%, rgba(13,12,10,0.35) 100%)",
          boxShadow: "inset 0 0 0 1px rgba(224,161,61,0.16)",
          borderRadius: 12,
        }}
      />
    </div>
  );
}
