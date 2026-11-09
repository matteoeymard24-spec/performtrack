import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CARD_STYLE, FIELD_STYLE, Kpi, KpiGrid, TEXT, MUTED, ACCENT } from "./ui";
import { FOOD_CATS, todayISO, shiftISO } from "./nutritionData";
import { foodOf } from "./mealPlan";
import { buyOf, costOf, priceInfo, fmtEur, budgetWeek, setBudget, setUserPrices } from "./prices";
import { appConfirm } from "./appDialog";

/* =====================================================================
   ShoppingList.jsx — Nutrition › 🛒 Courses : liste de courses de la semaine, faite toute seule.
   • Source : les menus du Planning (users/{uid}/nutrition/plan_YYYY-MM-DD) de la semaine choisie,
     à partir d'aujourd'hui par défaut (ce qui a déjà été mangé n'est plus à acheter).
   • Quantités additionnées par aliment et converties en quantité À ACHETER (cru / sec, nombre
     d'œufs…, voir prices.js), classées par rayon, avec un prix estimé.
   • Cases à cocher pendant les courses : enregistrées (users/{uid}/nutrition/shop_<lundi>), donc
     retrouvées sur un autre appareil ; articles ajoutés à la main (lessive, café…) en plus.
   ===================================================================== */

const GREEN = "#4fae7d";
const RED = "#d9695a";
const BORDER = "#2a2620";
const mondayOf = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
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
const CAT_ORDER = ["legume", "fruit", "viande", "poisson", "oeuf", "vegprot", "laitier", "feculent", "legumineuse", "gras", "condiment", "sucre", "boisson", "sport"];

function Check({ on, onClick, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        flexShrink: 0,
        border: `2px solid ${on ? GREEN : "#4a453e"}`,
        background: on ? GREEN : "transparent",
        color: "#0d0c0a",
        fontWeight: 900,
        fontSize: 16,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on ? "✓" : ""}
    </button>
  );
}

export default function ShoppingList({ uid, settings, onPrice, onGoPlanning }) {
  const customFoods = settings?.customFoods || [];
  setBudget(settings?.budgetWeek);
  setUserPrices(settings?.prices);
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftISO(weekStart, i)), [weekStart]);
  const isThisWeek = days.includes(today);
  const [fromToday, setFromToday] = useState(true);
  const [plans, setPlans] = useState(null);
  const [shop, setShop] = useState({ checked: {}, extras: [] });
  const [hideDone, setHideDone] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [editPrice, setEditPrice] = useState(null); // { id, v }
  const timer = useRef(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setPlans(null);
    Promise.all([
      ...days.map((d) => getDoc(doc(db, "users", uid, "nutrition", `plan_${d}`)).catch(() => null)),
      getDoc(doc(db, "users", uid, "nutrition", `shop_${weekStart}`)).catch(() => null),
    ]).then((snaps) => {
      if (!alive) return;
      const p = {};
      snaps.slice(0, 7).forEach((sn, i) => sn && sn.exists() && (p[days[i]] = sn.data()));
      const sh = snaps[7];
      setPlans(p);
      setShop(sh && sh.exists() ? { checked: sh.data().checked || {}, extras: sh.data().extras || [] } : { checked: {}, extras: [] });
    });
    return () => {
      alive = false;
    };
  }, [uid, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = (next) => {
    setShop(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDoc(doc(db, "users", uid, "nutrition", `shop_${weekStart}`), { ...next, weekStart, updatedAt: new Date().toISOString() }).catch(() => {});
    }, 400);
  };

  const range = days.filter((d) => !(isThisWeek && fromToday) || d >= today);
  const planned = range.filter((d) => plans?.[d]);
  const lines = useMemo(() => {
    if (!plans) return [];
    const by = {};
    planned.forEach((d) =>
      (plans[d].meals || []).forEach((m) =>
        (m.items || []).forEach((x) => {
          if (!(Number(x.g) > 0)) return;
          const food = foodOf(x.foodId, customFoods) || { id: x.foodId || x.name, name: x.name, cat: "", n: x.n || {} };
          const k = food.id;
          if (!by[k]) by[k] = { key: k, food, g: 0, days: new Set() };
          by[k].g += Number(x.g);
          by[k].days.add(d);
        })
      )
    );
    return Object.values(by).map((l) => ({ ...l, buy: buyOf(l.food, l.g), cost: costOf(l.food, l.g), nDays: l.days.size }));
  }, [plans, planned.join(","), customFoods]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const g = {};
    lines.forEach((l) => {
      const c = FOOD_CATS[l.food.cat] ? l.food.cat : "autre";
      (g[c] = g[c] || []).push(l);
    });
    Object.values(g).forEach((arr) => arr.sort((a, b) => a.food.name.localeCompare(b.food.name, "fr")));
    return [...CAT_ORDER, "autre"].filter((c) => g[c]).map((c) => ({ c, label: FOOD_CATS[c] || "🛒 Autres", items: g[c] }));
  }, [lines]);

  const isOn = (k) => !!shop.checked[k];
  const toggle = (k) => save({ ...shop, checked: { ...shop.checked, [k]: !shop.checked[k] } });
  const nDone = lines.filter((l) => isOn(l.key)).length + shop.extras.filter((x) => x.checked).length;
  const nAll = lines.length + shop.extras.length;
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const left = lines.filter((l) => !isOn(l.key)).reduce((s, l) => s + l.cost, 0);
  const bw = budgetWeek();
  const budgetPart = bw > 0 ? (bw / 7) * range.length : 0;

  const copyText = () => {
    const txt = [
      `🛒 Courses · ${dayLabel(range[0] || days[0], { day: "numeric", month: "short" })} → ${dayLabel(days[6], { day: "numeric", month: "short" })}`,
      ...groups.flatMap((g) => [``, g.label, ...g.items.filter((l) => !isOn(l.key)).map((l) => `☐ ${l.food.name} — ${l.buy.count ? `${l.buy.count} (${l.buy.txt})` : l.buy.txt}`)]),
      ...(shop.extras.some((x) => !x.checked) ? ["", "➕ En plus", ...shop.extras.filter((x) => !x.checked).map((x) => `☐ ${x.name}`)] : []),
    ].join("\n");
    try {
      navigator.clipboard.writeText(txt);
    } catch (e) {
      /* ignore */
    }
    return txt;
  };
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div style={{ ...CARD_STYLE, paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button className="pt-btn" onClick={() => setWeekStart(shiftISO(weekStart, -7))} aria-label="Semaine précédente">
            ←
          </button>
          <div style={{ fontWeight: 800, color: TEXT, flex: "1 1 180px", textAlign: "center" }}>
            Semaine du {dayLabel(days[0], { day: "numeric", month: "short" })} au {dayLabel(days[6], { day: "numeric", month: "short" })}
          </div>
          <button className="pt-btn" onClick={() => setWeekStart(shiftISO(weekStart, 7))} aria-label="Semaine suivante">
            →
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {isThisWeek && (
            <>
              <button type="button" style={chip(fromToday)} onClick={() => setFromToday(true)}>
                À partir d'aujourd'hui
              </button>
              <button type="button" style={chip(!fromToday)} onClick={() => setFromToday(false)}>
                Toute la semaine
              </button>
            </>
          )}
          <button type="button" style={chip(hideDone, GREEN)} onClick={() => setHideDone(!hideDone)}>
            {hideDone ? "👁 Afficher les achetés" : "🙈 Masquer les achetés"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          Faite à partir des menus du Planning ({planned.length}/{range.length} jour{range.length > 1 ? "s" : ""} planifié{planned.length > 1 ? "s" : ""}). Quantités à acheter (cru / sec quand
          l'aliment est pesé cuit) ; prix moyens estimés, modifiables avec ✏️.
        </div>
      </div>

      {!plans ? (
        <div style={{ color: MUTED, padding: 16 }}>Chargement…</div>
      ) : !planned.length ? (
        <div style={{ ...CARD_STYLE, textAlign: "center", padding: "26px 14px" }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🛒</div>
          <div style={{ color: TEXT, fontWeight: 800, marginBottom: 4 }}>Aucun menu planifié sur ces jours</div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>La liste se remplit toute seule dès que la semaine est planifiée.</div>
          {onGoPlanning && (
            <button className="pt-btn pt-btn--primary" onClick={onGoPlanning}>
              🗓️ Planifier mes repas
            </button>
          )}
        </div>
      ) : (
        <>
          <KpiGrid min={140}>
            <Kpi icon="✅" label="Dans le panier" value={`${nDone} / ${nAll}`} sub={nAll && nDone === nAll ? "courses terminées 🎉" : `${nAll - nDone} article${nAll - nDone > 1 ? "s" : ""} à prendre`} color={nAll && nDone === nAll ? GREEN : TEXT} />
            <Kpi icon="💶" label="Total estimé" value={fmtEur(total)} sub={budgetPart > 0 ? `budget ${fmtEur(budgetPart)} sur ces jours` : "pas de budget fixé"} color={budgetPart > 0 ? (total > budgetPart * 1.02 ? RED : GREEN) : TEXT} />
            <Kpi icon="🧾" label="Reste à acheter" value={fmtEur(left)} sub="articles non cochés" />
          </KpiGrid>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="pt-btn"
              onClick={() => {
                copyText();
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "✓ Copiée" : "📋 Copier la liste"}
            </button>
            <button
              type="button"
              className="pt-btn"
              disabled={!nDone}
              onClick={async () => {
                if (await appConfirm("Tout décocher ?", { ok: "Décocher", danger: false })) save({ checked: {}, extras: shop.extras.map((x) => ({ ...x, checked: false })) });
              }}
            >
              ↺ Tout décocher
            </button>
          </div>

          {groups.map((g) => {
            const items = g.items.filter((l) => !hideDone || !isOn(l.key));
            if (!items.length) return null;
            const done = g.items.filter((l) => isOn(l.key)).length;
            return (
              <div key={g.c} style={{ ...CARD_STYLE, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <div style={{ fontWeight: 800, color: TEXT, fontSize: 14.5 }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: done === g.items.length ? GREEN : MUTED }}>
                    {done}/{g.items.length}
                  </div>
                </div>
                {items.map((l) => {
                  const on = isOn(l.key);
                  const pi = priceInfo(l.food);
                  return (
                    <div key={l.key} style={{ borderTop: `1px solid ${BORDER}`, padding: "8px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Check on={on} onClick={() => toggle(l.key)} label={`${on ? "Décocher" : "Cocher"} ${l.food.name}`} />
                        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggle(l.key)}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: on ? "#6f6a62" : TEXT, textDecoration: on ? "line-through" : "none" }}>{l.food.name}</div>
                          <div style={{ fontSize: 12, color: MUTED }}>
                            <b style={{ color: on ? "#6f6a62" : ACCENT }}>{l.buy.count || l.buy.txt}</b>
                            {l.buy.count ? ` · ${l.buy.txt}` : ""} · {l.nDays} jour{l.nDays > 1 ? "s" : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: on ? "#6f6a62" : GREEN }}>{fmtEur(l.cost)}</div>
                          {onPrice && (
                            <button
                              type="button"
                              onClick={() => setEditPrice(editPrice?.id === l.key ? null : { id: l.key, v: String(pi?.kg ?? "").replace(".", ",") })}
                              style={{ background: "none", border: "none", color: MUTED, fontSize: 11, cursor: "pointer", padding: 0 }}
                              aria-label={`Modifier le prix de ${l.food.name}`}
                            >
                              ✏️ {String(Math.round((pi?.kg || 0) * 100) / 100).replace(".", ",")} €/kg{pi?.src === "perso" ? " (toi)" : ""}
                            </button>
                          )}
                        </div>
                      </div>
                      {editPrice?.id === l.key && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, marginLeft: 40, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: MUTED }}>Prix au kg acheté</span>
                          <input
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            value={editPrice.v}
                            onChange={(e) => setEditPrice({ ...editPrice, v: e.target.value })}
                            style={{ ...FIELD_STYLE, width: 90 }}
                          />
                          <span style={{ fontSize: 12, color: MUTED }}>€ / kg</span>
                          <button
                            type="button"
                            className="pt-btn pt-btn--primary"
                            style={{ padding: "5px 10px" }}
                            onClick={() => {
                              const v = Number(String(editPrice.v).replace(",", "."));
                              onPrice(l.key, v > 0 ? v : null);
                              setEditPrice(null);
                            }}
                          >
                            OK
                          </button>
                          {pi?.src === "perso" && (
                            <button
                              type="button"
                              className="pt-btn"
                              style={{ padding: "5px 10px" }}
                              onClick={() => {
                                onPrice(l.key, null);
                                setEditPrice(null);
                              }}
                            >
                              ↺ Prix moyen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      {plans && (
        <div style={{ ...CARD_STYLE, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, color: TEXT, fontSize: 14.5, marginBottom: 6 }}>➕ En plus</div>
          {shop.extras
            .filter((x) => !hideDone || !x.checked)
            .map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${BORDER}`, padding: "8px 0" }}>
                <Check on={!!x.checked} onClick={() => save({ ...shop, extras: shop.extras.map((y) => (y.id === x.id ? { ...y, checked: !y.checked } : y)) })} label={`Cocher ${x.name}`} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: x.checked ? "#6f6a62" : TEXT, textDecoration: x.checked ? "line-through" : "none" }}>{x.name}</span>
                <button type="button" className="pt-btn" style={{ padding: "4px 9px" }} onClick={() => save({ ...shop, extras: shop.extras.filter((y) => y.id !== x.id) })} aria-label={`Retirer ${x.name}`}>
                  ✕
                </button>
              </div>
            ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newItem.trim();
              if (!name) return;
              save({ ...shop, extras: [...shop.extras, { id: Math.random().toString(36).slice(2, 9), name, checked: false }] });
              setNewItem("");
            }}
            style={{ display: "flex", gap: 8, marginTop: 8 }}
          >
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Café, papier toilette, épices…" style={{ ...FIELD_STYLE, flex: 1 }} />
            <button type="submit" className="pt-btn" disabled={!newItem.trim()}>
              Ajouter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
