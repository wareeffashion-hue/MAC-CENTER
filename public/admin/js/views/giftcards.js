import { api, esc, ic, state, nf, fmtD, fmtDT, emptyState, options, run, formData, drawer, closeDrawer, toast, confirmBox } from '../core.js';

// قسائم الإهداء: المبيعات والرصيد القائم، إصدار من الفرع، إعادة الإرسال والإلغاء، والإعدادات
const sar = (v) => `${nf.format(Number(v) || 0)} ر.س`;

export async function render(view, ctx) {
  const q = ctx.query.get('q') || '', status = ctx.query.get('status') || '';
  const d = await api(`/gifts?q=${encodeURIComponent(q)}&status=${status}`);
  const t = d.totals;
  view.innerHTML = `
  ${d.driver === 'mock' ? `<div class="banner">${ic('alert')}<span>بوابة الدفع في وضع التجربة. لتفعيل البيع أضف <span class="code">MOYASAR_SECRET_KEY</span> في Railway.</span></div>` : ''}
  <div class="grid g4">
    ${[['المبيعات', sar(t.sold), `${nf.format(t.count)} قسيمة`, 'gift'], ['الرصيد القائم', sar(t.outstanding), 'التزام على المتجر حتى يُستخدم', 'shield'], ['المستخدم', sar(t.redeemed), 'استُخدم في الفروع', 'cart'], ['طلبات معلقة', nf.format(t.pendingOrders), 'بانتظار تأكيد الدفع', 'clock']]
      .map(([l, v, s, i]) => `<section class="card kpi"><span class="lbl"><span class="ic-wrap">${ic(i)}</span>${l}</span><span class="val num" style="font-size:28px">${v}</span><span class="sub">${s}</span></section>`).join('')}
  </div>
  <div class="bar" style="margin-top:16px">
    <form data-q style="display:flex;gap:8px"><input name="q" value="${esc(q)}" placeholder="رمز القسيمة أو الجوال" dir="ltr" style="width:240px"><button class="btn sec sm">${ic('search', 16)}</button></form>
    <div class="seg">${[['', 'الكل'], ['active', 'برصيد'], ['used', 'مستخدمة'], ['cancelled', 'ملغاة']].map(([k, v]) => `<button data-st="${k}" class="${k === status ? 'on' : ''}">${v}</button>`).join('')}</div>
    <span class="grow"></span><a class="btn ghost sm" href="/gift-cards" target="_blank" rel="noopener">${ic('eye', 16)}صفحة الشراء</a><button class="btn sec" data-settings>${ic('cog', 16)}الإعدادات</button><button class="btn" data-new>${ic('plus')}إصدار من الفرع</button>
  </div>
  <section class="card">${d.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>القسيمة</th><th>القيمة</th><th>الرصيد</th><th>المُهدى إليه</th><th>التسليم</th><th>الحالة</th></tr></thead><tbody>
  ${d.items.map((c) => `<tr class="click" data-id="${c.id}" tabindex="0"><td><span class="ref">${esc(c.code)}</span><div class="muted small">${fmtD(c.createdAt)} · ${c.source === 'branch' ? 'من الفرع' : 'إلكترونية'}</div></td>
    <td class="num">${sar(c.amount)}</td><td class="num"><b>${sar(c.balance)}</b></td><td>${esc(c.recipientName || '—')}<div class="ltr small muted">${esc(c.recipientPhone || '')}</div></td>
    <td class="small">${c.deliveredAt ? `وصلت ${fmtDT(c.deliveredAt)}` : c.sendAt ? `مجدولة ${fmtDT(c.sendAt)}` : c.recipientPhone ? '—' : 'يرسلها المشتري'}</td>
    <td>${c.status === 'cancelled' ? '<span class="badge r">ملغاة</span>' : c.expired ? '<span class="badge">منتهية</span>' : c.balance <= 0 ? '<span class="badge">مستخدمة</span>' : '<span class="badge g"><i class="dot"></i>نشطة</span>'}</td></tr>`).join('')}
  </tbody></table></div>` : emptyState('لا توجد قسائم بعد. تظهر هنا القسائم المبيعة من الموقع والمصدرة من الفروع.', 'gift')}</section>`;

  const go = (o) => { const p = new URLSearchParams({ q, status, ...o }); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); location.hash = `#/giftcards${p.toString() ? `?${p}` : ''}`; };
  view.querySelector('[data-q]').onsubmit = (e) => { e.preventDefault(); go({ q: e.target.q.value.trim() }); };
  view.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => go({ status: b.dataset.st }));
  view.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => detail(Number(tr.dataset.id), () => render(view, ctx)); tr.onkeydown = (e) => e.key === 'Enter' && tr.onclick(); });
  view.querySelector('[data-new]').onclick = () => issue(d, () => render(view, ctx));
  view.querySelector('[data-settings]').onclick = () => settings(d.settings, () => render(view, ctx));
}

async function detail(id, after) {
  const c = await api(`/gifts/${id}`);
  const active = c.status === 'active';
  const d = drawer(`القسيمة ${esc(c.code)}`, `<div class="grid" style="gap:14px">
    <dl class="kv"><dt>القيمة</dt><dd>${sar(c.amount)}</dd><dt>الرصيد</dt><dd><b>${sar(c.balance)}</b></dd><dt>من</dt><dd>${esc(c.sender || '—')}</dd><dt>إلى</dt><dd>${esc(c.recipientName || '—')} <span class="ltr">${esc(c.recipientPhone || '')}</span></dd>
      ${c.message ? `<dt>الرسالة</dt><dd>${esc(c.message)}</dd>` : ''}<dt>الصلاحية</dt><dd>${fmtD(c.expiresAt)}</dd>
      ${c.order ? `<dt>المشتري</dt><dd class="ltr">${esc(c.order.buyer_phone)}</dd><dt>الدفع</dt><dd>${esc(c.order.provider)} · <span class="code">${esc(c.order.provider_id || '')}</span> · ${fmtDT(c.order.paid_at)}</dd>` : ''}
      <dt>الرابط</dt><dd><a href="${esc(c.url)}" target="_blank" rel="noopener">فتح صفحة القسيمة</a></dd></dl>
    <section class="card"><div class="card-h"><h3>${ic('log')} الحركات</h3></div><div class="list">${c.txns.map((t) => `<div class="li"><span class="grow"><span class="t">${{ issue: 'إصدار', redeem: 'استخدام', cancel: 'إلغاء' }[t.kind]}${t.branch ? ` · ${esc(t.branch)}` : ''}${t.ref ? ` · ${esc(t.ref)}` : ''}</span><span class="s">${fmtDT(t.created_at)}</span></span><b class="num ${t.amount < 0 ? 'neg' : 'pos'}">${sar(t.amount)}</b></div>`).join('')}</div></section>
    ${active ? `<div class="form-actions">${c.recipientPhone ? `<button class="btn sec" data-resend>${ic('wa', 16)}إعادة الإرسال</button>` : ''}<button class="btn danger" data-cancel>${ic('close', 16)}إلغاء القسيمة</button></div>
      <p class="muted small">الإلغاء يوقف الرصيد فورًا. رد المبلغ للمشتري يتم من لوحة بوابة الدفع.</p>` : ''}
  </div>`, { wide: true });
  d.querySelector('[data-resend]')?.addEventListener('click', (e) => run(e.currentTarget, () => api(`/gifts/${id}/resend`, { method: 'POST' }), { ok: 'أُعيد إرسال القسيمة' }));
  d.querySelector('[data-cancel]')?.addEventListener('click', async () => {
    if (!(await confirmBox('إلغاء القسيمة', `سيتوقف رصيدها المتبقي (${sar(c.balance)}) فورًا ولا يمكن التراجع.`, { danger: true, okLabel: 'إلغاء القسيمة' }))) return;
    const reason = prompt('سبب الإلغاء');
    if (!reason) return;
    await run(null, () => api(`/gifts/${id}/cancel`, { method: 'POST', body: { reason } }), { ok: 'أُلغيت القسيمة' });
    closeDrawer(); after();
  });
}

function issue(data, after) {
  const M = state.meta;
  const d = drawer('إصدار قسيمة من الفرع', `<form class="form">
    <p class="muted small" style="margin:0">لقسيمة بيعت نقدًا في الفرع أو قُدمت تعويضًا. يُسجل الإصدار باسمك في سجل التدقيق.</p>
    <div class="form-row"><label class="field"><span>القيمة</span><input name="amount" type="number" min="${data.settings.min}" max="${data.settings.max}" required dir="ltr"></label>
      <label class="field"><span>الفرع</span><select name="branchId">${options(M.branches.filter((b) => b.active))}</select></label>
      <label class="field"><span>التصميم</span><select name="design">${options(Object.fromEntries(Object.entries(data.designs).map(([k, v]) => [k, v.name])), 'general')}</select></label></div>
    <div class="form-row"><label class="field"><span>من</span><input name="senderName" maxlength="40"></label><label class="field"><span>إلى</span><input name="recipientName" maxlength="40"></label>
      <label class="field"><span>جوال المُهدى إليه <small class="muted">ترسل له فورًا</small></span><input name="recipientPhone" dir="ltr" placeholder="05xxxxxxxx"></label></div>
    <label class="field"><span>الرسالة</span><input name="message" maxlength="240"></label>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}إصدار</button></div></form>`);
  const f = d.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api('/gifts', { method: 'POST', body: formData(f) }), { form: f });
    toast(`صدرت القسيمة ${r.code}`);
    closeDrawer(); after();
  });
}

function settings(st, after) {
  const d = drawer('إعدادات القسائم', `<form class="form">
    <label class="field"><span>القيم المقترحة <small class="muted">مفصولة بفاصلة</small></span><input name="amounts" dir="ltr" value="${esc(st.amounts.join(', '))}"></label>
    <div class="form-row"><label class="field"><span>أقل قيمة</span><input name="min" type="number" dir="ltr" value="${st.min}"></label><label class="field"><span>أعلى قيمة</span><input name="max" type="number" dir="ltr" value="${st.max}"></label>
      <label class="field"><span>الصلاحية (يوم)</span><input name="validityDays" type="number" dir="ltr" value="${st.validityDays}"><span class="hint">تأكد من توافقها مع أنظمة وزارة التجارة لبطاقات الإهداء.</span></label></div>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button></div></form>`);
  const f = d.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formData(f);
    b.amounts = String(b.amounts).split(/[,،\s]+/).map(Number).filter(Boolean);
    await run(f.querySelector('[type=submit]'), () => api('/gifts/settings', { method: 'PUT', body: b }), { form: f, ok: 'حُفظت الإعدادات' });
    closeDrawer(); after();
  });
}
