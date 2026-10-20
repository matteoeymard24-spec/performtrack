import React from "react";
import { noteColor, noteLabel, groupByPattern, MEDALS } from "./norms";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";


const ACCENT = "#7aa6e8";

/* Niveau atteint + écart à l'objectif + échelle détaillée (* = référentiel, ~ = estimé) */
function LevelBlock({ lv }) {
  if (!lv) return null;
  const { reached, next, target, below, items } = lv;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        {reached ? (
          <span style={{ background: "#16243a", color: ACCENT, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
            Niveau {reached.label}
            {reached.medal ? ` · ${MEDALS[reached.medal].icon} ${MEDALS[reached.medal].label}` : ""}
          </span>
        ) : below ? (
          <span style={{ background: "#2a1a1a", color: "#d9534f", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
            Sous le niveau {items[items.length - 1].label}
          </span>
        ) : null}
        {next && (
          <span style={{ color: MUTED }}>
            pour passer {next.label} : {next.thr}
            {next.tag === "estimé" ? " ~" : ""}
          </span>
        )}
        {target && (
          <span style={{ color: target.ok ? "#4fae7d" : "#e0a13d", fontWeight: 600 }}>
            Objectif {target.label} :{" "}
            {target.medal
              ? `${MEDALS[target.medal].icon} ${MEDALS[target.medal].label}${
                  target.medal === "gold" ? "" : target.medal === "silver" ? ` · or à ${target.gold}` : ` · argent à ${target.silver}`
                }`
              : `hors standard · bronze à ${target.thr}${target.tag === "estimé" ? " ~" : ""}`}
          </span>
        )}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ color: MUTED, fontSize: 11, cursor: "pointer" }}>Standards par niveau</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 4, marginTop: 6 }}>
          {items.map((it) => (
            <div
              key={it.id}
              title={it.src}
              style={{
                background: it.isTarget ? "#1c2a40" : "#0d0c0a",
                border: it.isTarget ? `1px solid ${ACCENT}` : "1px solid transparent",
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <div style={{ color: MUTED }}>
                {it.met ? "✓ " : ""}
                {it.label}
              </div>
              <div style={{ color: MUTED, fontWeight: 400, lineHeight: 1.5 }}>
                <div style={{ color: it.medal === "gold" ? MEDALS.gold.color : MUTED }}>🥇 {it.gold}</div>
                <div style={{ color: it.medal === "silver" ? MEDALS.silver.color : MUTED }}>🥈 {it.silver}</div>
                <div style={{ color: it.medal === "bronze" ? MEDALS.bronze.color : TEXT, fontWeight: 700 }}>
                  🥉 {it.thr}
                  <span style={{ color: MUTED, fontWeight: 400 }}>{it.tag === "estimé" ? " ~" : it.tag === "doc" ? " *" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>
          🥉 bronze = moyenne du niveau · 🥈 argent · 🥇 or · en dessous du bronze = hors standard · * valeur du référentiel (FFR, World Class, Top 14) · ~ estimation (aucune donnée publiée pour ce niveau) · sans signe : barème Agen
        </div>
      </details>
    </div>
  );
}

/* Tableau : une ligne par exercice, une colonne par niveau (standards de force du poste) */
export function LevelTable({ rows, targetId, labelHeader = "Exercice", valueHeader = "Ton RM" }) {
  const withLv = (rows || []).filter((r) => r.lv);
  if (withLv.length === 0) return null;
  const cols = withLv[0].lv.items;
  const th = { padding: "6px 8px", fontSize: 11, color: MUTED, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>{labelHeader}</th>
            {cols.map((c) => (
              <th key={c.id} style={{ ...th, color: c.id === targetId ? ACCENT : MUTED }}>
                {c.label}
              </th>
            ))}
            <th style={th}>{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {withLv.map((r) => (
            <tr key={r.label} style={{ borderTop: "1px solid #1d1a16" }}>
              <td style={{ padding: "6px 8px", color: TEXT }}>{r.label}</td>
              {r.lv.items.map((it) => (
                <td
                  key={it.id}
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    color: it.met ? "#4fae7d" : TEXT,
                    fontWeight: it.met ? 700 : 400,
                    background: it.id === targetId ? "#16243a" : "transparent",
                  }}
                >
                  {it.thr}
                  <span style={{ color: MUTED }}>{it.tag === "estimé" ? "~" : it.tag === "doc" ? "*" : ""}</span>
                  {it.medal ? ` ${MEDALS[it.medal].icon}` : ""}
                </td>
              ))}
              <td style={{ padding: "6px 8px", textAlign: "right", color: ACCENT, fontWeight: 700 }}>
                {r.display != null ? `${r.display}${r.unit ? " " + r.unit : ""}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: MUTED, fontSize: 10, marginTop: 6 }}>
        * référentiel / étude publiée (FFR 2020, World Class, Top 14, Super Rugby 2026) · ~ estimé (le référentiel ne contient rien pour ce niveau) · sinon barème Agen · vert = niveau atteint · valeur affichée = 🥉 bronze (moyenne du niveau)
        {(rows || []).filter((r) => r.estNote).map((r) => (
          <div key={r.label} style={{ color: "#d9a441" }}>⚠ {r.label} : {r.estNote}</div>
        ))}
      </div>
    </div>
  );
}

/* Une ligne = un résultat comparé au barème du poste (note /20 + cibles) */
export function NormRow({ r, compact = false }) {
  const missing = r.note == null;
  const col = missing ? MUTED : noteColor(r.note);
  return (
    <div style={{ padding: compact ? "6px 0" : "8px 0", borderTop: "1px solid #1d1a16" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ color: TEXT, fontSize: 13 }}>
          {r.label}
          {r.display != null && (
            <span style={{ color: MUTED }}>
              {" "}
              — {r.display}
              {r.unit ? ` ${r.unit}` : ""}
            </span>
          )}
        </span>
        {missing ? (
          <span style={{ color: MUTED, fontSize: 12 }}>pas de valeur</span>
        ) : (
          <span style={{ color: col, fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>
            {r.note}/20 <span style={{ fontWeight: 600, fontSize: 11 }}>· {noteLabel(r.note)}</span>
            {r.lv?.target && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: r.lv.target.medal ? MEDALS[r.lv.target.medal].color : "#d9534f" }}>
                {r.lv.target.medal ? `${MEDALS[r.lv.target.medal].icon} ${MEDALS[r.lv.target.medal].label}` : "Hors standard"}
              </span>
            )}
          </span>
        )}
      </div>
      {!missing && (
        <div style={{ height: 5, background: "#0d0c0a", borderRadius: 3, marginTop: 5, overflow: "hidden" }}>
          <div style={{ width: `${(r.note / 20) * 100}%`, height: "100%", background: col }} />
        </div>
      )}
      <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
        Repères {r.refLabel || "du poste"} : 10/20 → {r.t10} · 15/20 → {r.t15} · 20/20 → {r.t20}
        {r.tNext && r.note != null && r.note < 20 ? ` · prochain palier (${r.note + 1}/20) → ${r.tNext}` : ""}
      </div>
      {r.estNote && (
        <div style={{ color: "#d9a441", fontSize: 11 }}>⚠ {r.estNote}</div>
      )}
      {r.matched && (
        <div style={{ color: MUTED, fontSize: 11 }}>RM utilisé : « {r.matched} »</div>
      )}
      <LevelBlock lv={r.lv} />
    </div>
  );
}

export function NormList({ rows, compact }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      {rows.map((r, i) => (
        <NormRow key={i} r={r} compact={compact} />
      ))}
    </div>
  );
}

/* Notes de force regroupées par schéma de mouvement (poussée / tirage, vertical / horizontal) */
export function PatternList({ rows, compact }) {
  const groups = groupByPattern(rows);
  if (groups.length === 0) return null;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", background: "#0d0c0a", padding: "6px 10px", borderRadius: 8 }}>
            <span style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{g.label}</span>
            {g.avg != null && (
              <span style={{ color: noteColor(g.avg), fontWeight: 800, fontSize: 13 }}>
                {g.avg}/20 <span style={{ fontWeight: 500, fontSize: 11, color: MUTED }}>{g.rows.length > 1 ? "· moyenne" : ""}</span>
              </span>
            )}
          </div>
          {g.rows.map((r, i) => (
            <NormRow key={i} r={r} compact={compact} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* Exigences d'un match pour le poste (GPS du club, ballon en jeu) */
export function MatchRefCard({ poste, posteName, data, level, levelName }) {
  if (!data) {
    return (
      <div style={{ color: MUTED, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: TEXT, marginBottom: 4 }}>📡 Ce que demande un match</div>
        {level
          ? `Pas de référence match pour le niveau « ${levelName || level} » : les données GPS viennent du SU Agen (Pro D2). `
          : "Choisis le niveau de l'athlète pour voir la référence match. Elle n'existe que pour le niveau Pro D2 (GPS du SU Agen). "}
        Cette référence est ramenée à 38 min de ballon en jeu (BIP), le temps effectif du Pro D2. En Fédérale ou en Régionale
        le BIP est nettement plus court (et les clubs n'ont en général pas de GPS) : les distances, sprints et accélérations
        ne se transposent pas, ce serait trop d'extrapolation.
      </div>
    );
  }
  const cells = [
    ["Distance totale", `${Math.round(data.dist)} m`],
    ["Distance > 15 km/h", `${Math.round(data.hsr)} m`],
    ["Sprints > 21 km/h", `${Math.round(data.sp21)}`],
    ["Accélérations > 2,5 m/s²", `${Math.round(data.acc25)}`],
    ["Décélérations > 2,5 m/s²", `${Math.round(data.dec25)}`],
    ["Vmax atteinte", `${Math.round(data.vmax)} % de la Vmax`],
  ];
  return (
    <div>
      <div style={{ color: MUTED, fontSize: 12, marginBottom: 6 }}>
        Ce que demande un match au poste « {posteName} » (GPS SU Agen 2026-27, équivalent 38 min de ballon en jeu, {data.n} matchs-joueurs)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {cells.map(([l, v]) => (
          <div key={l} style={{ background: "#0d0c0a", padding: "8px 10px", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: MUTED }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e0a13d" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
        Niveau Pro D2 uniquement (BIP de 38 min). Moyenne du poste : elle varie selon le profil (ex. un 3e ligne athlétique court plus
        qu'un 3e ligne momentum, plus fort dans les collisions), à lire comme un ordre de grandeur et non une cible individuelle.
      </div>
      {data.n < 6 && (
        <div style={{ color: "#d9a441", fontSize: 11, marginTop: 6 }}>
          ⚠ Petit échantillon pour ce poste : à lire avec prudence.
        </div>
      )}
    </div>
  );
}
