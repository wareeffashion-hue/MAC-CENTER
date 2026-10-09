import { state, api, esc, $, $$, ic, can, toast, run, ago, initials } from './core.js';

// كل شاشة وحدة مستقلة تحمل عند الحاجة؛ إضافة شاشة جديدة = سطر هنا وملف في views
const ROUTES = [
  { path: 'today', title: 'اليوم', icon: 'home', perm: 'dashboard', load: () => import('./views/today.js') },
  { path: 'tickets', title: 'التذاكر', icon: 'ticket', perm: 'tickets', load: () => import('./views/tickets.js'), badge: 'tickets' },
  { path: 'reviews', title: 'تقييمات Google', icon: 'star', perm: 'reviews', load: () => import('./views/reviews.js'), badge: 'reviews' },
  { group: 'التسويق' },
  { path: 'offers', title: 'العروض', icon: 'gift', perm: ['offers', 'offers.view'], load: () => import('./views/offers.js') },
  { path: 'campaigns', title: 'الحملات', icon: 'send', perm: 'campaigns', load: () => import('./views/campaigns.js') },
  { path: 'subscribers', title: 'المشتركون', icon: 'users', perm: 'subscribers', load: () => import('./views/subscribers.js') },
  { path: 'qr', title: 'رموز QR', icon: 'qr', perm: ['qr', 'qr.view'], load: () => import('./views/qr.js') },
  { group: 'الموقع' },
  { path: 'branches', title: 'الفروع والدوام', icon: 'pin', perm: ['branches', 'branches.own'], load: () => import('./views/branches.js') },
  { path: 'content', title: 'الأقسام والمحتوى', icon: 'layers', perm: 'sections', load: () => import('./views/content.js') },
  { group: 'الإدارة' },
  { path: 'team', title: 'الفريق والتوجيه', icon: 'team', perm: ['users', 'routing', 'routing.own'], load: () => import('./views/team.js') },
  { path: 'reports', title: 'التقارير', icon: 'chart', perm: ['reports', 'campaigns', 'tickets'], load: () => import('./views/reports.js') },
  { path: 'integrations', title: 'الربط', icon: 'plug', perm: 'integrations', load: () => import('./views/integrations.js') },
  { path: 'audit', title: 'سجل التدقيق', icon: 'log', perm: 'audit', load: () => import('./views/audit.js') },
  { path: 'settings', title: 'الإعدادات', icon: 'cog', perm: 'settings', load: () => import('./views/settings.js') },
  { path: 'profile', title: 'حسابي', icon: 'user', perm: null, load: () => import('./views/profile.js'), hidden: true },
];

const allowed = (r) => !r.perm || (Array.isArray(r.perm) ? r.perm.some(can) : can(r.perm));

async function boot() {
  try {
    const me = await api('/me');
    state.me = me.user;
    state.env = me;
    state.meta = await api('/meta');
  } catch {
    state.me = null;
  }
  addEventListener('hashchange', route);
  route();
  setInterval(pollBadges, 30000);
}

function parseHash() {
  const [path = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const [name, query] = path.split('?');
  return { name, params: rest, query: new URLSearchParams(location.hash.split('?')[1] || '') , raw: query };
}

let current = null;
async function route() {
  const { name, params, query } = parseHash();
  if (!state.me) return renderLogin();
  if (name === 'login' || !name) { location.hash = `#/${firstRoute().path}`; return; }
  const r = ROUTES.find((x) => x.path === name && allowed(x));
  if (!r) { location.hash = `#/${firstRoute().path}`; return; }
  renderShell(r);
  const view = $('#view');
  const token = Symbol();
  current = token;
  try {
    const mod = await r.load();
    if (current !== token) return;
    view.className = 'view';
    void view.offsetWidth;
    await mod.render(view, { params, query, setTitle, refreshBadges: pollBadges });
  } catch (err) {
    if (err.status === 401) return;
    console.error(err);
    view.innerHTML = `<div class="banner">${ic('alert')}<span>تعذر تحميل الصفحة: ${esc(err.message)}</span></div>`;
  }
}

function firstRoute() { return ROUTES.find((r) => r.path && !r.hidden && allowed(r)) || ROUTES.find((r) => r.path === 'profile'); }

function setTitle(title, crumb) {
  const h = $('#top-title');
  if (h) h.innerHTML = `${esc(title)}${crumb ? ` <span class="crumb">/ ${esc(crumb)}</span>` : ''}`;
  document.title = `${title} · لوحة ماك سنتر`;
}

function renderShell(active) {
  let shell = $('.shell');
  if (!shell) {
    $('#app').innerHTML = `<div class="shell">
      <aside class="side" aria-label="القائمة">
        <div class="side-brand"><img src="/img/mark.svg" alt=""><div>ماك سنتر<small>لوحة الإدارة</small></div></div>
        <nav id="side-nav"></nav>
        <div class="side-foot">
          ${state.env.mockWhatsapp || state.env.mockGoogle ? `<span class="mode-tag">${ic('alert', 14)}وضع التجربة: الربط غير مفعّل</span>` : ''}
          <a href="#/profile" class="me"><span class="avatar">${esc(initials(state.me.name))}</span><span>${esc(state.me.name)}<small>${esc(state.me.roleName)}</small></span></a>
          <a href="/" target="_blank" rel="noopener">${ic('eye')}<span>عرض الموقع</span></a>
          <a href="#" data-logout>${ic('out')}<span>تسجيل الخروج</span></a>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="btn sec icon burger" data-burger aria-label="القائمة">${ic('menu')}</button>
          <h1 id="top-title"></h1>
          <div class="top-actions">
            <button class="btn sec icon bell" data-bell aria-label="الإشعارات" aria-haspopup="true">${ic('bell')}<span class="dotn" hidden></span></button>
          </div>
        </header>
        <main id="view" class="view" tabindex="-1"></main>
      </div>
    </div>`;
    shell = $('.shell');
    shell.addEventListener('click', onShellClick);
    pollBadges();
  }
  $('#side-nav').innerHTML = ROUTES.filter((r) => r.group || (!r.hidden && allowed(r))).map((r, i, arr) => {
    if (r.group) return arr.slice(i + 1).some((x) => x.path) && arr.slice(i + 1).find((x) => x.group || x.path)?.path ? `<div class="grp">${r.group}</div>` : '';
    return `<a href="#/${r.path}" class="${r === active ? 'on' : ''}" ${r === active ? 'aria-current="page"' : ''}>${ic(r.icon)}<span>${r.title}</span>${r.badge ? `<span class="badge solid" data-count="${r.badge}" hidden></span>` : ''}</a>`;
  }).join('');
  setTitle(active.title);
  shell.classList.remove('nav-open');
  applyBadges();
}

async function onShellClick(e) {
  if (e.target.closest('[data-burger]')) { $('.shell').classList.toggle('nav-open'); return; }
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '#/login';
    $('#app').innerHTML = '';
    route();
    return;
  }
  if (e.target.closest('[data-bell]')) { toggleNotifications(); return; }
  if (!e.target.closest('.pop')) $('.pop')?.remove();
  if ($('.shell').classList.contains('nav-open') && !e.target.closest('.side')) $('.shell').classList.remove('nav-open');
}

// ——— الإشعارات والعدادات ———
let counts = {};
let lastUnread = 0;
async function pollBadges() {
  if (!state.me) return;
  try {
    const [me, today] = await Promise.all([api('/me'), can('dashboard') ? api('/dashboard/today') : Promise.resolve(null)]);
    counts = { tickets: today?.tickets?.new || 0, reviews: today?.reviews?.pending || 0, unread: me.user.unread };
    applyBadges();
    if (counts.unread > lastUnread && lastUnread !== 0) $('[data-bell]')?.classList.add('ring');
    setTimeout(() => $('[data-bell]')?.classList.remove('ring'), 800);
    lastUnread = counts.unread;
  } catch { /* صامت */ }
}
function applyBadges() {
  $$('[data-count]').forEach((b) => { const n = counts[b.dataset.count] || 0; b.hidden = !n; b.textContent = n; });
  const d = $('.bell .dotn');
  if (d) { d.hidden = !counts.unread; d.textContent = counts.unread > 9 ? '9+' : counts.unread; }
}
async function toggleNotifications() {
  if ($('.pop')) { $('.pop').remove(); return; }
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = '<div class="pop-h">الإشعارات</div><div class="empty">…</div>';
  $('.top').append(pop);
  const { items } = await api('/notifications');
  const K = { ticket: 'ticket', escalation: 'alert', review: 'star', campaign: 'send', integration: 'plug' };
  pop.innerHTML = `<div class="pop-h"><span>الإشعارات</span>${items.some((n) => !n.read_at) ? '<button class="btn ghost sm" data-readall>تعليم الكل كمقروء</button>' : ''}</div>
    ${items.length ? items.map((n) => `<a class="notif ${n.read_at ? '' : 'unread'}" href="${esc(n.link || '#')}" data-nid="${n.id}"><span class="k">${ic(K[n.kind] || 'bell', 16)}</span><span>${esc(n.title)}<time>${ago(n.at)}</time></span></a>`).join('') : '<div class="empty">لا توجد إشعارات</div>'}`;
  pop.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-nid]');
    if (a) { api('/notifications/read', { method: 'POST', body: { id: Number(a.dataset.nid) } }).then(pollBadges); pop.remove(); }
    if (e.target.closest('[data-readall]')) { await api('/notifications/read', { method: 'POST', body: {} }); pop.remove(); pollBadges(); }
  });
}

// ——— الدخول ———
function renderLogin(step = 'password') {
  document.title = 'دخول · لوحة ماك سنتر';
  $('#app').innerHTML = `<div class="login">
    <div class="login-box">
      <form class="login-form" novalidate>
        <img class="logo" src="/img/logo-horizontal.svg" alt="ماك سنتر">
        ${step === 'password' ? `
          <h1>تسجيل الدخول</h1>
          <p class="muted">لوحة إدارة الفروع والعروض وخدمة العملاء</p>
          <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" autocomplete="username" required dir="ltr"></label>
          <label class="field"><span>كلمة المرور</span><input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
          <button class="btn" type="submit">دخول</button>` : `
          <h1>التحقق الثنائي</h1>
          <p class="muted">أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة.</p>
          <label class="field"><span>رمز التحقق</span><input name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
          <button class="btn" type="submit">تحقق</button>`}
        <p class="err" role="alert" hidden></p>
      </form>
    </div>
    <div class="login-art" aria-hidden="true">
      <span class="win w1"></span><span class="win w2"></span><span class="win w3"></span><span class="win w4"></span>
      <svg class="tr" viewBox="0 0 100 100" preserveAspectRatio="none"><path pathLength="1" d="M-5 90 H25 Q30 90 30 85 V60 Q30 55 35 55 H60 Q65 55 65 50 V12 Q65 6 72 6 H105"/></svg>
      <p class="quote">كل ملاحظة تُتابع، وكل عرض يصل لمن اختاره.</p>
    </div>
  </div>`;
  const form = $('.login-form');
  const err = $('.err', form);
  setTimeout(() => $('input', form).focus(), 20);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = $('button', form);
    try {
      btn.setAttribute('aria-busy', 'true');
      if (step === 'password') {
        const r = await api('/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
        if (r.needs2fa) return renderLogin('2fa');
      } else {
        await api('/auth/2fa', { method: 'POST', body: { code: form.code.value } });
      }
      const me = await api('/me');
      state.me = me.user; state.env = me;
      state.meta = await api('/meta');
      $('#app').innerHTML = '';
      if (!location.hash || location.hash === '#/login') location.hash = `#/${firstRoute().path}`;
      else route();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.removeAttribute('aria-busy'); }
  });
}

boot();
