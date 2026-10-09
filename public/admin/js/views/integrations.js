import { api, esc, ic, state, ago, fmtDT, run, options, toast } from '../core.js';

export async function render(view, ctx) {
  const d = await api('/integrations');
  const st = (n) => d.status.find((s) => s.name === n);
  const row = (n) => { const s = st(n); return `<div class="status-row"><span class="led ${!s ? 'unk' : s.ok ? '' : 'off'}"></span><span class="grow"><b>${n}</b><br><span class="muted small">${s ? esc(s.message) : 'لم يفحص بعد'}</span></span>${s ? `<span class="muted small">${ago(s.checked_at)}</span>` : ''}</div>`; };
  view.innerHTML = `
  <div class="bar"><span class="grow"></span><button class="btn sec" data-check>${ic('refresh')}فحص الاتصال</button></div>
  <div class="grid g2">
    <section class="card"><div class="card-h"><h3>${ic('wa')} WhatsApp Business Platform</h3><div class="right"><span class="badge ${d.whatsapp.driver === 'mock' ? 'y' : 'g'}">${d.whatsapp.driver === 'mock' ? 'وضع التجربة' : 'Cloud API'}</span></div></div>
      <div class="card-b">${row('WhatsApp Business')}<dl class="kv" style="margin-top:12px">
        <dt>رقم الإرسال</dt><dd><span class="ltr">+${esc(d.whatsapp.phone)}</span></dd>
        <dt>رابط Webhook</dt><dd><span class="code">${esc(d.whatsapp.webhook)}</span></dd>
        <dt>المفاتيح</dt><dd>${d.whatsapp.configured ? '<span class="badge g">مضافة</span>' : '<span class="badge y">غير مضافة</span>'} ${d.whatsapp.signed ? '<span class="badge g">التوقيع مفعل</span>' : '<span class="badge y">توقيع Webhook غير مفعل</span>'}</dd>
      </dl><p class="muted small">تضاف المفاتيح في متغيرات البيئة على الخادم فقط (WHATSAPP_*)، ولا تحفظ في قاعدة البيانات.</p></div></section>
    <section class="card"><div class="card-h"><h3>${ic('google')} Google Business Profile</h3><div class="right"><span class="badge ${d.google.driver === 'mock' ? 'y' : 'g'}">${d.google.driver === 'mock' ? 'وضع التجربة' : 'API'}</span></div></div>
      <div class="card-b">${row('Google Business Profile')}<dl class="kv" style="margin-top:12px"><dt>التفويض</dt><dd>${d.google.configured ? '<span class="badge g">OAuth مضاف</span>' : '<span class="badge y">غير مضاف</span>'}</dd><dt>الحساب</dt><dd><span class="ltr">${esc(d.google.accountId || '—')}</span></dd></dl>
      <p class="muted small">اربط كل فرع بمعرف موقعه من صفحة «الفروع». المزامنة كل 15 دقيقة، ونصوص التقييمات لا تحفظ أكثر من 30 يومًا.</p></div></section>
  </div>
  <section class="card" style="margin-top:16px" data-waqr></section>
  <section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('inbox')} أحداث الربط الواردة</h3></div><div class="card-b">
    ${d.webhooks.length ? d.webhooks.map((w) => `<div class="status-row"><span class="led ${w.errors ? 'off' : ''}"></span><span class="grow"><b>${esc(w.provider)}</b> · ${w.total} حدث · ${w.pending || 0} بانتظار المعالجة · ${w.errors || 0} أخطاء</span><span class="muted small">${ago(w.last)}</span></div>`).join('') : '<p class="muted" style="margin:0">لم تصل أحداث بعد.</p>'}
  </div></section>
  ${state.env.mockWhatsapp ? `
  <div class="grid g2" style="margin-top:16px">
    <section class="card"><div class="card-h"><h3>${ic('phone')} محاكي رسائل واتساب الواردة</h3></div><div class="card-b form">
      <p class="muted small" style="margin:0">جرّب رحلة الاشتراك كاملة: افتح صفحة الاشتراك في الموقع، انسخ الرسالة الجاهزة، والصقها هنا كأنها وصلت من العميل. أو أرسل «إيقاف».</p>
      <form class="form" data-sim>
        <div class="form-row"><label class="field"><span>رقم المرسل</span><input name="from" dir="ltr" value="966500000001"></label><label class="field"><span>الاسم في واتساب</span><input name="name" value="عميل تجريبي"></label></div>
        <label class="field"><span>نص الرسالة</span><textarea name="text" placeholder="الصق رسالة الاشتراك التي تحتوي رمز الربط MC-XXXXXX"></textarea></label>
        <div class="bar" style="margin:0"><button class="btn">${ic('send', 16)}استقبال الرسالة</button><button type="button" class="btn sec" data-stop>إيقاف</button></div>
      </form>
    </div></section>
    <section class="card"><div class="card-h"><h3>صندوق الرسائل الصادرة (تجربة)</h3><div class="right"><button class="btn ghost sm" data-reload>${ic('refresh', 14)}</button></div></div><div class="card-b"><div class="phone-sim" id="outbox"></div></div></section>
  </div>` : ''}
  ${state.env.mockGoogle ? `<section class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('star')} محاكي تقييم Google</h3></div><div class="card-b"><form class="form-row" data-rev style="align-items:end">
    <label class="field"><span>الفرع</span><select name="branchId">${options(state.meta.allBranches)}</select></label>
    <label class="field"><span>النجوم</span><select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
    <label class="field" style="grid-column:span 2"><span>النص</span><input name="text" value="تجربة ممتازة والموظفين متعاونين"></label>
    <button class="btn">${ic('plus')}إضافة ومعالجة</button></form><p class="muted small">يمر التقييم بالقواعد نفسها: تصنيف، ومسودة أو رد تلقائي حسب التفعيل، وتذكرة عند الحاجة.</p></div></section>` : ''}`;

  // ربط رقم واتساب بمسح QR
  const qrBox = view.querySelector('[data-waqr]');
  let poll = null;
  const drawQr = (q) => {
    const L = { off: ['y', 'غير مربوط'], connecting: ['y', 'جارٍ الاتصال'], qr: ['y', 'بانتظار المسح'], open: ['g', 'واتساب مربوط'], error: ['r', 'خطأ'] };
    const [cls, label] = L[q.status] || L.off;
    const S = q.settings || {};
    const role = d.whatsapp.driver === 'qr' ? 'يرسل هذا الرقم كل رسائل الموقع: تأكيد الاشتراك والترحيب والعروض، والتنبيهات والملخص اليومي.' : 'يرسل هذا الرقم التنبيهات والملخص اليومي. لجعله يرسل رسائل العملاء والعروض أيضًا اضبط WHATSAPP_DRIVER=qr على الخادم.';
    qrBox.innerHTML = `<div class="card-h"><h3>${ic('phone')} إشعارات واتساب</h3><div class="right"><span class="badge ${cls}">${label}</span></div></div>
      <div class="card-b">
        ${q.status === 'open' ? `<div class="bar" style="margin:0 0 6px"><span class="grow">الرسائل تُرسل من الرقم <b class="ltr">+${esc(q.me || '')}</b> · ${q.sent} رسالة منذ آخر تشغيل</span><button class="btn ghost" data-qout>فصل الحساب</button></div>
          <p class="muted small" style="margin:0 0 14px">${role}</p>`
        : q.status === 'qr' && q.qr ? `<div style="display:grid;grid-template-columns:minmax(0,240px) 1fr;gap:20px;align-items:center;margin-bottom:16px">
            <div style="background:#fff;padding:8px;border-radius:10px;border:1px solid var(--line)">${q.qr}</div>
            <ol class="small" style="margin:0;padding-inline-start:18px;line-height:2">
              <li>افتح واتساب للأعمال على جوال رقم ماك سنتر.</li>
              <li>من <b>الإعدادات</b> اختر <b>الأجهزة المرتبطة</b> ثم <b>ربط جهاز</b>.</li>
              <li>وجّه الكاميرا إلى الرمز. يتجدد الرمز تلقائيًا كل نحو 20 ثانية.</li>
            </ol></div>`
        : `<p class="muted small" style="margin-top:0">اربط رقم ماك سنتر بمسح رمز QR من تطبيق واتساب، كما في واتساب ويب. ${role}</p>
          <p class="small" style="color:var(--warn);background:var(--warn-bg);padding:10px 12px;border-radius:8px">الربط بمسح QR ليس من واجهات واتساب الرسمية، والإرسال الجماعي منه قد يعرّض الرقم للحظر. الموقع يرسل رسالة كل ثانيتين تقريبًا ويلتزم بسقف الحملات الأسبوعي، لكن الخطر يبقى قائمًا.</p>
          ${q.error ? `<p class="small" style="color:var(--red)">${esc(q.error)}</p>` : ''}
          <button class="btn" data-qstart style="margin-bottom:16px" ${q.status === 'connecting' ? 'disabled' : ''}>${ic('plus', 16)}${q.status === 'connecting' ? 'جارٍ تجهيز الرمز…' : 'ربط رقم بمسح QR'}</button>`}
        <form class="form" data-qset>
          <div class="form-row" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
            <label class="field"><span>جوال المدير (تصله التنبيهات والملخص)</span><input name="managerPhone" dir="ltr" placeholder="9665xxxxxxxx" value="${esc(S.managerPhone || '')}"></label>
            <label class="field"><span>وقت الملخص اليومي</span><input name="summaryTime" type="time" value="${esc(S.summaryTime || '21:30')}"></label>
            <label class="field"><span>رابط النظام (يظهر أسفل الرسائل)</span><input name="link" dir="ltr" value="${esc(S.link || '')}"></label>
            <label class="field"><span>تنبيهات الفريق</span><select name="alerts"><option value="1" ${S.alerts !== false ? 'selected' : ''}>مفعّلة</option><option value="0" ${S.alerts === false ? 'selected' : ''}>متوقفة</option></select></label>
          </div>
          <div class="bar" style="margin:0"><button class="btn">${ic('check', 16)}حفظ</button>
            ${q.status === 'open' ? `<button type="button" class="btn sec" data-qsum>${ic('send', 16)}أرسل الملخص الآن</button><button type="button" class="btn ghost" data-qtest>رسالة تجريبية لي</button>` : ''}</div>
        </form>
      </div>`;
    qrBox.querySelector('[data-qstart]')?.addEventListener('click', async (e) => { const r = await run(e.currentTarget, () => api('/waqr/start', { method: 'POST' })); drawQr({ ...r, settings: S }); watch(); });
    qrBox.querySelector('[data-qout]')?.addEventListener('click', async (e) => { if (!confirm('فصل الحساب؟ ستتوقف رسائل واتساب المرسلة منه.')) return; const r = await run(e.currentTarget, () => api('/waqr/logout', { method: 'POST' }), { ok: 'فُصل الحساب' }); drawQr({ ...r, settings: S }); });
    qrBox.querySelector('[data-qtest]')?.addEventListener('click', (e) => run(e.currentTarget, () => api('/waqr/test', { method: 'POST' }), { ok: 'أرسلت الرسالة' }));
    qrBox.querySelector('[data-qsum]')?.addEventListener('click', (e) => run(e.currentTarget, () => api('/waqr/summary', { method: 'POST' }), { ok: 'أرسل الملخص' }));
    const f = qrBox.querySelector('[data-qset]');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saved = await run(f.querySelector('button'), () => api('/waqr/settings', { method: 'PUT', body: { managerPhone: f.managerPhone.value, summaryTime: f.summaryTime.value, link: f.link.value, alerts: f.alerts.value === '1' } }), { ok: 'حُفظت الإعدادات', form: f });
      q.settings = saved;
    });
  };
  const watch = () => {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!qrBox.isConnected) return clearInterval(poll);
      const q = await api('/waqr').catch(() => null);
      if (!q) return;
      drawQr(q);
      if (q.status === 'open' || q.status === 'off' || q.status === 'error') clearInterval(poll);
    }, 3000);
  };
  api('/waqr').then((q) => { drawQr(q); if (q.status === 'qr' || q.status === 'connecting') watch(); });

  view.querySelector('[data-check]').onclick = async (e) => { await run(e.currentTarget, () => api('/integrations/check', { method: 'POST' }), { ok: 'تم الفحص' }); render(view, ctx); };
  const outbox = view.querySelector('#outbox');
  const loadOutbox = async () => {
    if (!outbox) return;
    const { items } = await api('/dev/outbox');
    outbox.innerHTML = items.length ? items.slice().reverse().map((m) => `<div class="bubble"><small>إلى +${esc(m.to)} · ${fmtDT(m.at)}</small>${esc(m.text || `[قالب ${m.template}]`)}</div>`).join('') : '<p class="muted small" style="margin:0">لا توجد رسائل صادرة بعد.</p>';
    outbox.scrollTop = outbox.scrollHeight;
  };
  loadOutbox();
  view.querySelector('[data-reload]')?.addEventListener('click', loadOutbox);
  const sim = view.querySelector('[data-sim]');
  const send = async (text, btn) => {
    const r = await run(btn, () => api('/dev/whatsapp/inbound', { method: 'POST', body: { from: sim.from.value, name: sim.name.value, text } }));
    const L = { subscribed: 'تم تأكيد الاشتراك', stopped: 'أوقف الاشتراك', expired: 'الرمز منتهي', reused: 'الرمز مستخدم', message: 'رسالة عادية', preferences: 'أرسل رابط الإعدادات' };
    toast(L[r.result?.outcome] || 'استقبلت');
    loadOutbox();
  };
  sim?.addEventListener('submit', (e) => { e.preventDefault(); send(sim.text.value, sim.querySelector('button')); });
  view.querySelector('[data-stop]')?.addEventListener('click', (e) => send('إيقاف', e.currentTarget));
  const rev = view.querySelector('[data-rev]');
  rev?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(rev.querySelector('button'), () => api('/dev/reviews', { method: 'POST', body: Object.fromEntries(new FormData(rev)) }), { ok: 'عولج التقييم، افتح صفحة التقييمات' });
  });
}
