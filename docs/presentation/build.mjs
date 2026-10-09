// يبني ملف العرض لإدارة ماك سنتر: deck.html ثم PDF بمقاس 1920×1080
// الاستخدام: node docs/presentation/build.mjs   (يحتاج Playwright لإخراج PDF)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch } from '../../src/views/art.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', '..', 'public');
const logo = (f, cls) => readFileSync(join(pub, 'img', f), 'utf8').replace('<svg ', `<svg class="${cls}" `).replace(/<style>.*?<\/style>/, '');
const LOGO_H = logo('logo-horizontal.svg', 'logo');
const LOGO_V = logo('logo-vertical.svg', 'logo');
const N = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const img = (f, cls = 'shot') => `<img class="${cls}" src="img/${f}" alt="">`;
const phone = (f) => `<div class="phone">${img(f, 'p-img')}</div>`;

const slides = [];
const add = (theme, body, { foot = true } = {}) => slides.push({ theme, body, foot });

// ١ الغلاف
add('dark cover', `
  <div class="cover-copy">
    <div class="cover-logo">${LOGO_H}</div>
    <h1>المنصة الرقمية<br><span class="gold light">لماك سنتر</span></h1>
    <p class="lead">الموقع · الاشتراك في العروض عبر واتساب · خدمة العملاء · تقييمات Google · لوحة الإدارة</p>
    <p class="meta">عرض مقدم لإدارة ماك سنتر ومجمع عادل الدولي · أكتوبر ٢٠٢٦</p>
  </div>
  <div class="cover-arch">${arch('fashion', { draw: false })}</div>`, { foot: false });

// ٢ الفرصة
add('light', `
  <p class="kicker">الفرصة</p>
  <h2>الزيارة تنتهي عند الباب.<br><span class="soft">ونريدها أن تبدأ منه.</span></h2>
  <div class="cols4">
    ${[
      ['العروض', 'لا توجد قناة مباشرة تعيد العميل إلى الفرع عند إطلاق عرض يهمه.'],
      ['الملاحظات', 'الشكوى أو المقترح يقال للموظف ثم يضيع، دون رقم متابعة أو مسؤول محدد.'],
      ['التقييمات', 'تقييمات خرائط Google تتراكم في الفروع الثلاثة دون آلية رد موحدة.'],
      ['الحضور الرقمي', 'الموقع الحالي maccenter.com.sa ظهر تحت الصيانة عند الفحص في ٩ أكتوبر ٢٠٢٦.'],
    ].map(([t, d], i) => `<div class="c"><span class="n">${N(i + 1)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}
  </div>`);

// ٣ الفكرة
add('dark', `
  <p class="kicker">الفكرة</p>
  <p class="statement">نحوّل كل زيارة للمجمع إلى <b class="gold">علاقة مستمرة</b>: عروض يختارها العميل بنفسه، وصوت يُسمع ويُتابَع، وسمعة تُدار بعناية.</p>
  <div class="cols4 on-dark">
    ${[['موقع', 'هوية فاخرة تعرض الأقسام الستة والفروع الثلاثة'], ['واتساب', 'اشتراك بموافقة صريحة وعروض حسب الاهتمام'], ['خدمة', 'تذاكر برقم متابعة وتوجيه وتصعيد تلقائي'], ['سمعة', 'متابعة تقييمات Google والرد وفق قواعد الإدارة']]
      .map(([t, d], i) => `<div class="c"><span class="n">${N(i + 1)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}
  </div>`);

// ٤ الاتجاه الإبداعي
add('light split', `
  <div>
    <p class="kicker">الاتجاه الإبداعي</p>
    <h2>نوافذ ماك</h2>
    <p class="body">تستلهم الواجهة نوافذ العرض داخل المجمع. نافذة مقوسة واحدة تتكرر كعلامة، بإطار ذهبي رفيع، يرسم داخلها كل قسم نفسه بخط ذهبي، وتتحرك عربة الشعار على أرضية الواجهة.</p>
    <ul class="ticks">
      <li>ألوان ملف الشعار: الأخضر <span class="sw" style="background:#084832"></span><span class="sw" style="background:#006442"></span><span class="sw" style="background:#0C714F"></span> والأصفر <span class="sw" style="background:#FFBA1D"></span><span class="sw" style="background:#FFAE00"></span><span class="sw" style="background:#FFC72E"></span></li>
      <li>خط Gamila Arabic المعتمد، بأوزانه الخفيف والعادي والعريض</li>
      <li>خطوط رفيعة ومساحات واسعة بدل البطاقات والأيقونات المزدحمة</li>
      <li>الرسوم الخطية بديل مؤقت، وتحل محلها الصور الحقيقية للأقسام فور اعتمادها</li>
    </ul>
  </div>
  <div class="frame">${img('site-hero.jpg')}</div>`);

// حركة الشعار
add('dark split', `
  <div>
    <p class="kicker">حركة الشعار</p>
    <h2>العربة تفتح<br><span class="soft">عالم ماك</span></h2>
    <ol class="steps">
      <li><b>تدخل العربة</b> بخطوط السرعة المأخوذة من الشعار نفسه</li>
      <li><b>تتفتح ست نوافذ</b> حولها للأقسام، يرسم كل قسم خطوطه الذهبية</li>
      <li><b>تنطوي النوافذ</b> عائدة إلى العربة، وتكتمل الكلمة بالعربية ثم الإنجليزية</li>
      <li><b>يستقر الشعار</b> في مكانه بالترويسة برسمه الأصلي دون أي تعديل</li>
    </ol>
    <p class="body" style="margin-top:24px;font-size:22px">تُعرض مرة واحدة في الزيارة، ويمكن تخطيها بأي ضغطة، وإعادتها بالضغط على الشعار.</p>
  </div>
  <div class="frame">${img('site-intro.jpg')}</div>`);

// ٥ الحركة
add('dark', `
  <p class="kicker">الحركة</p>
  <h2>حركة هادئة <span class="gold light">توحي بالفخامة</span></h2>
  <div class="grid3">
    ${[
      ['site-hero-2.jpg', 'واجهة العرض', 'تتبدل الأقسام في النافذة بمسح عمودي، ويرسم كل قسم خطوطه الذهبية، وتتحرك العربة مع كل تبديل.'],
      ['site-depts.jpg', 'معرض الأقسام', 'يتحرك المعرض أفقيًا بينما يمرر الزائر الصفحة عموديًا، كأنه يمشي بين واجهات المجمع.'],
      ['site-menu.jpg', 'القائمة والانتقالات', 'ستارة خضراء تكشف القائمة والصفحات، وأزرار بسهم يتمدد، ومؤشر «اكتشف» فوق العناصر.'],
    ].map(([f, t, d]) => `<div class="g"><div class="frame sm">${img(f)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
  </div>
  <p class="note">مدد الحركة بين ١٨٠ و٩٠٠ مللي ثانية حسب طلب الإدارة، ويُحترم خيار «تقليل الحركة» في الجهاز فتتحول إلى ظهور ثابت.</p>`);

// ٦ رحلة العميل
add('light', `
  <p class="kicker">رحلة العميل</p>
  <h2>من ملصق QR إلى عرض يهمه</h2>
  <ol class="flow">
    ${[
      ['يمسح الرمز', 'الملصق يحدد الفرع وموقعه داخل المجمع تلقائيًا'],
      ['يختار', 'الفروع والأقسام التي تهمه، والاسم اختياري'],
      ['يوافق ويرسل', 'رسالة واتساب جاهزة برمز ربط مؤقت، يرسلها بنفسه'],
      ['يتأكد اشتراكه', 'لا تظهر حالة «مكتمل» قبل وصول رسالته فعلًا'],
      ['تصله عروضه', 'حسب فرعه وقسمه فقط، ويوقفها بكلمة «إيقاف»'],
    ].map(([t, d], i) => `<li><span class="n">${N(i + 1)}</span><b>${t}</b><p>${d}</p></li>`).join('')}
  </ol>
  <div class="phones">${phone('m-hero.jpg')}${phone('m-subscribe.jpg')}${phone('m-feedback.jpg')}</div>`);

// ٧ الموقع
add('light split', `
  <div>
    <p class="kicker">الموقع العام</p>
    <h2>كل ما يحتاجه الزائر،<br><span class="soft">بلا ازدحام</span></h2>
    <ul class="ticks">
      <li>الأقسام الستة المعتمدة فقط، ولكل قسم لوحة بالفروع المتاح فيها واستفسار واتساب</li>
      <li>صفحة لكل فرع برابط ثابت: الموقع، والدوام متعدد الفترات، و«مفتوح الآن» بتوقيت الرياض</li>
      <li>رسالة الاستفسار تذكر الفرع والقسم أو العرض الذي جاء منه العميل</li>
      <li>نموذج ملاحظات بصور ورقم متابعة، ورابط Google يظهر للجميع بالوضوح نفسه</li>
    </ul>
  </div>
  <div class="stack">
    <div class="frame">${img('site-branch-open.jpg')}</div>
    <div class="frame offset">${img('site-branch-page.jpg')}</div>
  </div>`);

// ٨ واتساب
add('dark split', `
  <div>
    <p class="kicker">الاشتراك والعروض عبر واتساب</p>
    <h2>تسويق يحترم<br><span class="gold light">اختيار العميل</span></h2>
  </div>
  <div class="rules">
    ${[
      ['موافقة صريحة', 'مربع الموافقة غير محدد مسبقًا، ويحفظ نصها وإصدارها وتاريخها'],
      ['تأكيد فعلي', 'فتح الرابط لا يعد اشتراكًا؛ المؤكد فقط من وصلت رسالته'],
      ['إيقاف فوري', 'كليًا أو لفرع أو قسم، ويُطبق على الرسائل المنتظرة قبل إرسالها'],
      ['سقف أسبوعي', 'رسالتان تسويقيتان أسبوعيًا لكل عميل، وساعات إرسال محددة'],
      ['حملة منضبطة', 'رسالة اختبار إلزامية، ومعاينة الجمهور والتكلفة، وسقف ميزانية'],
      ['بلا تكرار', 'لا تصل الرسالة للعميل مرتين في الحملة، ويُتحقق من العرض قبل كل رسالة'],
    ].map(([t, d], i) => `<div class="r"><span class="n">${N(i + 1)}</span><b>${t}</b><p>${d}</p></div>`).join('')}
  </div>`);

// ٩ خدمة العملاء
add('light split', `
  <div>
    <p class="kicker">الشكاوى والمقترحات</p>
    <h2>لا ملاحظة<br>بلا مالك</h2>
    <ol class="steps">
      <li><b>تُحفظ أولًا</b> ثم يصدر رقم المتابعة؛ تعذر الإشعار لا يفقد البلاغ</li>
      <li><b>تُوجَّه</b> للموظف المسؤول حسب الفرع والقسم والموضوع، أو لطابور الفرع</li>
      <li><b>تُصعَّد</b> للبديل ثم للمدير إذا لم تُستلم خلال ٣٠ دقيقة من الدوام</li>
      <li><b>تُغلق بسبب</b> موثق، ويتتبعها العميل برابط آمن</li>
    </ol>
  </div>
  <div class="frame">${img('admin-tickets-2.jpg')}</div>`);

// ١٠ تقييمات Google
add('dark', `
  <p class="kicker">تقييمات Google</p>
  <h2>رد سريع حيث يجب، <span class="gold light">وإنسان حيث يلزم</span></h2>
  <table class="tbl">
    <tr><th>الحالة</th><th>الاستجابة</th></tr>
    <tr><td>٤ أو ٥ نجوم ونص إيجابي واضح</td><td>رد قصير من قوالب الإدارة، تلقائيًا فقط بعد موافقة صريحة مسجلة</td></tr>
    <tr><td>نجوم مرتفعة مع شكوى في النص</td><td>تذكرة ومسودة رد وتنبيه المسؤول</td></tr>
    <tr><td>١ إلى ٣ نجوم أو حالة ملتبسة</td><td>تنبيه ومسودة للمراجعة، مع إمكان إقرار استلام ثابت</td></tr>
    <tr><td>ادعاء حساس أو بيانات شخصية</td><td>مراجعة بشرية قبل النشر، وتذكرة عاجلة</td></tr>
  </table>
  <p class="note">نص العميل لا يدخل في صياغة الرد ولا تُنفذ أي تعليمات فيه · لا يُستبدل رد بشري تلقائيًا · لا انتقاء للراضين وفق سياسة Google</p>`);

// ١١ لوحة الإدارة
add('light split wide', `
  <div>
    <p class="kicker">لوحة الإدارة</p>
    <h2>يوم الإدارة<br><span class="soft">في شاشة واحدة</span></h2>
    <p class="body">التذاكر الجديدة والمتأخرة، والتقييمات التي تحتاج ردًا، والحملات القادمة، وحالة ربط واتساب وGoogle.</p>
    <ul class="list2">
      ${['التذاكر', 'تقييمات Google', 'العروض', 'الحملات', 'المشتركون', 'رموز QR', 'الفروع والدوام', 'الأقسام والمحتوى', 'الفريق والتوجيه', 'التقارير', 'الربط', 'سجل التدقيق', 'الإعدادات', 'التحقق الثنائي'].map((t) => `<li>${t}</li>`).join('')}
    </ul>
  </div>
  <div class="frame">${img('admin-today.jpg')}</div>`);

// ١٢ الحملات والتقارير
add('light', `
  <p class="kicker">القياس</p>
  <h2>أرقام صادقة <span class="soft">تقول ما تثبته فقط</span></h2>
  <div class="grid2">
    <div class="frame sm">${img('admin-campaigns-1.jpg')}</div>
    <div class="frame sm">${img('admin-reports.jpg')}</div>
  </div>
  <p class="note dark-note">زيارة رابط QR لا تُحسب اشتراكًا · فتح رابط التقييم لا يعني نشر تقييم · القراءة تُعرض فقط عند ورودها من واتساب · النسب تذكر مقامها</p>`);

// ١٣ الأدوار
add('dark', `
  <p class="kicker">الصلاحيات</p>
  <h2>كل موظف يرى <span class="gold light">ما يخصه فقط</span></h2>
  <table class="tbl">
    <tr><th>الدور</th><th>الصلاحية</th></tr>
    <tr><td>مدير النظام</td><td>الفروع والموظفون والتكاملات والقواعد والمحتوى والتقارير والصلاحيات</td></tr>
    <tr><td>مدير الفرع</td><td>تذاكر فرعه ومحتواه ودوامه وتقاريره، والإسناد والتصعيد</td></tr>
    <tr><td>موظف خدمة العملاء</td><td>التذاكر المسندة إليه وطابور فرعه</td></tr>
    <tr><td>مسؤول التسويق</td><td>العروض والحملات والمشتركون ورموز QR</td></tr>
    <tr><td>مراجع الردود</td><td>مسودات تقييمات Google في الفروع المخولة</td></tr>
  </table>
  <p class="note">موظف قباء لا يصل إلى بيانات الدائري ما لم تُمنح له صلاحية محددة.</p>`);

// ١٤ الأمان والجودة
add('light', `
  <p class="kicker">الأمان والجودة</p>
  <h2>مبني ليُعتمد عليه</h2>
  <div class="nums">
    ${[['٤٦', 'اختبارًا آليًا', 'تغطي الدوام والاشتراك والحملات والتذاكر والتقييمات والصلاحيات'], ['١٧', 'كيلوبايت', 'حجم الصفحة الرئيسية المضغوطة، لتفتح بسرعة على شبكة الجوال'], ['٣٦٠', 'بكسل', 'أصغر شاشة مختبرة دون تمرير أفقي، حتى ١٤٤٠ بكسل'], ['٣٠', 'يومًا', 'أقصى مدة لتخزين نصوص تقييمات Google وفق سياستها']]
      .map(([n, u, d]) => `<div class="num"><b>${n}</b><span>${u}</span><p>${d}</p></div>`).join('')}
  </div>
  <div class="cols3">
    <ul class="ticks"><li>اتصال مشفر ومفاتيح الربط على الخادم فقط</li><li>تحقق ثنائي للمدير، وفحص الصلاحية في كل طلب</li></ul>
    <ul class="ticks"><li>سجل تدقيق للصلاحيات والنشر والإرسال والتصدير</li><li>مرفقات بروابط قصيرة الصلاحية وفحص نوعها</li></ul>
    <ul class="ticks"><li>بيانات الشكاوى لا تنتقل للتسويق</li><li>دعم قارئ الشاشة ولوحة المفاتيح واتجاه العربية</li></ul>
  </div>`);

// ١٥ الجاهزية
add('dark split even', `
  <div>
    <p class="kicker">أين نحن</p>
    <h2>جاهز للتشغيل التجريبي</h2>
    <ul class="ticks on-dark">
      <li>الموقع العام بصفحاته كاملة على الجوال والحاسوب</li>
      <li>لوحة الإدارة بشاشاتها الأربع عشرة وأدوارها الخمسة</li>
      <li>منطق الاشتراك والحملات والتذاكر والتصعيد والتقييمات</li>
      <li>وضع تجريبي يحاكي واتساب وGoogle دون إرسال حقيقي</li>
    </ul>
  </div>
  <div>
    <p class="kicker">نحتاج اعتماده</p>
    <h2 class="gold">قبل الإطلاق</h2>
    <ul class="ticks on-dark">
      <li>الصور الحقيقية للأقسام والفروع</li>
      <li>الدوام لكل فرع واستثناءات رمضان والأعياد</li>
      <li>العناوين وروابط خرائط Google الرسمية</li>
      <li>رقم واتساب الرسمي وقالب العروض المعتمد من Meta</li>
      <li>تفويض Google Business Profile للفروع الثلاثة</li>
      <li>الموظفون وجدول التوجيه، ومراجعة سياسة الخصوصية</li>
    </ul>
  </div>`);

// ١٦ الخطة
add('light', `
  <p class="kicker">خطة الإطلاق</p>
  <h2>خمس مراحل، <span class="soft">وفرع واحد أولًا</span></h2>
  <ol class="timeline">
    ${[
      ['اعتماد المحتوى', 'الصور والدوام والعناوين والأقسام لكل فرع'],
      ['مراجعة التصميم', 'جولة تفاعلية مع الإدارة واعتماد الاتجاه'],
      ['الربط الرسمي', 'واتساب Business وGoogle Business Profile والنطاق'],
      ['تجربة فرع واحد', 'تشغيل فعلي محدود واختبارات الاستلام'],
      ['الإطلاق الكامل', 'الفروع الثلاثة بعد اجتياز الحالات المطلوبة'],
    ].map(([t, d], i) => `<li><span class="dot"></span><span class="n">${N(i + 1)}</span><b>${t}</b><p>${d}</p></li>`).join('')}
  </ol>`);

// ١٧ القرارات
add('dark', `
  <p class="kicker">المطلوب من الإدارة</p>
  <h2>خمسة قرارات <span class="gold light">لنبدأ</span></h2>
  <ol class="decisions">
    ${[
      'اعتماد الاتجاه البصري «نوافذ ماك» للموقع',
      'تحديد رقم واتساب الإرسال: رقم مركزي أم أرقام الفروع',
      'اعتماد سقف الرسائل وساعات الإرسال، وقوالب الرد على التقييمات',
      'تسمية مسؤولي كل فرع وبدلائهم، ومهلة أول تواصل',
      'اختيار الفرع الذي يبدأ به التشغيل التجريبي',
    ].map((t, i) => `<li><span class="n">${N(i + 1)}</span>${t}</li>`).join('')}
  </ol>`);

// ١٨ الختام
add('dark cover end', `
  <div class="cover-copy">
    <p class="statement">عروضك، <b class="gold">كما تختارها.</b></p>
    <div class="end-logo">${LOGO_V}</div>
  </div>
  <div class="cover-arch">${arch('mall')}</div>`, { foot: false });

const css = `
@font-face { font-family: G; src: url(../../public/fonts/gamila-light.woff2); font-weight: 300; }
@font-face { font-family: G; src: url(../../public/fonts/gamila-regular.woff2); font-weight: 400; }
@font-face { font-family: G; src: url(../../public/fonts/gamila-bold.woff2); font-weight: 700; }
@page { size: 1920px 1080px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #222; }
body { font-family: G, sans-serif; -webkit-font-smoothing: antialiased; }
.slide { position: relative; width: 1920px; height: 1080px; overflow: hidden; padding: 110px 130px 120px; page-break-after: always; break-after: page; background: #F7F4EC; color: #0F2219; }
.slide.dark { background: #F8F5EE; color: #084832; isolation: isolate; }
.slide.dark::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--pattern) 0 0 / 120px 160px, var(--pattern) 60px 80px / 120px 160px; opacity: .14; -webkit-mask-image: linear-gradient(to left, transparent 15%, #000 85%); mask-image: linear-gradient(to left, transparent 15%, #000 85%); }
.slide { --pattern: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='128' viewBox='0 0 96 128'%3E%3Cg fill='none' stroke='%23006442' stroke-width='1'%3E%3Cpath d='M18 128V54a30 30 0 0 1 60 0v74'/%3E%3Cpath d='M28 128V58a20 20 0 0 1 40 0v70' stroke-opacity='.55'/%3E%3Cpath d='M48 10l3 5 5 3-5 3-3 5-3-5-5-3 5-3z' fill='%23006442' fill-opacity='.5' stroke='none'/%3E%3C/g%3E%3C/svg%3E"); }
.slide.light { background: #FFFFFF; }
h1, h2, h3 { margin: 0; font-weight: 700; line-height: 1.15; }
h1 { font-size: 140px; line-height: 1.12; }
h2 { font-size: 86px; margin-bottom: 56px; }
h3 { font-size: 34px; margin-bottom: 12px; }
p { margin: 0; }
.gold { color: #0C714F; }
.light { font-weight: 300; }
.soft { font-weight: 300; color: #75847B; }
.dark .soft { color: #0C714F; }
.kicker { display: flex; align-items: center; gap: 18px; font-size: 24px; font-weight: 700; color: #75847B; margin-bottom: 26px; }
.kicker::before { content: ""; width: 40px; height: 1px; background: currentColor; }
.dark .kicker { color: #75847B; }
.n { font-size: 22px; font-weight: 700; color: #FFAE00; }
.dark .n { color: #FFAE00; }
.body { font-size: 30px; line-height: 1.7; color: #4B5C53; max-width: 26em; margin-bottom: 36px; }
.statement { font-size: 66px; line-height: 1.5; font-weight: 300; max-width: 22em; margin-bottom: 80px; }
.statement b { font-weight: 700; }
.note { position: absolute; inset-inline: 130px; bottom: 120px; font-size: 22px; color: #4B5C53; padding-top: 18px; border-top: 1px solid rgba(15,34,25,.14); }
.note.dark-note { color: #4B5C53; border-color: rgba(15,34,25,.14); }
.foot { position: absolute; inset-inline: 130px; bottom: 44px; display: flex; justify-content: space-between; font-size: 18px; color: #75847B; }
.dark .foot { color: #75847B; }
.foot .logo { height: 34px; width: auto; }
.split .foot { top: 52px; bottom: auto; }
.split .foot > span:first-child { visibility: hidden; }
.logo .mc-cart { fill: #FFBA1D; }
.logo .mc-word { fill: #006442; }


/* الغلاف */
.cover { display: grid; grid-template-columns: 1.25fr .75fr; align-items: end; gap: 120px; padding-bottom: 130px; }
.cover-logo .logo { height: 96px; width: auto; margin-bottom: 120px; }
.cover .lead { font-size: 30px; color: #4B5C53; margin: 50px 0 28px; }
.cover .meta { font-size: 22px; color: #75847B; padding-top: 22px; border-top: 1px solid rgba(15,34,25,.14); display: inline-block; }
.cover-arch { height: 780px; }
.cover-arch .arch { height: 100%; aspect-ratio: auto; }
.arch { position: relative; display: block; width: 100%; aspect-ratio: 3/4; border-radius: 999px 999px 0 0; overflow: hidden; background: radial-gradient(120% 70% at 50% 30%, #0E5A3F 0%, #084832 55%, #063A28 100%); box-shadow: 0 0 0 1px rgba(247,244,236,.06); }
.arch::after { content: ""; position: absolute; inset: 14px 14px 0; border: 1.5px solid rgba(255,186,29,.45); border-bottom: 0; border-radius: 999px 999px 0 0; }
.arch-in { position: absolute; inset: 0; }
.lineart { position: absolute; inset: 14% 9% 6%; width: 82%; height: 80%; margin: auto; }
.lineart path { fill: none; stroke: #FFBA1D; stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; }
.end .statement { font-size: 120px; line-height: 1.25; margin-bottom: 120px; }
.end-logo .logo { height: 230px; width: auto; }

/* أعمدة */
.cols4 { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid rgba(15,34,25,.14); margin-top: 30px; }

.cols4 .c { padding: 34px 36px 0 0; padding-inline: 0 36px; border-inline-start: 1px solid rgba(15,34,25,.14); padding-inline-start: 36px; }

.cols4 .c:first-child { border: 0; padding-inline-start: 0; }
.cols4 .n { display: block; margin-bottom: 70px; }
.cols4 p { font-size: 26px; line-height: 1.65; color: #4B5C53; }
.on-dark p { color: #4B5C53; }
.cols3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 60px; }
.split { display: grid; grid-template-columns: .9fr 1.1fr; gap: 90px; align-items: center; padding-top: 120px; padding-bottom: 80px; }
.split h2 { font-size: 66px; margin-bottom: 28px; }
.split .body { font-size: 24px; line-height: 1.65; margin-bottom: 18px; }
.split .ticks li { font-size: 22px; padding: 11px 0; padding-inline-start: 40px; }
.split .ticks li::before { top: 26px; }
.split .kicker { margin-bottom: 18px; }
.split.even { grid-template-columns: 1fr 1fr; align-items: center; }
.split.wide { grid-template-columns: .75fr 1.25fr; }
.frame { position: relative; box-shadow: 0 40px 80px -30px rgba(6,58,40,.45), 0 0 0 1px rgba(15,34,25,.08); background: #fff; }

.shot { display: block; width: 100%; height: auto; }
.stack { position: relative; height: 620px; }
.stack .frame { position: absolute; width: 74%; right: 0; top: 0; }
.stack .frame.offset { right: auto; left: 0; top: 220px; }
.ticks { list-style: none; padding: 0; margin: 0; display: grid; gap: 0; }
.ticks li { position: relative; padding: 15px 0; padding-inline-start: 44px; font-size: 25px; line-height: 1.55; border-bottom: 1px solid rgba(15,34,25,.12); }
.ticks li::before { content: ""; position: absolute; inset-inline-start: 4px; top: 32px; width: 20px; height: 1px; background: #FFAE00; }

.sw { display: inline-block; width: 24px; height: 24px; vertical-align: middle; margin: 0 3px; border: 1px solid rgba(0,0,0,.08); }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 60px; }
.grid3 h3 { margin-top: 36px; font-size: 32px; }
.grid3 p { font-size: 24px; line-height: 1.6; color: #4B5C53; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }

/* الرحلة */
.flow { list-style: none; padding: 0; margin: 0; border-top: 1px solid rgba(15,34,25,.14); width: 900px; }
.flow li { display: grid; grid-template-columns: 60px 260px 1fr; align-items: baseline; padding: 20px 0; border-bottom: 1px solid rgba(15,34,25,.14); }
.flow b { font-size: 30px; }
.flow p { font-size: 23px; line-height: 1.5; color: #4B5C53; }
.phones { position: absolute; left: 130px; bottom: 110px; display: flex; gap: 26px; align-items: flex-end; }
.phone { width: 215px; padding: 10px; border-radius: 40px; background: #0F2219; box-shadow: 0 40px 70px -30px rgba(6,58,40,.6); }
.phone:nth-child(2) { transform: translateY(-60px); }
.p-img { display: block; width: 100%; border-radius: 30px; }

/* القواعد */
.rules { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid rgba(15,34,25,.14); }
.rules .r { padding: 18px 0; padding-inline-end: 40px; border-bottom: 1px solid rgba(15,34,25,.14); }
.rules b { display: block; font-size: 28px; margin: 6px 0 4px; }
.rules p { font-size: 21px; line-height: 1.55; color: #4B5C53; }
.steps { list-style: none; padding: 0; margin: 0; counter-reset: s; border-top: 1px solid rgba(15,34,25,.14); }
.steps li { padding: 22px 0; border-bottom: 1px solid rgba(15,34,25,.14); font-size: 26px; line-height: 1.55; color: #4B5C53; }
.steps b { color: #0F2219; }

.tbl { width: 100%; border-collapse: collapse; font-size: 28px; }
.tbl th { text-align: start; font-size: 22px; color: #75847B; font-weight: 400; padding: 0 0 18px; border-bottom: 1px solid rgba(15,34,25,.25); }
.tbl td { padding: 24px 0; border-bottom: 1px solid rgba(15,34,25,.12); vertical-align: top; }
.tbl td:first-child { width: 40%; font-weight: 700; padding-inline-end: 40px; }
.tbl td:last-child { color: #4B5C53; }

.list2 { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid rgba(15,34,25,.14); }
.list2 li { padding: 7px 0; font-size: 20px; border-bottom: 1px solid rgba(15,34,25,.1); }

.nums { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid rgba(15,34,25,.14); margin-bottom: 70px; }
.num { padding: 30px 0 0; padding-inline-end: 40px; }
.num b { display: inline-block; font-size: 110px; line-height: 1; color: #006442; }
.num span { display: inline-block; margin-inline-start: 14px; font-size: 26px; font-weight: 700; }
.num p { margin-top: 16px; font-size: 22px; line-height: 1.55; color: #4B5C53; }

.timeline { list-style: none; padding: 0; margin: 80px 0 0; display: grid; grid-template-columns: repeat(5, 1fr); position: relative; }
.timeline::before { content: ""; position: absolute; inset-inline: 0; top: 11px; height: 1px; background: rgba(15,34,25,.2); }
.timeline li { position: relative; padding-top: 60px; padding-inline-end: 40px; }
.timeline .dot { position: absolute; top: 0; inset-inline-start: 0; width: 22px; height: 22px; background: #084832; transform: rotate(45deg); }
.timeline li:first-child .dot { background: #FFBA1D; }
.timeline b { display: block; font-size: 34px; margin: 18px 0 12px; }
.timeline p { font-size: 24px; line-height: 1.55; color: #4B5C53; }

.decisions { list-style: none; padding: 0; margin: 0; border-top: 1px solid rgba(15,34,25,.14); }
.decisions li { display: grid; grid-template-columns: 90px 1fr; align-items: baseline; padding: 28px 0; border-bottom: 1px solid rgba(15,34,25,.14); font-size: 38px; }
`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ماك سنتر · المنصة الرقمية</title><style>${css}</style></head><body>
${slides.map((s, i) => `<section class="slide ${s.theme}">${s.body}${s.foot ? `<div class="foot"><span>${LOGO_H}</span><span>${N(i + 1)} / ${N(slides.length)}</span></div>` : ''}</section>`).join('\n')}
</body></html>`;
writeFileSync(join(here, 'deck.html'), html);
console.log(`deck.html: ${slides.length} شريحة`);

// إخراج PDF وصور معاينة
const pw = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pw);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${join(here, 'deck.html')}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: join(here, 'MacCenter-Presentation.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
if (process.env.PREVIEW) {
  const els = await page.$$('.slide');
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: `${process.env.PREVIEW}/slide-${i + 1}.png` });
}
await browser.close();
console.log('MacCenter-Presentation.pdf');
