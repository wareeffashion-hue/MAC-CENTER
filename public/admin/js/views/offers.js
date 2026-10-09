import { api, esc, ic, can, state, badge, fmtD, fmtDT, nf, money, emptyState, options, run, formData, drawer, closeDrawer, checks, imageField, bindUploads, confirmBox, branchName, sectionName } from '../core.js';

export async function render(view, ctx) {
  const M = state.meta;
  const q = Object.fromEntries(ctx.query);
  if (ctx.params[0]) return renderOffer(view, ctx, Number(ctx.params[0]));
  const { items } = await api('/offers');
  const phase = q.phase || 'all';
  const shown = items.filter((o) => phase === 'all' || o.phase === phase);
  const count = (p) => items.filter((o) => o.phase === p).length;

  view.innerHTML = `
  <div class="bar">
    <div class="seg">${[['all', 'الكل'], ['active', 'نشطة'], ['scheduled', 'مجدولة'], ['review', 'بانتظار المراجعة'], ['draft', 'مسودات'], ['ended', 'منتهية'], ['cancelled', 'ملغاة']].map(([k, v]) => `<button data-ph="${k}" class="${k === phase ? 'on' : ''}">${v}${k !== 'all' && count(k) ? `<span class="count">${count(k)}</span>` : ''}</button>`).join('')}</div>
    <span class="grow"></span>${can('offers') ? `<button class="btn" data-new>${ic('plus')}عرض جديد</button>` : ''}
  </div>
  <section class="card">${shown.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>العرض</th><th>الفروع</th><th>المدة</th><th>الحالة</th><th>الإرسال</th></tr></thead><tbody>
    ${shown.map((o) => `<tr class="click" data-id="${o.id}" tabindex="0"><td><b>${esc(o.title)}</b>${o.discount ? ` <span class="badge solid">${esc(o.discount)}</span>` : ''}<div class="muted small">${o.sectionIds.map(sectionName).join('، ') || 'كل الأقسام'}</div></td>
      <td>${o.branchIds.map(branchName).join('، ')}</td><td class="small">${fmtD(o.starts_at)} ← ${fmtD(o.ends_at)}</td>
      <td>${badge(o.phase, M.offerPhase[o.phase], { dot: true })}</td><td>${o.send_enabled ? `<span class="badge g">${ic('send', 12)}تلقائي</span>` : '<span class="muted small">يدوي</span>'}</td></tr>`).join('')}
  </tbody></table></div>` : emptyState('لا توجد عروض هنا بعد. أنشئ أول عرض ليظهر في الموقع ويصل للمشتركين.', 'gift')}</section>`;

  view.querySelectorAll('[data-ph]').forEach((b) => b.onclick = () => { location.hash = `#/offers${b.dataset.ph === 'all' ? '' : '?phase=' + b.dataset.ph}`; });
  view.querySelector('[data-new]')?.addEventListener('click', () => editOffer(null, () => render(view, ctx)));
  view.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { location.hash = `#/offers/${tr.dataset.id}`; }; tr.onkeydown = (e) => e.key === 'Enter' && tr.onclick(); });
  if (q.new && can('offers')) editOffer(null, () => render(view, ctx));
}

function toLocal(iso, fallbackDays = 0) {
  const d = iso ? new Date(iso) : new Date(Date.now() + fallbackDays * 86400000);
  return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 16);
}

export function editOffer(o, after) {
  const M = state.meta;
  const d = drawer(o ? 'تعديل العرض' : 'عرض جديد', `<form class="form">
    ${o?.status === 'approved' ? `<div class="banner" style="margin:0">${ic('alert')}<span>تعديل عرض معتمد يعيده للمراجعة قبل النشر.</span></div>` : ''}
    <label class="field"><span>اسم العرض</span><input name="title" required value="${esc(o?.title || '')}" placeholder="مثال: عروض العودة للمدارس"></label>
    <label class="field"><span>وصف مختصر</span><input name="summary" value="${esc(o?.summary || '')}" maxlength="160"><span class="hint">يظهر في البطاقة ورسالة واتساب.</span></label>
    <label class="field"><span>التفاصيل</span><textarea name="description">${esc(o?.description || '')}</textarea></label>
    <div class="form-row">
      <label class="field"><span>البداية (بتوقيت الرياض)</span><input type="datetime-local" name="starts_at" required value="${toLocal(o?.starts_at, 0)}"></label>
      <label class="field"><span>النهاية</span><input type="datetime-local" name="ends_at" required value="${toLocal(o?.ends_at, 14)}"></label>
      <label class="field"><span>الخصم أو السعر <small class="muted">(بعد اعتماده)</small></span><input name="discount" value="${esc(o?.discount || '')}" placeholder="مثال: حتى 30%"></label>
    </div>
    <div class="field"><span>الفروع المشمولة</span>${checks('branchIds', M.allBranches, o?.branchIds || [])}<span class="field" style="display:contents"><input type="hidden" name="branchIds_err"></span></div>
    <div class="field"><span>الأقسام <small class="muted">(دون اختيار = كل الأقسام)</small></span>${checks('sectionIds', M.sections.filter((s) => s.active), o?.sectionIds || [])}</div>
    <label class="field"><span>الشروط</span><textarea name="terms" rows="3">${esc(o?.terms || '')}</textarea></label>
    ${imageField('image', o?.image, 'صورة العرض')}
    <section class="card"><div class="card-b form">
      <label class="switch"><input type="checkbox" name="send_enabled" ${o?.send_enabled ? 'checked' : ''}><i></i>إرسال تلقائي للمشتركين المؤهلين عند بدء العرض</label>
      <label class="field"><span>اسم قالب واتساب المعتمد</span><input name="template_name" dir="ltr" value="${esc(o?.template_name || '')}" placeholder="mac_offer_ar"><span class="hint">القوالب التسويقية تعتمد من Meta قبل الإرسال.</span></label>
    </div></section>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button></div>
  </form>`, { wide: true });
  bindUploads(d);
  const form = d.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    body.starts_at = body.starts_at.replace('T', ' ');
    body.ends_at = body.ends_at.replace('T', ' ');
    const r = await run(form.querySelector('[type=submit]'), () => api(o ? `/offers/${o.id}` : '/offers', { method: o ? 'PUT' : 'POST', body }), { ok: 'حفظ العرض', form });
    closeDrawer();
    if (!o) location.hash = `#/offers/${r.id}`; else after?.();
  });
}

async function renderOffer(view, ctx, id) {
  const M = state.meta;
  const o = await api(`/offers/${id}`);
  ctx.setTitle('العروض', o.title);
  const steps = ['draft', 'review', 'approved'];
  const si = o.status === 'cancelled' ? -1 : steps.indexOf(o.status);
  const p = o.preview;
  view.innerHTML = `
  <div class="bar"><a class="btn ghost sm" href="#/offers">${ic('arrow')}العروض</a><span class="grow"></span>
    ${o.phase === 'active' || o.phase === 'ended' || o.phase === 'scheduled' ? `<a class="btn sec sm" href="/offers/${esc(o.slug)}" target="_blank" rel="noopener">${ic('eye', 16)}عرض في الموقع</a>` : ''}
    ${can('offers') && o.status !== 'cancelled' ? `<button class="btn sec sm" data-edit>${ic('edit', 16)}تعديل</button>` : ''}</div>
  <div class="grid g-main">
    <div class="grid" style="align-content:start">
      <section class="card"><div class="card-b grid" style="gap:12px">
        <div class="bar" style="margin:0"><h2 style="font-size:22px">${esc(o.title)}</h2>${badge(o.phase, M.offerPhase[o.phase], { dot: true })}</div>
        <div class="steps-h">${steps.map((s, i) => `<span class="${i < si ? 'done' : i === si ? 'on' : ''}">${i < si ? ic('check', 12) : ''}${esc(M.offerStatus[s])}</span>`).join('')}${o.status === 'cancelled' ? '<span class="on" style="background:var(--red)">ملغى</span>' : ''}</div>
        ${o.summary ? `<p style="margin:0">${esc(o.summary)}</p>` : ''}
        <dl class="kv"><dt>المدة</dt><dd>${fmtDT(o.starts_at)} ← ${fmtDT(o.ends_at)}</dd><dt>الفروع</dt><dd>${o.branchIds.map(branchName).join('، ')}</dd>
          <dt>الأقسام</dt><dd>${o.sectionIds.map(sectionName).join('، ') || 'كل الأقسام'}</dd>${o.discount ? `<dt>الخصم</dt><dd>${esc(o.discount)}</dd>` : ''}
          <dt>الإرسال</dt><dd>${o.send_enabled ? `تلقائي عند البداية · القالب <span class="code">${esc(o.template_name || '—')}</span>` : 'يدوي عبر الحملات'}</dd></dl>
        ${o.terms ? `<div><b>الشروط</b><p class="pre muted">${esc(o.terms)}</p></div>` : ''}
        <div class="form-actions">
          ${o.status === 'draft' && can('offers') ? `<button class="btn sec" data-tr="submit">${ic('send', 16)}إرسال للمراجعة</button>` : ''}
          ${['draft', 'review'].includes(o.status) && can('offers.publish') ? `<button class="btn" data-tr="approve">${ic('check', 16)}اعتماد ونشر</button>` : ''}
          ${o.status === 'review' && can('offers.publish') ? `<button class="btn sec" data-tr="reject">إعادة للمسودة</button>` : ''}
          ${o.status !== 'cancelled' && can('offers.publish') ? `<button class="btn danger" data-tr="cancel">${ic('close', 16)}إلغاء العرض</button>` : ''}
        </div>
      </div></section>
      <section class="card"><div class="card-h"><h3>${ic('send')} حملات العرض</h3>${can('campaigns') && o.status !== 'cancelled' ? '<div class="right"><button class="btn sm" data-camp>' + ic('plus', 16) + 'حملة جديدة</button></div>' : ''}</div>
        <div class="list">${o.campaigns.length ? o.campaigns.map((c) => `<a class="li" href="#/campaigns/${c.id}"><span class="grow"><span class="t">${esc(c.name)}</span><span class="s">${nf.format(c.audience_count)} مشترك · ${fmtD(c.created_at)}</span></span>${badge(c.status, M.campaignStatus[c.status])}</a>`).join('') : emptyState('لا توجد حملات لهذا العرض', 'send')}</div></section>
    </div>
    <div class="grid" style="align-content:start">
      <section class="card"><div class="card-h"><h3>${ic('users')} الجمهور المؤهل الآن</h3></div><div class="card-b grid" style="gap:10px">
        <div class="kpi" style="padding:0"><span class="val num">${nf.format(p.audience)}</span><span class="sub">مشترك نشط يطابق الفروع والأقسام</span></div>
        <dl class="kv"><dt>تكلفة Meta</dt><dd>${money(p.metaCost, p.currency)}</dd><dt>رسوم المزود</dt><dd>${money(p.providerCost, p.currency)}</dd></dl>
        <p class="muted small" style="margin:0">تقدير حسب سعر الرسالة التسويقية في الإعدادات. القراءة تعرض فقط عند ورود حالتها من المنصة.</p>
      </div></section>
      <section class="card"><div class="card-h"><h3>${ic('eye')} معاينة الرسالة</h3></div><div class="card-b"><div class="phone-sim"><div class="bubble">${esc(p.sample)}</div></div></div></section>
    </div>
  </div>`;
  view.querySelector('[data-edit]')?.addEventListener('click', () => editOffer(o, () => renderOffer(view, ctx, id)));
  view.querySelectorAll('[data-tr]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.tr;
    if (a === 'cancel' && !(await confirmBox('إلغاء العرض', 'سيختفي العرض من الموقع وتتوقف كل الرسائل المنتظرة لحملاته فورًا.', { danger: true, okLabel: 'إلغاء العرض' }))) return;
    await run(b, () => api(`/offers/${id}/${a}`, { method: 'POST' }), { ok: { submit: 'أرسل للمراجعة', approve: 'اعتمد العرض', reject: 'أعيد للمسودة', cancel: 'ألغي العرض' }[a] });
    renderOffer(view, ctx, id);
  });
  view.querySelector('[data-camp]')?.addEventListener('click', () => promptTemplate(id, o.template_name));
}

function promptTemplate(offerId, template = '') {
  const d = drawer('حملة جديدة', `<form class="form"><label class="field"><span>اسم قالب واتساب المعتمد</span><input name="template_name" dir="ltr" required placeholder="mac_offer_ar" value="${esc(template || '')}"></label>
    <label class="field"><span>موعد الإرسال (بتوقيت الرياض)</span><input type="datetime-local" name="scheduled_at"><span class="hint">دون موعد = عند بداية العرض.</span></label>
    <label class="field"><span>اسم الحملة</span><input name="name"></label><label class="field"><span>سقف الميزانية (اختياري)</span><input name="budget" type="number" step="0.01" min="0" dir="ltr"></label>
    <div class="form-actions"><button class="btn">${ic('check')}إنشاء</button></div></form>`);
  const form = d.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = formData(form);
    body.scheduled_at = body.scheduled_at ? body.scheduled_at.replace('T', ' ') : '';
    const c = await run(form.querySelector('button'), () => api('/campaigns', { method: 'POST', body: { offerId, ...body } }), { ok: 'أنشئت الحملة', form });
    closeDrawer(); location.hash = `#/campaigns/${c.id}`;
  };
}
