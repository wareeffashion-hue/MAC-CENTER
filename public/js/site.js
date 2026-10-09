// ماك سنتر — تفاعلات الواجهة العامة. كل شيء يعمل دونها؛ هذا تحسين تدريجي.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('js');

  // ——— الترويسة عند التمرير ———
  const hdr = $('[data-hdr]');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ——— القائمة الجانبية مع حفظ التركيز وإعادته ———
  const drawer = $('[data-drawer]');
  const menuBtn = $('[data-menu]');
  let lastFocus = null;
  function openDrawer() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('open')));
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('.drawer-nav a', drawer)?.focus(), 60);
    history.pushState({ drawer: 1 }, '');
  }
  function closeDrawer(fromPop) {
    if (drawer.hidden) return;
    drawer.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setTimeout(() => { drawer.hidden = true; }, reduce.matches ? 0 : 280);
    lastFocus?.focus();
    if (!fromPop && history.state?.drawer) history.back();
  }
  menuBtn?.addEventListener('click', openDrawer);
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDrawer();
    else if (e.target.closest('a')) { drawer.classList.remove('open'); drawer.hidden = true; document.body.style.overflow = ''; }
  });
  addEventListener('popstate', () => { closeDrawer(true); $$('dialog[open]').forEach((d) => d.close()); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab' && drawer && !drawer.hidden) trapFocus(e, $('.drawer-panel', drawer));
  });
  function trapFocus(e, box) {
    const f = $$('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])', box).filter((x) => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ——— النوافذ: عمق خفيف يتبع المؤشر ———
  const windows = $('[data-windows]');
  if (windows && matchMedia('(pointer: fine) and (min-width: 861px)').matches && !reduce.matches) {
    let raf = 0, tx = 0, ty = 0;
    windows.addEventListener('pointermove', (e) => {
      const r = windows.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    windows.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
    function apply() {
      raf = 0;
      $$('.win', windows).forEach((w) => {
        const d = Number(w.dataset.depth || 1) * 5;
        w.style.setProperty('--px', `${(-tx * d).toFixed(2)}px`);
        w.style.setProperty('--py', `${(-ty * d).toFixed(2)}px`);
      });
    }
  }

  // ——— ظهور العناصر عند التمرير ———
  const io = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

  // ——— لوحات الأقسام ———
  function openSheet(dialog, opener) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    history.pushState({ sheet: 1 }, '');
    dialog.addEventListener('close', () => {
      opener?.focus();
      if (history.state?.sheet) history.back();
    }, { once: true });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-section]');
    if (t) {
      const d = $(`[data-section-sheet="${t.dataset.openSection}"]`);
      if (d) { e.preventDefault(); openSheet(d, t); }
    }
    const c = e.target.closest('[data-contact]');
    if (c) {
      const d = $('#contact');
      if (d) { e.preventDefault(); openSheet(d, c); }
    }
    // الضغط على الخلفية يغلق اللوحة
    if (e.target.matches('dialog.sheet')) e.target.close();
  });

  // ——— تبويبات الفروع مع مؤشر متحرك ———
  $$('[data-tabs]').forEach((box) => {
    const list = $('[role="tablist"]', box);
    const tabs = $$('[role="tab"]', box);
    const ind = $('.tab-ind', box);
    list.classList.add('ready');
    const place = (tab) => {
      if (!ind) return;
      ind.style.setProperty('--x', `${tab.offsetLeft}px`);
      ind.style.setProperty('--w', `${tab.offsetWidth}px`);
    };
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        p.hidden = !on;
        if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
      });
      place(tab);
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        // في RTL: السهم الأيسر للتالي
        const dir = { ArrowLeft: 1, ArrowRight: -1, Home: -99, End: 99 }[e.key];
        if (dir == null) return;
        e.preventDefault();
        const n = Math.max(0, Math.min(tabs.length - 1, dir === -99 ? 0 : dir === 99 ? tabs.length - 1 : i + dir));
        select(tabs[n], true);
      });
    });
    const current = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    requestAnimationFrame(() => place(current));
    addEventListener('resize', () => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
    document.fonts?.ready.then(() => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
  });

  // ——— مسار الصفحة: العربة تتقدم مع التمرير ———
  const rail = $('[data-rail]');
  if (rail) {
    const links = $$('[data-stop]', rail);
    const targets = links.map((a) => document.getElementById(a.dataset.stop)).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      rail.style.setProperty('--p', Math.min(1, Math.max(0, scrollY / (max || 1))).toFixed(4));
      let active = 0;
      targets.forEach((t, i) => { if (t.getBoundingClientRect().top < innerHeight * 0.45) active = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === active));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // ——— الخريطة عند الطلب ———
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-load-map]');
    if (!b) return;
    const box = b.closest('[data-map]');
    const f = document.createElement('iframe');
    f.src = box.dataset.map;
    f.loading = 'lazy';
    f.title = 'خريطة الموقع';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    box.replaceChildren(f);
  });

  // ——— قياس النقرات دون بيانات شخصية ———
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (!a) return;
    const body = JSON.stringify({ e: a.dataset.track, b: Number(a.dataset.branch) || null });
    navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' })) || fetch('/api/t', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
  }, { capture: true });

  // ——— الشريط السفلي يختفي عند الكتابة ———
  const bar = $('[data-actionbar]');
  if (bar) {
    document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) bar.classList.add('hide'); });
    document.addEventListener('focusout', () => bar.classList.remove('hide'));
  }

  // ——— روابط القائمة النشطة ———
  const path = location.pathname;
  $$('.nav a').forEach((a) => { if (a.getAttribute('href') === path) a.classList.add('active'); });

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
    (firstField || alert).scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
    firstField?.focus({ preventScroll: true });
  }

  // ——— انتقال صورة الفرع إلى صفحته ———
  if (document.startViewTransition && !reduce.matches) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-morph]');
      if (!a || e.metaKey || e.ctrlKey) return;
      a.style.viewTransitionName = 'branch-hero';
    });
  }
})();
