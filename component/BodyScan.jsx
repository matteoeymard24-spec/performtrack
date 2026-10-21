import React, { useEffect, useId, useMemo, useState } from "react";
import { ANAT, VB } from "./bodyAnatomy";

const ACCENT = "#e0a13d";
const SUCCESS = "#4fae7d";
const WARNING = "#d9a441";
const DANGER = "#d9695a";
const PAIN_MAX = "#e5322d";
const SURFACE = "#151310";
const SURFACE_2 = "#1a1815";
const SURFACE_3 = "#221f1a";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_STRONG = "rgba(255,255,255,0.16)";
const TEXT = "#f3f0ea";
const TEXT_MUTED = "#a8a199";

// Teintes musculaires (palette chaude de la charte) et os (ivoire)
const MUSCLE_TONES = ["#a39387", "#94857a", "#ac9c90", "#9a8a7f"];
const MUSCLE_BASE = "#54463f";
const BONE = "#d8cfbd";
const BONE_LINE = "#6d6352";

/* Types de douleur : stockés à part (painTypes : { idZone: clé }) pour ne pas
   toucher aux intensités déjà enregistrées. */
export const PAIN_TYPES = [
  { key: "courbature", emoji: "😖", label: "Courbature", hint: "sourde, après l'effort" },
  { key: "brulure", emoji: "🔥", label: "Brûlure musculaire", hint: "chaleur, acidité" },
  { key: "nerveuse", emoji: "⚡", label: "Électrique / nerveuse", hint: "décharge, fourmillement" },
  { key: "aigue", emoji: "🗡️", label: "Aiguë / claquage", hint: "coup de poignard, déchirure" },
  { key: "contracture", emoji: "🪢", label: "Contracture / crampe", hint: "tension, raideur" },
  { key: "articulaire", emoji: "🦴", label: "Articulaire / osseuse", hint: "blocage, douleur profonde" },
];
export const PAIN_SENSATIONS = [
  { key: "chaud", emoji: "🌡️", label: "Chaud" },
  { key: "froid", emoji: "🧊", label: "Froid" },
  { key: "piqure", emoji: "📌", label: "Piqûre" },
  { key: "serrement", emoji: "🤏", label: "Serrement" },
  { key: "pulsatile", emoji: "💓", label: "Battements" },
  { key: "lancinante", emoji: "💢", label: "Élancements" },
  { key: "fourmillement", emoji: "🐜", label: "Fourmillements" },
  { key: "engourdissement", emoji: "🫥", label: "Engourdissement" },
  { key: "lourdeur", emoji: "🪨", label: "Lourdeur" },
  { key: "raideur", emoji: "🧱", label: "Raideur" },
  { key: "sourde", emoji: "〰️", label: "Sourde, diffuse" },
  { key: "vive", emoji: "❗", label: "Vive, localisée" },
];
const SENS_BY_KEY = Object.fromEntries(PAIN_SENSATIONS.map((t) => [t.key, t]));
const PAIN_TYPE_BY_KEY = Object.fromEntries(PAIN_TYPES.map((t) => [t.key, t]));

// Interpole entre vert (0) -> ambre (5) -> rouge (10)
function painColor(value = 0) {
  const v = Math.max(0, Math.min(10, value));
  const from = (a, b, t) => Math.round(a + (b - a) * t);
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = hexToRgb(SUCCESS);
  const [r2, g2, b2] = hexToRgb(WARNING);
  const [r3, g3, b3] = hexToRgb(PAIN_MAX);
  let r, g, b;
  if (v <= 5) {
    const t = v / 5;
    r = from(r1, r2, t);
    g = from(g1, g2, t);
    b = from(b1, b2, t);
  } else {
    const t = (v - 5) / 5;
    r = from(r2, r3, t);
    g = from(g2, g3, t);
    b = from(b2, b3, t);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/* ---- Construction des zones cliquables à partir des données anatomiques ----
   Identifiants : on garde ceux de l'ancienne version pour les muscles (epa_g,
   quadri_d, mollet_g_back…) afin que les douleurs déjà saisies restent
   lisibles ; les os / articulations ont un préfixe "os_". */
const SIDE = { g: "G", d: "D" };

function partId(part, side, mode, view) {
  const back = view === "back" && !part.noBack;
  if (mode === "skel") {
    return part.side === "lr" ? `os_${part.id}_${side}` : `os_${part.id}`;
  }
  const suffix = back ? "_back" : "";
  if (part.side === "lr" && !part.one) return `${part.id}_${side}${suffix}`;
  return `${part.id}${suffix}`;
}

function buildZones() {
  const zones = [];
  for (const mode of ["muscle", "skel"]) {
    for (const view of ["front", "back"]) {
      const A = ANAT[mode][view];
      A.parts.forEach((part, index) => {
        if (part.hide || part.deco) return;
        const sides = part.side === "lr" ? ["g", "d"] : ["c"];
        sides.forEach((side) => {
          const id = partId(part, side, mode, view);
          const sideLabel = part.side === "lr" && !part.one ? ` ${SIDE[side]}` : "";
          zones.push({
            id,
            mode,
            view,
            side,
            part,
            index,
            label: `${part.label}${sideLabel}`,
          });
        });
      });
    }
  }
  return zones;
}

const ALL_ZONES = buildZones();
// Anciens identifiants regroupés (tronc, dos) : affichés tant qu'une zone
// fine n'a pas de valeur propre.
const LEGACY_LABELS = { tronc: "Tronc", dos: "Dos" };
const LEGACY_VIEW = { tronc: "front", dos: "back" };

function zoneValue(painMap, zone) {
  const own = painMap[zone.id];
  if (own !== undefined && own !== null) return own;
  const legacy = zone.part.legacy;
  if (legacy) {
    let best;
    for (const l of legacy) {
      if (painMap[l] !== undefined && painMap[l] !== null) best = Math.max(best ?? 0, painMap[l]);
    }
    if (best !== undefined) return best;
  }
  return 0;
}

export default function BodyScan({ painMap = {}, setPainMap, painTypes = {}, setPainTypes, painSens = {}, setPainSens }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Ouvre directement le mode (muscle / squelette) où il y a déjà une douleur.
  const [mode, setMode] = useState(() => {
    const hasSkel = Object.keys(painMap).some((k) => k.startsWith("os_") && painMap[k] > 0);
    const hasMuscle = Object.keys(painMap).some((k) => !k.startsWith("os_") && painMap[k] > 0);
    return hasSkel && !hasMuscle ? "skel" : "muscle";
  });
  const [view, setView] = useState("front");
  const [selectedZone, setSelectedZone] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const [intensity, setIntensity] = useState(0);
  const [ptype, setPtype] = useState("");
  const [psens, setPsens] = useState([]);

  const zoneById = useMemo(() => {
    const m = {};
    ALL_ZONES.forEach((z) => {
      m[`${z.id}`] = m[`${z.id}`] || z;
    });
    return m;
  }, []);

  useEffect(() => {
    if (selectedZone) {
      const z = zoneById[selectedZone];
      const own = painMap[selectedZone];
      setIntensity(own ?? (z ? zoneValue(painMap, z) : 0));
      setPtype(painTypes[selectedZone] || "");
      setPsens(painSens[selectedZone] || []);
    }
  }, [selectedZone, painMap, painTypes, painSens, zoneById]);

  function deletePain() {
    if (!selectedZone) return;
    const z = zoneById[selectedZone];
    const legacyActive = z && z.part.legacy && z.part.legacy.some((l) => painMap[l] > 0);
    const next = { ...painMap };
    // Une ancienne saisie groupée (tronc / dos) colorerait encore la zone : on force 0.
    if (legacyActive) next[selectedZone] = 0;
    else delete next[selectedZone];
    setPainMap(next);
    if (setPainTypes) {
      const t = { ...painTypes };
      delete t[selectedZone];
      setPainTypes(t);
    }
    if (setPainSens) {
      const n = { ...painSens };
      delete n[selectedZone];
      setPainSens(n);
    }
    setSelectedZone(null);
  }

  function saveIntensity() {
    if (!selectedZone) return;
    setPainMap({ ...painMap, [selectedZone]: intensity });
    if (setPainTypes) {
      const next = { ...painTypes };
      if (intensity > 0 && ptype) next[selectedZone] = ptype;
      else delete next[selectedZone];
      setPainTypes(next);
    }
    if (setPainSens) {
      const nextS = { ...painSens };
      if (intensity > 0 && psens.length) nextS[selectedZone] = psens;
      else delete nextS[selectedZone];
      setPainSens(nextS);
    }
    setSelectedZone(null);
  }

  const A = ANAT[mode][view];
  const isSkel = mode === "skel";
  const selectedData = selectedZone ? zoneById[selectedZone] : null;
  const hoverData = hoverZone ? zoneById[hoverZone] : null;

  // Zones renseignées (toutes vues / tous modes) pour le résumé et les compteurs.
  const filled = useMemo(() => {
    const out = [];
    const seen = new Set();
    ALL_ZONES.forEach((z) => {
      if (seen.has(z.id)) return;
      // Seules les saisies propres à la zone comptent ici (les anciennes zones
      // groupées tronc / dos sont listées à part, une seule fois).
      const v = painMap[z.id] ?? 0;
      if (v > 0) {
        seen.add(z.id);
        out.push({ id: z.id, label: z.label, value: v, mode: z.mode, view: z.view, type: painTypes[z.id], sens: painSens[z.id] || [] });
      }
    });
    // Anciennes zones groupées sans équivalent fin
    Object.keys(LEGACY_LABELS).forEach((k) => {
      if (painMap[k] > 0) {
        out.push({ id: k, label: `${LEGACY_LABELS[k]} (ancienne saisie)`, value: painMap[k], mode: "muscle", view: LEGACY_VIEW[k], legacy: true });
      }
    });
    // Un même muscle gauche/droit n'apparaît qu'une fois par id
    return out.sort((a, b) => b.value - a.value);
  }, [painMap, painTypes, painSens]);

  const countByMode = (m) => filled.filter((f) => f.mode === m).length;
  const filledCount = filled.length;

  function jumpTo(f) {
    setMode(f.mode);
    const hereToo = ALL_ZONES.some((z) => z.id === f.id && z.mode === f.mode && z.view === view);
    setView(hereToo ? view : f.view);
    if (!f.legacy) setSelectedZone(f.id);
  }

  // Dessin d'une pièce (un côté) : forme cliquable + traits de détail
  function renderPart(part, side, key) {
    if (part.deco) {
      return (
        <path
          key={key}
          d={part.d}
          fill={part.fill}
          stroke={part.stroke || "#3b1a14"}
          strokeWidth={part.sw || 0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      );
    }
    const id = partId(part, side, mode, view);
    const zone = zoneById[id];
    const value = zone ? zoneValue(painMap, zone) : 0;
    const isSel = selectedZone === id;
    const isHover = hoverZone === id;
    const joint = part.kind === "joint";

    let fill;
    let stroke;
    let fillOpacity = 1;
    if (isSkel) {
      stroke = joint ? "#7a5316" : BONE_LINE;
      if (value > 0) {
        fill = painColor(value);
        fillOpacity = 0.9;
      } else if (part.fillOnly) {
        fill = "rgba(216,207,189,0.07)";
      } else if (joint) {
        fill = ACCENT;
        fillOpacity = 0.5;
      } else {
        fill = BONE;
      }
    } else {
      stroke = "#3b1a14";
      if (value > 0) {
        fill = painColor(value);
        fillOpacity = 0.92;
      } else {
        fill = part.fill || MUSCLE_TONES[(part.t ?? 0) % MUSCLE_TONES.length];
      }
    }

    const skelBone = isSkel && !joint && !part.fillOnly;
    const ribs = isSkel && part.fillOnly;
    const detailStroke = ribs ? (value > 0 ? painColor(value) : BONE) : isSkel ? BONE_LINE : "rgba(30,10,6,0.5)";
    const detailWidth = ribs ? 3.4 : 0.85;
    const detailOpacity = 1;

    return (
      <g
        key={key}
        onClick={() => setSelectedZone(id)}
        onMouseEnter={() => setHoverZone(id)}
        onMouseLeave={() => setHoverZone(null)}
        style={{ cursor: "pointer" }}
      >
        {skelBone ? (
          <>
            {/* contour dessiné dessous puis recouvert : seul le bord extérieur de l'os reste visible */}
            <path d={part.d} fill={fill} stroke={isSel ? ACCENT : BONE_LINE} strokeWidth={isSel ? 3.6 : 2.2} strokeLinejoin="round" />
            <path d={part.d} fill={fill} fillOpacity={fillOpacity} stroke="none" />
          </>
        ) : (
          <path
            d={part.d}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={isSel ? ACCENT : part.fillOnly ? "none" : stroke}
            strokeWidth={isSel ? 2.6 : 1}
            strokeLinejoin="round"
          />
        )}
        {(!isSkel || skelBone) && (
          <path d={part.d} fill={`url(#${uid}hl)`} fillOpacity={isSkel ? 0.55 : 1} stroke="none" style={{ pointerEvents: "none" }} />
        )}
        {(isHover || isSel) && (
          <path
            d={part.d}
            fill="rgba(255,255,255,0.14)"
            stroke="none"
            style={{ pointerEvents: "none" }}
          />
        )}
        {ribs &&
          (part.f || []).map((f, i) => (
            <path key={`u${i}`} d={f} fill="none" stroke={BONE_LINE} strokeWidth={5.4} strokeLinecap="round" style={{ pointerEvents: "none" }} />
          ))}
        {(part.f || []).map((f, i) => (
          <path
            key={i}
            d={f}
            fill="none"
            stroke={detailStroke}
            strokeOpacity={detailOpacity}
            strokeWidth={detailWidth}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />
        ))}
      </g>
    );
  }

  const lrParts = A.parts.filter((p) => p.side === "lr" && !p.hide);
  const centreParts = A.parts.filter((p) => p.side === "c");
  const mirror = `translate(${VB.cx * 2} 0) scale(-1 1)`;
  const clipUrl = `url(#${uid}clip)`;
  const baseFill = isSkel ? "#1d1a16" : MUSCLE_BASE;

  const sideLayer = (side) => (
    <g clipPath={isSkel ? undefined : clipUrl}>
      {A.sil.map((d, i) => (
        <path key={`b${i}`} d={d} fill={baseFill} style={{ pointerEvents: "none" }} />
      ))}
      {lrParts.map((p, i) => renderPart(p, side, `${side}${i}`))}
    </g>
  );

  const outline = A.sil.map((d, i) => (
    <path
      key={`o${i}`}
      d={d}
      fill="none"
      stroke={isSkel ? "#3a352d" : "#241009"}
      strokeWidth={1.3}
      strokeLinejoin="round"
      style={{ pointerEvents: "none" }}
    />
  ));

  const tabBtn = (active, onClick, label, extra) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "11px 8px",
        background: active ? ACCENT : SURFACE_3,
        color: active ? "#1a1306" : TEXT_MUTED,
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      {label}
      {extra}
    </button>
  );
  const badge = (n) =>
    n > 0 ? (
      <span
        style={{
          marginLeft: 6,
          padding: "1px 7px",
          borderRadius: 10,
          background: DANGER,
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {n}
      </span>
    ) : null;

  const caption = hoverData || selectedData;

  return (
    <div>
      {/* Mode : muscle (douleur musculaire) / squelette (os, articulations) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {tabBtn(mode === "muscle", () => { setMode("muscle"); setSelectedZone(null); }, "💪 Muscles", badge(countByMode("muscle")))}
        {tabBtn(mode === "skel", () => { setMode("skel"); setSelectedZone(null); }, "🦴 Squelette", badge(countByMode("skel")))}
      </div>
      {/* Vue : face avant / arrière */}
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        {tabBtn(view === "front", () => setView("front"), "Face avant")}
        {tabBtn(view === "back", () => setView("back"), "Face arrière")}
      </div>
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 12, textAlign: "center" }}>
        {isSkel
          ? "Douleur osseuse ou articulaire : touchez un os ou une articulation (en ambre)."
          : "Douleur musculaire : touchez le muscle concerné."}
      </div>

      {/* Planche anatomique */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          marginBottom: 16,
          background: SURFACE,
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          padding: "16px 10px",
        }}
      >
        {/* Nom du muscle / de l'os survolé ou sélectionné */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            color: caption ? TEXT : "transparent",
            pointerEvents: "none",
            minHeight: 18,
          }}
        >
          {caption ? caption.label : "."}
        </div>
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          style={{ width: "100%", maxWidth: 340, height: "auto", marginTop: 14 }}
          role="img"
          aria-label={isSkel ? "Squelette" : "Système musculaire"}
        >
          <defs>
            <clipPath id={`${uid}clip`}>
              {A.sil.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </clipPath>
            <linearGradient id={`${uid}hl`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity=".38" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".07" />
              <stop offset="1" stopColor="#000" stopOpacity=".4" />
            </linearGradient>
          </defs>

          {sideLayer("g")}
          <g transform={mirror}>{sideLayer("d")}</g>
          {outline}
          <g transform={mirror}>{outline}</g>

          {/* Pièces centrales (tête, crâne, rachis, sternum…) */}
          {centreParts.map((p, i) => renderPart(p, "c", `c${i}`))}
        </svg>
      </div>

      {/* Légende échelle de douleur */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            height: 6,
            borderRadius: 4,
            background: `linear-gradient(to right, ${SUCCESS}, ${WARNING}, ${PAIN_MAX})`,
            marginBottom: 6,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TEXT_MUTED }}>
          <span>Aucune douleur</span>
          <span>Douleur intense</span>
        </div>
      </div>

      {/* Sélecteur d'intensité */}
      {selectedZone && selectedData && (
        <div
          style={{
            background: SURFACE_2,
            padding: 20,
            borderRadius: 12,
            border: `2px solid ${ACCENT}`,
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: "0 0 15px 0", color: ACCENT }}>{selectedData.label}</h4>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 12, color: TEXT_MUTED }}>
            <span>Pas de douleur</span>
            <span>Douleur intense</span>
          </div>

          <input
            type="range"
            min="0"
            max="10"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            style={{
              width: "100%",
              height: 8,
              borderRadius: 5,
              outline: "none",
              background: `linear-gradient(to right, ${SUCCESS}, ${WARNING}, ${PAIN_MAX})`,
              WebkitAppearance: "none",
              appearance: "none",
              cursor: "pointer",
              marginBottom: 15,
            }}
          />

          <div style={{ textAlign: "center", marginBottom: 15, fontSize: 32, fontWeight: "bold", color: painColor(intensity) }}>
            {intensity}/10
          </div>

          {(setPainTypes || painTypes[selectedZone]) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Quel type de douleur ?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PAIN_TYPES.map((t) => {
                  const on = ptype === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      disabled={!setPainTypes}
                      onClick={() => setPtype(on ? "" : t.key)}
                      title={t.hint}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        cursor: setPainTypes ? "pointer" : "default",
                        fontSize: 13,
                        textAlign: "left",
                        background: on ? ACCENT : SURFACE_3,
                        color: on ? "#1a1308" : TEXT,
                        border: `1px solid ${on ? ACCENT : BORDER_STRONG}`,
                      }}
                    >
                      {t.emoji} {t.label}
                      <div style={{ fontSize: 10, opacity: 0.75 }}>{t.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(setPainSens || (painSens[selectedZone] || []).length > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Quelle sensation ? (plusieurs possibles)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PAIN_SENSATIONS.map((t) => {
                  const on = psens.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      disabled={!setPainSens}
                      onClick={() => setPsens(on ? psens.filter((k) => k !== t.key) : [...psens, t.key])}
                      style={{
                        padding: "6px 11px",
                        borderRadius: 16,
                        cursor: setPainSens ? "pointer" : "default",
                        fontSize: 12,
                        background: on ? ACCENT : SURFACE_3,
                        color: on ? "#1a1308" : TEXT,
                        border: `1px solid ${on ? ACCENT : BORDER_STRONG}`,
                      }}
                    >
                      {t.emoji} {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={saveIntensity}
              style={{ flex: 1, padding: 14, background: SUCCESS, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 16, fontWeight: "bold" }}
            >
              ✅ Valider
            </button>
            {selectedData && zoneValue(painMap, selectedData) > 0 && (
              <button
                onClick={deletePain}
                title="Supprimer cette douleur"
                style={{ padding: "14px 16px", background: "transparent", color: DANGER, border: `1px solid ${DANGER}`, borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: "bold" }}
              >
                🗑️ Supprimer
              </button>
            )}
            <button
              onClick={() => setSelectedZone(null)}
              style={{ padding: "14px 18px", background: "transparent", color: TEXT_MUTED, border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Zones renseignées (muscles et os, toutes vues) */}
      {filledCount > 0 && (
        <div style={{ marginBottom: selectedZone ? 0 : 12 }}>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>
            {filledCount} zone{filledCount > 1 ? "s" : ""} renseignée{filledCount > 1 ? "s" : ""} · touchez pour modifier
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {filled.map((f) => (
              <button
                key={f.id}
                onClick={() => jumpTo(f)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  background: SURFACE_3,
                  color: TEXT,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 14,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: painColor(f.value), flexShrink: 0 }} />
                {f.mode === "skel" ? "🦴 " : ""}
                {f.label} · {f.value}/10
                {f.type && PAIN_TYPE_BY_KEY[f.type] ? ` · ${PAIN_TYPE_BY_KEY[f.type].emoji} ${PAIN_TYPE_BY_KEY[f.type].label}` : ""}
                {f.sens && f.sens.length > 0 ? ` · ${f.sens.map((k) => (SENS_BY_KEY[k] ? SENS_BY_KEY[k].label.toLowerCase() : k)).join(", ")}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {!selectedZone && filledCount === 0 && (
        <p style={{ textAlign: "center", color: TEXT_MUTED, fontSize: 14, margin: 0 }}>
          Touchez une zone du corps pour indiquer une douleur
        </p>
      )}
    </div>
  );
}
