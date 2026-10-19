// الربط مع النظام المحاسبي: يرسل كل فاتورة بيع أو مرتجع إلى /api/webhooks/erp فور إصدارها
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { fail } from '../http.js';
import { json, getSetting, setSetting, sqlNow } from '../db.js';
import { safeEqual } from '../lib/ids.js';
import { normalizePhone } from './tickets.js';
import { recordInvoice } from './plus.js';
import { passChanged } from './applewallet.js';

const r2 = (n) => Math.round(Number(n) * 100) / 100;

export const erpEnabled = () => !!config.erp.secret;
export function erpMapping(db) {
  const m = getSetting(db, 'erp', {});
  return { branches: m.branches || {}, categories: m.categories || {} };
}

// يقبل مفتاحًا ثابتًا في الترويسة، أو توقيع HMAC-SHA256 لجسم الطلب
export function verifyErp(raw, headers) {
  const secret = config.erp.secret;
  if (!secret) return false;
  const key = String(headers['x-api-key'] || '').trim() || String(headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (key && safeEqual(key, secret)) return true;
  const sig = String(headers['x-signature'] || '').replace(/^sha256=/, '');
  return !!sig && safeEqual(sig, createHmac('sha256', secret).update(raw).digest('hex'));
}

// أسماء الحقول تختلف بين الأنظمة؛ نقبل الصيغ الشائعة
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };
function normalize(raw) {
  const items = Array.isArray(raw.items || raw.lines) ? (raw.items || raw.lines) : [];
  const date = pick(raw, 'date', 'invoice_date', 'invoiceDate', 'created_at', 'createdAt');
  const t = date ? new Date(date) : new Date();
  const day = new Date((Number.isNaN(t.getTime()) ? Date.now() : t.getTime()) + 3 * 3600_000).toISOString().slice(0, 10);
  const type = String(pick(raw, 'type', 'kind', 'invoice_type', 'invoiceType') || 'sale').toLowerCase();
  return {
    invoiceNo: String(pick(raw, 'invoice_no', 'invoiceNo', 'invoice_number', 'number', 'id') || '').trim().slice(0, 40),
    branchCode: String(pick(raw, 'branch_code', 'branchCode', 'branch', 'store', 'branch_id') || '').trim().slice(0, 40),
    kind: /return|refund|credit|مرتجع/.test(type) ? 'return' : 'sale',
    original: String(pick(raw, 'original_invoice_no', 'originalInvoiceNo', 'return_of') || '').trim().slice(0, 40) || null,
    total: Math.abs(r2(pick(raw, 'total', 'net_total', 'grand_total', 'amount', 'totalAmount') ?? NaN)),
    day,
    phone: normalizePhone(pick(raw, 'customer_phone', 'customerPhone', 'phone', 'mobile')) || null,
    memberCode: String(pick(raw, 'member_code', 'memberCode', 'loyalty_code') || '').trim().toUpperCase().slice(0, 10) || null,
    categories: [...new Set(items.map((i) => String(pick(i, 'category', 'category_name', 'group', 'department') || '').trim()).filter(Boolean))].slice(0, 30),
    invoiceUrl: pick(raw, 'invoice_url', 'invoiceUrl', 'pdf_url', 'pdfUrl'),
  };
}

export function processErpInvoice(db, raw) {
  const n = normalize(raw || {});
  if (!n.invoiceNo || !n.branchCode || !(n.total >= 0)) return { invoice_no: n.invoiceNo || null, status: 'invalid', error: 'invoice_no و branch_code و total مطلوبة' };
  const map = erpMapping(db);
  const branchId = Number(map.branches[n.branchCode]) || null;
  const sections = [...new Set(n.categories.map((c) => Number(map.categories[c])).filter(Boolean))];
  const ins = db.prepare(`INSERT INTO erp_invoices (branch_code, branch_id, invoice_no, kind, original_no, total, day, phone, member_code, categories, section_ids, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received') ON CONFLICT(branch_code, invoice_no, kind) DO NOTHING`)
    .run(n.branchCode, branchId, n.invoiceNo, n.kind, n.original, n.total, n.day, n.phone, n.memberCode, JSON.stringify(n.categories), JSON.stringify(sections));
  if (!ins.changes) return { invoice_no: n.invoiceNo, status: 'duplicate' };
  const id = Number(ins.lastInsertRowid);
  let out;
  try { out = settle(db, id, n.invoiceUrl); } catch (err) {
    db.prepare("UPDATE erp_invoices SET status = 'error', note = ? WHERE id = ?").run(String(err.message).slice(0, 200), id);
    out = { status: 'error', note: err.message };
  }
  if (branchId) rollupDay(db, branchId, n.day);
  return { invoice_no: n.invoiceNo, ...out };
}

// يقرر مصير الفاتورة: عضو تُحسب له خطوط العربة، أو زائر يدخل في الإجمالي فقط
function settle(db, id, invoiceUrl = null) {
  const e = db.prepare('SELECT * FROM erp_invoices WHERE id = ?').get(id);
  const set = (status, extra = {}) => {
    db.prepare('UPDATE erp_invoices SET status = ?, member_id = COALESCE(?, member_id), invoice_id = COALESCE(?, invoice_id), note = ? WHERE id = ?')
      .run(status, extra.memberId ?? null, extra.invoiceId ?? null, extra.note ?? null, id);
    return { status, ...(extra.note ? { note: extra.note } : {}) };
  };
  if (!e.branch_id) return set('unmapped', { note: `رمز الفرع ${e.branch_code} غير مربوط بفرع` });
  if (e.kind === 'return') return settleReturn(db, e, set);
  const member = e.member_code
    ? db.prepare("SELECT * FROM members WHERE ref_code = ? AND status = 'active'").get(e.member_code)
    : e.phone ? db.prepare("SELECT * FROM members WHERE phone = ? AND status = 'active'").get(e.phone) : null;
  if (!member) return set('guest');
  // سجلها الكاشير من نقطة MAC+ قبل وصولها
  const counter = db.prepare('SELECT id FROM invoices WHERE branch_id = ? AND ref = ?').get(e.branch_id, e.invoice_no);
  if (counter) return set('member', { memberId: member.id, invoiceId: counter.id, note: 'مسجلة من نقطة MAC+' });
  const secs = json.parse(e.section_ids, []);
  if (!secs.length) return set('unmapped', { memberId: member.id, note: `تصنيفات غير مربوطة بأقسام: ${json.parse(e.categories, []).join('، ') || 'بلا تصنيف'}` });
  const r = recordInvoice(db, null, null, { memberId: member.id, branchId: e.branch_id, ref: e.invoice_no, amount: e.total, sectionIds: secs, source: 'erp', invoiceUrl });
  return set('member', { memberId: member.id, invoiceId: r.invoiceId });
}

// المرتجع: تُعلَّم الفاتورة الأصلية، ويُسحب ما لم يُستخدم من مكافأتها
function settleReturn(db, e, set) {
  const ref = e.original_no || e.invoice_no;
  const inv = db.prepare('SELECT * FROM invoices WHERE branch_id = ? AND ref = ?').get(e.branch_id, ref);
  if (!inv) return set('return');
  db.prepare('UPDATE invoices SET returned = 1 WHERE id = ?').run(inv.id);
  const credits = db.prepare("SELECT id, remaining FROM wallet_entries WHERE invoice_id = ? AND kind = 'tier' AND remaining > 0").all(inv.id);
  for (const c of credits) {
    db.prepare("INSERT INTO wallet_entries (member_id, kind, amount, note) VALUES (?, 'expire', ?, ?)").run(inv.member_id, -c.remaining, `مرتجع ${e.invoice_no}`);
    db.prepare('UPDATE wallet_entries SET remaining = 0 WHERE id = ?').run(c.id);
  }
  if (credits.length) passChanged(db, inv.member_id);
  return set('return', { memberId: inv.member_id, invoiceId: inv.id });
}

// أرقام اليوم للفرع تُحسب من الفواتير الواردة بدل الإدخال اليدوي
function rollupDay(db, branchId, day) {
  const r = db.prepare(`SELECT SUM(kind = 'sale') n, COALESCE(SUM(CASE kind WHEN 'sale' THEN total ELSE -total END), 0) s FROM erp_invoices WHERE branch_id = ? AND day = ?`).get(branchId, day);
  db.prepare(`INSERT INTO branch_days (branch_id, day, invoices, sales, source) VALUES (?, ?, ?, ?, 'erp')
    ON CONFLICT(branch_id, day) DO UPDATE SET invoices = excluded.invoices, sales = excluded.sales, source = 'erp'`).run(branchId, day, r.n || 0, r2(r.s));
}

export function saveErpMapping(db, input) {
  const sections = new Set(db.prepare('SELECT id FROM sections').all().map((s) => s.id));
  const branches = new Set(db.prepare('SELECT id FROM branches').all().map((b) => b.id));
  const clean = (obj, valid) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [String(k).trim().slice(0, 60), Number(v)]).filter(([k, v]) => k && valid.has(v)));
  const next = { branches: clean(input.branches, branches), categories: clean(input.categories, sections) };
  setSetting(db, 'erp', next);
  return { ...next, reprocessed: reprocess(db) };
}

// بعد ربط فرع أو تصنيف جديد تُعاد معالجة الفواتير المعلقة
export function reprocess(db) {
  const map = erpMapping(db);
  const rows = db.prepare("SELECT * FROM erp_invoices WHERE status = 'unmapped' AND received_at > datetime('now','-60 days')").all();
  const days = new Set();
  for (const e of rows) {
    const branchId = Number(map.branches[e.branch_code]) || null;
    const secs = [...new Set(json.parse(e.categories, []).map((c) => Number(map.categories[c])).filter(Boolean))];
    db.prepare('UPDATE erp_invoices SET branch_id = ?, section_ids = ? WHERE id = ?').run(branchId, JSON.stringify(secs), e.id);
    try { settle(db, e.id); } catch (err) { db.prepare("UPDATE erp_invoices SET status = 'error', note = ? WHERE id = ?").run(String(err.message).slice(0, 200), e.id); }
    if (branchId) days.add(`${branchId}|${e.day}`);
  }
  for (const k of days) { const [b, d] = k.split('|'); rollupDay(db, Number(b), d); }
  return rows.length;
}

export function erpOverview(db, scope) {
  const map = erpMapping(db);
  const inScope = (r) => scope === null || r.branch_id == null || scope.includes(r.branch_id);
  const recent = db.prepare('SELECT * FROM erp_invoices ORDER BY id DESC LIMIT 60').all().filter(inScope).map((r) => ({ ...r, categories: json.parse(r.categories, []) }));
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM erp_invoices WHERE day = ? GROUP BY status').all(today).map((r) => [r.status, r.n]));
  const codes = db.prepare('SELECT DISTINCT branch_code FROM erp_invoices').all().map((r) => r.branch_code);
  const cats = new Set();
  for (const r of db.prepare("SELECT categories FROM erp_invoices WHERE received_at > datetime('now','-60 days')").all()) for (const c of json.parse(r.categories, [])) cats.add(c);
  const last = db.prepare('SELECT MAX(received_at) t FROM erp_invoices').get().t;
  return {
    enabled: erpEnabled(), webhookUrl: `${config.publicUrl}/api/webhooks/erp`, lastReceived: last, today: counts, mapping: map,
    branchCodes: [...new Set([...codes, ...Object.keys(map.branches)])], categories: [...new Set([...cats, ...Object.keys(map.categories)])].sort(), recent,
    now: sqlNow(),
  };
}
