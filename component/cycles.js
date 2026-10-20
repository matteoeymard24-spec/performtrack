/* =====================================================================
   cycles.js — planification : macro / méso / microcycles.
   Collection Firestore "cycles" :
   { name, level: "macro"|"meso"|"micro", phase, startDate, endDate
     (YYYY-MM-DD), scope: "total" | <id de groupe>, objective, notes,
     parentId?, createdBy, createdAt }
   Les séances ne sont PAS modifiées : elles sont rattachées à un cycle
   automatiquement par leur date (et leur groupe).
   ===================================================================== */

export const CYCLE_LEVELS = [
  { id: "macro", label: "Macrocycle", short: "Macro", rank: 0 },
  { id: "meso", label: "Mésocycle", short: "Méso", rank: 1 },
  { id: "micro", label: "Microcycle (semaine)", short: "Micro", rank: 2 },
];

/* Modèles de planification : on choisit le modèle d'un cycle, la liste des phases s'adapte.
   - classique   : périodes (préparation générale / spécifique / compétition…)
   - bloc        : périodisation par blocs (accumulation → transmutation → réalisation)
   - ondulation  : ondulatoire (développement / maintien / affûtage / décharge) */
export const MODELS = [
  { id: "classique", label: "Classique (périodes)" },
  { id: "bloc", label: "Par blocs : accumulation · transmutation · réalisation" },
  { id: "ondulation", label: "Ondulatoire : développement · maintien · affûtage · décharge" },
];
export const modelOf = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

export const PHASES = [
  // classique
  { id: "prepa_gen", label: "Préparation générale", color: "#5b8def", models: ["classique"] },
  { id: "prepa_spe", label: "Préparation spécifique", color: "#8e6bd8", models: ["classique"] },
  { id: "pre_comp", label: "Pré-compétition", color: "#e0a13d", models: ["classique"] },
  { id: "competition", label: "Compétition", color: "#d9534f", models: ["classique"] },
  { id: "intersaison", label: "Intersaison", color: "#3aa6b9", models: ["classique"] },
  { id: "transition", label: "Transition / récupération", color: "#4fae7d", models: ["classique"] },
  { id: "charge", label: "Semaine de charge", color: "#c46a3a", models: ["classique"] },
  // blocs
  { id: "accumulation", label: "Accumulation", color: "#3f7be0", models: ["bloc"] },
  { id: "transmutation", label: "Transmutation", color: "#e08a3d", models: ["bloc"] },
  { id: "realisation", label: "Réalisation", color: "#d9534f", models: ["bloc"] },
  // ondulation
  { id: "developpement", label: "Développement", color: "#8e6bd8", models: ["ondulation"] },
  { id: "maintien", label: "Maintien", color: "#3aa6b9", models: ["ondulation"] },
  { id: "affutage", label: "Affûtage", color: "#e0c13d", models: ["ondulation"] },
  { id: "decharge", label: "Décharge", color: "#7fb77e", models: ["classique", "ondulation"] },
  { id: "autre", label: "Autre", color: "#8a8378", models: ["classique", "bloc", "ondulation"] },
];
export const phasesOfModel = (m) => PHASES.filter((p) => p.models.includes(m || "classique"));

export const phaseOf = (id) => PHASES.find((p) => p.id === id) || PHASES[PHASES.length - 1];
export const levelOf = (id) => CYCLE_LEVELS.find((l) => l.id === id) || CYCLE_LEVELS[0];
export const cycleColor = (c) => phaseOf(c.phase).color;

/* ---------- dates (toujours locales, format YYYY-MM-DD) ---------- */
export const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
};
export const dayStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
export const addDays = (s, n) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayStr(d);
};
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const mondayOf = (s) => {
  const d = parseDay(s);
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - dow);
  return dayStr(d);
};
export const fmtShort = (s) =>
  parseDay(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const fmtLong = (s) =>
  parseDay(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/* ---------- portée ----------
   scope = "total" (tout le monde) | <id de groupe> | "user:<uid>" (un athlète).
   Priorité : cycle individuel > cycle de groupe > cycle "total", niveau par niveau. */
export const userScope = (uid) => `user:${uid}`;
export const isIndividual = (c) => String(c.scope || "").startsWith("user:");
export const scopeUid = (scope) => String(scope || "").slice(5);
export const scopeRank = (c) => (isIndividual(c) ? 2 : !c.scope || c.scope === "total" ? 0 : 1);
export const cycleInScope = (c, scopes) => !scopes || scopes.includes(c.scope || "total");

/* Les séances comptées dans un cycle (par date + groupe / athlète).
   groupsOfUser(uid) -> ids des groupes de l'athlète (pour un cycle individuel). */
export function sessionsOfCycle(c, events, groupsOfUser) {
  return (events || []).filter((e) => {
    if (e.date < c.startDate || e.date > c.endDate) return false;
    if (!c.scope || c.scope === "total") return true;
    if (isIndividual(c)) {
      const uid = scopeUid(c.scope);
      const gs = groupsOfUser ? groupsOfUser(uid) : [];
      return e.targetUserId === uid || e.group === "total" || gs.includes(e.group) || (e.group === "moi" && e.createdBy === uid);
    }
    return e.group === c.scope || e.group === "total";
  });
}

export const sessionMinutes = (e) => Number(e.estimatedDuration) || 0;

/* Cycles actifs un jour donné, du plus large (macro) au plus fin (micro) */
export function cyclesOnDay(cycles, day) {
  const active = (cycles || []).filter((c) => c.startDate <= day && day <= c.endDate);
  // Priorité : pour chaque niveau, seul(s) le(s) cycle(s) le plus spécifique(s) reste(nt)
  const best = {};
  active.forEach((c) => {
    best[c.level] = Math.max(best[c.level] ?? -1, scopeRank(c));
  });
  return active
    .filter((c) => scopeRank(c) === best[c.level])
    .sort((a, b) => levelOf(a.level).rank - levelOf(b.level).rank);
}

/* "Semaine 2/4" d'un cycle pour un jour donné */
export function weekInCycle(c, day) {
  const total = Math.max(1, Math.ceil((diffDays(c.startDate, c.endDate) + 1) / 7));
  const idx = Math.min(total, Math.floor(diffDays(c.startDate, day) / 7) + 1);
  return { idx, total };
}

/* Pose les cycles d'une même catégorie sur des lignes sans chevauchement */
export function packRows(list) {
  const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const rows = [];
  const out = [];
  sorted.forEach((c) => {
    let r = rows.findIndex((end) => end < c.startDate);
    if (r === -1) {
      rows.push(c.endDate);
      r = rows.length - 1;
    } else rows[r] = c.endDate;
    out.push({ c, row: r });
  });
  return { items: out, rowCount: Math.max(1, rows.length) };
}

/* Microcycles hebdomadaires d'un cycle (pour le bouton "Générer les semaines") */
export function buildWeeks(parent, { lastIsDeload }) {
  const n = Math.max(1, Math.ceil((diffDays(parent.startDate, parent.endDate) + 1) / 7));
  const model = parent.model || "classique";
  const basePhase = model === "classique" ? "charge" : parent.phase;
  const weeks = [];
  for (let i = 0; i < n; i++) {
    const start = addDays(parent.startDate, i * 7);
    const end = addDays(start, 6) > parent.endDate ? parent.endDate : addDays(start, 6);
    const deload = lastIsDeload && n >= 3 && i === n - 1;
    weeks.push({
      name: `${parent.name} · S${i + 1}${deload ? " (décharge)" : ""}`,
      level: "micro",
      model,
      phase: deload ? "decharge" : basePhase,
      startDate: start,
      endDate: end,
      scope: parent.scope || "total",
      objective: "",
      notes: "",
      parentId: parent.id,
    });
  }
  return weeks;
}

/* ---------------------------------------------------------------------
   Matchs et jours de compétition — collection Firestore "fixtures" :
   { name, kind, date, endDate?, place?, scope, notes }
   Contrairement aux cycles, rien ne "prime" : un athlète voit les matchs
   de "Tous", de ses groupes ET les siens.
   --------------------------------------------------------------------- */
export const FIXTURE_KINDS = [
  { id: "match", label: "Match officiel", icon: "🏉", color: "#d9534f" },
  { id: "amical", label: "Match amical", icon: "🤝", color: "#e0a13d" },
  { id: "tournoi", label: "Tournoi / compétition", icon: "🏆", color: "#c9a227" },
  { id: "autre", label: "Autre échéance", icon: "📌", color: "#8a8378" },
];
export const kindOf = (id) => FIXTURE_KINDS.find((k) => k.id === id) || FIXTURE_KINDS[0];
export const fixtureEnd = (f) => (f.endDate && f.endDate >= f.date ? f.endDate : f.date);
export const fixturesOnDay = (fixtures, day) =>
  (fixtures || []).filter((f) => f.date <= day && day <= fixtureEnd(f));
export const nextFixture = (fixtures, today) =>
  (fixtures || [])
    .filter((f) => fixtureEnd(f) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
