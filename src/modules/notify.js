import { json, getSetting, setSetting } from '../db.js';
import { config } from '../config.js';
import * as WQ from './waqr.js';

// إشعار داخل اللوحة، ويصل أيضًا على واتساب الموظف إن كان رقم التنبيهات مربوطًا وللموظف رقم في حسابه
export function notifyUsers(db, userIds, { kind, title, link }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const ins = db.prepare('INSERT INTO notifications (user_id, kind, title, link) VALUES (?, ?, ?, ?)');
  for (const id of ids) ins.run(id, kind, title, link || null);
  if (!ids.length || !WQ.isOpen()) return;
  const cfg = waNotifySettings(db);
  if (!cfg.alerts) return;
  const phones = new Set(db.prepare(`SELECT wa_phone FROM users WHERE active = 1 AND wa_phone IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.wa_phone));
  if (cfg.managerPhone) phones.add(cfg.managerPhone);
  const text = `🔔 ماك سنتر\n${title}${link ? `\n${cfg.link}/admin${link}` : ''}`;
  for (const p of phones) WQ.send(p, text);
}

// إعدادات إشعارات واتساب: جوال المدير (تصله التنبيهات والملخص)، ووقت الملخص اليومي، ورابط النظام أسفل الرسائل
export function waNotifySettings(db) {
  const s = getSetting(db, 'waNotify', {}) || {};
  return { managerPhone: s.managerPhone || '', summaryTime: s.summaryTime || '21:30', alerts: s.alerts !== false, link: (s.link || config.publicUrl).replace(/\/$/, ''), lastSummary: s.lastSummary || null };
}
export function saveWaNotifySettings(db, input) {
  const cur = waNotifySettings(db);
  const phone = String(input.managerPhone ?? cur.managerPhone).replace(/\D/g, '');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.summaryTime || '') ? input.summaryTime : cur.summaryTime;
  const link = /^https?:\/\//.test(input.link || '') ? String(input.link).trim() : cur.link;
  setSetting(db, 'waNotify', { managerPhone: phone, summaryTime: time, alerts: input.alerts ?? cur.alerts, link, lastSummary: cur.lastSummary });
  return waNotifySettings(db);
}

// الملخص اليومي بتوقيت الرياض
export function dailySummaryText(db) {
  const DAY = "datetime('now','+3 hours','start of day','-3 hours')";
  const one = (sql) => db.prepare(sql).get()?.n || 0;
  const subs = one(`SELECT COUNT(*) n FROM subscriptions WHERE consent_at >= ${DAY} AND status = 'active'`);
  const stops = one(`SELECT COUNT(*) n FROM subscriptions WHERE stopped_at >= ${DAY}`);
  const active = one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'active'");
  const tNew = one(`SELECT COUNT(*) n FROM tickets WHERE created_at >= ${DAY}`);
  const tOpen = one("SELECT COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed')");
  const tLate = one("SELECT COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed') AND due_at < datetime('now')");
  const tDone = one(`SELECT COUNT(*) n FROM tickets WHERE resolved_at >= ${DAY}`);
  const rev = db.prepare(`SELECT COUNT(*) n, ROUND(AVG(rating), 1) avg FROM reviews WHERE review_time >= ${DAY}`).get() || {};
  const rWait = one("SELECT COUNT(*) n FROM reviews WHERE state IN ('needs_review','draft_ready','escalated')");
  const sent = one(`SELECT COUNT(*) n FROM messages WHERE sent_at >= ${DAY}`);
  const d = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return [
    `📊 ملخص ماك سنتر · ${d}`,
    '',
    `👥 المشتركون: +${subs} اليوم، ${stops} إيقاف، الإجمالي ${active}`,
    `🎫 الملاحظات: ${tNew} جديدة، ${tDone} أغلقت، ${tOpen} مفتوحة${tLate ? `، ⚠️ ${tLate} متأخرة` : ''}`,
    `⭐ تقييمات Google: ${rev.n || 0} اليوم${rev.n ? ` بمتوسط ${rev.avg}` : ''}، ${rWait} تنتظر الرد`,
    `📨 رسائل العروض المرسلة: ${sent}`,
  ].join('\n');
}
export function maybeSendDailySummary(db) {
  if (!WQ.isOpen()) return false;
  const cfg = waNotifySettings(db);
  if (!cfg.managerPhone) return false;
  const now = new Date(Date.now() + 3 * 3600_000);
  const today = now.toISOString().slice(0, 10), hm = now.toISOString().slice(11, 16);
  if (cfg.lastSummary === today || hm < cfg.summaryTime) return false;
  WQ.send(cfg.managerPhone, `${dailySummaryText(db)}\n\n${cfg.link}/admin`);
  setSetting(db, 'waNotify', { ...getSetting(db, 'waNotify', {}), lastSummary: today });
  return true;
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
