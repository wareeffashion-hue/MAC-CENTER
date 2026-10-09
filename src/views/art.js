// رسومات خطية ذهبية رفيعة لكل قسم، ترسم نفسها داخل نافذة العربة.
// تبقى بديلًا أنيقًا حتى ترفع الإدارة الصور الحقيقية من اللوحة.

export const LINES = {
  fashion: [
    'M100 38c0-9 10-13 15-7s0 12-6 13c-6 2-9 6-9 12',
    'M100 56L52 81q-5 4 1 5h94q6-1 1-5z',
    'M80 86L56 96 46 126l16 5 6-17v52h64v-52l6 17 16-5-10-30-24-10q-20 14-40 0z',
    'M100 98v62',
    'M110 114h12v10h-12z',
  ],
  dress: [
    'M86 42l4 28M114 42l-4 28',
    'M90 70q10 7 20 0l4 30q-14 7-28 0z',
    'M86 100q-26 48-36 68 50 13 100 0-10-20-36-68',
    'M93 104q-12 34-20 68M100 106v70M107 104q12 34 20 68',
  ],
  bags: [
    'M70 92V82q0-20 20-20t20 20v10',
    'M50 92h80l8 70H42z',
    'M50 92l40 26 40-26',
    'M86 114h8v8h-8z',
    'M118 176h50q2-12-10-15-14-4-20-18h-6q-4 20-14 33z',
    'M163 162l-2 16',
  ],
  home: [
    'M44 126V82q56-44 112 0v44',
    'M40 150q0-22 20-24h80q20 2 20 24',
    'M54 126q-2-20 16-20h22q12 0 10 20M98 126q-2-20 16-20h22q12 0 10 20',
    'M36 150h128v16H36z',
    'M42 166v10M158 166v10',
    'M62 138h76',
  ],
  toys: [
    'M50 130h36v36H50zM86 130h36v36H86zM68 94h36v36H68z',
    'M60 158l8-18 8 18M63 152h10',
    'M96 148a8 8 0 1 0 16 0 8 8 0 1 0-16 0',
    'M86 103l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    'M132 150a18 18 0 1 0 36 0 18 18 0 1 0-36 0',
    'M132 150q18-14 36 0',
  ],
  stationery: [
    'M54 58h66v108H54z',
    'M64 58v108',
    'M76 84h34M76 98h34M76 112h26',
    'M140 48l14 5-36 109-12 12-2-17z',
    'M104 157l14 5M137 57l14 5',
  ],
  mall: [
    'M40 170V92q0-42 60-42t60 42v78',
    'M60 170v-70q0-30 40-30t40 30v70',
    'M24 170h152',
    'M100 70v100',
    'M84 132h-6M122 132h-6',
  ],
};

// نافذة العربة: سلة عربة الشعار نفسها نافذةً للقسم، بخطوط السرعة والعجلتين
// الإحداثيات من رسم الشعار الأصلي (mark.svg)، وجسم السلة يقص بمضلع نسبي يتمدد مع أي مقاس
const BODY = { x: 495.5, y: 900, w: 302, h: 185.7 };
const OUTLINE = [
  ['M', 495.5, 900], ['L', 737.5, 900.1], ['C', 755.8, 900.1, 771.9, 912.4, 776.7, 930.1], ['L', 795.5, 998.2],
  ['C', 801.3, 1019.6, 796.8, 1042, 783, 1059.4], ['C', 769.7, 1076.2, 749.2, 1085.7, 727.8, 1085.7], ['L', 590.9, 1085.7],
  ['C', 563.4, 1085.7, 539.3, 1067.1, 532.4, 1040.5], ['L', 495.5, 900],
];
const pct = (x, y) => `${(((x - BODY.x) / BODY.w) * 100).toFixed(2)}% ${(((y - BODY.y) / BODY.h) * 100).toFixed(2)}%`;
export const CLIP = (() => {
  const pts = []; let px = 0, py = 0;
  for (const [c, ...a] of OUTLINE) {
    if (c === 'C') {
      for (let i = 1; i <= 6; i++) {
        const t = i / 6, u = 1 - t;
        pts.push(pct(u ** 3 * px + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t ** 3 * a[4], u ** 3 * py + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t ** 3 * a[5]));
      }
      [px, py] = [a[4], a[5]];
    } else { pts.push(pct(a[0], a[1])); [px, py] = a; }
  }
  return `polygon(${pts.join(', ')})`;
})();
// الخط الذهبي الداخلي: مقبض العربة ثم جوانب السلة، وتعرّج حرف M في الأعلى بعمق أخف
const LINE = 'M428 913H475.4C497 913 515.5 927.6 521 948.5L544.8 1037.2C550 1057 568 1072.8 590.9 1072.8H728C745 1072.8 762 1065 772.8 1051.7C784.5 1037 788 1019 783.1 1001.6L764.4 933.5C761 920 750 913 737.5 913C730 913 723 917 718 924L691 940C688 944 681 944 678 940L651 924C646 917 639 913 632.5 913C625 913 618 917 614 925L600 950';
const CW = `<svg class="cw-line" viewBox="${BODY.x} ${BODY.y} ${BODY.w} ${BODY.h}" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" vector-effect="non-scaling-stroke" d="${LINE}"/></svg><i class="cw-sp"></i><i class="cw-sp cw-sp2"></i><i class="cw-wh"></i><i class="cw-wh cw-wh2"></i>`;

export function arch(kind, { image, label = '', cls = '', draw = false } = {}) {
  const inner = image
    ? `<img src="${image}" alt="${label}" loading="lazy" decoding="async">`
    : `<svg class="lineart ${draw ? 'draw' : ''}" viewBox="0 0 200 200" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${(LINES[kind] || LINES.mall).map((d, i) => `<path pathLength="1" style="--d:${i}" d="${d}"/>`).join('')}</svg>`;
  return `<span class="arch ${cls}"><span class="cw-body"><span class="arch-in">${inner}</span>${CW}</span></span>`;
}

// متوافق مع الاستخدام السابق
export function art(kind, label = '') { return arch(kind, { label }); }
export const SPRITE = '';
