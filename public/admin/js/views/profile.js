import { api, esc, ic, state, run, formData, modal } from '../core.js';

export async function render(view, ctx) {
  const me = (await api('/me')).user;
  view.innerHTML = `<div class="grid g2">
  <form class="card" data-info><div class="card-h"><h3>${ic('user')} بياناتي</h3></div><div class="card-b form">
    <label class="field"><span>الاسم</span><input name="name" value="${esc(me.name)}"></label>
    <label class="field"><span>البريد</span><input value="${esc(me.email)}" disabled dir="ltr"></label>
    <label class="field"><span>رقم واتساب لاستقبال رسائل الاختبار</span><input name="waPhone" dir="ltr" value="${esc(me.waPhone || '')}" placeholder="9665xxxxxxxx"></label>
    <p class="muted small" style="margin:0">الدور: ${esc(me.roleName)}</p>
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button></div></div></form>
  <form class="card" data-pw><div class="card-h"><h3>${ic('shield')} كلمة المرور</h3></div><div class="card-b form">
    <label class="field"><span>كلمة المرور الحالية</span><input type="password" name="currentPassword" autocomplete="current-password" dir="ltr" required></label>
    <label class="field"><span>كلمة المرور الجديدة</span><input type="password" name="newPassword" autocomplete="new-password" dir="ltr" minlength="10" required><span class="hint">10 أحرف على الأقل. تخرج الجلسات الأخرى تلقائيًا.</span></label>
    <div class="form-actions"><button class="btn">${ic('check')}تغيير</button></div></div></form>
  <section class="card"><div class="card-h"><h3>${ic('shield')} التحقق الثنائي</h3><div class="right">${me.twoFactor ? '<span class="badge g">مفعل</span>' : '<span class="badge y">غير مفعل</span>'}</div></div><div class="card-b">
    <p>${me.twoFactor ? 'يطلب منك رمز من تطبيق المصادقة عند كل دخول.' : 'أضف طبقة حماية برمز من تطبيق مثل Google Authenticator أو Microsoft Authenticator.' + (me.role === 'admin' ? ' <b>مطلوب لمدير النظام.</b>' : '')}</p>
    <button class="btn ${me.twoFactor ? 'danger' : ''}" data-2fa>${me.twoFactor ? 'إيقاف التحقق الثنائي' : 'تفعيل التحقق الثنائي'}</button></div></section>
  </div>`;
  const info = view.querySelector('[data-info]');
  info.onsubmit = async (e) => { e.preventDefault(); await run(info.querySelector('button'), () => api('/me', { method: 'PUT', body: formData(info) }), { ok: 'حفظت بياناتك' }); state.me.name = info.name.value; };
  const pw = view.querySelector('[data-pw]');
  pw.onsubmit = async (e) => { e.preventDefault(); await run(pw.querySelector('button'), () => api('/me', { method: 'PUT', body: formData(pw) }), { ok: 'غيرت كلمة المرور', form: pw }); pw.reset(); };
  view.querySelector('[data-2fa]').onclick = async (e) => {
    if (me.twoFactor) {
      const m = modal('إيقاف التحقق الثنائي', `<form class="form"><label class="field"><span>الرمز الحالي من التطبيق</span><input name="code" class="otp" inputmode="numeric" maxlength="6" required></label><div class="form-actions"><button class="btn danger">إيقاف</button></div></form>`);
      m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await run(ev.target.querySelector('button'), () => api('/me/2fa/disable', { method: 'POST', body: { code: ev.target.code.value } }), { ok: 'أوقف التحقق الثنائي' }); m.remove(); render(view, ctx); };
      return;
    }
    const r = await run(e.currentTarget, () => api('/me/2fa/begin', { method: 'POST' }));
    const m = modal('تفعيل التحقق الثنائي', `<div class="form"><p>امسح الرمز بتطبيق المصادقة ثم أدخل الرمز الظاهر.</p><div style="width:200px;margin:auto">${r.qr}</div>
      <p class="muted small" style="text-align:center">أو أدخل المفتاح يدويًا: <span class="code">${esc(r.secret)}</span></p>
      <form class="form"><label class="field"><span>الرمز</span><input name="code" class="otp" inputmode="numeric" maxlength="6" required></label><div class="form-actions"><button class="btn">تأكيد</button></div></form></div>`);
    m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await run(ev.target.querySelector('button'), () => api('/me/2fa/confirm', { method: 'POST', body: { code: ev.target.code.value } }), { ok: 'فعّل التحقق الثنائي' }); m.remove(); render(view, ctx); };
  };
}
