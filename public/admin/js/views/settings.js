import { api, esc, ic, run, formData } from '../core.js';

export async function render(view) {
  const s = await api('/settings');
  const m = s.messaging, t = s.tickets;
  view.innerHTML = `<div class="grid g2">
  <form class="card" data-k="messaging"><div class="card-h"><h3>${ic('send')} الرسائل التسويقية</h3></div><div class="card-b form">
    <label class="field"><span>سقف الرسائل التسويقية لكل عميل أسبوعيًا</span><input type="number" min="1" max="14" name="weeklyCap" value="${esc(m.weeklyCap)}"><span class="hint">المقترح البدء برسالتين، وتعديله حسب النتائج.</span></label>
    <div class="form-row"><label class="field"><span>بداية ساعات الإرسال</span><input type="time" name="from" value="${esc(m.sendWindow?.[0] || '10:00')}"></label><label class="field"><span>نهايتها</span><input type="time" name="to" value="${esc(m.sendWindow?.[1] || '22:00')}"></label></div>
    <div class="form-row"><label class="field"><span>تكلفة رسالة Meta التسويقية</span><input type="number" step="0.0001" min="0" name="costPerMarketing" value="${esc(m.costPerMarketing)}" dir="ltr"></label>
      <label class="field"><span>رسوم المزود لكل رسالة</span><input type="number" step="0.0001" min="0" name="providerFeePerMessage" value="${esc(m.providerFeePerMessage)}" dir="ltr"></label>
      <label class="field"><span>العملة</span><select name="currency">${['USD', 'SAR'].map((c) => `<option ${m.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    <p class="muted small" style="margin:0">حدّث التكلفة حسب تسعير Meta الحالي لسوق السعودية وفئة الرسالة.</p>
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></div></form>
  <form class="card" data-k="tickets"><div class="card-h"><h3>${ic('clock')} مهل خدمة العملاء</h3></div><div class="card-b form">
    <label class="field"><span>مهلة أول تواصل للحالات العادية (دقيقة)</span><input type="number" min="5" name="firstResponseMinutes" value="${esc(t.firstResponseMinutes)}"><span class="hint">تحسب من ساعات دوام الفرع الفعلية.</span></label>
    <label class="field"><span>مهلة الحالات العاجلة (دقيقة)</span><input type="number" min="5" name="urgentMinutes" value="${esc(t.urgentMinutes)}"></label>
    <label class="field"><span>التصعيد التالي بعد (دقيقة)</span><input type="number" min="5" name="escalateAfterMinutes" value="${esc(t.escalateAfterMinutes)}"></label>
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></div></form>
  </div>`;
  view.querySelectorAll('form[data-k]').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    const b = formData(f);
    for (const k of Object.keys(b)) if (/^\d+(\.\d+)?$/.test(b[k])) b[k] = Number(b[k]);
    if (f.dataset.k === 'messaging') { b.sendWindow = [b.from, b.to]; delete b.from; delete b.to; }
    await run(f.querySelector('button'), () => api(`/settings/${f.dataset.k}`, { method: 'PUT', body: b }), { ok: 'حفظت الإعدادات' });
  });
}
