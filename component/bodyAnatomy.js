/* Données anatomiques du bonhomme — viewBox 320 × 660, axe de symétrie x = 160.
   Les pièces "lr" sont dessinées pour le côté GAUCHE DE L'ÉCRAN (id …_g) et
   reflétées pour le côté droit (id …_d). Les pièces "c" sont centrales.
   Une pièce `one:true` reflétée partage un seul id (cou, tête…).
   Champs : id, label, side, d (forme), f (traits de détail), t (teinte 0-3),
   fill (teinte forcée), legacy (anciens ids dont la valeur s'applique). */
export const VB = { w: 320, h: 672, cx: 160 };

/* ---- Silhouette commune (face avant = face arrière) ---- */
const SIL_BASE = [
  "M160 82 L143 85 C142 98 140 105 130 109 C116 111 102 112 94 117 C100 124 104 136 106 150 C106 160 108 170 109 186 C112 204 117 220 119 238 C119 258 114 276 109 294 C106 308 105 330 106 352 C106 388 108 420 114 444 C118 456 121 464 123 472 C119 492 114 518 114 546 C115 568 123 586 128 600 C128 608 126 614 123 622 C119 630 114 642 117 650 L153 652 C158 645 155 628 151 618 C150 612 150 606 150 600 C152 584 154 566 154 546 C154 520 153 492 153 470 C153 450 153 410 153 372 C153 352 156 332 160 314 Z",
  "M94 117 C84 120 76 130 74 148 C73 172 72 196 71 216 C69 230 66 240 64 252 C62 274 58 296 55 314 L51 324 C46 332 41 346 41 355 C41 360 47 360 49 356 L50 352 L50 376 C50 380 56 380 56 377 L56 382 C56 386 61 386 61 382 L61.5 378 C61.5 381 66.5 381 66.5 378 L67 369 C67 372 72 372 72 369 L73 350 C74 344 74 334 72 324 L79 318 C84 298 88 276 92 254 C95 242 96 234 98 224 C101 204 105 184 107 164 C108 152 107 138 106 126 Z",
];
/* ---- Pieds : dessinés en coordonnées locales (cheville en 135,606) puis tournés
   vers l'extérieur et agrandis, comme sur une planche anatomique. ---- */
const FOOT_ANGLE = (24 * Math.PI) / 180;
const FOOT_SCALE = 1.12;
const FAX = 135;
const FAY = 606;
const R1 = (n) => Math.round(n * 10) / 10;
const NUM_PAIR = /(-?\d+\.?\d*) (-?\d+\.?\d*)/g;
const BACK_ANGLE = 0;
const fxy = (x, y, ang = FOOT_ANGLE) => {
  const dx = (x - FAX) * FOOT_SCALE;
  const dy = (y - FAY) * FOOT_SCALE;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [FAX + dx * c - dy * s, FAY + dx * s + dy * c];
};
const footPath = (d, ang) => d.replace(NUM_PAIR, (m, x, y) => { const [a, b] = fxy(+x, +y, ang); return `${R1(a)} ${R1(b)}`; });
const polyD = (pts) => "M" + pts.map(([x, y]) => `${x} ${y}`).join(" L") + " Z";
const ellD = (cx, cy, rx, ry) => {
  const k = 0.5523;
  return `M${cx + rx} ${cy} C${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry} C${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy} C${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry} C${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy} Z`;
};
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const hullOf = (pts) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lo = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
/* shapes : { poly: [[x,y]…] } ou { ell: [cx,cy,rx,ry] } en coordonnées locales */
const footSil = (shapes, ang) => {
  const pts = [];
  shapes.forEach((sh) => {
    if (sh.poly) sh.poly.forEach(([x, y]) => pts.push(fxy(x, y, ang)));
    else {
      const [cx, cy, rx, ry] = sh.ell;
      for (let a = 0; a < 360; a += 20) pts.push(fxy(cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180), ang));
    }
  });
  const h = hullOf(pts);
  const near = (t) => h.reduce((bi, q, i) => (Math.hypot(q[0] - t[0], q[1] - t[1]) < Math.hypot(h[bi][0] - t[0], h[bi][1] - t[1]) ? i : bi), 0);
  const iL = near(fxy(128, 606, ang));
  const iR = near(fxy(142, 606, ang));
  const walk = (dir) => { const out = [h[iL]]; let i = iL; while (i !== iR) { i = (i + dir + h.length) % h.length; out.push(h[i]); } return out; };
  const a = walk(1);
  const b = walk(-1);
  const arc = a.length > b.length ? a : b;
  return "L" + arc.map(([x, y]) => `${R1(x)} ${R1(y)}`).join(" L") + " L150 606 L150 600";
};
const FOREFOOT = [[128, 606], [142, 606], [146, 622], [152, 640], [120, 640], [122, 622]];
/* orteils : [x gauche, x droit, bas, arrondi] — côte à côte, soudés à l'avant-pied */
const TOE_CAPS = [[142.5, 152, 656, 5], [136.5, 142, 658, 3], [131, 136.1, 655, 3], [126, 130.6, 651, 3], [120, 125.6, 646, 3]];
/* contour unique (encoches entre les orteils) : pas de traits parasites à la jonction */
const FOOT_LOCAL = (() => {
  let d = "M128 606 L142 606 L146 622 L152 640";
  TOE_CAPS.forEach(([x0, x1, yb, r], i) => {
    d += ` L${x1} ${yb} C${x1} ${yb + r} ${x0} ${yb + r} ${x0} ${yb} L${x0} 643`;
    if (i < TOE_CAPS.length - 1) d += ` L${TOE_CAPS[i + 1][1]} 643`;
  });
  return d + " L122 622 Z";
})();
const FRONT_FOOT_SHAPES = [{ poly: FOREFOOT }, ...TOE_CAPS.map(([x0, x1, yb, r]) => ({ poly: [[x0, 638], [x1, 638], [x1, yb + r], [x0, yb + r]] }))];
const BACK_FOOT_SHAPES = [{ poly: [[128, 606], [142, 606], [146, 622], [143, 634], [127, 634], [124, 622]] }, { ell: [135, 630, 9, 10] }];
const SIL_SEG = "C128 608 126 614 123 622 C119 630 114 642 117 650 L153 652 C158 645 155 628 151 618 C150 612 150 606 150 600";
const makeSil = (shapes, ang) => [SIL_BASE[0].replace(SIL_SEG, footSil(shapes, ang)), SIL_BASE[1]];
const SIL_FRONT = makeSil(FRONT_FOOT_SHAPES);
const SIL_BACK = makeSil(BACK_FOOT_SHAPES, BACK_ANGLE);

const HEAD = "M160 14 C180 14 189 28 189 46 C189 58 187 66 184 72 C181 80 174 86 166 88 L160 89 L154 88 C146 86 139 80 136 72 C133 66 131 58 131 46 C131 28 140 14 160 14 Z";
const EARS = "M131 42 C126 42 125 52 128 59 C129 62 132 62 133 60 Z M189 42 C194 42 195 52 192 59 C191 62 188 62 187 60 Z";

/* ---- Pièces d'avant-bras / main / pied communes aux deux faces ---- */
const ARM_BRAS = "M101 148 C95 166 90 190 88 216 L100 228 C106 206 110 182 110 158 C108 150 105 146 101 148 Z M80 168 C76 190 74 210 74 228 L88 232 C90 212 92 190 94 166 Z";
const FOREARM = "M72 228 C68 246 64 270 58 298 L56 318 L66 320 C70 296 74 270 80 246 L82 230 Z M84 230 C96 240 98 262 92 286 C88 300 82 312 76 320 L66 320 C72 300 78 274 80 250 Z";
/* Main (centrée x≈61, longueur ≈ 0,8 × hauteur de tête) : paume + 4 doigts + pouce côté extérieur */
const HAND = "M50 324 L72 324 C74 334 74 344 73 350 L50 350 C49 344 49 334 50 324 Z M50.5 349 L55.5 349 L55.5 376 C55.5 379 50.5 379 50.5 376 Z M56 349 L61 349 L61 382 C61 385 56 385 56 382 Z M61.5 349 L66.5 349 L66.5 378 C66.5 381 61.5 381 61.5 378 Z M67 349 L72 349 L72 369 C72 372 67 372 67 369 Z M50 328 C46 334 42 344 41 354 C41 358 46 359 48 355 C50 348 53 342 55 336 Z";
const HAND_F = ["M56 350 L56 372", "M61.5 350 L61.5 376", "M67 350 L67 366", "M52 338 C58 342 66 342 71 338"];
/* Pied vu de face : cheville → dos du pied → orteils, légèrement ouvert vers l'extérieur */
/* Pied vu de face : dos du pied + 5 orteils arrondis, tourné vers l'extérieur */
const FOOT = footPath(FOOT_LOCAL);
const FOOT_F = ["M133 610 C134 620 134 630 134 640", "M139 610 C142 620 143 630 143 640"].map(footPath);
/* Pied vu de dos : talon + bord externe */
const FOOT_BACK = footPath(polyD(BACK_FOOT_SHAPES[0].poly) + " " + ellD(135, 630, 9, 10), BACK_ANGLE);
const FOOT_BACK_F = ["M135 610 L135 628"].map((d) => footPath(d, BACK_ANGLE));
/* ---- Squelette : générateurs d'os ---- */
const f1 = (n) => Math.round(n * 10) / 10;
const pt = (a) => `${f1(a[0])} ${f1(a[1])}`;
/* os long effilé : de (x0,y0) largeur w0 à (x1,y1) largeur w1, extrémités arrondies */
const shaft = (x0, y0, w0, x1, y1, w1) => {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const tx = (x1 - x0) / L;
  const ty = (y1 - y0) / L;
  const nx = -ty;
  const ny = tx;
  const A = [x0 + (nx * w0) / 2, y0 + (ny * w0) / 2];
  const B = [x0 - (nx * w0) / 2, y0 - (ny * w0) / 2];
  const D = [x1 + (nx * w1) / 2, y1 + (ny * w1) / 2];
  const C = [x1 - (nx * w1) / 2, y1 - (ny * w1) / 2];
  const k1 = w1 * 0.66;
  const k0 = w0 * 0.66;
  return `M${pt(A)} L${pt(D)} C${f1(D[0] + tx * k1)} ${f1(D[1] + ty * k1)} ${f1(C[0] + tx * k1)} ${f1(C[1] + ty * k1)} ${pt(C)} L${pt(B)} C${f1(B[0] - tx * k0)} ${f1(B[1] - ty * k0)} ${f1(A[0] - tx * k0)} ${f1(A[1] - ty * k0)} ${pt(A)} Z`;
};
const rrect = (x, y, w, h, r) =>
  `M${f1(x + r)} ${f1(y)} L${f1(x + w - r)} ${f1(y)} Q${f1(x + w)} ${f1(y)} ${f1(x + w)} ${f1(y + r)} L${f1(x + w)} ${f1(y + h - r)} Q${f1(x + w)} ${f1(y + h)} ${f1(x + w - r)} ${f1(y + h)} L${f1(x + r)} ${f1(y + h)} Q${f1(x)} ${f1(y + h)} ${f1(x)} ${f1(y + h - r)} L${f1(x)} ${f1(y + r)} Q${f1(x)} ${f1(y)} ${f1(x + r)} ${f1(y)} Z`;
/* vertèbre : corps + apophyses transverses (tp = longueur) */
const vertebra = (cx, y, w, h, tp) => {
  const p = [rrect(cx - w / 2, y, w, h, Math.min(2.2, h / 2))];
  if (tp > 0) {
    p.push(shaft(cx - w / 2 + 1, y + h / 2, h * 0.55, cx - w / 2 - tp, y + h / 2 - 0.6, h * 0.4));
    p.push(shaft(cx + w / 2 - 1, y + h / 2, h * 0.55, cx + w / 2 + tp, y + h / 2 - 0.6, h * 0.4));
  }
  return p.join(" ");
};
const stack = (n, y0, step, h, w0, w1, tp0, tp1) =>
  Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    return vertebra(160, y0 + i * step, w0 + (w1 - w0) * t, h, tp0 + (tp1 - tp0) * t);
  }).join(" ");

const HAND_BONES = (() => {
  const p = [];
  [[54, 326], [59, 325], [64, 325], [69, 327], [56.5, 331.5], [62, 331], [67.5, 332], [51.5, 332.5]].forEach(([x, y]) => p.push(ellD(x, y, 2.8, 2.6)));
  const top = [55, 59.5, 64, 68.5];
  const bot = [54, 59.5, 65, 70.5];
  top.forEach((x, i) => p.push(shaft(x, 334, 3.4, bot[i], 351.5, 3.8)));
  [[54, 3.6, [10, 6, 5.5]], [59.5, 3.6, [11, 7, 6]], [65, 3.4, [10, 6.5, 5.5]], [70.5, 3, [7.5, 5, 4.5]]].forEach(([x, w, segs]) => {
    let y = 353.2;
    segs.forEach((h, i) => { p.push(shaft(x, y, w - i * 0.15, x, y + h, w - 0.3 - i * 0.15)); y += h + 1.5; });
  });
  p.push(shaft(52, 332, 4, 47, 347, 4.4), shaft(46.5, 348.5, 4, 44, 357, 3.8), shaft(43.5, 358.5, 3.6, 41.5, 365.5, 3.2));
  return p.join(" ");
})();

const FOOT_BONES_FRONT = (() => {
  const p = [ellD(135, 612, 8, 5.5), ellD(142, 620, 5, 4.5), ellD(129, 621, 5, 4), ellD(135.5, 626, 4.2, 3.4)];
  const top = [127, 131.5, 136, 140.5, 146];
  const bot = [123, 129, 135, 141, 148];
  top.forEach((x, i) => p.push(shaft(x, 627, i === 4 ? 6 : 4.4, bot[i], 639.5, i === 4 ? 6.6 : 4.2)));
  p.push(shaft(148.4, 641.5, 6.2, 148.6, 648.5, 5.4), shaft(148.7, 650, 5.2, 148.8, 655.5, 4));
  [[141, 3.4, [6, 4.5, 3.5]], [135, 3.2, [6, 4, 3.5]], [129.5, 3, [5.5, 4, 3]], [124, 2.8, [5, 3.5, 3]]].forEach(([x, w, segs]) => {
    let y = 641.5;
    segs.forEach((h, i) => { p.push(shaft(x, y, w - i * 0.15, x, y + h, w - 0.35 - i * 0.15)); y += h + 1.3; });
  });
  return footPath(p.join(" "));
})();
const FOOT_BONES_BACK = footPath(ellD(135, 630, 8, 11) + " " + ellD(135, 612, 6.5, 5.5), BACK_ANGLE);

/* Côtes : arcs qui s'éloignent du rachis puis redescendent ; 10 paires visibles de face (7 vraies,
   3 fausses), 12 de dos. */
const RIBS_FRONT = (() => {
  const xo = [127, 121, 116, 112, 110, 109.5, 110.5, 112, 114, 118];
  const out = [];
  for (let i = 0; i < 10; i++) {
    const sx = i < 7 ? 150 : [148, 146, 144][i - 7];
    const sy = i < 7 ? 122 + i * 9 : [184, 193, 202][i - 7];
    const d = i < 7 ? 13 + i * 2.4 : 29 - (i - 7);
    out.push(`M${sx} ${sy} C${sx - 12} ${sy - 7} ${xo[i] + 9} ${sy + d - 15} ${xo[i]} ${sy + d}`);
  }
  return out;
})();
const RIBS_BACK = (() => {
  const xo = [128, 122, 117, 113, 111, 110, 110, 111, 113, 116, 120, 124];
  const out = [];
  for (let i = 0; i < 12; i++) {
    const sy = 120 + i * 9.4;
    const d = i < 10 ? 14 + i * 1.6 : 10 - (i - 10) * 2;
    const sx = i < 10 ? 152 : 153;
    out.push(`M${sx} ${sy} C${sx - 10} ${sy - 4} ${xo[i] + 8} ${sy + d - 13} ${xo[i]} ${sy + d}`);
  }
  return out;
})();
const mirrorPath = (d) => d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, x, y) => `${320 - x} ${y}`);
const faceDeco = (d, fill) => ({ deco: true, side: "c", d, fill });
const EYE = "M144 42 C147 39 152 39 155 42 C152 45 147 45 144 42 Z";
const IRIS = "M149.6 40.2 C151 40.2 151.8 41 151.8 42 C151.8 43 151 43.8 149.6 43.8 C148.2 43.8 147.4 43 147.4 42 C147.4 41 148.2 40.2 149.6 40.2 Z";
const FACE_PARTS = [
  faceDeco("M141 20 C150 15 170 15 179 20 C182 28 182 32 180 36 C172 32 148 32 140 36 C138 32 138 28 141 20 Z", "#a39387"),
  faceDeco("M133 30 C131 38 132 48 135 54 C137 46 137 38 139 32 Z", "#7d6e64"),
  faceDeco(mirrorPath("M133 30 C131 38 132 48 135 54 C137 46 137 38 139 32 Z"), "#7d6e64"),
  faceDeco("M140 41 C142 34 153 33 157 38 C158 45 150 50 143 48 C140 46 139 43 140 41 Z", "#6b5d54"),
  faceDeco(mirrorPath("M140 41 C142 34 153 33 157 38 C158 45 150 50 143 48 C140 46 139 43 140 41 Z"), "#6b5d54"),
  faceDeco(EYE, "#eadccf"),
  faceDeco(mirrorPath(EYE), "#eadccf"),
  faceDeco(IRIS, "#22110d"),
  faceDeco(mirrorPath(IRIS), "#22110d"),
  faceDeco("M157 38 C158 50 156 60 151 64 C155 69 165 69 169 64 C164 60 162 50 163 38 C161 36 159 36 157 38 Z", "#b0a094"),
  faceDeco("M135 56 C138 66 142 76 148 82 C146 85 141 81 137 75 C134 69 133 61 135 56 Z", "#7d6e64"),
  faceDeco(mirrorPath("M135 56 C138 66 142 76 148 82 C146 85 141 81 137 75 C134 69 133 61 135 56 Z"), "#7d6e64"),
  faceDeco("M148 74 C152 71 156 72 160 73 C164 72 168 71 172 74 C160 76 160 76 148 74 Z", "#4d3a34"),
  faceDeco("M148 74 C160 77 160 77 172 74 C168 81 152 81 148 74 Z", "#8a6f66"),
  faceDeco("M150 82 C155 86 165 86 170 82 C168 89 152 89 150 82 Z", "#9a897e"),
];
const hairDeco = (d, fill, extra = {}) => ({ deco: true, side: "c", d, fill, stroke: "#1c0f0a", ...extra });
const hairLine = (d) => ({ deco: true, side: "c", d, fill: "none", stroke: "#150a06", sw: 0.8 });
const HAIR_FRONT = [
  hairDeco("M128 52 C122 30 132 13 160 12.5 C188 13 198 30 192 52 C191 44 188 36 184 31 C176 25 144 25 136 31 C132 36 129 44 128 52 Z", "#3a2217"),
  hairDeco("M136 34 C146 26 156 30 160 22 C164 30 176 26 184 34 C176 29 168 31 160 28 C152 31 144 29 136 34 Z", "#4a2c1d"),
  hairLine("M160 14 C158 14 155 20 150 25"),
  hairLine("M160 14 C163 14 166 20 171 25"),
  hairLine("M150 15 C144 15 139 22 136 31"),
  hairLine("M171 15 C177 15 181 22 184 31"),
  hairLine("M140 16 C132 18 129 28 128 40"),
  hairLine("M180 16 C188 18 191 28 192 40"),
  hairLine("M146 26 C150 30 154 29 157 27"),
  hairLine("M174 26 C170 30 166 29 163 27"),
];
const HAIR_BACK = [
  hairDeco("M128 52 C122 30 132 13 160 12.5 C188 13 198 30 192 52 C193 62 188 72 180 78 C172 74 148 74 140 78 C132 72 127 62 128 52 Z", "#3a2217"),
  hairLine("M160 14 L160 74"),
  hairLine("M160 18 C146 26 137 40 136 64"),
  hairLine("M160 18 C174 26 183 40 184 64"),
  hairLine("M160 34 C150 42 145 56 145 72"),
  hairLine("M160 34 C170 42 175 56 175 72"),
  hairLine("M144 16 C134 20 130 32 129 46"),
  hairLine("M176 16 C186 20 190 32 191 46"),
  hairLine("M150 56 C152 66 150 72 148 76"),
  hairLine("M170 56 C168 66 170 72 172 76"),
];
const DELT = "M94 112 C82 112 74 124 73 140 C72 156 74 172 84 190 C90 180 94 166 100 154 C108 140 116 128 115 120 C110 114 102 112 94 112 Z";

/* ======================= MUSCLES — FACE AVANT ======================= */
const M_FRONT = {
  sil: SIL_FRONT, head: HEAD,
  parts: [
    { id: "hanche", side: "lr", label: "Hanche (psoas, tenseur du fascia lata)", t: 3, fill: "#7a362b", d: "M96 256 L150 270 L160 312 L150 342 L96 346 Z" },
    { id: "genou", side: "lr", label: "Genou (rotule)", t: 3, fill: "#7a4a3c", d: "M112 440 L160 440 L160 512 L110 512 Z" },
    { id: "cou", side: "lr", one: true, label: "Cou (sterno-cléido-mastoïdien)", t: 1, d: "M141 70 C145 68 148 71 149 77 C152 90 157 100 160 110 L152 112 C148 102 142 92 138 82 C137 76 138 72 141 70 Z", f: ["M143 76 C147 90 152 100 156 108"] },
    { id: "trap", side: "lr", label: "Trapèze", t: 0, d: "M148 88 C145 100 128 108 96 114 C106 124 128 122 142 117 C151 115 157 111 160 108 C156 100 152 94 148 88 Z", f: ["M147 93 C140 104 124 111 104 116", "M151 100 C142 110 128 117 112 120"] },
    { id: "epa", side: "lr", label: "Épaule (deltoïde)", t: 2, d: DELT, f: ["M88 120 C80 136 78 158 84 184", "M96 118 C90 134 88 154 90 174", "M104 120 C98 136 96 154 96 168"] },
    { id: "pec", side: "lr", label: "Grand pectoral", t: 0, legacy: ["tronc"], d: "M159 118 L136 115 C124 116 114 122 108 134 C106 144 110 152 116 158 C130 168 148 170 159 169 Z", f: ["M156 124 C140 124 124 128 112 138", "M156 134 C142 136 128 141 114 148", "M156 144 C144 148 132 152 118 155", "M156 154 C146 158 136 162 126 163"] },
    { id: "serratus", side: "lr", label: "Dentelé antérieur", t: 3, legacy: ["tronc"], d: "M114 160 C118 164 122 168 126 171 L123 178 C118 176 114 172 111 168 Z M111 171 C115 175 119 179 123 182 L120 189 C116 186 112 183 109 179 Z M109 181 C113 185 117 188 120 191 L118 198 C114 195 110 192 108 188 Z" },
    { id: "abdos", side: "lr", label: "Abdominaux (grand droit)", t: 2, legacy: ["tronc"], d: "M159 171 L146 171 C145 178 145 186 146 193 L159 193 Z M159 196 L146 196 C145 204 145 212 146 219 L159 219 Z M159 222 L146 222 C145 230 145 238 146 245 L159 245 Z M159 248 L147 248 C146 256 147 264 149 271 L159 273 Z M159 276 L150 275 C150 283 152 292 156 300 L159 303 Z" },
    { id: "oblique", side: "lr", label: "Obliques", t: 1, legacy: ["tronc"], d: "M144 169 C136 171 126 167 116 160 C104 182 106 212 114 240 C120 256 116 270 106 284 C122 290 138 296 150 306 C146 270 143 222 144 169 Z", f: ["M139 178 C132 188 126 204 122 222", "M138 194 C132 206 128 224 126 242", "M137 210 C133 224 132 242 134 258", "M134 262 C132 272 134 282 140 292"] },
    { id: "bras", side: "lr", label: "Bras (biceps)", t: 0, d: ARM_BRAS, f: ["M101 158 C97 178 94 198 92 218", "M84 176 C81 194 80 210 80 226"] },
    { id: "avantbras", side: "lr", label: "Avant-bras (fléchisseurs)", t: 1, d: FOREARM, f: ["M86 240 C90 262 86 290 74 316", "M80 240 C80 264 74 290 66 314"] },
    { id: "main", side: "lr", label: "Main", t: 3, d: HAND, f: HAND_F },
    { id: "hanche", side: "lr", label: "Hanche (psoas, tenseur du fascia lata)", t: 3, d: "M100 262 L124 266 C128 292 130 318 126 340 L100 340 Z M130 292 C128 308 128 322 132 336 L146 338 C146 320 148 304 150 290 Z", f: ["M112 276 C112 298 114 316 116 334"] },
    { id: "quadri", side: "lr", label: "Quadriceps", t: 2, d: "M130 332 C124 362 124 402 130 438 L142 450 L152 442 C154 402 152 362 148 332 Z M104 330 C102 362 104 404 112 446 C118 460 128 462 136 458 C128 414 128 372 130 338 Z M152 400 C160 420 160 444 152 464 C146 468 140 464 138 456 C146 440 150 420 152 400 Z", f: ["M139 338 C137 372 138 410 142 440", "M118 340 C115 374 116 414 122 448", "M156 414 C157 434 154 452 150 462"] },
    { id: "adducteur", side: "lr", label: "Adducteurs", t: 0, d: "M160 314 C160 352 158 392 154 424 C150 424 146 420 146 414 C148 376 152 344 160 314 Z", f: ["M158 330 C154 362 150 392 150 416"] },
    { id: "genou", side: "lr", label: "Genou (rotule)", t: 3, d: "M129 468 C129 462 135 460 140 461 C146 462 150 466 150 472 C150 480 146 487 140 488 C133 488 129 483 129 468 Z M137 487 L143 487 L142 502 L138 502 Z" },
    { id: "molet", side: "lr", label: "Jambe (tibial antérieur, mollets)", t: 1, d: "M124 498 C122 534 124 572 130 606 L144 606 C146 576 146 540 146 498 Z M104 470 C102 500 106 548 120 586 C126 564 128 520 130 480 Z M160 470 C162 504 156 552 148 586 C146 560 146 520 146 480 Z", f: ["M132 510 C130 542 132 578 137 598", "M138 510 C138 542 139 578 139 598"] },
    { id: "pied", side: "lr", label: "Pied", t: 3, d: FOOT, f: FOOT_F },
    { id: "tete", side: "c", label: "Tête", t: 1, d: HEAD + " " + EARS,
      f: ["M140 36 C145 32 154 32 158 36", "M162 36 C166 32 175 32 180 36", "M151 76 C156 78 164 78 169 76"] },
    ...FACE_PARTS,
    ...HAIR_FRONT,
  ],
};

/* ======================= MUSCLES — FACE ARRIÈRE ======================= */
const M_BACK = {
  sil: SIL_BACK, head: HEAD,
  parts: [
    { id: "hanche", side: "lr", label: "Bassin", t: 3, fill: "#7a362b", d: "M96 256 L160 262 L160 330 L96 346 Z", hide: true },
    { id: "cou", side: "lr", one: true, label: "Nuque (extenseurs du cou)", t: 1, d: "M146 72 C150 70 156 70 160 70 L160 106 C154 100 148 90 146 72 Z", f: ["M152 78 C154 88 157 96 160 102"] },
    { id: "trap", side: "lr", label: "Trapèze", t: 0, d: "M160 80 C152 84 148 92 146 98 C132 106 114 112 98 116 C108 126 128 132 138 142 C146 168 154 198 160 224 Z", f: ["M156 96 C146 110 130 120 110 124", "M156 120 C148 130 140 138 132 142", "M158 150 C152 160 146 168 140 174", "M160 190 C156 190 150 188 146 184"] },
    { id: "epa", side: "lr", label: "Épaule (deltoïde postérieur)", t: 2, d: DELT, f: ["M88 122 C80 138 80 160 86 182", "M97 120 C92 136 90 156 92 174"] },
    { id: "infra", side: "lr", label: "Omoplate (infra-épineux, grand rond)", t: 3, legacy: ["dos"], d: "M100 126 C112 130 126 136 136 146 L134 176 C122 176 112 172 106 166 C104 152 102 138 100 126 Z", f: ["M104 134 C114 140 126 146 134 152", "M106 160 C116 164 126 166 134 166"] },
    { id: "dorsal", side: "lr", label: "Grand dorsal", t: 2, legacy: ["dos"], d: "M108 170 C120 180 134 182 140 180 C148 204 156 232 160 252 C146 258 132 260 120 264 C118 244 112 210 108 170 Z", f: ["M118 190 C128 198 140 204 150 216", "M118 214 C130 222 142 232 154 244"] },
    { id: "lombaire", side: "lr", label: "Lombaires (érecteurs du rachis)", t: 1, legacy: ["dos"], d: "M160 226 L146 222 C142 238 142 256 146 276 L160 282 Z", f: ["M153 230 C151 246 151 262 153 278"] },
    { id: "bras", side: "lr", label: "Bras (triceps)", t: 0, d: ARM_BRAS, f: ["M101 156 C97 176 94 198 92 220", "M84 174 C82 194 82 212 82 228"] },
    { id: "avantbras", side: "lr", label: "Avant-bras (extenseurs)", t: 1, d: FOREARM, f: ["M84 242 C90 264 86 292 74 316", "M78 240 C78 264 72 290 64 314"] },
    { id: "main", side: "lr", label: "Main (dos)", t: 3, d: HAND, f: HAND_F },
    { id: "fessier", noBack: true, side: "lr", label: "Fessier (grand et moyen fessier)", t: 2, d: "M160 280 L160 334 C146 346 124 344 108 328 C100 308 102 288 114 276 C128 266 148 268 160 280 Z M102 266 C110 256 126 254 140 258 C130 266 120 272 110 284 C102 280 100 272 102 266 Z", f: ["M156 290 C140 288 124 294 112 306", "M110 300 C120 316 138 328 156 328"] },
    { id: "ischio", noBack: true, side: "lr", label: "Ischio-jambiers", t: 0, d: "M106 336 C102 376 106 420 114 458 L128 462 C128 420 128 380 128 342 Z M130 342 C130 380 132 420 136 462 L150 462 C156 426 158 382 158 340 Z", f: ["M118 346 C116 384 118 424 122 456", "M143 348 C143 386 143 424 143 456"] },
    { id: "poplite", side: "lr", label: "Creux poplité", t: 3, d: "M114 458 L150 462 L148 482 L116 482 Z" },
    { id: "mollet", side: "lr", label: "Mollet (gastrocnémiens, soléaire)", t: 1, d: "M110 484 C106 512 110 548 120 576 L132 576 C136 548 136 512 132 484 Z M136 484 C140 512 140 548 138 576 L150 574 C154 548 154 512 150 484 Z M118 574 C120 590 124 600 128 606 L142 606 C144 592 144 582 144 568 Z", f: ["M122 494 C120 520 122 550 126 572", "M143 494 C145 520 145 550 143 572", "M134 598 L134 616"] },
    { id: "pied", side: "lr", label: "Pied (talon)", t: 3, d: FOOT_BACK, f: FOOT_BACK_F },
    { id: "tete", side: "c", label: "Tête (arrière)", t: 1, d: HEAD + " " + EARS,
      f: ["M160 18 L160 80", "M138 66 C146 74 174 74 182 66"] },
    ...HAIR_BACK,
  ],
};

/* ======================= SQUELETTE ======================= */
/* Os en ivoire, articulations en ambre (zones cliquables à part). */
const FEMUR = shaft(125.5, 341, 13, 138, 452, 12.5) + " " + ellD(117, 346, 6.5, 8) + " " + shaft(124, 338, 7, 131, 346, 9) + " " + ellD(139, 462, 12.5, 9.5);
const TIBIA = shaft(141.5, 490, 15, 139.5, 594, 10.5) + " " + ellD(141, 598, 6, 5);
const PERONE = shaft(125, 496, 5.5, 126, 596, 6.5) + " " + ellD(125, 493, 4.6, 4.6) + " " + ellD(126, 600, 4.4, 5);
const HUMERUS = shaft(88, 136, 12, 85, 226, 10.5) + " " + ellD(85, 232, 10, 7);
const AVANT_BRAS = shaft(91, 244, 9.5, 66, 322, 5.5) + " " + ellD(91, 242, 6, 6) + " " + shaft(80, 250, 5, 57, 322, 8.5) + " " + ellD(80, 248, 4.6, 4.2);

const S_COMMON_ARM = [
  { id: "humerus", side: "lr", label: "Humérus", kind: "bone", d: HUMERUS },
  { id: "avantbras", side: "lr", label: "Avant-bras (radius, cubitus)", kind: "bone", d: AVANT_BRAS },
  { id: "main", side: "lr", label: "Main (carpe, métacarpes, doigts)", kind: "bone", d: HAND_BONES },
  { id: "epaule", side: "lr", label: "Épaule (articulation)", kind: "joint", d: ellD(90, 122, 12, 11) },
  { id: "coude", side: "lr", label: "Coude", kind: "joint", d: ellD(87, 237, 11, 8) },
  { id: "poignet", side: "lr", label: "Poignet", kind: "joint", d: ellD(61.5, 326, 11, 5.5) },
];
const S_COMMON_LEG = [
  { id: "femur", side: "lr", label: "Fémur", kind: "bone", d: FEMUR },
  { id: "tibia", side: "lr", label: "Tibia & péroné", kind: "bone", d: TIBIA + " " + PERONE },
  { id: "hanche", side: "lr", label: "Hanche (articulation)", kind: "joint", d: ellD(124, 327, 12.5, 11) },
  { id: "genou", side: "lr", label: "Genou (articulation)", kind: "joint", d: ellD(138, 474, 14, 9.5) },
];
const CHEVILLE = { id: "cheville", side: "lr", label: "Cheville (articulation)", kind: "joint", d: ellD(135, 604, 14, 8) };
const PATELLA = { deco: true, side: "lr", d: ellD(138.5, 471, 6.8, 8.6), fill: "#e4dccb", stroke: "#6d6352", sw: 1 };

const SKULL_ORBITS = "M142 42 C142 46 144 49 148 49 C152 49 155 46 155 42 C155 38 153 36 149 36 C145 36 142 38 142 42 Z M165 42 C165 46 168 49 172 49 C176 49 178 46 178 42 C178 38 175 36 171 36 C167 36 165 38 165 42 Z M160 51 C157 54 156 59 158 62 L162 62 C164 59 163 54 160 51 Z";
const TEETH_F = (() => {
  const l = ["M148 65 L172 65", "M148 70 L172 70", "M147 74 L173 74", "M148 79 L172 79"];
  for (let i = 0; i <= 6; i++) { const x = 148 + i * 4; l.push(`M${x} 65 L${x} 70`, `M${x} 74 L${x} 79`); }
  return l;
})();

const S_FRONT = {
  sil: SIL_FRONT, head: HEAD, skel: true,
  parts: [
    { id: "clavicule", side: "lr", label: "Clavicule", kind: "bone", d: "M157 113 C150 110 140 109 130 110 C118 110 106 112 96 118 C93 120 92 122 93 124 L96 125 C100 122 108 118 118 117 C130 116 142 117 152 120 C156 121 158 120 158 117 Z" },
    { id: "cotes", side: "lr", label: "Côtes & cage thoracique", kind: "bone", d: "M152 120 C132 114 116 124 110 144 C104 168 106 196 116 214 C126 224 140 226 152 226 Z", fillOnly: true, f: RIBS_FRONT },
    ...S_COMMON_ARM,
    { id: "bassin", side: "lr", label: "Bassin (ilium, ischion, pubis)", kind: "bone",
      d: "M154 270 C146 262 130 258 118 262 C111 266 110 276 113 286 C115 293 120 298 125 302 C124 310 124 316 128 320 C131 324 136 326 140 324 L144 332 C146 336 150 338 154 336 L158 332 L158 318 C156 306 156 296 154 286 C153 280 153 274 154 270 Z M138 308 C136 311 136 314 137 316 C139 321 144 321 145 316 C146 310 142 306 138 308 Z",
      f: ["M126 278 C122 284 122 290 125 296", "M146 274 C142 270 134 268 126 270"] },
    ...S_COMMON_LEG,
    PATELLA,
    { id: "pied", side: "lr", label: "Pied (tarse, métatarses, orteils)", kind: "bone", d: FOOT_BONES_FRONT },
    CHEVILLE,
    { id: "crane", side: "c", label: "Crâne & mâchoire", kind: "bone",
      d: "M160 16 C178 16 186 29 186 45 C186 53 184 58 181 62 C180 66 178 69 176 71 L144 71 C142 69 140 66 139 62 C136 58 134 53 134 45 C134 29 142 16 160 16 Z " + SKULL_ORBITS + " M143 70 L177 70 C178 79 174 86 167 89 L153 89 C146 86 142 79 143 70 Z",
      f: ["M137 50 C139 57 145 62 149 64", "M183 50 C181 57 175 62 171 64", "M160 63 L160 66", ...TEETH_F, "M144 72 C142 77 143 82 147 86", "M176 72 C178 77 177 82 173 86"] },
    { id: "cervicales", side: "c", label: "Vertèbres cervicales", kind: "bone", d: stack(7, 91, 3.6, 3.1, 11, 13, 0, 3) },
    { id: "thoracique", side: "c", label: "Vertèbres thoraciques", kind: "bone", d: stack(12, 116, 8.7, 6.6, 14, 18, 2, 6) },
    { id: "lombaire", side: "c", label: "Vertèbres lombaires", kind: "bone", d: stack(5, 222, 9.8, 8.2, 19, 22, 8, 10) },
    { id: "sacrum", side: "c", label: "Sacrum & coccyx", kind: "bone", d: "M150 272 C154 270 166 270 170 272 L167 292 C165 300 163 306 160 310 C157 306 155 300 153 292 Z M158 311 L162 311 L161 318 L159 318 Z", f: ["M154 280 L157 280", "M163 280 L166 280", "M155 288 L158 288", "M162 288 L165 288"] },
  ],
};

const S_BACK = {
  sil: SIL_BACK, head: HEAD, skel: true,
  parts: [
    { id: "cotes", side: "lr", label: "Côtes & cage thoracique", kind: "bone", d: "M152 118 C134 112 116 124 110 146 C104 172 106 198 118 214 L152 228 Z", fillOnly: true, f: RIBS_BACK },
    { id: "omoplate", side: "lr", label: "Omoplate", kind: "bone", d: "M102 124 C112 121 126 123 140 130 C141 148 136 166 128 178 C121 181 113 172 109 158 C105 146 103 134 102 124 Z", f: ["M103 128 C118 133 130 138 141 143"] },
    { id: "clavicule", side: "lr", label: "Clavicule / acromion", kind: "bone", d: "M146 112 C134 110 118 110 104 112 C96 113 92 116 90 120 L94 124 C98 120 106 118 116 117 C130 115 140 116 148 118 Z" },
    ...S_COMMON_ARM,
    { id: "bassin", side: "lr", label: "Bassin (ilium, ischion)", kind: "bone",
      d: "M158 266 C148 258 132 255 119 258 C111 262 108 274 111 288 C113 298 118 306 124 312 C124 318 127 326 132 330 C136 332 140 330 141 326 C145 316 152 308 158 304 Z",
      f: ["M146 268 C136 266 124 270 116 280"] },
    ...S_COMMON_LEG,
    PATELLA,
    { id: "pied", side: "lr", label: "Pied (calcanéus, talon)", kind: "bone", d: FOOT_BONES_BACK },
    CHEVILLE,
    { id: "crane", side: "c", label: "Crâne", kind: "bone", d: "M160 16 C179 16 187 29 186 45 C186 57 182 67 176 72 L174 79 L146 79 L144 72 C138 67 134 57 134 45 C134 29 141 16 160 16 Z",
      f: ["M160 16 L160 62", "M137 34 C148 28 172 28 183 34", "M141 64 C150 70 170 70 179 64"] },
    { id: "cervicales", side: "c", label: "Vertèbres cervicales", kind: "bone", d: stack(7, 88, 3.8, 3.2, 11, 13, 0, 3) },
    { id: "thoracique", side: "c", label: "Vertèbres thoraciques", kind: "bone", d: stack(12, 114, 8.8, 6.8, 14, 18, 2, 6) },
    { id: "lombaire", side: "c", label: "Vertèbres lombaires", kind: "bone", d: stack(5, 222, 9.8, 8.2, 19, 22, 8, 10) },
    { id: "sacrum", side: "c", label: "Sacrum & coccyx", kind: "bone", d: "M148 266 L172 266 C171 280 169 292 166 302 C164 310 162 316 160 322 C158 316 156 310 154 302 C151 292 149 280 148 266 Z M158 323 L162 323 L161 330 L159 330 Z", f: ["M154 276 L157 276", "M163 276 L166 276", "M155 286 L158 286", "M162 286 L165 286", "M156 296 L158 296", "M162 296 L164 296"] },
  ],
};

export const ANAT = {
  muscle: { front: M_FRONT, back: M_BACK },
  skel: { front: S_FRONT, back: S_BACK },
};

/* ---- Tête agrandie (proportion plus réaliste) : transformation appliquée au crâne,
   au visage et aux décors de la tête, autour du bas du cou. ---- */
const HEAD_SCALE = 1.15;
const HX = 160;
const HY = 89;
const headPath = (d) => d.replace(NUM_PAIR, (m, x, y) => `${R1(HX + (x - HX) * HEAD_SCALE)} ${R1(HY + (y - HY) * HEAD_SCALE)}`);
Object.values(ANAT).forEach((modeSet) =>
  Object.values(modeSet).forEach((view) => {
    view.head = headPath(view.head);
    view.parts.forEach((p) => {
      if (p.id === "tete" || p.id === "crane" || p.deco) {
        p.d = headPath(p.d);
        if (p.f) p.f = p.f.map(headPath);
      }
    });
  })
);
