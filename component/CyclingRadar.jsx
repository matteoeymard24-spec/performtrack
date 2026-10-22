import React, { useMemo, useState } from "react";
import {
  CYCLING_AXES,
  CYCLING_LEVELS,
  CYCLING_PRIORITY,
  CYCLING_SEXES,
  CYCLING_LIFTS,
  CYCLING_TYPES,
  CYCLING_NOTE,
  CYCLING_STD,
  CYCLING_TAGS,
  cyclingNote,
  cmjNote,
  cmjStd,
  liftNote,
  liftStd,
  liftTag,
  isCyclingLevel,
  normSex,
} from "./cycling";
import { noteColor, STRENGTH_NORMS, findRM } from "./norms";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const ACCENT = "#e0a13d";
const BLUE = "#7aa6e8";
const BORDER = "#1d1a16";

const num = (v) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return isFinite(x) && x > 0 ? x : null;
};
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

function Radar({ axes, values, targets }) {
  const S = 360, C = S / 2, R = 108, n = axes.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (Math.max(0, Math.min(20, v)) / 20) * R;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v ?? 0).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 440, display: "block", margin: "0 auto" }} role="img" aria-label="Radar des qualités physiques du cycliste">
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

const ADVICE = {
  mobilite: "Mobilité : voir le profil par région (hanche, thoracique, cervicales) : sur le vélo la position fixe du tronc sollicite surtout ces zones.",
  force_haut: "Force du haut : développé couché / militaire, 2 à 3 séries lourdes ; utile pour la stabilité du tronc en sprint et en danseuse.",
  force_bas: "Force des jambes : squat, hip thrust, RDL en charges lourdes (travaux sur cyclistes bien entraînés et élites : Sunde 2010 PMID 19855311 ; Rønnestad et al. 2015 PMID 24862305).",
  tirage: "Tirage : tractions et tirage planche ; maintien du guidon en sprint et en danseuse.",
  vitesse: "Vitesse : sprints de 5 à 10 s (départ arrêté et lancé), récupération complète ; la valeur suivie est la puissance max sur 5 s.",
  puissance: "Puissance : sauts (CMJ, squat jump) et force-vitesse ; le CMJ sert ici de repère de puissance des jambes.",
  endurance: "Endurance : volume de base, blocs au seuil (2 x 20 min, 3 x 12 min) et intervalles de 3 à 5 min ; l'axe est la moyenne du seuil 20 min, de la PMA 5 min et de la VO2max estimée.",
};

const avgN = (arr) => {
  const n = arr.filter((x) => x != null);
  return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
};
const tagColor = (t) => (t === "doc" ? "#4fae7d" : t === "provisoire" ? "#d9604a" : ACCENT);

/* Radar du cycliste (mêmes qualités que le rugby, l'endurance en un seul axe) : notes /20 par rapport au standard du niveau
   et du sexe choisis, cible selon le type de coureur. tests : tests de l'athlète ; rmDocs : [{name, kg}] ;
   sex : "H" / "F" (profil) ; onSaveSex(sex) : enregistre le sexe dans le profil ; domainNotes : notes par domaine (mobilité). */
export default function CyclingRadar({ tests, rmDocs, level, rider, weight, sex, onSaveSex = null, domainNotes }) {
  const [localW, setLocalW] = useState("");
  const [localSex, setLocalSex] = useState("");
  const sx = normSex(sex || localSex);
  const lvl = isCyclingLevel(level) ? level : null;
  const bw = num(localW) || num(weight);

  const latest = useMemo(() => {
    const out = {};
    [...(tests || [])]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((t) => {
        if (t.testId && !out[t.testId]) out[t.testId] = t;
      });
    return out;
  }, [tests]);

  const wkgOf = (testId, powerKey) => {
    const t = latest[testId];
    if (!t) return null;
    const p = num(t.values?.[powerKey]);
    const w = num(t.values?.weight) || bw;
    return p && w ? r2(p / w) : null;
  };
  const vo2Test = (tests || []).filter((t) => t.result?.vo2max != null).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const cmjTest = (tests || []).filter((t) => t.result?.cmj != null).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const val = {
    p5s: wkgOf("cycle_p5s", "p"),
    p5m: wkgOf("cycle_p5m", "p5"),
    p20: wkgOf("ftp", "p20"),
    vo2: vo2Test ? vo2Test.result.vo2max : null,
    cmj: cmjTest ? Number(cmjTest.result.cmj) : null,
  };
  const nt = (id) => (lvl ? cyclingNote(id, lvl, sx, val[id]) : null);

  const lifts = STRENGTH_NORMS.filter((sp) => CYCLING_LIFTS[sp.normKey]).map((sp) => {
    const rm = findRM(rmDocs, sp);
    const ratio = rm && bw ? r2(rm.kg / bw) : null;
    return {
      sp,
      axis: CYCLING_LIFTS[sp.normKey].axis,
      rm,
      ratio,
      std: lvl ? liftStd(sp.normKey, lvl, sx) : null,
      tag: liftTag(sp.normKey, sx),
      note: lvl && ratio != null ? liftNote(sp.normKey, lvl, sx, ratio) : null,
    };
  });
  const liftAvg = (axis) => avgN(lifts.filter((l) => l.axis === axis).map((l) => l.note));

  const endu = { p20: nt("p20"), p5m: nt("p5m"), vo2: nt("vo2") };
  const notesById = {
    mobilite: domainNotes?.mobilite?.avg ?? null,
    force_haut: liftAvg("force_haut"),
    force_bas: liftAvg("force_bas"),
    tirage: liftAvg("tirage"),
    vitesse: nt("p5s"),
    puissance: lvl && val.cmj != null ? cmjNote(lvl, sx, val.cmj) : null,
    endurance: avgN(Object.values(endu)),
  };
  const notes = CYCLING_AXES.map((ax) => notesById[ax.id]);
  const prio = CYCLING_PRIORITY[rider] || null;
  const targets = CYCLING_AXES.map((_, i) => (prio ? 10 + 2 * prio[i] : null));
  const nData = notes.filter((n) => n != null).length;
  const gaps = prio
    ? CYCLING_AXES.map((ax, i) => ({ ax, i, note: notes[i], gap: notes[i] == null ? null : targets[i] - notes[i] }))
        .filter((g) => g.gap != null && g.gap > 1)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3)
    : [];
  const typeLabel = CYCLING_TYPES.find((t) => t.key === rider)?.label;
  const tags = lvl ? CYCLING_TAGS(lvl, sx) : null;
  const setSex = (v) => {
    setLocalSex(v);
    if (onSaveSex) onSaveSex(v);
  };

  const sub = (label, measure, std, tag, note) => (
    <tr key={label} style={{ borderTop: `1px solid ${BORDER}` }}>
      <td style={{ padding: "3px 6px 3px 18px", color: MUTED }}>{label}</td>
      <td style={{ padding: "3px 6px", color: measure ? TEXT : MUTED }}>{measure || "—"}</td>
      <td style={{ padding: "3px 6px", color: MUTED }}>
        {std != null ? std : "—"}
        {tag && std != null ? <span style={{ marginLeft: 6, fontSize: 10, color: tagColor(tag) }}>{tag}</span> : null}
      </td>
      <td style={{ padding: "3px 6px", color: note == null ? MUTED : noteColor(note) }}>{note == null ? "—" : `${note}/20`}</td>
    </tr>
  );

  const DESC = {
    mobilite: "moyenne des tests de mobilité",
    force_haut: "moyenne des exercices ci-dessous",
    force_bas: "moyenne des exercices ci-dessous",
    tirage: "moyenne des exercices ci-dessous",
    vitesse: "puissance max sur 5 s",
    puissance: "saut vertical (CMJ)",
    endurance: "moyenne seuil 20 min, PMA 5 min, VO2max estimée",
  };
  const rows = [];
  CYCLING_AXES.forEach((ax, i) => {
    rows.push(
      <tr key={ax.id} style={{ borderTop: `1px solid ${BORDER}` }}>
        <td style={{ padding: "5px 6px", color: TEXT, fontWeight: 600 }}>{ax.label}</td>
        <td colSpan={2} style={{ padding: "5px 6px", color: MUTED }}>{DESC[ax.id]}</td>
        <td style={{ padding: "5px 6px", fontWeight: 700, color: notes[i] == null ? MUTED : noteColor(notes[i]) }}>{notes[i] == null ? "—" : `${notes[i]}/20`}</td>
      </tr>
    );
    lifts
      .filter((l) => l.axis === ax.id)
      .forEach((l) =>
        rows.push(sub(l.sp.label, l.rm ? `${l.rm.kg} kg${l.ratio != null ? ` (${l.ratio} × poids)` : ""}` : null, l.std != null ? `${l.std} × poids` : null, l.tag, l.note))
      );
    const std = (k) => (lvl ? `${r1(CYCLING_STD[sx][lvl][k])} W/kg` : null);
    if (ax.id === "vitesse") rows.push(sub("Sprint 5 s", val.p5s != null ? `${val.p5s} W/kg` : null, std("p5s"), tags?.p5s, nt("p5s")));
    if (ax.id === "puissance") rows.push(sub("CMJ", val.cmj != null ? `${val.cmj} cm` : null, lvl ? `${cmjStd(lvl, sx)} cm` : null, tags?.cmj, notesById.puissance));
    if (ax.id === "endurance") {
      rows.push(sub("Seuil 20 min / FTP", val.p20 != null ? `${val.p20} W/kg` : null, std("p20"), tags?.p20, endu.p20));
      rows.push(sub("PMA 5 min", val.p5m != null ? `${val.p5m} W/kg` : null, std("p5m"), tags?.p5m, endu.p5m));
      rows.push(sub("VO2max (estimée)", val.vo2 != null ? `${val.vo2} ml/kg/min` : null, lvl ? `${r1(CYCLING_STD[sx][lvl].vo2)} ml/kg/min` : null, tags?.vo2, endu.vo2));
    }
  });

  const selSt = { background: "#0d0c0a", color: TEXT, border: "1px solid #2a2620", borderRadius: 6, padding: "3px 6px", fontSize: 12 };

  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        Mêmes qualités que le rugby, notées /20 par rapport au standard du niveau
        {lvl ? <strong style={{ color: TEXT }}> {CYCLING_LEVELS.find((l) => l.id === lvl)?.label}</strong> : null} et du sexe choisis. 10/20 = le standard
        (+1 écart-type = 15, +2 = 20). Tirets bleus = cible selon le type de coureur{typeLabel ? ` (${typeLabel})` : ""} ; l'endurance est la qualité la plus haute. Pas de détail par filière énergétique.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 12, color: MUTED }}>
        Normes :
        {CYCLING_SEXES.map((o) => (
          <button
            key={o.id}
            onClick={() => setSex(o.id)}
            style={{ ...selSt, cursor: "pointer", borderColor: sx === o.id ? ACCENT : "#2a2620", color: sx === o.id ? ACCENT : TEXT, fontWeight: sx === o.id ? 700 : 400 }}
          >
            {o.label}
          </button>
        ))}
        {!sex && !localSex && <span style={{ fontSize: 11 }}>(par défaut : homme)</span>}
      </div>

      {!lvl && (
        <div style={{ fontSize: 12, color: ACCENT, marginBottom: 8 }}>
          Choisis un niveau cycliste en haut de la page (pro, élite / U23, compétiteur, cyclosportif, loisir) : sans niveau, le radar ne peut pas noter.
        </div>
      )}
      {!bw && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 12, color: MUTED }}>
          Poids du corps non renseigné :
          <input value={localW} onChange={(e) => setLocalW(e.target.value)} placeholder="kg" style={{ ...selSt, width: 64 }} />
          (utilisé pour les W/kg et la force relative)
        </div>
      )}

      {nData < 2 ? (
        <div style={{ color: MUTED, fontSize: 13, padding: "10px 0" }}>
          Pas assez de données : passe au moins deux qualités (tests de puissance 5 s / 5 min / 20 min, CMJ, mobilité, ou 1RM dans « Mes RM ») pour tracer le radar.
        </div>
      ) : (
        <Radar axes={CYCLING_AXES} values={notes} targets={targets} />
      )}

      <div style={{ marginTop: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Qualité</th>
              <th style={{ padding: "4px 6px" }}>Mesure</th>
              <th style={{ padding: "4px 6px" }}>Standard</th>
              <th style={{ padding: "4px 6px" }}>Note</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
          <span style={{ color: "#4fae7d" }}>doc</span> = relevé dans une étude · <span style={{ color: ACCENT }}>estimé</span> = calculé à partir d'une étude ·{" "}
          <span style={{ color: "#d9604a" }}>provisoire</span> = aucune donnée publiée trouvée, valeur de travail à corriger avec tes propres références.
        </div>
      </div>

      {gaps.length > 0 && (
        <div style={{ marginTop: 12, background: "#151310", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>À développer en priorité{typeLabel ? ` (${typeLabel})` : ""}</div>
          {gaps.map((g) => (
            <div key={g.ax.id} style={{ fontSize: 12, color: MUTED, padding: "3px 0", lineHeight: 1.5 }}>
              <span style={{ color: TEXT, fontWeight: 700 }}>
                {g.ax.label} : {g.note}/20
              </span>{" "}
              (cible {targets[g.i]}) — {ADVICE[g.ax.id]}
            </div>
          ))}
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Les cibles par type de coureur sont un avis indicatif, pas une donnée publiée.</div>
        </div>
      )}
      {!rider && lvl && (
        <div style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>Choisis le type de coureur dans « Poste » pour afficher la cible et les priorités.</div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>Standards de tous les niveaux ({sx === "F" ? "femmes" : "hommes"})</summary>
        <div style={{ overflowX: "auto", marginTop: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: "left" }}>
                <th style={{ padding: "4px 6px" }}>Niveau</th>
                <th style={{ padding: "4px 6px" }}>Sprint 5 s</th>
                <th style={{ padding: "4px 6px" }}>PMA 5 min</th>
                <th style={{ padding: "4px 6px" }}>Seuil 20 min</th>
                <th style={{ padding: "4px 6px" }}>VO2max</th>
                <th style={{ padding: "4px 6px" }}>Squat × poids</th>
                <th style={{ padding: "4px 6px" }}>CMJ cm</th>
              </tr>
            </thead>
            <tbody>
              {CYCLING_LEVELS.map((l) => (
                <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}`, background: l.id === lvl ? "#1a2231" : "transparent" }}>
                  <td style={{ padding: "5px 6px", color: TEXT }}>{l.label}</td>
                  {["p5s", "p5m", "p20", "vo2"].map((k) => (
                    <td key={k} style={{ padding: "5px 6px", color: MUTED }}>
                      {r1(CYCLING_STD[sx][l.id][k])}
                      <span style={{ marginLeft: 4, fontSize: 10, color: tagColor(CYCLING_TAGS(l.id, sx)[k]) }}>{CYCLING_TAGS(l.id, sx)[k]}</span>
                    </td>
                  ))}
                  <td style={{ padding: "5px 6px", color: MUTED }}>
                    {liftStd("SQUAT", l.id, sx).toFixed(2)}
                    <span style={{ marginLeft: 4, fontSize: 10, color: tagColor(liftTag("SQUAT", sx)) }}>{liftTag("SQUAT", sx)}</span>
                  </td>
                  <td style={{ padding: "5px 6px", color: MUTED }}>
                    {cmjStd(l.id, sx)}
                    <span style={{ marginLeft: 4, fontSize: 10, color: tagColor("provisoire") }}>provisoire</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Puissances en W/kg, VO2max en ml/kg/min.</div>
        </div>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>Sources et limites</summary>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginTop: 6 }}>
          • Hommes pros : Valenzuela et al. 2022, Int J Sports Physiol Perform 17(5):701-710 (144 pros) : médiane par durée, relevée dans un tableau relayé par un site tiers (article complet non consulté).
          <br />• Femmes pros : Mateo-March et al. 2022, Int J Sports Physiol Perform (44 coureuses, PMID 35168197) : médiane et percentiles 10 / 90 par durée.
          <br />• Pros / U23 (hommes) : Alejo et al. 2022, Front Physiol 13:945552 : VO2max, squat et hip thrust (machine guidée, 1RM estimé par les auteurs).
          <br />• Amateurs : percentiles des utilisateurs de capteurs de puissance (Cycling Analytics 2018), population auto-sélectionnée ; hommes et femmes séparés.
          <br />• Force des femmes : un seul échantillon publié (cyclistes compétitives, squat ≈ 0,83-0,93 × poids, Frontiers 2021) ; les autres exercices sont mes estimations (femmes ≈ 0,67 × hommes en bas du corps, ≈ 0,6 en haut du corps, ordre de grandeur de l'écart de force entre sexes).
          <br />• Développé couché, militaire, tractions, tirage planche et CMJ : aucune norme publiée trouvée pour des cyclistes, valeurs « provisoires ».
          <br />• Pas d'axe Masse : en cyclisme la masse est déjà dans les W/kg et la force relative.
          <br />• VO2max estimée : 16,6 + 8,87 × W/kg sur 5 min (IJSPP 2021, PMID 34225254) ou autres équations indiquées dans chaque test ; elle ne remplace pas une mesure avec analyse des gaz.
          <br />• {CYCLING_NOTE}
        </div>
      </details>
    </div>
  );
}
