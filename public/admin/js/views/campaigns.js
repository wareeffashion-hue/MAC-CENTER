import { api, esc, ic, can, state, badge, fmtDT, nf, money, emptyState, run, confirmBox, ago } from '../core.js';

export async function render(view, ctx) {
  if (ctx.params[0]) return renderCampaign(view, ctx, Number(ctx.params[0]));
  const M = state.meta;
  const { items } = await api('/campaigns');
  view.innerHTML = `
  <div class="banner info">${ic('send')}<span>تنشأ الحملة من صفحة العرض. يتحقق النظام قبل كل رسالة من صلاحية العرض وموافقة العميل وسقف ${'الرسائل الأسبوعي'} وساعات الإرسال.</span></div>
  <section class="card">${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الحملة</th><th>العرض</th><th>الموعد</th><th>الجمهور</th><th>التقدم</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>
  ${items.map((c) => {
    const sent = (c.counts.sent || 0) + (c.counts.delivered || 0) + (c.counts.read || 0);
    const total = Object.values(c.counts).reduce((a, b) => a + b, 0) || c.audience_count;
    return `<tr class="click" data-id="${c.id}" tabindex="0"><td><b>${esc(c.name)}</b>${c.auto ? ' <span class="badge b">تلقائية</span>' : ''}</td><td>${esc(c.offer_title || '—')}</td><td class="small">${fmtDT(c.scheduled_at)}</td>
      <td class="num">${nf.format(c.audience_count)}</td><td><div class="hbar"><div class="row" style="grid-template-columns:1fr 60px"><div class="track"><div class="fill" style="width:${total ? (sent / total) * 100 : 0}%"></div></div><span class="num small">${nf.format(sent)}/${nf.format(total)}</span></div></div></td>
      <td class="small">${money(c.spent)}${c.budget ? ` / ${money(c.budget)}` : ''}</td><td>${badge(c.status, M.campaignStatus[c.status], { dot: true })}</td></tr>`;
  }).join('')}</tbody></table></div>` : emptyState('لا توجد حملات بعد. افتح عرضًا معتمدًا وأنشئ حملته.', 'send')}</section>`;
  view.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { location.hash = `#/campaigns/${tr.dataset.id}`; }; });
}

async function renderCampaign(view, ctx, id) {
  const M = state.meta;
  const c = await api(`/campaigns/${id}`);
  ctx.setTitle('الحملات', c.name);
  const k = c.counts;
  const steps = [['test', 'رسالة اختبار', !!c.test_sent_at], ['schedule', 'اعتماد الجدولة', ['scheduled', 'sending', 'done', 'paused'].includes(c.status)], ['send', 'الإرسال', ['sending', 'done'].includes(c.status)], ['done', 'اكتملت', c.status === 'done']];
  view.innerHTML = `
  <div class="bar"><a class="btn ghost sm" href="#/campaigns">${ic('arrow')}الحملات</a>${c.offer ? `<a class="btn ghost sm" href="#/offers/${c.offer.id}">${ic('gift', 16)}${esc(c.offer.title)}</a>` : ''}<span class="grow"></span>
    ${can('campaigns') && ['draft', 'scheduled', 'sending', 'paused'].includes(c.status) ? `
      <button class="btn sec" data-a="test">${ic('phone', 16)}إرسال اختبار لي</button>
      ${['draft', 'paused'].includes(c.status) && can('offers.publish') ? `<button class="btn" data-a="schedule" ${c.test_sent_at ? '' : 'disabled title="أرسل اختبارًا أولًا"'}>${ic('check', 16)}${c.status === 'paused' ? 'استئناف' : 'اعتماد الجدولة'}</button>` : ''}
      ${['scheduled', 'sending'].includes(c.status) ? `<button class="btn warn" data-a="pause">${ic('clock', 16)}إيقاف مؤقت</button>` : ''}
      <button class="btn danger" data-a="cancel">${ic('close', 16)}إلغاء</button>` : ''}
  </div>
  <div class="steps-h" style="margin-bottom:16px">${steps.map(([, t, done]) => `<span class="${done ? 'done' : ''}">${done ? ic('check', 12) : ''}${t}</span>`).join('')}<span class="${''}">${badge(c.status, M.campaignStatus[c.status], { dot: true })}</span></div>
  <div class="grid g4" style="margin-bottom:16px">
    ${[['الجمهور', c.audience_count, 'users'], ['أرسلت', (k.sent || 0) + (k.delivered || 0) + (k.read || 0), 'send'], ['سلّمت', (k.delivered || 0) + (k.read || 0), 'check'], ['قرئت', k.read || 0, 'eye']].map(([l, v, i]) => `<div class="card kpi"><span class="lbl"><span class="ic-wrap">${ic(i)}</span>${l}</span><span class="val num">${nf.format(v)}</span></div>`).join('')}
  </div>
  <div class="grid g-main">
    <section class="card"><div class="card-h"><h3>الرسائل</h3><div class="right muted small">${k.failed ? `<span class="badge r">${k.failed} فشلت</span>` : ''} ${k.excluded ? `<span class="badge">${k.excluded} استبعدت</span>` : ''} ${k.queued ? `<span class="badge b">${k.queued} في الطابور</span>` : ''}</div></div>
      ${c.messages.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>المشترك</th><th>الحالة</th><th>السبب</th><th>آخر تحديث</th><th></th></tr></thead><tbody>
      ${c.messages.map((m) => `<tr><td><span class="ltr">${esc(m.wa_id)}</span> ${m.name ? `<span class="muted small">${esc(m.name)}</span>` : ''}</td><td>${badge(m.status, M.messageStatus[m.status])}</td><td class="small muted">${esc(m.reason || '')}${m.attempts > 1 ? ` · ${m.attempts} محاولات` : ''}</td><td class="small">${ago(m.updated_at)}</td>
        <td>${m.status === 'failed' && can('campaigns') ? `<button class="btn sec sm" data-retry="${m.id}">${ic('refresh', 14)}إعادة</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : emptyState(c.status === 'draft' ? 'تنشأ قائمة الرسائل عند حلول موعد الحملة المعتمدة.' : 'لا توجد رسائل', 'send')}
    </section>
    <div class="grid" style="align-content:start">
      <section class="card"><div class="card-h"><h3>التفاصيل</h3></div><div class="card-b"><dl class="kv">
        <dt>القالب</dt><dd><span class="code">${esc(c.template_name)}</span></dd><dt>الموعد</dt><dd>${fmtDT(c.scheduled_at)}</dd>
        <dt>الاختبار</dt><dd>${c.test_sent_at ? fmtDT(c.test_sent_at) : '<span class="badge y">لم يرسل بعد</span>'}</dd>
        <dt>التكلفة</dt><dd>${money(c.spent)} من تقدير ${money(c.estimated_cost)}${c.budget ? ` · السقف ${money(c.budget)}` : ''}</dd>
        ${c.preview ? `<dt>المؤهلون الآن</dt><dd>${nf.format(c.preview.audience)}</dd>` : ''}</dl></div></section>
      ${c.preview ? `<section class="card"><div class="card-h"><h3>${ic('eye')} المعاينة</h3></div><div class="card-b"><div class="phone-sim"><div class="bubble">${esc(c.preview.sample)}</div></div></div></section>` : ''}
    </div>
  </div>`;
  view.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'cancel' && !(await confirmBox('إلغاء الحملة', 'ستستبعد كل الرسائل التي لم ترسل بعد.', { danger: true, okLabel: 'إلغاء الحملة' }))) return;
    if (a === 'schedule' && !(await confirmBox('اعتماد الجدولة', `ستصل الحملة إلى ${nf.format(c.preview?.audience || c.audience_count)} مشترك مؤهل تقريبًا، بتكلفة تقديرية ${money(c.estimated_cost)}. يتحقق النظام من الموافقة والسقف قبل كل رسالة.`, { okLabel: 'اعتماد' }))) return;
    await run(b, () => api(`/campaigns/${id}/${a}`, { method: 'POST' }), { ok: { test: 'أرسلت رسالة الاختبار إلى واتسابك', schedule: 'اعتمدت الجدولة', pause: 'أوقفت مؤقتًا', cancel: 'ألغيت الحملة' }[a] });
    renderCampaign(view, ctx, id);
  });
  view.querySelectorAll('[data-retry]').forEach((b) => b.onclick = async () => {
    await run(b, () => api(`/messages/${b.dataset.retry}/retry`, { method: 'POST' }), { ok: 'أعيدت للطابور' });
    renderCampaign(view, ctx, id);
  });
}
