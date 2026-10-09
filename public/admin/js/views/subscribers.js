import { api, esc, ic, can, state, badge, fmtDT, fmtD, nf, emptyState, options, run, drawer, closeDrawer, checks, formData, confirmBox, branchName, sectionName } from '../core.js';

export async function render(view, ctx) {
  const M = state.meta;
  const q = Object.fromEntries(ctx.query);
  const params = new URLSearchParams(Object.entries({ status: q.status ?? 'active', branch: q.branch || '', section: q.section || '', q: q.q || '' }).filter(([, v]) => v));
  const { items } = await api(`/subscribers?${params}`);
  view.innerHTML = `
  <form class="bar" data-f>
    <div class="seg">${[['active', 'نشط'], ['stopped', 'متوقف'], ['', 'الكل']].map(([k, v]) => `<button type="button" data-st="${k}" class="${(q.status ?? 'active') === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <input class="grow" type="search" name="q" placeholder="ابحث بالرقم أو الاسم" value="${esc(q.q || '')}">
    <select name="branch">${options(M.allBranches, q.branch, { blank: 'كل الفروع' })}</select>
    <select name="section">${options(M.sections, q.section, { blank: 'كل الأقسام' })}</select>
    ${can('subscribers.export') ? `<a class="btn sec" href="/api/subscribers/export.csv?${params}" download>${ic('download', 16)}تصدير CSV</a>` : ''}
  </form>
  <p class="muted small">${nf.format(items.length)} نتيجة. لا يضاف أي رقم إلى الإرسال إلا بموافقة يرسلها العميل بنفسه من واتساب.</p>
  <section class="card">${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>واتساب</th><th>الاسم</th><th>الفروع</th><th>الأقسام</th><th>المصدر</th><th>الموافقة</th><th>الحالة</th></tr></thead><tbody>
  ${items.map((s) => `<tr class="click" data-id="${s.id}" tabindex="0"><td><span class="ltr">${esc(s.wa_id)}</span></td><td>${esc(s.name || '—')}</td><td class="small">${s.branchIds.map(branchName).join('، ')}</td>
    <td class="small">${s.sectionIds.length > 2 ? `${s.sectionIds.slice(0, 2).map(sectionName).join('، ')} +${s.sectionIds.length - 2}` : s.sectionIds.map(sectionName).join('، ')}</td>
    <td><span class="badge">${esc(s.source_qr || 'الموقع')}</span></td><td class="small">${fmtD(s.consent_at)}</td><td>${badge(s.status, s.status === 'active' ? 'نشط' : 'متوقف', { dot: true })}</td></tr>`).join('')}
  </tbody></table></div>` : emptyState('لا يوجد مشتركون بهذه المعايير. شارك رموز QR داخل الفروع ليبدأ الاشتراك.', 'users')}</section>`;

  const go = (patch) => {
    const next = new URLSearchParams({ ...q, ...patch });
    for (const [k, v] of [...next]) if (v === '' && k !== 'status') next.delete(k);
    location.hash = `#/subscribers?${next}`;
  };
  const f = view.querySelector('[data-f]');
  f.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => go({ status: b.dataset.st }));
  f.addEventListener('change', (e) => { if (e.target.name) go({ [e.target.name]: e.target.value }); });
  f.addEventListener('submit', (e) => { e.preventDefault(); go({ q: f.q.value }); });
  view.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => detail(Number(tr.dataset.id), () => render(view, ctx)));
}

const KIND = { subscribed: 'اشترك', updated: 'حدّث اهتماماته', narrowed: 'أوقف جزءًا', stopped: 'أوقف الاشتراك' };

async function detail(id, after) {
  const M = state.meta;
  const s = await api(`/subscribers/${id}`);
  const sub = s.subscription;
  const d = drawer(`<span class="ltr">${esc(s.wa_id)}</span>`, `
    <div class="grid" style="gap:16px">
      <section class="card"><div class="card-b"><dl class="kv">
        <dt>الاسم</dt><dd>${esc(s.name || '—')}</dd><dt>الحالة</dt><dd>${badge(sub?.status, sub?.status === 'active' ? 'نشط' : 'متوقف', { dot: true })}</dd>
        <dt>الموافقة</dt><dd>${fmtDT(sub?.consent_at)} · إصدار ${esc(sub?.consent_version || '')}</dd><dt>نص الموافقة</dt><dd class="small">${esc(sub?.consent_text || '')}</dd>
        <dt>المصدر الأول</dt><dd>${esc(sub?.source_qr || 'الموقع')}</dd><dt>آخر رسالة منه</dt><dd>${fmtDT(s.last_inbound_at)}</dd>
      </dl></div></section>
      ${sub?.status === 'active' && can('subscribers.export') ? `<form class="card"><div class="card-h"><h3>الاهتمامات</h3></div><div class="card-b form">
        <div class="field"><span>الفروع</span>${checks('branchIds', M.allBranches, sub.branchIds)}</div>
        <div class="field"><span>الأقسام</span>${checks('sectionIds', M.sections, sub.sectionIds)}</div>
        <p class="muted small" style="margin:0">عدّل فقط بطلب واضح من العميل. يسجل التعديل باسمك.</p>
        <div class="form-actions"><button class="btn sm">${ic('check', 16)}حفظ</button><button type="button" class="btn danger sm" data-stop>${ic('close', 16)}إيقاف الاشتراك</button></div></div></form>` : ''}
      <section class="card"><div class="card-h"><h3>السجل</h3></div><div class="list">${s.events.map((e) => `<div class="li"><span class="grow"><span class="t">${esc(KIND[e.kind] || e.kind)}</span><span class="s">${esc(e.source || '')}</span></span><span class="muted small">${fmtDT(e.at)}</span></div>`).join('') || emptyState('لا يوجد سجل')}</div></section>
      <section class="card"><div class="card-h"><h3>آخر الرسائل</h3></div><div class="list">${s.messages.map((m) => `<div class="li"><span class="grow"><span class="t">${esc(m.campaign || 'رسالة')}</span><span class="s">${esc(m.reason || '')}</span></span>${badge(m.status, M.messageStatus[m.status])}</div>`).join('') || emptyState('لم تصله رسائل بعد', 'send')}</div></section>
    </div>`);
  const form = d.querySelector('form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(form.querySelector('button'), () => api(`/subscribers/${id}`, { method: 'PUT', body: formData(form) }), { ok: 'حفظت الاهتمامات' });
    closeDrawer(); after();
  });
  d.querySelector('[data-stop]')?.addEventListener('click', async (e) => {
    if (!(await confirmBox('إيقاف الاشتراك', 'سيتوقف إرسال العروض فورًا وتستبعد الرسائل المنتظرة.', { danger: true, okLabel: 'إيقاف' }))) return;
    await run(e.target, () => api(`/subscribers/${id}/stop`, { method: 'POST' }), { ok: 'أوقف الاشتراك' });
    closeDrawer(); after();
  });
}
