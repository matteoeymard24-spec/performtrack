/* blockType.js — séances MIXTES : chaque bloc a son propre type (muscu / sprint / endurance).
   block.blockType absent = le bloc prend le type de la séance (toutes les anciennes séances).
   Le type du bloc décide : les champs du formulaire, l'affichage, le feedback (séries + reps en
   réserve en muscu, chrono par rep en sprint, distance / RPE en endurance), la mise à jour des RM
   (blocs muscu seulement) et la durée estimée. La charge de séance reste la note globale × durée. */
export const BLOCK_TYPES = [
  { value: "muscu", label: "💪 Muscu", color: "#9b59b6" },
  { value: "sprint", label: "⚡ Sprint", color: "#d9695a" },
  { value: "endurance", label: "🏃 Endurance", color: "#4fae7d" },
];

export const blockTypeOf = (block, sessionType) => {
  const t = (block && block.blockType) || sessionType || "muscu";
  return t === "vma" ? "endurance" : t;
};

/* Types présents dans une séance (ex. ["muscu","sprint"]) */
export const sessionBlockTypes = (session) => [
  ...new Set((session?.blocks || []).map((b) => blockTypeOf(b, session?.type))),
];
export const isMixedSession = (session) => sessionBlockTypes(session).length > 1;
export const hasBlockType = (session, t) => sessionBlockTypes(session).includes(t);

/* Exercice vide par défaut selon le type de bloc (mêmes valeurs que le formulaire) */
export const defaultExerciseFor = (type) => {
  if (type === "sprint")
    return { name: "", description: "", distance: 30, recoveryMin: 1, recoverySec: 0, reps: 6, sets: 3, intensity: "Max" };
  if (type === "endurance")
    return {
      name: "",
      description: "",
      vmaPercentage: 85,
      effortTime: 30,
      recoveryMin: 0,
      recoverySec: 30,
      reps: 10,
      groundWork: false,
      blockRecoveryMin: 3,
      blockRecoverySec: 0,
    };
  return { name: "", description: "", series: 3, reps: 8, tempo: "2-0-2", restMin: 2, rmPercent: 70, rmName: "" };
};

export const typeLabel = (t) => (t === "sprint" ? "Sprint" : t === "endurance" ? "Endurance" : "Musculation");
