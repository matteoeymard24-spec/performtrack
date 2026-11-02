import React from "react";
import { parseTempo, formatTempo, repSeconds, tempoPhases, fmtPhase, TEMPO_PRESETS } from "./tempo";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const LINE = "#2a2620";
const COLORS = { ecc: "#5b8def", con: "#e0a13d", pause: "#6b645b" };

/* Barre visuelle du tempo : un segment par phase, largeur proportionnelle aux secondes */
export function TempoBar({ tempo, dir = "up", compact = false }) {
  const t = parseTempo(tempo);
  if (!t) return null;
  if (t.special === "ISO")
    return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: COLORS.pause, border: `1px solid ${COLORS.pause}`, background: "#1a1815" }}>⏸ Isométrie : maintien de la position</span>;
  if (t.special === "EXPLO")
    return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: COLORS.con, border: `1px solid ${COLORS.con}`, background: "#1a1815" }}>⚡ Intention de vitesse maximale</span>;
  if (t.raw) return <span style={{ fontSize: 12, color: MUTED }}>Tempo : {t.raw}</span>;
  const ph = tempoPhases(t, dir);
  const w = (v) => (v === "X" ? 0.6 : Number(v) || 0);
  const total = ph.reduce((s, p) => s + w(p.v), 0) || 1;
  const rep = repSeconds(t);
  return (
    <div style={{ marginTop: compact ? 6 : 0 }}>
      <div style={{ display: "flex", height: compact ? 8 : 12, borderRadius: 6, overflow: "hidden", background: "#1a1815", maxWidth: compact ? 280 : "none" }}>
        {ph.map((p) =>
          w(p.v) > 0 ? (
            <div
              key={p.key}
              title={`${p.label} (${p.sub}) : ${p.v === "X" ? "explosif" : fmtPhase(p.v)}`}
              style={{
                width: `${(w(p.v) / total) * 100}%`,
                background:
                  p.v === "X"
                    ? `repeating-linear-gradient(90deg, ${COLORS.con} 0 3px, #f6c56e 3px 6px)`
                    : COLORS[p.kind],
                borderRight: "2px solid #0d0c0a",
              }}
            />
          ) : null
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 4, fontSize: compact ? 12 : 12.5 }}>
        {ph.map((p) =>
          p.kind === "pause" && !w(p.v) ? null : (
            <span key={p.key} style={{ color: COLORS[p.kind] === COLORS.pause ? MUTED : COLORS[p.kind], fontWeight: 700 }}>
              {p.icon} {p.label} {p.v === "X" ? "⚡ explosif" : fmtPhase(p.v)}
            </span>
          )
        )}
        <span style={{ color: MUTED }}>· {formatTempo(t)} · ≈ {String(rep).replace(".", ",")} s / rep</span>
      </div>
    </div>
  );
}

/* Éditeur du tempo (création de séance) : sens du mouvement + 4 phases réglables + raccourcis */
export function TempoEditor({ tempo, dir, autoDir, onChange, onDirChange }) {
  const t = parseTempo(tempo);
  const special = t && t.special;
  const base = t && !t.special && !t.raw ? t : { e: 2, pb: 0, c: 2, pt: 0 };
  const ph = tempoPhases(base, dir);
  const setPhase = (key, v) => onChange(formatTempo({ ...base, [key]: v }));
  const step = (p, delta) => {
    if (p.key === "c") {
      // concentrique : X (explosif) → 1 → 2 …
      if (p.v === "X") return delta > 0 ? setPhase("c", 1) : null;
      const n = Number(p.v) + delta;
      return setPhase("c", n < 1 ? "X" : Math.min(20, n));
    }
    return setPhase(p.key, Math.max(0, Math.min(20, (Number(p.v) || 0) + delta)));
  };
  const btn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: "#151310", color: TEXT, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 };
  const chip = (on) => ({ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? "#e0a13d" : LINE}`, background: on ? "rgba(224,161,61,0.18)" : "#0d0c0a", color: on ? "#e0a13d" : MUTED });
  return (
    <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, background: "#0d0c0a" }}>
      {/* Sens du mouvement */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: MUTED }}>
        <span>La phase d'effort (concentrique) est :</span>
        {[
          ["up", "⬆ une montée"],
          ["down", "⬇ une descente"],
          ["neutral", "↔ horizontale"],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => onDirChange(id)} style={chip(dir === id)}>
            {label}
            {autoDir === id ? " (auto)" : ""}
          </button>
        ))}
      </div>

      {special ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TempoBar tempo={tempo} dir={dir} />
          <button type="button" onClick={() => onChange("2-0-2-0")} style={chip(false)}>↺ Revenir à un tempo en secondes</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {ph.map((p) => (
              <div key={p.key} style={{ padding: "8px 10px", borderRadius: 8, background: "#151310", borderTop: `3px solid ${COLORS[p.kind]}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                  {p.icon} {p.label}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{p.sub}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" style={btn} onClick={() => step(p, -1)} aria-label={`Moins : ${p.label}`}>−</button>
                  <span style={{ minWidth: 44, textAlign: "center", fontSize: 18, fontWeight: 800, color: p.v === "X" ? COLORS.con : TEXT }}>
                    {p.v === "X" ? "X" : `${p.v} s`}
                  </span>
                  <button type="button" style={btn} onClick={() => step(p, 1)} aria-label={`Plus : ${p.label}`}>+</button>
                </div>
                {p.key === "c" && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>X = explosif (le plus vite possible)</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <TempoBar tempo={formatTempo(base)} dir={dir} />
          </div>
        </>
      )}

      {/* Raccourcis */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {TEMPO_PRESETS.map((p) => (
          <button key={p.tempo} type="button" onClick={() => onChange(p.tempo)} style={chip(!special && t && !t.raw && formatTempo(base) === p.tempo)} title={p.tempo}>
            {p.label} <span style={{ opacity: 0.7 }}>{p.tempo}</span>
          </button>
        ))}
        <button type="button" onClick={() => onChange("ISO")} style={chip(special === "ISO")}>⏸ ISO</button>
        <button type="button" onClick={() => onChange("EXPLO (VMAX)")} style={chip(special === "EXPLO")}>⚡ EXPLO (VMAX)</button>
      </div>
    </div>
  );
}
