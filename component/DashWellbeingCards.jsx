import React, { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { computeTargets, sumN, todayISO, shiftISO, DAY_BY_ID } from "./nutritionData";
import { nightStats, sleepSummary, fmtDur, advisedBedtime, regularityLabel } from "./sleepCalc";
import { loadTrainingDays } from "./trainingDays";

/* =====================================================================
   DashWellbeingCards.jsx — résumés Nutrition et Sommeil pour le dashboard athlète
   (contenu seul : le titre / repli est géré par la carte du dashboard).
   ===================================================================== */

const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const ACCENT = "#e0a13d";
const GREEN = "#4fae7d";
const RED = "#d9695a";
const BLUE = "#5b9bd5";
const NIGHT = "#7b8fd9";

function Mini({ label, value, target, unit, color }) {
  const fmt = (v) => (unit === "L" ? (Math.round(v * 10) / 10).toLocaleString("fr-FR") : Math.round(v).toLocaleString("fr-FR"));
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div style={{ flex: "1 1 120px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginBottom: 3 }}>
        <span>{label}</span>
        <span>
          <b style={{ color: TEXT }}>{fmt(value)}</b>/{fmt(target)} {unit}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#0d0c0a", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function NutritionDashCard({ uid, onOpen }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        const [s, d, tr] = await Promise.all([
          getDoc(doc(db, "users", uid, "nutrition", "settings")),
          getDoc(doc(db, "users", uid, "nutrition", `day_${todayISO()}`)),
          loadTrainingDays(uid, todayISO(), todayISO()).catch(() => ({})),
        ]);
        const day = d.exists() ? d.data() : null;
        // type de journée : celui enregistré, sinon celui de l'entraînement prévu dans Workout
        const auto = tr[todayISO()]?.dayType || "repos";
        if (alive) setSt({ settings: s.exists() ? s.data() : null, day: { ...(day || {}), dayType: day?.dayTypeManual ? day.dayType : auto } });
      } catch (e) {
        if (alive) setSt({ settings: null, day: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);
  if (!st) return <div style={{ fontSize: 13, color: MUTED }}>Chargement…</div>;
  const t = st.settings ? computeTargets(st.settings, st.day?.dayType || "modere") : null;
  if (!t)
    return (
      <div style={{ fontSize: 13, color: MUTED }}>
        Calcule tes besoins (calories, protéines, eau) et suis tes repas.{" "}
        <button className="pt-btn pt-btn--primary" style={{ marginTop: 8 }} onClick={() => onOpen("objectifs")}>
          Configurer ma nutrition →
        </button>
      </div>
    );
  const n = sumN((st.day?.entries || []).map((e) => e.n));
  const water = st.day?.water || 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: n.kcal > t.kcal * 1.1 ? RED : ACCENT }}>{Math.round(n.kcal).toLocaleString("fr-FR")}</span>
        <span style={{ color: MUTED, fontSize: 13 }}>/ {t.kcal.toLocaleString("fr-FR")} kcal</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>
          {DAY_BY_ID[st.day?.dayType || "modere"]?.icon} {DAY_BY_ID[st.day?.dayType || "modere"]?.label}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Mini label="Protéines" value={n.p} target={t.p} unit="g" color={RED} />
        <Mini label="Glucides" value={n.c} target={t.c} unit="g" color={ACCENT} />
        <Mini label="Eau" value={water / 1000} target={t.water / 1000} unit="L" color={BLUE} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="pt-btn pt-btn--primary" onClick={() => onOpen("journal", "repas")}>
          ＋ Ajouter un repas
        </button>
        <button className="pt-btn" onClick={() => onOpen("journal", "eau")}>
          💧 Eau
        </button>
      </div>
    </div>
  );
}

export function SleepDashCard({ uid, onOpen }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", uid, "sleep"));
        const settings = snap.docs.find((d) => d.id === "_settings")?.data() || { wake: "07:00", needH: 8.5, latency: 15 };
        const nights = snap.docs
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
          .map((d) => ({ date: d.id, ...d.data() }))
          .filter((x) => x.date > shiftISO(todayISO(), -7))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (alive) setSt({ settings, nights });
      } catch (e) {
        if (alive) setSt({ settings: { wake: "07:00", needH: 8.5, latency: 15 }, nights: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);
  if (!st) return <div style={{ fontSize: 13, color: MUTED }}>Chargement…</div>;
  const need = (Number(st.settings.needH) || 8.5) * 60;
  const last = st.nights[st.nights.length - 1];
  const ls = last ? nightStats(last) : null;
  const lastIsToday = last?.date === todayISO();
  const sum = sleepSummary(st.nights, Number(st.settings.needH) || 8.5);
  const bed = advisedBedtime(st.settings.wake, Number(st.settings.needH) || 8.5, Number(st.settings.latency) || 15)?.bed;
  const col = (m) => (m >= need - 30 ? GREEN : m >= need - 90 ? ACCENT : RED);
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 120px" }}>
          <div style={{ fontSize: 12, color: MUTED }}>{lastIsToday ? "Cette nuit" : "Dernière nuit notée"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: ls ? col(ls.sleep) : MUTED }}>{ls ? fmtDur(ls.sleep) : "—"}</div>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <div style={{ fontSize: 12, color: MUTED }}>Moyenne 7 j</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: sum ? col(sum.avgSleep) : MUTED }}>{sum ? fmtDur(sum.avgSleep) : "—"}</div>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <div style={{ fontSize: 12, color: MUTED }}>Ce soir, au lit à</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: NIGHT }}>{bed || "—"}</div>
        </div>
      </div>
      {sum && sum.sdBed != null && (
        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>
          Régularité : <b style={{ color: regularityLabel(Math.max(sum.sdBed, sum.sdWake || 0)).c }}>{regularityLabel(Math.max(sum.sdBed, sum.sdWake || 0)).t}</b> · dette 7 j{" "}
          <b style={{ color: sum.debt7 <= 60 ? GREEN : ACCENT }}>{fmtDur(sum.debt7)}</b>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className={lastIsToday ? "pt-btn" : "pt-btn pt-btn--primary"} onClick={() => onOpen("journal")}>
          {lastIsToday ? "✏️ Ma nuit" : "＋ Noter ma nuit"}
        </button>
        <button className="pt-btn" onClick={() => onOpen("calcul")}>
          🧮 Calculer mon coucher
        </button>
      </div>
    </div>
  );
}
