// أحداث قياس الرحلة: لا تحمل أرقامًا أو نصوص شكاوى
export const EVENT_NAMES = {
  qr_visit: 'زيارة رابط QR',
  subscribe_start: 'بدء الاشتراك',
  subscribe_confirmed: 'تأكيد الاشتراك',
  unsubscribe: 'إيقاف الاشتراك',
  offer_view: 'فتح تفاصيل العرض',
  whatsapp_click: 'نقر واتساب',
  call_click: 'نقر اتصال',
  directions_click: 'نقر الاتجاهات',
  google_review_click: 'فتح رابط تقييم Google',
  ticket_created: 'تذكرة أنشئت',
  ticket_resolved: 'تذكرة حلت',
  plus_join: 'انضمام إلى MAC+',
  plus_invoice: 'فاتورة عضو MAC+',
  request_created: 'طلب حجز أو استلام',
  look_view: 'فتح صفحة الإطلالات',
  gift_checkout: 'بدء شراء قسيمة',
  gift_paid: 'بيع قسيمة إهداء',
};

export function trackEvent(db, name, { branchId = null, qr = null, ref = null } = {}) {
  if (!(name in EVENT_NAMES)) return;
  db.prepare('INSERT INTO events (name, branch_id, qr_code, ref) VALUES (?, ?, ?, ?)')
    .run(name, branchId == null ? null : Number(branchId) || null, qr, ref == null ? null : String(ref).slice(0, 60));
}
