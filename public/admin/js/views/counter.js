import { api, esc, ic, can, state, badge, fmtD, fmtDT, nf, emptyState, options, run, formData, drawer, closeDrawer, toast, branchName, sectionName } from '../core.js';

// نقطة MAC+‎: الكاشير يبحث بالجوال أو رقم العضوية، يسجل العضو، ثم يسجل الفاتورة بأقسامها
let PM = null;
const sar = (v) => `${nf.format(Math.round((Number(v) || 0) * 100) / 100)} ر.س`;

export async function render(view, ctx) {
  PM ||= await api('/plus/meta');
  const q = ctx.query.get('q') || '';
  view.innerHTML = `
  <section class="card counter-search"><form class="card-b" data-find>
    <label class="field grow"><span>جوال العميل أو رقم العضوية أو قسيمة إهداء أو إيصال هدية</span>
      <input name="q" dir="ltr" inputmode="text" autocomplete="off" placeholder="05xxxxxxxx" value="${esc(q)}" autofocus></label>
    <button class="btn" type="submit">${ic('search')}بحث</button>
  </form></section>
  <div data-out></div>`;
  const out = view.querySelector('[data-out]');
  const form = view.querySelector('[data-find]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = form.q.value.trim();
    if (!v) return;
    history.replaceState(null, '', `#/counter?q=${encodeURIComponent(v)}`);
    await lookup(out, v);
  });
  if (q) await lookup(out, q);
  else out.innerHTML = intro();
}

const intro = () => `<section class="card"><div class="card-b counter-intro">
  ${ic('search', 36)}<div><h3>ابدأ برقم جوال العميل</h3><p class="muted">إن كان عضوًا تظهر بطاقته ورصيده، وإن لم يكن تسجله في ثوانٍ بعد موافقته. كل قسم إضافي في الفاتورة يرفع خطوط عربته: ${PM.settings.tiers.map((t) => `${t.min} أقسام ${t.pct}%`).join(' · ')}.</p></div>
</div></section>`;

async function lookup(out, q) {
  out.innerHTML = '<div class="card"><div class="card-b muted">جارٍ البحث…</div></div>';
  // قسيمة إهداء: GC-XXXX-XXX-XXX (أو ممسوحة من رمز QR دون شرطات)
  if (/^GC[-\s]?[A-Z0-9]{4}[-\s]?[A-Z0-9]{3}[-\s]?[A-Z0-9]{3}$/i.test(q.trim())) {
    try {
      const g = await api(`/gifts/lookup?q=${encodeURIComponent(q)}`);
      if (!g.card) { out.innerHTML = `<div class="banner">${ic('alert')}<span>لا توجد قسيمة بهذا الرمز</span></div>`; return; }
      return voucherView(out, g.card);
    } catch (err) { out.innerHTML = `<div class="banner">${ic('alert')}<span>${esc(err.message)}</span></div>`; return; }
  }
  let r;
  try { r = await api(`/plus/lookup?q=${encodeURIComponent(q)}`); } catch (err) { out.innerHTML = `<div class="banner">${ic('alert')}<span>${esc(err.message)}</span></div>`; return; }
  if (r.gift) return giftView(out, r.gift);
  if (r.member) return memberView(out, r.member);
  joinView(out, q);
}

function voucherView(out, c) {
  const M = state.meta;
  const myBranches = M.branches.filter((b) => b.active);
  out.innerHTML = `<section class="card"><div class="card-h"><h3>${ic('gift')} قسيمة إهداء <span class="code">${esc(c.code)}</span></h3>
    <div class="right">${c.usable ? '<span class="badge g"><i class="dot"></i>صالحة</span>' : `<span class="badge r">${c.status === 'cancelled' ? 'ملغاة' : c.expired ? 'منتهية' : 'رصيدها صفر'}</span>`}</div></div>
    <div class="card-b grid" style="gap:14px">
      <div class="mc-bal" style="color:var(--green-dk);border-color:var(--line)"><span>الرصيد المتاح</span><b style="color:var(--green-dk)">${sar(c.balance)}</b></div>
      <dl class="kv"><dt>القيمة الأصلية</dt><dd>${sar(c.amount)}</dd><dt>إلى</dt><dd>${esc(c.recipientName || '—')}</dd><dt>صالحة حتى</dt><dd>${fmtD(c.expiresAt)}</dd></dl>
      ${c.usable ? `<form class="form" data-redeem><div class="form-row">
        <label class="field"><span>الفرع</span><select name="branchId">${options(myBranches, myBranches[0]?.id)}</select></label>
        <label class="field"><span>المبلغ المخصوم من القسيمة</span><input name="amount" type="number" step="0.01" min="0.01" max="${c.balance}" required dir="ltr" value="${c.balance}"></label>
        <label class="field"><span>رقم الفاتورة <small class="muted">اختياري</small></span><input name="ref" dir="ltr" maxlength="40"></label></div>
        <div class="form-actions"><button class="btn" type="submit">${ic('check')}خصم من القسيمة</button></div></form>` : ''}
      ${c.txns.length > 1 ? `<div class="list">${c.txns.map((t) => `<div class="li"><span class="grow"><span class="t">${{ issue: 'إصدار', redeem: 'استخدام', cancel: 'إلغاء' }[t.kind]}${t.branch ? ` · ${esc(t.branch)}` : ''}</span><span class="s">${fmtDT(t.created_at)}</span></span><b class="num">${sar(t.amount)}</b></div>`).join('')}</div>` : ''}
    </div></section>`;
  const f = out.querySelector('[data-redeem]');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api(`/gifts/${c.id}/redeem`, { method: 'POST', body: formData(f) }), { form: f });
    toast(`خُصم المبلغ. المتبقي ${sar(r.balance)}`);
    voucherView(out, r);
  });
}

function joinView(out, q) {
  const M = state.meta;
  const phone = /^0?5\d{8}$/.test(q.replace(/\D/g, '').replace(/^966/, '0')) ? q : '';
  out.innerHTML = `<section class="card"><div class="card-h"><h3>${ic('user')} عميل غير مسجل</h3></div>
  <form class="card-b form" data-join>
    <div class="form-row">
      <label class="field"><span>الجوال</span><input name="phone" dir="ltr" required value="${esc(phone)}" placeholder="05xxxxxxxx"></label>
      <label class="field"><span>الاسم <small class="muted">اختياري</small></span><input name="name" maxlength="60"></label>
      <label class="field"><span>الفرع</span><select name="branchId">${options(M.branches.filter((b) => b.active), M.branches[0]?.id)}</select></label>
      <label class="field"><span>رقم عضوية من دعاه <small class="muted">اختياري</small></span><input name="refCode" dir="ltr" maxlength="10"></label>
    </div>
    <div class="banner info">${ic('shield')}<span>اقرأ للعميل: «${esc(PM.consent)}»</span></div>
    <label class="switch field"><input type="checkbox" name="consent"><i></i>العميل وافق شفهيًا على النص أعلاه</label>
    <div class="form-actions"><button class="btn" type="submit">${ic('plus')}تسجيل في MAC+‎</button></div>
  </form></section>`;
  const f = out.querySelector('[data-join]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api('/plus/members', { method: 'POST', body: formData(f) }), { form: f });
    toast(r.created ? `سُجل العضو ${r.member.refCode} ووصلته رسالة الترحيب` : 'العميل عضو من قبل');
    if (r.created) api(`/plus/members/${r.member.id}/card`, { method: 'POST' }).catch(() => {});
    history.replaceState(null, '', `#/counter?q=${encodeURIComponent(r.member.phone)}`);
    memberView(out, r.member);
  });
}

function giftView(out, g) {
  out.innerHTML = `<section class="card"><div class="card-h"><h3>${ic('gift')} إيصال هدية <span class="code">GIFT-${esc(g.code)}</span></h3>
    <div class="right">${g.expired ? badge('cancelled', 'منتهي', { dot: true }) : badge('active', `صالح حتى ${g.until}`, { dot: true })}</div></div>
    <div class="card-b grid" style="gap:12px"><dl class="kv"><dt>الفاتورة</dt><dd><span class="code">${esc(g.ref)}</span> · ${esc(g.branch)} · ${esc(g.date)}</dd></dl>
    ${g.expired ? '' : `<div class="form-actions"><button class="btn" data-claim>${ic('refresh', 16)}تسجيل استبدال الهدية</button></div>`}</div></section>`;
  out.querySelector('[data-claim]')?.addEventListener('click', () => claimDrawer({ id: g.invoiceId, ref: g.ref }, 'gift', () => toast('سُجل الاستبدال')));
}

function memberView(out, m) {
  const M = state.meta;
  const myBranches = M.branches.filter((b) => b.active);
  const secs = M.sections.filter((s) => s.active);
  out.innerHTML = `<div class="grid g-main counter">
  <div class="grid" style="align-content:start">
    <section class="card"><div class="card-h"><h3>${ic('note')} فاتورة جديدة</h3>${m.control ? '<div class="right"><span class="badge v" title="عضو في المجموعة الضابطة للتجربة">مجموعة ضابطة</span></div>' : ''}</div>
    <form class="card-b form" data-inv>
      <input type="hidden" name="memberId" value="${m.id}">
      <div class="form-row">
        <label class="field"><span>الفرع</span><select name="branchId">${options(myBranches, myBranches[0]?.id)}</select></label>
        <label class="field"><span>رقم الفاتورة في نقطة البيع</span><input name="ref" dir="ltr" required maxlength="40"></label>
        <label class="field"><span>مبلغ الفاتورة قبل الخصم</span><input name="amount" type="number" min="1" step="0.01" inputmode="decimal" required dir="ltr"></label>
      </div>
      <div class="field"><span>الأقسام في الفاتورة <small class="muted">اضغط كل قسم اشترى منه العميل</small></span>
        <div class="dept-chips">${secs.map((s) => `<label class="dept"><input type="checkbox" name="sectionIds" data-multi value="${s.id}"><span>${esc(s.name)}</span></label>`).join('')}</div></div>
      <div class="form-row">
        <label class="switch"><input type="checkbox" name="useWallet" ${m.balance > 0 ? '' : 'disabled'}><i></i>استخدام الرصيد (${sar(m.balance)})</label>
        <label class="switch"><input type="checkbox" name="gift"><i></i>إيصال هدية بلا سعر</label>
      </div>
      <div class="pv-box" data-pv aria-live="polite"></div>
      <div class="form-actions"><button class="btn" type="submit">${ic('check')}تسجيل الفاتورة</button></div>
    </form></section>
    <div data-done></div>
    <section class="card"><div class="card-h"><h3>${ic('log')} آخر الفواتير</h3></div>
      ${m.invoices.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الفاتورة</th><th>المبلغ</th><th>الأقسام</th><th>المكافأة</th><th></th></tr></thead><tbody>
      ${m.invoices.map((i) => `<tr><td><span class="ref">${esc(i.ref)}</span><div class="muted small">${esc(i.branch)} · ${fmtD(i.created_at)}</div></td><td class="num">${sar(i.amount)}</td>
        <td><span class="lines-mini" title="${i.sectionIds.map(sectionName).join('، ')}">${'<i></i>'.repeat(Math.min(6, i.dept_count))}</span> ${i.dept_count}</td>
        <td>${i.tier_pct ? `${i.tier_pct}% · ${sar(i.reward)}` : '—'}${i.wallet_used ? `<div class="muted small">رصيد ${sar(i.wallet_used)}</div>` : ''}</td>
        <td><button class="btn ghost sm" data-claim="${i.id}" data-ref="${esc(i.ref)}">ضمان</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyState('لا توجد فواتير بعد', 'note')}</section>
  </div>
  <div class="grid" style="align-content:start">
    <section class="card mcard-a"><div class="card-b">
      <div class="mc-top"><span class="mc-plus">MAC+‎</span><span class="code">${esc(m.refCode)}</span></div>
      <p class="mc-name">${esc(m.name || 'بدون اسم')}</p><p class="mc-phone" dir="ltr">${esc(m.phone)}</p>
      <div class="mc-bal"><span>الرصيد</span><b>${sar(m.balance)}</b></div>
      <dl class="kv"><dt>الفواتير</dt><dd>${nf.format(m.invoiceCount)} · ${sar(m.totalSpent)}</dd><dt>دعا</dt><dd>${nf.format(m.referrals.count)} (${nf.format(m.referrals.rewarded)} تسوقوا)</dd><dt>عضو منذ</dt><dd>${fmtD(m.since)}</dd><dt>الرسائل</dt><dd>${m.consent ? 'موافق' : 'أوقفها'}</dd></dl>
      <div class="form-actions"><button class="btn sec sm" data-card>${ic('wa', 16)}إرسال البطاقة</button><a class="btn ghost sm" href="${esc(m.cardUrl)}" target="_blank" rel="noopener">${ic('eye', 16)}البطاقة</a>${can('plus.manage') ? `<button class="btn ghost sm" data-adj>${ic('edit', 16)}تعديل الرصيد</button>` : ''}</div>
    </div></section>
    ${m.requests.length ? `<section class="card"><div class="card-h"><h3>${ic('clock')} طلبات مفتوحة</h3></div><div class="list">${m.requests.map((r) => `<a class="li" href="#/requests"><span class="grow"><span class="t">${esc(r.ref)} · ${esc(PM.requestKind[r.kind])}</span><span class="s">${esc(r.details)}</span></span>${badge(r.status, PM.requestStatus[r.status])}</a>`).join('')}</div></section>` : ''}
    <section class="card"><div class="card-h"><h3>${ic('refresh')} حركة الرصيد</h3></div>
      <div class="list">${m.wallet.length ? m.wallet.map((w) => `<div class="li"><span class="grow"><span class="t">${esc(PM.walletKind[w.kind] || w.kind)}</span><span class="s">${fmtDT(w.created_at)}${w.expires_at && w.remaining > 0 ? ` · ينتهي ${fmtD(w.expires_at)}` : ''}${w.min_invoice ? ` · لفاتورة من ${sar(w.min_invoice)}` : ''}</span></span><b class="num ${w.amount < 0 ? 'neg' : 'pos'}">${w.amount > 0 ? '+' : ''}${sar(w.amount)}</b></div>`).join('') : emptyState('لا توجد حركة', 'refresh')}</div></section>
  </div></div>`;

  const f = out.querySelector('[data-inv]');
  const pv = out.querySelector('[data-pv]');
  let t = 0;
  const preview = async () => {
    const b = formData(f);
    if (!b.sectionIds.length && !Number(b.amount)) { pv.innerHTML = '<span class="muted">اختر الأقسام وأدخل المبلغ لترى الخصم.</span>'; return; }
    const p = await api('/plus/preview', { method: 'POST', body: b }).catch(() => null);
    if (!p) return;
    pv.innerHTML = `<div class="pv-lines">${CART_LINES(p.deptCount)}<b>${p.deptCount} ${p.deptCount === 1 ? 'قسم' : 'أقسام'}</b></div>
      <dl class="kv"><dt>خطوط العربة</dt><dd>${p.control ? 'مجموعة ضابطة: بلا خصم' : p.pct ? `${p.pct}% · ${sar(p.reward)} ${p.mode === 'discount' ? 'خصم الآن' : 'تضاف للرصيد'}` : 'لا خصم'}</dd>
      ${p.walletApplied ? `<dt>من الرصيد</dt><dd>${sar(p.walletApplied)}</dd>` : b.useWallet && p.walletAvailable < m.balance ? `<dt>الرصيد</dt><dd class="muted">جزء من الرصيد مشروط بحد أدنى للفاتورة</dd>` : ''}
      <dt>المطلوب من العميل</dt><dd><b class="pay">${sar(p.payable)}</b></dd></dl>
      ${p.nextTier ? `<p class="nudge">${ic('plus', 14)} قل للعميل: أضف ${p.nextTier.need} ${p.nextTier.need === 1 ? 'قسمًا' : 'أقسام'} وتصل إلى ${p.nextTier.pct}%</p>` : ''}`;
  };
  f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 180); });
  f.addEventListener('change', () => { clearTimeout(t); t = setTimeout(preview, 60); });
  preview();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api('/plus/invoices', { method: 'POST', body: formData(f) }), { form: f, ok: 'سُجلت الفاتورة ووصل الإيصال للعميل' });
    const fresh = await api(`/plus/members/${m.id}`);
    memberView(out, fresh);
    out.querySelector('[data-done]').innerHTML = `<section class="card done-card"><div class="card-b">
      <h3>${ic('check')} المطلوب ${sar(r.payable)}</h3>
      <p class="muted">${r.pct ? `خصم ${r.pct}% (${sar(r.reward)})` : 'بلا خصم أقسام'}${r.walletUsed ? ` · رصيد ${sar(r.walletUsed)}` : ''} · الرصيد الآن ${sar(r.balance)}</p>
      ${r.giftUrl ? `<p>إيصال الهدية: <a href="${esc(r.giftUrl)}" target="_blank" rel="noopener" class="code">${esc(r.giftUrl)}</a></p>` : ''}
    </div></section>`;
  });
  out.querySelectorAll('[data-claim]').forEach((b) => b.onclick = () => claimDrawer({ id: Number(b.dataset.claim), ref: b.dataset.ref }, 'price', async () => memberView(out, await api(`/plus/members/${m.id}`))));
  out.querySelector('[data-card]').onclick = (e) => run(e.currentTarget, () => api(`/plus/members/${m.id}/card`, { method: 'POST' }), { ok: 'أُرسلت البطاقة على واتساب' });
  out.querySelector('[data-adj]')?.addEventListener('click', () => {
    const d = drawer('تعديل الرصيد', `<form class="form"><label class="field"><span>المبلغ <small class="muted">موجب للإضافة، سالب للخصم</small></span><input name="amount" type="number" step="0.01" dir="ltr" required></label>
      <label class="field"><span>السبب</span><input name="note" required maxlength="120"></label><div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button></div></form>`);
    const df = d.querySelector('form');
    df.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fresh = await run(df.querySelector('[type=submit]'), () => api(`/plus/members/${m.id}/wallet`, { method: 'POST', body: formData(df) }), { form: df, ok: 'عُدل الرصيد' });
      closeDrawer(); memberView(out, fresh);
    });
  });
}

const CART_LINES = (n) => `<span class="pv-cart">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

function claimDrawer(inv, kind, after) {
  const st = PM.settings;
  const d = drawer(`ضمان على الفاتورة ${esc(inv.ref)}`, `<form class="form">
    <div class="seg" data-k>${[['price', `ضمان السعر (${st.price.days} أيام)`], ['size', `المقاس (${st.sizeDays} يومًا)`], ['gift', `الهدية (${st.giftDays} يومًا)`]].map(([k, v]) => `<button type="button" data-kind="${k}" class="${k === kind ? 'on' : ''}">${v}</button>`).join('')}</div>
    <input type="hidden" name="kind" value="${kind}"><input type="hidden" name="invoiceId" value="${inv.id}">
    <label class="field"><span>الصنف</span><input name="item" required maxlength="120" placeholder="اسم القطعة أو رقمها"></label>
    <div class="form-row" data-price><label class="field"><span>السعر المدفوع</span><input name="paid" type="number" step="0.01" dir="ltr"></label><label class="field"><span>السعر الجديد</span><input name="newPrice" type="number" step="0.01" dir="ltr"></label></div>
    <p class="muted small" data-help></p>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}تسجيل</button></div></form>`);
  const f = d.querySelector('form');
  const sync = () => {
    const k = f.kind.value;
    f.querySelector('[data-price]').hidden = k !== 'price';
    f.querySelector('[data-help]').textContent = { price: `يضاف الفرق لرصيد العميل بحد ${st.price.cap} ر.س للفاتورة، ويصله إشعار واتساب.`, size: 'يُسجل الاستبدال مرة واحدة لكل قطعة.', gift: 'استبدال من أُهديت له القطعة دون إظهار السعر.' }[k];
  };
  f.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { f.kind.value = b.dataset.kind; f.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b)); sync(); });
  sync();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(f.querySelector('[type=submit]'), () => api('/plus/claims', { method: 'POST', body: formData(f) }), { form: f });
    toast(r.credit ? `أضيف ${sar(r.credit)} لرصيد العميل` : 'سُجل الاستبدال');
    closeDrawer(); after?.();
  });
}
