import React, { useState } from "react";
import { SPRINT_BANK, ENDURANCE_BANK, zoneOf, pctCS } from "./drillBank";

/* Fenêtre « Banque d'exos » (sprint ou endurance) : un clic ajoute l'exo au bloc. */
const fmtT = (s) => (s >= 60 ? `${Math.round(s / 60)}'` : `${s}"`);
const summary = (type, t) =>
  type === "sprint"
    ? `${t.sets ?? "?"} × ${t.reps ?? "?"} × ${t.distance ?? "?"} m · récup ${t.recoveryMin ? t.recoveryMin + "'" : ""}${t.recoverySec ? t.recoverySec + '"' : ""}${t.intensity ? " · " + t.intensity : ""}`
    : `${t.reps > 1 ? t.reps + " × " : ""}${t.effortTime ? fmtT(t.effortTime) : "?"} à ${t.vmaPercentage ?? "?"} % ${t.intensityRef === "cs" ? "VC" : "VMA"}`;

export default function DrillBankModal({ type, onPick, onClose, ratio, entries }) {
  const [q, setQ] = useState("");
  const bank = entries || [...(type === "sprint" ? SPRINT_BANK : ENDURANCE_BANK)].map(({ cat, ...tpl }) => ({ key: tpl.name, name: tpl.name, template: tpl, builtin: true, cat }));
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = bank.filter((e) => !q.trim() || norm(e.name + " " + (e.template?.description || "")).includes(norm(q)));
  const cats = [...new Set(list.map((e) => e.cat || (type === "sprint" ? "Sprint" : "Endurance")))];

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
                  const t = e.template || {};
                  const z = type === "sprint" ? null : zoneOf(pctCS(t, ratio));
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
                        {summary(type, t)}
                      </div>
                      <div style={{ fontSize: 12, color: "#7d766c", marginTop: 2 }}>{t.description || (e.fromSessions && !e.builtin ? "Créé dans une de tes séances" : "")}</div>
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

/* Gestion de la banque (onglets Endurance / Vitesse du gestionnaire de noms). */
export function DrillBankManager({ kind, drills, onDelete }) {
  const [q, setQ] = useState("");
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = (drills || []).filter((d) => !q.trim() || norm(d.name).includes(norm(q)));
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Rechercher un exo"
        style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #2a2620", background: "#1a1815", color: "#f3f0ea", fontSize: 16, marginBottom: 10 }}
      />
      <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 8 }}>
        Les exos de tes séances {kind === "sprint" ? "vitesse" : "endurance"} s'ajoutent ici automatiquement à l'enregistrement.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {list.map((d) => (
          <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {d.name}
                <span style={{ marginLeft: 6, fontSize: 10, color: "#e0a13d" }}>{d.saved ? "enregistré" : d.fromSessions ? "séances" : d.builtin ? "modèle" : ""}</span>
              </div>
              <div style={{ fontSize: 12, color: "#a8a199" }}>{summary(kind, d.template || {})}</div>
            </div>
            <button type="button" onClick={() => onDelete(d)} style={{ background: "none", border: "1px solid #5a2a2a", color: "#e66", borderRadius: 8, minWidth: 40, minHeight: 40, cursor: "pointer" }} aria-label="Retirer">🗑</button>
          </div>
        ))}
        {list.length === 0 && <div style={{ color: "#a8a199", fontSize: 13, textAlign: "center", padding: 16 }}>Aucun exo.</div>}
      </div>
    </div>
  );
}
