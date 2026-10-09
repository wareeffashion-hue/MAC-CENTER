import { api, esc, ic, can, state, badge, ago, fmtDT, nf, emptyState, options, run, formData, modal, drawer, closeDrawer, stars, staffName } from '../core.js';

const FILTERS = [['open', 'المفتوحة'], ['new', 'جديدة'], ['late', 'متأخرة'], ['mine', 'المسندة إليّ'], ['resolved', 'محلولة'], ['closed', 'مغلقة'], ['all', 'الكل']];

export async function render(view, ctx) {
  if (ctx.params[0]) return renderTicket(view, ctx, Number(ctx.params[0]));
  const M = state.meta;
  const q = Object.fromEntries(ctx.query);
  const status = q.status || 'open';
  const filters = { status: status === 'mine' ? 'open' : status === 'all' ? '' : status, mine: status === 'mine' ? 1 : '', branch: q.branch || '', type: q.type || '', priority: q.priority || '', q: q.q || '' };

  view.innerHTML = `
    <div class="bar">
      <div class="seg" role="tablist" aria-label="حالة التذاكر">${FILTERS.map(([k, v]) => `<button data-st="${k}" class="${k === status ? 'on' : ''}">${v}</button>`).join('')}</div>
      <span class="grow"></span>
      ${can('tickets') ? `<button class="btn" data-new>${ic('plus')}تذكرة يدوية</button>` : ''}
    </div>
    <form class="bar" data-filter>
      <input class="grow" type="search" name="q" placeholder="ابحث برقم التذكرة أو النص أو الاسم أو الجوال" value="${esc(filters.q)}">
      <select name="branch">${options(M.branches, filters.branch, { blank: 'كل الفروع' })}</select>
      <select name="type">${options(M.ticketTypes, filters.type, { blank: 'كل الأنواع' })}</select>
      <select name="priority">${options(M.priority, filters.priority, { blank: 'كل الأولويات' })}</select>
    </form>
    <section class="card"><div class="tbl-wrap" id="tlist"><div class="empty">…</div></div></section>`;

  const go = (patch) => {
    const next = new URLSearchParams({ ...q, ...patch });
    for (const [k, v] of [...next]) if (!v || (k === 'status' && v === 'open') || k === 'new') next.delete(k);
    location.hash = `#/tickets${next.toString() ? '?' + next : ''}`;
  };
  view.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => go({ status: b.dataset.st }));
  const f = view.querySelector('[data-filter]');
  f.addEventListener('change', () => go(Object.fromEntries(new FormData(f))));
  f.addEventListener('submit', (e) => { e.preventDefault(); go(Object.fromEntries(new FormData(f))); });
  view.querySelector('[data-new]')?.addEventListener('click', () => newTicket());
  if (q.new) newTicket();

  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { items } = await api(`/tickets?${params}`);
  const box = view.querySelector('#tlist');
  if (!items.length) { box.innerHTML = emptyState('لا توجد تذاكر بهذه المعايير', 'inbox'); return; }
  box.innerHTML = `<table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>الملاحظة</th><th>الفرع</th><th>الأولوية</th><th>الحالة</th><th>المسؤول</th><th>الوقت</th></tr></thead><tbody>
    ${items.map((t) => `<tr class="click ${t.late ? 'late' : ''}" data-id="${t.id}" tabindex="0">
      <td><span class="ref">${esc(t.ref)}</span>${t.attachments ? ` <span class="muted">${ic('layers', 14)}</span>` : ''}</td>
      <td>${esc(M.ticketTypes[t.type])}${t.source === 'google' ? ` <span class="badge b">${ic('google', 12)}Google</span>` : ''}</td>
      <td class="excerpt">${t.rating ? stars(t.rating, 12) + ' ' : ''}${esc(t.excerpt)}</td>
      <td>${esc(M.allBranches.find((b) => b.id === t.branch_id)?.short || '—')}</td>
      <td>${t.priority === 'normal' || t.priority === 'low' ? `<span class="muted">${esc(M.priority[t.priority])}</span>` : badge(t.priority, M.priority[t.priority])}</td>
      <td>${badge(t.status, M.ticketStatus[t.status], { dot: true })}${t.late ? ` <span class="badge r">${ic('clock', 12)}متأخرة</span>` : ''}${t.escalation_level ? ` <span class="badge r">تصعيد ${t.escalation_level}</span>` : ''}</td>
      <td>${t.assignee_name ? esc(t.assignee_name) : '<span class="muted">طابور الفرع</span>'}</td>
      <td class="muted small">${ago(t.created_at)}</td></tr>`).join('')}</tbody></table>`;
  box.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/tickets/${tr.dataset.id}`; });
  box.addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') location.hash = `#/tickets/${tr.dataset.id}`; });
}

function newTicket() {
  const M = state.meta;
  const d = drawer('تذكرة يدوية', `<form class="form">
    <p class="muted">لتسجيل ملاحظة وصلت بالاتصال أو داخل الفرع.</p>
    <div class="form-row">
      <label class="field"><span>النوع</span><select name="type">${options(M.ticketTypes, 'complaint')}</select></label>
      <label class="field"><span>الفرع</span><select name="branch" required>${options(M.branches, '', { blank: 'اختر' })}</select></label>
    </div>
    <div class="form-row">
      <label class="field"><span>القسم</span><select name="section">${options(M.sections, '', { blank: 'بدون' })}</select></label>
      <label class="field"><span>الموضوع</span><select name="topic">${options(M.topics, '', { blank: 'بدون' })}</select></label>
      <label class="field"><span>الأولوية</span><select name="priority">${options(M.priority, 'normal')}</select></label>
    </div>
    <label class="field"><span>الملاحظة</span><textarea name="body" required></textarea></label>
    <div class="form-row">
      <label class="field"><span>اسم العميل</span><input name="name"></label>
      <label class="field"><span>جوال العميل</span><input name="phone" dir="ltr" placeholder="05xxxxxxxx"></label>
    </div>
    <label class="check"><input type="checkbox" name="wants_contact">العميل يطلب التواصل</label>
    <label class="check"><input type="checkbox" name="contact_consent">وافق العميل شفهيًا على التواصل بشأن هذه الملاحظة</label>
    <input type="hidden" name="source" value="staff">
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}إنشاء التذكرة</button></div></form>`);
  const form = d.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(form.querySelector('[type=submit]'), () => api('/tickets', { method: 'POST', body: formData(form) }), { ok: 'أنشئت التذكرة', form });
    closeDrawer();
    location.hash = `#/tickets/${r.id}`;
  });
}

const EV_ICON = { created: 'inbox', assigned: 'user', acknowledged: 'check', status: 'refresh', reopened: 'refresh', note: 'note', contact: 'phone', escalated: 'alert', priority: 'alert', classified: 'layers' };

async function renderTicket(view, ctx, id) {
  const M = state.meta;
  const t = await api(`/tickets/${id}`);
  ctx.setTitle('التذاكر', t.ref);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const late = !['resolved', 'closed'].includes(t.status) && !t.acknowledged_at && t.due_at && t.due_at < now;
  const branchStaff = M.staff.filter((u) => u.role === 'admin' || u.branchIds.includes(t.branch_id));
  const flow = { new: ['in_progress', 'closed'], assigned: ['in_progress', 'waiting_customer', 'resolved', 'closed'], in_progress: ['waiting_customer', 'resolved', 'closed'], waiting_customer: ['in_progress', 'resolved', 'closed'], resolved: ['closed', 'in_progress'], closed: ['in_progress'] }[t.status] || [];

  view.innerHTML = `
  <div class="bar"><a class="btn ghost sm" href="#/tickets">${ic('arrow')}كل التذاكر</a></div>
  <div class="grid g-main">
    <div class="grid" style="align-content:start">
      <div class="t-head">
        <div class="bar" style="margin:0"><span class="ref">${esc(t.ref)}</span>${badge(t.status, M.ticketStatus[t.status], { dot: true })}${badge(t.priority, M.priority[t.priority])}
          ${late ? `<span class="sla late">${ic('clock', 14)}تجاوزت مهلة أول تواصل</span>` : t.due_at && !t.acknowledged_at && !['resolved', 'closed'].includes(t.status) ? `<span class="sla soon">${ic('clock', 14)}المهلة ${fmtDT(t.due_at)}</span>` : ''}</div>
        <div class="t-meta">
          <span class="badge">${esc(M.ticketTypes[t.type])}</span><span class="badge">${ic('pin', 12)}${esc(M.allBranches.find((b) => b.id === t.branch_id)?.name || '—')}</span>
          ${t.section_id ? `<span class="badge">${esc(M.sections.find((s) => s.id === t.section_id)?.name || '')}</span>` : ''}${t.topic ? `<span class="badge">${esc(M.topics[t.topic])}</span>` : ''}
          <span class="badge">المصدر: ${esc({ web: 'الموقع', qr: 'رمز QR', staff: 'موظف', google: 'Google' }[t.source] || t.source)}${t.qr_code ? ' · ' + esc(t.qr_code) : ''}</span>
        </div>
      </div>
      ${t.rating ? `<div>${stars(t.rating, 18)}</div>` : ''}
      <div class="t-body">${esc(t.body)}</div>
      ${t.attachments.length ? `<div class="attachments">${t.attachments.map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="مرفق"></a>`).join('')}</div><p class="muted small">روابط المرفقات صالحة 5 دقائق.</p>` : ''}
      <section class="card"><div class="card-h"><h3>${ic('clock')} سجل المتابعة</h3></div><div class="card-b">
        <ul class="tl">${t.events.map((e) => `<li class="${e.internal ? (e.kind === 'note' ? 'note' : '') : 'public'} ${e.kind === 'escalated' ? 'esc' : ''}"><span class="k">${ic(EV_ICON[e.kind] || 'note', 14)}</span>
          <div class="b">${esc(e.body || '')}<small>${e.user_name ? esc(e.user_name) + ' · ' : ''}${fmtDT(e.at)}${e.internal ? ' · داخلي' : ' · يظهر للعميل'}</small></div></li>`).join('')}</ul>
        <form class="composer" data-compose style="margin-top:12px">
          <div class="tabs-s" role="tablist"><button type="button" class="on" data-mode="note">ملاحظة داخلية</button><button type="button" data-mode="contact">توثيق تواصل مع العميل</button></div>
          <textarea name="body" placeholder="اكتب ملاحظة داخلية لا تصل للعميل…" required></textarea>
          <div class="bar" style="margin:0"><label class="check" data-visible hidden><input type="checkbox" name="visible">إظهار الملخص للعميل في صفحة التتبع</label><span class="grow"></span><button class="btn sm" type="submit">${ic('check', 16)}حفظ</button></div>
        </form>
      </div></section>
    </div>
    <div class="grid" style="align-content:start">
      <section class="card"><div class="card-h"><h3>الإجراءات</h3></div><div class="card-b form">
        ${!t.acknowledged_at && !['resolved', 'closed'].includes(t.status) ? `<button class="btn warn" data-act="acknowledge">${ic('check')}استلام المهمة</button>` : `<p class="muted small" style="margin:0">${t.acknowledged_at ? 'استلمت ' + ago(t.acknowledged_at) : ''}</p>`}
        <label class="field"><span>الحالة</span><select data-status><option value="">${esc(M.ticketStatus[t.status])} (الحالية)</option>${flow.map((s) => `<option value="${s}">${esc(M.ticketStatus[s])}</option>`).join('')}</select></label>
        ${can('tickets.assign') || state.me.role === 'agent' ? `<label class="field"><span>المسؤول</span><select data-assign>${state.me.role === 'agent' ? `<option value="">${esc(t.assignee_name || 'طابور الفرع')}</option><option value="${state.me.id}">إسنادها لي</option>` : `<option value="">طابور الفرع</option>${branchStaff.map((u) => `<option value="${u.id}" ${u.id === t.assignee_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}`}</select></label>` : ''}
        <label class="field"><span>الأولوية</span><select data-priority>${options(M.priority, t.priority)}</select></label>
        <div class="form-row">
          <label class="field"><span>القسم</span><select data-classify="section">${options(M.sections, t.section_id, { blank: 'بدون' })}</select></label>
          <label class="field"><span>الموضوع</span><select data-classify="topic">${options(M.topics, t.topic, { blank: 'بدون' })}</select></label>
        </div>
      </div></section>
      <section class="card"><div class="card-h"><h3>العميل</h3></div><div class="card-b">
        <dl class="kv">
          <dt>الاسم</dt><dd>${esc(t.name || '—')}</dd>
          <dt>الجوال</dt><dd>${t.phone ? `<a class="ltr" href="tel:${esc(t.phone)}">${esc(t.phone)}</a>` : '<span class="muted">لم يترك رقمًا</span>'}</dd>
          <dt>طلب التواصل</dt><dd>${t.wants_contact ? `<span class="badge g">نعم · موافقة ${fmtDT(t.contact_consent_at)}</span>` : '<span class="muted">لا — ملاحظة للتحسين</span>'}</dd>
          <dt>أنشئت</dt><dd>${fmtDT(t.created_at)}</dd>
          ${t.first_response_at ? `<dt>أول تواصل</dt><dd>${fmtDT(t.first_response_at)}</dd>` : ''}
          ${t.resolved_at ? `<dt>الحل</dt><dd>${fmtDT(t.resolved_at)}</dd>` : ''}
          ${t.close_reason ? `<dt>سبب الإغلاق</dt><dd>${esc(t.close_reason)}</dd>` : ''}
        </dl>
        ${t.phone && t.wants_contact ? `<div class="form-actions"><a class="btn sec sm" href="tel:${esc(t.phone)}">${ic('phone', 16)}اتصال</a><a class="btn sec sm" target="_blank" rel="noopener" href="https://wa.me/966${esc(t.phone.slice(1))}?text=${encodeURIComponent(`مرحبًا ${t.name || ''}، معك خدمة عملاء ماك سنتر بخصوص ملاحظتك رقم ${t.ref}.`)}">${ic('wa', 16)}واتساب</a></div>` : ''}
      </div></section>
    </div>
  </div>`;

  const act = async (action, body, ok) => {
    await run(null, () => api(`/tickets/${id}/${action}`, { method: 'POST', body }), { ok });
    ctx.refreshBadges();
    renderTicket(view, ctx, id);
  };
  view.querySelector('[data-act="acknowledge"]')?.addEventListener('click', () => act('acknowledge', {}, 'استلمت المهمة'));
  view.querySelector('[data-status]').addEventListener('change', async (e) => {
    const s = e.target.value;
    if (!s) return;
    if (s === 'closed') {
      const m = modal('إغلاق التذكرة', `<form class="form"><label class="field"><span>سبب الإغلاق</span><textarea name="reason" required placeholder="مثال: تم التواصل وحل المشكلة باستبدال المنتج"></textarea><span class="hint">الإغلاق وحده لا يعني رضا العميل؛ وثّق ما حدث.</span></label><div class="form-actions"><button class="btn">إغلاق</button><button type="button" class="btn sec" data-x>إلغاء</button></div></form>`);
      m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); m.remove(); await act('status', { status: 'closed', reason: ev.target.reason.value }, 'أغلقت التذكرة'); };
      e.target.value = '';
      return;
    }
    act('status', { status: s }, 'حدثت الحالة');
  });
  view.querySelector('[data-assign]')?.addEventListener('change', (e) => act('assign', { userId: Number(e.target.value) || null }, e.target.value ? `أسندت إلى ${staffName(e.target.value)}` : 'أعيدت لطابور الفرع'));
  view.querySelector('[data-priority]').addEventListener('change', (e) => act('priority', { priority: e.target.value }, 'حدثت الأولوية'));
  view.querySelectorAll('[data-classify]').forEach((s) => s.addEventListener('change', () => act('classify', { [s.dataset.classify]: s.value }, 'صحح التصنيف')));

  const comp = view.querySelector('[data-compose]');
  let mode = 'note';
  comp.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
    mode = b.dataset.mode;
    comp.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    comp.body.placeholder = mode === 'note' ? 'اكتب ملاحظة داخلية لا تصل للعميل…' : 'لخّص ما دار في الاتصال أو المحادثة مع العميل…';
    comp.querySelector('[data-visible]').hidden = mode !== 'contact';
  });
  comp.addEventListener('submit', async (e) => {
    e.preventDefault();
    await act(mode, { body: comp.body.value, visible: comp.visible?.checked }, 'حفظت');
  });
}
