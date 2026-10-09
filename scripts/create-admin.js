// الاستخدام: npm run create-admin -- البريد "كلمة المرور" "الاسم"
import { openDb } from '../src/db.js';
import { hashPassword, validatePassword } from '../src/modules/auth.js';
import { seedCatalog } from '../src/modules/catalog.js';

const [email, password, name = 'مدير النظام'] = process.argv.slice(2);
if (!email || !password) {
  console.error('الاستخدام: npm run create-admin -- admin@example.com "كلمة مرور قوية" "الاسم"');
  process.exit(1);
}
try { validatePassword(password); } catch (err) { console.error(err.message); process.exit(1); }
const db = openDb();
seedCatalog(db);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare("UPDATE users SET password = ?, role = 'admin', active = 1 WHERE id = ?").run(hashPassword(password), existing.id);
  console.log(`حُدّث الحساب ${email} وأصبح مدير نظام`);
} else {
  db.prepare("INSERT INTO users (name, email, role, password) VALUES (?, ?, 'admin', ?)").run(name, email.toLowerCase(), hashPassword(password));
  console.log(`أنشئ حساب المدير ${email}`);
}
