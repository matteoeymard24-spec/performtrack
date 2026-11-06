import React, { useState } from "react";
import { FIELD_STYLE, TEXT, MUTED, ACCENT } from "./ui";
import { FOODS, FOOD_BY_ID, FOOD_CATS, allowedByDiet, scaleN, fmtN } from "./nutritionData";

/* =====================================================================
   FoodPicker.jsx — recherche d'aliment + quantité (g ou portions) + création d'aliment perso.
   Utilisé par le Journal et le Planning de la page Nutrition.
   onAdd({ id, meal, foodId, name, grams, n }) ; onSaveCustom(food)
   ===================================================================== */
const BORDER = "#2a2620";
const uidN = () => Math.random().toString(36).slice(2, 10);
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

/* ---------- Sélecteur d'aliment ---------- */
/* Valeurs modifiées par l'utilisateur (settings.foodOverrides) appliquées aux aliments de base */
export const withOverride = (f, overrides) => (f && overrides?.[f.id] ? { ...f, n: { ...f.n, ...overrides[f.id] }, edited: true } : f);
export const findFood = (id, customFoods, overrides) =>
  (customFoods || []).find((f) => f.id === id) || withOverride(FOOD_BY_ID[id], overrides) || null;
const MACRO_FIELDS = [
  ["kcal", "kcal"],
  ["p", "Protéines g"],
  ["c", "Glucides g"],
  ["f", "Lipides g"],
  ["fib", "Fibres g"],
];

/* ---------- Modifier une entrée du journal : quantité + valeurs pour 100 g ----------
   onSave(entry, { food, per100 } | null) : food = aliment à mettre à jour pour les prochaines fois */
export function EntryEditor({ entry, customFoods, foodOverrides, onSave, onCancel }) {
  const food = findFood(entry.foodId, customFoods, foodOverrides);
  const g0 = Number(entry.grams) || 0;
  const base = food ? food.n : g0 > 0 ? Object.fromEntries(Object.entries(entry.n || {}).map(([k, v]) => [k, (v * 100) / g0])) : {};
  const r1 = (v) => String(Math.round((Number(v) || 0) * 10) / 10);
  const [grams, setGrams] = useState(String(g0 || ""));
  const [vals, setVals] = useState(Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, r1(base[k])])));
  const [remember, setRemember] = useState(!!food);
  const num = (v) => Number(String(v).replace(",", ".")) || 0;
  const g = num(grams);
  const changedVals = MACRO_FIELDS.some(([k]) => Math.abs(num(vals[k]) - (Number(base[k]) || 0)) > 0.05);
  const per100 = { ...base, ...(changedVals ? Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, num(vals[k])])) : {}) };
  // valeurs inchangées : on garde les micronutriments de l'entrée, simplement mis à l'échelle
  const n = !changedVals && g0 > 0 ? Object.fromEntries(Object.entries(entry.n || {}).map(([k, v]) => [k, (v * g) / g0])) : scaleN(per100, g);
  return (
    <div style={{ marginTop: 6, marginBottom: 6, padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${ACCENT}55` }}>
      <div style={{ fontWeight: 800, color: TEXT, marginBottom: 8 }}>✏️ {entry.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
        <div>
          <label style={lbl}>Quantité (g)</label>
          <input type="number" inputMode="decimal" min="0" value={grams} onChange={(e) => setGrams(e.target.value)} style={{ ...FIELD_STYLE, borderColor: ACCENT }} autoFocus />
        </div>
        {MACRO_FIELDS.map(([k, l]) => (
          <div key={k}>
            <label style={lbl}>{l} /100 g</label>
            <input type="number" inputMode="decimal" min="0" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} style={FIELD_STYLE} />
          </div>
        ))}
      </div>
      {g > 0 && (
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>
          {Math.round(g)} g → <b style={{ color: TEXT }}>{fmtN("kcal", n.kcal)} kcal</b> · P {fmtN("p", n.p)} g · G {fmtN("c", n.c)} g · L {fmtN("f", n.f)} g
        </div>
      )}
      {food && changedVals && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: TEXT, marginTop: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Garder ces valeurs pour « {food.name} » les prochaines fois
        </label>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="pt-btn pt-btn--primary"
          disabled={!(g > 0)}
          onClick={() => onSave({ ...entry, grams: Math.round(g), n }, food && changedVals && remember ? { food, per100: Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, num(vals[k])])) } : null)}
        >
          Enregistrer
        </button>
        <button type="button" className="pt-btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/* ---------- Valeurs d'un aliment (pour 100 g) : modifier / revenir aux valeurs d'origine ---------- */
function FoodValuesEditor({ food, onSave, onReset, onCancel }) {
  const r1 = (v) => String(Math.round((Number(v) || 0) * 10) / 10);
  const [vals, setVals] = useState(Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, r1(food.n[k])])));
  const num = (v) => Number(String(v).replace(",", ".")) || 0;
  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "#0d0c0a", border: `1px dashed ${ACCENT}66` }}>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 6 }}>Valeurs pour 100 g (corrige avec l'étiquette de ton produit)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))", gap: 8 }}>
        {MACRO_FIELDS.map(([k, l]) => (
          <div key={k}>
            <label style={lbl}>{l}</label>
            <input type="number" inputMode="decimal" min="0" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} style={FIELD_STYLE} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" className="pt-btn pt-btn--primary" onClick={() => onSave(Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, num(vals[k])])))}>
          Enregistrer les valeurs
        </button>
        {food.edited && onReset && (
          <button type="button" className="pt-btn" onClick={onReset}>
            ↺ Valeurs d'origine
          </button>
        )}
        <button type="button" className="pt-btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function FoodPicker({ customFoods, diet, meal, onAdd, onClose, onSaveCustom, foodOverrides, onFoodValues }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sel, setSel] = useState(null);
  const [grams, setGrams] = useState("");
  const [count, setCount] = useState("");
  const [creating, setCreating] = useState(false);
  const [editVals, setEditVals] = useState(false);
  const [cf, setCf] = useState({ name: "", kcal: "", p: "", c: "", f: "", fib: "", portionLabel: "", portionG: "" });
  const all = [...(customFoods || []).map((f) => ({ ...f, cat: "perso" })), ...FOODS.map((f) => withOverride(f, foodOverrides))];
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = all
    .filter((f) => (!cat || f.cat === cat) && (!q || norm(f.name).includes(norm(q))))
    .sort((a, b) => (a.cat === "perso" ? -1 : 0) - (b.cat === "perso" ? -1 : 0) || (allowedByDiet(b, diet) ? 1 : 0) - (allowedByDiet(a, diet) ? 1 : 0));
  const g = sel ? (count && sel.portion ? Number(String(count).replace(",", ".")) * sel.portion[1] : Number(String(grams).replace(",", "."))) : 0;
  const n = sel && g > 0 ? scaleN(sel.n, g) : null;
  const add = () => {
    if (!sel || !(g > 0)) return;
    onAdd({ id: uidN(), meal, foodId: sel.id, name: sel.name, grams: Math.round(g), n });
    setSel(null);
    setGrams("");
    setCount("");
  };
  const num = (v) => Number(String(v).replace(",", ".")) || 0;
  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "#0d0c0a", border: `1px solid ${ACCENT}55` }}>
      {!creating ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Chercher un aliment (riz, poulet, banane…)" style={{ ...FIELD_STYLE, flex: 1 }} />
            <button type="button" className="pt-btn" onClick={onClose}>
              Fermer
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
            <button type="button" style={{ ...chip(!cat), padding: "5px 10px", fontSize: 12 }} onClick={() => setCat("")}>
              Tout
            </button>
            {(customFoods || []).length > 0 && (
              <button type="button" style={{ ...chip(cat === "perso"), padding: "5px 10px", fontSize: 12 }} onClick={() => setCat("perso")}>
                ⭐ Mes aliments
              </button>
            )}
            {Object.entries(FOOD_CATS).map(([k, l]) => (
              <button key={k} type="button" style={{ ...chip(cat === k), padding: "5px 10px", fontSize: 12 }} onClick={() => setCat(k)}>
                {l}
              </button>
            ))}
          </div>
          {sel ? (
            <div style={{ padding: 10, borderRadius: 10, background: "#151310", border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, color: TEXT }}>
                  {sel.name}
                  {sel.edited && <span style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}> · valeurs modifiées</span>}
                </span>
                {onFoodValues && !editVals && (
                  <button type="button" className="pt-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditVals(true)}>
                    ✏️ Valeurs
                  </button>
                )}
              </div>
              {editVals && (
                <FoodValuesEditor
                  key={sel.id}
                  food={sel}
                  onCancel={() => setEditVals(false)}
                  onSave={(per100) => {
                    onFoodValues(sel, per100);
                    setSel({ ...sel, n: { ...sel.n, ...per100 }, edited: sel.cat !== "perso" });
                    setEditVals(false);
                  }}
                  onReset={
                    sel.cat !== "perso"
                      ? () => {
                          onFoodValues(sel, null);
                          setSel(FOOD_BY_ID[sel.id] || sel);
                          setEditVals(false);
                        }
                      : null
                  }
                />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={lbl}>Quantité (g ou ml)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={grams}
                    onChange={(e) => {
                      setGrams(e.target.value);
                      setCount("");
                    }}
                    placeholder="ex : 150"
                    style={{ ...FIELD_STYLE, width: 120 }}
                  />
                </div>
                {sel.portion && (
                  <div>
                    <label style={lbl}>ou en {sel.portion[0]} ({sel.portion[1]} g)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={count}
                      onChange={(e) => {
                        setCount(e.target.value);
                        setGrams("");
                      }}
                      placeholder="ex : 2"
                      style={{ ...FIELD_STYLE, width: 110 }}
                    />
                  </div>
                )}
                <button type="button" className="pt-btn pt-btn--primary" disabled={!(g > 0)} onClick={add}>
                  ＋ Ajouter
                </button>
                <button
                  type="button"
                  className="pt-btn"
                  onClick={() => {
                    setSel(null);
                    setEditVals(false);
                  }}
                >
                  ← Autre aliment
                </button>
              </div>
              {n && (
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>
                  {Math.round(g)} g → <b style={{ color: TEXT }}>{fmtN("kcal", n.kcal)} kcal</b> · P {fmtN("p", n.p)} g · G {fmtN("c", n.c)} g · L {fmtN("f", n.f)} g
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {list.slice(0, 60).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSel(f)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    gap: 8,
                    padding: "8px 6px",
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${BORDER}`,
                    color: allowedByDiet(f, diet) ? TEXT : "#6f6a62",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13.5,
                  }}
                >
                  <span>
                    {f.cat === "perso" ? "⭐ " : ""}
                    {f.name}
                    {f.edited ? " ✏️" : ""}
                  </span>
                  <span style={{ color: MUTED, fontSize: 12, whiteSpace: "nowrap" }}>
                    {Math.round(f.n.kcal)} kcal · P {fmtN("p", f.n.p)} /100 g
                  </span>
                </button>
              ))}
              {!list.length && <div style={{ color: MUTED, fontSize: 13, padding: 8 }}>Aucun aliment trouvé.</div>}
              <button type="button" className="pt-btn" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>
                ＋ Créer mon aliment (étiquette)
              </button>
            </div>
          )}
        </>
      ) : (
        <div>
          <div style={{ fontWeight: 800, color: TEXT, marginBottom: 4 }}>Nouvel aliment (valeurs pour 100 g, sur l'étiquette)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Nom</label>
              <input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} style={FIELD_STYLE} placeholder="ex : Granola maison" />
            </div>
            {[
              ["kcal", "kcal"],
              ["p", "Protéines g"],
              ["c", "Glucides g"],
              ["f", "Lipides g"],
              ["fib", "Fibres g"],
            ].map(([k, l]) => (
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input type="number" inputMode="decimal" value={cf[k]} onChange={(e) => setCf({ ...cf, [k]: e.target.value })} style={FIELD_STYLE} />
              </div>
            ))}
            <div>
              <label style={lbl}>Portion (libellé)</label>
              <input value={cf.portionLabel} onChange={(e) => setCf({ ...cf, portionLabel: e.target.value })} style={FIELD_STYLE} placeholder="ex : bol" />
            </div>
            <div>
              <label style={lbl}>Portion (g)</label>
              <input type="number" value={cf.portionG} onChange={(e) => setCf({ ...cf, portionG: e.target.value })} style={FIELD_STYLE} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="pt-btn pt-btn--primary"
              disabled={!cf.name.trim() || !(num(cf.kcal) > 0)}
              onClick={() => {
                const food = {
                  id: "perso_" + uidN(),
                  name: cf.name.trim(),
                  n: { kcal: num(cf.kcal), p: num(cf.p), c: num(cf.c), f: num(cf.f), fib: num(cf.fib) },
                  ...(cf.portionLabel && num(cf.portionG) > 0 ? { portion: [cf.portionLabel, num(cf.portionG)] } : {}),
                };
                onSaveCustom(food);
                setCreating(false);
                setSel({ ...food, cat: "perso" });
              }}
            >
              Enregistrer l'aliment
            </button>
            <button type="button" className="pt-btn" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

