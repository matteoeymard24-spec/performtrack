import React from "react";

export default function WellnessSlider({
  label,
  value,
  setValue,
  type,
  leftLabel,
  rightLabel,
}) {
  // Couleur en fonction du type et de la valeur
  const getColor = () => {
    if (type === "bad") {
      // Rouge → Vert (inversé)
      const ratio = value / 10;
      const r = Math.round(255 * ratio);
      const g = Math.round(255 * (1 - ratio));
      return `rgb(${r}, ${g}, 0)`;
    } else {
      // Vert → Rouge (normal)
      const ratio = value / 10;
      const g = Math.round(255 * ratio);
      const r = Math.round(255 * (1 - ratio));
      return `rgb(${r}, ${g}, 0)`;
    }
  };

  return (
    <div
      style={{
        marginBottom: 25,
        padding: "20px",
        background: "#2a2a2a",
        borderRadius: 12,
        border: "1px solid #444",
      }}
    >
      {/* Label principal */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h4 style={{ margin: 0, color: "#ffffff", fontSize: 16 }}>{label}</h4>
        <div
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: getColor(),
            minWidth: 50,
            textAlign: "right",
          }}
        >
          {value}/10
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min="0"
        max="10"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{
          width: "100%",
          height: 8,
          borderRadius: 5,
          outline: "none",
          background:
            type === "bad"
              ? "linear-gradient(to right, #27ae60, #f39c12, #e74c3c)"
              : "linear-gradient(to right, #e74c3c, #f39c12, #27ae60)",
          WebkitAppearance: "none",
          appearance: "none",
          cursor: "pointer",
        }}
      />

      {/* Labels gauche/droite */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 12,
          color: "#888",
        }}
      >
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>

      {/* Style pour le thumb du slider */}
      <style>
        {`
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: ${getColor()};
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          }

          input[type="range"]::-moz-range-thumb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: ${getColor()};
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          }
        `}
      </style>
    </div>
  );
}
