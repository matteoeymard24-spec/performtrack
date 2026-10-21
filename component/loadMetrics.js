// Fonctions pures de calcul de charge (REDI) et de wellness (z-score).
// Aucune dépendance React/Firebase : réutilisable par ACWRMonitoring.jsx
// et Dashboard.jsx sans dupliquer les formules.
//
// ─── REDI (Robust Exponential Decreasing Index) ───────────────────────────
// Référence : Moussa et al. 2020, "Robust Exponential Decreasing Index
// (REDI): adaptive and robust method for computing cumulated workload",
// Frontiers in Physiology. Contrairement à l'ACWR classique (moyenne brute
// sur 7 / 28 jours) ou l'EWMA (lissage récursif), REDI pondère chaque jour
// par une décroissance EXPONENTIELLE e^(-λ·i) (i = nombre de jours dans le
// passé) et ignore simplement les jours sans donnée dans la somme (au lieu
// de les remplacer par 0) : c'est ce qui le rend robuste aux séances ou
// questionnaires manquants (jusqu'à ~30% de données manquantes d'après
// l'étude d'origine), un cas très fréquent en pratique (blessure, oubli,
// jour de repos non complété).

export const REDI_ACUTE_N = 7;
export const REDI_ACUTE_LAMBDA = 0.25;
export const REDI_CHRONIC_N = 28;
export const REDI_CHRONIC_LAMBDA = 0.07;

/**
 * Moyenne pondérée exponentiellement décroissante de la charge, sur une
 * fenêtre de `windowDays` jours se terminant à `targetDateStr` (inclus).
 * dailyLoads: [{ date: "YYYY-MM-DD", load: number }]
 */
export function weightedREDI(dailyLoads, targetDateStr, windowDays, lambda) {
  const target = new Date(targetDateStr + "T12:00:00");
  let num = 0;
  let den = 0;
  for (const entry of dailyLoads) {
    if (!entry || entry.load === null || entry.load === undefined) continue;
    const d = new Date(entry.date + "T12:00:00");
    const i = Math.round((target - d) / 86400000);
    if (i >= 0 && i < windowDays) {
      const w = Math.exp(-lambda * i);
      num += w * entry.load;
      den += w;
    }
  }
  return den > 0 ? num / den : null;
}

export function rediAcute(dailyLoads, targetDateStr) {
  return weightedREDI(dailyLoads, targetDateStr, REDI_ACUTE_N, REDI_ACUTE_LAMBDA);
}

export function rediChronic(dailyLoads, targetDateStr) {
  return weightedREDI(dailyLoads, targetDateStr, REDI_CHRONIC_N, REDI_CHRONIC_LAMBDA);
}

/** Ratio REDI acute / REDI chronic — l'équivalent REDI de l'ACWR. */
export function rediRatio(dailyLoads, targetDateStr) {
  const acute = rediAcute(dailyLoads, targetDateStr);
  const chronic = rediChronic(dailyLoads, targetDateStr);
  if (acute === null || chronic === null || chronic === 0) return null;
  return acute / chronic;
}

/** Historique du ratio REDI jour par jour sur `days` jours. */
export function rediRatioHistory(dailyLoads, days = 60) {
  const history = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const acute = rediAcute(dailyLoads, dateStr);
    const chronic = rediChronic(dailyLoads, dateStr);
    if (acute !== null && chronic !== null && chronic > 0) {
      history.push({
        date: dateStr,
        redi: Number((acute / chronic).toFixed(2)),
        acuteLoad: Math.round(acute),
        chronicLoad: Math.round(chronic),
      });
    }
  }
  return history;
}

/** Zones d'interprétation du ratio REDI (mêmes seuils que l'ACWR littérature). */
export function getREDIStatus(ratio) {
  if (ratio === null || ratio === undefined) return { label: "Données insuffisantes", color: "#a8a199" };
  const v = Number(ratio);
  if (v < 0.8) return { label: "Sous-chargé", color: "#3498db" };
  if (v <= 1.3) return { label: "Zone optimale", color: "#4fae7d" };
  if (v <= 1.5) return { label: "Attention", color: "#d9a441" };
  return { label: "Surcharge", color: "#d9695a" };
}

/**
 * Complétude des données sur la fenêtre chronique (28j) : proportion de
 * jours avec une charge renseignée. REDI reste calculable avec des trous,
 * mais ce chiffre permet d'afficher un niveau de confiance à l'utilisateur.
 */
export function dataCompleteness(dailyLoads, targetDateStr, windowDays = REDI_CHRONIC_N) {
  const target = new Date(targetDateStr + "T12:00:00");
  let count = 0;
  for (const entry of dailyLoads) {
    if (!entry || entry.load === null || entry.load === undefined) continue;
    const d = new Date(entry.date + "T12:00:00");
    const i = Math.round((target - d) / 86400000);
    if (i >= 0 && i < windowDays) count++;
  }
  return count / windowDays;
}

// ─── Z-scores individualisés ───────────────────────────────────────────────
// Standardise une valeur du jour par rapport à la moyenne et l'écart-type
// PROPRES à l'athlète sur une fenêtre glissante (monitoring individualisé,
// cf. Hooper & Mackinnon 1995 pour le wellness ; même logique appliquée ici
// à la charge RPE). z = (valeur - moyenne) / écart-type.

export function rollingMeanSD(values) {
  const clean = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const n = clean.length;
  if (n < 2) return { mean: null, sd: null, n };
  const mean = clean.reduce((s, v) => s + v, 0) / n;
  const variance = clean.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Z-score de `todayValue` par rapport à l'historique `historyValues`
 * (qui ne doit PAS inclure la valeur du jour, pour ne pas se comparer
 * à soi-même).
 */
export function zScore(todayValue, historyValues) {
  if (todayValue === null || todayValue === undefined) return null;
  const { mean, sd, n } = rollingMeanSD(historyValues);
  if (mean === null || sd === null || sd === 0 || n < 5) return null;
  return (todayValue - mean) / sd;
}

/** Charge (sRPE) quotidienne d'un athlète -> z-score de la charge REDI aiguë du jour. */
export function loadZScoreHistory(dailyLoads, targetDateStr, lookbackDays = REDI_CHRONIC_N) {
  const target = new Date(targetDateStr + "T12:00:00");
  const history = [];
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const acute = rediAcute(dailyLoads, dateStr);
    if (acute !== null) history.push(acute);
  }
  return history;
}

export function getZScoreStatus(z) {
  if (z === null || z === undefined) return { label: "Pas assez d'historique", color: "#a8a199" };
  if (z <= -1.5) return { label: "Très inhabituel (bas)", color: "#3498db" };
  if (z < -0.5) return { label: "Plus bas que d'habitude", color: "#4fae7d" };
  if (z <= 0.5) return { label: "Dans la norme", color: "#4fae7d" };
  if (z <= 1.5) return { label: "Plus élevé que d'habitude", color: "#d9a441" };
  return { label: "Très inhabituel (élevé)", color: "#d9695a" };
}

// ─── Wellness ───────────────────────────────────────────────────────────
// Score composite 0-10 (10 = meilleur état). Repris de la formule déjà en
// place dans Dashboard.jsx (moyenne des 7 items, fatigue/stress/douleur
// inversés).
export function calculateWellnessScore(entry) {
  if (!entry) return null;
  const s =
    (entry.sommeil +
      entry.motivation +
      entry.nutrition +
      entry.hydratation +
      (10 - entry.fatigue) +
      (10 - entry.stress) +
      (10 - entry.douleur)) /
    7;
  return Number(s.toFixed(2));
}

/** Z-score du wellness du jour par rapport à l'historique propre de l'athlète. */
export function wellnessZScoreHistory(wellnessEntries, targetDateStr, lookbackDays = REDI_CHRONIC_N) {
  const target = new Date(targetDateStr + "T12:00:00");
  const scores = [];
  wellnessEntries.forEach((e) => {
    const d = new Date(e.date + "T12:00:00");
    const diff = Math.round((target - d) / 86400000);
    if (diff >= 1 && diff <= lookbackDays) {
      const score = calculateWellnessScore(e);
      if (score !== null) scores.push(score);
    }
  });
  return scores;
}

export function getWellnessZScoreStatus(z) {
  if (z === null || z === undefined) return { label: "Pas assez d'historique", color: "#a8a199" };
  if (z <= -1.5) return { label: "Wellness très dégradé", color: "#d9695a" };
  if (z <= -0.5) return { label: "Wellness en baisse", color: "#d9a441" };
  if (z < 0.5) return { label: "Wellness stable", color: "#4fae7d" };
  return { label: "Wellness au-dessus de la norme", color: "#4fae7d" };
}

// ─── Croisement quotidien REDI × Wellness (z-score) ────────────────────────
// Affine le statut risque/forme en croisant la zone REDI (charge externe
// perçue, via RPE) avec le z-score wellness (état interne individualisé),
// recalculé chaque jour à partir des dernières données saisies.
export function crossRiskStatus(rediRatioValue, wellnessZ) {
  const rediStatus = getREDIStatus(rediRatioValue);
  const hasRedi = rediRatioValue !== null && rediRatioValue !== undefined;
  const hasWellness = wellnessZ !== null && wellnessZ !== undefined;

  if (!hasRedi && !hasWellness) {
    return { label: "Données insuffisantes", color: "#a8a199", detail: "Pas assez d'historique REDI ni wellness." };
  }

  const overload = hasRedi && rediRatioValue > 1.3;
  const highOverload = hasRedi && rediRatioValue > 1.5;
  const underload = hasRedi && rediRatioValue < 0.8;
  const wellnessBad = hasWellness && wellnessZ <= -1.5;
  const wellnessLow = hasWellness && wellnessZ <= -0.5;
  const wellnessGood = hasWellness && wellnessZ > -0.5;

  if (highOverload && wellnessBad) {
    return {
      label: "Risque élevé",
      color: "#d9695a",
      detail: "Surcharge REDI ET wellness très dégradé par rapport à la norme individuelle : croisement défavorable, vigilance immédiate.",
    };
  }
  if ((overload || highOverload) && wellnessLow) {
    return {
      label: "Risque",
      color: "#d9695a",
      detail: "Charge élevée (REDI) combinée à un wellness en dessous de la norme habituelle de l'athlète.",
    };
  }
  if (overload && wellnessGood) {
    return {
      label: "Charge élevée mais bien tolérée",
      color: "#d9a441",
      detail: "REDI en zone d'attention, mais le wellness individualisé reste dans la norme : à surveiller, pas encore alarmant.",
    };
  }
  if (wellnessBad && !overload) {
    return {
      label: "Fatigue à surveiller",
      color: "#d9a441",
      detail: "Wellness très dégradé alors que la charge REDI n'est pas excessive : cause probablement extra-sportive (sommeil, stress, vie perso).",
    };
  }
  if (underload && wellnessGood) {
    return {
      label: "Sous-charge",
      color: "#3498db",
      detail: "Charge faible et wellness bon : marge de progression disponible.",
    };
  }
  if (!hasRedi && hasWellness) {
    return wellnessBad
      ? { label: "Wellness dégradé", color: "#d9a441", detail: "Pas assez de séances pour le REDI, mais wellness à surveiller." }
      : { label: "En forme", color: "#4fae7d", detail: "Wellness dans la norme (REDI non disponible)." };
  }
  if (hasRedi && !hasWellness) {
    return { label: rediStatus.label, color: rediStatus.color, detail: "Z-score wellness non disponible (historique insuffisant)." };
  }
  return {
    label: "En forme",
    color: "#4fae7d",
    detail: "REDI en zone optimale et wellness dans la norme individuelle.",
  };
}

// ─── Monotonie & Strain (Foster, 1998) ─────────────────────────────────────
// Monotonie = moyenne de charge journalière / écart-type de charge journalière
// sur une semaine glissante. Une monotonie élevée (peu de variation jour à
// jour, même si la charge totale semble raisonnable) est associée dans la
// littérature à un risque accru de surentraînement/maladie, INDÉPENDAMMENT
// du volume absolu — deux athlètes avec la même charge hebdomadaire totale
// n'ont pas le même risque si l'un alterne dur/facile et l'autre fait la
// même charge chaque jour.
// Strain = charge hebdomadaire totale × monotonie (indicateur composite).
// Jours sans charge renseignée comptés à 0 (comme dans Foster 1998 — c'est
// l'écart-type de la VARIATION réelle du planning qui nous intéresse ici,
// contrairement au REDI où l'absence de donnée doit être ignorée).
export function monotonyStrain(dailyLoads, targetDateStr, windowDays = 7) {
  const target = new Date(targetDateStr + "T12:00:00");
  const loads = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const entry = dailyLoads.find((e) => e.date === dateStr);
    loads.push(entry && entry.load !== null && entry.load !== undefined ? entry.load : 0);
  }
  const n = loads.length;
  const weeklyLoad = loads.reduce((s, v) => s + v, 0);
  const mean = weeklyLoad / n;
  const variance = loads.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd === 0 || weeklyLoad === 0) {
    return { monotony: null, strain: null, weeklyLoad: Math.round(weeklyLoad) };
  }
  const monotony = mean / sd;
  const strain = weeklyLoad * monotony;
  return {
    monotony: Number(monotony.toFixed(2)),
    strain: Math.round(strain),
    weeklyLoad: Math.round(weeklyLoad),
  };
}

export function getMonotonyStatus(monotony) {
  if (monotony === null || monotony === undefined) return { label: "Non calculable", color: "#a8a199" };
  if (monotony < 1.5) return { label: "Variabilité saine", color: "#4fae7d" };
  if (monotony < 2) return { label: "Monotonie modérée", color: "#d9a441" };
  return { label: "Monotonie élevée", color: "#d9695a" };
}

/** Historique du strain jour par jour, pour pouvoir le z-scorer individuellement. */
export function monotonyStrainHistory(dailyLoads, days = 60) {
  const history = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const { monotony, strain, weeklyLoad } = monotonyStrain(dailyLoads, dateStr);
    history.push({ date: dateStr, monotony, strain, weeklyLoad });
  }
  return history;
}

export function getStrainStatus(strainZ) {
  if (strainZ === null || strainZ === undefined) return { label: "Pas assez d'historique", color: "#a8a199" };
  if (strainZ > 1.5) return { label: "Strain inhabituellement élevé pour cet athlète", color: "#d9695a" };
  if (strainZ > 0.5) return { label: "Strain plus élevé que d'habitude", color: "#d9a441" };
  return { label: "Strain dans la norme individuelle", color: "#4fae7d" };
}

// ─── Seuils REDI individualisés ────────────────────────────────────────────
// Les zones 0.8/1.3/1.5 sont des repères de littérature valables "en
// moyenne" sur une population, mais deux athlètes n'ont pas la même charge
// habituelle. On calcule donc, en plus de la zone classique, un z-score du
// ratio REDI du jour par rapport à l'historique PROPRE de l'athlète : un
// ratio de 1.2 peut être "inhabituel" pour un athlète très régulier et
// "normal" pour un autre qui varie beaucoup sa charge.
export function rediRatioZScoreHistory(dailyLoads, targetDateStr, lookbackDays = REDI_CHRONIC_N) {
  const target = new Date(targetDateStr + "T12:00:00");
  const history = [];
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const r = rediRatio(dailyLoads, dateStr);
    if (r !== null) history.push(r);
  }
  return history;
}

export function getIndividualREDIStatus(ratio, ratioZ) {
  const base = getREDIStatus(ratio);
  if (ratioZ === null || ratioZ === undefined) {
    return { ...base, individualized: false, detail: "Historique propre insuffisant pour individualiser (min. 5 jours)." };
  }
  if (ratioZ >= 1.5) {
    return {
      ...base,
      individualized: true,
      detail: "Ratio nettement plus élevé que la charge relative habituelle de cet athlète, même si la zone littérature ne le signale pas encore.",
    };
  }
  if (ratioZ <= -1.5) {
    return {
      ...base,
      individualized: true,
      detail: "Ratio nettement plus bas que la charge relative habituelle de cet athlète.",
    };
  }
  return { ...base, individualized: true, detail: "Cohérent avec l'historique propre de l'athlète." };
}

// ─── Fiabilité de la RPE déclarée ──────────────────────────────────────────
// Une RPE quasi identique séance après séance, malgré des charges/exercices
// différents, est un signal classique de déclaration peu engagée (rote
// reporting) plutôt qu'une vraie absence de variation de difficulté. On ne
// peut pas savoir avec certitude, donc on se contente d'un signal "à
// vérifier", jamais d'une accusation.
export function rpeVariability(rpeValues) {
  const clean = rpeValues.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (clean.length < 5) return { sd: null, n: clean.length, flag: false };
  const { sd } = rollingMeanSD(clean);
  const flag = sd !== null && sd < 0.4;
  return { sd: sd !== null ? Number(sd.toFixed(2)) : null, n: clean.length, flag };
}

export function getRPEReliabilityStatus(variability) {
  if (!variability || variability.sd === null) {
    return { label: "Pas assez de séances", color: "#a8a199" };
  }
  if (variability.flag) {
    return {
      label: "RPE peu variable — à vérifier",
      color: "#d9a441",
      detail: `Écart-type de la RPE déclarée = ${variability.sd} sur les ${variability.n} dernières séances : déclaration possiblement peu engagée ou répétitive, à vérifier avec l'athlète.`,
    };
  }
  return {
    label: "RPE cohérente",
    color: "#4fae7d",
    detail: `Écart-type de la RPE déclarée = ${variability.sd} sur les ${variability.n} dernières séances.`,
  };
}

// ─── CMJ (Countermovement Jump) — fatigue neuromusculaire ──────────────────
// Référence : Claudino et al. 2017, "The countermovement jump to monitor
// neuromuscular status: A meta-analysis", J Sci Med Sport. La hauteur de
// saut chute de façon mesurable en cas de fatigue neuromusculaire
// accumulée. On compare le test du jour à la baseline glissante propre de
// l'athlète (et pas à une norme de population). Seuil pragmatique retenu :
// chute ≥10% = signal net (proche du "smallest worthwhile change" typique
// rapporté dans la littérature CMJ, qui se situe autour de 5-10% selon les
// protocoles), chute 5-10% = signal à surveiller.
export function cmjBaseline(cmjEntries, targetDateStr, lookbackDays = REDI_CHRONIC_N) {
  const target = new Date(targetDateStr + "T12:00:00");
  const values = [];
  (cmjEntries || []).forEach((e) => {
    if (!e || e.heightCm === null || e.heightCm === undefined) return;
    const d = new Date(e.date + "T12:00:00");
    const diff = Math.round((target - d) / 86400000);
    if (diff >= 1 && diff <= lookbackDays) values.push(e.heightCm);
  });
  return rollingMeanSD(values);
}

export function cmjStatus(todayHeight, cmjEntries, targetDateStr) {
  if (todayHeight === null || todayHeight === undefined) {
    return { label: "Pas de test CMJ aujourd'hui", color: "#a8a199", pctChange: null };
  }
  const { mean, n } = cmjBaseline(cmjEntries, targetDateStr);
  if (mean === null || n < 3) {
    return { label: "Baseline CMJ insuffisante (min. 3 tests)", color: "#a8a199", pctChange: null };
  }
  const pctChange = ((todayHeight - mean) / mean) * 100;
  if (pctChange <= -10) {
    return {
      label: "Chute CMJ significative",
      color: "#d9695a",
      pctChange: Number(pctChange.toFixed(1)),
      detail: `Saut ${Math.abs(pctChange).toFixed(1)}% en dessous de la baseline propre (${mean.toFixed(1)} cm) : fatigue neuromusculaire probable.`,
    };
  }
  if (pctChange <= -5) {
    return {
      label: "Baisse CMJ modérée",
      color: "#d9a441",
      pctChange: Number(pctChange.toFixed(1)),
      detail: `Saut ${Math.abs(pctChange).toFixed(1)}% en dessous de la baseline propre.`,
    };
  }
  return {
    label: "CMJ stable",
    color: "#4fae7d",
    pctChange: Number(pctChange.toFixed(1)),
    detail: `Dans la norme de la baseline propre (${mean.toFixed(1)} cm).`,
  };
}

// ─── Croisement final : REDI × Wellness × CMJ × fiabilité RPE ─────────────
// Étend crossRiskStatus avec les signaux CMJ et fiabilité RPE quand ils sont
// disponibles. Robuste aux données manquantes : chaque signal absent
// (pas de test CMJ ce jour-là, pas assez de séances pour juger la RPE...)
// est simplement ignoré, on croise uniquement ce qui est disponible, comme
// demandé — jamais de blocage ni de valeur par défaut pénalisante.
export function crossRiskStatusFull({ rediRatioValue, wellnessZ, cmjPctChange, rpeReliability }) {
  const base = crossRiskStatus(rediRatioValue, wellnessZ);
  const hasCmj = cmjPctChange !== null && cmjPctChange !== undefined;
  const cmjAlert = hasCmj && cmjPctChange <= -10;
  const cmjWarn = hasCmj && cmjPctChange <= -5 && cmjPctChange > -10;
  const rpeFlag = !!(rpeReliability && rpeReliability.flag);

  const flags = [];
  if (cmjAlert) flags.push("cmj_alert");
  else if (cmjWarn) flags.push("cmj_warn");
  if (rpeFlag) flags.push("rpe_unreliable");

  if (flags.length === 0) return { ...base, flags };

  let { label, color, detail } = base;
  const alreadyBad = base.color === "#d9695a";
  const alreadyWarn = base.color === "#d9a441";

  if (cmjAlert && (alreadyBad || alreadyWarn)) {
    label = "Risque élevé (charge externe + interne + neuromusculaire)";
    color = "#d9695a";
    detail = `${base.detail} De plus, chute CMJ de ${cmjPctChange}% par rapport à la baseline : signal neuromusculaire convergent.`;
  } else if (cmjAlert) {
    label = "Fatigue neuromusculaire isolée";
    color = "#d9a441";
    detail = `CMJ en chute de ${cmjPctChange}% alors que REDI et wellness ne l'indiquaient pas encore : signal précoce à surveiller.`;
  } else if (cmjWarn) {
    detail = `${detail} CMJ légèrement en baisse (${cmjPctChange}%).`;
  }

  if (rpeFlag) {
    detail = `${detail} ⚠️ RPE peu variable sur les dernières séances : les indicateurs de charge perçue sont peut-être moins fiables en ce moment.`;
  }

  return { label, color, detail, flags };
}

// ─── Utilitaire date (repris tel quel des pages existantes) ───────────────
export function getLocalDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ─── Fatigue nerveuse : performance en musculation (e1RM) ─────────────────
// Principe : à partir de chaque série (charge, reps, RPE déclaré), on estime
// le 1RM du jour ("e1RM") avec la table RPE ↔ %1RM (Tuchscherer / Zourdos
// et al. 2016, Helms et al. 2017) : RPE 10 = 0 rep en réserve, RPE 9 = 1 rep
// en réserve, etc. Reps réalisées + reps en réserve = reps théoriques à
// l'échec, d'où le % du 1RM. Deux signaux de fatigue nerveuse :
//   1. Chute de l'e1RM > 15 % par rapport à la séance précédente (même exo).
//   2. e1RM < 80 % du RM enregistré de l'athlète : il ne tient pas la charge
//      que son RM annoncé laissait prévoir. Ex. : 5 reps à 60 % du RM avec
//      un RPE 10 → e1RM ≈ 69 % du RM, alors que le RPE devrait être ~5-6.
// Limites assumées : le RPE est subjectif (erreur d'estimation moyenne
// ≈ 1 rep d'après Halperin et al., meilleure sur séries ≤ 12 reps et près
// de l'échec) → seules les séries ≤ 12 reps théoriques et RPE ≥ 6 sont
// utilisées ; le seuil de 15 % est un choix prudent, pas une valeur validée
// telle quelle par une étude (voir commentaire sur la classification).
export const NEURAL_DROP_THRESHOLD = 0.15;
export const NEURAL_RM_FLOOR = 0.8;
export const NEURAL_WINDOW_DAYS = 4;
export const NEURAL_PREV_LOOKBACK_DAYS = 28;

// % du 1RM pour n répétitions maximales (RPE 10), table RPE standard.
const PCT_AT_FAILURE = { 1: 100, 2: 95.5, 3: 92.2, 4: 89.2, 5: 86.3, 6: 83.7, 7: 81.1, 8: 78.6, 9: 76.2, 10: 73.9, 11: 70.7, 12: 68.0 };

export function pct1RMFromRepsRpe(reps, rpe) {
  const r = Number(reps);
  const p = Number(rpe);
  if (!r || !p || r < 1 || p < 6 || p > 10) return null;
  const n = r + (10 - p); // reps théoriques à l'échec = reps + reps en réserve
  if (n < 1 || n > 12) return null;
  const lo = Math.floor(n);
  const hi = Math.ceil(n);
  const a = PCT_AT_FAILURE[lo];
  const b = PCT_AT_FAILURE[hi];
  return (a + (b - a) * (n - lo)) / 100;
}

export function e1rmFromSet(weight, reps, rpe) {
  const w = Number(weight);
  const pct = pct1RMFromRepsRpe(reps, rpe);
  if (!w || w <= 0 || !pct) return null;
  return w / pct;
}

function medianOf(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function dayDiff(aStr, bStr) {
  return Math.round((new Date(aStr + "T12:00:00") - new Date(bStr + "T12:00:00")) / 86400000);
}

/**
 * sessions : [{ date, exercises: [{ key, name, sets: [{ weight, reps, rpe }] }] }]
 * rmByKey  : { cléExercice: kg } (RM enregistrés de l'athlète)
 * Retourne { level: "none" | "ok" | "watch" | "alert", date, flagged, exercises, evaluated }.
 */
export function neuralFatigueAnalysis(sessions, rmByKey, targetDateStr) {
  const empty = { level: "none", date: null, flagged: [], exercises: [], evaluated: 0 };
  if (!sessions || sessions.length === 0) return empty;

  // e1RM par exercice et par séance (médiane des séries valides)
  const perSession = sessions
    .map((s) => {
      const ex = {};
      (s.exercises || []).forEach((e) => {
        const vals = (e.sets || []).map((st) => e1rmFromSet(st.weight, st.reps, st.rpe)).filter((v) => v !== null);
        const m = medianOf(vals);
        if (m !== null) ex[e.key] = { name: e.name, e1rm: m };
      });
      return { date: s.date, ex };
    })
    .filter((s) => Object.keys(s.ex).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const current = [...perSession]
    .reverse()
    .find((s) => s.date <= targetDateStr && dayDiff(targetDateStr, s.date) <= NEURAL_WINDOW_DAYS);
  if (!current) return empty;

  const exercises = Object.entries(current.ex).map(([key, cur]) => {
    const prev = [...perSession]
      .reverse()
      .find((s) => s.date < current.date && dayDiff(current.date, s.date) <= NEURAL_PREV_LOOKBACK_DAYS && s.ex[key]);
    const dropPct = prev ? (prev.ex[key].e1rm - cur.e1rm) / prev.ex[key].e1rm : null;
    const rm = rmByKey ? Number(rmByKey[key]) : null;
    const rmRatio = rm > 0 ? cur.e1rm / rm : null;
    const reasons = [];
    if (dropPct !== null && dropPct > NEURAL_DROP_THRESHOLD) reasons.push("drop");
    if (rmRatio !== null && rmRatio < NEURAL_RM_FLOOR) reasons.push("rm");
    return {
      key,
      name: cur.name,
      e1rm: Math.round(cur.e1rm * 10) / 10,
      prevDate: prev ? prev.date : null,
      dropPct: dropPct !== null ? Math.round(dropPct * 1000) / 10 : null,
      rmRatio: rmRatio !== null ? Math.round(rmRatio * 1000) / 10 : null,
      reasons,
    };
  });

  const flagged = exercises.filter((e) => e.reasons.length > 0);
  let level = "ok";
  // Alerte si au moins la moitié des exercices évalués posent problème (ou un
  // exercice cumule les deux signaux) ; sinon simple vigilance (une série
  // isolée peut venir d'un mauvais exercice, pas d'une fatigue globale).
  if (flagged.length > 0 && (flagged.length / exercises.length >= 0.5 || flagged.some((e) => e.reasons.length === 2))) level = "alert";
  else if (flagged.length > 0) level = "watch";
  return { level, date: current.date, flagged, exercises, evaluated: exercises.length };
}

// ─── Classification globale de forme ──────────────────────────────────────
// Croise 3 domaines, chacun noté 0 (RAS), 1 (signal) ou 2 (signal fort) :
//   • Charge  : ratio REDI (> 1,3 → 1 ; > 1,5 → 2)
//   • Bien-être : z-score wellness individuel (≤ −0,5 → 1 ; ≤ −1,5 → 2) ;
//     à défaut de z-score, score absolu (< 6,5 → 1 ; < 5 → 2)
//   • Fatigue nerveuse : performance de force (voir ci-dessus) et CMJ
//     (−5 % → 1 ; −10 % → 2, Claudino et al. 2017 : le CMJ est un marqueur
//     sensible de l'état neuromusculaire)
// Un seul domaine en alerte reste une "surveillance" (le plus souvent
// extra-sportif ou ponctuel), sauf la fatigue nerveuse qui classe d'emblée
// en "Fatigué" ; plusieurs domaines qui convergent montent d'un cran,
// comme dans la littérature sur le suivi multi-indicateurs (Saw et al.
// 2016 : les mesures subjectives réagissent plus que les objectives, d'où
// l'intérêt de croiser les deux).
export const FORM_LEVELS = {
  risk: { label: "Risque élevé", color: "#d9695a", emoji: "⚠️", rank: 0 },
  fatigue: { label: "Fatigué", color: "#e08a3d", emoji: "😓", rank: 1 },
  watch: { label: "À surveiller", color: "#d9a441", emoji: "😌", rank: 2 },
  fit: { label: "En forme", color: "#4fae7d", emoji: "💪", rank: 3 },
  nodata: { label: "Données insuffisantes", color: "#a8a199", emoji: "❔", rank: 4 },
};

export function classifyForm({ rediRatioValue, wellnessZ, wellnessScore, cmjPctChange, neural }) {
  const hasRedi = rediRatioValue !== null && rediRatioValue !== undefined;
  const hasZ = wellnessZ !== null && wellnessZ !== undefined;
  const hasScore = wellnessScore !== null && wellnessScore !== undefined;
  const hasCmj = cmjPctChange !== null && cmjPctChange !== undefined;
  const hasNeural = neural && neural.level && neural.level !== "none";

  if (!hasRedi && !hasZ && !hasScore && !hasCmj && !hasNeural) {
    return { level: "nodata", ...FORM_LEVELS.nodata, detail: "Pas assez de données (REDI, wellness, séances de force).", reasons: [], domains: { load: 0, wellness: 0, neural: 0 } };
  }

  const reasons = [];
  let load = 0;
  if (hasRedi) {
    if (rediRatioValue > 1.5) { load = 2; reasons.push(`Charge très élevée (REDI ${rediRatioValue.toFixed(2)})`); }
    else if (rediRatioValue > 1.3) { load = 1; reasons.push(`Charge élevée (REDI ${rediRatioValue.toFixed(2)})`); }
  }

  let well = 0;
  if (hasZ) {
    if (wellnessZ <= -1.5) { well = 2; reasons.push(`Wellness très en dessous de sa norme (z = ${wellnessZ.toFixed(1)})`); }
    else if (wellnessZ <= -0.5) { well = 1; reasons.push(`Wellness en baisse (z = ${wellnessZ.toFixed(1)})`); }
  } else if (hasScore) {
    if (wellnessScore < 5) { well = 2; reasons.push(`Wellness bas (${wellnessScore.toFixed(1)}/10)`); }
    else if (wellnessScore < 6.5) { well = 1; reasons.push(`Wellness moyen (${wellnessScore.toFixed(1)}/10)`); }
  }

  let neu = 0;
  if (hasNeural && neural.level === "alert") neu = 2;
  else if (hasNeural && neural.level === "watch") neu = 1;
  if (neural && neural.flagged) {
    neural.flagged.forEach((e) => {
      const parts = [];
      if (e.reasons.includes("drop")) parts.push(`−${e.dropPct}% vs séance précédente`);
      if (e.reasons.includes("rm")) parts.push(`e1RM à ${e.rmRatio}% du RM`);
      reasons.push(`Force ${e.name} : ${parts.join(", ")}`);
    });
  }
  if (hasCmj) {
    if (cmjPctChange <= -10) { neu = 2; reasons.push(`CMJ en chute de ${Math.abs(cmjPctChange)}%`); }
    else if (cmjPctChange <= -5) { neu = Math.max(neu, 1); reasons.push(`CMJ en baisse de ${Math.abs(cmjPctChange)}%`); }
  }

  const vals = [load, well, neu];
  const count1 = vals.filter((v) => v >= 1).length;
  const count2 = vals.filter((v) => v === 2).length;

  let level = "fit";
  if (count2 >= 2 || (count1 === 3 && count2 >= 1)) level = "risk";
  else if ((count2 === 1 && count1 >= 2) || count1 === 3 || neu === 2) level = "fatigue";
  else if (count1 >= 1) level = "watch";

  const base = FORM_LEVELS[level];
  let label = base.label;
  if (level === "fatigue" && neu === 2 && load < 2 && well < 2) label = "Fatigue nerveuse";
  if (level === "fit" && hasRedi && rediRatioValue < 0.8) label = "En forme (sous-charge)";

  const detail =
    reasons.length > 0
      ? reasons.join(" · ")
      : "REDI, wellness et performance de force dans la norme individuelle.";
  return { level, label, color: base.color, emoji: base.emoji, detail, reasons, domains: { load, wellness: well, neural: neu } };
}
