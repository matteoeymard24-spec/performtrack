/* ============================================================================
   BANQUE D'EXERCICES SPRINT / ENDURANCE + ZONES D'ENTRAÎNEMENT (5 zones)
   ----------------------------------------------------------------------------
   Zones = mindmap « Entraîner l'endurance » de Matteo : exprimées en % de la
   VITESSE CRITIQUE (VC), bornes du calculateur remirivet.com/vcritique :
     Z1 60-70 % · Z2 70-80 % · Z3 80-90 % · Z4 90-110 % · Z5 > 110 % VC
   Zones 1 & 2 = rythme lent confortable (volume sanguin, substrats) ;
   Zone 3 = rythme modéré (systèmes tampons) ;
   Zones 4 et + = rythme rapide, haute intensité (VO2max, puissance).
   Exos anciens en % VMA : convertis en % VC avec le ratio VC/VMA de
   l'athlète s'il a les deux tests, sinon ≈ 0,88 (estimation).
   ========================================================================== */

export const DEFAULT_CS_VMA_RATIO = 0.88;

export const ZONES = [
  {
    id: 1,
    name: "Zone 1 · Récupération",
    short: "Z1",
    min: 0,
    max: 70,
    color: "#5b8def",
    fc: "60-75 % FCmax",
    feel: "Rythme lent confortable",
    goal: "Accélérer le rétablissement, accumuler du volume à basse intensité",
    examples: "Récupération 30'-1h basse intensité (60-70 % VC)",
  },
  {
    id: 2,
    name: "Zone 2 · Base aérobie",
    short: "Z2",
    min: 70,
    max: 80,
    color: "#4fae7d",
    fc: "70-80 % FCmax",
    feel: "Rythme lent confortable",
    goal: "Base aérobie, volume sanguin, utilisation des substrats",
    examples: "Zone 2 2-3h · course longue 1h-2h (70-80 % VC)",
  },
  {
    id: 3,
    name: "Zone 3 · Tempo",
    short: "Z3",
    min: 80,
    max: 90,
    color: "#e0c341",
    fc: "—",
    feel: "Rythme modéré",
    goal: "Systèmes tampons, résistance longue durée (logique de negative split)",
    examples: "Course progressive 45'-1h20 (80-85 % VC) · progressive rapide 30'-1h (85-95 %)",
  },
  {
    id: 4,
    name: "Zone 4 · Haute intensité (VO2max)",
    short: "Z4",
    min: 90,
    max: 110,
    color: "#e0862e",
    fc: "—",
    feel: "Rythme rapide",
    goal: "Augmenter la VO2max, résistance au seuil",
    examples: "Rapide continu 20'-30' (95-100 % VC) · seuil 800-2000 m (100-105 % VC)",
  },
  {
    id: 5,
    name: "Zone 5 · Vitesse / puissance",
    short: "Z5",
    min: 110,
    max: 400,
    color: "#d9443a",
    fc: "—",
    feel: "Très rapide",
    goal: "Puissance, vitesse, variations d'allure",
    examples: "Vitesse 200-800 m (110-120 % VC), intermittents courts",
  },
];

/** % de la vitesse critique d'un exercice (selon sa référence). */
export const pctCS = (ex, ratio = DEFAULT_CS_VMA_RATIO) => {
  const p = Number(ex?.vmaPercentage) || 0;
  if (!p) return 0;
  return ex?.intensityRef === "cs" ? p : p / (ratio || DEFAULT_CS_VMA_RATIO);
};

export const zoneOf = (pctOfCS) => {
  const p = Number(pctOfCS) || 0;
  if (p < 50) return null; // marche / récup passive
  return ZONES.find((z) => p >= z.min && p < z.max) || (p < 60 ? ZONES[0] : ZONES[ZONES.length - 1]);
};

/* ---------- Banque ENDURANCE (champs = ceux du formulaire endurance) ----------
   vmaPercentage = % de la référence (intensityRef "cs" = vitesse critique,
   "vma" = VMA) ; effortTime en secondes ; recovery = récup entre répétitions ;
   recoveryVmaPct = intensité de la récup (même référence, 0 = passive) ;
   blockRecovery = récup après l'exercice (entre séries). */
const CS = { intensityRef: "cs" };
export const ENDURANCE_BANK = [
  { ...CS, cat: "Zones 1 & 2", name: "Récupération 30'", description: "Basse intensité, rythme lent confortable. Accélérer le rétablissement.", vmaPercentage: 65, effortTime: 1800, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zones 1 & 2", name: "Échauffement 10' Z2", description: "Mise en route en zone 2.", vmaPercentage: 75, effortTime: 600, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zones 1 & 2", name: "Course longue 1h", description: "Base aérobie / résistance. 1h à 2h à 70-80 % VC.", vmaPercentage: 75, effortTime: 3600, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zones 1 & 2", name: "Zone 2 longue 2h", description: "2 à 3h basse intensité : base aérobie.", vmaPercentage: 75, effortTime: 7200, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zones 1 & 2", name: "Retour au calme 10' Z2", description: "Retour au calme en zone 2.", vmaPercentage: 72, effortTime: 600, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zone 3", name: "Tempo 10'", description: "Rythme modéré continu (progression : 10' → 2 × 8').", vmaPercentage: 85, effortTime: 600, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zone 3", name: "Tempo 2 × 6'", description: "Rythme modéré, récup 2' en zone 2.", vmaPercentage: 85, effortTime: 360, reps: 2, recoveryMin: 2, recoverySec: 0, recoveryVmaPct: 72 },
  { ...CS, cat: "Zone 3", name: "Course progressive 3 × 12'", description: "Logique de negative split : 80-85 % VC, relances séparées par 4' en Z2.", vmaPercentage: 83, effortTime: 720, reps: 3, recoveryMin: 4, recoverySec: 0, recoveryVmaPct: 72 },
  { ...CS, cat: "Zone 3", name: "Course progressive rapide 3 × 8'", description: "85-95 % VC, negative split, 4' en Z2 entre les relances.", vmaPercentage: 90, effortTime: 480, reps: 3, recoveryMin: 4, recoverySec: 0, recoveryVmaPct: 72 },
  { ...CS, cat: "Zone 3", name: "Course longue résistance 1h15", description: "75-80 % VC, longue durée / résistance.", vmaPercentage: 78, effortTime: 4500, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zone 4 et +", name: "Rapide continu 25'", description: "95-100 % VC, résistance au seuil (20'-30').", vmaPercentage: 97, effortTime: 1500, reps: 1, recoveryMin: 0, recoverySec: 0 },
  { ...CS, cat: "Zone 4 et +", name: "Zone 4 · 4 × 3'", description: "Intégrer la zone 4 (semaine 1) : entre 10' Z2 et 10' Z2.", vmaPercentage: 100, effortTime: 180, reps: 4, recoveryMin: 2, recoverySec: 0, recoveryVmaPct: 65 },
  { ...CS, cat: "Zone 4 et +", name: "Zone 4 · 4 × 5'", description: "Progression zone 4 (semaine 4).", vmaPercentage: 100, effortTime: 300, reps: 4, recoveryMin: 2, recoverySec: 30, recoveryVmaPct: 65 },
  { ...CS, cat: "Zone 4 et +", name: "Seuil 5 × 1200 m (≈ 5')", description: "Fractions de 800 à 2000 m à 100-105 % VC (30'-40' au total). Variation de vitesse.", vmaPercentage: 102, effortTime: 300, reps: 5, recoveryMin: 2, recoverySec: 0, recoveryVmaPct: 65 },
  { ...CS, cat: "Zone 4 et +", name: "Vitesse 10 × 400 m", description: "Fractions de 200 à 800 m à 110-120 % VC (10'-20' au total).", vmaPercentage: 115, effortTime: 80, reps: 10, recoveryMin: 1, recoverySec: 0, recoveryVmaPct: 60 },
  { ...CS, cat: "Zone 4 et +", name: "Côtes 8 × 45\"", description: "Entraînement en côtes, retour en trottinant.", vmaPercentage: 110, effortTime: 45, reps: 8, recoveryMin: 1, recoverySec: 30, recoveryVmaPct: 55 },
  { intensityRef: "vma", cat: "Intermittents (% VMA)", name: "30-30 (2 × 8)", description: "30\" à 100-105 % VMA / 30\" récup. 3' entre les séries.", vmaPercentage: 102, effortTime: 30, reps: 8, recoveryMin: 0, recoverySec: 30, blockRecoveryMin: 3, blockRecoverySec: 0 },
  { intensityRef: "vma", cat: "Intermittents (% VMA)", name: "45-15 (2 × 8)", description: "45\" à 95-100 % VMA / 15\" récup. 3' entre les séries.", vmaPercentage: 97, effortTime: 45, reps: 8, recoveryMin: 0, recoverySec: 15, blockRecoveryMin: 3, blockRecoverySec: 0 },
  { intensityRef: "vma", cat: "Intermittents (% VMA)", name: "15-15 (2 × 10)", description: "15\" à 110-120 % VMA / 15\" récup passive.", vmaPercentage: 115, effortTime: 15, reps: 10, recoveryMin: 0, recoverySec: 15, blockRecoveryMin: 3, blockRecoverySec: 0 },
  { intensityRef: "vma", cat: "Intermittents (% VMA)", name: "10-20 (2 × 12)", description: "10\" très vite (≈ 120 % VMA) / 20\" récup.", vmaPercentage: 120, effortTime: 10, reps: 12, recoveryMin: 0, recoverySec: 20, blockRecoveryMin: 3, blockRecoverySec: 0 },
];

/* ---------- Banque SPRINT (champs = ceux du formulaire sprint) ---------- */
export const SPRINT_BANK = [
  { name: "Accélération 10 m (départ 3 appuis)", description: "Mise en action, pousser fort, buste incliné.", distance: 10, reps: 5, sets: 2, recoveryMin: 1, recoverySec: 0, intensity: "Max" },
  { name: "Accélération 20 m", description: "Départ arrêté, montée progressive du buste.", distance: 20, reps: 4, sets: 2, recoveryMin: 2, recoverySec: 0, intensity: "Max" },
  { name: "Sprint 30 m", description: "Départ arrêté, vitesse maximale.", distance: 30, reps: 4, sets: 2, recoveryMin: 2, recoverySec: 30, intensity: "Max" },
  { name: "Sprint lancé 20 m (élan 20 m)", description: "Vitesse maximale sur la zone chronométrée après 20 m d'élan.", distance: 20, reps: 4, sets: 1, recoveryMin: 3, recoverySec: 0, intensity: "Max" },
  { name: "Départ couché / réaction 10 m", description: "Départ au signal depuis le sol (ventre ou dos).", distance: 10, reps: 6, sets: 1, recoveryMin: 1, recoverySec: 0, intensity: "Max" },
  { name: "Sprint résisté (traîneau / élastique) 15 m", description: "Charge légère : la vitesse ne doit pas chuter de plus de ~10 %.", distance: 15, reps: 5, sets: 1, recoveryMin: 2, recoverySec: 0, intensity: "Max" },
  { name: "Sprint en côte 20 m", description: "Pente modérée, poussée et fréquence.", distance: 20, reps: 6, sets: 1, recoveryMin: 2, recoverySec: 0, intensity: "Max" },
  { name: "Changement de direction 5-0-5", description: "Sprint, demi-tour à la ligne, retour 5 m.", distance: 10, reps: 4, sets: 1, recoveryMin: 1, recoverySec: 30, intensity: "Max" },
  { name: "Navette 10-20-10 (pro agility)", description: "Déplacement latéral avec appuis au sol.", distance: 40, reps: 4, sets: 1, recoveryMin: 2, recoverySec: 0, intensity: "Max" },
  { name: "RSA 6 × 30 m r20\"", description: "Répétition de sprints, récup courte (capacité à répéter).", distance: 30, reps: 6, sets: 2, recoveryMin: 0, recoverySec: 20, intensity: "Max" },
  { name: "Gammes : montées de genoux / talons-fesses 20 m", description: "Éducatifs de course avant les sprints.", distance: 20, reps: 4, sets: 1, recoveryMin: 0, recoverySec: 30, intensity: "Sous-max" },
  { name: "Lignes droites progressives 60 m", description: "Accélération progressive jusqu'à ~90 % de la vitesse max.", distance: 60, reps: 4, sets: 1, recoveryMin: 1, recoverySec: 30, intensity: "Sous-max" },
];

/* Schéma par défaut d'un exo de sprint : plots de départ / arrivée sur la piste. */
export function defaultSprintDiagram(distance) {
  const d = Math.max(5, Math.min(90, Number(distance) || 20));
  const x0 = 10;
  return {
    field: "piste",
    items: [
      { t: "cone", x: x0, y: 3 },
      { t: "cone", x: x0, y: 9.2 },
      { t: "cone", x: x0 + d, y: 3 },
      { t: "cone", x: x0 + d, y: 9.2 },
      { t: "pa", x: x0 - 2, y: 6.1, n: 1 },
      { t: "run", x1: x0, y1: 6.1, x2: x0 + d, y2: 6.1 },
      { t: "text", x: x0 + d / 2, y: 4.6, s: `${d} m` },
    ],
  };
}

/* ---------- Profil d'effort d'une séance d'endurance ----------
   Renvoie une liste de segments { start, dur, pct, kind, label } (secondes, %VMA). */
const blockTimerSec = (b) =>
  b.timerMode === "amrap" ? b.timerIntervalSec || 60 : (b.timerIntervalSec || 60) * (b.timerRounds || 10);

export function enduranceSegments(blocks, ratio = DEFAULT_CS_VMA_RATIO) {
  const segs = [];
  let t = 0;
  const push = (dur, pct, kind, label) => {
    const d = Math.max(0, Math.round(Number(dur) || 0));
    if (!d) return;
    segs.push({ start: t, dur: d, pct: Number(pct) || 0, kind, label });
    t += d;
  };
  (blocks || []).forEach((b, bi) => {
    const exs = b.exercises || [];
    if (b.timerMode === "emom" || b.timerMode === "amrap") {
      const pcts = exs.map((e) => pctCS(e, ratio)).filter((x) => x > 0);
      const avg = pcts.length ? pcts.reduce((a, c) => a + c, 0) / pcts.length : 0;
      push(blockTimerSec(b), avg, "effort", `${b.name || "Bloc " + (bi + 1)} (${b.timerMode.toUpperCase()})`);
    } else {
      exs.forEach((ex) => {
        const reps = Math.max(1, Number(ex.reps) || 1);
        const eff = Number(ex.effortTime) || 0;
        const rec = (Number(ex.recoveryMin) || 0) * 60 + (Number(ex.recoverySec) || 0);
        for (let r = 0; r < reps; r++) {
          push(eff, pctCS(ex, ratio), "effort", ex.name || "Effort");
          if (r < reps - 1) push(rec, pctCS({ ...ex, vmaPercentage: ex.recoveryVmaPct || 0 }, ratio), "recup", "Récup");
        }
        push((Number(ex.blockRecoveryMin) || 0) * 60 + (Number(ex.blockRecoverySec) || 0), 0, "recup", "Récup série");
      });
    }
    if (bi < (blocks || []).length - 1) push((Number(b.restMin ?? 0) || 0) * 60 + (Number(b.restSec) || 0), 0, "recup", "Repos bloc");
  });
  return { segs, total: t };
}

export function timeInZones(segs) {
  const out = ZONES.map((z) => ({ ...z, sec: 0 }));
  let rest = 0;
  segs.forEach((s) => {
    const z = zoneOf(s.pct);
    if (!z) rest += s.dur;
    else out[z.id - 1].sec += s.dur;
  });
  return { zones: out, rest };
}
