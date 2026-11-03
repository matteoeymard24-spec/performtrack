/* =====================================================================
   sleepCalc.js — calculs du module Sommeil.
   • Cycles de ~90 min (moyenne ; 80 à 110 min selon les personnes et la nuit) + temps d'endormissement.
   • Besoin : 7-9 h pour un adulte (NSF / AASM) ; sportifs : viser le haut de la fourchette, souvent 8-10 h
     de temps au lit en période de charge.
   • Repères d'hygiène : caféine (demi-vie ~5 h ; 400 mg pris 6 h avant le coucher réduisent encore le
     sommeil — Drake 2013), douche chaude 1-2 h avant (Haghayegh 2019), pas d'effort intense dans l'heure
     qui précède (Stutz 2019), chambre fraîche, lumière du jour le matin.
   ===================================================================== */

export const CYCLE = 90;
export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? ((Number(m[1]) % 24) * 60 + Number(m[2])) % 1440 : null;
};
export const fmtClock = (min) => {
  const x = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
export const fmtDur = (min) => {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60);
  return `${min < 0 ? "−" : ""}${h} h ${String(m % 60).padStart(2, "0")}`;
};

/* Heures de coucher pour se réveiller à `wake` en fin de cycle */
export function bedtimesFor(wake, latency = 15, cycles = [6, 5, 4, 7]) {
  const w = toMin(wake);
  if (w == null) return [];
  return cycles.map((n) => ({ cycles: n, sleepMin: n * CYCLE, bed: fmtClock(w - n * CYCLE - latency), lightsOut: fmtClock(w - n * CYCLE - latency) }));
}
/* Coucher conseillé : le plus petit nombre de cycles qui couvre le besoin (à 30 min près) */
export const bestCyclesFor = (needH = 8.5) => [4, 5, 6, 7].find((n) => n * CYCLE >= needH * 60 - 30) || 7;
export const advisedBedtime = (wake, needH = 8.5, latency = 15) => bedtimesFor(wake, latency, [bestCyclesFor(needH)])[0] || null;

/* Heures de réveil si je me couche à `bed` */
export function wakeTimesFor(bed, latency = 15, cycles = [4, 5, 6, 7]) {
  const b = toMin(bed);
  if (b == null) return [];
  return cycles.map((n) => ({ cycles: n, sleepMin: n * CYCLE, wake: fmtClock(b + latency + n * CYCLE) }));
}

/* Nuit saisie → durées. e = { bed, wake, latency, awake } */
export function nightStats(e) {
  const b = toMin(e?.bed);
  const w = toMin(e?.wake);
  if (b == null || w == null) return null;
  const inBed = (w - b + 1440) % 1440 || 1440;
  const sleep = Math.max(0, inBed - (Number(e.latency) || 0) - (Number(e.awake) || 0));
  return { inBed, sleep, eff: inBed ? Math.round((sleep / inBed) * 100) : 0, bedMin: b, wakeMin: w };
}

/* Heures « autour de minuit » : 22:30 → −90, 01:00 → +60 (pour faire des moyennes sans casser à minuit) */
export const aroundMidnight = (min) => (min >= 720 ? min - 1440 : min);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null;
};
const weekday = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = dimanche
};

/* Statistiques sur des nuits [{ date, bed, wake, latency, awake, quality }] (date = jour du réveil) */
export function sleepSummary(nights, needH = 8.5) {
  const list = (nights || []).map((n) => ({ ...n, s: nightStats(n) })).filter((n) => n.s);
  if (!list.length) return null;
  const durs = list.map((n) => n.s.sleep);
  const beds = list.map((n) => aroundMidnight(n.s.bedMin));
  const wakes = list.map((n) => n.s.wakeMin);
  // jetlag social : milieu de nuit des week-ends (réveil sam./dim.) vs semaine
  const mid = (n) => aroundMidnight(n.s.bedMin) + n.s.inBed / 2;
  const we = list.filter((n) => [0, 6].includes(weekday(n.date))).map(mid);
  const wd = list.filter((n) => ![0, 6].includes(weekday(n.date))).map(mid);
  const need = needH * 60;
  const last7 = list.slice(-7);
  const debt = last7.reduce((s, n) => s + Math.max(0, need - n.s.sleep), 0);
  const q = list.map((n) => Number(n.quality)).filter((x) => x > 0);
  return {
    n: list.length,
    avgSleep: mean(durs),
    avgBed: mean(beds),
    avgWake: mean(wakes),
    sdBed: sd(beds),
    sdWake: sd(wakes),
    socialJetlag: we.length && wd.length ? mean(we) - mean(wd) : null,
    debt7: debt,
    avgEff: mean(list.map((n) => n.s.eff)),
    avgQuality: q.length ? mean(q) : null,
    nightsOk: list.filter((n) => n.s.sleep >= need - 30).length,
  };
}

/* Régularité : écart-type des heures de coucher / lever (min) → libellé */
export const regularityLabel = (sdMin) =>
  sdMin == null ? { t: "—", c: "#a8a199" } : sdMin <= 30 ? { t: "Très régulier", c: "#4fae7d" } : sdMin <= 60 ? { t: "Assez régulier", c: "#e0a13d" } : { t: "Irrégulier", c: "#d9695a" };

/* Routine du soir d'après l'heure de coucher visée */
export function eveningRoutine(bed, wake) {
  const b = toMin(bed);
  const w = toMin(wake);
  if (b == null) return [];
  return [
    { t: fmtClock(b - 8 * 60), icon: "☕", label: "Dernière caféine", tip: "Café, thé, boissons énergisantes, pré-workout : la caféine agit encore 6 h après." },
    { t: fmtClock(b - 3 * 60), icon: "🍽️", label: "Dernier gros repas", tip: "Un repas copieux juste avant de dormir dérange le sommeil ; une collation légère reste possible." },
    { t: fmtClock(b - 2 * 60), icon: "🏋️", label: "Fin des efforts intenses", tip: "Une séance intense dans l'heure qui précède retarde l'endormissement ; en soirée, garder 1-2 h de marge." },
    { t: fmtClock(b - 90), icon: "🚿", label: "Douche ou bain chaud", tip: "1 à 2 h avant le coucher : la baisse de température qui suit aide à s'endormir." },
    { t: fmtClock(b - 60), icon: "📵", label: "Écrans en pause, lumière tamisée", tip: "La lumière vive et les contenus stimulants retardent l'endormissement." },
    { t: fmtClock(b - 15), icon: "🛏️", label: "Au lit, chambre fraîche et noire", tip: "16-19 °C, obscurité, calme. Respiration lente ou lecture si besoin." },
    { t: fmtClock(b), icon: "😴", label: "Extinction des feux", tip: "Garde la même heure à ±30 min, week-end compris." },
    ...(w != null ? [{ t: fmtClock(w + 30), icon: "☀️", label: "Lumière du jour", tip: "10-30 min de lumière extérieure dans l'heure qui suit le réveil cale l'horloge interne." }] : []),
  ];
}

export const SLEEP_TAGS = [
  { id: "caf", label: "Caféine tardive", icon: "☕" },
  { id: "ecran", label: "Écrans tard", icon: "📱" },
  { id: "alcool", label: "Alcool", icon: "🍷" },
  { id: "seance", label: "Séance tardive", icon: "🏋️" },
  { id: "match", label: "Match / compétition", icon: "🏉" },
  { id: "stress", label: "Stress", icon: "😟" },
  { id: "repas", label: "Repas lourd", icon: "🍔" },
  { id: "douleur", label: "Douleurs", icon: "🩹" },
];
