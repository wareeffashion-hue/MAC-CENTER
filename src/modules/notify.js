import { json } from '../db.js';

// إشعار داخل اللوحة؛ يمكن توصيل البريد أو إشعار الجوال لاحقًا من هنا
export function notifyUsers(db, userIds, { kind, title, link }) {
  const ins = db.prepare('INSERT INTO notifications (user_id, kind, title, link) VALUES (?, ?, ?, ?)');
  for (const id of new Set(userIds.filter(Boolean))) ins.run(id, kind, title, link || null);
}

export function usersWithRole(db, roles, branchId = null) {
  const rows = db.prepare(`SELECT id, role, branch_ids FROM users WHERE active = 1 AND role IN (${roles.map(() => '?').join(',')})`).all(...roles);
  return rows.filter((u) => u.role === 'admin' || branchId == null || json.parse(u.branch_ids, []).includes(Number(branchId)) ||
    (u.role === 'marketing' && json.parse(u.branch_ids, []).length === 0)).map((u) => u.id);
}

export function notifyRole(db, roles, branchId, payload) {
  notifyUsers(db, usersWithRole(db, roles, branchId), payload);
}

export function setIntegrationStatus(db, name, ok, message) {
  const prev = db.prepare('SELECT ok FROM integration_status WHERE name = ?').get(name);
  db.prepare(`INSERT INTO integration_status (name, ok, message, checked_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(name) DO UPDATE SET ok = excluded.ok, message = excluded.message, checked_at = excluded.checked_at`).run(name, ok ? 1 : 0, message);
  if (!ok && (!prev || prev.ok)) notifyRole(db, ['admin'], null, { kind: 'integration', title: `انقطاع الربط: ${name} — ${message}`, link: '#/integrations' });
}
