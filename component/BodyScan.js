import React, { useEffect, useState } from "react";

function painColor(value = 0) {
  const v = Math.max(0, Math.min(10, value));
  const ratio = v / 10;
  const r = Math.round(255 * ratio);
  const g = Math.round(255 * (1 - ratio));
  return `rgb(${r}, ${g}, 0)`;
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
    { id: "tete", label: "Tête", view: "front", x: 115, y: 20, w: 50, h: 50 },
    { id: "cou", label: "Cou", view: "front", x: 132, y: 70, w: 16, h: 25 },
    {
      id: "tronc",
      label: "Tronc",
      view: "front",
      x: 100,
      y: 95,
      w: 80,
      h: 140,
    },
    {
      id: "epa_g",
      label: "Épaule G",
      view: "front",
      x: 65,
      y: 95,
      w: 35,
      h: 30,
    },
    {
      id: "epa_d",
      label: "Épaule D",
      view: "front",
      x: 180,
      y: 95,
      w: 35,
      h: 30,
    },
    {
      id: "bras_g",
      label: "Bras G",
      view: "front",
      x: 45,
      y: 125,
      w: 30,
      h: 90,
    },
    {
      id: "bras_d",
      label: "Bras D",
      view: "front",
      x: 215,
      y: 125,
      w: 30,
      h: 90,
    },
    {
      id: "avantbras_g",
      label: "Avant-bras G",
      view: "front",
      x: 45,
      y: 215,
      w: 30,
      h: 80,
    },
    {
      id: "avantbras_d",
      label: "Avant-bras D",
      view: "front",
      x: 215,
      y: 215,
      w: 30,
      h: 80,
    },
    {
      id: "main_g",
      label: "Main G",
      view: "front",
      x: 52,
      y: 295,
      w: 16,
      h: 25,
    },
    {
      id: "main_d",
      label: "Main D",
      view: "front",
      x: 222,
      y: 295,
      w: 16,
      h: 25,
    },
    {
      id: "hanche_g",
      label: "Hanche G",
      view: "front",
      x: 110,
      y: 235,
      w: 30,
      h: 30,
    },
    {
      id: "hanche_d",
      label: "Hanche D",
      view: "front",
      x: 140,
      y: 235,
      w: 30,
      h: 30,
    },
    {
      id: "quadri_g",
      label: "Quadri G",
      view: "front",
      x: 110,
      y: 265,
      w: 30,
      h: 90,
    },
    {
      id: "quadri_d",
      label: "Quadri D",
      view: "front",
      x: 140,
      y: 265,
      w: 30,
      h: 90,
    },
    {
      id: "molet_g",
      label: "Mollet G",
      view: "front",
      x: 110,
      y: 355,
      w: 30,
      h: 80,
    },
    {
      id: "molet_d",
      label: "Mollet D",
      view: "front",
      x: 140,
      y: 355,
      w: 30,
      h: 80,
    },
    {
      id: "pied_g",
      label: "Pied G",
      view: "front",
      x: 108,
      y: 435,
      w: 34,
      h: 20,
    },
    {
      id: "pied_d",
      label: "Pied D",
      view: "front",
      x: 142,
      y: 435,
      w: 34,
      h: 20,
    },

    /* ===== FACE ARRIÈRE ===== */
    {
      id: "tete_back",
      label: "Tête",
      view: "back",
      x: 115,
      y: 20,
      w: 50,
      h: 50,
    },
    { id: "cou_back", label: "Cou", view: "back", x: 132, y: 70, w: 16, h: 25 },
    { id: "dos", label: "Dos", view: "back", x: 100, y: 95, w: 80, h: 140 },
    {
      id: "epa_g_back",
      label: "Épaule G",
      view: "back",
      x: 65,
      y: 95,
      w: 35,
      h: 30,
    },
    {
      id: "epa_d_back",
      label: "Épaule D",
      view: "back",
      x: 180,
      y: 95,
      w: 35,
      h: 30,
    },
    {
      id: "bras_g_back",
      label: "Bras G",
      view: "back",
      x: 45,
      y: 125,
      w: 30,
      h: 90,
    },
    {
      id: "bras_d_back",
      label: "Bras D",
      view: "back",
      x: 215,
      y: 125,
      w: 30,
      h: 90,
    },
    {
      id: "avantbras_g_back",
      label: "Avant-bras G",
      view: "back",
      x: 45,
      y: 215,
      w: 30,
      h: 80,
    },
    {
      id: "avantbras_d_back",
      label: "Avant-bras D",
      view: "back",
      x: 215,
      y: 215,
      w: 30,
      h: 80,
    },
    {
      id: "main_g_back",
      label: "Main G",
      view: "back",
      x: 52,
      y: 295,
      w: 16,
      h: 25,
    },
    {
      id: "main_d_back",
      label: "Main D",
      view: "back",
      x: 222,
      y: 295,
      w: 16,
      h: 25,
    },
    {
      id: "fessier_g",
      label: "Fessier G",
      view: "back",
      x: 110,
      y: 235,
      w: 30,
      h: 35,
    },
    {
      id: "fessier_d",
      label: "Fessier D",
      view: "back",
      x: 140,
      y: 235,
      w: 30,
      h: 35,
    },
    {
      id: "ischio_g",
      label: "Ischio G",
      view: "back",
      x: 110,
      y: 270,
      w: 30,
      h: 90,
    },
    {
      id: "ischio_d",
      label: "Ischio D",
      view: "back",
      x: 140,
      y: 270,
      w: 30,
      h: 90,
    },
    {
      id: "mollet_g_back",
      label: "Mollet G",
      view: "back",
      x: 110,
      y: 360,
      w: 30,
      h: 80,
    },
    {
      id: "mollet_d_back",
      label: "Mollet D",
      view: "back",
      x: 140,
      y: 360,
      w: 30,
      h: 80,
    },
    {
      id: "pied_g_back",
      label: "Pied G",
      view: "back",
      x: 108,
      y: 440,
      w: 34,
      h: 20,
    },
    {
      id: "pied_d_back",
      label: "Pied D",
      view: "back",
      x: 142,
      y: 440,
      w: 34,
      h: 20,
    },
  ];

  const currentZones = zones.filter((z) => z.view === view);
  const selectedZoneData = zones.find((z) => z.id === selectedZone);

  return (
    <div>
      {/* Toggle view */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <button
          onClick={() => setView("front")}
          style={{
            flex: 1,
            padding: 12,
            background: view === "front" ? "#2f80ed" : "#333",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: view === "front" ? "bold" : "normal",
          }}
        >
          Face avant
        </button>
        <button
          onClick={() => setView("back")}
          style={{
            flex: 1,
            padding: 12,
            background: view === "back" ? "#2f80ed" : "#333",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: view === "back" ? "bold" : "normal",
          }}
        >
          Face arrière
        </button>
      </div>

      {/* SVG Body */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 20,
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <svg
          width="280"
          height="460"
          style={{ background: "#fff", borderRadius: 8 }}
        >
          {currentZones.map((zone) => {
            const value = painMap[zone.id] ?? 0;
            return (
              <rect
                key={zone.id}
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                rx={15}
                fill={value > 0 ? painColor(value) : "#f5f5f5"}
                stroke={selectedZone === zone.id ? "#2f80ed" : "#999"}
                strokeWidth={selectedZone === zone.id ? 3 : 1}
                onClick={() => setSelectedZone(zone.id)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>
      </div>

      {/* Zone selector */}
      {selectedZone && selectedZoneData && (
        <div
          style={{
            background: "#1a1a1a",
            padding: 20,
            borderRadius: 12,
            border: "2px solid #2f80ed",
          }}
        >
          <h4 style={{ margin: "0 0 15px 0", color: "#2f80ed" }}>
            {selectedZoneData.label}
          </h4>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 12,
              color: "#888",
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
              background:
                "linear-gradient(to right, #27ae60, #f39c12, #e74c3c)",
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
                background: "#27ae60",
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
                padding: 14,
                background: "#e74c3c",
                color: "white",
                border: "none",
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
            color: "#888",
            fontSize: 14,
            margin: 0,
          }}
        >
          Cliquez sur une zone du corps pour indiquer une douleur
        </p>
      )}
    </div>
  );
}
