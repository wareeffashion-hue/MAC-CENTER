import { api, esc, ic, state, fmtDT, ago, emptyState, options, run, formData, drawer, closeDrawer, toast, confirmBox } from '../core.js';

// طابور الطلبات: حجز قطعة، اطلب واستلم، لقيناه لك
let PM = null;
const ACTIONS = {
  reserve: [['confirmed', 'تأكيد الحجز', 'check'], ['done', 'استلمها العميل', 'check'], ['cancelled', 'إلغاء', 'close']],
  collect: [['ready', 'جاهز للاستلام', 'check'], ['done', 'تم التسليم', 'check'], ['cancelled', 'إلغاء', 'close']],
  find: [['found', 'وجدناه، أبلغ العميل', 'check'], ['done', 'إغلاق', 'check'], ['cancelled', 'غير متوفر', 'close']],
};
const TONE = { new: 'y', confirmed: 'b', ready: 'g', found: 'g', done: '', cancelled: 'r', expired: 'r' };

export async function render(view, ctx) {
  PM ||= await api('/plus/meta');
  const status = ctx.query.get('status') || 'open';
  const kind = ctx.query.get('kind') || '';
  const { items } = await api(`/plus/requests?status=${status}&kind=${kind}`);
  const go = (s, k) => { location.hash = `#/requests?status=${s}${k ? `&kind=${k}` : ''}`; };
  view.innerHTML = `
  <div class="bar">
    <div class="seg">${[['open', 'مفتوحة'], ['done', 'مكتملة'], ['expired', 'منتهية'], ['all', 'الكل']].map(([k, v]) => `<button data-st="${k}" class="${k === status ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="seg">${[['', 'كل الأنواع'], ...Object.entries(PM.requestKind)].map(([k, v]) => `<button data-kd="${k}" class="${k === kind ? 'on' : ''}">${v}</button>`).join('')}</div>
    <span class="grow"></span><button class="btn" data-new>${ic('plus')}طلب جديد</button>
  </div>
  <section class="card">${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الطلب</th><th>العميل</th><th>التفاصيل</th><th>الحالة</th><th></th></tr></thead><tbody>
  ${items.map((r) => {
    const open = ['new', 'confirmed', 'ready', 'found'].includes(r.status);
    const acts = open ? ACTIONS[r.kind].filter(([s]) => s !== r.status && !(s === 'done' && r.status === 'new' && r.kind !== 'find')) : [];
    return `<tr><td><span class="ref">${esc(r.ref)}</span><div class="muted small">${esc(PM.requestKind[r.kind])} · ${esc(r.branch)}</div><div class="muted small">${ago(r.created_at)}</div></td>
      <td><a class="ltr" href="https://wa.me/966${esc(r.phone.slice(1))}" target="_blank" rel="noopener">${esc(r.phone)}</a>${r.name ? `<div class="small">${esc(r.name)}</div>` : ''}${r.member_code ? '<span class="badge solid">MAC+‎</span>' : ''}</td>
      <td class="req-d">${esc(r.details)}${r.size ? `<div class="muted small">مقاس/لون: ${esc(r.size)}</div>` : ''}${r.section ? `<div class="muted small">${esc(r.section)}</div>` : ''}${r.note ? `<div class="muted small">${ic('note', 12)} ${esc(r.note)}</div>` : ''}</td>
      <td><span class="badge ${TONE[r.status] || ''}"><i class="dot"></i>${esc(PM.requestStatus[r.status])}</span>${r.hold_until && r.status === 'confirmed' ? `<div class="muted small">حتى ${fmtDT(r.hold_until)}</div>` : ''}${r.pickup_code && r.status === 'ready' ? `<div class="small">الرمز <b>${esc(r.pickup_code)}</b></div>` : ''}</td>
      <td class="acts">${acts.map(([s, label, icon]) => `<button class="btn ${s === 'cancelled' ? 'ghost' : 'sec'} sm" data-id="${r.id}" data-to="${s}">${ic(icon, 14)}${label}</button>`).join('')}</td></tr>`;
  }).join('')}</tbody></table></div>` : emptyState(status === 'open' ? 'لا توجد طلبات مفتوحة. الطلبات تأتي من صفحة «احجز واستلم» في الموقع أو تضيفها هنا.' : 'لا توجد طلبات', 'clock')}</section>`;

  view.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => go(b.dataset.st, kind));
  view.querySelectorAll('[data-kd]').forEach((b) => b.onclick = () => go(status, b.dataset.kd));
  view.querySelector('[data-new]').onclick = () => newRequest(() => render(view, ctx));
  view.querySelectorAll('[data-to]').forEach((b) => b.onclick = async () => {
    const to = b.dataset.to;
    let note = '';
    if (to === 'cancelled') {
      if (!(await confirmBox('إغلاق الطلب', 'سيُغلق الطلب دون رسالة للعميل. تواصل معه إن احتاج توضيحًا.', { danger: true, okLabel: 'إغلاق' }))) return;
    }
    await run(b, () => api(`/plus/requests/${b.dataset.id}`, { method: 'POST', body: { status: to, note } }), { ok: { confirmed: 'حُجز وأُبلغ العميل', ready: 'أُرسل رمز الاستلام للعميل', found: 'أُبلغ العميل بتوفره', done: 'اكتمل الطلب', cancelled: 'أُغلق الطلب' }[to] });
    ctx.refreshBadges?.();
    render(view, ctx);
  });
}

function newRequest(after) {
  const M = state.meta;
  const d = drawer('طلب جديد', `<form class="form">
    <label class="field"><span>النوع</span><select name="kind">${options(PM.requestKind, 'reserve')}</select></label>
    <p class="muted small" data-note>${esc(PM.kindNote.reserve)}</p>
    <div class="form-row"><label class="field"><span>جوال العميل</span><input name="phone" dir="ltr" required placeholder="05xxxxxxxx"></label><label class="field"><span>الاسم</span><input name="name" maxlength="60"></label></div>
    <div class="form-row"><label class="field"><span>الفرع</span><select name="branchId">${options(M.branches.filter((b) => b.active))}</select></label><label class="field"><span>القسم</span><select name="sectionId">${options(M.sections.filter((s) => s.active), '', { blank: '—' })}</select></label></div>
    <label class="field"><span>التفاصيل</span><textarea name="details" required maxlength="600" rows="3"></textarea></label>
    <label class="field"><span>المقاس أو اللون</span><input name="size" maxlength="30"></label>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button></div></form>`);
  const f = d.querySelector('form');
  f.kind.onchange = () => { f.querySelector('[data-note]').textContent = PM.kindNote[f.kind.value]; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api('/plus/requests', { method: 'POST', body: formData(f) }), { form: f });
    toast(`سُجل الطلب ${r.ref}`);
    closeDrawer(); after();
  });
}
