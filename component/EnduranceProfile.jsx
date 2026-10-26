import React, { useState } from "react";
import { ZONES, zoneOf, enduranceSegments, timeInZones, DEFAULT_CS_VMA_RATIO } from "./drillBank";

const fmt = (sec) => {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}'${r ? String(r).padStart(2, "0") + '"' : ""}` : `${r}"`;
};

/* Graphique du profil d'effort d'une séance d'endurance (temps × % de la
   vitesse critique), couleurs = zones d'entraînement, + temps dans chaque zone.
   cs / vma en km/h (facultatifs) : servent à estimer la distance. */
export default function EnduranceProfile({ blocks, vma, cs }) {
  const [hover, setHover] = useState(null);
  const ratio = cs && vma ? cs / vma : DEFAULT_CS_VMA_RATIO;
  const { segs, total } = enduranceSegments(blocks, ratio);
  if (!segs.length || !total) return null;
  const { zones, rest } = timeInZones(segs);
  const maxPct = Math.max(120, ...segs.map((s) => s.pct + 5));
  const W = 1000, H = 260, padL = 44, padB = 26, padT = 10;
  const iw = W - padL - 8, ih = H - padB - padT;
  const x = (t) => padL + (t / total) * iw;
  const y = (p) => padT + ih - (p / maxPct) * ih;
  const csKmh = cs || (vma ? vma * DEFAULT_CS_VMA_RATIO : null);
  const csMs = csKmh ? (csKmh * 1000) / 3600 : null;
  const dist = csMs ? segs.reduce((a, s) => a + (s.pct / 100) * csMs * s.dur, 0) : null;
  const ticks = [];
  const step = total > 3600 ? 600 : total > 1200 ? 300 : total > 400 ? 120 : 60;
  for (let t = 0; t <= total; t += step) ticks.push(t);

  return (
    <div style={{ background: "#151310", border: "1px solid #2a2620", borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>📈 Profil d'effort de la séance</div>
        <div style={{ fontSize: 13, color: "#a8a199" }}>
          Durée ≈ <strong style={{ color: "#f3f0ea" }}>{fmt(total)}</strong>
          {dist != null && (
            <> · Distance ≈ <strong style={{ color: "#f3f0ea" }}>{(dist / 1000).toFixed(1)} km</strong></>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {/* bandes de zones */}
        {ZONES.map((z) => {
          const top = Math.min(z.max, maxPct);
          if (z.min >= maxPct) return null;
          return (
            <g key={z.id}>
              <rect x={padL} y={y(top)} width={iw} height={y(z.min) - y(top)} fill={z.color} opacity={0.08} />
              <text x={padL - 4} y={(y(top) + y(z.min)) / 2 + 4} textAnchor="end" fontSize={13} fill={z.color} fontWeight={700}>
                {z.short}
              </text>
            </g>
          );
        })}
        {[70, 80, 90, 110].map((p) => (
          <line key={p} x1={padL} x2={padL + iw} y1={y(p)} y2={y(p)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
        ))}
        <text x={padL + iw} y={y(100) - 3} textAnchor="end" fontSize={11} fill="#a8a199">100 % vitesse critique</text>
        <line x1={padL} x2={padL + iw} y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.25)" />
        {/* segments */}
        {segs.map((s, i) => {
          const z = zoneOf(s.pct);
          const h = s.pct > 0 ? y(0) - y(s.pct) : 2;
          return (
            <rect
              key={i}
              x={x(s.start)}
              y={s.pct > 0 ? y(s.pct) : y(0) - 2}
              width={Math.max(0.8, x(s.start + s.dur) - x(s.start))}
              height={h}
              fill={z ? z.color : "#555"}
              opacity={s.kind === "recup" ? 0.45 : 0.95}
              onMouseEnter={() => setHover(s)}
              onClick={() => setHover(s)}
            />
          );
        })}
        <line x1={padL} x2={padL + iw} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.3)" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a199">
            {Math.round(t / 60)}'
          </text>
        ))}
      </svg>
      <div style={{ minHeight: 18, fontSize: 12, color: "#a8a199", margin: "4px 0 8px" }}>
        {hover
          ? `${hover.label} · ${fmt(hover.dur)} à ${Math.round(hover.pct)} % VC${csKmh && hover.pct ? " ≈ " + ((hover.pct / 100) * csKmh).toFixed(1) + " km/h" : ""}${zoneOf(hover.pct) ? " (" + zoneOf(hover.pct).short + ")" : " (récup passive / marche)"}`
          : "Touche une barre pour le détail."}
      </div>
      {/* temps dans chaque zone */}
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
        {zones.filter((z) => z.sec > 0).map((z) => (
          <div key={z.id} style={{ width: `${(z.sec / total) * 100}%`, background: z.color }} title={`${z.short} : ${fmt(z.sec)}`} />
        ))}
        {rest > 0 && <div style={{ width: `${(rest / total) * 100}%`, background: "#444" }} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12 }}>
        {zones.filter((z) => z.sec > 0).map((z) => (
          <span key={z.id} style={{ color: z.color, fontWeight: 600 }}>
            {z.short} {fmt(z.sec)}
          </span>
        ))}
        {rest > 0 && <span style={{ color: "#a8a199" }}>Récup passive {fmt(rest)}</span>}
      </div>
      <div style={{ fontSize: 11, color: "#7d766c", marginTop: 6, lineHeight: 1.4 }}>
        Axe vertical en % de la vitesse critique (VC). Les exos réglés en % VMA sont convertis
        {cs && vma ? ` avec ton ratio VC/VMA (${ratio.toFixed(2)})` : " avec VC ≈ 0,88 × VMA (estimation)"}.
        {!cs && vma ? " Distance estimée à partir de la VMA." : ""}
      </div>
    </div>
  );
}

/* Fiche de définition des 5 zones (repliable). */
export function ZonesCard({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#151310", border: "1px solid #2a2620", borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#f3f0ea", fontWeight: 700, fontSize: 15, cursor: "pointer", padding: 0, minHeight: 32 }}
      >
        {open ? "▾" : "▸"} 🎯 Les 5 zones d'entraînement
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {ZONES.map((z) => (
            <div key={z.id} style={{ borderLeft: `4px solid ${z.color}`, padding: "6px 10px", background: "#0d0c0a", borderRadius: 6 }}>
              <div style={{ fontWeight: 700, color: z.color, fontSize: 14 }}>{z.name}</div>
              <div style={{ fontSize: 12, color: "#d8d2c8", marginTop: 2 }}>
                {z.id === 1 ? "60-70" : z.max >= 400 ? `> ${z.min}` : `${z.min}-${z.max}`} % vitesse critique{z.fc !== "—" ? ` · ${z.fc}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#a8a199", marginTop: 2 }}>{z.feel}</div>
              <div style={{ fontSize: 12, color: "#a8a199" }}>🎯 {z.goal}</div>
              <div style={{ fontSize: 12, color: "#a8a199" }}>💡 {z.examples}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#7d766c", lineHeight: 1.5 }}>
            Zones de la mindmap « Entraîner l'endurance » (bornes du calculateur de vitesse critique
            remirivet.com). Zones 1 & 2 : on se fie à la FC / au ressenti, pas à la vitesse. Zones 4
            et + = haute intensité. « L'intensité, ça se mérite » : on augmente d'abord le volume ou
            la fréquence, pas l'intensité. Test : 2 efforts max entre 5 et 12 min (ex. 5' et 12'),
            séparés d'au moins 72 h, mêmes conditions.
          </div>
        </div>
      )}
    </div>
  );
}
