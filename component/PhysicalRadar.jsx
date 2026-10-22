import React, { useEffect, useMemo, useState } from "react";
import { evaluateStrength, groupByPattern, posteLabel, levelLabel, noteColor } from "./norms";
import { REF_MASS, massLevelFactor, hasMorph, evaluateMorph, FORWARDS, BF_DXA, BF_SKINFOLD } from "./morphology";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const ACCENT = "#e0a13d";
const BLUE = "#7aa6e8";
const BORDER = "#1d1a16";
/* Exposants allométriques (force ∝ masse^b). « rugby » = exposants DÉRIVÉS chez des joueurs élite de rugby union
   (Crewther et al. 2009, J Sports Sci 27(14):1575-80, n = 38) : box squat 0,33 ± 0,31 (bas du corps), développé couché
   0,45 ± 0,30 (haut du corps). Intervalles larges. « theo » = 0,67 théorique (Jaric 2002), testé aussi dans cette étude. */
const EXPS = { rugby: { low: 0.33, up: 0.45 }, theo: { low: 2 / 3, up: 2 / 3 } };
const isLower = (pattern) => /_lower$/.test(pattern || "");

/* Axes du radar. Priorité (0 à 3) de chaque qualité selon le poste : INDICATIF (avis, pas une donnée publiée) ;
   sert à tracer la « cible » du poste (cible = 10 + 2 × priorité, soit 10 à 16 / 20) et à classer les qualités à travailler. */
const AXES = [
  { id: "mobilite", label: "Mobilité" },
  { id: "force_haut", label: "Force haut" },
  { id: "force_bas", label: "Force bas" },
  { id: "tirage", label: "Tirage" },
  { id: "vitesse", label: "Vitesse" },
  { id: "puissance", label: "Puissance" },
  { id: "endurance", label: "Endurance" },
  { id: "masse", label: "Masse" },
];
const PRIORITY = {
  //            mob fHaut fBas tir  vit  puis end  masse
  PILIER: [2, 3, 3, 3, 0, 1, 1, 3],
  TALON: [2, 3, 3, 3, 1, 2, 2, 3],
  "2L": [2, 3, 3, 3, 1, 2, 2, 3],
  "3L": [2, 2, 2, 2, 2, 3, 3, 2],
  "9": [2, 1, 1, 1, 3, 2, 3, 1],
  "10": [2, 1, 1, 1, 2, 2, 3, 1],
  Centre: [2, 2, 2, 2, 3, 3, 2, 2],
  Ailier: [2, 1, 2, 1, 3, 3, 2, 1],
  Arriere: [2, 1, 2, 1, 3, 3, 2, 1],
};
const avg = (arr) => {
  const n = arr.filter((x) => x != null);
  return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
};
const num = (v) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return isFinite(x) && x > 0 ? x : null;
};

function Radar({ axes, values, targets }) {
  const S = 360, C = S / 2, R = 108, n = axes.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (Math.max(0, Math.min(20, v)) / 20) * R;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v ?? 0).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 440, display: "block", margin: "0 auto" }} role="img" aria-label="Radar des qualités physiques">
      {[5, 10, 15, 20].map((g) => (
        <polygon key={g} points={axes.map((_, i) => pt(i, g).join(",")).join(" ")} fill="none" stroke="#2a2620" strokeWidth={g === 20 ? 1.4 : 1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 20);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#2a2620" />;
      })}
      {[5, 10, 15].map((g) => (
        <text key={g} x={C + 3} y={C - (g / 20) * R + 3} fontSize="8" fill="#5f594f">{g}</text>
      ))}
      <polygon points={poly(targets)} fill="none" stroke={BLUE} strokeWidth="1.6" strokeDasharray="5 4" />
      <polygon points={poly(values)} fill="rgba(224,161,61,0.25)" stroke={ACCENT} strokeWidth="2" />
      {values.map((v, i) => {
        if (v == null) return null;
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r="3.5" fill={noteColor(v)} stroke="#0d0c0a" />;
      })}
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 24.5);
        const anchor = Math.abs(x - C) < 6 ? "middle" : x > C ? "start" : "end";
        return (
          <g key={ax.id}>
            <text x={x} y={y} fontSize="11" fill={TEXT} textAnchor={anchor} fontWeight="600">{ax.label}</text>
            <text x={x} y={y + 12} fontSize="11" fill={values[i] == null ? "#5f594f" : noteColor(values[i])} textAnchor={anchor} fontWeight="700">
              {values[i] == null ? "—" : `${values[i]}/20`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const inputSt = { background: "#0d0c0a", color: TEXT, border: "1px solid #2a2620", borderRadius: 6, padding: "4px 6px", fontSize: 12, width: 64 };

/* Radar des qualités physiques par poste et par niveau + profil + morphologie (masse, masse maigre, masse grasse).
   domainNotes : notes /20 par domaine (Tests.jsx) ; rmDocs : [{name, kg}] ; weight / height / bodyFat : profil athlète ;
   onSaveProfile(patch) : enregistre taille / % masse grasse dans le profil (facultatif). */
export default function PhysicalRadar({ domainNotes, rmDocs, sport, poste, level, weight, height, bodyFat, bodyFatMethod, onSaveProfile = null }) {
  const [expMode, setExpMode] = useState("theo");
  const [mode, setMode] = useState("rel"); // "rel" = force ramenée à la masse (allométrique), "abs" = kg bruts
  const [localW, setLocalW] = useState("");
  const [hIn, setHIn] = useState(height ? String(height) : "");
  const [bfIn, setBfIn] = useState(bodyFat ? String(bodyFat) : "");
  const [mIn, setMIn] = useState(bodyFatMethod || "dxa");
  useEffect(() => {
    setHIn(height ? String(height) : "");
    setBfIn(bodyFat ? String(bodyFat) : "");
    setMIn(bodyFatMethod || "dxa");
    setLocalW("");
  }, [height, bodyFat, bodyFatMethod, poste]);

  const bw = num(localW) || num(weight);
  const hCm = num(hIn);
  const bf = num(bfIn);
  const refMass = REF_MASS[poste] ? REF_MASS[poste] * massLevelFactor(level) : null;
  const ex = EXPS[expMode];
  const scaleLow = bw && refMass ? Math.pow(refMass / bw, ex.low) : null;
  const scaleUp = bw && refMass ? Math.pow(refMass / bw, ex.up) : null;
  const scale = scaleUp;
  const useRel = mode === "rel" && scaleLow != null;

  const patsAt = (factor) => {
    const docs = (rmDocs || []).map((d) => ({ ...d, kg: d.kg * factor }));
    return Object.fromEntries(groupByPattern(evaluateStrength(docs, sport, poste, level)).map((g) => [g.id, g.avg]));
  };
  const forceOf = (fLow, fUp = fLow) => {
    const lo = patsAt(fLow);
    const up = fUp === fLow ? lo : patsAt(fUp);
    const pats = { ...up, push_v_lower: lo.push_v_lower, push_h_lower: lo.push_h_lower };
    return {
      force_haut: avg([pats.push_v_upper, pats.push_h_upper]),
      force_bas: avg([pats.push_v_lower, pats.push_h_lower]),
      tirage: avg([pats.pull_v, pats.pull_h]),
    };
  };
  const forceAbs = useMemo(() => forceOf(1), [rmDocs, sport, poste, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const forceRel = useMemo(() => (scaleLow != null ? forceOf(scaleLow, scaleUp) : null), [rmDocs, sport, poste, level, scaleLow, scaleUp]); // eslint-disable-line react-hooks/exhaustive-deps
  const forceAxes = useRel ? forceRel : forceAbs;

  const morph = useMemo(() => (hasMorph(poste) && bw ? evaluateMorph(poste, level, bw, bf) : null), [poste, level, bw, bf]);

  const values = AXES.map((a) => {
    if (a.id === "mobilite") return domainNotes?.mobilite?.avg ?? null;
    if (a.id === "vitesse") return domainNotes?.vitesse?.avg ?? null;
    if (a.id === "puissance") return domainNotes?.cmj?.avg ?? null;
    if (a.id === "endurance") return domainNotes?.endurance?.avg ?? null;
    if (a.id === "masse") return morph ? morph.note : null;
    return forceAxes[a.id] ?? null;
  });
  const prio = PRIORITY[poste] || AXES.map(() => 1);
  const targets = prio.map((p) => 10 + 2 * p);

  /* Profil : qualités dominantes, points forts, écarts à la cible du poste */
  const rated = AXES.map((a, i) => ({ ...a, v: values[i], t: targets[i], p: prio[i] })).filter((x) => x.v != null);
  const dominant = [...rated].sort((a, b) => b.v - a.v).slice(0, 2);
  const gaps = rated.filter((x) => x.t - x.v >= 1).sort((a, b) => (b.t - b.v) * (1 + b.p / 3) - (a.t - a.v) * (1 + a.p / 3)).slice(0, 3);
  const strong = rated.filter((x) => x.v >= x.t).sort((a, b) => b.v - a.v).slice(0, 3);
  const keyQ = AXES.filter((_, i) => prio[i] >= 3).map((a) => a.label.toLowerCase());

  /* Conseil masse : hypertrophie / recomposition */
  const fw = FORWARDS.includes(poste);
  const bfRef = fw ? BF_DXA.forwards : BF_DXA.backs;
  const bfHigh = bf != null && (mIn === "dxa" ? bf > bfRef[0] + bfRef[1] : bf > (fw ? BF_SKINFOLD.forwards : BF_SKINFOLD.backs) + 3);
  const massIdx = AXES.findIndex((a) => a.id === "masse");
  const massLow = morph && morph.note < targets[massIdx] - 1;
  const fAbsAvg = avg(["force_haut", "force_bas", "tirage"].map((k) => forceAbs[k]));
  const fRelAvg = forceRel ? avg(["force_haut", "force_bas", "tirage"].map((k) => forceRel[k])) : null;
  const forceOkForWeight = fAbsAvg != null && fRelAvg != null && fRelAvg - fAbsAvg >= 1.5;

  /* Tableau force relative */
  const ratioRows = useMemo(
    () =>
      evaluateStrength(rmDocs || [], sport, poste, level)
        .filter((r) => r.value != null)
        .map((r) => ({
          label: r.label,
          pattern: r.pattern,
          kg: r.value,
          ratio: bw ? r.value / bw : null,
          eq: scaleLow != null ? r.value * (isLower(r.pattern) ? scaleLow : scaleUp) : null,
        })),
    [rmDocs, sport, poste, level, bw, scaleLow, scaleUp]
  );

  if (!poste) return null;
  const nData = values.filter((v) => v != null).length;
  const FFMI = morph && morph.ffm && hCm ? morph.ffm / Math.pow(hCm / 100, 2) : null;
  const dirty = onSaveProfile && ((hIn || "") !== (height ? String(height) : "") || (bfIn || "") !== (bodyFat ? String(bodyFat) : "") || mIn !== (bodyFatMethod || "dxa"));
  const saveBody = () => {
    const patch = { height: hCm || "", bodyFat: bf || "", bodyFatMethod: mIn };
    if (num(localW)) patch.weight = num(localW);
    onSaveProfile(patch);
  };
  const posteShort = posteLabel(sport, poste).replace(/\s*\(.*\)/, "").toLowerCase();

  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Une branche = une qualité physique notée /20 pour le poste ({posteLabel(sport, poste)}) et le niveau de l'athlète
        {level ? <strong style={{ color: TEXT }}> : {levelLabel(level)}</strong> : null}. 10/20 = le standard de ce niveau. Ligne pleine = l'athlète, tirets bleus =
        cible indicative du poste (10 à 16 / 20 selon l'importance de la qualité pour ce poste).
      </div>
      {!level && (
        <div style={{ fontSize: 11, color: "#d9a441", marginBottom: 8 }}>
          Aucun niveau choisi pour cet athlète : les notes utilisent le barème Agen (niveau Pro D2). Choisis son niveau en haut de la page pour noter par rapport à son vrai niveau.
        </div>
      )}

      {/* Morphologie : saisie */}
      <div style={{ background: "#0d0c0a", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📏 Morphologie</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: MUTED }}>
          <label>
            Poids <input value={localW} onChange={(e) => setLocalW(e.target.value)} inputMode="decimal" placeholder={weight ? String(weight) : "kg"} style={inputSt} /> kg
          </label>
          <label>
            Taille <input value={hIn} onChange={(e) => setHIn(e.target.value)} inputMode="decimal" placeholder="cm" style={inputSt} /> cm
          </label>
          <label>
            Masse grasse <input value={bfIn} onChange={(e) => setBfIn(e.target.value)} inputMode="decimal" placeholder="%" style={inputSt} /> %
          </label>
          <label>
            Mesurée par{" "}
            <select value={mIn} onChange={(e) => setMIn(e.target.value)} style={{ ...inputSt, width: "auto" }}>
              <option value="dxa">DXA</option>
              <option value="plis">Plis cutanés</option>
              <option value="impedance">Impédancemètre</option>
            </select>
          </label>
          {dirty && (
            <button type="button" onClick={saveBody} style={{ background: ACCENT, color: "#1a1814", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Enregistrer
            </button>
          )}
        </div>
        {!bw && <div style={{ fontSize: 11, color: "#d9a441", marginTop: 6 }}>Renseigne le poids pour activer la morphologie et le ratio de force.</div>}
        {bw && !bf && <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Sans % de masse grasse, la note « Masse » ne repose que sur le poids (elle ne distingue pas muscle et gras).</div>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: MUTED, fontSize: 11 }}>Force :</span>
        {[
          { id: "rel", label: "⚖️ Ramenée à la masse" },
          { id: "abs", label: "kg bruts" },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              background: mode === m.id ? "#3a2f1a" : "transparent",
              color: mode === m.id ? ACCENT : MUTED,
              border: `1px solid ${mode === m.id ? ACCENT : "#2a2620"}`,
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
        {mode === "rel" && (
          <>
            <span style={{ color: MUTED, fontSize: 11, marginLeft: 8 }}>Exposant :</span>
            {[
              { id: "theo", label: "0,67 (théorique)" },
              { id: "rugby", label: "rugby (0,33 / 0,45)" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setExpMode(m.id)}
                style={{
                  background: expMode === m.id ? "#3a2f1a" : "transparent",
                  color: expMode === m.id ? ACCENT : MUTED,
                  border: `1px solid ${expMode === m.id ? ACCENT : "#2a2620"}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            ))}
          </>
        )}
      </div>

      {nData < 2 ? (
        <div style={{ color: MUTED, fontSize: 13 }}>Pas assez de résultats pour tracer le radar (il faut au moins 2 qualités testées).</div>
      ) : (
        <Radar axes={AXES} values={values} targets={targets} />
      )}

      {useRel && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          Force ramenée à un {posteShort} de {Math.round(refMass)} kg : charge × ({Math.round(refMass)} / {bw})^b, avec b = {ex.low.toFixed(2)} (bas du corps) et {ex.up.toFixed(2)} (haut du corps)
          = ×{scaleLow.toFixed(2)} / ×{scaleUp.toFixed(2)}. Un athlète plus léger que la référence est relevé, un plus lourd est abaissé, mais moins qu'avec un simple ratio kg/kg, qui avantage trop les légers.
        </div>
      )}
      {mode === "rel" && !useRel && <div style={{ fontSize: 11, color: "#d9a441", marginTop: 6 }}>Poids inconnu : la force est notée en kg bruts.</div>}

      {nData >= 2 && (
        <div style={{ background: "#0d0c0a", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🧬 Profil</div>
          <div style={{ color: TEXT }}>
            Profil dominant : <strong style={{ color: ACCENT }}>{dominant.map((d) => `${d.label} (${d.v})`).join(" + ")}</strong>.
          </div>
          {keyQ.length > 0 && <div style={{ color: MUTED }}>Qualités clés pour ce poste : {keyQ.join(", ")}.</div>}
          {strong.length > 0 && <div style={{ color: "#4fae7d" }}>✓ Au niveau de la cible : {strong.map((x) => x.label).join(", ")}.</div>}
          {gaps.length > 0 ? (
            <div style={{ color: "#e08a3d" }}>▲ À développer en priorité : {gaps.map((x) => `${x.label} (${x.v} → cible ${x.t})`).join(", ")}.</div>
          ) : (
            <div style={{ color: "#4fae7d" }}>Toutes les qualités testées atteignent la cible du poste.</div>
          )}
          {massLow && (
            <div style={{ color: "#e08a3d", marginTop: 4 }}>
              🏋️ <strong>Masse sous le standard du poste.</strong>{" "}
              {bfHigh
                ? `La masse grasse (${bf} %) est élevée pour ce groupe : priorité à la recomposition (perdre du gras tout en gardant ou gagnant du muscle), pas à la prise de poids brute.`
                : morph.gapFfm != null && morph.gapFfm > 0
                ? `Il manque environ ${morph.gapFfm} kg de masse maigre pour atteindre le standard du poste (${morph.target.ffm} kg) : priorité à un bloc d'hypertrophie avec surplus calorique contrôlé.`
                : morph.gapBm > 0
                ? `Il manque environ ${morph.gapBm} kg pour atteindre le poids standard du poste (${morph.target.bm} kg) : priorité à un bloc d'hypertrophie. Renseigne le % de masse grasse pour savoir si c'est du muscle qu'il faut gagner.`
                : ""}
              {forceOkForWeight ? " Sa force est correcte pour son poids : c'est la masse qui limite, pas la qualité de force." : ""}
            </div>
          )}
          {rated.length < AXES.length && (
            <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>Non testé : {AXES.filter((_, i) => values[i] == null).map((a) => a.label).join(", ")}.</div>
          )}
        </div>
      )}

      {morph && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📏 Masse vs standard du poste{level ? ` (${levelLabel(level)})` : ""}</div>
          {[
            { k: "Poids", v: `${bw} kg`, ref: `standard ${morph.target.bm} kg`, n: morph.noteBm },
            morph.ffm != null && { k: "Masse maigre", v: `${morph.ffm} kg`, ref: `standard ${morph.target.ffm} kg`, n: morph.noteFfm },
            morph.fatKg != null && {
              k: "Masse grasse",
              v: `${bf} % (${morph.fatKg} kg)`,
              ref: `réf. pros ${mIn === "dxa" ? `DXA ${bfRef[0]} ± ${bfRef[1]} %` : `plis ≈ ${fw ? BF_SKINFOLD.forwards : BF_SKINFOLD.backs} %`}`,
              n: null,
            },
            FFMI != null && { k: "Indice de masse maigre", v: `${FFMI.toFixed(1)} kg/m²`, ref: "information (pas de repère rugby retenu)", n: null },
          ]
            .filter(Boolean)
            .map((r) => (
              <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${BORDER}`, color: MUTED }}>
                <span>{r.k}</span>
                <span style={{ color: TEXT, textAlign: "right" }}>
                  <strong style={{ color: ACCENT }}>{r.v}</strong> · {r.ref}
                  {r.n != null ? <strong style={{ color: noteColor(r.n) }}> · {r.n}/20</strong> : ""}
                </span>
              </div>
            ))}
          {mIn !== "dxa" && bf != null && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              Attention : la masse grasse dépend beaucoup de la méthode (plis et impédance donnent des valeurs plus basses que la DXA). Compare avec la même méthode dans le temps.
            </div>
          )}
        </div>
      )}

      {ratioRows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⚖️ Force relative (RM ÷ poids du corps)</div>
          {ratioRows.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${BORDER}`, color: MUTED }}>
              <span>{r.label}</span>
              <span style={{ color: TEXT, textAlign: "right" }}>
                {r.kg} kg{r.ratio != null ? <strong style={{ color: ACCENT }}> · {r.ratio.toFixed(2)} × PdC</strong> : ""}
                {r.eq != null ? <span style={{ color: MUTED }}> · ≈ {Math.round(r.eq)} kg à {Math.round(refMass)} kg</span> : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>Sources et limites</summary>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginTop: 6 }}>
          • Standards de poids et de masse maigre par poste : « USA Rugby Player Profiles and Performance Standards » (note USA × 2 = note /20 ; vert = 16/20). Pour les niveaux
          inférieurs au Pro D2, les seuils sont multipliés par le coefficient du niveau : estimation (la revue 2026 donne ≈ 91 kg pour des avants amateurs contre ≈ 116 kg en élite).
          <br />• Poids de référence pour ramener la force : ceux des standards de squat USA Rugby (pilier 125, talonneur 115, 2e ligne 110, 3e ligne 110, 9 : 85, 10 : 90, centre 105, ailier et arrière 95).
          <br />• Normalisation de la force : Crewther et al. 2009 (J Sports Sci, 38 joueurs élite de rugby union) : exposants dérivés box squat 0,33 ± 0,31, développé couché 0,45 ± 0,30,
          bench throw 0,46 ± 0,36, squat jump 0,64 ± 0,31 ; exposant théorique 0,67 (Jaric 2002). Après normalisation allométrique (dérivée ou 0,67), plus de différence de force entre avants et arrières,
          alors que le ratio simple kg/kg favorise les légers (Crewther 2009, 2011, 2012). Limites : intervalles de confiance larges, un seul groupe de joueurs. J'applique 0,33 aux exercices du bas du
          corps et 0,45 à ceux du haut du corps (extension à d'autres exercices = hypothèse de ma part).
          <br />• Masse grasse : Posthumus et al. 2020 (Sports 8(6):85), DXA, pros : avants 17,8 ± 2,4 %, arrières 14,8 ± 1,2 %.
          <br />• Les priorités par poste (cibles bleues) sont un avis indicatif, pas une donnée publiée.
        </div>
      </details>
    </div>
  );
}
