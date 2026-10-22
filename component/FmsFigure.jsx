import React from "react";

/* Schémas ORIGINAUX (silhouettes simplifiées) illustrant la différence entre les notes 3 / 2 / 1
   de chaque mouvement FMS. Ce sont des schémas, pas des photos : ils montrent le critère clé. */

const BODY = "#f3f0ea";
const PROP = "#e0a13d";
const MARK = "#d9695a";
const MUTED = "#a8a199";

const P = ({ d, c = BODY, w = 3, dash }) => (
  <polyline points={d.map((p) => p.join(",")).join(" ")} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
);
const H = ({ x, y, r = 5 }) => <circle cx={x} cy={y} r={r} fill="none" stroke={BODY} strokeWidth={3} />;
const T = ({ x, y, t, c = MUTED, a = "middle", s = 7 }) => (
  <text x={x} y={y} fill={c} fontSize={s} textAnchor={a} fontFamily="system-ui, sans-serif">{t}</text>
);
const Floor = ({ y = 90 }) => <line x1="8" y1={y} x2="132" y2={y} stroke="#3a342a" strokeWidth="2" />;
const Board = ({ x1, x2 }) => <rect x={x1} y={86} width={x2 - x1} height={4} fill={PROP} opacity="0.85" />;

const SQUAT = {
  3: (
    <>
      <Floor /><Board x1={140} x2={140} />
      <P d={[[54, 44], [50, 70]]} /><H x={55} y={37} />
      <P d={[[50, 70], [72, 66], [60, 88], [70, 88]]} />
      <P d={[[54, 46], [56, 30], [55, 18]]} />
      <P d={[[42, 18], [68, 18]]} c={PROP} />
      <P d={[[55, 12], [55, 88]]} c={MUTED} w={1} dash="2 3" />
      <T x={70} y={98} t="fémurs sous l'horizontale" />
    </>
  ),
  2: (
    <>
      <Floor /><Board x1={52} x2={74} />
      <P d={[[54, 44], [50, 68]]} /><H x={55} y={37} />
      <P d={[[50, 68], [72, 64], [60, 84], [70, 84]]} />
      <P d={[[54, 46], [56, 30], [55, 18]]} />
      <P d={[[42, 18], [68, 18]]} c={PROP} />
      <T x={70} y={98} t="talons surélevés" />
    </>
  ),
  1: (
    <>
      <Floor /><Board x1={52} x2={74} />
      <P d={[[63, 42], [47, 58]]} /><H x={68} y={36} />
      <P d={[[47, 58], [76, 60], [62, 84], [72, 84]]} />
      <P d={[[64, 44], [70, 30], [72, 17]]} />
      <P d={[[62, 17], [84, 17]]} c={PROP} />
      <P d={[[47, 58], [76, 58]]} c={MARK} w={1} dash="2 2" />
      <T x={70} y={98} t="torse penché, fémurs hauts" c={MARK} />
    </>
  ),
};

// Vue de face : haie au sol, bâton sur les épaules
const HURDLE = {
  3: (
    <>
      <Floor />
      <P d={[[24, 70], [116, 70]]} c={PROP} w={4} />
      <P d={[[34, 36], [106, 36]]} c={PROP} />
      <H x={70} y={24} /><P d={[[70, 30], [70, 58]]} />
      <P d={[[66, 58], [64, 90]]} /><P d={[[74, 58], [84, 54], [86, 62]]} />
      <P d={[[36, 36], [106, 36]]} c={MUTED} w={1} dash="2 3" />
      <P d={[[24, 70], [116, 70]]} c={MUTED} w={1} dash="2 3" />
      <T x={70} y={98} t="bâton ‖ haie, bassin stable" />
    </>
  ),
  2: (
    <>
      <Floor />
      <P d={[[24, 70], [116, 70]]} c={PROP} w={4} />
      <P d={[[34, 44], [106, 30]]} c={PROP} />
      <H x={68} y={26} /><P d={[[70, 32], [66, 58]]} />
      <P d={[[62, 58], [60, 90]]} /><P d={[[70, 58], [86, 50], [92, 62]]} />
      <T x={70} y={98} t="bâton incliné, bassin qui bouge" c={PROP} />
    </>
  ),
  1: (
    <>
      <Floor />
      <P d={[[24, 70], [116, 70]]} c={PROP} w={4} />
      <P d={[[36, 42], [106, 28]]} c={PROP} />
      <H x={66} y={24} /><P d={[[68, 30], [64, 58]]} />
      <P d={[[60, 58], [56, 90]]} /><P d={[[68, 58], [82, 56], [86, 70]]} />
      <circle cx="86" cy="70" r="6" fill="none" stroke={MARK} strokeWidth="2" />
      <T x={70} y={98} t="contact avec la haie" c={MARK} />
    </>
  ),
};

const LUNGE = {
  3: (
    <>
      <Floor /><Board x1={30} x2={110} />
      <P d={[[60, 32], [60, 62]]} /><H x={60} y={25} />
      <P d={[[56, 32], [56, 64]]} c={PROP} w={2} />
      <P d={[[60, 62], [78, 66], [78, 86]]} />
      <P d={[[60, 62], [68, 86], [52, 84], [46, 86]]} />
      <P d={[[60, 38], [70, 50]]} />
      <T x={70} y={98} t="bâton au contact, genou touche" />
    </>
  ),
  2: (
    <>
      <Floor /><Board x1={30} x2={110} />
      <P d={[[66, 32], [58, 62]]} /><H x={68} y={26} />
      <P d={[[50, 32], [44, 64]]} c={PROP} w={2} />
      <P d={[[58, 62], [78, 66], [78, 86]]} />
      <P d={[[58, 62], [66, 80], [52, 84], [46, 86]]} />
      <P d={[[62, 38], [72, 50]]} />
      <T x={70} y={98} t="bâton décollé, genou n'arrive pas" c={PROP} />
    </>
  ),
  1: (
    <>
      <Floor /><Board x1={30} x2={110} />
      <P d={[[74, 34], [58, 60]]} /><H x={78} y={28} />
      <P d={[[56, 34], [42, 62]]} c={PROP} w={2} />
      <P d={[[58, 60], [84, 62], [92, 86]]} />
      <P d={[[58, 60], [60, 74], [44, 78], [38, 86]]} />
      <P d={[[68, 40], [84, 36]]} c={MARK} w={2} />
      <path d="M96 56 q6 6 0 12 M102 52 q9 10 0 20" fill="none" stroke={MARK} strokeWidth="1.5" />
      <T x={70} y={98} t="perte d'équilibre" c={MARK} />
    </>
  ),
};

// Vue de dos : distance entre les deux poings (une longueur de main = repère)
const SHOULDER = (gap, label, color) => (
  <>
    <H x={70} y={18} />
    <P d={[[70, 24], [70, 66]]} />
    <P d={[[70, 28], [96, 28]]} />
    <P d={[[70, 28], [44, 28]]} />
    <P d={[[96, 28], [96, 14], [78, 12], [72, 34]]} />
    <P d={[[44, 28], [44, 44], [64, 44 + gap]]} />
    <circle cx="72" cy="35" r="4" fill={BODY} />
    <circle cx="64" cy={44 + gap} r="4" fill={BODY} />
    <P d={[[78, 35], [78, 44 + gap]]} c={color} w={1.5} dash="3 2" />
    <rect x="86" y="35" width="10" height="10" fill="none" stroke={PROP} strokeWidth="1.2" />
    <T x={106} y={43} t="1 main" c={PROP} a="start" s={6} />
    <T x={70} y={98} t={label} c={color} />
  </>
);
const SHOULDER_SCORES = {
  3: SHOULDER(8, "< 1 longueur de main", BODY),
  2: SHOULDER(17, "1 à 1,5 longueur de main", PROP),
  1: SHOULDER(30, "> 1,5 longueur de main", MARK),
};

// Vue de côté, allongé : position de la malléole par rapport à la cuisse de l'autre jambe
const ASLR = (ax, ay, label, color) => (
  <>
    <Floor y={86} />
    <H x={20} y={80} />
    <P d={[[27, 84], [70, 84]]} />
    <P d={[[70, 84], [128, 84]]} />
    <P d={[[70, 84], [ax, ay]]} c={color} w={4} />
    <circle cx={ax} cy={ay} r="3" fill={color} />
    <P d={[[70, 20], [70, 84]]} c={MUTED} w={1} dash="2 3" />
    <P d={[[99, 20], [99, 84]]} c={PROP} w={1} dash="2 3" />
    <P d={[[128, 20], [128, 84]]} c={MUTED} w={1} dash="2 3" />
    <T x={66} y={16} t="épine" s={6} />
    <T x={99} y={16} t="mi-cuisse" c={PROP} s={6} />
    <T x={128} y={16} t="genou" s={6} />
    <T x={70} y={98} t={label} c={color} />
  </>
);
const ASLR_SCORES = {
  3: ASLR(80, 26, "malléole : épine → mi-cuisse", BODY),
  2: ASLR(106, 36, "malléole : mi-cuisse → genou", PROP),
  1: ASLR(125, 60, "malléole sous le genou", MARK),
};

// Position de départ, allongé face au sol : hauteur des mains
const PUSHUP = (hx, label, color, tag) => (
  <>
    <Floor y={86} />
    <H x={22} y={80} />
    <P d={[[30, 84], [84, 84]]} />
    <P d={[[84, 84], [118, 84]]} />
    <P d={[[44, 82], [hx + 8, 76], [hx, 76]]} />
    <circle cx={hx} cy={76} r="4" fill={color} />
    <P d={[[hx, 66], [hx, 72]]} c={color} w={1.5} />
    <T x={hx} y={62} t={tag} c={color} s={7} />
    <T x={70} y={98} t={label} c={color} />
  </>
);
const PUSHUP_SCORES = {
  3: PUSHUP(20, "mains au front", BODY, "front"),
  2: PUSHUP(28, "mains au menton", PROP, "menton"),
  1: PUSHUP(40, "mains à la clavicule : impossible", MARK, "clavicule"),
};

// Vue du dessus : quel bras avec quelle jambe
const ROTARY = (pairs, label, color, cross) => (
  <>
    <rect x="22" y="36" width="96" height="28" rx="3" fill="none" stroke={PROP} strokeWidth="2" />
    <circle cx="40" cy="36" r="4" fill={BODY} /><circle cx="40" cy="64" r="4" fill={BODY} />
    <circle cx="98" cy="40" r="4" fill={BODY} /><circle cx="98" cy="60" r="4" fill={BODY} />
    <P d={[[40, 36], [98, 40]]} c="#2a2620" w={1} /><P d={[[40, 64], [98, 60]]} c="#2a2620" w={1} />
    {pairs}
    <T x={36} y={30} t="G" s={7} /><T x={36} y={76} t="D" s={7} />
    <T x={104} y={34} t="G" s={7} /><T x={104} y={72} t="D" s={7} />
    <T x={70} y={98} t={label} c={color} />
    {cross}
  </>
);
const ROTARY_SCORES = {
  3: ROTARY(<><P d={[[40, 36], [70, 42], [98, 40]]} c={BODY} w={3} /></>, "même côté (bras + jambe)", BODY),
  2: ROTARY(<><P d={[[40, 36], [70, 50], [98, 60]]} c={PROP} w={3} /></>, "côtés opposés (diagonale)", PROP),
  1: ROTARY(<><P d={[[40, 36], [70, 50], [98, 60]]} c={MARK} w={2} dash="3 3" /><P d={[[62, 44], [78, 56]]} c={MARK} w={3} /><P d={[[78, 44], [62, 56]]} c={MARK} w={3} /></>, "diagonale impossible", MARK),
};

const FIGURES = {
  deep_squat: SQUAT,
  hurdle: HURDLE,
  lunge: LUNGE,
  shoulder: SHOULDER_SCORES,
  aslr: ASLR_SCORES,
  pushup: PUSHUP_SCORES,
  rotary: ROTARY_SCORES,
};

export default function FmsFigure({ move, score, size = 120 }) {
  const f = FIGURES[move] && FIGURES[move][score];
  if (!f) return null;
  return (
    <svg
      viewBox="0 0 140 104"
      width={size * 1.35}
      height={size}
      role="img"
      aria-label={`Schéma ${move} note ${score}`}
      style={{ background: "#0d0c0a", borderRadius: 8, border: "1px solid #2a2620", flexShrink: 0, maxWidth: "100%" }}
    >
      {f}
    </svg>
  );
}
