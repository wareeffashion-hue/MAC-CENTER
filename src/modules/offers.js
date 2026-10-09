import { json, tx, getSetting, sqlNow } from '../db.js';
import { fail } from '../http.js';
import { slugify, code } from '../lib/ids.js';
import { riyadhLocalToIso, riyadhParts, toMinutes } from '../lib/time.js';
import { driver, TemporaryError } from './whatsapp.js';
import { notifyRole } from './notify.js';
import { config } from '../config.js';

export const OFFER_STATUS = { draft: 'مسودة', review: 'مراجعة', approved: 'معتمد', cancelled: 'ملغى' };
export const OFFER_PHASE = { draft: 'مسودة', review: 'بانتظار المراجعة', scheduled: 'مجدول', active: 'نشط', ended: 'منتهٍ', cancelled: 'ملغى' };
export const CAMPAIGN_STATUS = { draft: 'مسودة', scheduled: 'مجدولة', sending: 'قيد الإرسال', paused: 'متوقفة', done: 'اكتملت', cancelled: 'ملغاة' };
export const MESSAGE_STATUS = { queued: 'معتمد للإرسال', sending: 'جارٍ الإرسال', sent: 'أرسل', delivered: 'سلّم', read: 'قرئ', failed: 'فشل', excluded: 'استبعد' };

export function offerPhase(o, now = new Date()) {
  if (o.status !== 'approved') return o.status;
  const t = now.toISOString();
  if (t < o.starts_at) return 'scheduled';
  if (t >= o.ends_at) return 'ended';
  return 'active';
}

export function hydrateOffer(o, now) {
  if (!o) return null;
  return { ...o, branchIds: json.parse(o.branch_ids, []), sectionIds: json.parse(o.section_ids, []), phase: offerPhase(o, now), send_enabled: !!o.send_enabled };
}

export function listOffers(db, { publicOnly = false, branchId = null } = {}) {
  const rows = db.prepare('SELECT * FROM offers ORDER BY starts_at DESC, id DESC').all().map((o) => hydrateOffer(o));
  return rows.filter((o) => (!publicOnly || o.phase === 'active') && (branchId == null || o.branchIds.includes(Number(branchId))));
}

export function getOffer(db, { id, slug }) {
  const o = id != null ? db.prepare('SELECT * FROM offers WHERE id = ?').get(id) : db.prepare('SELECT * FROM offers WHERE slug = ?').get(slug);
  return hydrateOffer(o);
}

export function saveOffer(db, user, id, input) {
  const errors = {};
  const title = String(input.title || '').trim();
  if (!title) errors.title = 'اسم العرض مطلوب';
  const starts = riyadhLocalToIso(input.starts_at), ends = riyadhLocalToIso(input.ends_at);
  if (!starts) errors.starts_at = 'حدد تاريخ البداية';
  if (!ends) errors.ends_at = 'حدد تاريخ النهاية';
  if (starts && ends && ends <= starts) errors.ends_at = 'النهاية يجب أن تكون بعد البداية';
  const branchIds = (input.branchIds || []).map(Number).filter(Boolean);
  if (!branchIds.length) errors.branchIds = 'اختر فرعًا واحدًا على الأقل';
  if (Object.keys(errors).length) fail(400, 'راجع بيانات العرض', errors);
  const vals = [title, String(input.summary || ''), String(input.description || ''), JSON.stringify(branchIds),
    JSON.stringify((input.sectionIds || []).map(Number).filter(Boolean)), starts, ends, String(input.terms || ''),
    input.discount ? String(input.discount) : null, input.send_enabled ? 1 : 0, input.template_name || null];
  if (id) {
    const cur = getOffer(db, { id });
    if (!cur) fail(404, 'العرض غير موجود');
    if (cur.status === 'cancelled') fail(400, 'لا يمكن تعديل عرض ملغى');
    // تعديل عرض معتمد يعيده للمراجعة
    const status = cur.status === 'approved' ? 'review' : cur.status;
    db.prepare(`UPDATE offers SET title=?, summary=?, description=?, branch_ids=?, section_ids=?, starts_at=?, ends_at=?, terms=?, discount=?,
      send_enabled=?, template_name=?, status=?, image=COALESCE(?, image), updated_at=datetime('now') WHERE id=?`).run(...vals, status, input.image || null, id);
  } else {
    let slug = slugify(input.slug || title);
    if (db.prepare('SELECT 1 FROM offers WHERE slug = ?').get(slug)) slug = `${slug}-${code(4).toLowerCase()}`;
    id = Number(db.prepare(`INSERT INTO offers (title, summary, description, branch_ids, section_ids, starts_at, ends_at, terms, discount,
      send_enabled, template_name, slug, status, image, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(...vals, slug, input.image || null, user.id).lastInsertRowid);
  }
  return getOffer(db, { id });
}

const TRANSITIONS = {
  submit: { from: ['draft'], to: 'review' },
  approve: { from: ['review', 'draft'], to: 'approved', perm: 'offers.publish' },
  reject: { from: ['review'], to: 'draft', perm: 'offers.publish' },
  cancel: { from: ['draft', 'review', 'approved'], to: 'cancelled', perm: 'offers.publish' },
};

export function transitionOffer(db, id, action, canPublish) {
  const t = TRANSITIONS[action];
  if (!t) fail(400, 'إجراء غير معروف');
  const o = getOffer(db, { id });
  if (!o) fail(404, 'العرض غير موجود');
  if (!t.from.includes(o.status)) fail(400, `لا يمكن ${action} لعرض حالته ${OFFER_STATUS[o.status]}`);
  if (t.perm && !canPublish) fail(403, 'صلاحية النشر مطلوبة');
  tx(db, () => {
    db.prepare("UPDATE offers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(t.to, id);
    if (t.to === 'cancelled') {
      // الإلغاء ينهي الإرسال فورًا
      for (const c of db.prepare("SELECT id FROM campaigns WHERE offer_id = ? AND status IN ('draft','scheduled','sending','paused')").all(id)) {
        cancelCampaign(db, c.id, 'ألغي العرض');
      }
    }
  });
  return getOffer(db, { id });
}

// ———————————————————— الجمهور والحملات ————————————————————

export function eligibleContacts(db, offer) {
  const subs = db.prepare(`SELECT s.contact_id, s.branch_ids, s.section_ids FROM subscriptions s WHERE s.status = 'active'`).all();
  return subs.filter((s) => matches(offer, json.parse(s.branch_ids, []), json.parse(s.section_ids, []))).map((s) => s.contact_id);
}

function matches(offer, branchIds, sectionIds) {
  const ob = offer.branchIds, os = offer.sectionIds;
  return ob.some((b) => branchIds.includes(b)) && (os.length === 0 || os.some((s) => sectionIds.includes(s)));
}

export function costModel(db) {
  const m = getSetting(db, 'messaging', {});
  return { perMessage: Number(m.costPerMarketing || 0), providerFee: Number(m.providerFeePerMessage || 0), currency: m.currency || 'USD' };
}

export function campaignPreview(db, offer) {
  const audience = eligibleContacts(db, offer);
  const c = costModel(db);
  return {
    audience: audience.length,
    metaCost: +(audience.length * c.perMessage).toFixed(2),
    providerCost: +(audience.length * c.providerFee).toFixed(2),
    currency: c.currency,
    sample: renderOfferMessage(offer),
  };
}

export function renderOfferMessage(offer) {
  return `${offer.title}\n${offer.summary || ''}\nالتفاصيل: ${config.publicUrl}/offers/${offer.slug}\nلإيقاف الرسائل أرسل: إيقاف`.replace(/\n\n/g, '\n');
}

export function createCampaign(db, user, input) {
  const offer = getOffer(db, { id: Number(input.offerId) });
  if (!offer) fail(400, 'اختر عرضًا', { offerId: 'مطلوب' });
  if (offer.status === 'cancelled') fail(400, 'العرض ملغى');
  const template = String(input.template_name || offer.template_name || '').trim();
  if (!template) fail(400, 'حدد اسم القالب المعتمد في واتساب', { template_name: 'مطلوب' });
  const p = campaignPreview(db, offer);
  const r = db.prepare(`INSERT INTO campaigns (offer_id, name, template_name, status, scheduled_at, budget, audience_count, estimated_cost, created_by, auto)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`).run(offer.id, String(input.name || offer.title), template,
    riyadhLocalToIso(input.scheduled_at) || offer.starts_at, input.budget ? Number(input.budget) : null, p.audience, p.metaCost + p.providerCost, user?.id ?? null, input.auto ? 1 : 0);
  return getCampaign(db, Number(r.lastInsertRowid));
}

export function getCampaign(db, id) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!c) return null;
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM messages WHERE campaign_id = ? GROUP BY status').all(id).map((r) => [r.status, r.n]));
  const spent = db.prepare('SELECT COALESCE(SUM(cost),0) s FROM messages WHERE campaign_id = ?').get(id).s;
  return { ...c, counts, spent };
}

export async function sendTest(db, user, campaignId) {
  const c = getCampaign(db, campaignId);
  if (!c) fail(404, 'الحملة غير موجودة');
  if (!user.wa_phone) fail(400, 'أضف رقم واتساب لحسابك من الملف الشخصي لاستقبال رسالة الاختبار');
  const offer = getOffer(db, { id: c.offer_id });
  await driver().send(templatePayload(user.wa_phone, c, offer));
  db.prepare("UPDATE campaigns SET test_sent_at = datetime('now') WHERE id = ?").run(campaignId);
  return getCampaign(db, campaignId);
}

export function scheduleCampaign(db, id) {
  const c = getCampaign(db, id);
  if (!c) fail(404, 'الحملة غير موجودة');
  if (!['draft', 'paused'].includes(c.status)) fail(400, 'لا يمكن جدولة الحملة في حالتها الحالية');
  if (!c.test_sent_at) fail(400, 'أرسل رسالة اختبار لنفسك قبل جدولة الحملة');
  const offer = getOffer(db, { id: c.offer_id });
  if (offer.status !== 'approved') fail(400, 'يجب اعتماد العرض قبل جدولة حملته');
  if (offer.phase === 'ended') fail(400, 'انتهت مدة العرض');
  db.prepare("UPDATE campaigns SET status = ? WHERE id = ?").run(c.status === 'paused' ? 'sending' : 'scheduled', id);
  return getCampaign(db, id);
}

export function pauseCampaign(db, id) {
  db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status IN ('scheduled','sending')").run(id);
  return getCampaign(db, id);
}

export function cancelCampaign(db, id, reason = 'ألغيت الحملة') {
  db.prepare("UPDATE campaigns SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND status NOT IN ('done','cancelled')").run(id);
  db.prepare("UPDATE messages SET status = 'excluded', reason = ?, updated_at = datetime('now') WHERE campaign_id = ? AND status = 'queued'").run(reason, id);
  return getCampaign(db, id);
}

export function retryMessage(db, id) {
  const r = db.prepare("UPDATE messages SET status = 'queued', reason = NULL, next_attempt_at = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'failed'").run(id);
  if (!r.changes) fail(400, 'يمكن إعادة محاولة الرسائل الفاشلة فقط');
  const m = db.prepare('SELECT campaign_id FROM messages WHERE id = ?').get(id);
  db.prepare("UPDATE campaigns SET status = 'sending', finished_at = NULL WHERE id = ? AND status = 'done'").run(m.campaign_id);
}

function templatePayload(to, campaign, offer) {
  if (config.whatsapp.driver === 'mock') return { to, text: renderOfferMessage(offer), template: undefined, campaign: campaign.id };
  return {
    to, template: campaign.template_name, language: 'ar',
    components: [{ type: 'body', parameters: [{ type: 'text', text: offer.title }, { type: 'text', text: `${config.publicUrl}/offers/${offer.slug}` }] }],
  };
}

// ———————————————————— المرسل ————————————————————

const BATCH = 20;
const MAX_ATTEMPTS = 3;

export function withinSendWindow(db, now = new Date()) {
  const [from, to] = getSetting(db, 'messaging', {}).sendWindow || ['10:00', '22:00'];
  const m = riyadhParts(now).minutes;
  return m >= toMinutes(from) && m < toMinutes(to);
}

// ينشئ حملات تلقائية للعروض المعتمدة المفعلة للإرسال عند بدايتها
export function autoCampaigns(db, now = new Date()) {
  const offers = db.prepare("SELECT * FROM offers WHERE status = 'approved' AND send_enabled = 1").all().map((o) => hydrateOffer(o, now));
  for (const o of offers) {
    if (o.phase !== 'active') continue;
    if (db.prepare('SELECT 1 FROM campaigns WHERE offer_id = ? AND auto = 1').get(o.id)) continue;
    if (!o.template_name) continue;
    const c = createCampaign(db, null, { offerId: o.id, name: `${o.title} · تلقائية`, auto: true, scheduled_at: null });
    const tested = db.prepare('SELECT 1 FROM campaigns WHERE template_name = ? AND test_sent_at IS NOT NULL').get(o.template_name);
    if (tested) {
      db.prepare("UPDATE campaigns SET status = 'scheduled', test_sent_at = datetime('now'), scheduled_at = ? WHERE id = ?").run(now.toISOString(), c.id);
    } else {
      notifyRole(db, ['marketing', 'admin'], null, { kind: 'campaign', title: `حملة «${o.title}» تنتظر رسالة اختبار قبل الإرسال`, link: `#/campaigns/${c.id}` });
    }
  }
}

// يحول الحملات المجدولة إلى طابور رسائل؛ القيد الفريد يمنع تكرار العميل في الحملة
export function materialize(db, now = new Date()) {
  const due = db.prepare("SELECT * FROM campaigns WHERE status = 'scheduled' AND (scheduled_at IS NULL OR scheduled_at <= ?)").all(now.toISOString());
  for (const c of due) {
    const offer = getOffer(db, { id: c.offer_id });
    if (!offer || offer.status !== 'approved' || offerPhase(offer, now) === 'ended') { cancelCampaign(db, c.id, 'العرض غير ساري'); continue; }
    tx(db, () => {
      const ins = db.prepare("INSERT OR IGNORE INTO messages (campaign_id, contact_id, status) VALUES (?, ?, 'queued')");
      const ids = eligibleContacts(db, offer);
      for (const cid of ids) ins.run(c.id, cid);
      db.prepare("UPDATE campaigns SET status = 'sending', audience_count = ? WHERE id = ?").run(ids.length, c.id);
    });
  }
}

export async function dispatch(db, now = new Date()) {
  if (!withinSendWindow(db, now)) return { sent: 0, skipped: 'خارج ساعات الإرسال' };
  const cap = Number(getSetting(db, 'messaging', {}).weeklyCap || 2);
  const cost = costModel(db);
  const rows = db.prepare(`SELECT m.*, c.status AS cstatus, c.offer_id, c.budget, c.template_name, c.id AS cid FROM messages m JOIN campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'queued' AND c.status = 'sending' AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= ?) ORDER BY m.id LIMIT ?`).all(sqlNow(now), BATCH);
  let sent = 0;
  for (const m of rows) {
    const exclude = (reason) => db.prepare("UPDATE messages SET status = 'excluded', reason = ?, updated_at = datetime('now') WHERE id = ? AND status = 'queued'").run(reason, m.id);
    const offer = getOffer(db, { id: m.offer_id });
    // التحقق المباشر قبل كل رسالة: صلاحية العرض وموافقة العميل والسقف والميزانية
    if (!offer || offer.status !== 'approved' || offerPhase(offer, now) !== 'active') { exclude('العرض لم يعد ساريًا'); continue; }
    const sub = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(m.contact_id);
    if (!sub || sub.status !== 'active') { exclude('الاشتراك غير نشط'); continue; }
    if (!matches(offer, json.parse(sub.branch_ids, []), json.parse(sub.section_ids, []))) { exclude('لم يعد ضمن اهتمامات العميل'); continue; }
    const weekAgo = sqlNow(new Date(now.getTime() - 7 * 86400000));
    const recent = db.prepare("SELECT COUNT(*) n FROM messages WHERE contact_id = ? AND category = 'marketing' AND status IN ('sent','delivered','read') AND sent_at >= ?").get(m.contact_id, weekAgo).n;
    if (recent >= cap) { exclude(`تجاوز سقف ${cap} رسائل أسبوعيًا`); continue; }
    if (m.budget != null) {
      const spent = db.prepare('SELECT COALESCE(SUM(cost),0) s FROM messages WHERE campaign_id = ?').get(m.cid).s;
      if (spent + cost.perMessage + cost.providerFee > m.budget) {
        db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(m.cid);
        notifyRole(db, ['marketing', 'admin'], null, { kind: 'campaign', title: `توقفت حملة لبلوغ سقف الميزانية`, link: `#/campaigns/${m.cid}` });
        break;
      }
    }
    // حجز الرسالة قبل الإرسال حتى لا ترسلها مهمة أخرى
    const claim = db.prepare("UPDATE messages SET status = 'sending', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ? AND status = 'queued'").run(m.id);
    if (!claim.changes) continue;
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(m.contact_id);
    try {
      const r = await driver().send(templatePayload(contact.wa_id, { id: m.cid, template_name: m.template_name }, offer));
      db.prepare("UPDATE messages SET status = 'sent', provider_id = ?, cost = ?, sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .run(r.id || null, cost.perMessage + cost.providerFee, m.id);
      sent++;
    } catch (err) {
      if (err instanceof TemporaryError && m.attempts + 1 < MAX_ATTEMPTS) {
        const delay = 2 ** (m.attempts + 1) * 60000;
        db.prepare("UPDATE messages SET status = 'queued', reason = ?, next_attempt_at = ?, updated_at = datetime('now') WHERE id = ?")
          .run(`خطأ مؤقت: ${err.message}`, sqlNow(new Date(now.getTime() + delay)), m.id);
      } else {
        db.prepare("UPDATE messages SET status = 'failed', reason = ?, updated_at = datetime('now') WHERE id = ?").run(err.message, m.id);
      }
    }
  }
  // إنهاء الحملات التي لم يبق لها طابور
  db.prepare(`UPDATE campaigns SET status = 'done', finished_at = datetime('now') WHERE status = 'sending'
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.campaign_id = campaigns.id AND m.status IN ('queued','sending'))`).run();
  return { sent };
}
