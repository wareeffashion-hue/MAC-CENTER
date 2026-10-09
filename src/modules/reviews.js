import { config } from '../config.js';
import { json, tx, getSetting, setSetting, sqlNow } from '../db.js';
import { fail } from '../http.js';
import { createTicket } from './tickets.js';
import { notifyRole, setIntegrationStatus } from './notify.js';

export const REVIEW_STATE = {
  new: 'جديد', auto_replied: 'رد تلقائي', needs_review: 'يحتاج مراجعة', draft_ready: 'مسودة جاهزة',
  replied: 'تم الرد', escalated: 'مصعّد', ignored: 'بلا إجراء',
};
export const CLASSIFICATION = {
  positive: 'إيجابي واضح', positive_with_issue: 'نجوم مرتفعة مع ملاحظة', negative: 'منخفض أو ملتبس', sensitive: 'حساس أو بيانات شخصية',
};

const SENSITIVE = /(تحرش|سرق|حرامي|تسمم|محام|شرطة|قضية|بلاغ رسمي|عنصري|إصابة|اصابة|جرح|نصب|احتيال|ابتزاز|تهديد)/;
const ISSUE = /(سيء|سيئ|سي[ئء]ة|زحم|غالي|غالية|تأخر|تاخر|ما ردوا|ما رد|رديء|ردي|لا أنصح|لا انصح|ما عجبني|للأسف|للاسف|مشكل|وسخ|قذر|خايس|انتظرت|طول|تعامل .{0,8}(سيء|سيئ)|ما فيه|مافي|ناقص|خربان|معطوب|مكسور|استرجاع|استبدال|رفضوا|رفض)/;
const PERSONAL = /(\b05\d{8}\b|\+?9665\d{8}|[\w.+-]+@[\w-]+\.[\w.]+)/;

export function classify({ rating, text }) {
  const t = String(text || '');
  if (SENSITIVE.test(t) || PERSONAL.test(t)) return 'sensitive';
  // لا يحكم على الرضا من النجوم وحدها
  if (rating >= 4) return ISSUE.test(t) ? 'positive_with_issue' : 'positive';
  return 'negative';
}

const DEFAULT_INSTRUCTIONS = {
  tone: 'ودّية ومهنية ومختصرة',
  language: 'العربية الفصحى المبسطة',
  positiveTemplates: [
    'شكرًا لمشاركتنا تجربتك، سعداء بزيارتك لـ{branch} ونتطلع لاستقبالك مجددًا.',
    'نشكرك على كلماتك الجميلة، ويسعدنا أن تجربتك في {branch} كانت مميزة. ننتظر زيارتك القادمة.',
    'شكرًا لتقييمك، سعداء بثقتك في {branch} ونتطلع لخدمتك دائمًا.',
  ],
  ackTemplate: 'نشكرك على توضيح ملاحظتك، ويسعدنا التواصل معك عبر خدمة عملاء {branch} على الرقم {phone} لمتابعتها.',
  facts: 'توصيل لجميع مناطق المملكة. الطلب والاستفسار عبر واتساب الفرع.',
  humanCases: 'ادعاءات قانونية أو صحية، بيانات شخصية، اتهام موظف بالاسم، طلب تعويض.',
  autoReply: { positive: false, lowAck: false },
  autoReplyApprovedBy: null,
  autoReplyApprovedAt: null,
};

export function instructions(db, branchId) {
  return { ...DEFAULT_INSTRUCTIONS, ...(getSetting(db, `review_instructions:${branchId}`, {}) || {}) };
}

export function saveInstructions(db, user, branchId, input) {
  const cur = instructions(db, branchId);
  const next = {
    ...cur,
    tone: String(input.tone ?? cur.tone), language: String(input.language ?? cur.language),
    positiveTemplates: (input.positiveTemplates || cur.positiveTemplates).map(String).filter((s) => s.trim()).slice(0, 10),
    ackTemplate: String(input.ackTemplate ?? cur.ackTemplate), facts: String(input.facts ?? cur.facts), humanCases: String(input.humanCases ?? cur.humanCases),
  };
  if (input.autoReply) {
    const changed = input.autoReply.positive !== cur.autoReply.positive || input.autoReply.lowAck !== cur.autoReply.lowAck;
    next.autoReply = { positive: !!input.autoReply.positive, lowAck: !!input.autoReply.lowAck };
    // تفعيل الرد التلقائي يحتاج موافقة صريحة مسجلة
    if (changed && (next.autoReply.positive || next.autoReply.lowAck)) {
      if (!input.confirmAutoReply) fail(400, 'أكد موافقتك الصريحة على تفعيل الرد التلقائي');
      next.autoReplyApprovedBy = user.id;
      next.autoReplyApprovedAt = sqlNow();
    }
  }
  if (next.positiveTemplates.length === 0) fail(400, 'أضف قالب رد إيجابي واحدًا على الأقل');
  setSetting(db, `review_instructions:${branchId}`, next);
  return next;
}

function fill(template, branch) {
  return template.replaceAll('{branch}', branch.name).replaceAll('{phone}', branch.phone);
}

// المسودة تبنى من قوالب الإدارة فقط؛ نص العميل لا يدخل في الصياغة ولا ينفذ ما فيه
export function draftReply(db, review, branch) {
  const ins = instructions(db, branch.id);
  if (review.classification === 'positive') {
    const pool = ins.positiveTemplates;
    const pick = pool[Number(String(review.google_id).replace(/\D/g, '').slice(-3) || 0) % pool.length];
    return fill(pick, branch);
  }
  return fill(ins.ackTemplate, branch);
}

export function previewRules(db, branchId, samples) {
  const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
  const ins = instructions(db, branchId);
  return samples.map((s, i) => {
    const classification = classify(s);
    const action = decide(classification, ins);
    return { ...s, classification, classificationName: CLASSIFICATION[classification], action, draft: draftReply(db, { classification, google_id: String(i) }, branch) };
  });
}

function decide(classification, ins) {
  switch (classification) {
    case 'positive': return ins.autoReply.positive ? 'رد تلقائي قصير' : 'مسودة للمراجعة';
    case 'positive_with_issue': return 'تذكرة + مسودة + تنبيه المسؤول';
    case 'negative': return ins.autoReply.lowAck ? 'إقرار استلام تلقائي + تنبيه' : 'تنبيه ومسودة للمراجعة';
    default: return 'مراجعة بشرية قبل النشر + تصعيد';
  }
}

// ———————————————————— المعالجة ————————————————————

export async function ingestReview(db, branch, r) {
  const existing = db.prepare('SELECT * FROM reviews WHERE google_id = ?').get(r.id);
  if (existing) {
    const changed = existing.text !== (r.text || null) || existing.rating !== r.rating;
    db.prepare("UPDATE reviews SET text = ?, rating = ?, author = ?, review_updated_at = ?, fetched_at = datetime('now') WHERE id = ?")
      .run(r.text || null, r.rating, r.author || null, r.updatedAt || null, existing.id);
    if (changed) {
      // تحديث تقييم سبق الرد عليه يعود للمراجعة، ولا يستبدل الرد البشري تلقائيًا
      const classification = classify(r);
      db.prepare("UPDATE reviews SET classification = ?, state = 'needs_review', draft = ? WHERE id = ?")
        .run(classification, draftReply(db, { classification, google_id: r.id }, branch), existing.id);
      notifyRole(db, ['reviewer', 'branch_manager'], branch.id, { kind: 'review', title: `تحديث تقييم في ${branch.short_name} يحتاج مراجعة`, link: `#/reviews/${existing.id}` });
    }
    return { id: existing.id, updated: changed };
  }
  const classification = classify(r);
  const ins = instructions(db, branch.id);
  const id = Number(db.prepare(`INSERT INTO reviews (branch_id, google_id, author, rating, text, review_time, review_updated_at, classification, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`).run(branch.id, r.id, r.author || null, r.rating, r.text || null, r.createdAt, r.updatedAt || null, classification).lastInsertRowid);
  const review = { id, google_id: r.id, classification };
  const draft = draftReply(db, review, branch);

  if (r.existingReply) {
    db.prepare("UPDATE reviews SET state = 'replied', reply = ?, reply_source = 'external', replied_at = datetime('now') WHERE id = ?").run(r.existingReply, id);
    return { id, created: true };
  }

  if (classification === 'positive' && ins.autoReply.positive) {
    await publishReply(db, id, draft, 'auto');
  } else if (classification === 'positive_with_issue') {
    const t = createTicket(db, { type: 'complaint', branch: branch.id, body: `[تقييم Google ${r.rating}★] ${r.text || ''}`, review_id: id, priority: 'normal' }, [], { source: 'google' });
    db.prepare("UPDATE reviews SET state = 'needs_review', draft = ?, ticket_id = ? WHERE id = ?").run(draft, t.id, id);
  } else if (classification === 'negative') {
    if (ins.autoReply.lowAck) await publishReply(db, id, draft, 'auto_ack');
    else db.prepare("UPDATE reviews SET state = 'needs_review', draft = ? WHERE id = ?").run(draft, id);
    if (r.rating <= 2 && r.text) {
      const t = createTicket(db, { type: 'complaint', branch: branch.id, body: `[تقييم Google ${r.rating}★] ${r.text}`, review_id: id, priority: 'high' }, [], { source: 'google' });
      db.prepare('UPDATE reviews SET ticket_id = ? WHERE id = ?').run(t.id, id);
    }
  } else if (classification === 'sensitive') {
    const t = createTicket(db, { type: 'complaint', branch: branch.id, body: `[تقييم Google حساس ${r.rating}★] ${r.text || ''}`, review_id: id, priority: 'urgent' }, [], { source: 'google' });
    db.prepare("UPDATE reviews SET state = 'escalated', draft = ?, ticket_id = ? WHERE id = ?").run(draft, t.id, id);
  } else {
    db.prepare("UPDATE reviews SET state = 'draft_ready', draft = ? WHERE id = ?").run(draft, id);
  }
  if (classification !== 'positive' || !ins.autoReply.positive) {
    notifyRole(db, ['reviewer', 'branch_manager'], branch.id, { kind: 'review', title: `تقييم ${r.rating}★ جديد في ${branch.short_name}: ${CLASSIFICATION[classification]}`, link: `#/reviews/${id}` });
  }
  return { id, created: true };
}

export async function publishReply(db, reviewId, text, source, user = null) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  if (!review) fail(404, 'التقييم غير موجود');
  const body = String(text || '').trim();
  if (!body) fail(400, 'نص الرد فارغ');
  if (PERSONAL.test(body)) {
    const branch = db.prepare('SELECT phone FROM branches WHERE id = ?').get(review.branch_id);
    // رقم الفرع مسموح، أي رقم أو بريد آخر يمنع
    const stripped = body.replaceAll(branch.phone, '');
    if (PERSONAL.test(stripped)) fail(400, 'الرد العام لا يتضمن أرقامًا أو بريدًا غير رقم خدمة الفرع');
  }
  // منع تكرار الرد واستبدال رد بشري منشور تلقائيًا
  if (source.startsWith('auto') && review.reply && review.reply_source === 'human') return { skipped: true };
  if (source.startsWith('auto') && review.reply) return { skipped: true };
  await googleDriver().reply(db, review, body);
  db.prepare("UPDATE reviews SET reply = ?, reply_source = ?, replied_at = datetime('now'), state = ? WHERE id = ?")
    .run(body, source.startsWith('auto') ? source : 'human', source.startsWith('auto') ? 'auto_replied' : 'replied', reviewId);
  if (user) db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').run(user.id, 'review.reply', 'review', String(reviewId));
  return { ok: true };
}

// ———————————————————— سائقو Google ————————————————————

const mockStore = new Map(); // google_id -> review، يستخدمه وضع التجربة والاختبارات

export function mockAddReview(branchId, review) {
  mockStore.set(review.id, { ...review, branchId });
}

const drivers = {
  mock: {
    async fetch(db, branch) { return [...mockStore.values()].filter((r) => r.branchId === branch.id); },
    async reply() { return true; },
    async health() { return { ok: true, message: 'وضع التجربة: لا ترسل الردود إلى Google' }; },
  },
  api: {
    async token() {
      const { clientId, clientSecret, refreshToken } = config.google;
      if (!clientId || !clientSecret || !refreshToken) throw new Error('أكمل تفويض Google OAuth');
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error_description || 'انتهى تفويض Google');
      return d.access_token;
    },
    async fetch(db, branch) {
      if (!branch.google_location_id) return [];
      const at = await this.token();
      const out = [];
      let pageToken = '';
      for (let i = 0; i < 5; i++) {
        const url = `https://mybusiness.googleapis.com/v4/accounts/${config.google.accountId}/locations/${branch.google_location_id}/reviews?pageSize=50${pageToken ? '&pageToken=' + pageToken : ''}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(15000) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
        const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
        for (const v of d.reviews || []) {
          out.push({ id: v.reviewId, author: v.reviewer?.displayName, rating: stars[v.starRating] || 0, text: v.comment || '',
            createdAt: v.createTime, updatedAt: v.updateTime, existingReply: v.reviewReply?.comment });
        }
        if (d.averageRating != null) {
          db.prepare("UPDATE branches SET rating = ?, rating_count = ?, rating_updated_at = datetime('now') WHERE id = ?").run(d.averageRating, d.totalReviewCount, branch.id);
        }
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return out;
    },
    async reply(db, review, text) {
      const branch = db.prepare('SELECT google_location_id FROM branches WHERE id = ?').get(review.branch_id);
      const at = await this.token();
      const r = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${config.google.accountId}/locations/${branch.google_location_id}/reviews/${review.google_id}/reply`, {
        method: 'PUT', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: text }), signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message || `HTTP ${r.status}`); }
      return true;
    },
    async health() {
      try { await this.token(); return { ok: true, message: 'التفويض صالح' }; } catch (err) { return { ok: false, message: err.message }; }
    },
  },
};

export function googleDriver() { return drivers[config.google.driver] || drivers.mock; }

export async function syncReviews(db) {
  const branches = db.prepare('SELECT * FROM branches WHERE active = 1').all();
  let count = 0;
  try {
    for (const b of branches) {
      const list = await googleDriver().fetch(db, b);
      for (const r of list) { await ingestReview(db, b, r); count++; }
    }
    setIntegrationStatus(db, 'Google Business Profile', true, `آخر مزامنة: ${count} تقييم`);
  } catch (err) {
    setIntegrationStatus(db, 'Google Business Profile', false, err.message);
  }
  return count;
}

// سياسة التخزين المؤقت: لا يحتفظ بنص التقييم أكثر من 30 يومًا دون تحديث
export function purgeStaleReviewContent(db) {
  return db.prepare("UPDATE reviews SET text = NULL, author = NULL WHERE text IS NOT NULL AND fetched_at < datetime('now', '-30 days')").run().changes;
}

export function featuredReviews(db) {
  return db.prepare(`SELECT r.author, r.rating, r.text, r.review_time, b.name AS branch, b.slug AS branch_slug, b.google_review_url, b.maps_url
    FROM reviews r JOIN branches b ON b.id = r.branch_id WHERE r.featured = 1 AND r.text IS NOT NULL ORDER BY r.review_time DESC LIMIT 9`).all();
}

export { json, tx };
