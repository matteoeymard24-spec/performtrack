import React, { useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import {
  CYCLE_LEVELS,
  PHASES,
  MODELS,
  modelOf,
  phasesOfModel,
  FIXTURE_KINDS,
  kindOf,
  fixtureEnd,
  fixturesOnDay,
  nextFixture,
  phaseOf,
  levelOf,
  cycleColor,
  parseDay,
  dayStr,
  addDays,
  diffDays,
  mondayOf,
  fmtShort,
  fmtLong,
  cycleInScope,
  isIndividual,
  userScope,
  scopeUid,
  sessionsOfCycle,
  sessionMinutes,
  cyclesOnDay,
  weekInCycle,
  packRows,
  buildPlan,
  hardnessOf,
  hasLoadInfo,
  scopeRank,
} from "./cycles";

const CARD = "#151310";
const DARK = "#0d0c0a";
const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const GREEN = "#4fae7d";
const AMBER = "#e0a13d";

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  background: DARK,
  color: TEXT,
  border: "1px solid #2a2620",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};
const btn = (bg, color = "#fff") => ({
  padding: "8px 14px",
  background: bg,
  color,
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
});
/* Fenêtre flottante : le formulaire est toujours visible, même quand la liste
   des cycles est longue (avant, il s'ouvrait en haut de page, hors écran). */
function Modal({ children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, overflowY: "auto", padding: 12, display: "flex", justifyContent: "center", alignItems: "flex-start" }}
    >
      <div style={{ width: "100%", maxWidth: 720, marginTop: 16, marginBottom: 80 }}>{children}</div>
    </div>
  );
}
const typeIcon = (e) => (e.type === "sprint" ? "⚡" : e.type === "endurance" ? "🏃" : "💪");

/* ------------------------------------------------------------------ */
/* Bandeau : bouton d'ouverture + cycle(s) en cours aujourd'hui        */
/* ------------------------------------------------------------------ */
export function CycleBanner({ cycles, fixtures, scopes, todayStr, open, onToggle, label = "Planification" }) {
  const list = (cycles || []).filter((c) => cycleInScope(c, scopes));
  const now = cyclesOnDay(list, todayStr);
  const upcoming = list
    .filter((c) => c.startDate > todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <button onClick={onToggle} style={btn(open ? "#2a2620" : "#5b8def")}>
        🗂️ {label} {open ? "▲" : "▼"}
      </button>
      {now.map((c) => {
        const w = weekInCycle(c, todayStr);
        return (
          <span
            key={c.id}
            title={`${levelOf(c.level).label} · ${fmtShort(c.startDate)} → ${fmtShort(c.endDate)}`}
            style={{
              background: cycleColor(c) + "26",
              border: `1px solid ${cycleColor(c)}`,
              color: TEXT,
              padding: "4px 10px",
              borderRadius: 14,
              fontSize: 12,
            }}
          >
            <b style={{ color: cycleColor(c) }}>{levelOf(c.level).short}</b> · {c.name} · S{w.idx}/{w.total}
          </span>
        );
      })}
      {now.length === 0 && upcoming && (
        <span style={{ color: MUTED, fontSize: 12 }}>
          Prochain cycle : <b style={{ color: TEXT }}>{upcoming.name}</b> dans {diffDays(todayStr, upcoming.startDate)} j
        </span>
      )}
      {now.length === 0 && !upcoming && (
        <span style={{ color: MUTED, fontSize: 12 }}>Aucun cycle planifié</span>
      )}
      {(() => {
        const nf = nextFixture((fixtures || []).filter((f) => cycleInScope(f, scopes)), todayStr);
        if (!nf) return null;
        const k = kindOf(nf.kind);
        const inDays = diffDays(todayStr, nf.date);
        return (
          <span
            title={`${k.label} · ${fmtShort(nf.date)}`}
            style={{ background: k.color + "26", border: `1px solid ${k.color}`, color: TEXT, padding: "4px 10px", borderRadius: 14, fontSize: 12 }}
          >
            {k.icon} <b>{nf.name}</b> · {inDays <= 0 ? "en cours" : inDays === 0 ? "aujourd'hui" : `J-${inDays}`}
          </span>
        );
      })()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau complet                                                     */
/* ------------------------------------------------------------------ */
export default function PlanningPanel({
  cycles,
  fixtures,
  events,
  customGroups,
  athletes,
  isAdmin,
  currentUser,
  scopes,
  defaultScope = "total",
  onReload,
  onReloadFixtures,
  onOpenSession,
}) {
  const todayStr = dayStr(new Date());
  const [openId, setOpenId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const cardRefs = useRef({});
  const [form, setForm] = useState(null); // null = fermé ; {id?, ...}
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null); // {src, start, name, parentId}
  const [fForm, setFForm] = useState(null); // formulaire match / compétition
  const setFF = (patch) => setFForm((f) => ({ ...f, ...patch }));

  const visible = useMemo(
    () => (cycles || []).filter((c) => cycleInScope(c, scopes)).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [cycles, scopes]
  );
  const scopedEvents = useMemo(() => events || [], [events]);

  const visibleFixtures = useMemo(
    () => (fixtures || []).filter((f) => cycleInScope(f, scopes)).sort((a, b) => a.date.localeCompare(b.date)),
    [fixtures, scopes]
  );

  /* ---------------- hiérarchie, ordre d'affichage et masquage ----------------
     Un microcycle (semaine) s'affiche TOUJOURS sous son mésocycle, même si sa
     date est antérieure. Masquer un cycle masque aussi tout ce qu'il contient. */
  const [showHidden, setShowHidden] = useState(false);
  // Séances affichées dans chaque cycle : par défaut visibles dans les semaines
  // (microcycles), repliées dans les mésocycles/macrocycles (bouton pour tout voir).
  const [sessShow, setSessShow] = useState({});
  const showSess = (c) => sessShow[c.id] ?? c.level === "micro";
  const toggleSess = (c) => setSessShow((m) => ({ ...m, [c.id]: !showSess(c) }));
  const setAllSess = (on) => setSessShow(Object.fromEntries((cycles || []).map((c) => [c.id, on])));
  const byId = useMemo(() => Object.fromEntries(visible.map((c) => [c.id, c])), [visible]);
  const parentOfCycle = (c) => {
    if (c.parentId && byId[c.parentId]) return byId[c.parentId];
    if (c.level !== "micro") return null;
    const cands = visible.filter(
      (p) =>
        p.level !== "micro" &&
        p.id !== c.id &&
        (p.scope || "total") === (c.scope || "total") &&
        p.startDate <= c.startDate &&
        p.endDate >= c.startDate
    );
    return cands.find((p) => p.level === "meso") || cands[0] || null;
  };
  const isHiddenCycle = (c, depth = 0) =>
    !!c.hidden || (depth < 4 && (() => { const p = parentOfCycle(c); return p ? isHiddenCycle(p, depth + 1) : false; })());
  const hiddenCount = visible.filter((c) => isHiddenCycle(c)).length;
  // Clic sur un cycle (frise ou graphique) : on saute directement à sa fiche
  // dans la liste, ouverte et surlignée, avec ses boutons « Modifier » etc.
  const goToCycle = (c) => {
    if (isAdmin && isHiddenCycle(c)) setShowHidden(true);
    setOpenId(c.id);
    setFlashId(c.id);
    setTimeout(() => {
      const el = cardRefs.current[c.id];
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    setTimeout(() => setFlashId((f) => (f === c.id ? null : f)), 2200);
  };
  const revealHidden = isAdmin && showHidden;
  const shown = visible.filter((c) => revealHidden || !isHiddenCycle(c));
  const ordered = useMemo(() => {
    const ids = new Set(shown.map((c) => c.id));
    const kids = {};
    const tops = [];
    shown.forEach((c) => {
      const p = parentOfCycle(c);
      if (p && ids.has(p.id)) (kids[p.id] = kids[p.id] || []).push(c);
      else tops.push(c);
    });
    const byStart = (a, b) => a.startDate.localeCompare(b.startDate);
    const out = [];
    const walk = (c, depth) => {
      out.push({ c, depth });
      (kids[c.id] || []).sort(byStart).forEach((k) => walk(k, depth + 1));
    };
    tops.sort(byStart).forEach((c) => walk(c, 0));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showHidden, isAdmin]);

  /* ---------------- période affichée : année civile (janv. → déc.) ----------------
     Les mois vides AVANT le début de la planification sont masqués, pour que
     l'athlète voie réellement où elle commence. */
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [showWholeYear, setShowWholeYear] = useState(false);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const firstPlanned = useMemo(() => {
    const starts = [
      ...shown.filter((c) => c.endDate >= yearStart && c.startDate < yearEnd).map((c) => c.startDate),
      ...visibleFixtures.filter((f) => fixtureEnd(f) >= yearStart && f.date < yearEnd).map((f) => f.date),
    ].map((d) => (d < yearStart ? yearStart : d));
    return starts.length ? starts.sort()[0] : null;
  }, [visible, showHidden, visibleFixtures, yearStart, yearEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const rangeStart = !showWholeYear && firstPlanned ? `${firstPlanned.slice(0, 7)}-01` : yearStart;
  const rangeEnd = yearEnd;
  const SPAN_MONTHS = 12 - (Number(rangeStart.slice(5, 7)) - 1);
  const hiddenMonths = Number(rangeStart.slice(5, 7)) - 1;
  const totalDays = Math.max(1, diffDays(rangeStart, rangeEnd));
  const pct = (day) => (diffDays(rangeStart, day) / totalDays) * 100;

  const blankFixture = () => ({ name: "", kind: "match", date: todayStr, endDate: "", place: "", scope: defaultScope, notes: "" });
  const saveFixture = async () => {
    const f = fForm;
    if (!f.name.trim()) return alert("Donne un nom (ex. « Agen – Brive »).");
    if (!f.date) return alert("La date est obligatoire.");
    if (f.endDate && f.endDate < f.date) return alert("La fin doit être après le début.");
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(),
        kind: f.kind,
        date: f.date,
        endDate: f.endDate || "",
        place: (f.place || "").trim(),
        scope: f.scope || "total",
        notes: (f.notes || "").trim(),
      };
      if (f.id) await updateDoc(doc(db, "fixtures", f.id), payload);
      else await addDoc(collection(db, "fixtures"), { ...payload, createdBy: currentUser?.uid || null, createdAt: serverTimestamp() });
      setFForm(null);
      if (onReloadFixtures) await onReloadFixtures();
    } catch (e) {
      alert("Erreur : " + e.message + "\n(Les règles Firestore autorisent-elles la collection « fixtures » ? Voir le fichier de règles.)");
    } finally {
      setBusy(false);
    }
  };
  const removeFixture = async (f) => {
    if (!window.confirm(`Supprimer « ${f.name} » ?`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "fixtures", f.id));
      if (onReloadFixtures) await onReloadFixtures();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const athleteLabel = (uid) => {
    const a = (athletes || []).find((x) => x.id === uid);
    if (a) return a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName || a.email || "Athlète";
    return currentUser && uid === currentUser.uid ? "Moi" : "Athlète";
  };
  const groupName = (scope) =>
    !scope || scope === "total"
      ? "Tous"
      : String(scope).startsWith("user:")
      ? `👤 ${athleteLabel(scopeUid(scope))} (individuel)`
      : (customGroups || []).find((g) => g.id === scope)?.name || scope;
  const groupsOfUser = (uid) => (customGroups || []).filter((g) => (g.athleteIds || []).includes(uid)).map((g) => g.id);

  /* ---------------- frise : mois + 3 niveaux ---------------- */
  const months = useMemo(() => {
    const out = [];
    const d = parseDay(rangeStart);
    d.setDate(1);
    for (let i = 0; i < SPAN_MONTHS; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() + i, 1, 12);
      out.push({ day: dayStr(m), label: m.toLocaleDateString("fr-FR", { month: "short" }), year: m.getFullYear() });
    }
    return out;
  }, [rangeStart]);

  const lanes = CYCLE_LEVELS.map((lv) => {
    const inRange = shown.filter(
      (c) => c.level === lv.id && c.endDate >= rangeStart && c.startDate <= rangeEnd
    );
    return { lv, ...packRows(inRange) };
  });

  /* ---------------- volume / intensité par semaine ---------------- */
  const loadWeeks = useMemo(() => {
    const best = {};
    shown
      .filter((c) => c.level === "micro" && c.endDate >= rangeStart && c.startDate <= rangeEnd)
      .forEach((c) => {
        const k = c.startDate;
        if (!best[k] || scopeRank(c) > scopeRank(best[k]) || (scopeRank(c) === scopeRank(best[k]) && hasLoadInfo(c) && !hasLoadInfo(best[k]))) best[k] = c;
      });
    return Object.values(best)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((c) => ({ c }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, rangeStart, rangeEnd]);
  const anyLoadInfo = loadWeeks.some(({ c }) => hasLoadInfo(c));

  /* ---------------- formulaire ---------------- */
  // Ondulatoire : le nom suit la phase (Développement, Maintien, Affûtage…)
  // tant qu'il est vide ou qu'il porte encore un nom de phase automatique.
  const autoNamePatch = (f, model, phase) => {
    if (model !== "ondulation") return {};
    const isAuto = !f.name || !f.name.trim() || PHASES.some((x) => x.label === f.name.trim());
    return isAuto ? { name: phaseOf(phase).label } : {};
  };
  const blank = () => ({
    name: "",
    level: "meso",
    model: "bloc",
    phase: "accumulation",
    startDate: todayStr,
    endDate: addDays(todayStr, 27),
    _dur: 27, // durée mémorisée (en jours) : quand on change le début, la fin suit
    scope: defaultScope,
    objective: "",
    notes: "",
  });
  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));
  // Une date saisie au clavier passe par des valeurs intermédiaires (année 0002,
  // 0020…) : on ne réagit qu'aux dates plausibles.
  const okDay = (v) => typeof v === "string" && v.length === 10 && v >= "2000-01-01";
  const setStart = (v) =>
    setForm((f) => {
      const n = { ...f, startDate: v };
      if (okDay(v)) n.endDate = addDays(v, f._dur ?? 27);
      return n;
    });
  const setEnd = (v) =>
    setForm((f) => {
      const n = { ...f, endDate: v };
      if (okDay(v) && okDay(f.startDate) && v >= f.startDate) n._dur = diffDays(f.startDate, v);
      return n;
    });
  const setWeeks = (nw) =>
    setForm((f) => {
      const d = nw * 7 - 1;
      return { ...f, endDate: okDay(f.startDate) ? addDays(f.startDate, d) : f.endDate, _dur: d };
    });
  const snapMonday = () =>
    setForm((f) => (okDay(f.startDate) ? { ...f, startDate: mondayOf(f.startDate), endDate: addDays(mondayOf(f.startDate), f._dur ?? 27) } : f));

  const save = async () => {
    let f = form;
    if (!f.name.trim() && f.model === "ondulation") f = { ...f, name: phaseOf(f.phase).label };
    if (!f.name.trim()) return alert("Donne un nom au cycle.");
    if (!f.startDate || !f.endDate) return alert("Dates de début et de fin obligatoires.");
    if (f.endDate < f.startDate) return alert("La fin doit être après le début.");
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(),
        level: f.level,
        model: f.model || "bloc",
        phase: f.phase,
        startDate: f.startDate,
        endDate: f.endDate,
        scope: f.scope || "total",
        objective: (f.objective || "").trim(),
        notes: (f.notes || "").trim(),
        hidden: !!f.hidden,
        intensity: f.intensity === "" || f.intensity == null ? null : Number(f.intensity),
        volume: f.volume === "" || f.volume == null ? null : Number(f.volume),
      };
      if (f.id) await updateDoc(doc(db, "cycles", f.id), payload);
      else await addDoc(collection(db, "cycles"), { ...payload, createdBy: currentUser?.uid || null, createdAt: serverTimestamp() });
      setForm(null);
      await onReload();
    } catch (e) {
      alert("Erreur : " + e.message + "\n(Les règles Firestore autorisent-elles la collection « cycles » ? Voir le fichier de règles.)");
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- duplication d'un cycle ---------------- */
  const descendantsOf = (id) => {
    const out = [];
    const walk = (pid) => (cycles || []).filter((x) => x.parentId === pid).forEach((k) => { out.push(k); walk(k.id); });
    walk(id);
    return out;
  };
  const containerAt = (src, day) =>
    (cycles || []).find((x) => x.id !== src.id && x.level !== "micro" && (x.level === "macro" ? src.level !== "macro" : src.level === "micro") && x.startDate <= day && day <= x.endDate && (x.scope || "total") === (src.scope || "total"));
  const openDup = (c) => {
    const start = addDays(c.endDate, 1);
    setForm(null);
    setDup({ src: c, start, name: c.name, parentId: (containerAt(c, start) || {}).id || (c.level === "micro" ? c.parentId || "" : c.parentId || "") });
  };
  const doDuplicate = async () => {
    const { src, start, name, parentId } = dup;
    if (!(typeof start === "string" && start.length === 10 && start >= "2000-01-01")) return alert("Date de début invalide.");
    if (!name.trim()) return alert("Donne un nom à la copie.");
    const shift = diffDays(src.startDate, start);
    const kids = descendantsOf(src.id);
    setBusy(true);
    try {
      const b = writeBatch(db);
      const strip = (x) => {
        const { id, createdAt, createdBy, ...rest } = x;
        return rest;
      };
      const newRef = doc(collection(db, "cycles"));
      b.set(newRef, {
        ...strip(src),
        name: name.trim(),
        startDate: addDays(src.startDate, shift),
        endDate: addDays(src.endDate, shift),
        parentId: parentId || null,
        hidden: false,
        createdBy: currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });
      const idMap = { [src.id]: newRef.id };
      // parents avant enfants
      const queue = [...kids];
      let guard = 0;
      while (queue.length && guard++ < 1000) {
        const k = queue.shift();
        if (!idMap[k.parentId]) { queue.push(k); continue; }
        const r = doc(collection(db, "cycles"));
        idMap[k.id] = r.id;
        b.set(r, {
          ...strip(k),
          startDate: addDays(k.startDate, shift),
          endDate: addDays(k.endDate, shift),
          parentId: idMap[k.parentId],
          hidden: false,
          createdBy: currentUser?.uid || null,
          createdAt: serverTimestamp(),
        });
      }
      await b.commit();
      setDup(null);
      await onReload();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async (c) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "cycles", c.id), { hidden: !c.hidden });
      await onReload();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    const kids = (cycles || []).filter((x) => x.parentId === c.id);
    const msg = kids.length
      ? `Supprimer « ${c.name} » ET ses ${kids.length} cycle(s) enfant(s) ? Les séances ne sont pas touchées.`
      : `Supprimer « ${c.name} » ? Les séances ne sont pas touchées.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      b.delete(doc(db, "cycles", c.id));
      kids.forEach((k) => b.delete(doc(db, "cycles", k.id)));
      await b.commit();
      await onReload();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const generateWeeks = async (c) => {
    const exists = (cycles || []).filter((x) => x.parentId === c.id && x.level === "micro");
    const total = Math.max(1, Math.ceil((diffDays(c.startDate, c.endDate) + 1) / 7));
    if (!window.confirm(`Créer ${total} semaine(s) (microcycles) dans « ${c.name} » ?`)) return;
    const withTransition =
      total >= 2 &&
      window.confirm(
        "Dernière semaine = TRANSITION ?\n\nOK : la dernière semaine devient un mini-mésocycle « Transition » d'une semaine (le cycle se termine la veille).\nAnnuler : toutes les semaines restent dans le cycle."
      );
    const plan = buildPlan(c, { lastIsTransition: withTransition });
    const weeksToMake = plan.weeks.filter((w) => !exists.some((x) => x.startDate === w.startDate));
    const transitionExists =
      plan.transition &&
      (cycles || []).some((x) => x.level === "meso" && x.phase === "transition" && x.startDate === plan.transition.startDate && (x.scope || "total") === (c.scope || "total"));
    if (weeksToMake.length === 0 && (!plan.transition || transitionExists)) return alert("Tout existe déjà.");
    setBusy(true);
    try {
      const b = writeBatch(db);
      weeksToMake.forEach((w) =>
        b.set(doc(collection(db, "cycles")), { ...w, createdBy: currentUser?.uid || null, createdAt: serverTimestamp() })
      );
      if (plan.transition && !transitionExists) {
        b.set(doc(collection(db, "cycles")), { ...plan.transition, createdBy: currentUser?.uid || null, createdAt: serverTimestamp() });
        b.update(doc(db, "cycles", c.id), { endDate: plan.newParentEnd });
      }
      await b.commit();
      await onReload();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- rendu ---------------- */
  return (
    <div style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: TEXT }}>🗂️ Planification</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setYear((y) => y - 1)} style={btn("#2a2620")}>◀</button>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 700, minWidth: 44, textAlign: "center" }}>{year}</span>
          <button onClick={() => setYear((y) => y + 1)} style={btn("#2a2620")}>▶</button>
          {hiddenMonths > 0 && (
            <button onClick={() => setShowWholeYear(true)} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }} title="Afficher aussi les mois sans planification">
              + {hiddenMonths} mois masqué{hiddenMonths > 1 ? "s" : ""}
            </button>
          )}
          {showWholeYear && firstPlanned && (
            <button onClick={() => setShowWholeYear(false)} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }}>
              Masquer les mois vides
            </button>
          )}
          {isAdmin && (
            <>
              <button onClick={() => { setFForm(null); setForm(blank()); }} style={btn(GREEN)}>
                ➕ Nouveau cycle
              </button>
              <button onClick={() => { setForm(null); setFForm(blankFixture()); }} style={btn("#d9534f")}>
                🏉 Match / compétition
              </button>
            </>
          )}
        </div>
      </div>

      {/* Frise */}
      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <div style={{ minWidth: 640, position: "relative" }}>
          {/* mois */}
          <div style={{ position: "relative", height: 20, borderBottom: "1px solid #2a2620" }}>
            {months.map((m) => (
              <div
                key={m.day}
                style={{ position: "absolute", left: `${pct(m.day)}%`, fontSize: 10, color: MUTED, borderLeft: "1px solid #2a2620", paddingLeft: 3, height: 20 }}
              >
                {m.label}
                {m === months[0] ? ` ${m.year}` : ""}
              </div>
            ))}
          </div>

          {/* 3 niveaux */}
          {lanes.map(({ lv, items, rowCount }) => (
            <div key={lv.id} style={{ position: "relative", height: rowCount * 24 + 6, borderBottom: "1px dashed #1d1a16" }}>
              <div style={{ position: "absolute", left: 0, top: 2, fontSize: 9, color: "#5e584f", zIndex: 0 }}>{lv.short}</div>
              {items.map(({ c, row }) => {
                const left = Math.max(0, pct(c.startDate));
                const right = Math.min(100, pct(addDays(c.endDate, 1)));
                return (
                  <div
                    key={c.id}
                    onClick={() => goToCycle(c)}
                    title={`${c.name} · ${phaseOf(c.phase).label} · ${fmtShort(c.startDate)} → ${fmtShort(c.endDate)}`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${Math.max(0.6, right - left)}%`,
                      top: row * 24 + 3,
                      height: 20,
                      background: cycleColor(c),
                      opacity: openId && openId !== c.id ? 0.55 : 1,
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "0 5px",
                      lineHeight: "20px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      cursor: "pointer",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
                    }}
                  >
                    {isIndividual(c) ? "👤 " : ""}
                    {c.name}
                  </div>
                );
              })}
            </div>
          ))}

          {/* matchs et compétitions */}
          <div style={{ position: "relative", height: 26, borderBottom: "1px dashed #1d1a16" }}>
            <div style={{ position: "absolute", left: 0, top: 2, fontSize: 9, color: "#5e584f" }}>Matchs</div>
            {visibleFixtures
              .filter((f) => fixtureEnd(f) >= rangeStart && f.date <= rangeEnd)
              .map((f) => {
                const k = kindOf(f.kind);
                const left = Math.max(0, pct(f.date));
                const right = Math.min(100, pct(addDays(fixtureEnd(f), 1)));
                return (
                  <div
                    key={f.id}
                    onClick={() => { if (isAdmin) { setForm(null); setFForm({ ...f }); } }}
                    title={`${k.label} : ${f.name} · ${fmtShort(f.date)}${f.endDate ? " → " + fmtShort(f.endDate) : ""}${f.place ? " · " + f.place : ""}`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${Math.max(0.7, right - left)}%`,
                      minWidth: 6,
                      top: 4,
                      height: 18,
                      background: k.color,
                      borderRadius: 3,
                      cursor: isAdmin ? "pointer" : "default",
                      fontSize: 10,
                      lineHeight: "18px",
                      textAlign: "center",
                      overflow: "visible",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ position: "relative", top: -1 }}>{k.icon}</span>
                  </div>
                );
              })}
          </div>

          {/* volume & intensité par semaine (microcycles) — remplace l'ancienne charge en minutes */}
          <div style={{ position: "relative", height: 78, marginTop: 6 }}>
            <div style={{ position: "absolute", left: 0, top: 0, fontSize: 9, color: "#5e584f", zIndex: 1 }}>
              <span style={{ color: "#5b8def" }}>■</span> Volume · <span style={{ color: "#e0a13d" }}>■</span> Intensité (1-10) · trait du haut : légère / moyenne / dure
            </div>
            {loadWeeks
              .filter(({ c }) => hasLoadInfo(c))
              .map(({ c }) => {
                const h = hardnessOf(c);
                const wPct = (diffDays(c.startDate, addDays(c.endDate, 1)) / totalDays) * 100;
                const left = pct(c.startDate);
                const bar = (v) => (v == null ? 0 : Math.max(2, (Math.min(10, Number(v)) / 10) * 52));
                return (
                  <div
                    key={c.id}
                    onClick={() => goToCycle(c)}
                    title={`${c.name} · ${fmtShort(c.startDate)} → ${fmtShort(c.endDate)}\nVolume ${c.volume ?? "–"}/10 · Intensité ${c.intensity ?? "–"}/10${h ? "\n" + h.label : ""}`}
                    style={{ position: "absolute", left: `${left}%`, width: `${Math.max(0.8, wPct - 0.25)}%`, top: 14, bottom: 0, cursor: "pointer" }}
                  >
                    {h && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, borderRadius: 2, background: h.color }} />}
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 6, display: "flex", alignItems: "flex-end", gap: 1 }}>
                      <div style={{ flex: 1, height: bar(c.volume), background: "#5b8def", borderRadius: "2px 2px 0 0", opacity: c.volume == null ? 0 : 1 }} />
                      <div style={{ flex: 1, height: bar(c.intensity), background: "#e0a13d", borderRadius: "2px 2px 0 0", opacity: c.intensity == null ? 0 : 1 }} />
                    </div>
                  </div>
                );
              })}
            {!anyLoadInfo && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 24, textAlign: "center", fontSize: 11, color: MUTED }}>
                {isAdmin
                  ? "Ouvre une semaine (✏️ Modifier) et règle son volume et son intensité pour les voir ici."
                  : "Volume et intensité des semaines : pas encore renseignés."}
              </div>
            )}
          </div>

          {/* aujourd'hui */}
          {todayStr >= rangeStart && todayStr <= rangeEnd && (
            <div style={{ position: "absolute", left: `${pct(todayStr)}%`, top: 0, bottom: 0, width: 2, background: "#fff", opacity: 0.8, pointerEvents: "none" }}>
              <span style={{ position: "absolute", top: -2, left: 4, fontSize: 9, color: "#fff" }}>auj.</span>
            </div>
          )}
        </div>
      </div>

      {/* légende des phases */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {(() => {
          const used = PHASES.filter((p) => visible.some((c) => c.phase === p.id));
          return used.length ? used : PHASES.filter((p) => p.models.length);
        })().map((p) => (
          <span key={p.id} style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: "inline-block" }} />
            {p.label}
          </span>
        ))}
      </div>

      {/* duplication */}
      {dup && (
        <Modal>
          <div style={{ background: DARK, borderRadius: 10, padding: 14, border: `1px solid ${AMBER}` }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: TEXT }}>📋 Dupliquer « {dup.src.name} »</div>
            <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>
              {dup.src.level === "micro"
                ? "Copie cette semaine à la date choisie."
                : `Copie ce cycle${descendantsOf(dup.src.id).length ? ` + ses ${descendantsOf(dup.src.id).length} cycle(s) enfant(s) (semaines…)` : ""}, décalé à la nouvelle date. Les séances ne sont pas copiées.`}
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div>
                <label style={{ fontSize: 11, color: MUTED }}>Nom de la copie</label>
                <input style={inputStyle} value={dup.name} onChange={(e) => setDup((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: MUTED }}>Nouveau début (durée identique)</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={dup.start}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDup((d) => {
                      const ok = typeof v === "string" && v.length === 10 && v >= "2000-01-01";
                      const cont = ok ? containerAt(d.src, v) : null;
                      return { ...d, start: v, parentId: cont ? cont.id : d.parentId };
                    });
                  }}
                />
                {dup.start >= "2000-01-01" && (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>
                    → {fmtShort(dup.start)} au {fmtShort(addDays(dup.start, diffDays(dup.src.startDate, dup.src.endDate)))}
                  </div>
                )}
              </div>
              {dup.src.level !== "macro" && (
                <div>
                  <label style={{ fontSize: 11, color: MUTED }}>Rattacher à</label>
                  <select style={inputStyle} value={dup.parentId || ""} onChange={(e) => setDup((d) => ({ ...d, parentId: e.target.value }))}>
                    <option value="">(aucun)</option>
                    {(cycles || [])
                      .filter((x) => (dup.src.level === "micro" ? x.level !== "micro" : x.level === "macro"))
                      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
                      .map((x) => (
                        <option key={x.id} value={x.id}>{x.name} ({fmtShort(x.startDate)} → {fmtShort(x.endDate)})</option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={doDuplicate} style={btn(AMBER, "#1a1814")}>📋 Créer la copie</button>
              <button onClick={() => setDup(null)} style={btn("#2a2620")}>Annuler</button>
            </div>
          </div>
        </Modal>
      )}

      {/* formulaire */}
      {form && (
        <Modal>
        <div style={{ background: DARK, borderRadius: 10, padding: 14, border: `1px solid ${AMBER}` }}>
          <div style={{ fontWeight: 700, marginBottom: 10, color: TEXT }}>{form.id ? "✏️ Modifier le cycle" : "➕ Nouveau cycle"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Nom</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Ex : Force max, Intersaison…" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Niveau</label>
              <select style={inputStyle} value={form.level} onChange={(e) => setF({ level: e.target.value })}>
                {CYCLE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Modèle de planification</label>
              <select
                style={inputStyle}
                value={form.model || "bloc"}
                onChange={(e) => { const ph = phasesOfModel(e.target.value)[0].id; setF({ model: e.target.value, phase: ph, ...autoNamePatch(form, e.target.value, ph) }); }}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                {!MODELS.some((m) => m.id === (form.model || "bloc")) && (
                  <option value={form.model}>Ancien modèle (à convertir)</option>
                )}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Phase</label>
              <select style={inputStyle} value={form.phase} onChange={(e) => setF({ phase: e.target.value, ...autoNamePatch(form, form.model, e.target.value) })}>
                {phasesOfModel(form.model).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
                {!phasesOfModel(form.model).some((p) => p.id === form.phase) && (
                  <option value={form.phase}>{phaseOf(form.phase).label}</option>
                )}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Début</label>
              <input type="date" style={inputStyle} value={form.startDate} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Fin</label>
              <input type="date" style={inputStyle} value={form.endDate} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Pour qui</label>
              <select style={inputStyle} value={form.scope} onChange={(e) => setF({ scope: e.target.value })}>
                <option value="total">Tous</option>
                {(customGroups || []).length > 0 && (
                  <optgroup label="Groupes">
                    {(customGroups || []).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                )}
                {(athletes || []).length > 0 && (
                  <optgroup label="Athlète seul (individuel, prime sur le groupe)">
                    {(athletes || []).map((a) => (
                      <option key={a.id} value={userScope(a.id)}>
                        {a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName || a.email || "Athlète"}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Durée :</span>
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <button key={n} type="button" onClick={() => setWeeks(n)} style={{ ...btn("#2a2620"), padding: "4px 9px", fontSize: 12 }}>
                {n} sem.
              </button>
            ))}
            <button type="button" onClick={snapMonday} style={{ ...btn("#2a2620"), padding: "4px 9px", fontSize: 12 }}>
              Début → lundi
            </button>
            {okDay(form.startDate) && okDay(form.endDate) && form.endDate >= form.startDate && (
              <span style={{ fontSize: 11, color: MUTED }}>
                = {diffDays(form.startDate, form.endDate) + 1} j · {fmtShort(form.startDate)} → {fmtShort(form.endDate)}
              </span>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Objectif du cycle</label>
            <input style={inputStyle} value={form.objective} onChange={(e) => setF({ objective: e.target.value })} placeholder="Ex : +5 % sur le squat, base aérobie…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
            {[
              ["volume", "Volume", "#5b8def"],
              ["intensity", "Intensité", "#e0a13d"],
            ].map(([key, label, col]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: MUTED }}>
                  {label} : <b style={{ color: col }}>{form[key] == null || form[key] === "" ? "non renseigné" : `${form[key]}/10`}</b>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={form[key] == null || form[key] === "" ? 5 : form[key]}
                    onChange={(e) => setF({ [key]: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: col }}
                  />
                  <button type="button" onClick={() => setF({ [key]: null })} style={{ ...btn("#2a2620"), padding: "3px 8px", fontSize: 11 }}>
                    Effacer
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>1 = très léger · 10 = très dur. Visible par les athlètes dans le graphique.</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: TEXT, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.hidden} onChange={(e) => setF({ hidden: e.target.checked })} />
            🙈 Masquer ce cycle (terminé) — masque aussi tous les cycles qu'il contient
          </label>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button disabled={busy} onClick={save} style={btn(GREEN)}>{busy ? "…" : "Enregistrer"}</button>
            <button onClick={() => setForm(null)} style={btn("#2a2620")}>Annuler</button>
          </div>
        </div>
        </Modal>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setAllSess(true)} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }}>
          🏋️ Afficher toutes les séances
        </button>
        <button onClick={() => setAllSess(false)} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }}>
          Masquer toutes les séances
        </button>
        <button onClick={() => setSessShow({})} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }}>
          Par défaut (semaines seulement)
        </button>
      </div>
      {isAdmin && hiddenCount > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowHidden((v) => !v)} style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12 }}>
            {showHidden ? "Cacher les cycles masqués" : `👁 Afficher les cycles masqués (${hiddenCount})`}
          </button>
        </div>
      )}

      {/* liste des cycles */}
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {ordered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 13 }}>
            Aucun cycle pour l'instant.{isAdmin ? " Clique sur « Nouveau cycle » pour poser ta planification (ex. un macrocycle de saison, puis des mésocycles, puis les semaines)." : ""}
          </div>
        )}
        {ordered.map(({ c, depth }) => {
          const ss = sessionsOfCycle(c, scopedEvents, groupsOfUser, { customGroups, athletes }).sort((a, b) => a.date.localeCompare(b.date));
          const mins = ss.reduce((s, e) => s + sessionMinutes(e), 0);
          const isNow = c.startDate <= todayStr && todayStr <= c.endDate;
          const w = isNow ? weekInCycle(c, todayStr) : null;
          const parent = c.parentId ? (cycles || []).find((x) => x.id === c.parentId) : null;
          const open = openId === c.id;
          return (
            <div
              key={c.id}
              ref={(el) => { cardRefs.current[c.id] = el; }}
              style={{ background: DARK, borderRadius: 8, borderLeft: `5px solid ${cycleColor(c)}`, padding: 12, marginLeft: depth * 18, opacity: isHiddenCycle(c) ? 0.55 : 1, boxShadow: flashId === c.id ? `0 0 0 2px ${AMBER}` : "none", transition: "box-shadow 0.3s" }}
            >
              <div onClick={() => setOpenId(open ? null : c.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: TEXT, fontWeight: 700 }}>{c.name}</span>{" "}
                  <span style={{ background: cycleColor(c) + "33", color: cycleColor(c), padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                    {levelOf(c.level).short} · {phaseOf(c.phase).label}
                  </span>
                  {(c.model === "bloc" || c.model === "ondulation") && (
                    <span style={{ marginLeft: 6, color: MUTED, fontSize: 11 }}>({c.model === "bloc" ? "par blocs" : "ondulatoire"})</span>
                  )}
                  {isHiddenCycle(c) && <span style={{ marginLeft: 6, color: MUTED, fontSize: 11 }}>🙈 masqué</span>}
                  {(() => {
                    const h = hardnessOf(c);
                    return h ? (
                      <span style={{ marginLeft: 6, color: h.color, fontSize: 11, fontWeight: 700 }}>
                        {h.id === "dure" ? "🔥 " : ""}{h.label} · Vol {c.volume ?? "–"} · Int {c.intensity ?? "–"}
                      </span>
                    ) : null;
                  })()}
                  {isNow && <span style={{ marginLeft: 6, color: GREEN, fontSize: 11, fontWeight: 700 }}>● en cours · S{w.idx}/{w.total}</span>}
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
                    {fmtShort(c.startDate)} → {fmtShort(c.endDate)} · {groupName(c.scope)}
                    {parent ? ` · dans « ${parent.name} »` : ""}
                  </div>
                </div>
                <div style={{ color: MUTED, fontSize: 12, textAlign: "right" }}>
                  {ss.length} séance(s) · {mins} min
                </div>
              </div>
              {c.objective && <div style={{ color: TEXT, fontSize: 12, marginTop: 6 }}>🎯 {c.objective}</div>}
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => toggleSess(c)}
                  style={{ ...btn("#2a2620"), fontWeight: 500, fontSize: 12, padding: "4px 10px" }}
                >
                  🏋️ Séances ({ss.length}) {showSess(c) ? "▾" : "▸"}
                </button>
              </div>
              {showSess(c) && (
                <div style={{ marginTop: 8 }}>
                  {ss.length === 0 ? (
                    <div style={{ color: MUTED, fontSize: 12 }}>
                      Aucune séance pour cette cible sur cette période.
                      {(() => {
                        const other = scopedEvents.filter((e) => e.date >= c.startDate && e.date <= c.endDate).length;
                        return other > 0
                          ? ` (${other} séance(s) existent à ces dates mais pour une autre cible : vérifie « Pour qui » de ce cycle.)`
                          : "";
                      })()}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 4 }}>
                      {ss.map((e) => (
                        <div
                          key={e.id}
                          onClick={() => onOpenSession && onOpenSession(e)}
                          style={{ fontSize: 12, color: TEXT, background: CARD, borderRadius: 6, padding: "5px 8px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8 }}
                        >
                          <span>
                            {parseDay(e.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {typeIcon(e)} {e.title}
                          </span>
                          <span style={{ color: MUTED }}>{e.estimatedDuration ? `${e.estimatedDuration} min` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {open && (
                <div style={{ marginTop: 8 }}>
                  {c.notes && <div style={{ color: MUTED, fontSize: 12, whiteSpace: "pre-wrap", marginBottom: 8 }}>{c.notes}</div>}
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      <button onClick={() => { setFForm(null); setForm({ ...c, model: c.model || "bloc", _dur: Math.max(0, diffDays(c.startDate, c.endDate)) }); }} style={btn("#2a2620")}>✏️ Modifier</button>
                      {c.level !== "micro" && c.model !== "ondulation" && (
                        <button disabled={busy} onClick={() => generateWeeks(c)} style={btn("#5b8def")}>
                          ➕ Générer les semaines
                        </button>
                      )}
                      <button disabled={busy} onClick={() => openDup(c)} style={btn("#2a2620")} title="Copier ce cycle (et ses semaines) à une autre date">📋 Dupliquer</button>
                      <button disabled={busy} onClick={() => toggleHidden(c)} style={btn("#2a2620")}>
                        {c.hidden ? "👁 Réafficher" : "🙈 Masquer (terminé)"}
                      </button>
                      <button disabled={busy} onClick={() => remove(c)} style={btn("rgba(217,105,90,0.18)", "#d9695a")}>🗑️ Supprimer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* matchs et jours de compétition */}
      {fForm && (
        <Modal>
        <div style={{ background: DARK, borderRadius: 10, padding: 14, border: "1px solid #d9534f" }}>
          <div style={{ fontWeight: 700, marginBottom: 10, color: TEXT }}>{fForm.id ? "✏️ Modifier" : "🏉 Nouveau match / compétition"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Nom</label>
              <input style={inputStyle} value={fForm.name} onChange={(e) => setFF({ name: e.target.value })} placeholder="Ex : Agen – Brive" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Type</label>
              <select style={inputStyle} value={fForm.kind} onChange={(e) => setFF({ kind: e.target.value })}>
                {FIXTURE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Date</label>
              <input type="date" style={inputStyle} value={fForm.date} onChange={(e) => setFF({ date: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Fin (si plusieurs jours)</label>
              <input type="date" style={inputStyle} value={fForm.endDate || ""} onChange={(e) => setFF({ endDate: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Lieu</label>
              <input style={inputStyle} value={fForm.place || ""} onChange={(e) => setFF({ place: e.target.value })} placeholder="Domicile / extérieur…" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED }}>Pour qui</label>
              <select style={inputStyle} value={fForm.scope} onChange={(e) => setFF({ scope: e.target.value })}>
                <option value="total">Tous</option>
                {(customGroups || []).length > 0 && (
                  <optgroup label="Groupes">
                    {(customGroups || []).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                )}
                {(athletes || []).length > 0 && (
                  <optgroup label="Athlète seul">
                    {(athletes || []).map((a) => (
                      <option key={a.id} value={userScope(a.id)}>
                        {a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName || a.email || "Athlète"}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Notes</label>
            <input style={inputStyle} value={fForm.notes || ""} onChange={(e) => setFF({ notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button disabled={busy} onClick={saveFixture} style={btn(GREEN)}>{busy ? "…" : "Enregistrer"}</button>
            <button onClick={() => setFForm(null)} style={btn("#2a2620")}>Annuler</button>
          </div>
        </div>
        </Modal>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, color: TEXT, marginBottom: 8 }}>🏉 Matchs et compétitions</div>
        {visibleFixtures.length === 0 ? (
          <div style={{ color: MUTED, fontSize: 13 }}>
            Aucun match saisi.{isAdmin ? " Utilise « Match / compétition » pour les placer (pour tous, un groupe ou un athlète seul)." : ""}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {visibleFixtures.map((f) => {
              const k = kindOf(f.kind);
              const past = fixtureEnd(f) < todayStr;
              const inDays = diffDays(todayStr, f.date);
              return (
                <div
                  key={f.id}
                  style={{ background: DARK, borderRadius: 8, borderLeft: `5px solid ${k.color}`, padding: "8px 12px", opacity: past ? 0.55 : 1, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                >
                  <div>
                    <span style={{ color: TEXT, fontWeight: 700 }}>{k.icon} {f.name}</span>{" "}
                    <span style={{ color: MUTED, fontSize: 12 }}>
                      {fmtShort(f.date)}
                      {f.endDate && f.endDate !== f.date ? ` → ${fmtShort(f.endDate)}` : ""}
                      {f.place ? ` · ${f.place}` : ""} · {groupName(f.scope)}
                    </span>
                    {f.notes && <div style={{ color: MUTED, fontSize: 12 }}>{f.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {!past && (
                      <span style={{ color: k.color, fontWeight: 700, fontSize: 12 }}>
                        {inDays <= 0 ? "en cours" : `J-${inDays}`}
                      </span>
                    )}
                    {isAdmin && (
                      <>
                        <button onClick={() => { setForm(null); setFForm({ ...f }); }} style={btn("#2a2620")}>✏️</button>
                        <button disabled={busy} onClick={() => removeFixture(f)} style={btn("rgba(217,105,90,0.18)", "#d9695a")}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
