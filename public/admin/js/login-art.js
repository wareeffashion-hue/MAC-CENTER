// مسرح صفحة الدخول: عربة الشعار تجري بلا توقف وتلف حلقة، وخطوط الضوء خلفها ترسم مسارها
const Y = '#FFBA1D', CR = '#F7F3EA', GD = '#063F2C';
const BODY = new Path2D('M428 913H475.4C497 913 516 927 521.5 948.5L544.8 1037.2C550.3 1058.2 569.3 1072.8 590.9 1072.8H728C745.2 1072.8 762 1065.3 772.8 1051.7C784.2 1037.5 787.9 1019.1 783.1 1001.6L764.4 933.5C761 921.4 750 913 737.5 913C726 913 716 919.5 711.3 930L693 980C689.5 990 679.5 990 676 980L659 930C655 919.5 644.5 913 632.5 913C620 913 609 921 605.4 933.6L581.7 1011.6');
const BARS = [[405.9, 954.6, 72, 25.7, CR], [428, 1009.2, 71.9, 25.7, Y], [414, 1063.8, 76, 25.7, CR]];
const WH = [[633.8, 1125.7], [704.5, 1125.7]];
const CC = [600, 1040], BOTTOM = 1147.9;
const TAIL = BARS.map((b) => [b[0] - CC[0], b[1] + b[3] / 2 - CC[1]]);
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function startLoginArt(cv) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, S = 0.4, R = 120, base = 0, xL = 0, V = 520, raf = 0, dash = null;
  const R0 = rng(5);
  const GHOSTS = Array.from({ length: 22 }, () => ({ x: R0(), y: R0(), s: 0.08 + R0() * 0.14, v: 6 + R0() * 18, a: R0() * 6.28, al: 0.04 + R0() * 0.06 }));
  const DUST = Array.from({ length: 70 }, () => ({ x: R0(), y: R0(), s: 0.6 + R0() * 1.8, v: 6 + R0() * 20, p: R0() * 6.28 }));
  function size() {
    const r = cv.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const small = W < 760;
    S = (small ? 100 : 190) / 382; R = small ? 56 : 120; V = small ? 330 : 520;
    base = small ? H * 0.2 : H * 0.6; xL = small ? W * 0.55 : W * 0.3;
  }
  size();
  const wave = (px) => 26 * Math.sin(px / 170);
  const slope = (px) => 26 / 170 * Math.cos(px / 170);
  // موضع التماس بدلالة الزمن: مقطع مستقيم، حلقة كاملة، ثم مقطع مستقيم، ويتكرر
  function contact(t) {
    const pre = xL + 300, loop = 2 * Math.PI * R, Lp = W + 600 + loop;
    const d = ((t * V) % Lp + Lp) % Lp, pass = Math.floor(t * V / Lp);
    if (d < pre) { const px = -300 + d; return { x: px, y: base + wave(px), ang: Math.atan(slope(px)), pass }; }
    if (d < pre + loop) { const th = (d - pre) / R; const yb = base + wave(xL); return { x: xL + R * Math.sin(th), y: yb - R + R * Math.cos(th), ang: -th, pass, loop: 1 }; }
    const px = xL + (d - pre - loop); return { x: px, y: base + wave(px), ang: Math.atan(slope(px)), pass };
  }
  function pose(t) {
    const c = contact(t), hc = (BOTTOM - CC[1]) * S;
    let { x: px, y: py, ang } = c;
    if (dash) { const k = Math.min(1, (performance.now() - dash) / 700); px += Math.pow(k, 2.2) * W * 1.4; } // انطلاق عند نجاح الدخول
    return { cx: px + Math.sin(ang) * hc, cy: py - Math.cos(ang) * hc, ang, pass: c.pass };
  }
  function cart(p, t) {
    x.save(); x.translate(p.cx, p.cy); x.rotate(p.ang); x.scale(S, S); x.translate(-CC[0], -CC[1]);
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.shadowColor = 'rgba(255,186,29,.55)'; x.shadowBlur = 22 * dpr;
    x.strokeStyle = Y; x.lineWidth = 25.7; x.stroke(BODY); x.shadowBlur = 0;
    for (const b of BARS) { x.fillStyle = b[4]; x.fillRect(b[0], b[1], b[2], b[3]); }
    const rot = t * V / (22.2 * S);
    for (const w of WH) { x.fillStyle = Y; x.beginPath(); x.arc(w[0], w[1], 22.2, 0, 7); x.fill(); x.fillStyle = GD; x.beginPath(); x.arc(w[0] + Math.cos(rot) * 10, w[1] + Math.sin(rot) * 10, 5, 0, 7); x.fill(); }
    x.restore();
  }
  const tail = (p, k) => { const [bx, by] = TAIL[k]; const c = Math.cos(p.ang), s = Math.sin(p.ang); return [p.cx + (bx * c - by * s) * S, p.cy + (bx * s + by * c) * S]; };
  function ribbons(t) {
    const N = 40, L = 0.7;
    x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
    const now = pose(t);
    for (let k = 0; k < 3; k++) {
      const col = k === 1 ? '255,186,29' : '247,243,234', w0 = 25.7 * S * (k === 1 ? 1.05 : 0.9);
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const p = pose(t - i * L / N); if (p.pass !== now.pass) break;
        const q = tail(p, k);
        if (prev) { const f = i / N, a = Math.pow(1 - f, 1.4);
          x.strokeStyle = `rgba(${col},${a * 0.9})`; x.lineWidth = w0 * (1 - f * 0.85); x.beginPath(); x.moveTo(prev[0], prev[1]); x.lineTo(q[0], q[1]); x.stroke();
          if (i < N * 0.6) { x.strokeStyle = `rgba(${col},${a * 0.12})`; x.lineWidth = w0 * 3.2 * (1 - f); x.beginPath(); x.moveTo(prev[0], prev[1]); x.lineTo(q[0], q[1]); x.stroke(); } }
        prev = q;
      }
    }
    x.restore();
  }
  function frame(now) {
    const t = now / 1000;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0D6A4A'); g.addColorStop(0.55, '#074A33'); g.addColorStop(1, '#03251A');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rg = x.createRadialGradient(W * 0.35, H * 0.4, 20, W * 0.35, H * 0.4, Math.max(W, H) * 0.7); rg.addColorStop(0, 'rgba(255,186,29,.10)'); rg.addColorStop(1, 'rgba(255,186,29,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
    // عربات باهتة بعيدة تطفو
    for (const gh of GHOSTS) {
      const gx = ((gh.x * (W + 300) + t * gh.v) % (W + 300)) - 150, gy = gh.y * H + Math.sin(t * 0.4 + gh.a) * 12;
      x.save(); x.globalAlpha = gh.al; x.translate(gx, gy); x.rotate(Math.sin(t * 0.3 + gh.a) * 0.15); x.scale(gh.s, gh.s); x.translate(-CC[0], -CC[1]);
      x.strokeStyle = CR; x.lineWidth = 25.7; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(BODY); x.restore();
    }
    // المسار والحلقة
    x.save(); x.strokeStyle = 'rgba(247,243,234,.16)'; x.lineWidth = 2; x.setLineDash([14, 12]); x.lineDashOffset = -t * 60;
    x.beginPath(); for (let px = 0; px <= W; px += 8) { const py = base + wave(px); px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.setLineDash([]);
    x.strokeStyle = 'rgba(247,243,234,.12)'; x.lineWidth = 3; x.beginPath(); x.arc(xL, base + wave(xL) - R, R, 0, 7); x.stroke(); x.restore();
    ribbons(t);
    cart(pose(t), t);
    for (const d of DUST) { const yy = ((d.y * H - t * d.v) % H + H) % H; x.fillStyle = `rgba(255,214,140,${0.12 + 0.25 * Math.max(0, Math.sin(t * 1.3 + d.p))})`; x.beginPath(); x.arc(d.x * W + Math.sin(t * 0.6 + d.p) * 14, yy, d.s, 0, 7); x.fill(); }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  const onResize = () => size();
  addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  return {
    launch() { dash = performance.now(); return new Promise((r) => setTimeout(r, reduce ? 0 : 650)); },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
  };
}
