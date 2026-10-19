import { api, esc, ic, state, nf, emptyState, options, run, formData, drawer, closeDrawer, imageField, bindUploads, confirmBox, sectionName } from '../core.js';

// إطلالات «عندك مناسبة؟»: قطع من أقسام مختلفة بسعر الإطلالة كاملة
let PM = null;
const sar = (v) => `${nf.format(Number(v) || 0)} ر.س`;

export async function render(view, ctx) {
  PM ||= await api('/plus/meta');
  const { items } = await api('/plus/looks');
  view.innerHTML = `
  <div class="bar"><p class="muted" style="margin:0">تظهر في صفحة <a href="/occasion" target="_blank" rel="noopener">عندك مناسبة؟</a> ويحجزها العميل للتجربة في الفرع.</p><span class="grow"></span><button class="btn" data-new>${ic('plus')}إطلالة جديدة</button></div>
  ${items.length ? `<div class="looks-a">${items.map((l) => `<article class="card look-a ${l.active ? '' : 'off'}" data-id="${l.id}" tabindex="0">
    <div class="look-img">${l.image ? `<img src="${esc(l.image)}" alt="">` : ic('gift', 34)}</div>
    <div class="card-b"><div class="muted small">${esc(PM.occasions[l.occasion])} · ${esc(PM.audiences[l.audience])}${l.active ? '' : ' · مخفية'}</div><h3>${esc(l.title)}</h3>
    <p class="muted small">${l.items.map((i) => esc(i.name)).join('، ')}</p><b>${sar(l.price)}</b> <span class="muted small">· ${new Set(l.items.map((i) => i.sectionId).filter(Boolean)).size} أقسام</span></div></article>`).join('')}</div>`
    : `<section class="card">${emptyState('أضف أول إطلالة: مثلًا «إطلالة عيد للبنات» من فستان وحذاء وشنطة من ثلاثة أقسام.', 'gift')}</section>`}`;
  view.querySelector('[data-new]').onclick = () => edit(null, () => render(view, ctx));
  view.querySelectorAll('[data-id]').forEach((c) => { c.onclick = () => edit(items.find((l) => l.id === Number(c.dataset.id)), () => render(view, ctx)); c.onkeydown = (e) => e.key === 'Enter' && c.onclick(); });
}

function edit(l, after) {
  const M = state.meta;
  const secs = M.sections.filter((s) => s.active);
  const row = (it = {}) => `<div class="form-row look-row"><label class="field"><span>القطعة</span><input data-i="name" value="${esc(it.name || '')}" maxlength="60"></label>
    <label class="field"><span>السعر</span><input data-i="price" type="number" min="0" step="0.01" dir="ltr" value="${esc(it.price ?? '')}"></label>
    <label class="field"><span>القسم</span><select data-i="sectionId">${options(secs, it.sectionId, { blank: '—' })}</select></label>
    <button type="button" class="btn ghost sm icon" data-rm aria-label="حذف القطعة">${ic('trash', 16)}</button></div>`;
  const d = drawer(l ? 'تعديل الإطلالة' : 'إطلالة جديدة', `<form class="form">
    <label class="field"><span>العنوان</span><input name="title" required maxlength="80" value="${esc(l?.title || '')}" placeholder="إطلالة عيد للبنات"></label>
    <div class="form-row"><label class="field"><span>المناسبة</span><select name="occasion">${options(PM.occasions, l?.occasion)}</select></label>
      <label class="field"><span>لمن</span><select name="audience">${options(PM.audiences, l?.audience)}</select></label>
      <label class="field"><span>الترتيب</span><input name="sort" type="number" value="${esc(l?.sort ?? 0)}" dir="ltr"></label></div>
    <div class="field" data-f="items"><span>القطع</span><div data-rows>${(l?.items?.length ? l.items : [{}, {}]).map(row).join('')}</div>
      <button type="button" class="btn sec sm" data-add style="justify-self:start">${ic('plus', 14)}قطعة</button></div>
    <p class="muted small" data-total></p>
    ${imageField('image', l?.image, 'صورة الإطلالة')}
    ${l?.image ? '<label class="switch"><input type="checkbox" name="removeImage"><i></i>حذف الصورة الحالية</label>' : ''}
    <label class="switch"><input type="checkbox" name="active" ${l?.active === false ? '' : 'checked'}><i></i>ظاهرة في الموقع</label>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ</button>${l ? `<button type="button" class="btn danger" data-del>${ic('trash', 16)}حذف</button>` : ''}</div></form>`, { wide: true });
  bindUploads(d);
  const f = d.querySelector('form');
  const rows = f.querySelector('[data-rows]');
  const items = () => [...rows.querySelectorAll('.look-row')].map((r) => ({ name: r.querySelector('[data-i=name]').value.trim(), price: Number(r.querySelector('[data-i=price]').value) || 0, sectionId: Number(r.querySelector('[data-i=sectionId]').value) || null })).filter((i) => i.name);
  const total = () => { const it = items(); f.querySelector('[data-total]').textContent = it.length ? `المجموع ${sar(it.reduce((s, i) => s + i.price, 0))} · من ${new Set(it.map((i) => i.sectionId).filter(Boolean)).size} أقسام${it.some((i) => i.sectionId) ? ` (${[...new Set(it.map((i) => i.sectionId).filter(Boolean))].map(sectionName).join('، ')})` : ''}` : ''; };
  rows.addEventListener('input', total); rows.addEventListener('change', total); total();
  rows.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { e.target.closest('.look-row').remove(); total(); } });
  f.querySelector('[data-add]').onclick = () => { rows.insertAdjacentHTML('beforeend', row()); rows.lastElementChild.querySelector('input').focus(); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formData(f);
    delete b.items;
    b.items = items();
    if (!b.image) delete b.image;
    await run(f.querySelector('[type=submit]'), () => api(l ? `/plus/looks/${l.id}` : '/plus/looks', { method: l ? 'PUT' : 'POST', body: b }), { form: f, ok: 'حُفظت الإطلالة' });
    closeDrawer(); after();
  });
  f.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmBox('حذف الإطلالة', 'ستختفي من الموقع نهائيًا.', { danger: true, okLabel: 'حذف' }))) return;
    await run(null, () => api(`/plus/looks/${l.id}`, { method: 'DELETE' }), { ok: 'حُذفت' });
    closeDrawer(); after();
  });
}
