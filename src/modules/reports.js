import { json, sqlNow } from '../db.js';
import { branchScope, can } from './auth.js';
import { ticketStats } from './tickets.js';
import { EVENT_NAMES } from './events.js';

function daysBack(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

function scopeClause(user, col) {
  const scope = branchScope(user);
  if (scope === null) return { sql: '', args: [] };
  return { sql: ` AND ${col} IN (${scope.map(() => '?').join(',') || 'NULL'})`, args: scope };
}

// الشاشة اليومية
export function today(db, user) {
  const now = sqlNow();
  const t = scopeClause(user, 'branch_id');
  const agentOnly = user.role === 'agent' ? ' AND (assignee_id = ? OR assignee_id IS NULL)' : '';
  const agentArgs = user.role === 'agent' ? [user.id] : [];
  const q = (sql, ...a) => db.prepare(sql).get(...a).n;
  const out = {
    tickets: {
      new: q(`SELECT COUNT(*) n FROM tickets WHERE status IN ('new','assigned') AND acknowledged_at IS NULL${t.sql}${agentOnly}`, ...t.args, ...agentArgs),
      late: q(`SELECT COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed') AND acknowledged_at IS NULL AND due_at < ?${t.sql}${agentOnly}`, now, ...t.args, ...agentArgs),
      open: q(`SELECT COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed')${t.sql}${agentOnly}`, ...t.args, ...agentArgs),
      mine: q(`SELECT COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed') AND assignee_id = ?`, user.id),
      todayCreated: q(`SELECT COUNT(*) n FROM tickets WHERE created_at >= datetime('now','+3 hours','start of day','-3 hours')${t.sql}`, ...t.args),
    },
  };
  if (can(user, 'reviews')) {
    out.reviews = {
      pending: q(`SELECT COUNT(*) n FROM reviews WHERE state IN ('new','needs_review','draft_ready','escalated')${t.sql}`, ...t.args),
      escalated: q(`SELECT COUNT(*) n FROM reviews WHERE state = 'escalated'${t.sql}`, ...t.args),
    };
  }
  if (can(user, 'campaigns')) {
    out.campaigns = {
      scheduled: db.prepare(`SELECT c.id, c.name, c.scheduled_at, c.audience_count, c.status FROM campaigns c WHERE c.status IN ('scheduled','sending','paused','draft') ORDER BY c.scheduled_at LIMIT 6`).all(),
      subscribers: q("SELECT COUNT(*) n FROM subscriptions WHERE status = 'active'"),
      newSubscribers7d: q("SELECT COUNT(*) n FROM subscription_events WHERE kind = 'subscribed' AND at >= datetime('now','-7 days')"),
      failed: q("SELECT COUNT(*) n FROM messages WHERE status = 'failed'"),
    };
  }
  out.integrations = db.prepare('SELECT * FROM integration_status ORDER BY name').all();
  out.urgent = db.prepare(`SELECT t.id, t.ref, t.type, t.priority, t.status, t.due_at, t.created_at, substr(t.body,1,90) excerpt, b.short_name branch
    FROM tickets t LEFT JOIN branches b ON b.id = t.branch_id
    WHERE t.status NOT IN ('resolved','closed')${t.sql.replace('branch_id', 't.branch_id')}${agentOnly.replace(/assignee_id/g, 't.assignee_id')}
    ORDER BY (t.acknowledged_at IS NULL AND t.due_at < ?) DESC, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at
    LIMIT 7`).all(...t.args, ...agentArgs, now);

  // نشاط ١٤ يومًا
  const days = daysBack(14);
  const from = days[0];
  const tk = db.prepare(`SELECT date(created_at, '+3 hours') d, COUNT(*) n FROM tickets WHERE created_at >= ?${t.sql} GROUP BY d`).all(from, ...t.args);
  const sb = db.prepare(`SELECT date(at, '+3 hours') d, COUNT(*) n FROM subscription_events WHERE kind = 'subscribed' AND at >= ? GROUP BY d`).all(from);
  const ev = db.prepare(`SELECT date(at, '+3 hours') d, COUNT(*) n FROM events WHERE name = 'qr_visit' AND at >= ? GROUP BY d`).all(from);
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.d, r.n]));
  const [mt, ms, mq] = [map(tk), map(sb), map(ev)];
  out.trend = days.map((d) => ({ d, tickets: mt[d] || 0, subscribers: ms[d] || 0, qr: mq[d] || 0 }));
  return out;
}

export function marketingReport(db, { days = 30, branchId = null } = {}) {
  const from = sqlNow(new Date(Date.now() - days * 86400000));
  const ev = (name) => db.prepare(`SELECT COUNT(*) n FROM events WHERE name = ? AND at >= ?${branchId ? ' AND branch_id = ?' : ''}`).get(name, from, ...(branchId ? [branchId] : [])).n;
  const funnel = ['qr_visit', 'subscribe_start', 'subscribe_confirmed', 'offer_view', 'unsubscribe'].map((k) => ({ key: k, name: EVENT_NAMES[k], n: ev(k) }));
  const subs = db.prepare("SELECT branch_ids, section_ids, source_qr FROM subscriptions WHERE status = 'active'").all();
  const interest = {}, branches = {}, sources = {};
  for (const s of subs) {
    for (const id of json.parse(s.section_ids, [])) interest[id] = (interest[id] || 0) + 1;
    for (const id of json.parse(s.branch_ids, [])) branches[id] = (branches[id] || 0) + 1;
    sources[s.source_qr || 'web'] = (sources[s.source_qr || 'web'] || 0) + 1;
  }
  const msg = Object.fromEntries(db.prepare('SELECT m.status, COUNT(*) n FROM messages m JOIN campaigns c ON c.id = m.campaign_id WHERE c.created_at >= ? GROUP BY m.status').all(from).map((r) => [r.status, r.n]));
  const campaigns = db.prepare(`SELECT c.id, c.name, c.status, c.audience_count, c.estimated_cost,
      (SELECT COALESCE(SUM(cost),0) FROM messages m WHERE m.campaign_id = c.id) spent,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('sent','delivered','read')) sent,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('delivered','read')) delivered,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'read') read,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'failed') failed,
      (SELECT COUNT(*) FROM events e JOIN offers o ON o.slug = e.ref WHERE e.name = 'offer_view' AND o.id = c.offer_id AND e.at >= c.created_at) views
    FROM campaigns c WHERE c.created_at >= ? ORDER BY c.created_at DESC LIMIT 20`).all(from);
  return {
    funnel, active: subs.length, interest, branches, sources, messages: msg, campaigns,
    stopped: db.prepare("SELECT COUNT(*) n FROM subscription_events WHERE kind = 'stopped' AND at >= ?").get(from).n,
  };
}

export function serviceReport(db, user, { days = 30 } = {}) {
  const from = sqlNow(new Date(Date.now() - days * 86400000));
  const s = ticketStats(db, user, { from });
  const t = scopeClause(user, 'branch_id');
  s.reviews = Object.fromEntries(db.prepare(`SELECT state, COUNT(*) n FROM reviews WHERE fetched_at >= ?${t.sql} GROUP BY state`).all(from, ...t.args).map((r) => [r.state, r.n]));
  s.repeated = db.prepare(`SELECT section_id, topic, COUNT(*) n FROM tickets WHERE created_at >= ? AND topic IS NOT NULL${t.sql}
    GROUP BY section_id, topic HAVING n >= 3 ORDER BY n DESC LIMIT 8`).all(from, ...t.args);
  return s;
}
