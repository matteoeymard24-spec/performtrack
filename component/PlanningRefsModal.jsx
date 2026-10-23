import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import RepsRpeTable from "./RepsRpeTable";
import VbtTable from "./VbtTable";
import { FORM_LEVELS } from "./loadMetrics";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* Aide à la planification, ouverte depuis la création d'une séance :
   tables RPE ↔ %RM, vitesse de barre (VBT) et état de forme des athlètes ciblés.
   L'état de forme vient du dernier calcul du Dashboard (users/{id}/formStatus/latest). */
function FormTab({ athleteIds, nameOf }) {
  const [rows, setRows] = useState(null);
  const key = (athleteIds || []).join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const out = await Promise.all(
        (athleteIds || []).map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "users", id, "formStatus", "latest"));
            return { id, data: snap.exists() ? snap.data() : null };
          } catch (e) {
            return { id, data: null, error: true };
          }
        })
      );
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!athleteIds || athleteIds.length === 0) {
    return <div style={{ color: MUTED, fontSize: 13, padding: "12px 0" }}>Choisis d'abord une cible (groupe ou athlète) pour voir son état de forme.</div>;
  }
  if (!rows) return <div style={{ color: MUTED, fontSize: 13, padding: "12px 0" }}>Chargement…</div>;

  const rank = (r) => (r.data ? (FORM_LEVELS[r.data.level] || FORM_LEVELS.nodata).rank : 9);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  const today = todayStr();

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {sorted.map((r) => {
          const fl = r.data ? FORM_LEVELS[r.data.level] || FORM_LEVELS.nodata : null;
          const old = r.data && r.data.date !== today;
          return (
            <div key={r.id} style={{ background: "#0d0c0a", border: `1px solid ${fl ? fl.color : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: TEXT, fontWeight: 700 }}>{nameOf(r.id)}</span>
                {fl ? (
                  <span style={{ color: fl.color, fontWeight: 700, fontSize: 13 }}>
                    {fl.emoji} {r.data.label || fl.label}
                  </span>
                ) : (
                  <span style={{ color: MUTED, fontSize: 13 }}>{r.error ? "Lecture impossible" : "Pas encore calculé"}</span>
                )}
              </div>
              {r.data && (
                <div style={{ fontSize: 11, color: old ? "#d9a441" : MUTED, marginTop: 3 }}>
                  Calculé le {r.data.date ? `${r.data.date.slice(8, 10)}/${r.data.date.slice(5, 7)}` : "?"}
                  {old ? " (pas d'aujourd'hui : ouvre le Dashboard pour actualiser)" : ""}
                </div>
              )}
              {r.data && r.data.reasons && r.data.reasons.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>Pourquoi ?</summary>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12, color: "#f0d9ae" }}>
                    {r.data.reasons.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        L'état de forme est celui du dernier calcul du Dashboard (REDI, bien-être, CMJ, force). Il se met à jour chaque fois que tu ouvres le Dashboard.
      </div>
    </div>
  );
}

export default function PlanningRefsModal({ onClose, athleteIds, nameOf, targetLabel, tabs = ["rpe", "vbt", "form"] }) {
  const [tab, setTab] = useState("rpe");
  const tabBtn = (k, text) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: "bold",
        cursor: "pointer",
        background: tab === k ? "#e0a13d" : "#2a2620",
        color: tab === k ? "#1a1306" : TEXT,
        border: "1px solid rgba(224,161,61,0.4)",
      }}
    >
      {text}
    </button>
  );
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#151310", borderRadius: 12, padding: 24, width: "100%", maxWidth: 780, maxHeight: "88vh", overflowY: "auto", border: "1px solid rgba(224,161,61,0.4)", color: TEXT }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{tabs.includes("form") ? "🧭 Aide à la planification" : "🧭 Repères d'entraînement"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.includes("rpe") && tabBtn("rpe", "📊 %RM / reps / RPE")}
          {tabs.includes("vbt") && tabBtn("vbt", "⚡ Vitesse de barre")}
          {tabs.includes("form") && tabBtn("form", "💪 État de forme")}
        </div>
        {tab === "rpe" && <RepsRpeTable defaultOpen />}
        {tab === "vbt" && <VbtTable defaultOpen />}
        {tab === "form" && (
          <>
            {targetLabel && <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Cible de la séance : {targetLabel}</div>}
            <FormTab athleteIds={athleteIds} nameOf={nameOf} />
          </>
        )}
      </div>
    </div>
  );
}
