import { freshDb, addUser } from './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/server.js';
import { hashPassword } from '../src/modules/auth.js';
import { qrMatrix } from '../src/lib/qr.js';

let server, base, db;
before(async () => {
  db = freshDb();
  db.prepare("INSERT INTO users (name, email, role, password) VALUES ('مدير', 'a@t.sa', 'admin', ?)").run(hashPassword('Password123!'));
  db.prepare("INSERT INTO users (name, email, role, branch_ids, password) VALUES ('قباء', 'q@t.sa', 'agent', '[3]', ?)").run(hashPassword('Password123!'));
  server = createServer(createApp(db));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function login(email) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123!' }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('الصفحات العامة تعمل وتحمل بيانات منظمة وروابط واتساب للفروع', async () => {
  for (const p of ['/', '/offers', '/subscribe', '/feedback', '/privacy', '/branches/adel-quba', '/robots.txt', '/sitemap.xml', '/admin']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /application\/ld\+json/);
  assert.match(home, /wa\.me\/966552259342/);
  assert.match(home, /تواصل لمعرفة الدوام/);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

test('رابط بترميز تالف يعيد 400 ولا يسقط الخادم', async () => {
  for (const p of ['/%E0', '/uploads/%', '/api/%zz']) assert.equal((await fetch(base + p)).status, 400, p);
  assert.equal((await fetch(base + '/')).status, 200);
});

test('رؤوس الأمان مضبوطة', async () => {
  const r = await fetch(base + '/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('الاشتراك من النموذج يوجه لصفحة الانتظار والحالة تبقى بانتظار واتساب', async () => {
  const r = await fetch(`${base}/subscribe`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'branches[]=1&sections[]=2&consent=1&qr=ABC' });
  assert.equal(r.status, 303);
  const key = r.headers.get('location').split('/').pop().split('?')[0];
  const s = await (await fetch(`${base}/api/public/subscribe/${key}`)).json();
  assert.equal(s.status, 'awaiting');
  const bad = await fetch(`${base}/subscribe`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'branches[]=1' });
  assert.equal(bad.status, 400);
  assert.ok((await bad.json()).fields.consent);
});

test('الملاحظة متعددة الأجزاء مع صورة تنشئ تذكرة ورابط تتبع محمي', async () => {
  const fd = new FormData();
  fd.set('type', 'complaint'); fd.set('branch', '3'); fd.set('body', 'ملاحظة اختبار'); fd.set('phone', '0551112233'); fd.set('wants_contact', '1'); fd.set('contact_consent', '1');
  fd.append('images', new Blob([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)])], { type: 'image/jpeg' }), 'a.jpg');
  const r = await fetch(`${base}/feedback`, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
  assert.equal(r.status, 200);
  const { ref, trackKey } = await r.json();
  assert.match(ref, /^MC-/);
  const page = await (await fetch(`${base}/track/${trackKey}`)).text();
  assert.match(page, /آخر 4 أرقام/);
  const wrong = await (await fetch(`${base}/track/${trackKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'tail=0000' })).text();
  assert.match(wrong, /غير مطابقة/);
});

test('الواجهة البرمجية تتطلب الدخول وتحترم صلاحيات الفروع', async () => {
  assert.equal((await fetch(`${base}/api/tickets`)).status, 401);
  const admin = await login('a@t.sa');
  const agent = await login('q@t.sa');
  const all = await (await fetch(`${base}/api/tickets?status=all`, { headers: { Cookie: admin } })).json();
  const t = all.items.find((x) => x.branch_id === 3);
  assert.ok(t);
  const mine = await (await fetch(`${base}/api/tickets?status=all`, { headers: { Cookie: agent } })).json();
  assert.ok(mine.items.every((x) => x.branch_id === 3));
  assert.equal((await fetch(`${base}/api/users`, { headers: { Cookie: agent } })).status, 403);
  const att = await (await fetch(`${base}/api/tickets/${t.id}`, { headers: { Cookie: admin } })).json();
  assert.equal(att.attachments.length, 1);
  assert.equal((await fetch(base + att.attachments[0].url)).status, 200);
  assert.equal((await fetch(`${base}/api/attachments/${att.attachments[0].id}?t=forged`)).status, 403);
});

test('طلبات تغيير الحالة من موقع آخر ترفض', async () => {
  const admin = await login('a@t.sa');
  const r = await fetch(`${base}/api/faqs`, { method: 'POST', headers: { Cookie: admin, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"question":"x","answer":"y"}' });
  assert.equal(r.status, 403);
});

test('رمز QR يحتفظ برابطه ويوجه حسب الغرض', async () => {
  const admin = await login('a@t.sa');
  const q = await (await fetch(`${base}/api/qr`, { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'مدخل', branch_id: 3, purpose: 'subscribe' }) })).json();
  const r = await fetch(`${base}/q/${q.code}`, { redirect: 'manual' });
  assert.match(r.headers.get('location'), /^\/subscribe\?qr=.*branch=3/);
  await fetch(`${base}/api/qr/${q.id}`, { method: 'PUT', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'مدخل', branch_id: 3, purpose: 'feedback' }) });
  assert.match((await fetch(`${base}/q/${q.code}`, { redirect: 'manual' })).headers.get('location'), /^\/feedback/);
  const svg = await (await fetch(`${base}/api/qr/${q.id}/svg`, { headers: { Cookie: admin } })).text();
  assert.match(svg, /^<svg/);
});

test('مولد QR ينتج المقاسات الصحيحة', () => {
  assert.equal(qrMatrix('hi').length, 21);
  assert.equal(qrMatrix('https://maccenter.com.sa/q/ABCDEF').length, 29);
});

test('عنوان الزائر يؤخذ من آخر X-Forwarded-For، وQR المخصص لا يقبل روابط خارجية', async () => {
  const { clientIp } = await import('../src/http.js');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, socket: {} }), '9.9.9.9');
  const { saveQr } = await import('../src/modules/qrcodes.js');
  assert.throws(() => saveQr(db, null, { label: 'x', purpose: 'custom', target: '//evil.com' }), (e) => e.status === 400);
  assert.equal(saveQr(db, null, { label: 'y', purpose: 'custom', target: '/offers' }).target, '/offers');
});
