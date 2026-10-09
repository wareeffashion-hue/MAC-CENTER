import { api, esc, ic, fmtDT, emptyState } from '../core.js';

const ACTIONS = {
  'auth.login': 'تسجيل دخول', 'user.create': 'إضافة موظف', 'user.update': 'تعديل موظف', 'user.password': 'تغيير كلمة المرور', 'user.2fa_on': 'تفعيل التحقق الثنائي', 'user.2fa_off': 'إيقاف التحقق الثنائي', 'user.2fa_reset': 'إعادة ضبط التحقق الثنائي',
  'offer.create': 'إنشاء عرض', 'offer.update': 'تعديل عرض', 'offer.submit': 'إرسال عرض للمراجعة', 'offer.approve': 'اعتماد عرض', 'offer.reject': 'رفض عرض', 'offer.cancel': 'إلغاء عرض',
  'campaign.create': 'إنشاء حملة', 'campaign.test': 'رسالة اختبار', 'campaign.schedule': 'اعتماد جدولة حملة', 'campaign.pause': 'إيقاف حملة', 'campaign.cancel': 'إلغاء حملة', 'message.retry': 'إعادة إرسال رسالة',
  'subscribers.export': 'تصدير المشتركين', 'subscriber.stop': 'إيقاف مشترك', 'subscriber.update': 'تعديل اهتمامات مشترك',
  'review.reply': 'نشر رد على تقييم', 'review.instructions': 'تعديل تعليمات الرد', 'review.feature': 'إظهار تقييم', 'review.ignore': 'تقييم بلا إجراء', 'review.draft': 'مسودة رد',
  'branch.create': 'إضافة فرع', 'branch.update': 'تعديل فرع', 'section.create': 'إضافة قسم', 'section.update': 'تعديل قسم', 'faq.delete': 'حذف سؤال',
  'qr.create': 'إنشاء رمز QR', 'qr.update': 'تعديل رمز QR', 'routing.create': 'قاعدة توجيه', 'routing.delete': 'حذف قاعدة توجيه', upload: 'رفع صورة',
  'ticket.create': 'تذكرة يدوية', 'ticket.acknowledge': 'استلام تذكرة', 'ticket.assign': 'إسناد تذكرة', 'ticket.status': 'تغيير حالة تذكرة', 'ticket.priority': 'تغيير أولوية', 'ticket.classify': 'تصحيح تصنيف', 'ticket.note': 'ملاحظة داخلية', 'ticket.contact': 'توثيق تواصل',
};

export async function render(view) {
  const { items } = await api('/audit');
  view.innerHTML = `<p class="muted">آخر 300 عملية حساسة: الصلاحيات والتعليمات والنشر والإرسال والإغلاق والتصدير.</p>
  <section class="card">${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الموظف</th><th>العملية</th><th>العنصر</th><th>التفاصيل</th></tr></thead><tbody>
  ${items.map((a) => `<tr><td class="small">${fmtDT(a.at)}</td><td>${esc(a.user_name || 'النظام')}</td><td>${esc(ACTIONS[a.action] || a.action)}</td><td class="small muted">${esc(a.entity || '')} ${a.entity_id ? '#' + esc(a.entity_id) : ''}</td><td class="small"><span class="code">${esc((a.detail || '').slice(0, 120))}</span></td></tr>`).join('')}
  </tbody></table></div>` : emptyState('لا توجد عمليات بعد', 'log')}</section>`;
}
