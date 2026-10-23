import React from "react";

const MUTED = "#a8a199";
const TEXT = "#f3f0ea";
const BORDER = "#1d1a16";
const cell = { padding: "5px 8px" };

/* %1RM ≈ 110,893 − 64,187 × MPV (développé couché, González-Badillo & Sánchez-Medina 2010, r² = 0,96) */
const benchPct = (v) => Math.round(110.893 - 64.187 * v);

/* Zones de vitesse (convention d'entraînement, vitesse moyenne propulsive en m/s) */
const ZONES = [
  { q: "Vitesse pure (départ / balistique)", color: "#7fb8d9", lo: 1.3, hi: null, use: "Charges très légères, lancers, sauts, sprints lestés très légers." },
  { q: "Puissance-vitesse", color: "#4fae7d", lo: 1.0, hi: 1.3, use: "Charges légères, vitesse dominante (sauts, développé lancé, olympiques légers)." },
  { q: "Puissance max", color: "#d9a441", lo: 0.8, hi: 1.0, use: "Zone où la puissance moyenne est maximale (≈ 1,0 m/s en jump squat chez des athlètes élites)." },
  { q: "Puissance-force", color: "#e08a3d", lo: 0.75, hi: 1.0, use: "Charges moyennes, force dominante avec intention explosive (olympiques, squat/bench rapides)." },
  { q: "Force (accélérative)", color: "#d9695a", lo: 0.5, hi: 0.75, use: "Charges lourdes, hypertrophie / force à vitesse modérée." },
  { q: "Force maximale", color: "#c4503f", lo: 0, hi: 0.5, use: "Charges proches du RM, vitesse très lente (≈ 0,15–0,30 m/s au 1RM)." },
];

const fmtRange = (z) => (z.hi == null ? `> ${String(z.lo).replace(".", ",")}` : z.lo === 0 ? `< ${String(z.hi).replace(".", ",")}` : `${String(z.lo).replace(".", ",")} – ${String(z.hi).replace(".", ",")}`);
const fmtPct = (z) => {
  const a = z.hi == null ? null : benchPct(z.hi);
  const b = z.lo === 0 ? null : benchPct(z.lo);
  if (a == null) return `< ${b}%`;
  if (b == null) return `> ${a}%`;
  return `${a} – ${b}%`;
};

const ORTEGA = [
  ["50 %", "0,87 ± 0,08", "0,81 ± 0,09", "0,92 ± 0,10", "0,82 ± 0,09"],
  ["60 %", "0,70 ± 0,07", "0,64 ± 0,11", "0,70 ± 0,10", "0,63 ± 0,09"],
  ["70 %", "0,61 ± 0,09", "0,55 ± 0,10", "0,57 ± 0,10", "0,51 ± 0,10"],
  ["80 %", "0,49 ± 0,12", "0,42 ± 0,11", "0,42 ± 0,09", "0,36 ± 0,08"],
  ["100 % (1RM)", "0,26 ± 0,11", "0,23 ± 0,06", "0,21 ± 0,10", "0,19 ± 0,07"],
];

const BENCH_V = [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2];

/* Repère de planification : vitesse de barre (VBT) par qualité physique */
export default function VbtTable({ defaultOpen = false }) {
  return (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, color: TEXT, fontWeight: 700, cursor: "pointer" }}>
        ⚡ Table vitesse de barre (VBT) par qualité physique
      </summary>

      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: "left" }}>
              <th style={cell}>Qualité</th>
              <th style={cell}>Vitesse moyenne propulsive (m/s)</th>
              <th style={cell}>≈ % du 1RM (développé couché)</th>
              <th style={cell}>Usage</th>
            </tr>
          </thead>
          <tbody>
            {ZONES.map((z) => (
              <tr key={z.q} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ ...cell, color: z.color, fontWeight: 700 }}>{z.q}</td>
                <td style={{ ...cell, color: TEXT, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtRange(z)}</td>
                <td style={{ ...cell, color: TEXT, whiteSpace: "nowrap" }}>{fmtPct(z)}</td>
                <td style={{ ...cell, color: MUTED }}>{z.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginTop: 6 }}>
        Les zones « puissance max » (0,8–1,0) et « puissance-force » (0,75–1,0) se chevauchent : c'est normal, la vitesse optimale dépend de l'exercice et de l'athlète.
      </div>

      <div style={{ fontSize: 12, color: TEXT, fontWeight: 700, marginTop: 14 }}>Vitesse ↔ % du 1RM au développé couché</div>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: "right" }}>
              <th style={{ ...cell, textAlign: "left" }}>Vitesse (m/s)</th>
              {BENCH_V.map((v) => (
                <th key={v} style={cell}>{String(v).replace(".", ",")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${BORDER}`, textAlign: "right" }}>
              <td style={{ ...cell, textAlign: "left", color: TEXT, fontWeight: 700 }}>% du 1RM</td>
              {BENCH_V.map((v) => (
                <td key={v} style={{ ...cell, color: TEXT, fontWeight: 700 }}>{benchPct(v)}%</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: TEXT, fontWeight: 700, marginTop: 14 }}>Mesures réelles : vitesse moyenne propulsive à chaque % du 1RM (m/s)</div>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: "right" }}>
              <th style={{ ...cell, textAlign: "left" }}>% du 1RM</th>
              <th style={cell}>Squat complet H</th>
              <th style={cell}>Squat complet F</th>
              <th style={cell}>Développé couché H</th>
              <th style={cell}>Développé couché F</th>
            </tr>
          </thead>
          <tbody>
            {ORTEGA.map((r) => (
              <tr key={r[0]} style={{ borderTop: `1px solid ${BORDER}`, textAlign: "right" }}>
                <td style={{ ...cell, textAlign: "left", color: TEXT, fontWeight: 700 }}>{r[0]}</td>
                {r.slice(1).map((c, i) => (
                  <td key={i} style={{ ...cell, color: TEXT }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginTop: 8 }}>
        • Puissance max : Loturco et al. 2015, PLoS ONE 10(10):e0140102 — 109 athlètes élites (athlétisme, rugby/foot US, foot, course longue, combat, tennis) : la puissance moyenne propulsive en jump squat est maximale à une vitesse de 1,01 ± 0,07 m/s (saut ≈ 20 cm), quel que soit le sport. Ça correspond au repère usuel de 0,8–1,0 m/s, mais mesuré en jump squat (charge ≈ pourcentage du poids de corps, pas du 1RM).
        <br />• Développé couché : González-Badillo &amp; Sánchez-Medina 2010, Int J Sports Med 31:347-352 — vitesse au 1RM ≈ 0,16 ± 0,04 m/s ; %1RM = 110,893 − 64,187 × vitesse (r² = 0,96). Les % de la colonne « développé couché » sont calculés avec cette équation.
        <br />• Mesures squat / développé : Fernandez Ortega et al. 2022, Int J Environ Res Public Health 19(11):6756 — 355 jeunes sportifs récréatifs (96 F, 259 H), non entraînés en force : leurs vitesses sont plus lentes que celles d'athlètes entraînés au même %1RM. Écart homme-femme significatif (Torrejón 2019 : le profil charge-vitesse diffère plus entre sexes qu'entre niveaux de force).
        <br />• Noms des zones (vitesse pure, puissance-vitesse, puissance-force, force accélérative, force max) : convention de terrain (résumé Weakley et al. 2020, Strength Cond J 43:31-49), pas des seuils validés par des essais. Les bornes sont des repères.
        <br />• Limites : la relation vitesse ↔ %1RM dépend de l'exercice, du matériel de mesure et de l'athlète, et c'est la vitesse <b>moyenne propulsive</b> (pas la moyenne ni le pic). Pour le squat, la fourchette est plus variable que pour le développé couché ; les fentes et exercices unilatéraux n'ont pas de table publiée. Idéalement, le profil charge-vitesse se mesure individuellement pour chaque athlète.
      </div>
    </details>
  );
}
