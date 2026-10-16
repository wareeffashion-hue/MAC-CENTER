import { api, esc, ic, can, state, badge, ago, fmtDT, trendChart, sparkline, nf, emptyState } from '../core.js';

export async function render(view) {
  const d = await api('/dashboard/today');
  const M = state.meta;
  const hour = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const t = d.tickets;
  const trend = d.trend;
  const spark = (k) => sparkline(trend.map((x) => x[k]));

  const kpis = [
    { lbl: 'تذاكر جديدة', val: t.new, sub: 'لم تُستلم بعد', icon: 'inbox', href: '#/tickets?status=new', tone: t.new ? 'y' : '', spark: spark('tickets') },
    { lbl: 'متأخرة عن المهلة', val: t.late, sub: 'تحتاج تدخلًا الآن', icon: 'clock', href: '#/tickets?status=late', tone: t.late ? 'bad' : '' },
    { lbl: 'مسندة إليّ', val: t.mine, sub: `${nf.format(t.open)} تذكرة مفتوحة إجمالًا`, icon: 'user', href: '#/tickets?status=mine' },
  ];
  if (d.reviews) kpis.push({ lbl: 'تقييمات تحتاج ردًا', val: d.reviews.pending, sub: d.reviews.escalated ? `${d.reviews.escalated} مصعّدة` : 'على Google', icon: 'star', href: '#/reviews', tone: d.reviews.escalated ? 'bad' : '' });
  if (d.campaigns) kpis.push({ lbl: 'المشتركون النشطون', val: d.campaigns.subscribers, sub: `+${d.campaigns.newSubscribers7d} خلال 7 أيام`, icon: 'users', href: '#/subscribers', spark: spark('subscribers') });
  const shown = kpis; // الشبكة تلتف، فلا نسقط بطاقة المشتركين حين تظهر بطاقة التقييمات

  view.innerHTML = `
  <div class="bar" style="margin-bottom:20px"><div><h2 style="font-size:24px">${greet}، ${esc(state.me.name.split(' ')[0])}</h2>
    <p class="muted" style="margin:0">${new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} · ${nf.format(t.todayCreated)} ملاحظة وصلت اليوم</p></div>
    <div style="margin-inline-start:auto" class="bar">
      ${can('tickets') ? `<a class="btn sec" href="#/tickets?new=1">${ic('plus')}تذكرة يدوية</a>` : ''}
      ${can('offers') ? `<a class="btn" href="#/offers?new=1">${ic('gift')}عرض جديد</a>` : ''}
    </div></div>

  <div class="grid g4" style="margin-bottom:16px">
    ${shown.map((k) => `<div class="card kpi ${k.tone || ''}"><span class="lbl"><span class="ic-wrap">${ic(k.icon)}</span>${k.lbl}</span><span class="val num">${nf.format(k.val)}</span><span class="sub">${k.sub}</span>${k.spark || ''}<a class="stretch" href="${k.href}" aria-label="${k.lbl}"></a></div>`).join('')}
  </div>

  <div class="grid g-main">
    <div class="grid" style="align-content:start">
      <section class="card">
        <div class="card-h"><h2>${ic('alert')} ما يحتاج انتباهك</h2><div class="right"><a class="btn ghost sm" href="#/tickets">كل التذاكر</a></div></div>
        <div class="list">${d.urgent.length ? d.urgent.map((x) => {
          const late = x.due_at && x.due_at < new Date().toISOString().replace('T', ' ').slice(0, 19);
          return `<a class="li" href="#/tickets/${x.id}">
            <span class="badge ${x.priority === 'urgent' ? 'r' : x.priority === 'high' ? 'y' : ''}">${esc(M.priority[x.priority])}</span>
            <span class="grow"><span class="t"><span class="ltr">${esc(x.ref)}</span> · ${esc(M.ticketTypes[x.type])} · ${esc(x.branch || '')}</span><span class="s">${esc(x.excerpt)}</span></span>
            <span class="sla ${late ? 'late' : ''}">${ic('clock', 14)}${late ? 'متأخرة' : ago(x.created_at)}</span></a>`;
        }).join('') : emptyState('لا شيء عاجل الآن. عمل رائع!', 'check')}</div>
      </section>
      <section class="card">
        <div class="card-h"><h2>${ic('chart')} نشاط آخر 14 يومًا</h2><div class="right legend"><span><i style="background:#006442"></i>ملاحظات</span><span><i style="background:#FFBA1D"></i>اشتراكات مؤكدة</span><span><i style="background:#0C714F;opacity:.4"></i>مسح QR</span></div></div>
        <div class="card-b">${trendChart(trend, [{ key: 'tickets', cls: 'bar-a', type: 'bar' }, { key: 'subscribers', cls: 'bar-b', type: 'bar' }, { key: 'qr', cls: 'line-a', type: 'line' }])}</div>
      </section>
    </div>
    <div class="grid" style="align-content:start">
      ${d.campaigns ? `<section class="card"><div class="card-h"><h2>${ic('send')} الحملات القادمة</h2><div class="right"><a class="btn ghost sm" href="#/campaigns">الكل</a></div></div>
        <div class="list">${d.campaigns.scheduled.length ? d.campaigns.scheduled.map((c) => `<a class="li" href="#/campaigns/${c.id}"><span class="grow"><span class="t">${esc(c.name)}</span><span class="s">${c.scheduled_at ? fmtDT(c.scheduled_at) : 'دون موعد'} · ${nf.format(c.audience_count)} مشترك</span></span>${badge(c.status, M.campaignStatus[c.status])}</a>`).join('') : emptyState('لا توجد حملات مجدولة', 'send')}</div>
        ${d.campaigns.failed ? `<div class="card-b"><div class="banner" style="margin:0">${ic('alert')}<span>${d.campaigns.failed} رسالة فاشلة تحتاج معالجة</span></div></div>` : ''}</section>` : ''}
      <section class="card"><div class="card-h"><h2>${ic('plug')} حالة الربط</h2>${can('integrations') ? '<div class="right"><a class="btn ghost sm" href="#/integrations">التفاصيل</a></div>' : ''}</div>
        <div class="card-b">${['WhatsApp Business', 'Google Business Profile'].map((name) => {
          const s = d.integrations.find((x) => x.name === name);
          return `<div class="status-row"><span class="led ${!s ? 'unk' : s.ok ? '' : 'off'}"></span><span class="grow"><b>${name}</b><br><span class="muted small">${s ? esc(s.message) : 'لم يفحص بعد'}</span></span>${s ? `<span class="muted small">${ago(s.checked_at)}</span>` : ''}</div>`;
        }).join('')}</div></section>
    </div>
  </div>`;
}
