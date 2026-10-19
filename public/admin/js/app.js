import { state, api, esc, $, $$, ic, can, toast, run, ago, initials, closeDrawer } from './core.js';
import { startLoginArt } from './login-art.js';

// كل شاشة وحدة مستقلة تحمل عند الحاجة؛ إضافة شاشة جديدة = سطر هنا وملف في views
const ROUTES = [
  { path: 'today', title: 'اليوم', icon: 'home', perm: 'dashboard', load: () => import('./views/today.js') },
  { path: 'tickets', title: 'التذاكر', icon: 'ticket', perm: 'tickets', load: () => import('./views/tickets.js'), badge: 'tickets' },
  { path: 'reviews', title: 'تقييمات Google', icon: 'star', perm: 'reviews', load: () => import('./views/reviews.js'), badge: 'reviews' },
  { group: 'MAC+‎' },
  { path: 'counter', title: 'نقطة MAC+‎', icon: 'cart', perm: 'plus', load: () => import('./views/counter.js') },
  { path: 'requests', title: 'الحجز والطلبات', icon: 'clock', perm: 'requests', load: () => import('./views/requests.js'), badge: 'requests' },
  { path: 'looks', title: 'إطلالات المناسبات', icon: 'gift', perm: 'plus.manage', load: () => import('./views/looks.js') },
  { path: 'pilot', title: 'تجربة MAC+‎', icon: 'chart', perm: ['plus.reports', 'plus.manage'], load: () => import('./views/pilot.js') },
  { path: 'giftcards', title: 'قسائم الإهداء', icon: 'gift', perm: 'plus.manage', load: () => import('./views/giftcards.js') },
  { path: 'erp', title: 'ربط النظام المحاسبي', icon: 'plug', perm: 'plus.manage', load: () => import('./views/erp.js') },
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
  closeDrawer(); // درج الصفحة السابقة (تذكرة مثلًا) لا يبقى مفتوحًا فوق صفحة أخرى
  // نعطل الصفحة السابقة أثناء التحميل حتى لا تُضغط أزرارها القديمة
  view.classList.add('loading');
  view.setAttribute('aria-busy', 'true');
  try {
    const mod = await r.load();
    if (current !== token) return;
    view.className = 'view loading';
    void view.offsetWidth;
    await mod.render(view, { params, query, setTitle, refreshBadges: pollBadges });
    if (current === token) { view.classList.remove('loading'); view.removeAttribute('aria-busy'); }
  } catch (err) {
    view.classList.remove('loading');
    view.removeAttribute('aria-busy');
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
    counts = { tickets: today?.tickets?.new || 0, reviews: today?.reviews?.pending || 0, requests: me.user.requestsNew || 0, unread: me.user.unread };
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
let loginArt = null;
function renderLogin(step = 'password') {
  document.title = 'دخول · لوحة ماك سنتر';
  const h = new Date().getHours();
  const hello = h < 12 ? 'صباح الخير' : 'مساء الخير';
  // المسرح يبقى عند الانتقال إلى خطوة التحقق الثنائي، ويُبنى مرة واحدة
  if (!$('.login')) {
    $('#app').innerHTML = `<div class="login">
      <canvas class="login-stage" aria-hidden="true"></canvas>
      <div class="login-copy" aria-hidden="true">
        <p class="login-kicker">ماك سنتر · لوحة الإدارة</p>
        <p class="login-quote"><span>كل ملاحظة تُتابع،</span><span>وكل عرض يصل</span><span class="y">لمن اختاره.</span></p>
      </div>
      <div class="login-box"></div>
    </div>`;
    loginArt?.stop();
    loginArt = startLoginArt($('.login-stage'));
  }
  const box = $('.login-box');
  box.innerHTML = `<form class="login-form ${step === '2fa' ? 'is-2fa' : ''}" novalidate>
      <img class="logo" src="/img/logo-horizontal.svg" alt="ماك سنتر">
      ${step === 'password' ? `
        <p class="login-hello">${hello} 👋</p>
        <h1>سجّل دخولك</h1>
        <p class="muted">لوحة إدارة الفروع والعروض وخدمة العملاء</p>
        <label class="lf"><span>البريد الإلكتروني</span><i class="lf-ic">${ic('user', 18)}</i><input name="email" type="email" autocomplete="username" required dir="ltr" placeholder="name@maccenter.com.sa"></label>
        <label class="lf"><span>كلمة المرور</span><i class="lf-ic">${ic('shield', 18)}</i><input name="password" type="password" autocomplete="current-password" required dir="ltr" placeholder="••••••••••"><button type="button" class="lf-eye" aria-label="إظهار كلمة المرور" aria-pressed="false">${ic('eye', 18)}</button></label>
        <p class="caps" hidden>${ic('alert', 14)} مفتاح الأحرف الكبيرة مفعّل</p>
        <button class="btn login-go" type="submit"><span>دخول</span>${ic('arrow', 18)}</button>` : `
        <p class="login-hello">خطوة أخيرة 🔐</p>
        <h1>التحقق الثنائي</h1>
        <p class="muted">أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة.</p>
        <div class="otp-boxes" dir="ltr">${'<span></span>'.repeat(6)}<input name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required aria-label="رمز التحقق"></div>
        <button class="btn login-go" type="submit"><span>تحقق</span>${ic('arrow', 18)}</button>
        <button class="login-back" type="button">رجوع لتسجيل الدخول</button>`}
      <p class="err" role="alert" hidden></p>
    </form>
    <p class="login-foot">© ${new Date().getFullYear()} ماك سنتر · المدينة المنورة</p>`;
  const form = $('.login-form');
  const err = $('.err', form);
  setTimeout(() => $('input', form).focus(), 30);
  // إظهار كلمة المرور وتنبيه الأحرف الكبيرة
  const eye = $('.lf-eye', form);
  eye?.addEventListener('click', () => { const on = form.password.type === 'password'; form.password.type = on ? 'text' : 'password'; eye.setAttribute('aria-pressed', on); eye.classList.toggle('on', on); form.password.focus(); });
  form.password?.addEventListener('keyup', (e) => { $('.caps', form).hidden = !e.getModifierState?.('CapsLock'); });
  // خانات رمز التحقق تُملأ بالأرقام المكتوبة
  const otp = $('.otp', form);
  if (otp) {
    const cells = $$('.otp-boxes span', form);
    const paint = () => { otp.value = otp.value.replace(/\D/g, '').slice(0, 6); cells.forEach((c, i) => { c.textContent = otp.value[i] || ''; c.classList.toggle('cur', i === otp.value.length); }); if (otp.value.length === 6) form.requestSubmit(); };
    otp.addEventListener('input', paint); paint();
    $('.login-back', form).addEventListener('click', () => renderLogin('password'));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = $('.login-go', form);
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
      // العربة تنطلق خارج الشاشة ثم تُفتح اللوحة
      form.classList.add('done');
      await loginArt?.launch();
      loginArt?.stop(); loginArt = null;
      $('#app').innerHTML = '';
      if (!location.hash || location.hash === '#/login') location.hash = `#/${firstRoute().path}`;
      else route();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    } finally { btn.removeAttribute('aria-busy'); }
  });
}

boot();
