import { freshDb } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSubscription, handleWebhook, intentStatus, stopSubscription, updatePreferences, verifySignature } from '../src/modules/whatsapp.js';
import { HttpError } from '../src/http.js';

const inbound = (from, text, id = Math.random().toString(36)) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'عميل' } }], messages: [{ id, from, type: 'text', text: { body: text } }] } }] }] });
const tokenFrom = (waUrl) => /MC-([A-Z2-9]{6})/.exec(decodeURIComponent(waUrl))[1];

test('لا يكتمل الاشتراك دون موافقة واختيارات', () => {
  const db = freshDb();
  assert.throws(() => startSubscription(db, { branches: [1], sections: [1] }, { publicUrl: '' }), (e) => e instanceof HttpError && !!e.fields.consent);
  assert.throws(() => startSubscription(db, { consent: '1' }, { publicUrl: '' }), (e) => !!(e.fields.branches && e.fields.sections));
});

test('فتح الرابط وحده لا يعني اشتراكًا؛ التأكيد يأتي من رسالة واتساب', async () => {
  const db = freshDb();
  const r = startSubscription(db, { branches: [3], sections: [1, 2], consent: '1', qr: 'QUBA01' }, { publicUrl: '' });
  assert.equal(intentStatus(db, r.statusKey).status, 'awaiting');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subscriptions').get().n, 0);

  const res = await handleWebhook(db, inbound('966500000001', `أرغب في الاشتراك\nرمز الربط: MC-${tokenFrom(r.waUrl)}`));
  assert.equal(res[0].outcome, 'subscribed');
  assert.equal(intentStatus(db, r.statusKey).status, 'confirmed');
  const sub = db.prepare('SELECT * FROM subscriptions').get();
  assert.equal(sub.status, 'active');
  assert.deepEqual(JSON.parse(sub.branch_ids), [3]);
  assert.equal(sub.source_qr, 'QUBA01');
  assert.match(sub.consent_text, /أوافق/);
});

test('تكرار حدث الربط نفسه لا يعالج مرتين', async () => {
  const db = freshDb();
  const r = startSubscription(db, { branches: [1], sections: [1], consent: '1' }, { publicUrl: '' });
  const ev = inbound('966500000002', `MC-${tokenFrom(r.waUrl)}`, 'wamid.same');
  assert.equal((await handleWebhook(db, ev)).length, 1);
  assert.equal((await handleWebhook(db, ev)).length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM subscription_events WHERE kind = 'subscribed'").get().n, 1);
});

test('الاشتراك من رمز آخر يحدث التفضيلات دون جهة اتصال مكررة', async () => {
  const db = freshDb();
  const a = startSubscription(db, { branches: [1], sections: [1], consent: '1', qr: 'MAC01' }, { publicUrl: '' });
  const b = startSubscription(db, { branches: [3], sections: [4], consent: '1', qr: 'QUBA01' }, { publicUrl: '' });
  await handleWebhook(db, inbound('966500000003', `MC-${tokenFrom(a.waUrl)}`));
  await handleWebhook(db, inbound('966500000003', `MC-${tokenFrom(b.waUrl)}`));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contacts').get().n, 1);
  const sub = db.prepare('SELECT * FROM subscriptions').get();
  assert.deepEqual(JSON.parse(sub.branch_ids).sort(), [1, 3]);
  assert.deepEqual(JSON.parse(sub.section_ids).sort(), [1, 4]);
  assert.equal(sub.source_qr, 'MAC01');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subscription_events').get().n, 2);
});

test('الرمز المنتهي يرفض ولا ينشئ اشتراكًا', async () => {
  const db = freshDb();
  const r = startSubscription(db, { branches: [1], sections: [1], consent: '1' }, { publicUrl: '' });
  db.prepare("UPDATE subscription_intents SET expires_at = datetime('now','-1 minute')").run();
  const res = await handleWebhook(db, inbound('966500000004', `MC-${tokenFrom(r.waUrl)}`));
  assert.equal(res[0].outcome, 'expired');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subscriptions').get().n, 0);
});

test('«إيقاف» يوقف الاشتراك ويستبعد الرسائل المنتظرة', async () => {
  const db = freshDb();
  const r = startSubscription(db, { branches: [1], sections: [1], consent: '1' }, { publicUrl: '' });
  await handleWebhook(db, inbound('966500000005', `MC-${tokenFrom(r.waUrl)}`));
  const contact = db.prepare('SELECT * FROM contacts').get();
  db.prepare("INSERT INTO offers (slug, title, branch_ids, starts_at, ends_at, status) VALUES ('o', 'عرض', '[1]', '2020-01-01', '2099-01-01', 'approved')").run();
  db.prepare("INSERT INTO campaigns (offer_id, name, template_name, status) VALUES (1, 'ح', 't', 'sending')").run();
  db.prepare("INSERT INTO messages (campaign_id, contact_id, status) VALUES (1, ?, 'queued')").run(contact.id);
  const res = await handleWebhook(db, inbound('966500000005', 'إيقاف'));
  assert.equal(res[0].outcome, 'stopped');
  assert.equal(db.prepare('SELECT status FROM subscriptions').get().status, 'stopped');
  assert.equal(db.prepare('SELECT status FROM messages').get().status, 'excluded');
});

test('إيقاف فرع محدد يبقي الباقي ويستبعد الرسائل غير المطابقة', async () => {
  const db = freshDb();
  const r = startSubscription(db, { branches: [1, 2], sections: [1], consent: '1' }, { publicUrl: '' });
  await handleWebhook(db, inbound('966500000006', `MC-${tokenFrom(r.waUrl)}`));
  const c = db.prepare('SELECT id FROM contacts').get().id;
  db.prepare("INSERT INTO offers (slug, title, branch_ids, section_ids, starts_at, ends_at, status) VALUES ('o2', 'عرض', '[2]', '[]', '2020-01-01', '2099-01-01', 'approved')").run();
  db.prepare("INSERT INTO campaigns (offer_id, name, template_name, status) VALUES (1, 'ح', 't', 'sending')").run();
  db.prepare("INSERT INTO messages (campaign_id, contact_id, status) VALUES (1, ?, 'queued')").run(c);
  assert.equal(stopSubscription(db, c, 'test', { branchIds: [2] }), 'narrowed');
  assert.deepEqual(JSON.parse(db.prepare('SELECT branch_ids FROM subscriptions').get().branch_ids), [1]);
  assert.equal(db.prepare('SELECT status FROM messages').get().status, 'excluded');
  assert.equal(updatePreferences(db, c, { branchIds: [], sectionIds: [1] }), 'stopped');
});

test('توقيع Webhook مطلوب عند ضبط السر', async () => {
  const { config } = await import('../src/config.js');
  config.whatsapp.appSecret = 'sec';
  const { createHmac } = await import('node:crypto');
  const body = Buffer.from('{"a":1}');
  assert.equal(verifySignature(body, 'sha256=' + createHmac('sha256', 'sec').update(body).digest('hex')), true);
  assert.equal(verifySignature(body, 'sha256=bad'), false);
  config.whatsapp.appSecret = undefined;
});
