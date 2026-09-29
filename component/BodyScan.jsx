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

  const zones = [
    /* ===== FACE AVANT ===== */
    { id: "tete", label: "Tête", view: "front", x: 115, y: 18, w: 50, h: 50, rx: 25 },
    { id: "cou", label: "Cou", view: "front", x: 132, y: 68, w: 16, h: 26, rx: 8 },
    { id: "tronc", label: "Tronc", view: "front", x: 100, y: 94, w: 80, h: 138, rx: 24 },
    { id: "epa_g", label: "Épaule G", view: "front", x: 64, y: 94, w: 36, h: 30, rx: 15 },
    { id: "epa_d", label: "Épaule D", view: "front", x: 180, y: 94, w: 36, h: 30, rx: 15 },
    { id: "bras_g", label: "Bras G", view: "front", x: 46, y: 124, w: 28, h: 88, rx: 14 },
    { id: "bras_d", label: "Bras D", view: "front", x: 206, y: 124, w: 28, h: 88, rx: 14 },
    { id: "avantbras_g", label: "Avant-bras G", view: "front", x: 46, y: 212, w: 28, h: 78, rx: 14 },
    { id: "avantbras_d", label: "Avant-bras D", view: "front", x: 206, y: 212, w: 28, h: 78, rx: 14 },
    { id: "main_g", label: "Main G", view: "front", x: 52, y: 290, w: 18, h: 26, rx: 9 },
    { id: "main_d", label: "Main D", view: "front", x: 210, y: 290, w: 18, h: 26, rx: 9 },
    { id: "hanche_g", label: "Hanche G", view: "front", x: 110, y: 232, w: 30, h: 30, rx: 15 },
    { id: "hanche_d", label: "Hanche D", view: "front", x: 140, y: 232, w: 30, h: 30, rx: 15 },
    { id: "quadri_g", label: "Quadri G", view: "front", x: 110, y: 262, w: 30, h: 88, rx: 15 },
    { id: "quadri_d", label: "Quadri D", view: "front", x: 140, y: 262, w: 30, h: 88, rx: 15 },
    { id: "molet_g", label: "Mollet G", view: "front", x: 110, y: 350, w: 30, h: 78, rx: 15 },
    { id: "molet_d", label: "Mollet D", view: "front", x: 140, y: 350, w: 30, h: 78, rx: 15 },
    { id: "pied_g", label: "Pied G", view: "front", x: 106, y: 428, w: 34, h: 20, rx: 10 },
    { id: "pied_d", label: "Pied D", view: "front", x: 140, y: 428, w: 34, h: 20, rx: 10 },

    /* ===== FACE ARRIÈRE ===== */
    { id: "tete_back", label: "Tête", view: "back", x: 115, y: 18, w: 50, h: 50, rx: 25 },
    { id: "cou_back", label: "Cou", view: "back", x: 132, y: 68, w: 16, h: 26, rx: 8 },
    { id: "dos", label: "Dos", view: "back", x: 100, y: 94, w: 80, h: 138, rx: 24 },
    { id: "epa_g_back", label: "Épaule G", view: "back", x: 64, y: 94, w: 36, h: 30, rx: 15 },
    { id: "epa_d_back", label: "Épaule D", view: "back", x: 180, y: 94, w: 36, h: 30, rx: 15 },
    { id: "bras_g_back", label: "Bras G", view: "back", x: 46, y: 124, w: 28, h: 88, rx: 14 },
    { id: "bras_d_back", label: "Bras D", view: "back", x: 206, y: 124, w: 28, h: 88, rx: 14 },
    { id: "avantbras_g_back", label: "Avant-bras G", view: "back", x: 46, y: 212, w: 28, h: 78, rx: 14 },
    { id: "avantbras_d_back", label: "Avant-bras D", view: "back", x: 206, y: 212, w: 28, h: 78, rx: 14 },
    { id: "main_g_back", label: "Main G", view: "back", x: 52, y: 290, w: 18, h: 26, rx: 9 },
    { id: "main_d_back", label: "Main D", view: "back", x: 210, y: 290, w: 18, h: 26, rx: 9 },
    { id: "fessier_g", label: "Fessier G", view: "back", x: 110, y: 232, w: 30, h: 35, rx: 15 },
    { id: "fessier_d", label: "Fessier D", view: "back", x: 140, y: 232, w: 30, h: 35, rx: 15 },
    { id: "ischio_g", label: "Ischio G", view: "back", x: 110, y: 268, w: 30, h: 88, rx: 15 },
    { id: "ischio_d", label: "Ischio D", view: "back", x: 140, y: 268, w: 30, h: 88, rx: 15 },
    { id: "mollet_g_back", label: "Mollet G", view: "back", x: 110, y: 357, w: 30, h: 78, rx: 15 },
    { id: "mollet_d_back", label: "Mollet D", view: "back", x: 140, y: 357, w: 30, h: 78, rx: 15 },
    { id: "pied_g_back", label: "Pied G", view: "back", x: 106, y: 436, w: 34, h: 20, rx: 10 },
    { id: "pied_d_back", label: "Pied D", view: "back", x: 140, y: 436, w: 34, h: 20, rx: 10 },
  ];

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
          </defs>
          <path
            fill="url(#bodyShade)"
            stroke={BORDER_STRONG}
            strokeWidth={1.5}
            strokeLinejoin="round"
            d="M 140 12 Q 172 12 172 45 Q 172 68 156 72 L 150 80 L 150 90 Q 170 86 196 96 L 218 122 L 222 200 L 216 270 Q 226 280 228 300 Q 228 320 210 322 Q 196 320 198 300 L 204 268 L 200 200 L 192 124 Q 188 108 176 100 L 182 130 L 170 168 Q 176 188 184 204 L 176 250 L 172 332 L 166 408 Q 166 418 188 420 Q 196 424 188 434 L 158 436 L 152 410 L 148 332 L 144 250 L 140 246 L 136 250 L 132 332 L 128 410 L 122 436 L 92 434 Q 84 424 92 420 Q 114 418 114 408 L 108 332 L 104 250 L 96 204 Q 104 188 110 168 L 98 130 L 104 100 Q 92 108 88 124 L 80 200 L 76 268 L 82 300 Q 84 320 70 322 Q 52 320 52 300 Q 54 280 64 270 L 58 200 L 62 122 L 84 96 Q 110 86 130 90 L 130 80 L 124 72 Q 108 68 108 45 Q 108 12 140 12 Z"
          />

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
