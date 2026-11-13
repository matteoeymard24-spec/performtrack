/* =====================================================================
   rtpPlan.js — le retour au jeu écrit dans la PLANIFICATION INDIVIDUELLE de l'athlète.

   Une étape = un cycle individuel (scope "user:<uid>", phase « Réathlétisation ») :
     id   rtp_<idBlessure>_s<étape>   (fixe : on le réécrit à chaque mise à jour, pas de doublon)
     nom  « 🏥 Réathlé · Étape 3 — Renforcement & course »
     dates : du jour d'entrée dans l'étape à J+13 (prolongé tant qu'on y est)
     objectif = objectif de l'étape ; notes = « Au programme » + cases à cocher + tests à faire
   Les étapes passées sont écrites avec leurs vraies dates (historique visible dans sa planif), les étapes
   « en avance » (retour en arrière) sont supprimées. Étape 6 validée : le cycle se ferme ce jour-là.
   Un cycle individuel passe devant ceux du groupe dans sa planif (cycles.js) : dans le groupe Blessés,
   c'est de l'individuel. Écrit par le coach (règles : il crée ses cycles) ; aucune lecture en plus.
   ===================================================================== */
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { RTP_N, lsiOf } from "./coachSynthesis";
import { addDays } from "./cycles";

export const rtpCycleId = (injuryId, stage) => `rtp_${String(injuryId).replace(/[^A-Za-z0-9_-]/g, "_")}_s${stage}`;

/* Texte des notes du cycle (lisible tel quel dans la planif de l'athlète) */
const KIND_TEST = { force80: "force", force90: "force", hop90: "hop", ybal90: "ybal", speed90: "speed", perf95: "perf" };
export function rtpPlanNotes(st, state, isCurrent = true) {
  const lines = [];
  lines.push(`Au programme : ${st.content}`);
  lines.push("");
  lines.push("Pour passer à l'étape suivante :");
  st.criteria.forEach((c) => lines.push(`${c.ok ? "✓" : "☐"} ${c.t}`));
  // tests de CETTE étape : ceux qui cochent un de ses critères, + les tests perso « suivi seulement » sur l'étape en cours
  const todo = (state.testsList || []).filter(
    (t) => st.criteria.some((c) => c.test === t.id || KIND_TEST[c.kind] === t.id) || (isCurrent && t.custom && !t.stage)
  );
  if (todo.length) {
    lines.push("");
    lines.push("Tests de retour terrain :");
    todo.forEach((t) => {
      const v = lsiOf(state.tests?.[t.id]);
      lines.push(`• ${t.label}${t.min ? ` (objectif ≥ ${t.min} %)` : ""}${v != null ? ` — dernier : ${v} %` : " — à faire"}`);
    });
  }
  return lines.join("\n");
}

export async function syncRtpPlan({ db, coachUid, athleteUid, injury, state, today }) {
  if (!injury?.id || !athleteUid || !coachUid || !state) return { written: 0 };
  const name = injury.name || injury.zone || "blessure";
  const scope = `user:${athleteUid}`;
  let written = 0;
  const cur = state.cleared ? RTP_N : state.stage;
  const cycleOf = (n, start, end) => {
    const st = state.stages[n - 1];
    const done = n < cur || state.cleared;
    return {
      name: `🏥 Réathlé · Étape ${n}/${RTP_N} — ${st.label}${done ? " ✓" : ""}`,
      level: "meso",
      model: "bloc",
      phase: "reathle",
      startDate: start,
      endDate: end < start ? start : end,
      scope,
      objective: `${name} — ${n === cur && state.cleared ? "retour à la performance validé" : st.goal}`,
      notes: rtpPlanNotes(st, state, !done),
      intensity: null,
      volume: null,
      parentId: null,
      rtp: { injuryId: injury.id, stage: n },
      createdBy: coachUid,
      createdAt: serverTimestamp(),
    };
  };
  // étapes passées : écrites avec leurs vraies dates (du jour d'entrée à la veille de l'étape suivante)
  for (let n = 1; n < cur; n++) {
    const from = state.entered?.[n];
    const next = state.entered?.[n + 1];
    if (!from || !next) continue; // dates inconnues (suivi démarré en cours de route)
    await setDoc(doc(db, "cycles", rtpCycleId(injury.id, n)), cycleOf(n, from, addDays(next, -1)), { merge: true });
    written++;
  }
  // étapes au-delà de l'étape en cours (retour en arrière) : supprimées
  for (let n = cur + 1; n <= RTP_N; n++) {
    try {
      await deleteDoc(doc(db, "cycles", rtpCycleId(injury.id, n)));
    } catch (e) {
      /* rien à supprimer */
    }
  }
  // étape en cours : du jour d'entrée à J+13 (prolongée tant qu'on y est) ; clôturée le jour de la validation
  const start = state.entered?.[cur] || today;
  const end = state.cleared ? today : [addDays(start, 13), addDays(today, 6)].sort().pop();
  await setDoc(doc(db, "cycles", rtpCycleId(injury.id, cur)), cycleOf(cur, start, end), { merge: true });
  written++;
  return { written, id: rtpCycleId(injury.id, cur) };
}
