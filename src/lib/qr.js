// مولد رموز QR بلا اعتماديات: وضع البايت، مستوى تصحيح M، الإصدارات 1 إلى 10
// يكفي لروابط الملصقات القصيرة ورابط إعداد التحقق الثنائي

const BLOCKS_M = [
  null,
  { ecc: 10, groups: [[1, 16]] },
  { ecc: 16, groups: [[1, 28]] },
  { ecc: 26, groups: [[1, 44]] },
  { ecc: 18, groups: [[2, 32]] },
  { ecc: 24, groups: [[2, 43]] },
  { ecc: 16, groups: [[4, 27]] },
  { ecc: 18, groups: [[4, 31]] },
  { ecc: 22, groups: [[2, 38], [2, 39]] },
  { ecc: 22, groups: [[3, 36], [2, 37]] },
  { ecc: 26, groups: [[4, 43], [1, 44]] },
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function dataCapacity(ver) {
  return BLOCKS_M[ver].groups.reduce((s, [n, len]) => s + n * len, 0);
}

export function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let ver = 1;
  for (; ver <= 10; ver++) {
    const countBits = ver < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCapacity(ver) * 8) break;
  }
  if (ver > 10) throw new Error('النص أطول من المسموح لرمز QR');

  // البتات
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capBits = dataCapacity(ver) * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCapacity(ver); pad ^= 0xec ^ 0x11) data.push(pad);

  // التصحيح والتشابك
  const { ecc, groups } = BLOCKS_M[ver];
  const divisor = rsDivisor(ecc);
  const blocks = [];
  let k = 0;
  for (const [n, len] of groups) {
    for (let i = 0; i < n; i++) {
      const dat = data.slice(k, k + len);
      k += len;
      blocks.push({ dat, ecc: rsRemainder(dat, divisor) });
    }
  }
  const codewords = [];
  const maxLen = Math.max(...blocks.map((b) => b.dat.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.dat.length) codewords.push(b.dat[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocks) codewords.push(b.ecc[i]);

  // المصفوفة
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[ver];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask; // مستوى M = 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, dark); set(c, a, dark);
    }
  }

  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < codewords.length * 8) {
        modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x];
  };

  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const s = penalty(modules, size);
    if (s < bestScore) { best = m; bestScore = s; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return modules;
}

function penalty(mod, size) {
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(mod[y]);
  for (let x = 0; x < size; x++) lines.push(mod.map((r) => r[x]));
  const pat = [1, 0, 1, 1, 1, 0, 1];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    for (let i = 0; i + 7 <= size; i++) {
      if (!pat.every((p, k) => !!p === line[i + k])) continue;
      const before = line.slice(Math.max(0, i - 4), i), after = line.slice(i + 7, i + 11);
      if ((i < 4 || before.every((v) => !v)) || (i + 11 > size || after.every((v) => !v))) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (mod[y][x]) dark++;
    if (x < size - 1 && y < size - 1) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

export function qrSvg(text, { margin = 4, dark = '#084832', light = '#ffffff' } = {}) {
  const m = qrMatrix(text);
  const size = m.length + margin * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + margin} ${y + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`;
}
