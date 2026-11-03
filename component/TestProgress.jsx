import React, { useEffect, useMemo, useState } from "react";
import { isMobileView } from "./viewMode";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { getTest, computeResult, evaluateMeasures, score20, parseTime, fmtTime } from "./testsCalc";

/* =====================================================================
   TestProgress.jsx — progression physique test par test (Tests › Résultats).
   À gauche : dernière valeur, écart au 1er et au précédent test, historique.
   À droite : graphique de l'évolution (courbes G / D pour les mesures latéralisées).

   Sens « mieux » :
   • tests calculés (endurance, puissance, sprint…) : temps (s, mm:ss) → plus bas = mieux, sinon plus haut = mieux ;
   • mobilité / force iso : sens défini par la mesure (dir: "high" | "low") ; note /20 → plus haut = mieux.
   ===================================================================== */

const AMBER = "#e0a13d";
const BLUE = "#5b9bd5";
const GREEN = "#4fae7d";
const RED = "#d9695a";
const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";
const SIDE_COLOR = { G: AMBER, D: BLUE, v: AMBER };

const fmtDay = (s) => {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : s;
};
const r2 = (v) => Math.round(v * 100) / 100;

/* Toutes les mesures suivables d'un test, à partir de ses résultats (du plus ancien au plus récent) */
function metricsOf(def, docs) {
  const metrics = {};
  const add = (id, base, side, date, v) => {
    if (v == null || !Number.isFinite(v)) return;
    if (!metrics[id]) metrics[id] = { id, ...base, series: {} };
    const s = (metrics[id].series[side] = metrics[id].series[side] || []);
    s.push({ date, v });
  };
  docs.forEach((t) => {
    const vals = t.values || {};
    if (def.compute) {
      const res = computeResult(def, vals);
      const main = res?.main;
      // sprint : le résultat principal varie (20 m, sinon 10 m…) → on suit chaque distance à part
      if (def.id !== "sprint" && main && main.value != null && main.value !== "—") {
        const isTime = typeof main.value === "string" && main.value.includes(":");
        const v = isTime ? parseTime(main.value) : Number(main.value);
        const low = isTime || main.unit === "s" || /temps|allure/i.test(main.label || "");
        add("main:" + main.label, { label: main.label, unit: isTime ? "" : main.unit, time: isTime, dir: low ? "low" : "high" }, "v", t.date, v);
      }
      if (res?.vo2max != null) add("vo2", { label: "VO2max estimée", unit: "ml/kg/min", dir: "high" }, "v", t.date, Number(res.vo2max));
      if (def.id === "sprint")
        (def.fields || []).forEach((f) => {
          const v = parseFloat(String(vals[f.key] ?? "").replace(",", "."));
          if (Number.isFinite(v)) add("f:" + f.key, { label: f.label.replace(/^Temps /, ""), unit: f.unit, dir: f.unit === "s" ? "low" : "high" }, "v", t.date, v);
        });
    } else {
      const ev = evaluateMeasures(def, vals);
      ev.items.forEach((i) => add("m:" + i.key, { label: i.label, unit: i.unit, dir: i.dir === "low" ? "low" : "high", sided: !!i.sided }, i.side || "v", t.date, Number(i.value)));
      const n = score20(def, vals);
      if (n != null) add("note", { label: "Note /20", unit: "/20", dir: "high" }, "v", t.date, n);
    }
  });
  // la note en premier, puis l'ordre de saisie ; le résultat principal le plus fréquent d'abord
  return Object.values(metrics).sort((a, b) => {
    const ca = Object.values(a.series).reduce((s, x) => s + x.length, 0);
    const cb = Object.values(b.series).reduce((s, x) => s + x.length, 0);
    if (a.id === "note") return -1;
    if (b.id === "note") return 1;
    return cb - ca;
  });
}

const fmtVal = (m, v) => (v == null ? "—" : m.time ? fmtTime(v) : `${String(r2(v)).replace(".", ",")}`);

function Delta({ m, from, to, label }) {
  if (from == null || to == null) return null;
  const d = to - from;
  const better = m.dir === "low" ? d < 0 : d > 0;
  const same = Math.abs(d) < 1e-9;
  const col = same ? MUTED : better ? GREEN : RED;
  const pct = from ? (d / Math.abs(from)) * 100 : null;
  const abs = m.time ? fmtTime(Math.abs(d)) : String(r2(Math.abs(d))).replace(".", ",");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: col, fontWeight: 800 }}>
        {same ? "=" : `${d > 0 ? "▲ +" : "▼ −"}${abs}${m.time ? "" : m.unit ? " " + m.unit : ""}`}
        {!same && pct != null && Number.isFinite(pct) ? <span style={{ fontWeight: 600, opacity: 0.8 }}> ({pct > 0 ? "+" : ""}{Math.round(pct)} %)</span> : null}
      </span>
    </div>
  );
}

function useWide(min = 760) {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(`(min-width: ${min}px)`) : null;
  const [wide, setWide] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const on = () => setWide(q.matches);
    q.addEventListener ? q.addEventListener("change", on) : q.addListener(on);
    return () => (q.removeEventListener ? q.removeEventListener("change", on) : q.removeListener(on));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return wide && !isMobileView();
}

export default function TestProgress({ tests = [] }) {
  const twoCols = useWide();
  // résultats regroupés par test, du plus ancien au plus récent
  const groups = useMemo(() => {
    const by = {};
    tests.forEach((t) => {
      const def = getTest(t.testId);
      if (!def || !t.date) return;
      (by[t.testId] = by[t.testId] || { def, docs: [] }).docs.push(t);
    });
    return Object.values(by)
      .map((g) => ({ ...g, docs: g.docs.slice().sort((a, b) => a.date.localeCompare(b.date)) }))
      .map((g) => ({ ...g, metrics: metricsOf(g.def, g.docs) }))
      .filter((g) => g.metrics.length)
      .sort((a, b) => b.docs.length - a.docs.length || b.docs[b.docs.length - 1].date.localeCompare(a.docs[a.docs.length - 1].date));
  }, [tests]);

  const [testId, setTestId] = useState(null);
  const [metricId, setMetricId] = useState(null);
  const g = groups.find((x) => x.def.id === testId) || groups[0];
  const m = g ? g.metrics.find((x) => x.id === metricId) || g.metrics[0] : null;

  if (!groups.length) return <div style={{ fontSize: 13, color: MUTED }}>Aucun résultat chiffré pour le moment : la progression s'affichera dès le premier test.</div>;

  const sides = ["v", "G", "D"].filter((k) => m.series[k]);
  const dates = [...new Set(sides.flatMap((s) => m.series[s].map((p) => p.date)))].sort();
  const data = dates.map((d) => {
    const row = { date: d };
    sides.forEach((s) => {
      const p = m.series[s].filter((x) => x.date === d);
      if (p.length) row[s] = p[p.length - 1].v;
    });
    return row;
  });
  const sideName = (s) => (s === "G" ? "Gauche" : s === "D" ? "Droite" : m.label);

  const chip = (on) => ({
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${on ? AMBER : BORDER}`,
    background: on ? "rgba(224,161,61,0.16)" : "#0d0c0a",
    color: on ? TEXT : MUTED,
    whiteSpace: "nowrap",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {groups.map((x) => (
          <button
            key={x.def.id}
            type="button"
            style={chip(x === g)}
            onClick={() => {
              setTestId(x.def.id);
              setMetricId(null);
            }}
          >
            {x.def.name.split(/ [—(]/)[0]} <span style={{ opacity: 0.6, fontWeight: 500 }}>{x.docs.length}</span>
          </button>
        ))}
      </div>
      {g.metrics.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, paddingLeft: 10, borderLeft: `3px solid ${AMBER}` }}>
          {g.metrics.map((x) => (
            <button key={x.id} type="button" style={{ ...chip(x === m), fontSize: 12, padding: "4px 10px" }} onClick={() => setMetricId(x.id)}>
              {x.label}
              {x.unit && x.unit !== "/20" ? ` (${x.unit})` : ""}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: twoCols ? "minmax(200px, 1fr) 2fr" : "1fr", gap: 16, alignItems: "start" }}>
        {/* Résumé + historique */}
        <div>
          {sides.map((s) => {
            const pts = m.series[s];
            const last = pts[pts.length - 1];
            const first = pts[0];
            const prev = pts.length > 1 ? pts[pts.length - 2] : null;
            return (
              <div key={s} style={{ background: "#0d0c0a", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {s === "v" ? m.label : `${m.label} · ${sideName(s)}`}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 0 4px" }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: SIDE_COLOR[s] || AMBER }}>{fmtVal(m, last.v)}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>{m.time ? "" : m.unit}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: MUTED }}>{fmtDay(last.date)}</span>
                </div>
                {pts.length > 1 ? (
                  <>
                    <Delta m={m} from={prev.v} to={last.v} label="vs test précédent" />
                    {pts.length > 2 && <Delta m={m} from={first.v} to={last.v} label={`vs 1er test (${fmtDay(first.date)})`} />}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: MUTED }}>Un seul test : refais-le pour voir ta progression.</div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
            {m.dir === "low" ? "Plus bas = mieux (temps)." : "Plus haut = mieux."} Vert = progrès, rouge = baisse.
          </div>
          {dates.length > 1 && (
            <div style={{ marginTop: 10, maxHeight: 180, overflowY: "auto", borderTop: `1px solid ${BORDER}` }}>
              {dates
                .slice()
                .reverse()
                .map((d) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ color: MUTED }}>{fmtDay(d)}</span>
                    <span style={{ display: "flex", gap: 10 }}>
                      {sides.map((s) => {
                        const row = data.find((r) => r.date === d);
                        return row && row[s] != null ? (
                          <span key={s} style={{ color: TEXT, fontWeight: 700 }}>
                            {s !== "v" && <span style={{ color: SIDE_COLOR[s], fontWeight: 800, marginRight: 3 }}>{s}</span>}
                            {fmtVal(m, row[s])}
                          </span>
                        ) : null;
                      })}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Graphique */}
        <div style={{ background: "#0d0c0a", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 8px 4px 0", minHeight: 240 }}>
          {data.length < 2 ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 13, textAlign: "center", padding: 16 }}>
              Le graphique apparaît à partir de 2 tests.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: MUTED, fontSize: 11 }} stroke="#3a342a" />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 11 }}
                  stroke="#3a342a"
                  width={48}
                  domain={m.unit === "/20" ? [0, 20] : ["auto", "auto"]}
                  reversed={false}
                  tickFormatter={(v) => (m.time ? fmtTime(v) : String(r2(v)).replace(".", ","))}
                />
                <Tooltip
                  contentStyle={{ background: "#1a1815", border: "1px solid #3a342a", borderRadius: 8, color: TEXT }}
                  labelFormatter={fmtDay}
                  formatter={(v, name) => [`${fmtVal(m, v)}${m.time ? "" : " " + (m.unit || "")}`, sideName(name)]}
                />
                {sides.length > 1 && <Legend formatter={(v) => sideName(v)} wrapperStyle={{ fontSize: 12, color: MUTED }} />}
                {sides.map((s) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    stroke={SIDE_COLOR[s] || AMBER}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: "#0d0c0a" }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
