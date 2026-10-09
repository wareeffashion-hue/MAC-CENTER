// بيانات تجريبية للتجربة المحلية فقط: موظفون ومشتركون وتذاكر وتقييمات بأسماء وهمية.
// لا تشغله على قاعدة الإنتاج. الاستخدام: DATA_DIR=./data-demo npm run seed:demo
import { openDb, sqlNow } from '../src/db.js';
import { config } from '../src/config.js';
import { seedCatalog } from '../src/modules/catalog.js';
import { hashPassword } from '../src/modules/auth.js';
import { createTicket, updateTicket } from '../src/modules/tickets.js';
import { confirmSubscription } from '../src/modules/whatsapp.js';
import { saveOffer, transitionOffer, createCampaign } from '../src/modules/offers.js';
import { saveQr } from '../src/modules/qrcodes.js';
import { ingestReview } from '../src/modules/reviews.js';

if (config.production) { console.error('لا تشغل البيانات التجريبية في الإنتاج'); process.exit(1); }

const db = openDb();
seedCatalog(db);
const branches = db.prepare('SELECT * FROM branches ORDER BY sort').all();
const sections = db.prepare('SELECT * FROM sections ORDER BY sort').all();
const pick = (arr, i) => arr[i % arr.length];
const daysAgo = (d, h = 0) => sqlNow(new Date(Date.now() - d * 86400000 - h * 3600000));
const PASSWORD = 'Demo12345!';

// الموظفون
const staff = [
  ['مدير النظام', 'admin@demo.sa', 'admin', []],
  ['سارة القحطاني', 'quba.manager@demo.sa', 'branch_manager', [branches[2].id]],
  ['خالد الحربي', 'dairi.manager@demo.sa', 'branch_manager', [branches[1].id]],
  ['ريم العتيبي', 'agent1@demo.sa', 'agent', [branches[0].id, branches[2].id]],
  ['عبدالله الجهني', 'agent2@demo.sa', 'agent', [branches[1].id]],
  ['نورة السلمي', 'marketing@demo.sa', 'marketing', []],
  ['فهد المطيري', 'reviewer@demo.sa', 'reviewer', branches.map((b) => b.id)],
];
const ids = {};
for (const [name, email, role, b] of staff) {
  const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  ids[email] = ex ? ex.id : Number(db.prepare('INSERT INTO users (name, email, role, branch_ids, password, wa_phone) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, email, role, JSON.stringify(b), hashPassword(PASSWORD), role === 'marketing' ? '966500000099' : null).lastInsertRowid);
}

// التوجيه
db.exec('DELETE FROM routing_rules');
const rr = db.prepare('INSERT INTO routing_rules (branch_id, section_id, topic, user_id, backup_user_id) VALUES (?, ?, ?, ?, ?)');
rr.run(branches[0].id, null, null, ids['agent1@demo.sa'], null);
rr.run(branches[1].id, null, null, ids['agent2@demo.sa'], ids['dairi.manager@demo.sa']);
rr.run(branches[2].id, null, 'exchange', ids['quba.manager@demo.sa'], ids['agent1@demo.sa']);

// الدوام: نموذج للتجربة يوضح الفترات المتعددة والإغلاق بعد منتصف الليل
const week = { sat: [['09:30', '13:00'], ['16:30', '00:30']], sun: [['09:30', '13:00'], ['16:30', '00:30']], mon: [['09:30', '13:00'], ['16:30', '00:30']], tue: [['09:30', '13:00'], ['16:30', '00:30']], wed: [['09:30', '13:00'], ['16:30', '00:30']], thu: [['09:30', '13:00'], ['16:30', '01:00']], fri: [['16:30', '01:00']] };
db.prepare('UPDATE branches SET hours = ? WHERE hours IS NULL').run(JSON.stringify(week));

// رموز QR
const qrs = [];
if (!db.prepare('SELECT 1 FROM qr_codes').get()) {
  for (const b of branches) {
    qrs.push(saveQr(db, null, { label: `مدخل ${b.short_name}`, branch_id: b.id, location: 'المدخل الرئيسي', purpose: 'subscribe' }));
    qrs.push(saveQr(db, null, { label: `كاشير ${b.short_name}`, branch_id: b.id, location: 'الكاشير', purpose: 'feedback' }));
  }
} else qrs.push(...db.prepare('SELECT * FROM qr_codes').all());
db.prepare('UPDATE qr_codes SET scans = ABS(RANDOM() % 140) + 20').run();

// المشتركون عبر نفس مسار التأكيد الفعلي
const names = ['أمل', 'محمد', 'هند', 'سلطان', 'لمى', 'ماجد', 'جود', 'تركي', 'رهف', 'بندر', 'منى', 'يزيد', 'دانة', 'فيصل', 'غادة', 'عمر', 'شهد', 'نايف', 'وعد', 'سعود'];
for (let i = 0; i < 46; i++) {
  const wa = `9665${String(10000000 + i * 7919).slice(0, 8)}`;
  db.prepare('INSERT OR IGNORE INTO contacts (wa_id, name, last_inbound_at) VALUES (?, ?, ?)').run(wa, pick(names, i), daysAgo(i % 13));
  const contact = db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(wa);
  if (db.prepare('SELECT 1 FROM subscriptions WHERE contact_id = ?').get(contact.id)) continue;
  const b = [pick(branches, i).id, ...(i % 4 === 0 ? [pick(branches, i + 1).id] : [])];
  const s = [pick(sections, i).id, pick(sections, i * 3 + 1).id];
  const qr = pick(qrs.filter((q) => q.purpose === 'subscribe'), i);
  db.prepare("INSERT INTO subscription_intents (token, status_key, branch_ids, section_ids, qr_code, status, expires_at) VALUES (?, ?, ?, ?, ?, 'awaiting', ?)")
    .run(`D${String(i).padStart(5, '0')}`, `demo-${i}-${Date.now()}`, JSON.stringify(b), JSON.stringify([...new Set(s)]), qr.code, daysAgo(-1));
  const intent = db.prepare('SELECT * FROM subscription_intents WHERE token = ?').get(`D${String(i).padStart(5, '0')}`);
  confirmSubscription(db, contact, intent);
  const when = daysAgo(i % 14, i % 9);
  db.prepare('UPDATE subscription_events SET at = ? WHERE contact_id = ?').run(when, contact.id);
  db.prepare('UPDATE subscriptions SET consent_at = ? WHERE contact_id = ?').run(when, contact.id);
  db.prepare("UPDATE events SET at = ? WHERE id = (SELECT MAX(id) FROM events WHERE name = 'subscribe_confirmed')").run(when);
  if (i % 11 === 5) db.prepare("UPDATE subscriptions SET status = 'stopped', stopped_at = ? WHERE contact_id = ?").run(when, contact.id);
}
// زيارات QR وبدء الاشتراك موزعة على الأيام
const ev = db.prepare('INSERT INTO events (name, branch_id, qr_code, at) VALUES (?, ?, ?, ?)');
for (let d = 0; d < 14; d++) {
  for (let k = 0; k < 6 + ((d * 7) % 9); k++) ev.run('qr_visit', pick(branches, k).id, pick(qrs, k).code, daysAgo(d, k));
  for (let k = 0; k < 3 + (d % 4); k++) ev.run('subscribe_start', pick(branches, k).id, pick(qrs, k).code, daysAgo(d, k));
}

// العروض
const admin = { id: ids['admin@demo.sa'] };
if (!db.prepare('SELECT 1 FROM offers').get()) {
  const local = (d) => new Date(Date.now() + d * 86400000 + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const o1 = saveOffer(db, admin, null, { title: 'العودة للمدارس', summary: 'حقائب وقرطاسية ومستلزمات الطلاب في مكان واحد.', description: 'اختيارات متنوعة من الحقائب المدرسية والدفاتر وأدوات الرسم.', branchIds: branches.map((b) => b.id), sectionIds: [sections[5].id, sections[2].id], starts_at: local(-3), ends_at: local(18), terms: 'حسب المتوفر في كل فرع. (عرض تجريبي)', template_name: 'mac_offer_ar' });
  transitionOffer(db, o1.id, 'approve', true);
  const o2 = saveOffer(db, admin, null, { title: 'تشكيلة فساتين المناسبات', summary: 'تشكيلة جديدة لموسم الأعراس.', branchIds: [branches[2].id, branches[1].id], sectionIds: [sections[1].id], starts_at: local(5), ends_at: local(30), terms: 'عرض تجريبي', template_name: 'mac_offer_ar' });
  transitionOffer(db, o2.id, 'submit', true);
  saveOffer(db, admin, null, { title: 'مفروشات الشتاء', summary: 'مسودة', branchIds: [branches[0].id], sectionIds: [sections[3].id], starts_at: local(20), ends_at: local(40) });
  const c = createCampaign(db, admin, { offerId: o1.id, name: 'العودة للمدارس · الدفعة الأولى', template_name: 'mac_offer_ar' });
  db.prepare("UPDATE campaigns SET test_sent_at = datetime('now','-2 days'), status = 'done', finished_at = datetime('now','-2 days'), created_at = datetime('now','-3 days') WHERE id = ?").run(c.id);
  const subs = db.prepare("SELECT contact_id FROM subscriptions WHERE status = 'active' LIMIT 30").all();
  const st = ['delivered', 'read', 'read', 'delivered', 'sent', 'failed', 'excluded'];
  subs.forEach((s, i) => db.prepare('INSERT INTO messages (campaign_id, contact_id, status, reason, cost, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, s.contact_id, pick(st, i), pick(st, i) === 'failed' ? 'Message undeliverable' : pick(st, i) === 'excluded' ? 'تجاوز سقف 2 رسائل أسبوعيًا' : null, ['failed', 'excluded'].includes(pick(st, i)) ? 0 : 0.0455, daysAgo(2)));
  db.prepare('UPDATE campaigns SET audience_count = ? WHERE id = ?').run(subs.length, c.id);
}

// التذاكر
const samples = [
  ['complaint', 2, 'exchange', 'طلبت استبدال فستان بمقاس آخر وقالوا لازم الفاتورة الأصلية مع أني معي صورة الفاتورة.', true],
  ['experience', 5, null, 'تعامل الموظفات في قسم الفساتين راقي جدًا وساعدوني أختار.', false],
  ['suggestion', null, 'availability', 'ياليت توفرون مقاسات أكبر في قسم الأطفال.', false],
  ['complaint', 1, 'staff', 'انتظرت عند الكاشير أكثر من ربع ساعة وما فيه إلا كاشير واحد.', true],
  ['contact', null, 'delivery', 'أبي أطلب حقيبة مدرسية لجدة، كم مدة التوصيل؟', true],
  ['experience', 3, 'cleanliness', 'غرف القياس تحتاج ترتيب أكثر.', false],
  ['complaint', 2, 'price', 'السعر على الرف يختلف عن الكاشير.', true],
  ['experience', 4, null, 'تشكيلة الألعاب ممتازة.', false],
  ['suggestion', null, 'payment', 'نتمنى توفير تابي في فرع الدائري.', false],
  ['complaint', 3, 'product', 'الشنطة اللي شريتها انقطعت يدها بعد أسبوع.', true],
];
if (db.prepare('SELECT COUNT(*) n FROM tickets').get().n < 5) {
  samples.forEach(([type, rating, topic, body, contact], i) => {
    const b = pick(branches, i);
    const r = createTicket(db, { type, rating, topic, body, branch: b.id, section: pick(sections, i * 2).id, name: contact ? pick(names, i + 3) : '', phone: contact ? `05${String(40000000 + i * 1234567).slice(0, 8)}` : '', wants_contact: contact ? '1' : '', contact_consent: contact ? '1' : '', qr: pick(qrs, i).code }, [], { source: i % 3 ? 'qr' : 'web' });
    const created = daysAgo(i % 6, (i * 5) % 20);
    db.prepare('UPDATE tickets SET created_at = ?, due_at = CASE WHEN due_at IS NULL THEN NULL ELSE ? END WHERE id = ?').run(created, sqlNow(new Date(Date.parse(created.replace(' ', 'T') + 'Z') + 30 * 60000)), r.id);
    db.prepare('UPDATE ticket_events SET at = ? WHERE ticket_id = ?').run(created, r.id);
    const agent = db.prepare('SELECT * FROM users WHERE id = ?').get(ids['admin@demo.sa']);
    if (i % 4 === 1 && !r.positive) { updateTicket(db, agent, r.id, 'acknowledge'); updateTicket(db, agent, r.id, 'contact', { body: 'تواصلنا مع العميل وتم الاتفاق على الاستبدال.', visible: true }); updateTicket(db, agent, r.id, 'status', { status: 'resolved' }); }
    if (i % 4 === 2 && !r.positive) updateTicket(db, agent, r.id, 'acknowledge');
  });
}

// تقييمات Google تجريبية تمر بنفس القواعد
const reviews = [
  [0, 5, 'مكان رائع وفيه كل شي للعائلة، الموظفين متعاونين.', 'أبو فيصل'],
  [1, 4, 'التشكيلة حلوة بس الزحمة كثير وقت المساء والكاشير تأخر.', 'Maha'],
  [2, 2, 'ما لقيت المقاس المطلوب ورفضوا الاستبدال.', 'سعد'],
  [2, 5, 'أفضل مكان للقرطاسية في المدينة.', 'نوف'],
  [0, 1, 'رقمي 0551234567 تواصلوا معي، تعرضت لموقف سيء من أحد الموظفين.', 'عميل'],
  [1, 5, '', 'Abdulaziz'],
];
for (const [bi, rating, text, author] of reviews) {
  const id = `demo-${bi}-${rating}-${author}`;
  if (!db.prepare('SELECT 1 FROM reviews WHERE google_id = ?').get(id)) {
    await ingestReview(db, branches[bi], { id, rating, text, author, createdAt: new Date(Date.now() - rating * 86400000).toISOString() });
  }
}
db.prepare("INSERT INTO integration_status (name, ok, message) VALUES ('WhatsApp Business', 1, 'وضع التجربة: الرسائل لا تغادر النظام') ON CONFLICT(name) DO NOTHING").run();
db.prepare("INSERT INTO integration_status (name, ok, message) VALUES ('Google Business Profile', 1, 'وضع التجربة') ON CONFLICT(name) DO NOTHING").run();

console.log('أضيفت البيانات التجريبية.');
console.log(`ادخل اللوحة: ${config.publicUrl}/admin  ·  admin@demo.sa / ${PASSWORD}`);
console.log('حسابات أخرى بنفس كلمة المرور: quba.manager@demo.sa، agent1@demo.sa، marketing@demo.sa، reviewer@demo.sa');
