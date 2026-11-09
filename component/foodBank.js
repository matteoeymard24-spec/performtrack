import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { setBank, bankFoods, bankRecipes, recipeFromDoc, recipeToDoc } from "./bankCore";
export * from "./bankCore";

/* =====================================================================
   foodBank.js — lecture / écriture de la BANQUE COMMUNE (collection Firestore foodBank).
   Document = un aliment (kind "food") ou une recette (kind "recipe"), identifiant = celui de
   l'aliment / de la recette. Champs : by (uid de l'auteur), byName, createdAt + les données.
   Règle Firestore (à publier) : lecture pour tout compte connecté ; création par chacun en son nom ;
   modification / suppression par l'auteur ou le superadmin.
   Si la règle n'est pas encore publiée, la banque reste vide et l'app fonctionne comme avant.
   ===================================================================== */

let loaded = false;
let pending = null;
export let bankError = null;

const clean = (o) => JSON.parse(JSON.stringify(o)); // retire les undefined (refusés par Firestore)

export async function loadBank(force = false) {
  if (loaded && !force) return { foods: bankFoods(), recipes: bankRecipes() };
  if (pending && !force) return pending;
  pending = (async () => {
    try {
      const snap = await getDocs(collection(db, "foodBank"));
      const foods = [];
      const recipes = [];
      snap.docs.forEach((d) => {
        const x = { ...d.data(), id: d.id };
        if (x.kind === "recipe") recipes.push(recipeFromDoc(x));
        else if (x.kind === "food") foods.push({ ...x, custom: true, bank: true });
      });
      setBank({ foods, recipes });
      bankError = null;
    } catch (e) {
      bankError = e.message || String(e);
      setBank({});
    }
    loaded = true;
    pending = null;
    try {
      window.dispatchEvent(new Event("pt-foodbank"));
    } catch (e) {
      /* ignore */
    }
    return { foods: bankFoods(), recipes: bankRecipes() };
  })();
  return pending;
}

const author = (byName) => ({ by: auth.currentUser?.uid || "", byName: byName || "", createdAt: new Date().toISOString() });

/* Partage un aliment perso (même identifiant que dans « Mes aliments ») */
export async function publishFood(food, byName) {
  if (!auth.currentUser) throw new Error("Non connecté");
  const { id, name, n, cat, meals, portion, price, yield: yld } = food;
  await setDoc(doc(db, "foodBank", id), clean({ kind: "food", name, n, cat: cat || null, meals: meals || null, portion: portion || null, price: price || null, yield: yld || null, ...author(byName) }));
  await loadBank(true);
}

/* Partage une recette ; les aliments perso qu'elle utilise sont partagés avec elle */
export async function publishRecipe(recipe, byName, customFoods = []) {
  if (!auth.currentUser) throw new Error("Non connecté");
  const ids = [...(recipe.fixed || []).map((x) => x[0]), ...(recipe.P || []), ...(recipe.C || []), ...(recipe.F || [])];
  const mine = (customFoods || []).filter((f) => ids.includes(f.id) && !f.bank);
  for (const f of mine) {
    try {
      const { id, name, n, cat, meals, portion, price } = f;
      await setDoc(doc(db, "foodBank", id), clean({ kind: "food", name, n, cat: cat || null, meals: meals || null, portion: portion || null, price: price || null, ...author(byName) }));
    } catch (e) {
      /* aliment déjà partagé par quelqu'un d'autre : on garde le sien */
    }
  }
  await setDoc(doc(db, "foodBank", recipe.id), clean({ kind: "recipe", ...recipeToDoc({ ...recipe, cuisine: recipe.cuisine || "autre", P: recipe.P || [], C: recipe.C || [], F: recipe.F || [], steps: recipe.steps || "" }), ...author(byName) }));
  await loadBank(true);
}

export async function deleteBankItem(id) {
  await deleteDoc(doc(db, "foodBank", id));
  await loadBank(true);
}
