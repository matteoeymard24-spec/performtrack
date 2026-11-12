import React, { useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

/* =====================================================================
   sessionChat.jsx — 💬 Messagerie de séance (athlète ↔ coach).

   Où c'est rangé : dans la séance elle-même, sur la ligne de progression de l'athlète
     workout/{id}.userProgress.{uid}.msgs = [{ from: "athlete" | "coach", by, text, at }]
   → aucune collection en plus, aucune lecture en plus (les séances sont déjà chargées partout),
     et les règles Firestore actuelles suffisent :
       • l'athlète n'écrit que SA ligne de userProgress (règle existante) ;
       • le coach écrit dans les séances qu'il a créées (règle existante). Une séance créée par
         l'athlète lui-même (« Moi ») : le coach lit, mais ne peut pas répondre dedans.
   Les notes d'exercices (champ « Notes » du feedback de chaque exercice / bloc) sont affichées avec.
   L'athlète écrit une fois la séance démarrée ou terminée (pas de ligne de progression avant).
   « Lu / non lu » et « Masquer » : mémorisés sur l'appareil (localStorage).
   Les messages sont supprimés au bout de 14 jours (purgeOldMsgs, plus bas).
   ===================================================================== */

const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";
const AMBER = "#e0a13d";
const GREEN = "#4fae7d";
const BLUE = "#5b9bd5";
export const CHAT_MAX = 1000;

export const CHAT_DAYS = 14;
export const chatCutoff = (days = CHAT_DAYS) => new Date(Date.now() - days * 86400000).toISOString();
const fresh = (m, cut) => !!m?.at && m.at >= cut;

const prog = (w, uid) => w?.userProgress?.[uid] || null;
export const chatOf = (w, uid) => (Array.isArray(prog(w, uid)?.msgs) ? prog(w, uid).msgs : []);
export const canAthleteWrite = (w, uid) => {
  const p = prog(w, uid);
  return !!(p && (p.startedAt || p.completedAt));
};
/* moment de la séance pour l'athlète (fin, début, sinon date prévue) */
export const sessionAt = (w, uid) => {
  const p = prog(w, uid) || {};
  return p.completedAt || p.startedAt || (w?.date ? `${w.date}T12:00:00` : "");
};

/* Notes d'exercices laissées dans les feedbacks : [{ key, label, text }] dans l'ordre de la séance */
export function exerciseNotesOf(w, uid) {
  const fb = prog(w, uid)?.feedback || {};
  const out = [];
  Object.entries(fb).forEach(([k, v]) => {
    const text = String(v?.notes || "").trim();
    if (!text) return;
    let label = "Exercice";
    let order = 9999;
    const mb = /^block-(\d+)$/.exec(k);
    const me = /^(\d+)-(\d+)$/.exec(k);
    if (mb) {
      const b = +mb[1];
      label = w?.blocks?.[b]?.name || w?.blocks?.[b]?.title || `Bloc ${b + 1}`;
      order = b * 100;
    } else if (me) {
      const b = +me[1];
      const e = +me[2];
      label = w?.blocks?.[b]?.exercises?.[e]?.name || `Exercice ${e + 1}`;
      order = b * 100 + e + 1;
    }
    out.push({ key: k, label, text, order });
  });
  return out.sort((a, b) => a.order - b.order);
}

/* Éléments écrits par l'athlète avec leur date (pour « nouveau ») */
export function athleteItemsOf(w, uid) {
  const cut = chatCutoff();
  const items = chatOf(w, uid)
    .filter((m) => fresh(m, cut))
    .filter((m) => m.from !== "coach")
    .map((m) => m.at);
  const at = sessionAt(w, uid);
  if (at >= cut && exerciseNotesOf(w, uid).length) items.push(at);
  return items.filter(Boolean);
}
export const coachItemsOf = (w, uid) => chatOf(w, uid).filter((m) => m.from === "coach").map((m) => m.at).filter(Boolean);

/* Lu / non lu, sur l'appareil */
const seenKey = (viewer, other) => `pt_chat_seen_${viewer}_${other}`;
export function chatSeen(viewer, other) {
  try {
    return localStorage.getItem(seenKey(viewer, other)) || "";
  } catch (e) {
    return "";
  }
}
export function markChatSeen(viewer, other, iso = new Date().toISOString()) {
  try {
    localStorage.setItem(seenKey(viewer, other), iso);
  } catch (e) {
    /* ignore */
  }
}

/* Envoi : ajoute un message à la ligne de l'athlète (arrayUnion = sans écraser le reste) */
export async function sendSessionMsg({ db, workoutId, uid, from, by, text }) {
  const t = String(text || "").trim().slice(0, CHAT_MAX);
  if (!t) return null;
  const msg = { from, by, text: t, at: new Date().toISOString() };
  await updateDoc(doc(db, "workout", workoutId), { [`userProgress.${uid}.msgs`]: arrayUnion(msg) });
  return msg;
}
/* Copie locale de la séance avec le message ajouté (affichage immédiat sans relire la base) */
export const withMsg = (w, uid, msg) =>
  w && msg
    ? { ...w, userProgress: { ...(w.userProgress || {}), [uid]: { ...(w.userProgress?.[uid] || {}), msgs: [...chatOf(w, uid), msg] } } }
    : w;

const fmtAt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/* Fil : notes d'exercices + messages, la personne qui regarde à droite */
export function ChatThread({ msgs = [], notes = [], viewer = "athlete", names = {} }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {notes.length > 0 && (
        <div style={{ padding: "8px 10px", borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>
            📝 Notes d'exercices {viewer === "athlete" ? "(tes feedbacks)" : ""}
          </div>
          {notes.map((n) => (
            <div key={n.key} style={{ fontSize: 13, color: TEXT, lineHeight: 1.45, marginTop: 3 }}>
              <span style={{ color: AMBER, fontWeight: 700 }}>{n.label} :</span> {n.text}
            </div>
          ))}
        </div>
      )}
      {msgs.map((m, i) => {
        const mine = (m.from === "coach") === (viewer === "coach");
        const col = m.from === "coach" ? BLUE : GREEN;
        return (
          <div key={`${m.at}_${i}`} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", padding: "8px 11px", borderRadius: 12, background: `${col}1c`, border: `1px solid ${col}55`, color: TEXT }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col, marginBottom: 2 }}>
                {m.from === "coach" ? names.coach || "Coach" : names.athlete || "Athlète"} · <span style={{ color: MUTED, fontWeight: 600 }}>{fmtAt(m.at)}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Zone de saisie + bouton Envoyer */
export function ChatInput({ onSend, placeholder = "Écris un message…", disabledReason = "" }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (disabledReason) return <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>{disabledReason}</div>;
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onSend(text);
      setText("");
    } catch (e) {
      setErr("Message non envoyé : " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={text}
        maxLength={CHAT_MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        style={{ width: "100%", boxSizing: "border-box", background: "#1a1815", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 10px", fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button type="button" className="pt-btn pt-btn--accent" disabled={busy || !text.trim()} onClick={send}>
          {busy ? "Envoi…" : "Envoyer"}
        </button>
        {err && <span style={{ fontSize: 12.5, color: "#d9695a" }}>{err}</span>}
      </div>
    </div>
  );
}

/* ===== Durée de vie : les messages sont SUPPRIMÉS au bout de 14 jours =====
   Pas de Cloud Function (payante) : le ménage est fait par l'appli à l'ouverture.
   • l'athlète nettoie ses propres séances (Dashboard) ;
   • le coach nettoie les séances qu'il a créées (fiche athlète).
   Les notes d'exercices restent dans le feedback de la séance (historique d'entraînement),
   mais ne sont plus affichées dans la messagerie après 14 jours. */
export async function purgeOldMsgs({ db, sessions = [], uid, canWrite = () => true, days = CHAT_DAYS }) {
  const cut = chatCutoff(days);
  const changed = [];
  for (const w of sessions) {
    const all = chatOf(w, uid);
    if (!all.length || !canWrite(w)) continue;
    const keep = all.filter((m) => fresh(m, cut));
    if (keep.length === all.length) continue;
    try {
      await updateDoc(doc(db, "workout", w.id), { [`userProgress.${uid}.msgs`]: keep });
      changed.push({ id: w.id, msgs: keep });
    } catch (e) {
      console.warn("[sessionChat] purge", w.id, e?.message || e);
    }
  }
  return changed;
}
/* Copie locale des séances avec les messages purgés */
export const applyPurge = (sessions, uid, changed) => {
  if (!changed?.length) return sessions;
  const by = Object.fromEntries(changed.map((c) => [c.id, c.msgs]));
  return sessions.map((w) =>
    by[w.id] ? { ...w, userProgress: { ...(w.userProgress || {}), [uid]: { ...(w.userProgress?.[uid] || {}), msgs: by[w.id] } } } : w
  );
};
/* Messages encore valables (affichage), même si le ménage n'a pas encore pu être fait */
export const liveMsgs = (w, uid, days = CHAT_DAYS) => {
  const cut = chatCutoff(days);
  return chatOf(w, uid).filter((m) => fresh(m, cut));
};

/* Masquer / afficher (mémorisé sur l'appareil) */
export function useChatHidden(key) {
  const k = `pt_chat_hidden_${key}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(k) === "1";
    } catch (e) {
      return false;
    }
  });
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(k, h ? "0" : "1");
      } catch (e) {
        /* ignore */
      }
      return !h;
    });
  return [hidden, toggle];
}

/* semaine (lundi) d'une date ISO → libellé */
const mondayOf = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const weekLabel = (mon) => {
  const cur = mondayOf(new Date().toISOString());
  const diff = Math.round((new Date(`${cur}T12:00:00`) - new Date(`${mon}T12:00:00`)) / (7 * 86400000));
  if (diff <= 0) return "Cette semaine";
  if (diff === 1) return "Semaine dernière";
  return `Semaine du ${new Date(`${mon}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
};
const fmtDay = (w) => (w?.date ? new Date(`${w.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "");

/* ===== Vue coach : une ligne repliable par séance, rangées par semaine ===== */
export function CoachChatCard({ sessions = [], uid, coachUid, canReply, onSend, athleteName = "Athlète", seenIso = "", days = CHAT_DAYS }) {
  const [hidden, toggleHidden] = useChatHidden(`coach_${coachUid || ""}`);
  const [filter, setFilter] = useState("all"); // all | new | todo
  const [open, setOpen] = useState({});
  const cut = chatCutoff(days);
  const items = sessions
    .map((w) => {
      const msgs = liveMsgs(w, uid, days);
      const at = sessionAt(w, uid);
      const notes = at >= cut ? exerciseNotesOf(w, uid) : [];
      if (!msgs.length && !notes.length) return null;
      const athT = [...msgs.filter((m) => m.from !== "coach").map((m) => m.at), ...(notes.length ? [at] : [])].filter(Boolean);
      const coachT = msgs.filter((m) => m.from === "coach").map((m) => m.at);
      const lastAth = [...athT].sort().pop() || "";
      const lastCoach = [...coachT].sort().pop() || "";
      return {
        w,
        msgs,
        notes,
        at,
        last: [lastAth, lastCoach].sort().pop() || at,
        isNew: athT.some((t) => !seenIso || t > seenIso),
        todo: !!lastAth && lastAth > lastCoach && canReply(w),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const nNew = items.filter((x) => x.isNew).length;
  const nTodo = items.filter((x) => x.todo).length;
  const shown = items.filter((x) => (filter === "new" ? x.isNew : filter === "todo" ? x.todo : true));
  const groups = [];
  shown.forEach((x) => {
    const k = mondayOf(x.at);
    let g = groups.find((y) => y.k === k);
    if (!g) groups.push((g = { k, list: [] }));
    g.list.push(x);
  });
  const isOpen = (x) => (open[x.w.id] != null ? open[x.w.id] : x.isNew);
  const chip = (id, label) => (
    <button
      key={id}
      type="button"
      className={`pt-btn pt-btn--sm${filter === id ? " pt-btn--accent" : ""}`}
      onClick={() => setFilter(id)}
    >
      {label}
    </button>
  );
  return (
    <div style={{ background: "#151310", padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${nNew ? AMBER + "88" : BORDER}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
          💬 Messagerie de séance
          {nNew > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: "#1a1306", background: AMBER, borderRadius: 999, padding: "2px 8px" }}>
              {nNew} nouvelle{nNew > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        <button type="button" className="pt-btn pt-btn--sm" onClick={toggleHidden}>
          {hidden ? `Afficher${items.length ? ` (${items.length})` : ""}` : "Masquer"}
        </button>
      </div>
      {!hidden && (
        <>
          <div style={{ fontSize: 11.5, color: MUTED, margin: "6px 0 10px" }}>
            Une ligne par séance · messages supprimés automatiquement au bout de {days} jours
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
              Aucune remarque sur les {days} derniers jours. L'athlète écrit depuis sa séance (encadré « 💬 Remarques pour ton coach ») et dans le
              champ « Notes » de chaque exercice.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {chip("all", `Toutes (${items.length})`)}
                {chip("new", `Nouvelles (${nNew})`)}
                {chip("todo", `Sans réponse (${nTodo})`)}
              </div>
              {groups.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Rien dans ce filtre.</div>}
              {groups.map((g) => (
                <div key={g.k} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED, margin: "4px 0 6px" }}>
                    {weekLabel(g.k)}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {g.list.map((x) => {
                      const { w, msgs, notes } = x;
                      const p = prog(w, uid) || {};
                      const o = isOpen(x);
                      const nAth = msgs.filter((m) => m.from !== "coach").length;
                      return (
                        <div key={w.id} style={{ borderRadius: 10, background: "#0d0c0a", border: `1px solid ${x.isNew ? AMBER + "77" : BORDER}` }}>
                          <button
                            type="button"
                            onClick={() => setOpen((s) => ({ ...s, [w.id]: !o }))}
                            aria-expanded={o}
                            style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", width: "100%", boxSizing: "border-box", padding: "10px 12px" }}
                          >
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{w.title || "Séance"}</span>
                              <span style={{ fontSize: 12, color: MUTED }}>
                                {" "}
                                · {fmtDay(w)}
                                {p.completedAt ? " · faite" : p.startedAt ? " · en cours" : ""}
                                {p.sessionRpe != null ? ` · RPE ${p.sessionRpe}` : ""}
                              </span>
                            </span>
                            <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, fontWeight: 700 }}>
                              {x.isNew && <span style={{ color: AMBER }}>● nouveau</span>}
                              {x.todo && <span style={{ color: BLUE }}>à répondre</span>}
                              <span style={{ color: MUTED }}>
                                {nAth ? `💬 ${nAth}` : ""}
                                {nAth && notes.length ? " · " : ""}
                                {notes.length ? `📝 ${notes.length}` : ""}
                              </span>
                              <span style={{ color: MUTED, fontSize: 13 }}>{o ? "▴" : "▾"}</span>
                            </span>
                          </button>
                          {o && (
                            <div style={{ padding: "0 12px 12px" }}>
                              <ChatThread msgs={msgs} notes={notes} viewer="coach" names={{ athlete: athleteName, coach: "Toi" }} />
                              <ChatInput
                                placeholder={`Répondre à ${athleteName}…`}
                                disabledReason={canReply(w) ? "" : "Séance créée par l'athlète lui-même : tu peux lire, mais pas répondre dedans."}
                                onSend={(t) => onSend(w, t)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ===== Vue athlète (page Séance) : encadré repliable ===== */
export function AthleteSessionPanel({ w, uid, onSend }) {
  const [hidden, toggleHidden] = useChatHidden(`ath_${uid || ""}`);
  const msgs = liveMsgs(w, uid);
  const notes = exerciseNotesOf(w, uid);
  return (
    <div style={{ margin: "0 0 14px", padding: 12, borderRadius: 12, background: "#151310", border: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: TEXT }}>
          💬 Remarques pour ton coach
          {hidden && msgs.length > 0 && <span style={{ marginLeft: 6, fontSize: 12, color: MUTED, fontWeight: 600 }}>({msgs.length})</span>}
        </span>
        <button type="button" className="pt-btn pt-btn--sm" onClick={toggleHidden}>
          {hidden ? "Afficher" : "Masquer"}
        </button>
      </div>
      {!hidden && (
        <>
          <div style={{ fontSize: 12, color: MUTED, margin: "4px 0 8px", lineHeight: 1.45 }}>
            Ressenti, douleur, exercice trop dur ou trop facile… Ton coach le voit dans ta fiche. Pour un exercice précis, utilise aussi le champ
            « Notes » de son feedback. Messages effacés au bout de {CHAT_DAYS} jours.
          </div>
          <ChatThread msgs={msgs} notes={notes} viewer="athlete" names={{ athlete: "Toi", coach: "Coach" }} />
          <ChatInput placeholder="Ta remarque sur la séance…" onSend={onSend} />
        </>
      )}
    </div>
  );
}

/* ===== Vue athlète (Dashboard) : réponses du coach pas encore lues ===== */
export function AthleteRepliesCard({ sessions = [], uid, seenIso = "", onSeen, onOpen }) {
  const list = sessions
    .map((w) => ({ w, replies: liveMsgs(w, uid).filter((m) => m.from === "coach" && (!seenIso || m.at > seenIso)) }))
    .filter((x) => x.replies.length)
    .sort((a, b) => (b.replies[b.replies.length - 1].at || "").localeCompare(a.replies[a.replies.length - 1].at || ""));
  if (!list.length) return null;
  return (
    <div style={{ background: "#151310", padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${BLUE}88` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>💬 Ton coach t'a répondu</h3>
        <button type="button" className="pt-btn pt-btn--sm" onClick={onSeen}>
          Marquer comme lu
        </button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {list.slice(0, 4).map(({ w, replies }) => (
          <div key={w.id} style={{ padding: 10, borderRadius: 10, background: "#0d0c0a", border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 6 }}>
              {w.title || "Séance"} <span style={{ color: MUTED, fontWeight: 600 }}>· {w.date ? new Date(`${w.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span>
            </div>
            <ChatThread msgs={replies} viewer="athlete" names={{ coach: "Coach" }} />
            {onOpen && (
              <button type="button" className="pt-btn pt-btn--sm" style={{ marginTop: 8 }} onClick={() => onOpen(w)}>
                Ouvrir la séance pour répondre →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
