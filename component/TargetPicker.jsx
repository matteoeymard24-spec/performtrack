import React, { useMemo, useState } from "react";
import { GroupChips, PeoplePick, pickerLabel } from "./PersonPicker";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const LINE = "#2a2620";
const CARD = "#151310";

/* Choix des cibles d'une séance.
   3 façons : 👥 Groupes (plusieurs possibles : une séance par groupe / sous-groupe sélectionné),
              👤 Un athlète (séance individuelle), 🌟 Moi (séance privée).
   selected : tableau de valeurs (total, moi, individuel, idGroupe, "sg:idGroupe:idSousGroupe"). Au moins une.
   Même contrat qu'avant (selected / onChange / userId / onUserChange) : rien ne change pour l'enregistrement. */
export default function TargetPicker({ selected, onChange, customGroups, makeSubGroupTarget, athletes, adminUsers, userId, onUserChange, nameOf, accent = "#e0a13d", currentUid }) {
  const sel = selected && selected.length ? selected : ["total"];
  const mode = sel.includes("individuel") ? "athlete" : sel.length === 1 && sel[0] === "moi" ? "moi" : "groups";
  const [openMembers, setOpenMembers] = useState(null); // id du groupe dont on montre les athlètes
  const [query, setQuery] = useState("");
  const [pickGroup, setPickGroup] = useState(""); // filtre de l'onglet « Un athlète »
  const [pickSub, setPickSub] = useState("");

  const nameById = useMemo(() => {
    const m = {};
    [...(athletes || []), ...(adminUsers || [])].forEach((a) => {
      m[a.id] = nameOf(a);
    });
    return m;
  }, [athletes, adminUsers, nameOf]);

  const membersOf = (v) => {
    if (v === "total") return (athletes || []).map((a) => a.id);
    if (v === "moi") return currentUid ? [currentUid] : [];
    if (typeof v === "string" && v.startsWith("sg:")) {
      const [, gid, sid] = v.split(":");
      const g = customGroups.find((x) => x.id === gid);
      return (g?.subGroups || []).find((x) => x.id === sid)?.athleteIds || [];
    }
    const g = customGroups.find((x) => x.id === v);
    return g ? g.athleteIds || [] : (athletes || []).filter((a) => a.group === v).map((a) => a.id);
  };

  const setMode = (m) => {
    if (m === mode) return;
    if (m === "athlete") onChange(["individuel"]);
    else if (m === "moi") onChange(["moi"]);
    else onChange(["total"]);
  };
  const groupSel = sel.filter((x) => x !== "individuel");
  const toggle = (v) => {
    if (groupSel.includes(v)) {
      if (groupSel.length === 1) return; // au moins une cible
      onChange(groupSel.filter((x) => x !== v));
      return;
    }
    onChange([...groupSel, v]);
  };

  const tab = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "10px 8px",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        background: mode === id ? accent : "transparent",
        color: mode === id ? "#1a1306" : MUTED,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </button>
  );

  const pill = (value, label, count) => {
    const on = sel.includes(value);
    return (
      <button
        key={value}
        type="button"
        onClick={() => toggle(value)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          border: `1px solid ${on ? accent : LINE}`,
          background: on ? `${accent}26` : "#0d0c0a",
          color: on ? accent : TEXT,
        }}
      >
        {on ? "✓ " : ""}
        {label}
        {count != null && <span style={{ color: on ? accent : MUTED, fontWeight: 500 }}>{count}</span>}
      </button>
    );
  };

  // Récapitulatif : séances créées + personnes distinctes concernées
  const people = new Set(groupSel.flatMap(membersOf));
  const labelOf = (v) => {
    if (v === "total") return "Tous les athlètes";
    if (v === "moi") return "Moi";
    if (typeof v === "string" && v.startsWith("sg:")) {
      const [, gid, sid] = v.split(":");
      const g = customGroups.find((x) => x.id === gid);
      const sg = (g?.subGroups || []).find((x) => x.id === sid);
      return sg ? `${g.name} › ${sg.name}` : "Sous-groupe";
    }
    return customGroups.find((x) => x.id === v)?.name || v;
  };

  // Onglet « Un athlète » : jamais soi-même (il y a l'onglet 🌟 Moi), filtre groupe / sous-groupe + recherche
  const q = query.trim().toLowerCase();
  const match = (a) => !q || nameOf(a).toLowerCase().includes(q);
  const athletePool = (athletes || []).filter((a) => a.id !== currentUid);
  const inAnyGroup = new Set(customGroups.flatMap((g) => g.athleteIds || []));
  const fGroup = customGroups.find((g) => g.id === pickGroup) || null;
  let athleteList = athletePool;
  if (pickGroup === "none") athleteList = athletePool.filter((a) => !inAnyGroup.has(a.id));
  else if (fGroup) {
    const ids = new Set(pickSub ? (fGroup.subGroups || []).find((x) => x.id === pickSub)?.athleteIds || [] : fGroup.athleteIds || []);
    athleteList = athletePool.filter((a) => ids.has(a.id));
  }
  athleteList = athleteList.filter(match);
  const adminList = (adminUsers || [])
    .filter((a) => a.id !== currentUid && !athletePool.some((x) => x.id === a.id))
    .filter(match);

  return (
    <div>
      {/* Onglets */}
      <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 10, background: CARD, border: `1px solid ${LINE}`, marginBottom: 12 }}>
        {tab("groups", "👥 Groupes")}
        {tab("athlete", "👤 Un athlète")}
        {tab("moi", "🌟 Moi")}
      </div>

      {mode === "groups" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {pill("total", "Tous les athlètes", (athletes || []).length)}
            {pill("moi", "🌟 + une copie pour moi", null)}
          </div>
          {customGroups.length > 0 && (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
              {customGroups.map((g) => {
                const on = sel.includes(g.id);
                const subs = g.subGroups || [];
                const subOn = subs.some((sg) => sel.includes(makeSubGroupTarget(g.id, sg.id)));
                const color = g.color || accent;
                return (
                  <div
                    key={g.id}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${on || subOn ? accent : LINE}`,
                      background: on ? `${accent}14` : CARD,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                      <button
                        type="button"
                        onClick={() => toggle(g.id)}
                        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", color: TEXT, textAlign: "left" }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            flexShrink: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 900,
                            border: `2px solid ${on ? accent : color}`,
                            background: on ? accent : "transparent",
                            color: "#1a1306",
                          }}
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ color: MUTED, fontSize: 12, flexShrink: 0 }}>{(g.athleteIds || []).length} ath.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenMembers(openMembers === g.id ? null : g.id)}
                        title="Voir les athlètes du groupe"
                        style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 6, color: MUTED, cursor: "pointer", padding: "2px 6px", fontSize: 12 }}
                      >
                        👀
                      </button>
                    </div>
                    {/* un seul sous-groupe = le groupe lui-même : on n'affiche que le groupe */}
                    {subs.length > 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 10px" }}>
                        {subs.map((sg) => {
                          const v = makeSubGroupTarget(g.id, sg.id);
                          const sOn = sel.includes(v);
                          return (
                            <button
                              key={sg.id}
                              type="button"
                              onClick={() => toggle(v)}
                              style={{
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                cursor: "pointer",
                                border: `1px solid ${sOn ? accent : LINE}`,
                                background: sOn ? `${accent}26` : "#0d0c0a",
                                color: sOn ? accent : MUTED,
                                fontWeight: 600,
                              }}
                            >
                              {sOn ? "✓ " : "↳ "}
                              {sg.name} <span style={{ opacity: 0.7 }}>{(sg.athleteIds || []).length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {openMembers === g.id && (
                      <div style={{ borderTop: `1px solid ${LINE}`, padding: "8px 12px", fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
                        {(g.athleteIds || []).length
                          ? (g.athleteIds || []).map((id) => nameById[id] || "Athlète inconnu").join(" · ")
                          : "Aucun athlète dans ce groupe."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Récapitulatif */}
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: CARD, border: `1px dashed ${LINE}` }}>
            <span style={{ color: TEXT, fontWeight: 700 }}>
              {groupSel.length} séance{groupSel.length > 1 ? "s" : ""}
            </span>{" "}
            {groupSel.length > 1 ? "créées" : "créée"} : {groupSel.map(labelOf).join(", ")} · {people.size} personne{people.size > 1 ? "s" : ""} concernée{people.size > 1 ? "s" : ""}
          </div>
        </div>
      )}

      {mode === "athlete" && (
        <div style={{ display: "grid", gap: 12 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔎 Rechercher un athlète…"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${LINE}`, background: "#0d0c0a", color: TEXT, fontSize: 15 }}
          />
          {customGroups.length > 0 && (
            <GroupChips
              groups={customGroups}
              groupId={pickGroup}
              subId={pickSub}
              total={athletePool.length}
              noneCount={athletePool.filter((a) => !inAnyGroup.has(a.id)).length}
              onGroup={(g) => {
                setPickGroup(g);
                setPickSub("");
              }}
              onSub={setPickSub}
            />
          )}
          <div>
            {pickerLabel(fGroup ? `👤 Athlète · ${fGroup.name}${pickSub ? " (sous-groupe)" : ""}` : pickGroup === "none" ? "👤 Athlète · sans groupe" : "👤 Athlète")}
            <PeoplePick people={athleteList} selectedId={userId} onSelect={(id) => id && onUserChange(id)} placeholder="— Choisir un athlète —" />
          </div>
          {adminList.length > 0 && (
            <div>
              {pickerLabel("👥 Admin")}
              <PeoplePick people={adminList} selectedId={userId} onSelect={(id) => id && onUserChange(id)} placeholder="— Choisir un admin —" />
            </div>
          )}
          <div style={{ fontSize: 12.5, color: userId ? accent : "#e08a3d", fontWeight: userId ? 700 : 400 }}>
            {userId ? `✓ Séance individuelle pour ${nameById[userId] || "cet athlète"}` : "Choisis l'athlète ci-dessus."}
          </div>
        </div>
      )}

      {mode === "moi" && (
        <div style={{ fontSize: 13, color: MUTED, padding: "8px 10px", borderRadius: 8, background: CARD, border: `1px dashed ${LINE}` }}>
          🌟 Séance privée : visible par toi seul, dans ton calendrier et ta planification.
        </div>
      )}
    </div>
  );
}
