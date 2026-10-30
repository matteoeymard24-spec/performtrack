// coachScope.js — système coach / athlètes.
//
// Principe : chaque athlète a un champ users/{id}.coachId (uid de son coach).
// Chaque coach (role "admin") a un code (users/{id}.coachCode) listé aussi dans
// la collection coachCodes/{CODE} = { coachId, coachName } pour que l'inscription
// puisse retrouver le coach à partir du code.
//
//  - un coach ne voit que SES athlètes et les séances qu'il a créées / ciblant
//    ses athlètes ;
//  - le superadmin voit ses athlètes + les athlètes sans coach ; l'interrupteur
//    « tout voir » (Layout) lui ouvre tous les coachs ;
//  - un athlète rattaché à un coach ne voit que les séances de CE coach (les
//    athlètes sans coach — comptes d'avant ce système — voient tout, comme avant).
//
// ATTENTION : ce filtrage se fait côté application (comme le reste des filtres
// par groupe) ; les règles Firestore autorisent toujours la lecture des séances
// à tout compte connecté (voir firestore-rules-avec-groupes.rules).

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I

export const generateCoachCode = () => {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
};

export const normalizeCoachCode = (raw) =>
  (raw || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");

/* L'athlète `athlete` (document users) peut-il voir la séance `w` ?
   Sert aussi aux calculs par athlète côté coach (Dashboard, charge...). */
// memberTargets : groupes / sous-groupes personnalisés dont l'athlète est membre → il voit leurs
// séances quel que soit le coach qui les a créées.
export const athleteCanSeeWorkout = (w, athlete, memberTargets = null) => {
  const coachId = athlete?.coachId || null;
  if (!coachId) return true; // compte sans coach (avant le système) : comme avant
  if (memberTargets && w.group && memberTargets.includes(w.group)) return true;
  if (!w.createdBy) return true; // très anciennes séances sans auteur
  if (w.createdBy === coachId) return true;
  if (w.targetUserId && w.targetUserId === athlete.id) return true;
  if (w.group === "moi" && w.createdBy === athlete.id) return true;
  return false;
};
