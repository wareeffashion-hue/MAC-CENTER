import { api, esc, ic, can, state, emptyState, run, drawer, closeDrawer, formData, imageField, bindUploads, confirmBox, refreshMeta } from '../core.js';

const ARTS = { fashion: 'أزياء', dress: 'فساتين', bags: 'حقائب وأحذية', home: 'مفروشات', toys: 'ألعاب', stationery: 'قرطاسية' };

export async function render(view, ctx) {
  const tab = ctx.query.get('tab') || 'sections';
  view.innerHTML = `<div class="bar"><div class="seg">${[['sections', 'الأقسام'], ['faqs', 'الأسئلة المتكررة'], ['site', 'نصوص الموقع']].filter(([k]) => k !== 'site' || can('settings')).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div></div><div id="pane"></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { location.hash = `#/content?tab=${b.dataset.tab}`; });
  const pane = view.querySelector('#pane');
  if (tab === 'faqs') return faqs(pane);
  if (tab === 'site') return site(pane);
  return sections(pane);
}

async function sections(pane) {
  const { items } = await api('/sections');
  pane.innerHTML = `<div class="bar"><p class="muted" style="margin:0">الأقسام المعتمدة تظهر في الموقع وخيارات الاشتراك. القسم المخفي لا يظهر في أي مكان.</p><span class="grow"></span><button class="btn" data-new>${ic('plus')}قسم</button></div>
  <section class="card"><div class="list">${items.map((s) => `<div class="li"><div class="img-up"><div class="pv" style="width:56px;height:56px">${s.image ? `<img src="${esc(s.image)}" alt="">` : ic('layers', 22)}</div></div>
    <span class="grow"><span class="t">${esc(s.name)} ${s.active ? '' : '<span class="badge r">مخفي</span>'}</span><span class="s">${esc(s.tagline)}</span></span>
    <span class="muted small">${s.branchIds.length} فروع</span><button class="btn sec sm" data-edit="${s.id}">${ic('edit', 14)}تعديل</button></div>`).join('')}</div></section>`;
  const after = () => sections(pane);
  pane.querySelector('[data-new]').onclick = () => edit(null, after);
  pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(items.find((x) => x.id === Number(b.dataset.edit)), after));
}

function edit(s, after) {
  const d = drawer(s ? esc(s.name) : 'قسم جديد', `<form class="form">
    <label class="field"><span>الاسم</span><input name="name" required value="${esc(s?.name || '')}"></label>
    <label class="field"><span>العنوان التسويقي</span><input name="tagline" value="${esc(s?.tagline || '')}"></label>
    <label class="field"><span>الوصف</span><textarea name="description">${esc(s?.description || '')}</textarea></label>
    <div class="form-row"><label class="field"><span>الرسم البديل حتى اعتماد الصور</span><select name="art">${Object.entries(ARTS).map(([k, v]) => `<option value="${k}" ${s?.art === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>الترتيب</span><input type="number" name="sort" value="${esc(s?.sort ?? 99)}"></label></div>
    ${imageField('image', s?.image, 'الصورة الفعلية للقسم')}
    ${s?.image ? '<label class="check"><input type="checkbox" name="removeImage">إزالة الصورة والعودة للرسم</label>' : ''}
    <label class="switch"><input type="checkbox" name="active" ${s ? (s.active ? 'checked' : '') : 'checked'}><i></i>ظاهر</label>
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></form>`);
  bindUploads(d);
  const form = d.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    await run(form.querySelector('button'), () => api(s ? `/sections/${s.id}` : '/sections', { method: s ? 'PUT' : 'POST', body: formData(form) }), { ok: 'حفظ القسم', form });
    await refreshMeta(); closeDrawer(); after();
  };
}

async function faqs(pane) {
  const { items } = await api('/faqs');
  pane.innerHTML = `<div class="bar"><span class="grow"></span><button class="btn" data-new>${ic('plus')}سؤال</button></div>
  <section class="card"><div class="list">${items.map((f) => `<div class="li"><span class="grow"><span class="t">${esc(f.question)} ${f.active ? '' : '<span class="badge r">مخفي</span>'}</span><span class="s">${esc(f.answer)}</span></span>
    <button class="btn sec sm" data-edit="${f.id}">${ic('edit', 14)}</button><button class="btn danger sm" data-del="${f.id}">${ic('trash', 14)}</button></div>`).join('') || emptyState('لا توجد أسئلة')}</div></section>`;
  const after = () => faqs(pane);
  const ed = (f) => {
    const d = drawer(f ? 'تعديل السؤال' : 'سؤال جديد', `<form class="form"><label class="field"><span>السؤال</span><input name="question" required value="${esc(f?.question || '')}"></label>
      <label class="field"><span>الإجابة</span><textarea name="answer" required>${esc(f?.answer || '')}</textarea></label><label class="field"><span>الترتيب</span><input type="number" name="sort" value="${esc(f?.sort ?? 99)}"></label>
      <label class="switch"><input type="checkbox" name="active" ${f ? (f.active ? 'checked' : '') : 'checked'}><i></i>ظاهر</label><div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></form>`);
    const form = d.querySelector('form');
    form.onsubmit = async (e) => { e.preventDefault(); await run(form.querySelector('button'), () => api(f ? `/faqs/${f.id}` : '/faqs', { method: f ? 'PUT' : 'POST', body: formData(form) }), { ok: 'حفظ' }); closeDrawer(); after(); };
  };
  pane.querySelector('[data-new]').onclick = () => ed(null);
  pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => ed(items.find((x) => x.id === Number(b.dataset.edit))));
  pane.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (await confirmBox('حذف السؤال', 'لا يمكن التراجع.', { danger: true, okLabel: 'حذف' })) { await run(b, () => api(`/faqs/${b.dataset.del}`, { method: 'DELETE' }), { ok: 'حذف' }); after(); } });
}

async function site(pane) {
  const { site: s } = await api('/settings');
  const so = s.socials || {};
  pane.innerHTML = `<form class="card"><div class="card-b form">
    <label class="field"><span>العنوان الرئيسي</span><input name="heroTitle" value="${esc(s.heroTitle || '')}"></label>
    <label class="field"><span>النص الرئيسي</span><textarea name="heroText">${esc(s.heroText || '')}</textarea></label>
    <label class="field"><span>الوصف التعريفي</span><textarea name="about" rows="4">${esc(s.about || '')}</textarea></label>
    <label class="field"><span>الوصف التعريفي (فقرة ثانية)</span><textarea name="about2" rows="4">${esc(s.about2 || '')}</textarea></label>
    <div class="form-row">${[['snapchat', 'سناب شات'], ['instagram', 'إنستغرام'], ['tiktok', 'تيك توك'], ['x', 'إكس']].map(([k, v]) => `<label class="field"><span>${v}</span><input name="s_${k}" dir="ltr" value="${esc(so[k] || '')}" placeholder="https://"></label>`).join('')}</div>
    <div class="form-actions"><button class="btn">${ic('check')}حفظ النصوص</button><a class="btn sec" href="/" target="_blank" rel="noopener">${ic('eye', 16)}معاينة</a></div>
  </div></form>`;
  const form = pane.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = formData(form);
    const socials = {};
    for (const k of ['snapchat', 'instagram', 'tiktok', 'x']) { socials[k] = b[`s_${k}`]; delete b[`s_${k}`]; }
    await run(form.querySelector('button'), () => api('/settings/site', { method: 'PUT', body: { ...b, socials } }), { ok: 'حفظت النصوص' });
  };
}
