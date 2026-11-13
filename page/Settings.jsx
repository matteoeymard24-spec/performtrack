import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { Page, PageHeader, Kpi, KpiGrid, FoldCard, useFold, CARD_STYLE, TEXT, MUTED, ACCENT } from "../component/ui";
import { getScopedUserDocs } from "../component/workoutQueries";
import { THRESHOLD_SECTIONS, DEFAULTS, saveThresholds } from "../component/thresholds";
import { appConfirm, appAlert as alert } from "../component/appDialog";
import { useSearchParams } from "react-router-dom";
import Reference from "./Reference";
import { createTestAthlete, deleteTestAthlete, testAthleteId, setTestHidden } from "../component/testAthlete";

/* 🧪 Athlète test : un faux athlète rempli avec ~4 mois de données pour voir le rendu complet (testAthlete.js) */
function TestAthleteCard() {
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // existe-t-il déjà ? (1 lecture, à l'ouverture de la carte)
  const [exists, setExists] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!currentUser?.uid) return;
    getDoc(doc(db, "users", testAthleteId(currentUser.uid)))
      .then((d) => {
        setExists(d.exists());
        setHidden(!!(d.exists() && d.data().testHidden));
      })
      .catch(() => setExists(null));
  }, [currentUser?.uid, msg]);
  const run = async (kind) => {
    if (kind === "delete" && !(await appConfirm("Supprimer l'athlète test et toutes ses données ?", { ok: "Supprimer", danger: true }))) return;
    setBusy(kind);
    setMsg("");
    try {
      if (kind === "hide") {
        await setTestHidden({ db, coachUid: currentUser.uid, hidden: !hidden });
        setMsg(hidden ? "✓ Athlète test affiché (recharge la page)." : "✓ Athlète test masqué partout (recharge la page).");
      } else if (kind === "create") {
        const res = await createTestAthlete({ db, coachUid: currentUser.uid });
        setMsg(`✓ Athlète test prêt (${res.docs} documents). Ouvre le Dashboard (recharge la page) et clique sur « Test Démo 🧪 ».`);
      } else {
        const n = await deleteTestAthlete({ db, coachUid: currentUser.uid });
        setMsg(`✓ Athlète test supprimé (${n} documents).`);
      }
    } catch (e) {
      setMsg("❌ " + e.message + (/permission/i.test(e.message) ? " — vérifie que la règle « wellness » autorise le superadmin (voir la conversation)." : ""));
    } finally {
      setBusy("");
    }
  };
  return (
    <div style={{ marginBottom: 16, padding: 16, borderRadius: 12, background: "#151310", border: "1px solid #2a2620" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>🧪 Athlète test</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: exists ? GREEN : MUTED }}>
          {exists == null ? "" : !exists ? "pas encore créé : clique sur « Créer »" : hidden ? "créé, masqué partout" : "✓ créé : visible seulement par toi (Dashboard, Athlètes, Séances)"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 12px", lineHeight: 1.5 }}>
        Crée « Test Démo 🧪 », rattaché à toi, avec environ 4 mois de séances (RPE, durées), wellness quotidien, RM, CMJ, VMA, poids,
        une blessure aux ischios en récidive avec son retour au jeu à l'étape 4, et des séances à venir. Régénérer remet les données à
        jour par rapport à aujourd'hui. Ses séances lui sont propres : elles n'apparaissent chez aucun autre athlète.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="pt-btn pt-btn--primary" disabled={!!busy} onClick={() => run("create")}>
          {busy === "create" ? "Création…" : "Créer / régénérer"}
        </button>
        {exists && (
          <button type="button" className="pt-btn" disabled={!!busy} onClick={() => run("hide")}>
            {busy === "hide" ? "…" : hidden ? "👁 Afficher" : "🙈 Masquer partout"}
          </button>
        )}
        <button type="button" className="pt-btn pt-btn--danger" disabled={!!busy} onClick={() => run("delete")}>
          {busy === "delete" ? "Suppression…" : "Supprimer"}
        </button>
        {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("✓") ? GREEN : "#d9695a" }}>{msg}</span>}
      </div>
    </div>
  );
}

/* =====================================================================
   Settings.jsx — ⚙️ Paramètres : seuils et normes de l'app (coach).
   Enregistrés chez le coach + copiés chez chacun de ses athlètes (voir thresholds.js).
   ===================================================================== */

const GREEN = "#4fae7d";
const RED = "#d9695a";
const BORDER = "#2a2620";
const fr = (v) => String(v).replace(".", ",");

/* Règles de cohérence (un seuil « bas » doit rester sous le « haut ») */
const CHECKS = [
  ["rediUnder", "rediHigh", "REDI : la sous-charge doit être sous la charge élevée"],
  ["rediHigh", "rediVeryHigh", "REDI : « élevée » doit être sous « très élevée »"],
  ["wellZVeryLow", "wellZLow", "Wellness : « très dégradé » doit être sous « en baisse »"],
  ["wellScoreLow", "wellScoreMid", "Wellness sans z-score : « bas » doit être sous « moyen »"],
  ["cmjDrop", "cmjBigDrop", "CMJ : la baisse doit être inférieure à la chute"],
  ["effortZSoft", "effortZHard", "Effort perçu : « plus dur » doit être sous « bien plus dur »"],
  ["dayZLight", "dayZHard", "Journée : le seuil « légère » doit être sous « intense »"],
  ["loadLight", "loadHard", "Repères fixes : « légère » doit être sous « intense »"],
  ["rpeVolLow", "rpeVolHigh", "RPE auto : le petit volume doit être sous le gros volume"],
  ["synthJumpWatch", "synthJumpAlert", "Synthèse : la hausse « à surveiller » doit être sous la hausse « alerte »"],
  ["synthPainWatch", "synthPainAlert", "Douleur : « à surveiller » doit être sous « alerte »"],
  ["rtpLoadPartial", "rtpLoadFull", "Retour au jeu : la charge « sans contact » doit être sous la charge « complet »"],
];

function ParamRow({ p, value, onChange }) {
  const v = value === undefined || value === "" ? "" : value;
  const changed = v !== "" && Number(v) !== p.def;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: TEXT, fontWeight: changed ? 800 : 600 }}>
          {changed && <span style={{ color: ACCENT }}>● </span>}
          {p.label}
        </div>
        <div style={{ fontSize: 11.5, color: MUTED }}>
          défaut {fr(p.def)}
          {p.unit ? ` ${p.unit}` : ""}
          {p.src ? ` · ${p.src}` : ""}
          {p.help ? ` · ${p.help}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <input
          type="number"
          inputMode="decimal"
          step={p.step}
          min={p.min}
          max={p.max}
          value={v}
          placeholder={String(p.def)}
          onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value.replace(",", "."))}
          style={{ width: 92, padding: "7px 9px", borderRadius: 10, border: `1px solid ${changed ? ACCENT : BORDER}`, background: "#0d0c0a", color: changed ? ACCENT : TEXT, fontSize: 15, fontWeight: 800, textAlign: "right" }}
        />
        {p.unit && <span style={{ fontSize: 12, color: MUTED, minWidth: 34 }}>{p.unit}</span>}
        <button
          type="button"
          title="Valeur par défaut"
          disabled={!changed}
          onClick={() => onChange(p.def)}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${changed ? ACCENT + "66" : BORDER}`, background: "transparent", color: changed ? ACCENT : "#4a453e", cursor: changed ? "pointer" : "default" }}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { currentUser, isSuperAdmin, coachScope } = useAuth();
  const isCoach = !!isSuperAdmin; // réservé au superadmin
  const fold = useFold("settings", []);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ref" ? "ref" : "seuils";
  const tabs = (
    <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {[
        ["seuils", "🎛️ Seuils"],
        ["ref", "📚 Référence"],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={tab === id ? "pt-btn pt-btn--accent" : "pt-btn"}
          onClick={() => setParams(id === "ref" ? { tab: "ref" } : {}, { replace: true })}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null); // valeurs enregistrées (pour savoir s'il y a des changements)
  const [meta, setMeta] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid, "config", "thresholds"));
        const vals = snap.exists() ? snap.data().values || {} : {};
        setDraft({ ...DEFAULTS, ...vals });
        setSaved({ ...DEFAULTS, ...vals });
        setMeta(snap.exists() ? snap.data() : null);
      } catch (e) {
        setDraft({ ...DEFAULTS });
        setSaved({ ...DEFAULTS });
      }
      if (isCoach) {
        try {
          const us = await getScopedUserDocs();
          setAthletes(
            us.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((u) => u.id !== currentUser.uid && u.superAdmin !== true && (!coachScope || coachScope.ownsUser(u)))
          );
        } catch (e) {
          setAthletes([]);
        }
      }
    })();
  }, [currentUser?.uid, isCoach]); // eslint-disable-line react-hooks/exhaustive-deps

  const nChanged = useMemo(() => (draft ? Object.keys(DEFAULTS).filter((k) => draft[k] !== "" && Number(draft[k]) !== DEFAULTS[k]).length : 0), [draft]);
  const dirty = useMemo(() => draft && saved && Object.keys(DEFAULTS).some((k) => String(draft[k]) !== String(saved[k])), [draft, saved]);
  const errors = useMemo(() => {
    if (!draft) return [];
    const val = (k) => (draft[k] === "" ? DEFAULTS[k] : Number(draft[k]));
    const out = CHECKS.filter(([a, b]) => !(val(a) < val(b))).map((c) => c[2]);
    THRESHOLD_SECTIONS.forEach((s) =>
      s.params.forEach((p) => {
        const v = val(p.k);
        if (!Number.isFinite(v) || v < p.min || v > p.max) out.push(`${p.label} : entre ${fr(p.min)} et ${fr(p.max)}`);
      })
    );
    return out;
  }, [draft]);

  if (!isCoach)
    return (
      <Page>
        <PageHeader title="⚙️ Paramètres" subtitle="Réservé au superadmin : les seuils sont réglés par lui." />
      </Page>
    );
  if (tab === "ref")
    return (
      <Page>
        <PageHeader title="⚙️ Paramètres" subtitle="Tous les calculs de l'app, modalité par modalité, avec leurs sources (lus directement dans le code de calcul)." />
        {tabs}
        <Reference embedded />
      </Page>
    );
  if (!draft)
    return (
      <Page>
        <PageHeader title="⚙️ Paramètres" />
        {tabs}
        <div style={{ color: MUTED }}>Chargement…</div>
      </Page>
    );

  const save = async () => {
    if (errors.length) return alert("À corriger avant d'enregistrer :\n• " + errors.join("\n• "));
    setBusy(true);
    try {
      const vals = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "" ? DEFAULTS[k] : Number(v)]));
      const r = await saveThresholds(vals, athletes.map((a) => a.id));
      setSaved(vals);
      setDraft(vals);
      setMeta({ updatedAt: new Date().toISOString() });
      alert(`✅ Seuils enregistrés pour toi${r.ok ? ` et ${r.ok} athlète${r.ok > 1 ? "s" : ""}` : ""}.${r.failed.length ? `\n⚠️ ${r.failed.length} athlète(s) non mis à jour (droits) : ils gardent les valeurs par défaut.` : ""}`);
    } catch (e) {
      alert("Enregistrement impossible : " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title="⚙️ Paramètres" subtitle="Seuils et normes utilisés par l'app : état de forme, RPE prévu, charge de la journée, nutrition." />
      {tabs}
      {/* réservé au superadmin : l'athlète test n'existe que pour lui */}
      {isSuperAdmin && <TestAthleteCard />}

      <KpiGrid min={150}>
        <Kpi icon="🎛️" label="Réglages modifiés" value={nChanged} sub={`sur ${Object.keys(DEFAULTS).length}`} color={nChanged ? ACCENT : TEXT} />
        <Kpi icon="👥" label="Athlètes concernés" value={athletes.length} sub="reçoivent tes seuils" />
        <Kpi
          icon="🕒"
          label="Dernière mise à jour"
          value={meta?.updatedAt ? new Date(meta.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}
          sub={meta?.updatedAt ? new Date(meta.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "valeurs par défaut"}
        />
      </KpiGrid>

      <div style={{ ...CARD_STYLE, borderLeft: `3px solid ${ACCENT}`, fontSize: 13, color: "#c9c1b5", lineHeight: 1.5 }}>
        Page réservée au superadmin. Les valeurs par défaut viennent de la littérature (citée à côté) ou de choix prudents. Modifie-les seulement si elles ne collent pas à ton groupe : à
        l'enregistrement, elles s'appliquent à <b style={{ color: TEXT }}>toi, aux coachs et aux athlètes</b> (leurs propres calculs utilisent tes seuils).
      </div>

      {THRESHOLD_SECTIONS.map((s) => {
        const n = s.params.filter((p) => draft[p.k] !== "" && Number(draft[p.k]) !== p.def).length;
        return (
          <FoldCard key={s.id} id={s.id} fold={fold} title={s.title} subtitle={s.intro} right={n ? <span style={{ fontSize: 12, color: ACCENT, fontWeight: 800 }}>{n} modifié{n > 1 ? "s" : ""}</span> : null}>
            {s.params.map((p) => (
              <ParamRow key={p.k} p={p} value={draft[p.k]} onChange={(v) => setDraft((d) => ({ ...d, [p.k]: v }))} />
            ))}
          </FoldCard>
        );
      })}

      {errors.length > 0 && (
        <div style={{ ...CARD_STYLE, border: `1px solid ${RED}88`, color: RED, fontSize: 13 }}>
          {errors.map((e) => (
            <div key={e}>⚠️ {e}</div>
          ))}
        </div>
      )}

      <div style={{ position: "sticky", bottom: 12, display: "flex", gap: 8, flexWrap: "wrap", padding: 10, borderRadius: 14, background: "rgba(13,12,10,0.92)", border: `1px solid ${BORDER}`, backdropFilter: "blur(6px)", zIndex: 5 }}>
        <button type="button" className="pt-btn pt-btn--primary" disabled={busy || !dirty || errors.length > 0} onClick={save} style={{ flex: "1 1 200px" }}>
          {busy ? "Enregistrement…" : dirty ? "💾 Enregistrer et appliquer" : "✓ À jour"}
        </button>
        {dirty && (
          <button type="button" className="pt-btn" onClick={() => setDraft({ ...saved })}>
            Annuler
          </button>
        )}
        <button
          type="button"
          className="pt-btn"
          disabled={!nChanged}
          onClick={async () => {
            if (await appConfirm("Remettre tous les seuils aux valeurs par défaut ? (il faudra enregistrer)", { ok: "Réinitialiser", danger: false })) setDraft({ ...DEFAULTS });
          }}
        >
          ↺ Tout par défaut
        </button>
        <span style={{ fontSize: 12, color: dirty ? ACCENT : GREEN, alignSelf: "center" }}>{dirty ? "Modifications non enregistrées" : ""}</span>
      </div>
    </Page>
  );
}
