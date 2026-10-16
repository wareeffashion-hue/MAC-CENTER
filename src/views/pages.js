import { esc } from '../http.js';
import { config } from '../config.js';
import { layout, CART, AR_NUM } from './layout.js';
import { arch, engine } from './art.js';
import { weekTable, openingHoursSpec } from '../lib/hours.js';
import { formatDate, isoToRiyadhLocal } from '../lib/time.js';
import { SERVICE_LABELS, CONSENT_TEXT, waLink, inquiryText } from '../modules/catalog.js';
import { TICKET_TYPES, TOPICS } from '../modules/tickets.js';

const win = (item, kind, opts = {}) => arch(kind, { image: item?.image ? esc(item.image) : null, ...opts, label: esc(opts.label || '') });

function status(b) {
  const s = b.status || { known: false };
  if (!s.known) return '<span class="st st-muted">تواصل لمعرفة الدوام</span>';
  return `<span class="st ${s.open ? (s.closingSoon ? 'st-warn' : 'st-open') : 'st-closed'}"><i></i>${esc(s.label)}</span>`;
}

const linkArrow = (href, text, attrs = '') => `<a class="link-arrow" href="${href}" ${attrs}><span>${text}</span><i aria-hidden="true"></i></a>`;

// عنوان قسم تحريري: رقم ثم عنوان، دون شارات أو أيقونات
function head(n, title, sub = '') {
  return `<header class="s-head"><span class="s-n">${AR_NUM(n)}</span><h2 class="reveal-lines">${title}</h2>${sub ? `<p class="s-sub">${sub}</p>` : ''}</header>`;
}

function waBtn(b, ctx, label = 'استفسار عبر واتساب') {
  return `<a class="btn" href="${esc(waLink(b.whatsapp, inquiryText(b, ctx)))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}"><span>${label}</span><i aria-hidden="true"></i></a>`;
}

// ———————————————————— الرئيسية ————————————————————

// مناسبة مؤقتة في واجهة الموقع: تظهر بين تاريخين بتوقيت الرياض، وتعرض قبلها أو بعدها بإضافة ?occasion=1 للمعاينة
const OCCASION = {
  from: '2026-10-15', until: '2026-10-19',
  image: '/img/occasion/ceo.webp', name: 'محمد خميس المالكي', role: 'المدير التنفيذي لشركة ماك سنتر',
  kicker: '١٦ أكتوبر · اليوم العالمي للمدير',
  text: 'في اليوم العالمي للمدير نقول لقائدنا: شكرًا على رؤية جعلت ماك سنتر وجهة العائلة في المدينة المنورة، وعلى ثقة تلهم فريقنا كل يوم.',
};
function occasionActive(preview) {
  if (preview === '1') return true;
  if (preview === '0') return false;
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  return today >= OCCASION.from && today < OCCASION.until;
}
function occasionHero() {
  const o = OCCASION;
  return `
<section class="occ" aria-labelledby="occ-title" data-occ>
  <div class="occ-grid">
    <div class="occ-copy">
      <p class="occ-kicker"><i aria-hidden="true"></i>${esc(o.kicker)}</p>
      <h2 id="occ-title" class="occ-title"><span class="ln"><span>شكرًا</span></span><span class="ln name"><span>${esc(o.name)}</span></span></h2>
      <p class="occ-role">${esc(o.role)}</p>
      <p class="occ-text">${esc(o.text)}</p>
      <p class="occ-sign">${CART('occ-cart')}<span>فريق ماك سنتر</span></p>
      <a class="link-arrow occ-next" href="#main-hero"><span>تابع إلى الموقع</span><i aria-hidden="true"></i></a>
    </div>
    <figure class="occ-fig">
      <div class="occ-stage" aria-hidden="true"><span class="occ-sp"></span><span class="occ-sp y"></span><span class="occ-sp"></span></div>
      <img class="occ-img" src="${o.image}" alt="${esc(o.name)}، ${esc(o.role)}" width="900" height="1295" fetchpriority="high" decoding="async">
      <figcaption class="occ-cap"><b>${esc(o.name)}</b><span>${esc(o.role)}</span></figcaption>
    </figure>
  </div>
</section>`;
}

export function homePage({ site, branches, sections, offers, faqs, reviews, intro, occasionPreview }) {
  const title = (site.heroTitle || 'اختيارات العائلة في وجهة واحدة').split(' ');
  const cut = Math.max(1, Math.floor(title.length / 2)) - 1;
  const aboutWords = String(site.about || '').split(/\s+/).filter(Boolean);

  const hero = `
<section class="hero" id="main-hero" aria-labelledby="hero-title" data-hero>
  <div class="hero-grid">
    <div class="hero-copy">
      <h1 id="hero-title" class="hero-title">
        <span class="ln"><span>${esc(title.slice(0, cut + 1).join(' '))}</span></span>
        <span class="ln light"><span>${esc(title.slice(cut + 1).join(' '))}</span></span>
      </h1>
      <p class="hero-lead">${esc(site.heroText || '')}</p>
      <div class="hero-ctas">
        <a class="btn btn-gold" href="/subscribe"><span>اشترك في العروض</span><i aria-hidden="true"></i></a>
        ${linkArrow('#branches', 'اكتشف الفروع')}
      </div>
    </div>
    ${engine(sections)}
  </div>
  <a class="scroll-cue" href="#about" aria-label="تابع إلى الأسفل"><span></span></a>
</section>`;

  const about = `
<section class="statement" id="about" data-words-scrub>
  <p class="label">المدينة المنورة · ${AR_NUM(branches.length)} فروع</p>
  <p class="statement-text">${aboutWords.map((w) => `<span>${esc(w)}</span>`).join(' ')}</p>
  <p class="statement-sub">${esc(site.about2 || '')}</p>
</section>`;

  const departments = `
<section class="depts" id="departments" aria-labelledby="dept-title" data-hscroll>
  <div class="depts-sticky">
    <div class="depts-head">
      ${head(1, '<span id="dept-title">الأقسام</span>', 'ست وجهات تحت سقف واحد. اختر القسم لتعرف الفروع المتاح فيها وتسأل مباشرة.')}
      <div class="depts-progress" aria-hidden="true"><i data-hprogress></i></div>
    </div>
    <div class="depts-track" data-htrack>
      ${sections.map((s, i) => {
        const av = branches.filter((b) => s.branchIds.includes(b.id));
        return `<article class="dept" id="sec-${esc(s.slug)}">
          <button class="dept-win" type="button" data-open-section="${esc(s.slug)}" data-cursor="اكتشف" aria-label="${esc(s.name)}: التفاصيل والاستفسار">${win(s, s.art, { draw: true })}</button>
          <div class="dept-body">
            <span class="dept-n">${AR_NUM(i + 1)}</span>
            <h3>${esc(s.name)}</h3>
            <p>${esc(s.tagline)}</p>
            <p class="dept-meta">${av.length === branches.length ? 'في جميع الفروع' : av.map((b) => esc(b.short_name)).join(' · ')}</p>
          </div>
        </article>`;
      }).join('')}
    </div>
  </div>
  ${sections.map((s) => sectionSheet(s, branches)).join('')}
</section>`;

  const offersHtml = `
<section class="offers-s" id="offers" aria-labelledby="offers-title">
  ${head(2, '<span id="offers-title">العروض</span>')}
  ${offers.length ? `<div class="offer-list">${offers.slice(0, 4).map((o, i) => offerRow(o, i, branches, sections)).join('')}</div>${offers.length > 4 ? linkArrow('/offers', 'كل العروض') : ''}` : `
  <div class="offers-empty">
    <p class="big-quote reveal-lines">العروض الجديدة تصل أولًا <span>لمن اختارها.</span></p>
    <p>اختر الفروع والأقسام التي تهمك، ويصلك العرض على واتساب فور إطلاقه. يمكنك الإيقاف في أي وقت.</p>
    <a class="btn" href="/subscribe"><span>اشترك في العروض</span><i aria-hidden="true"></i></a>
  </div>`}
</section>`;

  const branchesHtml = `
<section class="branches-s" id="branches" aria-labelledby="branches-title" data-branch-list>
  ${head(3, '<span id="branches-title">الفروع</span>', 'اختر الفرع لتعرف موقعه ودوامه وأقسامه، وتواصل مع خدمة العملاء مباشرة.')}
  <div class="b-list">
    ${branches.map((b, i) => {
      const wk = weekTable(b);
      const secs = sections.filter((s) => b.sectionIds.includes(s.id));
      return `<details class="b-row" data-bid="${b.id}">
        <summary data-cursor="افتح">
          <span class="b-n">${AR_NUM(i + 1)}</span>
          <span class="b-name"><small>${esc(b.brand)}</small>${esc(b.short_name)}</span>
          <span class="b-st">${status(b)}</span>
          <span class="b-plus" aria-hidden="true"></span>
        </summary>
        <div class="b-detail">
          <div class="b-win">${win(b, 'mall', { label: b.name, draw: true })}</div>
          <dl class="b-facts">
            <div><dt>الموقع</dt><dd>${b.address ? esc(b.address) : 'المدينة المنورة'}${b.maps_url ? ` · <a class="ul" href="${esc(b.maps_url)}" target="_blank" rel="noopener" data-track="directions_click" data-branch="${b.id}">الاتجاهات</a>` : ''}</dd></div>
            <div><dt>الدوام</dt><dd>${wk ? wk.map((d) => `<span class="wk"><b>${d.name}</b>${d.periods.length ? d.periods.map(esc).join(' · ') : 'مغلق'}</span>`).join('') : 'تواصل معنا لمعرفة الدوام الحالي'}</dd></div>
            <div><dt>الأقسام</dt><dd>${secs.map((s) => esc(s.name)).join(' · ')}</dd></div>
            ${b.services.length ? `<div><dt>الخدمات</dt><dd>${b.services.map((k) => esc(SERVICE_LABELS[k])).join(' · ')}</dd></div>` : ''}
            <div><dt>خدمة العملاء</dt><dd><a href="tel:${esc(b.phone)}" dir="ltr" class="ul" data-track="call_click" data-branch="${b.id}">${esc(b.phone)}</a></dd></div>
          </dl>
          <div class="b-actions">${waBtn(b, {}, 'واتساب الفرع')}${linkArrow(`/branches/${esc(b.slug)}`, 'صفحة الفرع', 'data-morph')}</div>
        </div>
      </details>`;
    }).join('')}
  </div>
</section>`;

  const services = [
    ['التوصيل', 'اختياراتك تصلك إلى جميع مناطق المملكة. توضّح خدمة العملاء الرسوم والمدة عند الطلب.'],
    ['الطلب عبر واتساب', 'تواصل مع واتساب الفرع مباشرة برسالة جاهزة تذكر الفرع والقسم أو العرض.'],
    ['خيارات الدفع', 'تابي وتمارا في الفروع المعتمدة، وفق شروط الأهلية الحالية لدى مقدم الخدمة.'],
    ['رأيك يهمنا', 'أرسل ملاحظة أو شكوى واحصل على رقم متابعة، ويتواصل معك موظف الفرع المختص.'],
  ];
  const servicesHtml = `
<section class="services-s" id="services" aria-labelledby="services-title">
  ${head(4, '<span id="services-title">خدمة العملاء</span>')}
  <div class="svc">
    ${services.map(([t, d], i) => `<div class="svc-i reveal" style="--i:${i}"><span class="svc-n">${AR_NUM(i + 1)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}
  </div>
  <div class="svc-cta">${linkArrow('/feedback', 'أرسل ملاحظة')}</div>
</section>`;

  const reviewsHtml = reviews.length ? `
<section class="reviews-s" aria-labelledby="rev-title">
  ${head(5, '<span id="rev-title">من تجارب عملائنا</span>', 'تجارب مختارة من Google بنصها الأصلي.')}
  <div class="rev-row">${reviews.slice(0, 3).map((r) => `<figure class="rev reveal"><blockquote>«${esc(r.text)}»</blockquote>
    <figcaption>${esc(r.author || 'عميل')} · ${esc(r.branch)} · ${'★'.repeat(r.rating)} · ${esc(formatDate(r.review_time))} · Google</figcaption></figure>`).join('')}</div>
</section>` : '';

  const faqHtml = `
<section class="faq-s" id="faq" aria-labelledby="faq-title">
  ${head(reviews.length ? 6 : 5, '<span id="faq-title">أسئلة متكررة</span>')}
  <div class="faq-list">${faqs.map((f) => `<details class="qa"><summary><span>${esc(f.question)}</span><i aria-hidden="true"></i></summary><div class="qa-a"><p>${esc(f.answer)}</p></div></details>`).join('')}</div>
</section>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${config.publicUrl}/#org`, name: 'ماك سنتر', alternateName: 'Mac Center', url: config.publicUrl, logo: `${config.publicUrl}/img/logo-vertical.svg` },
      ...branches.map(branchLd),
    ],
  };

  return layout({
    path: '/', site, branches, jsonLd, intro: { autoplay: intro, sections },
    body: (occasionActive(occasionPreview) ? occasionHero() : '') + hero + about + departments + offersHtml + branchesHtml + servicesHtml + reviewsHtml + faqHtml + contactDialog(branches),
    bodyClass: 'home',
  });
}

function sectionSheet(s, branches) {
  return `<dialog class="sheet" data-section-sheet="${esc(s.slug)}" aria-labelledby="sheet-${esc(s.slug)}">
    <form method="dialog" class="sheet-x"><button aria-label="إغلاق"><span>إغلاق</span><i aria-hidden="true"></i></button></form>
    <div class="sheet-win">${win(s, s.art, { label: s.name, draw: true })}</div>
    <div class="sheet-body">
      <h2 id="sheet-${esc(s.slug)}">${esc(s.name)}</h2>
      <p class="sheet-tag">${esc(s.tagline)}</p>
      <p>${esc(s.description)}</p>
      <p class="label">استفسر من الفرع</p>
      <ul class="sheet-list">
        ${branches.filter((b) => s.branchIds.includes(b.id)).map((b) => `<li><span><b>${esc(b.name)}</b>${status(b)}</span>
          <a class="link-arrow" href="${esc(waLink(b.whatsapp, inquiryText(b, { section: s })))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}"><span>واتساب</span><i aria-hidden="true"></i></a></li>`).join('')}
      </ul>
    </div>
  </dialog>`;
}

function offerRow(o, i, branches, sections) {
  const bn = branches.filter((b) => o.branchIds.includes(b.id)).map((b) => b.short_name);
  const kind = sections.find((s) => o.sectionIds.includes(s.id))?.art || 'mall';
  return `<a class="offer-row reveal" href="/offers/${esc(o.slug)}" data-cursor="التفاصيل">
    <span class="o-n">${AR_NUM(i + 1)}</span>
    <span class="o-win">${win(o, kind)}</span>
    <span class="o-body"><b>${esc(o.title)}</b><span>${esc(o.summary || '')}</span></span>
    <span class="o-meta">${o.discount ? `<em>${esc(o.discount)}</em>` : ''}<span>${esc(bn.join(' · '))}</span><span>حتى ${esc(formatDate(o.ends_at))}</span></span>
  </a>`;
}

export function contactDialog(branches) {
  return `<dialog class="sheet sheet-sm" id="contact" aria-labelledby="contact-title">
    <form method="dialog" class="sheet-x"><button aria-label="إغلاق"><span>إغلاق</span><i aria-hidden="true"></i></button></form>
    <div class="sheet-body">
      <h2 id="contact-title">تواصل مع الفرع</h2>
      <ul class="sheet-list">
        ${branches.map((b) => `<li><span><b>${esc(b.name)}</b>${status(b)}</span>
          <span class="sheet-acts"><a class="link-arrow" href="${esc(waLink(b.whatsapp, inquiryText(b)))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}"><span>واتساب</span><i aria-hidden="true"></i></a>
          <a class="ul" href="tel:${esc(b.phone)}" dir="ltr" data-track="call_click" data-branch="${b.id}">${esc(b.phone)}</a></span></li>`).join('')}
      </ul>
    </div>
  </dialog>`;
}

function branchLd(b) {
  return {
    '@type': 'Store', '@id': `${config.publicUrl}/branches/${b.slug}#store`, name: b.name, url: `${config.publicUrl}/branches/${b.slug}`,
    telephone: '+' + b.whatsapp, parentOrganization: { '@id': `${config.publicUrl}/#org` },
    address: { '@type': 'PostalAddress', addressLocality: 'المدينة المنورة', addressCountry: 'SA', ...(b.address ? { streetAddress: b.address } : {}) },
    ...(b.lat != null ? { geo: { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng } } : {}),
    ...(b.hours ? { openingHoursSpecification: openingHoursSpec(b) } : {}),
    ...(b.maps_url ? { hasMap: b.maps_url } : {}),
  };
}

// غلاف الصفحات الداخلية: مساحة خضراء بعنوان كبير ونافذة العربة
function pageHead({ crumbs = [], title, lead = '', aside = '', kind, item }) {
  return `<section class="p-head">
    <div class="p-head-copy">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a>${crumbs.map(([h, t]) => `<span>/</span><a href="${h}">${t}</a>`).join('')}</nav>
      <h1 class="reveal-lines">${title}</h1>
      ${lead ? `<p class="p-lead">${lead}</p>` : ''}
      ${aside}
    </div>
    ${kind ? `<div class="p-head-win">${win(item, kind, { draw: true, cls: 'arch-lg' })}</div>` : ''}
  </section>`;
}

// ———————————————————— صفحة الفرع ————————————————————

export function branchPage({ site, branch: b, branches, sections, offers }) {
  const secs = sections.filter((s) => b.sectionIds.includes(s.id));
  const wk = weekTable(b);
  const notes = (b.exceptions || []).filter((e) => (e.to || e.from) >= new Date().toISOString().slice(0, 10));
  const mapQuery = b.lat != null ? `${b.lat},${b.lng}` : `${b.name} المدينة المنورة`;
  const body = `
${pageHead({ crumbs: [['/#branches', 'الفروع']], title: esc(b.name), lead: esc(b.tagline), kind: 'mall', item: b,
    aside: `<div class="p-head-meta">${status(b)}<a class="ul" href="tel:${esc(b.phone)}" dir="ltr" data-track="call_click" data-branch="${b.id}">${esc(b.phone)}</a></div><div class="p-head-acts">${waBtn(b, {}, 'واتساب الفرع')}${b.maps_url ? linkArrow(esc(b.maps_url), 'الاتجاهات', `target="_blank" rel="noopener" data-track="directions_click" data-branch="${b.id}"`) : ''}</div>` })}
<section class="sheetwrap">
  <div class="cols">
    <div class="col">
      <p class="label">الدوام</p>
      ${wk ? `<table class="week">${wk.map((d) => `<tr><th>${d.name}</th><td>${d.periods.length ? d.periods.map(esc).join('<br>') : '<span class="muted">مغلق</span>'}</td></tr>`).join('')}</table>
        ${notes.length ? `<ul class="notes">${notes.map((e) => `<li><b>${esc(e.label || 'دوام خاص')}</b> ${esc(e.from)}${e.to && e.to !== e.from ? ' – ' + esc(e.to) : ''}</li>`).join('')}</ul>` : ''}`
        : `<p class="big-p">لم يُعتمد الدوام المنشور بعد. تواصل مع الفرع لمعرفة أوقات العمل الحالية.</p>${linkArrow(esc(waLink(b.whatsapp, inquiryText(b) + ' أرغب في معرفة أوقات الدوام.')), 'اسأل عن الدوام', `target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}"`)}`}
    </div>
    <div class="col">
      <p class="label">الموقع</p>
      <p class="big-p">${b.address ? esc(b.address) : 'المدينة المنورة'}</p>
      <div class="map" data-map="${esc(`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed&hl=ar`)}">
        <button type="button" class="link-arrow" data-load-map><span>عرض الخريطة</span><i aria-hidden="true"></i></button>
      </div>
    </div>
  </div>
  <p class="label">الأقسام في الفرع</p>
  <div class="mini-list">${secs.map((s, i) => `<a class="mini" href="${esc(waLink(b.whatsapp, inquiryText(b, { section: s })))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}" data-cursor="واتساب">
    <span class="mini-n">${AR_NUM(i + 1)}</span><span class="mini-win">${win(s, s.art)}</span><span class="mini-t"><b>${esc(s.name)}</b><small>${esc(s.tagline)}</small></span><span class="mini-go">استفسار</span></a>`).join('')}</div>
  <div class="cols">
    ${b.services.length ? `<div class="col"><p class="label">الخدمات</p><p class="big-p">${b.services.map((k) => esc(SERVICE_LABELS[k])).join(' · ')}</p>${b.services.some((s) => s === 'tabby' || s === 'tamara') ? '<p class="muted small">التقسيط وفق شروط الأهلية الحالية لدى مقدم الخدمة.</p>' : ''}</div>` : ''}
    <div class="col"><p class="label">رأيك يهمنا</p><p class="big-p">شاركنا ملاحظة أو مقترحًا عن تجربتك في ${esc(b.short_name)}.</p>
      <div class="row-links">${linkArrow(`/feedback?branch=${b.id}`, 'أرسل ملاحظة')}${linkArrow(esc(b.google_review_url || b.maps_url), 'قيّمنا على Google', `target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}"`)}</div></div>
  </div>
</section>
${offers.length ? `<section class="offers-s">${head(1, 'عروض الفرع')}<div class="offer-list">${offers.map((o, i) => offerRow(o, i, branches, sections)).join('')}</div></section>` : ''}
${contactDialog(branches)}`;
  return layout({
    title: b.name, path: `/branches/${b.slug}`, site, branches,
    description: `${b.name} في المدينة المنورة: الموقع ورقم التواصل ${b.phone} والدوام والأقسام والخدمات والعروض الحالية.`,
    jsonLd: { '@context': 'https://schema.org', ...branchLd(b) }, body, bodyClass: 'page-branch',
  });
}

// ———————————————————— العروض ————————————————————

export function offersPage({ site, branches, sections, offers }) {
  const body = `${pageHead({ title: 'العروض', lead: 'العروض السارية في فروع ماك سنتر ومجمع عادل الدولي.' })}
  <section class="offers-s">
    ${offers.length ? `<div class="offer-list">${offers.map((o, i) => offerRow(o, i, branches, sections)).join('')}</div>` : `<div class="offers-empty"><p class="big-quote">لا توجد عروض سارية الآن. <span>العرض القادم يصل لمشتركينا أولًا.</span></p><a class="btn" href="/subscribe"><span>اشترك في العروض</span><i aria-hidden="true"></i></a></div>`}
  </section>${contactDialog(branches)}`;
  return layout({ title: 'العروض', path: '/offers', site, branches, body });
}

export function offerPage({ site, offer: o, branches, sections }) {
  const bs = branches.filter((b) => o.branchIds.includes(b.id));
  const ss = sections.filter((s) => o.sectionIds.includes(s.id));
  const state = o.phase === 'active' ? '<span class="st st-open"><i></i>عرض ساري</span>' : `<span class="st st-closed"><i></i>${o.phase === 'scheduled' ? 'يبدأ قريبًا' : 'انتهى العرض'}</span>`;
  const body = `
${pageHead({ crumbs: [['/offers', 'العروض']], title: esc(o.title), lead: esc(o.summary || ''), kind: ss[0]?.art || 'mall', item: o,
    aside: `<div class="p-head-meta">${state}${o.discount ? `<span class="gold">${esc(o.discount)}</span>` : ''}<span>${esc(formatDate(o.starts_at))} – ${esc(formatDate(o.ends_at))}</span></div>` })}
<section class="sheetwrap">
  <div class="cols">
    <div class="col"><p class="label">الفروع</p><p class="big-p">${bs.map((b) => esc(b.name)).join('<br>')}</p></div>
    <div class="col"><p class="label">الأقسام</p><p class="big-p">${ss.length ? ss.map((s) => esc(s.name)).join('<br>') : 'جميع الأقسام'}</p></div>
  </div>
  ${o.description ? `<p class="label">التفاصيل</p><p class="big-p pre">${esc(o.description)}</p>` : ''}
  ${o.terms ? `<p class="label">الشروط</p><p class="pre">${esc(o.terms)}</p>` : ''}
  <p class="label">استفسر عن العرض</p>
  <ul class="sheet-list wide">${bs.map((b) => `<li><span><b>${esc(b.name)}</b>${status(b)}</span>${linkArrow(esc(waLink(b.whatsapp, inquiryText(b, { offer: o }))), 'واتساب', `target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}"`)}</li>`).join('')}</ul>
</section>${contactDialog(branches)}`;
  return layout({ title: o.title, path: `/offers/${o.slug}`, site, branches, description: o.summary || o.title, body });
}

// ———————————————————— الاشتراك ————————————————————

function choiceGroup(name, items, selected, { legend, error }) {
  return `<fieldset class="pick ${error ? 'has-error' : ''}" ${error ? `aria-describedby="err-${name}"` : ''}>
    <legend>${legend}</legend>
    ${items.map((it, i) => `<label class="pick-row">
      <input type="checkbox" name="${name}[]" value="${it.id}" ${selected.includes(it.id) ? 'checked' : ''}>
      <span class="pick-n">${AR_NUM(i + 1)}</span><span class="pick-t">${esc(it.name)}</span><span class="pick-box" aria-hidden="true"></span>
    </label>`).join('')}
    ${error ? `<p class="err" id="err-${name}" role="alert">${esc(error)}</p>` : ''}
  </fieldset>`;
}

function formShell({ title, lead, steps, kind, form, extra = '' }) {
  return `<section class="f-page">
    <aside class="f-aside">
      <div class="f-win">${arch(kind, { draw: true })}</div>
      <h1 class="reveal-lines">${title}</h1>
      ${lead ? `<p>${lead}</p>` : ''}
      ${steps ? `<ol class="f-steps">${steps.map((s, i) => `<li><span>${AR_NUM(i + 1)}</span>${s}</li>`).join('')}</ol>` : ''}
      ${extra}
    </aside>
    <div class="f-main">${form}${extra}</div>
  </section>`;
}

export function subscribePage({ site, branches, sections, values = {}, errors = {}, qr }) {
  const selB = (values.branches || []).map(Number), selS = (values.sections || []).map(Number);
  const form = `<form class="f" method="post" action="/subscribe" novalidate data-subscribe>
    ${qr ? `<input type="hidden" name="qr" value="${esc(qr)}">` : ''}
    ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
    ${choiceGroup('branches', branches.map((b) => ({ id: b.id, name: b.name })), selB, { legend: 'الفروع', error: errors.branches })}
    ${choiceGroup('sections', sections.map((s) => ({ id: s.id, name: s.name })), selS, { legend: 'الأقسام', error: errors.sections })}
    <div class="field"><label for="name">الاسم <span class="muted">اختياري</span></label><input id="name" name="name" autocomplete="given-name" maxlength="60" value="${esc(values.name || '')}"></div>
    <label class="consent ${errors.consent ? 'has-error' : ''}"><input type="checkbox" name="consent" value="1" required ${errors.consent ? 'aria-invalid="true" aria-describedby="err-consent"' : ''}><span class="pick-box" aria-hidden="true"></span>
      <span>${esc(CONSENT_TEXT)} <a class="ul" href="/privacy" target="_blank">سياسة الخصوصية</a></span></label>
    ${errors.consent ? `<p class="err" id="err-consent" role="alert">${esc(errors.consent)}</p>` : ''}
    <button class="btn btn-block" type="submit"><span>متابعة إلى واتساب</span><i aria-hidden="true"></i></button>
    <p class="muted small">لا يكتمل الاشتراك إلا بعد وصول رسالتك. ولإيقافه في أي وقت أرسل «إيقاف».</p>
  </form>`;
  return layout({ title: 'الاشتراك في العروض', path: '/subscribe', site, branches, bodyClass: 'page-form',
    body: formShell({ title: 'اختر ما يهمك<br>ودع العروض تصلك', kind: 'dress', steps: ['اختر الفروع والأقسام', 'اضغط «متابعة إلى واتساب»', 'أرسل الرسالة الجاهزة بنفسك'], form }) });
}

function statusVisual() {
  return `<div class="sv" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="sv-ring" cx="60" cy="60" r="54" pathLength="1"/><path class="sv-ok" pathLength="1" d="M38 62l15 15 30-32"/></svg></div>`;
}

export function subscribeStatusPage({ site, branches, statusKey, status: st, waUrl }) {
  const body = `<section class="center-page" data-sub-status="${esc(statusKey)}" data-state="${esc(st.status)}" aria-live="polite">
    ${statusVisual()}
    <div data-when="awaiting"><h1>بانتظار رسالتك على واتساب</h1><p>أرسل الرسالة الجاهزة كما هي. نؤكد اشتراكك هنا فور وصولها.</p>
      ${waUrl ? `<a class="btn" href="${esc(waUrl)}" data-wa-open><span>فتح واتساب</span><i aria-hidden="true"></i></a>` : ''}
      <p class="muted small">الرمز صالح لمدة 30 دقيقة. إذا أغلقت واتساب دون إرسال يبقى الاشتراك غير مكتمل.</p></div>
    <div data-when="confirmed"><h1>تم تفعيل اشتراكك</h1><p>وصلتك رسالة ترحيب فيها الفروع والأقسام التي اخترتها، وطريقة تعديلها أو إيقافها.</p>${linkArrow('/', 'العودة للرئيسية')}</div>
    <div data-when="expired"><h1>انتهت صلاحية الرمز</h1><p>لم تصل رسالة الاشتراك خلال المدة. ابدأ من جديد وسنجهز لك رسالة جديدة.</p><a class="btn" href="/subscribe"><span>ابدأ من جديد</span><i aria-hidden="true"></i></a></div>
  </section>`;
  return layout({ title: 'تأكيد الاشتراك', path: '/subscribe', site, branches, body, bodyClass: 'page-form' });
}

export function preferencesPage({ site, branches, sections, sub, token, saved, errors = {} }) {
  const active = sub && sub.status === 'active';
  const form = `<form class="f" method="post" action="/preferences/${esc(token)}">
    ${saved ? `<div class="alert alert-ok" role="status">${esc(saved)}</div>` : ''}
    ${active ? `${choiceGroup('branches', branches.map((b) => ({ id: b.id, name: b.name })), sub.branchIds, { legend: 'الفروع', error: errors.branches })}
      ${choiceGroup('sections', sections.map((s) => ({ id: s.id, name: s.name })), sub.sectionIds, { legend: 'الأقسام', error: errors.sections })}
      <p class="muted small">إلغاء اختيار كل الفروع أو كل الأقسام يوقف الاشتراك بالكامل.</p>
      <div class="row-links"><button class="btn" name="action" value="save"><span>حفظ الاهتمامات</span><i aria-hidden="true"></i></button><button class="link-arrow danger" name="action" value="stop"><span>إيقاف كل الرسائل</span><i aria-hidden="true"></i></button></div>`
      : `<p class="big-p">اشتراكك متوقف حاليًا، ولن تصلك رسائل عروض.</p><a class="btn" href="/subscribe"><span>اشترك من جديد</span><i aria-hidden="true"></i></a>`}
  </form>`;
  return layout({ title: 'إدارة الاشتراك', path: '/preferences', site, branches, bodyClass: 'page-form', body: formShell({ title: 'اهتماماتك', kind: 'stationery', form }) });
}

// ———————————————————— الملاحظات ————————————————————

export function feedbackPage({ site, branches, sections, values = {}, errors = {}, qr }) {
  const sel = (v, x) => (String(v) === String(x) ? 'selected' : '');
  const fieldErr = (k) => (errors[k] ? `<p class="err" id="err-${k}" role="alert">${esc(errors[k])}</p>` : '');
  const inv = (k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');
  const type = values.type || 'experience';
  const form = `<form class="f" method="post" action="/feedback" enctype="multipart/form-data" novalidate data-feedback>
    ${qr ? `<input type="hidden" name="qr" value="${esc(qr)}">` : ''}
    ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
    <fieldset class="seg ${errors.type ? 'has-error' : ''}"><legend>نوع الملاحظة</legend>
      <div class="seg-row">${Object.entries(TICKET_TYPES).map(([k, v]) => `<label><input type="radio" name="type" value="${k}" ${type === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>${fieldErr('type')}</fieldset>
    <div class="row2">
      <div class="field ${errors.branch ? 'has-error' : ''}"><label for="f-branch">الفرع</label><select id="f-branch" name="branch" required ${inv('branch')}><option value="">اختر الفرع</option>${branches.map((b) => `<option value="${b.id}" ${sel(values.branch, b.id)}>${esc(b.name)}</option>`).join('')}</select>${fieldErr('branch')}</div>
      <div class="field"><label for="f-section">القسم <span class="muted">اختياري</span></label><select id="f-section" name="section"><option value="">بدون تحديد</option>${sections.map((s) => `<option value="${s.id}" ${sel(values.section, s.id)}>${esc(s.name)}</option>`).join('')}</select></div>
    </div>
    <fieldset class="rating"><legend>قيّم تجربتك <span class="muted">اختياري، من ١ إلى ٥</span></legend>
      <div class="rate">${[1, 2, 3, 4, 5].map((r) => `<input type="radio" id="r${r}" name="rating" value="${r}" ${String(values.rating) === String(r) ? 'checked' : ''}><label for="r${r}"><span class="sr">${r} من 5</span><span aria-hidden="true">${'٠١٢٣٤٥'[r]}</span></label>`).join('')}</div></fieldset>
    <div class="field"><label for="f-topic">الموضوع <span class="muted">اختياري</span></label><select id="f-topic" name="topic"><option value="">اختر الموضوع</option>${Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${sel(values.topic, k)}>${v}</option>`).join('')}</select></div>
    <div class="field ${errors.body ? 'has-error' : ''}"><label for="f-body">ملاحظتك</label><textarea id="f-body" name="body" rows="4" maxlength="3000" ${inv('body')} placeholder="اكتب باختصار ما حدث أو ما تقترحه">${esc(values.body || '')}</textarea>${fieldErr('body')}</div>
    <div class="field ${errors.images ? 'has-error' : ''}"><label for="f-images">صور <span class="muted">حتى 3 صور، 10 ميجابايت للصورة</span></label><input id="f-images" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple ${inv('images')} data-max="3">${fieldErr('images')}</div>
    <div class="row2">
      <div class="field"><label for="f-name">الاسم <span class="muted">اختياري</span></label><input id="f-name" name="name" autocomplete="name" value="${esc(values.name || '')}"></div>
      <div class="field ${errors.phone ? 'has-error' : ''}"><label for="f-phone">رقم الجوال <span class="muted" data-phone-hint>اختياري</span></label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="05xxxxxxxx" value="${esc(values.phone || '')}" ${inv('phone')}>${fieldErr('phone')}</div>
    </div>
    <label class="consent"><input type="checkbox" name="wants_contact" value="1" ${values.wants_contact || type === 'contact' ? 'checked' : ''} data-wants-contact><span class="pick-box" aria-hidden="true"></span><span>أرغب أن يتواصل معي الفرع بشأن هذه الملاحظة</span></label>
    <label class="consent sub ${errors.contact_consent ? 'has-error' : ''}" data-consent-row><input type="checkbox" name="contact_consent" value="1" ${values.contact_consent ? 'checked' : ''} ${inv('contact_consent')}><span class="pick-box" aria-hidden="true"></span><span>أوافق على التواصل معي عبر الهاتف أو واتساب لمتابعة هذه الملاحظة فقط، دون رسائل تسويقية.</span></label>
    ${fieldErr('contact_consent')}
    <button class="btn btn-block" type="submit" data-submit><span>إرسال الملاحظة</span><i aria-hidden="true"></i></button>
  </form>`;
  const extra = `<div class="g-note"><p>يمكنك أيضًا مشاركة تجربتك علنًا على Google، أيًا كانت.</p><div class="row-links">${branches.map((b) => linkArrow(esc(b.google_review_url || b.maps_url), esc(b.short_name), `target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}"`)).join('')}</div></div>`;
  return layout({ title: 'الملاحظات والشكاوى', path: '/feedback', site, branches, bodyClass: 'page-form',
    body: formShell({ title: 'رأيك يصنع<br>تجربة أفضل', lead: 'تحصل على رقم متابعة فور الإرسال، وإذا تركت رقمك يتواصل معك موظف الفرع المختص.', kind: 'home', form, extra }) });
}

export function feedbackDonePage({ site, branches, ticket, result }) {
  const b = result?.branch || branches.find((x) => x.name === ticket.branch);
  const body = `<section class="center-page" data-state="confirmed">
    ${statusVisual()}
    <div><h1>استلمنا ملاحظتك</h1>
      <p class="ref">رقم المتابعة <b dir="ltr">${esc(ticket.ref)}</b></p>
      ${result?.responseNote ? `<p>${esc(result.responseNote)}</p>` : ''}
      <div class="row-links center">${linkArrow(`/track/${esc(result?.trackKey || '')}`, 'تتبع الملاحظة')}${b ? linkArrow(esc(b.google_review_url || b.maps_url), 'شارك تجربتك على Google', `target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}"`) : ''}</div>
      <p class="muted small">احفظ رابط التتبع لمتابعة حالة ملاحظتك.</p></div>
  </section>`;
  return layout({ title: 'تم الإرسال', path: '/feedback', site, branches, body, bodyClass: 'page-form' });
}

export function trackPage({ site, branches, t, key, verified, error }) {
  const idx = t.status === 'closed' || t.status === 'resolved' ? 2 : t.status === 'new' ? 0 : 1;
  const body = `<section class="center-page track">
    <p class="label">تتبع الملاحظة</p>
    <h1 dir="ltr" class="ref-big">${esc(t.ref)}</h1>
    <p>${esc(t.type)} · ${esc(t.branch || '')}</p>
    <ol class="progress" aria-label="الحالة">${['الاستلام', 'المتابعة', 'الحل'].map((s, i) => `<li class="${i <= idx ? 'done' : ''}" ${i === idx ? 'aria-current="step"' : ''}><span>${s}</span></li>`).join('')}</ol>
    <p>الحالة الحالية: <b>${esc(t.statusName)}</b></p>
    ${verified ? `<ul class="timeline">${t.events.map((e) => `<li><time>${esc(isoToRiyadhLocal(e.at.replace(' ', 'T') + 'Z'))}</time><span>${esc(e.body || '')}</span></li>`).join('')}</ul>`
      : t.hasPhone ? `<form method="post" action="/track/${esc(key)}" class="inline-form"><label for="tail">لعرض التفاصيل أدخل آخر 4 أرقام من جوالك</label>
        <div class="row-inline"><input id="tail" name="tail" inputmode="numeric" maxlength="4" pattern="\\d{4}" dir="ltr" required><button class="btn"><span>تحقق</span><i aria-hidden="true"></i></button></div>
        ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}</form>` : ''}
    ${t.branchPhone ? `<p class="muted small">للاستفسار: <a class="ul" href="tel:${esc(t.branchPhone)}" dir="ltr">${esc(t.branchPhone)}</a></p>` : ''}
  </section>`;
  return layout({ title: 'تتبع الملاحظة', path: '/track', site, branches, body, bodyClass: 'page-form' });
}

// ———————————————————— صفحات ثابتة ————————————————————

export function privacyPage({ site, branches }) {
  const body = `${pageHead({ title: 'سياسة الخصوصية', lead: 'كيف نتعامل مع بياناتك.' })}
  <section class="sheetwrap prose">
  <p class="notice">نموذج أولي يحتاج مراجعة قانونية واعتماد الإدارة قبل النشر، بما يلائم نظام حماية البيانات الشخصية في المملكة.</p>
  <h2>الجهة المسؤولة</h2><p>ماك سنتر ومجمع عادل الدولي بالمدينة المنورة. للتواصل بشأن بياناتك: ${branches.map((b) => `${esc(b.name)} <a class="ul" href="tel:${esc(b.phone)}" dir="ltr">${esc(b.phone)}</a>`).join('، ')}.</p>
  <h2>البيانات التي نجمعها والغرض منها</h2>
  <ul>
    <li><b>اشتراك العروض:</b> رقم واتساب، والاسم إن أدخلته، والفروع والأقسام التي اخترتها، ونص موافقتك وتاريخها ومصدر الاشتراك. الغرض: إرسال العروض التي اخترتها فقط.</li>
    <li><b>الملاحظات والشكاوى:</b> نص الملاحظة والتقييم والصور المرفقة، والاسم ورقم الجوال إن أدخلتهما. الغرض: متابعة ملاحظتك وتحسين الخدمة. لا تستخدم هذه البيانات للتسويق.</li>
    <li><b>قياس الاستخدام:</b> أحداث مجمعة مثل زيارة رابط QR أو النقر على واتساب، دون أرقام أو نصوص شكاوى.</li>
  </ul>
  <h2>الموافقة وسحبها</h2><p>لا نرسل عروضًا إلا بعد موافقتك الصريحة عبر رسالة ترسلها بنفسك. يمكنك إيقاف الرسائل في أي وقت بإرسال «إيقاف»، أو تعديل اهتماماتك من رابط الإدارة المرسل إليك، ويطبق الإيقاف فورًا على الرسائل المنتظرة.</p>
  <h2>الاحتفاظ</h2><p>نحتفظ بالبيانات للمدة اللازمة للغرض الذي جمعت له وفق المدد التي تعتمدها الإدارة. محتوى تقييمات Google يخزن مؤقتًا بما لا يتجاوز 30 يومًا وفق شروط Google.</p>
  <h2>حقوقك</h2><p>لك حق الاطلاع على بياناتك وتصحيحها وطلب حذفها وسحب موافقتك، بالتواصل مع خدمة عملاء أي فرع.</p>
  </section>`;
  return layout({ title: 'سياسة الخصوصية', path: '/privacy', site, branches, body });
}

export function notFoundPage({ site, branches }) {
  const body = `<section class="center-page"><div class="nf">${arch('bags', { draw: true })}</div>
    <h1>هذه الصفحة غير موجودة</h1><p>ربما تغير الرابط أو انتهى العرض.</p><div class="row-links center">${linkArrow('/', 'الرئيسية')}${linkArrow('/offers', 'العروض')}</div></section>`;
  return layout({ title: 'غير موجودة', path: '/404', site, branches, body, bodyClass: 'page-form' });
}
