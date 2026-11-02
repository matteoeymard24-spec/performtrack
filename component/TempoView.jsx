import React from "react";
import { parseTempo, formatTempo, repSeconds, tempoPhases, fmtPhase, TEMPO_PRESETS, ISO_SEC_PRESETS, ISO_ANGLE_PRESETS } from "./tempo";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const LINE = "#2a2620";
const COLORS = { ecc: "#5b8def", con: "#e0a13d", pause: "#8a837a" };
const frNum = (x) => String(x).replace(".", ",");

/* Courbe du mouvement sur UNE répétition : position (haut / bas) en fonction du temps.
   Descente = pente, pause = palier, montée explosive = quasi verticale. Inversée pour un tirage vertical. */
export function TempoCurve({ t, dir = "up", w = 260, h = 74 }) {
  const ph = tempoPhases(t, dir);
  const dur = (p) => (p.v === "X" ? 0.5 : Number(p.v) || 0);
  const total = ph.reduce((s, p) => s + dur(p), 0) || 1;
  const L = dir === "neutral" ? 62 : 40;
  const R = w - 10;
  const T = 14;
  const B = h - 16;
  const startTop = dir !== "down"; // squat : départ en haut ; tirage vertical : départ en bas (bras pliés)
  let x = L;
  let y = startTop ? T : B;
  const segs = [];
  ph.forEach((p) => {
    const d = dur(p);
    if (!d) return;
    const nx = x + (d / total) * (R - L);
    let ny = y;
    if (p.kind === "ecc") ny = startTop ? B : T;
    if (p.kind === "con") ny = startTop ? T : B;
    segs.push({ x1: x, y1: y, x2: nx, y2: ny, p });
    x = nx;
    y = ny;
  });
  const topLabel = dir === "neutral" ? "contracté" : "haut";
  const botLabel = dir === "neutral" ? "étiré" : "bas";
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: w, display: "block" }} role="img" aria-label={`Tempo ${formatTempo(t)}`}>
      <line x1={L} y1={T} x2={R} y2={T} stroke={LINE} strokeDasharray="3 4" />
      <line x1={L} y1={B} x2={R} y2={B} stroke={LINE} strokeDasharray="3 4" />
      <text x={L - 6} y={T + 4} fill={MUTED} fontSize="10" textAnchor="end">{topLabel}</text>
      <text x={L - 6} y={B + 4} fill={MUTED} fontSize="10" textAnchor="end">{botLabel}</text>
      {segs.map(({ x1, y1, x2, y2, p }) => {
        const c = COLORS[p.kind];
        const mx = (x1 + x2) / 2;
        const flat = y1 === y2;
        const ly = flat ? (y1 === T ? T + 13 : B - 6) : (y1 + y2) / 2;
        const lx = flat ? mx : mx - (p.v === "X" ? 16 : 0);
        return (
          <g key={p.key}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={p.kind === "pause" ? 3 : 3.5} strokeLinecap="round" opacity={p.kind === "pause" ? 0.75 : 1} />
            <text x={lx} y={ly} fill={c} fontSize="11" fontWeight="800" textAnchor="middle" style={{ paintOrder: "stroke", stroke: "#0d0c0a", strokeWidth: 3 }}>
              {p.v === "X" ? "⚡X" : `${p.v}s`}
            </text>
          </g>
        );
      })}
      {segs.length > 0 && <circle cx={segs[0].x1} cy={segs[0].y1} r="3.5" fill={TEXT} />}
    </svg>
  );
}

/* Rapporteur : angle articulaire du maintien ISO (0° = articulation tendue à plat, 180° = repliée) */
export function AngleDial({ angle, size = 64 }) {
  const a = Math.max(0, Math.min(180, Number(angle) || 0));
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const rad = (Math.PI * a) / 180;
  const nx = cx + r * Math.cos(Math.PI - rad);
  const ny = cy - r * Math.sin(Math.PI - rad);
  return (
    <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`} aria-label={`Angle ${a}°`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx} ${ny}`} fill="none" stroke={COLORS.con} strokeWidth="4" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={TEXT} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={TEXT} />
    </svg>
  );
}

/* Affichage du tempo (création + séance) */
export function TempoView({ tempo, dir = "up", isoSec = null, isoAngle = null, compact = false }) {
  const t = parseTempo(tempo);
  if (!t) return null;
  if (t.special === "ISO")
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: compact ? 6 : 0, padding: "6px 12px", borderRadius: 10, background: "#151310", border: `1px solid ${LINE}` }}>
        {isoAngle ? <AngleDial angle={isoAngle} size={compact ? 52 : 64} /> : <span style={{ fontSize: 20 }}>⏸</span>}
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>Isométrie</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>
            {isoSec ? <b style={{ color: COLORS.con }}>{isoSec} s</b> : "durée libre"} de maintien
            {isoAngle ? <> · angle <b style={{ color: COLORS.con }}>{isoAngle}°</b></> : ""}
          </div>
        </div>
      </div>
    );
  if (t.special === "EXPLO")
    return <span style={{ display: "inline-block", marginTop: compact ? 6 : 0, padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: COLORS.con, border: `1px solid ${COLORS.con}`, background: "#151310" }}>⚡ Intention de vitesse maximale</span>;
  if (t.raw) return <span style={{ fontSize: 12.5, color: MUTED }}>Tempo : {t.raw}</span>;
  const ph = tempoPhases(t, dir);
  const rep = repSeconds(t);
  return (
    <div style={{ marginTop: compact ? 6 : 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ width: compact ? 200 : 260, padding: "4px 6px", borderRadius: 10, background: "#151310", border: `1px solid ${LINE}` }}>
        <TempoCurve t={t} dir={dir} w={compact ? 200 : 260} h={compact ? 62 : 74} />
      </div>
      <div style={{ display: "grid", gap: 2, fontSize: 12.5 }}>
        {ph.map((p) =>
          p.kind === "pause" && !(Number(p.v) > 0) ? null : (
            <span key={p.key} style={{ color: p.kind === "pause" ? MUTED : COLORS[p.kind], fontWeight: 700 }}>
              {p.icon} {p.label} : {p.v === "X" ? "explosif" : fmtPhase(p.v)}
            </span>
          )
        )}
        <span style={{ color: MUTED }}>
          {formatTempo(t)} · ≈ {frNum(rep)} s / rep
        </span>
      </div>
    </div>
  );
}

/* Éditeur du tempo (création de séance) */
export function TempoEditor({ tempo, dir, autoDir, onChange, onDirChange, isoSec, isoAngle, onIsoChange }) {
  const t = parseTempo(tempo);
  const special = t && t.special;
  const base = t && !t.special && !t.raw ? t : { e: 2, pb: 0, c: 2, pt: 0 };
  const ph = tempoPhases(base, dir);
  const setPhase = (key, v) => onChange(formatTempo({ ...base, [key]: v }));
  const step = (p, delta) => {
    if (p.key === "c") {
      if (p.v === "X") return delta > 0 ? setPhase("c", 1) : null;
      const n = Number(p.v) + delta;
      return setPhase("c", n < 1 ? "X" : Math.min(20, n));
    }
    return setPhase(p.key, Math.max(0, Math.min(20, (Number(p.v) || 0) + delta)));
  };
  const btn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: "#151310", color: TEXT, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 };
  const chip = (on) => ({ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? "#e0a13d" : LINE}`, background: on ? "rgba(224,161,61,0.18)" : "#0d0c0a", color: on ? "#e0a13d" : MUTED });
  const sec = Number(isoSec) > 0 ? Number(isoSec) : 0;
  const ang = Number(isoAngle) > 0 ? Number(isoAngle) : 0;
  return (
    <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, background: "#0d0c0a" }}>
      {/* Mode */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" onClick={() => !t || t.special || t.raw ? onChange("2-0-2-0") : null} style={chip(!special)}>⏱ Tempo en secondes</button>
        <button type="button" onClick={() => onChange("ISO")} style={chip(special === "ISO")}>⏸ Isométrie</button>
        <button type="button" onClick={() => onChange("EXPLO (VMAX)")} style={chip(special === "EXPLO")}>⚡ Explosif (VMAX)</button>
      </div>

      {special === "ISO" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Durée du maintien</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn} onClick={() => onIsoChange("isoSec", Math.max(1, (sec || 5) - 1))}>−</button>
              <span style={{ minWidth: 52, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{sec ? `${sec} s` : "—"}</span>
              <button type="button" style={btn} onClick={() => onIsoChange("isoSec", Math.min(180, (sec || 4) + 1))}>+</button>
              {ISO_SEC_PRESETS.map((v) => (
                <button key={v} type="button" onClick={() => onIsoChange("isoSec", v)} style={chip(sec === v)}>{v} s</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Angle du maintien <span style={{ color: MUTED, fontWeight: 400 }}>(angle de l'articulation principale, ex. genou au squat, coude au curl)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <AngleDial angle={ang || 90} />
              <input
                type="number"
                min="0"
                max="180"
                inputMode="numeric"
                value={ang || ""}
                placeholder="°"
                onChange={(e) => onIsoChange("isoAngle", Math.max(0, Math.min(180, Number(e.target.value) || 0)) || null)}
                style={{ width: 70, padding: 8, borderRadius: 8, border: `1px solid ${LINE}`, background: "#151310", color: TEXT, fontSize: 16 }}
              />
              <span style={{ color: MUTED }}>°</span>
              {ISO_ANGLE_PRESETS.map((v) => (
                <button key={v} type="button" onClick={() => onIsoChange("isoAngle", v)} style={chip(ang === v)}>{v}°</button>
              ))}
              {ang ? (
                <button type="button" onClick={() => onIsoChange("isoAngle", null)} style={chip(false)}>✕ sans angle</button>
              ) : null}
            </div>
          </div>
          <TempoView tempo="ISO" isoSec={sec || null} isoAngle={ang || null} />
        </div>
      )}

      {special === "EXPLO" && <TempoView tempo={tempo} />}

      {!special && (
        <>
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
            <TempoView tempo={formatTempo(base)} dir={dir} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {TEMPO_PRESETS.map((p) => (
              <button key={p.tempo} type="button" onClick={() => onChange(p.tempo)} style={chip(formatTempo(base) === p.tempo && !t?.raw)} title={p.tempo}>
                {p.label} <span style={{ opacity: 0.7 }}>{p.tempo}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Compatibilité : ancien nom */
export const TempoBar = TempoView;
