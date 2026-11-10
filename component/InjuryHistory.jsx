import React, { useState } from "react";

/* =====================================================================
   InjuryHistory.jsx — journal de blessures commun (Tests › Bilan, Dashboard).

   Document « injuries » : { userId, date, zone, tissueType, mechanism, daysLost, notes,
                              name?, lostValue?, lostUnit? ("j" | "sem" | "mois") }
   • name      : nom / diagnostic (ex. « Entorse externe ») — optionnel, mis en avant.
   • lostValue + lostUnit : durée d'arrêt telle que saisie ; daysLost reste toujours
     renseigné en jours (rétro-compatible avec l'ACWR, les anciens écrans, etc.).
   • rtp? : { stage (1-5, 6 = retour validé), checks: { idCritère: true }, updatedAt } — suivi du retour
     au jeu, rempli par le coach dans la fiche athlète du Dashboard (voir coachSynthesis.js).
   ===================================================================== */

export const TISSUE_LABELS = { muscle: "Muscle", tendon: "Tendon", ligament: "Ligament", os: "Os / articulation", autre: "Autre" };
export const MECHANISM_LABELS = { contact: "Contact / traumatique", surcharge: "Surcharge / usure", autre: "Autre" };
const TISSUE_ICON = { muscle: "💪", tendon: "🧵", ligament: "🔗", os: "🦴", autre: "•" };
export const LOST_UNITS = [
  { id: "j", label: "jours", one: "jour", days: 1 },
  { id: "sem", label: "semaines", one: "semaine", days: 7 },
  { id: "mois", label: "mois", one: "mois", days: 30 },
];
const UNIT = Object.fromEntries(LOST_UNITS.map((u) => [u.id, u]));

const RED = "#d9695a";
const AMBER = "#e0a13d";
const GREEN = "#4fae7d";
const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parseDay = (s) => {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return y ? new Date(y, (m || 1) - 1, d || 1) : null;
};
const addDays = (s, n) => {
  const d = parseDay(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const fmtDateFr = (s, opts = { day: "numeric", month: "short", year: "numeric" }) => {
  const d = parseDay(s);
  return d ? d.toLocaleDateString("fr-FR", opts) : "—";
};

/* Durée d'arrêt affichable : « 3 semaines » (unité saisie), sinon « 21 jours (3 sem.) » */
export function lostText(inj) {
  const days = inj?.daysLost;
  if (days === null || days === undefined || days === "") return null;
  const u = UNIT[inj.lostUnit];
  if (u && inj.lostValue != null && inj.lostValue !== "") {
    const v = Number(inj.lostValue);
    return `${String(v).replace(".", ",")} ${v > 1 ? u.label : u.one}`;
  }
  const n = Number(days);
  if (n >= 60) return `${n} jours (≈ ${Math.round(n / 30)} mois)`;
  if (n >= 14) return `${n} jours (≈ ${Math.round(n / 7)} sem.)`;
  return `${n} ${n > 1 ? "jours" : "jour"}`;
}

/* Statut : en cours (retour prévu pas encore atteint), reprise récente (< 4 sem.), guérie */
export function injuryStatus(inj, today = todayLocal()) {
  const n = Number(inj?.daysLost);
  if (!inj?.date || !Number.isFinite(n) || inj.daysLost === null || inj.daysLost === "") return { key: "na", label: "Durée non renseignée", color: MUTED };
  const back = addDays(inj.date, n);
  const elapsed = daysBetween(inj.date, today);
  if (elapsed < 0) return { key: "future", label: "À venir", color: MUTED, back };
  if (today < back) return { key: "ongoing", label: "En cours", color: RED, back, pct: n > 0 ? Math.min(1, elapsed / n) : 1, left: daysBetween(today, back) };
  if (daysBetween(back, today) <= 28) return { key: "recent", label: "Reprise récente", color: AMBER, back };
  return { key: "healed", label: "Guérie", color: GREEN, back };
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid #3a342a`,
  background: "#0d0c0a",
  color: TEXT,
  fontSize: 14,
};
const lbl = { display: "block", fontSize: 11.5, color: MUTED, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 };

/* Formulaire (ajout ou modification). onSave(payload sans userId) */
export function InjuryForm({ initial, onSave, onCancel, saving, message }) {
  const init = initial || {};
  const initUnit = UNIT[init.lostUnit] ? init.lostUnit : "j";
  const initVal =
    init.lostValue != null && init.lostValue !== "" && UNIT[init.lostUnit]
      ? String(init.lostValue)
      : init.daysLost != null && init.daysLost !== ""
      ? String(init.daysLost)
      : "";
  const [f, setF] = useState({
    name: init.name || "",
    date: init.date || todayLocal(),
    zone: init.zone || "",
    tissueType: init.tissueType || "muscle",
    mechanism: init.mechanism || "surcharge",
    lostValue: initVal,
    lostUnit: initUnit,
    notes: init.notes || "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const v = parseFloat(String(f.lostValue).replace(",", "."));
  const days = Number.isFinite(v) && v >= 0 ? Math.round(v * UNIT[f.lostUnit].days) : null;
  const submit = () =>
    onSave({
      name: f.name.trim(),
      date: f.date || todayLocal(),
      zone: f.zone.trim(),
      tissueType: f.tissueType,
      mechanism: f.mechanism,
      daysLost: days,
      lostValue: days === null ? null : v,
      lostUnit: days === null ? null : f.lostUnit,
      notes: f.notes,
    });
  return (
    <div style={{ padding: 14, background: "#151310", border: `1px solid rgba(217,105,90,0.35)`, borderRadius: 12, marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Nom de la blessure</label>
          <input value={f.name} onChange={set("name")} placeholder="ex : entorse externe, lésion ischio grade 2…" style={{ ...inputStyle, fontSize: 15, fontWeight: 700 }} />
        </div>
        <div>
          <label style={lbl}>Date</label>
          <input type="date" value={f.date} onChange={set("date")} style={inputStyle} />
        </div>
        <div>
          <label style={lbl}>Zone touchée</label>
          <input value={f.zone} onChange={set("zone")} placeholder="ex : cheville gauche" style={inputStyle} />
        </div>
        <div>
          <label style={lbl}>Type de tissu</label>
          <select value={f.tissueType} onChange={set("tissueType")} style={inputStyle}>
            {Object.entries(TISSUE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Mécanisme</label>
          <select value={f.mechanism} onChange={set("mechanism")} style={inputStyle}>
            {Object.entries(MECHANISM_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Durée d'arrêt (estimée ou réelle)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="number" min="0" step="0.5" inputMode="decimal" value={f.lostValue} onChange={set("lostValue")} placeholder="ex : 3" style={{ ...inputStyle, width: 110 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {LOST_UNITS.map((u) => {
                const on = f.lostUnit === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setF((p) => ({ ...p, lostUnit: u.id }))}
                    style={{ padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? RED : "#3a342a"}`, background: on ? "rgba(217,105,90,0.18)" : "transparent", color: on ? TEXT : MUTED, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    {u.label}
                  </button>
                );
              })}
            </div>
            {days !== null && f.lostUnit !== "j" && <span style={{ fontSize: 12, color: MUTED }}>= {days} jours</span>}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Notes (soins, ressenti, consignes…)</label>
          <textarea value={f.notes} onChange={set("notes")} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          style={{ flex: 1, padding: 12, background: saving ? MUTED : RED, color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}
        >
          {saving ? "Enregistrement…" : initial ? "Mettre à jour" : "Enregistrer la blessure"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: "12px 16px", background: "transparent", color: MUTED, border: "1px solid #3a342a", borderRadius: 10, fontSize: 14, cursor: "pointer" }}>
            Annuler
          </button>
        )}
      </div>
      {message && <div style={{ marginTop: 8, fontSize: 13, color: message.includes("✅") ? GREEN : RED }}>{message}</div>}
    </div>
  );
}

const ORDER_KEY = "pt_injury_order";
const readOrder = () => {
  try {
    return localStorage.getItem(ORDER_KEY) === "desc" ? "desc" : "asc";
  } catch (e) {
    return "asc";
  }
};

/* Frise chronologique.
   injuries : documents ; onEdit(inj) / onDelete(inj) optionnels ; editingId + renderEdit(inj) pour éditer sur place ;
   compact : version carte du dashboard (pas de boutons, notes raccourcies). */
export function InjuryTimeline({ injuries = [], onEdit, onDelete, editingId, renderEdit, compact = false, emptyText = "Aucune blessure enregistrée." }) {
  const [order, setOrder] = useState(readOrder);
  const flip = () => {
    const next = order === "asc" ? "desc" : "asc";
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, next);
    } catch (e) {
      /* stockage indisponible */
    }
  };
  const today = todayLocal();
  const list = injuries
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") * (order === "asc" ? 1 : -1));
  const ongoing = injuries.filter((i) => injuryStatus(i, today).key === "ongoing").length;
  const totalDays = injuries.reduce((s, i) => s + (Number(i.daysLost) || 0), 0);

  if (!injuries.length) return <div style={{ fontSize: 13, color: MUTED }}>{emptyText}</div>;

  let lastYear = null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={statChip(RED)}>{injuries.length} blessure{injuries.length > 1 ? "s" : ""}</span>
          {ongoing > 0 && <span style={statChip(RED, true)}>● {ongoing} en cours</span>}
          {totalDays > 0 && !compact && <span style={statChip(MUTED)}>⏱ {totalDays} j d'arrêt au total</span>}
        </div>
        <button
          type="button"
          onClick={flip}
          title="Changer le sens"
          style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer" }}
        >
          {order === "asc" ? "↓ Plus anciennes d'abord" : "↑ Plus récentes d'abord"}
        </button>
      </div>

      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "linear-gradient(#d9695a55, #2a2620)", borderRadius: 1 }} />
        {list.map((inj) => {
          const y = (inj.date || "").slice(0, 4);
          const yearHead = y && y !== lastYear;
          lastYear = y;
          const st = injuryStatus(inj, today);
          const lost = lostText(inj);
          const title = inj.name || inj.zone || "Blessure";
          return (
            <React.Fragment key={inj.id}>
              {yearHead && (
                <div style={{ position: "relative", margin: "4px 0 10px", fontSize: 12, fontWeight: 800, letterSpacing: 1, color: MUTED }}>
                  <span style={{ position: "absolute", left: -22, top: 1, width: 16, height: 16, borderRadius: 8, background: "#0d0c0a", border: `2px solid ${BORDER}` }} />
                  {y}
                </div>
              )}
              {editingId === inj.id && renderEdit ? (
                renderEdit(inj)
              ) : (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: -20,
                      top: 16,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: st.color,
                      boxShadow: st.key === "ongoing" ? `0 0 0 4px ${RED}33` : "none",
                    }}
                  />
                  <div style={{ background: "#151310", border: `1px solid ${st.key === "ongoing" ? "rgba(217,105,90,0.5)" : BORDER}`, borderRadius: 12, padding: compact ? "10px 12px" : "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{fmtDateFr(inj.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</div>
                        <div style={{ fontSize: compact ? 15.5 : 17, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginTop: 2 }}>{title}</div>
                        {inj.name && inj.zone && <div style={{ fontSize: 13, color: "#d8cfbd", marginTop: 1 }}>📍 {inj.zone}</div>}
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: st.color, border: `1px solid ${st.color}66`, background: `${st.color}1a`, whiteSpace: "nowrap" }}>
                        {st.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {inj.tissueType && <span style={tag}>{TISSUE_ICON[inj.tissueType] || "•"} {TISSUE_LABELS[inj.tissueType] || inj.tissueType}</span>}
                      {inj.mechanism && <span style={tag}>{MECHANISM_LABELS[inj.mechanism] || inj.mechanism}</span>}
                      {inj.rtp && <span style={{ ...tag, color: Number(inj.rtp.stage) >= 6 ? GREEN : AMBER }}>🏥 Retour au jeu : {Number(inj.rtp.stage) >= 6 ? "validé" : `étape ${Math.max(1, Number(inj.rtp.stage) || 1)}/5`}</span>}
                      {lost && <span style={{ ...tag, color: TEXT, borderColor: "rgba(217,105,90,0.45)", background: "rgba(217,105,90,0.1)" }}>⏱ {lost} d'arrêt</span>}
                      {st.back && st.key !== "na" && <span style={tag}>↩ retour {st.key === "ongoing" ? "prévu" : ""} {fmtDateFr(st.back, { day: "numeric", month: "short" })}</span>}
                    </div>

                    {st.key === "ongoing" && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTED, marginBottom: 4 }}>
                          <span>Récupération</span>
                          <span>
                            {Math.round(st.pct * 100)} % · encore {st.left} j
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "#0d0c0a", overflow: "hidden" }}>
                          <div style={{ width: `${Math.round(st.pct * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${RED}, ${AMBER})` }} />
                        </div>
                      </div>
                    )}

                    {inj.notes && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "rgba(224,161,61,0.07)",
                          borderLeft: `3px solid ${AMBER}`,
                          fontSize: 13.5,
                          color: "#ece6db",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <div style={compact ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>
                          <span style={{ fontWeight: 800, color: AMBER, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", marginRight: 6 }}>Notes</span>
                          {inj.notes}
                        </div>
                      </div>
                    )}

                    {(onEdit || onDelete) && (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 10 }}>
                        {onEdit && (
                          <button type="button" onClick={() => onEdit(inj)} style={actBtn(AMBER)}>
                            ✏️ Modifier
                          </button>
                        )}
                        {onDelete && (
                          <button type="button" onClick={() => onDelete(inj)} style={actBtn(RED)}>
                            🗑 Supprimer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const tag = { fontSize: 12, padding: "3px 9px", borderRadius: 999, border: `1px solid ${BORDER}`, background: "#0d0c0a", color: MUTED, whiteSpace: "nowrap" };
const statChip = (c, strong) => ({ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: strong ? c : TEXT, border: `1px solid ${c}55`, background: `${c}14` });
const actBtn = (c) => ({ padding: "5px 10px", background: "transparent", color: c, border: `1px solid ${c}66`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 });
