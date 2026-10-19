import { freshDb, addUser } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/modules/giftcards.js';
import { mockPay, checkoutStatus } from '../src/modules/payments.js';
import { HttpError } from '../src/http.js';

const order = (extra = {}) => ({ amount: '200', design: 'eid', senderName: 'سارة', recipientName: 'نورة', recipientPhone: '0553330001', buyerPhone: '0553330002', message: 'كل عام وأنت بخير', terms: '1', ...extra });
const providerId = (db, key) => db.prepare('SELECT provider_id FROM gift_orders WHERE key = ?').get(key).provider_id;

test('لا تُصدر القسيمة قبل تأكيد الدفع من البوابة، والتأكيد آمن للتكرار', async () => {
  const db = freshDb();
  const { key, url } = await G.startGiftOrder(db, order());
  assert.match(url, /\/pay\/mock\//);
  assert.equal((await G.settleOrder(db, key)).status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gift_cards').get().n, 0);
  mockPay(providerId(db, key), 200);
  const o = await G.settleOrder(db, key);
  assert.equal(o.status, 'paid');
  await G.settleOrder(db, key);
  const cards = db.prepare('SELECT * FROM gift_cards').all();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].balance, 200);
  assert.ok(cards[0].delivered_at); // أُرسلت فور الدفع
  assert.match(G.prettyCode(cards[0].code), /^GC-\w{4}-\w{3}-\w{3}$/);
});

test('مبلغ مدفوع لا يطابق الطلب لا يُصدر قسيمة', async () => {
  const db = freshDb();
  const { key } = await G.startGiftOrder(db, order({ amount: '300' }));
  mockPay(providerId(db, key), 30);
  assert.equal((await G.settleOrder(db, key)).status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gift_cards').get().n, 0);
});

test('التحقق من الطلب: القيمة والموافقة والجوال والموعد', async () => {
  const db = freshDb();
  await assert.rejects(G.startGiftOrder(db, order({ amount: '10' })), (e) => !!e.fields.amount);
  await assert.rejects(G.startGiftOrder(db, order({ terms: '' })), (e) => !!e.fields.terms);
  await assert.rejects(G.startGiftOrder(db, order({ recipientPhone: '' })), (e) => !!e.fields.recipientPhone);
  await assert.rejects(G.startGiftOrder(db, order({ when: 'later', sendDate: '2020-01-01' })), (e) => !!e.fields.sendDate);
  const r = await G.startGiftOrder(db, order({ deliver: 'self', recipientPhone: '', amount: 'custom', customAmount: '275' }));
  assert.equal(db.prepare('SELECT amount, deliver FROM gift_orders WHERE key = ?').get(r.key).amount, 275);
});

test('التسليم المجدول يُرسل في موعده فقط', async () => {
  const db = freshDb();
  const day = new Date(Date.now() + 3 * 3600_000 + 2 * 86400_000).toISOString().slice(0, 10);
  const { key } = await G.startGiftOrder(db, order({ when: 'later', sendDate: day, sendTime: '10:00' }));
  mockPay(providerId(db, key), 200);
  await G.settleOrder(db, key);
  const c = db.prepare('SELECT * FROM gift_cards').get();
  assert.equal(c.delivered_at, null);
  assert.equal(G.deliverDue(db), 0);
  db.prepare("UPDATE gift_cards SET send_at = datetime('now','-1 minute')").run();
  assert.equal(G.deliverDue(db), 1);
  assert.ok(db.prepare('SELECT delivered_at FROM gift_cards').get().delivered_at);
});

test('الاستخدام على دفعات ولا يتجاوز الرصيد، والمنتهية والملغاة لا تُستخدم', () => {
  const db = freshDb(); const u = addUser(db);
  const br = db.prepare('SELECT id FROM branches ORDER BY id').get().id;
  const c = G.issueAtBranch(db, u, null, { amount: 150, branchId: br });
  assert.ok(G.findCard(db, c.code.toLowerCase()));
  assert.equal(G.redeem(db, u, null, c.id, { branchId: br, amount: 100, ref: 'POS1' }).balance, 50);
  assert.throws(() => G.redeem(db, u, null, c.id, { branchId: br, amount: 60 }), /الرصيد المتاح/);
  assert.throws(() => G.redeem(db, u, [999], c.id, { branchId: br, amount: 10 }), (e) => e.status === 403);
  db.prepare("UPDATE gift_cards SET expires_at = datetime('now','-1 day') WHERE id = ?").run(c.id);
  assert.throws(() => G.redeem(db, u, null, c.id, { branchId: br, amount: 10 }), /انتهت/);
  db.prepare("UPDATE gift_cards SET expires_at = datetime('now','+1 day') WHERE id = ?").run(c.id);
  assert.throws(() => G.cancelCard(db, u, c.id, ''), HttpError);
  G.cancelCard(db, u, c.id, 'طلب العميل');
  assert.throws(() => G.redeem(db, u, null, c.id, { branchId: br, amount: 10 }), /ملغاة/);
  const list = G.giftList(db);
  assert.equal(list.totals.outstanding, 0);
  assert.equal(list.totals.redeemed, 100);
});

test('البوابة التجريبية لا تعمل دون طلب', async () => {
  assert.equal((await checkoutStatus('mock_nope')).status, 'pending');
});
