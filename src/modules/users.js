import { fail } from '../http.js';
import { ROLES, hashPassword, validatePassword, publicUser } from './auth.js';
import { newSecret, verifyTotp, otpauthUrl } from '../lib/totp.js';
import { qrSvg } from '../lib/qr.js';

export function listUsers(db) {
  return db.prepare('SELECT * FROM users ORDER BY active DESC, role, name').all().map(publicUser);
}

export function saveUser(db, id, input) {
  const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase();
  const errors = {};
  if (!name) errors.name = 'الاسم مطلوب';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'بريد غير صحيح';
  if (!(input.role in ROLES)) errors.role = 'اختر الدور';
  if (!id && !input.password) errors.password = 'كلمة المرور مطلوبة';
  if (Object.keys(errors).length) fail(400, 'راجع بيانات الموظف', errors);
  if (input.password) validatePassword(input.password);
  const branchIds = JSON.stringify((input.branchIds || []).map(Number).filter(Boolean));
  const dup = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (dup && dup.id !== id) fail(400, 'البريد مستخدم', { email: 'مستخدم لحساب آخر' });
  const wa = input.wa_phone ? String(input.wa_phone).replace(/\D/g, '') : null;
  if (id) {
    db.prepare('UPDATE users SET name=?, email=?, role=?, branch_ids=?, active=?, wa_phone=? WHERE id=?')
      .run(name, email, input.role, branchIds, input.active === false ? 0 : 1, wa, id);
    if (input.password) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(input.password), id);
    if (input.active === false) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  } else {
    id = Number(db.prepare('INSERT INTO users (name, email, role, branch_ids, password, wa_phone) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email, input.role, branchIds, hashPassword(input.password), wa).lastInsertRowid);
  }
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function ensureAdmin(db, email, password, reset = false) {
  // استعادة الدخول: مع ADMIN_RESET=1 يعاد تعيين كلمة مرور المدير ويلغى تحققه الثنائي وجلساته
  if (reset && email && password) {
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (u) {
      db.prepare("UPDATE users SET password = ?, totp_secret = NULL, active = 1, role = 'admin' WHERE id = ?").run(hashPassword(password), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      return 'reset';
    }
  }
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return false;
  if (!email || !password) return false;
  db.prepare("INSERT INTO users (name, email, role, password) VALUES (?, ?, 'admin', ?)").run('مدير النظام', email.toLowerCase(), hashPassword(password));
  return true;
}

// إعداد التحقق الثنائي: سر مؤقت يثبت فقط بعد إدخال رمز صحيح
const pending = new Map();

export function begin2fa(user) {
  const secret = newSecret();
  pending.set(user.id, { secret, at: Date.now() });
  const url = otpauthUrl(secret, user.email);
  return { secret, qr: qrSvg(url, { margin: 2 }) };
}

export function confirm2fa(db, user, code) {
  const p = pending.get(user.id);
  if (!p || Date.now() - p.at > 10 * 60000) fail(400, 'ابدأ الإعداد من جديد');
  if (!verifyTotp(p.secret, code)) fail(400, 'الرمز غير صحيح، تأكد من وقت جهازك');
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(p.secret, user.id);
  pending.delete(user.id);
}

export function disable2fa(db, user, code) {
  if (!user.totp_secret || !verifyTotp(user.totp_secret, code)) fail(400, 'الرمز غير صحيح');
  db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run(user.id);
}
