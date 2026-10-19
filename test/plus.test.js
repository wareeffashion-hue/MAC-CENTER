import { freshDb, addUser } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/modules/plus.js';
import { handleWebhook } from '../src/modules/whatsapp.js';
import { HttpError } from '../src/http.js';

const secs = (db, n) => db.prepare('SELECT id FROM sections ORDER BY id LIMIT ?').all(n).map((s) => s.id);
const branch = (db) => db.prepare('SELECT id FROM branches WHERE active = 1 ORDER BY id').get().id;
let refN = 0;
const invoice = (db, user, memberId, amount, n, extra = {}) => P.recordInvoice(db, user, null, { memberId, branchId: branch(db), ref: `INV${++refN}`, amount, sectionIds: secs(db, n), ...extra });
const inbound = (from, text) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'عميل' } }], messages: [{ id: Math.random().toString(36), from, type: 'text', text: { body: text } }] } }] }] });

test('خطوط العربة: النسبة تتبع عدد الأقسام في الفاتورة', () => {
  const tiers = P.plusSettings(freshDb()).tiers;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => P.tierFor(n, tiers)), [0, 2, 2, 3, 3, 5, 5]);
});

test('الفاتورة تحسب الخصم وتمنع تكرار رقمها في الفرع', () => {
  const db = freshDb(); const u = addUser(db);
  const { member } = P.createMember(db, { phone: '0551110001', consent: true });
  const r = invoice(db, u, member.id, 400, 4);
  assert.equal(r.pct, 3); assert.equal(r.discount, 12); assert.equal(r.payable, 388);
  assert.deepEqual(r.nextTier, { need: 2, pct: 5 });
  assert.throws(() => P.recordInvoice(db, u, null, { memberId: member.id, branchId: branch(db), ref: `INV${refN}`, amount: 50, sectionIds: secs(db, 1) }), (e) => e.status === 409);
});

test('وضع المحفظة يضيف المكافأة رصيدًا، والرصيد يُستهلك الأقرب انتهاءً أولًا', () => {
  const db = freshDb(); const u = addUser(db);
  P.savePlusSettings(db, { rewardMode: 'wallet' });
  const { member } = P.createMember(db, { phone: '0551110002', consent: true });
  const r = invoice(db, u, member.id, 1000, 6);
  assert.equal(r.discount, 0); assert.equal(r.balance, 50);
  P.credit(db, member.id, 'adjust', 10, { days: 2 });
  const r2 = invoice(db, u, member.id, 30, 1, { useWallet: true });
  assert.equal(r2.walletUsed, 30); assert.equal(r2.payable, 0);
  const soon = db.prepare("SELECT remaining FROM wallet_entries WHERE kind = 'adjust'").get();
  assert.equal(soon.remaining, 0); // الرصيد الأقرب انتهاءً استُخدم أولًا
  assert.equal(P.balance(db, member.id), 30);
});

test('الرصيد المنتهي يُسجل ويخرج من الرصيد', () => {
  const db = freshDb();
  const { member } = P.createMember(db, { phone: '0551110003', consent: true });
  const id = P.credit(db, member.id, 'adjust', 25, { days: 5 });
  db.prepare("UPDATE wallet_entries SET expires_at = datetime('now','-1 hour') WHERE id = ?").run(id);
  assert.equal(P.balance(db, member.id), 0);
  assert.equal(P.expireCredits(db), 1);
  assert.equal(db.prepare("SELECT amount FROM wallet_entries WHERE kind = 'expire'").get().amount, -25);
});

test('الدعوة: هدية مشروطة للصديق، ومكافأة للداعي مرة واحدة وبسقف شهري', () => {
  const db = freshDb(); const u = addUser(db);
  P.savePlusSettings(db, { referral: { monthlyCap: 1 } });
  const { member: a } = P.createMember(db, { phone: '0551110004', consent: true });
  const { member: b } = P.createMember(db, { phone: '0551110005', refCode: a.ref_code, consent: true });
  assert.equal(P.balance(db, b.id), 20);
  assert.equal(P.balance(db, b.id, 100), 0); // مشروط بفاتورة 200 فأكثر
  assert.equal(P.previewInvoice(db, { memberId: b.id, amount: 100, sectionIds: secs(db, 1), useWallet: true }).walletApplied, 0);
  invoice(db, u, b.id, 150, 1);
  assert.equal(P.balance(db, a.id), 0); // الفاتورة دون الحد الأدنى
  invoice(db, u, b.id, 250, 1);
  assert.equal(P.balance(db, a.id), 20);
  invoice(db, u, b.id, 250, 1);
  assert.equal(P.balance(db, a.id), 20); // لا تتكرر لنفس الصديق
  const { member: c } = P.createMember(db, { phone: '0551110006', refCode: a.ref_code, consent: true });
  invoice(db, u, c.id, 300, 1);
  assert.equal(P.balance(db, a.id), 20); // السقف الشهري
});

test('ضمان السعر يضيف الفرق بسقف للفاتورة، والمقاس مرة لكل قطعة', () => {
  const db = freshDb(); const u = addUser(db);
  const { member } = P.createMember(db, { phone: '0551110007', consent: true });
  const r = invoice(db, u, member.id, 500, 1);
  assert.equal(P.recordClaim(db, u, { kind: 'price', invoiceId: r.invoiceId, item: 'فستان', paid: 300, newPrice: 220 }).credit, 80);
  assert.equal(P.recordClaim(db, u, { kind: 'price', invoiceId: r.invoiceId, item: 'حذاء', paid: 100, newPrice: 50 }).credit, 20);
  assert.throws(() => P.recordClaim(db, u, { kind: 'price', invoiceId: r.invoiceId, item: 'شنطة', paid: 100, newPrice: 50 }), HttpError);
  assert.throws(() => P.recordClaim(db, u, { kind: 'price', invoiceId: r.invoiceId, item: 'x', paid: 100, newPrice: 120 }), HttpError);
  P.recordClaim(db, u, { kind: 'size', invoiceId: r.invoiceId, item: 'قميص' });
  assert.throws(() => P.recordClaim(db, u, { kind: 'size', invoiceId: r.invoiceId, item: 'قميص' }), (e) => e.status === 409);
  db.prepare("UPDATE invoices SET created_at = datetime('now','-20 days')").run();
  assert.throws(() => P.recordClaim(db, u, { kind: 'size', invoiceId: r.invoiceId, item: 'بنطال' }), /انتهت/);
});

test('إيصال الهدية لا يكشف السعر', () => {
  const db = freshDb(); const u = addUser(db);
  const { member } = P.createMember(db, { phone: '0551110008', consent: true });
  const r = invoice(db, u, member.id, 199, 1, { gift: true });
  const g = P.giftReceipt(db, r.gift);
  assert.ok(g && !g.expired);
  assert.equal(JSON.stringify(g).includes('199'), false);
});

test('الطلبات: موافقة للطلب من الموقع، وحد للطلبات المفتوحة، وانتهاء الحجز', () => {
  const db = freshDb(); const u = addUser(db);
  const base = { kind: 'reserve', phone: '0551110009', branch: branch(db), details: 'فستان كحلي' };
  assert.throws(() => P.createRequest(db, base), (e) => !!e.fields.consent);
  for (let i = 0; i < 3; i++) P.createRequest(db, { ...base, consent: '1' });
  assert.throws(() => P.createRequest(db, { ...base, consent: '1' }), /طلبات مفتوحة/);
  P.createRequest(db, { ...base, kind: 'find', consent: '1' }); // «لقيناه لك» خارج الحد
  const r = db.prepare("SELECT id FROM requests WHERE kind = 'reserve' ORDER BY id LIMIT 1").get();
  assert.throws(() => P.updateRequest(db, u, null, r.id, { status: 'ready' }), HttpError);
  const up = P.updateRequest(db, u, null, r.id, { status: 'confirmed' });
  assert.ok(up.hold_until);
  db.prepare("UPDATE requests SET hold_until = datetime('now','-1 minute') WHERE id = ?").run(r.id);
  assert.equal(P.expireRequests(db), 1);
  const other = addUser(db, { role: 'agent', branchIds: [999] });
  const r2 = db.prepare("SELECT id FROM requests WHERE status = 'new' AND kind = 'reserve' LIMIT 1").get();
  assert.throws(() => P.updateRequest(db, other, [999], r2.id, { status: 'confirmed' }), (e) => e.status === 403);
});

test('الانضمام من الموقع يكتمل برسالة واتساب يرسلها العميل', async () => {
  const db = freshDb();
  assert.throws(() => P.startPlusJoin(db, {}), (e) => !!e.fields.consent);
  const { member: inviter } = P.createMember(db, { phone: '0551110010', consent: true });
  const r = P.startPlusJoin(db, { name: 'نورة', consent: '1', ref: inviter.ref_code });
  assert.equal(P.plusIntentStatus(db, r.statusKey).status, 'awaiting');
  const tok = /MP-([A-Z2-9]{6})/.exec(decodeURIComponent(r.waUrl))[1];
  const res = await handleWebhook(db, inbound('966551110011', `رمز الانضمام: MP-${tok}`));
  assert.equal(res[0].outcome, 'plus');
  const st = P.plusIntentStatus(db, r.statusKey);
  assert.equal(st.status, 'confirmed');
  assert.match(st.cardUrl, /\/plus\/card\//);
  const m = db.prepare("SELECT * FROM members WHERE phone = '0551110011'").get();
  assert.equal(m.referred_by, inviter.id);
  assert.equal(m.name, 'نورة');
  assert.equal(P.balance(db, m.id), 20);
});

test('المجموعة الضابطة تُسجل دون خصم الأقسام', () => {
  const db = freshDb(); const u = addUser(db);
  P.savePlusSettings(db, { controlPct: 50 });
  const { member } = P.createMember(db, { phone: '0551110012', consent: true });
  db.prepare('UPDATE members SET control = 1 WHERE id = ?').run(member.id);
  const r = invoice(db, u, member.id, 600, 6);
  assert.equal(r.pct, 0); assert.equal(r.payable, 600);
  assert.equal(P.pilotReport(db, null).aov.control, 600);
});

test('مؤشرات التجربة: نسبة العميل المعروف من أرقام الفروع', () => {
  const db = freshDb(); const u = addUser(db);
  const { member } = P.createMember(db, { phone: '0551110013', consent: true });
  invoice(db, u, member.id, 300, 3);
  const day = db.prepare('SELECT substr(created_at,1,10) d FROM invoices').get().d;
  P.saveBranchDay(db, null, { branchId: branch(db), day, invoices: 10, sales: 1200 });
  const rep = P.pilotReport(db, null);
  assert.equal(rep.invoices.knownRate, 10);
  assert.equal(rep.aov.nonMembers, 100);
  assert.equal(rep.depts.avg, 3);
});
