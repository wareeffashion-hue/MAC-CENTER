import { api, esc, ic, can, state, nf, emptyState, options, run, drawer, closeDrawer, formData } from '../core.js';

export async function render(view, ctx) {
  const M = state.meta;
  const { items } = await api('/qr');
  view.innerHTML = `
  <div class="bar"><p class="muted" style="margin:0">الرابط المطبوع ثابت دائمًا؛ يمكنك تغيير وجهته أو تعطيله دون إعادة الطباعة.</p><span class="grow"></span>${can('qr') ? `<button class="btn" data-new>${ic('plus')}رمز جديد</button>` : ''}</div>
  ${items.length ? `<div class="grid g2">${items.map((q) => `<section class="card"><div class="card-b qr-card">
    <a class="qr" href="/api/qr/${q.id}/svg" target="_blank" rel="noopener" aria-label="عرض الرمز"><img src="/api/qr/${q.id}/svg" alt="رمز QR ${esc(q.label)}" loading="lazy"></a>
    <div class="grid" style="gap:6px">
      <div class="bar" style="margin:0"><b>${esc(q.label)}</b>${q.active ? '<span class="badge g">فعال</span>' : '<span class="badge r">معطل</span>'}<span class="badge">${esc(M.qrPurpose[q.purpose])}</span></div>
      <span class="muted small">${esc(q.branch_name || 'كل الفروع')}${q.location ? ' · ' + esc(q.location) : ''}</span>
      <span class="code">${esc(q.url)}</span>
      <div class="bar small" style="margin:0"><span>${nf.format(q.scans)} مسح</span>·<span>${nf.format(q.confirmed)} اشتراك مؤكد</span>·<span>${nf.format(q.tickets)} ملاحظة</span></div>
      <div class="bar" style="margin:0">
        <a class="btn sec sm" href="/api/qr/${q.id}/svg?download=1">${ic('download', 14)}SVG</a>
        <button class="btn sec sm" data-png="${q.id}" data-code="${esc(q.code)}">${ic('download', 14)}PNG</button>
        ${can('qr') ? `<button class="btn ghost sm" data-edit="${q.id}">${ic('edit', 14)}تعديل</button>` : ''}
      </div>
    </div></div></section>`).join('')}</div>` : `<section class="card">${emptyState('أنشئ رمزًا لكل موقع داخل الفرع: عند المدخل، الكاشير، غرف القياس…', 'qr')}</section>`}`;

  view.querySelector('[data-new]')?.addEventListener('click', () => edit(null, () => render(view, ctx)));
  view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(items.find((x) => x.id === Number(b.dataset.edit)), () => render(view, ctx)));
  view.querySelectorAll('[data-png]').forEach((b) => b.onclick = () => downloadPng(b.dataset.png, b.dataset.code));
}

// تحويل SVG إلى PNG عالي الدقة للطباعة داخل المتصفح
async function downloadPng(id, code) {
  const svg = await (await fetch(`/api/qr/${id}/svg`)).text();
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 1600;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, 1600, 1600);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `qr-${code}.png`;
  a.click();
}

function edit(q, after) {
  const M = state.meta;
  const d = drawer(q ? 'تعديل الرمز' : 'رمز QR جديد', `<form class="form">
    <label class="field"><span>اسم الملصق</span><input name="label" required value="${esc(q?.label || '')}" placeholder="مثال: مدخل قباء الرئيسي"></label>
    <div class="form-row">
      <label class="field"><span>الفرع</span><select name="branch_id">${options(M.allBranches, q?.branch_id, { blank: 'بدون تحديد' })}</select></label>
      <label class="field"><span>الموقع داخل الفرع</span><input name="location" value="${esc(q?.location || '')}" placeholder="الكاشير، غرف القياس…"></label>
    </div>
    <label class="field"><span>الوجهة</span><select name="purpose" data-purpose>${options(M.qrPurpose, q?.purpose || 'subscribe')}</select></label>
    <label class="field" data-target ${q?.purpose === 'custom' ? '' : 'hidden'}><span>المسار الداخلي</span><input name="target" dir="ltr" value="${esc(q?.target || '')}" placeholder="/offers"></label>
    <label class="switch"><input type="checkbox" name="active" ${q ? (q.active ? 'checked' : '') : 'checked'}><i></i>فعال</label>
    ${q ? `<p class="muted small">الرابط المطبوع: <span class="code">${esc(q.url)}</span></p>` : ''}
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></form>`);
  const form = d.querySelector('form');
  form.purpose.onchange = () => { d.querySelector('[data-target]').hidden = form.purpose.value !== 'custom'; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    await run(form.querySelector('button'), () => api(q ? `/qr/${q.id}` : '/qr', { method: q ? 'PUT' : 'POST', body: formData(form) }), { ok: 'حفظ الرمز', form });
    closeDrawer(); after();
  };
}
