/* =====================================================================
   sprintFeedback.js — feedback des séances SPRINT : chrono + RPE PAR RÉPÉTITION.

   Pourquoi un chrono plutôt que la distance : en sprint la distance est imposée (l'athlète fait
   toujours ses 20 m) ; ce qui renseigne, c'est le TEMPS de chaque rep. Il donne la qualité de la
   séance et la fatigue, via la perte de vitesse :
     • %Sdec (décrément de performance, Fitzsimons 1993 ; Glaister 2008 ; Girard, Mendez-Villanueva
       & Bishop 2011, Sports Med 41:673) = (somme des temps / (meilleur temps × n) − 1) × 100.
     • Perte par rep = (temps − meilleur) / meilleur. En sprint de VITESSE on arrête ou on récupère plus
       quand la perte dépasse ≈ 5 % (méthode « velocity loss » : Rest redistribution vs 5 % velocity
       loss, J Strength Cond Res 2023 37(8):1566 ; seuil 5 % retenu par Sun et al. 2026, Front Physiol).
       Au-delà de ≈ 10 %, on ne travaille plus la vitesse maximale mais la répétition de sprints.

   Pourquoi le RPE PAR REP (et pas une seule note par exercice) :
     • en sprint chaque rep est maximale ; la perception monte rep après rep avec la fatigue
       (RPE qui augmente au fil des sprints répétés) — une note unique « moyenne » l'écrase ;
     • ce n'est PAS le même RPE qu'en muscu : en muscu le RPE se lit en répétitions en réserve
       (Zourdos 2016) ; en sprint il n'y a pas de réserve (on court à fond), c'est l'effort perçu
       sur l'échelle CR-10 de Foster (Foster et al. 2001).
     • pour la charge (sRPE = RPE × durée, Foster 2001), chaque rep compte comme une valeur de RPE
       dans la moyenne de la séance, comme chaque série en muscu. La sRPE est valide chez les sprinteurs :
       elle suit surtout la distance courue à très haute vitesse (> 85 % Vmax) — IJSPP 2024 19(8):792
       (18 sprinteurs élite, 681 séances).
   ===================================================================== */

const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;

export const SPRINT_LOSS_WARN = 5; // % : au-delà, la vitesse maximale n'est plus vraiment travaillée
export const SPRINT_LOSS_STOP = 10; // % : fatigue nette

/* Liste des reps à remplir (séries × reps), en reprenant ce qui existe déjà */
export function buildSprintReps(exercise, existing) {
  const sets = Math.max(1, Number(exercise?.sets) || 1);
  const reps = Math.max(1, Number(exercise?.reps) || 1);
  const old = Array.isArray(existing?.reps) ? existing.reps : [];
  const defRpe = existing?.rpe != null ? Number(existing.rpe) : 7;
  const out = [];
  for (let s = 1; s <= sets; s++)
    for (let r = 1; r <= reps; r++) {
      const o = old.find((x) => x.set === s && x.rep === r);
      out.push({ set: s, rep: r, time: o?.time ?? "", rpe: o?.rpe ?? defRpe, done: o?.done ?? true });
    }
  return out;
}

const validTime = (t) => {
  const v = Number(String(t).replace(",", "."));
  return v > 0 && v < 120 ? v : null;
};

/* Résumé : meilleur / moyen, %Sdec, perte de chaque rep, RPE moyen */
export function summarizeSprint(reps) {
  const done = (reps || []).filter((x) => x.done !== false);
  const times = done.map((x) => validTime(x.time)).filter((v) => v != null);
  const rpes = done.map((x) => Number(x.rpe)).filter((v) => v >= 0 && v <= 10);
  const best = times.length ? Math.min(...times) : null;
  const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const sdec = times.length >= 2 ? (times.reduce((a, b) => a + b, 0) / (best * times.length) - 1) * 100 : null;
  const loss = (t) => {
    const v = validTime(t);
    return v != null && best ? ((v - best) / best) * 100 : null;
  };
  return {
    nDone: done.length,
    nTimed: times.length,
    best: best != null ? r2(best) : null,
    mean: mean != null ? r2(mean) : null,
    sdec: sdec != null ? r1(sdec) : null,
    maxLoss: times.length >= 2 ? r1(Math.max(...times.map((v) => ((v - best) / best) * 100))) : null,
    rpeMean: rpes.length ? r1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
    loss,
  };
}

/* Entrée enregistrée dans Firestore */
export function sprintEntry(exercise, reps, notes) {
  const clean = (reps || []).map((x) => ({
    set: x.set,
    rep: x.rep,
    time: validTime(x.time),
    rpe: Number(x.rpe),
    done: x.done !== false,
  }));
  const S = summarizeSprint(clean);
  const dist = Number(exercise?.distance) || 0;
  return {
    reps: clean,
    rpe: S.rpeMean, // compatibilité : RPE moyen des reps
    actualDistance: dist * S.nDone, // distance imposée × reps faites
    bestTime: S.best,
    meanTime: S.mean,
    sdec: S.sdec,
    maxLoss: S.maxLoss,
    notes: notes || "",
  };
}

/* Valeurs de RPE d'un feedback (muscu : par série ; sprint : par rep ; sinon : une valeur) */
export function feedbackRpeValues(fb) {
  if (!fb) return [];
  if (Array.isArray(fb.series))
    return fb.series.map((s) => s.rpe).filter((v) => v !== undefined && v !== null && v !== "").map(Number);
  if (Array.isArray(fb.reps))
    return fb.reps
      .filter((x) => x.done !== false)
      .map((x) => x.rpe)
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map(Number);
  return fb.rpe !== undefined && fb.rpe !== null ? [Number(fb.rpe)] : [];
}

/* Texte court pour les résumés */
export function sprintSummaryText(fb) {
  if (!fb || !Array.isArray(fb.reps)) return null;
  const parts = [];
  if (fb.bestTime != null) parts.push(`meilleur ${String(fb.bestTime).replace(".", ",")} s`);
  if (fb.meanTime != null) parts.push(`moyenne ${String(fb.meanTime).replace(".", ",")} s`);
  if (fb.sdec != null) parts.push(`perte ${String(fb.sdec).replace(".", ",")} %`);
  if (fb.rpe != null) parts.push(`RPE moyen ${fb.rpe}/10`);
  return parts.join(" · ");
}

export const fmtTime = (t) => (t == null || t === "" ? "—" : `${String(t).replace(".", ",")} s`);
