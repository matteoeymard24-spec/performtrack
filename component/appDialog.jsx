import React, { useEffect, useState } from "react";

/* Boîtes de dialogue internes à l'appli (remplacent window.confirm / alert).
   Chrome peut bloquer les boîtes natives d'une page (« Empêcher cette page de
   créer d'autres boîtes de dialogue ») : confirm() renvoie alors « non » sans
   rien afficher, et une suppression semble ne rien faire. Celles-ci ne se
   bloquent jamais. <DialogHost /> est monté une seule fois (App.jsx). */

let pushDialog = null;
let pushToast = null;

export function appConfirm(message, { ok = "Confirmer", cancel = "Annuler", danger = true } = {}) {
  if (!pushDialog) return Promise.resolve(window.confirm(String(message)));
  return new Promise((resolve) => pushDialog({ message: String(message), ok, cancel, danger, resolve }));
}

export function appAlert(message) {
  if (!pushToast) {
    window.alert(String(message));
    return;
  }
  pushToast(String(message));
}

export function DialogHost() {
  const [dlg, setDlg] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    pushDialog = (d) => setDlg(d);
    pushToast = (text) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { id, text }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    };
    return () => {
      pushDialog = null;
      pushToast = null;
    };
  }, []);

  const close = (v) => {
    if (dlg) dlg.resolve(v);
    setDlg(null);
  };

  return (
    <>
      {dlg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#151310", border: "2px solid #e0a13d", borderRadius: 12, padding: 20, maxWidth: 460, width: "100%", maxHeight: "85vh", overflowY: "auto", color: "#f3f0ea", boxSizing: "border-box" }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.5, marginBottom: 18 }}>{dlg.message}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => close(true)}
                style={{ flex: "1 1 140px", minHeight: 48, padding: 12, background: dlg.danger ? "#d9695a" : "#e0a13d", color: dlg.danger ? "white" : "#1a1306", border: "none", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer" }}
              >
                {dlg.ok}
              </button>
              <button
                onClick={() => close(false)}
                style={{ flex: "1 1 140px", minHeight: 48, padding: 12, background: "#2a2620", color: "#f3f0ea", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
              >
                {dlg.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, top: "calc(12px + env(safe-area-inset-top))", zIndex: 3100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 12px", pointerEvents: "none" }}>
          {toasts.map((t) => {
            const bad = /^❌|erreur|impossible/i.test(t.text);
            return (
              <div
                key={t.id}
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{ pointerEvents: "auto", maxWidth: 520, width: "100%", boxSizing: "border-box", background: bad ? "#3a1a16" : "#16281f", border: `1px solid ${bad ? "#d9695a" : "#4fae7d"}`, color: "#f3f0ea", borderRadius: 10, padding: "10px 14px", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 6px 20px rgba(0,0,0,0.5)", cursor: "pointer" }}
              >
                {t.text}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
