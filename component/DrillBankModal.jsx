import React, { useState } from "react";
import { SPRINT_BANK, ENDURANCE_BANK, zoneOf, pctCS } from "./drillBank";

/* Fenêtre « Banque d'exos » (sprint ou endurance) : un clic ajoute l'exo au bloc. */
export default function DrillBankModal({ type, onPick, onClose, ratio }) {
  const [q, setQ] = useState("");
  const bank = type === "sprint" ? SPRINT_BANK : ENDURANCE_BANK;
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = bank.filter((e) => !q.trim() || norm(e.name + " " + e.description).includes(norm(q)));
  const cats = [...new Set(list.map((e) => e.cat || (type === "sprint" ? "Sprint" : "Endurance")))];
  const fmtT = (s) => (s >= 60 ? `${Math.round(s / 60)}'` : `${s}"`);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#151310", border: "1px solid #e0a13d", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", padding: 14, color: "#f3f0ea", boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>📚 Banque d'exos {type === "sprint" ? "sprint" : "endurance"}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#a8a199", fontSize: 22, cursor: "pointer", minWidth: 40, minHeight: 40 }}>✕</button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Rechercher (ex. 30-30, côte, seuil…)"
          style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#1a1815", color: "#f3f0ea", fontSize: 16, marginBottom: 10 }}
        />
        {cats.map((c) => (
          <div key={c} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#a8a199", fontWeight: 700, margin: "4px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>{c}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {list
                .filter((e) => (e.cat || (type === "sprint" ? "Sprint" : "Endurance")) === c)
                .map((e) => {
                  const z = type === "sprint" ? null : zoneOf(pctCS(e, ratio));
                  return (
                    <button
                      key={e.name}
                      type="button"
                      onClick={() => onPick(e)}
                      style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "1px solid #2a2620", borderLeft: `4px solid ${z ? z.color : "#e0a13d"}`, background: "#0d0c0a", color: "#f3f0ea", cursor: "pointer", minHeight: 48 }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {e.name}
                        {z && <span style={{ marginLeft: 8, fontSize: 11, color: z.color, fontWeight: 700 }}>{z.short}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#a8a199", marginTop: 2 }}>
                        {type === "sprint"
                          ? `${e.sets} × ${e.reps} × ${e.distance} m · récup ${e.recoveryMin ? e.recoveryMin + "'" : ""}${e.recoverySec ? e.recoverySec + '"' : ""} · ${e.intensity}`
                          : `${e.reps > 1 ? e.reps + " × " : ""}${fmtT(e.effortTime)} à ${e.vmaPercentage} % ${e.intensityRef === "cs" ? "VC" : "VMA"}`}
                      </div>
                      <div style={{ fontSize: 12, color: "#7d766c", marginTop: 2 }}>{e.description}</div>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        {list.length === 0 && <div style={{ color: "#a8a199", fontSize: 13 }}>Aucun exo trouvé.</div>}
      </div>
    </div>
  );
}
