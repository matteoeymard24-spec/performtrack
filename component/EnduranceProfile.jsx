import React, { useState } from "react";
import { ZONES, zoneOf, enduranceSegments, timeInZones, DEFAULT_CS_VMA_RATIO } from "./drillBank";
import { isMobileView } from "./viewMode";

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
  const [hover, setHover] = useState(null); // index du segment survolé / touché
  const ratio = cs && vma ? cs / vma : DEFAULT_CS_VMA_RATIO;
  const { segs, total } = enduranceSegments(blocks, ratio, vma, cs);
  if (!segs.length || !total) return null;
  const { zones, rest } = timeInZones(segs);
  const maxPct = Math.max(120, ...segs.map((s) => s.pct + 8));
  // Téléphone : dessin plus étroit (texte lisible une fois réduit à l'écran)
  const mob = isMobileView();
  const W = mob ? 420 : 1000, H = mob ? 250 : 280, padL = mob ? 34 : 46, padR = 8, padB = 26, padT = 14;
  const iw = W - padL - padR, ih = H - padB - padT;
  const x = (t) => padL + (t / total) * iw;
  const y = (p) => padT + ih - (p / maxPct) * ih;
  const csKmh = cs || (vma ? vma * DEFAULT_CS_VMA_RATIO : null);
  const csMs = csKmh ? (csKmh * 1000) / 3600 : null;
  // distance réelle pour les efforts définis en distance, sinon vitesse × durée
  const dist = csMs ? segs.reduce((a, s) => a + (s.dist != null ? s.dist : (s.pct / 100) * csMs * s.dur), 0) : null;
  const ticks = [];
  const step = mob ? (total > 3600 ? 1200 : total > 1800 ? 600 : total > 600 ? 300 : 120) : total > 3600 ? 600 : total > 1800 ? 300 : total > 600 ? 120 : 60;
  for (let t = 0; t <= total + 0.5; t += step) ticks.push(t);

  // chiffres clés
  const eff = segs.filter((s) => s.kind !== "recup" && s.pct > 0);
  const effSec = eff.reduce((a, s) => a + s.dur, 0);
  const effPct = effSec ? eff.reduce((a, s) => a + s.pct * s.dur, 0) / effSec : null;
  const hiSec = zones.filter((z) => z.id >= 4).reduce((a, z) => a + z.sec, 0);
  const hz = hover != null ? segs[hover] : null;
  const hzZone = hz ? zoneOf(hz.pct) : null;

  const stat = (label, value, sub, color = "#f3f0ea") => (
    <div style={{ background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 10, padding: "8px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#a8a199", fontWeight: 700, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color, lineHeight: 1.25, whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#7d766c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#151310", border: "1px solid #2a2620", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#f3f0ea" }}>📈 Profil d'effort</div>
        <div style={{ fontSize: 11.5, color: "#7d766c" }}>% de la vitesse critique (VC) au fil de la séance</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 125px), 1fr))", gap: 8, marginBottom: 12 }}>
        {stat("Durée", fmt(total))}
        {dist != null && stat("Distance", `${(dist / 1000).toFixed(1).replace(".", ",")} km`, cs ? "selon ta VC" : "estimée")}
        {stat("Temps d'effort", fmt(effSec), `${Math.round((effSec / total) * 100)} % de la séance`)}
        {effPct != null && stat("Intensité effort", `${Math.round(effPct)} % VC`, csKmh ? `≈ ${((effPct / 100) * csKmh).toFixed(1).replace(".", ",")} km/h` : "moyenne pondérée", zoneOf(effPct)?.color || "#f3f0ea")}
        {stat("Haute intensité", `${Math.round((hiSec / total) * 100)} %`, `Z4 et + · ${fmt(hiSec)}`, hiSec ? "#d9695a" : "#6f6a62")}
      </div>

      <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* bandes de zones + étiquettes */}
          {ZONES.map((z) => {
            const top = Math.min(z.max, maxPct);
            if (z.min >= maxPct) return null;
            return (
              <g key={z.id}>
                <rect x={padL} y={y(top)} width={iw} height={y(z.min) - y(top)} fill={z.color} opacity={0.07} />
                <rect x={padL - 6} y={y(top) + 1} width={3} height={Math.max(0, y(z.min) - y(top) - 2)} rx={1.5} fill={z.color} opacity={0.9} />
                <text x={padL - 12} y={(y(top) + y(z.min)) / 2 + 4} textAnchor="end" fontSize={12} fill={z.color} fontWeight={800}>
                  {z.short}
                </text>
              </g>
            );
          })}
          {/* repère 100 % VC */}
          <line x1={padL} x2={padL + iw} y1={y(100)} y2={y(100)} stroke="#f3f0ea" strokeOpacity={0.35} strokeDasharray="6 5" />
          <rect x={padL + iw - 52} y={y(100) - 17} width={52} height={15} rx={4} fill="#0d0c0a" stroke="#3a342a" />
          <text x={padL + iw - 26} y={y(100) - 6} textAnchor="middle" fontSize={10.5} fill="#f3f0ea" fontWeight={700}>
            100 % VC
          </text>
          {/* repère vertical du segment survolé */}
          {hz && (
            <line x1={x(hz.start + hz.dur / 2)} x2={x(hz.start + hz.dur / 2)} y1={padT} y2={y(0)} stroke="#f3f0ea" strokeOpacity={0.45} strokeDasharray="3 3" />
          )}
          {/* segments : barres arrondies, petit espace entre deux barres */}
          {segs.map((s, i) => {
            const z = zoneOf(s.pct);
            const x0 = x(s.start);
            const w = x(s.start + s.dur) - x0;
            const gap = w > 4 ? 1.5 : 0;
            const bw = Math.max(0.8, w - gap);
            const isRest = !(s.pct > 0);
            const top = isRest ? y(0) - 3 : y(s.pct);
            const h = isRest ? 3 : y(0) - y(s.pct);
            const dim = hover != null && hover !== i;
            const col = z ? z.color : "#6f6a62";
            const r = Math.min(4, bw / 2, h / 2);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }}>
                {/* zone de survol plus large que la barre */}
                <rect x={x0} y={padT} width={Math.max(w, 6)} height={ih} fill="transparent" />
                <path
                  d={`M${x0},${top + h} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x0 + bw - r},${top} Q${x0 + bw},${top} ${x0 + bw},${top + r} L${x0 + bw},${top + h} Z`}
                  fill={col}
                  opacity={(s.kind === "recup" ? 0.45 : 0.95) * (dim ? 0.6 : 1)}
                />
                {hover === i && !isRest && <rect x={x0} y={top} width={bw} height={h} fill="none" stroke="#f3f0ea" strokeWidth={1.5} rx={r} />}
              </g>
            );
          })}
          {/* axe du temps */}
          <line x1={padL} x2={padL + iw} y1={y(0)} y2={y(0)} stroke="#3a342a" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(0) + 5} stroke="#3a342a" />
              <text x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="#a8a199">
                {Math.round(t / 60)}'
              </text>
            </g>
          ))}
        </svg>

        {/* infobulle */}
        {hz && (() => {
          const cx = ((x(hz.start + hz.dur / 2)) / W) * 100;
          const left = Math.min(mob ? 70 : 82, Math.max(mob ? 30 : 18, cx));
          return (
            <div
              style={{
                position: "absolute",
                left: `${left}%`,
                top: 0,
                transform: "translate(-50%, -4px)",
                background: "#0d0c0a",
                border: `1px solid ${hzZone ? hzZone.color : "#3a342a"}`,
                borderRadius: 10,
                padding: "7px 11px",
                fontSize: 12,
                color: "#f3f0ea",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                zIndex: 2,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hz.label}</div>
              <div style={{ color: "#a8a199" }}>
                {fmt(hz.dur)}
                {hz.pct > 0 ? (
                  <>
                    {" "}· <b style={{ color: hzZone ? hzZone.color : "#f3f0ea" }}>{Math.round(hz.pct)} % VC</b>
                    {csKmh ? ` · ≈ ${((hz.pct / 100) * csKmh).toFixed(1).replace(".", ",")} km/h` : ""}
                  </>
                ) : (
                  " · récup passive / marche"
                )}
              </div>
              {hzZone && <div style={{ color: hzZone.color, fontWeight: 700, fontSize: 11 }}>{hzZone.name}</div>}
            </div>
          );
        })()}
      </div>
      <div style={{ fontSize: 11.5, color: "#7d766c", margin: "2px 0 12px", textAlign: "right" }}>
        {hz ? " " : "Survole ou touche une barre pour le détail"}
      </div>

      {/* temps dans chaque zone */}
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#a8a199", fontWeight: 700, marginBottom: 6 }}>Temps par zone</div>
      <div style={{ display: "flex", gap: 2, height: 12, marginBottom: 10 }}>
        {zones.filter((z) => z.sec > 0).map((z) => (
          <div key={z.id} style={{ flex: z.sec, background: z.color, borderRadius: 4 }} title={`${z.short} : ${fmt(z.sec)}`} />
        ))}
        {rest > 0 && <div style={{ flex: rest, background: "#4a453d", borderRadius: 4 }} title={`Récup passive : ${fmt(rest)}`} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 6 }}>
        {zones.filter((z) => z.sec > 0).map((z) => (
          <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 8, padding: "6px 10px" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: z.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: z.color }}>{z.short}</span>
            <span style={{ fontSize: 12.5, color: "#f3f0ea", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{fmt(z.sec)}</span>
            <span style={{ fontSize: 11.5, color: "#7d766c", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round((z.sec / total) * 100)} %</span>
          </div>
        ))}
        {rest > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 8, padding: "6px 10px" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#4a453d", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#a8a199" }}>Passif</span>
            <span style={{ fontSize: 12.5, color: "#f3f0ea", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{fmt(rest)}</span>
            <span style={{ fontSize: 11.5, color: "#7d766c", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round((rest / total) * 100)} %</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#7d766c", marginTop: 10, lineHeight: 1.45 }}>
        ⓘ Les exos réglés en % VMA sont convertis
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
