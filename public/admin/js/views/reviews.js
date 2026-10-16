import { api, esc, ic, can, state, badge, ago, fmtD, nf, emptyState, options, run, stars, drawer, closeDrawer, modal, confirmBox, toast } from '../core.js';

export async function render(view, ctx) {
  const M = state.meta;
  const q = Object.fromEntries(ctx.query);
  const st = q.state || 'pending';
  const params = new URLSearchParams(Object.entries({ state: st === 'all' ? '' : st, branch: q.branch || '', rating: q.rating || '' }).filter(([, v]) => v));
  const { items, stats } = await api(`/reviews?${params}`);
  const canEditRules = ['admin', 'branch_manager'].includes(state.me.role);

  view.innerHTML = `
  ${state.env.mockGoogle ? `<div class="banner info">${ic('alert')}<span>وضع التجربة: التقييمات من محاكي Google والردود لا تنشر فعليًا. أضف تقييمًا تجريبيًا من صفحة «الربط».</span></div>` : ''}
  <div class="grid g3" style="margin-bottom:16px">
    ${stats.map((b) => `<div class="card kpi"><span class="lbl"><span class="ic-wrap">${ic('google')}</span>${esc(b.short_name)}</span>
      <span class="val num">${b.rating ? b.rating.toFixed(1) : '—'} <span style="font-size:15px" class="muted">${b.rating_count ? `(${nf.format(b.rating_count)} تقييم)` : ''}</span></span>
      <span class="sub">${b.pending ? `<b style="color:var(--warn)">${b.pending} تحتاج متابعة</b>` : 'لا شيء معلق'} · ${b.rating_updated_at ? 'حدّثت ' + ago(b.rating_updated_at) : 'الدرجة من Google بعد الربط'}</span>
      ${canEditRules ? `<button class="btn ghost sm" style="justify-self:start;margin-top:6px" data-rules="${b.id}">${ic('cog', 16)}تعليمات الرد</button>` : ''}</div>`).join('')}
  </div>
  <div class="bar">
    <div class="seg">${[['pending', 'تحتاج متابعة'], ['escalated', 'مصعّدة'], ['auto_replied', 'رد تلقائي'], ['replied', 'تم الرد'], ['all', 'الكل']].map(([k, v]) => `<button data-st="${k}" class="${k === st ? 'on' : ''}">${v}</button>`).join('')}</div>
    <select data-f="branch">${options(M.branches, q.branch, { blank: 'كل الفروع' })}</select>
    <select data-f="rating">${options({ 5: '5 نجوم', 4: '4 نجوم', 3: '3 نجوم', 2: 'نجمتان', 1: 'نجمة' }, q.rating, { blank: 'كل التقييمات' })}</select>
    <span class="grow"></span>
    <button class="btn sec" data-sync>${ic('refresh')}مزامنة الآن</button>
  </div>
  <section class="card"><div class="list" id="rlist">${items.length ? items.map(reviewHtml).join('') : emptyState('لا توجد تقييمات بهذه المعايير', 'star')}</div></section>`;

  const go = (patch) => {
    const next = new URLSearchParams({ ...q, ...patch });
    for (const [k, v] of [...next]) if (!v || (k === 'state' && v === 'pending')) next.delete(k);
    location.hash = `#/reviews${next.toString() ? '?' + next : ''}`;
  };
  view.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => go({ state: b.dataset.st }));
  view.querySelectorAll('[data-f]').forEach((s) => s.onchange = () => go({ [s.dataset.f]: s.value }));
  view.querySelector('[data-sync]').onclick = async (e) => { const r = await run(e.currentTarget, () => api('/reviews/sync', { method: 'POST' })); ctxToast(r); render(view, ctx); };
  view.querySelectorAll('[data-rules]').forEach((b) => b.onclick = () => rulesDrawer(Number(b.dataset.rules), () => render(view, ctx)));

  view.querySelector('#rlist').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-rid]');
    if (!el) return;
    const id = el.dataset.rid;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.do === 'publish') {
      const text = el.querySelector('textarea').value.trim();
      if (text.length < 10) { toast('اكتب ردًا لا يقل عن 10 أحرف قبل النشر', 'err'); return; }
      // الرد يُنشر علنًا على Google باسم الفرع، فنعرضه للتأكيد قبل الإرسال
      if (!await confirmBox('نشر الرد على Google', `سيظهر هذا الرد علنًا تحت التقييم:<blockquote style="margin:12px 0;padding:10px 14px;border-inline-start:3px solid var(--line, #ddd);white-space:pre-wrap">${esc(text)}</blockquote>`, { okLabel: 'نشر الرد' })) return;
      await run(b, () => api(`/reviews/${id}/reply`, { method: 'POST', body: { text } }), { ok: 'نشر الرد' });
      ctx.refreshBadges(); render(view, ctx);
    } else if (b.dataset.do === 'save') {
      await run(b, () => api(`/reviews/${id}/draft`, { method: 'POST', body: { text: el.querySelector('textarea').value } }), { ok: 'حفظت المسودة' });
    } else if (b.dataset.do === 'ignore') {
      await run(b, () => api(`/reviews/${id}/ignore`, { method: 'POST', body: {} }), { ok: 'وسم بلا إجراء' });
      render(view, ctx);
    } else if (b.dataset.do === 'feature') {
      const on = b.dataset.on !== '1';
      await run(b, () => api(`/reviews/${id}/feature`, { method: 'POST', body: { featured: on } }), { ok: on ? 'سيظهر في الموقع ضمن التجارب المختارة' : 'أزيل من الموقع' });
      render(view, ctx);
    }
  });
}

function ctxToast() { /* نتيجة المزامنة تظهر في القائمة بعد التحديث */ }

function reviewHtml(r) {
  const M = state.meta;
  const canReply = can('reviews.reply') || state.me.role === 'branch_manager' || state.me.role === 'admin';
  const open = ['new', 'needs_review', 'draft_ready', 'escalated'].includes(r.state);
  return `<article class="review" data-rid="${r.id}">
    <div class="rh">${stars(r.rating)}<b>${esc(r.author || 'عميل')}</b><span class="muted small">${esc(r.branch)} · ${fmtD(r.review_time)}${r.review_updated_at ? ' · عُدّل' : ''}</span>
      <span style="margin-inline-start:auto" class="bar">${badge(r.state, M.reviewState[r.state])}${r.classification ? `<span class="badge">${esc(M.classification[r.classification])}</span>` : ''}${r.ticket_id ? `<a class="badge b" href="#/tickets/${r.ticket_id}">${ic('ticket', 12)}تذكرة</a>` : ''}</span></div>
    ${r.text ? `<div class="txt">${esc(r.text)}</div>` : r.fetched_at ? '<div class="muted small">بلا نص، أو انتهت مدة التخزين المؤقت المسموحة.</div>' : ''}
    ${r.reply ? `<div class="reply"><span class="muted small">${r.reply_source === 'human' ? 'رد الموظف' : r.reply_source === 'external' ? 'رد سابق' : 'رد تلقائي'} · ${ago(r.replied_at)}</span><div>${esc(r.reply)}</div></div>` : ''}
    ${open && canReply ? `<div class="draft grid" style="gap:8px">
      ${r.state === 'escalated' ? `<div class="banner" style="margin:0">${ic('shield')}<span>تقييم حساس: راجع التصنيف والتذكرة قبل النشر. لا تذكر تفاصيل الشكوى أو بيانات العميل في الرد العام.</span></div>` : ''}
      <textarea aria-label="نص الرد">${esc(r.draft || '')}</textarea>
      <div class="bar" style="margin:0"><button class="btn sm" data-do="publish">${ic('send', 16)}نشر الرد</button><button class="btn sec sm" data-do="save">حفظ المسودة</button><button class="btn ghost sm" data-do="ignore">بلا إجراء</button></div></div>` : ''}
    ${r.text && r.rating >= 4 && ['replied', 'auto_replied'].includes(r.state) ? `<div><button class="btn ghost sm" data-do="feature" data-on="${r.featured ? 1 : 0}">${ic('star', 16)}${r.featured ? 'إزالة من تجارب الموقع' : 'عرضه في تجارب الموقع'}</button></div>` : ''}
  </article>`;
}

async function rulesDrawer(branchId, after) {
  const ins = await api(`/reviews/instructions/${branchId}`);
  const name = state.meta.allBranches.find((b) => b.id === branchId)?.name;
  const d = drawer(`تعليمات الرد · ${esc(name)}`, `<form class="form">
    <div class="banner info" style="margin:0">${ic('shield')}<span>تبنى الردود من قوالبك فقط. نص العميل يعامل كمدخل غير موثوق ولا يدخل في صياغة الرد.</span></div>
    <div class="form-row"><label class="field"><span>نبرة الرد</span><input name="tone" value="${esc(ins.tone)}"></label><label class="field"><span>اللغة</span><input name="language" value="${esc(ins.language)}"></label></div>
    <label class="field"><span>قوالب الرد على التقييمات الإيجابية (سطر لكل قالب)</span><textarea name="positiveTemplates" rows="4">${esc(ins.positiveTemplates.join('\n'))}</textarea><span class="hint">استخدم {branch} لاسم الفرع و{phone} لرقمه.</span></label>
    <label class="field"><span>إقرار الاستلام للتقييمات المنخفضة أو التي فيها ملاحظة</span><textarea name="ackTemplate" rows="2">${esc(ins.ackTemplate)}</textarea></label>
    <label class="field"><span>معلومات معتمدة</span><textarea name="facts" rows="2">${esc(ins.facts)}</textarea></label>
    <label class="field"><span>حالات تتطلب تدخل موظف</span><textarea name="humanCases" rows="2">${esc(ins.humanCases)}</textarea></label>
    <section class="card"><div class="card-b form">
      <h3 style="font-size:15px">الرد التلقائي</h3>
      <label class="switch"><input type="checkbox" name="autoPositive" ${ins.autoReply.positive ? 'checked' : ''}><i></i>رد تلقائي قصير على 4-5 نجوم بنص إيجابي واضح</label>
      <label class="switch"><input type="checkbox" name="autoAck" ${ins.autoReply.lowAck ? 'checked' : ''}><i></i>إقرار استلام ثابت تلقائي لتقييمات 1-3 نجوم</label>
      <p class="muted small" style="margin:0">${ins.autoReplyApprovedAt ? `آخر موافقة مسجلة: ${fmtD(ins.autoReplyApprovedAt)}` : 'لم تسجل موافقة على الرد التلقائي بعد.'} الحالات الحساسة والتقييمات المحدّثة تبقى للمراجعة البشرية دائمًا.</p>
    </div></section>
    <section class="card"><div class="card-h"><h3>${ic('eye')} اختبار القواعد على أمثلة</h3></div><div class="card-b form">
      <div id="samples">${[[5, 'تجربة رائعة والموظفين متعاونين'], [4, 'المكان حلو بس الزحمة كثير والكاشير تأخر'], [2, 'ما لقيت المقاس']].map(([r, t]) => sampleRow(r, t)).join('')}</div>
      <div class="bar" style="margin:0"><button type="button" class="btn sec sm" data-add>${ic('plus', 16)}مثال</button><button type="button" class="btn sm" data-test>${ic('eye', 16)}معاينة</button></div>
      <div id="preview"></div>
    </div></section>
    <div class="form-actions"><button class="btn" type="submit">${ic('check')}حفظ التعليمات</button></div>
  </form>`, { wide: true });
  const form = d.querySelector('form');
  d.querySelector('[data-add]').onclick = () => d.querySelector('#samples').insertAdjacentHTML('beforeend', sampleRow(5, ''));
  d.querySelector('[data-test]').onclick = async (e) => {
    const samples = [...d.querySelectorAll('.sample')].map((s) => ({ rating: s.querySelector('select').value, text: s.querySelector('input').value }));
    const { items } = await run(e.currentTarget, () => api('/reviews/preview', { method: 'POST', body: { branchId, samples } }));
    d.querySelector('#preview').innerHTML = `<div class="list card">${items.map((x) => `<div class="li"><span class="grow">${stars(x.rating, 12)} <span class="small">${esc(x.text)}</span><br><span class="badge">${esc(x.classificationName)}</span> → <b>${esc(x.action)}</b><div class="muted small">${esc(x.draft)}</div></span></div>`).join('')}</div>`;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      tone: form.tone.value, language: form.language.value, ackTemplate: form.ackTemplate.value, facts: form.facts.value, humanCases: form.humanCases.value,
      positiveTemplates: form.positiveTemplates.value.split('\n'), autoReply: { positive: form.autoPositive.checked, lowAck: form.autoAck.checked },
    };
    const enabling = (body.autoReply.positive && !ins.autoReply.positive) || (body.autoReply.lowAck && !ins.autoReply.lowAck);
    if (enabling) {
      const m = modal('موافقة صريحة على الرد التلقائي', `<p>ستنشر الردود التلقائية علنًا على Google باسم الفرع وفق القوالب أعلاه. تسجل موافقتك باسمك ووقتها، ويمكن إيقافها في أي وقت.</p><div class="form-actions"><button class="btn" data-ok>أوافق وأفعّل</button><button class="btn sec" data-x>إلغاء</button></div>`);
      m.querySelector('[data-ok]').onclick = async () => { m.remove(); await save({ ...body, confirmAutoReply: true }); };
      return;
    }
    await save(body);
  });
  async function save(body) {
    await run(form.querySelector('[type=submit]'), () => api(`/reviews/instructions/${branchId}`, { method: 'PUT', body }), { ok: 'حفظت التعليمات', form });
    closeDrawer(); after();
  }
}

function sampleRow(r, t) {
  return `<div class="sample bar" style="margin:0 0 6px"><select style="min-width:90px">${[5, 4, 3, 2, 1].map((n) => `<option ${n === r ? 'selected' : ''}>${n}</option>`).join('')}</select><input class="grow" value="${esc(t)}" placeholder="نص التقييم"></div>`;
}
