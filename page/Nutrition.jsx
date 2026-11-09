import { TH } from "../component/thresholdsCore";
import WellbeingTabs from "../component/WellbeingTabs";
import React, { useRef, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { db } from "../firebase";
import { Page, PageHeader, Kpi, KpiGrid, FoldCard, useFold, CARD_STYLE, FIELD_STYLE, SectionLabel, TEXT, MUTED, ACCENT } from "../component/ui";
import PersonPicker from "../component/PersonPicker";
import FoodPicker, { EntryEditor } from "../component/FoodPicker";
import { loadTrainingDays } from "../component/trainingDays";
import MealPlanner from "../component/MealPlanner";
import ShoppingList from "../component/ShoppingList";
import { loadBank, publishFood, publishRecipe, deleteBankItem, setPrivateRecipes, recipeToDoc } from "../component/foodBank";
import { setBudget, setUserPrices, setStore } from "../component/prices";
import { useAuth } from "../auth/AuthProvider";
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
  menuShares,
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

/* Pictogramme d'un aliment d'après sa catégorie (⭐ = aliment perso) */
const foodEmoji = (id) => {
  if (String(id || "").startsWith("perso")) return "⭐";
  const f = FOOD_BY_ID[id];
  return (f && FOOD_CATS[f.cat]?.split(" ")[0]) || "🍽️";
};

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

/* Petit anneau d'un macronutriment (valeur en g, % sous l'anneau) */
function MacroRing({ name, value, target, color, hint }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: "1 1 0", minWidth: 0 }}>
      <Ring value={value} target={target} color={color} size={82} stroke={8} label={Math.round(value)} sub={`/ ${Math.round(target)} g`} />
      <div style={{ fontSize: 12.5, fontWeight: 800, color: TEXT, textAlign: "center" }}>
        {name} <span style={{ color: pct >= 90 && pct <= 110 ? GREEN : pct > 115 ? RED : color }}>{pct} %</span>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: MUTED, marginTop: -3 }}>{hint}</div>}
    </div>
  );
}

/* Tuile vitamine / minéral : % en grand, mini-barre, valeur / repère */
function MicroTile({ mi, value, target, supp }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const col = pctColor(pct, mi.limit);
  return (
    <div style={{ padding: "9px 11px", borderRadius: 12, background: "#0d0c0a", border: `1px solid ${col}44`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#c9c1b5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mi.label}</span>
        <span style={{ fontSize: 17, fontWeight: 900, color: col }}>{pct}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#1a1815", margin: "6px 0 5px", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: col, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: MUTED }}>
        {fmtN(mi.k, value)} / {fmtN(mi.k, target)} {mi.unit}
        {mi.limit ? " · plafond" : ""}
        {supp > 0 ? ` · dont ${fmtN(mi.k, supp)} en complément` : ""}
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
/* Gourde interactive : glisser le doigt / la souris de bas en haut pour la remplir (pleine = objectif).
   onDrag(ml) pendant le geste, onCommit(ml) au lâcher. Pas de 50 ml. */
function Bottle({ ml, target, size = 120, onDrag, onCommit }) {
  const pct = target > 0 ? Math.min(1, ml / target) : 0;
  const w = size * 0.7;
  const h = size * 1.5;
  const top = 22;
  const inner = h - 26;
  const fillH = inner * pct;
  const dragging = useRef(false);
  const mlAt = (e, el) => {
    const r = el.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * h; // coordonnées SVG
    const frac = Math.max(0, Math.min(1, (h - 4 - y) / inner));
    return Math.round((frac * target) / 50) * 50;
  };
  const interactive = !!onCommit;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label={`${ml} ml sur ${target}`}
      style={{ touchAction: interactive ? "none" : undefined, cursor: interactive ? "ns-resize" : undefined, flexShrink: 0, userSelect: "none" }}
      onPointerDown={
        interactive
          ? (e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              onDrag && onDrag(mlAt(e, e.currentTarget));
            }
          : undefined
      }
      onPointerMove={interactive ? (e) => dragging.current && onDrag && onDrag(mlAt(e, e.currentTarget)) : undefined}
      onPointerUp={
        interactive
          ? (e) => {
              if (!dragging.current) return;
              dragging.current = false;
              onCommit(mlAt(e, e.currentTarget));
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? () => {
              dragging.current = false;
              onDrag && onDrag(null);
            }
          : undefined
      }
    >
      <defs>
        <clipPath id="btl">
          <rect x={6} y={top} width={w - 12} height={inner} rx={16} />
        </clipPath>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc0f0" />
          <stop offset="1" stopColor="#3a7fc0" />
        </linearGradient>
      </defs>
      <rect x={w / 2 - 12} y={2} width={24} height={14} rx={4} fill="#3a342a" />
      <rect x={6} y={top} width={w - 12} height={inner} rx={16} fill="#0d0c0a" stroke={interactive ? "#5b9bd588" : "#3a342a"} strokeWidth={2} />
      <g clipPath="url(#btl)">
        <rect x={6} y={h - 4 - fillH} width={w - 12} height={fillH} fill="url(#water)" />
        {pct > 0 && pct < 1 && <path d={`M6 ${h - 4 - fillH} q ${(w - 12) / 4} -6 ${(w - 12) / 2} 0 t ${(w - 12) / 2} 0`} fill="#7cc0f0" />}
      </g>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={w - 18} x2={w - 8} y1={h - 4 - inner * t} y2={h - 4 - inner * t} stroke="#6f6a62" strokeWidth={1.5} />
      ))}
      {interactive && pct < 0.92 && (
        <text x={w / 2} y={top + 18} textAnchor="middle" fontSize="10" fill="#6f6a62">
          ⇕
        </text>
      )}
    </svg>
  );
}


/* =====================================================================
   PAGE
   ===================================================================== */
export default function Nutrition() {
  const navigate = useNavigate();
  const ps = usePersonScope();
  const { userProfile, isSuperAdmin } = useAuth();
  // Banque commune d'aliments / recettes (partagée par tous) : chargée une fois, re-rendu à chaque mise à jour
  const [, setBankV] = useState(0);
  useEffect(() => {
    const on = () => setBankV((v) => v + 1);
    window.addEventListener("pt-foodbank", on);
    loadBank();
    return () => window.removeEventListener("pt-foodbank", on);
  }, []);
  const myName = [userProfile?.firstName, userProfile?.lastName ? `${userProfile.lastName[0]}.` : ""].filter(Boolean).join(" ") || "Membre";
  const uid = ps.uid;
  const fold = useFold("nutrition");
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("tab") || "journal";
    if (t === "eau") return "journal"; // ancien onglet Hydratation → la gourde du journal
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
  const focusRef = React.useRef(new URLSearchParams(window.location.search).get("focus") || (new URLSearchParams(window.location.search).get("tab") === "eau" ? "eau" : null));
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null); // réglages en cours d'édition (onglet Objectifs)
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // id du repas où l'on ajoute
  const [editEntry, setEditEntry] = useState(null); // id de l'aliment du journal en cours de modification
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
  // entraînement prévu ce jour-là (Workout + matchs) → type de journée par défaut des jours pas encore remplis
  const [trainDay, setTrainDay] = useState(undefined); // undefined = en cours, null = rien de prévu
  const [waterDrag, setWaterDrag] = useState(null); // ml pendant le glisser dans la gourde
  const [waterEdit, setWaterEdit] = useState(null); // saisie en cours dans le champ « ml »
  useEffect(() => {
    if (!uid || loading) return;
    let alive = true;
    setTrainDay(undefined);
    loadTrainingDays(uid, date, date)
      .then((m) => {
        if (!alive) return;
        const info = m[date] || null;
        setTrainDay(info);
        const saved = history.some((d) => d.date === date && d.dayType);
        const auto = info ? info.dayType : "repos";
        if (!saved) setDay((d) => (d && d.date === date && !d.dayTypeManual ? { ...d, dayType: auto } : d));
      })
      .catch(() => alive && setTrainDay(null));
    return () => {
      alive = false;
    };
  }, [date, uid, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = focusRef.current;
    if (!f || loading || !day || tab !== "journal") return;
    focusRef.current = null;
    const h = new Date().getHours();
    const meal = h < 11 ? "petitdej" : h < 15 ? "dejeuner" : h < 18 ? "collation" : "diner";
    if (f === "repas") setAdding(meal);
    if (f === "eau") return goWater();
    setTimeout(() => {
      const el = document.getElementById(`nutri-meal-${meal}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [loading, day, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Aller à la gourde : carte dépliée si besoin, puis défilement ; recalé une 2e fois si la page a
     bougé entre-temps (contenu chargé au-dessus : graphiques, séances…) */
  const goWater = () => {
    if (tab !== "journal") setTab("journal");
    if (!fold.isOpen("water_day")) fold.toggle("water_day");
    const go = (smooth) => {
      const el = document.getElementById("nutri-eau");
      if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    };
    setTimeout(() => go(true), 80);
    setTimeout(() => {
      const el = document.getElementById("nutri-eau");
      if (el && Math.abs(el.getBoundingClientRect().top) > 140) go(false);
    }, 900);
  };

  const targets = useMemo(() => (settings ? computeTargets(settings, day?.dayType || "modere") : null), [settings, day?.dayType]);
  // budget, prix corrigés et recettes privées de la personne affichée (utilisés par les menus et les courses)
  setBudget(settings?.budgetWeek, settings?.shopPeople);
  setUserPrices(settings?.prices);
  setStore(settings?.store || "");
  setPrivateRecipes(settings?.myRecipes);

  /* Eau : nouvelle quantité totale (glisser / saisie) ; l'écart est noté dans l'historique du jour */
  const setWaterTo = (v) => {
    setWaterDrag(null);
    const cur = day?.water || 0;
    const nv = Math.max(0, Math.round(v));
    if (!day || nv === cur) return;
    saveDay({ ...day, water: nv, waterLog: [...(day.waterLog || []), { t: new Date().toTimeString().slice(0, 5), ml: nv - cur }] });
  };

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
  /* Nouvel aliment perso : « Mes aliments » + banque commune si partagé */
  const addCustomFood = async (food, opts = {}) => {
    await saveSettings({ ...settings, customFoods: [...(settings.customFoods || []), food] }, opts.share ? "✅ Aliment enregistré et partagé" : "✅ Aliment enregistré");
    if (opts.share)
      publishFood(food, myName).catch((e) => alert("Aliment enregistré chez toi, mais pas partagé dans la banque commune (" + e.message + "). La règle Firestore « foodBank » est peut-être à publier."));
  };
  /* Recette créée : banque commune (partagée) ou recette privée (settings.myRecipes) */
  const saveRecipe = async (recipe, share) => {
    if (share) {
      try {
        await publishRecipe(recipe, myName, settings.customFoods || []);
        setSaved("✅ Recette partagée");
        setTimeout(() => setSaved(""), 2500);
        return true;
      } catch (e) {
        alert("Recette non partagée (" + e.message + ") : elle est gardée comme recette perso. La règle Firestore « foodBank » est peut-être à publier.");
      }
    }
    await saveSettings({ ...settings, myRecipes: [...(settings.myRecipes || []), recipeToDoc(recipe)] }, "✅ Recette enregistrée");
    return true;
  };
  const deleteRecipe = async (r) => {
    if (r.private) return saveSettings({ ...settings, myRecipes: (settings.myRecipes || []).filter((x) => x.id !== r.id) }, "🗑 Recette supprimée");
    try {
      await deleteBankItem(r.id);
    } catch (e) {
      alert("Suppression impossible : " + e.message);
    }
  };
  /* Prix corrigé d'un aliment (€ / kg acheté) ; null = retour au prix moyen */
  const savePrice = (foodId, kg) => {
    const pr = { ...(settings.prices || {}) };
    if (kg > 0) pr[foodId] = Math.round(kg * 100) / 100;
    else delete pr[foodId];
    return saveSettings({ ...settings, prices: pr }, "✅ Prix enregistré");
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
  const saveFoodValues = (food, per100, use) => {
    if (!food) return;
    const isCustom = (settings.customFoods || []).some((f) => f.id === food.id);
    if (isCustom) {
      return saveSettings(
        {
          ...settings,
          customFoods: (settings.customFoods || []).map((f) => (f.id === food.id ? { ...f, n: { ...f.n, ...(per100 || {}) }, ...(use ? { cat: use.cat, meals: use.meals } : {}) } : f)),
        },
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
    ["courses", "🛒 Courses"],
    ["supps", "💊 Compléments"],
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

      {!loading && profileOk && day && targets && ["journal", "planning", "supps"].includes(tab) && (
        <KpiGrid min={150}>
          {(() => {
            const pk = targets.kcal > 0 ? totalN.kcal / targets.kcal : 0;
            const pp = targets.p > 0 ? totalN.p / targets.p : 0;
            const pw = targets.water > 0 ? (day.water || 0) / targets.water : 0;
            const c3 = (x, over = 1.1) => (x > over ? RED : x >= 0.9 ? GREEN : x >= 0.5 ? ACCENT : TEXT);
            const SHORT = { repos: "Repos", leger: "Légère", modere: "Modérée", intense: "Intense", match: "Match" };
            const dt = DAY_BY_ID[day.dayType] || DAY_BY_ID.modere;
            return (
              <>
                <Kpi icon="🔥" label={isToday ? "Énergie du jour" : `Énergie · ${date.slice(8, 10)}/${date.slice(5, 7)}`} value={`${Math.round(totalN.kcal).toLocaleString("fr-FR")} kcal`} sub={`objectif ${targets.kcal.toLocaleString("fr-FR")} · ${Math.round(pk * 100)} %`} color={c3(pk)} />
                <Kpi icon="🥩" label="Protéines" value={`${Math.round(totalN.p)} g`} sub={`objectif ${targets.p} g · ${targets.proteinPerKg} g/kg`} color={c3(pp, 1.5)} />
                <Kpi icon="💧" label="Eau" value={`${((day.water || 0) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`} sub={`objectif ${(targets.water / 1000).toLocaleString("fr-FR")} L · toucher → gourde`} color={pw >= 0.9 ? BLUE : c3(pw, 9)} onClick={goWater} />
                <Kpi
                  icon={dt.icon}
                  label="Journée"
                  value={SHORT[day.dayType] || dt.label}
                  sub={trainDay === undefined ? "…" : trainDay?.match ? "match prévu" : trainDay?.sessions.length ? `${trainDay.sessions.length} séance${trainDay.sessions.length > 1 ? "s" : ""} · charge ${Math.round(trainDay.load)} UA` : "pas de séance prévue"}
                  color={day.dayType === "repos" ? MUTED : day.dayType === "match" ? RED : ACCENT}
                />
              </>
            );
          })()}
        </KpiGrid>
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
              {/* ---- Date ---- */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <button className="pt-btn" onClick={() => setDate(shiftISO(date, -1))} aria-label="Jour précédent">
                  ←
                </button>
                <label
                  style={{
                    position: "relative",
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: `1px solid ${isToday ? ACCENT + "88" : BORDER}`,
                    background: isToday ? "rgba(224,161,61,0.08)" : "#0d0c0a",
                    cursor: "pointer",
                  }}
                  title="Choisir une date"
                >
                  <span style={{ fontSize: 15 }}>📅</span>
                  <span style={{ fontWeight: 800, color: TEXT, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isToday ? `Aujourd'hui · ${frDate(date).split(" ").slice(1).join(" ")}` : frDate(date)}
                  </span>
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}
                    aria-label="Date"
                  />
                </label>
                <button className="pt-btn" onClick={() => setDate(shiftISO(date, 1))} disabled={isToday} aria-label="Jour suivant">
                  →
                </button>
              </div>
              {!isToday && (
                <button className="pt-btn" style={{ marginBottom: 10 }} onClick={() => setDate(todayISO())}>
                  ↩ Revenir à aujourd'hui
                </button>
              )}

              {/* ---- Journée : entraînement prévu (Workout) + type ---- */}
              {(() => {
                const auto = trainDay === undefined ? null : trainDay ? trainDay.dayType : "repos";
                const col = trainDay?.match ? RED : trainDay?.sessions.length ? ACCENT : MUTED;
                return (
                  <div style={{ ...CARD_STYLE, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: `${col}1f`, border: `1px solid ${col}66`, flexShrink: 0 }}>
                        {trainDay?.match ? "🏉" : trainDay?.sessions.length ? "🏋️" : "😴"}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>
                          {trainDay === undefined ? "Lecture des séances…" : trainDay?.match ? "Match" : trainDay?.sessions.length ? "Entraînement prévu" : "Pas de séance prévue"}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {trainDay && (trainDay.match || trainDay.sessions.length) ? trainDay.why : "dans Workout"}
                          {auto && day.dayType !== auto ? ` · tu as choisi « ${DAY_BY_ID[day.dayType]?.label} »` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {DAY_TYPES.map((d) => (
                        <button key={d.id} type="button" style={{ ...chip(day.dayType === d.id), padding: "6px 11px", fontSize: 12.5, flexShrink: 0 }} onClick={() => saveDay({ ...day, dayType: d.id, dayTypeManual: true })}>
                          {d.icon} {d.label}
                          {auto === d.id ? <span style={{ fontSize: 10.5, color: GREEN, marginLeft: 4 }}>· Workout</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ---- Résumé visuel ---- */}
              <div style={{ ...CARD_STYLE }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "0 0 auto", margin: "0 auto" }}>
                    <Ring value={totalN.kcal} target={targets.kcal} size={150} stroke={14} label={Math.round(totalN.kcal).toLocaleString("fr-FR")} sub={`/ ${targets.kcal.toLocaleString("fr-FR")} kcal`} />
                    <div style={{ fontSize: 13, fontWeight: 800, color: totalN.kcal > targets.kcal * 1.1 ? RED : TEXT }}>
                      {totalN.kcal <= targets.kcal
                        ? `Reste ${Math.round(targets.kcal - totalN.kcal).toLocaleString("fr-FR")} kcal`
                        : `+${Math.round(totalN.kcal - targets.kcal).toLocaleString("fr-FR")} kcal`}
                    </div>
                  </div>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-around", marginBottom: 12 }}>
                      <MacroRing name="Protéines" value={totalN.p} target={targets.p} color={MACRO_COLOR.p} hint={`${targets.proteinPerKg} g/kg`} />
                      <MacroRing name="Glucides" value={totalN.c} target={targets.c} color={MACRO_COLOR.c} hint={`${targets.carbsPerKg} g/kg`} />
                      <MacroRing name="Lipides" value={totalN.f} target={targets.f} color={MACRO_COLOR.f} />
                    </div>
                    <ProgressRow label="Fibres" value={totalN.fib} target={targets.fib} unit="g" color={MACRO_COLOR.fib} />
                  </div>
                </div>
              </div>

              {/* ---- Repas (2 colonnes sur grand écran) ---- */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))", columnGap: 14, alignItems: "start" }}>
              {MEALS.map((m) => {
                const items = (day.entries || []).filter((e) => (e.meal || "dejeuner") === m.id);
                const t = sumN(items.map((e) => e.n));
                const share = menuShares(targets.kcal, day.dayType)[m.id] || 0;
                const goal = Math.round(targets.kcal * share);
                // pas de séance ce jour-là et rien de noté : on n'affiche pas « Autour de la séance »
                if (!share && !items.length && adding !== m.id) return null;
                const pct = goal > 0 ? t.kcal / goal : 0;
                const col = !items.length ? MUTED : pct > 1.2 ? RED : pct >= 0.8 ? GREEN : ACCENT;
                return (
                  <div key={m.id} id={`nutri-meal-${m.id}`} style={{ ...CARD_STYLE, padding: "12px 14px", scrollMarginTop: "calc(var(--pt-header-h, 60px) + 12px)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "#0d0c0a", border: `1px solid ${BORDER}`, flexShrink: 0 }}>{m.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: MUTED }}>
                          {items.length ? (
                            <>
                              <b style={{ color: col }}>{Math.round(t.kcal)}</b>
                              {goal ? ` / ${goal}` : ""} kcal · P {Math.round(t.p)} · G {Math.round(t.c)} · L {Math.round(t.f)}
                            </>
                          ) : goal ? (
                            `≈ ${goal} kcal conseillées`
                          ) : (
                            "hors répartition"
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Ajouter au ${m.label.toLowerCase()}`}
                        onClick={() => setAdding(adding === m.id ? null : m.id)}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          border: `1px solid ${adding === m.id ? ACCENT : ACCENT + "66"}`,
                          background: adding === m.id ? ACCENT : "rgba(224,161,61,0.1)",
                          color: adding === m.id ? "#0d0c0a" : ACCENT,
                          fontSize: 20,
                          fontWeight: 900,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {adding === m.id ? "−" : "＋"}
                      </button>
                    </div>
                    {goal > 0 && items.length > 0 && (
                      <div style={{ height: 5, borderRadius: 3, background: "#0d0c0a", margin: "10px 0 4px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", background: col, borderRadius: 3 }} />
                      </div>
                    )}
                    {!items.length && adding !== m.id && (
                      <button
                        type="button"
                        onClick={() => setAdding(m.id)}
                        style={{ width: "100%", marginTop: 10, padding: "9px 12px", borderRadius: 10, border: `1px dashed ${BORDER}`, background: "transparent", color: MUTED, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                      >
                        Rien de noté · <span style={{ color: ACCENT, fontWeight: 700 }}>＋ ajouter un aliment</span>
                      </button>
                    )}
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
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13.5 }}>
                        <button
                          type="button"
                          onClick={() => setEditEntry(e.id)}
                          title="Modifier la quantité ou les valeurs"
                          style={{ display: "flex", alignItems: "center", gap: 9, color: TEXT, minWidth: 0, flex: 1, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit" }}
                        >
                          <span style={{ width: 30, height: 30, borderRadius: 9, background: "#0d0c0a", border: `1px solid ${BORDER}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{foodEmoji(e.foodId)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                            <span style={{ color: MUTED, fontSize: 12 }}>
                              {e.grams} g · <b style={{ color: "#c9c1b5" }}>{Math.round(e.n.kcal)} kcal</b> · P {Math.round(e.n.p)}
                            </span>
                          </span>
                        </button>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
                        onSaveCustom={addCustomFood}
                        foodOverrides={settings.foodOverrides}
                        onFoodValues={saveFoodValues}
                      />
                    )}
                  </div>
                );
              })}

              </div>

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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                      {MICROS.map((mi) => (
                        <MicroTile key={mi.k} mi={mi} value={totalN[mi.k]} target={targets.micro[mi.k]} supp={suppN[mi.k]} />
                      ))}
                    </div>
                    {(() => {
                      const low = MICROS.filter((mi) => !mi.limit && totalN[mi.k] < (TH("microMin") / 100) * targets.micro[mi.k]);
                      if (!low.length) return <div style={{ fontSize: 13, color: GREEN, marginTop: 6 }}>✅ Toutes les vitamines et minéraux suivis sont couverts à plus de {TH("microMin")} %.</div>;
                      return (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(224,161,61,0.07)", borderLeft: `3px solid ${ACCENT}` }}>
                          <div style={{ fontWeight: 800, color: ACCENT, fontSize: 12.5, marginBottom: 6 }}>À COMPLÉTER — MEILLEURES SOURCES</div>
                          {low.slice(0, 5).map((mi) => (
                            <div key={mi.k} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 13, color: TEXT, marginBottom: 5 }}>
                                <b>{mi.label}</b> <span style={{ color: MUTED, fontSize: 12 }}>· {mi.why}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {bestSources(mi.k, settings.diet, 3).map((x) => (
                                  <span key={x.f.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "#0d0c0a", border: `1px solid ${BORDER}`, fontSize: 12 }}>
                                    <span>{FOOD_CATS[x.f.cat]?.split(" ")[0]}</span>
                                    <span style={{ color: TEXT }}>{x.f.name}</span>
                                    <b style={{ color: ACCENT }}>
                                      {fmtN(mi.k, x.v)} {mi.unit}
                                    </b>
                                    <span style={{ color: MUTED }}>/ {x.g} g</span>
                                  </span>
                                ))}
                                {mi.k === "vd" && <span style={{ fontSize: 12, color: MUTED, alignSelf: "center" }}>ou un complément de vitamine D en hiver</span>}
                              </div>
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
                  {(() => {
                    const cur = day.water || 0;
                    const shown = waterDrag != null ? waterDrag : cur;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <Bottle ml={shown} target={targets.water} onDrag={setWaterDrag} onCommit={(v) => setWaterTo(v)} />
                        <div>
                          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 }}>BU AUJOURD'HUI</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={50}
                              value={waterDrag != null ? waterDrag : waterEdit ?? cur}
                              onChange={(e) => setWaterEdit(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => {
                                if (waterEdit == null) return;
                                const v = Math.max(0, Math.round(Number(String(waterEdit).replace(",", ".")) || 0));
                                setWaterEdit(null);
                                if (v !== cur) setWaterTo(v);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              aria-label="Millilitres bus"
                              style={{ width: 92, padding: "6px 8px", borderRadius: 10, border: `1px solid ${BLUE}88`, background: "#0d0c0a", color: BLUE, fontSize: 22, fontWeight: 900, textAlign: "right" }}
                            />
                            <span style={{ fontSize: 15, fontWeight: 800, color: BLUE }}>ml</span>
                          </div>
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                            {Math.round((shown / targets.water) * 100)} % de {(targets.water / 1000).toLocaleString("fr-FR")} L
                          </div>
                          <div style={{ fontSize: 11, color: "#6f6a62", marginTop: 6, maxWidth: 140 }}>Glisse dans la gourde ou tape la quantité</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>
                      Objectif : {TH("waterPerKg")} ml/kg + ~{String(TH("waterPerHour") / 1000).replace(".", ",")} L par heure d'entraînement ({DAY_BY_ID[day.dayType]?.label.toLowerCase()}).
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
                        {(day.waterLog || []).map((w) => `${w.t} · ${w.ml > 0 ? "+" : ""}${w.ml} ml`).join("  —  ")}
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

                <SectionLabel>💶 Budget courses</SectionLabel>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={5}
                    value={draft.budgetWeek ?? ""}
                    onChange={(e) => setDraft({ ...draft, budgetWeek: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="ex : 60"
                    aria-label="Budget par semaine en euros"
                    style={{ ...FIELD_STYLE, width: 110 }}
                  />
                  <span style={{ fontSize: 13, color: TEXT }}>€ / semaine</span>
                  {Number(draft.budgetWeek) > 0 && <span style={{ fontSize: 12.5, color: MUTED }}>≈ {(Number(draft.budgetWeek) / 7).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / jour</span>}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
                  Les menus proposés privilégient les recettes qui tiennent dans ce budget, sans sacrifier tes besoins (protéines, glucides…). Vide = pas de contrainte de prix. Prix moyens
                  estimés en grande surface, à corriger dans 🛒 Courses.
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
              onSaveCustom={addCustomFood}
              onJournalAdd={addToJournal}
              onFoodValues={saveFoodValues}
              onCuisines={(cuisines) => saveSettings({ ...settings, cuisines }, "✅ Cuisines enregistrées")}
              onSaveRecipe={saveRecipe}
              onDeleteRecipe={deleteRecipe}
              canModerate={!!isSuperAdmin}
              onGoBudget={() => setTab("objectifs")}
            />
          )}

          {/* ======================= COURSES ======================= */}
          {tab === "courses" && <ShoppingList uid={uid} settings={settings} onPrice={savePrice} onGoPlanning={() => setTab("planning")} onBudget={(bw) => saveSettings({ ...settings, budgetWeek: bw }, "✅ Budget enregistré")} onShopPrefs={(x) => saveSettings({ ...settings, ...x }, "✅ Enregistré")} />}

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

        </>
      )}
    </Page>
  );
}
