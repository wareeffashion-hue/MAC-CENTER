import { HttpError, fail, parseRequest, sendHtml, sendJson, redirect, rateLimit, clientIp, readBody } from '../http.js';
import { listBranches, siteSettings } from '../modules/catalog.js';
import * as A from '../modules/auth.js';
import * as G from '../modules/giftcards.js';
import * as AW from '../modules/applewallet.js';
import { mockPay, paymentDriver } from '../modules/payments.js';
import * as V from '../views/gift-pages.js';
import { config } from '../config.js';

const safeBack = (b) => { const s = String(b || ''); return s.startsWith(`${config.publicUrl}/`) || (s.startsWith('/') && !s.startsWith('//')) ? s : '/'; };

// قسائم الإهداء: الشراء، صفحة الهدية، إشعار بوابة الدفع، وواجهات اللوحة
export function giftRoutes(router, db) {
  const common = () => ({ site: siteSettings(db), branches: listBranches(db) });
  const html = (res, page, status = 200) => sendHtml(res, status, page);
  const limited = (req, key, max) => { if (!rateLimit(`${key}:${clientIp(req)}`, { max, windowMs: 10 * 60_000 })) throw new HttpError(429, 'محاولات كثيرة، حاول بعد قليل'); };
  const shop = (values = {}, errors = {}) => V.giftShopPage({ ...common(), settings: G.giftSettings(db), values, errors, enabled: G.giftSalesEnabled() });

  router.get('/gift-cards', (req, res) => html(res, shop({ design: req.query.design })));
  router.post('/gift-cards', async (req, res) => {
    limited(req, 'giftbuy', 12);
    const { fields } = await parseRequest(req);
    try {
      const r = await G.startGiftOrder(db, fields);
      redirect(res, r.url);
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) return html(res, shop(fields, err.fields || { _: err.message }), 400);
      if (!(err instanceof HttpError)) { console.error('gift checkout', err); return html(res, shop(fields, { _: 'تعذر فتح صفحة الدفع الآن. حاول بعد قليل.' }), 502); }
      throw err;
    }
  });
  router.get('/gift-cards/return/:key', async (req, res) => {
    const order = await G.settleOrder(db, req.params.key).catch((e) => { console.error('gift settle', e.message); return db.prepare('SELECT * FROM gift_orders WHERE key = ?').get(req.params.key); });
    if (!order) return router.notFound(req, res);
    const card = order.card_id ? db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(order.card_id) : null;
    res.setHeader('Cache-Control', 'no-store');
    html(res, V.giftReturnPage({ ...common(), order, card, cardUrl: card ? G.giftUrl(card) : null }));
  });
  router.get('/gift-card/:token', (req, res) => {
    const c = db.prepare('SELECT * FROM gift_cards WHERE token = ?').get(String(req.params.token).slice(0, 40));
    if (!c) return router.notFound(req, res);
    res.setHeader('Cache-Control', 'no-store');
    html(res, V.giftViewPage({ ...common(), card: G.cardView(db, c), walletUrl: AW.walletEnabled() ? `/gift-card/${c.token}/pass.pkpass` : null }));
  });
  router.get('/gift-card/:token/pass.pkpass', (req, res) => {
    const c = db.prepare('SELECT id FROM gift_cards WHERE token = ?').get(String(req.params.token).slice(0, 40));
    if (!c || !AW.walletEnabled()) throw new HttpError(404, 'غير موجود');
    const pass = AW.buildGiftPass(db, c.id);
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="mac-gift.pkpass"', 'Cache-Control': 'no-store' });
    res.end(pass.buffer);
  });

  // إشعار البوابة: لا نثق بمحتواه، نستخرج المعرف ونسأل البوابة عن الحالة
  router.post('/api/webhooks/payments', async (req, res) => {
    if (!rateLimit(`payhook:${clientIp(req)}`, { max: 300, windowMs: 60_000 })) throw new HttpError(429, 'طلبات كثيرة');
    let b = {};
    try { b = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}'); } catch { /* نرد 200 ونتجاهل */ }
    const d = b.data || b;
    const ids = [d.id, d.invoice_id, b.id].filter((x) => typeof x === 'string').map((x) => x.slice(0, 80));
    const key = typeof d.metadata?.gift_order === 'string' ? d.metadata.gift_order : null;
    const row = key ? db.prepare('SELECT key FROM gift_orders WHERE key = ?').get(key)
      : ids.map((i) => db.prepare('SELECT key FROM gift_orders WHERE provider_id = ?').get(i)).find(Boolean);
    sendJson(res, 200, { ok: true });
    if (row) G.settleOrder(db, row.key).catch((e) => console.error('payment webhook', e.message));
  });

  // بوابة تجريبية خارج الإنتاج
  router.get('/pay/mock/:id', (req, res) => {
    if (paymentDriver() !== 'mock') return router.notFound(req, res);
    html(res, V.mockPayPage({ ...common(), id: req.params.id, amount: req.query.amount, back: safeBack(req.query.back) }));
  });
  router.post('/pay/mock/:id', async (req, res) => {
    const { fields } = await parseRequest(req);
    if (!mockPay(req.params.id, fields.amount)) return router.notFound(req, res);
    redirect(res, safeBack(fields.back));
  });

  // ————— اللوحة —————
  const auth = (perm) => (req) => {
    const user = A.sessionUser(db, req);
    if (!user) throw new HttpError(401, 'سجّل الدخول للمتابعة');
    if (perm) A.requirePerm(user, perm);
    req.user = user;
  };
  const body = async (req) => (await parseRequest(req)).fields;
  const ok = (res, data = { ok: true }) => sendJson(res, 200, data);
  const log = (req, action, id, detail) => A.audit(db, req.user, action, 'gift_card', id, detail);
  const scope = (req) => A.branchScope(req.user);

  router.get('/api/gifts', auth('plus.manage'), (req, res) => ok(res, { ...G.giftList(db, req.query), designs: G.DESIGNS, settings: G.giftSettings(db), enabled: G.giftSalesEnabled(), driver: paymentDriver() }));
  router.get('/api/gifts/lookup', auth('plus'), (req, res) => {
    if (!rateLimit(`giftlookup:${req.user.id}`, { max: 60, windowMs: 10 * 60_000 })) fail(429, 'محاولات كثيرة');
    const c = G.findCard(db, req.query.q);
    ok(res, { card: c ? G.cardView(db, c) : null });
  });
  router.get('/api/gifts/:id', auth('plus.manage'), (req, res) => {
    const c = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(Number(req.params.id));
    if (!c) fail(404, 'غير موجودة');
    const o = c.order_id ? db.prepare('SELECT buyer_phone, provider, provider_id, paid_at FROM gift_orders WHERE id = ?').get(c.order_id) : null;
    ok(res, { ...G.cardView(db, c), order: o, url: G.giftUrl(c) });
  });
  router.post('/api/gifts', auth('plus.manage'), async (req, res) => {
    const r = G.issueAtBranch(db, req.user, scope(req), await body(req));
    log(req, 'gift.issue', r.id, { amount: r.amount });
    ok(res, r);
  });
  router.post('/api/gifts/:id/redeem', auth('plus'), async (req, res) => {
    const r = G.redeem(db, req.user, scope(req), Number(req.params.id), await body(req));
    log(req, 'gift.redeem', r.id, { balance: r.balance });
    ok(res, r);
  });
  router.post('/api/gifts/:id/resend', auth('plus.manage'), (req, res) => {
    db.prepare('UPDATE gift_cards SET delivered_at = NULL WHERE id = ?').run(Number(req.params.id));
    if (!G.deliverCard(db, Number(req.params.id))) fail(400, 'لا يوجد رقم للمُهدى إليه أو القسيمة غير نشطة');
    log(req, 'gift.resend', Number(req.params.id));
    ok(res);
  });
  router.post('/api/gifts/:id/cancel', auth('plus.manage'), async (req, res) => {
    const b = await body(req);
    const r = G.cancelCard(db, req.user, Number(req.params.id), b.reason);
    log(req, 'gift.cancel', r.id, { reason: String(b.reason).slice(0, 80) });
    ok(res, r);
  });
  router.put('/api/gifts/settings', auth('plus.manage'), async (req, res) => {
    const s = G.saveGiftSettings(db, await body(req));
    A.audit(db, req.user, 'gift.settings', 'setting', 'giftcards');
    ok(res, s);
  });
}
