// قسائم الإهداء الإلكترونية: شراء ودفع إلكتروني، تسليم بواتساب فورًا أو في موعد، واستخدام جزئي في أي فرع
import { config } from '../config.js';
import { fail } from '../http.js';
import { tx, getSetting, setSetting, sqlNow } from '../db.js';
import { code, token } from '../lib/ids.js';
import { normalizePhone } from './tickets.js';
import { trackEvent } from './events.js';
import { driver } from './whatsapp.js';
import { notifyRole } from './notify.js';
import { createCheckout, checkoutStatus, paymentDriver } from './payments.js';
import { giftPassChanged } from './applewallet.js';

export const DESIGNS = {
  general: { name: 'هدية لك', title: 'هدية لك', bg: '#084832', fg: '#F7F3EA', accent: '#FFBA1D' },
  eid: { name: 'عيد', title: 'عيدك مبارك', bg: '#0B6446', fg: '#F7F3EA', accent: '#FFBA1D' },
  wedding: { name: 'زواج', title: 'ألف مبروك', bg: '#F4EEDF', fg: '#3D3220', accent: '#B8913A' },
  baby: { name: 'مولود', title: 'مبروك المولود', bg: '#DCEFE6', fg: '#0B4A33', accent: '#E8A317' },
  graduation: { name: 'تخرج', title: 'مبروك التخرج', bg: '#063A28', fg: '#F7F3EA', accent: '#FFC72E' },
  thanks: { name: 'شكر', title: 'شكرًا لك', bg: '#FFBA1D', fg: '#063A28', accent: '#084832' },
};
export const ORDER_STATUS = { pending: 'بانتظار الدفع', paid: 'مدفوعة', failed: 'لم يكتمل الدفع', cancelled: 'ملغاة' };
const DEFAULTS = { amounts: [100, 200, 300, 500, 1000], min: 50, max: 3000, validityDays: 365 };
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const waOf = (phone) => `966${String(phone).slice(1)}`;
const fmt = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ريال`;

export const giftSalesEnabled = () => paymentDriver() !== 'mock' || !config.production;
export function giftSettings(db) { return { ...DEFAULTS, ...getSetting(db, 'giftcards', {}) }; }
export function saveGiftSettings(db, input) {
  const cur = giftSettings(db);
  const num = (v, lo, hi, f) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : f; };
  const min = num(input.min, 10, 5000, cur.min), max = num(input.max, min, 20000, cur.max);
  const amounts = Array.isArray(input.amounts) ? [...new Set(input.amounts.map(Number).filter((a) => a >= min && a <= max))].sort((a, b) => a - b).slice(0, 8) : cur.amounts;
  const next = { amounts: amounts.length ? amounts : cur.amounts, min, max, validityDays: Math.round(num(input.validityDays, 30, 1825, cur.validityDays)) };
  setSetting(db, 'giftcards', next);
  return next;
}

export const giftUrl = (card) => `${config.publicUrl}/gift-card/${card.token}`;
function newCode(db) {
  let c;
  do c = `GC${code(10)}`; while (db.prepare('SELECT 1 FROM gift_cards WHERE code = ?').get(c));
  return c;
}
export const prettyCode = (c) => String(c).replace(/^GC(\w{4})(\w{3})(\w{3})$/, 'GC-$1-$2-$3');
const cleanCode = (q) => String(q || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ——— الشراء ———
function validateOrder(db, input) {
  const st = giftSettings(db);
  const errors = {};
  const amount = r2(input.amount === 'custom' ? input.customAmount : input.amount);
  if (!(amount >= st.min && amount <= st.max)) errors.amount = `القيمة من ${st.min} إلى ${st.max} ريال`;
  const design = Object.hasOwn(DESIGNS, input.design) ? input.design : 'general';
  const buyer = normalizePhone(input.buyerPhone);
  if (!buyer) errors.buyerPhone = 'رقم جوالك مطلوب لنرسل لك القسيمة';
  const deliver = input.deliver === 'self' ? 'self' : 'wa';
  const recipient = normalizePhone(input.recipientPhone);
  if (deliver === 'wa' && !recipient) errors.recipientPhone = 'رقم جوال المُهدى إليه';
  let sendAt = null;
  if (deliver === 'wa' && input.when === 'later') {
    const t = new Date(`${input.sendDate}T${input.sendTime || '09:00'}:00+03:00`);
    if (Number.isNaN(t.getTime()) || t < new Date(Date.now() - 60_000) || t > new Date(Date.now() + 90 * 86400_000)) errors.sendDate = 'اختر موعدًا خلال 90 يومًا';
    else sendAt = sqlNow(t);
  }
  if (!(input.terms === 'on' || input.terms === true || input.terms === '1')) errors.terms = 'الموافقة على الشروط مطلوبة';
  if (Object.keys(errors).length) fail(400, 'راجع الحقول المظللة', errors);
  const clip = (v, n) => String(v || '').trim().slice(0, n) || null;
  return { amount, design, buyer, deliver, recipient: deliver === 'wa' ? recipient : normalizePhone(input.recipientPhone) || null, sendAt,
    sender: clip(input.senderName, 40), recipientName: clip(input.recipientName, 40), message: clip(input.message, 240) };
}

export async function startGiftOrder(db, input) {
  if (!giftSalesEnabled()) fail(503, 'بيع القسائم غير متاح حاليًا');
  const o = validateOrder(db, input);
  const key = token(18);
  const id = Number(db.prepare(`INSERT INTO gift_orders (key, amount, design, sender_name, recipient_name, recipient_phone, buyer_phone, message, deliver, send_at, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key, o.amount, o.design, o.sender, o.recipientName, o.recipient, o.buyer, o.message, o.deliver, o.sendAt, paymentDriver()).lastInsertRowid);
  const co = await createCheckout({
    amount: o.amount, description: `قسيمة إهداء ماك سنتر ${o.amount} ريال`,
    returnUrl: `${config.publicUrl}/gift-cards/return/${key}`, callbackUrl: `${config.publicUrl}/api/webhooks/payments`, metadata: { gift_order: key },
  });
  db.prepare('UPDATE gift_orders SET provider_id = ? WHERE id = ?').run(co.id, id);
  trackEvent(db, 'gift_checkout', { ref: String(o.amount) });
  return { key, url: co.url };
}

// يُستدعى من رابط العودة وإشعار البوابة والمراجعة الدورية؛ آمن للتكرار
export async function settleOrder(db, key) {
  const o = db.prepare('SELECT * FROM gift_orders WHERE key = ?').get(key);
  if (!o) return null;
  if (o.status !== 'pending' || !o.provider_id) return o;
  const s = await checkoutStatus(o.provider_id);
  if (s.status === 'failed') { db.prepare("UPDATE gift_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(o.id); return { ...o, status: 'failed' }; }
  if (s.status !== 'paid') return o;
  if (Math.abs(s.amount - o.amount) > 0.009 || (s.currency && s.currency !== 'SAR')) {
    console.error('gift order amount mismatch', o.key, s);
    notifyRole(db, ['admin'], null, { kind: 'integration', title: `دفع قسيمة بمبلغ غير مطابق (${o.key.slice(0, 6)})`, link: '#/giftcards' });
    return o;
  }
  const card = tx(db, () => {
    const fresh = db.prepare('SELECT status FROM gift_orders WHERE id = ?').get(o.id);
    if (fresh.status !== 'pending') return null;
    const c = issueCard(db, { amount: o.amount, design: o.design, sender: o.sender_name, recipientName: o.recipient_name, recipient: o.recipient_phone, message: o.message, orderId: o.id, sendAt: o.send_at });
    db.prepare("UPDATE gift_orders SET status = 'paid', paid_at = datetime('now'), card_id = ? WHERE id = ?").run(c.id, o.id);
    return c;
  });
  if (card) {
    trackEvent(db, 'gift_paid', { ref: String(o.amount) });
    notifyRole(db, ['admin', 'marketing'], null, { kind: 'gift', title: `بيعت قسيمة إهداء بقيمة ${o.amount} ريال`, link: '#/giftcards' });
    const link = giftUrl(card);
    waSend(o.buyer_phone, [`شكرًا لك! تم شراء قسيمة إهداء ماك سنتر بقيمة ${fmt(o.amount)} ✓`,
      o.deliver === 'wa' ? (o.send_at ? `سنرسلها إلى ${o.recipient_name || 'المُهدى إليه'} في الموعد الذي اخترته.` : `أرسلناها الآن إلى ${o.recipient_name || 'المُهدى إليه'} على واتساب.`) : 'شارك الرابط التالي مع من تهديه:',
      link].join('\n'));
    if (o.deliver === 'wa' && !o.send_at) deliverCard(db, card.id);
  }
  return db.prepare('SELECT * FROM gift_orders WHERE id = ?').get(o.id);
}

function issueCard(db, { amount, design, sender, recipientName, recipient, message, orderId = null, sendAt = null, source = 'online', branchId = null, userId = null }) {
  const days = giftSettings(db).validityDays;
  const r = db.prepare(`INSERT INTO gift_cards (code, token, order_id, amount, balance, design, sender_name, recipient_name, recipient_phone, message, source, branch_id, send_at, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newCode(db), token(18), orderId, amount, amount, design, sender, recipientName, recipient, message, source, branchId, sendAt,
    sqlNow(new Date(Date.now() + days * 86400_000)), userId);
  const id = Number(r.lastInsertRowid);
  db.prepare("INSERT INTO gift_txns (card_id, kind, amount, branch_id, user_id) VALUES (?, 'issue', ?, ?, ?)").run(id, amount, branchId, userId);
  return db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(id);
}

// إصدار من الفرع (بيع نقدي أو تعويض)
export function issueAtBranch(db, user, scope, input) {
  const st = giftSettings(db);
  const amount = r2(input.amount);
  if (!(amount >= st.min && amount <= st.max)) fail(400, `القيمة من ${st.min} إلى ${st.max} ريال`, { amount: 'غير صحيحة' });
  const branchId = Number(input.branchId);
  if (!db.prepare('SELECT 1 FROM branches WHERE id = ?').get(branchId)) fail(400, 'اختر الفرع', { branchId: 'مطلوب' });
  if (scope && !scope.includes(branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  const recipient = input.recipientPhone ? normalizePhone(input.recipientPhone) : null;
  if (input.recipientPhone && !recipient) fail(400, 'رقم الجوال غير صحيح', { recipientPhone: 'غير صحيح' });
  const card = tx(db, () => issueCard(db, { amount, design: Object.hasOwn(DESIGNS, input.design) ? input.design : 'general', sender: String(input.senderName || '').slice(0, 40) || null,
    recipientName: String(input.recipientName || '').slice(0, 40) || null, recipient, message: String(input.message || '').slice(0, 240) || null, source: 'branch', branchId, userId: user.id }));
  if (recipient) deliverCard(db, card.id);
  return { ...cardView(db, card), url: giftUrl(card) };
}

export function deliverCard(db, cardId) {
  const c = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(cardId);
  if (!c || c.delivered_at || !c.recipient_phone || c.status !== 'active') return false;
  db.prepare("UPDATE gift_cards SET delivered_at = datetime('now') WHERE id = ?").run(c.id);
  waSend(c.recipient_phone, [`🎁 ${c.recipient_name ? `${c.recipient_name}، ` : ''}${c.sender_name || 'شخص يحبك'} أهداك قسيمة ماك سنتر بقيمة ${fmt(c.amount)}`,
    c.message ? `«${c.message}»` : null, `افتح هديتك: ${giftUrl(c)}`, 'تُستخدم في جميع فروع ماك سنتر وعلى دفعات.'].filter(Boolean).join('\n'));
  return true;
}
export function deliverDue(db) {
  const due = db.prepare("SELECT id FROM gift_cards WHERE delivered_at IS NULL AND recipient_phone IS NOT NULL AND status = 'active' AND send_at IS NOT NULL AND send_at <= ?").all(sqlNow());
  for (const c of due) deliverCard(db, c.id);
  return due.length;
}
// طلبات بقيت معلقة (أُغلق المتصفح قبل العودة، أو تأخر إشعار البوابة)
export async function reconcile(db) {
  const rows = db.prepare("SELECT key FROM gift_orders WHERE status = 'pending' AND provider_id IS NOT NULL AND created_at < datetime('now','-2 minutes') AND created_at > datetime('now','-3 days')").all();
  for (const r of rows) await settleOrder(db, r.key).catch((e) => console.error('gift reconcile', e.message));
  db.prepare("UPDATE gift_orders SET status = 'failed' WHERE status = 'pending' AND created_at <= datetime('now','-3 days')").run();
}

// ——— الاستخدام في الفرع ———
export function findCard(db, q) {
  const c = cleanCode(q);
  return /^GC[A-Z0-9]{10}$/.test(c) ? db.prepare('SELECT * FROM gift_cards WHERE code = ?').get(c) : null;
}
export function cardView(db, c) {
  const expired = c.expires_at < sqlNow();
  return {
    id: c.id, code: prettyCode(c.code), amount: c.amount, balance: c.balance, design: c.design, sender: c.sender_name, recipientName: c.recipient_name,
    recipientPhone: c.recipient_phone, message: c.message, status: c.status, expired, usable: c.status === 'active' && !expired && c.balance > 0,
    expiresAt: c.expires_at, deliveredAt: c.delivered_at, sendAt: c.send_at, source: c.source, createdAt: c.created_at,
    txns: db.prepare('SELECT t.*, b.short_name branch FROM gift_txns t LEFT JOIN branches b ON b.id = t.branch_id WHERE card_id = ? ORDER BY t.id DESC').all(c.id),
  };
}
export function redeem(db, user, scope, cardId, input) {
  const branchId = Number(input.branchId);
  if (scope && !scope.includes(branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  if (!db.prepare('SELECT 1 FROM branches WHERE id = ?').get(branchId)) fail(400, 'اختر الفرع', { branchId: 'مطلوب' });
  const amount = r2(input.amount);
  const ref = String(input.ref || '').trim().slice(0, 40) || null;
  const out = tx(db, () => {
    const c = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(cardId);
    if (!c) fail(404, 'القسيمة غير موجودة');
    if (c.status !== 'active') fail(400, 'القسيمة ملغاة');
    if (c.expires_at < sqlNow()) fail(400, 'انتهت صلاحية القسيمة');
    if (!(amount > 0)) fail(400, 'أدخل المبلغ', { amount: 'مطلوب' });
    if (amount > c.balance + 0.001) fail(400, `الرصيد المتاح ${c.balance} ريال فقط`, { amount: 'أكبر من الرصيد' });
    db.prepare('UPDATE gift_cards SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(amount, c.id);
    db.prepare("INSERT INTO gift_txns (card_id, kind, amount, branch_id, ref, user_id) VALUES (?, 'redeem', ?, ?, ?, ?)").run(c.id, -amount, branchId, ref, user.id);
    return db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(c.id);
  });
  giftPassChanged(db, out.id);
  if (out.recipient_phone) waSend(out.recipient_phone, `استخدمت ${fmt(amount)} من قسيمة ماك سنتر.\nالرصيد المتبقي: ${fmt(out.balance)}\n${giftUrl(out)}`);
  return cardView(db, out);
}
export function cancelCard(db, user, cardId, reason) {
  const c = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(cardId);
  if (!c) fail(404, 'القسيمة غير موجودة');
  if (c.status !== 'active') fail(400, 'ملغاة من قبل');
  if (!String(reason || '').trim()) fail(400, 'اكتب سبب الإلغاء', { reason: 'مطلوب' });
  tx(db, () => {
    db.prepare("UPDATE gift_cards SET status = 'cancelled' WHERE id = ?").run(c.id);
    db.prepare("INSERT INTO gift_txns (card_id, kind, amount, ref, user_id) VALUES (?, 'cancel', ?, ?, ?)").run(c.id, -c.balance, String(reason).slice(0, 80), user.id);
  });
  giftPassChanged(db, c.id);
  return cardView(db, db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(c.id));
}

// ——— اللوحة ———
export function giftList(db, { q = '', status = '' } = {}) {
  const s = String(q).trim();
  const code = cleanCode(s), phone = normalizePhone(s);
  const rows = db.prepare(`SELECT c.*, o.buyer_phone FROM gift_cards c LEFT JOIN gift_orders o ON o.id = c.order_id ORDER BY c.id DESC LIMIT 300`).all()
    .filter((c) => (!s || c.code.includes(code) || (phone && (c.recipient_phone === phone || c.buyer_phone === phone)))
      && (!status || (status === 'active' ? c.status === 'active' && c.balance > 0 : status === 'used' ? c.balance <= 0 : c.status === status)));
  const t = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) sold, COALESCE(SUM(CASE WHEN status = 'active' AND expires_at > ? THEN balance ELSE 0 END),0) outstanding FROM gift_cards`).get(sqlNow());
  const redeemed = -db.prepare("SELECT COALESCE(SUM(amount),0) s FROM gift_txns WHERE kind = 'redeem'").get().s;
  const pending = db.prepare("SELECT COUNT(*) n FROM gift_orders WHERE status = 'pending'").get().n;
  return { items: rows.map((c) => ({ id: c.id, code: prettyCode(c.code), amount: c.amount, balance: c.balance, design: c.design, recipientName: c.recipient_name, recipientPhone: c.recipient_phone,
    buyerPhone: c.buyer_phone, status: c.status, expired: c.expires_at < sqlNow(), source: c.source, sendAt: c.send_at, deliveredAt: c.delivered_at, createdAt: c.created_at })),
  totals: { count: t.n, sold: r2(t.sold), outstanding: r2(t.outstanding), redeemed: r2(redeemed), pendingOrders: pending } };
}

function waSend(phone, text) {
  if (!phone) return;
  Promise.resolve().then(() => driver().send({ to: waOf(phone), text })).catch((e) => console.error('gift whatsapp', e.message));
}
