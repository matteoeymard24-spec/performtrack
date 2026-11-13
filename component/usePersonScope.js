import { useEffect, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { getScopedUserDocs } from "./workoutQueries";

/* =====================================================================
   usePersonScope.js — « de qui je regarde les données ? » (Nutrition, Sommeil…)
   Même logique que Mes RM : un athlète ne voit que lui ; un coach peut choisir
   un de SES athlètes (PersonPicker), le superadmin aussi les autres coachs.
   Retour : { uid, isAdminLike, mode, setMode, viewUid, setViewUid, athletes, admins, groups, person }
   ===================================================================== */
export default function usePersonScope() {
  const { currentUser, userRole, isSuperAdmin, coachScope, userProfile } = useAuth();
  const isAdminLike = userRole === "admin" || !!isSuperAdmin;
  // lien direct depuis la fiche coach : ?athlete=<uid> ouvre les données de cet athlète
  const urlAthlete = (() => {
    try {
      return new URLSearchParams(window.location.search).get("athlete") || "";
    } catch (e) {
      return "";
    }
  })();
  const [mode, setMode] = useState(() => (isAdminLike && urlAthlete && urlAthlete !== currentUser?.uid ? "athletes" : "moi")); // moi | athletes | admins
  const [viewUid, setViewUid] = useState(() => (isAdminLike && urlAthlete && urlAthlete !== currentUser?.uid ? urlAthlete : ""));
  // le rôle peut arriver après le premier affichage : appliquer le lien une fois qu'on sait que c'est un coach
  const urlApplied = useRef(false);
  useEffect(() => {
    if (urlApplied.current || !isAdminLike || !urlAthlete || urlAthlete === currentUser?.uid) return;
    urlApplied.current = true;
    setMode("athletes");
    setViewUid(urlAthlete);
  }, [isAdminLike, currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [athletes, setAthletes] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!isAdminLike || !currentUser) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getScopedUserDocs();
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!alive) return;
        setAthletes(all.filter((u) => u.id !== currentUser.uid && u.role !== "admin" && (!coachScope || coachScope.ownsUser(u))));
        setAdmins(all.filter((u) => u.id !== currentUser.uid && u.role === "admin" && isSuperAdmin));
        try {
          const g = await getDocs(collection(db, "groups"));
          if (alive) setGroups(g.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !coachScope || coachScope.ownsGroup(x)));
        } catch (e) {
          console.warn("Groupes:", e);
        }
      } catch (e) {
        console.warn("Liste athlètes:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdminLike, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const effUid = mode !== "moi" && viewUid ? viewUid : currentUser?.uid;
  const person =
    effUid === currentUser?.uid ? { id: currentUser?.uid, ...(userProfile || {}) } : [...athletes, ...admins].find((a) => a.id === effUid) || { id: effUid };
  return {
    uid: effUid,
    isSelf: effUid === currentUser?.uid,
    isAdminLike,
    mode,
    setMode: (m) => {
      setMode(m);
      setViewUid("");
    },
    viewUid,
    setViewUid,
    athletes,
    admins,
    groups,
    person,
  };
}
