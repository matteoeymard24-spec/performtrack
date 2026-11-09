import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CARD_STYLE, FIELD_STYLE, TEXT, MUTED, ACCENT } from "./ui";
import FoodPicker from "./FoodPicker";
import { appConfirm, appAlert as alert } from "./appDialog";
import { computeTargets, DAY_TYPES, DAY_BY_ID, MICROS, fmtN, todayISO, shiftISO, bestSources } from "./nutritionData";
import { CUISINES, CUISINE_BY_ID } from "./recipes";
import RecipeBook from "./RecipeBook";
import {
  recommendDay,
  nextMealOption,
  recipeForMeal,
  rebalanceMeal,
  alternatives,
  makeItem,
  foodOf,
  mealTotal,
  planTotal,
  dayCheck,
  planMeals,
  STATUS_UI,
  MEAL_BY_ID,
} from "./mealPlan";

/* =====================================================================
   MealPlanner.jsx — Nutrition › 🗓️ Planning : menus de la semaine.
   Chaque jour : type de journée → besoins ; menu recommandé (macros + micros),
   « Autre proposition », changer un repas, remplacer / ajouter / retirer un aliment,
   réajuster les quantités, et badge « dans les clous ». Envoi au journal (repas mangé).
   ===================================================================== */

const GREEN = "#4fae7d";
const RED = "#d9695a";
const BORDER = "#2a2620";
const MACRO_COLOR = { p: "#d9695a", c: "#e0a13d", f: "#5b9bd5" };
const ROLE_TAG = { P: "protéines", C: "glucides", F: "lipides" };
const uidN = () => Math.random().toString(36).slice(2, 10);
const mondayOf = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  const dow = x.getDay();
  return shiftISO(iso, dow === 0 ? -6 : 1 - dow);
};
const dayLabel = (iso, opts) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", opts);
};
const chip = (on, color = ACCENT) => ({
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  border: `1px solid ${on ? color : BORDER}`,
  background: on ? `${color}26` : "#0d0c0a",
  color: on ? TEXT : MUTED,
  whiteSpace: "nowrap",
});
const iconBtn = (c = MUTED) => ({
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid ${c}55`,
  background: "transparent",
  color: c,
  cursor: "pointer",
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

/* Petite barre « valeur / objectif » avec la zone conseillée */
function Gauge({ label, v, t, unit, color, tol = 0.1 }) {
  const pct = t > 0 ? v / t : 0;
  const ok = Math.abs(pct - 1) <= tol;
  const max = 1.4;
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: TEXT, fontWeight: 700 }}>{label}</span>
        <span style={{ color: MUTED }}>
          <b style={{ color: ok ? GREEN : pct < 1 ? ACCENT : RED }}>{Math.round(v)}</b>/{Math.round(t)} {unit}
        </span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "#0d0c0a", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: `${((1 - tol) / max) * 100}%`, width: `${((2 * tol) / max) * 100}%`, top: 0, bottom: 0, background: "rgba(79,174,125,0.25)" }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(1, pct / max) * 100}%`, background: color, borderRadius: 4, opacity: 0.9 }} />
        <div style={{ position: "absolute", left: `${(1 / max) * 100}%`, top: -1, bottom: -1, width: 2, background: TEXT, opacity: 0.6 }} />
      </div>
    </div>
  );
}

export default function MealPlanner({ uid, settings, onSaveCustom, onJournalAdd, onFoodValues, onCuisines }) {
  const diet = settings?.diet || "omni";
  const customFoods = settings?.customFoods || [];
  const cuisines = settings?.cuisines || []; // [] = toutes les cuisines
  const [showCuisines, setShowCuisines] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [sel, setSel] = useState(todayISO());
  const [plans, setPlans] = useState({}); // date → plan
  const [loading, setLoading] = useState(true);
  const [rank, setRank] = useState({}); // date → rang de la proposition
  const [mealIdx, setMealIdx] = useState({}); // `${date}_${meal}` → modèle
  const [adding, setAdding] = useState(null); // id du repas où l'on ajoute
  const [swap, setSwap] = useState(null); // `${meal}_${i}`
  const saveTimers = useRef({});

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftISO(weekStart, i)), [weekStart]);

  // chargement de la semaine
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setLoading(true);
    Promise.all(days.map((d) => getDoc(doc(db, "users", uid, "nutrition", `plan_${d}`)).catch(() => null)))
      .then((snaps) => {
        if (!alive) return;
        const next = {};
        snaps.forEach((sn, i) => {
          if (sn && sn.exists()) next[days[i]] = sn.data();
        });
        setPlans((p) => ({ ...p, ...next }));
      })
      .finally(() => alive && setLoading(false));
    if (!days.includes(sel)) setSel(days[0]);
    return () => {
      alive = false;
    };
  }, [uid, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetsOf = (d) => computeTargets(settings, plans[d]?.dayType || "modere");

  /* enregistrement (différé : on peut taper des grammes sans écrire à chaque touche) */
  const persist = (date, plan) => {
    clearTimeout(saveTimers.current[date]);
    saveTimers.current[date] = setTimeout(() => {
      const ref = doc(db, "users", uid, "nutrition", `plan_${date}`);
      (plan ? setDoc(ref, { ...plan, date, updatedAt: new Date().toISOString() }) : deleteDoc(ref)).catch((e) => alert("Planning non enregistré : " + e.message));
    }, 500);
  };
  const setPlan = (date, plan) => {
    setPlans((p) => {
      const n = { ...p };
      if (plan) n[date] = plan;
      else delete n[date];
      return n;
    });
    persist(date, plan);
  };
  useEffect(() => () => Object.values(saveTimers.current).forEach(clearTimeout), []);

  const recommend = (date, r = 0, dayType) => {
    const dt = dayType || plans[date]?.dayType || "modere";
    const t = computeTargets(settings, dt);
    // recettes déjà prévues les autres jours de la semaine → évitées si possible (variété)
    const avoid = days.filter((d) => d !== date).flatMap((d) => (plans[d]?.meals || []).map((m) => m.recipe?.rid).filter(Boolean));
    const rec = recommendDay(t, { diet, rank: r, customFoods, overrides: settings?.foodOverrides, cuisines, avoid });
    if (!rec) return;
    setRank((x) => ({ ...x, [date]: rec.rank }));
    setPlan(date, { dayType: dt, meals: rec.meals });
    return rec;
  };
  const fillWeek = async () => {
    const empty = days.filter((d) => !plans[d]);
    if (!empty.length) return alert("Tous les jours de la semaine ont déjà un menu.");
    // un rang différent par jour + recettes déjà prévues évitées → des menus variés
    const used = days.flatMap((d) => (plans[d]?.meals || []).map((m) => m.recipe?.rid).filter(Boolean));
    empty.forEach((d, i) => {
      const dt = plans[d]?.dayType || "modere";
      const rec = recommendDay(computeTargets(settings, dt), { diet, rank: i * 7 + 1, customFoods, overrides: settings?.foodOverrides, cuisines, avoid: used });
      if (!rec) return;
      rec.meals.forEach((m) => m.recipe?.rid && used.push(m.recipe.rid));
      setRank((x) => ({ ...x, [d]: rec.rank }));
      setPlan(d, { dayType: dt, meals: rec.meals });
    });
  };
  /* Recette choisie dans le livre → mise à l'échelle du repas du jour sélectionné */
  const useRecipe = (tpl, mealId) => {
    const dt = plans[sel]?.dayType || "modere";
    const tt = computeTargets(settings, dt);
    const { items, recipe } = recipeForMeal(tt, mealId, tpl, diet, customFoods, settings?.foodOverrides);
    const cur = plans[sel] || { dayType: dt, meals: [] };
    const meals = cur.meals.some((m) => m.id === mealId) ? cur.meals.map((m) => (m.id === mealId ? { ...m, items, recipe } : m)) : [...cur.meals, { id: mealId, items, recipe }];
    setPlan(sel, { ...cur, meals });
    setShowBook(false);
  };

  const plan = plans[sel];
  const t = targetsOf(sel);
  const T = plan ? planTotal(plan) : null;
  const check = plan && t ? dayCheck(T, t, diet) : null;

  const updateMeal = (mealId, fn) => {
    if (!plan) return;
    const meals = planMeals(t).map((m) => plan.meals.find((x) => x.id === m.id) || { id: m.id, items: [] });
    // garder aussi un repas hors répartition s'il contient des aliments (ex. « Autour de la séance » ajouté à la main)
    plan.meals.forEach((m) => !meals.find((x) => x.id === m.id) && meals.push(m));
    setPlan(sel, { ...plan, meals: meals.map((m) => (m.id === mealId ? fn(m) : m)) });
  };

  const sendToJournal = async (date, meals) => {
    const entries = meals.flatMap((m) => (m.items || []).map((x) => ({ id: uidN(), meal: m.id, foodId: x.foodId, name: x.name, grams: x.g, n: x.n })));
    if (!entries.length) return;
    await onJournalAdd(date, entries, plans[date]?.dayType);
  };

  if (!settings) return null;
  const today = todayISO();

  return (
    <div>
      {/* ---- Semaine ---- */}
      <div style={{ ...CARD_STYLE, paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="pt-btn" onClick={() => setWeekStart(shiftISO(weekStart, -7))} aria-label="Semaine précédente">
            ←
          </button>
          <div style={{ fontWeight: 800, color: TEXT, minWidth: 200, textAlign: "center" }}>
            Semaine du {dayLabel(days[0], { day: "numeric", month: "short" })} au {dayLabel(days[6], { day: "numeric", month: "short" })}
          </div>
          <button className="pt-btn" onClick={() => setWeekStart(shiftISO(weekStart, 7))} aria-label="Semaine suivante">
            →
          </button>
          {weekStart !== mondayOf(today) && (
            <button
              className="pt-btn"
              onClick={() => {
                setWeekStart(mondayOf(today));
                setSel(today);
              }}
            >
              Cette semaine
            </button>
          )}
          <button className="pt-btn pt-btn--primary" style={{ marginLeft: "auto" }} onClick={fillWeek} disabled={loading}>
            ✨ Remplir les jours vides
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button type="button" style={chip(showCuisines)} onClick={() => setShowCuisines(!showCuisines)}>
            🌍 Cuisines : {cuisines.length ? cuisines.map((c) => CUISINE_BY_ID[c]?.flag).join(" ") : "toutes"}
          </button>
          <button type="button" style={chip(showBook)} onClick={() => setShowBook(!showBook)}>
            📖 Livre de recettes
          </button>
        </div>
        {showCuisines && (
          <div style={{ padding: 10, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${BORDER}`, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>Les menus proposés ne piochent que dans les cuisines choisies (aucune = toutes).</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={chip(!cuisines.length)} onClick={() => onCuisines && onCuisines([])}>
                Toutes
              </button>
              {CUISINES.map((c) => {
                const on = cuisines.includes(c.id);
                return (
                  <button key={c.id} type="button" style={chip(on)} onClick={() => onCuisines && onCuisines(on ? cuisines.filter((x) => x !== c.id) : [...cuisines, c.id])}>
                    {c.flag} {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {showBook && (
          <RecipeBook
            diet={diet}
            targetsFor={(mealId) => ({ t: computeTargets(settings, plans[sel]?.dayType || "modere"), mealId })}
            customFoods={customFoods}
            overrides={settings?.foodOverrides}
            dayLabel={dayLabel(sel, { weekday: "long", day: "numeric", month: "short" })}
            onUse={useRecipe}
            onClose={() => setShowBook(false)}
          />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
          {days.map((d) => {
            const p = plans[d];
            const tt = targetsOf(d);
            const tot = p ? planTotal(p) : null;
            const ck = p && tt ? dayCheck(tot, tt, diet) : null;
            const st = ck ? STATUS_UI[ck.status] : null;
            const on = d === sel;
            const pct = tot && tt ? Math.min(1.2, tot.kcal / tt.kcal) : 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setSel(d);
                  setAdding(null);
                  setSwap(null);
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 8px 10px",
                  borderRadius: 12,
                  border: `${on ? 2 : 1}px solid ${on ? ACCENT : st ? st.color + "66" : BORDER}`,
                  background: on ? "rgba(224,161,61,0.08)" : "#0d0c0a",
                  color: TEXT,
                  cursor: "pointer",
                  minWidth: 0,
                  font: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: "capitalize", color: d === today ? ACCENT : TEXT }}>{dayLabel(d, { weekday: "short" })}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>{dayLabel(d, { day: "numeric" })}</span>
                </div>
                <div style={{ fontSize: 15, margin: "4px 0 2px" }}>{p ? DAY_BY_ID[p.dayType || "modere"]?.icon : "＋"}</div>
                {p ? (
                  <>
                    <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{Math.round(tot.kcal)} kcal</div>
                    <div style={{ height: 4, borderRadius: 2, background: "#1a1815", marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(pct / 1.2) * 100}%`, height: "100%", background: st.color }} />
                    </div>
                    <div style={{ fontSize: 10.5, color: st.color, fontWeight: 800, marginTop: 4, whiteSpace: "nowrap" }}>
                      {st.icon} {ck.status === "ok" ? "OK" : st.label}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "#6f6a62" }}>à planifier</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Jour choisi ---- */}
      <div style={CARD_STYLE}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: TEXT, textTransform: "capitalize" }}>{dayLabel(sel, { weekday: "long", day: "numeric", month: "long" })}</div>
          {plan && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="pt-btn" onClick={() => recommend(sel, (rank[sel] ?? 0) + 1)} title="Autre combinaison de repas, classée selon tes besoins">
                🔄 Autre proposition
              </button>
              <button
                className="pt-btn"
                onClick={() => setPlan(sel, { ...plan, meals: plan.meals.map((m) => rebalanceMeal(m, t, customFoods)) })}
                title="Recalcule les quantités pour coller aux besoins"
              >
                ⚖️ Réajuster
              </button>
              <button
                className="pt-btn"
                onClick={async () => {
                  if (await appConfirm(`Ajouter tout le menu au journal du ${dayLabel(sel, { day: "numeric", month: "long" })} ?`, { ok: "Ajouter", danger: false })) sendToJournal(sel, plan.meals);
                }}
              >
                📥 Tout au journal
              </button>
              <button
                className="pt-btn"
                style={{ color: RED }}
                onClick={async () => {
                  if (await appConfirm("Vider le menu de ce jour ?")) setPlan(sel, null);
                }}
              >
                🗑
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {DAY_TYPES.map((d) => (
            <button
              key={d.id}
              type="button"
              style={chip((plan?.dayType || "modere") === d.id)}
              onClick={() => {
                if (!plan) return recommend(sel, 0, d.id);
                // nouveau type de journée = nouveaux besoins : on réajuste les quantités du menu
                const nt = computeTargets(settings, d.id);
                setPlan(sel, { ...plan, dayType: d.id, meals: plan.meals.map((m) => rebalanceMeal(m, nt, customFoods)) });
              }}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>

        {!plan ? (
          <div style={{ textAlign: "center", padding: "26px 10px", borderRadius: 12, border: `1px dashed ${BORDER}` }}>
            <div style={{ fontSize: 14, color: MUTED, marginBottom: 12 }}>Pas encore de menu pour ce jour. Choisis le type de journée puis :</div>
            <button className="pt-btn pt-btn--primary" onClick={() => recommend(sel, 0)} disabled={loading}>
              ✨ Recommander un menu
            </button>
          </div>
        ) : (
          <>
            {/* ---- Dans les clous ? ---- */}
            {check && (
              <div style={{ padding: 12, borderRadius: 12, background: `${STATUS_UI[check.status].color}12`, border: `1px solid ${STATUS_UI[check.status].color}66`, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: STATUS_UI[check.status].color }}>
                    {STATUS_UI[check.status].icon} {STATUS_UI[check.status].label}
                  </span>
                  <span style={{ fontSize: 12.5, color: check.issues.length ? TEXT : MUTED }}>
                    {check.issues.length ? check.issues.join(" · ") : "énergie, macros et vitamines / minéraux couverts"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <Gauge label="Énergie" v={T.kcal} t={t.kcal} unit="kcal" color={ACCENT} tol={0.1} />
                  <Gauge label="Protéines" v={T.p} t={t.p} unit="g" color={MACRO_COLOR.p} tol={0.1} />
                  <Gauge label="Glucides" v={T.c} t={t.c} unit="g" color={MACRO_COLOR.c} tol={0.15} />
                  <Gauge label="Lipides" v={T.f} t={t.f} unit="g" color={MACRO_COLOR.f} tol={0.2} />
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {MICROS.map((m) => {
                    const pct = Math.round(((T[m.k] || 0) / (t.micro[m.k] || 1)) * 100);
                    const c = m.limit ? (pct > 150 ? RED : GREEN) : pct >= 100 ? GREEN : pct >= 70 ? ACCENT : RED;
                    return (
                      <span key={m.k} title={`${fmtN(m.k, T[m.k])} / ${t.micro[m.k]} ${m.unit}`} style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 999, border: `1px solid ${c}66`, color: c, background: `${c}14`, fontWeight: 700 }}>
                        {m.label.replace("Vitamine ", "Vit. ").replace("Oméga-3 EPA + DHA", "Oméga-3")} {pct} %
                      </span>
                    );
                  })}
                </div>
                {check.lowMicros.length > 0 && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                    Pour compléter :{" "}
                    {check.lowMicros
                      .slice(0, 3)
                      .map((m) => `${m.label.toLowerCase()} → ${bestSources(m.k, diet, 2).map((x) => x.f.name.toLowerCase()).join(" ou ")}`)
                      .join(" · ")}
                    {check.lowMicros.some((m) => m.k === "o3") && diet === "vege" ? " (en végétarien : oméga-3 d'algues en complément)" : ""}
                  </div>
                )}
              </div>
            )}

            {/* ---- Repas ---- */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
              {[...planMeals(t).map((m) => m.id), ...plan.meals.map((m) => m.id)]
                .filter((id, i, a) => a.indexOf(id) === i)
                .map((mid) => {
                  const meal = plan.meals.find((m) => m.id === mid) || { id: mid, items: [] };
                  const info = MEAL_BY_ID[mid];
                  const tot = mealTotal(meal);
                  const key = `${sel}_${mid}`;
                  return (
                    <div key={mid} style={{ padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ fontWeight: 800, color: TEXT }}>
                          {info?.icon} {info?.label || mid}
                          <span style={{ fontSize: 12, color: ACCENT, fontWeight: 800, marginLeft: 8 }}>{Math.round(tot.kcal)} kcal</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            title="Autre recette pour ce repas (mêmes besoins)"
                            style={iconBtn(ACCENT)}
                            onClick={() => {
                              const idx = (mealIdx[key] ?? 0) + 1;
                              setMealIdx((x) => ({ ...x, [key]: idx }));
                              const nx = nextMealOption(t, mid, diet, idx, customFoods, settings?.foodOverrides, cuisines);
                              if (nx) updateMeal(mid, (m) => ({ ...m, items: nx.items, recipe: nx.recipe }));
                            }}
                          >
                            🔄
                          </button>
                          <button type="button" title="Ajouter un aliment" style={iconBtn(TEXT)} onClick={() => setAdding(adding === mid ? null : mid)}>
                            ＋
                          </button>
                        </div>
                      </div>
                      {meal.recipe?.name && (
                        <div style={{ fontSize: 12.5, color: "#c9c1b5", marginBottom: 6, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span>{CUISINE_BY_ID[meal.recipe.cuisine]?.flag || "🍽️"}</span>
                          <b style={{ color: TEXT }}>{meal.recipe.name}</b>
                          {meal.recipe.withFood && <span style={{ color: ACCENT, fontSize: 11.5 }}>· avec {meal.recipe.withFood}</span>}
                        </div>
                      )}
                      {(meal.items || []).map((it, i) => {
                        const sk = `${mid}_${i}`;
                        const alts = swap === sk ? alternatives(it, diet, customFoods) : [];
                        return (
                          <div key={sk} style={{ borderTop: `1px solid ${BORDER}`, padding: "6px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: TEXT }}>
                                {it.name}
                                {ROLE_TAG[it.role] && <span style={{ fontSize: 10.5, color: MACRO_COLOR[it.role.toLowerCase()], marginLeft: 6, fontWeight: 700 }}>· {ROLE_TAG[it.role]}</span>}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="5"
                                value={it.g}
                                onChange={(e) => {
                                  const g = Math.max(0, Number(e.target.value) || 0);
                                  const food = foodOf(it.foodId, customFoods);
                                  updateMeal(mid, (m) => ({ ...m, items: m.items.map((x, j) => (j === i ? (food ? makeItem(food, g, x.role) : { ...x, g }) : x)) }));
                                }}
                                style={{ ...FIELD_STYLE, width: 70, padding: "5px 6px", textAlign: "right" }}
                                aria-label={`Quantité de ${it.name} (g)`}
                              />
                              <span style={{ fontSize: 12, color: MUTED }}>g</span>
                              <button type="button" title="Remplacer cet aliment" style={iconBtn(swap === sk ? ACCENT : MUTED)} onClick={() => setSwap(swap === sk ? null : sk)}>
                                🔁
                              </button>
                              <button type="button" title="Retirer" style={iconBtn(RED)} onClick={() => updateMeal(mid, (m) => ({ ...m, items: m.items.filter((_, j) => j !== i) }))}>
                                ✕
                              </button>
                            </div>
                            {swap === sk && (
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                                {alts.length ? (
                                  alts.slice(0, 14).map((f) => (
                                    <button
                                      key={f.id}
                                      type="button"
                                      style={{ ...chip(false), padding: "4px 10px", fontSize: 12 }}
                                      onClick={() => {
                                        // nouvel aliment au même rôle, puis quantités recalculées pour garder les besoins du repas
                                        updateMeal(mid, (m) => rebalanceMeal({ ...m, items: m.items.map((x, j) => (j === i ? makeItem(f, x.g, x.role) : x)) }, t, customFoods));
                                        setSwap(null);
                                      }}
                                    >
                                      {f.name}
                                    </button>
                                  ))
                                ) : (
                                  <span style={{ fontSize: 12, color: MUTED }}>Pas d'équivalent dans la liste.</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!(meal.items || []).length && <div style={{ fontSize: 12.5, color: MUTED, padding: "6px 0" }}>Vide — 🔄 pour une idée de repas ou ＋ pour ajouter.</div>}
                      {adding === mid && (
                        <FoodPicker
                          customFoods={customFoods}
                          diet={diet}
                          meal={mid}
                          onClose={() => setAdding(null)}
                          onAdd={(entry) => {
                            // aliment aux valeurs modifiées : on garde les valeurs saisies (entry.n)
                            const food = settings?.foodOverrides?.[entry.foodId] ? null : foodOf(entry.foodId, customFoods);
                            updateMeal(mid, (m) => ({ ...m, items: [...(m.items || []), food ? makeItem(food, entry.grams, "fixe") : { foodId: entry.foodId, name: entry.name, g: entry.grams, role: "fixe", n: entry.n }] }));
                          }}
                          onSaveCustom={onSaveCustom}
                          foodOverrides={settings?.foodOverrides}
                          onFoodValues={onFoodValues}
                        />
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <span style={{ fontSize: 11.5, color: MUTED }}>
                          P {Math.round(tot.p)} · G {Math.round(tot.c)} · L {Math.round(tot.f)} g
                        </span>
                        {(meal.items || []).length > 0 && (
                          <button
                            type="button"
                            className="pt-btn"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => sendToJournal(sel, [meal])}
                            title="Ajouter ce repas au journal de ce jour"
                          >
                            ✓ Mangé → journal
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>
              🔄 change un repas · 🔁 remplace un aliment (les quantités du repas sont recalculées) · ⚖️ réajuste toute la journée · les quantités restent modifiables à la main.
              {" "}📖 Le livre de recettes (classé par cuisine) permet de choisir une recette précise. ⭐ Tes aliments créés entrent dans les menus proposés (catégorie et repas réglables via ✏️ Valeurs) : plus tu en crées, plus les menus varient.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
