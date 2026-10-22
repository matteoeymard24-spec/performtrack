import React, { useMemo, useState } from "react";
import { evaluateStrength, groupByPattern, posteLabel, levelLabel, noteColor } from "./norms";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const ACCENT = "#e0a13d";
const BLUE = "#7aa6e8";
const BORDER = "#1d1a16";

/* Masse corporelle TYPE par poste (rugby pro, ordre de grandeur) — sert à ramener la force au poids du corps.
   ESTIMATION indicative : à ajuster ici si le staff a ses propres moyennes. */
export const TYPICAL_MASS = { PILIER: 115, TALON: 108, "2L": 112, "3L": 106, "9": 84, "10": 88, Centre: 98, Ailier: 92, Arriere: 90 };

/* Axes du radar. Priorité (0 à 3) de chaque qualité selon le poste, indicatif : sert à tracer la « cible » du poste
   (cible = 10 + 2 × priorité, soit 10 à 16 / 20) et à dire quoi travailler en premier. */
const AXES = [
  { id: "mobilite", label: "Mobilité" },
  { id: "force_haut", label: "Force haut" },
  { id: "force_bas", label: "Force bas" },
  { id: "tirage", label: "Tirage" },
  { id: "vitesse", label: "Vitesse" },
  { id: "puissance", label: "Puissance" },
  { id: "endurance", label: "Endurance" },
];
const PRIORITY = {
  //            mob fHaut fBas tir  vit  puis end
  PILIER: [2, 3, 3, 3, 0, 1, 1],
  TALON: [2, 3, 3, 3, 1, 2, 2],
  "2L": [2, 3, 3, 3, 1, 2, 2],
  "3L": [2, 2, 2, 2, 2, 3, 3],
  "9": [2, 1, 1, 1, 3, 2, 3],
  "10": [2, 1, 1, 1, 2, 2, 3],
  Centre: [2, 2, 2, 2, 3, 3, 2],
  Ailier: [2, 1, 2, 1, 3, 3, 2],
  Arriere: [2, 1, 2, 1, 3, 3, 2],
};
const avg = (arr) => {
  const n = arr.filter((x) => x != null);
  return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
};

function Radar({ axes, values, targets }) {
  const S = 340, C = S / 2, R = 108, n = axes.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (Math.max(0, Math.min(20, v)) / 20) * R;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v ?? 0).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 420, display: "block", margin: "0 auto" }} role="img" aria-label="Radar des qualités physiques">
      {[5, 10, 15, 20].map((g) => (
        <polygon key={g} points={axes.map((_, i) => pt(i, g).join(",")).join(" ")} fill="none" stroke="#2a2620" strokeWidth={g === 20 ? 1.4 : 1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 20);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#2a2620" />;
      })}
      {[5, 10, 15].map((g) => (
        <text key={g} x={C + 3} y={C - (g / 20) * R + 3} fontSize="8" fill="#5f594f">{g}</text>
      ))}
      <polygon points={poly(targets)} fill="none" stroke={BLUE} strokeWidth="1.6" strokeDasharray="5 4" />
      <polygon points={poly(values)} fill="rgba(224,161,61,0.25)" stroke={ACCENT} strokeWidth="2" />
      {values.map((v, i) => {
        if (v == null) return null;
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r="3.5" fill={noteColor(v)} stroke="#0d0c0a" />;
      })}
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 24.5);
        const anchor = Math.abs(x - C) < 6 ? "middle" : x > C ? "start" : "end";
        return (
          <g key={ax.id}>
            <text x={x} y={y} fontSize="11" fill={TEXT} textAnchor={anchor} fontWeight="600">{ax.label}</text>
            <text x={x} y={y + 12} fontSize="11" fill={values[i] == null ? "#5f594f" : noteColor(values[i])} textAnchor={anchor} fontWeight="700">
              {values[i] == null ? "—" : `${values[i]}/20`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* Radar des qualités physiques par poste + profil + lien avec le poids du corps.
   domainNotes : notes /20 par domaine (Tests.jsx) ; rmDocs : [{name, kg}] ; weight : poids du corps (kg) */
export default function PhysicalRadar({ domainNotes, rmDocs, sport, poste, level, weight }) {
  const [mode, setMode] = useState("rel"); // "rel" = ramené au poids type du poste, "abs" = kg bruts
  const [localW, setLocalW] = useState("");
  const bw = Number(String(localW).replace(",", ".")) || Number(weight) || null;
  const typ = TYPICAL_MASS[poste] || null;
  const useRel = mode === "rel" && bw && typ;

  const forceAxes = useMemo(() => {
    const docs = useRel ? (rmDocs || []).map((d) => ({ ...d, kg: d.kg * (typ / bw) })) : rmDocs || [];
    const pats = Object.fromEntries(groupByPattern(evaluateStrength(docs, sport, poste, level)).map((g) => [g.id, g.avg]));
    return {
      force_haut: avg([pats.push_v_upper, pats.push_h_upper]),
      force_bas: avg([pats.push_v_lower, pats.push_h_lower]),
      tirage: avg([pats.pull_v, pats.pull_h]),
    };
  }, [rmDocs, sport, poste, level, bw, typ, useRel]);

  const values = AXES.map((a) => {
    if (a.id === "mobilite") return domainNotes?.mobilite?.avg ?? null;
    if (a.id === "vitesse") return domainNotes?.vitesse?.avg ?? null;
    if (a.id === "puissance") return domainNotes?.cmj?.avg ?? null;
    if (a.id === "endurance") return domainNotes?.endurance?.avg ?? null;
    return forceAxes[a.id] ?? null;
  });
  const prio = PRIORITY[poste] || AXES.map(() => 1);
  const targets = prio.map((p) => 10 + 2 * p);

  /* Profil : qualités dominantes, points forts, écarts à la cible du poste */
  const rated = AXES.map((a, i) => ({ ...a, v: values[i], t: targets[i], p: prio[i] })).filter((x) => x.v != null);
  const dominant = [...rated].sort((a, b) => b.v - a.v).slice(0, 2);
  const gaps = rated.filter((x) => x.t - x.v >= 1).sort((a, b) => (b.t - b.v) * (1 + b.p / 3) - (a.t - a.v) * (1 + a.p / 3)).slice(0, 3);
  const strong = rated.filter((x) => x.v >= x.t).sort((a, b) => b.v - a.v).slice(0, 3);
  const keyQ = AXES.filter((_, i) => prio[i] >= 3).map((a) => a.label.toLowerCase());

  /* Tableau ratio poids du corps */
  const ratioRows = useMemo(
    () =>
      evaluateStrength(rmDocs || [], sport, poste, level)
        .filter((r) => r.value != null)
        .map((r) => ({ label: r.label, kg: r.value, ratio: bw ? r.value / bw : null, eq: bw && typ ? (r.value * typ) / bw : null })),
    [rmDocs, sport, poste, level, bw, typ]
  );

  if (!poste) return null;
  const nData = values.filter((v) => v != null).length;

  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Une branche = une qualité physique notée /20 pour le poste ({posteLabel(sport, poste)}) et le niveau de l'athlète
        {level ? <strong style={{ color: TEXT }}> : {levelLabel(level)}</strong> : null}. 10/20 = le standard de ce niveau. Ligne pleine = l'athlète, tirets bleus =
        cible indicative du poste (10 à 16 / 20 selon l'importance de la qualité pour ce poste).
      </div>
      {!level && (
        <div style={{ fontSize: 11, color: "#d9a441", marginBottom: 8 }}>
          Aucun niveau choisi pour cet athlète : les notes utilisent le barème Agen (niveau Pro D2). Choisis son niveau en haut de la page pour noter par rapport à son vrai niveau.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: MUTED, fontSize: 11 }}>Force :</span>
        {[
          { id: "rel", label: "⚖️ Ramenée au poids du corps" },
          { id: "abs", label: "kg bruts" },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              background: mode === m.id ? "#3a2f1a" : "transparent",
              color: mode === m.id ? ACCENT : MUTED,
              border: `1px solid ${mode === m.id ? ACCENT : "#2a2620"}`,
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 6 }}>
          Poids du corps :{" "}
          <input
            value={localW}
            onChange={(e) => setLocalW(e.target.value)}
            inputMode="decimal"
            placeholder={weight ? String(weight) : "kg"}
            style={{ width: 62, background: "#0d0c0a", color: TEXT, border: "1px solid #2a2620", borderRadius: 6, padding: "3px 6px", fontSize: 12 }}
          />{" "}
          kg
        </span>
      </div>

      {nData < 2 ? (
        <div style={{ color: MUTED, fontSize: 13 }}>Pas assez de résultats pour tracer le radar (il faut au moins 2 qualités testées).</div>
      ) : (
        <Radar axes={AXES} values={values} targets={targets} />
      )}

      {!bw && (
        <div style={{ fontSize: 11, color: "#d9a441", marginTop: 6 }}>
          Poids du corps inconnu : la force est notée en kg bruts. Renseigne le poids de l'athlète (profil / « Mon poids ») ou tape-le ci-dessus pour activer le ratio.
        </div>
      )}
      {bw && typ && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          {useRel
            ? `Ratio activé : chaque charge est ramenée à un ${posteLabel(sport, poste).replace(/\s*\(.*\)/, "").toLowerCase()} type de ${typ} kg (charge × ${typ} / ${bw} = ×${(typ / bw).toFixed(2)}). Un athlète plus léger que le poste n'est plus pénalisé, un plus lourd n'est plus avantagé. Masse type = estimation.`
            : "Force notée en kg bruts (sans tenir compte du poids du corps)."}
        </div>
      )}

      {nData >= 2 && (
        <div style={{ background: "#0d0c0a", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🧬 Profil</div>
          <div style={{ color: TEXT }}>
            Profil dominant : <strong style={{ color: ACCENT }}>{dominant.map((d) => `${d.label} (${d.v})`).join(" + ")}</strong>.
          </div>
          {keyQ.length > 0 && (
            <div style={{ color: MUTED }}>
              Qualités clés pour ce poste : {keyQ.join(", ")}.
            </div>
          )}
          {strong.length > 0 && (
            <div style={{ color: "#4fae7d" }}>✓ Au niveau de la cible : {strong.map((x) => x.label).join(", ")}.</div>
          )}
          {gaps.length > 0 ? (
            <div style={{ color: "#e08a3d" }}>
              ▲ À développer en priorité : {gaps.map((x) => `${x.label} (${x.v} → cible ${x.t})`).join(", ")}.
            </div>
          ) : (
            <div style={{ color: "#4fae7d" }}>Toutes les qualités testées atteignent la cible du poste.</div>
          )}
          {rated.length < AXES.length && (
            <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
              Non testé : {AXES.filter((_, i) => values[i] == null).map((a) => a.label).join(", ")}.
            </div>
          )}
        </div>
      )}

      {ratioRows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⚖️ Force relative (RM ÷ poids du corps)</div>
          <div style={{ display: "grid", gap: 0 }}>
            {ratioRows.map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${BORDER}`, color: MUTED }}>
                <span>{r.label}</span>
                <span style={{ color: TEXT, whiteSpace: "nowrap" }}>
                  {r.kg} kg{r.ratio != null ? <strong style={{ color: ACCENT }}> · {r.ratio.toFixed(2)} × PdC</strong> : ""}
                  {r.eq != null ? <span style={{ color: MUTED }}> · ≈ {Math.round(r.eq)} kg au poids type</span> : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
