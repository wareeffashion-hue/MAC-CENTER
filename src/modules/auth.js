import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { token, sha256 } from '../lib/ids.js';
import { json, sqlNow } from '../db.js';
import { parseCookies, setCookie, fail } from '../http.js';
import { config } from '../config.js';
import { verifyTotp } from '../lib/totp.js';

export const ROLES = {
  admin: 'مدير النظام',
  branch_manager: 'مدير فرع',
  agent: 'موظف خدمة العملاء',
  marketing: 'مسؤول التسويق',
  reviewer: 'مراجع الردود',
};

const PERMISSIONS = {
  admin: ['*'],
  branch_manager: ['dashboard', 'tickets', 'tickets.assign', 'reviews', 'branches.own', 'reports', 'offers.view', 'routing.own', 'qr.view'],
  agent: ['dashboard', 'tickets'],
  marketing: ['dashboard', 'offers', 'offers.publish', 'campaigns', 'subscribers', 'subscribers.export', 'reports', 'qr'],
  reviewer: ['dashboard', 'reviews', 'reviews.reply'],
};

export function can(user, perm) {
  const list = PERMISSIONS[user?.role] || [];
  return list.includes('*') || list.includes(perm);
}

export function requirePerm(user, perm) {
  if (!can(user, perm)) fail(403, 'لا تملك صلاحية لهذا الإجراء');
}

// null = كل الفروع
export function branchScope(user) {
  if (user.role === 'admin') return null;
  const ids = json.parse(user.branch_ids, []);
  // التسويق يعمل على مستوى العلامة إن لم تحدد له فروع
  if (user.role === 'marketing' && ids.length === 0) return null;
  return ids;
}

export function inScope(user, branchId) {
  const scope = branchScope(user);
  return scope === null || (branchId != null && scope.includes(Number(branchId)));
}

export function assertBranch(user, branchId) {
  if (!inScope(user, branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function checkPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

export function validatePassword(password) {
  if (String(password || '').length < 10) fail(400, 'كلمة المرور يجب ألا تقل عن 10 أحرف', { password: 'عشرة أحرف على الأقل' });
}

const SESSION_COOKIE = 'mc_session';
const SESSION_DAYS = 7;

export function createSession(db, res, userId, { pending2fa = false } = {}) {
  const t = token(32);
  const expires = new Date(Date.now() + (pending2fa ? 10 * 60 * 1000 : SESSION_DAYS * 86400 * 1000));
  db.prepare('INSERT INTO sessions (token_hash, user_id, pending_2fa, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(t), userId, pending2fa ? 1 : 0, sqlNow(expires));
  setCookie(res, SESSION_COOKIE, t, {
    maxAge: Math.floor((expires - Date.now()) / 1000), secure: config.production, sameSite: 'Strict',
  });
}

export function sessionUser(db, req, { allowPending = false } = {}) {
  const t = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!t) return null;
  const row = db.prepare(`
    SELECT u.*, s.pending_2fa, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(sha256(t), sqlNow());
  if (!row) return null;
  if (row.pending_2fa && !allowPending) return null;
  return row;
}

export function destroySession(db, req, res) {
  const t = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(t));
  setCookie(res, SESSION_COOKIE, '', { maxAge: 0, sameSite: 'Strict' });
}

export function login(db, res, email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(String(email || '').trim());
  // نحسب التجزئة حتى عند غياب المستخدم لتقارب زمن الاستجابة
  const ok = user ? checkPassword(password, user.password) : (checkPassword(password, hashPassword('x')), false);
  if (!ok) fail(401, 'البريد أو كلمة المرور غير صحيحة');
  createSession(db, res, user.id, { pending2fa: !!user.totp_secret });
  if (!user.totp_secret) db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  return { user, needs2fa: !!user.totp_secret };
}

export function completeTwoFactor(db, req, res, code) {
  const user = sessionUser(db, req, { allowPending: true });
  if (!user || !user.pending_2fa) fail(401, 'انتهت الجلسة، سجّل الدخول من جديد');
  if (!verifyTotp(user.totp_secret, code)) fail(401, 'رمز التحقق غير صحيح');
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.token_hash);
  createSession(db, res, user.id);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  return user;
}

export function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, roleName: ROLES[u.role],
    branchIds: json.parse(u.branch_ids, []), twoFactor: !!u.totp_secret, active: !!u.active,
    lastLoginAt: u.last_login_at, permissions: PERMISSIONS[u.role],
  };
}

export function audit(db, user, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(user?.id ?? null, action, entity ?? null, entityId == null ? null : String(entityId), detail == null ? null : JSON.stringify(detail));
}
