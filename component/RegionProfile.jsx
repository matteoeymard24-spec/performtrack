import React, { useMemo, useState } from "react";
import { computeRegionProfiles, latestByTestId, REGION_STATE } from "./regionProfile";
import { STATUS } from "./testsCalc";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const BORDER = "#1d1a16";

const LEVEL_COLOR = { ok: "#4fae7d", minor: "#d9a441", flag: "#e08a3d", pain: "#d9534f" };

const fmt = (v) => (v == null ? "—" : String(v));

/* Profil par région : FMS (signal) × tests spécifiques (confirmation) + précision du profil.
   tests : liste des tests Firestore de l'athlète. onPickTest(testId, group) : ouvre la saisie (coach). */
export default function RegionProfile({ tests, onPickTest = null, title = "🧭 Profil par région" }) {
  const [open, setOpen] = useState(null);
  const profiles = useMemo(() => computeRegionProfiles(latestByTestId(tests)), [tests]);

  const sorted = profiles.filter((p) => p.state !== "nodata").sort((a, b) => REGION_STATE[a.state].order - REGION_STATE[b.state].order);
  const anyData = profiles.some((p) => p.state !== "nodata");

  return (
    <div>
      {title ? <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div> : null}
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Les régions sans aucun test sont masquées. Le FMS donne un signal ; un test spécifique de la région le confirme. La barre répartit 100 % de l'attention à donner
        entre les régions : plus une région est en difficulté, plus sa part est grande. Repères indicatifs : le FMS ne prédit pas la blessure à lui seul.
      </div>
      {!anyData && (
        <div style={{ color: MUTED, fontSize: 13, marginBottom: 8 }}>
          Aucun test de mobilité pour le moment. Commence par le FMS, puis un test par région.
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {sorted.map((p) => {
          const st = REGION_STATE[p.state];
          const isOpen = open === p.id;
          return (
            <div key={p.id} style={{ background: "#0d0c0a", borderRadius: 10, borderLeft: `5px solid ${st.color}`, padding: "10px 12px" }}>
              <div
                onClick={() => setOpen(isOpen ? null : p.id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer", flexWrap: "wrap" }}
              >
                <div style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>
                  {p.icon} {p.label} <span style={{ color: MUTED, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {p.tags.map((t) => (
                    <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#1d1a16", color: TEXT }}>
                      {t}
                    </span>
                  ))}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: st.color + "26", color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ flex: 1, height: 5, background: "#1d1a16", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${p.priority}%`, height: "100%", background: st.color }} />
                </div>
                <span style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
                  Priorité : {p.priority} %
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                  {p.note && <div style={{ fontSize: 12, color: "#e0a13d", marginBottom: 8 }}>ℹ️ {p.note}</div>}

                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>FMS (signal)</div>
                  {p.signals.length === 0 && (
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {p.fms.length === 0 ? "Le FMS ne mesure pas cette zone." : "Mouvements FMS concernés non testés."}
                    </div>
                  )}
                  {p.signals.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "2px 0" }}>
                      <span style={{ color: TEXT }}>
                        {s.label} <span style={{ color: MUTED, fontSize: 11 }}>· {s.why}</span>
                      </span>
                      <span style={{ color: LEVEL_COLOR[s.level], fontWeight: 700, whiteSpace: "nowrap" }}>
                        {s.l != null || s.r != null ? `G ${fmt(s.l)} / D ${fmt(s.r)}` : `${s.score}/3`}
                        {s.level === "pain" ? " · douleur" : s.asym ? " · asymétrie" : ""}
                      </span>
                    </div>
                  ))}

                  <div style={{ fontSize: 11, color: MUTED, margin: "8px 0 4px 0" }}>Tests spécifiques</div>
                  {p.specific.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>Aucun test spécifique fait pour cette région.</div>}
                  {p.specific.map((sp) => (
                    <div key={sp.id} style={{ padding: "3px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                        <span style={{ color: TEXT }}>
                          {sp.name} <span style={{ color: MUTED, fontSize: 11 }}>· {sp.date}</span>
                        </span>
                        {sp.status && <span style={{ color: STATUS[sp.status].color, fontWeight: 700 }}>{STATUS[sp.status].label}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED }}>
                        {sp.items.map((i, k) => (
                          <span key={k}>
                            {k > 0 ? " · " : ""}
                            {i.label}
                            {i.side ? ` ${i.side}` : ""} {i.value}
                            {i.unit}
                          </span>
                        ))}
                        {sp.asym.map((a, k) => (
                          <span key={"a" + k} style={{ color: STATUS[a.status].color }}>
                            {" · "}écart G/D {a.pct}
                            {a.abs ? ` ${a.unit}` : "%"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {p.missing.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>À faire pour affiner</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.missing.map((m) =>
                          onPickTest ? (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => onPickTest(m.id, m.group)}
                              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid #2a2620", background: "#151310", color: TEXT, cursor: "pointer" }}
                            >
                              {m.noGear ? "🧰 " : ""}
                              {m.name}
                            </button>
                          ) : (
                            <span key={m.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#151310", color: MUTED }}>
                              {m.noGear ? "🧰 " : ""}
                              {m.name}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
