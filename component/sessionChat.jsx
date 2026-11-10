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
   « Lu / non lu » : mémorisé sur l'appareil (localStorage), par coach et par athlète.
   ===================================================================== */

const TEXT = "#f3f0ea";
const MUTED = "#a8a199";
const BORDER = "#2a2620";
const AMBER = "#e0a13d";
const GREEN = "#4fae7d";
const BLUE = "#5b9bd5";
export const CHAT_MAX = 1000;

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
  const items = chatOf(w, uid)
    .filter((m) => m.from !== "coach")
    .map((m) => m.at);
  if (exerciseNotesOf(w, uid).length) items.push(sessionAt(w, uid));
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

/* ===== Vue coach : toutes les séances de l'athlète qui ont des remarques ===== */
export function CoachChatCard({ sessions = [], uid, coachUid, canReply, onSend, athleteName = "Athlète", seenIso = "", days = 60 }) {
  const [showAll, setShowAll] = useState(false);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const list = sessions
    .filter((w) => (w.date || "") >= since || sessionAt(w, uid).slice(0, 10) >= since)
    .map((w) => ({ w, msgs: chatOf(w, uid), notes: exerciseNotesOf(w, uid), at: sessionAt(w, uid) }))
    .filter((x) => x.msgs.length || x.notes.length)
    .map((x) => {
      const last = [...athleteItemsOf(x.w, uid), ...coachItemsOf(x.w, uid)].sort().pop() || x.at;
      const fresh = athleteItemsOf(x.w, uid).some((t) => !seenIso || t > seenIso);
      return { ...x, last, fresh };
    })
    .sort((a, b) => (b.last || "").localeCompare(a.last || ""));
  const nNew = list.filter((x) => x.fresh).length;
  const shown = showAll ? list : list.slice(0, 5);
  return (
    <div style={{ background: "#151310", padding: 18, borderRadius: 12, marginBottom: 16, border: `1px solid ${nNew ? AMBER + "88" : BORDER}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
          💬 Messagerie de séance
          {nNew > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: "#1a1306", background: AMBER, borderRadius: 999, padding: "2px 8px" }}>
              {nNew} nouvelle{nNew > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        <span style={{ fontSize: 11.5, color: MUTED }}>Remarques et notes d'exercices des {days} derniers jours</span>
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          Aucune remarque pour l'instant. L'athlète écrit depuis sa séance (encadré « 💬 Remarques pour ton coach ») et dans le champ « Notes » de
          chaque exercice.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map(({ w, msgs, notes, fresh }) => {
            const reply = canReply(w);
            return (
              <div key={w.id} style={{ padding: 12, borderRadius: 10, background: "#0d0c0a", border: `1px solid ${fresh ? AMBER + "77" : BORDER}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>
                    {w.title || "Séance"}
                    {fresh && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: AMBER }}>● nouveau</span>}
                  </span>
                  <span style={{ fontSize: 12, color: MUTED }}>
                    {w.date ? new Date(`${w.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : ""}
                    {prog(w, uid)?.completedAt ? " · faite" : prog(w, uid)?.startedAt ? " · en cours" : ""}
                    {prog(w, uid)?.sessionRpe != null ? ` · RPE ${prog(w, uid).sessionRpe}` : ""}
                  </span>
                </div>
                <ChatThread msgs={msgs} notes={notes} viewer="coach" names={{ athlete: athleteName, coach: "Toi" }} />
                <ChatInput
                  placeholder={`Répondre à ${athleteName}…`}
                  disabledReason={reply ? "" : "Séance créée par l'athlète lui-même : tu peux lire, mais la réponse se fait dans une séance que tu as créée."}
                  onSend={(t) => onSend(w, t)}
                />
              </div>
            );
          })}
          {list.length > 5 && (
            <button type="button" className="pt-btn pt-btn--sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Voir moins" : `Voir tout (${list.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Vue athlète (Dashboard) : réponses du coach pas encore lues ===== */
export function AthleteRepliesCard({ sessions = [], uid, seenIso = "", onSeen, onOpen }) {
  const list = sessions
    .map((w) => ({ w, replies: chatOf(w, uid).filter((m) => m.from === "coach" && (!seenIso || m.at > seenIso)) }))
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
