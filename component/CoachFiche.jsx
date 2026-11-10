import React, { useState } from "react";
import { SYNTH_LEVELS, RTP_N, RTP_PHASES, RTP_TESTS, normalizeRtp } from "./coachSynthesis";
import { fmtDateFr, InjuryForm, injuryRecurrences } from "./InjuryHistory";

/* =====================================================================
   CoachFiche.jsx — cartes de la fiche athlète (vue coach), affichage seulement.
   Les calculs sont dans coachSynthesis.js ; les seuils dans ⚙️ Paramètres.
     • SynthesisBanner  : un feu par pôle + la décision proposée
     • WeekLoadCard     : charge prévue / réalisée par semaine + dynamique (variation, monotonie, contrainte)
     • RtpCard / RtpAthleteCard / RtpContinuum / ZonePainStrip : retour au jeu (continuum, douleur de la zone, critères)
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

export function SynthesisBanner({ synth, onGo, athlete = false }) {
  if (!synth) return null;
  return (
    <div style={{ ...CARD, border: `1px solid ${AMBER}66`, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={H3}>{athlete ? "🚦 Ma synthèse du jour" : "🚦 Synthèse du jour"}</h3>
        <span style={{ fontSize: 11.5, color: MUTED }}>{athlete ? "Calculée avec tes séances, ton wellness et tes douleurs du jour" : "Proposition calculée : la décision reste la tienne"}</span>
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
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: AMBER, marginBottom: 3 }}>{athlete ? "Pour aujourd'hui" : "Décision proposée"}</div>
        <div style={{ fontSize: 14.5, color: TEXT, lineHeight: 1.45, fontWeight: 600 }}>{athlete ? synth.advice : synth.decision}</div>
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

export function WeekLoadCard({ weeks, dyn, thresholds, athlete = false }) {
  const th = thresholds || {};
  const max = Math.max(1, ...weeks.map((w) => (athlete ? w.doneLoad : Math.max(w.plannedLoad, w.doneLoad))));
  const any = weeks.some((w) => w.plannedSessions > 0 || w.doneSessions > 0);
  const jumpCol = dyn.changePct == null ? MUTED : dyn.resumed ? (dyn.changePct >= th.jumpWatch ? "#d9a441" : GREEN) : dyn.changePct >= th.jumpAlert ? RED : dyn.changePct >= th.jumpWatch ? "#d9a441" : dyn.changePct <= -th.dropUnder ? BLUE : GREEN;
  const monoCol = dyn.monotony == null ? MUTED : dyn.monotony >= th.monoHigh ? RED : dyn.monotony >= 1.5 ? "#d9a441" : GREEN;
  const pctCol = (p) => (p == null ? MUTED : p < th.complianceLow ? "#d9a441" : p > 130 ? RED : GREEN);
  return (
    <div style={CARD}>
      <h3 style={{ ...H3, marginBottom: 4 }}>{athlete ? "📅 Ma charge, semaine par semaine" : "📅 Charge de la semaine : prévu / réalisé"}</h3>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
        {athlete
          ? "Charge = ta note de séance × la durée (en UA). Séances faites sur séances prévues."
          : "Prévu = RPE prévu × durée prévue des séances de la semaine. Réalisé = note de séance × durée réelle (sRPE). En UA."}
      </div>
      {dyn.resumed && (
        <div style={{ fontSize: 12.5, color: "#d8cfbd", background: "rgba(91,155,213,0.1)", border: `1px solid ${BLUE}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 12, lineHeight: 1.45 }}>
          🔄 Reprise après {dyn.restDays != null ? `${dyn.restDays} jours sans séance` : "une coupure"} : la hausse de charge vient de la reprise, pas d'une fatigue accumulée. La comparaison se fait avec {athlete ? "ta" : "sa"} semaine habituelle, hors coupure.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 8, marginBottom: 14 }}>
        <Stat
          label="7 derniers jours"
          value={dyn.changePct == null ? "—" : `${dyn.changePct > 0 ? "+" : ""}${dyn.changePct} %`}
          color={jumpCol}
          sub={dyn.changePct == null ? "pas assez d'historique" : `${dyn.last7} UA · ${dyn.prev7} d'habitude${dyn.resumed ? " · reprise" : ""}`}
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
                {!athlete && (
                  <div title={`Prévu : ${w.plannedLoad} UA`} style={{ height: 7, borderRadius: 4, background: "#1a1815", marginBottom: 3 }}>
                    <div style={{ width: `${(w.plannedLoad / max) * 100}%`, height: "100%", borderRadius: 4, background: "#6f6a62" }} />
                  </div>
                )}
                <div title={`Réalisé : ${w.doneLoad} UA`} style={{ height: 7, borderRadius: 4, background: "#1a1815" }}>
                  <div style={{ width: `${(w.doneLoad / max) * 100}%`, height: "100%", borderRadius: 4, background: AMBER }} />
                </div>
              </div>
              <div role="cell" style={{ textAlign: "right", fontSize: 12, color: MUTED, whiteSpace: "nowrap", lineHeight: 1.3 }}>
                <b style={{ color: TEXT }}>{w.doneLoad}</b>
                {athlete ? " UA" : ` / ${w.plannedLoad || "—"}`}
                {athlete ? (
                  <span style={{ display: "block", fontWeight: 800, color: pctCol(w.sessionPct) }}>{w.sessionPct == null ? "—" : `${w.sessionPct} % des séances`}</span>
                ) : (
                  <span style={{ display: "block", fontWeight: 800, color: pctCol(w.loadPct) }}>{w.loadPct == null ? "—" : `${w.loadPct} %`}</span>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: MUTED, marginTop: 8 }}>
            {!athlete && (
              <span>
                <span style={{ display: "inline-block", width: 14, height: 6, borderRadius: 3, background: "#6f6a62", marginRight: 5 }} />
                Prévu
              </span>
            )}
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

/* =====================================================================
   Retour au jeu : frise du continuum, courbe de douleur de la zone, cartes coach / athlète.
   Données et règles : coachSynthesis.js (rtpState, zonePainHistory, painMonitor).
   ===================================================================== */
const TISSUE_NAME = { muscle: "muscle", tendon: "tendon", ligament: "ligament", os: "os / articulation", autre: "autre" };
const MON_COLOR = { ok: GREEN, watch: "#d9a441", alert: RED, nodata: MUTED };

/* Frise : 6 étapes regroupées en phases (Ardern 2016), position actuelle, jours passés dans chaque étape */
export function RtpContinuum({ state, injury, status, you = false, details = true }) {
  const n = RTP_N;
  const cur = state.cleared ? null : state.stages[state.stage - 1];
  const inStage = cur ? cur.criteria.filter((c) => c.ok).length / cur.criteria.length : 0;
  // position : centre de l'étape 1 = 0 %, centre de la dernière = 100 % ; on avance dans l'étape avec les critères remplis
  const pos = state.cleared ? 100 : Math.min(100, ((state.stage - 1 + inStage * 0.85) / (n - 1)) * 100);
  const col = (100 / n).toFixed(4);
  return (
    <div style={{ margin: "8px 0 14px" }}>
      {/* bandes de phase */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 3, marginBottom: 6 }}>
        {RTP_PHASES.map((ph) => {
          const on = !state.cleared && state.stage >= ph.from && state.stage <= ph.to;
          const done = state.cleared || state.stage > ph.to;
          return (
            <div
              key={ph.id}
              style={{
                gridColumn: `${ph.from} / ${ph.to + 1}`,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                textAlign: "center",
                padding: "3px 4px",
                borderRadius: 6,
                color: on ? "#12100c" : done ? ph.color : MUTED,
                background: on ? ph.color : `${ph.color}${done ? "22" : "10"}`,
                border: `1px solid ${ph.color}${on ? "" : "44"}`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={ph.label}
            >
              {ph.short}
            </div>
          );
        })}
      </div>
      <div style={{ position: "relative", padding: "30px 0 0" }}>
        <div style={{ position: "absolute", left: `${col / 2}%`, right: `${col / 2}%`, top: 48, height: 6, borderRadius: 3, background: "#2a2620" }}>
          <div style={{ width: `${pos}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${RED}, #d9a441 45%, ${GREEN})`, transition: "width 0.4s ease" }} />
          {!state.cleared && (
            <div style={{ position: "absolute", left: `${pos}%`, top: -34, transform: "translateX(-50%)", fontSize: 10.5, fontWeight: 800, color: "#12100c", background: AMBER, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
              {you ? "Tu es ici" : "Ici"}
              <span style={{ position: "absolute", left: "50%", bottom: -4, width: 8, height: 8, background: AMBER, transform: "translateX(-50%) rotate(45deg)" }} />
            </div>
          )}
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {state.stages.map((s) => {
            const done = state.cleared || s.id < state.stage;
            const here = !state.cleared && s.id === state.stage;
            const d = state.daysIn(s.id);
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                    background: done ? GREEN : here ? "#2a2010" : "#151310",
                    border: `2px solid ${done ? GREEN : here ? AMBER : "#3a342a"}`,
                    boxShadow: here ? `0 0 0 4px ${AMBER}33` : "none",
                    filter: done || here ? "none" : "grayscale(1) opacity(0.55)",
                  }}
                >
                  {done ? <span style={{ color: "#12100c", fontWeight: 900, fontSize: 15 }}>✓</span> : s.icon}
                </div>
                <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: here ? 800 : 600, color: here ? AMBER : done ? "#c9c1b5" : MUTED, textAlign: "center", lineHeight: 1.2, overflowWrap: "anywhere" }}>{s.short}</div>
                <div style={{ fontSize: 10, color: here ? AMBER : MUTED, minHeight: 13 }}>{(done || here) && d != null ? `${d} j` : ""}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: MUTED, marginTop: 6 }}>
        <span>
          Blessure : {fmtDateFr(injury.date, { day: "numeric", month: "short" })}
          {state.sinceInjury != null ? ` (J+${state.sinceInjury})` : ""}
          {state.tissue ? ` · ${TISSUE_NAME[state.tissue] || state.tissue}` : ""}
        </span>
        {!state.cleared && <span style={{ color: state.phase.color, fontWeight: 700 }}>{state.phase.label}</span>}
        {status?.back && <span>Retour estimé : {fmtDateFr(status.back, { day: "numeric", month: "short" })}</span>}
      </div>
      {details && cur && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
            {cur.icon} Étape {cur.id}/{n} · {cur.label}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{cur.goal}</div>
          <div style={{ fontSize: 12, color: "#c9c1b5", marginTop: 4 }}>
            <b style={{ color: MUTED }}>Au programme :</b> {cur.content}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.3, textTransform: "uppercase", marginTop: 8 }}>
            {cur.complete ? "Critères remplis" : `Pour passer à la suite (${cur.criteria.filter((c) => c.ok).length}/${cur.criteria.length})`}
          </div>
          {cur.criteria.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: c.ok ? "#c9c1b5" : TEXT, marginTop: 4 }}>
              <span style={{ color: c.ok ? GREEN : "#6f6a62", fontWeight: 900, flexShrink: 0 }}>{c.ok ? "✓" : "○"}</span>
              <span>
                <span style={{ textDecoration: c.ok ? "line-through" : "none", textDecorationColor: "#6f6a62" }}>{c.t}</span>
                {c.note && <span style={{ display: "block", fontSize: 11.5, color: MUTED }}>{c.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Douleur de la zone blessée jour par jour (schéma corporel du wellness) + lecture « surveillance de la douleur » */
export function ZonePainStrip({ history, monitor }) {
  if (!history || !history.length) return null;
  const any = history.some((p) => p.v != null);
  return (
    <div style={{ margin: "4px 0 12px", padding: "10px 12px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.3, textTransform: "uppercase" }}>Douleur de la zone, jour par jour</span>
        <span style={{ fontSize: 11, color: MUTED }}>repère : ≤ 5/10 pendant l'effort</span>
      </div>
      {any ? (
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: 54 }} role="img" aria-label="Douleur de la zone blessée par jour">
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(5 / 10) * 54}px`, borderTop: `1px dashed ${RED}88` }} />
          {history.map((p) => (
            <div key={p.date} title={`${fmtDateFr(p.date, { day: "numeric", month: "short" })} : ${p.v == null ? "pas de wellness" : `${p.v}/10`}`} style={{ flex: 1, minWidth: 3, display: "flex", alignItems: "flex-end", height: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: p.v == null ? 2 : Math.max(3, (p.v / 10) * 54),
                  borderRadius: 2,
                  background: p.v == null ? "#2a2620" : p.v > 5 ? RED : p.v > 2 ? "#d9a441" : GREEN,
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ fontSize: 12.5, color: MON_COLOR[monitor.level] || MUTED, marginTop: 6, lineHeight: 1.4 }}>{monitor.text}</div>
    </div>
  );
}

/* Carte de l'athlète (lecture seule) : où j'en suis dans mon retour */
export function RtpAthleteCard({ injury, status, state, pain, painHistory, monitor, inGroup }) {
  if (!injury) return null;
  return (
    <div style={{ ...CARD, border: `1px solid ${RED}66` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <h3 style={H3}>🏥 Mon retour au jeu : {injury.name || injury.zone || "blessure"}</h3>
        <span style={{ fontSize: 12, fontWeight: 800, color: state.cleared ? GREEN : AMBER, border: `1px solid ${state.cleared ? GREEN : AMBER}66`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>
          {state.cleared ? "✓ Performance retrouvée" : `Étape ${state.stage}/${RTP_N}`}
        </span>
      </div>
      <RtpContinuum state={state} injury={injury} status={status} you />
      {inGroup && (
        <div style={{ fontSize: 12.5, color: "#d8cfbd", background: "rgba(217,105,90,0.08)", border: `1px solid ${RED}44`, borderRadius: 10, padding: "8px 11px", marginBottom: 12, lineHeight: 1.45 }}>
          🏥 Tu es dans le groupe « Blessés » : ton calendrier et ta planification affichent tes séances de réathlé à la place de
          celles de ton équipe. Tu retrouves ton groupe dès que tu reprends l'entraînement collectif (étape 5).
        </div>
      )}
      {painHistory && <ZonePainStrip history={painHistory} monitor={monitor} />}
      {pain?.onInjury && (
        <div style={{ fontSize: 13, color: "#f0d9ae", background: "rgba(217,105,90,0.12)", border: `1px solid ${RED}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 8, lineHeight: 1.45 }}>
          ⚠️ Tu as noté une douleur de {pain.onInjury.v}/10 sur cette zone aujourd'hui : signale-la à ton coach avant de faire ta séance.
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "#6f6a62" }}>
        {state.started ? "C'est ton coach qui valide chaque étape, avec le médecin ou le kiné." : "Ton coach n'a pas encore démarré le suivi : tu es placé à la première étape par défaut."} On avance sur des
        critères, pas sur un délai. Remplis ton wellness chaque jour en indiquant la douleur sur le schéma : elle sert à valider les étapes.
      </div>
    </div>
  );
}

/* Carte du coach : frise + douleur de la zone + validation des critères étape par étape */
export function RtpCard({ injury, status, state, onSave, saving, pain, painHistory, monitor, injuredGroup, onSaveTests, injuries }) {
  const [open, setOpen] = useState(state.cleared ? 0 : state.stage);
  const [testsOpen, setTestsOpen] = useState(false);
  const rec = injuries ? injuryRecurrences(injuries)[injury?.id] : null;
  if (!injury) return null;
  const checks = normalizeRtp(injury.rtp)?.checks || {};
  const toggle = (id) => onSave({ stage: state.stage, checks: { ...checks, [id]: !checks[id] } });
  const setStage = (n) => {
    onSave({ stage: n, checks });
    setOpen(n > RTP_N ? 0 : n);
  };
  const name = injury.name || injury.zone || "Blessure";
  return (
    <div style={{ ...CARD, border: `1px solid ${RED}66` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h3 style={H3}>🏥 Retour au jeu : {name}</h3>
        <span style={{ fontSize: 12, fontWeight: 800, color: state.cleared ? GREEN : status?.color || AMBER, border: `1px solid ${state.cleared ? GREEN : status?.color || AMBER}66`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>
          {state.cleared ? "✓ Performance retrouvée" : `Étape ${state.stage}/${RTP_N}`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: MUTED }}>On passe à l'étape suivante quand les critères sont remplis, pas quand le délai est écoulé.</div>
      {rec && (
        <div style={{ fontSize: 12.5, color: rec.kind === "early" ? "#f0c2b8" : "#f0d9ae", marginTop: 6, lineHeight: 1.45 }}>
          ↻ <b>{rec.label}</b> : même zone que « {rec.prevName} », {rec.days} jours après le retour. Le risque de rechute est plus élevé : ne pas
          brûler d'étape, valider les tests de force avant le terrain.
        </div>
      )}
      {injuredGroup && (
        <div style={{ fontSize: 12, color: "#c9c1b5", marginTop: 6 }}>
          {state.stage < 5 && !state.cleared
            ? "🏥 Dans le groupe « Blessés » : il voit ses séances réathlé et sa planification dédiée. Il retrouve son groupe à l'étape 5 (entraînement collectif)."
            : "Il a retrouvé les séances de son groupe (étape 5 atteinte)."}
        </div>
      )}
      <RtpContinuum state={state} injury={injury} status={status} details={false} />
      {painHistory && <ZonePainStrip history={painHistory} monitor={monitor} />}
      {pain?.onInjury && (
        <div style={{ fontSize: 13, color: "#f0d9ae", background: "rgba(217,105,90,0.12)", border: `1px solid ${RED}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 12, lineHeight: 1.45 }}>
          ⚠️ Douleur de {pain.onInjury.v}/10 déclarée aujourd'hui sur la zone ({pain.onInjury.label}) : ne pas valider l'étape suivante tant qu'elle persiste.
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>Valider les critères</div>
      {state.stages.map((s) => {
        const isCur = !state.cleared && s.id === state.stage;
        const isDone = state.cleared || s.id < state.stage;
        const isOpen = open === s.id;
        const d = state.daysIn(s.id);
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
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: isCur ? TEXT : isDone ? "#c9c1b5" : MUTED }}>
                  {s.label}
                  {(isDone || isCur) && d != null ? <span style={{ fontWeight: 600, color: MUTED }}> · {d} j</span> : null}
                </span>
                {isCur && <span style={{ display: "block", fontSize: 12, color: MUTED }}>{s.goal}</span>}
              </span>
              <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                {s.criteria.filter((c) => c.ok).length}/{s.criteria.length} {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div style={{ margin: "8px 0 4px 34px" }}>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                  <b>Au programme :</b> {s.content}
                </div>
                {s.criteria.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: c.ok ? TEXT : "#c9c1b5", cursor: c.auto || isDone ? "default" : "pointer" }}>
                    <input type="checkbox" checked={!!c.ok} disabled={c.auto || isDone || saving} onChange={() => toggle(c.id)} style={{ marginTop: 2, accentColor: GREEN, width: 16, height: 16, flexShrink: 0 }} />
                    <span>
                      {c.t}
                      {c.note && <span style={{ display: "block", fontSize: 11.5, color: c.ok ? GREEN : MUTED }}>Calculé : {c.note}</span>}
                    </span>
                  </label>
                ))}
                {isCur && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button type="button" className={s.complete ? "pt-btn pt-btn--primary" : "pt-btn"} disabled={saving} onClick={() => setStage(s.id + 1)} title={s.complete ? "" : "Tous les critères ne sont pas cochés"}>
                      {s.id === RTP_N ? "✓ Performance retrouvée : clôturer" : `Passer à l'étape ${s.id + 1}`}
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
      {onSaveTests && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: "8px 0" }}>
          <button
            type="button"
            onClick={() => setTestsOpen((x) => !x)}
            aria-expanded={testsOpen}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: TEXT, textAlign: "left" }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>📏 Tests de retour (LSI)</span>
            <span style={{ fontSize: 12, color: MUTED }}>
              {Object.keys(state.tests || {}).length} saisi{Object.keys(state.tests || {}).length > 1 ? "s" : ""} {testsOpen ? "▾" : "▸"}
            </span>
          </button>
          {testsOpen && <RtpTestsForm tests={state.tests} saving={saving} onSave={onSaveTests} />}
        </div>
      )}
      {state.cleared && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
          <span style={{ fontSize: 13, color: GREEN, fontWeight: 700 }}>✓ Retour à la performance validé</span>
          <button type="button" className="pt-btn" disabled={saving} onClick={() => setStage(RTP_N)}>
            Rouvrir le suivi
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6f6a62", marginTop: 10 }}>
        Trame de réathlétisation (Ardern 2016, Taberner 2019, Silbernagel 2007) : elle ne remplace pas l'avis du médecin ou du kiné, qui décident du retour.
      </div>
    </div>
  );
}

/* Tests de retour (LSI) : blessé / référence → % ; enregistrés sur la blessure (rtp.tests), cochent les critères */
export function RtpTestsForm({ tests = {}, onSave, saving, compact = false }) {
  const init = () => Object.fromEntries(RTP_TESTS.map((t) => [t.id, { inj: tests[t.id]?.inj ?? "", ref: tests[t.id]?.ref ?? "" }]));
  const [v, setV] = useState(init);
  const [msg, setMsg] = useState("");
  const num = (x) => {
    const n = parseFloat(String(x).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const changed = RTP_TESTS.filter((t) => {
    const a = num(v[t.id].inj);
    const b = num(v[t.id].ref);
    return a && b && (a !== Number(tests[t.id]?.inj) || b !== Number(tests[t.id]?.ref));
  });
  const save = async () => {
    const today = new Date();
    const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const patch = Object.fromEntries(changed.map((t) => [t.id, { inj: num(v[t.id].inj), ref: num(v[t.id].ref), date: d }]));
    try {
      await onSave(patch);
      setMsg("✓ Tests enregistrés");
    } catch (e) {
      setMsg("❌ " + e.message);
    }
  };
  const inp = { width: "100%", boxSizing: "border-box", padding: "8px 9px", borderRadius: 8, border: "1px solid #3a342a", background: "#0d0c0a", color: TEXT, fontSize: 14 };
  return (
    <div style={{ marginTop: compact ? 0 : 6 }}>
      {!compact && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>LSI = côté blessé ÷ côté sain (ou actuel ÷ avant blessure). Les critères de force, sauts, équilibre et vitesse se cochent tout seuls.</div>}
      {RTP_TESTS.map((t) => {
        const a = num(v[t.id].inj);
        const b = num(v[t.id].ref);
        const lsi = a && b ? Math.round((a / b) * 100) : null;
        const col = lsi == null ? MUTED : lsi >= 90 ? GREEN : lsi >= 80 ? "#d9a441" : RED;
        return (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(64px, 0.7fr) minmax(64px, 0.7fr) 52px", gap: 8, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{t.label}</div>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.3 }}>{t.hint}</div>
            </div>
            <input aria-label={`${t.label} : côté blessé ou actuel`} inputMode="decimal" placeholder="blessé" value={v[t.id].inj} onChange={(e) => setV((p) => ({ ...p, [t.id]: { ...p[t.id], inj: e.target.value } }))} style={inp} />
            <input aria-label={`${t.label} : côté sain ou avant blessure`} inputMode="decimal" placeholder="sain" value={v[t.id].ref} onChange={(e) => setV((p) => ({ ...p, [t.id]: { ...p[t.id], ref: e.target.value } }))} style={inp} />
            <div style={{ textAlign: "right", fontSize: 15, fontWeight: 800, color: col }}>{lsi == null ? "—" : `${lsi} %`}</div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className="pt-btn pt-btn--primary" disabled={!changed.length || saving} onClick={save}>
          Enregistrer les tests
        </button>
        {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("✓") ? GREEN : RED }}>{msg}</span>}
      </div>
    </div>
  );
}

/* Douleur forte sans blessure enregistrée : proposer de la déclarer (formulaire prérempli) */
const TYPE_TISSUE = { aigue: "muscle", brulure: "muscle", contracture: "muscle", courbature: "muscle", articulaire: "ligament", nerveuse: "autre" };
export function DeclareInjuryCard({ pain, onSave, you = false }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  if (!pain || !pain.top) return null;
  const top = pain.top;
  const today = new Date();
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const initial = { name: "", date: d, zone: top.label, tissueType: TYPE_TISSUE[top.type] || "muscle", mechanism: "autre", notes: `Douleur ${top.v}/10${pain.typeLabel ? ` (${pain.typeLabel})` : ""} déclarée dans le wellness du ${d.split("-").reverse().join("/")}.` };
  return (
    <div style={{ ...CARD, border: `1px solid ${RED}88`, background: "rgba(217,105,90,0.07)" }}>
      <h3 style={{ ...H3, marginBottom: 4 }}>🚑 {you ? "Déclarer une blessure ?" : "Douleur forte sans blessure enregistrée"}</h3>
      <div style={{ fontSize: 13, color: "#d8cfbd", lineHeight: 1.45, marginBottom: 10 }}>
        {top.label} : {top.v}/10{pain.typeLabel ? ` (${pain.typeLabel})` : ""} aujourd'hui.{" "}
        {you
          ? "Si c'est une blessure (et pas une simple courbature), déclare-la : ton coach pourra suivre ton retour et adapter tes séances."
          : "Si c'est une blessure, l'enregistrer lance le suivi du retour au jeu et le passage dans le groupe Blessés."}
      </div>
      {!open ? (
        <button type="button" className="pt-btn pt-btn--danger" onClick={() => setOpen(true)}>
          {you ? "Déclarer une blessure" : "Enregistrer une blessure"}
        </button>
      ) : (
        <InjuryForm
          initial={initial}
          saving={saving}
          message={message}
          onCancel={() => setOpen(false)}
          onSave={async (payload) => {
            setSaving(true);
            setMessage("");
            try {
              await onSave(payload);
              setOpen(false);
            } catch (e) {
              setMessage("❌ " + e.message);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
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
