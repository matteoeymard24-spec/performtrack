import React, { useMemo, useState } from "react";

/* ExerciseFeedbackList — exercices pour lesquels l'athlète a donné un feedback
   (charges, reps, RPE, notes), lus dans workout.userProgress[uid].feedback.
   Utilisé par le Dashboard (6 derniers + « Voir tout ») et par Mes RM (liste complète). */

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const GOLD = "#e0a13d";

const normName = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/* Une entrée par exercice et par séance, la plus récente d'abord. */
export function extractFeedbackExercises(workouts, uid) {
  const out = [];
  (workouts || []).forEach((w) => {
    const fb = w?.userProgress?.[uid]?.feedback;
    if (!fb || !Array.isArray(w.blocks)) return;
    Object.entries(fb).forEach(([key, f]) => {
      if (!f) return;
      const [bIdx, eIdx] = key.split("-").map(Number);
      const block = w.blocks[bIdx];
      const ex = block && Array.isArray(block.exercises) ? block.exercises[eIdx] : null;
      if (!ex) return;
      if (/échauffement|echauffement|warm.?up|activation/i.test(block.name || "")) return;
      const name = ex.name;
      if (!name) return;
      const raw = Array.isArray(f.series)
        ? f.series
        : f.actualWeight !== undefined || f.actualReps !== undefined
          ? [{ actualWeight: f.actualWeight, actualReps: f.actualReps, rpe: f.rpe }]
          : [];
      const sets = raw
        .map((s) => ({ weight: num(s.actualWeight), reps: num(s.actualReps), rpe: num(s.rpe) }))
        .filter((s) => (s.weight && s.weight > 0) || (s.reps && s.reps > 0));
      if (sets.length === 0) return;
      const top = sets.reduce(
        (best, s) =>
          !best || (s.weight || 0) > (best.weight || 0) || ((s.weight || 0) === (best.weight || 0) && (s.reps || 0) > (best.reps || 0))
            ? s
            : best,
        null
      );
      const rpes = sets.map((s) => s.rpe).filter((r) => r != null && r > 0);
      out.push({
        id: `${w.id || w.date}_${key}`,
        key: normName(name),
        unilateral: !!ex.unilateral,
        exercise: name,
        date: w.date || "",
        workoutTitle: w.title || "",
        sets,
        top,
        avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
        notes: f.notes || "",
      });
    });
  });
  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return out;
}

/* Dernière occurrence de chaque exercice (+ nombre total de séances). */
export function lastPerExercise(entries) {
  const seen = new Map();
  entries.forEach((e) => {
    const cur = seen.get(e.key);
    if (!cur) seen.set(e.key, { ...e, count: 1 });
    else cur.count += 1;
  });
  return [...seen.values()];
}

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const rpeColor = (r) => (r == null ? MUTED : r >= 9.5 ? "#d9695a" : r >= 8.5 ? "#e08a3d" : r >= 7 ? "#d9a441" : "#4fae7d");

const fmtSet = (s) =>
  s.weight && s.weight > 0 ? `${s.weight} kg × ${s.reps ?? "?"}` : `${s.reps ?? "?"} reps`;

function Row({ e, showCount }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #1d1a16" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 4px", cursor: "pointer" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, textTransform: "capitalize", color: TEXT, overflow: "hidden", textOverflow: "ellipsis" }}>
            {e.exercise}
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {fmtDate(e.date)}
            {e.workoutTitle ? ` · ${e.workoutTitle}` : ""}
            {showCount && e.count > 1 ? ` · ${e.count} séances` : ""} {open ? "▾" : "▸"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{fmtSet(e.top)}</div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {e.sets.length} série{e.sets.length > 1 ? "s" : ""}
            {e.avgRpe != null && (
              <>
                {" · RPE "}
                <span style={{ color: rpeColor(e.avgRpe), fontWeight: 700 }}>{Math.round(e.avgRpe * 10) / 10}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 4px 10px 4px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {e.sets.map((s, i) => (
              <span
                key={i}
                style={{ background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: TEXT }}
              >
                {fmtSet(s)}
                {s.rpe != null && s.rpe > 0 && (
                  <span style={{ color: rpeColor(s.rpe), fontWeight: 700 }}> · RPE {s.rpe}</span>
                )}
              </span>
            ))}
          </div>
          {e.notes && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>📝 {e.notes}</div>}
        </div>
      )}
    </div>
  );
}

/* entries : liste déjà extraite. mode "last" = un exercice une seule fois (dernière séance),
   mode "all" = chaque séance. limit = nombre de lignes affichées au départ. */
export function FeedbackList({ entries, mode = "all", limit = 20, searchable = false, emptyText }) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const rows = useMemo(() => {
    const base = mode === "last" ? lastPerExercise(entries) : entries;
    const s = normName(q);
    return s ? base.filter((e) => e.key.includes(s)) : base;
  }, [entries, mode, q]);
  const shown = more || q ? rows : rows.slice(0, limit);
  return (
    <div>
      {searchable && (
        <input
          type="text"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder={`🔍 Chercher un exercice (${new Set(entries.map((e) => e.key)).size})`}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "#0d0c0a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: TEXT, fontSize: 14, outline: "none", marginBottom: 10 }}
        />
      )}
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 12 }}>
          {emptyText || "Aucun exercice avec feedback pour l'instant."}
        </div>
      )}
      {shown.map((e) => (
        <Row key={e.id} e={e} showCount={mode === "last"} />
      ))}
      {!q && !more && rows.length > limit && (
        <button
          type="button"
          onClick={() => setMore(true)}
          style={{ width: "100%", marginTop: 10, padding: "9px 12px", background: "#1d1a16", color: TEXT, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
        >
          Voir les {rows.length - limit} autres ▾
        </button>
      )}
    </div>
  );
}
