import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../http.js';
import { config } from '../config.js';
import { icon } from './icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const version = (file) => {
  try { return createHash('sha1').update(readFileSync(join(root, file))).digest('hex').slice(0, 10); } catch { return '0'; }
};
export const ASSET_V = { css: version('css/site.css'), js: version('js/site.js') };

const inlineSvg = (file, cls) => readFileSync(join(root, 'img', file), 'utf8').replace('<svg ', `<svg class="${cls}" `).replace(/<style>.*?<\/style>/, '');
export const LOGO_H = inlineSvg('logo-horizontal.svg', 'logo');
export const LOGO_V = inlineSvg('logo-vertical.svg', 'logo logo-v');

// عربة الشعار وحدها
const markSrc = readFileSync(join(root, 'img', 'mark.svg'), 'utf8');
const markBox = /viewBox="([^"]+)"/.exec(markSrc)[1].split(' ').map(Number);
const markPaths = /<g fill="#FFBA1D">(.*)<\/g>/.exec(markSrc)[1];
export const CART = (cls = '') => `<svg class="cart-mark ${cls}" viewBox="${markBox[0] + markBox[2] * 0.1} ${markBox[1] + markBox[3] * 0.12} ${markBox[2] * 0.8} ${markBox[3] * 0.76}" aria-hidden="true">${markPaths}</svg>`;

export const NAV = [
  ['/#departments', 'الأقسام'],
  ['/offers', 'العروض'],
  ['/#branches', 'الفروع'],
  ['/#services', 'خدمة العملاء'],
  ['/feedback', 'ملاحظاتك'],
];

export const AR_NUM = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

export function layout({ title, description, path = '/', body, jsonLd, bodyClass = '', site = {}, branches = [], intro = false, dark = false }) {
  const fullTitle = title ? `${title} | ماك سنتر` : 'ماك سنتر | اختيارات العائلة في وجهة واحدة';
  const desc = description || 'ماك سنتر ومجمع عادل الدولي في المدينة المنورة: أزياء العائلة وفساتين المناسبات والأحذية والحقائب والمفروشات والألعاب والقرطاسية، مع عروض واتساب وتوصيل لجميع مناطق المملكة.';
  const url = config.publicUrl + path;
  const socials = Object.entries(site.socials || {}).filter(([, v]) => v);
  const SOC = { snapchat: 'سناب شات', instagram: 'إنستغرام', tiktok: 'تيك توك', x: 'إكس' };

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#084832">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:site_name" content="ماك سنتر">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(config.publicUrl + '/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="view-transition" content="same-origin">
<link rel="icon" href="/img/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/gamila-bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/gamila-light.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${ASSET_V.css}">
<script src="/js/site.js?v=${ASSET_V.js}" defer></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body class="${bodyClass}${dark ? ' on-dark' : ''}${intro ? ' has-intro' : ''}">
${intro ? `<div class="intro" aria-hidden="true"><div class="intro-mark">${CART()}</div><div class="intro-word">${LOGO_H}</div></div>` : ''}
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="hdr" data-hdr>
  <a href="/" class="brand" aria-label="ماك سنتر، الصفحة الرئيسية">${LOGO_H}</a>
  <nav class="nav" aria-label="القائمة الرئيسية">${NAV.map(([h, t]) => `<a href="${h}" class="ul">${t}</a>`).join('')}</nav>
  <div class="hdr-end">
    <a class="hdr-cta ul" href="/subscribe">اشترك في العروض</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" data-menu><span class="menu-lines" aria-hidden="true"><i></i><i></i></span><span class="menu-txt">القائمة</span></button>
  </div>
</header>
<div class="menu" id="menu" hidden data-menu-panel role="dialog" aria-modal="true" aria-label="القائمة">
  <div class="menu-in">
    <nav class="menu-nav" aria-label="القائمة">
      ${[...NAV, ['/subscribe', 'الاشتراك في العروض']].map(([h, t], i) => `<a href="${h}" style="--i:${i}"><span class="menu-n">${AR_NUM(i + 1)}</span><span class="menu-t">${t}</span></a>`).join('')}
    </nav>
    <div class="menu-side">
      <p class="label">الفروع</p>
      <ul>${branches.map((b) => `<li><a href="/branches/${esc(b.slug)}">${esc(b.name)}</a><a href="tel:${esc(b.phone)}" dir="ltr">${esc(b.phone)}</a></li>`).join('')}</ul>
      ${socials.length ? `<p class="label">تابعنا</p><p class="socials">${socials.map(([k, v]) => `<a class="ul" href="${esc(v)}" target="_blank" rel="noopener">${SOC[k] || k}</a>`).join('')}</p>` : ''}
    </div>
  </div>
</div>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="ftr">
  <div class="ftr-top">
    <p class="ftr-say reveal-lines">عروضك، <span>كما تختارها.</span></p>
    <a class="link-arrow lg" href="/subscribe"><span>اشترك في العروض عبر واتساب</span><i aria-hidden="true"></i></a>
  </div>
  <div class="ftr-cols">
    <div>
      <p class="label">الفروع</p>
      <ul>${branches.map((b) => `<li><a class="ul" href="/branches/${esc(b.slug)}">${esc(b.name)}</a><a class="num" href="tel:${esc(b.phone)}" data-track="call_click" data-branch="${b.id}" dir="ltr">${esc(b.phone)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <p class="label">الموقع</p>
      <ul><li><a class="ul" href="/offers">العروض الحالية</a></li><li><a class="ul" href="/subscribe">الاشتراك بالعروض</a></li><li><a class="ul" href="/feedback">الملاحظات والشكاوى</a></li><li><a class="ul" href="/privacy">سياسة الخصوصية</a></li></ul>
    </div>
    <div>
      <p class="label">الخدمة</p>
      <ul><li>توصيل لجميع مناطق المملكة</li><li>الطلب والاستفسار عبر واتساب الفرع</li>${socials.map(([k, v]) => `<li><a class="ul" href="${esc(v)}" target="_blank" rel="noopener">${SOC[k] || k}</a></li>`).join('')}</ul>
    </div>
  </div>
  <div class="ftr-word" aria-hidden="true">${LOGO_H}</div>
  <div class="ftr-legal"><span>© ${new Date().getFullYear()} ماك سنتر · المدينة المنورة</span><a class="ul" href="/privacy">الخصوصية</a></div>
</footer>
<nav class="dock" aria-label="وصول سريع" data-dock>
  <a href="/offers">العروض</a><a href="/#branches">الفروع</a><a href="#contact" data-contact>${icon('whatsapp', { size: 18 })}تواصل</a>
</nav>
<div class="cursor" aria-hidden="true" data-cursor><span></span></div>
</body>
</html>`;
}
