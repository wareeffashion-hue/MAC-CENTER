// «رحلة العربة»: عربة الشعار تقطع الصفحة الرئيسية مع التمرير، وتؤدي حركة بين كل قسمين
// كل شيء دالة في موضع التمرير: تنزل فتتقدم العربة، تصعد فترجع، والخطوط خلفها ترسم مسارها
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof Path2D !== 'function') return;
  const rails = [...document.querySelectorAll('[data-ride]')];
  if (!rails.length) return;
  document.documentElement.classList.add('has-ride');

  const G = '#0B6446', Y = '#FFBA1D';
  const BODY = new Path2D('M428 913H475.4C497 913 516 927 521.5 948.5L544.8 1037.2C550.3 1058.2 569.3 1072.8 590.9 1072.8H728C745.2 1072.8 762 1065.3 772.8 1051.7C784.2 1037.5 787.9 1019.1 783.1 1001.6L764.4 933.5C761 921.4 750 913 737.5 913C726 913 716 919.5 711.3 930L693 980C689.5 990 679.5 990 676 980L659 930C655 919.5 644.5 913 632.5 913C620 913 609 921 605.4 933.6L581.7 1011.6');
  const BARS = [[405.9, 954.6, 72, 25.7, G], [428, 1009.2, 71.9, 25.7, Y], [414, 1063.8, 76, 25.7, G]];
  const WH = [[633.8, 1125.7], [704.5, 1125.7]];
  const CC = [600, 1040];               // مركز العربة
  const BOTTOM = 1147.9;                 // أسفل العجلات
  const TAIL = BARS.map((b) => [b[0] - CC[0], b[1] + b[3] / 2 - CC[1]]); // أطراف الخطوط
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lin = (t, a, b) => cl((t - a) / (b - a)), mix = (a, b, p) => a + (b - a) * p;
  const eio = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const exo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
  const bump = (u, a, b) => { const p = lin(u, a, b); return Math.sin(p * Math.PI); };
  const ss = (a, b, v) => { const p = lin(v, a, b); return p * p * (3 - 2 * p); };

  const cv = document.createElement('canvas');
  cv.className = 'ride'; cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const x = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, S = 0.3, RH = 140;
  function size() {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const small = W < 700;
    S = (small ? 84 : 150) / 382;          // عرض العربة على الشاشة
    RH = small ? 96 : 150;                  // ارتفاع مساحة الحركة فوق المسار
  }
  size();

  // ——— الحركات: لكل حركة دالة تعطي موضع التماس وزاوية العربة بدلالة التقدم u ———
  const X0 = () => -0.14 * W, X1 = () => 1.14 * W;
  const runX = (h) => mix(X0(), X1(), h);
  const STUNTS = {
    hill(u) { const b = bump(u, 0.28, 0.72), y = -RH * 0.42 * b; const d = Math.cos(lin(u, 0.28, 0.72) * Math.PI) * (u > 0.28 && u < 0.72 ? 1 : 0); return { x: runX(u), y, ang: -Math.atan(d * RH * 0.42 * Math.PI / (0.44 * (X1() - X0()))) }; },
    loop(u) { // حلقة عمودية كاملة
      const a = 0.4, b = 0.64, R = RH * 0.55;
      const h = (u - cl(u - a, 0, b - a)) / (1 - (b - a));
      const xL = runX(a / (1 - (b - a)));
      if (u <= a || u >= b) return { x: runX(h), y: 0, ang: 0, R, xL };
      const th = 2 * Math.PI * (u - a) / (b - a);
      return { x: xL + R * Math.sin(th), y: -R + R * Math.cos(th), ang: -th, inLoop: 1, R, xL };
    },
    jump(u) { // منحدر ثم شقلبة في الهواء
      const r0 = 0.32, r1 = 0.42, f1 = 0.66, H1 = RH * 0.32;
      if (u < r0) return { x: runX(u), y: 0, ang: 0 };
      if (u < r1) { const p = (u - r0) / (r1 - r0); return { x: runX(u), y: -p * p * H1, ang: -Math.atan(2 * p * H1 / ((r1 - r0) * (X1() - X0()))) }; }
      if (u < f1) { const p = (u - r1) / (f1 - r1); const a0 = -Math.atan(2 * H1 / ((r1 - r0) * (X1() - X0()))); return { x: runX(u), y: -H1 * (1 - p) - RH * 1.25 * 4 * p * (1 - p), ang: mix(a0, 2 * Math.PI, eio(p)), air: 1 }; }
      return { x: runX(u), y: 0, ang: 0, land: u - f1 };
    },
    wheelie(u) { const w = -0.42 * ss(0.3, 0.38, u) * (1 - ss(0.62, 0.7, u)); return { x: runX(u), y: 0, ang: w, sparks: w < -0.3 }; },
    spin(u) { // قفزة بدورتين
      const a = 0.4, b = 0.64;
      if (u < a || u > b) return { x: runX(u), y: 0, ang: 0, land: u > b ? u - b : -1 };
      const p = (u - a) / (b - a); return { x: runX(u), y: -RH * 1.15 * 4 * p * (1 - p), ang: 4 * Math.PI * eio(p), air: 1 };
    },
    brake(u) { // تدخل بسرعة وتفرمل في المنتصف
      const p = exo(lin(u, 0, 0.62));
      return { x: mix(X0(), W / 2 + 382 * S * 0.15, p), y: 0, ang: 0, braking: u > 0.5 && u < 0.75, stop: u >= 0.62 };
    },
  };
  // مركز العربة وزاويتها من نقطة التماس
  const pose = (st, u, ty) => {
    const s = STUNTS[st](cl(u, 0, 1));
    const hc = (BOTTOM - CC[1]) * S;
    const nx = Math.sin(s.ang), ny = -Math.cos(s.ang);
    return { ...s, cx: s.x + nx * hc, cy: ty + s.y + ny * hc };
  };

  function drawCart(p, rot) {
    x.save(); x.translate(p.cx, p.cy); x.rotate(p.ang);
    let sq = 1; if (p.land >= 0 && p.land < 0.06) sq = 1 - 0.22 * Math.sin(p.land / 0.06 * Math.PI);
    x.translate(0, (1 - sq) * (BOTTOM - CC[1]) * S); x.scale(S, S * sq); x.translate(-CC[0], -CC[1]);
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = G; x.lineWidth = 25.7; x.stroke(BODY);
    for (const b of BARS) { x.fillStyle = b[4]; x.fillRect(b[0], b[1], b[2], b[3]); }
    for (const w of WH) {
      x.fillStyle = Y; x.beginPath(); x.arc(w[0], w[1], 22.2, 0, 7); x.fill();
      x.fillStyle = G; x.beginPath(); x.arc(w[0] + Math.cos(rot) * 10, w[1] + Math.sin(rot) * 10, 5, 0, 7); x.fill();
    }
    x.restore();
  }
  function tailPt(p, k) { const [bx, by] = TAIL[k]; const c = Math.cos(p.ang), s = Math.sin(p.ang); return [p.cx + (bx * c - by * s) * S, p.cy + (bx * s + by * c) * S]; }
  function ribbons(st, u, ty) {
    const N = 34, L = st === 'brake' ? mix(0.2, 0, lin(u, 0.5, 0.7)) : 0.2;
    if (L <= 0.002) return;
    for (let k = 0; k < 3; k++) {
      const col = k === 1 ? '255,186,29' : '11,100,70';
      const w0 = 25.7 * S * (k === 1 ? 1.05 : 0.9);
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const q = tailPt(pose(st, u - i * L / N, ty), k);
        if (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 160) break;
        if (prev) { const f = i / N; x.strokeStyle = `rgba(${col},${Math.pow(1 - f, 1.3) * 0.85})`; x.lineWidth = w0 * (1 - f * 0.85); x.beginPath(); x.moveTo(prev[0], prev[1]); x.lineTo(q[0], q[1]); x.stroke(); }
        prev = q;
      }
    }
  }
  function track(st, u, ty, a) {
    x.save(); x.globalAlpha = a;
    x.strokeStyle = 'rgba(11,100,70,.22)'; x.lineWidth = 2; x.setLineDash([16, 12]); x.lineDashOffset = -u * 600;
    x.beginPath();
    if (st === 'hill') { for (let px = 0; px <= W; px += 10) { const uu = lin(px, X0(), X1()); const y = ty - RH * 0.42 * bump(uu, 0.28, 0.72); px ? x.lineTo(px, y) : x.moveTo(px, y); } }
    else { x.moveTo(0, ty); x.lineTo(W, ty); }
    x.stroke(); x.setLineDash([]);
    if (st === 'loop') { const s = STUNTS.loop(0.5); x.strokeStyle = 'rgba(11,100,70,.16)'; x.lineWidth = 3; x.beginPath(); x.arc(s.xL, ty - s.R, s.R, 0, 7); x.stroke(); }
    if (st === 'jump') { x.fillStyle = 'rgba(11,100,70,.12)'; const a0 = runX(0.32), a1 = runX(0.42); x.beginPath(); x.moveTo(a0, ty); for (let i = 0; i <= 10; i++) { const p = i / 10; x.lineTo(mix(a0, a1, p), ty - p * p * RH * 0.32); } x.lineTo(a1, ty); x.closePath(); x.fill(); }
    x.restore();
  }
  // شرر الرفع على العجلة الخلفية: نقي في التقدم
  function sparks(p, u) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    const wx = p.cx + ((WH[0][0] - CC[0]) * c - (BOTTOM - CC[1]) * s) * S, wy = p.cy + ((WH[0][0] - CC[0]) * s + (BOTTOM - CC[1]) * c) * S;
    for (let i = 0; i < 14; i++) {
      const ph = (u * 60 + i * 0.37) % 1, ang = Math.PI + 0.3 + (i % 5) * 0.12;
      const d = ph * 46; x.strokeStyle = `rgba(255,${170 + (i % 3) * 30},40,${1 - ph})`; x.lineWidth = 2;
      x.beginPath(); x.moveTo(wx + Math.cos(ang) * d, wy - Math.sin(ang) * d * 0.6 + ph * ph * 30); x.lineTo(wx + Math.cos(ang) * (d + 8), wy - Math.sin(ang) * (d + 8) * 0.6 + ph * ph * 30); x.stroke();
    }
  }

  // تمرير ناعم: الموضع المعروض يلحق بالحقيقي فتبقى الحركة سلسة مع عجلة الفأرة
  let sy = scrollY, raf = 0;
  const docY = () => rails.map((r) => r.getBoundingClientRect().bottom + scrollY);
  let tops = docY();
  function frame() {
    raf = 0;
    sy += (scrollY - sy) * 0.2;
    if (Math.abs(scrollY - sy) < 0.4) sy = scrollY;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    rails.forEach((r, i) => {
      const st = r.dataset.ride; const ty = tops[i] - sy;
      if (ty < -RH * 2 || ty > H + RH) return;
      const u = lin(ty, H * 0.92, H * 0.28);
      const a = Math.min(lin(ty, H + 40, H * 0.85), 1 - lin(ty, H * 0.12, -RH));
      track(st, u, ty, a);
      if (u <= 0 || (u >= 1 && st !== 'brake')) return;
      const p = pose(st, u, ty);
      ribbons(st, u, ty);
      if (p.sparks) sparks(p, u);
      drawCart(p, p.x / (22.2 * S));
    });
    if (sy !== scrollY) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { size(); tops = docY(); kick(); });
  // الصور والخطوط والأقسام المتغيرة تغير أطوال الصفحة: نعيد القياس
  new ResizeObserver(() => { tops = docY(); kick(); }).observe(document.body);
  kick();
})();
