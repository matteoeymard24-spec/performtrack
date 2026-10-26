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

const TEAMS = { pa: "#2f6fe0", pb: "#d9443a", pc: "#f2c230", pd: "#3fae5a" };
export const PALETTE = ["#2f6fe0", "#d9443a", "#f2c230", "#3fae5a", "#ffffff", "#111111", "#f08a24", "#9b59d0", "#e04f9a", "#5fd3e8"];
const DEFAULT_COLOR = { run: "#ffffff", pass: "#ffd76a", zone: "#ffd76a", text: "#ffffff", elastic: "#e04f9a", cone: "#f08a24", pole: "#f2c230" };
const LINE_TYPES = ["run", "pass", "zone", "elastic"];
const ROTATABLE = ["bag", "shield", "hurdle", "text", "ball", "cone"];
const COLORABLE = ["pa", "pb", "pc", "pd", "run", "pass", "zone", "text", "elastic", "cone", "pole"];

const TOOLS = [
  { id: "move", label: "✋", title: "Déplacer / sélectionner" },
  { id: "pa", label: "🔵", title: "Joueur équipe 1" },
  { id: "pb", label: "🔴", title: "Joueur équipe 2" },
  { id: "pc", label: "🟡", title: "Joueur équipe 3" },
  { id: "pd", label: "🟢", title: "Joueur équipe 4" },
  { id: "cone", label: "🔶", title: "Plot" },
  { id: "pole", label: "📍", title: "Piquet" },
  { id: "hurdle", label: "🚧", title: "Haie" },
  { id: "ball", label: "🏉", title: "Ballon" },
  { id: "bag", label: "🥫", title: "Boudin de placage" },
  { id: "shield", label: "🛡️", title: "Bouclier de contact" },
  { id: "elastic", label: "〰️", title: "Élastique (glisse d'un point à l'autre)" },
  { id: "run", label: "➡️", title: "Course (trait plein)" },
  { id: "pass", label: "⇢", title: "Passe (pointillés)" },
  { id: "runc", label: "↷", title: "Course en arc" },
  { id: "passc", label: "⤻", title: "Passe en arc (pointillés)" },
  { id: "zone", label: "▭", title: "Zone (rectangle)" },
  { id: "text", label: "T", title: "Texte" },
  { id: "erase", label: "🧽", title: "Gommer (touche un élément)" },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;
const colorOf = (it) => it.c || TEAMS[it.t] || DEFAULT_COLOR[it.t] || "#ffffff";
const markerId = (c) => "arw-" + String(c).replace(/[^a-zA-Z0-9]/g, "");

// point de contrôle d'une flèche en arc (k = courbure, signe = côté)
const ctrlOf = (it) => {
  const mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2;
  const dx = it.x2 - it.x1, dy = it.y2 - it.y1;
  const k = Number(it.k) || 0;
  return { cx: mx - dy * k, cy: my + dx * k };
};

function Item({ it, unit, selected }) {
  const r = unit;
  const hl = selected ? { stroke: "#ffd76a", strokeWidth: unit * 0.35 } : {};
  const col = colorOf(it);
  if (TEAMS[it.t]) {
    const dark = col === "#f2c230" || col === "#ffffff" || col === "#5fd3e8";
    return (
      <g>
        <circle cx={it.x} cy={it.y} r={r} fill={col} stroke="#fff" strokeWidth={unit * 0.18} {...hl} />
        {it.n != null && (
          <text x={it.x} y={it.y + r * 0.38} textAnchor="middle" fontSize={r * 1.1} fontWeight="700" fontFamily="system-ui, sans-serif" fill={dark ? "#111" : "#fff"} style={{ pointerEvents: "none" }}>
            {it.n}
          </text>
        )}
      </g>
    );
  }
  if (it.t === "cone")
    return (
      <polygon
        transform={`rotate(${it.rot || 0} ${it.x} ${it.y})`}
        points={`${it.x},${it.y - r * 0.9} ${it.x - r * 0.75},${it.y + r * 0.6} ${it.x + r * 0.75},${it.y + r * 0.6}`}
        fill={col}
        stroke="#fff"
        strokeWidth={unit * 0.12}
        {...hl}
      />
    );
  if (it.t === "pole")
    return (
      <g>
        <circle cx={it.x + r * 0.15} cy={it.y + r * 0.15} r={r * 0.5} fill="rgba(0,0,0,0.35)" />
        <circle cx={it.x} cy={it.y} r={r * 0.5} fill={col} stroke="#111" strokeWidth={unit * 0.12} {...hl} />
        <circle cx={it.x} cy={it.y} r={r * 0.12} fill="#111" />
      </g>
    );
  if (it.t === "hurdle") {
    // haie vue de dessus : barre + 2 pieds
    const w = r * 2.4, x = it.x, y = it.y;
    return (
      <g transform={`rotate(${it.rot || 0} ${x} ${y})`}>
        <rect x={x - w / 2} y={y - r * 0.18} width={w} height={r * 0.36} fill="#f3f0ea" stroke={selected ? "#ffd76a" : "#d9443a"} strokeWidth={unit * (selected ? 0.3 : 0.1)} />
        {[-0.3, 0.1].map((f) => (
          <rect key={f} x={x + w * f} y={y - r * 0.18} width={w * 0.2} height={r * 0.36} fill="#d9443a" />
        ))}
        {[-1, 1].map((sd) => (
          <line key={sd} x1={x + (sd * w) / 2} y1={y - r * 0.5} x2={x + (sd * w) / 2} y2={y + r * 0.5} stroke="#111" strokeWidth={unit * 0.2} strokeLinecap="round" />
        ))}
      </g>
    );
  }
  if (it.t === "bag") {
    const w = r * 0.95, h = r * 2.3;
    return (
      <g transform={`rotate(${it.rot || 0} ${it.x} ${it.y})`}>
        <rect x={it.x - w / 2} y={it.y - h / 2} width={w} height={h} rx={w / 2} fill="#1f3d7a" stroke="#fff" strokeWidth={unit * 0.12} {...hl} />
        <rect x={it.x - w / 2} y={it.y - h * 0.18} width={w} height={h * 0.1} fill="#f2c230" />
        <rect x={it.x - w / 2} y={it.y + h * 0.08} width={w} height={h * 0.1} fill="#f2c230" />
      </g>
    );
  }
  if (it.t === "shield") {
    const w = r * 2, h = r * 1.0;
    const x = it.x, y = it.y;
    return (
      <g transform={`rotate(${it.rot || 0} ${x} ${y})`}>
        <path
          d={`M ${x - w / 2} ${y} Q ${x} ${y - h * 1.2} ${x + w / 2} ${y} L ${x + w / 2} ${y + h * 0.75} Q ${x} ${y + h * 0.05} ${x - w / 2} ${y + h * 0.75} Z`}
          fill="#c43b2f"
          stroke="#fff"
          strokeWidth={unit * 0.12}
          {...hl}
        />
        <line x1={x - w * 0.15} y1={y + h * 0.55} x2={x + w * 0.15} y2={y + h * 0.55} stroke="#1a1a1a" strokeWidth={unit * 0.18} strokeLinecap="round" />
      </g>
    );
  }
  if (it.t === "ball")
    return <ellipse transform={`rotate(${it.rot || 0} ${it.x} ${it.y})`} cx={it.x} cy={it.y} rx={r * 0.75} ry={r * 0.5} fill="#f3e3c3" stroke="#6b4a2a" strokeWidth={unit * 0.15} {...hl} />;
  if (it.t === "run" || it.t === "pass") {
    const stroke = selected ? "#ffd76a" : col;
    const common = {
      stroke,
      strokeWidth: unit * 0.3,
      strokeDasharray: it.t === "pass" ? `${unit * 0.8} ${unit * 0.6}` : undefined,
      markerEnd: `url(#${markerId(selected ? "#ffd76a" : col)})`,
      strokeLinecap: "round",
      fill: "none",
    };
    if (Number(it.k)) {
      const { cx, cy } = ctrlOf(it);
      return <path d={`M ${it.x1} ${it.y1} Q ${cx} ${cy} ${it.x2} ${it.y2}`} {...common} />;
    }
    return <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} {...common} />;
  }
  if (it.t === "elastic") {
    // élastique : ligne en zigzag entre deux points
    const dx = it.x2 - it.x1, dy = it.y2 - it.y1;
    const L = Math.hypot(dx, dy) || 1;
    const n = Math.max(4, Math.round(L / (unit * 0.9)));
    const nx = -dy / L, ny = dx / L, amp = unit * 0.35;
    let d = `M ${it.x1} ${it.y1}`;
    for (let i = 1; i < n; i++) {
      const t = i / n, sgn = i % 2 ? 1 : -1;
      d += ` L ${it.x1 + dx * t + nx * amp * sgn} ${it.y1 + dy * t + ny * amp * sgn}`;
    }
    d += ` L ${it.x2} ${it.y2}`;
    return (
      <g>
        <path d={d} fill="none" stroke={selected ? "#ffd76a" : col} strokeWidth={unit * 0.22} strokeLinejoin="round" />
        {[[it.x1, it.y1], [it.x2, it.y2]].map(([px, py], k) => (
          <circle key={k} cx={px} cy={py} r={unit * 0.3} fill="#111" stroke={col} strokeWidth={unit * 0.1} />
        ))}
      </g>
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
        fill={col}
        fillOpacity={0.2}
        stroke={selected ? "#ffd76a" : col}
        strokeWidth={unit * 0.2}
        strokeDasharray={`${unit * 0.6} ${unit * 0.4}`}
      />
    );
  }
  if (it.t === "text")
    return (
      <text transform={`rotate(${it.rot || 0} ${it.x} ${it.y})`} x={it.x} y={it.y} dominantBaseline="middle" textAnchor="middle" fontSize={unit * 1.6} fontWeight="700" fontFamily="system-ui, sans-serif" fill={col} stroke={selected ? "#ffd76a" : col === "#111111" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"} strokeWidth={unit * (selected ? 0.18 : 0.08)} paintOrder="stroke">
        {it.s}
      </text>
    );
  return null;
}

// distance d'un point à un élément (pour sélectionner / gommer)
function segDist(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / L2, 0, 1);
  return Math.hypot(x1 + t * dx - p.x, y1 + t * dy - p.y);
}
function hitDist(it, p) {
  if (it.x != null) return Math.hypot(it.x - p.x, it.y - p.y);
  if (it.x1 == null) return Infinity;
  if (it.t === "zone") {
    const x1 = Math.min(it.x1, it.x2), x2 = Math.max(it.x1, it.x2), y1 = Math.min(it.y1, it.y2), y2 = Math.max(it.y1, it.y2);
    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) return 0;
    return Infinity;
  }
  if (Number(it.k)) {
    // arc : on échantillonne la courbe
    const { cx, cy } = ctrlOf(it);
    let best = Infinity, px = it.x1, py = it.y1;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      const qx = u * u * it.x1 + 2 * u * t * cx + t * t * it.x2;
      const qy = u * u * it.y1 + 2 * u * t * cy + t * t * it.y2;
      best = Math.min(best, segDist(p, px, py, qx, qy));
      px = qx; py = qy;
    }
    return best;
  }
  return segDist(p, it.x1, it.y1, it.x2, it.y2);
}

function Editor({ value, onChange, readOnly = false, maxHeight }) {
  const field = value?.field && FIELDS[value.field] ? value.field : "rugby";
  const items = Array.isArray(value?.items) ? value.items.filter((x) => x && typeof x === "object") : [];
  const F = FIELDS[field];
  const pad = Math.max(F.w, F.h) * 0.04;
  // taille des éléments (réglable : utile sur un grand terrain vu sur téléphone)
  const scale = clamp(Number(value?.scale) || 1, 0.6, 3);
  const unit = Math.max(F.w, F.h) * 0.017 * scale; // taille d'un joueur
  const svgRef = useRef(null);
  const [tool, setTool] = useState("pa");
  const [sel, setSel] = useState(-1);
  const [draft, setDraft] = useState(null); // flèche / zone / élastique en cours
  const drag = useRef(null);
  const [history, setHistory] = useState([]);
  const [textDraft, setTextDraft] = useState("");
  const [color, setColor] = useState(null); // couleur des prochains éléments (null = défaut)

  const emit = (v) => onChange && onChange(v);
  const commit = (nextItems, nextField = field, nextScale = scale) => {
    const snapshot = { field, items, scale };
    setHistory((h) => [...h.slice(-30), snapshot]);
    emit({ field: nextField, items: nextItems, scale: nextScale });
  };

  const toPt = (e) => {
    const svg = svgRef.current;
    const ctm = svg && svg.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: round1(clamp(p.x, -pad, F.w + pad)), y: round1(clamp(p.y, -pad, F.h + pad)) };
  };

  const nearest = (p, f = 1.6) => {
    let best = -1, bd = Infinity;
    items.forEach((it, i) => {
      const d = hitDist(it, p);
      if (d < bd) { bd = d; best = i; }
    });
    return bd <= unit * f ? best : -1;
  };
  // position de la poignée de rotation (au-dessus de l'élément, tourne avec lui)
  const handlePos = (it) => {
    const a = ((it.rot || 0) * Math.PI) / 180;
    const L = unit * 2.6;
    return { x: it.x + Math.sin(a) * L, y: it.y - Math.cos(a) * L };
  };

  const onDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    const p = toPt(e);
    if (!p) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    // Poignée de rotation de l'élément sélectionné : on la saisit en priorité
    const cur = sel >= 0 ? items[sel] : null;
    if (cur && ROTATABLE.includes(cur.t) && cur.x != null) {
      const hp = handlePos(cur);
      if (Math.hypot(hp.x - p.x, hp.y - p.y) <= unit * 1.3) {
        drag.current = { i: sel, rotate: true, orig: cur, before: items, moved: false };
        return;
      }
    }
    // Avec un outil de pose (joueur, plot, texte…), toucher un élément
    // existant le SÉLECTIONNE (couleur, rotation, déplacement) au lieu d'en
    // poser un nouveau par-dessus.
    if (tool !== "erase" && tool !== "move" && !["run", "pass", "zone", "elastic", "runc", "passc"].includes(tool)) {
      const hit = nearest(p, 0.9);
      if (hit >= 0) {
        setSel(hit);
        drag.current = { i: hit, start: p, orig: items[hit], before: items, moved: false };
        return;
      }
      setSel(-1);
    }
    if (tool === "erase") {
      const i = nearest(p);
      if (i >= 0) commit(items.filter((_, k) => k !== i));
      return;
    }
    if (tool === "move") {
      const i = nearest(p);
      setSel(i);
      drag.current = i >= 0 ? { i, start: p, orig: items[i], before: items, moved: false } : null;
      return;
    }
    if (tool === "run" || tool === "pass" || tool === "zone" || tool === "elastic" || tool === "runc" || tool === "passc") {
      const t = tool === "runc" ? "run" : tool === "passc" ? "pass" : tool;
      const d = { t, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      if (tool === "runc" || tool === "passc") d.k = 0.35;
      if (color) d.c = color;
      setDraft(d);
      return;
    }
    if (tool === "text") {
      const s = textDraft.trim();
      if (s) commit([...items, { t: "text", x: p.x, y: p.y, s: s.slice(0, 30), ...(color ? { c: color } : {}) }]);
      return;
    }
    const it = { t: tool, x: p.x, y: p.y };
    if (TEAMS[tool]) it.n = items.filter((x) => x.t === tool).length + 1;
    if (color && COLORABLE.includes(tool)) it.c = color;
    commit([...items, it]);
  };

  const onMove = (e) => {
    if (readOnly) return;
    if (draft) {
      const p = toPt(e);
      if (!p) return;
      setDraft((d) => (d ? { ...d, x2: p.x, y2: p.y } : d));
      return;
    }
    const dg = drag.current;
    if (dg) {
      const p = toPt(e);
      if (!p) return;
      const { i, start, orig, before } = dg;
      if (dg.rotate) {
        let deg = (Math.atan2(p.x - orig.x, -(p.y - orig.y)) * 180) / Math.PI;
        deg = (Math.round(deg / 5) * 5 + 360) % 360; // pas de 5°
        dg.moved = true;
        emit({ field, scale, items: before.map((x, k) => (k === i ? { ...orig, rot: deg } : x)) });
        return;
      }
      const dx = p.x - start.x, dy = p.y - start.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.05) return;
      dg.moved = true;
      const moved = orig.x != null
        ? { ...orig, x: round1(orig.x + dx), y: round1(orig.y + dy) }
        : { ...orig, x1: round1(orig.x1 + dx), y1: round1(orig.y1 + dy), x2: round1(orig.x2 + dx), y2: round1(orig.y2 + dy) };
      // déplacement en direct sans empiler l'historique à chaque pixel
      emit({ field, scale, items: before.map((x, k) => (k === i ? moved : x)) });
    }
  };

  const onUp = () => {
    if (readOnly) return;
    if (draft) {
      const d = draft;
      setDraft(null);
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
      if (len > unit * 0.8) commit([...items, d]);
    }
    // ⚠️ on lit le ref MAINTENANT (avant de le vider) : avant, l'historique
    // lisait drag.current plus tard, une fois vidé → plantage (écran noir).
    const dg = drag.current;
    drag.current = null;
    if (dg && dg.moved) {
      const snapshot = { field, scale, items: dg.before };
      setHistory((h) => [...h.slice(-30), snapshot]);
    }
  };

  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    emit(last);
    setSel(-1);
  };

  const stripes = useMemo(() => {
    if (!F.stripes) return null;
    const sw = F.w / F.stripes;
    return Array.from({ length: F.stripes }, (_, i) =>
      i % 2 ? <rect key={i} x={i * sw} y={0} width={sw} height={F.h} fill="rgba(255,255,255,0.04)" /> : null
    );
  }, [field]);

  const markerColors = [...new Set(["#ffd76a", ...PALETTE, ...items.filter((x) => x.t === "run" || x.t === "pass").map(colorOf)])];

  const board = (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${F.w + pad * 2} ${F.h + pad * 2}`}
      style={{ width: "100%", height: "auto", maxHeight: maxHeight || "none", display: "block", touchAction: readOnly ? "auto" : "none", borderRadius: 8, background: "#1d3b23", cursor: readOnly ? "default" : tool === "move" ? "grab" : "crosshair", userSelect: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
    >
      <defs>
        {markerColors.map((c) => (
          <marker key={c} id={markerId(c)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
        <clipPath id={`clip-${field}`}>
          <rect x={-3} y={-0.2} width={F.w + 6} height={F.h + 0.4} />
        </clipPath>
      </defs>
      <rect x={-pad} y={-pad} width={F.w + pad * 2} height={F.h + pad * 2} fill={F.bg} opacity={0.75} />
      <rect x={0} y={0} width={F.w} height={F.h} fill={F.bg} />
      {stripes}
      <g clipPath={`url(#clip-${field})`}>
        <FieldLines field={field} />
      </g>
      {items.map((it, i) => (
        <Item key={i} it={it} unit={unit} selected={!readOnly && i === sel} />
      ))}
      {draft && <Item it={draft} unit={unit} selected={false} />}
      {!readOnly && sel >= 0 && items[sel] && ROTATABLE.includes(items[sel].t) && items[sel].x != null && (() => {
        const it = items[sel];
        const hp = handlePos(it);
        return (
          <g>
            <line x1={it.x} y1={it.y} x2={hp.x} y2={hp.y} stroke="#ffd76a" strokeWidth={unit * 0.12} strokeDasharray={`${unit * 0.3} ${unit * 0.25}`} />
            <circle cx={hp.x} cy={hp.y} r={unit * 0.75} fill="#ffd76a" stroke="#1a1306" strokeWidth={unit * 0.12} />
            <text x={hp.x} y={hp.y} dominantBaseline="middle" textAnchor="middle" fontSize={unit * 1} fill="#1a1306" style={{ pointerEvents: "none" }}>⟳</text>
          </g>
        );
      })()}
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

  const selItem = sel >= 0 ? items[sel] || null : null;
  const showPalette = (selItem && COLORABLE.includes(selItem.t)) || ["zone", "text", "run", "pass", "runc", "passc", "elastic", "cone", "pole", "pa", "pb", "pc", "pd"].includes(tool);
  const activeColor = selItem ? colorOf(selItem) : color;
  const pickColor = (c) => {
    if (selItem) commit(items.map((x, k) => (k === sel ? { ...x, c } : x)));
    else setColor(c);
  };

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
        <button type="button" title="Éléments plus petits" onClick={() => commit(items, field, Math.round(clamp(scale - 0.25, 0.6, 3) * 100) / 100)} style={btn(false)}>A−</button>
        <button type="button" title="Éléments plus gros" onClick={() => commit(items, field, Math.round(clamp(scale + 0.25, 0.6, 3) * 100) / 100)} style={btn(false)}>A+</button>
        {TOOLS.map((t) => (
          <button key={t.id} type="button" title={t.title} onClick={() => { setTool(t.id); setSel(-1); }} style={btn(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {showPalette && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#a8a199" }}>{selItem ? "Couleur de l'élément :" : "Couleur :"}</span>
          {!selItem && (
            <button type="button" onClick={() => setColor(null)} style={{ ...btn(color === null), fontSize: 12, minWidth: 0 }}>Auto</button>
          )}
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => pickColor(c)}
              style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: activeColor === c ? "3px solid #e0a13d" : "2px solid #2a2620", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>
      )}
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
        {selItem && ROTATABLE.includes(selItem.t) && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#f3f0ea", flex: "1 1 220px" }}>
            ⟳ Orientation
            <input
              type="range"
              min={0}
              max={355}
              step={5}
              value={selItem.rot || 0}
              onChange={(e) => emit({ field, scale, items: items.map((x, k) => (k === sel ? { ...x, rot: Number(e.target.value) } : x)) })}
              style={{ flex: 1, minWidth: 100, accentColor: "#e0a13d" }}
            />
            <span style={{ width: 36, textAlign: "right" }}>{selItem.rot || 0}°</span>
          </label>
        )}
        {selItem && (selItem.t === "run" || selItem.t === "pass") && (
          <>
            <button
              type="button"
              onClick={() => {
                const steps = [0, 0.35, 0.6, -0.35, -0.6];
                const cur = Number(selItem.k) || 0;
                const idx = steps.findIndex((v) => Math.abs(v - cur) < 0.01);
                const next = steps[(idx + 1) % steps.length];
                commit(items.map((x, k) => (k === sel ? { ...x, k: next } : x)));
              }}
              style={btn(false)}
            >
              ↷ Courbure
            </button>
            <button type="button" onClick={() => commit(items.map((x, k) => (k === sel ? { ...x, t: x.t === "run" ? "pass" : "run" } : x)))} style={btn(false)}>
              {selItem.t === "run" ? "⇢ Pointillés" : "➡️ Trait plein"}
            </button>
          </>
        )}
        {selItem && (
          <button type="button" onClick={() => { commit(items.filter((_, k) => k !== sel)); setSel(-1); }} style={btn(false)}>🗑️ Supprimer</button>
        )}
        <button type="button" onClick={() => items.length && commit([])} style={{ ...btn(false), color: "#d9695a" }}>
          Tout effacer
        </button>
        <span style={{ fontSize: 12, color: "#a8a199" }}>
          {TOOLS.find((t) => t.id === tool)?.title} — {LINE_TYPES.includes(tool) || tool === "runc" || tool === "passc" ? "glisse pour tracer" : tool === "move" ? "touche pour sélectionner, glisse pour déplacer" : "touche le terrain pour poser, ou un élément pour le sélectionner"}
          {selItem && ROTATABLE.includes(selItem.t) ? " · tourne-le avec la poignée jaune ⟳" : ""}
        </span>
      </div>
    </div>
  );
}

/* Garde-fou : si le schéma plante, on affiche un message au lieu de faire
   tomber toute la page (écran noir) — le dessin déjà fait n'est pas perdu. */
class BoardBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("[TacticalBoard]", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, border: "1px solid #d9695a", borderRadius: 8, color: "#f3f0ea", fontSize: 13, background: "#2a1512" }}>
          ⚠️ Le schéma a rencontré un problème ({String(this.state.error.message || this.state.error)}). Ton dessin est conservé.
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ marginLeft: 8, padding: "6px 12px", borderRadius: 6, border: "none", background: "#e0a13d", color: "#1a1306", cursor: "pointer" }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Aperçu (lecture seule) ou éditeur complet. */
export default function TacticalBoard(props) {
  return (
    <BoardBoundary>
      <Editor {...props} />
    </BoardBoundary>
  );
}
