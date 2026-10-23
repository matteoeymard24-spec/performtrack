import React from "react";
import { maxRepsAtPct, expectedRpe } from "./loadMetrics";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const BORDER = "#1d1a16";

const PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
const REPS = [1, 3, 5, 8, 10, 12];

const rpeColor = (v) => (v >= 9 ? "#d9695a" : v >= 8 ? "#e08a3d" : v >= 6 ? "#d9a441" : "#4fae7d");

/* Tableau de référence : reps max possibles à un % du 1RM et RPE correspondant si on s'arrête avant l'échec.
   RPE = 10 − reps en réserve. Table RPE ↔ %1RM (Zourdos 2016, Helms 2016/2017), valeurs < 68 % extrapolées. */
export default function RepsRpeTable({ defaultOpen = false }) {
  return (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, color: TEXT, fontWeight: 700, cursor: "pointer" }}>
        📊 Table reps possibles ↔ % du RM ↔ RPE
      </summary>
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: "right" }}>
              <th style={{ padding: "5px 8px", textAlign: "left" }}>% du RM</th>
              <th style={{ padding: "5px 8px" }}>Reps max (RPE 10)</th>
              {REPS.map((r) => (
                <th key={r} style={{ padding: "5px 8px" }}>
                  RPE à {r} rep{r > 1 ? "s" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PCTS.map((p) => {
              const mx = maxRepsAtPct(p);
              return (
                <tr key={p} style={{ borderTop: `1px solid ${BORDER}`, textAlign: "right" }}>
                  <td style={{ padding: "5px 8px", textAlign: "left", color: TEXT, fontWeight: 700 }}>
                    {p}%{p < 68 ? <span style={{ color: MUTED, fontWeight: 400 }}> ~</span> : null}
                  </td>
                  <td style={{ padding: "5px 8px", color: TEXT }}>{Math.round(mx * 2) / 2}</td>
                  {REPS.map((r) => {
                    if (r > mx + 0.5) return <td key={r} style={{ padding: "5px 8px", color: "#4a453d" }}>—</td>;
                    const v = Math.round(expectedRpe(p, r) * 2) / 2;
                    return (
                      <td key={r} style={{ padding: "5px 8px", color: rpeColor(v), fontWeight: 700 }}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginTop: 8 }}>
        Lecture : à 70 % du RM on peut faire ≈ 11 reps au maximum ; 6 reps à 70 % correspondent à un RPE ≈ 5 (≈ 5 reps en réserve). RPE = 10 − reps en réserve (échelle RIR de Zourdos 2016).
        <br />• Table RPE ↔ %1RM : Zourdos et al. 2016, J Strength Cond Res 30(1):267-275 (squat, RPE inversement lié à la vitesse, r = −0,77 à −0,88), reprise dans Helms et al. 2016. Valeurs sous 68 % extrapolées (≈ 14 reps à 65 %, 18-26 reps à 50 % d'après Graham &amp; Cleather 2021 et Casanova 2025).
        <br />• Haut / bas du corps : à % égal, le bas du corps tombe plus tôt à l'échec. Reynolds et al. 2006 (J Strength Cond Res 20(3):584-592) : 10 reps max = 70,1 % du 1RM en presse à cuisses contre 75,7 % en développé couché ; 5 reps = 85,9 % vs 87,5 %. Pour le bas du corps compte donc ≈ 1 rep de moins que la table. Les exercices unilatéraux (fentes) n'ont pas été étudiés.
        <br />• Fiabilité du RPE : loin de l'échec on se trompe de 2 à 3 reps, et on a tendance à sous-estimer ce qu'on peut encore faire, donc à déclarer un RPE trop haut (Hackett et al. 2018, J Strength Cond Res 32(5):1352-1359 ; Casanova et al. 2025, J Phys Educ Sport 25(11)). Près de l'échec (RPE ≥ 8) l'erreur tombe à ≈ 1 rep.
        <br />• Ces valeurs varient selon l'athlète, l'exercice et son état de forme : c'est un repère, pas une valeur exacte.
      </div>
    </details>
  );
}
