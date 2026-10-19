// جاهزية الموقع: فحص حي لكل قسم وربط، مع الخطوة التالية لكل بند
import { X509Certificate } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { json, sqlNow } from '../db.js';
import * as WQ from './waqr.js';

const env = process.env;
const ok = (title, detail = '') => ({ status: 'ok', title, detail });
const warn = (title, detail, steps = [], link = null) => ({ status: 'warn', title, detail, steps, link });
const todo = (title, detail, steps = [], link = null) => ({ status: 'todo', title, detail, steps, link });
const RW = 'Railway ← الخدمة ← Variables';

function certInfo(pem) {
  try { const c = new X509Certificate(pem); return { validTo: new Date(c.validTo), subject: c.subject }; } catch { return null; }
}
const daysLeft = (d) => Math.floor((d.getTime() - Date.now()) / 86400_000);

export function readiness(db) {
  const groups = [];
  const g = (key, title, why, items) => groups.push({ key, title, why, items });
  const branches = db.prepare('SELECT * FROM branches WHERE active = 1 ORDER BY sort, id').all();
  const sections = db.prepare('SELECT * FROM sections WHERE active = 1').all();
  const status = Object.fromEntries(db.prepare('SELECT * FROM integration_status').all().map((r) => [r.name, r]));
  const list = (rows) => rows.map((b) => b.short_name || b.name).join('، ');

  // ——— ١. التشغيل والأمان ———
  {
    const items = [];
    items.push(config.production ? ok('وضع الإنتاج مفعل') : todo('وضع الإنتاج غير مفعل', 'الموقع يعمل بإعدادات التجربة.', [`${RW}: أضف NODE_ENV=production`]));
    items.push(config.publicUrl.startsWith('https://') && !/railway\.app$/.test(config.publicUrl)
      ? ok('النطاق الرسمي', config.publicUrl)
      : todo('النطاق الرسمي غير مضبوط', `الروابط تُبنى على ${config.publicUrl}`, ['Railway ← Settings ← Networking: أضف النطاق maccenter.com.sa', 'عند مزود النطاق أضف سجل CNAME الذي يعطيك إياه Railway', `${RW}: أضف PUBLIC_URL=https://maccenter.com.sa`]));
    items.push(env.APP_SECRET ? ok('المفتاح السري APP_SECRET') : warn('APP_SECRET غير محدد', 'يُولد تلقائيًا ويحفظ في القرص؛ تعريفه صراحة أضمن عند نقل الخادم.', [`${RW}: أضف APP_SECRET بقيمة عشوائية طويلة (64 حرفًا)`]));
    const onVolume = config.dataDir === '/data' || config.dataDir.startsWith('/data/');
    items.push(onVolume ? ok('القرص الدائم /data') : warn('مجلد البيانات خارج /data', `المسار الحالي ${config.dataDir}. بدون قرص دائم تضيع البيانات مع كل نشر.`, ['Railway ← الخدمة ← Volumes: أضف Volume على المسار /data']));
    const dir = join(config.dataDir, 'backups');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.db')).sort() : [];
    const last = files.length ? statSync(join(dir, files[files.length - 1])).mtime : null;
    items.push(last && Date.now() - last.getTime() < 36 * 3600_000 ? ok('النسخ الاحتياطي اليومي', `آخر نسخة ${files[files.length - 1]} · ${files.length} نسخة محفوظة`)
      : warn('لا توجد نسخة احتياطية حديثة', 'تُنشأ نسخة يومية تلقائيًا في /data/backups بعد ساعة من التشغيل.', ['انسخ مجلد /data/backups خارج Railway أسبوعيًا (Google Drive مثلًا)']));
    if (env.ADMIN_PASSWORD) items.push(warn('كلمة مرور المدير ما زالت في المتغيرات', 'تُستخدم لأول تشغيل فقط.', [`${RW}: احذف ADMIN_PASSWORD و ADMIN_RESET بعد الدخول`]));
    const admins = db.prepare("SELECT name, totp_secret FROM users WHERE role = 'admin' AND active = 1").all();
    const no2fa = admins.filter((a) => !a.totp_secret);
    items.push(no2fa.length ? todo('التحقق الثنائي للمديرين', `بدون تحقق ثنائي: ${no2fa.map((a) => a.name).join('، ')}`, ['من «حسابي» في اللوحة: فعّل التحقق الثنائي بتطبيق Google Authenticator'], '#/profile') : ok('التحقق الثنائي مفعل لكل المديرين'));
    g('ops', 'التشغيل والأمان', 'أساس كل شيء: نطاق رسمي، بيانات لا تضيع، ودخول محمي.', items);
  }

  // ——— ٢. محتوى الموقع ———
  {
    const items = [];
    const noHours = branches.filter((b) => !b.hours);
    items.push(noHours.length ? todo('دوام الفروع', `بلا دوام معتمد: ${list(noHours)} (يظهر «تواصل لمعرفة الدوام»)`, ['«الفروع والدوام» ← الفرع ← الدوام الأسبوعي واستثناءات رمضان والأعياد'], '#/branches') : ok('دوام كل الفروع معتمد'));
    const noMaps = branches.filter((b) => !b.maps_url || !b.google_review_url);
    items.push(noMaps.length ? todo('روابط الخرائط والتقييم', `ناقصة في: ${list(noMaps)}`, ['«الفروع والدوام»: الصق رابط Google Maps الرسمي ورابط كتابة التقييم لكل فرع'], '#/branches') : ok('روابط الخرائط والتقييم مكتملة'));
    const noGeo = branches.filter((b) => !b.lat || !b.lng);
    items.push(noGeo.length ? warn('إحداثيات الفروع', `بدون إحداثيات: ${list(noGeo)}. تُستخدم لإظهار بطاقة Apple Wallet عند الاقتراب من الفرع.`, ['«الفروع والدوام»: أضف خط العرض والطول من Google Maps (اضغط مطولًا على موقع الفرع)'], '#/branches') : ok('إحداثيات الفروع مضبوطة'));
    const noImgB = branches.filter((b) => !b.image), noImgS = sections.filter((s) => !s.image);
    items.push(noImgB.length || noImgS.length ? warn('الصور الحقيقية', `بلا صور: ${[...noImgB.map((b) => b.short_name), ...noImgS.map((s) => s.name)].join('، ')}. تظهر رسومات الخط بدلها.`, ['صوّر واجهة كل فرع وكل قسم بإضاءة جيدة', 'ارفعها من «الفروع والدوام» و«الأقسام والمحتوى»'], '#/content') : ok('صور الفروع والأقسام'));
    const site = json.parse(db.prepare("SELECT value FROM settings WHERE key = 'site'").get()?.value, {}) || {};
    const socials = Object.values(site.socials || {}).filter(Boolean).length;
    items.push(socials ? ok('حسابات التواصل', `${socials} حساب`) : warn('حسابات التواصل الاجتماعي', 'لا تظهر في الموقع.', ['«الأقسام والمحتوى» ← نصوص الموقع: أضف روابط إنستغرام وسناب وتيك توك وإكس'], '#/content'));
    items.push(warn('سياسة الخصوصية', 'النص الحالي مسودة. راجعها مع مستشار قانوني وفق نظام حماية البيانات الشخصية (PDPL).', ['اعتمد النص وأرسله لي لتحديث صفحة /privacy']));
    g('content', 'محتوى الموقع', 'ما يراه العميل أولًا: دوام صحيح، خرائط، صور حقيقية.', items);
  }

  // ——— ٣. واتساب ———
  {
    const items = [];
    const d = config.whatsapp.driver;
    if (d === 'cloud') {
      const miss = ['phoneNumberId', 'token', 'appSecret', 'verifyToken'].filter((k) => !config.whatsapp[k]);
      items.push(miss.length ? todo('متغيرات WhatsApp Cloud API ناقصة', miss.join('، '), [`${RW}: أكمل WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_ACCESS_TOKEN و WHATSAPP_APP_SECRET و WHATSAPP_VERIFY_TOKEN`]) : ok('واتساب الرسمي (Cloud API)', `الرقم ${config.whatsapp.phone}`));
      const s = status.whatsapp;
      if (s) items.push(s.ok ? ok('آخر فحص للربط ناجح') : todo('انقطاع ربط واتساب', s.message || '', ['«الربط» في اللوحة ← فحص الآن'], '#/integrations'));
      const lastIn = db.prepare('SELECT MAX(last_inbound_at) t FROM contacts').get().t;
      items.push(lastIn ? ok('الرسائل الواردة تصل', `آخر رسالة ${lastIn}`) : todo('لم تصل أي رسالة واردة', 'بدونها لا يكتمل الاشتراك ولا الانضمام لـ MAC+.', ['Meta ← WhatsApp ← Configuration ← Webhook:', `الرابط ${config.publicUrl}/api/webhooks/whatsapp`, 'Verify Token = قيمة WHATSAPP_VERIFY_TOKEN، واشترك في حقل messages', 'أرسل رسالة تجربة للرقم']));
      const templates = db.prepare("SELECT COUNT(*) n FROM offers WHERE template_name IS NOT NULL AND template_name != ''").get().n;
      items.push(templates ? ok('قالب العروض المعتمد') : warn('قوالب رسائل Meta', 'رسائل العروض، وتسليم قسائم الإهداء لمن لم يراسلكم، تحتاج قوالب معتمدة.', ['Meta ← WhatsApp Manager ← Message templates: أنشئ قالبًا تسويقيًا mac_offer_ar وقالب خدمة mac_gift_ar', 'بعد الاعتماد اكتب اسم القالب في العرض']));
    } else if (d === 'qr') {
      const st = WQ.status();
      items.push(st.status === 'open' ? ok('واتساب مربوط بمسح QR', 'تنبيه: ليس واجهة رسمية، والإرسال الجماعي قد يعرض الرقم للحظر.')
        : todo('رقم واتساب غير مربوط', 'الرسائل لن تُرسل.', ['«الربط» ← إشعارات واتساب ← ربط رقم بمسح QR', 'من الجوال: واتساب ← الأجهزة المرتبطة ← ربط جهاز'], '#/integrations'));
      items.push(warn('الانتقال للربط الرسمي', 'للعروض الجماعية بأمان انتقل إلى WhatsApp Cloud API.', ['اتبع خطوات «واتساب الرسمي» في LAUNCH.md', `${RW}: WHATSAPP_DRIVER=cloud`]));
    } else {
      items.push(todo('واتساب في وضع التجربة', 'لا تخرج أي رسالة: الاشتراك، الترحيب، إيصالات MAC+، الحجز، القسائم.', [
        'Meta Business Suite ← أنشئ تطبيقًا وأضف منتج WhatsApp، وسجّل الرقم الرسمي',
        'أنشئ System User واستخرج Access Token دائمًا',
        `${RW}: WHATSAPP_DRIVER=cloud و WHATSAPP_PHONE_NUMBER و WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_ACCESS_TOKEN و WHATSAPP_APP_SECRET و WHATSAPP_VERIFY_TOKEN`,
        `Webhook: ${config.publicUrl}/api/webhooks/whatsapp وحقل messages`,
        'بديل سريع مؤقت: WHATSAPP_DRIVER=qr ثم اربط الرقم بمسح QR من «الربط»']));
    }
    const noWa = db.prepare("SELECT COUNT(*) n FROM users WHERE active = 1 AND (wa_phone IS NULL OR wa_phone = '')").get().n;
    if (noWa) items.push(warn('تنبيهات الفريق', `${noWa} موظف بلا رقم واتساب في حسابه، فلا تصله تنبيهات التذاكر والحجوزات.`, ['«الفريق والتوجيه»: أضف رقم واتساب لكل موظف'], '#/team'));
    g('whatsapp', 'واتساب', 'قناة كل الأنظمة: الاشتراك، MAC+، الحجز، الإيصالات، والقسائم.', items);
  }

  // ——— ٤. Google ———
  {
    const items = [];
    if (config.google.driver === 'api') {
      const miss = ['clientId', 'clientSecret', 'refreshToken', 'accountId'].filter((k) => !config.google[k]);
      items.push(miss.length ? todo('متغيرات Google ناقصة', miss.join('، ')) : ok('Google Business Profile مربوط'));
      const noLoc = branches.filter((b) => !b.google_location_id);
      items.push(noLoc.length ? todo('معرفات المواقع في Google', `ناقصة في: ${list(noLoc)}`, ['«الفروع والدوام»: أضف «معرف الموقع في Google» لكل فرع'], '#/branches') : ok('كل الفروع مرتبطة بمواقعها في Google'));
      if (status.google && !status.google.ok) items.push(todo('انقطاع ربط Google', status.google.message || '', [], '#/integrations'));
    } else {
      items.push(todo('تقييمات Google في وضع التجربة', 'لا تُسحب التقييمات الحقيقية ولا تُرسل الردود.', [
        'Google Cloud Console: أنشئ مشروعًا واطلب الوصول إلى Business Profile APIs (قد يستغرق أيامًا)',
        'أنشئ OAuth Client، واستخرج Refresh Token من الحساب المالك للمواقع',
        `${RW}: GOOGLE_DRIVER=api و GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET و GOOGLE_REFRESH_TOKEN و GOOGLE_ACCOUNT_ID`,
        '«الفروع والدوام»: معرف الموقع لكل فرع']));
    }
    g('google', 'تقييمات Google', 'سحب التقييمات والرد عليها من اللوحة.', items);
  }

  // ——— ٥. MAC+ ———
  {
    const items = [];
    const plusSt = db.prepare("SELECT 1 FROM settings WHERE key = 'plus'").get();
    items.push(plusSt ? ok('إعدادات MAC+ مراجعة') : warn('إعدادات MAC+ افتراضية', 'نسب خطوط العربة 2% و3% و5%، والدعوة 20 ريالًا، وصلاحية الرصيد 60 يومًا.', ['«تجربة MAC+» ← الإعدادات: راجع النسب والحدود واحفظ'], '#/pilot'));
    const cashiers = db.prepare("SELECT COUNT(*) n FROM users WHERE active = 1 AND role IN ('agent','branch_manager')").get().n;
    items.push(cashiers ? ok('حسابات الكاشير', `${cashiers} حساب`) : todo('حسابات الكاشير', 'لا يوجد موظف بدور «موظف خدمة» أو «مدير فرع» يستخدم نقطة MAC+.', ['«الفريق والتوجيه»: أضف حسابًا لكل كاشير بفرعه', 'درّب الفريق: البحث بالجوال ← اختيار الأقسام ← تسجيل الفاتورة'], '#/team'));
    const members = db.prepare("SELECT COUNT(*) n FROM members WHERE status = 'active'").get().n;
    items.push(members ? ok('الأعضاء', `${members} عضو`) : warn('لا يوجد أعضاء بعد', 'ابدأ بفرع واحد تجريبي.', ['اطبع QR لصفحة /plus عند الكاشير', 'نص قصير للكاشير: «تبي توفر أكثر؟ سجل رقمك في MAC+ وكل قسم تضيفه يرفع خصمك»']));
    const looks = db.prepare('SELECT COUNT(*) n FROM looks WHERE active = 1').get().n;
    items.push(looks ? ok('إطلالات المناسبات', `${looks} إطلالة`) : todo('صفحة «عندك مناسبة؟» فارغة', '', ['«إطلالات المناسبات»: أضف 6 إطلالات على الأقل (عيد، زواج، مدرسة…) بصور حقيقية'], '#/looks'));
    const days = db.prepare("SELECT COUNT(*) n FROM branch_days WHERE day >= date('now','-7 days')").get().n;
    items.push(days ? ok('أرقام الفروع اليومية', 'نسبة العميل المعروف تُحسب') : warn('أرقام الفروع اليومية', 'بدونها لا تُحسب نسبة العميل المعروف ولا مقارنة متوسط الفاتورة.', ['فعّل ربط النظام المحاسبي (تُحسب تلقائيًا)، أو أدخلها يوميًا من «تجربة MAC+»'], '#/pilot'));
    g('plus', 'MAC+ والحجز', 'العضوية، خطوط العربة، الحجز والاستلام، الإطلالات.', items);
  }

  // ——— ٦. النظام المحاسبي ———
  {
    const items = [];
    if (!config.erp.secret) {
      items.push(todo('ربط النظام المحاسبي غير مفعل', 'الكاشير يكتب رقم الفاتورة ومبلغها يدويًا.', [
        `${RW}: أضف ERP_WEBHOOK_SECRET بقيمة عشوائية طويلة`,
        'سلّم مزود «أمازون» القيمة نفسها مع ملف docs/erp-webhook.md',
        `عنوان الاستقبال: ${config.publicUrl}/api/webhooks/erp`]));
    } else {
      const last = db.prepare('SELECT MAX(received_at) t FROM erp_invoices').get().t;
      items.push(last ? ok('الفواتير تصل', `آخر فاتورة ${last}`) : todo('لم تصل أي فاتورة', 'المفتاح مضبوط وننتظر أول فاتورة من المزود.', ['اطلب من المزود إرسال فاتورة تجربة']));
      const un = db.prepare("SELECT COUNT(*) n FROM erp_invoices WHERE status = 'unmapped'").get().n;
      if (un) items.push(todo('فواتير بانتظار الربط', `${un} فاتورة برموز فروع أو تصنيفات غير مربوطة`, ['«ربط النظام المحاسبي»: اربط كل رمز بفرعه وكل تصنيف بقسمه'], '#/erp'));
    }
    g('erp', 'النظام المحاسبي', 'فواتير تصل تلقائيًا: مكافآت الأعضاء وأرقام الفروع بلا إدخال يدوي.', items);
  }

  // ——— ٧. الدفع وقسائم الإهداء ———
  {
    const items = [];
    const key = config.payments.moyasarSecret || '';
    if (config.payments.driver !== 'moyasar') {
      items.push(todo('بوابة الدفع غير مربوطة', 'بيع قسائم الإهداء متوقف في الموقع («قريبًا»).', [
        'سجّل حساب تاجر في Moyasar (سجل تجاري وحساب بنكي باسم المنشأة)',
        'فعّل مدى وفيزا وApple Pay من لوحة Moyasar',
        `${RW}: MOYASAR_SECRET_KEY = المفتاح السري (sk_live_…)`,
        'جرّب بمفتاح sk_test_ أولًا ثم بدّله بالحي']));
    } else {
      items.push(key.startsWith('sk_test_') ? warn('Moyasar في وضع الاختبار', 'لا تُحصّل مبالغ حقيقية.', [`${RW}: بدّل MOYASAR_SECRET_KEY بالمفتاح الحي sk_live_`]) : ok('Moyasar مربوط'));
      const pend = db.prepare("SELECT COUNT(*) n FROM gift_orders WHERE status = 'pending' AND created_at < datetime('now','-1 hour')").get().n;
      if (pend) items.push(warn('دفعات معلقة', `${pend} طلب لم يتأكد دفعه منذ أكثر من ساعة`, ['راجعها في لوحة Moyasar'], '#/giftcards'));
    }
    const giftSt = db.prepare("SELECT 1 FROM settings WHERE key = 'giftcards'").get();
    items.push(giftSt ? ok('إعدادات القسائم مراجعة') : warn('شروط القسائم وصلاحيتها', 'الافتراضي: 50 إلى 3000 ريال، صلاحية سنة.', ['تأكد من توافق الصلاحية والشروط مع أنظمة وزارة التجارة لبطاقات الإهداء', '«قسائم الإهداء» ← الإعدادات'], '#/giftcards'));
    g('pay', 'الدفع وقسائم الإهداء', 'بيع القسائم إلكترونيًا واستخدامها في الفروع.', items);
  }

  // ——— ٨. Apple Wallet ———
  {
    const items = [];
    const C = config.appleWallet;
    const miss = [['APPLE_PASS_TYPE_ID', C.passTypeId], ['APPLE_TEAM_ID', C.teamId], ['APPLE_PASS_CERT', C.cert], ['APPLE_PASS_KEY', C.key], ['APPLE_WWDR_CERT', C.wwdr]].filter(([, v]) => !v).map(([k]) => k);
    if (miss.length === 5) {
      items.push(todo('بطاقات Apple Wallet غير مفعلة', 'زر «أضف إلى Apple Wallet» مخفي لبطاقة العضو والقسائم.', [
        'اشترك في Apple Developer Program باسم المنشأة (99 دولارًا سنويًا، يحتاج رقم D-U-N-S)',
        'Certificates, IDs & Profiles ← Identifiers ← Pass Type IDs: أنشئ pass.sa.maccenter.plus',
        'أنشئ شهادة Pass Type ID من طلب CSR، ونزّلها، وحوّلها مع المفتاح إلى PEM',
        'نزّل شهادة Apple WWDR (G4)',
        `${RW}: APPLE_PASS_TYPE_ID و APPLE_TEAM_ID و APPLE_PASS_CERT و APPLE_PASS_KEY و APPLE_WWDR_CERT`]));
    } else if (miss.length) {
      items.push(todo('متغيرات Apple Wallet ناقصة', miss.join('، ')));
    } else {
      const c = certInfo(C.cert);
      if (!c) items.push(todo('شهادة Apple غير صالحة', 'تعذرت قراءة APPLE_PASS_CERT.'));
      else {
        const left = daysLeft(c.validTo);
        items.push(left < 30 ? warn('شهادة Apple Wallet قاربت الانتهاء', `تنتهي خلال ${left} يومًا`, ['جدّد شهادة Pass Type ID وحدّث APPLE_PASS_CERT و APPLE_PASS_KEY']) : ok('Apple Wallet مفعل', `الشهادة صالحة ${left} يومًا`));
        if (!c.subject.includes(C.passTypeId)) items.push(warn('الشهادة لا تطابق Pass Type ID', `المعرف ${C.passTypeId} غير موجود في الشهادة.`));
      }
      const devices = db.prepare('SELECT COUNT(*) n FROM wallet_devices').get().n;
      items.push(ok('أجهزة مسجلة للتحديث', `${devices} جهاز`));
    }
    g('wallet', 'Apple Wallet', 'بطاقة العضو والقسيمة في جوال العميل، ورصيد يتحدث تلقائيًا.', items);
  }

  const all = groups.flatMap((x) => x.items);
  const score = Math.round((all.reduce((s, i) => s + (i.status === 'ok' ? 1 : i.status === 'warn' ? 0.5 : 0), 0) / all.length) * 100);
  return { score, checkedAt: sqlNow(), groups, counts: { ok: all.filter((i) => i.status === 'ok').length, warn: all.filter((i) => i.status === 'warn').length, todo: all.filter((i) => i.status === 'todo').length } };
}
