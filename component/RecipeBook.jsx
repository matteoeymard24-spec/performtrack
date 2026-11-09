import React, { useMemo, useState } from "react";
import { FIELD_STYLE, TEXT, MUTED, ACCENT } from "./ui";
import { FOODS, FOOD_BY_ID, FOOD_CATS, MEALS, allowedByDiet } from "./nutritionData";
import { RECIPES, CUISINES, CUISINE_BY_ID } from "./recipes";
import { recipeForMeal, foodOf, itemsCost } from "./mealPlan";
import { bankRecipes, bankFoods, recipeFromIngredients, normName } from "./bankCore";
import { fmtEur } from "./prices";
import { appConfirm } from "./appDialog";

/* =====================================================================
   RecipeBook.jsx — Nutrition › Planning › 📖 Livre de recettes
   Recettes classées par cuisine, filtrables par repas et par nom. Un clic sur un repas
   met la recette dans le menu du jour sélectionné, quantités calculées pour tes besoins.
   Recettes de base + recettes de la BANQUE COMMUNE (créées par les membres) + mes recettes privées.
   « ➕ Créer ma recette » : ingrédients + grammes ; les leviers protéines / glucides / lipides sont
   choisis automatiquement (recipeFromIngredients) pour que la recette se mette à l'échelle des besoins.
   ===================================================================== */

const BORDER = "#2a2620";
const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));
const MEAL_FILTERS = [
  { id: "", label: "Tous les repas" },
  { id: "petitdej", label: "🌅 Petit-déj" },
  { id: "dejeuner", label: "🍽️ Plats" },
  { id: "collation", label: "🍎 Collations" },
  { id: "seance", label: "🏃 Autour de la séance" },
  { id: "_bank", label: "🌍 Partagées" },
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

/* ---------- Création d'une recette ---------- */
function RecipeForm({ customFoods, onSave, onCancel }) {
  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("autre");
  const [meals, setMeals] = useState(["dejeuner", "diner"]);
  const [ing, setIng] = useState([]); // [{ id, g }]
  const [q, setQ] = useState("");
  const [steps, setSteps] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const fd = (id) => FOOD_BY_ID[id] || foodOf(id, customFoods);
  const pool = useMemo(() => {
    const seen = new Set();
    return [...(customFoods || []), ...bankFoods(), ...FOODS].filter((f) => {
      const k = normName(f.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [customFoods]);
  const found = q.trim().length >= 2 ? pool.filter((f) => normName(f.name).includes(normName(q))).slice(0, 12) : [];
  const tot = ing.reduce(
    (a, x) => {
      const f = fd(x.id);
      if (!f) return a;
      ["kcal", "p", "c", "f"].forEach((k) => (a[k] += ((f.n[k] || 0) * (Number(x.g) || 0)) / 100));
      return a;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  const ok = name.trim() && meals.length && ing.filter((x) => Number(x.g) > 0).length >= 2;
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#151310", border: `1px solid ${ACCENT}66`, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, color: TEXT, marginBottom: 8 }}>➕ Nouvelle recette</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex : Bowl poulet patate douce)" style={{ ...FIELD_STYLE, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={{ ...FIELD_STYLE, flex: "1 1 180px", width: "auto" }}>
          {CUISINES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.flag} {c.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 }}>POUR QUELS REPAS ?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {MEALS.map((m) => {
          const on = meals.includes(m.id);
          return (
            <button key={m.id} type="button" style={chip(on)} onClick={() => setMeals(on ? meals.filter((x) => x !== m.id) : [...meals, m.id])}>
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 }}>INGRÉDIENTS (pour 1 personne, en grammes)</div>
      {ing.map((x, i) => {
        const f = fd(x.id);
        return (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${BORDER}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TEXT }}>{f?.name || x.id}</span>
            <input
              type="number"
              inputMode="numeric"
              value={x.g}
              onChange={(e) => setIng(ing.map((y, j) => (j === i ? { ...y, g: e.target.value } : y)))}
              style={{ ...FIELD_STYLE, width: 80, textAlign: "right" }}
              aria-label={`Grammes de ${f?.name || ""}`}
            />
            <span style={{ fontSize: 12, color: MUTED }}>g</span>
            <button type="button" className="pt-btn" style={{ padding: "4px 9px" }} onClick={() => setIng(ing.filter((_, j) => j !== i))} aria-label="Retirer">
              ✕
            </button>
          </div>
        );
      })}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Ajouter un ingrédient (riz, poulet…)" style={{ ...FIELD_STYLE, marginTop: 8 }} />
      {found.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {found.map((f) => (
            <button
              key={f.id}
              type="button"
              style={chip(false)}
              onClick={() => {
                if (!ing.some((x) => x.id === f.id)) setIng([...ing, { id: f.id, g: f.portion?.[1] || 100 }]);
                setQ("");
              }}
            >
              {FOOD_CATS[f.cat]?.split(" ")[0] || "⭐"} {f.name}
            </button>
          ))}
        </div>
      )}
      {ing.length > 0 && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          Total : <b style={{ color: ACCENT }}>{Math.round(tot.kcal)} kcal</b> · P {Math.round(tot.p)} g · G {Math.round(tot.c)} g · L {Math.round(tot.f)} g — les quantités seront ensuite adaptées à tes besoins.
        </div>
      )}
      <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Préparation (facultatif)" rows={3} style={{ ...FIELD_STYLE, marginTop: 8, resize: "vertical" }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: TEXT, cursor: "pointer" }}>
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        🌍 Partager dans la banque commune <span style={{ color: MUTED, fontSize: 12 }}>(sinon, recette visible par toi seul)</span>
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="pt-btn pt-btn--primary"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            const r = recipeFromIngredients({ id: "rec_" + Math.random().toString(36).slice(2, 10), name: name.trim(), cuisine, meals, steps, ingredients: ing }, fd);
            const done = await onSave(r, share);
            setBusy(false);
            if (done !== false) onCancel();
          }}
        >
          {busy ? "Enregistrement…" : "Enregistrer la recette"}
        </button>
        <button type="button" className="pt-btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
      {!ok && <div style={{ fontSize: 11.5, color: "#6f6a62", marginTop: 6 }}>Il faut un nom, au moins un repas et deux ingrédients.</div>}
    </div>
  );
}

export default function RecipeBook({ diet = "omni", targetsFor, customFoods, overrides, dayLabel, onUse, onClose, uid, canModerate, onSaveRecipe, onDeleteRecipe }) {
  const [cuisine, setCuisine] = useState("");
  const [meal, setMeal] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const extra = bankRecipes();
  const ALL = useMemo(() => [...extra, ...RECIPES], [extra.length, extra.map((r) => r.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const fd = (id) => FOOD_BY_ID[id] || foodOf(id, customFoods);

  // aliment du levier réellement utilisé selon le régime (1re alternative compatible)
  const pick = (ids) => (ids || []).map((id) => fd(id)).find((f) => f && allowedByDiet(f, diet)) || fd((ids || [])[(ids || []).length - 1]);

  const list = useMemo(() => {
    const nq = norm(q);
    return ALL.filter((r) => (!cuisine || r.cuisine === cuisine) && (!meal || (meal === "_bank" ? r.bank !== false && (r.by || r.private) : r.meals.includes(meal))))
      .filter((r) => {
        if (!nq) return true;
        const ing = [...(r.fixed || []).map((x) => x[0]), ...(r.P || []), ...(r.C || []), ...(r.F || [])].map((id) => fd(id)?.name || "").join(" ");
        return norm(`${r.name} ${CUISINE_BY_ID[r.cuisine]?.label} ${ing} ${r.byName || ""}`).includes(nq);
      });
  }, [cuisine, meal, q, ALL]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = {};
    ALL.forEach((r) => {
      if (meal && meal !== "_bank" && !r.meals.includes(meal)) return;
      if (meal === "_bank" && !(r.by || r.private)) return;
      c[r.cuisine] = (c[r.cuisine] || 0) + 1;
    });
    return c;
  }, [meal, ALL]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${ACCENT}55`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, color: TEXT, flex: "1 1 180px" }}>
          📖 Livre de recettes <span style={{ color: MUTED, fontWeight: 600, fontSize: 12.5 }}>· {ALL.length} recettes{extra.length ? ` dont ${extra.length} des membres` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onSaveRecipe && !creating && (
            <button type="button" className="pt-btn pt-btn--primary" style={{ padding: "4px 10px" }} onClick={() => setCreating(true)}>
              ➕ Créer ma recette
            </button>
          )}
          <button type="button" className="pt-btn" style={{ padding: "4px 10px" }} onClick={onClose} aria-label="Fermer le livre">
            ✕
          </button>
        </div>
      </div>
      {creating && <RecipeForm customFoods={customFoods} onSave={onSaveRecipe} onCancel={() => setCreating(false)} />}
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
          const tpl = { ...r, rid: r.id, fixed: r.fixed || [], P: r.P || [], C: r.C || [], F: r.F || [] };
          const firstMeal = meal && r.meals.includes(meal) ? meal : r.meals[0];
          const { t } = targetsFor(firstMeal);
          const est = t ? recipeForMeal(t, firstMeal, tpl, diet, customFoods, overrides).items : [];
          const kcal = est.reduce((s, x) => s + (x.n?.kcal || 0), 0);
          const prot = est.reduce((s, x) => s + (x.n?.p || 0), 0);
          const main = [pick(r.P), pick(r.C)].filter(Boolean).map((f) => f.name);
          const others = (r.fixed || [])
            .map(([id]) => fd(id))
            .filter((f) => f && allowedByDiet(f, diet))
            .map((f) => f.name.toLowerCase());
          const p0 = fd((r.P || [])[0]);
          const veg = diet !== "omni" && p0 && !allowedByDiet(p0, diet);
          const cost = est.length ? itemsCost(est, customFoods) : 0;
          const mine = r.private || (uid && r.by === uid);
          return (
            <div key={r.id} style={{ padding: 10, borderRadius: 10, background: "#151310", border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {c?.flag} {c?.label}
                  {veg ? " · 🌱 version adaptée" : ""}
                  {r.private ? " · 🔒 perso" : r.by ? ` · 🌍 ${r.byName || "membre"}` : ""}
                </div>
                <div style={{ fontWeight: 800, color: TEXT, fontSize: 14, lineHeight: 1.25 }}>{r.name}</div>
              </div>
              <div style={{ fontSize: 12, color: "#c9c1b5", lineHeight: 1.4 }}>
                <b style={{ color: TEXT }}>{main.join(" · ")}</b>
                {others.length ? ` · ${others.join(", ")}` : ""}
              </div>
              {kcal > 0 && (
                <div style={{ fontSize: 11.5, color: MUTED }}>
                  ≈ <b style={{ color: ACCENT }}>{Math.round(kcal)} kcal</b> · P {Math.round(prot)} g · <b style={{ color: "#4fae7d" }}>{fmtEur(cost)}</b> pour ton {MEAL_BY_ID[firstMeal]?.label.toLowerCase()}
                </div>
              )}
              {r.steps ? <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "pre-wrap" }}>{r.steps}</div> : null}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
                {r.meals.map((mid) => (
                  <button key={mid} type="button" className="pt-btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => onUse(tpl, mid)}>
                    + {MEAL_BY_ID[mid]?.icon} {MEAL_BY_ID[mid]?.label}
                  </button>
                ))}
                {onDeleteRecipe && (mine || (canModerate && r.by)) && (
                  <button
                    type="button"
                    className="pt-btn"
                    style={{ padding: "4px 9px", fontSize: 12, color: "#d9695a", marginLeft: "auto" }}
                    onClick={async () => {
                      if (await appConfirm(`Supprimer la recette « ${r.name} »${r.private ? "" : " de la banque commune"} ?`)) onDeleteRecipe(r);
                    }}
                    aria-label="Supprimer la recette"
                  >
                    🗑
                  </button>
                )}
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
