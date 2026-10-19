import { HttpError, fail, parseRequest, sendHtml, sendJson, redirect, rateLimit, clientIp } from '../http.js';
import { verifyUrlToken } from '../lib/ids.js';
import { listBranches, listSections, siteSettings } from '../modules/catalog.js';
import { trackEvent } from '../modules/events.js';
import * as A from '../modules/auth.js';
import * as M from '../modules/plus.js';
import * as V from '../views/plus-pages.js';

// MAC+‎: الصفحات العامة وواجهات اللوحة
export function plusRoutes(router, db) {
  const common = () => ({ site: siteSettings(db), branches: listBranches(db) });
  const html = (res, page, status = 200) => sendHtml(res, status, page);
  const wantsJson = (req) => String(req.headers.accept || '').includes('application/json');
  const limited = (req, key, max = 10) => {
    if (!rateLimit(`${key}:${clientIp(req)}`, { max, windowMs: 10 * 60 * 1000 })) throw new HttpError(429, 'محاولات كثيرة، حاول بعد قليل');
  };
  // نموذج عام: يعيد الصفحة نفسها بالأخطاء بدل صفحة خطأ عامة
  const formErrors = (req, res, err, render) => {
    if (!(err instanceof HttpError) || err.status !== 400) throw err;
    if (wantsJson(req)) return sendJson(res, 400, { error: err.message, fields: err.fields });
    html(res, render(err.fields || { _: err.message }), 400);
  };

  // ————— صفحات العملاء —————
  router.get('/plus', (req, res) => {
    const ref = String(req.query.ref || '').toUpperCase().slice(0, 10);
    const refOwner = ref ? db.prepare("SELECT id FROM members WHERE ref_code = ? AND status = 'active'").get(ref) : null;
    html(res, V.plusPage({ ...common(), settings: M.plusSettings(db), refOwner, values: { ref: refOwner ? ref : '', branch: req.query.branch } }));
  });
  router.post('/plus', async (req, res) => {
    limited(req, 'plus', 15);
    const { fields } = await parseRequest(req);
    try {
      const r = M.startPlusJoin(db, fields);
      if (wantsJson(req)) return sendJson(res, 200, r);
      redirect(res, `/plus/status/${r.statusKey}?go=1`);
    } catch (err) {
      formErrors(req, res, err, (errors) => V.plusPage({ ...common(), settings: M.plusSettings(db), values: fields, errors }));
    }
  });
  router.get('/plus/status/:key', (req, res) => {
    const status = M.plusIntentStatus(db, req.params.key);
    if (!status) return router.notFound(req, res);
    const it = db.prepare('SELECT token, name FROM plus_intents WHERE status_key = ?').get(req.params.key);
    html(res, V.plusStatusPage({ ...common(), statusKey: req.params.key, status, waUrl: status.status === 'awaiting' ? M.plusWaUrl(it) : null }));
  });
  router.get('/api/public/plus/:key', (req, res) => {
    const s = M.plusIntentStatus(db, req.params.key);
    if (!s) throw new HttpError(404, 'غير موجود');
    sendJson(res, 200, s);
  });
  router.get('/plus/card/:token', (req, res) => {
    const p = verifyUrlToken(req.params.token);
    const m = p && p.startsWith('m') ? M.memberSummary(db, Number(p.slice(1))) : null;
    if (!m) throw new HttpError(404, 'انتهت صلاحية رابط البطاقة. اطلب رابطًا جديدًا من الكاشير أو أرسل «بطاقتي» في واتساب.');
    res.setHeader('Cache-Control', 'no-store');
    html(res, V.plusCardPage({ ...common(), m }));
  });

  const reserveCtx = () => ({ ...common(), sections: listSections(db), settings: M.plusSettings(db) });
  router.get('/reserve', (req, res) => {
    const look = Number(req.query.look) ? M.getLook(db, Number(req.query.look)) : null;
    const usable = look?.active ? look : null;
    if (usable) trackEvent(db, 'look_view', { ref: String(usable.id) });
    html(res, V.reservePage({ ...reserveCtx(), look: usable, values: { kind: Object.hasOwn(M.REQUEST_KIND, req.query.kind) ? req.query.kind : undefined, branch: req.query.branch } }));
  });
  router.post('/reserve', async (req, res) => {
    limited(req, 'reserve', 8);
    const { fields } = await parseRequest(req);
    try {
      const r = M.createRequest(db, fields, { source: 'web' });
      if (wantsJson(req)) return sendJson(res, 200, r);
      redirect(res, `/reserve/done/${encodeURIComponent(r.ref)}`);
    } catch (err) {
      const look = Number(fields.look) ? M.getLook(db, Number(fields.look)) : null;
      formErrors(req, res, err, (errors) => V.reservePage({ ...reserveCtx(), look, values: fields, errors }));
    }
  });
  router.get('/reserve/done/:ref', (req, res) => {
    const r = db.prepare("SELECT ref, kind, branch_id FROM requests WHERE ref = ? AND created_at > datetime('now','-1 day')").get(req.params.ref);
    if (!r) return router.notFound(req, res);
    const c = common();
    html(res, V.reserveDonePage({ ...c, result: r, kind: r.kind, branch: c.branches.find((b) => b.id === r.branch_id) }));
  });

  router.get('/occasion', (req, res) => {
    const filters = {
      occasion: Object.hasOwn(M.OCCASIONS, req.query.o) ? req.query.o : '',
      audience: Object.hasOwn(M.AUDIENCES, req.query.a) ? req.query.a : '',
      budget: Number(req.query.b) > 0 ? Number(req.query.b) : '',
    };
    html(res, V.occasionPage({ ...common(), sections: listSections(db), filters, looks: M.listLooks(db, { publicOnly: true, ...filters, budget: Number(filters.budget) || 0 }) }));
  });

  router.get('/gift/:code', (req, res) => {
    const gift = M.giftReceipt(db, req.params.code);
    if (!gift) return router.notFound(req, res);
    html(res, V.giftPage({ ...common(), gift }));
  });

  // ————— واجهات اللوحة —————
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
  const body = async (req) => (await parseRequest(req)).fields;
  const ok = (res, data = { ok: true }) => sendJson(res, 200, data);
  const id = (req) => Number(req.params.id);
  const log = (req, action, entity, entityId, detail) => A.audit(db, req.user, action, entity, entityId, detail);
  const scope = (req) => A.branchScope(req.user);

  router.get('/api/plus/meta', auth(), (req, res) => ok(res, {
    requestKind: M.REQUEST_KIND, requestStatus: M.REQUEST_STATUS, occasions: M.OCCASIONS, audiences: M.AUDIENCES, walletKind: M.WALLET_KIND,
    consent: M.PLUS_CONSENT, settings: M.plusSettings(db), kindNote: V.KIND_NOTE(M.plusSettings(db)),
  }));

  // البحث برقم الجوال أو رقم العضوية، أو بإيصال هدية GIFT-XXXX
  router.get('/api/plus/lookup', auth('plus'), (req, res) => {
    const q = String(req.query.q || '').trim().toUpperCase();
    const g = /^GIFT-([A-Z2-9]{8})$/.exec(q);
    if (g) {
      const inv = db.prepare('SELECT i.*, b.short_name branch FROM invoices i JOIN branches b ON b.id = i.branch_id WHERE gift_code = ?').get(g[1]);
      if (!inv) fail(404, 'إيصال الهدية غير موجود');
      return ok(res, { gift: { ...M.giftReceipt(db, g[1]), invoiceId: inv.id, ref: inv.ref, memberId: inv.member_id } });
    }
    const m = M.findMember(db, q);
    ok(res, { member: m ? M.memberSummary(db, m.id) : null });
  });
  router.post('/api/plus/members', auth('plus'), async (req, res) => {
    const b = await body(req);
    if (!(b.consent === true || b.consent === 'on' || b.consent === '1')) fail(400, 'موافقة العميل مطلوبة', { consent: 'مطلوبة' });
    const branchId = Number(b.branchId) || null;
    if (branchId && scope(req) && !scope(req).includes(branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
    const r = M.createMember(db, { ...b, branchId, consent: true, source: 'cashier', userId: req.user.id });
    if (r.created) log(req, 'plus.member_create', 'member', r.member.id);
    ok(res, { created: r.created, member: M.memberSummary(db, r.member.id) });
  });
  router.get('/api/plus/members/:id', auth('plus'), (req, res) => {
    const m = M.memberSummary(db, id(req));
    if (!m) fail(404, 'العضو غير موجود');
    ok(res, m);
  });
  router.post('/api/plus/members/:id/card', auth('plus'), (req, res) => {
    const m = M.memberSummary(db, id(req));
    if (!m) fail(404, 'العضو غير موجود');
    M.sendCard(db, id(req));
    ok(res);
  });
  router.post('/api/plus/members/:id/wallet', auth('plus.manage'), async (req, res) => {
    const b = await body(req);
    M.adjustWallet(db, req.user, id(req), b.amount, b.note);
    log(req, 'plus.wallet_adjust', 'member', id(req), { amount: Number(b.amount), note: String(b.note || '').slice(0, 120) });
    ok(res, M.memberSummary(db, id(req)));
  });
  router.post('/api/plus/members/:id/stop', auth('plus.manage'), (req, res) => {
    db.prepare("UPDATE members SET consent_marketing = 0 WHERE id = ?").run(id(req));
    log(req, 'plus.member_stop', 'member', id(req));
    ok(res);
  });

  router.post('/api/plus/preview', auth('plus'), async (req, res) => ok(res, M.previewInvoice(db, await body(req))));
  router.post('/api/plus/invoices', auth('plus'), async (req, res) => {
    const r = M.recordInvoice(db, req.user, scope(req), await body(req));
    log(req, 'plus.invoice', 'invoice', r.invoiceId, { amount: r.amount, pct: r.pct, wallet: r.walletUsed });
    ok(res, r);
  });
  router.post('/api/plus/claims', auth('plus'), async (req, res) => {
    const b = await body(req);
    const inv = db.prepare('SELECT branch_id FROM invoices WHERE id = ?').get(Number(b.invoiceId));
    if (inv && scope(req) && !scope(req).includes(inv.branch_id)) fail(403, 'لا تملك صلاحية على هذا الفرع');
    const r = M.recordClaim(db, req.user, b);
    log(req, `plus.claim_${b.kind}`, 'claim', r.id, { credit: r.credit });
    ok(res, r);
  });

  router.get('/api/plus/requests', auth('requests'), (req, res) => ok(res, { items: M.listRequests(db, scope(req), { status: req.query.status || 'open', kind: req.query.kind || '' }) }));
  router.post('/api/plus/requests', auth('requests'), async (req, res) => {
    const b = await body(req);
    if (scope(req) && !scope(req).includes(Number(b.branchId))) fail(403, 'لا تملك صلاحية على هذا الفرع');
    const r = M.createRequest(db, b, { source: 'staff', user: req.user });
    log(req, 'plus.request_create', 'request', r.id);
    ok(res, r);
  });
  router.post('/api/plus/requests/:id', auth('requests'), async (req, res) => {
    const r = M.updateRequest(db, req.user, scope(req), id(req), await body(req));
    log(req, `plus.request_${r.status}`, 'request', r.id);
    ok(res, r);
  });

  router.get('/api/plus/looks', anyOf('plus.manage', 'plus'), (req, res) => ok(res, { items: M.listLooks(db) }));
  router.post('/api/plus/looks', auth('plus.manage'), async (req, res) => { const l = M.saveLook(db, null, await body(req)); log(req, 'plus.look_create', 'look', l.id); ok(res, l); });
  router.put('/api/plus/looks/:id', auth('plus.manage'), async (req, res) => {
    if (!M.getLook(db, id(req))) fail(404, 'الإطلالة غير موجودة');
    const l = M.saveLook(db, id(req), await body(req));
    log(req, 'plus.look_update', 'look', l.id);
    ok(res, l);
  });
  router.delete('/api/plus/looks/:id', auth('plus.manage'), (req, res) => { db.prepare('DELETE FROM looks WHERE id = ?').run(id(req)); log(req, 'plus.look_delete', 'look', id(req)); ok(res); });

  router.get('/api/plus/settings', anyOf('plus.manage', 'plus.reports'), (req, res) => ok(res, M.plusSettings(db)));
  router.put('/api/plus/settings', auth('plus.manage'), async (req, res) => {
    const s = M.savePlusSettings(db, await body(req));
    log(req, 'plus.settings', 'setting', 'plus');
    ok(res, s);
  });

  router.get('/api/plus/report', auth('plus.reports'), (req, res) => ok(res, M.pilotReport(db, scope(req), { days: Math.min(365, Number(req.query.days) || 30) })));
  router.get('/api/plus/days', auth('plus.reports'), (req, res) => {
    const rows = db.prepare("SELECT d.*, b.short_name branch FROM branch_days d JOIN branches b ON b.id = d.branch_id WHERE day >= date('now','-45 days') ORDER BY day DESC, branch_id").all();
    ok(res, { items: rows.filter((r) => scope(req) === null || scope(req).includes(r.branch_id)) });
  });
  router.post('/api/plus/days', auth('plus.reports'), async (req, res) => {
    const b = await body(req);
    M.saveBranchDay(db, scope(req), b);
    log(req, 'plus.branch_day', 'branch', Number(b.branchId), { day: b.day });
    ok(res);
  });
}
