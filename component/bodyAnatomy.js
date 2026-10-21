/* Données anatomiques du bonhomme — viewBox 320 × 660, axe de symétrie x = 160.
   Les pièces "lr" sont dessinées pour le côté GAUCHE DE L'ÉCRAN (id …_g) et
   reflétées pour le côté droit (id …_d). Les pièces "c" sont centrales.
   Une pièce `one:true` reflétée partage un seul id (cou, tête…).
   Champs : id, label, side, d (forme), f (traits de détail), t (teinte 0-3),
   fill (teinte forcée), legacy (anciens ids dont la valeur s'applique). */
export const VB = { w: 320, h: 660, cx: 160 };

/* ---- Silhouette commune (face avant = face arrière) ---- */
const SIL = [
  "M160 82 L143 85 C142 98 140 105 130 109 C116 111 102 112 94 117 C100 124 104 136 106 150 C106 160 108 170 109 186 C112 204 117 220 119 238 C119 258 114 276 109 294 C106 308 105 330 106 352 C106 388 108 420 114 444 C118 456 121 464 123 472 C119 492 114 518 114 546 C115 568 123 586 128 600 C128 608 126 614 123 622 C119 630 116 640 121 646 L151 646 C157 641 155 628 151 618 C150 612 150 606 150 600 C153 584 157 566 158 546 C159 520 158 492 158 470 C159 450 158 410 158 372 C159 352 160 332 160 314 Z",
  "M94 117 C84 120 76 130 74 148 C73 172 72 196 71 216 C69 230 66 240 64 252 C62 274 58 296 55 314 L51 324 C46 332 41 346 41 355 C41 360 47 360 49 356 L50 352 L50 376 C50 380 56 380 56 377 L56 382 C56 386 61 386 61 382 L61.5 378 C61.5 381 66.5 381 66.5 378 L67 369 C67 372 72 372 72 369 L73 350 C74 344 74 334 72 324 L79 318 C84 298 88 276 92 254 C95 242 96 234 98 224 C101 204 105 184 107 164 C108 152 107 138 106 126 Z",
];
const HEAD = "M160 14 C180 14 189 28 189 46 C189 58 187 66 184 72 C181 80 174 86 166 88 L160 89 L154 88 C146 86 139 80 136 72 C133 66 131 58 131 46 C131 28 140 14 160 14 Z";
const EARS = "M131 42 C126 42 125 52 128 59 C129 62 132 62 133 60 Z M189 42 C194 42 195 52 192 59 C191 62 188 62 187 60 Z";

/* ---- Pièces d'avant-bras / main / pied communes aux deux faces ---- */
const ARM_BRAS = "M101 148 C95 166 90 190 88 216 L100 228 C106 206 110 182 110 158 C108 150 105 146 101 148 Z M80 168 C76 190 74 210 74 228 L88 232 C90 212 92 190 94 166 Z";
const FOREARM = "M72 228 C68 246 64 270 58 298 L56 318 L66 320 C70 296 74 270 80 246 L82 230 Z M84 230 C96 240 98 262 92 286 C88 300 82 312 76 320 L66 320 C72 300 78 274 80 250 Z";
/* Main (centrée x≈61, longueur ≈ 0,8 × hauteur de tête) : paume + 4 doigts + pouce côté extérieur */
const HAND = "M50 324 L72 324 C74 334 74 344 73 350 L50 350 C49 344 49 334 50 324 Z M50.5 349 L55.5 349 L55.5 376 C55.5 379 50.5 379 50.5 376 Z M56 349 L61 349 L61 382 C61 385 56 385 56 382 Z M61.5 349 L66.5 349 L66.5 378 C66.5 381 61.5 381 61.5 378 Z M67 349 L72 349 L72 369 C72 372 67 372 67 369 Z M50 328 C46 334 42 344 41 354 C41 358 46 359 48 355 C50 348 53 342 55 336 Z";
const HAND_F = ["M56 350 L56 372", "M61.5 350 L61.5 376", "M67 350 L67 366", "M52 338 C58 342 66 342 71 338"];
/* Pied vu de face : cheville → dos du pied → orteils, légèrement ouvert vers l'extérieur */
const FOOT = "M128 606 L142 606 C148 614 151 624 151 632 L151 638 C151 644 147 647 143 647 L125 647 C121 647 119 643 120 638 C121 630 124 616 128 606 Z";
const FOOT_F = ["M126 640 L126 646", "M131 640 L131 647", "M136 640 L136 647", "M141 640 L141 647", "M135 612 C136 622 136 632 136 640", "M142 612 C144 622 145 632 145 640"];
/* Pied vu de dos : talon arrondi + tendon d'Achille */
const FOOT_BACK = "M129 606 L143 606 C147 616 149 626 147 634 C145 641 143 645 136 645 C129 645 125 641 125 634 C124 626 127 616 129 606 Z";
/* Squelette main / pied (os générés) */
const bone = (x, y, w, h) => `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
const HAND_BONES = (() => {
  const p = ["M52 324 L70 324 L72 338 L50 338 Z"];
  [52, 57.5, 63, 68.5].forEach((x) => p.push(bone(x, 340, 3.6, 12)));
  [[50.8, [9, 7, 6]], [56.3, [10, 8, 7]], [61.8, [9, 7, 6]], [67.3, [7, 5, 5]]].forEach(([x, segs]) => {
    let y = 353;
    segs.forEach((h) => { p.push(bone(x, y, 3.6, h)); y += h + 1.5; });
  });
  p.push("M50 328 L53 326 L50 344 L46 342 Z", "M46 345 L50 346 L48 354 L44 353 Z", "M44 355 L48 356 L46 362 L43 361 Z");
  return p.join(" ");
})();
const FOOT_BONES_FRONT = (() => {
  const p = ["M128 608 L145 608 L149 624 L122 624 Z"];
  for (let i = 0; i < 5; i++) {
    const a = 124.5 + i * 5, b = 119 + i * 6.2, w = i === 4 ? 6 : 4;
    p.push(`M${a} 625 L${a + 4} 625 L${b + w} 637 L${b} 637 Z`, bone(b, 638, w, 8));
  }
  return p.join(" ");
})();
/* Côtes : arcs arrondis qui montent puis redescendent ; côtes 1-7 attachées au sternum,
   8-10 au rebord costal, 11-12 flottantes. */
const RIBS_FRONT = (() => {
  const xo = [126, 120, 115, 112, 110.5, 110, 111, 112, 114, 118];
  const out = [];
  for (let i = 0; i < 10; i++) {
    const sx = i < 7 ? 157 : [150, 145, 140][i - 7];
    const sy = i < 7 ? 124 + i * 7.7 : [175, 183, 191][i - 7];
    const d = i < 7 ? 14 + i * 2.2 : 28 - (i - 7);
    out.push(`M${sx} ${sy} C${sx - 12} ${sy - 7} ${xo[i] + 9} ${sy + d - 15} ${xo[i]} ${sy + d}`);
  }
  out.push("M124 196 C120 200 116 204 113 210", "M122 204 C119 208 116 212 114 217");
  return out;
})();
const RIBS_BACK = (() => {
  const xo = [128, 122, 117, 113, 111, 110, 110, 111, 113, 116, 120, 124];
  const out = [];
  for (let i = 0; i < 12; i++) {
    const sy = 124 + i * 8.6;
    const d = i < 10 ? 14 + i * 1.6 : 10 - (i - 10) * 2;
    const sx = i < 10 ? 152 : 153;
    out.push(`M${sx} ${sy} C${sx - 10} ${sy - 4} ${xo[i] + 8} ${sy + d - 13} ${xo[i]} ${sy + d}`);
  }
  return out;
})();
const FOOT_BONES_BACK = "M129 606 L143 606 C147 616 148 628 146 636 C143 643 129 643 127 636 C125 628 127 616 129 606 Z";
const DELT = "M94 112 C82 112 74 124 73 140 C72 156 74 172 84 190 C90 180 94 166 100 154 C108 140 116 128 115 120 C110 114 102 112 94 112 Z";

/* ======================= MUSCLES — FACE AVANT ======================= */
const M_FRONT = {
  sil: SIL, head: HEAD,
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
      f: ["M140 36 C145 32 154 32 158 36", "M162 36 C166 32 175 32 180 36", "M144 43 C147 41 153 41 156 43 C153 45 147 45 144 43 Z", "M164 43 C167 41 173 41 176 43 C173 45 167 45 164 43 Z", "M158 47 C157 55 155 61 153 64 C156 67 164 67 167 64", "M151 75 C156 77 164 77 169 75", "M137 62 C139 72 144 82 153 86", "M183 62 C181 72 176 82 167 86"] },
  ],
};

/* ======================= MUSCLES — FACE ARRIÈRE ======================= */
const M_BACK = {
  sil: SIL, head: HEAD,
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
    { id: "pied", side: "lr", label: "Pied (talon)", t: 3, d: FOOT_BACK, f: ["M136 610 L136 630"] },
    { id: "tete", side: "c", label: "Tête (arrière)", t: 1, d: HEAD + " " + EARS,
      f: ["M160 18 L160 80", "M138 66 C146 74 174 74 182 66"] },
  ],
};

/* ======================= SQUELETTE ======================= */
/* Os : couleur "ivoire" ; articulations : zones cliquables distinctes (ellipses). */
const S_COMMON_ARM = [
  { id: "humerus", side: "lr", label: "Humérus", kind: "bone", d: "M86 130 C82 132 82 142 82 152 C81 182 80 206 80 224 C80 230 84 234 88 234 C92 234 94 230 94 224 C94 206 96 182 96 152 C96 142 96 132 92 130 Z" },
  { id: "avantbras", side: "lr", label: "Avant-bras (radius, cubitus)", kind: "bone", d: "M80 246 C74 270 68 294 60 316 L64 320 C74 298 84 272 88 250 Z M91 248 C87 272 81 298 70 320 L74 324 C86 302 95 274 98 252 Z" },
  { id: "main", side: "lr", label: "Main (carpe, métacarpes, doigts)", kind: "bone", d: HAND_BONES },
  { id: "epaule", side: "lr", label: "Épaule (articulation)", kind: "joint", d: "M79 122 C79 111 103 111 103 122 C104 135 78 135 79 122 Z" },
  { id: "coude", side: "lr", label: "Coude", kind: "joint", d: "M78 236 C78 230 96 230 96 236 C97 246 77 246 78 236 Z" },
  { id: "poignet", side: "lr", label: "Poignet", kind: "joint", d: "M56 322 C58 330 80 332 80 324 C80 318 58 316 56 322 Z" },
];
const S_COMMON_LEG = [
  { id: "femur", side: "lr", label: "Fémur", kind: "bone", d: "M122 340 C118 344 118 350 120 358 C124 384 128 420 132 452 L128 462 C128 468 146 468 146 462 L142 452 C140 420 136 380 132 350 C132 344 128 340 122 340 Z" },
  { id: "tibia", side: "lr", label: "Tibia & péroné", kind: "bone", d: "M130 486 L146 486 C146 520 144 560 142 592 L134 592 C134 560 132 520 130 486 Z M121 490 C119 530 121 566 125 596 L129 596 C127 566 125 530 127 490 Z" },
  { id: "hanche", side: "lr", label: "Hanche (articulation)", kind: "joint", d: "M110 326 C110 316 134 316 134 326 C135 340 109 340 110 326 Z" },
  { id: "genou", side: "lr", label: "Genou (articulation)", kind: "joint", d: "M124 474 C124 462 152 462 152 474 C153 488 123 488 124 474 Z" },
  { id: "cheville", side: "lr", label: "Cheville", kind: "joint", d: "M123 602 C123 594 147 594 147 602 C148 612 122 612 123 602 Z" },
];

const S_FRONT = {
  sil: SIL, head: HEAD, skel: true,
  parts: [
    { id: "clavicule", side: "lr", label: "Clavicule", kind: "bone", d: "M158 112 C146 108 128 108 112 110 C102 111 96 114 91 119 L94 123 C100 119 108 117 118 116 C132 114 146 115 158 120 Z" },
    { id: "cotes", side: "lr", label: "Côtes & cage thoracique", kind: "bone",
      d: "M158 120 C136 114 118 124 112 142 C106 166 108 192 116 208 C124 216 140 220 158 222 Z",
      fillOnly: true,
      f: RIBS_FRONT },
    ...S_COMMON_ARM,
    { id: "bassin", side: "lr", label: "Bassin (ilium, pubis)", kind: "bone", d: "M157 274 C148 266 134 262 122 265 C116 272 115 286 118 298 C121 308 127 314 134 317 L142 314 L150 324 C153 327 157 326 160 324 L160 300 C158 292 158 283 157 274 Z M140 304 C146 304 147 313 142 316 C137 317 134 309 140 304 Z" },
    ...S_COMMON_LEG,
    { id: "crane", side: "c", label: "Crâne & mâchoire", kind: "bone", d: "M160 14 C180 14 189 28 189 46 C189 54 187 60 183 64 C182 70 180 74 176 76 L174 78 L146 78 L144 76 C140 74 138 70 137 64 C133 60 131 54 131 46 C131 28 140 14 160 14 Z M141 42 C141 48 153 49 155 42 C155 36 142 35 141 42 Z M165 42 C165 48 177 49 179 42 C179 36 167 35 165 42 Z M160 52 C157 56 156 62 158 64 L162 64 C164 62 163 56 160 52 Z M143 81 L177 81 C177 87 172 91 166 92 L154 92 C148 91 143 87 143 81 Z", f: ["M137 56 C140 62 146 66 150 67", "M183 56 C180 62 174 66 170 67", "M148 72 L172 72", "M152 72 L152 77 M156 72 L156 77 M160 72 L160 77 M164 72 L164 77 M168 72 L168 77", "M156 86 L164 86"] },
    { id: "cervicales", side: "c", label: "Vertèbres cervicales", kind: "bone", d: "M153 88 L167 88 L167 94 L153 94 Z M153 96 L167 96 L167 102 L153 102 Z M154 104 L166 104 L166 111 L154 111 Z" },
    { id: "sternum", side: "c", label: "Sternum", kind: "bone", d: "M154 120 L166 120 L167 134 L165 170 C163 178 161 182 160 184 C159 182 157 178 155 170 L153 134 Z", f: ["M155 134 L165 134"] },
    { id: "lombaire", side: "c", label: "Vertèbres lombaires", kind: "bone", d: [0, 1, 2, 3, 4].map((i) => `M151 ${224 + i * 9.5} L169 ${224 + i * 9.5} L169 ${231 + i * 9.5} L151 ${231 + i * 9.5} Z`).join(" ") },
    { id: "pied", side: "lr", label: "Pied (tarse, métatarses, orteils)", kind: "bone", d: FOOT_BONES_FRONT },
    { id: "sacrum", side: "c", label: "Sacrum & coccyx", kind: "bone", d: "M153 276 L167 276 L164 294 L160 303 L156 294 Z" },
  ],
};

const S_BACK = {
  sil: SIL, head: HEAD, skel: true,
  parts: [
    { id: "cotes", side: "lr", label: "Côtes & cage thoracique", kind: "bone", d: "M157 122 C138 114 118 124 112 146 C106 172 108 198 118 214 L157 226 Z", fillOnly: true,
      f: RIBS_BACK },
    { id: "omoplate", side: "lr", label: "Omoplate", kind: "bone", d: "M104 124 L140 130 C138 148 134 164 126 176 C116 172 108 156 104 124 Z", f: ["M104 130 C118 134 130 138 140 142"] },
    { id: "clavicule", side: "lr", label: "Clavicule / acromion", kind: "bone", d: "M146 112 C134 110 118 110 104 112 C96 113 92 116 90 120 L94 124 C98 120 106 118 116 117 C130 115 140 116 148 118 Z" },
    ...S_COMMON_ARM,
    { id: "bassin", side: "lr", label: "Bassin (ilium, ischion)", kind: "bone", d: "M157 268 C148 260 134 258 122 261 C116 268 115 284 119 300 C122 312 126 320 130 324 C134 327 138 323 138 318 C142 311 150 306 160 302 L160 284 C158 278 158 272 157 268 Z", f: ["M146 270 C136 270 124 274 116 284"] },
    ...S_COMMON_LEG,
    { id: "crane", side: "c", label: "Crâne", kind: "bone", d: "M160 14 C181 14 190 28 189 46 C189 58 185 68 178 74 L176 80 L144 80 L142 74 C135 68 131 58 131 46 C131 28 140 14 160 14 Z", f: ["M160 16 L160 62", "M137 34 C148 28 172 28 183 34", "M141 64 C150 70 170 70 179 64"] },
    { id: "cervicales", side: "c", label: "Vertèbres cervicales", kind: "bone", d: [0, 1, 2, 3, 4, 5, 6].map((i) => `M153 ${86 + i * 3.6} L167 ${86 + i * 3.6} L167 ${88.6 + i * 3.6} L153 ${88.6 + i * 3.6} Z`).join(" ") },
    { id: "thoracique", side: "c", label: "Vertèbres thoraciques", kind: "bone", d: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `M152 ${113 + i * 9} L168 ${113 + i * 9} L168 ${120 + i * 9} L152 ${120 + i * 9} Z`).join(" ") },
    { id: "lombaire", side: "c", label: "Vertèbres lombaires", kind: "bone", d: [0, 1, 2, 3, 4].map((i) => `M151 ${224 + i * 9.5} L169 ${224 + i * 9.5} L169 ${231 + i * 9.5} L151 ${231 + i * 9.5} Z`).join(" ") },
    { id: "pied", side: "lr", label: "Pied (calcanéus, talon)", kind: "bone", d: FOOT_BONES_BACK },
    { id: "sacrum", side: "c", label: "Sacrum & coccyx", kind: "bone", d: "M152 274 L168 274 L165 294 L160 306 L155 294 Z", f: ["M156 282 L164 282"] },
  ],
};

export const ANAT = {
  muscle: { front: M_FRONT, back: M_BACK },
  skel: { front: S_FRONT, back: S_BACK },
};
