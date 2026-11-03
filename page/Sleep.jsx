import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceArea, ReferenceLine } from "recharts";
import { db } from "../firebase";
import { Page, PageHeader, Kpi, KpiGrid, FoldCard, useFold, CARD_STYLE, FIELD_STYLE, SectionLabel, TEXT, MUTED, ACCENT } from "../component/ui";
import PersonPicker from "../component/PersonPicker";
import usePersonScope from "../component/usePersonScope";
import { appConfirm, appAlert as alert } from "../component/appDialog";
import { todayISO, shiftISO } from "../component/nutritionData";
import {
  CYCLE,
  toMin,
  fmtClock,
  fmtDur,
  bedtimesFor,
  wakeTimesFor,
  nightStats,
  aroundMidnight,
  sleepSummary,
  regularityLabel,
  eveningRoutine,
  SLEEP_TAGS,
  bestCyclesFor,
  advisedBedtime,
} from "../component/sleepCalc";

/* =====================================================================
   Sleep.jsx — sommeil : calculateur de cycles, journal des nuits, analyse
   (durée, régularité, dette, facteurs), routine du soir et conseils.
   Firestore : users/{uid}/sleep/_settings (réveil habituel, besoin, endormissement)
               users/{uid}/sleep/AAAA-MM-JJ (nuit qui se termine ce jour-là)
   ===================================================================== */

const GREEN = "#4fae7d";
const RED = "#d9695a";
const NIGHT = "#7b8fd9";
const BORDER = "#2a2620";
const chip = (on, color = ACCENT) => ({
  padding: "7px 13px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  border: `1px solid ${on ? color : BORDER}`,
  background: on ? `${color}26` : "#0d0c0a",
  color: on ? TEXT : MUTED,
  whiteSpace: "nowrap",
});
const lbl = { display: "block", fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 };
const QUAL = ["", "😫", "😕", "😐", "🙂", "😴"];
const QUAL_TXT = ["", "Très mauvaise", "Mauvaise", "Moyenne", "Bonne", "Excellente"];
const frDay = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
};

/* Frise des cycles : endormissement + n cycles de 90 min jusqu'au réveil */
function CycleBar({ cycles, latency, highlight }) {
  const total = latency + cycles * CYCLE;
  return (
    <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", border: `1px solid ${highlight ? NIGHT : BORDER}` }}>
      <div style={{ width: `${(latency / total) * 100}%`, background: "#2a2620" }} title="Endormissement" />
      {Array.from({ length: cycles }, (_, i) => (
        <div key={i} style={{ width: `${(CYCLE / total) * 100}%`, background: i % 2 ? "#5d6fb8" : NIGHT, borderLeft: i ? "1px solid #0d0c0a" : "none" }} />
      ))}
    </div>
  );
}

export default function Sleep() {
  const navigate = useNavigate();
  const ps = usePersonScope();
  const uid = ps.uid;
  const fold = useFold("sleep");
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "calcul");
  const [settings, setSettings] = useState({ wake: "07:00", needH: 8.5, latency: 15 });
  const [nights, setNights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calcMode, setCalcMode] = useState("wake"); // wake = je dois me lever à… ; bed = je me couche à…
  const [calcBed, setCalcBed] = useState(() => fmtClock(new Date().getHours() * 60 + new Date().getMinutes()));
  const [form, setForm] = useState(null);
  const [range, setRange] = useState(14);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", uid, "sleep"));
        if (!alive) return;
        const st = snap.docs.find((d) => d.id === "_settings");
        if (st) setSettings((s) => ({ ...s, ...st.data() }));
        else setSettings({ wake: "07:00", needH: 8.5, latency: 15 });
        setNights(
          snap.docs
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
            .map((d) => ({ date: d.id, ...d.data() }))
            .sort((a, b) => a.date.localeCompare(b.date))
        );
      } catch (e) {
        console.error("Sommeil : chargement", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  const saveSettings = async (next) => {
    setSettings(next);
    try {
      await setDoc(doc(db, "users", uid, "sleep", "_settings"), next);
    } catch (e) {
      alert("Erreur d'enregistrement : " + e.message);
    }
  };
  const newForm = (date = todayISO()) => {
    const ex = nights.find((n) => n.date === date);
    const bt = advisedBedtime(settings.wake, Number(settings.needH) || 8.5, Number(settings.latency) || 15);
    return ex ? { ...ex, tags: ex.tags || [] } : { date, bed: bt?.bed || "23:00", wake: settings.wake || "07:00", latency: settings.latency || 15, awake: 0, quality: 0, nap: 0, tags: [], notes: "" };
  };
  const saveNight = async () => {
    if (!form || toMin(form.bed) == null || toMin(form.wake) == null) return alert("Heures de coucher et de réveil au format HH:MM.");
    const { date, ...data } = form;
    const clean = { ...data, latency: Number(data.latency) || 0, awake: Number(data.awake) || 0, nap: Number(data.nap) || 0, quality: Number(data.quality) || 0, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, "users", uid, "sleep", date), clean);
      setNights((prev) => [...prev.filter((n) => n.date !== date), { date, ...clean }].sort((a, b) => a.date.localeCompare(b.date)));
      setForm(null);
    } catch (e) {
      alert("Erreur d'enregistrement : " + e.message);
    }
  };
  const removeNight = async (date) => {
    if (!(await appConfirm("Supprimer cette nuit du journal ?"))) return;
    try {
      await deleteDoc(doc(db, "users", uid, "sleep", date));
      setNights((prev) => prev.filter((n) => n.date !== date));
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const needMin = (Number(settings.needH) || 8.5) * 60;
  const recent = useMemo(() => nights.filter((n) => n.date > shiftISO(todayISO(), -range)), [nights, range]);
  const sum = useMemo(() => sleepSummary(recent, Number(settings.needH) || 8.5), [recent, settings.needH]);
  const last = nights.length ? nights[nights.length - 1] : null;
  const lastS = last ? nightStats(last) : null;
  const target = advisedBedtime(settings.wake, Number(settings.needH) || 8.5, Number(settings.latency) || 15);
  const chartData = useMemo(() => {
    const out = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = shiftISO(todayISO(), -i);
      const n = nights.find((x) => x.date === d);
      const s = n ? nightStats(n) : null;
      // horaires : minutes depuis 18:00 (coucher en haut, réveil en bas)
      const off = (m) => (m - 18 * 60 + 1440) % 1440;
      out.push({
        date: d,
        label: d.slice(8, 10) + "/" + d.slice(5, 7),
        h: s ? Math.round((s.sleep / 60) * 10) / 10 : 0,
        range: s ? [off(s.bedMin), off(s.bedMin) + s.inBed] : null,
        q: n?.quality || 0,
      });
    }
    return out;
  }, [nights, range]);

  /* facteurs : qualité moyenne avec / sans chaque étiquette */
  const factors = useMemo(() => {
    const rated = recent.filter((n) => Number(n.quality) > 0);
    return SLEEP_TAGS.map((t) => {
      const w = rated.filter((n) => (n.tags || []).includes(t.id));
      const wo = rated.filter((n) => !(n.tags || []).includes(t.id));
      const avg = (a) => (a.length ? a.reduce((s, n) => s + Number(n.quality), 0) / a.length : null);
      const dur = (a) => (a.length ? a.reduce((s, n) => s + (nightStats(n)?.sleep || 0), 0) / a.length : null);
      return { ...t, n: w.length, q: avg(w), q0: avg(wo), d: dur(w), d0: dur(wo) };
    }).filter((f) => f.n > 0 && f.q0 != null);
  }, [recent]);

  const tabs = [
    ["calcul", "🧮 Calculateur"],
    ["journal", "📓 Journal"],
    ["analyse", "📊 Analyse"],
    ["routine", "🌙 Routine & conseils"],
  ];

  return (
    <Page>
      <PageHeader
        title="😴 Sommeil"
        subtitle={ps.isSelf ? "Cycles, horaires idéaux, suivi des nuits et habitudes" : `Sommeil de ${ps.person?.firstName || ""} ${ps.person?.lastName || ""}`.trim()}
        actions={
          new URLSearchParams(window.location.search).get("from") === "dashboard" ? (
            <button className="pt-btn" onClick={() => navigate("/dashboard")}>
              ← Retour au dashboard
            </button>
          ) : null
        }
      />
      {ps.isAdminLike && (
        <PersonPicker
          mode={ps.mode}
          onMode={ps.setMode}
          athletes={ps.athletes}
          admins={ps.admins}
          groups={ps.groups}
          selectedId={ps.viewUid}
          onSelect={ps.setViewUid}
          showAdmins={ps.admins.length > 0}
          note={!ps.isSelf ? "tu vois et modifies son journal de sommeil." : null}
        />
      )}

      <KpiGrid min={150}>
        <Kpi
          icon="🌙"
          label="Dernière nuit"
          value={lastS ? fmtDur(lastS.sleep) : "—"}
          color={lastS ? (lastS.sleep >= needMin - 30 ? GREEN : lastS.sleep >= needMin - 90 ? ACCENT : RED) : MUTED}
          sub={last ? `${frDay(last.date)} · ${last.bed} → ${last.wake}` : "aucune nuit saisie"}
          onClick={() => {
            setTab("journal");
            setForm(newForm());
          }}
        />
        <Kpi icon="📊" label={`Moyenne ${range} j`} value={sum ? fmtDur(sum.avgSleep) : "—"} sub={`besoin ${fmtDur(needMin)}`} color={sum ? (sum.avgSleep >= needMin - 30 ? GREEN : ACCENT) : MUTED} />
        <Kpi icon="⏰" label="Régularité" value={sum ? regularityLabel(Math.max(sum.sdBed || 0, sum.sdWake || 0)).t : "—"} color={sum ? regularityLabel(Math.max(sum.sdBed || 0, sum.sdWake || 0)).c : MUTED} sub={sum?.sdBed != null ? `coucher ±${Math.round(sum.sdBed)} min` : "2 nuits minimum"} />
        <Kpi icon="💤" label="Dette (7 nuits)" value={sum ? fmtDur(sum.debt7) : "—"} color={sum ? (sum.debt7 <= 60 ? GREEN : sum.debt7 <= 240 ? ACCENT : RED) : MUTED} sub="sous le besoin" />
      </KpiGrid>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={chip(tab === k, NIGHT)}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: MUTED, padding: 20 }}>Chargement…</div>
      ) : (
        <>
          {/* ======================= CALCULATEUR ======================= */}
          {tab === "calcul" && (
            <>
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <button type="button" style={chip(calcMode === "wake", NIGHT)} onClick={() => setCalcMode("wake")}>
                    ⏰ Je dois me lever à…
                  </button>
                  <button type="button" style={chip(calcMode === "bed", NIGHT)} onClick={() => setCalcMode("bed")}>
                    🛏️ Je me couche à…
                  </button>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
                  {calcMode === "wake" ? (
                    <div>
                      <label style={lbl}>Heure de réveil</label>
                      <input type="time" value={settings.wake || "07:00"} onChange={(e) => e.target.value && saveSettings({ ...settings, wake: e.target.value })} style={{ ...FIELD_STYLE, width: 140, fontSize: 20, fontWeight: 800 }} />
                    </div>
                  ) : (
                    <div>
                      <label style={lbl}>Heure de coucher</label>
                      <input type="time" value={calcBed} onChange={(e) => e.target.value && setCalcBed(e.target.value)} style={{ ...FIELD_STYLE, width: 140, fontSize: 20, fontWeight: 800 }} />
                    </div>
                  )}
                  <div>
                    <label style={lbl}>Temps pour t'endormir</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[5, 10, 15, 20, 30].map((v) => (
                        <button key={v} type="button" style={{ ...chip(Number(settings.latency) === v, NIGHT), padding: "7px 10px" }} onClick={() => saveSettings({ ...settings, latency: v })}>
                          {v} min
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                {(() => {
                  const opts = calcMode === "wake" ? bedtimesFor(settings.wake, settings.latency) : wakeTimesFor(calcBed, settings.latency);
                  return opts.sort((a, b) => b.cycles - a.cycles);
                })().map((o) => {
                  const best = o.cycles === bestCyclesFor(Number(settings.needH) || 8.5);
                  const ok = o.sleepMin >= 7 * 60;
                  return (
                    <div key={o.cycles} style={{ ...CARD_STYLE, marginBottom: 0, border: `1px solid ${best ? NIGHT : BORDER}`, background: best ? "rgba(123,143,217,0.08)" : CARD_STYLE.background }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 30, fontWeight: 900, color: best ? NIGHT : TEXT, fontVariantNumeric: "tabular-nums" }}>{calcMode === "wake" ? o.bed : o.wake}</span>
                          <span style={{ fontSize: 13, color: MUTED }}>{calcMode === "wake" ? "au lit" : "réveil"}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, color: TEXT }}>
                            {o.cycles} cycles · {fmtDur(o.sleepMin)} de sommeil
                          </div>
                          <div style={{ fontSize: 12, color: best ? NIGHT : ok ? MUTED : RED, fontWeight: 700 }}>
                            {best ? `★ Couvre ton besoin (${fmtDur(needMin)})` : o.sleepMin > needMin + 60 ? "Long : utile après une grosse charge" : ok ? "Correct" : "Trop court si répété"}
                          </div>
                        </div>
                      </div>
                      <CycleBar cycles={o.cycles} latency={Number(settings.latency) || 15} highlight={best} />
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 16 }}>
                Un cycle dure ~90 min en moyenne (80 à 110 min selon les personnes). Se réveiller en fin de cycle évite d'être tiré du sommeil profond. La régularité
                compte autant que la durée : garde des horaires proches tous les jours, week-end compris.
              </div>
            </>
          )}

          {/* ======================= JOURNAL ======================= */}
          {tab === "journal" && (
            <>
              {!form ? (
                <button className="pt-btn pt-btn--primary" style={{ marginBottom: 14 }} onClick={() => setForm(newForm())}>
                  ＋ Noter ma nuit
                </button>
              ) : (
                <div style={{ ...CARD_STYLE, border: `1px solid ${NIGHT}88` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={lbl}>Nuit qui finit le</label>
                      <input type="date" value={form.date} max={todayISO()} onChange={(e) => e.target.value && setForm({ ...newForm(e.target.value) })} style={FIELD_STYLE} />
                    </div>
                    <div>
                      <label style={lbl}>Couché à</label>
                      <input type="time" value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })} style={FIELD_STYLE} />
                    </div>
                    <div>
                      <label style={lbl}>Réveillé à</label>
                      <input type="time" value={form.wake} onChange={(e) => setForm({ ...form, wake: e.target.value })} style={FIELD_STYLE} />
                    </div>
                    <div>
                      <label style={lbl}>Endormissement (min)</label>
                      <input type="number" min="0" value={form.latency} onChange={(e) => setForm({ ...form, latency: e.target.value })} style={FIELD_STYLE} />
                    </div>
                    <div>
                      <label style={lbl}>Éveillé la nuit (min)</label>
                      <input type="number" min="0" value={form.awake} onChange={(e) => setForm({ ...form, awake: e.target.value })} style={FIELD_STYLE} />
                    </div>
                    <div>
                      <label style={lbl}>Sieste la veille (min)</label>
                      <input type="number" min="0" value={form.nap} onChange={(e) => setForm({ ...form, nap: e.target.value })} style={FIELD_STYLE} />
                    </div>
                  </div>
                  {(() => {
                    const s = nightStats(form);
                    return s ? (
                      <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
                        → <b style={{ color: s.sleep >= needMin - 30 ? GREEN : ACCENT, fontSize: 15 }}>{fmtDur(s.sleep)}</b> de sommeil sur {fmtDur(s.inBed)} au lit · efficacité{" "}
                        <b style={{ color: s.eff >= 85 ? GREEN : ACCENT }}>{s.eff} %</b>
                      </div>
                    ) : null;
                  })()}
                  <label style={lbl}>Qualité ressentie</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {[1, 2, 3, 4, 5].map((q) => (
                      <button key={q} type="button" style={{ ...chip(Number(form.quality) === q, NIGHT), fontSize: 15 }} onClick={() => setForm({ ...form, quality: q })} title={QUAL_TXT[q]}>
                        {QUAL[q]} <span style={{ fontSize: 12 }}>{QUAL_TXT[q]}</span>
                      </button>
                    ))}
                  </div>
                  <label style={lbl}>La veille au soir…</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {SLEEP_TAGS.map((t) => {
                      const on = (form.tags || []).includes(t.id);
                      return (
                        <button key={t.id} type="button" style={chip(on, RED)} onClick={() => setForm({ ...form, tags: on ? form.tags.filter((x) => x !== t.id) : [...(form.tags || []), t.id] })}>
                          {t.icon} {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <label style={lbl}>Notes</label>
                  <textarea rows={2} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...FIELD_STYLE, resize: "vertical", marginBottom: 12 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="pt-btn pt-btn--primary" onClick={saveNight}>
                      💾 Enregistrer la nuit
                    </button>
                    <button className="pt-btn" onClick={() => setForm(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {!nights.length ? (
                <div style={{ ...CARD_STYLE, color: MUTED, fontSize: 13 }}>Aucune nuit notée. Une saisie chaque matin suffit (30 secondes).</div>
              ) : (
                nights
                  .slice()
                  .reverse()
                  .slice(0, 40)
                  .map((n) => {
                    const s = nightStats(n);
                    const pct = s ? Math.min(1, s.sleep / needMin) : 0;
                    const col = !s ? MUTED : s.sleep >= needMin - 30 ? GREEN : s.sleep >= needMin - 90 ? ACCENT : RED;
                    return (
                      <div key={n.date} style={{ ...CARD_STYLE, padding: "12px 14px", marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 12, color: MUTED, fontWeight: 700, textTransform: "capitalize" }}>{frDay(n.date)}</div>
                            <div style={{ fontSize: 15, color: TEXT, fontWeight: 700 }}>
                              {n.bed} → {n.wake}
                              {n.quality ? <span style={{ marginLeft: 8 }} title={QUAL_TXT[n.quality]}>{QUAL[n.quality]}</span> : null}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: col }}>{s ? fmtDur(s.sleep) : "—"}</div>
                            {s && <div style={{ fontSize: 11.5, color: MUTED }}>efficacité {s.eff} %</div>}
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "#0d0c0a", overflow: "hidden", margin: "8px 0" }}>
                          <div style={{ width: `${pct * 100}%`, height: "100%", background: col }} />
                        </div>
                        {((n.tags || []).length > 0 || n.notes || n.nap > 0) && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, color: MUTED }}>
                            {(n.tags || []).map((t) => {
                              const tg = SLEEP_TAGS.find((x) => x.id === t);
                              return tg ? (
                                <span key={t} style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${BORDER}` }}>
                                  {tg.icon} {tg.label}
                                </span>
                              ) : null;
                            })}
                            {n.nap > 0 && <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${BORDER}` }}>💤 sieste {n.nap} min</span>}
                            {n.notes && <span style={{ color: "#d8cfbd" }}>📝 {n.notes}</span>}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                          <button className="pt-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setForm({ ...n, tags: n.tags || [] })}>
                            ✏️ Modifier
                          </button>
                          <button className="pt-btn" style={{ padding: "4px 10px", fontSize: 12, color: RED }} onClick={() => removeNight(n.date)}>
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </>
          )}

          {/* ======================= ANALYSE ======================= */}
          {tab === "analyse" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[7, 14, 28].map((r) => (
                  <button key={r} type="button" style={chip(range === r, NIGHT)} onClick={() => setRange(r)}>
                    {r} jours
                  </button>
                ))}
              </div>
              {!sum ? (
                <div style={{ ...CARD_STYLE, color: MUTED, fontSize: 13 }}>Note quelques nuits dans le Journal pour voir l'analyse.</div>
              ) : (
                <>
                  <FoldCard id="dur" fold={fold} title="⏱️ Durée de sommeil">
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" vertical={false} />
                          <ReferenceArea y1={Number(settings.needH) - 0.5} y2={Number(settings.needH) + 1} fill={GREEN} fillOpacity={0.1} />
                          <ReferenceLine y={Number(settings.needH)} stroke={GREEN} strokeDasharray="5 4" />
                          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10.5 }} stroke="#3a342a" interval={range > 14 ? 3 : 1} />
                          <YAxis domain={[0, 11]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: MUTED, fontSize: 11 }} stroke="#3a342a" unit=" h" />
                          <Tooltip contentStyle={{ background: "#1a1815", border: "1px solid #3a342a", borderRadius: 8, color: TEXT }} formatter={(v) => [fmtDur(v * 60), "Sommeil"]} />
                          <Bar dataKey="h" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                            {chartData.map((d) => (
                              <Cell key={d.date} fill={!d.h ? "#2a2620" : d.h * 60 >= needMin - 30 ? GREEN : d.h * 60 >= needMin - 90 ? ACCENT : RED} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>Bande verte = ton besoin ({fmtDur(needMin)}). Vert = besoin atteint · ambre = jusqu'à 1 h 30 de moins · rouge = au-delà.</div>
                  </FoldCard>

                  <FoldCard id="horaires" fold={fold} title="🕰️ Horaires (coucher → réveil)">
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.filter((d) => d.range)} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                          <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10.5 }} stroke="#3a342a" />
                          <YAxis
                            reversed
                            domain={[180, 960]}
                            ticks={[180, 300, 420, 540, 660, 780, 900]}
                            tickFormatter={(v) => fmtClock(v + 18 * 60)}
                            tick={{ fill: MUTED, fontSize: 11 }}
                            stroke="#3a342a"
                            width={46}
                          />
                          {target && <ReferenceLine y={(toMin(target.bed) - 18 * 60 + 1440) % 1440} stroke={NIGHT} strokeDasharray="5 4" />}
                          <ReferenceLine y={(toMin(settings.wake) - 18 * 60 + 1440) % 1440} stroke={ACCENT} strokeDasharray="5 4" />
                          <Tooltip
                            contentStyle={{ background: "#1a1815", border: "1px solid #3a342a", borderRadius: 8, color: TEXT }}
                            formatter={(v) => [`${fmtClock(v[0] + 18 * 60)} → ${fmtClock(v[1] + 18 * 60)}`, "Au lit"]}
                          />
                          <Bar dataKey="range" fill={NIGHT} radius={4} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>
                      Pointillés bleus = coucher conseillé ({target?.bed}) · ambre = réveil habituel ({settings.wake}). Des barres bien alignées = horloge interne stable.
                    </div>
                  </FoldCard>

                  <div style={CARD_STYLE}>
                    <SectionLabel>Bilan sur {range} jours</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
                      {[
                        ["Coucher moyen", fmtClock(sum.avgBed), sum.sdBed != null ? `±${Math.round(sum.sdBed)} min` : ""],
                        ["Réveil moyen", fmtClock(sum.avgWake), sum.sdWake != null ? `±${Math.round(sum.sdWake)} min` : ""],
                        ["Efficacité", `${Math.round(sum.avgEff)} %`, sum.avgEff >= 85 ? "bonne (≥ 85 %)" : "à améliorer (< 85 %)"],
                        ["Nuits suffisantes", `${sum.nightsOk} / ${sum.n}`, `≥ ${fmtDur(needMin - 30)}`],
                        ["Qualité moyenne", sum.avgQuality ? `${QUAL[Math.round(sum.avgQuality)]} ${sum.avgQuality.toFixed(1).replace(".", ",")}/5` : "—", ""],
                        [
                          "Décalage week-end",
                          sum.socialJetlag != null ? fmtDur(sum.socialJetlag) : "—",
                          sum.socialJetlag != null ? (Math.abs(sum.socialJetlag) <= 60 ? "OK (≤ 1 h)" : "> 1 h : « jetlag social »") : "",
                        ],
                      ].map(([t, v, s]) => (
                        <div key={t} style={{ padding: 12, borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
                          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{t}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>{v}</div>
                          {s && <div style={{ fontSize: 12, color: MUTED }}>{s}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <FoldCard id="facteurs" fold={fold} title="🔍 Ce qui joue sur tes nuits" subtitle="Qualité moyenne (/5) les nuits avec l'élément, comparée aux autres. À lire avec prudence avec peu de nuits.">
                    {!factors.length ? (
                      <div style={{ fontSize: 13, color: MUTED }}>Coche les éléments de la veille (caféine, écrans, séance tardive…) et la qualité dans le Journal.</div>
                    ) : (
                      factors.map((f) => {
                        const diff = f.q - f.q0;
                        return (
                          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13.5 }}>
                            <span style={{ color: TEXT }}>
                              {f.icon} {f.label} <span style={{ color: MUTED, fontSize: 12 }}>({f.n} nuit{f.n > 1 ? "s" : ""})</span>
                            </span>
                            <span style={{ color: MUTED, whiteSpace: "nowrap" }}>
                              {f.q.toFixed(1).replace(".", ",")} vs {f.q0.toFixed(1).replace(".", ",")}{" "}
                              <b style={{ color: diff <= -0.5 ? RED : diff >= 0.5 ? GREEN : MUTED }}>
                                {diff > 0 ? "+" : ""}
                                {diff.toFixed(1).replace(".", ",")}
                              </b>
                              {f.d != null && f.d0 != null && <span> · {fmtDur(f.d - f.d0)} de sommeil</span>}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </FoldCard>
                </>
              )}
            </>
          )}

          {/* ======================= ROUTINE ======================= */}
          {tab === "routine" && (
            <>
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Réveil habituel</label>
                    <input type="time" value={settings.wake || "07:00"} onChange={(e) => e.target.value && saveSettings({ ...settings, wake: e.target.value })} style={{ ...FIELD_STYLE, width: 130 }} />
                  </div>
                  <div>
                    <label style={lbl}>Mon besoin de sommeil</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[7, 7.5, 8, 8.5, 9, 9.5].map((h) => (
                        <button key={h} type="button" style={{ ...chip(Number(settings.needH) === h, NIGHT), padding: "7px 10px" }} onClick={() => saveSettings({ ...settings, needH: h })}>
                          {String(h).replace(".", ",")} h
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  Adulte : 7 à 9 h. Sportif en période de charge : viser le haut (8 à 9 h et plus, sieste comprise). Coucher conseillé :{" "}
                  <b style={{ color: NIGHT }}>{fmtClock(toMin(settings.wake) - needMin - (Number(settings.latency) || 15))}</b> (besoin + endormissement), arrondi au cycle :{" "}
                  <b style={{ color: NIGHT }}>{target?.bed}</b>.
                </div>
              </div>

              <div style={CARD_STYLE}>
                <SectionLabel>Ta soirée type</SectionLabel>
                <div style={{ position: "relative", paddingLeft: 26 }}>
                  <div style={{ position: "absolute", left: 9, top: 8, bottom: 8, width: 2, background: `linear-gradient(${ACCENT}, ${NIGHT})` }} />
                  {eveningRoutine(target?.bed, settings.wake).map((s, i, arr) => (
                    <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                      <span
                        style={{
                          position: "absolute",
                          left: -26,
                          top: 2,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          background: "#151310",
                          border: `2px solid ${i === arr.length - 1 ? ACCENT : NIGHT}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: i === arr.length - 1 ? ACCENT : NIGHT, fontVariantNumeric: "tabular-nums", minWidth: 58 }}>{s.t}</span>
                        <span style={{ fontWeight: 800, color: TEXT }}>
                          {s.icon} {s.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginLeft: 68 }}>{s.tip}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12, marginBottom: 16 }}>
                {[
                  ["💤", "Sieste", "Courte (10-20 min) avant 15 h, ou un cycle complet (~90 min) après une nuit courte. Utile les jours de double séance ou après un match en soirée."],
                  ["🏉", "Après un match en soirée", "Endormissement souvent retardé (adrénaline, lumière, caféine) : routine calme, pas d'écran, et récupérer le lendemain par une sieste."],
                  ["✈️", "Déplacement / décalage", "Avance ton coucher de 30 min par jour les jours qui précèdent ; lumière du jour le matin sur place."],
                  ["🍷", "Alcool", "Endort plus vite mais dégrade la 2e partie de nuit et la récupération musculaire."],
                  ["📈", "Signes de manque", "Somnolence en journée, humeur, RPE plus élevé pour la même séance : regarde aussi ton wellness."],
                  ["🩺", "Quand consulter", "Ronflements avec pauses respiratoires, insomnie de plus de 3 semaines, fatigue malgré des nuits longues."],
                ].map(([i, t, x]) => (
                  <div key={t} style={{ ...CARD_STYLE, marginBottom: 0 }}>
                    <div style={{ fontWeight: 800, color: TEXT, marginBottom: 6 }}>
                      {i} {t}
                    </div>
                    <div style={{ fontSize: 13, color: "#d8cfbd", lineHeight: 1.5 }}>{x}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
