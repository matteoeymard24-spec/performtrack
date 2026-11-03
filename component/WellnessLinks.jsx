import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
  Line,
  Bar,
  Cell,
} from "recharts";
import { loadLinkData, buildLinkSeries, pearson, strengthOf, LINK_FACTORS, dayFlags } from "./wellnessLinks";
import { getWellnessZScoreStatus } from "./loadMetrics";

/* =====================================================================
   WellnessLinks.jsx — « 🔗 Wellness × sommeil × nutrition »
   Pour une personne (uid) : explication du z-score du dernier questionnaire,
   corrélations personnelles (z-score ↔ sommeil, eau, calories, protéines),
   nuage de points, frises alignées et « ressenti vs mesuré ».
   ===================================================================== */

const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const ACCENT = "#e0a13d";
const GREEN = "#4fae7d";
const RED = "#d9695a";
const BLUE = "#5b9bd5";
const NIGHT = "#7b8fd9";
const BORDER = "#2a2620";
const TT = { background: "#1a1815", border: "1px solid #3a342a", borderRadius: 8, color: TEXT, fontSize: 12 };
const frD = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const fr = (v, d = 2) => (v == null ? "—" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));

export default function WellnessLinks({ uid, compact = false }) {
  const [data, setData] = useState(null);
  const [factor, setFactor] = useState("sleepH");
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setData(null);
    loadLinkData(uid)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ nights: [], days: [], wellness: [], sleepSettings: {}, nutriSettings: null }));
    return () => {
      alive = false;
    };
  }, [uid]);

  const rows = useMemo(() => (data ? buildLinkSeries(data.wellness, data, 120) : []), [data]);
  const needH = Number(data?.sleepSettings?.needH) || 8.5;
  // cible des corrélations : z-score s'il y en a assez, sinon score wellness brut
  const zRows = rows.filter((r) => r.z != null);
  const yKey = zRows.length >= 8 ? "z" : "score";
  const nOf = (k) => rows.filter((r) => r[k] != null && r[yKey] != null).length;
  const yLabel = yKey === "z" ? "z-score wellness" : "score wellness (0-10)";
  const corr = useMemo(
    () =>
      LINK_FACTORS.map((f) => {
        const p = pearson(rows.map((r) => r[f.id]), rows.map((r) => r[yKey]));
        const n = p.n || nOf(f.id);
        return { ...f, ...p, n, s: p.r == null && n >= 8 ? { t: "valeurs trop constantes", c: MUTED } : strengthOf(p.r, n) };
      }),
    [rows, yKey]
  );
  const feel = useMemo(
    () => [
      { id: "sleep", label: "Sommeil", icon: "😴", ...pearson(rows.map((r) => r.subjSleep), rows.map((r) => r.sleepScore)) },
      { id: "water", label: "Hydratation", icon: "💧", ...pearson(rows.map((r) => r.subjWater), rows.map((r) => r.waterPct)) },
      { id: "food", label: "Nutrition", icon: "🥗", ...pearson(rows.map((r) => r.subjFood), rows.map((r) => r.kcalPct)) },
    ],
    [rows]
  );

  if (!data) return <div style={{ fontSize: 13, color: MUTED }}>Chargement des journaux…</div>;
  const hasLogs = rows.some((r) => r.sleepH != null || r.waterPct != null || r.kcalPct != null);
  if (!rows.length || !hasLogs)
    return (
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
        Pour relier le wellness au reste, il faut <b style={{ color: TEXT }}>remplir le questionnaire wellness</b> et au moins un journal : la{" "}
        <b style={{ color: TEXT }}>nuit</b> (Sommeil → Journal) et/ou l'<b style={{ color: TEXT }}>eau et les repas</b> (Nutrition → Journal). Les liens apparaissent
        après une à deux semaines de données.
      </div>
    );

  const last = rows[rows.length - 1];
  const zSt = getWellnessZScoreStatus(last.z);
  const flags = dayFlags(last, needH);
  const sel = corr.find((c) => c.id === factor) || corr[0];
  const pts = rows.filter((r) => r[factor] != null && r[yKey] != null).map((r) => ({ x: r[factor], y: r[yKey], date: r.date }));
  const xs = pts.map((p) => p.x);
  const trend = sel.r != null && pts.length >= 3 ? [{ x: Math.min(...xs), y: sel.a + sel.b * Math.min(...xs) }, { x: Math.max(...xs), y: sel.a + sel.b * Math.max(...xs) }] : null;
  const recent = rows.slice(-30).map((r) => ({ ...r, label: frD(r.date) }));
  const lab = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED, margin: "14px 0 6px" };

  return (
    <div>
      {/* ---- Dernier questionnaire ---- */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700 }}>WELLNESS DU {frD(last.date)}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: zSt.color }}>{last.z != null ? `z = ${fr(last.z, 1)}` : `${fr(last.score, 1)}/10`}</div>
          <div style={{ fontSize: 12, color: zSt.color }}>{last.z != null ? zSt.label : "z-score : 5 jours d'historique minimum"}</div>
        </div>
        <div style={{ flex: "1 1 260px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {flags.length ? (
            flags.map((f, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12.5,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${f.bad ? RED + "88" : BORDER}`,
                  background: f.bad ? "rgba(217,105,90,0.12)" : "transparent",
                  color: f.bad ? TEXT : MUTED,
                  fontWeight: f.bad ? 700 : 500,
                }}
              >
                {f.icon} {f.t}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 12.5, color: MUTED }}>Pas de nuit ni de journal alimentaire pour ce jour-là.</span>
          )}
        </div>
      </div>
      {last.z != null && last.z <= -0.5 && flags.some((f) => f.bad) && (
        <div style={{ fontSize: 12.5, color: TEXT, marginTop: 8 }}>
          ➜ Wellness en baisse <b>et</b> {flags.filter((f) => f.bad).map((f) => f.t).join(", ")} : ce sont les premières pistes à corriger (avant de toucher la charge).
        </div>
      )}

      {/* ---- Corrélations ---- */}
      <div style={lab}>Ce qui fait bouger ton {yLabel} ({rows.length} questionnaires)</div>
      <div style={{ display: "grid", gap: 6 }}>
        {corr.map((c) => {
          const on = c.id === factor;
          const w = c.r == null ? 0 : Math.abs(c.r) * 100;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFactor(c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(150px, 1.4fr) 2fr auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 10,
                border: `1px solid ${on ? ACCENT : BORDER}`,
                background: on ? "rgba(224,161,61,0.08)" : "#0d0c0a",
                color: TEXT,
                cursor: "pointer",
                textAlign: "left",
                font: "inherit",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {c.icon} {c.label} <span style={{ color: MUTED, fontWeight: 500, fontSize: 11.5 }}>· {c.when}</span>
              </span>
              <span style={{ position: "relative", height: 8, borderRadius: 4, background: "#1a1815", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${w}%`, background: c.s.c, borderRadius: 4 }} />
              </span>
              <span style={{ fontSize: 12, color: c.s.c, fontWeight: 700, whiteSpace: "nowrap", textAlign: "right", minWidth: 150 }}>
                {c.r != null ? `r = ${fr(c.r)} · ` : ""}
                {c.s.t} <span style={{ color: MUTED, fontWeight: 500 }}>({c.n} j)</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- Nuage de points du facteur choisi ---- */}
      {pts.length >= 3 && (
        <>
          <div style={lab}>
            {sel.icon} {sel.label} ({sel.when}) → {yLabel}
          </div>
          <div style={{ height: compact ? 200 : 240, background: "#0d0c0a", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "8px 8px 0 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" />
                <XAxis type="number" dataKey="x" name={sel.label} unit={sel.unit === "%" ? "%" : sel.unit === "h" ? " h" : ""} domain={["auto", "auto"]} tick={{ fill: MUTED, fontSize: 11 }} stroke="#3a342a" tickFormatter={(v) => fr(v, 1)} />
                <YAxis type="number" dataKey="y" name={yLabel} domain={["auto", "auto"]} tick={{ fill: MUTED, fontSize: 11 }} stroke="#3a342a" width={40} tickFormatter={(v) => fr(v, 1)} />
                <ZAxis range={[60, 60]} />
                {yKey === "z" && <ReferenceArea y1={-0.5} y2={0.5} fill={GREEN} fillOpacity={0.07} />}
                {yKey === "z" && <ReferenceLine y={-0.5} stroke={ACCENT} strokeDasharray="4 4" />}
                <Tooltip contentStyle={TT} formatter={(v, n) => [fr(v, 2), n]} labelFormatter={() => ""} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={pts} fill={NIGHT} isAnimationActive={false} />
                {trend && <ReferenceLine segment={trend} stroke={ACCENT} strokeWidth={2} ifOverflow="extendDomain" />}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
            Chaque point = un jour. Ligne ambre = tendance. {yKey === "z" ? "Sous les pointillés (z ≤ −0,5) : wellness en baisse. " : ""}Une corrélation montre un lien, pas
            forcément une cause.
          </div>
        </>
      )}

      {/* ---- Frises alignées ---- */}
      {!compact && recent.length >= 3 && (
        <>
          <div style={lab}>30 derniers questionnaires</div>
          {[
            { key: yKey, name: yKey === "z" ? "z-score" : "Score", color: ACCENT, type: "line", h: 120 },
            { key: "sleepH", name: "Sommeil (h)", color: NIGHT, type: "bar", ref: needH, h: 90 },
            { key: "waterPct", name: "Eau la veille (%)", color: BLUE, type: "bar", ref: 100, h: 90 },
            { key: "kcalPct", name: "Calories la veille (%)", color: ACCENT, type: "bar", ref: 100, h: 90 },
          ].map((s) => (
            <div key={s.key} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11.5, color: s.color, fontWeight: 700, marginLeft: 44 }}>{s.name}</div>
              <div style={{ height: s.h }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={recent} syncId="wlinks" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="label" hide={s.key !== "kcalPct"} tick={{ fill: MUTED, fontSize: 10 }} stroke="#3a342a" />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 10 }}
                      stroke="#3a342a"
                      width={40}
                      domain={s.key === "z" ? [-3, 3] : [0, "auto"]}
                      ticks={s.key === "z" ? [-2, -1, 0, 1, 2] : undefined}
                      allowDataOverflow={s.key === "z"}
                      tickFormatter={(v) => fr(v, 1)}
                    />
                    <Tooltip contentStyle={TT} formatter={(v) => [fr(v, 1), s.name]} />
                    {s.key === "z" && <ReferenceArea y1={-0.5} y2={0.5} fill={GREEN} fillOpacity={0.07} />}
                    {s.ref && <ReferenceLine y={s.ref} stroke={GREEN} strokeDasharray="4 4" />}
                    {s.type === "line" ? (
                      <Line dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                    ) : (
                      <Bar dataKey={s.key} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {recent.map((r) => {
                          const v = r[s.key];
                          const ok = v != null && (s.key === "sleepH" ? v >= needH - 0.5 : s.key === "waterPct" ? v >= 90 : v >= 90 && v <= 115);
                          return <Cell key={r.date} fill={v == null ? "#2a2620" : ok ? s.color : RED} />;
                        })}
                      </Bar>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: MUTED }}>En rouge : nuit plus courte que le besoin, eau ou calories hors objectif. Survole un jour pour voir les 4 frises en même temps.</div>
        </>
      )}

      {/* ---- Ressenti vs mesuré ---- */}
      <div style={lab}>Ressenti (questionnaire) vs mesuré (journaux)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
        {feel.map((f) => {
          const s = strengthOf(f.r, f.n);
          return (
            <div key={f.id} style={{ padding: 10, borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 13 }}>
                {f.icon} {f.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{f.r != null ? `r = ${fr(f.r)}` : "—"}</div>
              <div style={{ fontSize: 11.5, color: MUTED }}>
                {f.r == null || f.n < 8
                  ? `${f.n} jour(s) avec les deux`
                  : Math.abs(f.r) >= 0.3
                  ? "le ressenti suit bien la mesure"
                  : "ressenti et mesure divergent : à discuter"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
