import React, { useRef, useState } from "react";

/* =====================================================================
   ReorderList.jsx — liste réordonnable par glisser-déposer (doigt ou souris).
   items : [{ key, label, hint? }] dans l'ordre affiché ; onChange(nouvelOrdreDeClés).
   On attrape la poignée ⠿ et on fait glisser ; les flèches ↑ ↓ restent en secours.
   ===================================================================== */
export default function ReorderList({ items, onChange }) {
  const [drag, setDrag] = useState(null); // { key, order: [...] } pendant le glisser
  const rowRefs = useRef({});
  const order = drag ? drag.order : items.map((i) => i.key);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));

  const move = (arr, from, to) => {
    const a = arr.slice();
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
  };

  const onDown = (key) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ key, order: items.map((i) => i.key) });
  };
  const onMove = (e) => {
    if (!drag) return;
    const y = e.clientY;
    // position visée : avant la première AUTRE ligne dont le milieu est sous le pointeur
    const others = drag.order.filter((k) => k !== drag.key);
    let idx = others.length;
    for (let i = 0; i < others.length; i++) {
      const el = rowRefs.current[others[i]];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    const from = drag.order.indexOf(drag.key);
    const target = idx;
    if (target !== from) setDrag({ ...drag, order: move(drag.order, from, target) });
  };
  const onUp = () => {
    if (!drag) return;
    onChange(drag.order);
    setDrag(null);
  };

  const btn = { width: 32, height: 32, borderRadius: 8, border: "1px solid #2a2620", background: "#151310", color: "#a8a199", cursor: "pointer", fontSize: 14, flexShrink: 0 };
  return (
    <div style={{ display: "grid", gap: 6, userSelect: "none", touchAction: drag ? "none" : "auto" }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {order.map((k, i) => {
        const it = byKey[k];
        if (!it) return null;
        const dragging = drag && drag.key === k;
        return (
          <div
            key={k}
            ref={(el) => (rowRefs.current[k] = el)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: dragging ? "rgba(224,161,61,0.16)" : "#0d0c0a",
              border: `1px solid ${dragging ? "#e0a13d" : "#2a2620"}`,
              boxShadow: dragging ? "0 6px 18px rgba(0,0,0,0.5)" : "none",
              transform: dragging ? "scale(1.02)" : "none",
              transition: "background 0.1s, transform 0.1s",
            }}
          >
            <span
              onPointerDown={onDown(k)}
              title="Glisser pour déplacer"
              style={{ cursor: drag ? "grabbing" : "grab", fontSize: 20, color: "#e0a13d", padding: "2px 6px", touchAction: "none" }}
            >
              ⠿
            </span>
            <span style={{ fontSize: 12, color: "#6f6a62", width: 18, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "#f3f0ea", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.label}
              {it.hint && <span style={{ fontWeight: 400, color: "#7d766c", fontSize: 12 }}> · {it.hint}</span>}
            </span>
            <button type="button" style={btn} disabled={i === 0} onClick={() => onChange(move(order, i, i - 1))} aria-label="Monter">↑</button>
            <button type="button" style={btn} disabled={i === order.length - 1} onClick={() => onChange(move(order, i, i + 1))} aria-label="Descendre">↓</button>
          </div>
        );
      })}
    </div>
  );
}
