import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { json, tx, getSetting, sqlNow } from '../db.js';
import { fail, sniffImage } from '../http.js';
import { code, token } from '../lib/ids.js';
import { openStatus } from '../lib/hours.js';
import { config } from '../config.js';
import { getBranch } from './catalog.js';
import { notifyUsers, usersWithRole } from './notify.js';
import { trackEvent } from './events.js';
import { inScope, branchScope } from './auth.js';

export const TICKET_TYPES = { complaint: 'شكوى', suggestion: 'مقترح', experience: 'تقييم تجربة', contact: 'طلب تواصل' };
export const TICKET_STATUS = { new: 'جديدة', assigned: 'مسندة', in_progress: 'قيد المتابعة', waiting_customer: 'بانتظار العميل', resolved: 'محلولة', closed: 'مغلقة' };
export const PRIORITY = { low: 'منخفضة', normal: 'عادية', high: 'مرتفعة', urgent: 'عاجلة' };
export const TOPICS = { staff: 'تعامل الموظفين', product: 'جودة المنتج', price: 'السعر والعروض', availability: 'توفر المقاس أو المنتج', exchange: 'الاستبدال والاسترجاع', delivery: 'التوصيل', cleanliness: 'النظافة والترتيب', payment: 'الدفع والتقسيط', other: 'موضوع آخر' };

const PHONE_RE = /^(?:\+?966|0)?5\d{8}$/;

export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  if (!PHONE_RE.test(d)) return false;
  return '05' + d.slice(-8);
}

function priorityFor(type, rating) {
  if (type === 'complaint' && rating != null && rating <= 2) return 'high';
  if (type === 'complaint') return 'normal';
  if (rating != null && rating <= 2) return 'high';
  if (type === 'contact') return 'normal';
  return 'low';
}

// مهلة أول تواصل محسوبة على ساعات خدمة الفرع
export function dueAt(db, branch, priority, now = new Date()) {
  const s = getSetting(db, 'tickets', {});
  const minutes = priority === 'urgent' ? Number(s.urgentMinutes || 15) : Number(s.firstResponseMinutes || 30);
  let start = now;
  if (branch && priority !== 'urgent') {
    const st = openStatus(branch, now);
    if (st.known && !st.open && st.opensAt) start = new Date(st.opensAt);
  }
  return new Date(start.getTime() + minutes * 60000);
}

export function routeTicket(db, { branchId, sectionId, topic }) {
  const rules = db.prepare('SELECT * FROM routing_rules').all();
  const score = (r) => {
    if (r.branch_id != null && r.branch_id !== branchId) return -1;
    if (r.section_id != null && r.section_id !== sectionId) return -1;
    if (r.topic != null && r.topic !== topic) return -1;
    return (r.branch_id != null ? 4 : 0) + (r.section_id != null ? 2 : 0) + (r.topic != null ? 1 : 0);
  };
  const ranked = rules.map((r) => ({ r, s: score(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  const active = (id) => id && db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(id);
  for (const { r } of ranked) {
    if (active(r.user_id)) return { assigneeId: r.user_id, backupId: active(r.backup_user_id) ? r.backup_user_id : null };
    if (active(r.backup_user_id)) return { assigneeId: r.backup_user_id, backupId: null };
  }
  return { assigneeId: null, backupId: null }; // طابور الفرع
}

export function createTicket(db, input, files = [], { source = 'web' } = {}) {
  const errors = {};
  const type = Object.hasOwn(TICKET_TYPES, input.type) ? input.type : null;
  if (!type) errors.type = 'اختر نوع الملاحظة';
  const branchId = Number(input.branch) || null;
  const branch = branchId ? getBranch(db, { id: branchId }) : null;
  if (!branch) errors.branch = 'اختر الفرع';
  const sectionId = Number(input.section) || null;
  const topic = Object.hasOwn(TOPICS, input.topic) ? input.topic : null;
  const rating = input.rating ? Math.max(1, Math.min(5, Number(input.rating))) : null;
  const body = String(input.body || '').trim().slice(0, 3000);
  if (!body && !rating) errors.body = 'اكتب ملاحظتك أو اختر تقييمًا';
  const wantsContact = type === 'contact' || input.wants_contact === 'on' || input.wants_contact === true || input.wants_contact === '1';
  const phone = normalizePhone(input.phone);
  if (phone === false) errors.phone = 'رقم الجوال غير صحيح';
  if (wantsContact && !phone) errors.phone = 'أدخل رقم الجوال ليتواصل معك الفرع';
  if (wantsContact && phone && !(input.contact_consent === 'on' || input.contact_consent === true || input.contact_consent === '1')) {
    errors.contact_consent = 'وافق على التواصل بشأن هذه الملاحظة';
  }
  const images = [];
  for (const f of files.filter((x) => x.field === 'images')) {
    const kind = sniffImage(f.data);
    if (!kind) { errors.images = 'المرفقات يجب أن تكون صورًا بصيغة JPG أو PNG أو WEBP'; break; }
    if (f.data.length > config.uploads.maxImageBytes) { errors.images = 'حجم الصورة يتجاوز 10 ميجابايت'; break; }
    images.push({ ...kind, data: f.data });
  }
  if (images.length > config.uploads.maxTicketImages) errors.images = 'ثلاث صور بحد أقصى';
  if (Object.keys(errors).length) fail(400, 'راجع الحقول المظللة', errors);

  // الأولوية وربط التقييم يحددهما الموظف فقط؛ النموذج العام لا يستطيع رفع بلاغه إلى "عاجل"
  const staff = source !== 'web' && source !== 'qr';
  const priority = staff && Object.hasOwn(PRIORITY, input.priority) ? input.priority : priorityFor(type, rating);
  const positive = type === 'experience' && rating != null && rating >= 4 && !wantsContact;
  const route = routeTicket(db, { branchId, sectionId, topic });
  const now = new Date();
  const ref = `MC-${code(6)}`;
  const trackKey = token(18);

  // نحفظ التذكرة أولًا، والتنبيه بعدها؛ فشل التنبيه لا يفقد البلاغ
  const id = tx(db, () => {
    const r = db.prepare(`INSERT INTO tickets (ref, track_key, type, source, branch_id, section_id, topic, rating, body, name, phone, wants_contact,
      contact_consent_at, qr_code, review_id, status, priority, assignee_id, due_at, close_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      ref, trackKey, type, source, branchId, sectionId, topic, rating, body || '—', String(input.name || '').trim().slice(0, 80) || null,
      phone || null, wantsContact && phone ? 1 : 0, wantsContact && phone ? sqlNow(now) : null, String(input.qr || '').slice(0, 16) || null, staff ? Number(input.review_id) || null : null,
      positive ? 'closed' : route.assigneeId ? 'assigned' : 'new', priority, positive ? null : route.assigneeId,
      positive || !wantsContact && type === 'suggestion' ? null : sqlNow(dueAt(db, branch, priority, now)),
      positive ? 'تقييم إيجابي للاطلاع' : null);
    const tid = Number(r.lastInsertRowid);
    if (images.length) {
      const dir = join(config.dataDir, 'attachments');
      mkdirSync(dir, { recursive: true });
      for (const img of images) {
        const aid = token(16);
        writeFileSync(join(dir, aid), img.data);
        db.prepare('INSERT INTO attachments (id, ticket_id, mime, size) VALUES (?, ?, ?, ?)').run(aid, tid, img.mime, img.data.length);
      }
    }
    db.prepare('INSERT INTO ticket_events (ticket_id, kind, body, internal) VALUES (?, ?, ?, 0)').run(tid, 'created', 'استلمنا ملاحظتك');
    if (route.assigneeId && !positive) db.prepare('INSERT INTO ticket_events (ticket_id, kind, body, user_id) VALUES (?, ?, ?, ?)').run(tid, 'assigned', 'إسناد تلقائي حسب جدول التوجيه', route.assigneeId);
    return tid;
  });
  trackEvent(db, 'ticket_created', { branchId, qr: input.qr || null });

  if (!positive) {
    try {
      const title = `${TICKET_TYPES[type]} جديدة ${ref} · ${branch.short_name}${priority === 'high' || priority === 'urgent' ? ' · ' + PRIORITY[priority] : ''}`;
      const targets = route.assigneeId ? [route.assigneeId] : usersWithRole(db, ['agent', 'branch_manager'], branchId);
      notifyUsers(db, targets, { kind: 'ticket', title, link: `#/tickets/${id}` });
    } catch (err) { console.error('notify failed', err.message); }
  }

  const s = getSetting(db, 'tickets', {});
  return {
    id, ref, trackKey, wantsContact: wantsContact && !!phone, positive,
    responseNote: wantsContact && phone ? `يتواصل معك فريق ${branch.short_name} خلال ${s.firstResponseMinutes || 30} دقيقة في أوقات الدوام.` : 'سُجّلت ملاحظتك للتحسين. للتواصل معك نحتاج رقم الجوال.',
    branch,
  };
}

export function publicTicket(db, trackKey) {
  const t = db.prepare('SELECT t.*, b.name AS branch_name, b.phone AS branch_phone FROM tickets t LEFT JOIN branches b ON b.id = t.branch_id WHERE track_key = ?').get(trackKey);
  if (!t) return null;
  const events = db.prepare('SELECT kind, body, at FROM ticket_events WHERE ticket_id = ? AND internal = 0 ORDER BY at, id').all(t.id);
  return {
    ref: t.ref, type: TICKET_TYPES[t.type], status: t.status, statusName: TICKET_STATUS[t.status], branch: t.branch_name, branchPhone: t.branch_phone,
    createdAt: t.created_at, events, hasPhone: !!t.phone, phoneTail: t.phone ? t.phone.slice(-4) : null,
  };
}

// ———————————————————— واجهة الموظفين ————————————————————

export function listTickets(db, user, q = {}) {
  const where = [], args = [];
  const scope = branchScope(user);
  if (scope !== null) { where.push(`t.branch_id IN (${scope.map(() => '?').join(',') || 'NULL'})`); args.push(...scope); }
  if (user.role === 'agent') { where.push('(t.assignee_id = ? OR t.assignee_id IS NULL)'); args.push(user.id); }
  if (q.status === 'open') where.push("t.status NOT IN ('resolved','closed')");
  else if (q.status === 'late') { where.push("t.status NOT IN ('resolved','closed') AND t.acknowledged_at IS NULL AND t.due_at < ?"); args.push(sqlNow()); }
  else if (q.status in TICKET_STATUS) { where.push('t.status = ?'); args.push(q.status); }
  if (q.mine) { where.push('t.assignee_id = ?'); args.push(user.id); }
  for (const [k, col] of [['branch', 't.branch_id'], ['section', 't.section_id'], ['type', 't.type'], ['priority', 't.priority'], ['topic', 't.topic']]) {
    if (q[k]) { where.push(`${col} = ?`); args.push(q[k]); }
  }
  if (q.q) {
    where.push('(t.ref LIKE ? OR t.body LIKE ? OR t.name LIKE ? OR t.phone LIKE ?)');
    const like = `%${q.q}%`;
    args.push(like, like, like, like);
  }
  const rows = db.prepare(`SELECT t.id, t.ref, t.type, t.source, t.branch_id, t.section_id, t.topic, t.rating, substr(t.body,1,140) AS excerpt, t.name,
      t.status, t.priority, t.assignee_id, t.acknowledged_at, t.due_at, t.escalation_level, t.created_at, t.updated_at, u.name AS assignee_name,
      (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS attachments
    FROM tickets t LEFT JOIN users u ON u.id = t.assignee_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at DESC LIMIT 300`).all(...args);
  const now = sqlNow();
  return rows.map((r) => ({ ...r, late: !['resolved', 'closed'].includes(r.status) && !r.acknowledged_at && r.due_at && r.due_at < now }));
}

export function getTicket(db, user, id) {
  const t = db.prepare('SELECT t.*, u.name AS assignee_name FROM tickets t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?').get(id);
  if (!t) fail(404, 'التذكرة غير موجودة');
  if (!inScope(user, t.branch_id)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  if (user.role === 'agent' && t.assignee_id && t.assignee_id !== user.id) fail(403, 'التذكرة مسندة لموظف آخر');
  const events = db.prepare('SELECT e.*, u.name AS user_name FROM ticket_events e LEFT JOIN users u ON u.id = e.user_id WHERE ticket_id = ? ORDER BY at, e.id').all(id);
  const attachments = db.prepare('SELECT id, mime, size FROM attachments WHERE ticket_id = ?').all(id);
  return { ...t, events, attachments };
}

const STATUS_FLOW = {
  new: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'waiting_customer', 'resolved', 'closed'],
  in_progress: ['waiting_customer', 'resolved', 'closed'],
  waiting_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};

export function updateTicket(db, user, id, action, input = {}) {
  const t = getTicket(db, user, id);
  const log = (kind, body, internal = 1) => db.prepare('INSERT INTO ticket_events (ticket_id, kind, body, internal, user_id) VALUES (?, ?, ?, ?, ?)').run(id, kind, body, internal, user.id);
  tx(db, () => {
    switch (action) {
      case 'acknowledge':
        db.prepare("UPDATE tickets SET acknowledged_at = COALESCE(acknowledged_at, datetime('now')), assignee_id = COALESCE(assignee_id, ?), status = CASE WHEN status IN ('new','assigned') THEN 'in_progress' ELSE status END, updated_at = datetime('now') WHERE id = ?").run(user.id, id);
        log('acknowledged', `استلم ${user.name} المهمة`);
        break;
      case 'assign': {
        const to = Number(input.userId) || null;
        if (to) {
          const target = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(to);
          if (!target) fail(400, 'الموظف غير موجود');
          if (!inScope(target, t.branch_id)) fail(400, 'الموظف لا يملك صلاحية على هذا الفرع');
        }
        db.prepare("UPDATE tickets SET assignee_id = ?, status = CASE WHEN status = 'new' AND ? IS NOT NULL THEN 'assigned' ELSE status END, acknowledged_at = NULL, updated_at = datetime('now') WHERE id = ?").run(to, to, id);
        log('assigned', to ? `أسندت إلى ${db.prepare('SELECT name FROM users WHERE id = ?').get(to).name}` : 'أعيدت إلى طابور الفرع');
        if (to && to !== user.id) notifyUsers(db, [to], { kind: 'ticket', title: `أسندت إليك التذكرة ${t.ref}`, link: `#/tickets/${id}` });
        break;
      }
      case 'status': {
        const to = input.status;
        if (!(STATUS_FLOW[t.status] || []).includes(to)) fail(400, `لا يمكن الانتقال من ${TICKET_STATUS[t.status]} إلى ${TICKET_STATUS[to] || to}`);
        if (to === 'closed' && !String(input.reason || '').trim()) fail(400, 'اذكر سبب الإغلاق', { reason: 'مطلوب' });
        db.prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now'),
          resolved_at = CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, datetime('now')) ELSE NULL END,
          close_reason = CASE WHEN ? = 'closed' THEN ? ELSE close_reason END WHERE id = ?`).run(to, to, to, input.reason || null, id);
        const reopened = ['resolved', 'closed'].includes(t.status) && !['resolved', 'closed'].includes(to);
        log(reopened ? 'reopened' : 'status', reopened ? 'أعيد فتح التذكرة' : `الحالة: ${TICKET_STATUS[to]}${input.reason ? ' — ' + input.reason : ''}`, 0);
        if (to === 'resolved') trackEvent(db, 'ticket_resolved', { branchId: t.branch_id });
        break;
      }
      case 'priority':
        if (!(input.priority in PRIORITY)) fail(400, 'أولوية غير صحيحة');
        db.prepare("UPDATE tickets SET priority = ?, updated_at = datetime('now') WHERE id = ?").run(input.priority, id);
        log('priority', `الأولوية: ${PRIORITY[input.priority]}`);
        break;
      case 'classify': {
        const sets = [], args = [];
        if ('section' in input) { sets.push('section_id = ?'); args.push(Number(input.section) || null); }
        if ('topic' in input) { sets.push('topic = ?'); args.push(input.topic in TOPICS ? input.topic : null); }
        if ('branch' in input && Number(input.branch) !== t.branch_id) {
          if (!inScope(user, Number(input.branch))) fail(403, 'لا تملك صلاحية على الفرع الجديد');
          sets.push('branch_id = ?'); args.push(Number(input.branch));
        }
        if (!sets.length) break;
        db.prepare(`UPDATE tickets SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...args, id);
        log('classified', 'تصحيح التصنيف');
        break;
      }
      case 'note': {
        const body = String(input.body || '').trim();
        if (!body) fail(400, 'اكتب الملاحظة');
        log('note', body, 1);
        break;
      }
      case 'contact': {
        // توثيق تواصل فعلي مع العميل
        const body = String(input.body || '').trim();
        if (!body) fail(400, 'اكتب ملخص التواصل');
        db.prepare("UPDATE tickets SET first_response_at = COALESCE(first_response_at, datetime('now')), acknowledged_at = COALESCE(acknowledged_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(id);
        log('contact', body, input.visible ? 0 : 1);
        break;
      }
      default: fail(400, 'إجراء غير معروف');
    }
  });
  return getTicket(db, user, id);
}

// التصعيد: مهمة لم تستلم خلال المهلة تعاد للبديل ثم تصعد للمدير
export function escalateLate(db, now = new Date()) {
  const s = getSetting(db, 'tickets', {});
  const late = db.prepare(`SELECT * FROM tickets WHERE status NOT IN ('resolved','closed') AND acknowledged_at IS NULL AND due_at IS NOT NULL AND due_at < ?`).all(sqlNow(now));
  for (const t of late) {
    const next = t.escalation_level + 1;
    const nextDue = sqlNow(new Date(now.getTime() + Number(s.escalateAfterMinutes || 30) * 60000));
    tx(db, () => {
      let body;
      if (next === 1) {
        const { backupId } = routeTicket(db, { branchId: t.branch_id, sectionId: t.section_id, topic: t.topic });
        const to = backupId && backupId !== t.assignee_id ? backupId : null;
        if (to) db.prepare("UPDATE tickets SET assignee_id = ?, status = 'assigned' WHERE id = ?").run(to, t.id);
        body = to ? 'لم تستلم خلال المهلة؛ أعيد توجيهها للبديل وأبلغ مدير الفرع' : 'لم تستلم خلال المهلة؛ أبلغ مدير الفرع';
        notifyUsers(db, [...(to ? [to] : []), ...usersWithRole(db, ['branch_manager'], t.branch_id)], { kind: 'escalation', title: `تأخر في التذكرة ${t.ref}`, link: `#/tickets/${t.id}` });
      } else {
        body = `تصعيد مستوى ${next} إلى إدارة النظام`;
        notifyUsers(db, usersWithRole(db, ['admin'], null), { kind: 'escalation', title: `تصعيد ${t.ref}: لم تستلم بعد ${next} مهل`, link: `#/tickets/${t.id}` });
      }
      db.prepare('UPDATE tickets SET escalation_level = ?, due_at = ? WHERE id = ?').run(next, nextDue, t.id);
      db.prepare("INSERT INTO ticket_events (ticket_id, kind, body) VALUES (?, 'escalated', ?)").run(t.id, body);
    });
  }
  return late.length;
}

export function ticketStats(db, user, { from }) {
  const scope = branchScope(user);
  const where = ['created_at >= ?'], args = [from];
  if (scope !== null) { where.push(`branch_id IN (${scope.map(() => '?').join(',') || 'NULL'})`); args.push(...scope); }
  const w = where.join(' AND ');
  const rows = db.prepare(`SELECT type, status, priority, topic, branch_id, created_at, first_response_at, resolved_at,
    (SELECT COUNT(*) FROM ticket_events e WHERE e.ticket_id = tickets.id AND e.kind = 'reopened') AS reopens FROM tickets WHERE ${w}`).all(...args);
  const mins = (a, b) => (Date.parse(b + 'Z') - Date.parse(a + 'Z')) / 60000;
  const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
  const firstResp = rows.filter((r) => r.first_response_at).map((r) => mins(r.created_at, r.first_response_at));
  const resolve = rows.filter((r) => r.resolved_at).map((r) => mins(r.created_at, r.resolved_at));
  const by = (k) => rows.reduce((m, r) => { const key = r[k] ?? '—'; m[key] = (m[key] || 0) + 1; return m; }, {});
  return {
    total: rows.length, byType: by('type'), byStatus: by('status'), byPriority: by('priority'), byTopic: by('topic'), byBranch: by('branch_id'),
    medianFirstResponse: median(firstResp), medianResolve: median(resolve), reopened: rows.filter((r) => r.reopens > 0).length,
    answeredCount: firstResp.length,
  };
}

export { json };
