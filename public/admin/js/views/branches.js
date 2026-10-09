import { api, esc, ic, can, state, emptyState, run, drawer, closeDrawer, formData, checks, imageField, bindUploads, refreshMeta } from '../core.js';

const DAYS = [['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الاثنين'], ['tue', 'الثلاثاء'], ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة']];

export async function render(view, ctx) {
  const { items } = await api('/branches');
  view.innerHTML = `
  <div class="bar"><p class="muted" style="margin:0">ما تعدله هنا يظهر في الموقع مباشرة: الدوام وحالة «مفتوح الآن» والأقسام والخدمات.</p><span class="grow"></span>${can('branches') ? `<button class="btn" data-new>${ic('plus')}فرع جديد</button>` : ''}</div>
  <div class="grid g3">${items.map((b) => `<section class="card"><div class="card-b grid" style="gap:10px">
    <div class="bar" style="margin:0"><b style="font-size:17px">${esc(b.name)}</b>${b.active ? '' : '<span class="badge r">مخفي</span>'}</div>
    <span class="muted small">${esc(b.brand)} · <span class="ltr">${esc(b.phone)}</span></span>
    <div>${b.status.known ? `<span class="badge ${b.status.open ? 'g' : 'r'}"><i class="dot"></i>${esc(b.status.label)}</span>` : '<span class="badge y">الدوام غير معتمد: يظهر «تواصل لمعرفة الدوام»</span>'}</div>
    <div class="small muted">${b.sectionIds.length} أقسام · ${b.services.length} خدمات${b.address ? '' : ' · <span style="color:var(--warn)">العنوان غير مضاف</span>'}</div>
    <div class="bar" style="margin:0"><button class="btn sec sm" data-edit="${b.id}">${ic('edit', 14)}تعديل</button><a class="btn ghost sm" href="/branches/${esc(b.slug)}" target="_blank" rel="noopener">${ic('eye', 14)}الصفحة</a></div>
  </div></section>`).join('') || emptyState('لا توجد فروع')}</div>`;
  view.querySelector('[data-new]')?.addEventListener('click', () => edit(null, () => render(view, ctx)));
  view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(items.find((x) => x.id === Number(b.dataset.edit)), () => render(view, ctx)));
}

function periodHtml(p = ['09:00', '23:00']) {
  return `<span class="per"><input type="time" value="${esc(p[0])}" aria-label="من"> – <input type="time" value="${esc(p[1])}" aria-label="إلى"><button type="button" class="btn ghost sm icon" data-rm aria-label="حذف الفترة">${ic('close', 14)}</button></span>`;
}

function edit(b, after) {
  const M = state.meta;
  const core = can('branches');
  const hours = b?.hours;
  const d = drawer(b ? esc(b.name) : 'فرع جديد', `<form class="form">
    ${core ? `<div class="form-row">
      <label class="field"><span>اسم الفرع</span><input name="name" required value="${esc(b?.name || '')}"></label>
      <label class="field"><span>العلامة</span><input name="brand" value="${esc(b?.brand || 'ماك سنتر')}"></label>
      <label class="field"><span>الاسم المختصر</span><input name="short_name" value="${esc(b?.short_name || '')}"></label>
    </div>
    <div class="form-row">
      <label class="field"><span>رقم الخدمة (واتساب والاتصال)</span><input name="phone" required dir="ltr" value="${esc(b?.phone || '')}" placeholder="05xxxxxxxx"></label>
      <label class="field"><span>الترتيب</span><input name="sort" type="number" value="${esc(b?.sort ?? 0)}"></label>
      <label class="field"><span>معرف الموقع في Google</span><input name="google_location_id" dir="ltr" value="${esc(b?.google_location_id || '')}"></label>
    </div>` : `<div class="banner info" style="margin:0">${ic('shield')}<span>يمكنك تعديل الدوام والمحتوى. الاسم والرقم يعدلهما مدير النظام.</span></div>`}
    <label class="field"><span>وصف قصير</span><input name="tagline" value="${esc(b?.tagline || '')}"></label>
    <label class="field"><span>العنوان الدقيق</span><input name="address" value="${esc(b?.address || '')}"></label>
    <div class="form-row">
      <label class="field"><span>رابط الاتجاهات في خرائط Google</span><input name="maps_url" dir="ltr" value="${esc(b?.maps_url || '')}"></label>
      <label class="field"><span>رابط كتابة تقييم Google</span><input name="google_review_url" dir="ltr" value="${esc(b?.google_review_url || '')}" placeholder="https://g.page/r/…/review"></label>
    </div>
    ${core ? `<div class="form-row"><label class="field"><span>خط العرض</span><input name="lat" dir="ltr" value="${esc(b?.lat ?? '')}"></label><label class="field"><span>خط الطول</span><input name="lng" dir="ltr" value="${esc(b?.lng ?? '')}"></label></div>` : ''}
    <section class="card"><div class="card-h"><h3>${ic('clock')} الدوام الأسبوعي</h3><div class="right"><label class="switch"><input type="checkbox" data-has-hours ${hours ? 'checked' : ''}><i></i>دوام معتمد</label></div></div>
      <div class="card-b"><p class="muted small">يمكن إضافة أكثر من فترة في اليوم. الفترة التي تنتهي بعد منتصف الليل (مثل 16:00 – 01:00) تحسب لليوم نفسه.</p>
      <div class="hours-ed" data-hours ${hours ? '' : 'hidden'}>${DAYS.map(([k, n]) => `<div class="day" data-day="${k}"><b>${n}</b><div class="periods">${(hours?.[k] || (hours ? [] : [['09:00', '13:00'], ['16:00', '23:30']])).map(periodHtml).join('')}</div><button type="button" class="btn ghost sm" data-add>${ic('plus', 14)}فترة</button></div>`).join('')}</div>
      </div></section>
    <section class="card"><div class="card-h"><h3>استثناءات (رمضان، الأعياد، الإغلاق)</h3><div class="right"><button type="button" class="btn ghost sm" data-add-ex>${ic('plus', 14)}استثناء</button></div></div>
      <div class="card-b grid" style="gap:8px" data-ex>${(b?.exceptions || []).map(exHtml).join('')}</div></section>
    <div class="field"><span>الأقسام المتوفرة</span>${checks('sectionIds', M.sections, b?.sectionIds || M.sections.map((s) => s.id))}</div>
    <div class="field"><span>الخدمات</span>${checks('services', Object.entries(M.services).map(([id, name]) => ({ id, name })), [])}</div>
    ${imageField('image', b?.image, 'صورة الفرع')}
    ${core ? `<label class="switch"><input type="checkbox" name="active" ${b ? (b.active ? 'checked' : '') : 'checked'}><i></i>ظاهر في الموقع</label>` : ''}
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button></div>
  </form>`, { wide: true });
  bindUploads(d);
  // الخدمات نصية فنعلم المحدد يدويًا
  (b?.services || []).forEach((s) => { const c = d.querySelector(`input[name="services"][value="${s}"]`); if (c) c.checked = true; });
  const form = d.querySelector('form');
  d.querySelector('[data-has-hours]').onchange = (e) => { d.querySelector('[data-hours]').hidden = !e.target.checked; };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) e.target.closest('.day').querySelector('.periods').insertAdjacentHTML('beforeend', periodHtml());
    if (e.target.closest('[data-rm]')) e.target.closest('.per').remove();
    if (e.target.closest('[data-add-ex]')) d.querySelector('[data-ex]').insertAdjacentHTML('beforeend', exHtml({}));
    if (e.target.closest('[data-rm-ex]')) e.target.closest('.ex').remove();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    body.hours = d.querySelector('[data-has-hours]').checked
      ? Object.fromEntries(DAYS.map(([k]) => [k, [...d.querySelectorAll(`[data-day="${k}"] .per`)].map((p) => [...p.querySelectorAll('input')].map((i) => i.value)).filter(([a, z]) => a && z)]))
      : null;
    body.exceptions = [...d.querySelectorAll('.ex')].map((x) => {
      const v = (n) => x.querySelector(`[data-k="${n}"]`).value;
      const closed = x.querySelector('[data-k="closed"]').checked;
      return { label: v('label'), from: v('from'), to: v('to') || v('from'), ...(closed ? { periods: [] } : { periods: [[v('open'), v('close')]].filter(([a, z]) => a && z) }) };
    }).filter((x) => x.from);
    await run(form.querySelector('[type=submit]'), () => api(b ? `/branches/${b.id}` : '/branches', { method: b ? 'PUT' : 'POST', body }), { ok: 'حفظ الفرع', form });
    await refreshMeta();
    closeDrawer(); after();
  });
}

function exHtml(e) {
  const closed = Array.isArray(e.periods) && e.periods.length === 0;
  const p = e.periods?.[0] || ['', ''];
  return `<div class="ex day" style="grid-template-columns:1fr;background:var(--soft)"><div class="form-row">
    <label class="field"><span>المناسبة</span><input data-k="label" value="${esc(e.label || '')}" placeholder="رمضان، عيد الفطر…"></label>
    <label class="field"><span>من</span><input type="date" data-k="from" value="${esc(e.from || '')}"></label>
    <label class="field"><span>إلى</span><input type="date" data-k="to" value="${esc(e.to || '')}"></label></div>
    <div class="bar" style="margin:0"><label class="check"><input type="checkbox" data-k="closed" ${closed ? 'checked' : ''}>مغلق</label>
    <span class="small muted">أو دوام خاص:</span><input type="time" data-k="open" value="${esc(p[0])}" style="width:120px"> – <input type="time" data-k="close" value="${esc(p[1])}" style="width:120px">
    <span class="grow"></span><button type="button" class="btn ghost sm" data-rm-ex>${ic('trash', 14)}حذف</button></div></div>`;
}
