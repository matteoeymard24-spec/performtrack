import React, { useState } from "react";
import { FoldBtn, useFold } from "./ui";

/* Guide de notation FMS : critères écrits pour 3 / 2 / 1 / 0 par mouvement,
   avec un emplacement photo à côté de chaque note. Les critères sont une
   reformulation du protocole FMS standard (les photos du manuel officiel sont
   protégées : le coach ajoute SES propres photos par lien). */

const ACCENT = "#e0a13d";
const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const SCORE_COLOR = { 3: "#4fae7d", 2: "#d9a441", 1: "#d9695a", 0: "#8a8378" };
const PAIN = "Douleur pendant le mouvement ou au test d'exclusion : on note 0 et on oriente vers un professionnel de santé.";

export const FMS_CRITERIA = {
  deep_squat: {
    tip: "Bâton au-dessus de la tête, mains écartées, pieds à largeur d'épaules. Descendre le plus bas possible, 3 essais.",
    scores: {
      3: "Torse parallèle aux tibias (ou plus vertical), fémurs sous l'horizontale, genoux dans l'axe des pieds, bâton aligné au-dessus des pieds.",
      2: "Mêmes critères, mais seulement avec les talons surélevés (planche sous les talons).",
      1: "Même avec les talons surélevés : torse et tibias non parallèles, fémurs au-dessus de l'horizontale, genoux qui rentrent, ou flexion lombaire visible.",
    },
  },
  hurdle: {
    tip: "Haie à hauteur de tubérosité tibiale, bâton sur les épaules. Passer la haie en levant la jambe, noter chaque côté. La note est celle de la jambe qui passe.",
    scores: {
      3: "Hanches, genoux et chevilles restent dans le même plan, peu ou pas de mouvement lombaire, bâton et haie restent parallèles.",
      2: "Alignement perdu, mouvement lombaire visible, ou bâton et haie qui ne restent pas parallèles.",
      1: "Contact entre le pied et la haie, ou perte d'équilibre.",
    },
  },
  lunge: {
    tip: "Bâton dans le dos (contact tête, haut du dos, sacrum), pied avant sur la ligne. Descendre le genou arrière jusqu'à la planche. Noter chaque côté (le pied avant donne le côté).",
    scores: {
      3: "Le bâton reste en contact, pas de mouvement du torse, pieds dans le plan sagittal, le genou arrière touche la planche derrière le talon avant.",
      2: "Contact du bâton perdu, mouvement du torse, pieds qui sortent de la ligne, ou le genou arrière ne touche pas derrière le talon.",
      1: "Perte d'équilibre, ou impossible de réaliser le mouvement.",
    },
  },
  shoulder: {
    tip: "Poing fermé, une main par-dessus l'épaule, l'autre dans le dos, en un seul mouvement. Mesurer la distance entre les deux poings en longueur de main. Noter chaque côté.",
    scores: {
      3: "Les poings sont à moins d'une longueur de main l'un de l'autre.",
      2: "Les poings sont entre une et une longueur et demie de main.",
      1: "Les poings sont à plus d'une longueur et demie de main.",
    },
  },
  aslr: {
    tip: "Allongé sur le dos, jambe testée levée tendue, orteils vers le haut, l'autre jambe reste à plat et neutre. Repère : la malléole par rapport à la cuisse de l'autre jambe. Noter chaque côté.",
    scores: {
      3: "La malléole de la jambe levée passe la mi-cuisse et atteint la ligne de l'épine iliaque, l'autre jambe reste neutre.",
      2: "La malléole se situe entre la mi-cuisse et la ligne articulaire du genou.",
      1: "La malléole reste en dessous de la ligne articulaire du genou.",
    },
  },
  pushup: {
    tip: "Allongé face au sol, mains au niveau du front (le plus facile à lire pour la plupart des hommes) ou du menton selon le protocole. Pousser en gardant le corps d'un bloc, sans cambrure.",
    scores: {
      3: "Une pompe réalisée en bloc, sans ondulation lombaire, mains placées au niveau du front.",
      2: "Une pompe en bloc avec les mains placées plus bas (au niveau du menton).",
      1: "Impossible de réaliser une pompe en bloc, même avec les mains au niveau du menton.",
    },
  },
  rotary: {
    tip: "À quatre pattes sur la planche. Tendre le bras et la jambe du même côté puis ramener coude et genou qui se touchent. Si impossible, version en diagonale. Noter chaque côté.",
    scores: {
      3: "Une répétition du même côté (bras et jambe homolatéraux) avec le dos parallèle à la planche, coude et genou qui se touchent dans l'axe.",
      2: "Une répétition en diagonale (bras et jambe opposés) avec le dos parallèle à la planche.",
      1: "Impossible de réaliser la répétition en diagonale.",
    },
  },
};

function PhotoSlot({ url, canEdit, onSave, label }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(url || "");
  const box = {
    width: 96,
    height: 96,
    borderRadius: 8,
    background: "#0d0c0a",
    border: "1px dashed #3a342a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ ...box, border: "1px solid #2a2620" }}>
          <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </a>
      ) : (
        <div style={box}>{canEdit ? "📷 photo" : "—"}</div>
      )}
      {canEdit && (
        <button
          onClick={() => { setVal(url || ""); setEditing(!editing); }}
          style={{ background: "transparent", border: "none", color: ACCENT, fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          {editing ? "Fermer" : url ? "Changer" : "Ajouter"}
        </button>
      )}
      {editing && (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Lien de la photo"
            style={{ width: 150, padding: 6, borderRadius: 6, border: "1px solid #2a2620", background: "#0d0c0a", color: TEXT, fontSize: 12 }}
          />
          <button
            onClick={async () => { await onSave(val.trim()); setEditing(false); }}
            style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: ACCENT, color: "#1a1306", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

export default function FmsGuide({ measures, media, canEdit, onSavePhotos }) {
  const fold = useFold("fms_guide", Object.keys(FMS_CRITERIA).concat(["__all"]));
  const photos = (media && media.photos) || {};
  const setPhoto = (key, url) => {
    const next = { ...photos };
    if (url) next[key] = url;
    else delete next[key];
    return onSavePhotos(next);
  };
  const allOpen = fold.isOpen("__all");
  return (
    <div style={{ marginBottom: 12, background: "#0d0c0a", borderRadius: 10, padding: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
          📖 Comment noter chaque mouvement{" "}
          <span style={{ color: MUTED, fontWeight: 400 }}>(3 / 2 / 1 / 0)</span>
        </div>
        <FoldBtn open={allOpen} onClick={() => fold.toggle("__all")} />
      </div>
      {allOpen && (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {measures.map((m) => {
            const c = FMS_CRITERIA[m.key];
            if (!c) return null;
            const open = fold.isOpen(m.key);
            return (
              <div key={m.key} style={{ background: "#151310", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FoldBtn open={open} onClick={() => fold.toggle(m.key)} />
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                    {m.label}
                    {m.sided && <span style={{ color: MUTED, fontWeight: 400, fontSize: 12 }}> · noter G et D</span>}
                  </div>
                </div>
                {open && (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{c.tip}</div>
                    {[3, 2, 1].map((n) => (
                      <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderLeft: `4px solid ${SCORE_COLOR[n]}`, paddingLeft: 10 }}>
                        <PhotoSlot
                          url={photos[`${m.key}_${n}`]}
                          canEdit={canEdit}
                          label={`${m.label} — note ${n}`}
                          onSave={(u) => setPhoto(`${m.key}_${n}`, u)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: SCORE_COLOR[n], marginBottom: 2 }}>Note {n}</div>
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.scores[n]}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", borderLeft: `4px solid ${SCORE_COLOR[0]}`, paddingLeft: 10 }}>
                      <div style={{ fontWeight: 800, color: SCORE_COLOR[0], minWidth: 96 }}>Note 0</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{PAIN}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: MUTED }}>
            Critères reformulés d'après le protocole FMS standard. Pour des photos de référence, ajoute les tiennes (lien) : celles du manuel officiel sont protégées.
          </div>
        </div>
      )}
    </div>
  );
}
