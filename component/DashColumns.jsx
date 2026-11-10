import React, { useEffect, useRef, useState } from "react";

/* =====================================================================
   DashColumns.jsx — cartes du dashboard rangées en colonnes, déplaçables
   directement par glisser-déposer (souris ou doigt), sans mode « Organiser ».

   • Ordi : 2 vraies colonnes (gauche / droite) ; chaque carte garde sa colonne,
     on choisit donc l'emplacement exact, même si les cartes n'ont pas la même hauteur.
   • Téléphone : 1 colonne, dans l'ordre global.
   • On attrape la poignée en haut de la carte ; un emplacement en pointillés montre
     où elle va tomber ; la page défile toute seule près du haut / bas de l'écran.

   items  : [{ key, label, node }] dans l'ordre global
   cols   : { key: 0 | 1 } (colonne de chaque carte en mode 2 colonnes ; absente = alternée)
   twoCols: booléen
   onCommit(order, cols) : appelé au dépôt
   scrollRef : (optionnel) conteneur à faire défiler près des bords, à la place de la page
   ===================================================================== */

const AMBER = "#e0a13d";

export const colOfFn = (keys, cols) => {
  const out = {};
  keys.forEach((k, i) => {
    out[k] = cols && (cols[k] === 0 || cols[k] === 1) ? cols[k] : i % 2;
  });
  return out;
};

export default function DashColumns({ items, cols, twoCols, onCommit, scrollRef }) {
  const keys = items.map((i) => i.key);
  const colOf = colOfFn(keys, cols);
  const colKeys = twoCols ? [keys.filter((k) => colOf[k] === 0), keys.filter((k) => colOf[k] === 1)] : [keys];

  const [drag, setDrag] = useState(null); // { key, col, index, x, y, offX, offY, w, h, label }
  const dragRef = useRef(null);
  dragRef.current = drag;
  const slotRefs = useRef({});
  const colRefs = useRef([]);
  const lastPt = useRef({ x: 0, y: 0 });

  /* Où tomberait la carte pour un pointeur en (x, y) : { col, index } */
  const targetAt = (x, y, d) => {
    let col = 0;
    if (twoCols) {
      let best = Infinity;
      colRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (dist < best) {
          best = dist;
          col = i;
        }
      });
    }
    const list = colKeys[col].filter((k) => k !== d.key);
    // l'emplacement « Déposer ici » pousse vers le bas les cartes situées après lui : on retire ce décalage
    // pour mesurer la position « sans emplacement » (sinon la cible oscille)
    const phShift = d.h + 16;
    let index = list.length;
    for (let i = 0; i < list.length; i++) {
      const el = slotRefs.current[list[i]];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue; // carte vide (rien à afficher)
      const top = r.top - (col === d.col && i >= d.index ? phShift : 0);
      if (y < top + r.height / 2) {
        index = i;
        break;
      }
    }
    return { col, index };
  };

  const onDown = (it) => (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const el = slotRefs.current[it.key];
    const r = el ? el.getBoundingClientRect() : { left: e.clientX, top: e.clientY, width: 300, height: 80 };
    const col = twoCols ? colOf[it.key] : 0;
    const index = Math.max(0, colKeys[col].indexOf(it.key));
    lastPt.current = { x: e.clientX, y: e.clientY };
    setDrag({
      key: it.key,
      label: it.label,
      col,
      index,
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      w: r.width,
      h: Math.min(Math.max(r.height, 60), 240),
    });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      lastPt.current = { x: e.clientX, y: e.clientY };
      const t = targetAt(e.clientX, e.clientY, d);
      setDrag({ ...d, x: e.clientX, y: e.clientY, ...t });
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      // ordre global : on retire la carte puis on l'insère devant la carte visée de sa colonne
      const rest = keys.filter((k) => k !== d.key);
      const list = colKeys[d.col].filter((k) => k !== d.key);
      let order;
      if (d.index < list.length) {
        const before = list[d.index];
        const at = rest.indexOf(before);
        order = [...rest.slice(0, at), d.key, ...rest.slice(at)];
      } else if (list.length) {
        const at = rest.indexOf(list[list.length - 1]) + 1;
        order = [...rest.slice(0, at), d.key, ...rest.slice(at)];
      } else order = [...rest, d.key];
      const nextCols = { ...colOf };
      if (twoCols) nextCols[d.key] = d.col;
      setDrag(null);
      const changed = order.join("|") !== keys.join("|") || nextCols[d.key] !== colOf[d.key];
      if (changed) onCommit(order, nextCols);
    };
    const key = (e) => {
      if (e.key === "Escape") setDrag(null);
    };
    // défilement automatique près des bords
    let raf = 0;
    const tick = () => {
      const d = dragRef.current;
      if (d) {
        const { x, y } = lastPt.current;
        const edge = 90;
        const v = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
        if (v) {
          const sc = scrollRef?.current; // conteneur qui défile (ex. fiche athlète en surimpression), sinon la page
          if (sc) sc.scrollBy(0, v);
          else window.scrollBy(0, v);
          const t = targetAt(x, y, d);
          if (t.col !== d.col || t.index !== d.index) setDrag({ ...d, ...t });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    const prevSel = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      document.body.style.userSelect = prevSel;
    };
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  const placeholder = (
    <div
      key="__ph"
      style={{
        height: drag ? drag.h : 0,
        marginBottom: 16,
        borderRadius: 12,
        border: `2px dashed ${AMBER}`,
        background: "rgba(224,161,61,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: AMBER,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      Déposer ici
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {colKeys.map((list, ci) => {
          const others = drag ? list.filter((k) => k !== drag.key) : list;
          return (
            <div key={ci} ref={(el) => (colRefs.current[ci] = el)} style={{ flex: "1 1 0", minWidth: 0, minHeight: drag ? 120 : 0 }}>
              {list.map((k) => {
                const it = byKey[k];
                const dragging = drag && drag.key === k;
                const showPhBefore = drag && drag.col === ci && !dragging && others.indexOf(k) === drag.index;
                return (
                  <React.Fragment key={k}>
                    {showPhBefore && placeholder}
                    <div ref={(el) => (slotRefs.current[k] = el)} className="pt-dash-slot" style={{ position: "relative", display: dragging ? "none" : undefined }}>
                      <button
                        type="button"
                        className="pt-dash-grip"
                        onPointerDown={onDown(it)}
                        title="Glisser pour déplacer la carte"
                        aria-label={`Déplacer « ${it.label} »`}
                      >
                        <span />
                      </button>
                      <div className="pt-dash-body">{it.node}</div>
                    </div>
                  </React.Fragment>
                );
              })}
              {drag && drag.col === ci && drag.index >= others.length && placeholder}
            </div>
          );
        })}
      </div>
      {drag && (
        <div
          style={{
            position: "fixed",
            left: drag.x - drag.offX,
            top: drag.y - Math.min(drag.offY, 40),
            width: drag.w,
            zIndex: 1000,
            pointerEvents: "none",
            background: "#1d1a15",
            border: `1px solid ${AMBER}`,
            borderRadius: 12,
            padding: "16px 20px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
            transform: "rotate(-1.2deg)",
            color: "#f3f0ea",
            fontWeight: 700,
            fontSize: 16,
            opacity: 0.95,
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: AMBER, margin: "0 auto 10px" }} />
          {drag.label}
        </div>
      )}
    </>
  );
}
