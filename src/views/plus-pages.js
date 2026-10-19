import { esc } from '../http.js';
import { layout, CART, AR_NUM } from './layout.js';
import { arch } from './art.js';
import { qrSvg } from '../lib/qr.js';
import { pageHead, formShell, linkArrow } from './pages.js';
import { PLUS_CONSENT, REQUEST_KIND, REQUEST_STATUS, OCCASIONS, AUDIENCES } from '../modules/plus.js';

const fieldErr = (errors, k) => (errors[k] ? `<p class="err" id="err-${k}" role="alert">${esc(errors[k])}</p>` : '');
const inv = (errors, k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');
const sar = (n) => `${Number(n || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;
const seg = (name, map, selected, extra = '') => `<div class="seg-row">${Object.entries(map).map(([k, v]) => `<label><input type="radio" name="${name}" value="${esc(k)}" ${String(selected) === String(k) ? 'checked' : ''} ${extra}><span>${esc(v)}</span></label>`).join('')}</div>`;
const AR = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const LOOK_ART = { women: 'dress', girls: 'dress', boys: 'fashion', men: 'fashion' };

// خطوط العربة: كل قسم إضافي في الفاتورة نفسها خط جديد خلف العربة
function tierLines(tiers) {
  return `<ol class="tl">${tiers.map((t, i) => `<li style="--k:${i}"><span class="tl-bar" aria-hidden="true"></span><b>${AR(t.min)}</b><span>أقسام في فاتورة واحدة</span><em>${t.pct}%</em></li>`).join('')}</ol>`;
}

// ———————————————————— صفحة العضوية والانضمام ————————————————————
export function plusPage({ site, branches, settings, values = {}, errors = {}, refOwner }) {
  const st = settings;
  const form = `<form class="f" method="post" action="/plus" novalidate>
    ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
    ${refOwner ? `<div class="alert alert-ok">دعاك صديق للانضمام. بعد الانضمام يصلك رصيد ${sar(st.referral.newAmount)} يُستخدم على فاتورة من ${sar(st.referral.minInvoice)}.</div>` : ''}
    <input type="hidden" name="ref" value="${esc(values.ref || '')}">
    <div class="row2">
      <div class="field"><label for="p-name">الاسم <span class="muted">اختياري</span></label><input id="p-name" name="name" autocomplete="given-name" maxlength="60" value="${esc(values.name || '')}"></div>
      <div class="field"><label for="p-branch">أقرب فرع لك</label><select id="p-branch" name="branch"><option value="">أي فرع</option>${branches.map((b) => `<option value="${b.id}" ${String(values.branch) === String(b.id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    </div>
    <label class="consent ${errors.consent ? 'has-error' : ''}"><input type="checkbox" name="consent" value="1" required ${inv(errors, 'consent')}><span class="pick-box" aria-hidden="true"></span>
      <span>${esc(PLUS_CONSENT)} <a class="ul" href="/privacy" target="_blank">سياسة الخصوصية</a></span></label>
    ${fieldErr(errors, 'consent')}
    <button class="btn btn-block" type="submit"><span>انضم عبر واتساب</span><i aria-hidden="true"></i></button>
    <p class="muted small">نؤكد عضويتك برسالة ترسلها أنت من رقمك، فلا نحتاج كلمة مرور ولا تطبيقًا. أو اطلب الانضمام من الكاشير في أي فرع.</p>
  </form>`;
  const perks = [
    ['خطوط العربة', `كل قسم تضيفه لفاتورتك يرسم خطًا جديدًا خلف عربتك: ${st.tiers.map((t) => `${AR(t.min)} أقسام ${t.pct}%`).join('، ')}.`],
    ['محفظة MAC+‎', `رصيد في رقمك يُستخدم في أي فرع، صالح ${AR(st.walletDays)} يومًا، ويصلك على واتساب بعد كل فاتورة.`],
    ['ادعُ صديقًا', `صديقك يحصل على ${sar(st.referral.newAmount)}، وأنت ${sar(st.referral.referrerAmount)} بعد أول فاتورة له.`],
    ['احجز واستلم', `اسأل عن مقاس أو قطعة، نحجزها لك ${AR(st.holdHours)} ساعات أو نجهزها للاستلام دون انتظار.`],
    ['ضمان ماك للسعر', `إذا انخفض سعر قطعة اشتريتها خلال ${AR(st.price.days)} أيام نضيف الفرق لرصيدك.`],
    ['المقاس والهدية', `استبدال المقاس خلال ${AR(st.sizeDays)} يومًا، وإيصال هدية بلا سعر يستبدله من تهديه خلال ${AR(st.giftDays)} يومًا.`],
  ];
  const body = `${pageHead({ crumbs: [['/plus', 'MAC+‎']], title: 'MAC+‎<br>عربة واحدة، كل الأقسام', lead: 'عضوية ماك سنتر المجانية برقم جوالك: وفّر أكثر كلما نوّعت مشترياتك في الزيارة نفسها.', kind: 'mall' })}
  <section class="plus-lines">
    <div class="plus-lines-copy"><p class="label">خطوط العربة</p><h2>نوّع عربتك<br>يرتفع خصمك</h2><p>العربة في شعار ماك سنتر تجري وخلفها خطوط. عندنا كل خط قسم أضفته لفاتورتك.</p></div>
    <div class="plus-lines-viz">${CART('plus-cart')}${tierLines(st.tiers)}</div>
  </section>
  <section class="plus-perks"><ol>${perks.map(([t, d], i) => `<li><span class="pick-n">${AR_NUM(i + 1)}</span><h3>${t}</h3><p>${esc(d)}</p></li>`).join('')}</ol></section>
  ${formShell({ title: 'انضم في دقيقة', kind: 'bags', steps: ['اكتب اسمك واختر فرعك', 'اضغط «انضم عبر واتساب»', 'أرسل الرسالة الجاهزة لتصلك بطاقتك'], form })}`;
  return layout({ title: 'عضوية MAC+‎', description: 'عضوية ماك سنتر المجانية: خطوط العربة، محفظة الرصيد، ادعُ صديقًا، الحجز والاستلام، وضمان السعر.', path: '/plus', site, branches, body, bodyClass: 'page-plus' });
}

export function plusStatusPage({ site, branches, statusKey, status: st, waUrl }) {
  const body = `<section class="center-page" data-sub-status="${esc(statusKey)}" data-status-url="/api/public/plus/${esc(statusKey)}" data-state="${esc(st.status)}" aria-live="polite">
    <div class="sv" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="sv-ring" cx="60" cy="60" r="54" pathLength="1"/><path class="sv-ok" pathLength="1" d="M38 62l15 15 30-32"/></svg></div>
    <div data-when="awaiting"><h1>بانتظار رسالتك على واتساب</h1><p>أرسل الرسالة الجاهزة كما هي، ونفعّل عضويتك هنا فور وصولها.</p>
      ${waUrl ? `<a class="btn" href="${esc(waUrl)}" data-wa-open><span>فتح واتساب</span><i aria-hidden="true"></i></a>` : ''}
      <p class="muted small">الرمز صالح لمدة 30 دقيقة.</p></div>
    <div data-when="confirmed"><h1>أهلًا بك في MAC+‎</h1><p>وصلتك على واتساب بطاقتك ورقم عضويتك. أظهره للكاشير مع كل فاتورة.</p>
      <a class="btn btn-gold" href="${esc(st.cardUrl || '/plus')}" data-card-link><span>افتح بطاقتي</span><i aria-hidden="true"></i></a></div>
    <div data-when="expired"><h1>انتهت صلاحية الرمز</h1><p>لم تصل الرسالة خلال المدة. ابدأ من جديد وسنجهز لك رسالة جديدة.</p><a class="btn" href="/plus"><span>ابدأ من جديد</span><i aria-hidden="true"></i></a></div>
  </section>`;
  return layout({ title: 'تأكيد عضوية MAC+‎', path: '/plus', site, branches, body, bodyClass: 'page-form', noindex: true });
}

// ———————————————————— بطاقة العضو ————————————————————
export function plusCardPage({ site, branches, m, walletUrl }) {
  const tiers = m.settings.tiers;
  const share = `https://wa.me/?text=${encodeURIComponent(`انضم معي إلى MAC+‎ من ماك سنتر واحصل على رصيد ترحيبي: ${m.referralUrl}`)}`;
  const body = `<section class="mcard-page">
    <div class="mcard-col"><div class="mcard" aria-label="بطاقة عضوية MAC+‎">
      <div class="mcard-top">${CART('mcard-cart')}<span>MAC+‎</span></div>
      <p class="mcard-name">${esc(m.name || 'عضو ماك سنتر')}</p>
      <div class="mcard-bal"><span>رصيدك</span><b>${sar(m.balance)}</b></div>
      <div class="mcard-qr">${qrSvg(m.refCode, { margin: 2 })}<p dir="ltr">${esc(m.refCode)}</p></div>
      <p class="mcard-hint">أظهر الرمز للكاشير مع كل فاتورة</p>
    </div>
    ${walletUrl ? `<a class="awallet" href="${esc(walletUrl)}" data-awallet><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/><path d="M3 9h18" stroke="#0B6446" stroke-width="2"/><path d="M3 12h18" stroke="#FFBA1D" stroke-width="2"/><path d="M3 15h18" stroke="#E5484D" stroke-width="2"/></svg><span><small>أضف إلى</small>Apple Wallet</span></a>` : ''}</div>
    <div class="mcard-side">
      <h1>بطاقتك</h1>
      <dl class="mcard-stats"><div><dt>الفواتير</dt><dd>${AR(m.invoiceCount)}</dd></div><div><dt>أصدقاء انضموا</dt><dd>${AR(m.referrals.count)}</dd></div><div><dt>عضو منذ</dt><dd>${esc(String(m.since).slice(0, 10))}</dd></div></dl>
      <h2>خطوط العربة</h2>
      ${tierLines(tiers)}
      ${m.requests.length ? `<h2>طلباتك المفتوحة</h2><ul class="mcard-req">${m.requests.map((r) => `<li><b dir="ltr">${esc(r.ref)}</b><span>${esc(REQUEST_KIND[r.kind])} · ${esc(r.branch)}</span><em>${esc(REQUEST_STATUS[r.status])}${r.pickup_code && r.status === 'ready' ? ` · رمز ${esc(r.pickup_code)}` : ''}</em></li>`).join('')}</ul>` : ''}
      <h2>ادعُ صديقًا</h2>
      <p>شارك رابطك، وعند أول فاتورة لصديقك يضاف الرصيد لك.</p>
      <p class="mcard-ref" dir="ltr">${esc(m.referralUrl)}</p>
      <div class="p-head-acts"><a class="btn" href="${esc(share)}" target="_blank" rel="noopener"><span>شارك عبر واتساب</span><i aria-hidden="true"></i></a>${linkArrow('/reserve', 'احجز أو اطلب قطعة')}</div>
    </div>
  </section>`;
  return layout({ title: 'بطاقة MAC+‎', path: '/plus', site, branches, body, bodyClass: 'page-form', noindex: true });
}

// ———————————————————— احجز، اطلب واستلم، لقيناه لك ————————————————————
export function reservePage({ site, branches, sections, look, values = {}, errors = {}, settings }) {
  const kind = values.kind || 'reserve';
  const details = values.details ?? (look ? `${look.title}: ${look.items.map((i) => i.name).join('، ')}` : '');
  const form = `<form class="f" method="post" action="/reserve" novalidate data-reserve>
    ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
    ${look ? `<input type="hidden" name="look" value="${look.id}">` : ''}
    <fieldset class="seg ${errors.kind ? 'has-error' : ''}"><legend>نوع الطلب</legend>${seg('kind', REQUEST_KIND, kind)}${fieldErr(errors, 'kind')}</fieldset>
    <p class="muted small" data-kind-note="${esc(JSON.stringify(KIND_NOTE(settings)))}">${esc(KIND_NOTE(settings)[kind] || '')}</p>
    <div class="row2">
      <div class="field ${errors.branch ? 'has-error' : ''}"><label for="r-branch">الفرع</label><select id="r-branch" name="branch" ${inv(errors, 'branch')}><option value="">اختر الفرع</option>${branches.map((b) => `<option value="${b.id}" ${String(values.branch) === String(b.id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>${fieldErr(errors, 'branch')}</div>
      <div class="field"><label for="r-section">القسم <span class="muted">اختياري</span></label><select id="r-section" name="section"><option value="">—</option>${sections.map((s) => `<option value="${s.id}" ${String(values.section) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field ${errors.details ? 'has-error' : ''}"><label for="r-details">ماذا تريد؟</label><textarea id="r-details" name="details" maxlength="600" placeholder="مثال: فستان أطفال كحلي رأيته في العرض، أو رقم الصنف" ${inv(errors, 'details')}>${esc(details)}</textarea>${fieldErr(errors, 'details')}</div>
    <div class="row2">
      <div class="field"><label for="r-size">المقاس أو اللون <span class="muted">اختياري</span></label><input id="r-size" name="size" maxlength="30" value="${esc(values.size || '')}"></div>
      <div class="field"><label for="r-name">الاسم <span class="muted">اختياري</span></label><input id="r-name" name="name" maxlength="60" autocomplete="given-name" value="${esc(values.name || '')}"></div>
    </div>
    <div class="field ${errors.phone ? 'has-error' : ''}"><label for="r-phone">رقم الجوال</label><input id="r-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="05xxxxxxxx" value="${esc(values.phone || '')}" ${inv(errors, 'phone')}>${fieldErr(errors, 'phone')}</div>
    <label class="consent ${errors.consent ? 'has-error' : ''}"><input type="checkbox" name="consent" value="1" ${inv(errors, 'consent')}><span class="pick-box" aria-hidden="true"></span><span>أوافق أن يتواصل معي الفرع عبر واتساب بشأن هذا الطلب فقط.</span></label>
    ${fieldErr(errors, 'consent')}
    <button class="btn btn-block" type="submit"><span>أرسل الطلب</span><i aria-hidden="true"></i></button>
  </form>`;
  return layout({ title: 'احجز واستلم', description: 'احجز قطعة أو مقاسًا في فرعك، أو اطلبها جاهزة للاستلام، أو اسألنا عن منتج غير متوفر ونبلغك عند وصوله.', path: '/reserve', site, branches, bodyClass: 'page-form',
    body: formShell({ title: 'قطعتك<br>محجوزة لك', kind: 'bags', steps: ['اختر نوع الطلب والفرع', 'صف القطعة والمقاس', 'يصلك التأكيد على واتساب'], form }) });
}
export const KIND_NOTE = (st) => ({
  reserve: `نتأكد من توفرها ونحجزها لك ${st.holdHours} ساعات من وقت التأكيد.`,
  collect: 'نجهز طلبك ونرسل لك رمز الاستلام عند جاهزيته، فتستلمه دون انتظار.',
  find: 'غير متوفر الآن؟ نبحث عنه في الفروع ونبلغك فور وصوله.',
});

export function reserveDonePage({ site, branches, result, kind, branch }) {
  const body = `<section class="center-page">
    <div class="sv done" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="sv-ring" cx="60" cy="60" r="54" pathLength="1"/><path class="sv-ok" pathLength="1" d="M38 62l15 15 30-32"/></svg></div>
    <h1>وصل طلبك</h1>
    <p>رقم الطلب <b dir="ltr">${esc(result.ref)}</b> · ${esc(REQUEST_KIND[kind])}${branch ? ` · ${esc(branch.name)}` : ''}</p>
    <p>يراجعه فريق الفرع ويرسل لك التأكيد على واتساب في أوقات الدوام.</p>
    <div class="p-head-acts">${linkArrow('/occasion', 'عندك مناسبة؟ شوف الإطلالات')}${linkArrow('/plus', 'انضم إلى MAC+‎')}</div>
  </section>`;
  return layout({ title: 'تم استلام طلبك', path: '/reserve', site, branches, body, bodyClass: 'page-form', noindex: true });
}

// ———————————————————— «عندك مناسبة؟» ————————————————————
export function occasionPage({ site, branches, looks, filters, sections }) {
  const secName = new Map(sections.map((s) => [s.id, s.name]));
  const budgets = { '': 'أي ميزانية', 200: 'حتى 200', 400: 'حتى 400', 700: 'حتى 700', 1200: 'حتى 1200' };
  const picked = filters.occasion || filters.audience || filters.budget;
  const card = (l) => {
    const depts = new Set(l.items.map((i) => i.sectionId).filter(Boolean)).size;
    return `<article class="look">
      <div class="look-win">${arch(LOOK_ART[l.audience] || 'mall', { image: l.image ? esc(l.image) : null, label: esc(l.title) })}</div>
      <div class="look-copy">
        <p class="label">${esc(OCCASIONS[l.occasion])} · ${esc(AUDIENCES[l.audience])}</p>
        <h3>${esc(l.title)}</h3>
        <ul>${l.items.map((i) => `<li><span>${esc(i.name)}${i.sectionId && secName.has(i.sectionId) ? ` <em>${esc(secName.get(i.sectionId))}</em>` : ''}</span><b>${sar(i.price)}</b></li>`).join('')}</ul>
        <p class="look-total"><span>الإطلالة كاملة</span><b>${sar(l.price)}</b></p>
        ${depts >= 2 ? `<p class="look-lines">${CART('look-cart')}من ${AR(depts)} أقسام: تحسب في خطوط العربة لأعضاء MAC+‎</p>` : ''}
        <a class="btn" href="/reserve?look=${l.id}"><span>احجزها في الفرع</span><i aria-hidden="true"></i></a>
      </div>
    </article>`;
  };
  const body = `${pageHead({ crumbs: [['/occasion', 'عندك مناسبة؟']], title: 'عندك مناسبة؟', lead: 'اختر المناسبة ولمن تتسوق وميزانيتك، ونرتب لك إطلالة كاملة من أقسام ماك سنتر تحجزها وتجربها في الفرع.' })}
  <section class="occ-wiz">
    <form class="occ-form" method="get" action="/occasion">
      <fieldset><legend>المناسبة</legend>${seg('o', { '': 'الكل', ...OCCASIONS }, filters.occasion || '')}</fieldset>
      <fieldset><legend>لمن؟</legend>${seg('a', { '': 'الكل', ...AUDIENCES }, filters.audience || '')}</fieldset>
      <fieldset><legend>الميزانية (ر.س)</legend>${seg('b', budgets, filters.budget || '')}</fieldset>
      <button class="btn btn-gold" type="submit"><span>رتّب لي الإطلالات</span><i aria-hidden="true"></i></button>
    </form>
    <div class="looks">${looks.length ? looks.map(card).join('') : `<div class="looks-empty"><h2>${picked ? 'لا توجد إطلالة بهذه الاختيارات الآن' : 'الإطلالات قيد التجهيز'}</h2><p>صف لنا ما تبحث عنه ويختاره لك فريق الفرع ويجهزه للتجربة.</p><a class="btn" href="/reserve?kind=find"><span>اطلب من الفريق</span><i aria-hidden="true"></i></a></div>`}</div>
  </section>`;
  return layout({ title: 'عندك مناسبة؟', description: 'إطلالات كاملة للزواج والعيد والتخرج والمدرسة من أقسام ماك سنتر، بميزانيتك، واحجزها في الفرع.', path: '/occasion', site, branches, body, bodyClass: 'page-occasion' });
}

// ———————————————————— إيصال الهدية: بلا سعر ————————————————————
export function giftPage({ site, branches, gift }) {
  const body = `<section class="center-page gift">
    <div class="gift-card">
      <div class="mcard-top">${CART('mcard-cart')}<span>إيصال هدية</span></div>
      <h1>هدية من ماك سنتر</h1>
      <p>يمكن لمن أُهديت له استبدال المقاس أو اللون في ${esc(gift.branch)}${gift.expired ? '.' : ` حتى ${esc(gift.until)}.`}</p>
      ${gift.expired ? '<p class="alert">انتهت مدة الاستبدال لهذا الإيصال.</p>' : `<div class="mcard-qr">${qrSvg(`GIFT-${gift.code}`, { margin: 2 })}<p dir="ltr">GIFT-${esc(gift.code)}</p></div><p class="muted small">أظهر هذا الرمز للكاشير. لا يظهر سعر الهدية.</p>`}
    </div>
  </section>`;
  return layout({ title: 'إيصال هدية', path: '/gift', site, branches, body, bodyClass: 'page-form', noindex: true });
}
