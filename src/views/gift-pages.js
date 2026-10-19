import { esc } from '../http.js';
import { layout, CART } from './layout.js';
import { qrSvg } from '../lib/qr.js';
import { pageHead, linkArrow } from './pages.js';
import { DESIGNS, prettyCode } from '../modules/giftcards.js';

const fieldErr = (errors, k) => (errors[k] ? `<p class="err" id="err-${k}" role="alert">${esc(errors[k])}</p>` : '');
const inv = (errors, k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');
const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const GIFT_TERMS = [
  'تُستخدم القسيمة في جميع فروع ماك سنتر، دفعة واحدة أو على دفعات حتى نفاد رصيدها.',
  'لا تُستبدل القسيمة نقدًا، ولا يُرد ما تبقى من رصيدها نقدًا.',
  'صلاحية القسيمة مدونة عليها من تاريخ الشراء.',
  'من يملك رمز القسيمة يستطيع استخدامها؛ احتفظ به ولا تشاركه إلا مع من تهديه.',
  'لإلغاء قسيمة لم تُستخدم بعد تواصل مع خدمة العملاء خلال 7 أيام من الشراء.',
];

// وجه القسيمة: تصميم المناسبة، والقيمة، ومن وإلى
export function giftFace({ design = 'general', amount, sender, recipient, message, live = false }) {
  const d = DESIGNS[design] || DESIGNS.general;
  return `<div class="gface" style="--gbg:${d.bg};--gfg:${d.fg};--gac:${d.accent}" data-gface="${esc(design)}">
    <div class="gface-top">${CART('gface-cart')}<span>ماك سنتر</span></div>
    <p class="gface-title" ${live ? 'data-g-title' : ''}>${esc(d.title)}</p>
    <p class="gface-amt"><b ${live ? 'data-g-amount' : ''}>${esc(num(amount))}</b><span>ريال</span></p>
    <div class="gface-lines" aria-hidden="true"><i></i><i></i><i></i></div>
    <p class="gface-to"><span>إلى</span> <b ${live ? 'data-g-to' : ''}>${esc(recipient || '…')}</b></p>
    <p class="gface-from"><span>من</span> <b ${live ? 'data-g-from' : ''}>${esc(sender || '…')}</b></p>
    <p class="gface-msg" ${live ? 'data-g-msg' : ''}>${esc(message || '')}</p>
  </div>`;
}

export function giftShopPage({ site, branches, settings: st, values = {}, errors = {}, enabled }) {
  const design = Object.hasOwn(DESIGNS, values.design) ? values.design : 'general';
  const amount = values.amount || st.amounts[1] || st.amounts[0];
  const custom = values.amount === 'custom';
  const deliver = values.deliver === 'self' ? 'self' : 'wa';
  const when = values.when === 'later' ? 'later' : 'now';
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const form = enabled ? `<form class="f gform" method="post" action="/gift-cards" novalidate data-gift-form data-designs="${esc(JSON.stringify(Object.fromEntries(Object.entries(DESIGNS).map(([k, d]) => [k, d]))))}">
    ${errors._ ? `<div class="alert" role="alert">${esc(errors._)}</div>` : ''}
    <fieldset><legend>التصميم</legend><div class="gdesigns">${Object.entries(DESIGNS).map(([k, d]) => `<label class="gdesign"><input type="radio" name="design" value="${k}" ${k === design ? 'checked' : ''}><span style="--gbg:${d.bg};--gac:${d.accent};--gfg:${d.fg}"><i></i>${esc(d.name)}</span></label>`).join('')}</div></fieldset>
    <fieldset class="${errors.amount ? 'has-error' : ''}"><legend>القيمة (ريال)</legend>
      <div class="seg-row">${st.amounts.map((a) => `<label><input type="radio" name="amount" value="${a}" ${!custom && String(amount) === String(a) ? 'checked' : ''}><span>${num(a)}</span></label>`).join('')}<label><input type="radio" name="amount" value="custom" ${custom ? 'checked' : ''}><span>مبلغ آخر</span></label></div>
      <div class="field" data-custom ${custom ? '' : 'hidden'}><label for="g-custom">المبلغ <span class="muted">من ${st.min} إلى ${st.max}</span></label><input id="g-custom" name="customAmount" type="number" inputmode="numeric" min="${st.min}" max="${st.max}" dir="ltr" value="${esc(values.customAmount || '')}"></div>
      ${fieldErr(errors, 'amount')}</fieldset>
    <div class="row2">
      <div class="field"><label for="g-from">من <span class="muted">اسمك كما يظهر على القسيمة</span></label><input id="g-from" name="senderName" maxlength="40" value="${esc(values.senderName || '')}"></div>
      <div class="field"><label for="g-to">إلى</label><input id="g-to" name="recipientName" maxlength="40" value="${esc(values.recipientName || '')}"></div>
    </div>
    <div class="field"><label for="g-msg">رسالتك <span class="muted">اختياري</span></label><textarea id="g-msg" name="message" maxlength="240" rows="3" placeholder="كل عام وأنت بخير">${esc(values.message || '')}</textarea></div>
    <fieldset><legend>طريقة التسليم</legend><div class="seg-row"><label><input type="radio" name="deliver" value="wa" ${deliver === 'wa' ? 'checked' : ''}><span>ترسلها ماك سنتر بواتساب</span></label><label><input type="radio" name="deliver" value="self" ${deliver === 'self' ? 'checked' : ''}><span>أرسلها بنفسي</span></label></div></fieldset>
    <div data-wa ${deliver === 'wa' ? '' : 'hidden'} class="f" style="gap:28px">
      <div class="field ${errors.recipientPhone ? 'has-error' : ''}"><label for="g-rphone">جوال المُهدى إليه</label><input id="g-rphone" name="recipientPhone" type="tel" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" value="${esc(values.recipientPhone || '')}" ${inv(errors, 'recipientPhone')}>${fieldErr(errors, 'recipientPhone')}</div>
      <fieldset><legend>متى تصله؟</legend><div class="seg-row"><label><input type="radio" name="when" value="now" ${when === 'now' ? 'checked' : ''}><span>فور الدفع</span></label><label><input type="radio" name="when" value="later" ${when === 'later' ? 'checked' : ''}><span>في موعد أحدده</span></label></div></fieldset>
      <div class="row2" data-later ${when === 'later' ? '' : 'hidden'}>
        <div class="field ${errors.sendDate ? 'has-error' : ''}"><label for="g-date">التاريخ</label><input id="g-date" name="sendDate" type="date" min="${today}" dir="ltr" value="${esc(values.sendDate || '')}" ${inv(errors, 'sendDate')}>${fieldErr(errors, 'sendDate')}</div>
        <div class="field"><label for="g-time">الساعة</label><input id="g-time" name="sendTime" type="time" dir="ltr" value="${esc(values.sendTime || '09:00')}"></div>
      </div>
    </div>
    <div class="field ${errors.buyerPhone ? 'has-error' : ''}"><label for="g-bphone">جوالك <span class="muted">نرسل لك تأكيد الشراء ورابط القسيمة</span></label><input id="g-bphone" name="buyerPhone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="05xxxxxxxx" value="${esc(values.buyerPhone || '')}" ${inv(errors, 'buyerPhone')}>${fieldErr(errors, 'buyerPhone')}</div>
    <details class="gterms"><summary>شروط القسيمة</summary><ul>${GIFT_TERMS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <label class="consent ${errors.terms ? 'has-error' : ''}"><input type="checkbox" name="terms" value="1" ${inv(errors, 'terms')}><span class="pick-box" aria-hidden="true"></span><span>قرأت شروط القسيمة وأوافق عليها، وعلى <a class="ul" href="/privacy" target="_blank">سياسة الخصوصية</a>.</span></label>
    ${fieldErr(errors, 'terms')}
    <button class="btn btn-gold btn-block" type="submit"><span>ادفع <b data-g-pay>${esc(num(custom ? values.customAmount || 0 : amount))}</b> ريال</span><i aria-hidden="true"></i></button>
    <p class="muted small">الدفع عبر صفحة آمنة: مدى، فيزا، ماستركارد، Apple Pay.</p>
  </form>` : `<div class="looks-empty"><h2>القسائم الإلكترونية قريبًا</h2><p>يمكنك شراء قسيمة إهداء من أي فرع الآن.</p></div>`;
  const body = `${pageHead({ crumbs: [['/gift-cards', 'قسائم الإهداء']], title: 'هدية تختار<br>كل ما تحب', lead: 'قسيمة إهداء إلكترونية من ماك سنتر تصل بواتساب في لحظتها أو في موعد المناسبة، وتُستخدم في جميع الفروع وعلى دفعات.' })}
  <section class="gshop">
    <div class="gshop-preview">${giftFace({ design, amount: custom ? values.customAmount : amount, sender: values.senderName, recipient: values.recipientName, message: values.message, live: true })}
      <ul class="gshop-points"><li>تُستخدم في كل الأقسام وكل الفروع</li><li>على دفعات حتى نفاد الرصيد</li><li>تُضاف إلى Apple Wallet</li></ul></div>
    <div class="gshop-form">${form}</div>
  </section>`;
  return layout({ title: 'قسائم الإهداء', description: 'اشترِ قسيمة إهداء إلكترونية من ماك سنتر وأرسلها بواتساب فورًا أو في موعد المناسبة. تُستخدم في جميع الفروع.', path: '/gift-cards', site, branches, body, bodyClass: 'page-gift' });
}

export function giftReturnPage({ site, branches, order, card, cardUrl }) {
  const st = order.status;
  const body = `<section class="center-page">
    ${st === 'paid' ? `<div class="sv done" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="sv-ring" cx="60" cy="60" r="54" pathLength="1"/><path class="sv-ok" pathLength="1" d="M38 62l15 15 30-32"/></svg></div>
      <h1>تم شراء القسيمة</h1>
      <p>${order.deliver === 'wa' ? (order.send_at ? `ستصل إلى ${esc(order.recipient_name || 'المُهدى إليه')} على واتساب في الموعد الذي اخترته.` : `أرسلناها إلى ${esc(order.recipient_name || 'المُهدى إليه')} على واتساب.`) : 'شارك رابط القسيمة مع من تهديه.'} ووصلك تأكيد الشراء على جوالك.</p>
      ${card ? giftFace({ design: card.design, amount: card.amount, sender: card.sender_name, recipient: card.recipient_name, message: card.message }) : ''}
      <div class="p-head-acts">${cardUrl ? `<a class="btn" href="${esc(cardUrl)}"><span>افتح القسيمة</span><i aria-hidden="true"></i></a>
        <a class="btn btn-gold" href="https://wa.me/?text=${encodeURIComponent(`أهديتك قسيمة من ماك سنتر 🎁 ${cardUrl}`)}" target="_blank" rel="noopener"><span>شارك بواتساب</span><i aria-hidden="true"></i></a>` : ''}</div>`
    : st === 'pending' ? `<div class="sv" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="sv-ring" cx="60" cy="60" r="54" pathLength="1" style="stroke:var(--y2);stroke-dasharray:.25 .75"/></svg></div>
      <h1>نتحقق من الدفع</h1><p>لم يصلنا تأكيد البنك بعد. حدّث الصفحة بعد لحظات، وسيصلك تأكيد على واتساب فور اكتماله.</p>
      <a class="btn" href=""><span>تحديث</span><i aria-hidden="true"></i></a>`
    : `<h1>لم يكتمل الدفع</h1><p>لم يُخصم أي مبلغ مقابل هذه القسيمة. يمكنك المحاولة مرة أخرى.</p><a class="btn" href="/gift-cards"><span>حاول مجددًا</span><i aria-hidden="true"></i></a>`}
  </section>`;
  return layout({ title: 'شراء القسيمة', path: '/gift-cards', site, branches, body, bodyClass: 'page-form', noindex: true });
}

// صفحة المُهدى إليه: تفتح الهدية برسم متحرك ثم تعرض الرمز والرصيد
export function giftViewPage({ site, branches, card, walletUrl }) {
  const c = card;
  const ok = c.usable;
  const body = `<section class="gview">
    <div class="gview-stage">${giftFace({ design: c.design, amount: c.amount, sender: c.sender, recipient: c.recipientName, message: c.message })}</div>
    <div class="gview-info">
      <p class="label">${esc(c.sender || 'ماك سنتر')} أهداك</p>
      <h1>قسيمة بقيمة ${esc(num(c.amount))} ريال</h1>
      <div class="gview-bal"><span>الرصيد المتبقي</span><b>${esc(num(c.balance))} <small>ريال</small></b></div>
      ${ok ? `<div class="mcard-qr gview-qr">${qrSvg(c.code.replace(/-/g, ''), { margin: 2 })}<p dir="ltr">${esc(c.code)}</p></div>
        <p class="muted small">أظهر الرمز للكاشير في أي فرع. صالحة حتى ${esc(c.expiresAt.slice(0, 10))}.</p>
        ${walletUrl ? `<a class="awallet" href="${esc(walletUrl)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/><path d="M3 9h18" stroke="#0B6446" stroke-width="2"/><path d="M3 12h18" stroke="#FFBA1D" stroke-width="2"/><path d="M3 15h18" stroke="#E5484D" stroke-width="2"/></svg><span><small>أضف إلى</small>Apple Wallet</span></a>` : ''}`
        : `<p class="alert">${c.status === 'cancelled' ? 'أُلغيت هذه القسيمة.' : c.expired ? 'انتهت صلاحية هذه القسيمة.' : 'استُخدم رصيد القسيمة بالكامل.'}</p>`}
      <div class="p-head-acts">${linkArrow('/#branches', 'الفروع وأوقات الدوام')}${linkArrow('/gift-cards', 'أهدِ قسيمة لمن تحب')}</div>
    </div>
  </section>`;
  return layout({ title: 'هديتك من ماك سنتر', path: '/gift-cards', site, branches, body, bodyClass: 'page-form', noindex: true });
}

export function mockPayPage({ site, branches, id, amount, back }) {
  const body = `<section class="center-page"><h1>بوابة دفع تجريبية</h1><p>هذه الصفحة للتجربة فقط ولا تظهر عند ربط بوابة الدفع.</p><p><b>${esc(num(amount))} ريال</b></p>
    <form method="post" action="/pay/mock/${esc(id)}"><input type="hidden" name="back" value="${esc(back)}"><input type="hidden" name="amount" value="${esc(amount)}"><button class="btn btn-gold" type="submit"><span>ادفع الآن</span><i aria-hidden="true"></i></button></form>
    <a class="ul" href="${esc(back)}">إلغاء</a></section>`;
  return layout({ title: 'دفع تجريبي', path: '/pay', site, branches, body, bodyClass: 'page-form', noindex: true });
}

export { prettyCode };
