import React, { useEffect, useState, useCallback } from "react";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";

/* Le coach dit si le statut de forme affiché était juste ou faux. Les retours servent à vérifier
   si les signaux (et leurs seuils) collent à la réalité de CET athlète. Stockage :
   users/{athleteId}/fatigueFeedback/{date}  (couvert par la règle des sous-collections existante). */
export default function FatigueFeedback({ athleteId, date, level, label, reasons, coachId }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!athleteId) return;
    try {
      const snap = await getDocs(collection(db, "users", athleteId, "fatigueFeedback"));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setErr("");
    } catch (e) {
      setErr("Lecture impossible : " + (e.code || e.message));
    }
  }, [athleteId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = rows.find((r) => r.id === date);
  const flagged = rows.filter((r) => r.level && r.level !== "fit" && r.level !== "nodata");
  const right = flagged.filter((r) => r.verdict === "right").length;
  const wrong = flagged.filter((r) => r.verdict === "wrong").length;

  const save = async (verdict) => {
    setBusy(true);
    try {
      if (today && today.verdict === verdict) await deleteDoc(doc(db, "users", athleteId, "fatigueFeedback", date));
      else
        await setDoc(doc(db, "users", athleteId, "fatigueFeedback", date), {
          date,
          verdict,
          level: level || null,
          label: label || null,
          reasons: (reasons || []).slice(0, 8),
          coachId: coachId || null,
          updatedAt: new Date().toISOString(),
        });
      await load();
    } catch (e) {
      setErr("Enregistrement impossible : " + (e.code || e.message));
    } finally {
      setBusy(false);
    }
  };

  const btn = (v, text, col) => ({
    padding: "7px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: busy ? "default" : "pointer",
    background: today && today.verdict === v ? col : "transparent",
    color: today && today.verdict === v ? "#0d0c0a" : col,
    border: `1px solid ${col}`,
  });

  return (
    <div style={{ marginBottom: 14, background: "#0d0c0a", borderRadius: 10, padding: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 6 }}>🎯 Ce statut était-il juste ?</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => save("right")} style={btn("right", "", "#4fae7d")}>✅ Juste</button>
        <button disabled={busy} onClick={() => save("wrong")} style={btn("wrong", "", "#d9695a")}>❌ Faux</button>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        {flagged.length > 0
          ? `Bilan sur les alertes jugées : ${right} juste${right > 1 ? "s" : ""}, ${wrong} faux sur ${flagged.length}${flagged.length >= 6 ? ` (${Math.round((right / flagged.length) * 100)} % de justesse)` : " — attends au moins 6 retours avant de conclure"}.`
          : "Réponds quand tu sais (après discussion avec l'athlète, ou selon la suite) : après quelques semaines on verra si les seuils collent."}
      </div>
      {err && <div style={{ fontSize: 11, color: "#d9695a", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
