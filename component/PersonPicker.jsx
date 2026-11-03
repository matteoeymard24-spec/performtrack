import React, { useState } from "react";

/* =====================================================================
   PersonPicker.jsx — sélecteur « Qui ? » commun (Mes RM, REDI, Tests…),
   calqué sur le filtre de Workout : pastilles Athlètes / Moi / Admins,
   puis groupes (pastilles colorées + effectif) → sous-groupes → personne.

   GroupChips (exporté) : la rangée groupes + sous-groupes seule, réutilisée
   par Workout où le groupe est lui-même le filtre.
   ===================================================================== */

const AMBER = "#e0a13d";
const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

export const personName = (a) =>
  !a ? "" : a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName || a.email || a.id;
const initials = (a) =>
  personName(a)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const chip = (on, color = AMBER) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  border: `1px solid ${on ? color : "#2a2620"}`,
  background: on ? `${color}2e` : "#0d0c0a",
  color: on ? (color === AMBER ? AMBER : TEXT) : TEXT,
  whiteSpace: "nowrap",
  boxShadow: on ? `0 0 0 1px ${color}55` : "none",
});
const dot = (c, size = 8) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: c || "#6b645b", display: "inline-block", flexShrink: 0 }} />
);
const count = (n) => <span style={{ opacity: 0.65, fontWeight: 500, fontSize: 12 }}>{n}</span>;
export const pickerLabel = (t) => (
  <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED, fontWeight: 700, marginBottom: 6 }}>{t}</div>
);

/* Groupes + sous-groupes.
   groupId / subId : sélection ; onGroup(gid) ("" = tous, "none" = sans groupe) ; onSub(sid) ("" = tout le groupe). */
export function GroupChips({ groups = [], groupId, subId, onGroup, onSub, total, noneCount = 0 }) {
  const sel = groups.find((g) => g.id === groupId) || null;
  const gcol = sel?.color || AMBER;
  return (
    <div>
      {pickerLabel("🏷️ Groupe")}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onGroup("")} style={chip(!groupId)}>
          Tous {total != null && count(total)}
        </button>
        {groups.map((g) => (
          <button key={g.id} type="button" onClick={() => onGroup(g.id)} style={chip(groupId === g.id, g.color || AMBER)}>
            {dot(g.color)} {g.name} {count((g.athleteIds || []).length)}
          </button>
        ))}
        {noneCount > 0 && (
          <button type="button" onClick={() => onGroup("none")} style={chip(groupId === "none")}>
            Sans groupe {count(noneCount)}
          </button>
        )}
      </div>
      {/* Sous-groupes : panneau rattaché au groupe choisi, à sa couleur */}
      {sel && (sel.subGroups || []).length > 0 && (
        <div
          style={{
            position: "relative",
            marginTop: 8,
            marginLeft: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: `${gcol}10`,
            border: `1px solid ${gcol}40`,
            borderLeft: `3px solid ${gcol}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: gcol, fontWeight: 800, marginBottom: 8 }}>
            ↳ Sous-groupes · {sel.name}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => onSub("")} style={{ ...chip(!subId, gcol), fontSize: 12.5, padding: "5px 11px" }}>
              Tout le groupe {count((sel.athleteIds || []).length)}
            </button>
            {(sel.subGroups || []).map((sg) => (
              <button
                key={sg.id}
                type="button"
                onClick={() => onSub(sg.id)}
                style={{ ...chip(subId === sg.id, sg.color || gcol), fontSize: 12.5, padding: "5px 11px" }}
              >
                {dot(sg.color || gcol, 7)} {sg.name} {count((sg.athleteIds || []).length)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Liste de personnes en pastilles (initiales), ou liste déroulante au-delà de `max` personnes */
function PeoplePick({ people, selectedId, onSelect, max = 30, placeholder }) {
  const sorted = people.slice().sort((a, b) => personName(a).localeCompare(personName(b)));
  if (!sorted.length) return <div style={{ fontSize: 13, color: MUTED }}>Personne dans cette sélection.</div>;
  if (sorted.length > max)
    return (
      <select
        value={sorted.some((a) => a.id === selectedId) ? selectedId : ""}
        onChange={(e) => onSelect(e.target.value)}
        style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${selectedId ? AMBER : "#2a2620"}`, background: "#0d0c0a", color: TEXT, fontSize: 15 }}
      >
        <option value="">{placeholder} ({sorted.length})</option>
        {sorted.map((a) => (
          <option key={a.id} value={a.id}>{personName(a)}</option>
        ))}
      </select>
    );
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {sorted.map((a) => {
        const on = a.id === selectedId;
        return (
          <button key={a.id} type="button" onClick={() => onSelect(on ? "" : a.id)} style={{ ...chip(on), padding: "4px 12px 4px 4px" }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontWeight: 800,
                background: on ? AMBER : "#2a2620",
                color: on ? "#1a1306" : MUTED,
              }}
            >
              {initials(a)}
            </span>
            {personName(a)}
          </button>
        );
      })}
    </div>
  );
}

/* Sélecteur complet.
   mode : "athletes" | "moi" | "admins" ; onMode(m)
   selectedId / onSelect(id) : personne choisie (athlète ou admin) ; en mode "moi" la page utilise son propre compte.
   showAdmins : afficher la pastille « Admins » (superadmin en général). */
export default function PersonPicker({
  mode,
  onMode,
  athletes = [],
  admins = [],
  groups = [],
  selectedId = "",
  onSelect,
  showAdmins = true,
  title,
  note,
  bare = false, // sans cadre (intégré dans une carte existante)
}) {
  const [groupId, setGroupId] = useState("");
  const [subId, setSubId] = useState("");
  const sel = groups.find((g) => g.id === groupId) || null;
  const inAny = new Set(groups.flatMap((g) => g.athleteIds || []));
  const noneCount = athletes.filter((a) => !inAny.has(a.id)).length;
  let list = athletes;
  if (groupId === "none") list = athletes.filter((a) => !inAny.has(a.id));
  else if (sel) {
    const ids = new Set(subId ? (sel.subGroups || []).find((x) => x.id === subId)?.athleteIds || [] : sel.athleteIds || []);
    list = athletes.filter((a) => ids.has(a.id));
  }
  const chosen = [...athletes, ...admins].find((a) => a.id === selectedId) || null;
  const modes = [
    { id: "athletes", label: "🏉 Athlètes" },
    { id: "moi", label: "🌟 Moi" },
    ...(showAdmins ? [{ id: "admins", label: "👥 Admins" }] : []),
  ];
  return (
    <div style={bare ? {} : { background: "#151310", border: `1px solid ${chosen || mode === "moi" ? "#e0a13d55" : "#2a2620"}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>{title}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: mode === "moi" ? 0 : 12 }}>
        {modes.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              style={{ padding: "8px 18px", borderRadius: 999, border: `1px solid ${on ? AMBER : "#3a342a"}`, background: on ? "rgba(224,161,61,0.2)" : "transparent", color: TEXT, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "athletes" && (
        <div style={{ display: "grid", gap: 12 }}>
          <GroupChips
            groups={groups}
            groupId={groupId}
            subId={subId}
            total={athletes.length}
            noneCount={noneCount}
            onGroup={(g) => {
              setGroupId(g);
              setSubId("");
            }}
            onSub={setSubId}
          />
          <div>
            {pickerLabel(sel ? `👤 Athlète · ${sel.name}${subId ? " (sous-groupe)" : ""}` : groupId === "none" ? "👤 Athlète · sans groupe" : "👤 Athlète")}
            <PeoplePick people={list} selectedId={selectedId} onSelect={onSelect} placeholder="— Choisir un athlète —" />
          </div>
        </div>
      )}

      {mode === "admins" && (
        <div>
          {pickerLabel("👥 Admin")}
          <PeoplePick people={admins} selectedId={selectedId} onSelect={onSelect} placeholder="— Choisir un admin —" />
        </div>
      )}

      {(chosen && mode !== "moi") || note ? (
        <div style={{ fontSize: 12, color: AMBER, marginTop: 10 }}>
          {chosen && mode !== "moi" ? <>✓ {personName(chosen)}{note ? " · " : ""}</> : null}
          {note}
        </div>
      ) : null}
    </div>
  );
}
