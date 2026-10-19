// «عربة الضوء»: افتتاحية سينمائية حية للشعار، وتكوّن شعار التذييل من جسيمات
// الضوء يرسم العربة، تشتعل وتنطلق، نعبر من سلتها إلى نفق عربات، ثم تتجمع العربات لتكتب الشعار
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = !reduce && !!document.createElement('canvas').getContext && typeof Path2D === 'function';
  const Y = '#FFBA1D', CR = '#F7F3EA';
  const BODY_D = 'M428 913H475.4C497 913 516 927 521.5 948.5L544.8 1037.2C550.3 1058.2 569.3 1072.8 590.9 1072.8H728C745.2 1072.8 762 1065.3 772.8 1051.7C784.2 1037.5 787.9 1019.1 783.1 1001.6L764.4 933.5C761 921.4 750 913 737.5 913C726 913 716 919.5 711.3 930L693 980C689.5 990 679.5 990 676 980L659 930C655 919.5 644.5 913 632.5 913C620 913 609 921 605.4 933.6L581.7 1011.6';
  const BARS = [[405.9, 954.6, 72, 25.7], [428, 1009.2, 71.9, 25.7], [414, 1063.8, 76, 25.7]];
  const WH = [[633.8, 1125.7], [704.5, 1125.7]];
  const CC = [600, 1030], BASKET = [650, 975];
  const LOGO_AR = 1244.2 / 267.3; // نسبة أبعاد الشعار الأفقي
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lin = (t, a, b) => cl((t - a) / (b - a)), mix = (a, b, p) => a + (b - a) * p;
  const eo = (p) => 1 - Math.pow(1 - p, 3), eio = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const eb = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const expo = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
  const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mobile = () => matchMedia('(max-width: 700px), (pointer: coarse)').matches;

  let BODY = null, measure = null, BL = 1;
  function geometry() {
    if (BODY) return;
    BODY = new Path2D(BODY_D);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    measure = document.createElementNS(ns, 'path'); measure.setAttribute('d', BODY_D);
    svg.append(measure); document.body.append(svg);
    BL = measure.getTotalLength();
  }

  // الشعار نقطيًا بكلمة فاتحة، يحمَّل مرة واحدة
  let logoImg = null, logoPromise = null;
  function loadLogo() {
    if (logoPromise) return logoPromise;
    logoPromise = fetch('/img/logo-horizontal.svg').then((r) => r.text()).then((txt) => new Promise((res, rej) => {
      const svg = txt.replace(/#006442/gi, CR).replace(/var\(--logo-word,\s*[^)]+\)/g, CR).replace(/var\(--logo-cart,\s*[^)]+\)/g, Y);
      const img = new Image();
      img.onload = () => { logoImg = img; res(img); };
      img.onerror = rej;
      img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }));
    return logoPromise;
  }
  // نقاط الشعار: موضع ولون لكل جسيم داخل مستطيل معين
  function sampleLogo(w, h, max) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(logoImg, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const pts = [];
    const step = 2;
    for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3] > 150) pts.push({ x, y, c: d[i] > 220 && d[i + 2] < 130 ? Y : CR });
    }
    const r = rng(4);
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    return pts.slice(0, max);
  }

  function miniCart(x, px, py, s, rot, col, alpha) {
    x.save(); x.translate(px, py); x.rotate(rot); x.scale(s, s); x.translate(-CC[0], -CC[1]); x.globalAlpha = alpha;
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 25.7; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(BODY);
    for (const b of BARS) x.fillRect(b[0], b[1], b[2], b[3]);
    for (const w of WH) { x.beginPath(); x.arc(w[0], w[1], 22.2, 0, 7); x.fill(); }
    x.restore();
  }

  // ——— الافتتاحية ———
  const PAINT0 = 0.1, PAINT1 = 1.0, IGN = 1.0, WARP0 = 1.3, TUN0 = 2.0, CONV0 = 2.55, SNAP = 3.45, EXIT0 = 3.85, EXIT1 = 4.6;
  let playing = false;
  function play({ target = null, onReveal = () => {}, onDone = () => {} } = {}) {
    if (!ok || playing) { onReveal(); onDone(); return false; }
    geometry(); loadLogo().catch(() => {});
    playing = true;
    const lite = mobile();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const cv = document.createElement('canvas');
    cv.className = 'sting'; cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    let W = 0, H = 0;
    const x = cv.getContext('2d');
    const size = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
    size();
    // مقاسات مشتقة من الشاشة
    const K = Math.min(W * 0.6 / 382, H * 0.42 / 235);
    const OX = W / 2 - CC[0] * K, OY = H / 2 - CC[1] * K;
    const toS = (px, py) => [OX + px * K, OY + py * K];
    const LW = Math.min(W * 0.74, 860), LH = LW / LOGO_AR, LX = (W - LW) / 2, LY = (H - LH) / 2 - H * 0.02;
    const R = rng(21);
    const SPARKS = Array.from({ length: lite ? 70 : 130 }, (_, i) => ({ ts: PAINT0 + i * ((PAINT1 - PAINT0) / (lite ? 70 : 130)), vx: (R() - 0.5) * 380, vy: -R() * 340 - 60, life: 0.45 + R() * 0.55, sz: 1 + R() * 2.2, hot: R() < 0.3 }));
    const STREAKS = Array.from({ length: lite ? 120 : 240 }, () => ({ a: R() * Math.PI * 2, r0: 30 + R() * Math.max(W, H) * 0.5, sp: 0.6 + R() * 1.6, w: 0.6 + R() * 2.2, y: R() < 0.35 }));
    const DUST = Array.from({ length: lite ? 60 : 120 }, () => ({ a: R() * Math.PI * 2, v: 160 + R() * 700, sz: 1 + R() * 2.5, y: R() < 0.5, l: 0.5 + R() * 0.9 }));
    let P = null; // الجسيمات تُبنى حين يجهز الشعار
    const buildParticles = () => {
      if (P || !logoImg) return;
      const pts = sampleLogo(LW, LH, lite ? 520 : 900);
      const r = rng(11), sc = Math.min(W, H) / 1080;
      P = pts.map((p) => ({ tx: LX + p.x, ty: LY + p.y, c: p.c, a: r() * Math.PI * 2, rad: mix(380, 1250, Math.pow(r(), 0.6)) * sc, z0: r() * 7, rot: (r() - 0.5) * 6, spin: (r() - 0.5) * 2, del: r() * 0.3, size: mix(0.55, 1.25, r()), cart: r() < 0.4 }));
    };
    loadLogo().then(buildParticles).catch(() => {}); // نجهز الجسيمات مبكرًا بدل لحظة التكوّن
    const headAt = (p) => { const q = measure.getPointAtLength(cl(p) * BL); return toS(q.x, q.y); };
    const drawP = (t) => eio(lin(t, PAINT0, PAINT1));
    const strokeBody = (p, col, width, blur) => {
      x.save(); x.translate(OX, OY); x.scale(K, K); x.strokeStyle = col; x.lineWidth = width; x.lineJoin = 'round'; x.lineCap = 'round';
      x.setLineDash([BL * p, BL * 2]); x.stroke(BODY); x.restore();
    };
    const solidCart = (alpha, glow) => {
      x.save(); x.globalAlpha = alpha; x.translate(OX, OY); x.scale(K, K);
      x.strokeStyle = Y; x.lineWidth = 25.7; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(BODY);
      BARS.forEach((b, i) => { x.fillStyle = i === 1 ? Y : CR; x.fillRect(b[0], b[1], b[2], b[3]); });
      x.fillStyle = Y; for (const w of WH) { x.beginPath(); x.arc(w[0], w[1], 22.2, 0, 7); x.fill(); }
      x.restore();
    };
    const tunnel = (p, t) => {
      const tt = t - TUN0, D = 7;
      const z = ((p.z0 - tt * 3.4) % D + D) % D + 0.3;
      const ang = p.a + tt * 0.6;
      return { x: W / 2 + Math.cos(ang) * p.rad / z, y: H / 2 + Math.sin(ang) * p.rad * 0.8 / z, s: p.size / z, z, rot: p.rot + tt * p.spin };
    };
    const bgLayer = (glow) => {
      const c = document.createElement('canvas'); c.width = Math.ceil(W / 2); c.height = Math.ceil(H / 2); const g2 = c.getContext('2d');
      const g = g2.createRadialGradient(c.width / 2, c.height / 2, 20, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      g.addColorStop(0, `rgb(13,${90 + 30 * glow},${64 + 20 * glow})`); g.addColorStop(0.55, '#063826'); g.addColorStop(1, '#010F0A');
      g2.fillStyle = g; g2.fillRect(0, 0, c.width, c.height); return c;
    };
    const BG0 = bgLayer(0), BG1 = bgLayer(1);
    const bg = (glow) => { x.drawImage(BG0, 0, 0, W, H); if (glow > 0) { x.globalAlpha = glow; x.drawImage(BG1, 0, 0, W, H); x.globalAlpha = 1; } };
    const logoRect = (t) => { // الشعار في المنتصف ثم يطير إلى الترويسة
      const k = eio(lin(t, EXIT0, EXIT1));
      if (!target || !target.width) return { x: LX, y: LY, w: LW, h: LH, a: 1 - k };
      return { x: mix(LX, target.left, k), y: mix(LY, target.top, k), w: mix(LW, target.width, k), h: mix(LH, target.height, k), a: 1 };
    };

    let t0 = performance.now(), skipTo = 0, revealed = false, raf = 0;
    const skip = () => { const t = (performance.now() - t0) / 1000; if (t < SNAP - 0.1) { t0 -= (SNAP - 0.1 - t) * 1000; } else if (t < EXIT0) { t0 -= (EXIT0 - t) * 1000; } };
    const onKey = (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); skip(); } };
    cv.addEventListener('pointerdown', skip);
    addEventListener('keydown', onKey);
    addEventListener('resize', size);

    function frame(now) {
      const t = (now - t0) / 1000;
      if (t >= CONV0 - 0.6) buildParticles();
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0;
      if (t >= EXIT0 && !revealed) { revealed = true; onReveal(); }
      // الخلفية مع فتحة دائرية تكشف الموقع عند الخروج
      bg(t < TUN0 ? lin(t, 0.1, 1.2) * 0.6 : 0.5 + 0.5 * lin(t, SNAP, SNAP + 0.5));
      // ١ الضوء يرسم العربة
      if (t < WARP0 + 0.05) {
        x.save();
        const s = mix(0.92, 1, eo(lin(t, 0, WARP0))); x.translate(W / 2, H / 2); x.rotate(mix(-0.03, 0, eo(lin(t, 0, WARP0)))); x.scale(s, s); x.translate(-W / 2, -H / 2);
        const p = drawP(t);
        if (t < PAINT0 + 0.2) { const [hx, hy] = headAt(0); const e = lin(t, 0, PAINT0 + 0.1); const g = x.createRadialGradient(hx, hy, 0, hx, hy, 70 * e + 1); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.3, 'rgba(255,186,29,.85)'); g.addColorStop(1, 'rgba(255,186,29,0)'); x.fillStyle = g; x.fillRect(hx - 90, hy - 90, 180, 180); }
        x.globalCompositeOperation = 'lighter';
        if (p > 0) {
          const ign = lin(t, IGN, IGN + 0.25);
          strokeBody(p, 'rgba(255,186,29,.12)', 64, 0);
          strokeBody(p, 'rgba(255,186,29,.3)', 36, 0);
          strokeBody(p, Y, 16 + ign * 10, 14);
          strokeBody(p, `rgba(255,248,225,${0.9 - ign * 0.4})`, 5, 0);
          if (p < 1) {
            const [hx, hy] = headAt(p); const g = x.createRadialGradient(hx, hy, 0, hx, hy, 110); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,214,120,.9)'); g.addColorStop(1, 'rgba(255,186,29,0)'); x.fillStyle = g; x.fillRect(hx - 120, hy - 120, 240, 240);
            const lg = x.createLinearGradient(hx - 320, 0, hx + 320, 0); lg.addColorStop(0, 'rgba(255,186,29,0)'); lg.addColorStop(0.5, 'rgba(255,230,170,.5)'); lg.addColorStop(1, 'rgba(255,186,29,0)'); x.fillStyle = lg; x.fillRect(hx - 320, hy - 2, 640, 4);
          }
        }
        for (const sp of SPARKS) {
          const age = t - sp.ts; if (age < 0 || age > sp.life) continue;
          const [sx, sy] = headAt(drawP(sp.ts)); const px = sx + sp.vx * age, py = sy + sp.vy * age + 520 * age * age; const a = 1 - age / sp.life;
          x.fillStyle = sp.hot ? `rgba(255,250,230,${a})` : `rgba(255,186,29,${a})`; x.beginPath(); x.arc(px, py, sp.sz * (0.6 + a), 0, 7); x.fill();
        }
        BARS.forEach((b, i) => {
          const q = eo(lin(t, IGN - 0.05 + i * 0.05, IGN + 0.25 + i * 0.05)); if (q <= 0) return;
          const [bx, by] = toS(b[0], b[1]); const bw = b[2] * K, bh = b[3] * K; const L = mix(W, bw, q); const x0 = bx + bw - L; const col = i === 1 ? Y : CR;
          const g = x.createLinearGradient(x0, 0, bx + bw, 0); g.addColorStop(0, 'rgba(255,186,29,0)'); g.addColorStop(0.6, col); g.addColorStop(1, col); x.fillStyle = g; x.fillRect(x0, by, L, bh);
        });
        WH.forEach((w, i) => {
          const q = lin(t, IGN + 0.05 + i * 0.07, IGN + 0.35 + i * 0.07); if (q <= 0) return;
          const [wx, wy] = toS(w[0], w[1]); x.fillStyle = Y; x.beginPath(); x.arc(wx, wy + (1 - eb(q)) * -260, 22.2 * K, 0, 7); x.fill();
        });
        const fl = Math.max(0, 1 - Math.abs(t - IGN - 0.05) / 0.14); if (fl > 0) { x.fillStyle = `rgba(255,220,140,${fl * 0.3})`; x.fillRect(0, 0, W, H); }
        x.restore();
      }
      // ٢ الاندفاع والعبور من فتحة السلة
      if (t >= WARP0 && t < TUN0 + 0.3) {
        const go = lin(t, WARP0 + 0.15, TUN0);
        const [bx, by] = toS(BASKET[0], BASKET[1]);
        x.save(); x.globalCompositeOperation = 'lighter';
        const speed = expo(go) * 9 + go * 0.6;
        for (const s of STREAKS) {
          const rr = s.r0 * (1 + speed * s.sp * 1.6) + go * go * 500 * s.sp; const len = 30 + speed * s.sp * 200;
          const ax = Math.cos(s.a), ay = Math.sin(s.a); const a = cl(go * 3) * (s.y ? 0.9 : 0.5);
          x.strokeStyle = s.y ? `rgba(255,186,29,${a})` : `rgba(247,243,234,${a * 0.8})`; x.lineWidth = s.w * (1 + go * 2);
          x.beginPath(); x.moveTo(bx + ax * rr, by + ay * rr); x.lineTo(bx + ax * (rr + len), by + ay * (rr + len)); x.stroke();
        }
        x.restore();
        const shake = go <= 0 ? Math.sin(t * 90) * 3 * lin(t, WARP0, WARP0 + 0.15) : 0;
        const zs = 1 + expo(go) * 55 + go * 1.2;
        x.save(); x.translate(bx + shake, by); x.scale(zs, zs); x.translate(-bx, -by); solidCart(1 - lin(t, TUN0 - 0.15, TUN0), 16 + go * 20); x.restore();
        const fl = lin(t, TUN0 - 0.15, TUN0) * (1 - lin(t, TUN0, TUN0 + 0.3));
        if (fl > 0) { x.fillStyle = `rgba(255,186,29,${fl})`; x.fillRect(0, 0, W, H); }
      }
      // ٣ نفق العربات ثم التكوّن
      if (t >= TUN0 && t < SNAP + 0.25) {
        if (P) {
          const fade = lin(t, TUN0, TUN0 + 0.3) * (1 - lin(t, SNAP - 0.08, SNAP + 0.2));
          const items = P.map((p) => ({ p, st: tunnel(p, Math.min(t, CONV0 + p.del)) }));
          if (t < CONV0) items.sort((a, b) => b.st.z - a.st.z); // البعيد أولًا
          for (const { p, st } of items) {
            const k = eio(lin(t, CONV0 + p.del, CONV0 + p.del + 0.6));
            let px, py, s, rot, al;
            if (k <= 0) { px = st.x; py = st.y; s = st.s; rot = st.rot; al = cl((7.3 - st.z) / 2) * cl(st.z * 2.5 - 0.6) * (p.cart ? 1 : mix(0.25, 1, cl((4 - st.z) / 2.5))); }
            else { const cx = mix(st.x, p.tx, 0.5) + Math.cos(p.a) * 200 * (1 - k), cy = mix(st.y, p.ty, 0.5) + Math.sin(p.a) * 200 * (1 - k); const u = k;
              px = (1 - u) * (1 - u) * st.x + 2 * (1 - u) * u * cx + u * u * p.tx; py = (1 - u) * (1 - u) * st.y + 2 * (1 - u) * u * cy + u * u * p.ty; s = mix(st.s, 0, k); rot = mix(st.rot, 0, k); al = 1; }
            const scr = s * 0.2 * Math.min(W, H) / 1080;
            if (k >= 0.999 || scr < 0.05) { const r = k > 0 ? mix(Math.max(1.4, scr * 110), 3, k) : Math.max(1, scr * 100); x.globalAlpha = al * fade; x.fillStyle = p.c; x.fillRect(px - r / 2, py - r / 2, r, r); }
            else miniCart(x, px, py, scr, rot, p.c, al * fade);
          }
          x.globalAlpha = 1;
        } else if (t > CONV0 + 0.4) { t0 -= (SNAP - t) * 1000; } // الشعار لم يجهز: نتجاوز
      }
      // ٤ الإطباق: الشعار الحقيقي وموجة صدمة، ثم يطير إلى الترويسة
      if (t >= SNAP - 0.1 && logoImg) {
        const a = lin(t, SNAP - 0.05, SNAP + 0.2);
        const lr = logoRect(t);
        const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.5); g.addColorStop(0, `rgba(255,186,29,${0.12 * a * (1 - lin(t, EXIT0, EXIT1))})`); g.addColorStop(1, 'rgba(255,186,29,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        const sc = mix(1.06, 1, eo(lin(t, SNAP, SNAP + 0.5)));
        x.save(); x.globalAlpha = a * lr.a; x.translate(lr.x + lr.w / 2, lr.y + lr.h / 2); x.scale(sc, sc);
        x.drawImage(logoImg, -lr.w / 2, -lr.h / 2, lr.w, lr.h); x.restore();
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const [d, c] of [[0, '255,214,120'], [0.1, '247,243,234']]) { const q = lin(t, SNAP + d, SNAP + d + 0.6); if (q <= 0 || q >= 1) continue; const R0 = LW * 0.62 + eo(q) * Math.max(W, H); x.strokeStyle = `rgba(${c},${(1 - q) * 0.45})`; x.lineWidth = 8 * (1 - q) + 1; x.beginPath(); x.ellipse(W / 2, H / 2, R0, R0 * 0.62, 0, 0, 7); x.stroke(); }
        for (const d of DUST) { const age = t - SNAP; if (age < 0 || age > d.l) continue; const q = age / d.l; const r = eo(q) * d.v; x.fillStyle = d.y ? `rgba(255,186,29,${1 - q})` : `rgba(247,243,234,${1 - q})`; x.fillRect(W / 2 + Math.cos(d.a) * r * 1.4, H / 2 + Math.sin(d.a) * r * 0.8, d.sz, d.sz); }
        const fl = Math.max(0, 1 - Math.abs(t - SNAP) / 0.2); x.fillStyle = `rgba(255,240,200,${fl * 0.45})`; x.fillRect(0, 0, W, H);
        x.restore();
      }
      // البداية من لون الافتتاحية الفاتح حتى لا تومض الشاشة
      if (t < 0.35) { x.fillStyle = `rgba(247,243,234,${1 - eo(lin(t, 0, 0.35))})`; x.fillRect(0, 0, W, H); }
      // الخروج: فتحة دائرية تتسع من مركز الشعار فينكشف الموقع
      if (t >= EXIT0) {
        const k = eio(lin(t, EXIT0, EXIT1));
        x.save(); x.globalCompositeOperation = 'destination-out';
        x.beginPath(); x.arc(W / 2, H / 2, k * Math.hypot(W, H) * 0.62, 0, 7); x.fill(); x.restore();
        // الشعار المتجه للترويسة يبقى فوق الفتحة
        if (logoImg && target && target.width) { const lr = logoRect(t); x.drawImage(logoImg, lr.x, lr.y, lr.w, lr.h); }
      }
      if (t < EXIT1) { raf = requestAnimationFrame(frame); return; }
      cv.remove(); removeEventListener('keydown', onKey); removeEventListener('resize', size);
      playing = false; if (!revealed) onReveal(); onDone();
    }
    raf = requestAnimationFrame(frame);
    return true;
  }

  // ——— شعار التذييل يتكون من عربات صغيرة حين يظهر ———
  function form(el) {
    if (!ok || !el || !('IntersectionObserver' in window)) return;
    const svg = el.querySelector('svg'); if (!svg) return;
    el.classList.add('pform');
    const io = new IntersectionObserver((ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      io.disconnect();
      geometry();
      loadLogo().then(() => run()).catch(() => el.classList.remove('pform'));
    }, { threshold: 0.45 });
    io.observe(el);
    function run() {
      const box = el.getBoundingClientRect(), sb = svg.getBoundingClientRect();
      const lite = mobile(), dpr = Math.min(devicePixelRatio || 1, 2);
      const pad = 140, W = box.width, H = box.height + pad * 2;
      const cv = document.createElement('canvas'); cv.className = 'pform-cv'; cv.setAttribute('aria-hidden', 'true');
      cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:absolute;left:0;top:${-pad}px;width:${W}px;height:${H}px;pointer-events:none`;
      el.append(cv);
      const x = cv.getContext('2d');
      const ox = sb.left - box.left, oy = sb.top - box.top + pad;
      const pts = sampleLogo(sb.width, sb.height, lite ? 420 : 900);
      const r = rng(17);
      const P = pts.map((p) => { const a = r() * Math.PI * 2, d = 200 + r() * Math.max(W, 600) * 0.7; return { tx: ox + p.x, ty: oy + p.y, c: p.c, sx: ox + sb.width / 2 + Math.cos(a) * d, sy: oy + sb.height / 2 + Math.sin(a) * d * 0.5 + 120, rot: (r() - 0.5) * 8, del: r() * 0.55, s: 0.04 + r() * 0.07, cart: r() < 0.45 }; });
      const T = 2.0, t0 = performance.now();
      let shown = false;
      function frame(now) {
        const t = (now - t0) / 1000;
        x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
        const fade = 1 - lin(t, 1.55, 1.9);
        for (const p of P) {
          const k = eio(lin(t, p.del, p.del + 1.0));
          const cx = mix(p.sx, p.tx, 0.5) + (p.tx - p.sx) * 0.25 * Math.sin(p.rot), cy = mix(p.sy, p.ty, 0.5) - 160;
          const px = (1 - k) * (1 - k) * p.sx + 2 * (1 - k) * k * cx + k * k * p.tx, py = (1 - k) * (1 - k) * p.sy + 2 * (1 - k) * k * cy + k * k * p.ty;
          const al = lin(t, p.del, p.del + 0.2) * fade;
          if (p.cart && k < 0.85) miniCart(x, px, py, p.s * (1 - k * 0.8), p.rot * (1 - k), p.c, al);
          else { x.globalAlpha = al; x.fillStyle = p.c; x.fillRect(px - 1.5, py - 1.5, 3, 3); }
        }
        x.globalAlpha = 1;
        if (t > 1.45 && !shown) { shown = true; el.classList.remove('pform'); el.classList.add('pform-in'); }
        if (t < T) requestAnimationFrame(frame); else cv.remove();
      }
      requestAnimationFrame(frame);
    }
  }

  window.mcSting = { ok, play, form, get playing() { return playing; } };
  if (ok) loadLogo().catch(() => {}); // تحميل مبكر حتى يجهز قبل لحظة التكوّن
})();
