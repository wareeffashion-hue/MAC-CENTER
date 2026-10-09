import { fail } from '../http.js';
import { code } from '../lib/ids.js';
import { config } from '../config.js';
import { qrSvg } from '../lib/qr.js';

export const QR_PURPOSE = { subscribe: 'اشتراك بالعروض', feedback: 'ملاحظات وشكاوى', custom: 'وجهة مخصصة' };

export function listQr(db, scope = null) {
  const rows = db.prepare(`SELECT q.*, b.short_name AS branch_name,
      (SELECT COUNT(*) FROM subscription_intents i WHERE i.qr_code = q.code AND i.status = 'confirmed') AS confirmed,
      (SELECT COUNT(*) FROM tickets t WHERE t.qr_code = q.code) AS tickets
    FROM qr_codes q LEFT JOIN branches b ON b.id = q.branch_id ORDER BY q.created_at DESC`).all();
  return rows.filter((r) => scope === null || scope.includes(r.branch_id)).map((r) => ({ ...r, url: `${config.publicUrl}/q/${r.code}` }));
}

export function saveQr(db, id, input) {
  const label = String(input.label || '').trim();
  if (!label) fail(400, 'اسم الملصق مطلوب', { label: 'مطلوب' });
  if (!(input.purpose in QR_PURPOSE)) fail(400, 'حدد الغرض', { purpose: 'مطلوب' });
  const target = input.purpose === 'custom' ? String(input.target || '') : null;
  if (input.purpose === 'custom' && !/^\/[\w\-/?=&%.]*$/.test(target)) fail(400, 'الوجهة المخصصة مسار داخلي يبدأ بـ /', { target: 'مثال: /offers' });
  const vals = [label, Number(input.branch_id) || null, String(input.location || ''), input.purpose, target, input.active === false ? 0 : 1];
  if (id) db.prepare('UPDATE qr_codes SET label=?, branch_id=?, location=?, purpose=?, target=?, active=? WHERE id=?').run(...vals, id);
  else {
    let c;
    do c = code(6); while (db.prepare('SELECT 1 FROM qr_codes WHERE code = ?').get(c));
    id = Number(db.prepare('INSERT INTO qr_codes (label, branch_id, location, purpose, target, active, code) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...vals, c).lastInsertRowid);
  }
  return db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(id);
}

// الرابط المطبوع ثابت، والوجهة تحسب لحظة المسح
export function resolveQr(db, c) {
  const q = db.prepare('SELECT * FROM qr_codes WHERE code = ?').get(String(c).toUpperCase());
  if (!q || !q.active) return null;
  db.prepare('UPDATE qr_codes SET scans = scans + 1 WHERE id = ?').run(q.id);
  const params = new URLSearchParams({ qr: q.code });
  if (q.branch_id) params.set('branch', q.branch_id);
  if (q.purpose === 'subscribe') return { q, location: `/subscribe?${params}` };
  if (q.purpose === 'feedback') return { q, location: `/feedback?${params}` };
  const sep = q.target.includes('?') ? '&' : '?';
  return { q, location: `${q.target}${sep}${params}` };
}

export function qrImage(db, id) {
  const q = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(id);
  if (!q) fail(404, 'الرمز غير موجود');
  return { q, svg: qrSvg(`${config.publicUrl}/q/${q.code}`) };
}
