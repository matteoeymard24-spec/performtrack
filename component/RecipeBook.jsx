import React, { useMemo, useState } from "react";
import { FIELD_STYLE, TEXT, MUTED, ACCENT } from "./ui";
import { FOOD_BY_ID, MEALS, allowedByDiet } from "./nutritionData";
import { RECIPES, CUISINES, CUISINE_BY_ID } from "./recipes";
import { recipeForMeal } from "./mealPlan";

/* =====================================================================
   RecipeBook.jsx — Nutrition › Planning › 📖 Livre de recettes
   Recettes classées par cuisine, filtrables par repas et par nom. Un clic sur un repas
   met la recette dans le menu du jour sélectionné, quantités calculées pour tes besoins.
   ===================================================================== */

const BORDER = "#2a2620";
const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));
const MEAL_FILTERS = [
  { id: "", label: "Tous les repas" },
  { id: "petitdej", label: "🌅 Petit-déj" },
  { id: "dejeuner", label: "🍽️ Plats" },
  { id: "collation", label: "🍎 Collations" },
  { id: "seance", label: "🏃 Autour de la séance" },
];
const chip = (on) => ({
  padding: "6px 11px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  border: `1px solid ${on ? ACCENT : BORDER}`,
  background: on ? `${ACCENT}26` : "#0d0c0a",
  color: on ? TEXT : MUTED,
  whiteSpace: "nowrap",
});
const norm = (x) =>
  String(x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const PAGE = 24;

export default function RecipeBook({ diet = "omni", targetsFor, customFoods, overrides, dayLabel, onUse, onClose }) {
  const [cuisine, setCuisine] = useState("");
  const [meal, setMeal] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  // aliment du levier réellement utilisé selon le régime (1re alternative compatible)
  const pick = (ids) => ids.map((id) => FOOD_BY_ID[id]).find((f) => f && allowedByDiet(f, diet)) || FOOD_BY_ID[ids[ids.length - 1]];

  const list = useMemo(() => {
    const nq = norm(q);
    return RECIPES.filter((r) => (!cuisine || r.cuisine === cuisine) && (!meal || r.meals.includes(meal)))
      .filter((r) => {
        if (!nq) return true;
        const ing = [...r.fixed.map((x) => x[0]), ...r.P, ...r.C, ...r.F].map((id) => FOOD_BY_ID[id]?.name || "").join(" ");
        return norm(`${r.name} ${CUISINE_BY_ID[r.cuisine]?.label} ${ing}`).includes(nq);
      });
  }, [cuisine, meal, q]);

  const counts = useMemo(() => {
    const c = {};
    RECIPES.forEach((r) => {
      if (meal && !r.meals.includes(meal)) return;
      c[r.cuisine] = (c[r.cuisine] || 0) + 1;
    });
    return c;
  }, [meal]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${ACCENT}55`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 800, color: TEXT }}>
          📖 Livre de recettes <span style={{ color: MUTED, fontWeight: 600, fontSize: 12.5 }}>· {RECIPES.length} recettes</span>
        </div>
        <button type="button" className="pt-btn" style={{ padding: "4px 10px" }} onClick={onClose}>
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>
        Choisis une recette puis le repas : elle remplace ce repas du <b style={{ color: TEXT }}>{dayLabel}</b>, quantités calculées pour tes besoins.
        {diet !== "omni" ? " Les viandes / poissons sont remplacés par l'alternative de ton régime." : ""}
      </div>

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setShown(PAGE);
        }}
        placeholder="🔎 Rechercher (nom, ingrédient…)"
        style={{ ...FIELD_STYLE, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {MEAL_FILTERS.map((m) => (
          <button
            key={m.id}
            type="button"
            style={chip(meal === m.id)}
            onClick={() => {
              setMeal(m.id);
              setShown(PAGE);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button
          type="button"
          style={chip(!cuisine)}
          onClick={() => {
            setCuisine("");
            setShown(PAGE);
          }}
        >
          Toutes
        </button>
        {CUISINES.filter((c) => counts[c.id]).map((c) => (
          <button
            key={c.id}
            type="button"
            style={chip(cuisine === c.id)}
            onClick={() => {
              setCuisine(cuisine === c.id ? "" : c.id);
              setShown(PAGE);
            }}
          >
            {c.flag} {c.label} <span style={{ opacity: 0.7 }}>{counts[c.id]}</span>
          </button>
        ))}
      </div>

      {!list.length && <div style={{ fontSize: 13, color: MUTED, padding: "10px 0" }}>Aucune recette ne correspond.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
        {list.slice(0, shown).map((r) => {
          const c = CUISINE_BY_ID[r.cuisine];
          const tpl = { ...r, rid: r.id };
          const firstMeal = meal && r.meals.includes(meal) ? meal : r.meals[0];
          const { t } = targetsFor(firstMeal);
          const est = t ? recipeForMeal(t, firstMeal, tpl, diet, customFoods, overrides).items : [];
          const kcal = est.reduce((s, x) => s + (x.n?.kcal || 0), 0);
          const prot = est.reduce((s, x) => s + (x.n?.p || 0), 0);
          const main = [pick(r.P), pick(r.C)].filter(Boolean).map((f) => f.name);
          const extra = r.fixed
            .map(([id]) => FOOD_BY_ID[id])
            .filter((f) => f && allowedByDiet(f, diet))
            .map((f) => f.name.toLowerCase());
          const veg = diet !== "omni" && FOOD_BY_ID[r.P[0]] && !allowedByDiet(FOOD_BY_ID[r.P[0]], diet);
          return (
            <div key={r.id} style={{ padding: 10, borderRadius: 10, background: "#151310", border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {c?.flag} {c?.label}
                  {veg ? " · 🌱 version adaptée" : ""}
                </div>
                <div style={{ fontWeight: 800, color: TEXT, fontSize: 14, lineHeight: 1.25 }}>{r.name}</div>
              </div>
              <div style={{ fontSize: 12, color: "#c9c1b5", lineHeight: 1.4 }}>
                <b style={{ color: TEXT }}>{main.join(" · ")}</b>
                {extra.length ? ` · ${extra.join(", ")}` : ""}
              </div>
              {kcal > 0 && (
                <div style={{ fontSize: 11.5, color: MUTED }}>
                  ≈ <b style={{ color: ACCENT }}>{Math.round(kcal)} kcal</b> · P {Math.round(prot)} g pour ton {MEAL_BY_ID[firstMeal]?.label.toLowerCase()}
                </div>
              )}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
                {r.meals.map((mid) => (
                  <button key={mid} type="button" className="pt-btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => onUse(tpl, mid)}>
                    + {MEAL_BY_ID[mid]?.icon} {MEAL_BY_ID[mid]?.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {list.length > shown && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button type="button" className="pt-btn" onClick={() => setShown(shown + PAGE)}>
            Voir plus ({list.length - shown} autres)
          </button>
        </div>
      )}
    </div>
  );
}
