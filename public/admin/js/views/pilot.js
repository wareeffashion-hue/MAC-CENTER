import { api, esc, ic, can, state, nf, emptyState, options, run, formData, trendChart, hbars, fmtD } from '../core.js';

// تجربة MAC+‎: مؤشرات النجاح المتفق عليها في دراسة الجدوى، وإدخال أرقام الفروع اليومية، والإعدادات
const sar = (v) => (v == null ? '—' : `${nf.format(v)} ر.س`);
const pct = (v) => (v == null ? '—' : `${nf.format(v)}%`);

export async function render(view, ctx) {
  const days = Number(ctx.query.get('days')) || 30;
  const [r, d, st] = await Promise.all([
    can('plus.reports') ? api(`/plus/report?days=${days}`) : null,
    can('plus.reports') ? api('/plus/days') : { items: [] },
    api('/plus/settings'),
  ]);
  const M = state.meta;
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const lift = r && r.aov.members && r.aov.nonMembers ? Math.round((r.aov.members / r.aov.nonMembers - 1) * 1000) / 10 : null;
  const kpi = (lbl, val, sub, icon, tone = '') => `<section class="card kpi ${tone}"><span class="lbl"><span class="ic-wrap">${ic(icon)}</span>${lbl}</span><span class="val num">${val}</span><span class="sub">${sub}</span></section>`;

  view.innerHTML = `
  <div class="bar"><div class="seg">${[7, 30, 90].map((n) => `<button data-days="${n}" class="${n === days ? 'on' : ''}">${n} يومًا</button>`).join('')}</div><span class="grow"></span>
    <a class="btn ghost sm" href="/plus" target="_blank" rel="noopener">${ic('eye', 16)}صفحة MAC+‎</a></div>
  ${r ? `
  <div class="grid g4">
    ${kpi('العميل المعروف', pct(r.invoices.knownRate), `${nf.format(r.invoices.members)} من ${nf.format(r.invoices.total)} فاتورة · الهدف 25%`, 'users', r.invoices.knownRate != null && r.invoices.knownRate < 10 ? 'warn' : '')}
    ${kpi('متوسط فاتورة العضو', sar(r.aov.members), lift == null ? `غير الأعضاء ${sar(r.aov.nonMembers)}` : `${lift >= 0 ? '+' : ''}${nf.format(lift)}% عن غير الأعضاء (${sar(r.aov.nonMembers)})`, 'chart', lift != null && lift < 0 ? 'bad' : '')}
    ${kpi('متوسط الأقسام', r.depts.avg == null ? '—' : nf.format(r.depts.avg), 'أقسام في فاتورة العضو · الهدف 2.5', 'layers', 'y')}
    ${kpi('تكلفة الحوافز', pct(r.cost.pctOfMemberSales), `${sar(r.cost.total)} من مبيعات الأعضاء · السقف 3.5%`, 'gift', r.cost.pctOfMemberSales > 3.5 ? 'bad' : '')}
  </div>
  <div class="grid g4" style="margin-top:16px">
    ${kpi('الأعضاء', nf.format(r.members.total), `${nf.format(r.members.fresh)} جديد · ${nf.format(r.members.referred)} بالدعوة${r.members.control ? ` · ${nf.format(r.members.control)} ضابطة` : ''}`, 'user')}
    ${kpi('تكرار الشراء', pct(r.repeat.rate), `${nf.format(r.repeat.repeat)} من ${nf.format(r.repeat.buyers)} عضو اشترى مرتين+`, 'refresh')}
    ${kpi('استخدام الرصيد', pct(r.wallet.redemptionRate), `منح ${sar(r.wallet.granted)} · استُخدم ${sar(r.wallet.redeemed)} · قائم ${sar(r.wallet.outstanding)}`, 'shield')}
    ${kpi('الطلبات', nf.format(r.requests.total), `حجز ${r.requests.byKind.reserve} · استلام ${r.requests.byKind.collect} · لقيناه ${r.requests.byKind.find}${r.requests.reserveConversion != null ? ` · تحويل الحجز ${pct(r.requests.reserveConversion)}` : ''}`, 'clock')}
  </div>
  <div class="grid g-main" style="margin-top:16px">
    <section class="card"><div class="card-h"><h3>${ic('chart')} فواتير الأعضاء من إجمالي الفواتير</h3><div class="right legend"><span><i style="background:var(--green)"></i>كل الفواتير</span><span><i style="background:var(--yellow)"></i>الأعضاء</span></div></div>
      <div class="card-b">${r.series.length ? trendChart(r.series.slice(-30).reverse().map((s) => ({ d: s.day, total: s.total, member: s.member })), [{ key: 'total', type: 'bar', cls: 'bar-a' }, { key: 'member', type: 'bar', cls: 'bar-b' }]) : emptyState('تظهر بعد تسجيل أول فاتورة أو أرقام يوم', 'chart')}</div></section>
    <section class="card"><div class="card-h"><h3>${ic('layers')} خطوط العربة</h3></div><div class="card-b">
      ${hbars([{ label: 'بلا خصم', v: r.depts.tiers[0] || 0 }, ...st.tiers.map((t) => ({ label: `${t.pct}% (${t.min}+ أقسام)`, v: r.depts.tiers[t.pct] || 0 }))])}
      <dl class="kv" style="margin-top:14px"><dt>خصومات</dt><dd>${sar(r.cost.discounts)}</dd><dt>رصيد مستخدم</dt><dd>${sar(r.cost.redeemed)}</dd><dt>ضمان السعر</dt><dd>${nf.format(r.claims.price)} حالة · ${sar(r.claims.priceCredits)}</dd><dt>مقاس / هدية</dt><dd>${nf.format(r.claims.size)} / ${nf.format(r.claims.gift)}</dd><dt>مبيعات الدعوات</dt><dd>${sar(r.referral.sales)}</dd>${r.aov.control ? `<dt>متوسط الضابطة</dt><dd>${sar(r.aov.control)}</dd>` : ''}</dl>
    </div></section>
  </div>
  <section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('note')} أرقام الفروع اليومية</h3><span class="muted small">إجمالي فواتير اليوم ومبيعاته من نقطة البيع، لحساب نسبة العميل المعروف والمقارنة بغير الأعضاء</span></div>
    <form class="card-b form-row" data-day style="align-items:end">
      <label class="field"><span>الفرع</span><select name="branchId">${options(M.branches.filter((b) => b.active))}</select></label>
      <label class="field"><span>اليوم</span><input type="date" name="day" value="${today}" max="${today}" dir="ltr"></label>
      <label class="field"><span>عدد الفواتير</span><input type="number" name="invoices" min="0" required dir="ltr"></label>
      <label class="field"><span>المبيعات <small class="muted">اختياري</small></span><input type="number" name="sales" min="0" step="0.01" dir="ltr"></label>
      <button class="btn" type="submit">${ic('check')}حفظ</button>
    </form>
    ${d.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>اليوم</th><th>الفرع</th><th>الفواتير</th><th>المبيعات</th></tr></thead><tbody>${d.items.slice(0, 14).map((x) => `<tr><td>${fmtD(x.day)}</td><td>${esc(x.branch)}</td><td class="num">${nf.format(x.invoices)}</td><td class="num">${sar(x.sales)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>` : ''}
  ${can('plus.manage') ? settingsCard(st) : ''}`;

  view.querySelectorAll('[data-days]').forEach((b) => b.onclick = () => { location.hash = `#/pilot?days=${b.dataset.days}`; });
  const df = view.querySelector('[data-day]');
  df?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(df.querySelector('[type=submit]'), () => api('/plus/days', { method: 'POST', body: formData(df) }), { form: df, ok: 'حُفظت أرقام اليوم' });
    render(view, ctx);
  });
  const sf = view.querySelector('[data-settings]');
  sf?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formData(sf);
    const n = (k) => Number(b[k]);
    const body = {
      tiers: [0, 1, 2].map((i) => ({ min: n(`t${i}min`), pct: n(`t${i}pct`) })).filter((t) => t.min > 0),
      rewardMode: b.rewardMode, walletDays: n('walletDays'), holdHours: n('holdHours'), maxOpen: n('maxOpen'), sizeDays: n('sizeDays'), giftDays: n('giftDays'), controlPct: n('controlPct'),
      referral: { newAmount: n('refNew'), referrerAmount: n('refOld'), minInvoice: n('refMin'), monthlyCap: n('refCap'), welcomeDays: n('refDays') },
      price: { days: n('priceDays'), cap: n('priceCap') },
    };
    await run(sf.querySelector('[type=submit]'), () => api('/plus/settings', { method: 'PUT', body }), { form: sf, ok: 'حُفظت إعدادات MAC+‎' });
    render(view, ctx);
  });
}

function settingsCard(st) {
  const f = (name, label, val, hint = '') => `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${esc(val)}" step="any" dir="ltr">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  const t = [0, 1, 2].map((i) => st.tiers[i] || { min: '', pct: '' });
  return `<section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('cog')} إعدادات MAC+‎</h3></div>
  <form class="card-b form" data-settings>
    <h4>خطوط العربة</h4>
    <div class="form-row">${t.map((x, i) => `${f(`t${i}min`, `المستوى ${i + 1}: أقسام من`, x.min)}${f(`t${i}pct`, 'النسبة %', x.pct)}`).join('')}</div>
    <div class="form-row"><label class="field"><span>طريقة المكافأة</span><select name="rewardMode">${options({ discount: 'خصم فوري على الفاتورة', wallet: 'رصيد في المحفظة للزيارة القادمة' }, st.rewardMode)}</select><span class="hint">الرصيد يشجع العودة، والخصم أوضح للعميل في البداية.</span></label>${f('walletDays', 'صلاحية الرصيد (يوم)', st.walletDays)}</div>
    <h4>ادعُ صديقًا</h4>
    <div class="form-row">${f('refNew', 'هدية الصديق (ر.س)', st.referral.newAmount)}${f('refOld', 'مكافأة الداعي (ر.س)', st.referral.referrerAmount)}${f('refMin', 'أقل فاتورة مؤهلة', st.referral.minInvoice)}${f('refCap', 'سقف المكافآت شهريًا لكل عضو', st.referral.monthlyCap)}${f('refDays', 'صلاحية هدية الصديق (يوم)', st.referral.welcomeDays)}</div>
    <h4>الضمانات والطلبات</h4>
    <div class="form-row">${f('priceDays', 'ضمان السعر (يوم)', st.price.days)}${f('priceCap', 'سقف ضمان السعر للفاتورة', st.price.cap)}${f('sizeDays', 'استبدال المقاس (يوم)', st.sizeDays)}${f('giftDays', 'إيصال الهدية (يوم)', st.giftDays)}${f('holdHours', 'مدة الحجز (ساعة)', st.holdHours)}${f('maxOpen', 'أقصى طلبات مفتوحة للعميل', st.maxOpen)}</div>
    <h4>القياس</h4>
    <div class="form-row">${f('controlPct', 'نسبة المجموعة الضابطة %', st.controlPct, 'أعضاء جدد بلا خصم أقسام لقياس الأثر. اتركها 0 ما دام الخصم معلنًا للجميع في الموقع.')}</div>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ الإعدادات</button></div>
  </form></section>`;
}
