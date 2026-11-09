import React, { useEffect } from "react";
import { TEXT, MUTED, ACCENT } from "./ui";
import { FOOD_BY_ID, FOOD_CATS, MEALS } from "./nutritionData";
import { RECIPE_BY_ID, CUISINE_BY_ID } from "./recipes";
import { bankRecipes } from "./bankCore";
import { foodOf, mealTotal, mealCost } from "./mealPlan";
import { fmtEur } from "./prices";
import { mealSteps, rawOf } from "./recipeSteps";

/* =====================================================================
   RecipeView.jsx — fiche recette d'un repas du Planning (clic sur le repas) :
   ingrédients (grammes dans l'assiette + quantité crue / sèche à préparer), durée, prix, apports,
   étapes de préparation (texte de l'auteur pour les recettes des membres + étapes déduites des
   ingrédients, voir recipeSteps.js).
   ===================================================================== */
const BORDER = "#2a2620";
const GREEN = "#4fae7d";
const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));

export default function RecipeView({ meal, dayLabel, customFoods = [], onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (!meal) return null;
  const rid = meal.recipe?.rid;
  const src = (rid && (RECIPE_BY_ID[rid] || bankRecipes().find((r) => r.id === rid))) || null;
  const info = MEAL_BY_ID[meal.id];
  const tot = mealTotal(meal);
  const cost = mealCost(meal, customFoods);
  const steps = mealSteps(meal, src, (id) => foodOf(id, customFoods));
  const cu = CUISINE_BY_ID[meal.recipe?.cuisine];
  const items = (meal.items || []).map((x) => ({ ...x, food: FOOD_BY_ID[x.foodId] || foodOf(x.foodId, customFoods) || { id: x.foodId, name: x.name, cat: "" } }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Recette : ${meal.recipe?.name || info?.label}`}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "92dvh",
          overflowY: "auto",
          background: "#151310",
          border: `1px solid ${BORDER}`,
          borderRadius: "18px 18px 0 0",
          padding: "16px 16px 28px",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {info?.icon} {info?.label}
              {dayLabel ? ` · ${dayLabel}` : ""}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: TEXT, lineHeight: 1.2, marginTop: 4 }}>
              {cu?.flag ? `${cu.flag} ` : ""}
              {meal.recipe?.name || "Repas composé"}
            </div>
            {meal.recipe?.withFood && <div style={{ fontSize: 12.5, color: ACCENT, marginTop: 2 }}>avec {meal.recipe.withFood}</div>}
          </div>
          <button type="button" className="pt-btn" onClick={onClose} aria-label="Fermer la recette" style={{ padding: "4px 11px", flexShrink: 0 }}>
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, margin: "14px 0" }}>
          {[
            ["⏱️", `${src?.time || 25} min`, "préparation"],
            ["🔥", `${Math.round(tot.kcal)}`, "kcal"],
            ["🥩", `${Math.round(tot.p)} g`, "protéines"],
            ["💶", fmtEur(cost), "estimé"],
          ].map(([ic, v, l]) => (
            <div key={l} style={{ padding: "8px 6px", borderRadius: 12, background: "#0d0c0a", border: `1px solid ${BORDER}`, textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: l === "estimé" ? GREEN : TEXT, whiteSpace: "nowrap" }}>
                {ic} {v}
              </div>
              <div style={{ fontSize: 10.5, color: MUTED }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Glucides {Math.round(tot.c)} g · lipides {Math.round(tot.f)} g · fibres {Math.round(tot.fib || 0)} g · quantités pour <b style={{ color: TEXT }}>1 personne</b>, calculées pour tes besoins
        </div>

        <div style={{ fontSize: 12, color: MUTED, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>INGRÉDIENTS</div>
        <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden", marginBottom: 16 }}>
          {items.map((x, i) => {
            const raw = rawOf(x.food, x.g);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? `1px solid ${BORDER}` : "none", background: "#0d0c0a" }}>
                <span style={{ width: 22, textAlign: "center", flexShrink: 0 }}>{FOOD_CATS[x.food.cat]?.split(" ")[0] || "⭐"}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: TEXT }}>{x.food.name}</span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <b style={{ color: ACCENT, fontSize: 13.5 }}>{x.g} g</b>
                  {raw && <span style={{ display: "block", fontSize: 11, color: MUTED }}>≈ {raw.g} g {raw.buy} à cuire</span>}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: MUTED, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>PRÉPARATION</div>
        {!steps.length && <div style={{ fontSize: 13, color: MUTED }}>Ajoute des aliments à ce repas pour voir la préparation.</div>}
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: s.author ? `${ACCENT}26` : "#0d0c0a",
                  border: `1px solid ${s.author ? ACCENT : BORDER}`,
                  color: s.author ? ACCENT : TEXT,
                  fontSize: 12,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13.5, color: "#d8cfbd", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                <span style={{ marginRight: 4 }}>{s.icon}</span>
                {s.author && <b style={{ color: ACCENT }}>Recette de l'auteur : </b>}
                {s.t}
                {/[.!?]$/.test(s.t.trim()) ? "" : "."}
              </span>
            </li>
          ))}
        </ol>
        <div style={{ fontSize: 11, color: "#6f6a62", marginTop: 14 }}>
          Temps de cuisson indicatifs (repères courants) : vérifie le paquet de tes produits. Les quantités « à cuire » sont estimées avec le rendement à la cuisson (riz ≈ × 2,5, pâtes ≈ ×
          2,3, viande ≈ − 25 %).
        </div>
      </div>
    </div>
  );
}
