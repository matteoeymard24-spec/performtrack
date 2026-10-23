import React from "react";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

/* Choix des cibles d'une séance : UNE liste de cases à cocher, aucun groupe imposé.
   Chaque case cochée = une séance. « Individuel » est exclusif (un seul athlète, choisi dans la liste dessous).
   selected : tableau de valeurs (total, moi, individuel, idGroupe, "sg:idGroupe:idSousGroupe"). Au moins une. */
export default function TargetPicker({ selected, onChange, customGroups, makeSubGroupTarget, athletes, adminUsers, userId, onUserChange, nameOf, accent = "#e0a13d", currentUid }) {
  const sel = selected && selected.length ? selected : ["total"];

  const toggle = (v) => {
    if (sel.includes(v)) {
      if (sel.length === 1) return; // au moins une cible
      onChange(sel.filter((x) => x !== v));
      return;
    }
    if (v === "individuel") return onChange(["individuel"]);
    onChange([...sel.filter((x) => x !== "individuel"), v]);
  };

  const Row = ({ value, label, indent }) => {
    const on = sel.includes(value);
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 44,
          padding: "6px 10px",
          marginLeft: indent ? 18 : 0,
          borderRadius: 8,
          cursor: "pointer",
          background: on ? `${accent}22` : "transparent",
          border: `1px solid ${on ? accent : "rgba(255,255,255,0.12)"}`,
          fontSize: 14,
          color: TEXT,
          boxSizing: "border-box",
          wordBreak: "break-word",
        }}
      >
        <input type="checkbox" checked={on} onChange={() => toggle(value)} style={{ width: 20, height: 20, flexShrink: 0, accentColor: accent }} />
        <span style={{ minWidth: 0 }}>{label}</span>
      </label>
    );
  };

  return (
    <div>
      <div style={{ display: "grid", gap: 6 }}>
        <Row value="total" label="Total (tous les athlètes)" />
        <Row value="moi" label="🌟 Moi (privé)" />
        <Row value="individuel" label="Individuel (un athlète)" />
        {sel.includes("individuel") && (
          <select
            value={userId}
            onChange={(e) => onUserChange(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 8, border: `2px solid ${accent}55`, background: "#151310", color: TEXT, fontSize: 16 }}
          >
            <option value="">-- Choisir l'athlète --</option>
            <optgroup label="Athlètes">
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{nameOf(a)}</option>
              ))}
            </optgroup>
            {adminUsers && adminUsers.length > 0 && (
              <optgroup label="Admins">
                {adminUsers.map((a) => (
                  <option key={a.id} value={a.id}>👤 {nameOf(a)}{a.id === currentUid ? " (moi)" : ""}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {customGroups.map((g) => (
          <React.Fragment key={g.id}>
            <Row value={g.id} label={`👥 ${g.name}`} />
            {(g.subGroups || []).map((sg) => (
              <Row key={sg.id} value={makeSubGroupTarget(g.id, sg.id)} label={`↳ ${sg.name}`} indent />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        Coche un ou plusieurs groupes : une séance est créée pour chaque case cochée, et seulement celles-là.
      </div>
    </div>
  );
}
