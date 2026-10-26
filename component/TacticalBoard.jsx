import React, { useMemo, useRef, useState } from "react";

/* ============================================================================
   TABLEAU TACTIQUE — schéma d'un exercice (sprint / endurance / jeu)
   Dessin vectoriel stocké en JSON sur l'exercice (ex.diagram) :
     { field: "rugby", items: [ {t:"pa",x,y,n}, {t:"ar",x1,y1,x2,y2,k:"run"}, ... ] }
   Coordonnées en MÈTRES dans le repère du terrain (pas de photo à stocker,
   quelques centaines d'octets par schéma).
   ========================================================================== */

const WHITE = "rgba(255,255,255,0.85)";
const DASH = "1.2 1.2";

export const FIELDS = {
  rugby: { label: "🏉 Rugby", w: 120, h: 70, bg: "#2f6b3a", stripes: 12 },
  foot: { label: "⚽ Football", w: 105, h: 68, bg: "#2f6b3a", stripes: 12 },
  basket: { label: "🏀 Basket", w: 28, h: 15, bg: "#b9814a", stripes: 0 },
  hand: { label: "🤾 Handball", w: 40, h: 20, bg: "#2a5d8f", stripes: 0 },
  volley: { label: "🏐 Volley", w: 18, h: 9, bg: "#c27a3e", stripes: 0 },
  piste: { label: "🏃 Piste (ligne droite)", w: 110, h: 12.2, bg: "#9c3f2e", stripes: 0 },
  libre: { label: "🟩 Terrain libre", w: 60, h: 40, bg: "#2f6b3a", stripes: 6 },
};

/* Lignes de chaque terrain (dimensions officielles simplifiées) */
function FieldLines({ field }) {
  const F = FIELDS[field] || FIELDS.libre;
  const { w, h } = F;
  const sw = Math.max(w, h) * 0.004; // épaisseur de trait
  const L = { stroke: WHITE, strokeWidth: sw, fill: "none" };
  const D = { ...L, strokeDasharray: DASH };
  const els = [<rect key="out" x={0} y={0} width={w} height={h} {...L} />];

  if (field === "rugby") {
    // en-buts de 10 m, terrain de 100 m
    [10, 110].forEach((x) => els.push(<line key={"tl" + x} x1={x} y1={0} x2={x} y2={h} {...L} />));
    [32, 88].forEach((x) => els.push(<line key={"22" + x} x1={x} y1={0} x2={x} y2={h} {...L} />));
    els.push(<line key="mid" x1={60} y1={0} x2={60} y2={h} {...L} />);
    [50, 70].forEach((x) => els.push(<line key={"10" + x} x1={x} y1={0} x2={x} y2={h} {...D} />));
    [15, 105].forEach((x) => els.push(<line key={"5m" + x} x1={x} y1={0} x2={x} y2={h} {...D} />));
    [5, 15, 55, 65].forEach((y) => els.push(<line key={"lg" + y} x1={10} y1={y} x2={110} y2={y} {...D} />));
    // poteaux
    [10, 110].forEach((x) =>
      els.push(
        <g key={"po" + x}>
          <line x1={x} y1={35 - 2.8} x2={x} y2={35 + 2.8} stroke="#f3f0ea" strokeWidth={sw * 3} />
        </g>
      )
    );
  } else if (field === "foot") {
    els.push(<line key="mid" x1={w / 2} y1={0} x2={w / 2} y2={h} {...L} />);
    els.push(<circle key="cc" cx={w / 2} cy={h / 2} r={9.15} {...L} />);
    els.push(<circle key="cs" cx={w / 2} cy={h / 2} r={0.4} fill={WHITE} />);
    [0, 1].forEach((side) => {
      const x0 = side ? w : 0;
      const dir = side ? -1 : 1;
      const pa = 16.5, pw = 40.32, ga = 5.5, gw = 18.32;
      els.push(<rect key={"pa" + side} x={side ? w - pa : 0} y={(h - pw) / 2} width={pa} height={pw} {...L} />);
      els.push(<rect key={"ga" + side} x={side ? w - ga : 0} y={(h - gw) / 2} width={ga} height={gw} {...L} />);
      els.push(<circle key={"ps" + side} cx={x0 + dir * 11} cy={h / 2} r={0.4} fill={WHITE} />);
      // arc de surface : partie du cercle r=9.15 centré au point de penalty hors surface
      const cx = x0 + dir * 11;
      const dx = pa - 11;
      const dy = Math.sqrt(9.15 * 9.15 - dx * dx);
      const ax = x0 + dir * pa;
      els.push(
        <path key={"arc" + side} d={`M ${ax} ${h / 2 - dy} A 9.15 9.15 0 0 ${side ? 1 : 0} ${ax} ${h / 2 + dy}`} {...L} />
      );
      els.push(<rect key={"goal" + side} x={side ? w : -1.5} y={h / 2 - 3.66} width={1.5} height={7.32} {...L} />);
      void cx;
    });
  } else if (field === "basket") {
    els.push(<line key="mid" x1={w / 2} y1={0} x2={w / 2} y2={h} {...L} />);
    els.push(<circle key="cc" cx={w / 2} cy={h / 2} r={1.8} {...L} />);
    [0, 1].forEach((side) => {
      const x0 = side ? w : 0;
      const dir = side ? -1 : 1;
      const hoop = x0 + dir * 1.575;
      // raquette 5.8 x 4.9
      els.push(<rect key={"key" + side} x={side ? w - 5.8 : 0} y={h / 2 - 2.45} width={5.8} height={4.9} {...L} />);
      els.push(<circle key={"ft" + side} cx={x0 + dir * 5.8} cy={h / 2} r={1.8} {...L} />);
      // ligne à 3 points : droites à 0.9 m des côtés + arc r=6.75 autour du panier
      const yTop = 0.9, yBot = h - 0.9;
      const dy = h / 2 - yTop;
      const dxArc = Math.sqrt(6.75 * 6.75 - dy * dy);
      const xJoin = hoop + dir * dxArc;
      els.push(<line key={"3a" + side} x1={x0} y1={yTop} x2={xJoin} y2={yTop} {...L} />);
      els.push(<line key={"3b" + side} x1={x0} y1={yBot} x2={xJoin} y2={yBot} {...L} />);
      els.push(<path key={"3arc" + side} d={`M ${xJoin} ${yTop} A 6.75 6.75 0 0 ${side ? 0 : 1} ${xJoin} ${yBot}`} {...L} />);
      els.push(<circle key={"hoop" + side} cx={hoop} cy={h / 2} r={0.23} stroke="#e0602e" strokeWidth={sw * 1.5} fill="none" />);
      els.push(<line key={"board" + side} x1={x0 + dir * 1.2} y1={h / 2 - 0.9} x2={x0 + dir * 1.2} y2={h / 2 + 0.9} stroke={WHITE} strokeWidth={sw * 2} />);
    });
  } else if (field === "hand") {
    els.push(<line key="mid" x1={w / 2} y1={0} x2={w / 2} y2={h} {...L} />);
    [0, 1].forEach((side) => {
      const x0 = side ? w : 0;
      const dir = side ? -1 : 1;
      const p1 = h / 2 - 1.5, p2 = h / 2 + 1.5; // poteaux (but de 3 m)
      const zone = (r, props, k) =>
        els.push(
          <path
            key={k}
            d={`M ${x0} ${p1 - r} A ${r} ${r} 0 0 ${side ? 0 : 1} ${x0 + dir * r} ${p1} L ${x0 + dir * r} ${p2} A ${r} ${r} 0 0 ${side ? 0 : 1} ${x0} ${p2 + r}`}
            {...props}
          />
        );
      zone(6, L, "z6" + side);
      zone(9, D, "z9" + side);
      els.push(<line key={"7m" + side} x1={x0 + dir * 7} y1={h / 2 - 0.5} x2={x0 + dir * 7} y2={h / 2 + 0.5} {...L} />);
      els.push(<rect key={"goal" + side} x={side ? w : -1} y={p1} width={1} height={3} {...L} />);
    });
  } else if (field === "volley") {
    els.push(<line key="net" x1={w / 2} y1={-0.5} x2={w / 2} y2={h + 0.5} stroke="#f3f0ea" strokeWidth={sw * 3} />);
    [w / 2 - 3, w / 2 + 3].forEach((x) => els.push(<line key={"att" + x} x1={x} y1={0} x2={x} y2={h} {...L} />));
  } else if (field === "piste") {
    for (let i = 1; i < 8; i++) {
      const y = (h / 8) * i;
      els.push(<line key={"lane" + i} x1={0} y1={y} x2={w} y2={y} {...L} />);
    }
    [10, 110 - 10].forEach((x) => els.push(<line key={"sf" + x} x1={x} y1={0} x2={x} y2={h} stroke="#f3f0ea" strokeWidth={sw * 2} />));
    for (let m = 20; m < 100; m += 10) els.push(<line key={"m" + m} x1={m} y1={0} x2={m} y2={h} {...D} />);
  }
  return <>{els}</>;
}

const TOOLS = [
  { id: "move", label: "✋", title: "Déplacer" },
  { id: "pa", label: "🔵", title: "Joueur équipe A" },
  { id: "pb", label: "🔴", title: "Joueur équipe B" },
  { id: "cone", label: "🔶", title: "Plot" },
  { id: "ball", label: "🏉", title: "Ballon" },
  { id: "bag", label: "🥫", title: "Boudin de placage" },
  { id: "shield", label: "🛡️", title: "Bouclier de contact" },
  { id: "run", label: "➡️", title: "Course (trait plein)" },
  { id: "pass", label: "⇢", title: "Passe (pointillés)" },
  { id: "zone", label: "▭", title: "Zone (rectangle)" },
  { id: "text", label: "T", title: "Texte" },
  { id: "erase", label: "🧽", title: "Gommer (clic sur un élément)" },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;

function Item({ it, unit, selected }) {
  const r = unit;
  const sel = selected ? { stroke: "#ffd76a", strokeWidth: unit * 0.35 } : {};
  if (it.t === "pa" || it.t === "pb") {
    const fill = it.t === "pa" ? "#2f6fe0" : "#d9443a";
    return (
      <g>
        <circle cx={it.x} cy={it.y} r={r} fill={fill} stroke="#fff" strokeWidth={unit * 0.18} {...sel} />
        {it.n != null && (
          <text x={it.x} y={it.y + r * 0.38} textAnchor="middle" fontSize={r * 1.1} fontWeight="700" fill="#fff" style={{ pointerEvents: "none" }}>
            {it.n}
          </text>
        )}
      </g>
    );
  }
  if (it.t === "cone")
    return (
      <polygon
        points={`${it.x},${it.y - r * 0.9} ${it.x - r * 0.75},${it.y + r * 0.6} ${it.x + r * 0.75},${it.y + r * 0.6}`}
        fill="#f08a24"
        stroke="#fff"
        strokeWidth={unit * 0.12}
        {...sel}
      />
    );
  if (it.t === "bag") {
    // boudin de placage vu de dessus/de face : cylindre bleu à bandes jaunes
    const w = r * 0.95, h = r * 2.3;
    return (
      <g transform={`rotate(${it.rot || 0} ${it.x} ${it.y})`}>
        <rect x={it.x - w / 2} y={it.y - h / 2} width={w} height={h} rx={w / 2} fill="#1f3d7a" stroke="#fff" strokeWidth={unit * 0.12} {...sel} />
        <rect x={it.x - w / 2} y={it.y - h * 0.18} width={w} height={h * 0.1} fill="#f2c230" />
        <rect x={it.x - w / 2} y={it.y + h * 0.08} width={w} height={h * 0.1} fill="#f2c230" />
      </g>
    );
  }
  if (it.t === "shield") {
    // bouclier de contact : pad incurvé rouge (face bombée vers l'avant = haut)
    const w = r * 2, h = r * 1.0;
    const x = it.x, y = it.y;
    return (
      <g transform={`rotate(${it.rot || 0} ${x} ${y})`}>
        <path
          d={`M ${x - w / 2} ${y} Q ${x} ${y - h * 1.2} ${x + w / 2} ${y} L ${x + w / 2} ${y + h * 0.75} Q ${x} ${y + h * 0.05} ${x - w / 2} ${y + h * 0.75} Z`}
          fill="#c43b2f"
          stroke="#fff"
          strokeWidth={unit * 0.12}
          {...sel}
        />
        <line x1={x - w * 0.15} y1={y + h * 0.55} x2={x + w * 0.15} y2={y + h * 0.55} stroke="#1a1a1a" strokeWidth={unit * 0.18} strokeLinecap="round" />
      </g>
    );
  }
  if (it.t === "ball")
    return <ellipse cx={it.x} cy={it.y} rx={r * 0.75} ry={r * 0.5} fill="#f3e3c3" stroke="#6b4a2a" strokeWidth={unit * 0.15} {...sel} />;
  if (it.t === "run" || it.t === "pass") {
    const color = it.t === "run" ? "#ffffff" : "#ffd76a";
    return (
      <line
        x1={it.x1}
        y1={it.y1}
        x2={it.x2}
        y2={it.y2}
        stroke={selected ? "#ffd76a" : color}
        strokeWidth={unit * 0.3}
        strokeDasharray={it.t === "pass" ? `${unit * 0.8} ${unit * 0.6}` : undefined}
        markerEnd={`url(#arrow-${it.t})`}
        strokeLinecap="round"
      />
    );
  }
  if (it.t === "zone") {
    const x = Math.min(it.x1, it.x2), y = Math.min(it.y1, it.y2);
    return (
      <rect
        x={x}
        y={y}
        width={Math.abs(it.x2 - it.x1)}
        height={Math.abs(it.y2 - it.y1)}
        fill="rgba(255,215,106,0.18)"
        stroke={selected ? "#ffd76a" : "rgba(255,215,106,0.9)"}
        strokeWidth={unit * 0.2}
        strokeDasharray={`${unit * 0.6} ${unit * 0.4}`}
      />
    );
  }
  if (it.t === "text")
    return (
      <text x={it.x} y={it.y} textAnchor="middle" fontSize={unit * 1.6} fontWeight="700" fill={selected ? "#ffd76a" : "#fff"} stroke="rgba(0,0,0,0.6)" strokeWidth={unit * 0.08} paintOrder="stroke">
        {it.s}
      </text>
    );
  return null;
}

// distance d'un point à un élément (pour sélectionner / gommer)
function hitDist(it, p) {
  if (it.x != null) return Math.hypot(it.x - p.x, it.y - p.y);
  if (it.t === "zone") {
    const x1 = Math.min(it.x1, it.x2), x2 = Math.max(it.x1, it.x2), y1 = Math.min(it.y1, it.y2), y2 = Math.max(it.y1, it.y2);
    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) return 0;
    return Infinity;
  }
  const { x1, y1, x2, y2 } = it;
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / L2, 0, 1);
  return Math.hypot(x1 + t * dx - p.x, y1 + t * dy - p.y);
}

/** Aperçu (lecture seule) ou éditeur complet. */
export default function TacticalBoard({ value, onChange, readOnly = false, maxHeight }) {
  const field = value?.field && FIELDS[value.field] ? value.field : "rugby";
  const items = Array.isArray(value?.items) ? value.items : [];
  const F = FIELDS[field];
  const pad = Math.max(F.w, F.h) * 0.04;
  const unit = Math.max(F.w, F.h) * 0.017; // taille d'un joueur
  const svgRef = useRef(null);
  const [tool, setTool] = useState("pa");
  const [sel, setSel] = useState(-1);
  const [draft, setDraft] = useState(null); // flèche / zone en cours
  const drag = useRef(null);
  const [history, setHistory] = useState([]);
  const [textDraft, setTextDraft] = useState("");

  const commit = (nextItems, nextField = field) => {
    setHistory((h) => [...h.slice(-30), { field, items }]);
    onChange && onChange({ field: nextField, items: nextItems });
  };

  const toPt = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: round1(clamp(p.x, -pad, F.w + pad)), y: round1(clamp(p.y, -pad, F.h + pad)) };
  };

  const nearest = (p) => {
    let best = -1, bd = Infinity;
    items.forEach((it, i) => {
      const d = hitDist(it, p);
      if (d < bd) { bd = d; best = i; }
    });
    return bd <= unit * 1.6 ? best : -1;
  };

  const onDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    const p = toPt(e);
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tool === "erase") {
      const i = nearest(p);
      if (i >= 0) commit(items.filter((_, k) => k !== i));
      return;
    }
    if (tool === "move") {
      const i = nearest(p);
      setSel(i);
      if (i >= 0) drag.current = { i, start: p, orig: items[i] };
      return;
    }
    if (tool === "run" || tool === "pass" || tool === "zone") {
      setDraft({ t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === "text") {
      const s = textDraft.trim();
      if (s) commit([...items, { t: "text", x: p.x, y: p.y, s: s.slice(0, 30) }]);
      return;
    }
    const it = { t: tool, x: p.x, y: p.y };
    if (tool === "pa" || tool === "pb") it.n = items.filter((x) => x.t === tool).length + 1;
    commit([...items, it]);
  };

  const onMove = (e) => {
    if (readOnly) return;
    if (draft) {
      const p = toPt(e);
      setDraft((d) => ({ ...d, x2: p.x, y2: p.y }));
      return;
    }
    if (drag.current) {
      const p = toPt(e);
      const { i, start, orig } = drag.current;
      const dx = p.x - start.x, dy = p.y - start.y;
      const moved = orig.x != null
        ? { ...orig, x: round1(orig.x + dx), y: round1(orig.y + dy) }
        : { ...orig, x1: round1(orig.x1 + dx), y1: round1(orig.y1 + dy), x2: round1(orig.x2 + dx), y2: round1(orig.y2 + dy) };
      // déplacement en direct sans empiler l'historique à chaque pixel
      onChange && onChange({ field, items: items.map((x, k) => (k === i ? moved : x)) });
    }
  };

  const onUp = () => {
    if (readOnly) return;
    if (draft) {
      const len = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
      if (len > unit * 0.8) commit([...items, draft]);
      setDraft(null);
    }
    if (drag.current) {
      setHistory((h) => [...h.slice(-30), { field, items: items.map((x, k) => (k === drag.current.i ? drag.current.orig : x)) }]);
      drag.current = null;
    }
  };

  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    onChange && onChange(last);
    setSel(-1);
  };

  const stripes = useMemo(() => {
    if (!F.stripes) return null;
    const sw = F.w / F.stripes;
    return Array.from({ length: F.stripes }, (_, i) =>
      i % 2 ? <rect key={i} x={i * sw} y={0} width={sw} height={F.h} fill="rgba(255,255,255,0.04)" /> : null
    );
  }, [field]);

  const board = (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${F.w + pad * 2} ${F.h + pad * 2}`}
      style={{ width: "100%", height: "auto", maxHeight: maxHeight || "none", display: "block", touchAction: readOnly ? "auto" : "none", borderRadius: 8, background: "#1d3b23", cursor: readOnly ? "default" : tool === "move" ? "grab" : "crosshair", userSelect: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <defs>
        {[["run", "#ffffff"], ["pass", "#ffd76a"]].map(([k, c]) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <rect x={-pad} y={-pad} width={F.w + pad * 2} height={F.h + pad * 2} fill={F.bg} opacity={0.75} />
      <rect x={0} y={0} width={F.w} height={F.h} fill={F.bg} />
      {stripes}
      <clipPath id={`clip-${field}`}>
        <rect x={-3} y={-0.2} width={F.w + 6} height={F.h + 0.4} />
      </clipPath>
      <g clipPath={`url(#clip-${field})`}>
        <FieldLines field={field} />
      </g>
      {items.map((it, i) => (
        <Item key={i} it={it} unit={unit} selected={!readOnly && i === sel} />
      ))}
      {draft && <Item it={draft} unit={unit} selected={false} />}
    </svg>
  );

  if (readOnly) return board;

  const btn = (on) => ({
    minWidth: 40,
    minHeight: 40,
    padding: "4px 8px",
    borderRadius: 8,
    border: on ? "1px solid #e0a13d" : "1px solid #2a2620",
    background: on ? "rgba(224,161,61,0.2)" : "#1a1815",
    color: on ? "#e0a13d" : "#f3f0ea",
    fontSize: 16,
    cursor: "pointer",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <select
          value={field}
          onChange={(e) => commit(items, e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #2a2620", background: "#1a1815", color: "#f3f0ea", fontSize: 15, minHeight: 40 }}
        >
          {Object.entries(FIELDS).map(([k, f]) => (
            <option key={k} value={k}>{f.label}</option>
          ))}
        </select>
        {TOOLS.map((t) => (
          <button key={t.id} type="button" title={t.title} onClick={() => { setTool(t.id); setSel(-1); }} style={btn(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tool === "text" && (
        <input
          value={textDraft}
          onChange={(e) => setTextDraft(e.target.value)}
          placeholder="Texte (ex. 10 m, Départ…) puis touche le terrain"
          maxLength={30}
          style={{ width: "100%", boxSizing: "border-box", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #2a2620", background: "#1a1815", color: "#f3f0ea", fontSize: 16 }}
        />
      )}
      {board}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <button type="button" onClick={undo} disabled={!history.length} style={{ ...btn(false), opacity: history.length ? 1 : 0.4 }}>↩️ Annuler</button>
        {sel >= 0 && tool === "move" && items[sel] && (items[sel].t === "bag" || items[sel].t === "shield") && (
          <button
            type="button"
            onClick={() => commit(items.map((x, k) => (k === sel ? { ...x, rot: ((x.rot || 0) + 45) % 360 } : x)))}
            style={btn(false)}
          >
            ⟳ Pivoter
          </button>
        )}
        {sel >= 0 && tool === "move" && (
          <button type="button" onClick={() => { commit(items.filter((_, k) => k !== sel)); setSel(-1); }} style={btn(false)}>🗑️ Supprimer l'élément</button>
        )}
        <button
          type="button"
          onClick={() => items.length && commit([])}
          style={{ ...btn(false), color: "#d9695a" }}
        >
          Tout effacer
        </button>
        <span style={{ fontSize: 12, color: "#a8a199" }}>
          {TOOLS.find((t) => t.id === tool)?.title} — {tool === "run" || tool === "pass" || tool === "zone" ? "glisse pour tracer" : tool === "move" ? "glisse un élément" : "touche le terrain"}
        </span>
      </div>
    </div>
  );
}
