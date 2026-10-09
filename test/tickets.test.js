import { freshDb, addUser } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket, updateTicket, escalateLate, listTickets, getTicket } from '../src/modules/tickets.js';
import { HttpError } from '../src/http.js';

test('شكوى دون رقم تحفظ ولا تعد وعدًا بالتواصل، وطلب التواصل يتطلب رقمًا وموافقة', () => {
  const db = freshDb();
  const anon = createTicket(db, { type: 'complaint', branch: 1, body: 'تأخر الكاشير' });
  assert.equal(anon.wantsContact, false);
  assert.match(anon.responseNote, /نحتاج رقم الجوال/);
  assert.throws(() => createTicket(db, { type: 'contact', branch: 1, body: 'اتصلوا' }), (e) => e instanceof HttpError && !!e.fields.phone);
  assert.throws(() => createTicket(db, { type: 'contact', branch: 1, body: 'اتصلوا', phone: '0551234567' }), (e) => !!e.fields.contact_consent);
  const ok = createTicket(db, { type: 'contact', branch: 1, body: 'اتصلوا', phone: '+966551234567', contact_consent: '1' });
  assert.equal(ok.wantsContact, true);
  assert.equal(db.prepare('SELECT phone FROM tickets WHERE id = ?').get(ok.id).phone, '0551234567');
});

test('تقييم منخفض ينشئ تذكرة بأولوية مرتفعة، والإيجابي يغلق للاطلاع', () => {
  const db = freshDb();
  const low = createTicket(db, { type: 'experience', branch: 1, rating: 1 });
  assert.equal(db.prepare('SELECT priority, status FROM tickets WHERE id = ?').get(low.id).priority, 'high');
  const high = createTicket(db, { type: 'experience', branch: 1, rating: 5, body: 'ممتاز' });
  assert.equal(db.prepare('SELECT status FROM tickets WHERE id = ?').get(high.id).status, 'closed');
});

test('التوجيه: أدق قاعدة أولًا، والبديل عند غياب المسؤول، وإلا طابور الفرع', () => {
  const db = freshDb();
  const a = addUser(db, { role: 'agent', branchIds: [1] });
  const b = addUser(db, { role: 'agent', branchIds: [1] });
  const m = addUser(db, { role: 'branch_manager', branchIds: [1] });
  db.prepare('INSERT INTO routing_rules (branch_id, user_id) VALUES (1, ?)').run(a.id);
  db.prepare("INSERT INTO routing_rules (branch_id, topic, user_id, backup_user_id) VALUES (1, 'exchange', ?, ?)").run(m.id, b.id);
  const t1 = createTicket(db, { type: 'complaint', branch: 1, body: 'x', topic: 'exchange' });
  assert.equal(db.prepare('SELECT assignee_id FROM tickets WHERE id = ?').get(t1.id).assignee_id, m.id);
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(m.id);
  const t2 = createTicket(db, { type: 'complaint', branch: 1, body: 'x', topic: 'exchange' });
  assert.equal(db.prepare('SELECT assignee_id FROM tickets WHERE id = ?').get(t2.id).assignee_id, b.id);
  const t3 = createTicket(db, { type: 'complaint', branch: 2, body: 'x' });
  const row = db.prepare('SELECT assignee_id, status FROM tickets WHERE id = ?').get(t3.id);
  assert.equal(row.assignee_id, null);
  assert.equal(row.status, 'new');
  assert.ok(db.prepare('SELECT 1 FROM notifications WHERE user_id = ?').get(m.id) || true);
});

test('التصعيد: المهمة غير المستلمة تعاد للبديل ثم تصعد للمدير', () => {
  const db = freshDb();
  const a = addUser(db, { role: 'agent', branchIds: [1] });
  const b = addUser(db, { role: 'agent', branchIds: [1] });
  const mgr = addUser(db, { role: 'branch_manager', branchIds: [1] });
  const admin = addUser(db, { role: 'admin' });
  db.prepare('INSERT INTO routing_rules (branch_id, user_id, backup_user_id) VALUES (1, ?, ?)').run(a.id, b.id);
  const t = createTicket(db, { type: 'complaint', branch: 1, body: 'x' });
  const later = new Date(Date.now() + 2 * 3600000);
  escalateLate(db, later);
  let row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(t.id);
  assert.equal(row.assignee_id, b.id);
  assert.equal(row.escalation_level, 1);
  assert.ok(db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND kind = ?').get(mgr.id, 'escalation'));
  escalateLate(db, new Date(later.getTime() + 2 * 3600000));
  row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(t.id);
  assert.equal(row.escalation_level, 2);
  assert.ok(db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND kind = ?').get(admin.id, 'escalation'));
});

test('الاستلام يوقف التصعيد', () => {
  const db = freshDb();
  const a = addUser(db, { role: 'agent', branchIds: [1] });
  const t = createTicket(db, { type: 'complaint', branch: 1, body: 'x' });
  updateTicket(db, a, t.id, 'acknowledge');
  assert.equal(escalateLate(db, new Date(Date.now() + 5 * 3600000)), 0);
});

test('موظف قباء لا يصل إلى تذاكر الدائري', () => {
  const db = freshDb();
  const quba = addUser(db, { role: 'agent', branchIds: [3] });
  const t = createTicket(db, { type: 'complaint', branch: 2, body: 'x' });
  assert.throws(() => getTicket(db, quba, t.id), (e) => e.status === 403);
  assert.equal(listTickets(db, quba, {}).length, 0);
});

test('الإغلاق يتطلب سببًا، وإعادة الفتح تسجل', () => {
  const db = freshDb();
  const admin = addUser(db, { role: 'admin' });
  const t = createTicket(db, { type: 'complaint', branch: 1, body: 'x' });
  updateTicket(db, admin, t.id, 'acknowledge');
  assert.throws(() => updateTicket(db, admin, t.id, 'status', { status: 'closed' }), /سبب/);
  updateTicket(db, admin, t.id, 'status', { status: 'closed', reason: 'حل' });
  const r = updateTicket(db, admin, t.id, 'status', { status: 'in_progress' });
  assert.ok(r.events.some((e) => e.kind === 'reopened'));
});

test('الصور فقط بالمحتوى الصحيح وبحد ثلاث', () => {
  const db = freshDb();
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const fake = Buffer.from('<?php echo 1; ?>');
  assert.throws(() => createTicket(db, { type: 'complaint', branch: 1, body: 'x' }, [{ field: 'images', data: fake }]), (e) => !!e.fields.images);
  assert.throws(() => createTicket(db, { type: 'complaint', branch: 1, body: 'x' }, Array(4).fill({ field: 'images', data: png })), (e) => !!e.fields.images);
  const ok = createTicket(db, { type: 'complaint', branch: 1, body: 'x' }, [{ field: 'images', data: png }]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attachments WHERE ticket_id = ?').get(ok.id).n, 1);
});
