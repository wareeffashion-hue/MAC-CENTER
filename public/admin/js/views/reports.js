import { api, esc, ic, can, state, nf, money, hbars, branchName, sectionName, emptyState } from '../core.js';

export async function render(view, ctx) {
  const M = state.meta;
  const days = Number(ctx.query.get('days') || 30);
  const showMk = can('campaigns') || can('reports');
  const showSv = can('tickets') || can('reports');
  const [mk, sv] = await Promise.all([showMk ? api(`/reports/marketing?days=${days}`) : null, showSv ? api(`/reports/service?days=${days}`) : null]);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const mins = (m) => (m == null ? '—' : m < 60 ? `${m} دقيقة` : `${(m / 60).toFixed(1)} ساعة`);

  view.innerHTML = `
  <div class="bar"><div class="seg">${[[7, '7 أيام'], [30, '30 يومًا'], [90, '90 يومًا']].map(([d, t]) => `<button data-d="${d}" class="${d === days ? 'on' : ''}">${t}</button>`).join('')}</div>
    <span class="muted small">النسب تذكر مقامها. القياس لا يتضمن أرقام العملاء أو نصوص الشكاوى.</span></div>
  ${mk ? `<h2 style="font-size:18px;margin:8px 0 12px">${ic('send')} الاشتراكات والحملات</h2>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span class="lbl">مشتركون نشطون</span><span class="val num">${nf.format(mk.active)}</span></div>
    <div class="card kpi"><span class="lbl">تأكيد من الزيارات</span><span class="val num">${pct(mk.funnel[2].n, mk.funnel[0].n)}</span><span class="sub">${nf.format(mk.funnel[2].n)} مؤكد من ${nf.format(mk.funnel[0].n)} زيارة QR</span></div>
    <div class="card kpi"><span class="lbl">إيقاف الاشتراك</span><span class="val num">${nf.format(mk.stopped)}</span></div>
    <div class="card kpi ${mk.messages.failed ? 'bad' : ''}"><span class="lbl">فشل الإرسال</span><span class="val num">${pct(mk.messages.failed || 0, Object.values(mk.messages).reduce((a, b) => a + b, 0))}</span><span class="sub">${nf.format(mk.messages.failed || 0)} من ${nf.format(Object.values(mk.messages).reduce((a, b) => a + b, 0))} رسالة</span></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <section class="card"><div class="card-h"><h3>رحلة الاشتراك</h3></div><div class="card-b"><div class="funnel">${(() => {
      const max = Math.max(1, ...mk.funnel.map((f) => f.n));
      return mk.funnel.map((f, i) => `<div class="st"><span>${esc(f.name)}</span><div><div class="fb" style="width:${(f.n / max) * 100}%;animation-delay:${i * 80}ms"></div></div><b class="num">${nf.format(f.n)}</b></div>`).join('');
    })()}</div><p class="muted small" style="margin:12px 0 0">زيارة الرابط وبدء الاشتراك لا يعدان موافقة؛ المؤكد فقط من وصلت رسالته فعلًا.</p></div></section>
    <section class="card"><div class="card-h"><h3>توزيع الاهتمامات</h3></div><div class="card-b">${hbars(Object.entries(mk.interest).map(([id, v]) => ({ label: sectionName(id), v })).sort((a, b) => b.v - a.v), { cls: 'y' })}</div></section>
    <section class="card"><div class="card-h"><h3>المشتركون حسب الفرع</h3></div><div class="card-b">${hbars(Object.entries(mk.branches).map(([id, v]) => ({ label: branchName(id), v })))}</div></section>
    <section class="card"><div class="card-h"><h3>مصادر الاشتراك</h3></div><div class="card-b">${hbars(Object.entries(mk.sources).map(([k, v]) => ({ label: k === 'web' ? 'الموقع' : k, v })).sort((a, b) => b.v - a.v))}</div></section>
  </div>
  <section class="card" style="margin-bottom:24px"><div class="card-h"><h3>نتائج الحملات</h3></div>${mk.campaigns.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الحملة</th><th>أرسلت</th><th>سلّمت</th><th>قرئت</th><th>فشلت</th><th>فتح التفاصيل</th><th>التكلفة</th></tr></thead><tbody>
    ${mk.campaigns.map((c) => `<tr><td><a href="#/campaigns/${c.id}">${esc(c.name)}</a></td><td class="num">${nf.format(c.sent)}</td><td class="num">${nf.format(c.delivered)} <span class="muted small">${pct(c.delivered, c.sent)}</span></td><td class="num">${nf.format(c.read)}</td><td class="num">${nf.format(c.failed)}</td><td class="num">${nf.format(c.views)}</td><td>${money(c.spent)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('لا توجد حملات في هذه الفترة', 'send')}</section>` : ''}
  ${sv ? `<h2 style="font-size:18px;margin:8px 0 12px">${ic('ticket')} خدمة العملاء</h2>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span class="lbl">التذاكر</span><span class="val num">${nf.format(sv.total)}</span></div>
    <div class="card kpi"><span class="lbl">وسيط أول تواصل</span><span class="val">${mins(sv.medianFirstResponse)}</span><span class="sub">من ${nf.format(sv.answeredCount)} تذكرة وُثق فيها تواصل</span></div>
    <div class="card kpi"><span class="lbl">وسيط زمن الحل</span><span class="val">${mins(sv.medianResolve)}</span></div>
    <div class="card kpi ${sv.reopened ? 'warn' : ''}"><span class="lbl">أعيد فتحها</span><span class="val num">${nf.format(sv.reopened)}</span><span class="sub">الإغلاق وحده لا يثبت الرضا</span></div>
  </div>
  <div class="grid g2">
    <section class="card"><div class="card-h"><h3>حسب الموضوع</h3></div><div class="card-b">${hbars(Object.entries(sv.byTopic).map(([k, v]) => ({ label: M.topics[k] || 'غير محدد', v })).sort((a, b) => b.v - a.v))}</div></section>
    <section class="card"><div class="card-h"><h3>حسب الفرع</h3></div><div class="card-b">${hbars(Object.entries(sv.byBranch).map(([k, v]) => ({ label: branchName(k), v })))}</div></section>
    <section class="card"><div class="card-h"><h3>حسب النوع والأولوية</h3></div><div class="card-b">${hbars([...Object.entries(sv.byType).map(([k, v]) => ({ label: M.ticketTypes[k], v })), ...Object.entries(sv.byPriority).map(([k, v]) => ({ label: 'أولوية ' + M.priority[k], v }))], { cls: 'y' })}</div></section>
    <section class="card"><div class="card-h"><h3>ملاحظات متكررة</h3></div><div class="list">${sv.repeated.length ? sv.repeated.map((r) => `<div class="li"><span class="grow"><span class="t">${esc(M.topics[r.topic])}</span><span class="s">${r.section_id ? sectionName(r.section_id) : 'كل الأقسام'}</span></span><b class="num">${r.n}</b></div>`).join('') : emptyState('لا توجد أنماط متكررة (3 مرات فأكثر)', 'check')}</div></section>
  </div>` : ''}`;
  view.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { location.hash = `#/reports?days=${b.dataset.d}`; });
}
