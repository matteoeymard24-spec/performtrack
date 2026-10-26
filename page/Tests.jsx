import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  TEST_GROUPS,
  TESTS,
  STATUS,
  getTest,
  computeResult,
  toStoredResult,
  evaluateMeasures,
  score20,
} from "../component/testsCalc";
import {
  SPORTS,
  POSTES,
  posteLabel,
  hasNorms,
  evaluateTestNorms,
  evaluateLadderRows,
  evaluateStrength,
  groupByPattern,
  LEVELS,
  levelLabel,
  noteColor,
} from "../component/norms";
import { NormList, LevelTable } from "../component/NormsUI";
import RegionProfile from "../component/RegionProfile";
import PhysicalRadar from "../component/PhysicalRadar";
import { profileTargets, hasMorph, FORWARDS, BF_DXA, BF_SKINFOLD } from "../component/morphology";
import { LEVELS as RUGBY_LEVELS } from "../component/rugbyLevels";
import CyclingRadar, { CyclingNorms } from "../component/CyclingRadar";
import { CYCLING_LEVELS, CYCLING_SEXES, normSex } from "../component/cycling";
import { cyclingBilan } from "../component/cyclingRows";
import { FoldBtn, useFold } from "../component/ui";
import FmsGuide from "../component/FmsGuide";
import { appConfirm, appAlert as alert } from "../component/appDialog";

const ACCENT = "#e0a13d";
const SURFACE = "#151310";
const INPUT_BG = "#0d0c0a";
const BORDER = "#2a2620";
const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};
const ytId = (url) => {
  const m = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
};
const athleteName = (u) =>
  `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.displayName || u.email || u.id;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: INPUT_BG,
  color: TEXT,
  fontSize: 14,
};
function FoldHead({ title, color, open, onToggle, right, gap = 6 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: open ? gap : 0 }}>
      <div style={{ fontWeight: 700, ...(color ? { color } : {}) }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {right}
        <FoldBtn open={open} onClick={onToggle} />
      </div>
    </div>
  );
}

const cardStyle = { background: SURFACE, padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 };
const pill = (active) => ({
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  cursor: "pointer",
  border: active ? `1px solid ${ACCENT}` : `1px solid ${BORDER}`,
  background: active ? "rgba(224,161,61,0.18)" : INPUT_BG,
  color: active ? ACCENT : TEXT,
});
const StatusChip = ({ status }) =>
  status ? (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: STATUS[status].color + "26",
        color: STATUS[status].color,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS[status].label}
    </span>
  ) : null;

/* ---------- Bloc explication d'un test : photo + vidéo + texte ---------- */
function TestInfo({ test, media, onSaveMedia }) {
  const [editing, setEditing] = useState(false);
  const [video, setVideo] = useState("");
  const [photo, setPhoto] = useState("");
  const videoUrl = media?.videoUrl || test.video;
  const id = ytId(videoUrl);
  const photoUrl =
    media?.photoUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : test.thumb);
  const isSearch = !media?.videoUrl && test.isSearch;

  return (
    <div style={{ ...cardStyle, background: INPUT_BG, border: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            position: "relative",
            width: 200,
            maxWidth: "100%",
            height: 112,
            borderRadius: 8,
            overflow: "hidden",
            background: "#1d1a16",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={test.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 34 }}>🎥</span>
          )}
          <span
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              background: "rgba(0,0,0,0.65)",
              color: TEXT,
              fontSize: 12,
              padding: "4px 8px",
              textAlign: "center",
            }}
          >
            ▶ {isSearch ? "Chercher une vidéo" : "Voir la vidéo"}
          </span>
        </a>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
            {test.sports ? `🏅 ${test.sports} · ` : ""}🧰 {test.equipment}
          </div>
          <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{test.howTo}</div>
          <button
            onClick={() => {
              setVideo(media?.videoUrl || "");
              setPhoto(media?.photoUrl || "");
              setEditing(!editing);
            }}
            style={{ marginTop: 8, background: "transparent", border: "none", color: ACCENT, fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            ✏️ {editing ? "Fermer" : "Mettre ma propre vidéo / photo"}
          </button>
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input style={inputStyle} placeholder="Lien de la vidéo (YouTube…)" value={video} onChange={(e) => setVideo(e.target.value)} />
          <input style={inputStyle} placeholder="Lien d'une photo (optionnel, sinon miniature YouTube)" value={photo} onChange={(e) => setPhoto(e.target.value)} />
          <button
            onClick={async () => {
              await onSaveMedia({ videoUrl: video.trim(), photoUrl: photo.trim() });
              setEditing(false);
            }}
            style={{ ...pill(true), justifySelf: "start" }}
          >
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Aperçu du résultat calculé ---------- */
function ResultPreview({ res }) {
  if (!res) return <div style={{ color: MUTED, fontSize: 13 }}>Remplis les champs pour voir le résultat.</div>;
  const ev = res.eval;
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>
        {res.main.value} <span style={{ fontSize: 14, color: MUTED }}>{res.main.unit}</span>
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 8 }}>{res.main.label}</span>
      </div>
      {res.lines?.map((l, i) => (
        <div key={i} style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{l}</div>
      ))}
      {ev && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {ev.items.map((i, k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <span style={{ color: TEXT }}>
                {i.label}
                {i.side ? ` (${i.side})` : ""} — {i.value}
                {i.unit}
              </span>
              <StatusChip status={i.status} />
            </div>
          ))}
          {ev.asym.map((a, k) => (
            <div key={"a" + k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <span style={{ color: MUTED }}>
                Asymétrie G/D — {a.label} : {a.pct}
                {a.scoreOnly ? " pt" : a.abs ? ` ${a.unit}` : "%"}
              </span>
              <StatusChip status={a.status} />
            </div>
          ))}
          {ev.ratios.map((r, k) => (
            <div key={"r" + k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <span style={{ color: MUTED }}>
                {r.label} ({r.side}) : {r.value}
              </span>
              <StatusChip status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Tests() {
  const { currentUser, userRole, isSuperAdmin } = useAuth();
  // Coach (admin / superadmin) = saisie + gestion ; athlète = consultation de ses propres tests uniquement.
  const isCoach = userRole === "admin" || isSuperAdmin === true;
  const [showParams, setShowParams] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [uid, setUid] = useState("");
  const [pickMode, setPickMode] = useState(""); // "" | "athletes" | "admins" (carrés de choix, comme Workout)
  const [tab, setTab] = useState("saisie");
  const [group, setGroup] = useState("endurance");
  const [testId, setTestId] = useState("leger");
  const [values, setValues] = useState({});
  const [fmsSel, setFmsSel] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [tests, setTests] = useState([]);
  const [ref, setRef] = useState({});
  const [media, setMedia] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [targetGroup, setTargetGroup] = useState("");
  const [rmDocs, setRmDocs] = useState([]);
  // Journal de blessures (collection "injuries", même structure que le Dashboard)
  const [injuries, setInjuries] = useState([]);
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [editingInjuryId, setEditingInjuryId] = useState(null);
  const [injuryZone, setInjuryZone] = useState("");
  const [injuryTissue, setInjuryTissue] = useState("muscle");
  const [injuryMechanism, setInjuryMechanism] = useState("surcharge");
  const [injuryDaysLost, setInjuryDaysLost] = useState("");
  const [injuryNotes, setInjuryNotes] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryMessage, setInjuryMessage] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSubs, setNewGroupSubs] = useState("");
  const [subTargetGroup, setSubTargetGroup] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const test = getTest(testId);
  const bf = useFold("tests_bilan");
  const effTab = !isCoach && tab === "saisie" ? "resultats" : tab;

  /* ---- chargements ---- */
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        if (!isCoach) {
          // Athlète : il ne peut lire que son propre profil (règles Firestore).
          const [me, gs, ms] = await Promise.all([
            getDoc(doc(db, "users", currentUser.uid)),
            getDocs(collection(db, "groups")),
            getDocs(collection(db, "exerciseMedia")),
          ]);
          setAthletes(me.exists() ? [{ id: me.id, ...me.data() }] : [{ id: currentUser.uid }]);
          setGroups(gs.docs.map((d) => ({ id: d.id, ...d.data() })));
          const mm0 = {};
          ms.docs.forEach((d) => {
            if (d.id.startsWith("test_")) mm0[d.id.slice(5)] = d.data();
          });
          setMedia(mm0);
          return;
        }
        const [us, gs, ms] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "exerciseMedia")),
        ]);
        const list = us.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => athleteName(a).localeCompare(athleteName(b), "fr"));
        setAthletes(list);
        setGroups(gs.docs.map((d) => ({ id: d.id, ...d.data() })));
        const mm = {};
        ms.docs.forEach((d) => {
          if (d.id.startsWith("test_")) mm[d.id.slice(5)] = d.data();
        });
        setMedia(mm);
      } catch (e) {
        console.error("Tests: chargement", e);
      }
    })();
  }, [isCoach, currentUser?.uid]);

  // Athlète : la page est toujours sur ses propres tests.
  useEffect(() => {
    if (!isCoach && currentUser?.uid) setUid(currentUser.uid);
  }, [isCoach, currentUser?.uid]);

  const loadTests = async (id) => {
    if (!id) return;
    try {
      const rs = await getDocs(collection(db, "users", id, "rm"));
      setRmDocs(
        rs.docs
          .filter((d) => !["VMA", "CMJ"].includes(d.id))
          .map((d) => ({ name: d.data().exerciseName || d.id, kg: Number(d.data().kg) }))
      );
    } catch (e) {
      setRmDocs([]);
    }
    try {
      const snap = await getDocs(collection(db, "users", id, "tests"));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRef(all.find((t) => t.id === "_reference") || {});
      setTests(
        all
          .filter((t) => t.id !== "_reference")
          .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""))
      );
    } catch (e) {
      console.error("Tests: lecture", e);
      setTests([]);
      setRef({});
    }
  };
  useEffect(() => {
    loadTests(uid);
    setValues({});
    setMsg("");
  }, [uid]);

  useEffect(() => {
    setValues({});
    setFmsSel(null);
  }, [testId]);

  const isAdminUser = (u) => u.role === "admin" || u.superAdmin === true;
  const athleteOnly = useMemo(() => athletes.filter((a) => !isAdminUser(a)), [athletes]);
  const adminOnly = useMemo(() => athletes.filter((a) => isAdminUser(a) && a.id !== currentUser?.uid), [athletes, currentUser]);

  const result = useMemo(() => {
    if (!test) return null;
    if (test.selectable && fmsSel) {
      const sel = new Set(fmsSel);
      const sub = { ...test, measures: test.measures.filter((m) => sel.has(m.key)) };
      return computeResult(sub, values);
    }
    return computeResult(test, values);
  }, [test, values, fmsSel]);

  const activeMeasures = test?.measures
    ? test.selectable
      ? test.measures.filter((m) => (fmsSel || test.measures.map((x) => x.key)).includes(m.key))
      : test.measures
    : [];

  /* ---- enregistrement ---- */
  const saveTest = async () => {
    if (!uid || !test || !result) return;
    setSaving(true);
    setMsg("");
    try {
      const stored = toStoredResult(result);
      const clean = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v !== "" && v != null) clean[k] = v;
      });
      await addDoc(collection(db, "users", uid, "tests"), {
        testId: test.id,
        group: test.group,
        date,
        values: clean,
        result: stored,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || null,
      });
      if (test.id === "cmj" && result.cmj) {
        const ref2 = doc(db, "users", uid, "rm", "CMJ");
        const cur = await getDoc(ref2);
        const history = cur.exists() ? cur.data().history || [] : [];
        history.push({ date: new Date(date + "T12:00:00").toISOString(), kg: result.cmj });
        await setDoc(ref2, {
          kg: result.cmj,
          exerciseName: "CMJ",
          updatedAt: new Date().toISOString(),
          autoAdjusted: false,
          history: history.slice(-20),
        });
      }
      setValues({});
      setNotes("");
      setMsg("✅ Test enregistré.");
      await loadTests(uid);
    } catch (e) {
      console.error(e);
      setMsg("❌ Erreur : " + e.message);
    }
    setSaving(false);
  };

  const deleteTest = async (t) => {
    if (!await appConfirm("Supprimer ce résultat de test ?")) return;
    try {
      await deleteDoc(doc(db, "users", uid, "tests", t.id));
      await loadTests(uid);
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  /* ---- test de référence pour les séances énergétiques ---- */
  const setReference = async (kind, t) => {
    const value = t.result?.[kind];
    if (value == null) return;
    const def = getTest(t.testId);
    try {
      await setDoc(
        doc(db, "users", uid, "tests", "_reference"),
        {
          [kind]: { value, testId: t.testId, testName: def?.name || t.testId, testDocId: t.id, date: t.date },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      if (kind === "vma") {
        const r = doc(db, "users", uid, "rm", "VMA");
        const cur = await getDoc(r);
        const history = cur.exists() ? cur.data().history || [] : [];
        history.push({ date: new Date().toISOString(), kg: value });
        await setDoc(r, {
          kg: value,
          exerciseName: "VMA",
          updatedAt: new Date().toISOString(),
          autoAdjusted: false,
          source: "test",
          sourceTest: def?.name || t.testId,
          history: history.slice(-20),
        });
      }
      setMsg(`✅ ${kind.toUpperCase()} de référence : ${value} km/h (${def?.name || t.testId})`);
      await loadTests(uid);
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const saveMedia = async (tid, data) => {
    await setDoc(doc(db, "exerciseMedia", "test_" + tid), { ...data, updatedAt: new Date().toISOString() });
    setMedia((m) => ({ ...m, [tid]: data }));
  };

  const addToGroup = async () => {
    if (!targetGroup || !uid) return;
    // targetGroup : "g:<idGroupe>" ou "s:<idGroupe>:<idSousGroupe>"
    const [kind, gid, sid] = targetGroup.split(":");
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    try {
      const patch = { athleteIds: [...new Set([...(g.athleteIds || []), uid])] };
      if (kind === "s") {
        // Un athlète = un seul sous-groupe : on le retire des autres.
        patch.subGroups = (g.subGroups || []).map((s) => {
          const rest = (s.athleteIds || []).filter((a) => a !== uid);
          return s.id === sid ? { ...s, athleteIds: [...rest, uid] } : { ...s, athleteIds: rest };
        });
      }
      await updateDoc(doc(db, "groups", gid), patch);
      const sg = kind === "s" ? (g.subGroups || []).find((s) => s.id === sid) : null;
      setMsg(`✅ Athlète placé dans « ${g.name}${sg ? " › " + sg.name : ""} ».`);
      setGroups((gs) => gs.map((x) => (x.id === gid ? { ...x, ...patch } : x)));
      setTargetGroup("");
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const testsOfGroup = TESTS.filter((t) => t.group === group);
  const selectedAthlete = athletes.find((a) => a.id === uid);

  /* ---- Journal de blessures de l'athlète choisi ---- */
  const TISSUE_LABELS = { muscle: "Muscle", tendon: "Tendon", ligament: "Ligament", os: "Os / articulation", autre: "Autre" };
  const MECHANISM_LABELS = { contact: "Contact / traumatique", surcharge: "Surcharge / usure", autre: "Autre" };
  // Date LOCALE (toISOString donnait la date UTC : avant 1-2 h du matin en France, c'était encore « hier »).
  const injToday = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })();

  const loadInjuries = async (id) => {
    if (!id) {
      setInjuries([]);
      return;
    }
    try {
      const snap = await getDocs(query(collection(db, "injuries"), where("userId", "==", id)));
      setInjuries(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      );
    } catch (e) {
      console.error("Tests: chargement blessures", e);
    }
  };

  const resetInjuryForm = () => {
    setEditingInjuryId(null);
    setInjuryZone("");
    setInjuryTissue("muscle");
    setInjuryMechanism("surcharge");
    setInjuryDaysLost("");
    setInjuryNotes("");
    setInjuryDate(injToday);
    setInjuryMessage("");
  };

  useEffect(() => {
    setShowInjuryForm(false);
    resetInjuryForm();
    loadInjuries(uid);
  }, [uid]);

  const startEditInjury = (inj) => {
    setEditingInjuryId(inj.id);
    setInjuryZone(inj.zone || "");
    setInjuryTissue(inj.tissueType || "muscle");
    setInjuryMechanism(inj.mechanism || "surcharge");
    setInjuryDaysLost(inj.daysLost !== null && inj.daysLost !== undefined ? String(inj.daysLost) : "");
    setInjuryNotes(inj.notes || "");
    setInjuryDate(inj.date || injToday);
    setShowInjuryForm(true);
  };

  const saveInjury = async () => {
    if (!uid) return;
    setInjurySaving(true);
    setInjuryMessage("");
    try {
      const payload = {
        userId: uid,
        date: injuryDate || injToday,
        zone: injuryZone || "",
        tissueType: injuryTissue,
        mechanism: injuryMechanism,
        daysLost: injuryDaysLost ? Number(injuryDaysLost) : null,
        notes: injuryNotes || "",
      };
      if (editingInjuryId) {
        await updateDoc(doc(db, "injuries", editingInjuryId), payload);
      } else {
        await setDoc(doc(db, "injuries", `${uid}_${Date.now()}`), { ...payload, createdAt: Timestamp.now() });
      }
      setInjuryMessage("✅ Enregistré.");
      await loadInjuries(uid);
      setTimeout(() => {
        setShowInjuryForm(false);
        resetInjuryForm();
      }, 900);
    } catch (e) {
      setInjuryMessage("❌ Erreur : " + e.message);
    } finally {
      setInjurySaving(false);
    }
  };

  const removeInjury = async (id) => {
    if (!await appConfirm("Supprimer cette blessure de l'historique ?")) return;
    try {
      await deleteDoc(doc(db, "injuries", id));
      setInjuries((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert("Erreur suppression : " + e.message);
    }
  };

  // Création d'un groupe (+ sous-groupes séparés par des virgules), comme dans Workout
  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      alert("Donne un nom au groupe");
      return;
    }
    const subs = newGroupSubs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => ({ id: `sg_${Date.now().toString(36)}_${i}`, name: s, color: "", athleteIds: [] }));
    try {
      const ref2 = await addDoc(collection(db, "groups"), {
        name,
        athleteIds: [],
        subGroups: subs,
        color: "",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setGroups((gs) => [...gs, { id: ref2.id, name, athleteIds: [], subGroups: subs, color: "" }]);
      setNewGroupName("");
      setNewGroupSubs("");
      setMsg(`✅ Groupe « ${name} » créé${subs.length ? ` avec ${subs.length} sous-groupe(s)` : ""}.`);
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const addSubGroupTo = async () => {
    const name = newSubName.trim();
    const g = groups.find((x) => x.id === subTargetGroup);
    if (!g || !name) return;
    const subs = [...(g.subGroups || []), { id: `sg_${Date.now().toString(36)}_${(g.subGroups || []).length}`, name, color: "", athleteIds: [] }];
    try {
      await updateDoc(doc(db, "groups", g.id), { subGroups: subs });
      setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, subGroups: subs } : x)));
      setNewSubName("");
      setMsg(`✅ Sous-groupe « ${name} » ajouté à « ${g.name} ».`);
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };
  const sport = selectedAthlete?.sport || "";
  const poste = selectedAthlete?.position || "";
  const level = selectedAthlete?.level || "";
  const normsOn = hasNorms(sport, poste);
  const levelOptions = sport === "cyclisme" ? CYCLING_LEVELS : LEVELS;

  const saveProfile = async (patch) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "users", uid), patch);
      setAthletes((as) => as.map((a) => (a.id === uid ? { ...a, ...patch } : a)));
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const liveNorms = useMemo(
    () => (test && normsOn ? evaluateTestNorms(test.id, values, sport, poste, level) : []),
    [test, values, sport, poste, level, normsOn]
  );
  const strengthNorms = useMemo(
    () => (normsOn ? evaluateStrength(rmDocs, sport, poste, level) : []),
    [rmDocs, sport, poste, level, normsOn]
  );
  const inGroups = groups.filter((g) => (g.athleteIds || []).includes(uid));

  /* ---- Notes /20 par domaine pour le Bilan ---- */
  const mergedSprint = useMemo(() => {
    const merged = {};
    tests
      .filter((t) => t.testId === "sprint")
      .forEach((t) => {
        Object.entries(t.values || {}).forEach(([k, v]) => {
          if (merged[k] == null && v !== "" && v != null) merged[k] = v;
        });
      });
    return merged;
  }, [tests]);
  const mergedCmj = useMemo(() => {
    const c = tests.find((t) => t.testId === "cmj");
    return c ? c.values : null;
  }, [tests]);

  const enduVals = useMemo(() => {
    const g = (id) => tests.find((t) => t.testId === id)?.values || null;
    return { bronco: g("bronco"), yoyo_ir1: g("yoyo_ir1"), ift3015: g("ift3015") };
  }, [tests]);

  const mergedBroad = useMemo(() => {
    const b = tests.find((t) => t.testId === "broad_jump");
    return b ? b.values : null;
  }, [tests]);

  const cycBilan = useMemo(
    () => (sport === "cyclisme" ? cyclingBilan({ tests, rmDocs, bw: Number(String(selectedAthlete?.weight ?? "").replace(",", ".")) || null, level, sex: normSex(selectedAthlete?.sex) }) : null),
    [tests, rmDocs, sport, level, selectedAthlete?.weight, selectedAthlete?.sex]
  );
  const domainNotes = useMemo(() => {
    const avg = (arr) => {
      const n = arr.filter((x) => x != null);
      return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
    };
    const normRows = (testId, values, dateOf) =>
      values
        ? evaluateTestNorms(testId, values, sport, poste, level)
            .filter((r) => r.note != null)
            .map((r) => ({ label: r.label, note: r.note, extra: `${r.display} ${r.unit || ""}${dateOf ? " · " + dateOf : ""}`.trim() }))
        : [];
    const out = {};
    // Mobilité + force isométrique (dernier résultat de chaque test, note propre au test)
    const mi = {};
    tests.forEach((t) => {
      if (!["mobilite", "force_iso"].includes(t.group) || mi[t.testId]) return;
      mi[t.testId] = t;
    });
    const miRows = Object.values(mi)
      .map((t) => ({ label: getTest(t.testId)?.name || t.testId, note: score20(getTest(t.testId), t.values), extra: t.date }))
      .filter((r) => r.note != null);
    out.mobilite = { title: "🤸 Mobilité + force isométrique", avg: avg(miRows.map((r) => r.note)), rows: miRows };
    if (sport === "cyclisme") {
      const cb = cycBilan;
      const pats = groupByPattern(cb.strength).filter((g) => g.id !== "autre");
      out.force = {
        title: "💪 Force — par pattern de mouvement",
        avg: avg(pats.map((g) => g.avg)),
        rows: pats.map((g) => ({
          id: g.id,
          label: g.label,
          note: g.avg,
          extra: g.avg == null ? "pas de 1RM trouvé" : "",
          sub: g.rows.filter((x) => x.note != null).map((x) => ({ label: x.label, kg: x.display, note: x.note, matched: x.matched, estNote: !!x.estNote })),
        })),
      };
      const toRows = (rs) => rs.filter((r) => r.note != null).map((r) => ({ label: r.label, note: r.note, extra: `${r.display} ${r.unit || ""}${r.extra ? " · " + r.extra : ""}`.trim() }));
      const sp = toRows(cb.sprint);
      out.vitesse = { title: "⚡ Vitesse — sprint 5 s", avg: avg(sp.map((r) => r.note)), rows: sp };
      const cm = toRows(cb.cmj);
      out.cmj = { title: "🦘 Puissance — CMJ", avg: avg(cm.map((r) => r.note)), rows: cm };
      const en = toRows(cb.endu);
      out.endurance = { title: "🏃 Endurance", avg: avg(en.map((r) => r.note)), rows: en };
    } else if (normsOn) {
      const pats = groupByPattern(strengthNorms).filter((g) => g.id !== "autre");
      out.force = {
        title: "💪 Force — par pattern de mouvement",
        avg: avg(pats.map((g) => g.avg)),
        rows: pats.map((g) => ({
          label: g.label,
          note: g.avg,
          extra: g.avg == null ? "pas de 1RM trouvé" : "",
          sub: g.rows
            .filter((x) => x.note != null)
            .map((x) => ({ label: x.label, kg: x.display, note: x.note, matched: x.matched, estNote: x.estNote })),
        })),
      };
      const sRows = normRows("sprint", mergedSprint, "");
      out.vitesse = { title: "⚡ Vitesse", avg: avg(sRows.map((r) => r.note)), rows: sRows };
      const c = tests.find((t) => t.testId === "cmj");
      const cRows = normRows("cmj", mergedCmj, c ? c.date : "");
      const bj = tests.find((t) => t.testId === "broad_jump");
      const bRows = normRows("broad_jump", mergedBroad, bj ? bj.date : "").map((r) => ({ ...r, estNoteTxt: true }));
      const jumpRows = [...cRows, ...bRows];
      out.cmj = { title: "🦘 Puissance", avg: avg(jumpRows.map((r) => r.note)), rows: jumpRows };
      const b = tests.find((t) => t.testId === "bronco");
      const yy = tests.find((t) => t.testId === "yoyo_ir1");
      const ift = tests.find((t) => t.testId === "ift3015");
      const eRows = [
        ...(b ? normRows("bronco", b.values, b.date) : []),
        ...(yy ? normRows("yoyo_ir1", yy.values, yy.date).map((r) => ({ ...r, estNoteTxt: true })) : []),
        ...(ift ? normRows("ift3015", ift.values, ift.date).map((r) => ({ ...r, estNoteTxt: true })) : []),
      ];
      out.endurance = { title: "🏃 Endurance", avg: avg(eRows.map((r) => r.note)), rows: eRows };
    }
    return out;
  }, [tests, strengthNorms, mergedSprint, mergedCmj, mergedBroad, sport, poste, level, normsOn, cycBilan]);

  const field = (key, label, unit, ph) => (
    <div key={key}>
      <label style={{ fontSize: 12, color: MUTED }}>
        {label} {unit && <span>({unit})</span>}
      </label>
      <input
        style={inputStyle}
        inputMode="decimal"
        placeholder={ph || ""}
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", color: TEXT }}>
      <h2 style={{ margin: "0 0 4px 0", fontSize: 24, fontWeight: 700 }}>🧪 Tests</h2>
      <div style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>
        {isCoach
          ? "Saisis les tests d'endurance, de mobilité, de force isométrique et de puissance. Les séances énergétiques s'appuient sur le test de référence choisi pour chaque athlète."
          : "Consulte tes résultats, tes normes et ton bilan. La saisie des tests est faite par ton coach."}
      </div>

      {/* Choix de l'athlète + paramètres (repliables, l'onglet reste visible) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: MUTED }}>
            {selectedAthlete ? (
              <>
                {isCoach ? "Athlète : " : "Mes paramètres : "}
                <b style={{ color: TEXT }}>{athleteName(selectedAthlete)}</b>
                {sport ? ` · ${(SPORTS.find((x) => x.id === sport) || {}).label || sport}` : ""}
                {poste ? ` · ${posteLabel(sport, poste)}` : ""}
                {level ? ` · ${levelLabel(level)}` : ""}
              </>
            ) : (
              isCoach ? "Choisis un athlète" : "Mes paramètres"
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowParams((v) => !v)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #2a2620", background: "#0d0c0a", color: MUTED, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {showParams ? "▾ Masquer" : "▸ Afficher"}
          </button>
        </div>
        {showParams && isCoach && (
          <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { id: "athletes", label: "🏉 Athlètes" },
            { id: "moi", label: "🌟 Moi" },
            { id: "admins", label: "👥 Admins" },
          ].map((m) => {
            const active =
              m.id === "moi" ? !!uid && uid === currentUser?.uid : pickMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (m.id === "moi") {
                    setPickMode("");
                    if (currentUser?.uid) setUid(currentUser.uid);
                  } else {
                    setPickMode(pickMode === m.id ? "" : m.id);
                  }
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "#e0a13d" : "rgba(255,255,255,0.16)"}`,
                  background: active ? "rgba(224,161,61,0.2)" : "transparent",
                  color: TEXT,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {pickMode && (
          <select
            style={{ ...inputStyle, marginTop: 10 }}
            value={(pickMode === "admins" ? adminOnly : athleteOnly).some((a) => a.id === uid) ? uid : ""}
            onChange={(e) => setUid(e.target.value)}
          >
            <option value="">
              {pickMode === "admins" ? "— Choisir un admin —" : "— Choisir un athlète —"}
            </option>
            {(pickMode === "admins" ? adminOnly : athleteOnly).map((a) => (
              <option key={a.id} value={a.id}>
                {athleteName(a)}
              </option>
            ))}
          </select>
        )}
        {uid && selectedAthlete && (
          <div style={{ marginTop: 8, fontSize: 13, color: MUTED }}>
            Sélection : <b style={{ color: TEXT }}>{uid === currentUser?.uid ? "🌟 Moi — " : ""}{athleteName(selectedAthlete)}</b>
          </div>
        )}
        {uid && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <select
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              value={sport}
              onChange={(e) => saveProfile({ sport: e.target.value, position: "", level: "" })}
            >
              <option value="">Sport…</option>
              {SPORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              style={{ ...inputStyle, flex: 2, minWidth: 180 }}
              value={poste}
              disabled={!sport}
              onChange={(e) => saveProfile({ position: e.target.value })}
            >
              <option value="">Poste (pour comparer aux normes)…</option>
              {(POSTES[sport] || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
              value={level}
              disabled={!sport}
              onChange={(e) => saveProfile({ level: e.target.value })}
            >
              <option value="">Niveau visé…</option>
              {levelOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        )}
          </div>
        )}
        {showParams && !isCoach && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                value={sport}
                onChange={(e) => saveProfile({ sport: e.target.value, position: "", level: "" })}
              >
                <option value="">Sport…</option>
                {SPORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                style={{ ...inputStyle, flex: 2, minWidth: 180 }}
                value={poste}
                disabled={!sport}
                onChange={(e) => saveProfile({ position: e.target.value })}
              >
                <option value="">Poste (pour comparer aux normes)…</option>
                {(POSTES[sport] || []).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                value={level}
                disabled={!sport}
                onChange={(e) => saveProfile({ level: e.target.value })}
              >
                <option value="">Niveau visé…</option>
                {levelOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
              Choisis ton sport, ton poste et ton niveau visé : tes résultats sont comparés aux normes correspondantes.
            </div>
          </div>
        )}
      </div>

      {!uid ? (
        <div style={{ color: MUTED, textAlign: "center", padding: 30 }}>{isCoach ? "Choisis un athlète pour saisir ou consulter ses tests." : "Chargement…"}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ...(isCoach ? [["saisie", "➕ Saisir un test"]] : []),
              ["resultats", `📋 Résultats (${tests.length})`],
              ["normes", "📐 Normes"],
              ["bilan", isCoach ? "🧭 Bilan mobilité / groupes" : "🧭 Bilan"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={pill(effTab === k)}>
                {l}
              </button>
            ))}
          </div>

          {msg && <div style={{ ...cardStyle, padding: 10, color: TEXT, fontSize: 13 }}>{msg}</div>}

          {/* ------------ SAISIE ------------ */}
          {effTab === "saisie" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {TEST_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setGroup(g.id);
                      const first = TESTS.find((t) => t.group === g.id);
                      if (first) setTestId(first.id);
                    }}
                    style={pill(group === g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <select style={{ ...inputStyle, marginBottom: 12 }} value={testId} onChange={(e) => setTestId(e.target.value)}>
                {testsOfGroup.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.noGear ? "🧰 " : ""}
                    {t.name}
                  </option>
                ))}
              </select>

              {test && (
                <>
                  <TestInfo test={test} media={media[test.id]} onSaveMedia={(d) => saveMedia(test.id, d)} />

                  <div style={cardStyle}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: MUTED }}>Date du test</label>
                      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>

                    {test.selectable && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Mouvements testés :</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {test.measures.map((m) => {
                            const sel = (fmsSel || test.measures.map((x) => x.key)).includes(m.key);
                            return (
                              <button
                                key={m.key}
                                onClick={() => {
                                  const cur = fmsSel || test.measures.map((x) => x.key);
                                  setFmsSel(sel ? cur.filter((k) => k !== m.key) : [...cur, m.key]);
                                }}
                                style={pill(sel)}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {test.id === "fms" && (
                      <FmsGuide
                        measures={activeMeasures}
                        media={media.fmsguide}
                        canEdit={isCoach}
                        onSavePhotos={(photos) => saveMedia("fmsguide", { photos })}
                      />
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      {test.fields &&
                        test.fields.map((f) => field(f.key, f.label, f.unit, f.placeholder))}
                      {test.measures &&
                        activeMeasures.map((m) =>
                          m.sided ? (
                            <React.Fragment key={m.key}>
                              {field(`${m.key}_L`, `${m.label} — Gauche`, m.unit)}
                              {field(`${m.key}_R`, `${m.label} — Droite`, m.unit)}
                            </React.Fragment>
                          ) : (
                            field(m.key, m.label, m.unit)
                          )
                        )}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 12, color: MUTED }}>Remarques (optionnel)</label>
                      <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, douleur, météo…" />
                    </div>

                    <div style={{ marginTop: 14, padding: 12, background: INPUT_BG, borderRadius: 8 }}>
                      <ResultPreview res={result} />
                      {liveNorms.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>
                            📐 Comparaison — {posteLabel(sport, poste)}
                          </div>
                          <NormList rows={liveNorms} compact />
                        </div>
                      )}
                      {!normsOn && selectedAthlete && (
                        <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>
                          Choisis le sport et le poste (en haut de la page) pour comparer ce résultat aux normes.
                        </div>
                      )}
                    </div>

                    <button
                      disabled={!result || saving}
                      onClick={saveTest}
                      style={{
                        marginTop: 14,
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: result ? ACCENT : "#3a352d",
                        color: "#1a1306",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: result ? "pointer" : "not-allowed",
                      }}
                    >
                      {saving ? "Enregistrement…" : `Enregistrer pour ${selectedAthlete ? athleteName(selectedAthlete) : ""}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ------------ RÉSULTATS ------------ */}
          {effTab === "resultats" && (
            <>
              <div style={cardStyle}>
                <FoldHead title="⭐ Références pour les séances énergétiques" open={bf.isOpen("refs")} onToggle={() => bf.toggle("refs")} />
                {bf.isOpen("refs") && (<>
                {["vma", "vmi", "cs"].map((k) => (
                  <div key={k} style={{ fontSize: 13, color: ref[k] ? TEXT : MUTED, padding: "3px 0" }}>
                    {k === "vma" ? "VMA" : k === "vmi" ? "VMI (30-15)" : "Vitesse critique"} :{" "}
                    {ref[k] ? (
                      <strong style={{ color: ACCENT }}>
                        {ref[k].value} km/h
                      </strong>
                    ) : (
                      "non définie"
                    )}
                    {ref[k] && <span style={{ color: MUTED }}> · {ref[k].testName} ({ref[k].date})</span>}
                  </div>
                ))}
                {isCoach && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                    Clique sur « Définir comme référence » sous un résultat pour que les séances utilisent ce test.
                  </div>
                )}
                </>)}
              </div>

              {tests.length === 0 && <div style={{ color: MUTED, textAlign: "center", padding: 20 }}>{isCoach ? "Aucun test enregistré pour cet athlète." : "Aucun test enregistré pour le moment."}</div>}
              {tests.map((t) => {
                const def = getTest(t.testId);
                return (
                  <div key={t.id} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{def?.name || t.testId}</span>
                          <FoldBtn open={bf.isOpen("res_" + t.id)} onClick={() => bf.toggle("res_" + t.id)} />
                        </div>
                        <div style={{ fontSize: 12, color: MUTED }}>{t.date}{t.notes ? ` · ${t.notes}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>
                          {t.result?.main?.value} <span style={{ fontSize: 12, color: MUTED }}>{t.result?.main?.unit}</span>
                        </span>
                        {t.result?.status && <div><StatusChip status={t.result.status} /></div>}
                        {(() => {
                          const n = score20(def, t.values);
                          return n != null ? (
                            <div style={{ marginTop: 4, fontWeight: 800, color: noteColor(n) }}>
                              {n}
                              <span style={{ fontSize: 12, color: MUTED }}> / 20</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    {bf.isOpen("res_" + t.id) && (<>
                    {(t.result?.lines || []).map((l, i) => (
                      <div key={i} style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{l}</div>
                    ))}
                    {/* Détail mouvement par mouvement (FMS, mobilité, force iso) */}
                    {def && !def.compute && (() => {
                      const ev = evaluateMeasures(def, t.values || {});
                      if (!ev.items.length) return null;
                      const rows = [];
                      ev.items.forEach((i) => {
                        let r = rows.find((x) => x.key === i.key);
                        if (!r) {
                          r = { key: i.key, label: i.label, unit: i.unit, sides: {} };
                          rows.push(r);
                        }
                        r.sides[i.side || "—"] = i;
                      });
                      return (
                        <div style={{ marginTop: 8, borderTop: `1px solid ${BORDER}` }}>
                          {rows.map((r) => (
                            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13 }}>{r.label}</span>
                              <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                {["G", "D", "—"].filter((s) => r.sides[s]).map((s) => (
                                  <span key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                                    {s !== "—" && <span style={{ color: MUTED }}>{s}</span>}
                                    <strong>{r.sides[s].value}</strong>
                                    <span style={{ color: MUTED, fontSize: 11 }}>{r.unit}</span>
                                    <StatusChip status={r.sides[s].status} />
                                  </span>
                                ))}
                              </span>
                            </div>
                          ))}
                          {ev.asym.map((a) => (
                            <div key={a.key} style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                              Asymétrie G/D — {a.label} : {a.pct}{a.scoreOnly ? " pt" : a.abs ? ` ${a.unit}` : " %"} · {STATUS[a.status].label}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {normsOn && <NormList rows={evaluateTestNorms(t.testId, t.values, sport, poste, level)} compact />}
                    {isCoach && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {[["vma", "VMA"], ["vmi", "VMI"], ["cs", "Vitesse critique"]].map(
                        ([k, l]) =>
                          t.result?.[k] != null && (
                            <button key={k} onClick={() => setReference(k, t)} style={pill(ref[k]?.testDocId === t.id)}>
                              {ref[k]?.testDocId === t.id ? "⭐ " : ""}Définir comme référence {l}
                            </button>
                          )
                      )}
                      <button onClick={() => deleteTest(t)} style={{ ...pill(false), color: "#d9534f" }}>
                        🗑 Supprimer
                      </button>
                    </div>
                    )}
                    </>)}
                  </div>
                );
              })}
            </>
          )}

          {/* ------------ NORMES ------------ */}
          {effTab === "normes" && (
            <>
              {sport === "cyclisme" ? (
                <>
                  <div style={cardStyle}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: MUTED }}>
                      Normes :
                      {CYCLING_SEXES.map((o) => {
                        const on = normSex(selectedAthlete?.sex) === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => saveProfile({ sex: o.id })}
                            style={{ background: on ? "#1c2a40" : "transparent", color: on ? "#7aa6e8" : MUTED, border: `1px solid ${on ? "#7aa6e8" : "#2a2620"}`, borderRadius: 999, padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: 11 }}>(enregistré dans le profil de l'athlète)</span>
                    </div>
                    {!selectedAthlete?.weight && (
                      <div style={{ fontSize: 12, color: ACCENT, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {cycBilan?.bw ? `Poids pris dans ton dernier test : ${cycBilan.bw} kg.` : "Poids de l'athlète non renseigné : les seuils restent en × poids / W/kg."}
                        <input
                          placeholder="Poids (kg)"
                          inputMode="decimal"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = Number(String(e.target.value).replace(",", "."));
                              if (v > 0) saveProfile({ weight: v });
                            }
                          }}
                          style={{ background: "#0d0c0a", color: TEXT, border: "1px solid #2a2620", borderRadius: 6, padding: "4px 8px", fontSize: 12, width: 100 }}
                        />
                        <span style={{ fontSize: 11, color: MUTED }}>Entrée pour enregistrer dans le profil</span>
                      </div>
                    )}
                  </div>
                  <div style={cardStyle}>
                    <FoldHead title="💪 Standards de force par niveau — par pattern" open={bf.isOpen("n_force")} onToggle={() => bf.toggle("n_force")} gap={2} />
                    {bf.isOpen("n_force") && (<>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                        Tes 1RM de « Mes RM » face à chaque niveau du cyclisme sur route (kg pour {selectedAthlete?.weight ? `${selectedAthlete.weight} kg` : "ton poids"}).
                      </div>
                      {groupByPattern(cycBilan?.strength || []).filter((g) => g.id !== "autre").map((g) => (
                        <div key={g.id} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 13, color: TEXT, fontWeight: 700, marginBottom: 4 }}>{g.label}</div>
                          <LevelTable rows={g.rows} targetId={level} legend="* valeur d'une étude · ~ estimé à partir d'une étude · ⚠ provisoire : aucune norme cycliste publiée trouvée · vert = niveau atteint · bronze = standard du niveau, argent = +1 écart-type, or = +2" />
                        </div>
                      ))}
                    </>)}
                  </div>
                  <div style={cardStyle}>
                    <FoldHead title="🦘 Standards de puissance (CMJ) par niveau" open={bf.isOpen("n_vert")} onToggle={() => bf.toggle("n_vert")} gap={2} />
                    {bf.isOpen("n_vert") && (
                      <LevelTable rows={cycBilan?.cmj || []} targetId={level} labelHeader="Test" valueHeader="Ton CMJ" legend="Barème provisoire : aucune norme cycliste publiée trouvée pour le CMJ · bronze = standard du niveau, argent = +1 écart-type, or = +2" />
                    )}
                  </div>
                  <div style={cardStyle}>
                    <FoldHead title="🚴 Sprint et endurance — référence" open={bf.isOpen("n_cyc_ref")} onToggle={() => bf.toggle("n_cyc_ref")} gap={2} />
                    {bf.isOpen("n_cyc_ref") && (<>
                      <LevelTable rows={[...(cycBilan?.sprint || []), ...(cycBilan?.endu || [])]} targetId={level} labelHeader="Test" valueHeader="Ton résultat" legend="Puissances en watts pour le poids de l'athlète (la note est calculée en W/kg, donc indépendante du poids) · VO2max en ml/kg/min · bronze = standard du niveau, argent = +1 écart-type, or = +2" />
                      <CyclingNorms level={level} sex={selectedAthlete?.sex} />
                    </>)}
                  </div>
                </>
              ) : !normsOn ? (
                <div style={cardStyle}>
                  <FoldHead title="📐 Comparaison aux normes" open={bf.isOpen("nonorm")} onToggle={() => bf.toggle("nonorm")} />
                  {bf.isOpen("nonorm") && (
                  <div style={{ fontSize: 13, color: MUTED }}>
                    {"Choisis le sport et le poste de l'athlète en haut de la page. Les normes viennent de ton barème (rugby : barème SU Agen, par poste)."}
                  </div>
                  )}
                </div>
              ) : (
                <>
                  {sport === "rugby" && hasMorph(poste) && (
                    <div style={cardStyle}>
                      <FoldHead title={<>📏 Standards anthropométriques par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_morph")} onToggle={() => bf.toggle("n_morph")} gap={2} />
                      {bf.isOpen("n_morph") && (<>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                          Poids et masse maigre à viser pour ce poste, niveau par niveau{level ? ` (objectif : ${levelLabel(level)})` : ""}. Un athlète à ce standard a la note « verte » (16/20).
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                            <thead>
                              <tr style={{ color: MUTED, textAlign: "right" }}>
                                <th rowSpan={2} style={{ padding: "5px 8px", textAlign: "left", verticalAlign: "bottom" }}>Niveau</th>
                                <th colSpan={3} style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #1d1a16" }}>Poids (kg)</th>
                                <th colSpan={3} style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #1d1a16" }}>Masse maigre (kg)</th>
                                <th rowSpan={2} style={{ padding: "5px 8px", verticalAlign: "bottom" }}>Source</th>
                              </tr>
                              <tr style={{ color: MUTED, textAlign: "right", fontSize: 11 }}>
                                <th style={{ padding: "3px 8px" }}>Athlétique*</th>
                                <th style={{ padding: "3px 8px" }}>Standard</th>
                                <th style={{ padding: "3px 8px" }}>Momentum*</th>
                                <th style={{ padding: "3px 8px" }}>Athlétique*</th>
                                <th style={{ padding: "3px 8px" }}>Standard</th>
                                <th style={{ padding: "3px 8px" }}>Momentum*</th>
                              </tr>
                            </thead>
                            <tbody>
                              {RUGBY_LEVELS.map((l) => {
                                const t = profileTargets(poste, l.id);
                                const isT = l.id === level;
                                const est = !!l.f;
                                const cell = (v, strong) => (
                                  <td style={{ padding: "5px 8px", color: strong ? "#f3f0ea" : "#a8a199", fontWeight: strong ? 700 : 400 }}>{v}</td>
                                );
                                return (
                                  <tr key={l.id} style={{ borderTop: "1px solid #1d1a16", textAlign: "right", background: isT ? "rgba(224,161,61,0.12)" : "transparent" }}>
                                    <td style={{ padding: "5px 8px", textAlign: "left", color: isT ? "#e0a13d" : "#f3f0ea", fontWeight: 700 }}>{l.label}{isT ? " 🎯" : ""}</td>
                                    {cell(t.athletique.bm, false)}
                                    {cell(t.standard.bm, true)}
                                    {cell(t.momentum.bm, false)}
                                    {cell(t.athletique.ffm, false)}
                                    {cell(t.standard.ffm, true)}
                                    {cell(t.momentum.ffm, false)}
                                    <td style={{ padding: "5px 8px", color: est ? "#d9a441" : "#a8a199" }}>{est ? "estimé" : "document"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div style={{ fontSize: 11, color: "#d9a441", marginTop: 6, lineHeight: 1.5 }}>
                            * Profils ESTIMÉS : aucune norme publiée ne sépare le profil athlétique (plus mobile, plus léger) du profil momentum (plus de masse pour les collisions). J'applique −4 % / +4 % au standard du poste. La colonne « Standard » est celle du document.
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#a8a199", marginTop: 10, lineHeight: 1.6 }}>
                          <strong style={{ color: "#f3f0ea" }}>Masse grasse (pros)</strong> : {FORWARDS.includes(poste)
                            ? `avants ${BF_DXA.forwards[0]} ± ${BF_DXA.forwards[1]} % à la DXA (≈ ${BF_SKINFOLD.forwards} % aux plis cutanés)`
                            : `arrières ${BF_DXA.backs[0]} ± ${BF_DXA.backs[1]} % à la DXA (≈ ${BF_SKINFOLD.backs} % aux plis cutanés)`}. La méthode de mesure change beaucoup le chiffre : compare toujours avec la même méthode.
                        </div>
                        <div style={{ fontSize: 11, color: "#a8a199", marginTop: 8, lineHeight: 1.6 }}>
                          Sources : « USA Rugby Player Profiles and Performance Standards » (poids et masse maigre par poste, niveau Pro D2 et au-dessus) ; masse grasse : Posthumus et al. 2020, Sports 8(6):85 (DXA, pros) et revue J Funct Morphol Kinesiol 2026 (plis). Les niveaux marqués « estimé » (Nationale et en dessous, U18, Espoirs) sont le standard du poste multiplié par un coefficient de niveau (de 0,95 à 0,70), cohérent avec la revue 2026 (avants amateurs ≈ 91 kg contre ≈ 116 kg en élite) : ce n'est pas une mesure poste par poste.
                        </div>
                      </>)}
                    </div>
                  )}

                  <div style={cardStyle}>
                    <FoldHead title={<>🏅 Standards de force par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_force")} onToggle={() => bf.toggle("n_force")} gap={2} />
                    {bf.isOpen("n_force") && (<>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                      Tes 1RM de « Mes RM » face à chaque niveau du rugby français
                      {level ? ` (objectif : ${levelLabel(level)})` : " (choisis un niveau visé en haut pour le surligner)"}.
                    </div>
                    <LevelTable rows={strengthNorms} targetId={level} />
                    </>)}
                  </div>

                  <div style={cardStyle}>
                    <FoldHead title={<>⚡ Standards de vitesse par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_speed")} onToggle={() => bf.toggle("n_speed")} gap={2} />
                    {bf.isOpen("n_speed") && (<>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                      Sprint 10 / 15 / 20 / 60 m, et vitesse max face à chaque niveau
                      {level ? ` (objectif : ${levelLabel(level)})` : ""}. Tes derniers temps saisis sont comparés automatiquement.
                    </div>
                    {(() => {
                      const merged = {};
                      tests
                        .filter((t) => t.testId === "sprint")
                        .forEach((t) => {
                          Object.entries(t.values || {}).forEach(([k, v]) => {
                            if (merged[k] == null && v !== "" && v != null) merged[k] = v;
                          });
                        });
                      const rows = evaluateLadderRows("sprint", merged, sport, poste, level);
                      return <LevelTable rows={rows} targetId={level} labelHeader="Test" valueHeader="Ton temps" />;
                    })()}
                    </>)}
                  </div>

                  <div style={cardStyle}>
                    <FoldHead title={<>🦘 Standards de puissance verticale par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_vert")} onToggle={() => bf.toggle("n_vert")} gap={2} />
                    {bf.isOpen("n_vert") && (<>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                      Hauteur de CMJ face à chaque niveau
                      {level ? ` (objectif : ${levelLabel(level)})` : ""}. Ton dernier CMJ saisi est comparé automatiquement.
                    </div>
                    <LevelTable
                      rows={evaluateLadderRows("cmj", mergedCmj, sport, poste, level)}
                      targetId={level}
                      labelHeader="Test"
                      valueHeader="Ton CMJ"
                    />
                    </>)}
                  </div>

                  <div style={cardStyle}>
                    <FoldHead title={<>↗️ Standards de puissance horizontale par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_horiz")} onToggle={() => bf.toggle("n_horiz")} gap={2} />
                    {bf.isOpen("n_horiz") && (<>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                      Distance du meilleur essai face à chaque niveau
                      {level ? ` (objectif : ${levelLabel(level)})` : ""}. Ton meilleur essai saisi est comparé automatiquement.
                    </div>
                    <LevelTable
                      rows={evaluateLadderRows("broad_jump", mergedBroad, sport, poste, level)}
                      targetId={level}
                      labelHeader="Test"
                      valueHeader="Ton broad jump"
                    />
                    </>)}
                  </div>

                  <div style={cardStyle}>
                    <FoldHead title={<>🏃 Standards d'endurance par niveau — {posteLabel(sport, poste)}</>} open={bf.isOpen("n_endu")} onToggle={() => bf.toggle("n_endu")} gap={2} />
                    {bf.isOpen("n_endu") && (<>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                      Bronco (temps), Yo-Yo IR1 (distance) et 30-15 IFT (VIFT) face à chaque niveau
                      {level ? ` (objectif : ${levelLabel(level)})` : ""}. Ton dernier résultat saisi est comparé automatiquement.
                    </div>
                    <LevelTable
                      rows={[
                        ...evaluateLadderRows("bronco", enduVals.bronco, sport, poste, level),
                        ...evaluateLadderRows("yoyo_ir1", enduVals.yoyo_ir1, sport, poste, level),
                        ...evaluateLadderRows("ift3015", enduVals.ift3015, sport, poste, level),
                      ]}
                      targetId={level}
                      labelHeader="Test"
                      valueHeader="Ton résultat"
                    />
                    </>)}
                  </div>

                  <div style={{ ...cardStyle, fontSize: 12, color: MUTED }}>
                    Médailles : 🥉 bronze = moyenne du niveau, 🥈 argent et 🥇 or = au-dessus ; sous la moyenne = hors standard.
                  </div>
                </>
              )}
            </>
          )}

          {/* ------------ BILAN ------------ */}
          {effTab === "bilan" && (
            <>
              {sport === "cyclisme" && (
                <div style={cardStyle}>
                  <FoldHead title="🕸️ Radar des qualités physiques — cyclisme sur route" open={bf.isOpen("radar")} onToggle={() => bf.toggle("radar")} gap={2} />
                  {bf.isOpen("radar") && (
                    <CyclingRadar level={level} rider={poste} sex={selectedAthlete?.sex} domainNotes={domainNotes} />
                  )}
                </div>
              )}
              {normsOn && (
                <div style={cardStyle}>
                  <FoldHead title="🕸️ Radar des qualités physiques" open={bf.isOpen("radar")} onToggle={() => bf.toggle("radar")} gap={2} />
                  {bf.isOpen("radar") && (
                    <PhysicalRadar
                      domainNotes={domainNotes}
                      rmDocs={rmDocs}
                      sport={sport}
                      poste={poste}
                      level={level}
                      weight={selectedAthlete?.weight}
                      height={selectedAthlete?.height}
                      bodyFat={selectedAthlete?.bodyFat}
                      bodyFatMethod={selectedAthlete?.bodyFatMethod}
                      onSaveProfile={saveProfile}
                    />
                  )}
                </div>
              )}
              <div style={cardStyle}>
                <FoldHead title="🏅 Notes /20 par domaine" open={bf.isOpen("notes")} onToggle={() => bf.toggle("notes")} gap={2} />
                {bf.isOpen("notes") && (<>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Dernier résultat de chaque test. Force, vitesse, CMJ et endurance sont notés avec le barème du poste (niveau visé pris en compte).
                </div>
                {(() => {
                  const parts = ["mobilite", "force", "vitesse", "cmj", "endurance"]
                    .map((k) => ({ k, d: domainNotes[k] }))
                    .filter((x) => x.d && x.d.avg != null);
                  const total = parts.length ? Math.round((parts.reduce((a, x) => a + x.d.avg, 0) / parts.length) * 10) / 10 : null;
                  return (
                    <div style={{ background: "#151310", borderRadius: 12, padding: "14px 16px", marginBottom: 4, border: `1px solid ${BORDER}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 15 }}>🏆 Note physique globale</strong>
                        {total != null ? (
                          <span style={{ fontSize: 28, fontWeight: 800, color: noteColor(total) }}>
                            {total}
                            <span style={{ fontSize: 13, color: MUTED }}> / 20</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: MUTED }}>pas encore de donnée</span>
                        )}
                      </div>
                      {total != null && (
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                          Moyenne de {parts.length} domaine{parts.length > 1 ? "s" : ""} sur 5 (poids égal) :{" "}
                          {parts.map((x) => `${x.d.title.replace(/^\S+\s/, "")} ${x.d.avg}`).join(" · ")}
                          {parts.length < 5 ? ". Plus tu passes de tests, plus la note est complète." : "."}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {!normsOn && sport !== "cyclisme" && (
                  <div style={{ fontSize: 12, color: ACCENT, marginBottom: 8 }}>
                    Choisis le sport et le poste de l'athlète en haut de la page pour obtenir les notes de force, vitesse, CMJ et endurance.
                  </div>
                )}
                {["mobilite", "force", "vitesse", "cmj", "endurance"].map((k) => {
                  const d = domainNotes[k];
                  if (!d) return null;
                  return (
                    <div key={k} style={{ background: "#151310", borderRadius: 12, padding: "14px 16px", marginTop: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: d.rows.length ? 10 : 0 }}>
                        <strong style={{ fontSize: 15 }}>{d.title}</strong>
                        {d.avg != null ? (
                          <span style={{ fontSize: 22, fontWeight: 800, color: noteColor(d.avg) }}>
                            {d.avg}
                            <span style={{ fontSize: 12, color: MUTED }}> / 20</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: MUTED }}>pas encore de donnée</span>
                        )}
                      </div>
                      {d.rows.map((r, i) => (
                        <div
                          key={i}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, color: MUTED, padding: "9px 0", borderTop: `1px solid ${BORDER}` }}
                        >
                          <span style={{ lineHeight: 1.35 }}>
                            {r.label}
                            {r.extra ? <span style={{ display: "block", fontSize: 11, color: "#706a61" }}>{r.extra}</span> : null}
                            {(r.sub || []).map((x, j) => (
                              <span key={j} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "#706a61", marginTop: 3 }}>
                                <span>
                                  ↳ {x.label} · {x.kg} kg{x.matched ? ` — fiche RM « ${x.matched} »` : ""}{x.estNote ? " (barème estimé)" : ""}
                                </span>
                                <span style={{ color: noteColor(x.note), fontWeight: 700 }}>{x.note}/20</span>
                              </span>
                            ))}
                          </span>
                          {r.note != null && (
                            <span style={{ color: noteColor(r.note), fontWeight: 700, whiteSpace: "nowrap" }}>{r.note} / 20</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {sport === "cyclisme" && (
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 14 }}>
                    Cyclisme : force notée sur tes 1RM rapportés au poids du corps, vitesse = puissance max 5 s, puissance = CMJ, endurance = seuil 20 min, PMA 5 min et VO2max estimée. Barèmes détaillés (et valeurs provisoires) dans l'onglet Normes.
                  </div>
                )}
                {normsOn && (
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 14 }}>
                    L'endurance est notée avec le Bronco, le Yo-Yo IR1 et le 30-15 IFT (barèmes Yo-Yo et 30-15 estimés). Pas de barème pour la VMA ni le Yo-Yo IR2.
                  </div>
                )}
                </>)}
              </div>
              <div style={cardStyle}>
                <FoldHead title="🧭 Profil par région" open={bf.isOpen("region")} onToggle={() => bf.toggle("region")} gap={4} />
                {bf.isOpen("region") && (
                <RegionProfile
                  title=""
                  tests={tests}
                  onPickTest={
                    isCoach
                      ? (id, g) => {
                          setTab("saisie");
                          setGroup(g);
                          setTestId(id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      : null
                  }
                />
                )}
              </div>

              <div style={{ ...cardStyle, border: "1px solid rgba(217,105,90,0.4)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: bf.isOpen("injuries") ? 6 : 0 }}>
                  <div style={{ fontWeight: 700, color: "#d9695a" }}>🚑 Historique de blessures ({injuries.length})</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {uid && bf.isOpen("injuries") && (
                  <button
                    disabled={!uid}
                    onClick={() => {
                      if (showInjuryForm && !editingInjuryId) {
                        setShowInjuryForm(false);
                      } else {
                        resetInjuryForm();
                        setShowInjuryForm(true);
                      }
                    }}
                    style={{ ...pill(false), color: "#d9695a", borderColor: "#d9695a" }}
                  >
                    {showInjuryForm ? "Annuler" : "+ Ajouter une blessure"}
                  </button>
                  )}
                  <FoldBtn open={bf.isOpen("injuries")} onClick={() => bf.toggle("injuries")} />
                  </div>
                </div>
                {bf.isOpen("injuries") && (<>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  {isCoach
                    ? "Même journal que dans le Dashboard : à croiser avec les zones à travailler pour choisir le groupe d'individualisation."
                    : "Renseigne ici tes blessures passées et en cours : ton coach les voit et s'en sert pour adapter tes séances."}
                </div>

                {showInjuryForm && (
                  <div style={{ marginBottom: 14, padding: 12, background: "#151310", borderRadius: 10 }}>
                    <label style={{ fontSize: 12, color: MUTED }}>Date</label>
                    <input type="date" value={injuryDate} onChange={(e) => setInjuryDate(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
                    <label style={{ fontSize: 12, color: MUTED }}>Zone touchée</label>
                    <input type="text" value={injuryZone} onChange={(e) => setInjuryZone(e.target.value)} placeholder="ex : cheville gauche" style={{ ...inputStyle, marginBottom: 10 }} />
                    <label style={{ fontSize: 12, color: MUTED }}>Type de tissu</label>
                    <select value={injuryTissue} onChange={(e) => setInjuryTissue(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                      {Object.entries(TISSUE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 12, color: MUTED }}>Mécanisme</label>
                    <select value={injuryMechanism} onChange={(e) => setInjuryMechanism(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                      {Object.entries(MECHANISM_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 12, color: MUTED }}>Jours d'arrêt estimés</label>
                    <input type="number" min="0" value={injuryDaysLost} onChange={(e) => setInjuryDaysLost(e.target.value)} placeholder="ex : 7" style={{ ...inputStyle, marginBottom: 10 }} />
                    <label style={{ fontSize: 12, color: MUTED }}>Notes</label>
                    <textarea value={injuryNotes} onChange={(e) => setInjuryNotes(e.target.value)} rows={3} style={{ ...inputStyle, marginBottom: 10, resize: "vertical" }} />
                    <button
                      onClick={saveInjury}
                      disabled={injurySaving}
                      style={{ width: "100%", padding: 12, background: injurySaving ? "#a8a199" : "#d9695a", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: injurySaving ? "not-allowed" : "pointer" }}
                    >
                      {injurySaving ? "Enregistrement..." : editingInjuryId ? "Mettre à jour" : "Enregistrer la blessure"}
                    </button>
                    {injuryMessage && (
                      <div style={{ marginTop: 8, fontSize: 13, color: injuryMessage.includes("✅") ? "#4fae7d" : "#d9695a" }}>{injuryMessage}</div>
                    )}
                  </div>
                )}

                {!uid ? (
                  <div style={{ fontSize: 13, color: MUTED }}>Choisis un athlète en haut de la page.</div>
                ) : injuries.length > 0 ? (
                  injuries.map((inj) => (
                    <div key={inj.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13 }}>
                        <strong style={{ color: "#d9695a" }}>{inj.date}</strong>
                        {inj.zone ? ` — ${inj.zone}` : ""}{" "}
                        <span style={{ color: MUTED }}>
                          ({TISSUE_LABELS[inj.tissueType] || inj.tissueType}, {MECHANISM_LABELS[inj.mechanism] || inj.mechanism})
                          {inj.daysLost !== null && inj.daysLost !== undefined ? `, ${inj.daysLost}j d'arrêt` : ""}
                        </span>
                        {inj.notes && <div style={{ color: "#706a61", fontSize: 12, marginTop: 2 }}>{inj.notes}</div>}
                      </div>
                      {uid && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => startEditInjury(inj)} style={{ ...pill(false), color: ACCENT, padding: "6px 10px", fontSize: 12 }}>Modifier</button>
                        <button onClick={() => removeInjury(inj.id)} style={{ ...pill(false), color: "#d9534f", padding: "6px 10px", fontSize: 12 }}>Supprimer</button>
                      </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: MUTED }}>{isCoach ? "Aucune blessure enregistrée pour cet athlète." : "Aucune blessure enregistrée pour le moment."}</div>
                )}
              </>)}
              </div>

              {!isCoach && (
                <div style={cardStyle}>
                  <FoldHead title="👥 Mon groupe d'individualisation" open={bf.isOpen("mygroup")} onToggle={() => bf.toggle("mygroup")} />
                  {bf.isOpen("mygroup") && (
                  <div style={{ fontSize: 13, color: MUTED }}>
                    {inGroups.length
                      ? inGroups
                          .map((g) => {
                            const sg = (g.subGroups || []).find((x) => (x.athleteIds || []).includes(uid));
                            return sg ? `${g.name} › ${sg.name}` : g.name;
                          })
                          .join(", ")
                      : "Pas encore placé dans un groupe par ton coach."}
                  </div>
                  )}
                </div>
              )}
              {isCoach && (<>
              <div style={cardStyle}>
                <FoldHead title="👥 Placer dans un groupe d'individualisation" open={bf.isOpen("place")} onToggle={() => bf.toggle("place")} />
                {bf.isOpen("place") && (<>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Groupes actuels :{" "}
                  {inGroups.length
                    ? inGroups
                        .map((g) => {
                          const sg = (g.subGroups || []).find((s) => (s.athleteIds || []).includes(uid));
                          return sg ? `${g.name} › ${sg.name}` : g.name;
                        })
                        .join(", ")
                    : "aucun"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select style={{ ...inputStyle, flex: 1, minWidth: 180 }} value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
                    <option value="">— Choisir un groupe / sous-groupe —</option>
                    {groups.map((g) =>
                      (g.subGroups || []).length > 0 ? (
                        <optgroup key={g.id} label={g.name}>
                          {(g.subGroups || []).map((s) => {
                            const here = (s.athleteIds || []).includes(uid);
                            return (
                              <option key={s.id} value={`s:${g.id}:${s.id}`} disabled={here}>
                                {s.name}
                                {here ? " (déjà placé)" : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      ) : (
                        !(g.athleteIds || []).includes(uid) && (
                          <option key={g.id} value={`g:${g.id}`}>
                            {g.name}
                          </option>
                        )
                      )
                    )}
                  </select>
                  <button onClick={addToGroup} disabled={!targetGroup} style={pill(!!targetGroup)}>
                    Ajouter au groupe
                  </button>
                </div>
                </>)}
              </div>

              <div style={cardStyle}>
                <FoldHead title="➕ Créer un groupe / sous-groupe" open={bf.isOpen("create")} onToggle={() => bf.toggle("create")} />
                {bf.isOpen("create") && (<>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Même groupes que dans Workout : un groupe peut contenir des sous-groupes (ex : Cheville, Chaîne post, Bassin).
                </div>
                <input
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Nom du nouveau groupe"
                />
                <input
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                  value={newGroupSubs}
                  onChange={(e) => setNewGroupSubs(e.target.value)}
                  placeholder="Sous-groupes (séparés par des virgules, optionnel)"
                />
                <button onClick={createGroup} disabled={!newGroupName.trim()} style={pill(!!newGroupName.trim())}>
                  Créer le groupe
                </button>

                <div style={{ borderTop: `1px solid ${BORDER}`, margin: "14px 0 10px" }} />
                <div style={{ fontSize: 13, marginBottom: 6 }}>Ajouter un sous-groupe à un groupe existant</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select style={{ ...inputStyle, flex: 1, minWidth: 140 }} value={subTargetGroup} onChange={(e) => setSubTargetGroup(e.target.value)}>
                    <option value="">— Groupe —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder="Nom du sous-groupe"
                  />
                  <button onClick={addSubGroupTo} disabled={!subTargetGroup || !newSubName.trim()} style={pill(!!subTargetGroup && !!newSubName.trim())}>
                    Ajouter
                  </button>
                </div>
                </>)}
              </div>
              </>)}
            </>
          )}
        </>
      )}
    </div>
  );
}
