import WellbeingTabs from "../component/WellbeingTabs";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { db } from "../firebase";
import { Page, PageHeader, Kpi, KpiGrid, FoldCard, useFold, CARD_STYLE, FIELD_STYLE, SectionLabel, TEXT, MUTED, ACCENT } from "../component/ui";
import PersonPicker from "../component/PersonPicker";
import FoodPicker, { EntryEditor } from "../component/FoodPicker";
import MealPlanner from "../component/MealPlanner";
import usePersonScope from "../component/usePersonScope";
import { normSex } from "../component/cycling";
import { appConfirm, appAlert as alert } from "../component/appDialog";
import {
  MACROS,
  MICROS,
  NUT,
  FOODS,
  FOOD_BY_ID,
  FOOD_CATS,
  MEALS,
  GOALS,
  GOAL_BY_ID,
  PAL,
  DAY_TYPES,
  DAY_BY_ID,
  DIETS,
  SUPPLEMENTS,
  SUPP_BY_ID,
  EVIDENCE,
  computeTargets,
  generateMenu,
  bestSources,
  scaleN,
  sumN,
  fmtN,
  todayISO,
  shiftISO,
  allowedByDiet,
} from "../component/nutritionData";

/* =====================================================================
   Nutrition.jsx — journal alimentaire, objectifs caloriques, menus types,
   compléments et hydratation.
   Firestore : users/{uid}/nutrition/settings  (réglages, aliments perso, mes compléments)
               users/{uid}/nutrition/day_AAAA-MM-JJ  (journal du jour)
   ===================================================================== */

const GREEN = "#4fae7d";
const RED = "#d9695a";
const BLUE = "#5b9bd5";
const BORDER = "#2a2620";
const MACRO_COLOR = { kcal: ACCENT, p: "#d9695a", c: "#e0a13d", f: "#5b9bd5", fib: "#4fae7d" };
const uidN = () => Math.random().toString(36).slice(2, 10);
const frDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const pctColor = (pct, limit) => (limit ? (pct > 150 ? RED : pct > 100 ? ACCENT : GREEN) : pct >= 100 ? GREEN : pct >= 70 ? ACCENT : RED);

/* Anneau de progression (SVG) */
function Ring({ value, target, color = ACCENT, size = 120, stroke = 12, label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? value / target : 0;
  const over = pct > 1.05;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a2620" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? RED : color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, pct) * c} ${c}`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: size * 0.2, fontWeight: 900, color: TEXT, lineHeight: 1 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* Barre consommé / objectif */
function ProgressRow({ label, value, target, unit, color, limit, hint, dec = 0 }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const col = color || pctColor(pct, limit);
  const f = (v) => (dec ? (Math.round(v * 10 ** dec) / 10 ** dec).toLocaleString("fr-FR") : Math.round(v).toLocaleString("fr-FR"));
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, marginBottom: 3 }}>
        <span style={{ color: TEXT, fontWeight: 600 }}>
          {label}
          {hint && <span style={{ color: MUTED, fontWeight: 400 }}> · {hint}</span>}
        </span>
        <span style={{ color: MUTED, whiteSpace: "nowrap" }}>
          <b style={{ color: TEXT }}>{f(value)}</b> / {f(target)} {unit} <b style={{ color: col }}>{pct} %</b>
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "#0d0c0a", overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: col, borderRadius: 4, transition: "width .3s" }} />
      </div>
    </div>
  );
}

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
const smallBtn = (c = MUTED) => ({ padding: "5px 10px", borderRadius: 8, border: `1px solid ${c}55`, background: "transparent", color: c, fontSize: 12, fontWeight: 600, cursor: "pointer" });
const lbl = { display: "block", fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 };

/* ---------- Gourde (hydratation) ---------- */
function Bottle({ ml, target, size = 120 }) {
  const pct = target > 0 ? Math.min(1, ml / target) : 0;
  const h = size * 1.5;
  const fillH = (h - 26) * pct;
  return (
    <svg width={size * 0.7} height={h} viewBox={`0 0 ${size * 0.7} ${h}`} aria-label={`${ml} ml sur ${target}`}>
      <defs>
        <clipPath id="btl">
          <rect x={6} y={22} width={size * 0.7 - 12} height={h - 26} rx={16} />
        </clipPath>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc0f0" />
          <stop offset="1" stopColor="#3a7fc0" />
        </linearGradient>
      </defs>
      <rect x={size * 0.35 - 12} y={2} width={24} height={14} rx={4} fill="#3a342a" />
      <rect x={6} y={22} width={size * 0.7 - 12} height={h - 26} rx={16} fill="#0d0c0a" stroke="#3a342a" strokeWidth={2} />
      <g clipPath="url(#btl)">
        <rect x={6} y={h - 4 - fillH} width={size * 0.7 - 12} height={fillH} fill="url(#water)" />
        {pct > 0 && pct < 1 && <path d={`M6 ${h - 4 - fillH} q ${(size * 0.7 - 12) / 4} -6 ${(size * 0.7 - 12) / 2} 0 t ${(size * 0.7 - 12) / 2} 0`} fill="#7cc0f0" />}
      </g>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={size * 0.7 - 18} x2={size * 0.7 - 8} y1={h - 4 - (h - 26) * t} y2={h - 4 - (h - 26) * t} stroke="#6f6a62" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

const URINE = [
  { c: "#f7f3d0", t: "Bien hydraté" },
  { c: "#f2e8a2", t: "Bien hydraté" },
  { c: "#eedc6c", t: "Correct" },
  { c: "#e3c53f", t: "Bois un peu plus" },
  { c: "#d4aa2a", t: "Déshydratation légère" },
  { c: "#bf8b22", t: "Déshydraté : bois" },
  { c: "#9c6b1c", t: "Très déshydraté" },
  { c: "#7a5214", t: "Consulte si ça persiste" },
];

/* =====================================================================
   PAGE
   ===================================================================== */
export default function Nutrition() {
  const navigate = useNavigate();
  const ps = usePersonScope();
  const uid = ps.uid;
  const fold = useFold("nutrition");
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("tab") || "journal";
    return t === "menus" ? "planning" : t; // ancien onglet « Menus types » → Planning
  });
  const [date, setDate] = useState(todayISO());
  // Journal toujours sur le BON jour : page restée ouverte la nuit / app reprise le lendemain →
  // si on regardait « aujourd'hui », on passe au nouveau jour (journal vierge du jour).
  const todayRef = React.useRef(todayISO());
  useEffect(() => {
    const roll = () => {
      const t = todayISO();
      if (t !== todayRef.current) {
        const was = todayRef.current;
        todayRef.current = t;
        setDate((d) => (d === was ? t : d));
      }
    };
    const id = setInterval(roll, 60000);
    const onVis = () => document.visibilityState === "visible" && roll();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", roll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", roll);
    };
  }, []);
  // Arrivée depuis le dashboard : « Ajouter un repas » ouvre le repas de l'heure, « Eau » va à la gourde
  const focusRef = React.useRef(new URLSearchParams(window.location.search).get("focus"));
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null); // réglages en cours d'édition (onglet Objectifs)
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // id du repas où l'on ajoute
  const [editEntry, setEditEntry] = useState(null); // id de l'aliment du journal en cours de modification
  const [sweat, setSweat] = useState({ before: "", after: "", drunk: "", min: "" });
  const [saved, setSaved] = useState("");

  const person = ps.person || {};
  const defaults = useMemo(
    () => ({
      sex: normSex(person.sex) === "F" ? "F" : "M",
      age: person.age || "",
      height: person.height || "",
      weight: person.weight || "",
      bodyFat: person.bodyFat || "",
      pal: 1.7,
      goal: "maintien",
      rate: 0,
      diet: "omni",
      proteinPerKg: "",
      fatPct: "",
      ironHigh: false,
      customFoods: [],
      mySupps: [],
    }),
    [person.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ---- chargement ---- */
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const sref = doc(db, "users", uid, "nutrition", "settings");
        const sd = await getDoc(sref);
        const s = { ...defaults, ...(sd.exists() ? sd.data() : {}) };
        // le poids / la taille du profil restent la référence s'ils ne sont pas saisis ici
        ["weight", "height", "age", "bodyFat"].forEach((k) => {
          if (!s[k] && defaults[k]) s[k] = defaults[k];
        });
        if (!alive) return;
        setSettings(s);
        setDraft(s);
        const all = await getDocs(collection(db, "users", uid, "nutrition"));
        if (!alive) return;
        const days = all.docs.filter((d) => d.id.startsWith("day_")).map((d) => ({ date: d.id.slice(4), ...d.data() }));
        setHistory(days);
      } catch (e) {
        console.error("Nutrition : chargement", e);
        if (alive) {
          setSettings(defaults);
          setDraft(defaults);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // le jour affiché est (ré)initialisé quand on change de date ou de personne, pas à chaque enregistrement
  // (saveDay met déjà le jour à jour ; sinon le sélecteur d'aliments se refermerait après chaque ajout)
  useEffect(() => {
    if (loading) return;
    const h = history.find((d) => d.date === date);
    setDay(h ? { entries: [], water: 0, waterLog: [], supps: {}, dayType: "modere", ...h } : { entries: [], water: 0, waterLog: [], supps: {}, dayType: "modere", date });
  }, [date, loading, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAdding(null);
    setEditEntry(null);
  }, [date, uid]);
  useEffect(() => {
    const f = focusRef.current;
    if (!f || loading || !day || tab !== "journal") return;
    focusRef.current = null;
    const h = new Date().getHours();
    const meal = h < 11 ? "petitdej" : h < 15 ? "dejeuner" : h < 18 ? "collation" : "diner";
    if (f === "repas") setAdding(meal);
    setTimeout(() => {
      const el = document.getElementById(f === "eau" ? "nutri-eau" : `nutri-meal-${meal}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [loading, day, tab]);

  const targets = useMemo(() => (settings ? computeTargets(settings, day?.dayType || "modere") : null), [settings, day?.dayType]);

  /* ---- enregistrement ---- */
  const saveDay = async (next) => {
    const t = settings ? computeTargets(settings, next.dayType || "modere") : null;
    const data = { ...next, date, targetKcal: t?.kcal || null, targetP: t?.p || null, targetWater: t?.water || null, updatedAt: new Date().toISOString() };
    setDay(data);
    setHistory((prev) => [...prev.filter((d) => d.date !== date), data]);
    try {
      await setDoc(doc(db, "users", uid, "nutrition", `day_${date}`), data);
    } catch (e) {
      alert("Erreur d'enregistrement : " + e.message);
    }
  };
  const saveSettings = async (next, msg = "✅ Réglages enregistrés") => {
    setSettings(next);
    setDraft(next);
    try {
      await setDoc(doc(db, "users", uid, "nutrition", "settings"), { ...next, updatedAt: new Date().toISOString() });
      setSaved(msg);
      setTimeout(() => setSaved(""), 2500);
    } catch (e) {
      alert("Erreur d'enregistrement : " + e.message);
    }
  };

  /* Valeurs pour 100 g d'un aliment : aliment perso → modifié en place ; aliment de base → surcharge
     (settings.foodOverrides), per100 = null → retour aux valeurs d'origine */
  const saveFoodValues = (food, per100) => {
    if (!food) return;
    const isCustom = (settings.customFoods || []).some((f) => f.id === food.id);
    if (isCustom) {
      return saveSettings(
        { ...settings, customFoods: (settings.customFoods || []).map((f) => (f.id === food.id ? { ...f, n: { ...f.n, ...(per100 || {}) } } : f)) },
        "✅ Valeurs de l'aliment enregistrées"
      );
    }
    const ov = { ...(settings.foodOverrides || {}) };
    if (per100) ov[food.id] = per100;
    else delete ov[food.id];
    return saveSettings({ ...settings, foodOverrides: ov }, per100 ? "✅ Valeurs de l'aliment enregistrées" : "↺ Valeurs d'origine rétablies");
  };

  /* Ajout d'aliments au journal d'un jour quelconque (depuis le Planning) */
  const addToJournal = async (dateStr, entries, dayType) => {
    const prev = history.find((d) => d.date === dateStr) || { entries: [], water: 0, waterLog: [], supps: {} };
    const dt = (prev.entries || []).length ? prev.dayType || "modere" : dayType || prev.dayType || "modere";
    const t = settings ? computeTargets(settings, dt) : null;
    const data = {
      ...prev,
      dayType: dt,
      entries: [...(prev.entries || []), ...entries],
      date: dateStr,
      targetKcal: t?.kcal || null,
      targetP: t?.p || null,
      targetWater: t?.water || null,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, "users", uid, "nutrition", `day_${dateStr}`), data);
      setHistory((h) => [...h.filter((d) => d.date !== dateStr), data]);
      if (dateStr === date) setDay(data);
      alert(`✅ ${entries.length} aliment(s) ajouté(s) au journal du ${frDate(dateStr)}.`);
    } catch (e) {
      alert("Erreur d'enregistrement : " + e.message);
    }
  };

  /* ---- totaux du jour ---- */
  const mySupps = settings?.mySupps || [];
  const suppN = useMemo(() => {
    const list = [];
    mySupps.forEach((s) => {
      const q = Number(day?.supps?.[s.id]) || 0;
      if (q > 0) list.push(Object.fromEntries(Object.entries(s.n || {}).map(([k, v]) => [k, v * q])));
    });
    return sumN(list);
  }, [mySupps, day]);
  const foodN = useMemo(() => sumN((day?.entries || []).map((e) => e.n)), [day]);
  const totalN = useMemo(() => sumN([foodN, suppN]), [foodN, suppN]);
  const caffeine = mySupps.reduce((s, x) => s + (Number(day?.supps?.[x.id]) || 0) * (x.caffeineMg || 0), 0);

  const profileOk = settings && Number(settings.weight) > 0 && Number(settings.height) > 0;
  const isToday = date === todayISO();

  /* ---- historique 14 jours ---- */
  const hist14 = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = shiftISO(todayISO(), -i);
      const h = history.find((x) => x.date === d);
      const kcal = h ? sumN((h.entries || []).map((e) => e.n)).kcal : 0;
      out.push({ date: d, label: d.slice(8, 10) + "/" + d.slice(5, 7), kcal: Math.round(kcal), target: h?.targetKcal || targets?.kcal || 0, water: h?.water || 0 });
    }
    return out;
  }, [history, targets]);


  /* =============================== RENDU =============================== */
  const tabs = [
    ["journal", "📅 Journal"],
    ["objectifs", "🎯 Objectifs"],
    ["planning", "🗓️ Planning"],
    ["supps", "💊 Compléments"],
    ["eau", "💧 Hydratation"],
  ];

  return (
    <Page>
      <WellbeingTabs />
      <PageHeader
        title="🥗 Nutrition"
        subtitle={ps.isSelf ? "Calories, macros, vitamines, compléments et hydratation" : `Nutrition de ${person.firstName || ""} ${person.lastName || ""}`.trim()}
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
          note={!ps.isSelf ? "tu vois et modifies ses données nutrition." : null}
        />
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={chip(tab === k)}>
            {l}
          </button>
        ))}
      </div>

      {loading || !settings ? (
        <div style={{ color: MUTED, padding: 20 }}>Chargement…</div>
      ) : !profileOk && tab !== "objectifs" ? (
        <div style={{ ...CARD_STYLE, border: `1px solid ${ACCENT}88` }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, marginBottom: 6 }}>🎯 Commence par tes objectifs</div>
          <div style={{ color: MUTED, fontSize: 13.5, marginBottom: 12 }}>
            Il faut au moins le poids et la taille pour calculer les besoins (calories, protéines, glucides, eau).
          </div>
          <button className="pt-btn pt-btn--primary" onClick={() => setTab("objectifs")}>
            Renseigner mon profil →
          </button>
        </div>
      ) : (
        <>
          {/* ======================= JOURNAL ======================= */}
          {tab === "journal" && day && targets && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <button className="pt-btn" onClick={() => setDate(shiftISO(date, -1))} aria-label="Jour précédent">
                  ←
                </button>
                <div style={{ fontWeight: 800, color: TEXT, textTransform: "capitalize", minWidth: 190, textAlign: "center" }}>{isToday ? "Aujourd'hui" : frDate(date)}</div>
                <button className="pt-btn" onClick={() => setDate(shiftISO(date, 1))} disabled={isToday} aria-label="Jour suivant">
                  →
                </button>
                {!isToday && (
                  <button className="pt-btn" onClick={() => setDate(todayISO())}>
                    Aujourd'hui
                  </button>
                )}
                <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...FIELD_STYLE, width: 160 }} />
              </div>

              {/* Type de journée */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {DAY_TYPES.map((d) => (
                  <button key={d.id} type="button" style={chip(day.dayType === d.id)} onClick={() => saveDay({ ...day, dayType: d.id })}>
                    {d.icon} {d.label}
                  </button>
                ))}
              </div>

              {/* Résumé visuel */}
              <div style={{ ...CARD_STYLE, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <Ring
                  value={totalN.kcal}
                  target={targets.kcal}
                  size={140}
                  stroke={14}
                  label={Math.round(totalN.kcal).toLocaleString("fr-FR")}
                  sub={`/ ${targets.kcal.toLocaleString("fr-FR")} kcal`}
                />
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
                    {totalN.kcal < targets.kcal
                      ? `Reste ${Math.round(targets.kcal - totalN.kcal).toLocaleString("fr-FR")} kcal`
                      : `${Math.round(totalN.kcal - targets.kcal).toLocaleString("fr-FR")} kcal au-dessus de l'objectif`}
                    {" · "}
                    {DAY_BY_ID[day.dayType]?.icon} {DAY_BY_ID[day.dayType]?.label}
                  </div>
                  <ProgressRow label="Protéines" value={totalN.p} target={targets.p} unit="g" color={MACRO_COLOR.p} hint={`${targets.proteinPerKg} g/kg`} />
                  <ProgressRow label="Glucides" value={totalN.c} target={targets.c} unit="g" color={MACRO_COLOR.c} hint={`${targets.carbsPerKg} g/kg`} />
                  <ProgressRow label="Lipides" value={totalN.f} target={targets.f} unit="g" color={MACRO_COLOR.f} />
                  <ProgressRow label="Fibres" value={totalN.fib} target={targets.fib} unit="g" color={MACRO_COLOR.fib} />
                </div>
              </div>

              {/* Repas */}
              {MEALS.map((m) => {
                const items = (day.entries || []).filter((e) => (e.meal || "dejeuner") === m.id);
                const t = sumN(items.map((e) => e.n));
                return (
                  <div key={m.id} id={`nutri-meal-${m.id}`} style={{ ...CARD_STYLE, scrollMarginTop: "calc(var(--pt-header-h, 60px) + 12px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 800, color: TEXT, fontSize: 15.5 }}>
                        {m.icon} {m.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {items.length > 0 && (
                          <span style={{ fontSize: 12.5, color: MUTED }}>
                            <b style={{ color: ACCENT }}>{Math.round(t.kcal)} kcal</b> · P {Math.round(t.p)} g
                          </span>
                        )}
                        <button type="button" className={adding === m.id ? "pt-btn pt-btn--primary" : "pt-btn"} onClick={() => setAdding(adding === m.id ? null : m.id)}>
                          ＋
                        </button>
                      </div>
                    </div>
                    {items.map((e) =>
                      editEntry === e.id ? (
                        <EntryEditor
                          key={e.id}
                          entry={e}
                          customFoods={settings.customFoods}
                          foodOverrides={settings.foodOverrides}
                          onCancel={() => setEditEntry(null)}
                          onSave={async (next, upd) => {
                            setEditEntry(null);
                            await saveDay({ ...day, entries: day.entries.map((x) => (x.id === e.id ? next : x)) });
                            if (upd) await saveFoodValues(upd.food, upd.per100);
                          }}
                        />
                      ) : (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13.5 }}>
                        <button
                          type="button"
                          onClick={() => setEditEntry(e.id)}
                          title="Modifier la quantité ou les valeurs"
                          style={{ color: TEXT, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit" }}
                        >
                          {e.name} <span style={{ color: MUTED }}>· {e.grams} g</span>
                        </button>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{ color: MUTED, fontSize: 12.5 }}>
                            {Math.round(e.n.kcal)} kcal · P {Math.round(e.n.p)}
                          </span>
                          <button type="button" aria-label="Modifier" onClick={() => setEditEntry(e.id)} style={{ ...smallBtn(ACCENT), padding: "2px 8px" }}>
                            ✏️
                          </button>
                          <button
                            type="button"
                            aria-label="Retirer"
                            onClick={() => saveDay({ ...day, entries: day.entries.filter((x) => x.id !== e.id) })}
                            style={{ ...smallBtn(RED), padding: "2px 8px" }}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      )
                    )}
                    {adding === m.id && (
                      <FoodPicker
                        customFoods={settings.customFoods}
                        diet={settings.diet}
                        meal={m.id}
                        onClose={() => setAdding(null)}
                        onAdd={(entry) => saveDay({ ...day, entries: [...(day.entries || []), entry] })}
                        onSaveCustom={(food) => saveSettings({ ...settings, customFoods: [...(settings.customFoods || []), food] }, "✅ Aliment enregistré")}
                        foodOverrides={settings.foodOverrides}
                        onFoodValues={saveFoodValues}
                      />
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <button
                  className="pt-btn"
                  onClick={async () => {
                    const prev = history.find((d) => d.date === shiftISO(date, -1));
                    if (!prev || !(prev.entries || []).length) return alert("Rien à copier : la veille est vide.");
                    if ((day.entries || []).length && !(await appConfirm("Ajouter les aliments de la veille à ceux déjà saisis ?"))) return;
                    saveDay({ ...day, entries: [...(day.entries || []), ...prev.entries.map((e) => ({ ...e, id: uidN() }))] });
                  }}
                >
                  📋 Copier la veille
                </button>
                <button className="pt-btn" onClick={() => setTab("planning")}>
                  🗓️ Menu prévu / planning
                </button>
                {(day.entries || []).length > 0 && (
                  <button
                    className="pt-btn"
                    onClick={async () => {
                      if (await appConfirm("Vider le journal de ce jour ?")) saveDay({ ...day, entries: [] });
                    }}
                  >
                    🗑 Vider le jour
                  </button>
                )}
              </div>

              {/* Compléments pris */}
              <FoldCard id="supps_day" fold={fold} title="💊 Compléments du jour" subtitle={mySupps.length ? "Leurs apports s'ajoutent aux totaux." : null}>
                {!mySupps.length ? (
                  <div style={{ fontSize: 13, color: MUTED }}>
                    Aucun complément dans ta liste.{" "}
                    <button className="pt-btn" onClick={() => setTab("supps")}>
                      Choisir mes compléments →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {mySupps.map((s) => {
                      const q = Number(day.supps?.[s.id]) || 0;
                      const set = (v) => saveDay({ ...day, supps: { ...(day.supps || {}), [s.id]: Math.max(0, v) } });
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: q ? "rgba(79,174,125,0.1)" : "#0d0c0a", border: `1px solid ${q ? GREEN + "66" : BORDER}` }}>
                          <button type="button" onClick={() => set(q ? 0 : s.dose || 1)} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${q ? GREEN : "#3a342a"}`, background: q ? GREEN : "transparent", color: "#0d0c0a", fontWeight: 900, cursor: "pointer" }}>
                            {q ? "✓" : ""}
                          </button>
                          <span style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 13.5 }}>
                            {s.name} <span style={{ color: MUTED, fontSize: 12 }}>· {s.unit}</span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button type="button" style={smallBtn()} onClick={() => set(q - 1)} disabled={!q}>
                              −
                            </button>
                            <b style={{ color: TEXT, minWidth: 18, textAlign: "center" }}>{q}</b>
                            <button type="button" style={smallBtn()} onClick={() => set(q + 1)}>
                              ＋
                            </button>
                          </span>
                        </div>
                      );
                    })}
                    {caffeine > 0 && (
                      <div style={{ fontSize: 12.5, color: ACCENT }}>
                        ☕ {caffeine} mg de caféine en complément : évite d'en prendre dans les 8 h avant le coucher (voir Sommeil).
                      </div>
                    )}
                  </div>
                )}
              </FoldCard>

              {/* Vitamines et minéraux */}
              <FoldCard id="micros" fold={fold} title="🧪 Vitamines & minéraux" subtitle="Repères ANSES pour un adulte. Les tables donnent des moyennes : vise la régularité sur la semaine plutôt que 100 % chaque jour.">
                {!(day.entries || []).length && !Object.values(day.supps || {}).some((x) => x > 0) ? (
                  <div style={{ fontSize: 13, color: MUTED }}>Ajoute des aliments pour voir tes apports.</div>
                ) : (
                  <>
                    {MICROS.map((mi) => (
                      <ProgressRow
                        key={mi.k}
                        label={mi.label}
                        value={totalN[mi.k]}
                        target={targets.micro[mi.k]}
                        unit={mi.unit}
                        limit={mi.limit}
                        dec={mi.dec}
                        hint={suppN[mi.k] > 0 ? `dont ${fmtN(mi.k, suppN[mi.k])} ${mi.unit} en complément` : null}
                      />
                    ))}
                    {(() => {
                      const low = MICROS.filter((mi) => !mi.limit && totalN[mi.k] < 0.7 * targets.micro[mi.k]);
                      if (!low.length) return <div style={{ fontSize: 13, color: GREEN, marginTop: 6 }}>✅ Toutes les vitamines et minéraux suivis sont couverts à plus de 70 %.</div>;
                      return (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(224,161,61,0.07)", borderLeft: `3px solid ${ACCENT}` }}>
                          <div style={{ fontWeight: 800, color: ACCENT, fontSize: 12.5, marginBottom: 6 }}>À COMPLÉTER — MEILLEURES SOURCES</div>
                          {low.slice(0, 5).map((mi) => (
                            <div key={mi.k} style={{ fontSize: 13, color: TEXT, marginBottom: 4 }}>
                              <b>{mi.label}</b> <span style={{ color: MUTED }}>({mi.why})</span> :{" "}
                              {bestSources(mi.k, settings.diet)
                                .map((x) => `${x.f.name.toLowerCase()} (${fmtN(mi.k, x.v)} ${mi.unit} pour ${x.g} g)`)
                                .join(", ")}
                              {mi.k === "vd" ? " — ou un complément de vitamine D en hiver." : ""}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}
              </FoldCard>

              {/* Eau du jour */}
              <div id="nutri-eau" style={{ scrollMarginTop: "calc(var(--pt-header-h, 60px) + 12px)" }}>
              <FoldCard id="water_day" fold={fold} title="💧 Eau du jour">
                <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <Bottle ml={day.water || 0} target={targets.water} />
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ fontSize: 30, fontWeight: 900, color: BLUE }}>
                      {((day.water || 0) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L
                      <span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {(targets.water / 1000).toLocaleString("fr-FR")} L</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>
                      Objectif : 35 ml/kg + ~0,6 L par heure d'entraînement ({DAY_BY_ID[day.dayType]?.label.toLowerCase()}).
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[150, 250, 330, 500, 750].map((v) => (
                        <button
                          key={v}
                          type="button"
                          style={{ ...chip(false, BLUE), color: TEXT }}
                          onClick={() => saveDay({ ...day, water: (day.water || 0) + v, waterLog: [...(day.waterLog || []), { t: new Date().toTimeString().slice(0, 5), ml: v }] })}
                        >
                          ＋ {v} ml
                        </button>
                      ))}
                      {(day.waterLog || []).length > 0 && (
                        <button
                          type="button"
                          style={smallBtn(RED)}
                          onClick={() => {
                            const log = [...(day.waterLog || [])];
                            const last = log.pop();
                            saveDay({ ...day, water: Math.max(0, (day.water || 0) - (last?.ml || 0)), waterLog: log });
                          }}
                        >
                          ↶ Annuler
                        </button>
                      )}
                    </div>
                    {(day.waterLog || []).length > 0 && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                        {(day.waterLog || []).map((w) => `${w.t} · ${w.ml} ml`).join("  —  ")}
                      </div>
                    )}
                  </div>
                </div>
              </FoldCard>
              </div>

              {/* Historique */}
              <FoldCard id="hist" fold={fold} title="📈 14 derniers jours">
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hist14} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="#2a2620" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10.5 }} stroke="#3a342a" interval={1} />
                      <YAxis tick={{ fill: MUTED, fontSize: 11 }} stroke="#3a342a" domain={[0, (max) => Math.ceil((Math.max(max, targets.kcal) * 1.08) / 500) * 500]} />
                      <Tooltip
                        contentStyle={{ background: "#1a1815", border: "1px solid #3a342a", borderRadius: 8, color: TEXT }}
                        formatter={(v, name, it) => [`${v} kcal (objectif ${it.payload.target})`, "Énergie"]}
                        labelFormatter={(l) => l}
                      />
                      {targets.kcal > 0 && <ReferenceLine y={targets.kcal} stroke={ACCENT} strokeDasharray="5 4" />}
                      <Bar dataKey="kcal" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {hist14.map((d) => {
                          const r = d.target ? d.kcal / d.target : 0;
                          return <Cell key={d.date} fill={!d.kcal ? "#2a2620" : r > 1.1 ? RED : r >= 0.9 ? GREEN : ACCENT} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 11.5, color: MUTED }}>Vert = à ±10 % de l'objectif · ambre = en dessous · rouge = au-dessus · pointillés = objectif du jour type actuel.</div>
              </FoldCard>
            </>
          )}

          {/* ======================= OBJECTIFS ======================= */}
          {tab === "objectifs" && draft && (
            <>
              <div style={CARD_STYLE}>
                <SectionLabel>Profil</SectionLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ ...lbl, marginBottom: 0, marginRight: 4 }}>Sexe</span>
                  {[
                    ["M", "Homme"],
                    ["F", "Femme"],
                  ].map(([k, l]) => (
                    <button key={k} type="button" style={chip(draft.sex === k)} onClick={() => setDraft({ ...draft, sex: k })}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {[
                    ["age", "Âge"],
                    ["height", "Taille (cm)"],
                    ["weight", "Poids (kg)"],
                    ["bodyFat", "Masse grasse % (option)"],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <label style={lbl}>{l}</label>
                      <input type="number" inputMode="decimal" value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} style={FIELD_STYLE} />
                    </div>
                  ))}
                </div>
                {draft.sex === "F" && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: TEXT, marginBottom: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!draft.ironHigh} onChange={(e) => setDraft({ ...draft, ironHigh: e.target.checked })} />
                    Règles abondantes (besoin en fer plus élevé : 16 mg/j)
                  </label>
                )}

                <SectionLabel>Activité globale (sport compris)</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
                  {PAL.map((p) => (
                    <button key={p.id} type="button" onClick={() => setDraft({ ...draft, pal: p.id })} style={{ ...chip(Number(draft.pal) === p.id), textAlign: "left", whiteSpace: "normal", borderRadius: 12, padding: "10px 12px" }}>
                      <div>{p.label}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: MUTED }}>{p.sub}</div>
                    </button>
                  ))}
                </div>

                <SectionLabel>Objectif</SectionLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {GOALS.map((g) => (
                    <button key={g.id} type="button" style={chip(draft.goal === g.id)} onClick={() => setDraft({ ...draft, goal: g.id, rate: g.defRate, proteinPerKg: "", fatPct: "" })}>
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
                {(GOAL_BY_ID[draft.goal]?.rates || []).length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Vitesse visée</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {GOAL_BY_ID[draft.goal].rates.map((r) => (
                        <button key={r} type="button" style={chip(Number(draft.rate) === r)} onClick={() => setDraft({ ...draft, rate: r })}>
                          {GOAL_BY_ID[draft.goal].sign < 0 ? "−" : "+"}
                          {String(r).replace(".", ",")} kg / semaine
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                      {draft.goal === "seche"
                        ? "0,5 à 1 % du poids par semaine préserve mieux le muscle ; plus vite, la performance baisse."
                        : "Une prise lente (0,25 kg/sem) limite le gain de gras."}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>
                      Protéines : {draft.proteinPerKg || GOAL_BY_ID[draft.goal]?.protein} g/kg
                    </label>
                    <input type="range" min="1.2" max="2.8" step="0.1" value={draft.proteinPerKg || GOAL_BY_ID[draft.goal]?.protein} onChange={(e) => setDraft({ ...draft, proteinPerKg: Number(e.target.value) })} style={{ width: "100%", accentColor: ACCENT }} />
                    <div style={{ fontSize: 11.5, color: MUTED }}>1,4-2,0 g/kg pour un sportif ; jusqu'à 2,2-2,6 en sèche.</div>
                  </div>
                  <div>
                    <label style={lbl}>Lipides : {Math.round((draft.fatPct || GOAL_BY_ID[draft.goal]?.fatPct) * 100)} % des calories</label>
                    <input type="range" min="0.2" max="0.35" step="0.01" value={draft.fatPct || GOAL_BY_ID[draft.goal]?.fatPct} onChange={(e) => setDraft({ ...draft, fatPct: Number(e.target.value) })} style={{ width: "100%", accentColor: ACCENT }} />
                    <div style={{ fontSize: 11.5, color: MUTED }}>20-35 % ; pas en dessous de ~0,7 g/kg (hormones).</div>
                  </div>
                </div>

                <SectionLabel>Alimentation</SectionLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {DIETS.map((d) => (
                    <button key={d.id} type="button" style={chip(draft.diet === d.id)} onClick={() => setDraft({ ...draft, diet: d.id })}>
                      {d.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="pt-btn pt-btn--primary" onClick={() => saveSettings(draft)}>
                    💾 Enregistrer
                  </button>
                  {saved && <span style={{ color: GREEN, fontSize: 13 }}>{saved}</span>}
                </div>
              </div>

              {(() => {
                const t = computeTargets(draft, "modere");
                if (!t) return <div style={{ ...CARD_STYLE, color: MUTED, fontSize: 13 }}>Renseigne la taille et le poids pour voir le calcul.</div>;
                const kP = t.p * 4;
                const kC = t.c * 4;
                const kF = t.f * 9;
                const tot = kP + kC + kF || 1;
                return (
                  <>
                    <KpiGrid min={150}>
                      <Kpi icon="🔥" label="Métabolisme de base" value={`${t.bmr} kcal`} sub={t.bmrHow} />
                      <Kpi icon="⚙️" label="Dépense totale" value={`${t.tdee} kcal`} sub={`× ${draft.pal} (activité)`} />
                      <Kpi icon="🎯" label="Ajustement objectif" value={`${t.adj > 0 ? "+" : ""}${t.adj} kcal`} color={t.adj < 0 ? RED : t.adj > 0 ? GREEN : TEXT} sub={GOAL_BY_ID[draft.goal]?.label} />
                      <Kpi icon="💧" label="Eau (séance ~1 h)" value={`${(t.water / 1000).toLocaleString("fr-FR")} L`} color={BLUE} />
                    </KpiGrid>
                    <div style={CARD_STYLE}>
                      <SectionLabel>Répartition (séance modérée)</SectionLabel>
                      <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                        {[
                          ["p", kP, "Protéines"],
                          ["c", kC, "Glucides"],
                          ["f", kF, "Lipides"],
                        ].map(([k, v, l]) => (
                          <div key={k} title={l} style={{ width: `${(v / tot) * 100}%`, background: MACRO_COLOR[k], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 800, color: "#1a1306" }}>
                            {Math.round((v / tot) * 100)} %
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: MUTED, marginBottom: 14 }}>
                        <span>
                          <b style={{ color: MACRO_COLOR.p }}>■</b> Protéines {t.p} g
                        </span>
                        <span>
                          <b style={{ color: MACRO_COLOR.c }}>■</b> Glucides {t.c} g
                        </span>
                        <span>
                          <b style={{ color: MACRO_COLOR.f }}>■</b> Lipides {t.f} g
                        </span>
                      </div>
                      <SectionLabel>Selon le type de journée</SectionLabel>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 460 }}>
                          <thead>
                            <tr style={{ color: MUTED, textAlign: "right" }}>
                              <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700 }}>Journée</th>
                              <th style={{ padding: "6px 4px" }}>kcal</th>
                              <th style={{ padding: "6px 4px" }}>Prot.</th>
                              <th style={{ padding: "6px 4px" }}>Gluc.</th>
                              <th style={{ padding: "6px 4px" }}>Lip.</th>
                              <th style={{ padding: "6px 4px" }}>Gluc. g/kg (repère)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {DAY_TYPES.map((d) => {
                              const x = computeTargets(draft, d.id);
                              const ok = x.carbsPerKg >= d.carbs[0];
                              return (
                                <tr key={d.id} style={{ borderTop: `1px solid ${BORDER}`, textAlign: "right", color: TEXT }}>
                                  <td style={{ textAlign: "left", padding: "7px 4px" }}>
                                    {d.icon} {d.label}
                                  </td>
                                  <td style={{ padding: "7px 4px", fontWeight: 800, color: ACCENT }}>{x.kcal}</td>
                                  <td style={{ padding: "7px 4px" }}>{x.p} g</td>
                                  <td style={{ padding: "7px 4px" }}>{x.c} g</td>
                                  <td style={{ padding: "7px 4px" }}>{x.f} g</td>
                                  <td style={{ padding: "7px 4px", color: ok ? GREEN : ACCENT }}>
                                    {x.carbsPerKg} <span style={{ color: MUTED }}>({d.carbs[0]}-{d.carbs[1]})</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                        Repères de glucides : ACSM 2016 (3-5 g/kg journée légère, 5-7 g/kg ~1 h/j, 6-10 g/kg charge élevée). En ambre : sous le repère (fréquent en sèche, à
                        compenser en plaçant les glucides autour des séances). Ces calculs sont des <b>estimations</b> : si ton poids ne bouge pas comme prévu après 2-3
                        semaines, ajuste de ±150 kcal.
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* ======================= PLANNING ======================= */}
          {tab === "planning" && (
            <MealPlanner
              uid={uid}
              settings={settings}
              onSaveCustom={(food) => saveSettings({ ...settings, customFoods: [...(settings.customFoods || []), food] }, "✅ Aliment enregistré")}
              onJournalAdd={addToJournal}
              onFoodValues={saveFoodValues}
            />
          )}

          {/* ======================= COMPLÉMENTS ======================= */}
          {tab === "supps" && (
            <>
              <div style={{ ...CARD_STYLE, borderLeft: `4px solid ${ACCENT}`, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
                <b>Sportif soumis aux contrôles ?</b> Choisis des produits conformes à la norme <b>AFNOR NF V94-001</b> (garantie sans substance dopante). Un
                complément ne remplace pas une alimentation variée : il comble un manque mesuré ou un besoin précis.
              </div>
              <FoldCard id="my_supps" fold={fold} title={`💊 Mes compléments (${mySupps.length})`} subtitle="Coche-les chaque jour dans le Journal : leurs apports s'ajoutent à tes totaux.">
                {!mySupps.length && <div style={{ fontSize: 13, color: MUTED }}>Ajoute des compléments depuis la liste ci-dessous.</div>}
                {mySupps.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ color: TEXT, fontSize: 13.5 }}>
                      {s.name} <span style={{ color: MUTED, fontSize: 12 }}>· {s.unit}</span>
                    </span>
                    <button type="button" style={smallBtn(RED)} onClick={() => saveSettings({ ...settings, mySupps: mySupps.filter((x) => x.id !== s.id) }, "✅ Retiré")}>
                      Retirer
                    </button>
                  </div>
                ))}
                {saved && <div style={{ color: GREEN, fontSize: 13, marginTop: 6 }}>{saved}</div>}
              </FoldCard>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
                {SUPPLEMENTS.map((s) => {
                  const ev = EVIDENCE[s.evidence];
                  const mine = mySupps.some((x) => x.catalogId === s.id);
                  const adds = Object.entries(s.n || {}).filter(([k, v]) => v > 0 && NUT[k]);
                  return (
                    <div key={s.id} style={{ ...CARD_STYLE, marginBottom: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>{s.name}</div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: ev.color, border: `1px solid ${ev.color}66`, whiteSpace: "nowrap" }}>{ev.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED }}>{s.unit}</div>
                      <div style={{ fontSize: 13, color: "#d8cfbd", lineHeight: 1.45, flex: 1 }}>{s.tip}</div>
                      {adds.length > 0 && (
                        <div style={{ fontSize: 12, color: MUTED }}>
                          Apporte : {adds.map(([k, v]) => `${fmtN(k, v)} ${NUT[k].unit} ${NUT[k].label.toLowerCase()}`).join(" · ")}
                        </div>
                      )}
                      <button
                        type="button"
                        className={mine ? "pt-btn" : "pt-btn pt-btn--primary"}
                        disabled={mine}
                        onClick={() =>
                          saveSettings({ ...settings, mySupps: [...mySupps, { id: uidN(), catalogId: s.id, name: s.name, unit: s.unit, n: s.n, dose: 1, caffeineMg: s.caffeineMg || 0 }] }, "✅ Ajouté à mes compléments")
                        }
                      >
                        {mine ? "✓ Dans ma liste" : "＋ Ajouter à mes compléments"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 12 }}>
                Niveaux de preuve d'après le consensus du CIO sur les compléments (2018) et l'Australian Institute of Sport. Fer, magnésium, vitamine D : idéalement après
                un bilan sanguin et avec ton médecin.
              </div>
            </>
          )}

          {/* ======================= HYDRATATION ======================= */}
          {tab === "eau" && targets && (
            <>
              <KpiGrid min={150}>
                <Kpi icon="💧" label="Objectif du jour" value={`${(targets.water / 1000).toLocaleString("fr-FR")} L`} color={BLUE} sub={DAY_BY_ID[day?.dayType]?.label} />
                <Kpi icon="🥤" label="Bu aujourd'hui" value={`${(((day?.date === todayISO() ? day?.water : history.find((d) => d.date === todayISO())?.water) || 0) / 1000).toLocaleString("fr-FR")} L`} color={BLUE} onClick={() => { setDate(todayISO()); setTab("journal"); }} sub="toucher pour ajouter" />
                <Kpi icon="⏰" label="Avant la séance" value={`${Math.round((Number(settings.weight) || 0) * 6)} ml`} sub="5-7 ml/kg, 2 à 4 h avant" />
              </KpiGrid>
              <div style={CARD_STYLE}>
                <SectionLabel>Autour de l'entraînement (ACSM)</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
                  {[
                    ["⏰ Avant", `${Math.round((Number(settings.weight) || 0) * 5)}-${Math.round((Number(settings.weight) || 0) * 7)} ml 2 à 4 h avant. Urines claires au départ.`],
                    ["🏃 Pendant", "Boire pour limiter la perte à moins de 2 % du poids. Au-delà d'1 h ou s'il fait chaud : boisson avec sodium et glucides."],
                    ["🔁 Après", "1,25 à 1,5 L par kg perdu (pesée avant / après), avec du sel (repas, boisson de récupération)."],
                  ].map(([t, x]) => (
                    <div key={t} style={{ padding: 12, borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
                      <div style={{ fontWeight: 800, color: BLUE, marginBottom: 4 }}>{t}</div>
                      <div style={{ fontSize: 13, color: "#d8cfbd", lineHeight: 1.45 }}>{x}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={CARD_STYLE}>
                <SectionLabel>Calculer mon taux de sudation</SectionLabel>
                <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>Pèse-toi avant et après une séance (sans vêtements mouillés), note ce que tu as bu.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                  {[
                    ["before", "Poids avant (kg)"],
                    ["after", "Poids après (kg)"],
                    ["drunk", "Bu pendant (ml)"],
                    ["min", "Durée (min)"],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <label style={lbl}>{l}</label>
                      <input type="number" inputMode="decimal" value={sweat[k]} onChange={(e) => setSweat({ ...sweat, [k]: e.target.value })} style={FIELD_STYLE} />
                    </div>
                  ))}
                </div>
                {(() => {
                  const n = (v) => Number(String(v).replace(",", "."));
                  const b = n(sweat.before);
                  const a = n(sweat.after);
                  const d = n(sweat.drunk) || 0;
                  const m = n(sweat.min);
                  if (!(b > 0 && a > 0 && m > 0)) return null;
                  const lossL = b - a + d / 1000;
                  const rate = lossL / (m / 60);
                  const pct = ((b - a) / b) * 100;
                  return (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                      <Kpi icon="💦" label="Sueur" value={`${rate.toFixed(2).replace(".", ",")} L/h`} color={BLUE} />
                      <Kpi icon="⚖️" label="Perte de poids" value={`${pct.toFixed(1).replace(".", ",")} %`} color={pct > 2 ? RED : GREEN} sub={pct > 2 ? "> 2 % : performance altérée" : "< 2 % : OK"} />
                      <Kpi icon="🔁" label="À reboire" value={`${Math.max(0, Math.round((b - a) * 1.5 * 10) / 10).toLocaleString("fr-FR")} L`} sub="150 % de la perte" />
                    </div>
                  );
                })()}
              </div>
              <div style={CARD_STYLE}>
                <SectionLabel>Couleur des urines</SectionLabel>
                <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                  {URINE.map((u, i) => (
                    <div key={i} title={u.t} style={{ flex: 1, height: 38, background: u.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: i < 4 ? "#3a342a" : "#f3f0ea" }}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED }}>
                  <span style={{ color: GREEN }}>1-3 : bien hydraté</span>
                  <span style={{ color: ACCENT }}>4-5 : bois davantage</span>
                  <span style={{ color: RED }}>6-8 : déshydraté</span>
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>Repère indicatif (échelle d'Armstrong) : la vitamine B en complément colore les urines en jaune vif.</div>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
