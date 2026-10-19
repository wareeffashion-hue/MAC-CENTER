// MAC+‎: عضوية ماك سنتر — العميل المعروف، خطوط العربة، المحفظة، الإحالة، الحجز والاستلام، الإطلالات والضمانات
import { randomInt } from 'node:crypto';
import { fail } from '../http.js';
import { tx, json, sqlNow, getSetting, setSetting } from '../db.js';
import { code, token, signedUrlToken } from '../lib/ids.js';
import { config } from '../config.js';
import { normalizePhone } from './tickets.js';
import { trackEvent } from './events.js';
import { driver, sendingNumber } from './whatsapp.js';
import { notifyRole } from './notify.js';
import { waLink } from './catalog.js';

export const PLUS_CONSENT = 'أوافق على تسجيل رقمي في عضوية MAC+‎ واستلام رسائل الرصيد والعروض من ماك سنتر عبر واتساب، ويمكنني الإيقاف في أي وقت.';
export const REQUEST_KIND = { reserve: 'حجز قطعة أو مقاس', collect: 'اطلب واستلم', find: 'لقيناه لك' };
export const REQUEST_STATUS = { new: 'جديد', confirmed: 'محجوز', ready: 'جاهز للاستلام', found: 'وجدناه', done: 'مكتمل', cancelled: 'ملغى', expired: 'انتهت المهلة' };
export const OCCASIONS = { wedding: 'زواج', eid: 'عيد', graduation: 'تخرج', party: 'حفلة ومناسبة عائلية', school: 'أول يوم مدرسة' };
export const AUDIENCES = { women: 'نساء', girls: 'بنات', boys: 'أولاد', men: 'رجال' };
export const WALLET_KIND = { tier: 'خطوط العربة', referral: 'مكافأة دعوة', welcome: 'هدية انضمام', price: 'ضمان السعر', adjust: 'تعديل يدوي', redeem: 'استخدام', expire: 'انتهاء صلاحية' };
const OPEN = ['new', 'confirmed', 'ready', 'found'];
const PLUS_RE = /MP-([A-Z2-9]{6})/;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const days = (n) => new Date(Date.now() + n * 86400000);
const hours = (n) => new Date(Date.now() + n * 3600000);
const waOf = (phone) => `966${String(phone).slice(1)}`;
const phoneFromWa = (wa) => { const d = String(wa).replace(/\D/g, ''); return d.startsWith('966') ? `0${d.slice(3)}` : normalizePhone(d) || null; };

// ——— الإعدادات ———
const DEFAULTS = {
  tiers: [{ min: 2, pct: 2 }, { min: 4, pct: 3 }, { min: 6, pct: 5 }],
  rewardMode: 'discount', walletDays: 60,
  referral: { newAmount: 20, referrerAmount: 20, minInvoice: 200, monthlyCap: 10, welcomeDays: 30 },
  price: { days: 7, cap: 100 }, sizeDays: 14, giftDays: 30, holdHours: 2, maxOpen: 3, controlPct: 0,
};
export function plusSettings(db) {
  const s = getSetting(db, 'plus', {});
  return { ...DEFAULTS, ...s, referral: { ...DEFAULTS.referral, ...(s.referral || {}) }, price: { ...DEFAULTS.price, ...(s.price || {}) } };
}
export function savePlusSettings(db, input) {
  const cur = plusSettings(db);
  const num = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : f; };
  const tiers = Array.isArray(input.tiers) ? input.tiers.map((t) => ({ min: Math.round(num(t.min, 1, 20, 0)), pct: num(t.pct, 0, 30, -1) })).filter((t) => t.min > 0 && t.pct >= 0).sort((a, b) => a.min - b.min) : cur.tiers;
  if (!tiers.length) fail(400, 'حدد مستوى واحدًا على الأقل لخطوط العربة', { tiers: 'مطلوب' });
  const next = {
    tiers,
    rewardMode: input.rewardMode === 'wallet' ? 'wallet' : input.rewardMode === 'discount' ? 'discount' : cur.rewardMode,
    walletDays: Math.round(num(input.walletDays, 7, 365, cur.walletDays)),
    referral: {
      newAmount: num(input.referral?.newAmount, 0, 500, cur.referral.newAmount), referrerAmount: num(input.referral?.referrerAmount, 0, 500, cur.referral.referrerAmount),
      minInvoice: num(input.referral?.minInvoice, 0, 5000, cur.referral.minInvoice), monthlyCap: Math.round(num(input.referral?.monthlyCap, 0, 100, cur.referral.monthlyCap)),
      welcomeDays: Math.round(num(input.referral?.welcomeDays, 7, 180, cur.referral.welcomeDays)),
    },
    price: { days: Math.round(num(input.price?.days, 0, 30, cur.price.days)), cap: num(input.price?.cap, 0, 1000, cur.price.cap) },
    sizeDays: Math.round(num(input.sizeDays, 0, 60, cur.sizeDays)), giftDays: Math.round(num(input.giftDays, 0, 90, cur.giftDays)),
    holdHours: num(input.holdHours, 0.5, 48, cur.holdHours), maxOpen: Math.round(num(input.maxOpen, 1, 10, cur.maxOpen)),
    controlPct: Math.round(num(input.controlPct, 0, 50, cur.controlPct)),
  };
  setSetting(db, 'plus', next);
  return next;
}
export const tierFor = (count, tiers) => [...tiers].reverse().find((t) => count >= t.min)?.pct || 0;

// ——— الأعضاء ———
function phoneOrFail(v) {
  const p = normalizePhone(v);
  if (!p) fail(400, 'رقم الجوال غير صحيح', { phone: 'رقم سعودي يبدأ بـ 05' });
  return p;
}
export const cardUrl = (memberId) => `${config.publicUrl}/plus/card/${signedUrlToken(`m${memberId}`, 60 * 60 * 24 * 365)}`;
export const referralUrl = (refCode) => `${config.publicUrl}/plus?ref=${refCode}`;

export function createMember(db, { phone, name, branchId, refCode, consent, source = 'cashier', userId = null }) {
  const p = phoneOrFail(phone);
  const existing = db.prepare('SELECT * FROM members WHERE phone = ?').get(p);
  if (existing) return { member: existing, created: false };
  const st = plusSettings(db);
  return tx(db, () => {
    let ref;
    do ref = code(6); while (db.prepare('SELECT 1 FROM members WHERE ref_code = ?').get(ref));
    const referrer = refCode ? db.prepare("SELECT * FROM members WHERE ref_code = ? AND status = 'active'").get(String(refCode).toUpperCase().trim()) : null;
    const control = randomInt(100) < st.controlPct ? 1 : 0;
    const id = Number(db.prepare(`INSERT INTO members (phone, name, home_branch_id, ref_code, referred_by, consent_marketing, control, source, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p, String(name || '').trim().slice(0, 60) || null, Number(branchId) || null, ref,
      referrer?.id || null, consent ? 1 : 0, control, source, userId).lastInsertRowid);
    // الصديق المدعو يحصل على هديته رصيدًا مشروطًا بحد أدنى للفاتورة
    if (referrer && st.referral.newAmount > 0) credit(db, id, 'welcome', st.referral.newAmount, { days: st.referral.welcomeDays, minInvoice: st.referral.minInvoice, note: `دعوة من ${referrer.ref_code}` });
    trackEvent(db, 'plus_join', { branchId, ref: source });
    return { member: db.prepare('SELECT * FROM members WHERE id = ?').get(id), created: true };
  });
}

export function findMember(db, q) {
  const s = String(q || '').trim();
  if (!s) return null;
  const p = normalizePhone(s);
  return db.prepare("SELECT * FROM members WHERE status = 'active' AND (phone = ? OR ref_code = ?)").get(p || '-', s.toUpperCase());
}

export function memberSummary(db, id) {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!m) return null;
  const st = plusSettings(db);
  const invoices = db.prepare(`SELECT i.*, b.short_name branch FROM invoices i JOIN branches b ON b.id = i.branch_id WHERE member_id = ? ORDER BY i.created_at DESC LIMIT 12`).all(id)
    .map((i) => ({ ...i, sectionIds: json.parse(i.section_ids, []) }));
  const totals = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM invoices WHERE member_id = ?').get(id);
  const wallet = db.prepare('SELECT * FROM wallet_entries WHERE member_id = ? ORDER BY id DESC LIMIT 15').all(id);
  const requests = db.prepare(`SELECT r.*, b.short_name branch FROM requests r JOIN branches b ON b.id = r.branch_id WHERE r.phone = ? AND r.status IN ('new','confirmed','ready','found') ORDER BY r.created_at DESC`).all(m.phone);
  const referrals = db.prepare('SELECT COUNT(*) n, SUM(referral_rewarded) done FROM members WHERE referred_by = ?').get(id);
  return {
    id: m.id, phone: m.phone, name: m.name, refCode: m.ref_code, control: !!m.control, consent: !!m.consent_marketing, since: m.created_at,
    balance: balance(db, id), invoices, invoiceCount: totals.n, totalSpent: r2(totals.s), wallet, requests,
    referrals: { count: referrals.n || 0, rewarded: referrals.done || 0 }, cardUrl: cardUrl(id), referralUrl: referralUrl(m.ref_code), settings: { tiers: st.tiers, rewardMode: st.rewardMode },
  };
}

// ——— المحفظة: رصيد ترويجي بصلاحية، يُستهلك الأقرب انتهاءً أولًا ———
export function balance(db, memberId, invoiceAmount = null) {
  const now = sqlNow();
  return r2(db.prepare(`SELECT COALESCE(SUM(remaining),0) s FROM wallet_entries WHERE member_id = ? AND remaining > 0
    AND (expires_at IS NULL OR expires_at > ?) ${invoiceAmount == null ? '' : 'AND min_invoice <= ?'}`).get(memberId, now, ...(invoiceAmount == null ? [] : [invoiceAmount])).s);
}
export function credit(db, memberId, kind, amount, { days: d = 60, minInvoice = 0, invoiceId = null, note = null, userId = null } = {}) {
  const a = r2(amount);
  if (!(a > 0)) return null;
  return Number(db.prepare(`INSERT INTO wallet_entries (member_id, kind, amount, remaining, min_invoice, invoice_id, expires_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(memberId, kind, a, a, minInvoice, invoiceId, d ? sqlNow(days(d)) : null, note, userId).lastInsertRowid);
}
function redeem(db, memberId, amount, invoiceAmount, invoiceId, userId) {
  let left = r2(amount);
  const rows = db.prepare(`SELECT id, remaining FROM wallet_entries WHERE member_id = ? AND remaining > 0 AND (expires_at IS NULL OR expires_at > ?) AND min_invoice <= ?
    ORDER BY COALESCE(expires_at, '9999') ASC, id ASC`).all(memberId, sqlNow(), invoiceAmount);
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, r.remaining);
    db.prepare('UPDATE wallet_entries SET remaining = ROUND(remaining - ?, 2) WHERE id = ?').run(take, r.id);
    left = r2(left - take);
  }
  const used = r2(amount - left);
  if (used > 0) db.prepare(`INSERT INTO wallet_entries (member_id, kind, amount, invoice_id, created_by) VALUES (?, 'redeem', ?, ?, ?)`).run(memberId, -used, invoiceId, userId);
  return used;
}
export function adjustWallet(db, user, memberId, amount, note) {
  const a = r2(amount);
  if (!a) fail(400, 'أدخل مبلغًا', { amount: 'مطلوب' });
  if (!String(note || '').trim()) fail(400, 'اكتب سبب التعديل', { note: 'مطلوب' });
  if (a > 0) return credit(db, memberId, 'adjust', a, { days: plusSettings(db).walletDays, note, userId: user.id });
  const bal = balance(db, memberId);
  if (-a > bal) fail(400, `الرصيد المتاح ${bal} ريال فقط`);
  return tx(db, () => redeem(db, memberId, -a, Number.MAX_SAFE_INTEGER, null, user.id));
}
export function expireCredits(db) {
  const now = sqlNow();
  const rows = db.prepare('SELECT id, member_id, remaining FROM wallet_entries WHERE remaining > 0 AND expires_at IS NOT NULL AND expires_at <= ?').all(now);
  tx(db, () => {
    for (const r of rows) {
      db.prepare("INSERT INTO wallet_entries (member_id, kind, amount, note) VALUES (?, 'expire', ?, ?)").run(r.member_id, -r.remaining, `رصيد #${r.id}`);
      db.prepare('UPDATE wallet_entries SET remaining = 0 WHERE id = ?').run(r.id);
    }
  });
  return rows.length;
}

// ——— الفواتير وخطوط العربة ———
function cleanSections(db, ids) {
  const valid = new Set(db.prepare('SELECT id FROM sections').all().map((s) => s.id));
  return [...new Set((Array.isArray(ids) ? ids : String(ids || '').split(',')).map(Number).filter((n) => valid.has(n)))];
}
export function previewInvoice(db, { memberId, amount, sectionIds, useWallet }) {
  const st = plusSettings(db);
  const amt = r2(amount) || 0;
  const secs = cleanSections(db, sectionIds);
  // المجموعة الضابطة (إن فُعّلت) تُسجل فواتيرها دون خصم خطوط العربة لقياس الأثر الحقيقي
  const control = memberId ? !!db.prepare('SELECT control FROM members WHERE id = ?').get(memberId)?.control : false;
  const pct = control ? 0 : tierFor(secs.length, st.tiers);
  const reward = r2(amt * pct / 100);
  const available = memberId ? balance(db, memberId, amt) : 0;
  const discount = st.rewardMode === 'discount' ? reward : 0;
  const walletApplied = useWallet ? r2(Math.min(available, Math.max(0, amt - discount))) : 0;
  const next = control ? null : st.tiers.find((t) => t.min > secs.length);
  return { amount: amt, deptCount: secs.length, control, pct, reward, mode: st.rewardMode, discount, walletAvailable: available, walletApplied,
    payable: r2(amt - discount - walletApplied), nextTier: next ? { need: next.min - secs.length, pct: next.pct } : null };
}

export function recordInvoice(db, user, scope, input) {
  const st = plusSettings(db);
  const errors = {};
  const member = db.prepare("SELECT * FROM members WHERE id = ? AND status = 'active'").get(Number(input.memberId));
  if (!member) fail(404, 'العضو غير موجود');
  const branchId = Number(input.branchId);
  if (!db.prepare('SELECT 1 FROM branches WHERE id = ?').get(branchId)) errors.branchId = 'اختر الفرع';
  else if (scope && !scope.includes(branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  const ref = String(input.ref || '').trim().slice(0, 40);
  if (!ref) errors.ref = 'رقم الفاتورة مطلوب';
  const amount = r2(input.amount);
  if (!(amount > 0 && amount < 100000)) errors.amount = 'مبلغ غير صحيح';
  const secs = cleanSections(db, input.sectionIds);
  if (!secs.length) errors.sectionIds = 'اختر قسمًا واحدًا على الأقل';
  if (Object.keys(errors).length) fail(400, 'راجع بيانات الفاتورة', errors);
  if (db.prepare('SELECT 1 FROM invoices WHERE branch_id = ? AND ref = ?').get(branchId, ref)) fail(409, 'هذه الفاتورة مسجلة من قبل', { ref: 'مسجلة' });
  const pv = previewInvoice(db, { memberId: member.id, amount, sectionIds: secs, useWallet: input.useWallet === true || input.useWallet === 'on' });

  const out = tx(db, () => {
    let gift = null;
    if (input.gift === true || input.gift === 'on') { do gift = code(8); while (db.prepare('SELECT 1 FROM invoices WHERE gift_code = ?').get(gift)); }
    const invId = Number(db.prepare(`INSERT INTO invoices (member_id, branch_id, ref, amount, section_ids, dept_count, tier_pct, reward, reward_mode, gift_code, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(member.id, branchId, ref, amount, JSON.stringify(secs), secs.length, pv.pct, pv.reward, pv.mode, gift, user.id).lastInsertRowid);
    const used = pv.walletApplied > 0 ? redeem(db, member.id, pv.walletApplied, amount, invId, user.id) : 0;
    if (used) db.prepare('UPDATE invoices SET wallet_used = ? WHERE id = ?').run(used, invId);
    if (pv.mode === 'wallet' && pv.reward > 0) credit(db, member.id, 'tier', pv.reward, { days: st.walletDays, invoiceId: invId, note: `${pv.deptCount} أقسام · ${pv.pct}%` });
    // مكافأة صاحب الدعوة بعد أول فاتورة مؤهلة للصديق، بسقف شهري
    let referrerRewarded = null;
    if (member.referred_by && !member.referral_rewarded && amount >= st.referral.minInvoice) {
      db.prepare('UPDATE members SET referral_rewarded = 1 WHERE id = ?').run(member.id);
      const monthStart = sqlNow(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const thisMonth = db.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE member_id = ? AND kind = 'referral' AND created_at >= ?").get(member.referred_by, monthStart).n;
      if (thisMonth < st.referral.monthlyCap && st.referral.referrerAmount > 0) {
        credit(db, member.referred_by, 'referral', st.referral.referrerAmount, { days: st.walletDays, invoiceId: invId, note: `دعوة ${member.phone.slice(-4)}` });
        referrerRewarded = member.referred_by;
      }
    }
    trackEvent(db, 'plus_invoice', { branchId, ref: String(secs.length) });
    return { invoiceId: invId, gift, walletUsed: used, referrerRewarded };
  });
  const after = balance(db, member.id);
  const lines = [`شكرًا لتسوقك من ماك سنتر 🛒`, `فاتورة ${ref}: ${amount} ريال · ${pv.deptCount} ${pv.deptCount === 1 ? 'قسم' : 'أقسام'}`];
  if (pv.pct) lines.push(pv.mode === 'discount' ? `خطوط العربة: خصم ${pv.pct}% (${pv.reward} ريال)` : `خطوط العربة: أضفنا ${pv.reward} ريال لرصيدك`);
  else if (pv.nextTier) lines.push(`أضف ${pv.nextTier.need} ${pv.nextTier.need === 1 ? 'قسمًا' : 'أقسام'} في زيارتك القادمة واحصل على ${pv.nextTier.pct}%`);
  if (out.walletUsed) lines.push(`استخدمت ${out.walletUsed} ريال من رصيدك`);
  lines.push(`رصيدك الآن: ${after} ريال`, `بطاقتك: ${cardUrl(member.id)}`);
  waSend(member.phone, lines.join('\n'));
  if (out.referrerRewarded) {
    const ref2 = db.prepare('SELECT phone FROM members WHERE id = ?').get(out.referrerRewarded);
    waSend(ref2.phone, `🎉 صديقك تسوق من ماك سنتر، وأضفنا ${st.referral.referrerAmount} ريال لرصيدك في MAC+‎.\nرصيدك: ${balance(db, out.referrerRewarded)} ريال`);
  }
  return { ...pv, ...out, balance: after, giftUrl: out.gift ? `${config.publicUrl}/gift/${out.gift}` : null };
}

// ——— الضمانات ———
export function recordClaim(db, user, input) {
  const st = plusSettings(db);
  const kind = input.kind;
  if (!['price', 'size', 'gift'].includes(kind)) fail(400, 'نوع غير معروف');
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(input.invoiceId));
  if (!inv) fail(404, 'الفاتورة غير موجودة');
  const item = String(input.item || '').trim().slice(0, 120);
  if (!item) fail(400, 'اكتب الصنف', { item: 'مطلوب' });
  const ageDays = (Date.now() - new Date(inv.created_at.replace(' ', 'T') + 'Z').getTime()) / 86400000;
  const limit = kind === 'price' ? st.price.days : kind === 'size' ? st.sizeDays : st.giftDays;
  if (ageDays > limit) fail(400, `انتهت مدة الضمان (${limit} أيام من تاريخ الفاتورة)`);
  if (kind !== 'price' && db.prepare('SELECT 1 FROM claims WHERE invoice_id = ? AND kind = ? AND item = ?').get(inv.id, kind, item)) fail(409, 'استُبدلت هذه القطعة من قبل');
  let creditAmount = 0, paid = null, newPrice = null;
  if (kind === 'price') {
    paid = r2(input.paid); newPrice = r2(input.newPrice);
    if (!(paid > 0) || !(newPrice >= 0) || newPrice >= paid) fail(400, 'السعر الجديد يجب أن يكون أقل من المدفوع', { newPrice: 'غير صحيح' });
    const used = db.prepare("SELECT COALESCE(SUM(credit),0) s FROM claims WHERE invoice_id = ? AND kind = 'price'").get(inv.id).s;
    creditAmount = r2(Math.min(paid - newPrice, st.price.cap - used));
    if (creditAmount <= 0) fail(400, `بلغت الفاتورة سقف ضمان السعر (${st.price.cap} ريال)`);
  }
  const id = tx(db, () => {
    const cid = Number(db.prepare('INSERT INTO claims (kind, member_id, invoice_id, item, paid, new_price, credit, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(kind, inv.member_id, inv.id, item, paid, newPrice, creditAmount, user.id).lastInsertRowid);
    if (creditAmount) credit(db, inv.member_id, 'price', creditAmount, { days: st.walletDays, invoiceId: inv.id, note: item, userId: user.id });
    return cid;
  });
  if (creditAmount) {
    const m = db.prepare('SELECT phone FROM members WHERE id = ?').get(inv.member_id);
    waSend(m.phone, `ضمان ماك للسعر ✓\nانخفض سعر «${item}» بعد شرائك، فأضفنا الفرق ${creditAmount} ريال لرصيدك.\nرصيدك: ${balance(db, inv.member_id)} ريال`);
  }
  return { id, credit: creditAmount };
}
export function giftReceipt(db, giftCode) {
  const inv = db.prepare('SELECT i.created_at, i.ref, b.name branch, b.id branch_id FROM invoices i JOIN branches b ON b.id = i.branch_id WHERE gift_code = ?').get(String(giftCode || '').toUpperCase());
  if (!inv) return null;
  const until = new Date(new Date(inv.created_at.replace(' ', 'T') + 'Z').getTime() + plusSettings(db).giftDays * 86400000);
  return { branch: inv.branch, date: inv.created_at.slice(0, 10), until: until.toISOString().slice(0, 10), expired: until < new Date(), code: String(giftCode).toUpperCase() };
}

// ——— الطلبات: حجز، اطلب واستلم، لقيناه لك ———
export function createRequest(db, input, { source = 'web', user = null } = {}) {
  const st = plusSettings(db);
  const errors = {};
  const kind = Object.hasOwn(REQUEST_KIND, input.kind) ? input.kind : null;
  if (!kind) errors.kind = 'اختر نوع الطلب';
  const phone = normalizePhone(input.phone);
  if (!phone) errors.phone = 'رقم جوال سعودي يبدأ بـ 05';
  const branchId = Number(input.branch || input.branchId);
  if (!db.prepare('SELECT 1 FROM branches WHERE id = ? AND active = 1').get(branchId)) errors.branch = 'اختر الفرع';
  const details = String(input.details || '').trim().slice(0, 600);
  if (details.length < 3) errors.details = 'صف القطعة أو المنتج';
  if (!user && !(input.consent === 'on' || input.consent === true || input.consent === '1')) errors.consent = 'الموافقة مطلوبة لنتواصل معك بشأن طلبك';
  if (Object.keys(errors).length) fail(400, 'راجع الحقول المظللة', errors);
  if (kind !== 'find' && db.prepare(`SELECT COUNT(*) n FROM requests WHERE phone = ? AND kind != 'find' AND status IN ('new','confirmed','ready')`).get(phone).n >= st.maxOpen) {
    fail(400, `لديك ${st.maxOpen} طلبات مفتوحة. أكملها أو انتظر انتهاءها قبل طلب جديد`);
  }
  const sectionId = Number(input.section || input.sectionId) || null;
  const member = db.prepare("SELECT id FROM members WHERE phone = ? AND status = 'active'").get(phone);
  let ref;
  do ref = `R-${code(5)}`; while (db.prepare('SELECT 1 FROM requests WHERE ref = ?').get(ref));
  const id = Number(db.prepare(`INSERT INTO requests (kind, ref, member_id, phone, name, branch_id, section_id, look_id, details, size, status, source, handled_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`).run(kind, ref, member?.id || null, phone, String(input.name || '').trim().slice(0, 60) || null, branchId,
    sectionId, Number(input.look) || null, details, String(input.size || '').trim().slice(0, 30) || null, source, user?.id || null).lastInsertRowid);
  trackEvent(db, 'request_created', { branchId, ref: kind });
  notifyRole(db, ['agent', 'branch_manager'], branchId, { kind: 'request', title: `${REQUEST_KIND[kind]} جديد ${ref}`, link: '#/requests' });
  return { id, ref };
}

export function listRequests(db, scope, { status = 'open', kind = '' } = {}) {
  const rows = db.prepare(`SELECT r.*, b.short_name branch, s.name section, m.ref_code member_code FROM requests r JOIN branches b ON b.id = r.branch_id
    LEFT JOIN sections s ON s.id = r.section_id LEFT JOIN members m ON m.id = r.member_id ORDER BY r.created_at DESC LIMIT 400`).all();
  return rows.filter((r) => (scope === null || scope.includes(r.branch_id)) && (!kind || r.kind === kind)
    && (status === 'all' || (status === 'open' ? OPEN.includes(r.status) : r.status === status)));
}

const NEXT = { reserve: ['confirmed', 'done', 'cancelled'], collect: ['ready', 'done', 'cancelled'], find: ['found', 'done', 'cancelled'] };
export function updateRequest(db, user, scope, id, input) {
  const st = plusSettings(db);
  const r = db.prepare('SELECT r.*, b.name branch FROM requests r JOIN branches b ON b.id = r.branch_id WHERE r.id = ?').get(id);
  if (!r) fail(404, 'الطلب غير موجود');
  if (scope && !scope.includes(r.branch_id)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  const status = input.status;
  if (!NEXT[r.kind].includes(status)) fail(400, 'حالة غير مسموحة لهذا النوع');
  if (!OPEN.includes(r.status)) fail(400, 'الطلب مغلق');
  const note = String(input.note || '').trim().slice(0, 300) || r.note;
  let hold = r.hold_until, pickup = r.pickup_code, msg = null;
  if (status === 'confirmed') {
    hold = sqlNow(hours(st.holdHours));
    const until = new Date(Date.now() + st.holdHours * 3600000).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    msg = `✓ حجزنا لك طلبك ${r.ref} في ${r.branch}\n${r.details}${r.size ? ` · مقاس ${r.size}` : ''}\nمحجوز حتى ${until}. نراك قريبًا!`;
  } else if (status === 'ready') {
    pickup = String(randomInt(1000, 10000));
    msg = `🛍️ طلبك ${r.ref} جاهز للاستلام من ${r.branch}\nرمز الاستلام: ${pickup}\nأظهر الرمز عند نقطة الاستلام.`;
  } else if (status === 'found') {
    msg = `🎉 لقيناه لك!\nالمنتج الذي سألت عنه (${r.details}) متوفر الآن في ${r.branch}.\nرد على هذه الرسالة لنحجزه لك.`;
  }
  db.prepare("UPDATE requests SET status = ?, hold_until = ?, pickup_code = ?, note = ?, handled_by = ?, updated_at = datetime('now') WHERE id = ?").run(status, hold, pickup, note, user.id, id);
  if (msg) waSend(r.phone, msg);
  return db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
}
export function expireRequests(db) {
  return db.prepare("UPDATE requests SET status = 'expired', updated_at = datetime('now') WHERE kind = 'reserve' AND status = 'confirmed' AND hold_until < ?").run(sqlNow()).changes;
}

// ——— الإطلالات: «عندك مناسبة؟» ———
const hydrateLook = (l) => ({ ...l, items: json.parse(l.items, []), branchIds: json.parse(l.branch_ids, []), active: !!l.active });
export function listLooks(db, { publicOnly = false, occasion = '', audience = '', budget = 0 } = {}) {
  return db.prepare('SELECT * FROM looks ORDER BY sort, id DESC').all().map(hydrateLook)
    .filter((l) => (!publicOnly || l.active) && (!occasion || l.occasion === occasion) && (!audience || l.audience === audience) && (!budget || l.price <= budget));
}
export function getLook(db, id) { const l = db.prepare('SELECT * FROM looks WHERE id = ?').get(id); return l ? hydrateLook(l) : null; }
export function saveLook(db, id, input) {
  const errors = {};
  const title = String(input.title || '').trim().slice(0, 80);
  if (!title) errors.title = 'العنوان مطلوب';
  if (!Object.hasOwn(OCCASIONS, input.occasion)) errors.occasion = 'اختر المناسبة';
  if (!Object.hasOwn(AUDIENCES, input.audience)) errors.audience = 'اختر الفئة';
  const items = (Array.isArray(input.items) ? input.items : []).map((it) => ({ name: String(it.name || '').trim().slice(0, 60), price: r2(it.price) || 0, sectionId: Number(it.sectionId) || null })).filter((it) => it.name).slice(0, 8);
  if (!items.length) errors.items = 'أضف قطعة واحدة على الأقل';
  if (Object.keys(errors).length) fail(400, 'راجع الحقول', errors);
  const price = r2(items.reduce((s, it) => s + it.price, 0));
  const vals = [title, input.occasion, input.audience, price, JSON.stringify(items), JSON.stringify((input.branchIds || []).map(Number).filter(Boolean)), input.active === false ? 0 : 1, Number(input.sort) || 0];
  if (id) {
    db.prepare('UPDATE looks SET title=?, occasion=?, audience=?, price=?, items=?, branch_ids=?, active=?, sort=?, image=COALESCE(?, image) WHERE id=?').run(...vals, input.image || null, id);
    if (input.removeImage) db.prepare('UPDATE looks SET image = NULL WHERE id = ?').run(id);
  } else id = Number(db.prepare('INSERT INTO looks (title, occasion, audience, price, items, branch_ids, active, sort, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...vals, input.image || null).lastInsertRowid);
  return getLook(db, id);
}

// ——— الانضمام من الموقع عبر رسالة واتساب يرسلها العميل بنفسه ———
export function startPlusJoin(db, input) {
  const errors = {};
  if (!(input.consent === 'on' || input.consent === true || input.consent === '1')) errors.consent = 'الموافقة مطلوبة للانضمام';
  if (Object.keys(errors).length) fail(400, 'أكمل البيانات', errors);
  let link;
  do link = code(6); while (db.prepare('SELECT 1 FROM plus_intents WHERE token = ?').get(link));
  const statusKey = token(18);
  const name = String(input.name || '').trim().slice(0, 60) || null;
  const ref = String(input.ref || '').trim().toUpperCase().slice(0, 10) || null;
  db.prepare(`INSERT INTO plus_intents (token, status_key, name, branch_id, ref_code, consent, status, expires_at) VALUES (?, ?, ?, ?, ?, 1, 'awaiting', ?)`)
    .run(link, statusKey, name, Number(input.branch) || null, ref, sqlNow(new Date(Date.now() + 30 * 60000)));
  return { statusKey, waUrl: plusWaUrl({ token: link, name }) };
}
// نص الرسالة الجاهزة التي يرسلها العميل بنفسه لإكمال الانضمام
export const plusWaUrl = (it) => waLink(sendingNumber(), ['أرغب في الانضمام إلى عضوية MAC+‎ من ماك سنتر', it.name ? `الاسم: ${it.name}` : null, PLUS_CONSENT, `رمز الانضمام: MP-${it.token}`].filter(Boolean).join('\n'));
export function plusIntentStatus(db, statusKey) {
  const it = db.prepare('SELECT * FROM plus_intents WHERE status_key = ?').get(statusKey);
  if (!it) return null;
  if (it.status === 'awaiting' && it.expires_at < sqlNow()) { db.prepare("UPDATE plus_intents SET status = 'expired' WHERE id = ?").run(it.id); it.status = 'expired'; }
  return { status: it.status, cardUrl: it.status === 'confirmed' && it.member_id ? cardUrl(it.member_id) : null };
}
// يُستدعى من معالج رسائل واتساب الواردة؛ يعيد نص الرد أو null إن لم تكن الرسالة رمز انضمام
export function handlePlusMessage(db, waId, text, name) {
  if (/^\s*(بطاقتي|رصيدي|عضويتي)\s*$/.test(String(text))) {
    const p = phoneFromWa(waId);
    const mem = p && db.prepare("SELECT * FROM members WHERE phone = ? AND status = 'active'").get(p);
    if (!mem) return null;
    return cardText(db, mem);
  }
  const m = PLUS_RE.exec(String(text).toUpperCase());
  if (!m) return null;
  const it = db.prepare('SELECT * FROM plus_intents WHERE token = ?').get(m[1]);
  if (!it || it.status === 'expired' || (it.status === 'awaiting' && it.expires_at < sqlNow())) return 'انتهت صلاحية رمز الانضمام. افتح صفحة MAC+‎ من جديد.';
  const phone = phoneFromWa(waId);
  if (!phone) return 'تعذر قراءة رقمك. انضم من أي فرع عبر الكاشير.';
  const { member, created } = createMember(db, { phone, name: it.name || name, branchId: it.branch_id, refCode: it.ref_code, consent: true, source: 'web' });
  db.prepare("UPDATE plus_intents SET status = 'confirmed', member_id = ? WHERE id = ?").run(member.id, it.id);
  const bal = balance(db, member.id);
  return [created ? 'أهلًا بك في MAC+‎ 🛒' : 'أنت عضو في MAC+‎ من قبل 👋', `رقم عضويتك: ${member.ref_code}`, bal ? `رصيدك: ${bal} ريال` : null,
    `تسوّق من أكثر من قسم في الفاتورة نفسها وارفع خطوط عربتك: ${plusSettings(db).tiers.map((t) => `${t.min} أقسام ${t.pct}%`).join('، ')}.`, `بطاقتك: ${cardUrl(member.id)}`, `ادعُ صديقًا: ${referralUrl(member.ref_code)}`].filter(Boolean).join('\n');
}

const cardText = (db, mem) => [`بطاقة MAC+‎ · ${mem.ref_code}`, `رصيدك: ${balance(db, mem.id)} ريال`, `بطاقتك: ${cardUrl(mem.id)}`, `ادعُ صديقًا: ${referralUrl(mem.ref_code)}`].join('\n');
export function sendCard(db, memberId) {
  const mem = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (mem) waSend(mem.phone, cardText(db, mem));
}

// ——— الأرقام اليومية للفروع (إجمالي الفواتير من نقاط البيع حتى يتم الربط) ———
export function saveBranchDay(db, scope, input) {
  const branchId = Number(input.branchId);
  if (scope && !scope.includes(branchId)) fail(403, 'لا تملك صلاحية على هذا الفرع');
  const day = String(input.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(400, 'التاريخ غير صحيح', { day: 'YYYY-MM-DD' });
  const inv = Math.round(Number(input.invoices));
  if (!(inv >= 0 && inv < 100000)) fail(400, 'عدد الفواتير غير صحيح', { invoices: 'غير صحيح' });
  const sales = input.sales === '' || input.sales == null ? null : r2(input.sales);
  db.prepare('INSERT INTO branch_days (branch_id, day, invoices, sales) VALUES (?, ?, ?, ?) ON CONFLICT(branch_id, day) DO UPDATE SET invoices = excluded.invoices, sales = excluded.sales').run(branchId, day, inv, sales);
  return { ok: true };
}

// ——— مؤشرات التجربة ———
export function pilotReport(db, scope, { days: d = 30 } = {}) {
  const from = sqlNow(days(-d)), fromDay = from.slice(0, 10);
  const inScope = (bid) => scope === null || scope.includes(bid);
  const inv = db.prepare('SELECT i.*, m.control, m.referred_by FROM invoices i JOIN members m ON m.id = i.member_id WHERE i.created_at >= ?').all(from).filter((i) => inScope(i.branch_id));
  const daysRows = db.prepare('SELECT * FROM branch_days WHERE day >= ?').all(fromDay).filter((r) => inScope(r.branch_id));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const memberSales = sum(inv, (i) => i.amount);
  const totalInv = sum(daysRows, (r) => r.invoices);
  const salesRows = daysRows.filter((r) => r.sales != null);
  const totalSales = sum(salesRows, (r) => r.sales);
  const invWithSalesDays = inv.filter((i) => salesRows.some((r) => r.branch_id === i.branch_id && r.day === i.created_at.slice(0, 10)));
  const otherInv = sum(salesRows, (r) => r.invoices) - invWithSalesDays.length;
  const otherSales = totalSales - sum(invWithSalesDays, (i) => i.amount);
  const aov = (a) => (a.length ? r2(sum(a, (i) => i.amount) / a.length) : null);
  const treat = inv.filter((i) => !i.control), ctrl = inv.filter((i) => i.control);
  const byMember = new Map(); for (const i of inv) byMember.set(i.member_id, (byMember.get(i.member_id) || 0) + 1);
  const buyers = byMember.size, repeat = [...byMember.values()].filter((n) => n >= 2).length;
  const tiers = {}; for (const i of inv) tiers[i.tier_pct] = (tiers[i.tier_pct] || 0) + 1;
  const reqs = db.prepare('SELECT kind, status, branch_id FROM requests WHERE created_at >= ?').all(from).filter((r) => inScope(r.branch_id));
  const closedRes = reqs.filter((r) => r.kind === 'reserve' && ['done', 'expired', 'cancelled'].includes(r.status));
  const w = db.prepare(`SELECT w.kind, w.amount, w.remaining, w.expires_at FROM wallet_entries w WHERE w.created_at >= ?`).all(from);
  const granted = sum(w.filter((e) => e.amount > 0), (e) => e.amount), redeemed = -sum(w.filter((e) => e.kind === 'redeem'), (e) => e.amount), expired = -sum(w.filter((e) => e.kind === 'expire'), (e) => e.amount);
  const outstanding = db.prepare('SELECT COALESCE(SUM(remaining),0) s FROM wallet_entries WHERE remaining > 0 AND (expires_at IS NULL OR expires_at > ?)').get(sqlNow()).s;
  const claims = db.prepare('SELECT kind, credit FROM claims WHERE created_at >= ?').all(from);
  const discounts = sum(inv.filter((i) => i.reward_mode === 'discount'), (i) => i.reward);
  const priceCredits = sum(claims.filter((c) => c.kind === 'price'), (c) => c.credit);
  const incentives = discounts + redeemed;
  const members = db.prepare("SELECT COUNT(*) n, SUM(control) c, SUM(created_at >= ?) fresh, SUM(referred_by IS NOT NULL AND created_at >= ?) referred FROM members WHERE status = 'active'").get(from, from);
  const referredSales = sum(inv.filter((i) => i.referred_by), (i) => i.amount);
  const series = {};
  for (const i of inv) { const k = i.created_at.slice(0, 10); (series[k] ||= { day: k, member: 0, total: 0 }).member++; }
  for (const r of daysRows) (series[r.day] ||= { day: r.day, member: 0, total: 0 }).total += r.invoices;
  return {
    days: d,
    members: { total: members.n || 0, fresh: members.fresh || 0, control: members.c || 0, referred: members.referred || 0 },
    invoices: { members: inv.length, total: totalInv, knownRate: totalInv ? r2((inv.length / totalInv) * 100) : null, memberSales: r2(memberSales) },
    aov: { members: aov(treat), control: aov(ctrl), nonMembers: otherInv > 0 ? r2(otherSales / otherInv) : null, all: aov(inv) },
    depts: { avg: inv.length ? r2(sum(inv, (i) => i.dept_count) / inv.length) : null, tiers },
    repeat: { buyers, repeat, rate: buyers ? r2((repeat / buyers) * 100) : null },
    requests: { total: reqs.length, byKind: Object.fromEntries(Object.keys(REQUEST_KIND).map((k) => [k, reqs.filter((r) => r.kind === k).length])),
      reserveConversion: closedRes.length ? r2((closedRes.filter((r) => r.status === 'done').length / closedRes.length) * 100) : null },
    wallet: { granted: r2(granted), redeemed: r2(redeemed), expired: r2(expired), outstanding: r2(outstanding), redemptionRate: granted ? r2((redeemed / granted) * 100) : null },
    claims: { price: claims.filter((c) => c.kind === 'price').length, priceCredits: r2(priceCredits), size: claims.filter((c) => c.kind === 'size').length, gift: claims.filter((c) => c.kind === 'gift').length },
    referral: { sales: r2(referredSales) },
    cost: { discounts: r2(discounts), redeemed: r2(redeemed), total: r2(incentives), pctOfMemberSales: memberSales ? r2((incentives / memberSales) * 100) : null },
    series: Object.values(series).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// إرسال واتساب لا يوقف العملية إن فشل (خارج نافذة 24 ساعة مثلًا)
function waSend(phone, text) {
  if (!phone) return;
  Promise.resolve().then(() => driver().send({ to: waOf(phone), text })).catch((e) => console.error('plus whatsapp', e.message));
}
