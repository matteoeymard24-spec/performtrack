import React, { useState } from "react";
import { SYNTH_LEVELS, RTP_STAGES } from "./coachSynthesis";
import { fmtDateFr } from "./InjuryHistory";

/* =====================================================================
   CoachFiche.jsx — cartes de la fiche athlète (vue coach), affichage seulement.
   Les calculs sont dans coachSynthesis.js ; les seuils dans ⚙️ Paramètres.
     • SynthesisBanner  : un feu par pôle + la décision proposée
     • WeekLoadCard     : charge prévue / réalisée par semaine + dynamique (variation, monotonie, contrainte)
     • RtpCard          : retour au jeu par étapes à critères
     • RelStrengthCard  : force relative (RM ÷ poids de corps) et note du barème
   ===================================================================== */
const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";
const AMBER = "#e0a13d";
const GREEN = "#4fae7d";
const RED = "#d9695a";
const BLUE = "#5b9bd5";
const CARD = { background: "#151310", padding: 18, borderRadius: 12, marginBottom: 16, border: `1px solid ${BORDER}` };
const H3 = { margin: 0, fontSize: 16, fontWeight: 700, color: TEXT };
const fr = (x) => String(x).replace(".", ",");
const shortDay = (s) => fmtDateFr(s, { day: "numeric", month: "short" });

const POLES = [
  { id: "charge", label: "Charge", icon: "⚖️" },
  { id: "recup", label: "Récupération", icon: "🛌" },
  { id: "train", label: "Entraînement", icon: "💪" },
];

export function SynthesisBanner({ synth, onGo }) {
  if (!synth) return null;
  return (
    <div style={{ ...CARD, border: `1px solid ${AMBER}66`, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={H3}>🚦 Synthèse du jour</h3>
        <span style={{ fontSize: 11.5, color: MUTED }}>Proposition calculée : la décision reste la tienne</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 10 }}>
        {POLES.map((p) => {
          const s = synth[p.id];
          const lv = SYNTH_LEVELS[s.level] || SYNTH_LEVELS.nodata;
          return (
            <button
              key={p.id}
              type="button"
              onClick={onGo ? () => onGo(p.id) : undefined}
              title={onGo ? "Aller au pôle" : undefined}
              style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "stretch", textAlign: "left", padding: "12px 14px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${lv.color}66`, borderLeft: `4px solid ${lv.color}`, color: TEXT, cursor: onGo ? "pointer" : "default", minWidth: 0 }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED }}>
                  {p.icon} {p.label}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: lv.color, whiteSpace: "nowrap" }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: lv.color, marginRight: 6 }} />
                  {lv.label}
                </span>
              </span>
              <span style={{ display: "block", marginTop: 8 }}>
                {s.reasons.slice(0, 3).map((t, i) => (
                  <span key={i} style={{ display: "block", fontSize: 12.5, color: i === 0 ? "#d8cfbd" : MUTED, lineHeight: 1.4, marginTop: i ? 3 : 0 }}>
                    {t}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(224,161,61,0.09)", border: `1px solid ${AMBER}44` }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: AMBER, marginBottom: 3 }}>Décision proposée</div>
        <div style={{ fontSize: 14.5, color: TEXT, lineHeight: 1.45, fontWeight: 600 }}>{synth.decision}</div>
      </div>
    </div>
  );
}

/* Petit indicateur chiffré */
function Stat({ label, value, sub, color = TEXT, title }) {
  return (
    <div title={title} style={{ padding: "10px 12px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}`, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div>}
    </div>
  );
}

export function WeekLoadCard({ weeks, dyn, thresholds }) {
  const th = thresholds || {};
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.plannedLoad, w.doneLoad)));
  const any = weeks.some((w) => w.plannedSessions > 0 || w.doneSessions > 0);
  const jumpCol = dyn.changePct == null ? MUTED : dyn.changePct >= th.jumpAlert ? RED : dyn.changePct >= th.jumpWatch ? "#d9a441" : dyn.changePct <= -th.dropUnder ? BLUE : GREEN;
  const monoCol = dyn.monotony == null ? MUTED : dyn.monotony >= th.monoHigh ? RED : dyn.monotony >= 1.5 ? "#d9a441" : GREEN;
  const pctCol = (p) => (p == null ? MUTED : p < th.complianceLow ? "#d9a441" : p > 130 ? RED : GREEN);
  return (
    <div style={CARD}>
      <h3 style={{ ...H3, marginBottom: 4 }}>📅 Charge de la semaine : prévu / réalisé</h3>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
        Prévu = RPE prévu × durée prévue des séances de la semaine. Réalisé = note de séance × durée réelle (sRPE). En UA.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 8, marginBottom: 14 }}>
        <Stat
          label="7 derniers jours"
          value={dyn.changePct == null ? "—" : `${dyn.changePct > 0 ? "+" : ""}${dyn.changePct} %`}
          color={jumpCol}
          sub={dyn.changePct == null ? "pas assez d'historique" : `${dyn.last7} UA · ${dyn.prev7} d'habitude`}
          title="Charge des 7 derniers jours comparée à la moyenne hebdomadaire des 3 semaines d'avant"
        />
        <Stat
          label="Monotonie"
          value={dyn.monotony == null ? "—" : fr(dyn.monotony)}
          color={monoCol}
          sub={dyn.monotony == null ? "non calculable" : dyn.monotony >= th.monoHigh ? "jours trop semblables" : "variété correcte"}
          title="Charge moyenne par jour ÷ écart-type sur 7 jours (Foster 1998). Élevée = pas assez d'alternance dur / facile."
        />
        <Stat
          label="Contrainte"
          value={dyn.strain == null ? "—" : dyn.strain}
          sub={dyn.strainPct != null ? `${dyn.strainPct} % de son habitude` : "charge × monotonie"}
          color={dyn.strainPct != null && dyn.strainPct >= 150 ? "#d9a441" : TEXT}
          title="Charge de la semaine × monotonie (Foster 1998), comparée à la moyenne de ses 4 semaines précédentes"
        />
      </div>
      {!any ? (
        <div style={{ fontSize: 13, color: MUTED }}>Aucune séance prévue ni réalisée sur les 6 dernières semaines.</div>
      ) : (
        <div role="table" aria-label="Charge prévue et réalisée par semaine">
          {weeks.map((w) => (
            <div key={w.start} role="row" style={{ display: "grid", gridTemplateColumns: "74px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${BORDER}` }}>
              <div role="cell" style={{ fontSize: 12, color: w.current ? AMBER : MUTED, fontWeight: w.current ? 800 : 600, lineHeight: 1.25 }}>
                {w.current ? "Cette sem." : shortDay(w.start)}
                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: MUTED }}>
                  {w.doneSessions}/{w.plannedSessions} séance{w.plannedSessions > 1 ? "s" : ""}
                </span>
              </div>
              <div role="cell" style={{ minWidth: 0 }}>
                <div title={`Prévu : ${w.plannedLoad} UA`} style={{ height: 7, borderRadius: 4, background: "#1a1815", marginBottom: 3 }}>
                  <div style={{ width: `${(w.plannedLoad / max) * 100}%`, height: "100%", borderRadius: 4, background: "#6f6a62" }} />
                </div>
                <div title={`Réalisé : ${w.doneLoad} UA`} style={{ height: 7, borderRadius: 4, background: "#1a1815" }}>
                  <div style={{ width: `${(w.doneLoad / max) * 100}%`, height: "100%", borderRadius: 4, background: AMBER }} />
                </div>
              </div>
              <div role="cell" style={{ textAlign: "right", fontSize: 12, color: MUTED, whiteSpace: "nowrap", lineHeight: 1.3 }}>
                <b style={{ color: TEXT }}>{w.doneLoad}</b> / {w.plannedLoad || "—"}
                <span style={{ display: "block", fontWeight: 800, color: pctCol(w.loadPct) }}>{w.loadPct == null ? "—" : `${w.loadPct} %`}</span>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: MUTED, marginTop: 8 }}>
            <span>
              <span style={{ display: "inline-block", width: 14, height: 6, borderRadius: 3, background: "#6f6a62", marginRight: 5 }} />
              Prévu
            </span>
            <span>
              <span style={{ display: "inline-block", width: 14, height: 6, borderRadius: 3, background: AMBER, marginRight: 5 }} />
              Réalisé
            </span>
            <span>Semaine en cours : % calculé sur les séances déjà dues.</span>
            {weeks.some((w) => w.doneNoRpe > 0) && <span>⚠️ Des séances terminées sans note de séance ne comptent pas dans la charge.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function RtpCard({ injury, status, state, onSave, saving }) {
  const [open, setOpen] = useState(state.cleared ? 0 : state.stage);
  if (!injury) return null;
  const checks = injury.rtp?.checks || {};
  const toggle = (id) => onSave({ stage: state.stage, checks: { ...checks, [id]: !checks[id] } });
  const setStage = (n) => {
    onSave({ stage: n, checks });
    setOpen(n >= 6 ? 0 : n);
  };
  const name = injury.name || injury.zone || "Blessure";
  return (
    <div style={{ ...CARD, border: `1px solid ${RED}66` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h3 style={H3}>🏥 Retour au jeu : {name}</h3>
        <span style={{ fontSize: 12, fontWeight: 800, color: state.cleared ? GREEN : status?.color || AMBER, border: `1px solid ${state.cleared ? GREEN : status?.color || AMBER}66`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>
          {state.cleared ? "✓ Retour validé" : `Étape ${state.stage}/5`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
        Blessure du {fmtDateFr(injury.date)}
        {status?.back ? ` · retour estimé le ${fmtDateFr(status.back)}` : ""}. On passe à l'étape suivante quand les critères sont remplis, pas quand le délai est écoulé.
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }} aria-hidden="true">
        {RTP_STAGES.map((s) => (
          <div key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: state.cleared || s.id < state.stage ? GREEN : s.id === state.stage ? AMBER : "#2a2620" }} />
        ))}
      </div>
      {state.stages.map((s) => {
        const isCur = !state.cleared && s.id === state.stage;
        const isDone = state.cleared || s.id < state.stage;
        const isOpen = open === s.id;
        return (
          <div key={s.id} style={{ borderTop: `1px solid ${BORDER}`, padding: "8px 0" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? 0 : s.id)}
              aria-expanded={isOpen}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", color: TEXT, textAlign: "left" }}
            >
              <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: isDone ? GREEN : isCur ? AMBER : "#1a1815", color: isDone || isCur ? "#12100c" : MUTED }}>
                {isDone ? "✓" : s.id}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: isCur ? TEXT : isDone ? "#c9c1b5" : MUTED }}>{s.label}</span>
                {isCur && <span style={{ display: "block", fontSize: 12, color: MUTED }}>{s.goal}</span>}
              </span>
              <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                {s.criteria.filter((c) => c.ok).length}/{s.criteria.length} {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div style={{ margin: "8px 0 4px 34px" }}>
                {s.criteria.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: c.ok ? TEXT : "#c9c1b5", cursor: c.auto ? "default" : "pointer" }}>
                    <input type="checkbox" checked={!!c.ok} disabled={c.auto || saving} onChange={() => toggle(c.id)} style={{ marginTop: 2, accentColor: GREEN, width: 16, height: 16, flexShrink: 0 }} />
                    <span>
                      {c.t}
                      {c.auto && (
                        <span style={{ display: "block", fontSize: 11.5, color: c.ok ? GREEN : MUTED }}>
                          Calculé : {state.load.current} UA sur 7 jours, soit {state.load.pct} % de ses {state.load.usual} UA habituels
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                {isCur && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button type="button" className={s.complete ? "pt-btn pt-btn--primary" : "pt-btn"} disabled={saving} onClick={() => setStage(s.id + 1)} title={s.complete ? "" : "Tous les critères ne sont pas cochés"}>
                      {s.id === 5 ? "✓ Valider le retour à la compétition" : `Passer à l'étape ${s.id + 1}`}
                    </button>
                    {s.id > 1 && (
                      <button type="button" className="pt-btn" disabled={saving} onClick={() => setStage(s.id - 1)}>
                        ← Revenir à l'étape {s.id - 1}
                      </button>
                    )}
                    {!s.complete && <span style={{ fontSize: 12, color: "#d9a441", alignSelf: "center" }}>Critères incomplets : à toi de juger.</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {state.cleared && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
          <span style={{ fontSize: 13, color: GREEN, fontWeight: 700 }}>✓ Retour à la compétition validé</span>
          <button type="button" className="pt-btn" disabled={saving} onClick={() => setStage(5)}>
            Rouvrir le suivi
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6f6a62", marginTop: 10 }}>
        Trame générale de réathlétisation : elle ne remplace pas l'avis du médecin ou du kiné, qui décident du retour.
      </div>
    </div>
  );
}

export function RelStrengthCard({ data }) {
  const noteColor = (n) => (n == null ? MUTED : n >= 15 ? GREEN : n >= 10 ? "#d9a441" : RED);
  return (
    <div style={CARD}>
      <h3 style={{ ...H3, marginBottom: 4 }}>🏋️ Force relative & position par rapport aux normes</h3>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
        RM ÷ poids de corps{data.bw ? ` (${fr(data.bw)} kg)` : ""}
        {data.hasNorms ? ", et note /20 du barème de son poste et de son niveau." : "."}
      </div>
      {!data.rows.length ? (
        <div style={{ fontSize: 13, color: MUTED }}>Aucun RM enregistré sur les mouvements de référence (squat, développé couché, développé militaire, RDL, hip thrust, trap bar, tirage planche, traction).</div>
      ) : (
        <>
          {!data.bw && <div style={{ fontSize: 12.5, color: "#d9a441", marginBottom: 8 }}>Poids de corps non renseigné : la force relative ne peut pas être calculée.</div>}
          {data.rows.map((r) => (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{r.label}</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>
                  {fr(r.kg)} kg{r.next ? ` · prochain palier ${fr(r.next)} kg` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: AMBER }}>{r.ratio != null ? `× ${fr(r.ratio.toFixed(2))}` : "—"}</div>
                <div style={{ fontSize: 10.5, color: MUTED }}>poids de corps</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 54 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: noteColor(r.note) }}>{r.note != null ? `${fr(r.note)}` : "—"}</div>
                <div style={{ fontSize: 10.5, color: MUTED }}>{r.note != null ? "/20" : "pas de barème"}</div>
              </div>
            </div>
          ))}
          {data.weakest && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#d8cfbd", background: "#0d0c0a", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", lineHeight: 1.45 }}>
              Point faible : <b style={{ color: TEXT }}>{data.weakest.label}</b> ({fr(data.weakest.note)}/20)
              {data.strongest ? (
                <>
                  {" "}
                  · point fort : <b style={{ color: TEXT }}>{data.strongest.label}</b> ({fr(data.strongest.note)}/20)
                </>
              ) : null}
              . Priorité de travail à donner au point faible si l'écart dépasse 3 points.
            </div>
          )}
          {!data.hasNorms && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Pas de barème pour cet athlète (sport, poste ou niveau non renseigné dans son profil) : seule la force relative est affichée.</div>}
        </>
      )}
    </div>
  );
}
