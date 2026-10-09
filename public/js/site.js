// ماك سنتر — الحركة والتفاعل. كل شيء يعمل دونه؛ هذا تحسين تدريجي.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 901px)');
  document.documentElement.classList.add('js');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ——— الترويسة: تصبح صلبة بعد البداية، وتختفي عند النزول وتعود عند الصعود ———
  const hdr = $('[data-hdr]');
  const dark = document.body.classList.contains('on-dark');
  const firstSection = $('main > section');
  const dock = $('[data-dock]');
  let lastY = scrollY;
  function onScroll() {
    const y = scrollY;
    const limit = dark && firstSection ? firstSection.offsetHeight - 90 : 20;
    hdr.classList.toggle('solid', y > limit);
    if (!document.body.classList.contains('menu-open')) hdr.classList.toggle('hide', y > 400 && y > lastY + 4);
    if (y < lastY - 4) hdr.classList.remove('hide');
    if (dock && !dock.dataset.lock) dock.classList.toggle('show', y > innerHeight * 0.6 && (y < lastY || y < 1200));
    lastY = y;
  }
  addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
  onScroll();

  // ——— «العربة تفتح عالم ماك»: افتتاحية الشعار ———
  // تدخل العربة بخطوط السرعة، تتفتح ست نوافذ للأقسام ثم تنطوي فيها، وتكتمل الكلمة،
  // ثم يطير الشعار إلى مكانه في الترويسة. يُتخطى بأي ضغطة، ويعاد بالضغط على الشعار.
  const intro = $('[data-intro]');
  const OUT = 'cubic-bezier(.16, 1, .3, 1)', INOUT = 'cubic-bezier(.7, 0, .2, 1)';
  let introAnims = [], introPlaying = false;
  function finishIntro() {
    if (!intro) return;
    introPlaying = false;
    intro.hidden = true;
    intro.classList.remove('js-run');
    introAnims.forEach((a) => a.cancel());
    introAnims = [];
    document.body.style.overflow = '';
    if (document.body.classList.contains('has-intro')) document.body.classList.remove('has-intro');
    document.dispatchEvent(new Event('intro:done'));
  }
  function skipIntro() { if (introPlaying) introAnims.forEach((a) => { try { a.finish(); } catch { /* */ } }); }
  function playIntro() {
    if (!intro || introPlaying) return;
    if (reduce || !Element.prototype.animate) { finishIntro(); return; }
    introPlaying = true;
    intro.hidden = false;
    intro.classList.add('js-run');
    document.body.style.overflow = 'hidden';
    // للمراحل المتعددة: التسارع لكل مقطع، والزمن الكلي خطي حتى تبقى نقاط التوقف في مواضعها
    const A = (el, kf, o = {}) => {
      const multi = kf.length > 2;
      const frames = multi ? kf.map((f) => ({ easing: o.easing || OUT, ...f })) : kf;
      const a = el.animate(frames, { fill: 'both', ...o, easing: multi ? 'linear' : (o.easing || OUT) });
      introAnims.push(a);
      return a;
    };
    const stage = $('.intro-stage', intro), box = $('.intro-logo', intro), svg = $('svg', box);
    const body = $('.mc-body', svg), wheels = $$('.mc-wh', svg), lines = $$('.mc-sp', svg);
    const ar = $$('.mc-ar', svg), la = $$('.mc-la', svg), wins = $$('.intro-win', intro);
    const vb = svg.viewBox.baseVal, W = box.offsetWidth, ppu = W / vb.width;
    const br = body.getBoundingClientRect(), lr = box.getBoundingClientRect();
    const shift = lr.left + lr.width / 2 - (br.left + br.width / 2);
    const away = -(innerWidth / 2 + W) / ppu;
    const rect = box.getBoundingClientRect();
    const target = $('.brand .logo')?.getBoundingClientRect();

    // ١ العربة تدخل وخطوط السرعة ممتدة خلفها
    A(box, [{ transform: `translateX(${shift}px)` }, { transform: `translateX(${shift}px)`, offset: 0.78, easing: INOUT }, { transform: 'none' }], { duration: 3150 });
    [body, ...wheels].forEach((el) => A(el, [{ transform: `translateX(${away}px)` }, { transform: 'translateX(14px) scaleX(.95)', offset: 0.8 }, { transform: 'none' }], { duration: 950, delay: 150 }));
    lines.forEach((el, i) => A(el, [{ transform: `translateX(${away * 1.1}px) scaleX(7)`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'translateX(0) scaleX(2.2)', offset: 0.78 }, { transform: 'none', opacity: 1 }], { duration: 1050, delay: 130 + i * 50 }));
    lines.forEach((el, i) => A(el, [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 260, delay: 1150 + i * 90, iterations: 2, easing: 'linear', fill: 'none' }));

    // النوافذ تتبع العربة حين تنزاح لتفسح للكلمة
    A($('.intro-wins', intro), [{ transform: 'none' }, { transform: 'none', offset: 0.78, easing: INOUT }, { transform: `translateX(${-shift}px)` }], { duration: 3150 });
    // ٢ النوافذ الست تتفتح حول العربة ثم تنطوي عائدة إليها
    const rx = Math.min(innerWidth * (innerWidth < 600 ? 0.3 : 0.36), 470), ry = Math.min(innerHeight * 0.33, 300);
    wins.forEach((w, k) => {
      const ang = (-90 + k * 60) * Math.PI / 180;
      const x = Math.cos(ang) * rx, y = Math.sin(ang) * ry;
      A(w, [
        { transform: 'translate(0, 0) scale(.15)', opacity: 0 },
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.26, easing: INOUT },
        { transform: `translate(${x * 1.03}px, ${y * 1.03}px) scale(1)`, opacity: 1, offset: 0.7, easing: INOUT },
        { transform: 'translate(0, 0) scale(.1) rotate(-8deg)', opacity: 0 },
      ], { duration: 1900, delay: 900 + k * 55, easing: OUT });
      $$('path', w).forEach((p, j) => A(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 650, delay: 1100 + k * 55 + j * 50 }));
    });
    // العربة تلتقط النوافذ العائدة
    [body, ...wheels].forEach((el) => A(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' }], { duration: 420, delay: 2650, composite: 'add', fill: 'none' }));

    // ٣ تكتمل الكلمة بالعربية ثم اللاتينية
    ar.forEach((el, i) => A(el, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 2500 + i * 45 }));
    la.forEach((el, i) => A(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay: 2800 + i * 35 }));

    // ٤ يستقر الشعار في الترويسة وترتفع الستارة
    if (target && target.width) {
      const s = target.width / rect.width;
      stage.style.transformOrigin = `${rect.left}px ${rect.top}px`;
      A(stage, [{ transform: 'none' }, { transform: `translate(${target.left - rect.left}px, ${target.top - rect.top}px) scale(${s})` }], { duration: 850, delay: 3450, easing: INOUT });
    }
    const end = A($('.intro-bg', intro), [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 850, delay: 3450, easing: INOUT });
    A($('.intro-skip', intro), [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 3300 });
    end.finished.then(finishIntro, () => {});
  }
  if (intro) {
    intro.addEventListener('click', skipIntro);
    addEventListener('keydown', (e) => { if (introPlaying && ['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); skipIntro(); } });
    if (intro.hasAttribute('data-autoplay')) playIntro();
    // إعادة التجربة بالضغط على الشعار في الرئيسية
    $('.brand')?.addEventListener('click', (e) => {
      if (location.pathname !== '/' || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      scrollTo({ top: 0, behavior: 'instant' });
      playIntro();
    });
  }
  // نبضة العجلات عند الضغط على الشعار في أي صفحة
  $$('.brand').forEach((b) => b.addEventListener('pointerdown', () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }));

  // ——— القائمة الكاملة ———
  const menuBtn = $('[data-menu]');
  const menu = $('[data-menu-panel]');
  let menuReturn = null;
  function setMenu(open, fromPop) {
    if (open === !menu.hidden && (open ? menu.classList.contains('open') : true)) return;
    if (open) {
      menuReturn = document.activeElement;
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('open')));
      document.body.classList.add('menu-open');
      document.body.style.overflow = 'hidden';
      menuBtn.setAttribute('aria-expanded', 'true');
      $('.menu-txt', menuBtn).textContent = 'إغلاق';
      hdr.classList.remove('hide');
      setTimeout(() => $('.menu-nav a', menu)?.focus(), 350);
      history.pushState({ menu: 1 }, '');
    } else {
      menu.classList.remove('open');
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
      menuBtn.setAttribute('aria-expanded', 'false');
      $('.menu-txt', menuBtn).textContent = 'القائمة';
      setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, reduce ? 0 : 800);
      menuReturn?.focus();
      if (!fromPop && history.state?.menu) history.back();
    }
  }
  menuBtn?.addEventListener('click', () => setMenu(menu.hidden || !menu.classList.contains('open')));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) { setMenu(false, true); } });
  addEventListener('popstate', () => { if (!menu.hidden) setMenu(false, true); $$('dialog[open]').forEach((d) => d.close()); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu && !menu.hidden) setMenu(false);
    if (e.key === 'Tab' && menu && !menu.hidden) {
      const f = [menuBtn, ...$$('a', menu)];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ——— واجهة العرض: الأقسام تتبدل في النافذة وترسم خطوطها ———
  const vit = $('[data-vitrine]');
  if (vit) {
    const items = $$('.vitrine-item', vit);
    const btns = $$('[data-show]', vit);
    const cart = $('.vitrine-cart', vit);
    let cur = 0, timer = null, paused = false;
    const show = (n) => {
      if (n === cur) return;
      const prev = items[cur];
      prev.classList.remove('on'); prev.classList.add('off'); prev.setAttribute('aria-hidden', 'true');
      setTimeout(() => prev.classList.remove('off'), 1300);
      const next = items[n];
      next.classList.add('on'); next.setAttribute('aria-hidden', 'false');
      const svg = $('.lineart', next);
      if (svg) { svg.classList.remove('drawn'); void svg.getBoundingClientRect(); svg.classList.add('drawn'); }
      btns.forEach((b, i) => { b.classList.toggle('on', i === n); b.setAttribute('aria-pressed', i === n); });
      cart?.classList.remove('roll'); void cart?.offsetWidth; cart?.classList.add('roll');
      cur = n;
    };
    const first = $('.lineart', items[0]);
    if (document.body.classList.contains('has-intro')) document.addEventListener('intro:done', () => setTimeout(() => first?.classList.add('drawn'), 450), { once: true });
    else setTimeout(() => first?.classList.add('drawn'), 450);
    btns.forEach((b, i) => b.addEventListener('click', () => { show(i); restart(); }));
    const tick = () => { if (!paused && !document.hidden) show((cur + 1) % items.length); };
    const restart = () => { clearInterval(timer); if (!reduce) timer = setInterval(tick, 4800); };
    vit.addEventListener('pointerenter', () => { paused = true; });
    vit.addEventListener('pointerleave', () => { paused = false; });
    vit.addEventListener('focusin', () => { paused = true; });
    vit.addEventListener('focusout', () => { paused = false; });
    restart();
  }

  // ——— الظهور عند التمرير ورسم الخطوط ———
  // العنصر المقصوص بالكامل لا يرصده المراقب، فنراقب حاويته
  const reveal = (el) => {
    if (el.matches('.lineart')) el.classList.add('drawn');
    else if (el.dataset.lines) $$('.reveal-lines', el).forEach((x) => x.classList.add('in'));
    else el.classList.add('in');
  };
  const io = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      reveal(en.target);
      io.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  const watch = (el) => (io ? io.observe(el) : reveal(el));
  $$('.reveal').forEach(watch);
  new Set($$('.reveal-lines').map((x) => x.parentElement)).forEach((p) => { p.dataset.lines = '1'; watch(p); });
  $$('.lineart.draw').filter((s) => !s.closest('.vitrine-item') && !s.closest('dialog')).forEach(watch);

  // ——— البيان: الكلمات تضيء مع التمرير ———
  const scrub = $('[data-words-scrub]');
  const words = scrub ? $$('.statement-text span', scrub) : [];
  function scrubWords() {
    if (!words.length) return;
    const r = scrub.getBoundingClientRect();
    const p = clamp((innerHeight * 0.8 - r.top) / (r.height * 0.75));
    const n = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle('lit', i < n));
  }
  if (reduce) words.forEach((w) => w.classList.add('lit'));

  // ——— الأقسام: معرض أفقي مثبت يتحرك مع التمرير العمودي ———
  const hs = $('[data-hscroll]');
  const track = hs && $('[data-htrack]', hs);
  const bar = hs && $('[data-hprogress]', hs);
  let shift = 0;
  function sizeH() {
    if (!hs) return;
    if (!desktop.matches || reduce) { hs.style.height = ''; track.style.setProperty('--x', '0px'); return; }
    shift = Math.max(0, track.scrollWidth - track.clientWidth);
    hs.style.height = `${innerHeight + shift}px`;
    moveH();
  }
  function moveH() {
    if (!hs || !desktop.matches || reduce) return;
    const r = hs.getBoundingClientRect();
    const p = clamp(-r.top / (hs.offsetHeight - innerHeight || 1));
    track.style.setProperty('--x', `${(p * shift).toFixed(1)}px`);
    bar?.style.setProperty('--p', p.toFixed(3));
  }
  addEventListener('resize', sizeH);
  document.fonts?.ready.then(sizeH);
  sizeH();

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; scrubWords(); moveH(); });
  }, { passive: true });
  scrubWords();

  // ——— اللوحات الجانبية ———
  function openSheet(d, opener) {
    if (!d || d.open) return;
    d.showModal();
    $$('.lineart.draw', d).forEach((s) => { s.classList.remove('drawn'); setTimeout(() => s.classList.add('drawn'), 350); });
    history.pushState({ sheet: 1 }, '');
    d.addEventListener('close', () => { opener?.focus(); if (history.state?.sheet) history.back(); }, { once: true });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-section]');
    if (t) { e.preventDefault(); openSheet($(`[data-section-sheet="${t.dataset.openSection}"]`), t); }
    const c = e.target.closest('[data-contact]');
    if (c) { const d = $('#contact'); if (d) { e.preventDefault(); openSheet(d, c); } }
    if (e.target.matches('dialog.sheet')) e.target.close();
  });

  // ——— المؤشر: يظهر فقط فوق العناصر القابلة للاستكشاف ———
  const cursor = $('[data-cursor]');
  if (cursor && matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
    let x = -200, y = -200, tx = x, ty = y, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2;
      cursor.style.setProperty('--cx', `${x}px`); cursor.style.setProperty('--cy', `${y}px`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : 0;
    };
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor]');
      if (t && t !== cursor) { $('span', cursor).textContent = t.dataset.cursor; cursor.classList.add('on'); }
      else cursor.classList.remove('on');
    });
  }

  // ——— الخريطة عند الطلب ———
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-load-map]');
    if (!b) return;
    const box = b.closest('[data-map]');
    const f = document.createElement('iframe');
    f.src = box.dataset.map; f.loading = 'lazy'; f.title = 'خريطة الموقع';
    box.replaceChildren(f);
  });

  // ——— قياس النقرات دون بيانات شخصية ———
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (!a) return;
    const body = JSON.stringify({ e: a.dataset.track, b: Number(a.dataset.branch) || null });
    navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' })) || fetch('/api/t', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
  }, { capture: true });

  // ——— شريط الجوال لا يغطي الحقول ———
  if (dock) {
    document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) { dock.dataset.lock = '1'; dock.classList.remove('show'); } });
    document.addEventListener('focusout', () => { delete dock.dataset.lock; });
    if (document.body.classList.contains('page-form')) dock.remove();
  }

  // ——— نموذج الاشتراك ———
  const sub = $('[data-subscribe]');
  if (sub) {
    sub.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(sub);
      const btn = $('button[type="submit"]', sub);
      btn.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch('/subscribe', { method: 'POST', body: new URLSearchParams(new FormData(sub)), headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (!res.ok) { showErrors(sub, data); return; }
        // ننتقل لصفحة الانتظار ثم نفتح واتساب؛ لا تظهر حالة «مكتمل» قبل وصول الرسالة فعلًا
        location.href = `/subscribe/status/${data.statusKey}?go=1`;
      } catch {
        sub.submit();
      } finally {
        btn.removeAttribute('aria-busy');
      }
    });
  }

  // ——— صفحة انتظار التأكيد ———
  const status = $('[data-sub-status]');
  if (status) {
    const key = status.dataset.subStatus;
    const wa = $('[data-wa-open]', status);
    if (wa && new URLSearchParams(location.search).get('go') === '1') {
      history.replaceState(null, '', location.pathname);
      setTimeout(() => { location.href = wa.href; }, 450);
    }
    let tries = 0;
    const poll = async () => {
      if (status.dataset.state !== 'awaiting' || tries++ > 400) return;
      try {
        const r = await fetch(`/api/public/subscribe/${key}`, { cache: 'no-store' });
        const d = await r.json();
        if (d.status && d.status !== status.dataset.state) {
          status.dataset.state = d.status;
          $(`[data-when="${d.status}"] h1`, status)?.focus?.();
          return;
        }
      } catch { /* نعيد المحاولة */ }
      setTimeout(poll, document.hidden ? 6000 : 2500);
    };
    setTimeout(poll, 1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tries = Math.max(0, tries - 1); } });
  }

  // ——— نموذج الملاحظات ———
  const fb = $('[data-feedback]');
  if (fb) {
    const wants = $('[data-wants-contact]', fb);
    const row = $('[data-consent-row]', fb);
    const hint = $('[data-phone-hint]', fb);
    const types = $$('input[name="type"]', fb);
    const sync = () => {
      const type = types.find((t) => t.checked)?.value;
      if (type === 'contact') wants.checked = true;
      row.hidden = !wants.checked;
      hint.textContent = wants.checked ? '(مطلوب للتواصل)' : '(اختياري)';
    };
    wants.addEventListener('change', sync);
    types.forEach((t) => t.addEventListener('change', sync));
    sync();
    const files = $('input[type="file"]', fb);
    files?.addEventListener('change', () => {
      const max = Number(files.dataset.max || 3);
      const big = [...files.files].some((f) => f.size > 10 * 1024 * 1024);
      files.setCustomValidity(files.files.length > max ? `${max} صور بحد أقصى` : big ? 'حجم الصورة يتجاوز 10 ميجابايت' : '');
      files.reportValidity();
    });
    fb.addEventListener('submit', async (e) => {
      if (!window.fetch || !window.FormData) return;
      e.preventDefault();
      clearErrors(fb);
      const btn = $('[data-submit]', fb);
      btn.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch('/feedback', { method: 'POST', body: new FormData(fb), headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (!res.ok) { showErrors(fb, data); return; }
        location.href = `/feedback/done/${data.trackKey}`;
      } catch {
        showErrors(fb, { error: 'تعذر الإرسال. تأكد من الاتصال وحاول مجددًا؛ ما كتبته محفوظ في النموذج.' });
      } finally {
        btn.removeAttribute('aria-busy');
      }
    });
  }

  function clearErrors(form) {
    $$('.err[data-js], .alert[data-js]', form).forEach((n) => n.remove());
    $$('[aria-invalid]', form).forEach((n) => n.removeAttribute('aria-invalid'));
    $$('.has-error', form).forEach((n) => n.classList.remove('has-error'));
  }
  function showErrors(form, data) {
    const alert = document.createElement('div');
    alert.className = 'alert';
    alert.dataset.js = '1';
    alert.setAttribute('role', 'alert');
    alert.textContent = data.error || 'تحقق من الحقول';
    form.prepend(alert);
    let firstField = null;
    for (const [name, msg] of Object.entries(data.fields || {})) {
      const field = form.querySelector(`[name="${name}"], [name="${name}[]"]`);
      if (!field) continue;
      const holder = field.closest('.field, fieldset, .consent') || field.parentElement;
      holder.classList.add('has-error');
      const p = document.createElement('p');
      p.className = 'err';
      p.dataset.js = '1';
      p.id = `err-${name}-js`;
      p.textContent = msg;
      holder.after(p);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', p.id);
      firstField ||= field;
    }
    (firstField || alert).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    firstField?.focus({ preventScroll: true });
  }

})();
