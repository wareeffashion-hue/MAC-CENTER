import { esc } from '../http.js';
import { config } from '../config.js';
import { layout, CART } from './layout.js';
import { icon } from './icons.js';
import { art } from './art.js';
import { weekTable, openingHoursSpec } from '../lib/hours.js';
import { formatDate, isoToRiyadhLocal } from '../lib/time.js';
import { SERVICE_LABELS, CONSENT_TEXT, waLink, inquiryText } from '../modules/catalog.js';
import { TICKET_TYPES, TOPICS } from '../modules/tickets.js';

const n = (v) => String(v);
const ATTR = (o) => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

function picture(item, kind, label) {
  if (item.image) return `<img src="${esc(item.image)}" alt="${esc(label || '')}" loading="lazy" decoding="async" width="800" height="800">`;
  return art(kind, label);
}

function statusPill(b) {
  const s = b.status || { known: false };
  if (!s.known) return `<span class="pill pill-muted">${icon('clock', { size: 16 })}<span>تواصل لمعرفة الدوام</span></span>`;
  return `<span class="pill ${s.open ? (s.closingSoon ? 'pill-warn' : 'pill-open') : 'pill-closed'}"><i class="dot"></i><span>${esc(s.label)}</span></span>`;
}

function branchActions(b, ctx = {}) {
  return `<div class="actions">
    <a class="btn btn-wa" href="${esc(waLink(b.whatsapp, inquiryText(b, ctx)))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">${icon('whatsapp')}<span>واتساب</span></a>
    <a class="btn btn-outline" href="tel:${esc(b.phone)}" data-track="call_click" data-branch="${b.id}">${icon('phone')}<span dir="ltr">${esc(b.phone)}</span></a>
    ${b.maps_url ? `<a class="btn btn-ghost" href="${esc(b.maps_url)}" target="_blank" rel="noopener" data-track="directions_click" data-branch="${b.id}">${icon('route')}<span>الاتجاهات</span></a>` : ''}
  </div>`;
}

function chips(items) {
  return `<ul class="chips">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

function sectionTitle(eyebrow, title, extra = '') {
  return `<div class="sec-head reveal"><p class="eyebrow"><span class="speed" aria-hidden="true"><i></i><i></i><i></i></span>${eyebrow}</p><h2>${title}</h2>${extra}</div>`;
}

function offerCard(o, branches, sections) {
  const bn = branches.filter((b) => o.branchIds.includes(b.id)).map((b) => b.short_name);
  const sn = sections.filter((s) => o.sectionIds.includes(s.id)).map((s) => s.name);
  const artKind = sections.find((s) => o.sectionIds.includes(s.id))?.art || 'mall';
  return `<article class="offer reveal">
    <a class="offer-win" href="/offers/${esc(o.slug)}" tabindex="-1" aria-hidden="true">${picture(o, artKind, '')}${o.discount ? `<span class="offer-badge">${esc(o.discount)}</span>` : ''}</a>
    <div class="offer-body">
      <p class="meta">${icon('clock', { size: 16 })}<span>حتى ${esc(formatDate(o.ends_at))}</span></p>
      <h3><a href="/offers/${esc(o.slug)}">${esc(o.title)}</a></h3>
      ${o.summary ? `<p>${esc(o.summary)}</p>` : ''}
      ${chips([...bn, ...sn])}
    </div>
  </article>`;
}

// ———————————————————— الرئيسية ————————————————————

const WINDOWS = [
  { cls: 'w-fashion', shape: 'arch' }, { cls: 'w-dress', shape: 'round' }, { cls: 'w-toys', shape: 'circle' },
  { cls: 'w-home', shape: 'pill' }, { cls: 'w-stationery', shape: 'round' }, { cls: 'w-bags', shape: 'round' },
];

export function homePage({ site, branches, sections, offers, faqs, reviews }) {
  const winSections = ['family-fashion', 'occasion-dresses', 'toys', 'furnishings', 'stationery', 'shoes-bags']
    .map((slug) => sections.find((s) => s.slug === slug)).map((s, i) => s || sections[i]).filter(Boolean);

  const hero = `
<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow hero-eyebrow"><span class="speed" aria-hidden="true"><i></i><i></i><i></i></span>المدينة المنورة<span class="hide-xs"> · ${n(branches.length)} فروع · توصيل لجميع مناطق المملكة</span></p>
      <h1 id="hero-title" class="hero-title">
        <span class="hero-brand">ماك سنتر</span>
        <span class="words" data-words>${esc(site.heroTitle || 'اختيارات العائلة في وجهة واحدة').split(' ').map((w, i, all) => `<span class="w" style="--i:${i}">${esc(w)}</span>${i === Math.ceil(all.length / 2) - 2 ? '<br>' : ''}`).join(' ')}</span>
      </h1>
      <p class="lead">${esc(site.heroText || '')}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg" href="/subscribe">${icon('bell', { size: 20, cls: 'ring' })}<span>اشترك في العروض</span>${icon('arrow', { size: 20, cls: 'arr' })}</a>
        <a class="btn btn-outline btn-lg" href="#branches">${icon('pin', { size: 20 })}<span>اكتشف الفروع</span></a>
      </div>
    </div>
    <div class="windows" data-windows>
      <svg class="track" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="track-bg" d="M2 3 H44 Q50 3 50 9 V36 Q50 42 56 42 H100"/>
        <path class="track-line" pathLength="1" d="M-2 3 H44 Q50 3 50 9 V50 Q50 56 44 56 H36 Q32 56 32 60 V90 Q32 96 38 96 H81"/>
      </svg>
      ${winSections.map((s, i) => `
      <a class="win ${WINDOWS[i].cls} shape-${WINDOWS[i].shape}" href="#sec-${esc(s.slug)}" data-open-section="${esc(s.slug)}" style="--i:${i}" data-depth="${(i % 3) + 1}">
        <span class="win-art">${picture(s, s.art, s.name)}</span>
        <span class="win-label">${esc(s.name.length > 16 ? s.name.split(' ')[0] : s.name)}</span>
      </a>`).join('')}
      <span class="hero-cart" aria-hidden="true">${CART()}</span>
    </div>
  </div>
  <ul class="facts wrap" aria-label="لمحة">
    <li><b>${n(sections.length)}</b><span>أقسام للعائلة</span></li>
    <li><b>${n(branches.length)}</b><span>فروع في المدينة المنورة</span></li>
    <li><b>${icon('truck', { size: 26 })}</b><span>توصيل لجميع مناطق المملكة</span></li>
    <li><b>${icon('whatsapp', { size: 26 })}</b><span>الطلب والاستفسار عبر واتساب</span></li>
  </ul>
</section>`;

  const about = `
<section class="about" id="about" aria-labelledby="about-title">
  <div class="wrap about-grid">
    <div class="about-win reveal">${art('mall', 'تجربة التسوق في ماك سنتر')}<span class="about-tag">${icon('sparkle', { size: 18 })}وجهة تسوق واحدة للعائلة</span></div>
    <div class="about-copy">
      ${sectionTitle('عن ماك سنتر', '<span id="about-title">كل ما تحتاجه العائلة،<br>تحت سقف واحد</span>')}
      <p class="big reveal">${esc(site.about || '')}</p>
      <p class="reveal">${esc(site.about2 || '')}</p>
    </div>
  </div>
</section>`;

  const sectionsHtml = `
<section class="sections" id="sections" aria-labelledby="sections-title">
  <div class="wrap">
    ${sectionTitle('الأقسام', '<span id="sections-title">نوافذ على اختيارات العائلة</span>', '<p class="sec-sub">اختر القسم لتعرف وصفه والفروع المتاح فيها، وتواصل مباشرة للاستفسار.</p>')}
    <div class="bento">
      ${sections.map((s, i) => {
        const av = branches.filter((b) => s.branchIds.includes(b.id));
        return `<article class="tile reveal t-${i}" id="sec-${esc(s.slug)}" style="--i:${i}">
          <button class="tile-btn" type="button" data-open-section="${esc(s.slug)}" aria-haspopup="dialog">
            <span class="tile-art">${picture(s, s.art, '')}</span>
            <span class="tile-body">
              <span class="tile-name">${esc(s.name)}</span>
              <span class="tile-tag">${esc(s.tagline)}</span>
              <span class="tile-meta">${icon('pin', { size: 16 })}متاح في ${av.length === branches.length ? 'جميع الفروع' : av.map((b) => esc(b.short_name)).join('، ') || 'قريبًا'}<i class="tile-go">${icon('arrow', { size: 18 })}</i></span>
            </span>
          </button>
        </article>`;
      }).join('')}
    </div>
  </div>
  ${sections.map((s) => `
  <dialog class="sheet" data-section-sheet="${esc(s.slug)}" aria-labelledby="sheet-${esc(s.slug)}">
    <form method="dialog" class="sheet-close"><button class="icon-btn" aria-label="إغلاق">${icon('close', { size: 22 })}</button></form>
    <div class="sheet-art">${picture(s, s.art, s.name)}</div>
    <div class="sheet-body">
      <p class="eyebrow">قسم</p>
      <h2 id="sheet-${esc(s.slug)}">${esc(s.name)}</h2>
      <p class="sheet-tag">${esc(s.tagline)}</p>
      <p>${esc(s.description)}</p>
      <h3>استفسر من الفرع</h3>
      <ul class="sheet-branches">
        ${branches.filter((b) => s.branchIds.includes(b.id)).map((b) => `<li>
          <div><b>${esc(b.name)}</b>${statusPill(b)}</div>
          <a class="btn btn-wa btn-sm" href="${esc(waLink(b.whatsapp, inquiryText(b, { section: s })))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">${icon('whatsapp', { size: 18 })}<span>استفسار</span></a>
        </li>`).join('')}
      </ul>
    </div>
  </dialog>`).join('')}
</section>`;

  const offersHtml = `
<section class="offers" id="offers" aria-labelledby="offers-title">
  <div class="wrap">
    ${sectionTitle('العروض الحالية', '<span id="offers-title">عروض تتابعها بسهولة</span>', offers.length ? '<a class="link-more" href="/offers">كل العروض' + icon('arrow', { size: 18 }) + '</a>' : '')}
    ${offers.length ? `<div class="offer-grid">${offers.slice(0, 6).map((o) => offerCard(o, branches, sections)).join('')}</div>` : `
    <div class="empty-offers reveal">
      <div class="eo-art">${art('toys')}</div>
      <div>
        <h3>العروض الجديدة في الطريق</h3>
        <p>اشترك الآن واختر الفروع والأقسام التي تهمك، ليصلك أول عرض على واتساب فور إطلاقه.</p>
        <a class="btn btn-primary" href="/subscribe">${icon('bell', { size: 18, cls: 'ring' })}<span>اشترك في العروض</span></a>
      </div>
    </div>`}
  </div>
</section>`;

  const branchesHtml = `
<section class="branches" id="branches" aria-labelledby="branches-title">
  <div class="wrap">
    ${sectionTitle('الفروع', '<span id="branches-title">اختر الفرع المناسب لزيارتك</span>')}
    <div class="branch-switch reveal" data-tabs>
      <div class="tabs" role="tablist" aria-label="الفروع">
        ${branches.map((b, i) => `<button role="tab" id="tab-${b.id}" aria-controls="panel-${b.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
          <span class="tab-brand">${esc(b.brand)}</span><span class="tab-name">${esc(b.short_name)}</span></button>`).join('')}
        <span class="tab-ind" aria-hidden="true"></span>
      </div>
      ${branches.map((b, i) => {
        const wk = weekTable(b);
        const secs = sections.filter((s) => b.sectionIds.includes(s.id));
        return `<div class="panel" role="tabpanel" id="panel-${b.id}" aria-labelledby="tab-${b.id}" ${i === 0 ? '' : 'hidden'}>
          <a class="panel-win" href="/branches/${esc(b.slug)}" aria-label="صفحة ${esc(b.name)}" data-morph="branch-${b.id}">${picture(b, 'mall', b.name)}<span class="pin-drop" aria-hidden="true">${icon('pin', { size: 28 })}</span></a>
          <div class="panel-body">
            <div class="panel-top">${statusPill(b)}${b.rating ? `<span class="pill pill-muted">${icon('star', { size: 16 })}${b.rating.toFixed(1)} · ${n(b.rating_count)} تقييم على Google</span>` : ''}</div>
            <h3>${esc(b.name)}</h3>
            <p class="muted">${esc(b.tagline)}</p>
            <dl class="facts-list">
              <div><dt>${icon('pin', { size: 18 })}الموقع</dt><dd>${b.address ? esc(b.address) : 'المدينة المنورة'}</dd></div>
              <div><dt>${icon('clock', { size: 18 })}الدوام</dt><dd>${wk ? `<details class="hours"><summary>عرض الدوام الأسبوعي</summary><table>${wk.map((d) => `<tr><th>${d.name}</th><td>${d.periods.length ? d.periods.map(esc).join('<br>') : 'مغلق'}</td></tr>`).join('')}</table></details>` : 'تواصل معنا لمعرفة الدوام الحالي'}</dd></div>
              <div><dt>${icon('sparkle', { size: 18 })}الأقسام</dt><dd>${chips(secs.map((s) => s.name))}</dd></div>
              ${b.services.length ? `<div><dt>${icon('card', { size: 18 })}الخدمات</dt><dd>${chips(b.services.map((k) => SERVICE_LABELS[k]).filter(Boolean))}</dd></div>` : ''}
            </dl>
            ${branchActions(b)}
            <a class="link-more" href="/branches/${esc(b.slug)}">صفحة الفرع${icon('arrow', { size: 18 })}</a>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>
</section>`;

  const services = [
    ['truck', 'التوصيل', 'اختياراتك تصلك إلى جميع مناطق المملكة. توضح خدمة العملاء الرسوم والمدة عند الطلب.', '#branches', 'اطلب عبر واتساب'],
    ['whatsapp', 'الاستفسار والطلب', 'تواصل مع واتساب الفرع مباشرة، وتصلك رسالة جاهزة تذكر الفرع والقسم.', '#branches', 'اختر الفرع'],
    ['card', 'خيارات الدفع', 'تابي وتمارا في الفروع المعتمدة وفق شروط الأهلية الحالية.', '#branches', 'الخدمات حسب الفرع'],
    ['chat', 'الملاحظات والشكاوى', 'رأيك يساعدنا على تحسين تجربتك. تحصل على رقم متابعة ويتواصل معك الفرع.', '/feedback', 'أرسل ملاحظة'],
  ];
  const servicesHtml = `
<section class="services" id="services" aria-labelledby="services-title">
  <div class="wrap">
    ${sectionTitle('خدمة العملاء', '<span id="services-title">نخدمك قبل الزيارة وبعدها</span>')}
    <div class="svc-grid">
      ${services.map(([ic, t, d, h, c], i) => `<a class="svc reveal" href="${h}" style="--i:${i}">
        <span class="svc-ic">${icon(ic, { size: 28 })}</span><h3>${t}</h3><p>${d}</p><span class="svc-cta">${c}${icon('arrow', { size: 18 })}</span></a>`).join('')}
    </div>
  </div>
</section>`;

  const reviewsHtml = `
<section class="reviews" id="reviews" aria-labelledby="reviews-title">
  <div class="wrap">
    ${sectionTitle('التقييمات', '<span id="reviews-title">تجارب مختارة من عملائنا على Google</span>')}
    ${reviews.length ? `<div class="rev-grid">${reviews.map((r) => `<figure class="rev reveal">
      <div class="stars" aria-label="${r.rating} من 5">${Array.from({ length: 5 }, (_, i) => `<span class="${i < r.rating ? 'on' : ''}">${icon('star', { size: 18 })}</span>`).join('')}</div>
      <blockquote>${esc(r.text)}</blockquote>
      <figcaption><b>${esc(r.author || 'عميل')}</b><span>${esc(r.branch)} · ${esc(formatDate(r.review_time))} · ${icon('google', { size: 14 })} Google</span></figcaption>
    </figure>`).join('')}</div>` : ''}
    <div class="rev-links reveal">
      <p>${reviews.length ? 'تبقى درجة كل فرع وعدد تقييماته مستقلين على Google.' : 'شاركنا تجربتك في الفرع الذي زرته، ويسعدنا أن نقرأ رأيك.'}</p>
      <div class="actions">${branches.map((b) => `<a class="btn btn-outline btn-sm" href="${esc(b.google_review_url || b.maps_url)}" target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}">${icon('google', { size: 16 })}<span>${esc(b.short_name)}</span></a>`).join('')}</div>
    </div>
  </div>
</section>`;

  const faqHtml = `
<section class="faq" id="faq" aria-labelledby="faq-title">
  <div class="wrap faq-grid">
    ${sectionTitle('الأسئلة المتكررة', '<span id="faq-title">إجابات سريعة</span>', '<p class="sec-sub">لم تجد إجابتك؟ تواصل مع واتساب الفرع مباشرة.</p>')}
    <div class="faq-list">
      ${faqs.map((f) => `<details class="qa reveal"><summary><span>${esc(f.question)}</span><i aria-hidden="true"></i></summary><div class="qa-a"><p>${esc(f.answer)}</p></div></details>`).join('')}
    </div>
  </div>
</section>`;

  const contactSheet = contactDialog(branches);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${config.publicUrl}/#org`, name: 'ماك سنتر', alternateName: 'Mac Center', url: config.publicUrl, logo: `${config.publicUrl}/img/logo-vertical.svg` },
      ...branches.map((b) => branchLd(b)),
    ],
  };

  return layout({
    path: '/', site, branches, jsonLd,
    body: hero + about + sectionsHtml + offersHtml + branchesHtml + servicesHtml + reviewsHtml + faqHtml + contactSheet + railNav(),
    bodyClass: 'home',
  });
}

function railNav() {
  const stops = [['hero-title', 'البداية'], ['sections', 'الأقسام'], ['offers', 'العروض'], ['branches', 'الفروع'], ['services', 'الخدمة'], ['faq', 'الأسئلة']];
  return `<nav class="rail" aria-label="مسار الصفحة" data-rail>
    <div class="rail-line"><i class="rail-fill"></i><span class="rail-cart" aria-hidden="true">${CART()}</span></div>
    <ol>${stops.map(([id, t]) => `<li><a href="#${id}" data-stop="${id}"><span>${t}</span></a></li>`).join('')}</ol>
  </nav>`;
}

export function contactDialog(branches) {
  return `<dialog class="sheet sheet-sm" id="contact" aria-labelledby="contact-title">
    <form method="dialog" class="sheet-close"><button class="icon-btn" aria-label="إغلاق">${icon('close', { size: 22 })}</button></form>
    <div class="sheet-body">
      <p class="eyebrow">تواصل معنا</p>
      <h2 id="contact-title">اختر الفرع</h2>
      <ul class="sheet-branches">
        ${branches.map((b) => `<li><div><b>${esc(b.name)}</b>${statusPill(b)}</div>
          <div class="actions-inline">
            <a class="btn btn-wa btn-sm" href="${esc(waLink(b.whatsapp, inquiryText(b)))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">${icon('whatsapp', { size: 18 })}<span>واتساب</span></a>
            <a class="btn btn-outline btn-sm" href="tel:${esc(b.phone)}" data-track="call_click" data-branch="${b.id}" aria-label="اتصال ${esc(b.name)}">${icon('phone', { size: 18 })}</a>
          </div></li>`).join('')}
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

// ———————————————————— صفحة الفرع ————————————————————

export function branchPage({ site, branch: b, branches, sections, offers }) {
  const secs = sections.filter((s) => b.sectionIds.includes(s.id));
  const wk = weekTable(b);
  const notes = (b.exceptions || []).filter((e) => (e.to || e.from) >= new Date().toISOString().slice(0, 10));
  const mapQuery = b.lat != null ? `${b.lat},${b.lng}` : `${b.name} المدينة المنورة`;
  const body = `
<section class="branch-hero">
  <div class="wrap bh-grid">
    <div class="bh-win" data-morph="branch-${b.id}">${picture(b, 'mall', b.name)}</div>
    <div class="bh-copy">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span>/</span><a href="/#branches">الفروع</a></nav>
      <p class="eyebrow">${esc(b.brand)}</p>
      <h1>${esc(b.name)}</h1>
      <p class="lead">${esc(b.tagline)}</p>
      <div class="panel-top">${statusPill(b)}</div>
      ${branchActions(b)}
    </div>
  </div>
</section>
<section class="wrap branch-detail">
  <div class="bd-card reveal">
    <h2>${icon('clock')}الدوام</h2>
    ${wk ? `<table class="week">${wk.map((d) => `<tr><th>${d.name}</th><td>${d.periods.length ? d.periods.map(esc).join('<br>') : '<span class="muted">مغلق</span>'}</td></tr>`).join('')}</table>
      ${notes.length ? `<ul class="notes">${notes.map((e) => `<li><b>${esc(e.label || 'دوام خاص')}</b>: ${esc(e.from)}${e.to && e.to !== e.from ? ' – ' + esc(e.to) : ''}</li>`).join('')}</ul>` : ''}`
      : `<p>لم يعتمد الدوام المنشور بعد. تواصل مع الفرع لمعرفة أوقات العمل الحالية.</p><a class="btn btn-wa btn-sm" href="${esc(waLink(b.whatsapp, inquiryText(b) + ' أرغب في معرفة أوقات الدوام.'))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">${icon('whatsapp', { size: 18 })}<span>اسأل عن الدوام</span></a>`}
  </div>
  <div class="bd-card reveal">
    <h2>${icon('pin')}الموقع</h2>
    <p>${b.address ? esc(b.address) : 'المدينة المنورة'}</p>
    <div class="map" data-map="${esc(`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed&hl=ar`)}">
      <button type="button" class="btn btn-outline" data-load-map>${icon('pin', { size: 18 })}<span>عرض الخريطة</span></button>
    </div>
    ${b.maps_url ? `<a class="link-more" href="${esc(b.maps_url)}" target="_blank" rel="noopener" data-track="directions_click" data-branch="${b.id}">الاتجاهات في خرائط Google${icon('arrow', { size: 18 })}</a>` : ''}
  </div>
  <div class="bd-card wide reveal">
    <h2>${icon('sparkle')}الأقسام في الفرع</h2>
    <div class="mini-tiles">${secs.map((s) => `<a class="mini" href="${esc(waLink(b.whatsapp, inquiryText(b, { section: s })))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">
      <span class="mini-art">${picture(s, s.art, '')}</span><span><b>${esc(s.name)}</b><small>${esc(s.tagline)}</small></span>${icon('whatsapp', { size: 18 })}</a>`).join('')}</div>
  </div>
  ${b.services.length ? `<div class="bd-card reveal"><h2>${icon('card')}الخدمات</h2>${chips(b.services.map((k) => SERVICE_LABELS[k]).filter(Boolean))}
    ${b.services.some((s) => s === 'tabby' || s === 'tamara') ? '<p class="muted small">خدمة التقسيط وفق شروط الأهلية الحالية لدى مقدم الخدمة.</p>' : ''}</div>` : ''}
  <div class="bd-card reveal">
    <h2>${icon('chat')}رأيك يهمنا</h2>
    <p>شاركنا ملاحظة أو مقترحًا عن تجربتك في ${esc(b.short_name)}.</p>
    <div class="actions"><a class="btn btn-primary btn-sm" href="/feedback?branch=${b.id}">${icon('chat', { size: 18 })}<span>أرسل ملاحظة</span></a>
    <a class="btn btn-outline btn-sm" href="${esc(b.google_review_url || b.maps_url)}" target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}">${icon('google', { size: 16 })}<span>قيّمنا على Google</span></a></div>
  </div>
</section>
${offers.length ? `<section class="offers"><div class="wrap">${sectionTitle('عروض الفرع', 'العروض الحالية في ' + esc(b.short_name))}<div class="offer-grid">${offers.map((o) => offerCard(o, branches, sections)).join('')}</div></div></section>` : ''}
${contactDialog(branches)}`;
  return layout({
    title: b.name, path: `/branches/${b.slug}`, site, branches,
    description: `${b.name} في المدينة المنورة: الموقع ورقم التواصل ${b.phone} والدوام والأقسام والخدمات والعروض الحالية.`,
    jsonLd: { '@context': 'https://schema.org', ...branchLd(b) }, body, bodyClass: 'page-branch',
  });
}

// ———————————————————— العروض ————————————————————

export function offersPage({ site, branches, sections, offers }) {
  const body = `<section class="page-head"><div class="wrap">${sectionTitle('العروض', 'العروض الحالية')}</div></section>
  <section class="offers"><div class="wrap">
    ${offers.length ? `<div class="offer-grid">${offers.map((o) => offerCard(o, branches, sections)).join('')}</div>` : `<div class="empty-offers"><div class="eo-art">${art('toys')}</div><div><h3>لا توجد عروض سارية الآن</h3><p>اشترك ليصلك العرض القادم على واتساب حسب الفروع والأقسام التي تختارها.</p><a class="btn btn-primary" href="/subscribe">${icon('bell', { size: 18 })}<span>اشترك في العروض</span></a></div></div>`}
  </div></section>${contactDialog(branches)}`;
  return layout({ title: 'العروض', path: '/offers', site, branches, body });
}

export function offerPage({ site, offer: o, branches, sections }) {
  const bs = branches.filter((b) => o.branchIds.includes(b.id));
  const ss = sections.filter((s) => o.sectionIds.includes(s.id));
  const live = o.phase === 'active';
  const body = `
<section class="branch-hero offer-hero">
  <div class="wrap bh-grid">
    <div class="bh-win">${picture(o, ss[0]?.art || 'mall', o.title)}${o.discount ? `<span class="offer-badge big">${esc(o.discount)}</span>` : ''}</div>
    <div class="bh-copy">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span>/</span><a href="/offers">العروض</a></nav>
      ${live ? '<span class="pill pill-open"><i class="dot"></i><span>عرض ساري</span></span>' : `<span class="pill pill-closed"><i class="dot"></i><span>${o.phase === 'scheduled' ? 'يبدأ قريبًا' : 'انتهى العرض'}</span></span>`}
      <h1>${esc(o.title)}</h1>
      ${o.summary ? `<p class="lead">${esc(o.summary)}</p>` : ''}
      <dl class="facts-list">
        <div><dt>${icon('clock', { size: 18 })}المدة</dt><dd>من ${esc(formatDate(o.starts_at))} إلى ${esc(formatDate(o.ends_at))}</dd></div>
        <div><dt>${icon('pin', { size: 18 })}الفروع</dt><dd>${chips(bs.map((b) => b.name))}</dd></div>
        ${ss.length ? `<div><dt>${icon('sparkle', { size: 18 })}الأقسام</dt><dd>${chips(ss.map((s) => s.name))}</dd></div>` : ''}
      </dl>
    </div>
  </div>
</section>
<section class="wrap branch-detail">
  ${o.description ? `<div class="bd-card wide reveal"><h2>التفاصيل</h2><p class="pre">${esc(o.description)}</p></div>` : ''}
  ${o.terms ? `<div class="bd-card wide reveal"><h2>الشروط</h2><p class="pre">${esc(o.terms)}</p></div>` : ''}
  <div class="bd-card wide reveal"><h2>${icon('whatsapp')}استفسر عن العرض</h2>
    <ul class="sheet-branches">${bs.map((b) => `<li><div><b>${esc(b.name)}</b>${statusPill(b)}</div>
      <a class="btn btn-wa btn-sm" href="${esc(waLink(b.whatsapp, inquiryText(b, { offer: o })))}" target="_blank" rel="noopener" data-track="whatsapp_click" data-branch="${b.id}">${icon('whatsapp', { size: 18 })}<span>استفسار</span></a></li>`).join('')}</ul>
  </div>
</section>${contactDialog(branches)}`;
  return layout({ title: o.title, path: `/offers/${o.slug}`, site, branches, description: o.summary || o.title, body });
}

// ———————————————————— الاشتراك ————————————————————

function choiceGroup(name, items, selected, { legend, error }) {
  return `<fieldset class="choices ${error ? 'has-error' : ''}" ${error ? `aria-describedby="err-${name}"` : ''}>
    <legend>${legend}</legend>
    <div class="choice-grid">
      ${items.map((it) => `<label class="choice">
        <input type="checkbox" name="${name}[]" value="${it.id}" ${selected.includes(it.id) ? 'checked' : ''}>
        <span class="choice-box">${it.art ? `<span class="choice-art">${art(it.art)}</span>` : `<span class="choice-ic">${icon('pin', { size: 20 })}</span>`}<span class="choice-text"><b>${esc(it.name)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><i class="tick">${icon('check', { size: 16 })}</i></span>
      </label>`).join('')}
    </div>
    ${error ? `<p class="err" id="err-${name}" role="alert">${esc(error)}</p>` : ''}
  </fieldset>`;
}

export function subscribePage({ site, branches, sections, values = {}, errors = {}, qr }) {
  const selB = (values.branches || []).map(Number), selS = (values.sections || []).map(Number);
  const body = `
<section class="form-page">
  <div class="wrap form-grid">
    <aside class="form-aside">
      <div class="fa-win">${art('dress')}</div>
      <p class="eyebrow"><span class="speed" aria-hidden="true"><i></i><i></i><i></i></span>اشتراك العروض</p>
      <h1>اختر ما يهمك<br>ودع العروض تصلك</h1>
      <ol class="steps">
        <li><b>١</b><span>اختر الفروع والأقسام</span></li>
        <li><b>٢</b><span>اضغط «متابعة إلى واتساب»</span></li>
        <li><b>٣</b><span>أرسل الرسالة الجاهزة بنفسك</span></li>
      </ol>
      <p class="muted small">${icon('shield', { size: 16 })} لا يكتمل الاشتراك إلا بعد وصول رسالتك. يمكنك إيقافه في أي وقت بإرسال «إيقاف».</p>
    </aside>
    <form class="card form" method="post" action="/subscribe" novalidate data-subscribe>
      ${qr ? `<input type="hidden" name="qr" value="${esc(qr)}">` : ''}
      ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
      ${choiceGroup('branches', branches.map((b) => ({ id: b.id, name: b.name, sub: b.tagline })), selB, { legend: 'الفروع', error: errors.branches })}
      ${choiceGroup('sections', sections.map((s) => ({ id: s.id, name: s.name, art: s.art })), selS, { legend: 'الأقسام', error: errors.sections })}
      <div class="field">
        <label for="name">الاسم <span class="muted">(اختياري)</span></label>
        <input id="name" name="name" autocomplete="given-name" maxlength="60" value="${esc(values.name || '')}">
      </div>
      <label class="consent ${errors.consent ? 'has-error' : ''}">
        <input type="checkbox" name="consent" value="1" required ${errors.consent ? 'aria-invalid="true" aria-describedby="err-consent"' : ''}>
        <span>${esc(CONSENT_TEXT)} <a href="/privacy" target="_blank">سياسة الخصوصية</a></span>
      </label>
      ${errors.consent ? `<p class="err" id="err-consent" role="alert">${esc(errors.consent)}</p>` : ''}
      <button class="btn btn-wa btn-lg btn-block" type="submit">${icon('whatsapp', { size: 22 })}<span>متابعة إلى واتساب</span>${icon('arrow', { size: 20, cls: 'arr' })}</button>
    </form>
  </div>
</section>`;
  return layout({ title: 'الاشتراك في العروض', path: '/subscribe', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

export function subscribeStatusPage({ site, branches, statusKey, status, waUrl }) {
  const body = `
<section class="form-page">
  <div class="wrap narrow">
    <div class="card status-card" data-sub-status="${esc(statusKey)}" data-state="${esc(status.status)}" aria-live="polite">
      <div class="status-visual" aria-hidden="true">
        <svg class="status-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><path class="ok" d="M38 62l15 15 30-32"/></svg>
      </div>
      <div data-when="awaiting">
        <h1>بانتظار رسالتك على واتساب</h1>
        <p>أرسل الرسالة الجاهزة كما هي من واتساب. نؤكد اشتراكك هنا فور وصولها.</p>
        ${waUrl ? `<a class="btn btn-wa btn-lg" href="${esc(waUrl)}" data-wa-open>${icon('whatsapp', { size: 22 })}<span>فتح واتساب</span></a>` : ''}
        <p class="muted small">الرمز صالح لمدة 30 دقيقة. إذا أغلقت واتساب دون إرسال، يبقى الاشتراك غير مكتمل.</p>
      </div>
      <div data-when="confirmed">
        <h1>تم تفعيل اشتراكك</h1>
        <p>وصلتك رسالة ترحيب على واتساب فيها الفروع والأقسام التي اخترتها، وطريقة تعديلها أو إيقافها.</p>
        <a class="btn btn-primary" href="/">العودة للرئيسية</a>
      </div>
      <div data-when="expired">
        <h1>انتهت صلاحية الرمز</h1>
        <p>لم تصل رسالة الاشتراك خلال المدة. ابدأ من جديد وسنجهز لك رسالة جديدة.</p>
        <a class="btn btn-primary" href="/subscribe">ابدأ من جديد</a>
      </div>
    </div>
  </div>
</section>`;
  return layout({ title: 'تأكيد الاشتراك', path: '/subscribe', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

export function preferencesPage({ site, branches, sections, sub, token, saved, errors = {} }) {
  const active = sub && sub.status === 'active';
  const body = `
<section class="form-page"><div class="wrap narrow">
  <form class="card form" method="post" action="/preferences/${esc(token)}">
    <h1>اهتماماتك في عروض ماك سنتر</h1>
    ${saved ? `<div class="alert alert-ok" role="status">${esc(saved)}</div>` : ''}
    ${active ? `
      ${choiceGroup('branches', branches.map((b) => ({ id: b.id, name: b.name })), sub.branchIds, { legend: 'الفروع', error: errors.branches })}
      ${choiceGroup('sections', sections.map((s) => ({ id: s.id, name: s.name, art: s.art })), sub.sectionIds, { legend: 'الأقسام', error: errors.sections })}
      <p class="muted small">إلغاء اختيار كل الفروع أو كل الأقسام يوقف الاشتراك بالكامل.</p>
      <div class="actions">
        <button class="btn btn-primary" name="action" value="save">حفظ الاهتمامات</button>
        <button class="btn btn-danger-ghost" name="action" value="stop">إيقاف كل الرسائل</button>
      </div>` : `<p>اشتراكك متوقف حاليًا، ولن تصلك رسائل عروض.</p><a class="btn btn-primary" href="/subscribe">اشترك من جديد</a>`}
  </form>
</div></section>`;
  return layout({ title: 'إدارة الاشتراك', path: '/preferences', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

// ———————————————————— الملاحظات ————————————————————

export function feedbackPage({ site, branches, sections, values = {}, errors = {}, qr }) {
  const sel = (v, x) => (String(v) === String(x) ? 'selected' : '');
  const fieldErr = (k) => (errors[k] ? `<p class="err" id="err-${k}" role="alert">${esc(errors[k])}</p>` : '');
  const inv = (k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');
  const type = values.type || 'experience';
  const branch = branches.find((b) => String(b.id) === String(values.branch));
  const body = `
<section class="form-page">
  <div class="wrap form-grid">
    <aside class="form-aside">
      <div class="fa-win">${art('home')}</div>
      <p class="eyebrow"><span class="speed" aria-hidden="true"><i></i><i></i><i></i></span>الملاحظات والشكاوى</p>
      <h1>رأيك يساعدنا<br>على تحسين تجربتك</h1>
      <p>تحصل على رقم متابعة فور الإرسال. إذا تركت رقمك، يتواصل معك موظف الفرع المختص.</p>
      <div class="google-box">
        <p>${icon('google', { size: 18 })} يمكنك أيضًا مشاركة تجربتك علنًا على Google، سواء كانت إيجابية أو لا.</p>
        <div class="actions">${branches.map((b) => `<a class="btn btn-outline btn-sm" href="${esc(b.google_review_url || b.maps_url)}" target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}">${esc(b.short_name)}</a>`).join('')}</div>
      </div>
    </aside>
    <form class="card form" method="post" action="/feedback" enctype="multipart/form-data" novalidate data-feedback>
      ${qr ? `<input type="hidden" name="qr" value="${esc(qr)}">` : ''}
      ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
      <fieldset class="seg ${errors.type ? 'has-error' : ''}">
        <legend>نوع الملاحظة</legend>
        <div class="seg-row">${Object.entries(TICKET_TYPES).map(([k, v]) => `<label><input type="radio" name="type" value="${k}" ${type === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        ${fieldErr('type')}
      </fieldset>
      <div class="row2">
        <div class="field ${errors.branch ? 'has-error' : ''}">
          <label for="f-branch">الفرع</label>
          <select id="f-branch" name="branch" required ${inv('branch')}><option value="">اختر الفرع</option>${branches.map((b) => `<option value="${b.id}" ${sel(values.branch, b.id)}>${esc(b.name)}</option>`).join('')}</select>
          ${fieldErr('branch')}
        </div>
        <div class="field">
          <label for="f-section">القسم <span class="muted">(اختياري)</span></label>
          <select id="f-section" name="section"><option value="">بدون تحديد</option>${sections.map((s) => `<option value="${s.id}" ${sel(values.section, s.id)}>${esc(s.name)}</option>`).join('')}</select>
        </div>
      </div>
      <fieldset class="rating">
        <legend>قيّم تجربتك <span class="muted">(اختياري)</span></legend>
        <div class="stars-input" dir="ltr">${[5, 4, 3, 2, 1].map((r) => `<input type="radio" id="r${r}" name="rating" value="${r}" ${String(values.rating) === String(r) ? 'checked' : ''}><label for="r${r}" title="${r} من 5">${icon('star', { size: 30 })}<span class="sr">${r} من 5</span></label>`).join('')}</div>
      </fieldset>
      <div class="field">
        <label for="f-topic">الموضوع <span class="muted">(اختياري)</span></label>
        <select id="f-topic" name="topic"><option value="">اختر الموضوع</option>${Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${sel(values.topic, k)}>${v}</option>`).join('')}</select>
      </div>
      <div class="field ${errors.body ? 'has-error' : ''}">
        <label for="f-body">ملاحظتك</label>
        <textarea id="f-body" name="body" rows="4" maxlength="3000" ${inv('body')} placeholder="اكتب باختصار ما حدث أو ما تقترحه">${esc(values.body || '')}</textarea>
        ${fieldErr('body')}
      </div>
      <div class="field ${errors.images ? 'has-error' : ''}">
        <label for="f-images">صور <span class="muted">(حتى 3 صور، 10 ميجابايت للصورة)</span></label>
        <input id="f-images" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple ${inv('images')} data-max="3">
        ${fieldErr('images')}
      </div>
      <div class="row2">
        <div class="field"><label for="f-name">الاسم <span class="muted">(اختياري)</span></label><input id="f-name" name="name" autocomplete="name" value="${esc(values.name || '')}"></div>
        <div class="field ${errors.phone ? 'has-error' : ''}"><label for="f-phone">رقم الجوال <span class="muted" data-phone-hint>(اختياري)</span></label>
          <input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="05xxxxxxxx" value="${esc(values.phone || '')}" ${inv('phone')}>${fieldErr('phone')}</div>
      </div>
      <label class="consent ${errors.contact_consent ? 'has-error' : ''}">
        <input type="checkbox" name="wants_contact" value="1" ${values.wants_contact || type === 'contact' ? 'checked' : ''} data-wants-contact>
        <span>أرغب أن يتواصل معي الفرع بشأن هذه الملاحظة</span>
      </label>
      <label class="consent sub ${errors.contact_consent ? 'has-error' : ''}" data-consent-row>
        <input type="checkbox" name="contact_consent" value="1" ${values.contact_consent ? 'checked' : ''} ${inv('contact_consent')}>
        <span>أوافق على التواصل معي عبر الهاتف أو واتساب لمتابعة هذه الملاحظة فقط، دون رسائل تسويقية.</span>
      </label>
      ${fieldErr('contact_consent')}
      <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${icon('check', { size: 20 })}<span>إرسال الملاحظة</span></button>
      ${branch ? '' : ''}
    </form>
  </div>
</section>`;
  return layout({ title: 'الملاحظات والشكاوى', path: '/feedback', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

export function feedbackDonePage({ site, branches, ticket, result }) {
  const b = result?.branch || branches.find((x) => x.name === ticket.branch);
  const body = `
<section class="form-page"><div class="wrap narrow">
  <div class="card status-card" data-state="confirmed">
    <div class="status-visual" aria-hidden="true"><svg class="status-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><path class="ok" d="M38 62l15 15 30-32"/></svg></div>
    <div>
      <h1>استلمنا ملاحظتك</h1>
      <p class="ticket-ref">رقم المتابعة <b dir="ltr">${esc(ticket.ref)}</b></p>
      ${result ? `<p>${esc(result.responseNote)}</p>` : ''}
      <div class="actions center">
        <a class="btn btn-outline" href="/track/${esc(result?.trackKey || '')}">${icon('route', { size: 18 })}<span>تتبع الملاحظة</span></a>
        ${b ? `<a class="btn btn-ghost" href="${esc(b.google_review_url || b.maps_url)}" target="_blank" rel="noopener" data-track="google_review_click" data-branch="${b.id}">${icon('google', { size: 16 })}<span>شارك تجربتك على Google</span></a>` : ''}
      </div>
      <p class="muted small">احفظ رابط التتبع لمتابعة حالة ملاحظتك.</p>
    </div>
  </div>
</div></section>`;
  return layout({ title: 'تم الإرسال', path: '/feedback', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

export function trackPage({ site, branches, t, key, verified, error }) {
  const steps = ['new', 'in_progress', 'resolved'];
  const idx = t.status === 'closed' || t.status === 'resolved' ? 2 : t.status === 'new' ? 0 : 1;
  const body = `
<section class="form-page"><div class="wrap narrow">
  <div class="card">
    <p class="eyebrow">تتبع الملاحظة</p>
    <h1 dir="ltr" class="ref-big">${esc(t.ref)}</h1>
    <p>${esc(t.type)} · ${esc(t.branch || '')}</p>
    <ol class="progress" aria-label="الحالة">${['استلام', 'قيد المتابعة', 'محلولة'].map((s, i) => `<li class="${i <= idx ? 'done' : ''}" ${i === idx ? 'aria-current="step"' : ''}><i></i><span>${s}</span></li>`).join('')}</ol>
    <p>الحالة الحالية: <b>${esc(t.statusName)}</b></p>
    ${verified ? `<ul class="timeline">${t.events.map((e) => `<li><time>${esc(isoToRiyadhLocal(e.at.replace(' ', 'T') + 'Z'))}</time><span>${esc(e.body || '')}</span></li>`).join('')}</ul>`
      : t.hasPhone ? `<form method="post" action="/track/${esc(key)}" class="inline-form">
          <label for="tail">لعرض تفاصيل المتابعة أدخل آخر 4 أرقام من جوالك</label>
          <div class="row-inline"><input id="tail" name="tail" inputmode="numeric" maxlength="4" pattern="\\d{4}" dir="ltr" required><button class="btn btn-primary">تحقق</button></div>
          ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
        </form>` : ''}
    ${t.branchPhone ? `<p class="muted small">للاستفسار: <a href="tel:${esc(t.branchPhone)}" dir="ltr">${esc(t.branchPhone)}</a></p>` : ''}
  </div>
</div></section>`;
  return layout({ title: 'تتبع الملاحظة', path: '/track', site, branches, body, noActionBar: true, bodyClass: 'page-form' });
}

// ———————————————————— صفحات ثابتة ————————————————————

export function privacyPage({ site, branches }) {
  const body = `<section class="page-head"><div class="wrap narrow prose">
  <p class="eyebrow">سياسة الخصوصية</p>
  <h1>كيف نتعامل مع بياناتك</h1>
  <p class="notice">${icon('shield', { size: 18 })} نموذج أولي يحتاج مراجعة قانونية واعتماد الإدارة قبل النشر، بما يلائم نظام حماية البيانات الشخصية في المملكة.</p>
  <h2>الجهة المسؤولة</h2><p>ماك سنتر ومجمع عادل الدولي بالمدينة المنورة. للتواصل بشأن بياناتك: ${branches.map((b) => `${esc(b.name)} <a href="tel:${esc(b.phone)}" dir="ltr">${esc(b.phone)}</a>`).join('، ')}.</p>
  <h2>البيانات التي نجمعها والغرض منها</h2>
  <ul>
    <li><b>اشتراك العروض:</b> رقم واتساب، والاسم إن أدخلته، والفروع والأقسام التي اخترتها، ونص موافقتك وتاريخها ومصدر الاشتراك. الغرض: إرسال العروض التي اخترتها فقط.</li>
    <li><b>الملاحظات والشكاوى:</b> نص الملاحظة والتقييم والصور المرفقة، والاسم ورقم الجوال إن أدخلتهما. الغرض: متابعة ملاحظتك وتحسين الخدمة. لا تستخدم هذه البيانات للتسويق.</li>
    <li><b>قياس الاستخدام:</b> أحداث مجمعة مثل زيارة رابط QR أو النقر على واتساب، دون أرقام أو نصوص شكاوى.</li>
  </ul>
  <h2>الموافقة وسحبها</h2><p>لا نرسل عروضًا إلا بعد موافقتك الصريحة عبر رسالة ترسلها بنفسك. يمكنك إيقاف الرسائل في أي وقت بإرسال «إيقاف»، أو تعديل اهتماماتك من رابط الإدارة المرسل إليك، ويطبق الإيقاف فورًا على الرسائل المنتظرة.</p>
  <h2>الاحتفاظ</h2><p>نحتفظ بالبيانات للمدة اللازمة للغرض الذي جمعت له وفق المدد التي تعتمدها الإدارة. محتوى تقييمات Google يخزن مؤقتًا بما لا يتجاوز 30 يومًا وفق شروط Google.</p>
  <h2>حقوقك</h2><p>لك حق الاطلاع على بياناتك وتصحيحها وطلب حذفها وسحب موافقتك، بالتواصل مع خدمة عملاء أي فرع.</p>
</div></section>`;
  return layout({ title: 'سياسة الخصوصية', path: '/privacy', site, branches, body });
}

export function notFoundPage({ site, branches }) {
  const body = `<section class="form-page"><div class="wrap narrow"><div class="card status-card">
    <div class="nf-art">${art('bags')}</div>
    <h1>هذه الصفحة غير موجودة</h1><p>ربما تغير الرابط أو انتهى العرض.</p>
    <div class="actions center"><a class="btn btn-primary" href="/">الرئيسية</a><a class="btn btn-outline" href="/offers">العروض</a></div>
  </div></div></section>`;
  return layout({ title: 'غير موجودة', path: '/404', site, branches, body });
}

export { ATTR };
