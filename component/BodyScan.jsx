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
    { id: "fessier_g", label: "Fessier G", view: "back", x: 100, y: 206, w: 38, h: 38, rx: 18 },
    { id: "fessier_d", label: "Fessier D", view: "back", x: 142, y: 206, w: 38, h: 38, rx: 18 },
    { id: "ischio_g", label: "Ischio G", view: "back", x: 98, y: 248, w: 40, h: 84, rx: 19 },
    { id: "ischio_d", label: "Ischio D", view: "back", x: 142, y: 248, w: 40, h: 84, rx: 19 },
    { id: "mollet_g_back", label: "Mollet G", view: "back", x: 104, y: 332, w: 32, h: 76, rx: 15 },
    { id: "mollet_d_back", label: "Mollet D", view: "back", x: 144, y: 332, w: 32, h: 76, rx: 15 },
    { id: "pied_g_back", label: "Pied G", view: "back", x: 92, y: 408, w: 52, h: 28, rx: 14 },
    { id: "pied_d_back", label: "Pied D", view: "back", x: 136, y: 408, w: 52, h: 28, rx: 14 },
  ];

  // Silhouette plus large d'épaules, bras/cuisses plus marqués, hanches
  // plus étroites que les épaules : gabarit masculin et costaud.
  const SILHOUETTE_PATH =
    "M 140 10 Q 176 10 176 44 Q 176 66 160 74 L 154 82 L 154 92 Q 178 86 206 98 L 228 126 Q 234 155 228 185 L 222 205 L 218 272 Q 228 282 230 302 Q 230 322 212 324 Q 198 322 200 302 L 206 270 L 204 206 L 198 128 Q 194 110 182 102 L 188 132 L 172 168 Q 176 186 180 204 L 178 250 L 174 332 L 168 408 Q 168 418 190 420 Q 198 424 190 434 L 160 436 L 154 410 L 150 332 L 146 250 L 140 246 L 134 250 L 130 332 L 126 410 L 120 436 L 90 434 Q 82 424 90 420 Q 112 418 112 408 L 106 332 L 102 250 L 100 204 Q 104 186 108 168 L 92 132 L 98 102 Q 86 110 82 128 L 76 206 L 74 270 L 80 302 Q 82 322 68 324 Q 50 322 50 302 Q 52 282 62 272 L 58 205 L 52 185 Q 46 155 52 126 L 74 98 Q 102 86 126 92 L 126 82 L 120 74 Q 104 66 104 44 Q 104 10 140 10 Z";

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
              <path d={SILHOUETTE_PATH} />
            </clipPath>
          </defs>
          <path
            fill="url(#bodyShade)"
            stroke={BORDER_STRONG}
            strokeWidth={1.5}
            strokeLinejoin="round"
            d={SILHOUETTE_PATH}
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

          {/* Contour redessiné par-dessus pour que le trait du corps reste net */}
          <path
            fill="none"
            stroke={BORDER_STRONG}
            strokeWidth={1.5}
            strokeLinejoin="round"
            d={SILHOUETTE_PATH}
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
