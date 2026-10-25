import React, { useEffect, useRef, useState } from "react";
import { FeedbackList, extractFeedbackExercises } from "../component/ExerciseFeedbackList";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { getWorkoutDocs } from "../component/workoutQueries";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { getTest, computeResult, toStoredResult } from "../component/testsCalc";
import { Page, FoldCard, useFold, CARD_STYLE, CARD_ACCENT_BORDER, PAGE_TITLE } from "../component/ui";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Mêmes catégories que la banque d'exercices (gestionnaire "🔤 Noms
// d'exercices" dans Workout.jsx) — utilisées ici pour filtrer/regrouper.
const EXERCISE_CATEGORIES = [
  { value: "bas_corps", label: "🦵 Bas du corps" },
  { value: "haut_tirage", label: "💪 Haut du corps — Tirage" },
  { value: "haut_pousse", label: "💪 Haut du corps — Poussée" },
  { value: "gainage", label: "🧱 Gainage" },
  { value: "autre", label: "📦 Autre" },
];
// Anciennes fiches catégorisées avant la fusion "Chaîne antérieure" /
// "Chaîne postérieure" en une seule catégorie "Bas du corps".
const normalizeCategoryValue = (value) =>
  value === "bas_anterieure" || value === "bas_posterieure" ? "bas_corps" : value;
const getExerciseCategoryLabel = (value) =>
  EXERCISE_CATEGORIES.find((c) => c.value === normalizeCategoryValue(value))?.label ||
  "📦 Autre";

// Même normalisation que la banque d'exercices (Workout.jsx) : sans accents,
// "/" "\\" "." remplacés par un espace. Sans ça, "épaulé" (Mes RM) et
// "epaule" (banque) étaient deux clés différentes → catégories divergentes.
const normKey = (name) =>
  (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/\\.]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export default function MyRM() {
  const { currentUser, userRole, isSuperAdmin } = useAuth();
  const isAdminLike = userRole === "admin" || isSuperAdmin;
  // Coach : peut consulter / modifier les RM d'un athlète ("" = les siens)
  const [viewUid, setViewUid] = useState("");
  const [rmAthletes, setRmAthletes] = useState([]);
  const [rmAdmins, setRmAdmins] = useState([]);
  const [rmGroups, setRmGroups] = useState([]);
  const [viewMode, setViewMode] = useState("moi"); // moi | admin | athlete
  const [viewGroup, setViewGroup] = useState(""); // "" = tous, "none" = sans groupe, idGroupe, "sg:gid:sid"
  const uid = viewUid || currentUser?.uid;
  useEffect(() => {
    if (!isAdminLike) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRmAthletes(all.filter((u) => u.id !== currentUser?.uid && u.role !== "admin"));
        setRmAdmins(all.filter((u) => u.id !== currentUser?.uid && u.role === "admin"));
        try {
          const g = await getDocs(collection(db, "groups"));
          setRmGroups(g.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.warn("Groupes:", e);
        }
      } catch (e) {
        console.warn("Liste athlètes:", e);
      }
    })();
  }, [isAdminLike, currentUser]);

  // États VMA
  const [vma, setVma] = useState(null);
  const [vmaHistory, setVmaHistory] = useState([]);

  // États CMJ
  const [cmj, setCmj] = useState(null);
  const [cmjHistory, setCmjHistory] = useState([]);
  // CMJ détecté automatiquement quand un test CMJ est fait dans une séance
  // (même convention que Dashboard.jsx : hauteur stockée dans
  // series[].actualWeight quand l'exercice s'appelle "CMJ" / "Counter
  // Movement Jump"). Pas besoin de le ressaisir à la main.
  const [sessionCmjEntries, setSessionCmjEntries] = useState([]);
  const [fbEntries, setFbEntries] = useState([]);

  // États RM
  const [rmHistory, setRmHistory] = useState({});
  const [rmCategories, setRmCategories] = useState({});
  const [rmAutoCreated, setRmAutoCreated] = useState({});
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rmSearchQuery, setRmSearchQuery] = useState("");
  const [showRmSuggest, setShowRmSuggest] = useState(false);
  const [rmCategoryFilter, setRmCategoryFilter] = useState("all");
  // Temps de sprint saisis ici (enregistrés comme un test « sprint » : visibles dans Tests, Dashboard et normes)
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [sprintVals, setSprintVals] = useState({ t10: "", t20: "", t60: "" });
  const [sprintDate, setSprintDate] = useState(todayIso());
  const [sprintHist, setSprintHist] = useState([]);
  const [savingSprint, setSavingSprint] = useState(false);

  // Pour amener le graphique juste sous l'exercice cliqué (plutôt que de
  // laisser l'utilisateur scroller jusqu'en bas de la page pour le voir).
  const detailRef = useRef(null);
  useEffect(() => {
    if (selectedExercise && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedExercise]);

  // Formulaire RM
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRM, setEditingRM] = useState(null);

  // Le formulaire "Modifier" s'ouvre en haut de la page (au-dessus de la
  // liste), loin du bouton "✏️ Modifier" cliqué en bas dans le détail d'un
  // exercice — sans ça, rien ne semblait se passer au clic (le formulaire
  // s'ouvrait bien mais hors écran). On l'amène automatiquement en vue.
  const formRef = useRef(null);
  useEffect(() => {
    if (showAddForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showAddForm]);
  const [exerciseName, setExerciseName] = useState("");
  const [testWeight, setTestWeight] = useState("");
  const [testReps, setTestReps] = useState(1);
  const [calculated1RM, setCalculated1RM] = useState(null);
  const fold = useFold("myrm", ["info"]);

  // Calculer le 1RM théorique (formule d'Epley)
  const calculate1RM = (weight, reps) => {
    if (!weight || !reps) return null;
    const w = Number(weight);
    const r = Number(reps);
    if (r === 1) return w;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  };

  // Mise à jour du calcul en temps réel
  useEffect(() => {
    const rm = calculate1RM(testWeight, testReps);
    setCalculated1RM(rm);
  }, [testWeight, testReps]);

  const loadRM = async () => {
    if (!currentUser) return;

    try {
      const [rmSnap, exerciseMediaSnap] = await Promise.all([
        getDocs(collection(db, "users", uid, "rm")),
        getDocs(collection(db, "exerciseMedia")),
      ]);
      // La banque d'exercices (exerciseMedia) est la source de vérité pour la
      // catégorie — priorité sur la catégorie stockée sur la fiche RM
      // elle-même, qui peut être restée "autre" tant qu'elle n'a pas été
      // resynchronisée (voir bouton admin "Resynchroniser les catégories").
      const catalogCategoryByKey = {};
      exerciseMediaSnap.docs.forEach((d) => {
        const cat = d.data().category;
        if (cat) catalogCategoryByKey[normKey(d.id)] = normalizeCategoryValue(cat);
      });

      // Séparer VMA, CMJ et RM
      const grouped = {};
      const categories = {};
      const autoCreatedMap = {};
      let vmaData = null;
      let vmaHist = [];
      let cmjData = null;
      let cmjHist = [];

      rmSnap.docs.forEach((d) => {
        const data = d.data();
        const name = (data.exerciseName || d.id).toLowerCase();

        // VMA
        if (name === "vma" || d.id === "VMA") {
          vmaData = data;
          vmaHist = data.history || [];
        }
        // CMJ
        else if (name === "cmj" || d.id === "CMJ") {
          cmjData = data;
          cmjHist = data.history || [];
        } else {
          // RM normaux — l'historique complet (plusieurs points dans le
          // temps) vient du champ "history" ; à défaut (anciennes fiches
          // sans historique, ou fiche jamais testée avec kg:null), on
          // retombe sur un point unique tiré de kg/updatedAt.
          categories[name] =
            catalogCategoryByKey[normKey(d.id)] ||
            catalogCategoryByKey[normKey(data.exerciseName)] ||
            normalizeCategoryValue(data.category) ||
            "autre";
          autoCreatedMap[name] = data.kg === null || data.kg === undefined;
          if (Array.isArray(data.history) && data.history.length > 0) {
            grouped[name] = data.history.map((h) => ({
              date: h.date,
              kg: h.kg,
              autoAdjusted: h.autoAdjusted,
            }));
          } else if (data.kg !== null && data.kg !== undefined) {
            grouped[name] = [
              {
                date: data.updatedAt,
                kg: data.kg,
                originalWeight: data.originalWeight,
                originalReps: data.originalReps,
                autoAdjusted: data.autoAdjusted,
              },
            ];
          } else {
            // Fiche "en attente" (créée automatiquement depuis la banque
            // d'exercices) : pas encore de valeur testée.
            grouped[name] = [];
          }
        }
      });

      // Auto-synchro avec la banque d'exercices : tout exercice catégorisé
      // (hors échauffement / poids du corps) qui n'a pas encore de fiche chez
      // cet utilisateur est ajouté en "attente" (kg: null). Rattrape les
      // exercices marqués après coup, les comptes admin et les nouveaux
      // athlètes, que la diffusion depuis la banque ne touchait pas.
      const existingIds = new Set(rmSnap.docs.map((d) => normKey(d.id)));
      const toCreate = [];
      exerciseMediaSnap.docs.forEach((d) => {
        const m = d.data();
        const key = d.id;
        const lk = key.toLowerCase();
        if (!m.category || m.isWarmup || m.isPDC || m.hidden) return;
        if (existingIds.has(normKey(key)) || grouped[lk] || Object.keys(grouped).some((g) => normKey(g) === normKey(key)) || lk === "vma" || lk === "cmj") return;
        toCreate.push({ key, lk, category: normalizeCategoryValue(m.category) || "autre" });
      });
      toCreate.forEach(({ lk, category }) => {
        grouped[lk] = [];
        categories[lk] = category;
        autoCreatedMap[lk] = true;
      });
      if (toCreate.length > 0) {
        Promise.all(
          toCreate.map(({ key, category }) =>
            setDoc(
              doc(db, "users", uid, "rm", key),
              {
                kg: null,
                exerciseName: key,
                category,
                autoCreated: true,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            )
          )
        ).catch((e) => console.warn("Synchro RM (écriture) :", e));
      }

      // Trier par date pour chaque exercice
      Object.keys(grouped).forEach((ex) => {
        grouped[ex].sort((a, b) => new Date(a.date) - new Date(b.date));
      });

      setRmHistory(grouped);
      setRmCategories(categories);
      setRmAutoCreated(autoCreatedMap);
      setVma(vmaData);
      setVmaHistory(vmaHist);
      setCmj(cmjData);
      setCmjHistory(cmjHist);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRM();
  }, [currentUser, uid]);

  // Arrivée depuis le Dashboard (« Voir tout ») : ouvre le bloc et descend dessus.
  useEffect(() => {
    if (window.location.hash !== "#feedbacks" || fbEntries.length === 0) return;
    if (!fold.isOpen("fbhist")) fold.toggle("fbhist");
    const t = setTimeout(() => {
      const el = document.getElementById("feedbacks");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbEntries.length]);

  const isCMJName = (exerciseName) => {
    if (!exerciseName) return false;
    const name = exerciseName.toLowerCase().trim();
    return name === "cmj" || name.includes("counter movement jump");
  };

  const loadSessionCmj = async () => {
    if (!currentUser) return;
    try {
      const snap = await getWorkoutDocs();
      setFbEntries(
        extractFeedbackExercises(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          uid
        )
      );
      const map = {};
      snap.docs.forEach((docSnap) => {
        const w = docSnap.data();
        const progress = w.userProgress?.[uid];
        if (!progress?.completedAt || !w.blocks) return;
        const feedback = progress.feedback || {};
        w.blocks.forEach((block, bIdx) => {
          (block.exercises || []).forEach((ex, eIdx) => {
            if (!isCMJName(ex.name)) return;
            const fb = feedback[`${bIdx}-${eIdx}`];
            if (!fb || !fb.series) return;
            const heights = fb.series
              .map((s) => Number(s.actualWeight))
              .filter((h) => !Number.isNaN(h) && h > 0);
            if (heights.length === 0) return;
            const best = Math.max(...heights);
            map[w.date] = map[w.date] ? Math.max(map[w.date], best) : best;
          });
        });
      });
      const entries = Object.entries(map)
        .map(([date, heightCm]) => ({ date, heightCm }))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setSessionCmjEntries(entries);
    } catch (e) {
      console.error("Erreur chargement CMJ séances:", e);
    }
  };

  useEffect(() => {
    loadSessionCmj();
  }, [currentUser, uid]);

  /* ===================== SPRINT (10 / 20 / 60 m) ===================== */
  const loadSprints = async () => {
    if (!currentUser) return;
    try {
      const snap = await getDocs(collection(db, "users", uid, "tests"));
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.testId === "sprint")
        .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
      setSprintHist(all);
    } catch (e) {
      console.error("Erreur chargement sprints:", e);
    }
  };
  useEffect(() => {
    loadSprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, uid]);

  const saveSprint = async () => {
    if (!currentUser) return;
    const clean = {};
    ["t10", "t20", "t60"].forEach((k) => {
      const v = String(sprintVals[k] ?? "").trim().replace(",", ".");
      if (v !== "" && Number(v) > 0) clean[k] = v;
    });
    if (Object.keys(clean).length === 0) return alert("Saisis au moins un temps (10 m, 20 m ou 60 m), en secondes.");
    setSavingSprint(true);
    try {
      const test = getTest("sprint");
      const result = computeResult(test, clean);
      await addDoc(collection(db, "users", uid, "tests"), {
        testId: "sprint",
        group: test.group,
        date: sprintDate || todayIso(),
        values: clean,
        result: toStoredResult(result),
        notes: "",
        createdAt: new Date().toISOString(),
        createdBy: uid,
      });
      setSprintVals({ t10: "", t20: "", t60: "" });
      await loadSprints();
      alert("✅ Temps de sprint enregistrés !");
    } catch (e) {
      console.error("Erreur save sprint:", e);
      alert("❌ Erreur : " + e.message);
    } finally {
      setSavingSprint(false);
    }
  };

  const deleteSprint = async (id) => {
    if (!window.confirm("Supprimer cette saisie de sprint ?")) return;
    try {
      await deleteDoc(doc(db, "users", uid, "tests", id));
      await loadSprints();
    } catch (e) {
      alert("❌ Erreur : " + e.message);
    }
  };

  /* ===================== RM ===================== */
  const handleSaveRM = async () => {
    if (!currentUser || !exerciseName || !testWeight || !testReps) {
      alert("Remplis tous les champs");
      return;
    }

    const normalizedName = normKey(exerciseName);
    const rm1 = calculate1RM(testWeight, testReps);

    try {
      // Si on modifie et que le nom change, supprimer l'ancien
      if (editingRM && editingRM !== normalizedName) {
        await deleteDoc(doc(db, "users", uid, "rm", editingRM));
      }

      // Relit la fiche existante pour ne jamais écraser son historique (le
      // graphique d'évolution a besoin de tous les points, pas seulement du
      // dernier). Pour la catégorie, la banque d'exercices (gestionnaire
      // "🔤 Noms d'exercices") reste la référence — elle prime sur ce qui
      // était déjà écrit sur la fiche RM.
      const targetRef = doc(db, "users", uid, "rm", normalizedName);
      const [existingSnap, catalogSnap] = await Promise.all([
        getDoc(targetRef),
        getDoc(doc(db, "exerciseMedia", normalizedName)),
      ]);
      const existingData = existingSnap.exists() ? existingSnap.data() : null;
      const catalogCategory = catalogSnap.exists() ? catalogSnap.data().category : null;
      const nowIso = new Date().toISOString();
      const history = [...(existingData?.history || [])];
      history.push({ date: nowIso, kg: rm1, autoAdjusted: false });

      const rmData = {
        exerciseName: normalizedName,
        kg: rm1,
        category: normalizeCategoryValue(catalogCategory) || existingData?.category || "autre",
        originalWeight: Number(testWeight),
        originalReps: Number(testReps),
        updatedAt: nowIso,
        autoAdjusted: false,
        autoCreated: false,
        lastRPE: null,
        history: history.slice(-20),
      };

      await setDoc(targetRef, rmData, { merge: true });

      if (editingRM && editingRM !== normalizedName) {
        alert("Exercice renommé et mis à jour !");
      } else if (editingRM) {
        alert("RM mis à jour !");
      } else {
        alert("RM enregistré !");
      }

      // Reset form
      setExerciseName("");
      setTestWeight("");
      setTestReps(1);
      setCalculated1RM(null);
      setShowAddForm(false);
      setEditingRM(null);
      loadRM();
    } catch (error) {
      console.error("Erreur sauvegarde RM:", error);
      alert("Erreur lors de la sauvegarde");
    }
  };

  const handleEditRM = (exerciseName) => {
    const history = rmHistory[exerciseName];
    const latest = history && history.length > 0 ? history[history.length - 1] : null;

    setEditingRM(exerciseName);
    setExerciseName(exerciseName);
    setTestWeight(latest ? latest.originalWeight || latest.kg : "");
    setTestReps(latest ? latest.originalReps || 1 : 1);
    setShowAddForm(true);
  };

  // Suppression obsolète : un exercice ne se supprime plus depuis "Mes RM"
  // (ni pour un athlète, ni pour un admin) — la banque d'exercices est
  // l'unique source : supprimer un exercice de la banque le retire
  // automatiquement de "Mes RM" chez tous les athlètes.

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingRM(null);
    setExerciseName("");
    setTestWeight("");
    setTestReps(1);
    setCalculated1RM(null);
  };

  const rmSuggestions = (() => {
    const q = normKey(rmSearchQuery);
    if (!q) return [];
    return Object.keys(rmHistory)
      .filter((ex) => ex !== "vma" && normKey(ex).includes(q) && normKey(ex) !== q)
      .sort()
      .slice(0, 8);
  })();

  const exercises = Object.keys(rmHistory)
    .filter((ex) => ex !== "vma")
    .filter((ex) =>
      rmCategoryFilter === "all" ? true : rmCategories[ex] === rmCategoryFilter
    )
    .filter((ex) =>
      rmSearchQuery.trim()
        ? normKey(ex).includes(normKey(rmSearchQuery))
        : true
    )
    .sort();

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#f3f0ea",
          background: "#151310",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 24 }}>⏳ Chargement...</div>
      </div>
    );
  }

  return (
    <Page>
      <h2 style={{ ...PAGE_TITLE, marginBottom: 16 }}>💪 {viewUid ? "RM de l'athlète" : "Mes RM"}</h2>

      {isAdminLike && (
        <div style={{ ...CARD_STYLE, padding: 14, marginBottom: 12, ...(viewUid ? { border: CARD_ACCENT_BORDER } : {}) }}>
          <label style={{ display: "block", fontSize: 12, color: "#a8a199", marginBottom: 6 }}>
            👤 Voir / modifier les RM de :
          </label>
          {(() => {
            const nameOf = (a) => (a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName || a.email || a.id);
            const sortByName = (arr) => arr.slice().sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
            const selStyle = { width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 8, border: "1px solid #2a2620", background: "#1a1815", color: "#f3f0ea", fontSize: 16, marginTop: 8 };
            const reset = () => { setSelectedExercise(null); setShowAddForm(false); setEditingRM(null); setRmSearchQuery(""); };
            const pickMode = (m) => { setViewMode(m); setViewUid(""); setViewGroup(""); reset(); };
            // athlètes selon le groupe / sous-groupe choisi
            let list = rmAthletes;
            if (viewGroup === "none") {
              const inAny = new Set(rmGroups.flatMap((g) => g.athleteIds || []));
              list = rmAthletes.filter((a) => !inAny.has(a.id));
            } else if (viewGroup.startsWith("sg:")) {
              const [, gid, sid] = viewGroup.split(":");
              const sub = (rmGroups.find((g) => g.id === gid)?.subGroups || []).find((x) => x.id === sid);
              list = rmAthletes.filter((a) => (sub?.athleteIds || []).includes(a.id));
            } else if (viewGroup) {
              const g = rmGroups.find((x) => x.id === viewGroup);
              list = rmAthletes.filter((a) => (g?.athleteIds || []).includes(a.id));
            }
            return (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[["moi", "🌟 Moi"], ["admin", "👤 Admin"], ["athlete", "🏉 Athlète"]].map(([m, lab]) => {
                    const on = viewMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => pickMode(m)}
                        style={{ flex: 1, minHeight: 44, borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: on ? 700 : 400, border: on ? "1px solid #e0a13d" : "1px solid #2a2620", background: on ? "rgba(224,161,61,0.18)" : "#1a1815", color: on ? "#e0a13d" : "#f3f0ea" }}
                      >
                        {lab}
                      </button>
                    );
                  })}
                </div>
                {viewMode === "admin" && (
                  <select value={viewUid} onChange={(e) => { setViewUid(e.target.value); reset(); }} style={selStyle}>
                    <option value="">-- Choisir l'admin --</option>
                    {sortByName(rmAdmins).map((a) => (
                      <option key={a.id} value={a.id}>{nameOf(a)}</option>
                    ))}
                  </select>
                )}
                {viewMode === "athlete" && (
                  <>
                    <select value={viewGroup} onChange={(e) => { setViewGroup(e.target.value); setViewUid(""); reset(); }} style={selStyle}>
                      <option value="">Tous les athlètes</option>
                      {rmGroups.map((g) => (
                        <React.Fragment key={g.id}>
                          <option value={g.id}>👥 {g.name}</option>
                          {(g.subGroups || []).map((sg) => (
                            <option key={sg.id} value={`sg:${g.id}:${sg.id}`}>↳ {sg.name}</option>
                          ))}
                        </React.Fragment>
                      ))}
                      <option value="none">Sans groupe</option>
                    </select>
                    <select value={viewUid} onChange={(e) => { setViewUid(e.target.value); reset(); }} style={selStyle}>
                      <option value="">-- Choisir l'athlète ({list.length}) --</option>
                      {sortByName(list).map((a) => (
                        <option key={a.id} value={a.id}>{nameOf(a)}</option>
                      ))}
                    </select>
                  </>
                )}
              </>
            );
          })()}
          {viewUid && (
            <div style={{ fontSize: 12, color: "#e0a13d", marginTop: 6 }}>
              Tu modifies les données de cet athlète : chaque changement est enregistré sur son compte.
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <FoldCard id="info" fold={fold} title="💡 Comment ça fonctionne ?">
        <ul
          style={{ color: "#a8a199", lineHeight: 1.7, margin: 0, fontSize: 13, paddingLeft: 18 }}
        >
          <li>
            Le <strong>1RM théorique</strong> est calculé avec la formule
            d'Epley, à partir des séries proches du maximum (≤6 répétitions,
            RPE≥8)
          </li>
          <li>
            Tes RM se mettent à jour <strong>automatiquement</strong> après
            chaque séance validée, uniquement sur les séries proches du max
            (échauffement et poids du corps exclus)
          </li>
          <li>
            Tu peux modifier ton RM réel à tout moment si tu fais un vrai test
          </li>
          <li>Les ajustements automatiques sont signalés par ⚡</li>
          <li>
            Ta <strong>VMA</strong> (issue des tests faits par ton coach) sert à
            calculer les séances d'endurance
          </li>
        </ul>
      </FoldCard>

      {/* ==================== DERNIERS EXERCICES AVEC FEEDBACK ==================== */}
      <div id="feedbacks">
        <FoldCard
          id="fbhist"
          fold={fold}
          title={`🕘 Mes feedbacks d'exercices (${fbEntries.length})`}
          subtitle="Tous les exercices de tes séances pour lesquels tu as donné un feedback (charge, reps, RPE). Touche une ligne pour voir toutes les séries."
        >
          <FeedbackList entries={fbEntries} mode="all" limit={15} searchable />
        </FoldCard>
      </div>

      {/* ==================== VMA & CMJ : désormais gérés dans l'onglet Tests ==================== */}
      <FoldCard id="vmacmj" fold={fold} title="🏃 VMA & 🦘 CMJ">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ background: "#0d0c0a", padding: "10px 16px", borderRadius: 8, minWidth: 130 }}>
            <div style={{ fontSize: 12, color: "#a8a199" }}>🏃 VMA</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4fae7d" }}>
              {vma ? `${vma.kg} km/h` : "—"}
            </div>
            {vma && vma.sourceTest && (
              <div style={{ fontSize: 11, color: "#a8a199" }}>{vma.sourceTest}</div>
            )}
          </div>
          <div style={{ background: "#0d0c0a", padding: "10px 16px", borderRadius: 8, minWidth: 130 }}>
            <div style={{ fontSize: 12, color: "#a8a199" }}>🦘 CMJ</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#e0a13d" }}>
              {cmj ? `${cmj.kg} cm` : "—"}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#a8a199" }}>
          💡 La VMA, la VMI, la vitesse critique et le CMJ sont maintenant mesurés
          par ton coach lors des tests. Retrouve tous tes résultats dans ton
          <strong> Dashboard</strong> (bloc « Mes tests »).
        </div>
      </FoldCard>

      {/* ==================== SPRINT : 10 / 20 / 60 m ==================== */}
      <FoldCard id="sprint" fold={fold} title="⚡ Mes temps de sprint">
        <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 12 }}>
          Temps en secondes, au centième (ex : 1.72). Ils sont comparés aux normes de ton poste et de ton niveau dans l'onglet Tests.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          {[["t10", "10 m", "ex : 1.72"], ["t20", "20 m", "ex : 3.05"], ["t60", "60 m", "ex : 7.90"]].map(([k, l, ph]) => (
            <div key={k}>
              <label style={{ fontSize: 11, color: "#a8a199" }}>{l} (s)</label>
              <input
                type="text"
                inputMode="decimal"
                value={sprintVals[k]}
                placeholder={ph}
                onChange={(e) => setSprintVals((v) => ({ ...v, [k]: e.target.value }))}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "#0d0c0a", color: "#f3f0ea", fontSize: 15, boxSizing: "border-box" }}
              />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11, color: "#a8a199" }}>Date</label>
            <input
              type="date"
              value={sprintDate}
              onChange={(e) => setSprintDate(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "#0d0c0a", color: "#f3f0ea", fontSize: 15, boxSizing: "border-box" }}
            />
          </div>
        </div>
        <button
          onClick={saveSprint}
          disabled={savingSprint}
          style={{ marginTop: 12, padding: "10px 18px", background: "#4fae7d", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer" }}
        >
          {savingSprint ? "…" : "💾 Enregistrer mes temps"}
        </button>
        {sprintHist.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a8a199", marginBottom: 6 }}>Historique</div>
            {sprintHist.slice(0, 8).map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #1d1a16", fontSize: 13 }}>
                <span>
                  <span style={{ color: "#a8a199" }}>{t.date}</span> ·{" "}
                  {["t10", "t20", "t60"]
                    .filter((k) => t.values?.[k])
                    .map((k) => `${k.slice(1)} m : ${t.values[k]} s`)
                    .join(" · ") || "—"}
                </span>
                <button onClick={() => deleteSprint(t.id)} style={{ background: "none", border: "none", color: "#d9695a", cursor: "pointer", fontSize: 12 }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </FoldCard>

      {/* ==================== BOUTON AJOUTER RM ==================== */}
      {/* Le bouton "Ajouter un exercice" a été retiré : la liste des
          exercices est désormais entièrement alimentée par la banque
          d'exercices (automatique). Le formulaire ci-dessous ne sert plus
          qu'à enregistrer le 1RM réel d'un exercice déjà présent, via le
          bouton "✏️ Modifier" sur sa fiche — pour remplacer le 1RM
          théorique par la valeur effectivement testée. */}

      {/* ==================== FORMULAIRE RM (édition uniquement) ==================== */}
      {showAddForm && (
        <div
          ref={formRef}
          style={{
            ...CARD_STYLE,
            border: CARD_ACCENT_BORDER,
            scrollMarginTop: 90,
          }}
        >
          <h3 style={{ margin: "0 0 20px 0", fontSize: 18, textTransform: "capitalize" }}>
            ✏️ Modifier — {editingRM}
          </h3>

          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: "#a8a199", margin: "0 0 5px 0" }}>
              💡 Renseigne ici le poids et les répétitions réellement effectués
              pour remplacer le 1RM théorique par ta vraie valeur testée.
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 14,
                color: "#f3f0ea",
                fontWeight: "bold",
              }}
            >
              Poids du test (kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={testWeight}
              onChange={(e) => setTestWeight(e.target.value)}
              placeholder="100"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 14,
                color: "#f3f0ea",
                fontWeight: "bold",
              }}
            >
              Nombre de répétitions (1-10)
            </label>
            <select
              value={testReps}
              onChange={(e) => setTestReps(Number(e.target.value))}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#151310",
                color: "#f3f0ea",
                fontSize: 16,
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} rep{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Aperçu */}
          {calculated1RM && (
            <div
              style={{
                background: "rgba(224,161,61,0.14)",
                padding: 20,
                borderRadius: 10,
                border: "2px solid #e0a13d",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, color: "#a8a199", marginBottom: 8 }}>
                1RM THÉORIQUE ESTIMÉ
              </div>
              <div
                style={{ fontSize: 48, fontWeight: "bold", color: "#e0a13d" }}
              >
                {calculated1RM} kg
              </div>
              <div style={{ fontSize: 12, color: "#a8a199", marginTop: 8 }}>
                Basé sur {testWeight} kg × {testReps} rep
                {testReps > 1 ? "s" : ""}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSaveRM}
              style={{
                flex: 1,
                padding: 14,
                background: "#e0a13d",
                color: "#1a1306",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              ✅ Enregistrer
            </button>
            <button
              onClick={cancelForm}
              style={{
                flex: 1,
                padding: 14,
                background: "#a8a199",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ==================== RECHERCHE + CATÉGORIES ==================== */}
      {Object.keys(rmHistory).length > 0 && (
        <div style={{ ...CARD_STYLE, padding: 14 }}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="text"
              placeholder="🔍 Rechercher un exercice..."
              value={rmSearchQuery}
              onChange={(e) => { setRmSearchQuery(e.target.value); setShowRmSuggest(true); }}
              onFocus={() => setShowRmSuggest(true)}
              onBlur={() => setTimeout(() => setShowRmSuggest(false), 150)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2a2620",
                background: "#1a1815",
                color: "#f3f0ea",
                boxSizing: "border-box",
                fontSize: 16,
              }}
            />
            {showRmSuggest && rmSuggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  background: "#1a1815",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 260,
                  overflowY: "auto",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                }}
              >
                {rmSuggestions.map((name, i) => (
                  <div
                    key={name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setRmSearchQuery(name);
                      setRmCategoryFilter("all");
                      setSelectedExercise(name);
                      setShowRmSuggest(false);
                    }}
                    style={{
                      padding: "12px 12px",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#f3f0ea",
                      textTransform: "capitalize",
                      borderBottom: i < rmSuggestions.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setRmCategoryFilter("all")}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid #2a2620",
                background: rmCategoryFilter === "all" ? "#e0a13d" : "#1a1815",
                color: rmCategoryFilter === "all" ? "#1a1306" : "#f3f0ea",
                fontSize: 12,
                fontWeight: rmCategoryFilter === "all" ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              Toutes
            </button>
            {EXERCISE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setRmCategoryFilter(c.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #2a2620",
                  background: rmCategoryFilter === c.value ? "#e0a13d" : "#1a1815",
                  color: rmCategoryFilter === c.value ? "#1a1306" : "#f3f0ea",
                  fontSize: 12,
                  fontWeight: rmCategoryFilter === c.value ? "bold" : "normal",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ==================== LISTE DES EXERCICES ==================== */}
      {exercises.length > 0 ? (
        <>
          <FoldCard id="list" fold={fold} title={`📋 Mes exercices (${exercises.length})`}>
            <div style={{ display: "grid", gap: 10 }}>
              {exercises.map((exercise) => {
                const history = rmHistory[exercise];
                const hasData = history.length > 0;
                const latest = hasData ? history[history.length - 1] : null;
                // Progression = dernier test vs test PRÉCÉDENT (pas vs le tout
                // premier), kg arrondis à l'unité.
                const previous = history.length > 1 ? history[history.length - 2] : null;
                const progression = previous
                  ? Math.round(latest.kg) - Math.round(previous.kg)
                  : 0;
                const progressionPercent =
                  previous && previous.kg
                    ? (((latest.kg - previous.kg) / previous.kg) * 100).toFixed(1)
                    : "0";

                return (
                  <div
                    key={exercise}
                    onClick={() => setSelectedExercise(exercise)}
                    style={{
                      background: "#0d0c0a",
                      padding: 14,
                      borderRadius: 10,
                      border: `1px solid ${
                        selectedExercise === exercise ? "#e0a13d" : "rgba(255,255,255,0.08)"
                      }`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      opacity: hasData ? 1 : 0.75,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: "1 1 200px" }}>
                        <h4
                          style={{
                            margin: "0 0 4px 0",
                            fontSize: 16,
                            textTransform: "capitalize",
                          }}
                        >
                          {exercise}
                        </h4>
                        <div style={{ fontSize: 11, color: "#a8a199", marginBottom: 4 }}>
                          {getExerciseCategoryLabel(rmCategories[exercise])}
                        </div>
                        <div style={{ fontSize: 12, color: "#a8a199" }}>
                          {hasData
                            ? `${history.length} enregistrement${history.length > 1 ? "s" : ""}`
                            : "Pas encore testé"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 20 }}>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#a8a199",
                              marginBottom: 3,
                            }}
                          >
                            RM ACTUEL
                          </div>
                          <div
                            style={{
                              fontSize: hasData ? 20 : 13,
                              fontWeight: "bold",
                              color: hasData ? "#e0a13d" : "#a8a199",
                            }}
                          >
                            {hasData ? `${Math.round(latest.kg)} kg` : "En attente"}
                          </div>
                        </div>

                        {hasData && history.length > 1 && (
                          <div style={{ textAlign: "center" }}>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#a8a199",
                                marginBottom: 3,
                              }}
                            >
                              VS PRÉCÉDENT
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: "bold",
                                color: progression >= 0 ? "#4fae7d" : "#d9695a",
                              }}
                            >
                              {progression >= 0 ? "+" : ""}
                              {progression} kg
                            </div>
                            <div
                              style={{
                                display: "inline-block",
                                marginTop: 4,
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 15,
                                fontWeight: "bold",
                                color:
                                  Number(progressionPercent) === 0
                                    ? "#a8a199"
                                    : progression >= 0
                                    ? "#4fae7d"
                                    : "#d9695a",
                                background:
                                  Number(progressionPercent) === 0
                                    ? "rgba(168,161,153,0.16)"
                                    : progression >= 0
                                    ? "rgba(79,174,125,0.16)"
                                    : "rgba(217,105,90,0.16)",
                              }}
                            >
                              {Number(progressionPercent) === 0
                                ? "= "
                                : Number(progressionPercent) > 0
                                ? "▲ +"
                                : "▼ "}
                              {progressionPercent}%
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </FoldCard>

          {/* ==================== DÉTAILS EXERCICE ==================== */}
          {selectedExercise && rmHistory[selectedExercise] && (
            <div
              ref={detailRef}
              style={{
                ...CARD_STYLE,
                border: CARD_ACCENT_BORDER,
                scrollMarginTop: 90,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    textTransform: "capitalize",
                  }}
                >
                  📊 {selectedExercise}
                </h3>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => handleEditRM(selectedExercise)}
                    style={{
                      padding: "8px 14px",
                      background: "#e0a13d",
                      color: "#1a1306",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => setSelectedExercise(null)}
                    style={{
                      padding: "8px 14px",
                      background: "#a8a199",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {/* Graphique d'évolution */}
              <div style={{ marginBottom: 25 }}>
                <h4 style={{ fontSize: 16, marginBottom: 15 }}>
                  📈 Évolution du 1RM
                </h4>
                {rmHistory[selectedExercise].length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "#a8a199",
                      fontSize: 14,
                    }}
                  >
                    Pas encore testé — complète une séance avec cet exercice
                    (série proche du max, ≤6 reps, RPE≥8) ou ajoute une valeur
                    toi-même avec "✏️ Modifier".
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={rmHistory[selectedExercise].map((item, index) => ({
                      ...item,
                      index: index + 1,
                      dateShort: new Date(item.date).toLocaleDateString(
                        "fr-FR",
                        { day: "2-digit", month: "2-digit" }
                      ),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.16)" />
                    <XAxis dataKey="dateShort" stroke="#a8a199" fontSize={11} />
                    <YAxis
                      stroke="#a8a199"
                      fontSize={11}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#151310",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#f3f0ea" }}
                      formatter={(value) => [`${Math.round(value)} kg`, "1RM"]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      name="1RM (kg)"
                      stroke="#e0a13d"
                      strokeWidth={3}
                      dot={{ fill: "#e0a13d", r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>

              {/* Historique détaillé */}
              <div>
                <h4 style={{ fontSize: 16, marginBottom: 15 }}>
                  📜 Historique
                </h4>
                <div style={{ display: "grid", gap: 10 }}>
                  {rmHistory[selectedExercise]
                    .slice()
                    .reverse()
                    .map((entry, index, arr) => {
                      // arr est inversé (plus récent d'abord) : le test
                      // précédent dans le temps est l'élément suivant.
                      const prevEntry = arr[index + 1];
                      const pct =
                        prevEntry && prevEntry.kg
                          ? ((entry.kg - prevEntry.kg) / prevEntry.kg) * 100
                          : null;
                      const dKg = prevEntry
                        ? Math.round(entry.kg) - Math.round(prevEntry.kg)
                        : null;
                      return (
                      <div
                        key={index}
                        style={{
                          background: "#0d0c0a",
                          padding: 14,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                color: "#a8a199",
                                marginBottom: 5,
                              }}
                            >
                              {new Date(entry.date).toLocaleDateString(
                                "fr-FR",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                }
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "#a8a199" }}>
                              Test : {entry.originalWeight} kg ×{" "}
                              {entry.originalReps} reps
                            </div>
                            {entry.autoAdjusted && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#d9a441",
                                  marginTop: 3,
                                }}
                              >
                                ⚡ Ajusté automatiquement (RPE)
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: "bold",
                              color: "#e0a13d",
                            }}
                          >
                            {Math.round(entry.kg)} kg
                            {pct !== null && (
                              <span
                                style={{
                                  marginLeft: 10,
                                  padding: "3px 10px",
                                  borderRadius: 999,
                                  fontSize: 14,
                                  color:
                                    pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                      ? "#a8a199"
                                      : pct > 0
                                      ? "#4fae7d"
                                      : "#d9695a",
                                  background:
                                    pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                      ? "rgba(168,161,153,0.16)"
                                      : pct > 0
                                      ? "rgba(79,174,125,0.16)"
                                      : "rgba(217,105,90,0.16)",
                                }}
                              >
                                {pct.toFixed(1) === "0.0" || pct.toFixed(1) === "-0.0"
                                  ? "= "
                                  : pct > 0
                                  ? "▲ +"
                                  : "▼ "}
                                {pct.toFixed(1)}%
                                {dKg !== null && ` (${dKg >= 0 ? "+" : ""}${dKg} kg)`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        !showAddForm && (
          <div
            style={{
              ...CARD_STYLE,
              padding: 32,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 16, margin: "0 0 10px 0" }}>
              Aucun exercice pour l'instant
            </p>
            <p style={{ fontSize: 14, color: "#a8a199", margin: 0 }}>
              Tes exercices apparaîtront ici automatiquement dès qu'un
              coach les ajoute à la banque d'exercices.
            </p>
          </div>
        )
      )}
    </Page>
  );
}
