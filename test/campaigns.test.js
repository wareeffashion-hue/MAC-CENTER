import { freshDb, addUser } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveOffer, transitionOffer, createCampaign, sendTest, scheduleCampaign, materialize, dispatch, autoCampaigns, cancelCampaign } from '../src/modules/offers.js';
import { setSetting } from '../src/db.js';
import { stopSubscription } from '../src/modules/whatsapp.js';

const noon = new Date('2026-10-10T09:00:00Z'); // 12:00 بتوقيت الرياض
const local = (iso) => new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

function subscribe(db, wa, branchIds, sectionIds) {
  const c = db.prepare('INSERT INTO contacts (wa_id) VALUES (?)').run(wa).lastInsertRowid;
  db.prepare(`INSERT INTO subscriptions (contact_id, status, branch_ids, section_ids, consent_text, consent_version, consent_at)
    VALUES (?, 'active', ?, ?, 'أوافق', 'v1', datetime('now'))`).run(c, JSON.stringify(branchIds), JSON.stringify(sectionIds));
  return Number(c);
}

function activeOffer(db, user, extra = {}) {
  const o = saveOffer(db, user, null, { title: 'عرض المدارس', branchIds: [1], sectionIds: [6], starts_at: local('2026-10-01T00:00:00Z'), ends_at: local('2026-10-30T00:00:00Z'), template_name: 'mac_offer', ...extra });
  return transitionOffer(db, o.id, 'approve', true);
}

test('دورة الحملة: اختبار ثم جدولة ثم إرسال للمؤهلين فقط', async () => {
  const db = freshDb();
  const user = { ...addUser(db, { role: 'marketing' }), wa_phone: '966500000099' };
  const yes = subscribe(db, '966511111111', [1], [6]);
  subscribe(db, '966522222222', [2], [6]); // فرع آخر
  subscribe(db, '966533333333', [1], [1]); // قسم آخر
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id, template_name: 'mac_offer' });
  assert.equal(c.audience_count, 1);
  assert.throws(() => scheduleCampaign(db, c.id), /رسالة اختبار/);
  await sendTest(db, user, c.id);
  scheduleCampaign(db, c.id);
  db.prepare('UPDATE campaigns SET scheduled_at = ? WHERE id = ?').run('2026-10-05T00:00:00.000Z', c.id);
  materialize(db, noon);
  const r = await dispatch(db, noon);
  assert.equal(r.sent, 1);
  const m = db.prepare('SELECT * FROM messages').all();
  assert.equal(m.length, 1);
  assert.equal(m[0].contact_id, yes);
  assert.equal(m[0].status, 'sent');
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(c.id).status, 'done');
});

test('لا تكرار لنفس العميل في نفس الحملة عند إعادة التشغيل', async () => {
  const db = freshDb();
  const user = { ...addUser(db, { role: 'marketing' }), wa_phone: '9665' };
  subscribe(db, '966511111112', [1], [6]);
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  materialize(db, noon);
  db.prepare("UPDATE campaigns SET status = 'scheduled' WHERE id = ?").run(c.id);
  materialize(db, noon);
  await dispatch(db, noon);
  await dispatch(db, noon);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
});

test('سقف الرسائل الأسبوعي يستبعد العميل', async () => {
  const db = freshDb();
  setSetting(db, 'messaging', { weeklyCap: 1, sendWindow: ['10:00', '22:00'], costPerMarketing: 0.05 });
  const user = addUser(db, { role: 'marketing' });
  const c1 = subscribe(db, '966511111113', [1], [6]);
  db.prepare("INSERT INTO campaigns (name, template_name, status) VALUES ('سابقة', 't', 'done')").run();
  db.prepare("INSERT INTO messages (campaign_id, contact_id, status, sent_at) VALUES (1, ?, 'delivered', ?)").run(c1, '2026-10-08 10:00:00');
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  materialize(db, noon);
  await dispatch(db, noon);
  const m = db.prepare('SELECT * FROM messages WHERE campaign_id = ?').get(c.id);
  assert.equal(m.status, 'excluded');
  assert.match(m.reason, /سقف/);
});

test('خارج ساعات الإرسال تبقى الرسائل في الطابور', async () => {
  const db = freshDb();
  const user = addUser(db, { role: 'marketing' });
  subscribe(db, '966511111114', [1], [6]);
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  const night = new Date('2026-10-10T21:00:00Z'); // منتصف الليل في الرياض
  materialize(db, night);
  const r = await dispatch(db, night);
  assert.equal(r.sent, 0);
  assert.equal(db.prepare('SELECT status FROM messages').get().status, 'queued');
});

test('إلغاء العرض أثناء الإرسال يوقف الرسائل المتبقية', async () => {
  const db = freshDb();
  const user = addUser(db, { role: 'marketing' });
  subscribe(db, '966511111115', [1], [6]);
  subscribe(db, '966511111116', [1], [6]);
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  materialize(db, noon);
  transitionOffer(db, o.id, 'cancel', true);
  await dispatch(db, noon);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM messages WHERE status = 'excluded'").get().n, 2);
  assert.equal(db.prepare('SELECT status FROM campaigns').get().status, 'cancelled');
});

test('العميل الذي أوقف اشتراكه لا يصله شيء حتى لو كان في الطابور', async () => {
  const db = freshDb();
  const user = addUser(db, { role: 'marketing' });
  const c1 = subscribe(db, '966511111117', [1], [6]);
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  materialize(db, noon);
  stopSubscription(db, c1, 'test');
  const r = await dispatch(db, noon);
  assert.equal(r.sent, 0);
  assert.equal(db.prepare('SELECT status FROM messages').get().status, 'excluded');
});

test('الحملة التلقائية تنتظر رسالة اختبار للقالب قبل أول إرسال', () => {
  const db = freshDb();
  const user = addUser(db, { role: 'marketing' });
  addUser(db, { role: 'admin' });
  activeOffer(db, user, { send_enabled: true });
  autoCampaigns(db, noon);
  const c = db.prepare('SELECT * FROM campaigns').get();
  assert.equal(c.auto, 1);
  assert.equal(c.status, 'draft');
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE kind = 'campaign'").get());
  autoCampaigns(db, noon);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM campaigns').get().n, 1);
});

test('الإلغاء اليدوي للحملة يستبعد الطابور', () => {
  const db = freshDb();
  const user = addUser(db, { role: 'marketing' });
  subscribe(db, '966511111118', [1], [6]);
  const o = activeOffer(db, user);
  const c = createCampaign(db, user, { offerId: o.id });
  db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = '2026-10-01T00:00:00.000Z' WHERE id = ?").run(c.id);
  materialize(db, noon);
  cancelCampaign(db, c.id);
  assert.equal(db.prepare('SELECT status FROM messages').get().status, 'excluded');
});
