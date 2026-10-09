import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { json, getSetting, setSetting, sqlNow } from '../db.js';
import { HttpError, fail, parseRequest, sendJson, rateLimit, clientIp, sniffImage, readBody } from '../http.js';
import { token as randToken, signedUrlToken, verifyUrlToken } from '../lib/ids.js';
import { isoToRiyadhLocal } from '../lib/time.js';
import * as A from '../modules/auth.js';
import * as C from '../modules/catalog.js';
import * as O from '../modules/offers.js';
import * as T from '../modules/tickets.js';
import * as R from '../modules/reviews.js';
import * as Q from '../modules/qrcodes.js';
import * as U from '../modules/users.js';
import * as W from '../modules/whatsapp.js';
import * as WQ from '../modules/waqr.js';
import * as N from '../modules/notify.js';
import * as Rep from '../modules/reports.js';
import { EVENT_NAMES } from '../modules/events.js';

export function apiRoutes(router, db) {
  const auth = (perm) => (req) => {
    const user = A.sessionUser(db, req);
    if (!user) throw new HttpError(401, 'سجّل الدخول للمتابعة');
    if (perm) A.requirePerm(user, perm);
    req.user = user;
  };
  const anyOf = (...perms) => (req) => {
    auth()(req);
    if (!perms.some((p) => A.can(req.user, p))) fail(403, 'لا تملك صلاحية لهذا الإجراء');
  };
  const body = async (req, opts) => (await parseRequest(req, opts)).fields;
  const ok = (res, data = { ok: true }) => sendJson(res, 200, data);
  const id = (req) => Number(req.params.id);
  const log = (req, action, entity, entityId, detail) => A.audit(db, req.user, action, entity, entityId, detail);

  // ————— الدخول —————
  router.post('/api/auth/login', async (req, res) => {
    if (!rateLimit(`login:${clientIp(req)}`, { max: 10, windowMs: 15 * 60000 })) fail(429, 'محاولات كثيرة، انتظر 15 دقيقة');
    const b = await body(req);
    const r = A.login(db, res, b.email, b.password);
    A.audit(db, r.user, 'auth.login', 'user', r.user.id, { ip: clientIp(req), pending2fa: r.needs2fa });
    ok(res, r.needs2fa ? { needs2fa: true } : { user: A.publicUser(r.user) });
  });
  router.post('/api/auth/2fa', async (req, res) => {
    if (!rateLimit(`2fa:${clientIp(req)}`, { max: 10, windowMs: 15 * 60000 })) fail(429, 'محاولات كثيرة');
    const u = A.completeTwoFactor(db, req, res, (await body(req)).code);
    ok(res, { user: A.publicUser(u) });
  });
  router.post('/api/auth/logout', (req, res) => { A.destroySession(db, req, res); ok(res); });

  router.get('/api/me', auth(), (req, res) => {
    const u = A.publicUser(req.user);
    u.waPhone = req.user.wa_phone;
    u.unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
    ok(res, { user: u, mockWhatsapp: config.whatsapp.driver === 'mock', mockGoogle: config.google.driver === 'mock', publicUrl: config.publicUrl });
  });
  router.put('/api/me', auth(), async (req, res) => {
    const b = await body(req);
    if (b.newPassword) {
      if (!A.checkPassword(b.currentPassword, req.user.password)) fail(400, 'كلمة المرور الحالية غير صحيحة', { currentPassword: 'غير صحيحة' });
      A.validatePassword(b.newPassword);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(A.hashPassword(b.newPassword), req.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, req.user.token_hash);
      log(req, 'user.password', 'user', req.user.id);
    }
    if ('waPhone' in b) db.prepare('UPDATE users SET wa_phone = ? WHERE id = ?').run(String(b.waPhone || '').replace(/\D/g, '') || null, req.user.id);
    if (b.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(b.name).trim(), req.user.id);
    ok(res);
  });
  router.post('/api/me/2fa/begin', auth(), (req, res) => ok(res, U.begin2fa(req.user)));
  router.post('/api/me/2fa/confirm', auth(), async (req, res) => { U.confirm2fa(db, req.user, (await body(req)).code); log(req, 'user.2fa_on', 'user', req.user.id); ok(res); });
  router.post('/api/me/2fa/disable', auth(), async (req, res) => { U.disable2fa(db, req.user, (await body(req)).code); log(req, 'user.2fa_off', 'user', req.user.id); ok(res); });

  router.get('/api/notifications', auth(), (req, res) => {
    ok(res, { items: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY at DESC LIMIT 40').all(req.user.id) });
  });
  router.post('/api/notifications/read', auth(), async (req, res) => {
    const b = await body(req);
    if (b.id) db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(b.id, req.user.id);
    else db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
    ok(res);
  });

  // ————— البيانات المرجعية —————
  router.get('/api/meta', auth(), (req, res) => {
    const scope = A.branchScope(req.user);
    ok(res, {
      roles: A.ROLES, ticketTypes: T.TICKET_TYPES, ticketStatus: T.TICKET_STATUS, priority: T.PRIORITY, topics: T.TOPICS,
      offerStatus: O.OFFER_STATUS, offerPhase: O.OFFER_PHASE, campaignStatus: O.CAMPAIGN_STATUS, messageStatus: O.MESSAGE_STATUS,
      reviewState: R.REVIEW_STATE, classification: R.CLASSIFICATION, qrPurpose: Q.QR_PURPOSE, services: C.SERVICE_LABELS, events: EVENT_NAMES,
      branches: C.listBranches(db, { includeInactive: true }).filter((b) => scope === null || scope.includes(b.id)).map((b) => ({ id: b.id, name: b.name, short: b.short_name, active: !!b.active })),
      allBranches: C.listBranches(db, { includeInactive: true }).map((b) => ({ id: b.id, name: b.name, short: b.short_name })),
      sections: C.listSections(db, { includeInactive: true }).map((s) => ({ id: s.id, name: s.name, art: s.art, active: !!s.active })),
      staff: db.prepare('SELECT id, name, role, branch_ids FROM users WHERE active = 1 ORDER BY name').all().map((u) => ({ id: u.id, name: u.name, role: u.role, branchIds: json.parse(u.branch_ids, []) })),
      consent: { text: C.CONSENT_TEXT, version: C.CONSENT_VERSION },
    });
  });

  router.get('/api/dashboard/today', auth('dashboard'), (req, res) => ok(res, Rep.today(db, req.user)));

  // ————— التذاكر —————
  router.get('/api/tickets', auth('tickets'), (req, res) => ok(res, { items: T.listTickets(db, req.user, req.query) }));
  router.get('/api/tickets/:id', auth('tickets'), (req, res) => {
    const t = T.getTicket(db, req.user, id(req));
    t.attachments = t.attachments.map((a) => ({ ...a, url: `/api/attachments/${a.id}?t=${signedUrlToken(a.id, 300)}` }));
    ok(res, t);
  });
  router.post('/api/tickets', auth('tickets'), async (req, res) => {
    // تذكرة يدخلها الموظف عن اتصال أو زيارة
    const b = await body(req);
    A.assertBranch(req.user, Number(b.branch));
    const r = T.createTicket(db, b, [], { source: b.source || 'staff' });
    log(req, 'ticket.create', 'ticket', r.id);
    ok(res, { id: r.id, ref: r.ref });
  });
  router.post('/api/tickets/:id/:action', auth('tickets'), async (req, res) => {
    const action = req.params.action;
    if (action === 'assign' && !A.can(req.user, 'tickets.assign') && req.user.role !== 'agent') fail(403, 'لا تملك صلاحية الإسناد');
    const b = await body(req);
    if (action === 'assign' && req.user.role === 'agent' && Number(b.userId) !== req.user.id && b.userId) fail(403, 'يمكنك استلام التذكرة لنفسك فقط');
    const t = T.updateTicket(db, req.user, id(req), action, b);
    log(req, `ticket.${action}`, 'ticket', id(req), action === 'note' ? undefined : b);
    ok(res, t);
  });
  router.get('/api/attachments/:id', (req, res) => {
    // رابط قصير الصلاحية يصدر بعد فحص صلاحية الموظف على التذكرة
    if (verifyUrlToken(req.query.t) !== req.params.id) fail(403, 'انتهت صلاحية رابط المرفق');
    const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
    if (!a) fail(404, 'المرفق غير موجود');
    const data = readFileSync(join(config.dataDir, 'attachments', a.id));
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Length': data.length, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
    res.end(data);
  });

  // ————— الفروع والأقسام والأسئلة —————
  router.get('/api/branches', auth(), (req, res) => {
    const scope = A.branchScope(req.user);
    ok(res, { items: C.listBranches(db, { includeInactive: true }).filter((b) => scope === null || scope.includes(b.id)) });
  });
  router.post('/api/branches', auth('branches'), async (req, res) => {
    const b = C.saveBranch(db, null, await body(req));
    log(req, 'branch.create', 'branch', b.id);
    ok(res, b);
  });
  router.put('/api/branches/:id', anyOf('branches', 'branches.own'), async (req, res) => {
    A.assertBranch(req.user, id(req));
    const b = await body(req);
    const core = A.can(req.user, 'branches');
    const out = C.saveBranch(db, id(req), b, { canEditCore: core });
    log(req, 'branch.update', 'branch', id(req));
    ok(res, out);
  });
  router.get('/api/sections', auth(), (req, res) => ok(res, { items: C.listSections(db, { includeInactive: true }) }));
  router.post('/api/sections', auth('sections'), async (req, res) => { const s = C.saveSection(db, null, await body(req)); log(req, 'section.create', 'section', s.id); ok(res, s); });
  router.put('/api/sections/:id', auth('sections'), async (req, res) => { const s = C.saveSection(db, id(req), await body(req)); log(req, 'section.update', 'section', id(req)); ok(res, s); });
  router.get('/api/faqs', auth(), (req, res) => ok(res, { items: C.listFaqs(db, { includeInactive: true }) }));
  router.post('/api/faqs', auth('faqs'), async (req, res) => ok(res, C.saveFaq(db, null, await body(req))));
  router.put('/api/faqs/:id', auth('faqs'), async (req, res) => ok(res, C.saveFaq(db, id(req), await body(req))));
  router.delete('/api/faqs/:id', auth('faqs'), (req, res) => { db.prepare('DELETE FROM faqs WHERE id = ?').run(id(req)); log(req, 'faq.delete', 'faq', id(req)); ok(res); });

  router.post('/api/uploads', anyOf('sections', 'branches', 'branches.own', 'offers'), async (req, res) => {
    const data = await readBody(req, config.uploads.maxImageBytes + 1024);
    const kind = sniffImage(data);
    if (!kind) fail(400, 'الصورة يجب أن تكون JPG أو PNG أو WEBP');
    if (data.length > config.uploads.maxImageBytes) fail(400, 'حجم الصورة يتجاوز 10 ميجابايت');
    const dir = join(config.dataDir, 'uploads');
    mkdirSync(dir, { recursive: true });
    const name = `${randToken(12)}.${kind.ext}`;
    writeFileSync(join(dir, name), data);
    log(req, 'upload', 'file', name);
    ok(res, { url: `/uploads/${name}` });
  });

  // ————— العروض والحملات —————
  router.get('/api/offers', anyOf('offers', 'offers.view'), (req, res) => {
    ok(res, { items: O.listOffers(db).map((o) => ({ ...o, starts_local: isoToRiyadhLocal(o.starts_at), ends_local: isoToRiyadhLocal(o.ends_at) })) });
  });
  router.get('/api/offers/:id', anyOf('offers', 'offers.view'), (req, res) => {
    const o = O.getOffer(db, { id: id(req) });
    if (!o) fail(404, 'العرض غير موجود');
    ok(res, { ...o, starts_local: isoToRiyadhLocal(o.starts_at), ends_local: isoToRiyadhLocal(o.ends_at), preview: O.campaignPreview(db, o),
      campaigns: db.prepare('SELECT id, name, status, audience_count, created_at FROM campaigns WHERE offer_id = ? ORDER BY id DESC').all(o.id) });
  });
  router.post('/api/offers', auth('offers'), async (req, res) => { const o = O.saveOffer(db, req.user, null, await body(req)); log(req, 'offer.create', 'offer', o.id); ok(res, o); });
  router.put('/api/offers/:id', auth('offers'), async (req, res) => { const o = O.saveOffer(db, req.user, id(req), await body(req)); log(req, 'offer.update', 'offer', o.id); ok(res, o); });
  router.post('/api/offers/:id/:action', auth('offers'), (req, res) => {
    const o = O.transitionOffer(db, id(req), req.params.action, A.can(req.user, 'offers.publish'));
    log(req, `offer.${req.params.action}`, 'offer', id(req));
    ok(res, o);
  });

  router.get('/api/campaigns', auth('campaigns'), (req, res) => {
    ok(res, { items: db.prepare(`SELECT c.*, o.title offer_title FROM campaigns c LEFT JOIN offers o ON o.id = c.offer_id ORDER BY c.id DESC LIMIT 100`).all()
      .map((c) => ({ ...c, ...O.getCampaign(db, c.id), offer_title: c.offer_title })) });
  });
  router.get('/api/campaigns/:id', auth('campaigns'), (req, res) => {
    const c = O.getCampaign(db, id(req));
    if (!c) fail(404, 'الحملة غير موجودة');
    const offer = O.getOffer(db, { id: c.offer_id });
    const messages = db.prepare(`SELECT m.id, m.status, m.reason, m.attempts, m.sent_at, m.updated_at, m.cost, ct.wa_id, ct.name FROM messages m JOIN contacts ct ON ct.id = m.contact_id
      WHERE m.campaign_id = ? ORDER BY CASE m.status WHEN 'failed' THEN 0 WHEN 'excluded' THEN 1 ELSE 2 END, m.id DESC LIMIT 300`).all(c.id)
      .map((m) => ({ ...m, wa_id: maskPhone(m.wa_id) }));
    ok(res, { ...c, offer, preview: offer ? O.campaignPreview(db, offer) : null, messages, scheduled_local: isoToRiyadhLocal(c.scheduled_at) });
  });
  router.post('/api/campaigns', auth('campaigns'), async (req, res) => { const c = O.createCampaign(db, req.user, await body(req)); log(req, 'campaign.create', 'campaign', c.id); ok(res, c); });
  router.post('/api/campaigns/:id/:action', auth('campaigns'), async (req, res) => {
    const a = req.params.action;
    let c;
    if (a === 'test') c = await O.sendTest(db, req.user, id(req));
    else if (a === 'schedule') { A.requirePerm(req.user, 'offers.publish'); c = O.scheduleCampaign(db, id(req)); }
    else if (a === 'pause') c = O.pauseCampaign(db, id(req));
    else if (a === 'cancel') c = O.cancelCampaign(db, id(req));
    else fail(400, 'إجراء غير معروف');
    log(req, `campaign.${a}`, 'campaign', id(req));
    ok(res, c);
  });
  router.post('/api/messages/:id/retry', auth('campaigns'), (req, res) => { O.retryMessage(db, id(req)); log(req, 'message.retry', 'message', id(req)); ok(res); });

  // ————— المشتركون —————
  function subscriberQuery(q) {
    const where = [], args = [];
    if (q.status) { where.push('s.status = ?'); args.push(q.status); }
    if (q.source) { where.push("COALESCE(s.source_qr,'web') = ?"); args.push(q.source); }
    if (q.q) { where.push('(c.wa_id LIKE ? OR c.name LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
    const rows = db.prepare(`SELECT c.id, c.wa_id, c.name, c.created_at, c.last_inbound_at, s.status, s.branch_ids, s.section_ids, s.consent_at, s.consent_version, s.source_qr, s.updated_at, s.stopped_at
      FROM contacts c JOIN subscriptions s ON s.contact_id = c.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.updated_at DESC LIMIT 2000`).all(...args)
      .map((r) => ({ ...r, branchIds: json.parse(r.branch_ids, []), sectionIds: json.parse(r.section_ids, []) }));
    return rows.filter((r) => (!q.branch || r.branchIds.includes(Number(q.branch))) && (!q.section || r.sectionIds.includes(Number(q.section))));
  }
  router.get('/api/subscribers', auth('subscribers'), (req, res) => {
    const canSee = A.can(req.user, 'subscribers.export');
    ok(res, { items: subscriberQuery(req.query).slice(0, 500).map((r) => ({ ...r, wa_id: canSee ? r.wa_id : maskPhone(r.wa_id) })) });
  });
  router.get('/api/subscribers/export.csv', auth('subscribers.export'), (req, res) => {
    const rows = subscriberQuery(req.query);
    const meta = { b: Object.fromEntries(C.listBranches(db, { includeInactive: true }).map((b) => [b.id, b.name])), s: Object.fromEntries(C.listSections(db, { includeInactive: true }).map((s) => [s.id, s.name])) };
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['واتساب', 'الاسم', 'الحالة', 'الفروع', 'الأقسام', 'المصدر', 'تاريخ الموافقة', 'إصدار الموافقة'].map(cell).join(',')];
    for (const r of rows) lines.push([r.wa_id, r.name, r.status === 'active' ? 'نشط' : 'متوقف', r.branchIds.map((x) => meta.b[x]).join(' | '), r.sectionIds.map((x) => meta.s[x]).join(' | '), r.source_qr || 'web', r.consent_at, r.consent_version].map(cell).join(','));
    log(req, 'subscribers.export', 'subscribers', null, { count: rows.length, filters: req.query });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end('﻿' + lines.join('\r\n'));
  });
  router.get('/api/subscribers/:id', auth('subscribers'), (req, res) => {
    const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id(req));
    if (!c) fail(404, 'غير موجود');
    const s = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(c.id);
    const canSee = A.can(req.user, 'subscribers.export');
    ok(res, {
      ...c, wa_id: canSee ? c.wa_id : maskPhone(c.wa_id), subscription: s && { ...s, branchIds: json.parse(s.branch_ids, []), sectionIds: json.parse(s.section_ids, []) },
      events: db.prepare('SELECT * FROM subscription_events WHERE contact_id = ? ORDER BY at DESC').all(c.id),
      messages: db.prepare('SELECT m.status, m.reason, m.sent_at, m.updated_at, cp.name campaign FROM messages m LEFT JOIN campaigns cp ON cp.id = m.campaign_id WHERE m.contact_id = ? ORDER BY m.id DESC LIMIT 30').all(c.id),
    });
  });
  router.post('/api/subscribers/:id/stop', auth('subscribers'), (req, res) => { W.stopSubscription(db, id(req), `staff:${req.user.id}`); log(req, 'subscriber.stop', 'contact', id(req)); ok(res); });
  router.put('/api/subscribers/:id', auth('subscribers.export'), async (req, res) => {
    const b = await body(req);
    W.updatePreferences(db, id(req), { branchIds: b.branchIds, sectionIds: b.sectionIds }, `staff:${req.user.id}`);
    log(req, 'subscriber.update', 'contact', id(req), b);
    ok(res);
  });

  // ————— التقييمات —————
  router.get('/api/reviews', auth('reviews'), (req, res) => {
    const scope = A.branchScope(req.user);
    const where = [], args = [];
    if (scope !== null) { where.push(`r.branch_id IN (${scope.map(() => '?').join(',') || 'NULL'})`); args.push(...scope); }
    if (req.query.state === 'pending') where.push("r.state IN ('new','needs_review','draft_ready','escalated')");
    else if (req.query.state) { where.push('r.state = ?'); args.push(req.query.state); }
    if (req.query.branch) { where.push('r.branch_id = ?'); args.push(Number(req.query.branch)); }
    if (req.query.rating) { where.push('r.rating = ?'); args.push(Number(req.query.rating)); }
    const items = db.prepare(`SELECT r.*, b.short_name branch FROM reviews r JOIN branches b ON b.id = r.branch_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE r.state WHEN 'escalated' THEN 0 WHEN 'needs_review' THEN 1 WHEN 'draft_ready' THEN 2 WHEN 'new' THEN 3 ELSE 4 END, r.review_time DESC LIMIT 300`).all(...args);
    const stats = db.prepare(`SELECT b.id, b.short_name, b.rating, b.rating_count, b.rating_updated_at,
      (SELECT COUNT(*) FROM reviews r WHERE r.branch_id = b.id AND r.state IN ('new','needs_review','draft_ready','escalated')) pending FROM branches b WHERE b.active = 1`).all()
      .filter((b) => scope === null || scope.includes(b.id));
    ok(res, { items, stats });
  });
  router.post('/api/reviews/:id/reply', auth('reviews'), async (req, res) => {
    if (!A.can(req.user, 'reviews.reply') && req.user.role !== 'branch_manager') fail(403, 'لا تملك صلاحية نشر الرد');
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id(req));
    if (!r) fail(404, 'التقييم غير موجود');
    A.assertBranch(req.user, r.branch_id);
    await R.publishReply(db, id(req), (await body(req)).text, 'human', req.user);
    ok(res);
  });
  router.post('/api/reviews/:id/:action', auth('reviews'), async (req, res) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id(req));
    if (!r) fail(404, 'التقييم غير موجود');
    A.assertBranch(req.user, r.branch_id);
    const b = await body(req);
    if (req.params.action === 'feature') db.prepare('UPDATE reviews SET featured = ? WHERE id = ?').run(b.featured ? 1 : 0, r.id);
    else if (req.params.action === 'ignore') db.prepare("UPDATE reviews SET state = 'ignored' WHERE id = ?").run(r.id);
    else if (req.params.action === 'draft') db.prepare("UPDATE reviews SET draft = ?, state = CASE WHEN state = 'new' THEN 'draft_ready' ELSE state END WHERE id = ?").run(String(b.text || ''), r.id);
    else fail(400, 'إجراء غير معروف');
    log(req, `review.${req.params.action}`, 'review', r.id);
    ok(res);
  });
  router.get('/api/reviews/instructions/:id', auth('reviews'), (req, res) => { A.assertBranch(req.user, id(req)); ok(res, R.instructions(db, id(req))); });
  router.put('/api/reviews/instructions/:id', auth(), async (req, res) => {
    if (!['admin', 'branch_manager'].includes(req.user.role)) fail(403, 'تعديل التعليمات للمدير');
    A.assertBranch(req.user, id(req));
    const b = await body(req);
    const out = R.saveInstructions(db, req.user, id(req), b);
    log(req, 'review.instructions', 'branch', id(req), { autoReply: out.autoReply });
    ok(res, out);
  });
  router.post('/api/reviews/preview', auth('reviews'), async (req, res) => {
    const b = await body(req);
    ok(res, { items: R.previewRules(db, Number(b.branchId), (b.samples || []).slice(0, 10).map((s) => ({ rating: Number(s.rating), text: String(s.text || '') }))) });
  });
  router.post('/api/reviews/sync', auth('reviews'), async (req, res) => ok(res, { count: await R.syncReviews(db) }));

  // ————— رموز QR —————
  router.get('/api/qr', anyOf('qr', 'qr.view'), (req, res) => ok(res, { items: Q.listQr(db, A.branchScope(req.user)) }));
  router.post('/api/qr', auth('qr'), async (req, res) => { const q = Q.saveQr(db, null, await body(req)); log(req, 'qr.create', 'qr', q.id); ok(res, q); });
  router.put('/api/qr/:id', auth('qr'), async (req, res) => { const q = Q.saveQr(db, id(req), await body(req)); log(req, 'qr.update', 'qr', q.id); ok(res, q); });
  router.get('/api/qr/:id/svg', anyOf('qr', 'qr.view'), (req, res) => {
    const { q, svg } = Q.qrImage(db, id(req));
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="qr-${q.code}.svg"` });
    res.end(svg);
  });

  // ————— الموظفون والتوجيه —————
  router.get('/api/users', auth('users'), (req, res) => ok(res, { items: U.listUsers(db) }));
  router.post('/api/users', auth('users'), async (req, res) => { const u = U.saveUser(db, null, await body(req)); log(req, 'user.create', 'user', u.id, { role: u.role }); ok(res, u); });
  router.put('/api/users/:id', auth('users'), async (req, res) => {
    const b = await body(req);
    if (id(req) === req.user.id && (b.role !== 'admin' || b.active === false)) fail(400, 'لا يمكنك تغيير دورك أو تعطيل حسابك');
    const u = U.saveUser(db, id(req), b);
    log(req, 'user.update', 'user', u.id, { role: u.role, branchIds: u.branchIds, active: u.active });
    ok(res, u);
  });
  router.post('/api/users/:id/reset-2fa', auth('users'), (req, res) => { db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run(id(req)); log(req, 'user.2fa_reset', 'user', id(req)); ok(res); });

  router.get('/api/routing', anyOf('routing', 'routing.own'), (req, res) => {
    const scope = A.branchScope(req.user);
    ok(res, { items: db.prepare('SELECT * FROM routing_rules ORDER BY branch_id, section_id, topic').all().filter((r) => scope === null || scope.includes(r.branch_id)) });
  });
  router.post('/api/routing', anyOf('routing', 'routing.own'), async (req, res) => {
    const b = await body(req);
    if (!A.can(req.user, 'routing')) A.assertBranch(req.user, Number(b.branch_id));
    if (!b.user_id && !b.backup_user_id) fail(400, 'اختر المسؤول');
    const r = db.prepare('INSERT INTO routing_rules (branch_id, section_id, topic, user_id, backup_user_id) VALUES (?, ?, ?, ?, ?)')
      .run(Number(b.branch_id) || null, Number(b.section_id) || null, b.topic || null, Number(b.user_id) || null, Number(b.backup_user_id) || null);
    log(req, 'routing.create', 'routing', Number(r.lastInsertRowid), b);
    ok(res);
  });
  router.delete('/api/routing/:id', anyOf('routing', 'routing.own'), (req, res) => {
    const r = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(id(req));
    if (r && !A.can(req.user, 'routing')) A.assertBranch(req.user, r.branch_id);
    db.prepare('DELETE FROM routing_rules WHERE id = ?').run(id(req));
    log(req, 'routing.delete', 'routing', id(req));
    ok(res);
  });

  // ————— التقارير والسجل والإعدادات —————
  router.get('/api/reports/marketing', anyOf('campaigns', 'reports'), (req, res) => ok(res, Rep.marketingReport(db, { days: Number(req.query.days) || 30, branchId: Number(req.query.branch) || null })));
  router.get('/api/reports/service', anyOf('tickets', 'reports'), (req, res) => ok(res, Rep.serviceReport(db, req.user, { days: Number(req.query.days) || 30 })));
  router.get('/api/audit', auth('audit'), (req, res) => {
    ok(res, { items: db.prepare('SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300').all() });
  });
  router.get('/api/settings', auth('settings'), (req, res) => {
    ok(res, { site: getSetting(db, 'site', {}), messaging: getSetting(db, 'messaging', {}), tickets: getSetting(db, 'tickets', {}) });
  });
  router.put('/api/settings/:key', auth('settings'), async (req, res) => {
    const key = req.params.key;
    if (!['site', 'messaging', 'tickets'].includes(key)) fail(400, 'إعداد غير معروف');
    const b = await body(req);
    setSetting(db, key, { ...getSetting(db, key, {}), ...b });
    log(req, `settings.${key}`, 'settings', key, b);
    ok(res, getSetting(db, key));
  });
  router.get('/api/integrations', auth('integrations'), (req, res) => {
    ok(res, {
      status: db.prepare('SELECT * FROM integration_status').all(),
      whatsapp: { driver: config.whatsapp.driver, phone: W.sendingNumber(), webhook: `${config.publicUrl}/api/webhooks/whatsapp`, configured: !!(config.whatsapp.token && config.whatsapp.phoneNumberId), signed: !!config.whatsapp.appSecret },
      google: { driver: config.google.driver, configured: !!(config.google.clientId && config.google.refreshToken), accountId: config.google.accountId || null },
      webhooks: db.prepare('SELECT provider, COUNT(*) total, SUM(processed_at IS NULL) pending, SUM(error IS NOT NULL) errors, MAX(received_at) last FROM webhook_events GROUP BY provider').all(),
    });
  });
  router.post('/api/integrations/check', auth('integrations'), async (req, res) => {
    const w = await W.driver().health();
    db.prepare(`INSERT INTO integration_status (name, ok, message) VALUES ('WhatsApp Business', ?, ?) ON CONFLICT(name) DO UPDATE SET ok=excluded.ok, message=excluded.message, checked_at=datetime('now')`).run(w.ok ? 1 : 0, w.message);
    const g = await R.googleDriver().health();
    db.prepare(`INSERT INTO integration_status (name, ok, message) VALUES ('Google Business Profile', ?, ?) ON CONFLICT(name) DO UPDATE SET ok=excluded.ok, message=excluded.message, checked_at=datetime('now')`).run(g.ok ? 1 : 0, g.message);
    ok(res);
  });

  // ————— رقم تنبيهات الفريق بمسح QR —————
  router.get('/api/waqr', auth('integrations'), (req, res) => ok(res, { ...WQ.status(), settings: N.waNotifySettings(db) }));
  router.put('/api/waqr/settings', auth('integrations'), async (req, res) => {
    const b = await body(req);
    const s = N.saveWaNotifySettings(db, b || {});
    log(req, 'waqr.settings', 'integration', 'waqr', s);
    ok(res, s);
  });
  router.post('/api/waqr/summary', auth('integrations'), (req, res) => {
    const to = N.waNotifySettings(db).managerPhone || req.user.wa_phone;
    if (!to) fail(400, 'أضف جوال المدير أولًا');
    if (!WQ.send(to, N.dailySummaryText(db))) fail(400, 'الرقم غير مربوط');
    ok(res);
  });
  router.post('/api/waqr/start', auth('integrations'), async (req, res) => {
    const s = await WQ.start();
    log(req, 'waqr.start', 'integration', 'waqr', {});
    ok(res, s);
  });
  router.post('/api/waqr/logout', auth('integrations'), async (req, res) => {
    log(req, 'waqr.logout', 'integration', 'waqr', {});
    ok(res, await WQ.logout());
  });
  router.post('/api/waqr/test', auth('integrations'), (req, res) => {
    if (!req.user.wa_phone) fail(400, 'أضف رقم واتساب لحسابك من «حسابي» أولًا');
    if (!WQ.send(req.user.wa_phone, `تنبيه تجريبي من ماك سنتر ✅\nسيصلك على هذا الرقم كل تنبيه يخصك: تذكرة جديدة، أو تصعيد، أو تقييم يحتاج ردًا.`)) fail(400, 'الرقم غير مربوط');
    ok(res);
  });

  // ————— أدوات وضع التجربة —————
  const devOnly = (req) => { if (config.whatsapp.driver !== 'mock' && config.google.driver !== 'mock') fail(404, 'غير متاح'); };
  router.post('/api/dev/whatsapp/inbound', auth('integrations'), devOnly, async (req, res) => {
    if (config.whatsapp.driver !== 'mock') fail(400, 'المحاكي متاح في وضع التجربة فقط');
    const b = await body(req);
    const wa = String(b.from || '').replace(/\D/g, '');
    if (wa.length < 9) fail(400, 'أدخل رقم واتساب صحيح', { from: 'مثال: 9665xxxxxxxx' });
    const r = await W.handleWebhook(db, { entry: [{ changes: [{ value: { contacts: [{ wa_id: wa, profile: { name: b.name || null } }], messages: [{ id: `sim.${randToken(8)}`, from: wa, type: 'text', text: { body: String(b.text || '') } }] } }] }] });
    ok(res, { result: r[0], outbox: W.mockMessages().slice(0, 5) });
  });
  router.get('/api/dev/outbox', auth('integrations'), devOnly, (req, res) => ok(res, { items: W.mockMessages() }));
  router.post('/api/dev/reviews', auth('integrations'), devOnly, async (req, res) => {
    if (config.google.driver !== 'mock') fail(400, 'متاح في وضع التجربة فقط');
    const b = await body(req);
    R.mockAddReview(Number(b.branchId), { id: `sim-${randToken(6)}`, author: b.author || 'عميل تجريبي', rating: Number(b.rating) || 5, text: String(b.text || ''), createdAt: new Date().toISOString() });
    ok(res, { count: await R.syncReviews(db) });
  });
}

function maskPhone(p) {
  const s = String(p || '');
  return s.length > 6 ? `${s.slice(0, 5)}•••${s.slice(-3)}` : s;
}
