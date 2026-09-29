import React, { useEffect, useState } from "react";

const ACCENT = "#e0a13d";
const SUCCESS = "#4fae7d";
const WARNING = "#d9a441";
const DANGER = "#d9695a";
const SURFACE = "#151310";
const SURFACE_2 = "#1a1815";
const SURFACE_3 = "#221f1a";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_STRONG = "rgba(255,255,255,0.16)";
const TEXT = "#f3f0ea";
const TEXT_MUTED = "#a8a199";
const EMPTY_ZONE = "#2a2620";

// Interpole entre vert (0) -> ambre (5) -> rouge (10)
function painColor(value = 0) {
  const v = Math.max(0, Math.min(10, value));
  const from = (a, b, t) => Math.round(a + (b - a) * t);
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = hexToRgb(SUCCESS);
  const [r2, g2, b2] = hexToRgb(WARNING);
  const [r3, g3, b3] = hexToRgb(DANGER);
  let r, g, b;
  if (v <= 5) {
    const t = v / 5;
    r = from(r1, r2, t);
    g = from(g1, g2, t);
    b = from(b1, b2, t);
  } else {
    const t = (v - 5) / 5;
    r = from(r2, r3, t);
    g = from(g2, g3, t);
    b = from(b2, b3, t);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

export default function BodyScan({ painMap = {}, setPainMap }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [intensity, setIntensity] = useState(0);
  const [view, setView] = useState("front");

  useEffect(() => {
    if (selectedZone) {
      setIntensity(painMap[selectedZone] ?? 0);
    }
  }, [selectedZone, painMap]);

  function saveIntensity() {
    if (!selectedZone) return;
    setPainMap({ ...painMap, [selectedZone]: intensity });
    setSelectedZone(null);
  }

  // Coordonnées calées sur le contour de la silhouette (voir le path plus bas)
  // pour que chaque zone cliquable épouse réellement le membre correspondant.
  const zones = [
    /* ===== FACE AVANT ===== */
    { id: "tete", label: "Tête", view: "front", x: 110, y: 14, w: 60, h: 58, rx: 28 },
    { id: "cou", label: "Cou", view: "front", x: 124, y: 76, w: 32, h: 16, rx: 8 },
    { id: "epa_g", label: "Épaule G", view: "front", x: 60, y: 86, w: 48, h: 36, rx: 17 },
    { id: "epa_d", label: "Épaule D", view: "front", x: 172, y: 86, w: 48, h: 36, rx: 17 },
    { id: "tronc", label: "Tronc", view: "front", x: 86, y: 98, w: 108, h: 104, rx: 24 },
    { id: "bras_g", label: "Bras G", view: "front", x: 46, y: 122, w: 38, h: 80, rx: 17 },
    { id: "bras_d", label: "Bras D", view: "front", x: 196, y: 122, w: 38, h: 80, rx: 17 },
    { id: "avantbras_g", label: "Avant-bras G", view: "front", x: 50, y: 202, w: 30, h: 72, rx: 14 },
    { id: "avantbras_d", label: "Avant-bras D", view: "front", x: 200, y: 202, w: 30, h: 72, rx: 14 },
    { id: "main_g", label: "Main G", view: "front", x: 46, y: 296, w: 36, h: 32, rx: 16 },
    { id: "main_d", label: "Main D", view: "front", x: 198, y: 296, w: 36, h: 32, rx: 16 },
    { id: "hanche_g", label: "Hanche G", view: "front", x: 100, y: 206, w: 38, h: 38, rx: 18 },
    { id: "hanche_d", label: "Hanche D", view: "front", x: 142, y: 206, w: 38, h: 38, rx: 18 },
    { id: "quadri_g", label: "Quadri G", view: "front", x: 98, y: 248, w: 40, h: 84, rx: 19 },
    { id: "quadri_d", label: "Quadri D", view: "front", x: 142, y: 248, w: 40, h: 84, rx: 19 },
    { id: "molet_g", label: "Mollet G", view: "front", x: 104, y: 332, w: 32, h: 76, rx: 15 },
    { id: "molet_d", label: "Mollet D", view: "front", x: 144, y: 332, w: 32, h: 76, rx: 15 },
    { id: "pied_g", label: "Pied G", view: "front", x: 92, y: 408, w: 52, h: 28, rx: 14 },
    { id: "pied_d", label: "Pied D", view: "front", x: 136, y: 408, w: 52, h: 28, rx: 14 },

    /* ===== FACE ARRIÈRE (même silhouette, zones dorsales) ===== */
    { id: "tete_back", label: "Tête", view: "back", x: 110, y: 14, w: 60, h: 58, rx: 28 },
    { id: "cou_back", label: "Cou", view: "back", x: 124, y: 76, w: 32, h: 16, rx: 8 },
    { id: "epa_g_back", label: "Épaule G", view: "back", x: 60, y: 86, w: 48, h: 36, rx: 17 },
    { id: "epa_d_back", label: "Épaule D", view: "back", x: 172, y: 86, w: 48, h: 36, rx: 17 },
    { id: "dos", label: "Dos", view: "back", x: 86, y: 98, w: 108, h: 104, rx: 24 },
    { id: "bras_g_back", label: "Bras G", view: "back", x: 46, y: 122, w: 38, h: 80, rx: 17 },
    { id: "bras_d_back", label: "Bras D", view: "back", x: 196, y: 122, w: 38, h: 80, rx: 17 },
    { id: "avantbras_g_back", label: "Avant-bras G", view: "back", x: 50, y: 202, w: 30, h: 72, rx: 14 },
    { id: "avantbras_d_back", label: "Avant-bras D", view: "back", x: 200, y: 202, w: 30, h: 72, rx: 14 },
    { id: "main_g_back", label: "Main G", view: "back", x: 46, y: 296, w: 36, h: 32, rx: 16 },
    { id: "main_d_back", label: "Main D", view: "back", x: 198, y: 296, w: 36, h: 32, rx: 16 },
    { id: "fessier_g", label: "Fessier G", view: "back", x: 76, y: 228, w: 54, h: 48, rx: 22 },
    { id: "fessier_d", label: "Fessier D", view: "back", x: 150, y: 228, w: 54, h: 48, rx: 22 },
    { id: "ischio_g", label: "Ischio G", view: "back", x: 86, y: 280, w: 46, h: 70, rx: 22 },
    { id: "ischio_d", label: "Ischio D", view: "back", x: 148, y: 280, w: 46, h: 70, rx: 22 },
    { id: "mollet_g_back", label: "Mollet G", view: "back", x: 88, y: 350, w: 42, h: 66, rx: 20 },
    { id: "mollet_d_back", label: "Mollet D", view: "back", x: 150, y: 350, w: 42, h: 66, rx: 20 },
    { id: "pied_g_back", label: "Pied G", view: "back", x: 92, y: 408, w: 52, h: 28, rx: 14 },
    { id: "pied_d_back", label: "Pied D", view: "back", x: 136, y: 408, w: 52, h: 28, rx: 14 },
  ];

  // Silhouette anatomique construite en courbes continues (deltoïdes,
  // biceps/triceps, pecs/obliques, quadriceps, mollets). Face avant et
  // arrière ont des tracés distincts : bassin plat + hanches devant,
  // galbe fessier + ischios marqués derrière.
  const FRONT_SILHOUETTE_PATH =
    "M 140 6 C 158 6 173 17 173 44 C 173 56 168 65 160 71 L 154 77 C 152 81 150 85 150 89 C 156 87 172 84 187 89 C 206 95 220 106 224 121 C 228 140 223 160 217 178 L 213 194 C 219 206 221 220 217 238 L 211 264 L 207 278 C 205 286 213 292 213 304 C 213 316 201 322 193 318 L 197 301 L 201 265 C 203 245 199 227 195 209 L 199 191 C 203 173 199 153 189 139 C 183 129 179 121 177 113 C 183 125 187 141 183 159 C 179 173 173 183 173 195 C 173 205 177 213 181 223 L 183 237 C 189 251 189 271 185 289 C 181 307 179 321 177 333 L 175 347 C 181 359 183 375 179 393 L 173 411 C 171 419 171 425 173 431 C 181 433 197 433 201 425 C 204 419 200 415 193 414 L 167 411 C 165 395 163 379 167 361 L 169 347 C 167 327 165 307 163 289 C 161 271 157 257 149 249 L 140 247 L 131 249 C 123 257 119 271 117 289 C 115 307 113 327 111 347 L 113 361 C 117 379 115 395 113 411 L 87 414 C 80 415 76 419 79 425 C 83 433 99 433 107 431 C 109 425 109 419 107 411 L 101 393 C 97 375 99 359 105 347 L 103 333 C 101 321 99 307 95 289 C 91 271 91 251 97 237 L 99 223 C 103 213 107 205 107 195 C 107 183 101 173 97 159 C 93 141 97 125 103 113 C 101 121 97 129 91 139 C 81 153 77 173 81 191 L 85 209 C 81 227 77 245 79 265 L 83 301 L 87 318 C 79 322 67 316 67 304 C 67 292 75 286 73 278 L 69 264 L 63 238 C 59 220 61 206 67 194 L 63 178 C 57 160 52 140 56 121 C 60 106 74 95 93 89 C 108 84 124 87 130 89 C 130 85 128 81 126 77 L 120 71 C 112 65 107 56 107 44 C 107 17 122 6 140 6 Z";

  // Dos redessiné séparément du torse avant : large en haut (dorsaux/
  // trapèze), taille basse resserrée. Fessier galbé mais modéré (plus
  // fidèle à la réalité), largeur cohérente avec l'ischio en dessous.
  const BACK_SILHOUETTE_PATH =
    "M 140 6 C 158 6 173 17 173 44 C 173 56 168 65 160 71 L 154 77 C 152 81 150 85 150 89 C 156 87 172 84 187 89 C 206 95 220 106 224 121 C 228 140 223 160 217 178 L 213 194 C 219 206 221 220 217 238 L 211 264 L 207 278 C 205 286 213 292 213 304 C 213 316 201 322 193 318 L 197 301 L 201 265 C 203 245 199 227 195 209 L 199 191 C 203 173 199 153 189 139 C 183 129 179 121 177 113 C 184 121 189 133 185 150 C 181 166 175 178 173 192 C 172 202 176 211 181 220 L 183 233 C 194 240 198 251 194 264 C 190 276 186 282 182 285 C 186 296 187 313 182 330 L 178 347 C 186 360 188 377 182 395 L 175 413 C 173 420 173 426 175 432 C 183 434 197 432 199 424 C 202 418 198 414 191 413 L 166 413 C 162 398 160 381 166 362 L 168 347 C 163 330 162 313 166 296 C 162 282 154 276 148 266 C 144 257 140 249 140 240 C 140 249 136 257 132 266 C 126 276 118 282 114 296 C 118 313 117 330 112 347 L 114 362 C 120 381 118 398 114 413 L 89 413 C 82 414 78 418 81 424 C 83 432 97 434 105 432 C 107 426 107 420 105 413 L 98 395 C 92 377 94 360 102 347 L 98 330 C 93 313 94 296 98 285 C 94 282 90 276 86 264 C 82 251 86 240 97 233 L 99 220 C 104 211 108 202 107 192 C 105 178 99 166 95 150 C 91 133 96 121 103 113 C 101 121 97 129 91 139 C 81 153 77 173 81 191 L 85 209 C 81 227 77 245 79 265 L 83 301 L 87 318 C 79 322 67 316 67 304 C 67 292 75 286 73 278 L 69 264 L 63 238 C 59 220 61 206 67 194 L 63 178 C 57 160 52 140 56 121 C 60 106 74 95 93 89 C 108 84 124 87 130 89 C 130 85 128 81 126 77 L 120 71 C 112 65 107 56 107 44 C 107 17 122 6 140 6 Z";

  // Traits de définition musculaire dessinés par-dessus les zones
  // cliquables (clavicules/abdos/obliques devant, trapèze/omoplates/
  // colonne/ischios derrière) pour éviter l'effet "silhouette plate".
  // Traits marqués (contours de groupes musculaires) vs traits fins
  // (relief secondaire) pour lire les muscles sans surcharger le dessin.
  const FRONT_DETAIL_LINES = [
    "M 152 90 Q 140 97 128 90",
    "M 178 98 Q 196 103 206 118",
    "M 102 98 Q 84 103 74 118",
    "M 140 104 Q 158 108 170 126",
    "M 140 104 Q 122 108 110 126",
    "M 140 100 L 140 222",
    "M 154 132 Q 168 158 172 192",
    "M 126 132 Q 112 158 108 192",
    "M 216 145 Q 225 165 216 188",
    "M 64 145 Q 55 165 64 188",
    "M 176 258 Q 180 292 173 330",
    "M 148 260 Q 144 292 148 330",
    "M 104 258 Q 100 292 107 330",
    "M 132 260 Q 136 292 132 330",
    "M 165 365 L 162 400",
    "M 115 365 L 118 400",
  ];

  const FRONT_DETAIL_LINES_SOFT = [
    "M 125 148 L 155 148",
    "M 126 163 L 154 163",
    "M 127 178 L 153 178",
    "M 129 194 L 151 194",
    "M 131 209 L 149 209",
    "M 210 205 Q 216 222 210 245",
    "M 70 205 Q 64 222 70 245",
  ];

  const BACK_DETAIL_LINES = [
    "M 140 90 L 154 132 L 140 174 L 126 132 Z",
    "M 178 98 Q 198 106 202 124",
    "M 102 98 Q 82 106 78 124",
    "M 140 100 L 140 228",
    "M 180 118 Q 170 158 160 190",
    "M 100 118 Q 110 158 120 190",
    "M 165 240 Q 176 255 172 275",
    "M 115 240 Q 104 255 108 275",
    "M 163 296 Q 166 313 160 330",
    "M 117 296 Q 114 313 120 330",
    "M 168 363 Q 173 380 166 398",
    "M 112 363 Q 107 380 114 398",
  ];

  const BACK_DETAIL_LINES_SOFT = [
    "M 130 150 Q 126 188 124 224",
    "M 150 150 Q 154 188 156 224",
    "M 166 128 Q 159 158 154 188",
    "M 114 128 Q 121 158 126 188",
    "M 155 305 Q 156 320 154 333",
    "M 125 305 Q 124 320 126 333",
    "M 158 365 Q 155 380 160 396",
    "M 122 365 Q 125 380 120 396",
  ];

  // Petits reliefs (genoux devant, omoplates derrière) en ellipses.
  const FRONT_DETAIL_ELLIPSES = [
    { cx: 163, cy: 345, rx: 7, ry: 9 },
    { cx: 117, cy: 345, rx: 7, ry: 9 },
  ];

  const BACK_DETAIL_ELLIPSES = [
    { cx: 122, cy: 135, rx: 10, ry: 15, rotate: -15 },
    { cx: 158, cy: 135, rx: 10, ry: 15, rotate: 15 },
  ];

  const currentSilhouettePath = view === "front" ? FRONT_SILHOUETTE_PATH : BACK_SILHOUETTE_PATH;
  const currentDetailLines = view === "front" ? FRONT_DETAIL_LINES : BACK_DETAIL_LINES;
  const currentDetailLinesSoft = view === "front" ? FRONT_DETAIL_LINES_SOFT : BACK_DETAIL_LINES_SOFT;
  const currentDetailEllipses = view === "front" ? FRONT_DETAIL_ELLIPSES : BACK_DETAIL_ELLIPSES;

  const currentZones = zones.filter((z) => z.view === view);
  const selectedZoneData = zones.find((z) => z.id === selectedZone);
  const filledCount = Object.values(painMap).filter((v) => v > 0).length;

  return (
    <div>
      {/* Toggle vue */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "front", label: "Face avant" },
          { key: "back", label: "Face arrière" },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            style={{
              flex: 1,
              padding: 12,
              background: view === v.key ? ACCENT : SURFACE_3,
              color: view === v.key ? "#1a1306" : TEXT_MUTED,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: view === v.key ? "700" : "500",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Silhouette SVG */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 16,
          background: SURFACE,
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          padding: "16px 10px",
        }}
      >
        <svg
          width="280"
          height="460"
          viewBox="0 0 280 460"
          style={{ maxWidth: "100%", height: "auto" }}
        >
          {/* Silhouette de fond : un contour unique et continu, pas de blocs empilés */}
          <defs>
            <linearGradient id="bodyShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SURFACE_3} />
              <stop offset="100%" stopColor={SURFACE_2} />
            </linearGradient>
            {/* Les zones cliquables sont découpées par ce même contour :
                aucune couleur ne peut déborder de la silhouette. */}
            <clipPath id="bodyClip">
              <path d={currentSilhouettePath} />
            </clipPath>
          </defs>
          <path
            fill="url(#bodyShade)"
            stroke={BORDER_STRONG}
            strokeWidth={1.5}
            strokeLinejoin="round"
            d={currentSilhouettePath}
          />

          <g clipPath="url(#bodyClip)">
            {currentZones.map((zone) => {
              const value = painMap[zone.id] ?? 0;
              const isSelected = selectedZone === zone.id;
              return (
                <rect
                  key={zone.id}
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={zone.rx}
                  fill={value > 0 ? painColor(value) : EMPTY_ZONE}
                  fillOpacity={value > 0 ? 0.85 : 1}
                  stroke={isSelected ? ACCENT : BORDER_STRONG}
                  strokeWidth={isSelected ? 3 : 1}
                  onClick={() => setSelectedZone(zone.id)}
                  style={{ cursor: "pointer", transition: "stroke 0.15s ease" }}
                />
              );
            })}
          </g>

          {/* Traits de définition musculaire (non cliquables) */}
          <g
            clipPath="url(#bodyClip)"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1.1}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          >
            {currentDetailLines.map((d, i) => (
              <path key={i} d={d} />
            ))}
            {currentDetailEllipses.map((e, i) => (
              <ellipse
                key={i}
                cx={e.cx}
                cy={e.cy}
                rx={e.rx}
                ry={e.ry}
                transform={e.rotate ? `rotate(${e.rotate} ${e.cx} ${e.cy})` : undefined}
              />
            ))}
          </g>
          <g
            clipPath="url(#bodyClip)"
            fill="none"
            stroke="rgba(255,255,255,0.13)"
            strokeWidth={1}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          >
            {currentDetailLinesSoft.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>

          {/* Contour redessiné par-dessus pour que le trait du corps reste net */}
          <path
            fill="none"
            stroke={BORDER_STRONG}
            strokeWidth={1.5}
            strokeLinejoin="round"
            d={currentSilhouettePath}
          />
        </svg>
      </div>

      {/* Légende échelle de douleur */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            height: 6,
            borderRadius: 4,
            background: `linear-gradient(to right, ${SUCCESS}, ${WARNING}, ${DANGER})`,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: TEXT_MUTED,
          }}
        >
          <span>Aucune douleur</span>
          <span>Douleur intense</span>
        </div>
      </div>

      {/* Sélecteur de zone */}
      {selectedZone && selectedZoneData && (
        <div
          style={{
            background: SURFACE_2,
            padding: 20,
            borderRadius: 12,
            border: `2px solid ${ACCENT}`,
          }}
        >
          <h4 style={{ margin: "0 0 15px 0", color: ACCENT }}>
            {selectedZoneData.label}
          </h4>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 12,
              color: TEXT_MUTED,
            }}
          >
            <span>Pas de douleur</span>
            <span>Douleur intense</span>
          </div>

          <input
            type="range"
            min="0"
            max="10"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            style={{
              width: "100%",
              height: 8,
              borderRadius: 5,
              outline: "none",
              background: `linear-gradient(to right, ${SUCCESS}, ${WARNING}, ${DANGER})`,
              WebkitAppearance: "none",
              appearance: "none",
              cursor: "pointer",
              marginBottom: 15,
            }}
          />

          <div
            style={{
              textAlign: "center",
              marginBottom: 15,
              fontSize: 32,
              fontWeight: "bold",
              color: painColor(intensity),
            }}
          >
            {intensity}/10
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={saveIntensity}
              style={{
                flex: 1,
                padding: 14,
                background: SUCCESS,
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              ✅ Valider
            </button>
            <button
              onClick={() => setSelectedZone(null)}
              style={{
                padding: "14px 18px",
                background: "transparent",
                color: TEXT_MUTED,
                border: `1px solid ${BORDER_STRONG}`,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {!selectedZone && (
        <p
          style={{
            textAlign: "center",
            color: TEXT_MUTED,
            fontSize: 14,
            margin: 0,
          }}
        >
          {filledCount > 0
            ? `${filledCount} zone${filledCount > 1 ? "s" : ""} renseignée${filledCount > 1 ? "s" : ""} · touchez une zone pour la modifier`
            : "Touchez une zone du corps pour indiquer une douleur"}
        </p>
      )}
    </div>
  );
}
