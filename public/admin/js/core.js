// أدوات مشتركة للوحة: الطلبات، القوالب، التنبيهات، اللوحات، الأيقونات، الرسوم

export const state = { me: null, meta: null, env: {} };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export class ApiError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

export async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`/api${path}`, opts);
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) {
    state.me = null;
    location.hash = '#/login';
    throw new ApiError(401, data.error || 'سجّل الدخول');
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'تعذر تنفيذ الطلب', data.fields);
  return data;
}

export const can = (perm) => {
  const p = state.me?.permissions || [];
  return p.includes('*') || p.includes(perm);
};

// ——— الأيقونات ———
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S12 9 12 9zm0 0c2-4 6-4 6-1.5S12 9 12 9z"/>',
  send: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l11-10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
  log: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  out: '<path d="M10 4H5v16h5M15 8l-4 4 4 4M11 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  google: '<path d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.1h2.8A8.4 8.4 0 0 0 20 12.2zM12 20.5c2.3 0 4.2-.8 5.6-2l-2.8-2.1a5 5 0 0 1-7.6-2.7H4.4v2.2a8.5 8.5 0 0 0 7.6 4.6zM7.2 13.7a5 5 0 0 1 0-3.4V8.1H4.4a8.5 8.5 0 0 0 0 7.6zM12 6.9c1.3 0 2.5.4 3.4 1.3l2.5-2.5A8.5 8.5 0 0 0 4.4 8.1l2.8 2.2A5 5 0 0 1 12 6.9z"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export function ic(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ——— التنسيق ———
const dtf = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const df = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric' });
const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export const toDate = (s) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : null);
export const fmtDT = (s) => (s ? dtf.format(toDate(s)) : '—');
export const fmtD = (s) => (s ? df.format(toDate(s)) : '—');
export function ago(s) {
  const d = toDate(s);
  if (!d) return '—';
  const sec = (d - Date.now()) / 1000;
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(Math.round(sec), 'second');
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  return rtf.format(Math.round(sec / 86400), 'day');
}
export const nf = new Intl.NumberFormat('ar-SA-u-nu-latn');
export const money = (v, cur = 'USD') => new Intl.NumberFormat('ar-SA-u-nu-latn', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v || 0);
export const branchName = (id) => state.meta?.allBranches.find((b) => b.id === Number(id))?.short || '—';
export const sectionName = (id) => state.meta?.sections.find((s) => s.id === Number(id))?.name || '—';
export const staffName = (id) => state.meta?.staff.find((u) => u.id === Number(id))?.name || '—';
export const initials = (name) => String(name || '؟').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');

export function stars(n, size = 14) {
  return `<span class="stars" aria-label="${n} من 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? 'on' : ''}"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></span>`).join('')}</span>`;
}

const TONE = {
  new: 'b', assigned: 'v', in_progress: 'y', waiting_customer: '', resolved: 'g', closed: '',
  urgent: 'r', high: 'y', normal: '', low: '',
  draft: '', review: 'y', approved: 'g', cancelled: 'r', scheduled: 'b', active: 'g', ended: '',
  sending: 'y', paused: 'y', done: 'g',
  queued: 'b', sent: 'v', delivered: 'g', read: 'g', failed: 'r', excluded: '',
  auto_replied: 'g', needs_review: 'y', draft_ready: 'b', replied: 'g', escalated: 'r', ignored: '',
  stopped: 'r',
};
export function badge(key, label, { dot = false } = {}) {
  return `<span class="badge ${TONE[key] ?? ''}">${dot ? '<i class="dot"></i>' : ''}${esc(label ?? key)}</span>`;
}

// ——— التنبيهات ———
export function toast(msg, kind = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind === 'err' ? 'err' : ''}`;
  el.innerHTML = `${kind === 'err' ? ic('alert') : `<svg class="ok-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`}<span>${esc(msg)}</span>`;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, kind === 'err' ? 5000 : 2800);
}

// ——— تشغيل إجراء مع حالة الانتظار وعرض الأخطاء ———
export async function run(btn, fn, { ok, form } = {}) {
  if (btn) btn.setAttribute('aria-busy', 'true');
  if (form) clearFieldErrors(form);
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (err) {
    if (form && err.fields) showFieldErrors(form, err.fields);
    toast(err.message || 'حدث خطأ', 'err');
    throw err;
  } finally {
    if (btn) btn.removeAttribute('aria-busy');
  }
}
export function clearFieldErrors(form) {
  $$('.invalid', form).forEach((n) => n.classList.remove('invalid'));
  $$('.err[data-js]', form).forEach((n) => n.remove());
}
export function showFieldErrors(form, fields) {
  for (const [k, msg] of Object.entries(fields || {})) {
    const input = form.querySelector(`[name="${k}"]`);
    const holder = input?.closest('.field');
    if (!holder) continue;
    holder.classList.add('invalid');
    const p = document.createElement('span');
    p.className = 'err'; p.dataset.js = '1'; p.textContent = msg;
    holder.append(p);
  }
}

// ——— قراءة النماذج ———
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) { (out[el.name] ||= []); if (el.checked) out[el.name].push(isNaN(el.value) ? el.value : Number(el.value)); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

// ——— اللوحة الجانبية والحوار ———
let lastFocus = null;
export function drawer(title, html, { actions = '', onClose, wide } = {}) {
  closeDrawer();
  lastFocus = document.activeElement;
  const el = document.createElement('div');
  el.className = 'drawer';
  el.innerHTML = `<div class="drawer-bg" data-x></div><section class="drawer-p" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(900px,100vw)"' : ''}>
    <header class="drawer-h"><h2>${title}</h2><div class="right">${actions}<button class="btn sec icon" data-x aria-label="إغلاق">${ic('close')}</button></div></header>
    <div class="drawer-b">${html}</div></section>`;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) closeDrawer(); });
  el._onClose = onClose;
  document.body.append(el);
  setTimeout(() => $('.drawer-b input, .drawer-b textarea, .drawer-b select, .drawer-h .btn', el)?.focus(), 30);
  return el;
}
export function closeDrawer() {
  const d = $('.drawer');
  if (!d) return;
  d._onClose?.();
  d.remove();
  lastFocus?.focus?.();
}
export function modal(title, html) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="modal-bg" data-x></div><div class="modal-p" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${title}</h2></div><div class="modal-b">${html}</div></div>`;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) el.remove(); });
  document.body.append(el);
  setTimeout(() => $('input, textarea, select, .btn', el)?.focus(), 30);
  return el;
}
export function confirmBox(title, text, { danger, okLabel = 'تأكيد' } = {}) {
  return new Promise((resolve) => {
    const m = modal(title, `<p>${text}</p><div class="form-actions"><button class="btn ${danger ? 'danger' : ''}" data-ok>${okLabel}</button><button class="btn sec" data-x>إلغاء</button></div>`);
    m.querySelector('[data-ok]').onclick = () => { m.remove(); resolve(true); };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) resolve(false); });
  });
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const m = $$('.modal').pop();
  if (m) { m.remove(); return; }
  closeDrawer();
});

// ——— الرسوم البيانية ———
export function trendChart(data, series, { h = 180 } = {}) {
  const w = 640, pad = { t: 10, r: 8, b: 26, l: 30 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const step = (w - pad.l - pad.r) / data.length;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max];
  const bw = Math.max(4, (step - 6) / series.filter((s) => s.type === 'bar').length);
  let bars = '', lines = '';
  series.forEach((s, si) => {
    if (s.type === 'bar') {
      data.forEach((d, i) => {
        const x = w - pad.r - (i + 1) * step + 3 + si * bw;
        bars += `<rect class="${s.cls} bar-anim" style="animation-delay:${i * 25}ms" x="${x.toFixed(1)}" y="${y(d[s.key]).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(h - pad.b - y(d[s.key])).toFixed(1)}" rx="3"><title>${d.d}: ${d[s.key]}</title></rect>`;
      });
    } else {
      const pts = data.map((d, i) => [w - pad.r - (i + 0.5) * step, y(d[s.key])]);
      lines += `<path class="area-a" d="M${pts.map((p) => p.join(' ')).join('L')}L${pts[pts.length - 1][0]} ${h - pad.b}L${pts[0][0]} ${h - pad.b}Z"/>`;
      lines += `<path class="${s.cls} line-anim" d="M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}"/>`;
      lines += pts.map((p, i) => `<circle class="dot-a" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"><title>${data[i].d}: ${data[i][s.key]}</title></circle>`).join('');
    }
  });
  const labels = data.map((d, i) => (i % 2 === 0 ? `<text class="axis" x="${(w - pad.r - (i + 0.5) * step).toFixed(1)}" y="${h - 6}" text-anchor="middle">${d.d.slice(8)}/${d.d.slice(5, 7)}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="رسم بياني للأيام الماضية">
    <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#006442" stop-opacity=".18"/><stop offset="1" stop-color="#006442" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line class="gridl" x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    ${bars}${lines}${labels}</svg>`;
}
export function sparkline(values, color = '#006442') {
  if (!values.length) return '';
  const w = 96, h = 34, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(w - (i / (values.length - 1 || 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}"/></svg>`;
}
export function hbars(rows, { cls = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="hbar">${rows.map((r, i) => `<div class="row"><span>${esc(r.label)}</span><div class="track"><div class="fill ${cls}" style="width:${(r.v / max) * 100}%;animation-delay:${i * 50}ms"></div></div><b class="num">${nf.format(r.v)}</b></div>`).join('') || '<p class="muted">لا توجد بيانات بعد</p>'}</div>`;
}

export function emptyState(text, icon = 'inbox') {
  return `<div class="empty">${ic(icon, 40)}<span>${text}</span></div>`;
}

export function options(map, selected, { blank } = {}) {
  const entries = Array.isArray(map) ? map.map((x) => [x.id, x.name || x.short]) : Object.entries(map);
  return (blank ? `<option value="">${blank}</option>` : '') + entries.map(([k, v]) => `<option value="${esc(k)}" ${String(k) === String(selected ?? '') ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

export function checks(name, items, selected = []) {
  return `<div class="checks">${items.map((it) => `<label class="check"><input type="checkbox" name="${name}" data-multi value="${it.id}" ${selected.map(Number).includes(Number(it.id)) ? 'checked' : ''}>${esc(it.name || it.short)}</label>`).join('')}</div>`;
}

export async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) throw new ApiError(400, 'حجم الصورة يتجاوز 10 ميجابايت');
  const r = await api('/uploads', { method: 'POST', raw: file });
  return r.url;
}

export function imageField(name, current, label = 'الصورة') {
  return `<div class="field"><span>${label}</span><div class="img-up"><div class="pv">${current ? `<img src="${esc(current)}" alt="">` : ic('layers', 28)}</div>
    <div class="grid" style="gap:6px"><input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${name}"><input type="hidden" name="${name}" value=""><span class="hint">JPG أو PNG أو WEBP حتى 10 ميجابايت. يفضل صورة حقيقية بنسبة مربعة.</span></div></div></div>`;
}
export function bindUploads(root) {
  $$('[data-upload]', root).forEach((inp) => inp.addEventListener('change', async () => {
    const hidden = root.querySelector(`input[type="hidden"][name="${inp.dataset.upload}"]`);
    try {
      const url = await run(null, () => uploadImage(inp.files[0]), { ok: 'رفعت الصورة' });
      hidden.value = url;
      inp.closest('.img-up').querySelector('.pv').innerHTML = `<img src="${esc(url)}" alt="">`;
    } catch { inp.value = ''; }
  }));
}

export async function refreshMeta() { state.meta = await api('/meta'); }
