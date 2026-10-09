import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { HttpError, parseRequest, sendHtml, sendJson, redirect, rateLimit, clientIp, readBody } from '../http.js';
import { listBranches, listSections, listFaqs, siteSettings, getBranch } from '../modules/catalog.js';
import { listOffers, getOffer } from '../modules/offers.js';
import { featuredReviews } from '../modules/reviews.js';
import { startSubscription, intentStatus, verifySignature, handleWebhook, updatePreferences, stopSubscription } from '../modules/whatsapp.js';
import { createTicket, publicTicket } from '../modules/tickets.js';
import { resolveQr } from '../modules/qrcodes.js';
import { trackEvent } from '../modules/events.js';
import { verifyUrlToken, safeEqual } from '../lib/ids.js';
import { json, getSetting } from '../db.js';
import * as P from '../views/pages.js';

export function publicRoutes(router, db) {
  const common = () => ({ site: siteSettings(db), branches: listBranches(db) });
  const html = (res, page, status = 200) => sendHtml(res, status, page);
  const limited = (req, key, max = 10) => {
    if (!rateLimit(`${key}:${clientIp(req)}`, { max, windowMs: 10 * 60 * 1000 })) throw new HttpError(429, 'محاولات كثيرة، حاول بعد قليل');
  };

  router.notFound = (req, res) => html(res, P.notFoundPage(common()), 404);

  router.get('/', (req, res) => {
    const c = common();
    html(res, P.homePage({ ...c, sections: listSections(db), offers: listOffers(db, { publicOnly: true }), faqs: listFaqs(db), reviews: featuredReviews(db) }));
  });

  router.get('/branches/:slug', (req, res) => {
    const branch = getBranch(db, { slug: req.params.slug });
    if (!branch || !branch.active) return router.notFound(req, res);
    html(res, P.branchPage({ ...common(), branch, sections: listSections(db), offers: listOffers(db, { publicOnly: true, branchId: branch.id }) }));
  });

  router.get('/offers', (req, res) => html(res, P.offersPage({ ...common(), sections: listSections(db), offers: listOffers(db, { publicOnly: true }) })));

  router.get('/offers/:slug', (req, res) => {
    const offer = getOffer(db, { slug: req.params.slug });
    // المسودات لا تظهر للعامة؛ العرض المنتهي يبقى برابطه مع توضيح حالته
    if (!offer || !['active', 'ended', 'scheduled'].includes(offer.phase)) return router.notFound(req, res);
    trackEvent(db, 'offer_view', { branchId: offer.branchIds[0], ref: offer.slug, qr: req.query.qr || null });
    html(res, P.offerPage({ ...common(), offer, sections: listSections(db) }));
  });

  // ————— الاشتراك —————
  router.get('/subscribe', (req, res) => {
    const branch = Number(req.query.branch) || null;
    html(res, P.subscribePage({ ...common(), sections: listSections(db), qr: req.query.qr, values: { branches: branch ? [branch] : [] } }));
  });

  router.post('/subscribe', async (req, res) => {
    limited(req, 'sub', 15);
    const { fields } = await parseRequest(req);
    try {
      const r = startSubscription(db, fields, { publicUrl: config.publicUrl });
      if (String(req.headers.accept || '').includes('application/json')) return sendJson(res, 200, r);
      redirect(res, `/subscribe/status/${r.statusKey}?go=1`);
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 400) throw err;
      if (String(req.headers.accept || '').includes('application/json')) return sendJson(res, 400, { error: err.message, fields: err.fields });
      html(res, P.subscribePage({ ...common(), sections: listSections(db), qr: fields.qr, values: fields, errors: err.fields || { _: err.message } }), 400);
    }
  });

  router.get('/subscribe/status/:key', (req, res) => {
    const status = intentStatus(db, req.params.key);
    if (!status) return router.notFound(req, res);
    const intent = db.prepare('SELECT * FROM subscription_intents WHERE status_key = ?').get(req.params.key);
    let waUrl = null;
    if (status.status === 'awaiting') {
      const r = { branches: json.parse(intent.branch_ids, []), sections: json.parse(intent.section_ids, []) };
      const b = db.prepare(`SELECT name FROM branches WHERE id IN (${r.branches.map(() => '?').join(',')})`).all(...r.branches);
      const s = db.prepare(`SELECT name FROM sections WHERE id IN (${r.sections.map(() => '?').join(',')})`).all(...r.sections);
      const text = ['أرغب في الاشتراك بعروض ماك سنتر', `الفروع: ${b.map((x) => x.name).join('، ')}`, `الأقسام: ${s.map((x) => x.name).join('، ')}`,
        intent.name ? `الاسم: ${intent.name}` : null, 'أوافق على استقبال عروض ماك سنتر والفروع التي اخترتها عبر واتساب، ويمكنني إيقاف الاشتراك في أي وقت.', `رمز الربط: MC-${intent.token}`].filter(Boolean).join('\n');
      waUrl = `https://wa.me/${config.whatsapp.phone}?text=${encodeURIComponent(text)}`;
    }
    html(res, P.subscribeStatusPage({ ...common(), statusKey: req.params.key, status, waUrl }));
  });

  router.get('/api/public/subscribe/:key', (req, res) => {
    const s = intentStatus(db, req.params.key);
    if (!s) throw new HttpError(404, 'غير موجود');
    sendJson(res, 200, { status: s.status });
  });

  router.get('/preferences/:token', (req, res) => {
    const contactId = contactFromToken(req.params.token);
    const sub = loadSub(contactId);
    html(res, P.preferencesPage({ ...common(), sections: listSections(db), sub, token: req.params.token }));
  });

  router.post('/preferences/:token', async (req, res) => {
    const contactId = contactFromToken(req.params.token);
    const { fields } = await parseRequest(req);
    let saved;
    if (fields.action === 'stop') { stopSubscription(db, contactId, 'preferences'); saved = 'تم إيقاف كل رسائل العروض.'; }
    else { const r = updatePreferences(db, contactId, { branchIds: fields.branches, sectionIds: fields.sections }); saved = r === 'stopped' ? 'تم إيقاف الاشتراك لعدم اختيار فروع أو أقسام.' : 'حفظنا اهتماماتك.'; }
    html(res, P.preferencesPage({ ...common(), sections: listSections(db), sub: loadSub(contactId), token: req.params.token, saved }));
  });

  function contactFromToken(t) {
    const p = verifyUrlToken(t);
    if (!p || !p.startsWith('c')) throw new HttpError(404, 'انتهت صلاحية الرابط. أرسل «إعدادات» في واتساب لنرسل لك رابطًا جديدًا.');
    return Number(p.slice(1));
  }
  function loadSub(contactId) {
    const s = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(contactId);
    return s ? { status: s.status, branchIds: json.parse(s.branch_ids, []), sectionIds: json.parse(s.section_ids, []) } : null;
  }

  // ————— الملاحظات —————
  router.get('/feedback', (req, res) => {
    html(res, P.feedbackPage({ ...common(), sections: listSections(db), qr: req.query.qr, values: { branch: req.query.branch, type: req.query.type } }));
  });

  router.post('/feedback', async (req, res) => {
    limited(req, 'fb', 8);
    const { fields, files } = await parseRequest(req, { limit: 32 * 1024 * 1024 });
    try {
      const r = createTicket(db, fields, files, { source: fields.qr ? 'qr' : 'web' });
      if (String(req.headers.accept || '').includes('application/json')) return sendJson(res, 200, { ref: r.ref, trackKey: r.trackKey, note: r.responseNote });
      redirect(res, `/feedback/done/${r.trackKey}`);
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 400) throw err;
      // نبقي ما أدخله العميل عند الخطأ
      if (String(req.headers.accept || '').includes('application/json')) return sendJson(res, 400, { error: err.message, fields: err.fields });
      html(res, P.feedbackPage({ ...common(), sections: listSections(db), qr: fields.qr, values: fields, errors: err.fields || { _: err.message } }), 400);
    }
  });

  router.get('/feedback/done/:key', (req, res) => {
    const t = publicTicket(db, req.params.key);
    if (!t) return router.notFound(req, res);
    const mins = getSetting(db, 'tickets', {}).firstResponseMinutes || 30;
    const branch = listBranches(db).find((b) => b.name === t.branch);
    const responseNote = t.hasPhone
      ? `يتواصل معك فريق ${branch?.short_name || 'الفرع'} خلال ${mins} دقيقة في أوقات الدوام.`
      : 'سُجّلت ملاحظتك للتحسين. للتواصل معك نحتاج رقم الجوال.';
    html(res, P.feedbackDonePage({ ...common(), ticket: t, result: { trackKey: req.params.key, responseNote, branch } }));
  });

  router.get('/track/:key', (req, res) => {
    const t = publicTicket(db, req.params.key);
    if (!t) return router.notFound(req, res);
    html(res, P.trackPage({ ...common(), t, key: req.params.key, verified: !t.hasPhone }));
  });

  router.post('/track/:key', async (req, res) => {
    limited(req, 'track', 10);
    const t = publicTicket(db, req.params.key);
    if (!t) return router.notFound(req, res);
    const { fields } = await parseRequest(req);
    const ok = t.phoneTail && safeEqual(String(fields.tail || ''), t.phoneTail);
    html(res, P.trackPage({ ...common(), t, key: req.params.key, verified: ok, error: ok ? null : 'الأرقام غير مطابقة' }));
  });

  // ————— QR والتتبع —————
  router.get('/q/:code', (req, res) => {
    const r = resolveQr(db, req.params.code);
    if (!r) return redirect(res, '/', 302);
    trackEvent(db, 'qr_visit', { branchId: r.q.branch_id, qr: r.q.code });
    redirect(res, r.location, 302);
  });

  router.post('/api/t', async (req, res) => {
    if (!rateLimit(`t:${clientIp(req)}`, { max: 120, windowMs: 60000 })) return sendJson(res, 204, {});
    const raw = await readBody(req, 2048);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { /* تجاهل */ }
    const allowed = ['whatsapp_click', 'call_click', 'directions_click', 'google_review_click'];
    if (allowed.includes(body.e)) trackEvent(db, body.e, { branchId: body.b });
    res.writeHead(204); res.end();
  });

  // ————— Webhooks —————
  router.get('/api/webhooks/whatsapp', (req, res) => {
    const q = req.query;
    if (q['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && safeEqual(q['hub.verify_token'] || '', config.whatsapp.verifyToken)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(q['hub.challenge'] || '');
    }
    throw new HttpError(403, 'رمز التحقق غير صحيح');
  });

  router.post('/api/webhooks/whatsapp', async (req, res) => {
    const raw = await readBody(req, 2 * 1024 * 1024);
    if (!verifySignature(raw, req.headers['x-hub-signature-256'])) throw new HttpError(401, 'توقيع غير صالح');
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'صيغة غير صحيحة'); }
    // نرد سريعًا ثم نعالج؛ الحدث محفوظ قبل المعالجة
    sendJson(res, 200, { ok: true });
    handleWebhook(db, payload).catch((err) => console.error('webhook', err));
  });

  // ————— SEO —————
  router.get('/robots.txt', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /track/\nDisallow: /preferences/\nDisallow: /subscribe/status/\nSitemap: ${config.publicUrl}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', (req, res) => {
    const urls = ['/', '/offers', '/subscribe', '/feedback', '/privacy',
      ...listBranches(db).map((b) => `/branches/${b.slug}`),
      ...listOffers(db, { publicOnly: true }).map((o) => `/offers/${o.slug}`)];
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${config.publicUrl}${encodeURI(u)}</loc></url>`).join('')}</urlset>`);
  });

  router.get('/manifest.webmanifest', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(JSON.stringify({ name: 'ماك سنتر', short_name: 'ماك سنتر', dir: 'rtl', lang: 'ar', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#006442',
      icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
  });

  router.get('/privacy', (req, res) => html(res, P.privacyPage(common())));

  // لوحة الإدارة: صفحة واحدة تحمل وحداتها عند الحاجة
  const adminRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'admin');
  const adminHtml = () => {
    const v = createHash('sha1').update(readFileSync(join(adminRoot, 'admin.css'))).update(readFileSync(join(adminRoot, 'js', 'app.js'))).digest('hex').slice(0, 10);
    return readFileSync(join(adminRoot, 'index.html'), 'utf8').replaceAll('__V__', v);
  };
  router.get('/admin', (req, res) => sendHtml(res, 200, adminHtml(), { cache: 'no-store' }));

  router.get('/health', (req, res) => sendJson(res, 200, { ok: true }));
}
