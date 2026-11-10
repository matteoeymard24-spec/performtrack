/* =====================================================================
   Reference.jsx — page « Référence » (SUPERADMIN uniquement).
   Explique TOUS les calculs de l'app, par modalité, avec les références.
   Les chiffres (seuils, coefficients, tables) sont LUS DIRECTEMENT dans les
   modules de calcul : si un réglage change dans le code, la page change avec.
   À tenir à jour à chaque nouvelle méthode ajoutée dans l'app.
   ===================================================================== */
import { TH } from "../component/thresholdsCore";
import { RTP_STAGES } from "../component/coachSynthesis";
import { SUPRA_MAX_PCT } from "../component/contraction";
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Page, FoldCard, useFold, PAGE_TITLE, PAGE_SUB, MUTED, TEXT, ACCENT, PageHeader } from "../component/ui";
import {
  REDI_ACUTE_N,
  REDI_ACUTE_LAMBDA,
  REDI_CHRONIC_N,
  REDI_CHRONIC_LAMBDA,
  maxRepsAtPct,
  NEURAL_WINDOW_DAYS,
  NEURAL_PREV_LOOKBACK_DAYS,
  NEURAL_MIN_SETS_PREV,
  PRESC_LOAD_GAP,
  PRESC_RPE_HIGH,
  PRESC_RPE_GAP,
  FORM_LEVELS,
} from "../component/loadMetrics";
import { FOSTER_CR10 } from "../component/sessionLoad";
import { targetRir, UNI_FACTOR, LOSS_WARN, LOSS_STOP } from "../component/loadAdjust";
import { SPRINT_LOSS_WARN, SPRINT_LOSS_STOP } from "../component/sprintFeedback";
import { END_LOSS_WARN, END_LOSS_STOP, END_ADJ } from "../component/enduranceFeedback";
import { COD_SEC } from "../component/enduranceTarget";
import { VBT_LOSS_WARN, VBT_LOSS_STOP } from "../component/vbt";
import { Z_LOOKBACK_WEEKS, Z_MIN_WEEKS, Z_SD_FLOOR_CV, Z_SD_FLOOR_MIN } from "../component/weekRealized";
import { ZONES, DEFAULT_CS_VMA_RATIO, HR_MIN_EFFORT_SEC } from "../component/drillBank";
import { LEVELS, LEVEL_ORDER, FAMILY_RATIO, FAMILY_LABEL, BRONCO_RECORD_S } from "../component/rugbyLevels";
import { PRO_DATA, MASS_RATIO, BF_ADD, BF_DXA, BF_SKINFOLD, SILVER_SD, GOLD_SD, medalTargets } from "../component/morphology";
import { HIP_THRUST_FACTOR, BROAD_SD } from "../component/norms";
import { BLOCK_TYPES } from "../component/blockType";

const fr = (x, d = 1) => (x == null || Number.isNaN(x) ? "—" : String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ","));
const pctTxt = (r) => `${r >= 1 ? "+" : "−"}${fr(Math.abs((r - 1) * 100), 1)} %`;
const P = ({ children }) => <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.65, color: MUTED }}>{children}</p>;
const H = ({ children }) => <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: "14px 0 6px" }}>{children}</div>;
const F = ({ children }) => (
  <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5, color: ACCENT, background: "#0d0c0a", border: "1px solid #2a2620", borderRadius: 8, padding: "8px 10px", margin: "6px 0 10px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
    {children}
  </div>
);
const Ref = ({ children }) => <div style={{ fontSize: 11.5, color: "#8e877e", marginTop: 6, lineHeight: 1.5 }}>📚 {children}</div>;
const Est = () => <span style={{ fontSize: 11, color: "#d9a441", border: "1px solid #d9a441", borderRadius: 999, padding: "0 6px", marginLeft: 6 }}>estimation</span>;
const T = ({ head, rows }) => (
  <div style={{ overflowX: "auto", margin: "6px 0 10px" }}>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} style={{ textAlign: i ? "right" : "left", padding: "5px 8px", color: MUTED, fontWeight: 600, borderBottom: "1px solid #2a2620", whiteSpace: "nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid #1d1a16" }}>
            {r.map((c, j) => (
              <td key={j} style={{ textAlign: j ? "right" : "left", padding: "5px 8px", color: j ? "#d8d2c9" : TEXT, whiteSpace: "nowrap" }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function Reference({ embedded = false }) {
  const { isSuperAdmin } = useAuth();
  const fold = useFold("reference", ["charge", "fiche", "muscu", "sprint", "endurance", "forme", "normes", "morpho", "biblio"]);
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const lvlLabel = (id) => LEVELS.find((l) => l.id === id)?.label || id;
  const pctRows = [60, 65, 70, 75, 80, 85, 90];
  const repCols = [3, 5, 6, 8, 10, 12];
  const rirCell = (p, r, uni) => {
    const t = targetRir(p, r, uni);
    if (!t) return "—";
    return t.impossible ? "✗" : t.rir >= 5 ? "5+" : String(t.rir);
  };

  // embedded : affichée dans Paramètres › 📚 Référence (sans son propre cadre de page)
  const Wrap = embedded ? React.Fragment : Page;
  return (
    <Wrap>
      {!embedded && (
        <PageHeader
          eyebrow="Superadmin"
          title="📚 Référence"
          subtitle="Tous les calculs de l'app, modalité par modalité, avec leurs sources. Les chiffres sont lus directement dans le code de calcul : ils se mettent à jour tout seuls."
        />
      )}

      {/* ============ CHARGE ============ */}
      <FoldCard id="charge" fold={fold} title="⚖️ Charge d'entraînement (sRPE, REDI, monotonie)">
        <H>Charge d'une séance</H>
        <F>charge (UA) = note globale de séance (0-10, échelle de Foster) × durée réelle (min)</F>
        <P>
          Note demandée à la fin de chaque séance (« Terminer la séance »), une seule pour toute la séance, quelle que soit la
          modalité (muscu, sprint, endurance, séance mixte). Durée = celle confirmée par l'athlète (sinon la durée prévue, sinon 60 min ;
          une durée &gt; 300 min est ignorée). Anciennes séances sans note globale : moyenne des RPE saisis × durée prévue.
        </P>
        <T head={["Note", "Libellé (Foster CR-10)"]} rows={Object.entries(FOSTER_CR10).map(([k, v]) => [k, v])} />
        <P>
          Pourquoi une note globale : en muscu le RPE vient des reps en réserve, en sprint / endurance c'est l'effort perçu — deux échelles
          différentes ; les mélanger fausserait la charge. Foster recommande la note ~30 min après la séance (compromis : à la fin).
        </P>
        <Ref>Foster et al. 2001, J Strength Cond Res 15:109 · Day et al. 2004 et Sweet et al. 2004 (sRPE en musculation) · sRPE et distance à très haute vitesse chez les sprinteurs : IJSPP 2024 19(8):792.</Ref>

        <H>REDI (charge aiguë / chronique)</H>
        <F>{`REDI = Σ e^(−λ·i) × charge(jour i) / Σ e^(−λ·i)   (jours SANS séance ignorés, pas comptés à 0)
aigu : ${REDI_ACUTE_N} jours, λ = ${fr(REDI_ACUTE_LAMBDA, 2)}    chronique : ${REDI_CHRONIC_N} jours, λ = ${fr(REDI_CHRONIC_LAMBDA, 2)}
ratio = REDI aigu / REDI chronique`}</F>
        <T
          head={["Ratio", "Zone"]}
          rows={[
            ["< 0,8", "Charge en baisse"],
            ["0,8 – 1,3", "Charge stable"],
            ["1,3 – 1,5", "Charge en hausse"],
            ["> 1,5", "Forte hausse"],
          ]}
        />
        <P>
          Les libellés sont volontairement descriptifs (« charge en hausse », pas « risque ») : le ratio aigu / chronique dit comment la
          charge récente évolue par rapport à l'habitude, mais seul il ne prédit pas la blessure (couplage mathématique entre les deux
          termes, faible valeur prédictive). L'app ne s'en sert donc jamais seul pour une alerte : il est croisé avec le wellness, le CMJ,
          la force, la monotonie et la variation de charge (voir « Fiche athlète » ci-dessous).
        </P>
        <P>
          Une séance compte pour un athlète seulement s'il l'a démarrée ET terminée (peu importe qui l'a créée, séance « Moi » comprise).
          Le ratio est aussi comparé à l'historique propre de l'athlète (z-score, ≥ 1,5 ou ≤ −1,5 = inhabituel), car les zones fixes
          sont des moyennes de population.
        </P>
        <H>Monotonie et strain</H>
        <F>{`monotonie = moyenne des charges des 7 derniers jours / écart-type   (< 1,5 saine · 1,5-2 modérée · ≥ 2 élevée)
strain = charge de la semaine × monotonie   (comparé à l'historique propre : z > 0,5 plus haut, > 1,5 inhabituel)`}</F>
        <H>Fiabilité du RPE déclaré</H>
        <P>Écart-type des RPE moyens des 20 dernières séances (minimum 5) : &lt; 0,4 = déclaration peu variable, à vérifier avec l'athlète.</P>
        <Ref>Moussa et al. 2020, Frontiers in Physiology (REDI) · Foster 1998, Med Sci Sports Exerc 30:1164 (monotonie / strain) · Gabbett 2016, Br J Sports Med 50:273 (zones du ratio) · Impellizzeri et al. 2020, Int J Sports Physiol Perform 15:907 et Wang et al. 2020, Sports Med 50:1243 (limites du ratio aigu / chronique).</Ref>
      </FoldCard>

      {/* ============ FICHE ATHLÈTE (COACH) ============ */}
      <FoldCard id="fiche" fold={fold} title="🚦 Fiche athlète du coach (synthèse, prévu / réalisé, retour au jeu, force relative)">
        <P>
          Le dashboard de l'athlète suit la même organisation (mêmes pôles, mêmes feux), avec un message « Pour aujourd'hui » à la
          place de la décision du coach et sans la charge prévue. La fiche d'un athlète (Dashboard › clic sur l'athlète) range les outils en 3 pôles : charge (ce qu'il encaisse), récupération
          (comment il l'encaisse), entraînement (ce que ça produit). Les seuils ci-dessous se règlent dans Paramètres › Seuils › « Synthèse
          de la fiche athlète ».
        </P>
        <H>Charge de la semaine : prévu / réalisé</H>
        <F>{`prévu (UA) = Σ RPE prévu × durée prévue des séances datées dans la semaine   (RPE prévu = celui du coach, sinon le RPE automatique)
réalisé (UA) = Σ note de séance × durée réelle des séances terminées   (rangées dans la semaine où elles ont été faites)
% réalisé = réalisé / prévu   (semaine en cours : seulement les séances déjà dues ou déjà faites)`}</F>
        <H>Dynamique de charge</H>
        <F>{`variation = (charge des 7 derniers jours − moyenne hebdo des 3 semaines d'avant) / moyenne hebdo des 3 semaines d'avant
monotonie = charge moyenne par jour / écart-type sur 7 jours        contrainte = charge de la semaine × monotonie
contrainte habituelle = moyenne des contraintes des 4 semaines précédentes`}</F>
        <P>
          La variation est comparée à 3 semaines (et pas à la seule semaine d'avant) pour qu'une semaine creuse ne donne pas un pourcentage
          démesuré. Les 7 derniers jours ne sont pas dans la référence : les deux termes ne se recouvrent pas.
        </P>
        <H>Feu du pôle charge</H>
        <T
          head={["Feu", "Règle"]}
          rows={[
            ["Alerte", `variation ≥ +${TH("synthJumpAlert")} %, ou variation ≥ +${TH("synthJumpWatch")} % avec monotonie ≥ ${fr(TH("synthMonoHigh"), 1)} ou REDI > ${fr(TH("rediVeryHigh"), 2)}`],
            ["Vigilance", `variation ≥ +${TH("synthJumpWatch")} %, ou monotonie ≥ ${fr(TH("synthMonoHigh"), 1)}, ou REDI > ${fr(TH("rediHigh"), 2)}`],
            ["Sous-charge", `variation ≤ −${TH("synthDropUnder")} %, ou moins de ${TH("synthComplianceLow")} % de la charge prévue réalisée la semaine dernière, ou REDI < ${fr(TH("rediUnder"), 2)}`],
            ["OK", "aucun de ces signaux"],
          ]}
        />
        <H>Reprise après coupure</H>
        <P>
          Le REDI ignore les jours sans séance. Après une coupure, son terme « récent » ne contient donc que la ou les séances de reprise :
          le ratio monte dès qu'elles sont un peu plus dures que la moyenne, alors que l'athlète sort d'une période de repos. Dès que la
          première séance des 7 derniers jours suit au moins {TH("resumeGapDays")} jours sans séance, l'app parle de « reprise » : le ratio
          n'est plus compté comme fatigue dans l'état de forme, et le pôle charge compare seulement la semaine à sa semaine habituelle
          (semaines vides exclues). Il passe en vigilance uniquement si la reprise dépasse déjà cette habitude de {TH("synthJumpWatch")} %.
        </P>
        <H>Douleurs du jour</H>
        <P>
          Lues sur le schéma corporel du wellness (intensité 0-10 et type par zone). Vigilance à partir de {TH("synthPainWatch")}/10,
          alerte à partir de {TH("synthPainAlert")}/10 ou dès qu'une zone au-dessus du seuil de vigilance est de type aigu, nerveux ou
          articulaire. De simples courbatures sous le seuil d'alerte sont affichées sans changer le feu. Croisements : une douleur sur la
          zone d'une blessure en cours bloque la proposition de passer à l'étape suivante du retour au jeu ; une douleur avec une charge en
          hausse ajoute « ne rien ajouter cette semaine » à la décision. La zone blessée est reconnue par les mots communs entre la zone du
          schéma et le nom ou la zone de la blessure : c'est une aide, à vérifier.
        </P>
        <H>Feu du pôle récupération</H>
        <P>
          Il reprend les domaines « bien-être » (wellness, effort perçu) et « neuromusculaire » (CMJ, force) de l'état de forme : alerte si
          l'un des deux est en alerte ou si les deux sont en vigilance ; vigilance si un seul est en vigilance ou si l'athlète est malade ;
          une blessure en cours ou récente met au minimum en vigilance, tout comme une douleur du jour au-dessus du seuil. La charge n'entre
          pas dans ce feu : elle a le sien.
        </P>
        <H>Feu du pôle entraînement</H>
        <P>
          Vigilance si moins de {TH("synthComplianceLow")} % des séances prévues sont faites sur 3 semaines, ou si aucun RM suivi n'a
          progressé depuis {TH("synthStagnWeeks")} semaines (meilleur RM de la période comparé au meilleur d'avant). Le point faible affiché
          est le mouvement le moins bien noté du barème.
        </P>
        <H>Décision proposée</H>
        <T
          head={["Récupération", "Charge", "Proposition"]}
          rows={[
            ["Alerte", "Alerte / vigilance", "−30 à −40 % de volume, pas d'intensité maximale, recontrôle wellness et CMJ"],
            ["Alerte", "OK / sous-charge", "cause à chercher hors entraînement, séance allégée d'environ 20 %"],
            ["Vigilance", "Alerte", "stabiliser : pas d'augmentation, 1 à 2 séries en moins par exercice"],
            ["Vigilance", "autre", "séance prévue, ajustée à l'échauffement"],
            ["OK", "Alerte", "ne rien ajouter, lisser la charge sur 7 jours"],
            ["OK", "Vigilance", "séance prévue, sans volume supplémentaire"],
            ["OK", "Sous-charge", "remonter de 10 à 15 % par semaine"],
            ["OK", "OK", "appliquer la séance prévue"],
          ]}
        />
        <P>
          Ces propositions sont des repères de terrain, pas des règles validées par une étude : elles servent à gagner du temps de lecture,
          la décision reste celle du coach. Une blessure en cours passe devant tout le reste (suivre le retour au jeu).
        </P>
        <H>Retour au jeu</H>
        <T head={["Étape", "Objectif", "Critères de passage"]} rows={RTP_STAGES.map((s) => [`${s.id}. ${s.label}`, s.goal, s.criteria.map((c) => c.t.replace("{p}", TH(c.auto === "loadFull" ? "rtpLoadFull" : "rtpLoadPartial"))).join(" · ")])} />
        <P>
          On avance sur des critères, pas sur un délai. Les deux critères de charge sont calculés : charge des 7 derniers jours ÷ charge
          hebdomadaire moyenne des 4 semaines qui précèdent la blessure. Sans historique avant la blessure, le coach les coche à la main.
          Trame générale : elle ne remplace pas l'avis du médecin ou du kiné, qui décident du retour.
        </P>
        <H>Force relative</H>
        <F>force relative = meilleur RM du mouvement / poids de corps (dernière pesée)</F>
        <P>
          Mouvements de référence : squat, développé couché, développé militaire, RDL, hip thrust, trap bar, tirage planche, traction. La
          note /20 est celle du barème du poste et du niveau (voir « Normes rugby ») ; sans sport, poste ou niveau dans le profil, seule la
          force relative est affichée.
        </P>
        <Ref>Foster 1998, Med Sci Sports Exerc 30:1164 (monotonie / contrainte) · Foster et al. 2001, J Strength Cond Res 15:109 (sRPE) · Ardern et al. 2016, Br J Sports Med 50:853 (consensus sur le retour au sport : progression par critères) · Impellizzeri et al. 2020, Int J Sports Physiol Perform 15:907 (limites du ratio aigu / chronique).</Ref>
      </FoldCard>

      {/* ============ MUSCU ============ */}
      <FoldCard id="muscu" fold={fold} title="💪 Musculation (RIR, RM, charge conseillée)">
        <H>Saisie : reps en réserve (RIR)</H>
        <F>RPE enregistré = 10 − RIR   (boutons 0, 1, 2, 3, 4, 5+ ; 5+ → RPE 5)</F>
        <Ref>Zourdos et al. 2016, J Strength Cond Res 30:267 (échelle RPE basée sur les reps en réserve) · Hackett et al. 2012 (précision près de l'échec) · Halperin et al. 2022, Sports Med 52:377 (erreur ≈ 1 rep, plus grande loin de l'échec).</Ref>

        <H>RIR visé (affiché à la construction, dans la séance et le feedback)</H>
        <F>{`RIR visé = reps max possibles à ce %RM − reps prévues   (nombre entier, les demis arrondis vers le haut)
unilatéral : reps max PAR CÔTÉ = 1 + (reps max bilatérales − 1) × ${fr(UNI_FACTOR, 2)}`}</F>
        <P>Table (bilatéral) — ✗ = prescription impossible (plus de reps que le maximum à ce %) :</P>
        <T head={["%RM \\ reps", ...repCols.map(String), "reps max"]} rows={pctRows.map((p) => [`${p} %`, ...repCols.map((r) => rirCell(p, r, false)), fr(maxRepsAtPct(p))])} />
        <P>Même table en unilatéral (reps par côté) :</P>
        <T head={["%RM \\ reps/côté", ...repCols.map(String)]} rows={pctRows.map((p) => [`${p} %`, ...repCols.map((r) => rirCell(p, r, true))])} />
        <P>
          Unilatéral : le RIR se compte par côté (le RM de référence est un RM par côté), mais à % égal on fait moins de reps qu'en bilatéral
          (≈ −14 %). <Est />
        </P>
        <Ref>Table reps ↔ %1RM : Helms et al. 2016, Strength Cond J 38:42 ; Zourdos 2016 · unilatéral : Costa et al. 2015, Biology of Sport 32:35.</Ref>

        <H>RM estimé du jour et charge de la série suivante</H>
        <F>{`e1RM = charge / %1RM(reps + RIR)   (séries avec RIR ≤ 4 et ≤ 12 reps à l'échec ; unilatéral : côté le plus faible)
charge série suivante = e1RM × %1RM(reps prévues + RIR visé)   (arrondi 1 kg, ± 10 % max par série)
perte = baisse de l'e1RM vs la 1re série   (≤ ${LOSS_WARN} % stable · ${LOSS_WARN}-${LOSS_STOP} % fatigue · > ${LOSS_STOP} % alléger / arrêter)`}</F>
        <P>« Prochaine séance au même schéma » = meilleure série du jour × %1RM(reps prévues + RIR visé). <Est /></P>
        <Ref>Méthode RPE / e1RM (Tuchscherer, RTS) ; Helms et al. 2018, Front Physiol (autorégulation par RPE).</Ref>

        <H>Tractions (poids du corps lesté)</H>
        <F>{`RM traction = poids du corps (profil) + lest   ex. 65 kg + 10 kg = 75 kg
saisie = lest ajouté (0 = poids du corps seul) · charge conseillée affichée en lest (total − poids du corps)
lest négatif = assistance (élastique) de cette valeur`}</F>
        <P>Même logique que les barèmes « Traction (charge totale) » (standards SU Agen). Le poids du corps vient du profil de l'athlète.</P>
        <H>Excentrique supramax et isométrie (au-dessus de 100 %)</H>
        <F>{`Régime par exercice : classique · excentrique · iso overcoming · iso yielding
charge = RM × %  (jusqu'à ${SUPRA_MAX_PCT} %)   ex. RM 100 kg à 110 % = 110 kg
classique > 100 % → signalé impossible
excentrique / iso → pas de RIR prédit, pas de charge conseillée, jamais utilisé pour le RM`}</F>
        <P>
          La force excentrique dépasse la force concentrique d'environ 20 à 60 %, d'où les charges supramaximales en excentrique.
          En iso overcoming, au-dessus de 100 % la barre ne bouge pas : c'est l'effort maximal qui fait l'intensité.
          La table %RM ↔ reps n'est valable qu'en concentrique, d'où l'exclusion de ces séries des calculs.
          Sans exclusion, 3 reps excentriques à 110 % donneraient un RM estimé d'environ 117 %, ce qui fausserait toutes les charges.
          Les anciens exercices avec le tempo « ISO » sont traités comme iso yielding.
        </P>
        <Ref>Hollander et al. 2007, J Strength Cond Res 21:34 · Oranchuk et al. 2019, Scand J Med Sci Sports 29:484.</Ref>
        <H>Mise à jour automatique des RM (fin de séance)</H>
        <P>
          Blocs muscu seulement, hors échauffement, poids du corps et élastique. Séries retenues : ≤ 6 reps et RPE ≥ 8 (RIR ≤ 2).
          RM prédit par série avec la table RPE, puis MÉDIANE des séries (robuste à une série aberrante). Historique des 20 dernières valeurs.
          Page « Mes RM » (courbes, bouton Reconstruire) : séries ≤ 10 reps et RPE ≥ 7.
        </P>
        <H>Alertes de prescription</H>
        <P>
          « Charge » : charge réalisée ≥ {fr(PRESC_LOAD_GAP * 100, 0)} % sous la charge prévue avec RPE ≥ {PRESC_RPE_HIGH}. « RPE » : charge
          proche du prévu mais RPE ≥ {PRESC_RPE_HIGH} alors que le RPE attendu (table) est ≥ {PRESC_RPE_GAP} points plus bas.
        </P>
        <P>Hip thrust sans barème : barème du squat × {fr(HIP_THRUST_FACTOR, 1)}. <Est /></P>
      </FoldCard>

      {/* ============ SPRINT ============ */}
      <FoldCard id="sprint" fold={fold} title="⚡ Sprint">
        <F>{`saisie : chrono de chaque rep (+ case « rep faite ») — pas de RPE par rep
%Sdec = (somme des temps / (meilleur temps × n) − 1) × 100
perte d'une rep = (temps − meilleur) / meilleur   (> ${SPRINT_LOSS_WARN} % : la vitesse max n'est plus travaillée · > ${SPRINT_LOSS_STOP} % : fatigue nette)`}</F>
        <P>
          Pas de RPE par rep : sur 2-4 s, l'effort paraît plus facile qu'il n'est et chaque rep est à fond (notes 8-10 sans information).
          Le chrono mesure la fatigue objectivement ; la charge passe par la note globale de séance.
        </P>
        <Ref>Fitzsimons 1993 ; Glaister 2008 ; Girard, Mendez-Villanueva & Bishop 2011, Sports Med 41:673 (%Sdec) · seuil 5 % : JSCR 2023 37(8):1566 ; Sun et al. 2026, Front Physiol.</Ref>
        <H>Barème sprint 60 m (sans barème club)</H>
        <P>Modèle mono-exponentiel v(t) = Vmax·(1 − e^(−t/τ)), τ calé sur le 20 m et la Vmax du barème. <Est /></P>
        <Ref>Furusawa 1927 ; Samozino et al. 2016, Scand J Med Sci Sports 26:648.</Ref>
      </FoldCard>

      {/* ============ ENDURANCE ============ */}
      <FoldCard id="endurance" fold={fold} title="🏃 Endurance (zones, FC, intermittent)">
        <H>Zones d'entraînement (en % de la vitesse critique)</H>
        <T
          head={["Zone", "% vitesse critique", "% FC max", "Ressenti"]}
          rows={ZONES.map((z) => [z.name, z.max >= 400 ? `> ${z.min}` : `${z.id === 1 ? 60 : z.min}-${z.max}`, z.fcPct ? `${z.fcPct[0]}-${z.fcPct[1]}` : "non pertinente", z.feel])}
        />
        <P>
          Exos en % VMA convertis en % VC avec le ratio VC/VMA de l'athlète, sinon ≈ {fr(DEFAULT_CS_VMA_RATIO, 2)}. FC cible = FC max de référence ×
          % de la zone (plus haute FC mesurée en test ; formule de Tanaka 208 − 0,7 × âge seulement à défaut). FC non affichée pour les
          efforts &lt; {HR_MIN_EFFORT_SEC / 60} min (la FC met 1 à 3 min à monter). Correspondance VC ↔ FC <Est />
        </P>
        <Ref>Seiler & Kjerland 2006, Scand J Med Sci Sports 16:49 ; Seiler 2010, IJSPP 5:276 (seuils ventilatoires en % FC max) · Jones et al. 2019, Med Sci Sports Exerc 51:2185 (vitesse critique) · Tanaka et al. 2001, J Am Coll Cardiol 37:153.</Ref>

        <H>Intermittent (30/30, 15/15…) : distance par rep</H>
        <F>{`cible d'une rep = vitesse de référence × % prescrit × temps d'effort   (× 0,88 si passage au sol)
% de la cible = distance moyenne / cible · perte (%Sdec) = (1 − moyenne / meilleure) × 100
alerte perte : > ${END_LOSS_WARN} % · fatigue nette : > ${END_LOSS_STOP} %`}</F>
        <H>Exercice défini en distance (chrono visé) ou en temps (mètres à faire)</H>
        <F>{`Distance fixée → chrono visé = distance / (référence × %) + demi-tours × ${String(COD_SEC).replace(".", ",")} s
  parcours aller-retour « 20-40-60 » × 5 tours (Bronco) = 1200 m, 29 demi-tours
  ex. VMA 16 km/h à 100 % : 1200 / 4,44 = 270 s + 29 × 0,7 ≈ 20 s → ≈ 4:50
Temps fixé + navette N m → distance = vitesse × (temps − demi-tours × ${String(COD_SEC).replace(".", ",")} s)
  ex. 30 s à 16 km/h en navette de 20 m ≈ 118 m (≈ 5,9 navettes) au lieu de 133 m en ligne droite
Passage sol : −12 % de distance (temps fixé) ou chrono ÷ 0,88 (distance fixée)
Feedback en distance : chrono par rep → distance équivalente = distance × chrono visé / chrono réalisé
  (proportionnelle à la vitesse) → mêmes % de la cible, %Sdec et ajustement qu'en temps fixé`}</F>
        <P>
          La durée d'effort d'un exercice défini en distance est estimée automatiquement. Elle sert à la durée de séance, à la frise des zones et à la FC cible.
          Elle est calculée avec ta VMA, ou 15 km/h si aucune n'est connue. L'athlète voit, lui, le chrono calculé avec sa propre VMA ou vitesse critique.
          Les 0,7 s par demi-tour sont une règle pratique (ESTIMATION) : le coût réel augmente avec la vitesse d'arrivée.
        </P>
        <Ref>Correction des demi-tours en navette : Buchheit & Laursen 2013, Sports Med 43:313 (individualisation des intermittents en navette).</Ref>
        <H>EMOM et AMRAP en endurance</H>
        <F>{`Un tour = les exercices du bloc enchaînés (chacun en distance → chrono visé, ou en temps → mètres)
EMOM : récup par tour = intervalle − durée du tour (signalé si le tour dure plus que l'intervalle)
  ex. 200 m en navettes de 20 m à 110 % d'une VMA de 16 km/h : 47 s → 13 s de récup, 10 tours = 2000 m
  feedback : chrono (bloc en distance) ou distance (bloc en temps) de chaque tour → % cible, %Sdec, ajustement
AMRAP : tours visés = durée totale / durée du tour ; distance visée = tours × distance du tour
  feedback : tours faits + mètres du tour non terminé → % de la distance visée → ajustement du bloc suivant`}</F>
        <P>L'ajustement d'un bloc EMOM / AMRAP s'applique au bloc d'endurance suivant, qu'il soit classique, EMOM ou AMRAP.</P>
        <H>Ajustement du bloc d'endurance suivant</H>
        <F>{`niveau tenu = moyenne de la 2e moitié des reps
< ${fr(END_ADJ.low * 100, 0)} % de la cible → % suivant × (niveau tenu / cible), baisse max ${pctTxt(END_ADJ.maxDown)}
≥ ${fr(END_ADJ.high * 100, 0)} % et perte ≤ ${END_ADJ.maxSdecForUp} % → hausse, max ${pctTxt(END_ADJ.maxUp)}
sinon → même cible`}</F>
        <P>Propre à chaque athlète, affiché comme « Cible ajustée pour toi » ; ne modifie pas la séance du coach. <Est /></P>
        <Ref>Billat 2001, Sports Med 31:13 ; Buchheit & Laursen 2013, Sports Med 43:313 (régler l'intensité sur ce que l'athlète tient).</Ref>

        <H>Tests d'endurance</H>
        <P>
          VMA (Léger, VAMEVAL, Cooper = distance / 200, 6 min = distance / 100), VO2max ≈ 5,857 × VMA − 19,458 ; 30-15 IFT (VIFT,
          VO2max par la régression de Buchheit 2008) ; vitesse critique = pente distance / temps de 2 à 4 efforts maximaux, D' = ordonnée.
        </P>
      </FoldCard>

      {/* ============ FORME ============ */}
      <FoldCard id="forme" fold={fold} title="🩺 État de forme, wellness, CMJ, fatigue nerveuse">
        <H>Wellness</H>
        <F>{`score (0-10) = (sommeil + motivation + nutrition + hydratation + (10 − fatigue) + (10 − stress) + (10 − douleur)) / 7
z-score vs historique propre (28 j) : ≤ −0,5 en baisse · ≤ −1,5 très dégradé`}</F>
        <H>CMJ</H>
        <P>Écart à la moyenne propre des 28 derniers jours (min. 3 tests) : −5 % baisse modérée · −10 % chute significative.</P>
        <Ref>Claudino et al. 2017, J Sci Med Sport 20:397 (CMJ et état neuromusculaire).</Ref>
        <H>Fatigue nerveuse (force)</H>
        <P>
          e1RM médian par exercice sur la dernière séance (≤ {NEURAL_WINDOW_DAYS} j) comparé à la séance précédente (≤ {NEURAL_PREV_LOOKBACK_DAYS} j,
          ≥ {NEURAL_MIN_SETS_PREV} séries) : baisse ≥ {fr(TH("neuralDrop"), 0)} % ou e1RM &lt; {fr(TH("neuralRmFloor"), 0)} % du RM = signal (seuils réglables dans ⚙️ Paramètres).
          Alerte si au moins la moitié des exercices sont concernés.
        </P>
        <H>Classification</H>
        <P>
          3 domaines notés 0 / 1 / 2 : charge (REDI &gt; 1,3 / &gt; 1,5), bien-être (z ≤ −0,5 / ≤ −1,5 ; sinon score &lt; 6,5 / &lt; 5),
          fatigue nerveuse (force + CMJ). Plusieurs domaines qui convergent montent d'un cran ; une fatigue nerveuse forte classe
          « Fatigué » ; un signal de force isolé reste une vigilance.
        </P>
        <T head={["Niveau", "Signification"]} rows={Object.values(FORM_LEVELS).map((l) => [`${l.emoji} ${l.label}`, ["Risque", "Fatigué", "Surveiller", "En forme", "—"][l.rank]])} />
        <Ref>Saw, Main & Gastin 2016, Br J Sports Med 50:281 (mesures subjectives vs objectives).</Ref>
      </FoldCard>

      {/* ============ NORMES ============ */}
      <FoldCard id="normes" fold={fold} title="🏉 Normes rugby par niveau (tests physiques)">
        <P>
          Pro D2 = barème SU Agen, note 10/20 (validé par les 1RM des pros d'Agen 2026-27 : médiane du poste ≈ note 9 à 12). Bronco Pro D2 =
          données SU Agen 2023-25 + 30e centile Super Rugby. Autres niveaux = Pro D2 × écart propre à la famille de qualité :
        </P>
        <T
          head={["Famille", ...LEVEL_ORDER.map(lvlLabel)]}
          rows={Object.entries(FAMILY_RATIO).map(([fam, arr]) => [FAMILY_LABEL[fam] || fam, ...arr.map((r) => pctTxt(r))])}
        />
        <P>
          Écarts petits en haut (Pro D2 → Top 14 → International), grand saut entre Nationale et Fédérale 1 ; la force varie le plus, la vitesse
          le moins. Pour un temps (sprint, Bronco), le temps du niveau = temps Pro D2 ÷ rapport. <Est />
        </P>
        <P>
          Médailles : bronze = seuil du niveau ; argent / or = écart du barème entre les notes 10 → 15 → 20, ramené au niveau. Bronco : or plafonné
          par le record ({Math.floor(BRONCO_RECORD_S / 60)}'{String(BRONCO_RECORD_S % 60).padStart(2, "0")}") ramené au poste. Broad jump : écart-type {fr(BROAD_SD)} cm.
        </P>
        <Ref>
          Smart et al. 2013, J Strength Cond Res (1 161 joueurs NZ) · Argus et al. 2012, J Strength Cond Res · Fontana et al. 2015, IJSPP 10:1003 · Payne et al. 2025,
          J Strength Cond Res (revue systématique) · Weakley et al. 2026, J Strength Cond Res (Bronco Super Rugby) · Posthumus et al. 2020, Sports 8:85 (broad jump) ·
          Darrall-Jones et al. 2016, IJSPP (30-15).
        </Ref>
      </FoldCard>

      {/* ============ MORPHO ============ */}
      <FoldCard id="morpho" fold={fold} title="📏 Morphologie (poids, taille, masse maigre)">
        <F>{`bronze = moyenne du niveau · argent = moyenne + ${fr(SILVER_SD, 1)} écart-type · or = moyenne + ${fr(GOLD_SD, 1)} écart-type
note /20 : moyenne − 2 ET = 0 · moyenne = 10 · argent = 15 · or = 20
masse maigre = poids × (1 − % de gras de référence DXA du niveau)`}</F>
        <T
          head={["Poste", "Top 14 (moy / ET / n)", "Pro D2 (moy / ET / n)", "XV de France", "Intl 🥉/🥈/🥇"]}
          rows={Object.entries(PRO_DATA).map(([k, d]) => {
            const m = medalTargets(k, "international");
            return [k, `${fr(d.t14[0])} / ${fr(d.t14[1])} / ${d.t14[2]}`, `${fr(d.p2[0])} / ${fr(d.p2[1])} / ${d.p2[2]}`, `${fr(d.fr[0])} (n=${d.fr[1]})`, m ? `${fr(m.bm.bronze)} / ${fr(m.bm.silver)} / ${fr(m.bm.gold)}` : "—"];
          })}
        />
        <T
          head={["Niveau amateur", "Poids avants", "Poids arrières", "% gras en +"]}
          rows={Object.entries(MASS_RATIO).map(([k, v]) => [lvlLabel(k), `× ${fr(v.fw, 2)}`, `× ${fr(v.bk, 2)}`, `+ ${fr(BF_ADD[k] || 0)} pt`])}
        />
        <P>
          % de gras de référence (pros, DXA) : avants {fr(BF_DXA.forwards[0])} ± {fr(BF_DXA.forwards[1])} %, arrières {fr(BF_DXA.backs[0])} ± {fr(BF_DXA.backs[1])} %
          (≈ {fr(BF_SKINFOLD.forwards)} / {fr(BF_SKINFOLD.backs)} % aux plis cutanés). Niveaux amateurs <Est />
        </P>
        <Ref>Fiches officielles LNR 2026-27 (Top 14 : 804 joueurs, Pro D2 : 686) et XV de France (Tournoi 2026) · Fontana et al. 2015 · Sedeaud et al. 2013 · Posthumus et al. 2020 (DXA) · Crewther et al. 2009, J Sports Sci 27:1575 (force ramenée au poids).</Ref>
      </FoldCard>

      {/* ============ SÉANCES ============ */}
      <FoldCard id="seances" fold={fold} title="🗂️ Séances mixtes, durée estimée, qui fait la séance">
        <P>
          Chaque bloc a son type ({BLOCK_TYPES.map((b) => b.label).join(", ")}) ; un bloc sans type prend celui de la séance. Le type du bloc décide
          du formulaire, du feedback, des RM (blocs muscu seulement) et de la durée estimée (formule du type, additionnée bloc par bloc).
        </P>
        <H>Méthodes d'entraînement</H>
        <F>{`PAR EXERCICE (méthode de série)
cluster    : séries coupées en mini-séries (ex. 4 × (2+2+2), 20 s de pause) → jamais utilisé pour le RM (les pauses faussent le RIR)
rest-pause : série principale + mini-séries (10-20 s) → RM sur la série principale (RIR de la principale)
drop set   : série puis baisse de x % sans repos (charges proposées) → RM sur la 1re série
120-80     : à chaque série ① x reps en excentrique seul à ~120 % (partenaires remontent la barre) ② décharger à ~80 %
             ③ y reps classiques à 80 % → pas de RIR prédit, pas de RM (supramaximal)
PAR BLOC
(un bloc classique enchaîne déjà ses exercices sans pause = superset / circuit)
French contrast    : ① lourd 80-90 % · ② pliométrie · ③ saut chargé 20-30 % · ④ plio assistée — enchaînés sans pause, 3-5 min entre les tours
complex            : lourd → explosif du même geste, sans pause
durée estimée : + pauses des mini-séries / drops / déchargement (120-80) ; contraste = repos du bloc entre les tours`}</F>
        <Ref>Tufano et al. 2017, Sports Med 47:2065 (cluster) · Haff et al. 2008, Strength Cond J 30:67 · Prestes et al. 2019, J Strength Cond Res 33:S113 (rest-pause) · Schoenfeld & Grgic 2018, Strength Cond J 40:107 (drop set) · Seitz & Haff 2016, Sports Med 46:231 (potentialisation post-activation, contrastes) · Cometti, méthodes 120-80 et contrastes.</Ref>
        <H>Vitesse de barre (VBT, optionnelle)</H>
        <F>{`vitesse cible = saisie par le coach, sinon calculée depuis le %RM prescrit :
  squat (dos / avant)  %1RM = −5,961·v² − 50,71·v + 117   ex. 80 % → 0,68 m/s
  développé couché     %1RM = 110,893 − 64,187·v          ex. 70 % → 0,64 m/s
  autres exercices : pas d'équation fiable → pas de cible automatique
feedback : vitesse moyenne de chaque série (facultative)
  écart à la cible (vert ≥ −0,03 · orange ≥ −0,08 · rouge)   perte vs meilleure série : > ${VBT_LOSS_WARN} % fatigue, > ${VBT_LOSS_STOP} % arrêter
  conseil : moyenne < cible − 0,05 → baisser · > cible + 0,05 → monter`}</F>
        <Ref>Sánchez-Medina et al. 2017, Int J Sports Med 38:480 · González-Badillo & Sánchez-Medina 2010, Int J Sports Med 31:347 · Pareja-Blanco et al. 2017, Scand J Med Sci Sports 27:724 · Weakley et al. 2021, Strength Cond J 43:31. Équations établies sur sujets entraînés : une estimation, à affiner avec le profil charge-vitesse de chaque athlète.</Ref>
        <H>Tempo</H>
        <F>{`notation 4 phases : EXCENTRIQUE - PAUSE ÉTIRÉE - CONCENTRIQUE - PAUSE CONTRACTÉE   (X = explosif)
ex. 3-1-X-0 · ancien format 3 chiffres « 2-0-2 » = 2-0-2-0
sens du mouvement : concentrique = montée (squat, développé, traction) · descente (tirage vertical,
  extension triceps poulie) · horizontal (rowing, presse) — deviné d'après le nom, modifiable
durée d'une rep = somme des phases (X = 0,5 s) → utilisée pour la durée estimée en muscu (3 s par défaut)
ISO : durée du maintien (s) + angle articulaire (°, ex. genou à 90°) ; durée d'une rep = durée du maintien`}</F>
        <F>{`durée sprint = Σ séries × reps × (distance / 7 m/s + récup)
durée endurance = Σ reps × (effort + récup) + récup de bloc
EMOM = intervalle × tours · AMRAP = durée totale (+ repos après le bloc)`}</F>
        <H>Planification : prévu vs réellement effectué</H>
        <P>
          Volume et intensité PRÉVUS (1-10) = saisis par le coach sur chaque semaine. RÉELLEMENT EFFECTUÉS = calculés sur les séances
          TERMINÉES du calendrier (barres creuses) :
        </P>
        <F>{`semaine = semaine où la séance a réellement été faite (« Séance faite le »)
intensité réelle = Σ (note de séance × durée) / Σ durée   (RPE moyen pondéré par la durée, échelle absolue)
volume réel = 5 + 2 × z   (borné 1-10)   z = (minutes de la semaine − moyenne) / écart-type
  moyenne et écart-type = ${Z_LOOKBACK_WEEKS} semaines précédentes DE L'ATHLÈTE (semaines sans séance = 0)
  5 = semaine habituelle · 7 = +1 σ · 9 = +2 σ · 3 = −1 σ
  < ${Z_MIN_WEEKS} semaines d'historique : complété par la norme du groupe (médiane des athlètes ayant ≥ ${Z_MIN_WEEKS} semaines)
  écart-type plancher = ${Math.round(Z_SD_FLOOR_CV * 100)} % de la moyenne (≥ ${Z_SD_FLOOR_MIN} min)
  aucun historique ni groupe : repli « provisoire » = minutes / semaine la plus chargée × 10
groupe : moyenne des z-scores de chaque athlète actif dans la semaine
historique utilisé : 6 mois (lu à l'ouverture de la planification)`}</F>
        <P>
          Le z-score compare chaque athlète à sa propre habitude, donc un athlète qui s'entraîne beaucoup ne fausse plus le groupe. Le rétrécissement
          vers la norme du groupe (bayésien empirique) évite des valeurs extrêmes quand un athlète a peu de semaines d'historique.
        </P>
        <P>
          Un coach peut remplir une séance pour un athlète (« Qui fait la séance ? ») : feedbacks, charge et RM vont à cet athlète. Chaque personne
          n'est comptée que si elle démarre et termine la séance.
        </P>
      </FoldCard>

      {/* ============ BIBLIO ============ */}
      <FoldCard id="biblio" fold={fold} title="📖 Toutes les références">
        <ul style={{ margin: 0, paddingLeft: 18, color: MUTED, fontSize: 12.5, lineHeight: 1.75 }}>
          {[
            "Ardern CL et al. 2016 — 2016 Consensus statement on return to sport from the First World Congress in Sports Physical Therapy, Bern. Br J Sports Med 50:853-864.",
            "Argus CK et al. 2012 — Kinetic and training comparisons between amateur and professional rugby union players. J Strength Cond Res.",
            "Billat LV 2001 — Interval training for performance: a scientific and empirical practice. Sports Med 31:13-31.",
            "Buchheit M 2008 — The 30-15 Intermittent Fitness Test. J Strength Cond Res 22:365-374.",
            "Buchheit M, Laursen PB 2013 — High-intensity interval training, solutions to the programming puzzle. Sports Med 43:313-338.",
            "Claudino JG et al. 2017 — The countermovement jump to monitor neuromuscular status: a meta-analysis. J Sci Med Sport 20:397-402.",
            "Costa EC et al. 2015 — Effect of unilateral and bilateral resistance exercise on maximal voluntary strength, total volume of load lifted and perceptual and metabolic responses. Biology of Sport 32:35-40.",
            "Crewther BT et al. 2009 — Scaling strength and power for body mass differences in rugby union players. J Sports Sci 27:1575-1580.",
            "Darrall-Jones J et al. 2016 — Fitness characteristics of rugby union players by age category (30-15 IFT). IJSPP.",
            "Hollander DB et al. 2007 — Maximal eccentric and concentric strength discrepancies between young men and women for dynamic resistance exercise. J Strength Cond Res 21:34-40.",
            "Impellizzeri FM et al. 2020 — Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls. Int J Sports Physiol Perform 15:907-913.",
            "Wang C et al. 2020 — Analyzing Activity and Injury: Lessons Learned from the Acute:Chronic Workload Ratio. Sports Med 50:1243-1254.",
            "Oranchuk DJ et al. 2019 — Isometric training and long-term adaptations: effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29:484-503.",
            "Day ML et al. 2004 — Monitoring exercise intensity during resistance training using the session RPE scale. J Strength Cond Res 18:353-358.",
            "Fitzsimons M et al. 1993 — Cycling and running tests of repeated sprint ability. Aust J Sci Med Sport 25:82-87.",
            "Fontana FY et al. 2015 — Anthropometrics of Italian senior male rugby union players: from elite to second division. IJSPP 10:1003-1007.",
            "Foster C 1998 — Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc 30:1164-1168.",
            "Foster C et al. 2001 — A new approach to monitoring exercise training. J Strength Cond Res 15:109-115.",
            "Furusawa K et al. 1927 — The dynamics of sprint running. Proc R Soc B 102:29-42.",
            "Gabbett TJ 2016 — The training-injury prevention paradox. Br J Sports Med 50:273-280.",
            "Girard O, Mendez-Villanueva A, Bishop D 2011 — Repeated-sprint ability, part I. Sports Med 41:673-694.",
            "Glaister M et al. 2008 — Reliability and validity of fatigue measures in repeated sprint tests. J Strength Cond Res 22:1597-1601.",
            "Hackett DA et al. 2012 — A novel scale to assess resistance-exercise effort (repetitions in reserve). Percept Mot Skills.",
            "Halperin I et al. 2022 — Accuracy in predicting repetitions to task failure in resistance exercise. Sports Med 52:377-390.",
            "Helms ER et al. 2016 — Application of the RIR-based RPE scale for resistance training. Strength Cond J 38:42-49.",
            "Helms ER et al. 2018 — RPE vs percentage 1RM loading in periodized programs. Front Physiol 9:247.",
            "Jones AM et al. 2019 — The maximal metabolic steady state: redefining the gold standard. Physiol Rep / Med Sci Sports Exerc.",
            "Moussa I et al. 2020 — Robust Exponential Decreasing Index (REDI). Front Physiol.",
            "Payne T et al. 2025 — Physical qualities that differentiate playing levels in rugby union: systematic review. J Strength Cond Res.",
            "Posthumus L et al. 2020 — Physical and fitness characteristics of elite professional rugby union players. Sports 8:85.",
            "Samozino P et al. 2016 — A simple method for measuring power, force, velocity properties of sprint running. Scand J Med Sci Sports 26:648-658.",
            "Saw AE, Main LC, Gastin PB 2016 — Monitoring the athlete training response: subjective self-reported measures. Br J Sports Med 50:281-291.",
            "Sedeaud A et al. 2013 — Secular trend: morphology and performance of French rugby players. J Sports Sci.",
            "Seiler S, Kjerland GØ 2006 — Quantifying training intensity distribution in elite endurance athletes. Scand J Med Sci Sports 16:49-56.",
            "Seiler S 2010 — What is best practice for training intensity and duration distribution? IJSPP 5:276-291.",
            "Smart D et al. 2013 — Physical profiling of rugby union players: implications for talent development. J Strength Cond Res.",
            "Sun J et al. 2026 — Velocity loss squat induced post-activation performance enhancement in sprinters. Front Physiol 17.",
            "Sweet TW et al. 2004 — Quantitation of resistance training using the session RPE method. J Strength Cond Res 18:796-802.",
            "Tanaka H et al. 2001 — Age-predicted maximal heart rate revisited. J Am Coll Cardiol 37:153-156.",
            "Weakley J et al. 2026 — A 10-year analysis of the Bronco fitness test in Super Rugby athletes. J Strength Cond Res.",
            "Zourdos MC et al. 2016 — Novel resistance training-specific RPE scale measuring repetitions in reserve. J Strength Cond Res 30:267-275.",
            "JSCR 2023 37(8):1566 — Traditional, rest redistribution and velocity-based (5 % loss) repeated sprint training.",
            "IJSPP 2024 19(8):792 — External training load and sRPE-TRIMP in elite sprinters.",
            "Données : fiches officielles LNR 2026-27 (Top 14, Pro D2), XV de France 2026, barème et données SU Agen (PP 2026-2027).",
          ].map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </FoldCard>
    </Wrap>
  );
}
