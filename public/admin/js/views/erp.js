import { api, esc, ic, state, nf, fmtDT, emptyState, options, run, toast } from '../core.js';

// الربط مع النظام المحاسبي: حالة الاستقبال، وربط رموز الفروع وتصنيفات الأصناف بأقسام ماك سنتر
const ST = { member: ['عضو MAC+‎', 'g'], guest: ['زائر', ''], return: ['مرتجع', 'v'], unmapped: ['بانتظار الربط', 'y'], error: ['خطأ', 'r'], received: ['مستلمة', 'b'] };

export async function render(view) {
  const d = await api('/plus/erp');
  const M = state.meta;
  const t = d.today;
  view.innerHTML = `
  ${d.enabled ? '' : `<div class="banner">${ic('alert')}<span>الربط غير مفعل. أضف متغير <span class="code">ERP_WEBHOOK_SECRET</span> في Railway بقيمة سرية طويلة، وأعطها لمزود النظام المحاسبي.</span></div>`}
  <div class="grid g4">
    ${[['آخر فاتورة وصلت', d.lastReceived ? fmtDT(d.lastReceived) : '—', 'clock'], ['فواتير اليوم', nf.format(Object.values(t).reduce((a, b) => a + b, 0)), 'note'], ['لأعضاء MAC+‎ اليوم', nf.format(t.member || 0), 'cart'], ['بانتظار الربط', nf.format(t.unmapped || 0), 'alert']]
      .map(([l, v, i]) => `<section class="card kpi ${i === 'alert' && t.unmapped ? 'warn' : ''}"><span class="lbl"><span class="ic-wrap">${ic(i)}</span>${l}</span><span class="val num" style="font-size:26px">${v}</span></section>`).join('')}
  </div>
  <section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('link')} عنوان الاستقبال</h3></div><div class="card-b grid" style="gap:10px">
    <p style="margin:0">يرسل النظام المحاسبي كل فاتورة بيع أو مرتجع فور إصدارها (POST بصيغة JSON) إلى:</p>
    <p class="code" style="font-size:14px;padding:10px">${esc(d.webhookUrl)}</p>
    <p class="muted small" style="margin:0">مع الترويسة <span class="code">X-Api-Key</span> بقيمة المفتاح السري. الحقول: <span class="code">invoice_no, branch_code, date, type, total, customer_phone, member_code, items[{name, category, qty, price}], invoice_url</span>. المواصفات الكاملة في <span class="code">docs/erp-webhook.md</span>.</p>
  </div></section>
  <form class="grid g2" style="margin-top:16px" data-map>
    <section class="card"><div class="card-h"><h3>${ic('pin')} رموز الفروع</h3></div><div class="card-b form">
      ${d.branchCodes.length ? d.branchCodes.map((c) => `<label class="field map-row"><span class="code">${esc(c)}</span><select data-b="${esc(c)}">${options(M.allBranches, d.mapping.branches[c], { blank: 'غير مربوط' })}</select></label>`).join('') : '<p class="muted">تظهر الرموز هنا تلقائيًا مع أول فاتورة تصل.</p>'}
      <div class="form-row"><label class="field"><span>رمز فرع يدويًا</span><input data-newb dir="ltr" placeholder="مثال: 01"></label><label class="field"><span>الفرع</span><select data-newbv>${options(M.allBranches, '', { blank: '—' })}</select></label></div>
    </div></section>
    <section class="card"><div class="card-h"><h3>${ic('layers')} تصنيفات الأصناف ← الأقسام</h3></div><div class="card-b form">
      ${d.categories.length ? d.categories.map((c) => `<label class="field map-row"><span>${esc(c)}</span><select data-c="${esc(c)}">${options(M.sections, d.mapping.categories[c], { blank: 'غير مربوط' })}</select></label>`).join('') : '<p class="muted">تظهر تصنيفات الأصناف هنا تلقائيًا مع الفواتير.</p>'}
      <div class="form-row"><label class="field"><span>تصنيف يدويًا</span><input data-newc placeholder="كما يظهر في النظام"></label><label class="field"><span>القسم</span><select data-newcv>${options(M.sections, '', { blank: '—' })}</select></label></div>
    </div></section>
    <div class="form-actions" style="grid-column:1/-1"><button class="btn" type="submit">${ic('check')}حفظ الربط وإعادة معالجة المعلق</button></div>
  </form>
  <section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('log')} آخر الفواتير الواردة</h3></div>
    ${d.recent.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الفاتورة</th><th>الفرع</th><th>المبلغ</th><th>العميل</th><th>التصنيفات</th><th>الحالة</th></tr></thead><tbody>
    ${d.recent.map((r) => `<tr><td><span class="ref">${esc(r.invoice_no)}</span><div class="muted small">${fmtDT(r.received_at)}</div></td><td><span class="code">${esc(r.branch_code)}</span></td>
      <td class="num">${r.kind === 'return' ? '−' : ''}${nf.format(r.total)}</td><td class="ltr small">${esc(r.phone || r.member_code || '—')}</td><td class="small">${r.categories.map(esc).join('، ') || '—'}</td>
      <td><span class="badge ${ST[r.status]?.[1] || ''}">${ST[r.status]?.[0] || esc(r.status)}</span>${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : emptyState('لم تصل فواتير بعد', 'inbox')}</section>`;

  const f = view.querySelector('[data-map]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const branches = {}, categories = {};
    f.querySelectorAll('[data-b]').forEach((s) => { if (s.value) branches[s.dataset.b] = Number(s.value); });
    f.querySelectorAll('[data-c]').forEach((s) => { if (s.value) categories[s.dataset.c] = Number(s.value); });
    const nb = f.querySelector('[data-newb]').value.trim(), nbv = f.querySelector('[data-newbv]').value;
    if (nb && nbv) branches[nb] = Number(nbv);
    const nc = f.querySelector('[data-newc]').value.trim(), ncv = f.querySelector('[data-newcv]').value;
    if (nc && ncv) categories[nc] = Number(ncv);
    const r = await run(f.querySelector('[type=submit]'), () => api('/plus/erp/mapping', { method: 'PUT', body: { branches, categories } }));
    toast(r.reprocessed ? `حُفظ الربط وأعيدت معالجة ${r.reprocessed} فاتورة` : 'حُفظ الربط');
    render(view);
  });
}
