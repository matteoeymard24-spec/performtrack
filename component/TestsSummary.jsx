import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { getTest, STATUS, TEST_GROUPS, score20 } from "./testsCalc";
import { hasNorms, posteLabel, evaluateTestNorms, evaluateStrength, evaluateLadderRows, levelLabel, noteColor, MEDALS } from "./norms";
import { NormList, LevelTable, PatternList } from "./NormsUI";

const ACCENT = "#e0a13d";
const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

/* Résumé des tests d'un athlète : références, dernier résultat de chaque test,
   zones de mobilité à travailler. Lecture seule (la saisie se fait dans l'onglet Tests). */
export default function TestsSummary({ uid, title = "🧪 Mes tests", simple = false }) {
  const [tests, setTests] = useState([]);
  const [ref, setRef] = useState({});
  const [open, setOpen] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState({});
  const [rmDocs, setRmDocs] = useState([]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        try {
          const u = await getDoc(doc(db, "users", uid));
          if (alive && u.exists()) setProfile({ sport: u.data().sport || "", position: u.data().position || "", level: u.data().level || "" });
          const rs = await getDocs(collection(db, "users", uid, "rm"));
          if (alive)
            setRmDocs(
              rs.docs
                .filter((d) => !["VMA", "CMJ"].includes(d.id))
                .map((d) => ({ name: d.data().exerciseName || d.id, kg: Number(d.data().kg) }))
            );
        } catch (e) {
          /* profil / RM non lisibles : on affiche juste les tests */
        }
        const snap = await getDocs(collection(db, "users", uid, "tests"));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!alive) return;
        setRef(all.find((t) => t.id === "_reference") || {});
        setTests(
          all
            .filter((t) => t.id !== "_reference")
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        );
      } catch (e) {
        console.error("TestsSummary:", e);
      }
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!loaded) return null;
  if (tests.length === 0) {
    return (
      <div style={{ background: "#151310", padding: 20, borderRadius: 10 }}>
        <h3 style={{ margin: "0 0 6px 0", fontSize: 17, color: TEXT }}>{title}</h3>
        <div style={{ color: MUTED, fontSize: 13 }}>Aucun test enregistré pour le moment.</div>
      </div>
    );
  }

  const latest = {};
  tests.forEach((t) => {
    if (!latest[t.testId]) latest[t.testId] = t;
  });
  /* Mode simple (dashboard athlète) : tests passés + note /20, médaille atteinte et prochain objectif */
  if (simple) {
    const normsOnS = hasNorms(profile.sport, profile.position);
    const normRowsOf = (t) =>
      normsOnS ? evaluateTestNorms(t.testId, t.values, profile.sport, profile.position, profile.level) : [];
    const noteOf = (t) => {
      const def = getTest(t.testId);
      const n = def ? score20(def, t.values) : null;
      if (n != null) return n;
      const rows = normRowsOf(t).filter((r) => r.note != null);
      return rows.length ? Math.round((rows.reduce((a, r) => a + r.note, 0) / rows.length) * 10) / 10 : null;
    };
    const list = Object.values(latest).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const strengthS = normsOnS
      ? evaluateStrength(rmDocs, profile.sport, profile.position, profile.level).filter((r) => r.value != null)
      : [];

    /* médaille atteinte (pour le niveau visé) + prochain objectif chiffré */
    const goalOf = (row) => {
      const tg = row.lv?.target;
      if (!tg) return null;
      const u = row.unit ? ` ${row.unit}` : "";
      const next =
        tg.medal === "gold" ? null
        : tg.medal === "silver" ? { ...MEDALS.gold, v: tg.gold }
        : tg.medal === "bronze" ? { ...MEDALS.silver, v: tg.silver }
        : { ...MEDALS.bronze, v: tg.thr };
      return { medal: tg.medal ? MEDALS[tg.medal] : null, next, u };
    };
    const noteBadge = (n) => (
      <span style={{ fontSize: 20, fontWeight: 800, color: noteColor(n) }}>
        {n}
        <span style={{ fontSize: 11, color: MUTED }}> / 20</span>
      </span>
    );
    const tidy = (v) => {
      const x = Number(v);
      if (v == null || v === "" || !isFinite(x) || !/^\d+(\.\d+)?$/.test(String(v))) return v;
      return x >= 20 ? String(Math.round(x * 10) / 10) : String(Math.round(x * 100) / 100);
    };
    /* une ligne par mesure : libellé (valeur + médaille) · note · prochain objectif */
    const items = [];
    list.forEach((t) => {
      const def = getTest(t.testId);
      const rows = normRowsOf(t).filter((r) => r.note != null);
      if (rows.length) rows.forEach((r) => items.push({ label: r.label, row: r }));
      else {
        const n = noteOf(t);
        if (n != null) items.push({ label: def?.name || t.testId, note: n });
      }
    });
    strengthS.forEach((r) => items.push({ label: r.label, row: r }));

    return (
      <div style={{ background: "#151310", padding: 20, borderRadius: 10 }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 17, color: TEXT }}>{title}</h3>
        {items.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Aucune note pour le moment.</div>}
        {items.map((it, i) => {
          const r = it.row;
          const g = r ? goalOf(r) : null;
          const note = r ? r.note : it.note;
          return (
            <div key={i} style={{ borderTop: "1px solid #1d1a16", padding: "9px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: TEXT, fontSize: 14 }}>
                  {it.label}
                  {r ? <span style={{ color: MUTED }}> · {tidy(r.display)}{r.unit ? ` ${r.unit}` : ""}</span> : null}
                  {g?.medal ? <span style={{ marginLeft: 6 }}>{g.medal.icon}</span> : null}
                </div>
                {g && (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>
                    {g.next ? `Objectif ${g.next.icon} ${tidy(g.next.v)}${g.u}` : "🥇 Or atteint"}
                  </div>
                )}
              </div>
              <div style={{ whiteSpace: "nowrap" }}>{noteBadge(note)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  const zones = {};
  Object.values(latest).forEach((t) => {
    if (!["mobilite", "force_iso"].includes(t.group)) return;
    Object.entries(t.result?.zones || {}).forEach(([z, st]) => {
      if (!zones[z] || STATUS[st].rank > STATUS[zones[z]].rank) zones[z] = st;
    });
  });
  const problemZones = Object.entries(zones).filter(([, st]) => st !== "ok");
  const normsOn = hasNorms(profile.sport, profile.position);
  const strengthAll = normsOn ? evaluateStrength(rmDocs, profile.sport, profile.position, profile.level) : [];
  const strengthRows = strengthAll.filter((r) => r.note != null);

  return (
    <div style={{ background: "#151310", padding: 20, borderRadius: 10 }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 17, color: TEXT }}>{title}</h3>

      {(ref.vma || ref.vmi || ref.cs) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {[["vma", "VMA"], ["vmi", "VMI"], ["cs", "Vit. critique"]].map(
            ([k, l]) =>
              ref[k] && (
                <div key={k} style={{ background: "#0d0c0a", padding: "10px 14px", borderRadius: 8, minWidth: 96 }}>
                  <div style={{ fontSize: 11, color: MUTED }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>
                    {ref[k].value} <span style={{ fontSize: 11, color: MUTED }}>km/h</span>
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {problemZones.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Zones à travailler</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {problemZones.map(([z, st]) => (
              <span
                key={z}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: STATUS[st].color + "26",
                  color: STATUS[st].color,
                }}
              >
                {z}
              </span>
            ))}
          </div>
        </div>
      )}

      {TEST_GROUPS.map((g) => {
        const list = Object.values(latest).filter((t) => t.group === g.id);
        if (list.length === 0) return null;
        return (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: MUTED, margin: "6px 0" }}>{g.label}</div>
            {list.map((t) => {
              const def = getTest(t.testId);
              const hist = tests.filter((x) => x.testId === t.testId);
              const isOpen = open === t.testId;
              return (
                <div key={t.id} style={{ borderTop: "1px solid #1d1a16", padding: "8px 0" }}>
                  <div
                    onClick={() => setOpen(isOpen ? null : t.testId)}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer", alignItems: "center" }}
                  >
                    <div>
                      <div style={{ color: TEXT, fontSize: 14 }}>{def?.name || t.testId}</div>
                      <div style={{ color: MUTED, fontSize: 11 }}>{t.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: ACCENT, fontWeight: 800 }}>
                        {t.result?.main?.value} <span style={{ color: MUTED, fontSize: 11 }}>{t.result?.main?.unit}</span>
                      </span>
                      {t.result?.status && (
                        <div style={{ fontSize: 11, color: STATUS[t.result.status].color }}>{STATUS[t.result.status].label}</div>
                      )}
                      {normsOn && evaluateTestNorms(t.testId, t.values, profile.sport, profile.position, profile.level).length > 0 && (
                        <div style={{ fontSize: 11, color: MUTED }}>vs poste ▾</div>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 6 }}>
                      {(t.result?.lines || []).map((l, i) => (
                        <div key={i} style={{ fontSize: 12, color: MUTED }}>{l}</div>
                      ))}
                      {normsOn && (
                        <NormList
                          compact
                          rows={evaluateTestNorms(t.testId, t.values, profile.sport, profile.position, profile.level)}
                        />
                      )}
                      {hist.length > 1 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>
                          Historique :{" "}
                          {hist.map((h) => `${h.date} → ${h.result?.main?.value}${h.result?.main?.unit ? " " + h.result.main.unit : ""}`).join(" · ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {strengthRows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 0" }}>
            💪 Force vs norme du poste ({posteLabel(profile.sport, profile.position)})
          </div>
          <PatternList rows={strengthRows} compact />
        </div>
      )}
      {normsOn && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 0" }}>
            ⚡ Standards de vitesse par niveau
            {profile.level ? ` · objectif ${levelLabel(profile.level)}` : ""}
          </div>
          <LevelTable
            rows={evaluateLadderRows("sprint", latest.sprint?.values, profile.sport, profile.position, profile.level)}
            targetId={profile.level}
            labelHeader="Test"
            valueHeader="Ton temps"
          />
        </div>
      )}
      {normsOn && strengthAll.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 0" }}>
            🏅 Standards de force par niveau
            {profile.level ? ` · objectif ${levelLabel(profile.level)}` : ""}
          </div>
          <LevelTable rows={strengthAll} targetId={profile.level} />
        </div>
      )}
    </div>
  );
}
