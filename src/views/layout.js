import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../http.js';
import { config } from '../config.js';
import { icon } from './icons.js';
import { SPRITE } from './art.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const version = (file) => {
  try { return createHash('sha1').update(readFileSync(join(root, file))).digest('hex').slice(0, 10); } catch { return '0'; }
};
export const ASSET_V = { css: version('css/site.css'), js: version('js/site.js') };

const inlineSvg = (file, cls) => readFileSync(join(root, 'img', file), 'utf8').replace('<svg ', `<svg class="${cls}" `).replace(/<style>.*?<\/style>/, '');
export const LOGO_H = inlineSvg('logo-horizontal.svg', 'logo');
export const LOGO_V = inlineSvg('logo-vertical.svg', 'logo logo-v');

// عربة الشعار وحدها، تستخدم في المسار وحركة البطل
const markSrc = readFileSync(join(root, 'img', 'mark.svg'), 'utf8');
const markBox = /viewBox="([^"]+)"/.exec(markSrc)[1].split(' ').map(Number);
const markPaths = /<g fill="#FFBA1D">(.*)<\/g>/.exec(markSrc)[1];
export const CART = (cls = '') => `<svg class="cart-mark ${cls}" viewBox="${markBox[0] + markBox[2] * 0.1} ${markBox[1] + markBox[3] * 0.12} ${markBox[2] * 0.8} ${markBox[3] * 0.76}" aria-hidden="true">${markPaths}</svg>`;

export const NAV = [
  ['/#sections', 'الأقسام'],
  ['/offers', 'العروض'],
  ['/#branches', 'الفروع'],
  ['/#services', 'خدمة العملاء'],
  ['/#faq', 'الأسئلة'],
];

export function layout({ title, description, path = '/', body, jsonLd, ogImage, bodyClass = '', noActionBar = false, site = {}, branches = [] }) {
  const fullTitle = title ? `${title} | ماك سنتر` : 'ماك سنتر | اختيارات العائلة في وجهة واحدة';
  const desc = description || 'ماك سنتر ومجمع عادل الدولي في المدينة المنورة: أزياء العائلة وفساتين المناسبات والأحذية والحقائب والمفروشات والألعاب والقرطاسية، مع عروض واتساب وتوصيل لجميع مناطق المملكة.';
  const url = config.publicUrl + path;
  const socials = site.socials || {};
  const socialLinks = Object.entries(socials).filter(([, v]) => v).map(([k, v]) =>
    `<a href="${esc(v)}" rel="noopener" target="_blank" aria-label="${{ snapchat: 'سناب شات', instagram: 'إنستغرام', tiktok: 'تيك توك', x: 'إكس' }[k] || k}">${icon(k)}</a>`).join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#006442">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:site_name" content="ماك سنتر">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage || config.publicUrl + '/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/gamila-bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/gamila-regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${ASSET_V.css}">
<script src="/js/site.js?v=${ASSET_V.js}" defer></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body class="${bodyClass}">
${SPRITE}
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="hdr" data-hdr>
  <div class="hdr-in">
    <a href="/" class="brand" aria-label="ماك سنتر، الصفحة الرئيسية">${LOGO_H}</a>
    <nav class="nav" aria-label="القائمة الرئيسية">
      ${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
    </nav>
    <div class="hdr-cta">
      <a class="btn btn-sm btn-ghost hide-sm" href="/feedback">${icon('chat', { size: 18 })}<span>ملاحظاتك</span></a>
      <a class="btn btn-sm btn-primary" href="/subscribe">${icon('bell', { size: 18, cls: 'ring' })}<span>اشترك في العروض</span></a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="drawer" data-menu aria-label="فتح القائمة">${icon('menu', { size: 24 })}</button>
    </div>
  </div>
</header>
<div class="drawer" id="drawer" hidden data-drawer>
  <div class="drawer-scrim" data-close></div>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="القائمة">
    <div class="drawer-head">${LOGO_H}<button type="button" class="icon-btn" data-close aria-label="إغلاق القائمة">${icon('close', { size: 22 })}</button></div>
    <nav class="drawer-nav" aria-label="القائمة">
      ${NAV.map(([h, t], i) => `<a href="${h}" style="--i:${i}">${t}${icon('chevron', { size: 18 })}</a>`).join('')}
      <a href="/feedback" style="--i:${NAV.length}">ملاحظاتك وشكواك${icon('chevron', { size: 18 })}</a>
    </nav>
    <a class="btn btn-primary btn-block" href="/subscribe">${icon('bell', { size: 18 })}<span>اشترك في العروض</span></a>
  </div>
</div>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="ftr">
  <div class="ftr-band">
    <div class="wrap ftr-band-in">
      <div>
        <p class="eyebrow on-dark">عروض تختارها أنت</p>
        <h2 class="ftr-title">اختر الفروع والأقسام التي تهمك<br>ودع العروض تصلك على واتساب</h2>
      </div>
      <a class="btn btn-yellow btn-lg" href="/subscribe">${icon('bell', { size: 20, cls: 'ring' })}<span>اشترك في العروض</span>${icon('arrow', { size: 20, cls: 'arr' })}</a>
    </div>
    <svg class="ftr-lines" viewBox="0 0 120 60" aria-hidden="true"><path d="M30 10h60M10 30h70M30 50h60" stroke-width="10" stroke-linecap="square"/></svg>
  </div>
  <div class="wrap ftr-grid">
    <div class="ftr-brand">
      ${LOGO_V}
      <p>اختيارات العائلة في وجهة واحدة. توصيل لجميع مناطق المملكة.</p>
      ${socialLinks ? `<div class="socials">${socialLinks}</div>` : ''}
    </div>
    <div>
      <h3>الفروع</h3>
      <ul class="ftr-list">
        ${branches.map((b) => `<li><a href="/branches/${esc(b.slug)}">${esc(b.name)}</a><a class="num" href="tel:${esc(b.phone)}" data-track="call_click" data-branch="${b.id}" dir="ltr">${esc(b.phone)}</a></li>`).join('')}
      </ul>
    </div>
    <div>
      <h3>روابط</h3>
      <ul class="ftr-list">
        <li><a href="/offers">العروض الحالية</a></li>
        <li><a href="/subscribe">الاشتراك بالعروض</a></li>
        <li><a href="/feedback">الملاحظات والشكاوى</a></li>
        <li><a href="/privacy">سياسة الخصوصية</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap ftr-legal">
    <span>© ${new Date().getFullYear()} ماك سنتر · المدينة المنورة</span>
    <a href="/privacy">الخصوصية</a>
  </div>
</footer>
${noActionBar ? '' : `<nav class="actionbar" aria-label="وصول سريع" data-actionbar>
  <a href="/offers">${icon('gift', { size: 20 })}<span>العروض</span></a>
  <a href="/#branches">${icon('pin', { size: 20 })}<span>الفروع</span></a>
  <a href="/#contact" class="ab-main" data-contact>${icon('whatsapp', { size: 22 })}<span>تواصل</span></a>
</nav>`}
</body>
</html>`;
}
