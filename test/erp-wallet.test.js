import { freshDb, addUser } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import * as P from '../src/modules/plus.js';
import * as E from '../src/modules/erp.js';
import * as AW from '../src/modules/applewallet.js';
import { zip, buildPkpass, signDetached, crc32 } from '../src/lib/pkpass.js';

const map = (db) => {
  const secs = db.prepare('SELECT id FROM sections ORDER BY id').all().map((s) => s.id);
  const br = db.prepare('SELECT id FROM branches ORDER BY id').get().id;
  E.saveErpMapping(db, { branches: { '01': br }, categories: { أزياء: secs[0], أحذية: secs[1], ألعاب: secs[2] } });
  return { br, secs };
};
const sale = (no, extra = {}) => ({ invoice_no: no, branch_code: '01', total: 300, date: '2026-10-19T12:00:00+03:00', items: [{ category: 'أزياء' }, { category: 'أحذية' }], ...extra });

test('فاتورة عضو من النظام المحاسبي تُحسب له ومكافأتها رصيد', () => {
  const db = freshDb(); const { br } = map(db);
  const { member } = P.createMember(db, { phone: '0552220001', consent: true });
  const r = E.processErpInvoice(db, sale('A1', { customer_phone: '966552220001' }));
  assert.equal(r.status, 'member');
  const inv = db.prepare('SELECT * FROM invoices').get();
  assert.equal(inv.source, 'erp'); assert.equal(inv.dept_count, 2); assert.equal(inv.reward_mode, 'wallet');
  assert.equal(P.balance(db, member.id), 6); // 2% من 300 رصيدًا لأن الفاتورة مدفوعة
  assert.equal(E.processErpInvoice(db, sale('A1', { customer_phone: '0552220001' })).status, 'duplicate');
  assert.equal(db.prepare('SELECT invoices, sales, source FROM branch_days WHERE branch_id = ?').get(br).source, 'erp');
});

test('الزائر يدخل في أرقام الفرع، والمرتجع يُنقص المبيعات ويسحب المكافأة', () => {
  const db = freshDb(); const { br } = map(db);
  P.savePlusSettings(db, { rewardMode: 'wallet' });
  const { member } = P.createMember(db, { phone: '0552220002', consent: true });
  assert.equal(E.processErpInvoice(db, sale('G1')).status, 'guest');
  E.processErpInvoice(db, sale('M1', { member_code: member.ref_code, total: 1000, items: [{ category: 'أزياء' }, { category: 'أحذية' }, { category: 'ألعاب' }, { category: 'أزياء' }] }));
  assert.equal(P.balance(db, member.id), 20);
  let day = db.prepare('SELECT * FROM branch_days WHERE branch_id = ?').get(br);
  assert.deepEqual([day.invoices, day.sales], [2, 1300]);
  assert.equal(E.processErpInvoice(db, { invoice_no: 'R1', original_invoice_no: 'M1', type: 'return', branch_code: '01', total: 1000, date: '2026-10-19T13:00:00+03:00' }).status, 'return');
  assert.equal(P.balance(db, member.id), 0);
  assert.equal(db.prepare("SELECT returned FROM invoices WHERE ref = 'M1'").get().returned, 1);
  day = db.prepare('SELECT * FROM branch_days WHERE branch_id = ?').get(br);
  assert.deepEqual([day.invoices, day.sales], [2, 300]);
});

test('رموز الفروع والتصنيفات غير المربوطة تُعلّق ثم تُعالج بعد الربط', () => {
  const db = freshDb();
  const { member } = P.createMember(db, { phone: '0552220003', consent: true });
  assert.equal(E.processErpInvoice(db, sale('U1', { branch_code: '09', customer_phone: '0552220003', items: [{ category: 'إكسسوارات' }] })).status, 'unmapped');
  assert.equal(E.processErpInvoice(db, { branch_code: '09' }).status, 'invalid');
  const ov = E.erpOverview(db, null);
  assert.ok(ov.branchCodes.includes('09') && ov.categories.includes('إكسسوارات'));
  const br = db.prepare('SELECT id FROM branches ORDER BY id').get().id;
  const sec = db.prepare('SELECT id FROM sections ORDER BY id').get().id;
  assert.equal(E.saveErpMapping(db, { branches: { '09': br }, categories: { إكسسوارات: sec } }).reprocessed, 1);
  assert.equal(db.prepare("SELECT status FROM erp_invoices WHERE invoice_no = 'U1'").get().status, 'member');
  assert.equal(db.prepare('SELECT member_id FROM invoices').get().member_id, member.id);
});

test('فاتورة سجلها الكاشير قبل وصولها لا تُحسب مرتين', () => {
  const db = freshDb(); const { br, secs } = map(db); const u = addUser(db);
  const { member } = P.createMember(db, { phone: '0552220004', consent: true });
  P.recordInvoice(db, u, null, { memberId: member.id, branchId: br, ref: 'C1', amount: 300, sectionIds: secs.slice(0, 2) });
  assert.equal(E.processErpInvoice(db, sale('C1', { customer_phone: '0552220004' })).status, 'member');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices').get().n, 1);
});

test('التحقق من مفتاح الربط أو توقيعه', () => {
  assert.equal(E.verifyErp(Buffer.from('{}'), {}), false); // دون ERP_WEBHOOK_SECRET في بيئة الاختبار
});

test('ZIP صالح وCRC صحيح', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const z = zip({ 'a.txt': Buffer.from('hi') });
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
});

test('حزمة Apple Wallet موقعة بتوقيع CMS تقبله OpenSSL', (t) => {
  const F = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
  const creds = { cert: F('wallet-pass.pem'), key: F('wallet-pass.key'), wwdr: F('wallet-ca.pem') };
  const files = { 'pass.json': Buffer.from('{"formatVersion":1}'), 'icon.png': Buffer.from([1, 2, 3]) };
  const pk = buildPkpass(files, creds);
  assert.ok(pk.includes(Buffer.from(createHash('sha1').update(files['pass.json']).digest('hex'))));
  if (spawnSync('openssl', ['version']).status !== 0) return t.skip('openssl غير متوفر');
  const dir = mkdtempSync(join(tmpdir(), 'pk-'));
  const content = Buffer.from('{"pass.json":"x"}');
  writeFileSync(join(dir, 'm'), content); writeFileSync(join(dir, 's'), signDetached(content, creds));
  writeFileSync(join(dir, 'ca'), creds.wwdr);
  const r = spawnSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 's'), '-content', join(dir, 'm'), '-CAfile', join(dir, 'ca'), '-purpose', 'any', '-out', '/dev/null']);
  assert.equal(r.status, 0, r.stderr.toString());
});

test('خدمة تحديث البطاقة: تسجيل الجهاز ومعرفة البطاقات المحدثة', () => {
  const db = freshDb();
  const { member } = P.createMember(db, { phone: '0552220005', consent: true });
  const serial = AW.serialFor(member.id);
  assert.equal(AW.memberFromSerial(serial), member.id);
  assert.ok(AW.checkAuth(serial, `ApplePass ${AW.authToken(serial)}`));
  assert.ok(!AW.checkAuth(serial, 'ApplePass nope'));
  assert.equal(AW.registerDevice(db, 'dev1', serial, 'tok'), 201);
  assert.equal(AW.registerDevice(db, 'dev1', serial, 'tok2'), 200);
  P.credit(db, member.id, 'adjust', 5);
  const r = AW.updatedSerials(db, 'dev1', null);
  assert.deepEqual(r.serialNumbers, [serial]);
  assert.equal(AW.updatedSerials(db, 'dev1', r.lastUpdated), null);
  AW.unregisterDevice(db, 'dev1', serial);
  assert.equal(AW.updatedSerials(db, 'dev1', null), null);
});
