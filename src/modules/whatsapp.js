import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { json, tx, sqlNow } from '../db.js';
import { code, token, safeEqual, signedUrlToken } from '../lib/ids.js';
import { fail } from '../http.js';
import { CONSENT_TEXT, CONSENT_VERSION, waLink } from './catalog.js';
import { trackEvent } from './events.js';
import * as WQ from './waqr.js';

const INTENT_TTL_MIN = 30;
const STOP_RE = /^\s*(إيقاف|ايقاف|أوقف|اوقف|إلغاء الاشتراك|الغاء الاشتراك|stop|unsubscribe)\s*$/i;
const LINK_RE = /MC-([A-Z2-9]{6})/;

// ———————————————————— السائقون ————————————————————

export class TemporaryError extends Error {}

const mockOutbox = [];
export function mockMessages() { return mockOutbox.slice(-50).reverse(); }

const drivers = {
  mock: {
    name: 'mock',
    async send(payload) {
      const id = `wamid.mock.${token(12)}`;
      mockOutbox.push({ id, at: new Date().toISOString(), ...payload });
      if (mockOutbox.length > 500) mockOutbox.shift();
      return { id };
    },
    async health() { return { ok: true, message: 'وضع التجربة: الرسائل لا تغادر النظام' }; },
  },
  cloud: {
    name: 'cloud',
    async send(payload) {
      const { phoneNumberId, token: accessToken, graphVersion } = config.whatsapp;
      if (!phoneNumberId || !accessToken) throw new Error('بيانات WhatsApp Cloud API غير مكتملة');
      const body = { messaging_product: 'whatsapp', to: payload.to };
      if (payload.template) {
        body.type = 'template';
        body.template = { name: payload.template, language: { code: payload.language || 'ar' }, components: payload.components || [] };
      } else {
        body.type = 'text';
        body.text = { body: payload.text, preview_url: true };
      }
      let res;
      try {
        res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        // انقطاع الشبكة: النتيجة غامضة، لا نعيد الإرسال تلقائيًا قبل التحقق
        throw new TemporaryError(`تعذر الوصول إلى منصة واتساب: ${err.message}`);
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status >= 500) throw new TemporaryError(data?.error?.message || `HTTP ${res.status}`);
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return { id: data.messages?.[0]?.id };
    },
    async health() {
      const { phoneNumberId, token: accessToken, graphVersion } = config.whatsapp;
      if (!phoneNumberId || !accessToken) return { ok: false, message: 'أكمل إعداد مفاتيح WhatsApp Cloud API' };
      try {
        const r = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=display_phone_number,quality_rating`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000),
        });
        const d = await r.json();
        return r.ok ? { ok: true, message: `متصل: ${d.display_phone_number} · الجودة ${d.quality_rating || '—'}` } : { ok: false, message: d?.error?.message || 'فشل التحقق' };
      } catch (err) { return { ok: false, message: err.message }; }
    },
  },
};

// ناقل QR: القوالب الرسمية غير متاحة فيه، فتحول إلى نص عادي من متغيراتها
function templateText(payload) {
  const params = (payload.components || []).flatMap((c) => c.parameters || []).map((p) => p.text).filter(Boolean);
  if (payload.text) return payload.text;
  const [title, link, ...rest] = params;
  return [title && `🛍️ ${title}`, ...rest, link && `التفاصيل: ${link}`, 'لإيقاف الرسائل أرسل: إيقاف'].filter(Boolean).join('\n');
}
drivers.qr = {
  name: 'qr',
  async send(payload) {
    if (!WQ.isOpen()) throw new TemporaryError('رقم واتساب المربوط بـ QR غير متصل');
    const r = WQ.send(payload.to, payload.template ? templateText(payload) : payload.text);
    if (!r) throw new TemporaryError('رقم واتساب المربوط بـ QR غير متصل');
    return r;
  },
  async health() {
    const s = WQ.status();
    return s.status === 'open' ? { ok: true, message: `مربوط بمسح QR: +${s.me}` } : { ok: false, message: 'اربط الرقم بمسح QR من صفحة الربط' };
  },
};

// الرقم الذي يراسله العملاء: رقم QR المربوط حين يكون هو الناقل، وإلا WHATSAPP_PHONE_NUMBER
export function sendingNumber() {
  return (config.whatsapp.driver === 'qr' && WQ.linkedNumber()) || config.whatsapp.phone;
}

export function driver() {
  return drivers[config.whatsapp.driver] || drivers.mock;
}

export async function sendText(db, contact, text) {
  const r = await driver().send({ to: contact.wa_id, text });
  return r;
}

// ———————————————————— الاشتراك ————————————————————

export function startSubscription(db, input, { publicUrl }) {
  const branchIds = toIds(input.branches);
  const sectionIds = toIds(input.sections);
  const errors = {};
  const validBranches = db.prepare('SELECT id, name FROM branches WHERE active = 1').all();
  const validSections = db.prepare('SELECT id, name FROM sections WHERE active = 1').all();
  const branches = validBranches.filter((b) => branchIds.includes(b.id));
  const sections = validSections.filter((s) => sectionIds.includes(s.id));
  if (!branches.length) errors.branches = 'اختر فرعًا واحدًا على الأقل';
  if (!sections.length) errors.sections = 'اختر قسمًا واحدًا على الأقل';
  if (!(input.consent === true || input.consent === 'on' || input.consent === '1')) errors.consent = 'الموافقة مطلوبة لإتمام الاشتراك';
  if (Object.keys(errors).length) fail(400, 'أكمل اختياراتك', errors);

  const name = String(input.name || '').trim().slice(0, 60) || null;
  const qr = input.qr ? String(input.qr).slice(0, 20) : null;
  let link;
  for (let i = 0; i < 5; i++) {
    link = code(6);
    if (!db.prepare('SELECT 1 FROM subscription_intents WHERE token = ?').get(link)) break;
  }
  const statusKey = token(18);
  const expires = new Date(Date.now() + INTENT_TTL_MIN * 60000);
  db.prepare(`INSERT INTO subscription_intents (token, status_key, branch_ids, section_ids, name, qr_code, status, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'awaiting', ?)`).run(link, statusKey, JSON.stringify(branches.map((b) => b.id)),
    JSON.stringify(sections.map((s) => s.id)), name, qr, sqlNow(expires));
  trackEvent(db, 'subscribe_start', { branchId: branches[0].id, qr });

  const text = [
    'أرغب في الاشتراك بعروض ماك سنتر',
    `الفروع: ${branches.map((b) => b.name).join('، ')}`,
    `الأقسام: ${sections.map((s) => s.name).join('، ')}`,
    name ? `الاسم: ${name}` : null,
    CONSENT_TEXT,
    `رمز الربط: MC-${link}`,
  ].filter(Boolean).join('\n');
  return { statusKey, waUrl: waLink(sendingNumber(), text), statusUrl: `${publicUrl}/subscribe/status/${statusKey}`, expiresAt: expires.toISOString() };
}

export function intentStatus(db, statusKey) {
  const row = db.prepare('SELECT * FROM subscription_intents WHERE status_key = ?').get(statusKey);
  if (!row) return null;
  if (row.status === 'awaiting' && row.expires_at < sqlNow()) {
    db.prepare("UPDATE subscription_intents SET status = 'expired' WHERE id = ?").run(row.id);
    row.status = 'expired';
  }
  return { status: row.status, branchIds: json.parse(row.branch_ids, []), sectionIds: json.parse(row.section_ids, []) };
}

function toIds(v) {
  const arr = Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',');
  return [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

export function preferencesUrl(contactId) {
  return `${config.publicUrl}/preferences/${signedUrlToken(`c${contactId}`, 60 * 60 * 24 * 30)}`;
}

function welcomeText(db, sub, contactId) {
  const b = db.prepare(`SELECT name FROM branches WHERE id IN (${sub.branchIds.map(() => '?').join(',')})`).all(...sub.branchIds);
  const s = db.prepare(`SELECT name FROM sections WHERE id IN (${sub.sectionIds.map(() => '?').join(',')})`).all(...sub.sectionIds);
  return [
    'أهلًا بك في عروض ماك سنتر 🛒',
    `تم تفعيل اشتراكك في: ${b.map((x) => x.name).join('، ')}`,
    `الأقسام: ${s.map((x) => x.name).join('، ')}`,
    '',
    `لتعديل اهتماماتك: ${preferencesUrl(contactId)}`,
    'ولإيقاف الرسائل في أي وقت أرسل: إيقاف',
  ].join('\n');
}

// ———————————————————— الأحداث الواردة ————————————————————

export function verifySignature(rawBody, header) {
  const secret = config.whatsapp.appSecret;
  if (!secret) return !config.production && config.whatsapp.driver === 'mock';
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, String(header || ''));
}

// يحفظ كل حدث قبل معالجته؛ الحدث المكرر يتجاهل
export async function handleWebhook(db, payload) {
  const results = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const msg of v.messages || []) {
        const contactName = v.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
        if (!recordEvent(db, `msg:${msg.id}`, msg)) continue;
        results.push(await handleInbound(db, { waId: msg.from, text: msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '', name: contactName, eventKey: `msg:${msg.id}` }));
      }
      for (const st of v.statuses || []) {
        if (!recordEvent(db, `st:${st.id}:${st.status}`, st)) continue;
        applyStatus(db, st);
        markProcessed(db, `st:${st.id}:${st.status}`);
      }
    }
  }
  return results;
}

function recordEvent(db, externalId, payload) {
  const r = db.prepare('INSERT OR IGNORE INTO webhook_events (provider, external_id, payload) VALUES (?, ?, ?)')
    .run('whatsapp', externalId, JSON.stringify(payload));
  return r.changes > 0;
}

function markProcessed(db, externalId, error = null) {
  db.prepare("UPDATE webhook_events SET processed_at = datetime('now'), error = ? WHERE provider = 'whatsapp' AND external_id = ?").run(error, externalId);
}

const STATUS_ORDER = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };

function applyStatus(db, st) {
  const msg = db.prepare('SELECT * FROM messages WHERE provider_id = ?').get(st.id);
  if (!msg) return;
  if (st.status === 'failed') {
    const reason = st.errors?.[0]?.title || st.errors?.[0]?.message || 'فشل التسليم';
    db.prepare("UPDATE messages SET status = 'failed', reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason, msg.id);
    return;
  }
  if ((STATUS_ORDER[st.status] ?? -1) > (STATUS_ORDER[msg.status] ?? 99)) {
    db.prepare("UPDATE messages SET status = ?, updated_at = datetime('now') WHERE id = ?").run(st.status, msg.id);
  }
}

export async function handleInbound(db, { waId, text, name, eventKey }) {
  const wa = String(waId).replace(/\D/g, '');
  const contact = upsertContact(db, wa, name);
  let reply = null, outcome = 'message';

  const link = LINK_RE.exec(String(text).toUpperCase());
  const sub = db.prepare('SELECT status FROM subscriptions WHERE contact_id = ?').get(contact.id);
  if (/^\s*(إعدادات|اعدادات|تعديل)\s*$/.test(text) && sub?.status === 'active') {
    reply = `لتعديل الفروع والأقسام أو إيقاف الرسائل: ${preferencesUrl(contact.id)}`;
    outcome = 'preferences';
  } else if (STOP_RE.test(text)) {
    stopSubscription(db, contact.id, 'whatsapp');
    reply = 'تم إيقاف رسائل العروض. يمكنك الاشتراك مجددًا في أي وقت من موقع ماك سنتر.';
    outcome = 'stopped';
  } else if (link) {
    const intent = db.prepare('SELECT * FROM subscription_intents WHERE token = ?').get(link[1]);
    if (!intent || intent.status === 'expired' || (intent.status === 'awaiting' && intent.expires_at < sqlNow())) {
      if (intent) db.prepare("UPDATE subscription_intents SET status = 'expired' WHERE id = ?").run(intent.id);
      reply = 'انتهت صلاحية رمز الاشتراك. افتح صفحة الاشتراك من جديد وأرسل الرسالة الجديدة.';
      outcome = 'expired';
    } else if (intent.status === 'confirmed' && intent.contact_id !== contact.id) {
      reply = 'هذا الرمز استخدم من قبل. افتح صفحة الاشتراك من جديد.';
      outcome = 'reused';
    } else {
      const sub = confirmSubscription(db, contact, intent);
      reply = welcomeText(db, sub, contact.id);
      outcome = 'subscribed';
    }
  }

  if (eventKey) markProcessed(db, eventKey);
  if (reply) {
    try { await sendText(db, contact, reply); } catch (err) { console.error('whatsapp reply failed', err.message); }
  }
  return { contactId: contact.id, outcome };
}

function upsertContact(db, waId, name) {
  db.prepare(`INSERT INTO contacts (wa_id, name, last_inbound_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(wa_id) DO UPDATE SET last_inbound_at = datetime('now'), name = COALESCE(contacts.name, excluded.name)`).run(waId, name || null);
  return db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(waId);
}

export function confirmSubscription(db, contact, intent) {
  return tx(db, () => {
    const branchIds = json.parse(intent.branch_ids, []);
    const sectionIds = json.parse(intent.section_ids, []);
    const existing = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(contact.id);
    let merged;
    if (existing && existing.status === 'active') {
      merged = {
        branchIds: [...new Set([...json.parse(existing.branch_ids, []), ...branchIds])],
        sectionIds: [...new Set([...json.parse(existing.section_ids, []), ...sectionIds])],
      };
    } else merged = { branchIds, sectionIds };
    db.prepare(`INSERT INTO subscriptions (contact_id, status, branch_ids, section_ids, consent_text, consent_version, consent_at, source_qr, updated_at)
      VALUES (?, 'active', ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
      ON CONFLICT(contact_id) DO UPDATE SET status='active', branch_ids=excluded.branch_ids, section_ids=excluded.section_ids,
        consent_text=excluded.consent_text, consent_version=excluded.consent_version, consent_at=excluded.consent_at,
        source_qr=COALESCE(subscriptions.source_qr, excluded.source_qr), stopped_at=NULL, updated_at=datetime('now')`)
      .run(contact.id, JSON.stringify(merged.branchIds), JSON.stringify(merged.sectionIds), CONSENT_TEXT, CONSENT_VERSION, intent.qr_code);
    if (intent.name && !contact.name) db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(intent.name, contact.id);
    db.prepare("UPDATE subscription_intents SET status = 'confirmed', contact_id = ? WHERE id = ?").run(contact.id, intent.id);
    db.prepare('INSERT INTO subscription_events (contact_id, kind, source, detail) VALUES (?, ?, ?, ?)')
      .run(contact.id, existing ? 'updated' : 'subscribed', intent.qr_code || 'web', JSON.stringify({ branchIds, sectionIds, consentVersion: CONSENT_VERSION }));
    trackEvent(db, 'subscribe_confirmed', { branchId: branchIds[0], qr: intent.qr_code });
    return merged;
  });
}

// الإيقاف يطبق فورًا ويستبعد كل الرسائل المنتظرة
export function stopSubscription(db, contactId, source, { branchIds, sectionIds } = {}) {
  return tx(db, () => {
    const sub = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(contactId);
    if (!sub) return null;
    const partial = (branchIds && branchIds.length) || (sectionIds && sectionIds.length);
    if (partial) {
      const b = json.parse(sub.branch_ids, []).filter((x) => !(branchIds || []).includes(x));
      const s = json.parse(sub.section_ids, []).filter((x) => !(sectionIds || []).includes(x));
      if (b.length && s.length) {
        db.prepare("UPDATE subscriptions SET branch_ids = ?, section_ids = ?, updated_at = datetime('now') WHERE contact_id = ?")
          .run(JSON.stringify(b), JSON.stringify(s), contactId);
        db.prepare('INSERT INTO subscription_events (contact_id, kind, source, detail) VALUES (?, ?, ?, ?)')
          .run(contactId, 'narrowed', source, JSON.stringify({ branchIds, sectionIds }));
        excludeIneligibleQueued(db, contactId);
        return 'narrowed';
      }
    }
    db.prepare("UPDATE subscriptions SET status = 'stopped', stopped_at = datetime('now'), updated_at = datetime('now') WHERE contact_id = ?").run(contactId);
    db.prepare("UPDATE messages SET status = 'excluded', reason = 'أوقف العميل الاشتراك', updated_at = datetime('now') WHERE contact_id = ? AND status IN ('queued')")
      .run(contactId);
    db.prepare('INSERT INTO subscription_events (contact_id, kind, source) VALUES (?, ?, ?)').run(contactId, 'stopped', source);
    trackEvent(db, 'unsubscribe', {});
    return 'stopped';
  });
}

export function updatePreferences(db, contactId, { branchIds, sectionIds }, source = 'preferences') {
  const b = toIds(branchIds), s = toIds(sectionIds);
  if (!b.length || !s.length) return stopSubscription(db, contactId, source);
  db.prepare("UPDATE subscriptions SET branch_ids = ?, section_ids = ?, updated_at = datetime('now') WHERE contact_id = ? AND status = 'active'")
    .run(JSON.stringify(b), JSON.stringify(s), contactId);
  db.prepare('INSERT INTO subscription_events (contact_id, kind, source, detail) VALUES (?, ?, ?, ?)')
    .run(contactId, 'updated', source, JSON.stringify({ branchIds: b, sectionIds: s }));
  excludeIneligibleQueued(db, contactId);
  return 'updated';
}

// الرسائل المنتظرة التي لم تعد تطابق الاهتمامات تستبعد قبل الإرسال
function excludeIneligibleQueued(db, contactId) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE contact_id = ?').get(contactId);
  const b = json.parse(sub.branch_ids, []), s = json.parse(sub.section_ids, []);
  const queued = db.prepare(`SELECT m.id, o.branch_ids, o.section_ids FROM messages m JOIN campaigns c ON c.id = m.campaign_id
    LEFT JOIN offers o ON o.id = c.offer_id WHERE m.contact_id = ? AND m.status = 'queued'`).all(contactId);
  for (const q of queued) {
    if (!q.branch_ids) continue;
    const ob = json.parse(q.branch_ids, []), os = json.parse(q.section_ids, []);
    const match = ob.some((x) => b.includes(x)) && (os.length === 0 || os.some((x) => s.includes(x)));
    if (!match) db.prepare("UPDATE messages SET status='excluded', reason='لم يعد ضمن اهتمامات العميل', updated_at=datetime('now') WHERE id = ?").run(q.id);
  }
}
