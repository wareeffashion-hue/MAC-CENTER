import { json, tx, getSetting, setSetting } from '../db.js';
import { validateHours, openStatus } from '../lib/hours.js';
import { fail } from '../http.js';
import { slugify } from '../lib/ids.js';

export const CONSENT_VERSION = '2026-10-09';
export const CONSENT_TEXT = 'أوافق على استقبال عروض ماك سنتر والفروع التي اخترتها عبر واتساب، ويمكنني إيقاف الاشتراك في أي وقت.';

export const SERVICE_LABELS = {
  delivery: 'توصيل لجميع مناطق المملكة',
  whatsapp_orders: 'الطلب والاستفسار عبر واتساب',
  tabby: 'تابي',
  tamara: 'تمارا',
  parking: 'مواقف سيارات',
  family: 'مرافق للعائلة',
};

const SECTIONS = [
  { slug: 'family-fashion', name: 'أزياء العائلة', tagline: 'اختيارات ليومك ولكل أفراد العائلة', art: 'fashion',
    description: 'ملابس يومية للرجال والنساء والأطفال، باختيارات تناسب العمل والمدرسة والمشاوير والمناسبات العائلية.' },
  { slug: 'occasion-dresses', name: 'فساتين المناسبات', tagline: 'اختاري إطلالتك للمناسبة القادمة', art: 'dress',
    description: 'فساتين للأعراس والأعياد والسهرات واللقاءات العائلية، بقصّات وألوان متجددة مع كل موسم.' },
  { slug: 'shoes-bags', name: 'الأحذية والحقائب', tagline: 'تفاصيل تكمل إطلالتك', art: 'bags',
    description: 'أحذية وحقائب للاستخدام اليومي والمناسبات، تكمل الإطلالة وتناسب كل أفراد العائلة.' },
  { slug: 'furnishings', name: 'المفروشات', tagline: 'اختيارات تمنح بيتك طابعك', art: 'home',
    description: 'مفارش وأغطية ووسائد ومنسوجات منزلية تضيف الدفء والذوق إلى غرف بيتك.' },
  { slug: 'toys', name: 'الألعاب', tagline: 'اكتشف اختيارات قسم الألعاب', art: 'toys',
    description: 'ألعاب للأطفال بمختلف الأعمار، للعب والتعلم والهدايا.' },
  { slug: 'stationery', name: 'القرطاسية والمستلزمات المدرسية', tagline: 'للدراسة والإبداع… اختيارات ترافقهم كل يوم.', art: 'stationery',
    description: 'دفاتر وأقلام وحقائب مدرسية وأدوات رسم وتلوين، لكل ما يحتاجه الطلاب ومحبو الإبداع.' },
];

const BRANCHES = [
  { slug: 'mac-center', name: 'ماك سنتر', brand: 'ماك سنتر', short_name: 'ماك سنتر', phone: '0509191040',
    tagline: 'وجهة تسوق العائلة في المدينة المنورة', services: ['delivery', 'whatsapp_orders'] },
  { slug: 'adel-dairi', name: 'مجمع عادل الدولي فرع الدائري', brand: 'مجمع عادل الدولي', short_name: 'فرع الدائري', phone: '0556559092',
    tagline: 'مجمع عادل الدولي على الطريق الدائري', services: ['delivery', 'whatsapp_orders'] },
  { slug: 'adel-quba', name: 'مجمع عادل الدولي فرع قباء', brand: 'مجمع عادل الدولي', short_name: 'فرع قباء', phone: '0552259342',
    tagline: 'مجمع عادل الدولي في قباء', services: ['delivery', 'whatsapp_orders', 'tabby', 'tamara'] },
];

const FAQS = [
  ['كيف أطلب إذا كنت خارج المدينة المنورة؟', 'تواصل مع واتساب الفرع الأقرب لاختيارك، وسيساعدك فريق خدمة العملاء في الطلب وتأكيد التوفر وتفاصيل التوصيل.'],
  ['هل يوجد توصيل؟', 'نعم، يوجد توصيل لجميع مناطق المملكة. توضح لك خدمة العملاء رسوم التوصيل ومدته عند الطلب.'],
  ['أين تقع الفروع؟', 'لدينا ماك سنتر وفرعا مجمع عادل الدولي في الدائري وقباء بالمدينة المنورة. تجد في صفحة كل فرع الموقع ورابط الاتجاهات ورقم التواصل.'],
  ['كيف أشترك في العروض وكيف أوقفها؟', 'اختر الفروع والأقسام التي تهمك ثم أرسل رسالة الاشتراك الجاهزة عبر واتساب. ولإيقاف الرسائل أرسل كلمة «إيقاف» في أي وقت.'],
  ['كيف أتواصل بشأن ملاحظة أو شكوى؟', 'افتح صفحة الملاحظات واختر الفرع ونوع الملاحظة. ستحصل على رقم متابعة، وإذا تركت رقمك يتواصل معك موظف الفرع.'],
  ['هل تتوفر خدمة تابي وتمارا؟', 'تتوفر في الفروع التي تعتمدها الإدارة وفق شروط الأهلية الحالية. تجد الخدمات المتاحة في صفحة كل فرع.'],
];

export function seedCatalog(db) {
  if (db.prepare('SELECT COUNT(*) n FROM branches').get().n > 0) return;
  tx(db, () => {
    const sec = db.prepare('INSERT INTO sections (slug, name, tagline, description, art, sort) VALUES (?, ?, ?, ?, ?, ?)');
    SECTIONS.forEach((s, i) => sec.run(s.slug, s.name, s.tagline, s.description, s.art, i));
    const br = db.prepare(`INSERT INTO branches (slug, name, brand, short_name, tagline, phone, whatsapp, maps_url, services, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    BRANCHES.forEach((b, i) => {
      const intl = '966' + b.phone.slice(1);
      const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + ' المدينة المنورة')}`;
      br.run(b.slug, b.name, b.brand, b.short_name, b.tagline, b.phone, intl, maps, JSON.stringify(b.services), i);
    });
    // كل الأقسام متاحة مبدئيًا في كل الفروع حتى تحدد الإدارة التوفر الفعلي
    db.exec('INSERT INTO branch_sections (branch_id, section_id) SELECT b.id, s.id FROM branches b, sections s');
    const fq = db.prepare('INSERT INTO faqs (question, answer, sort) VALUES (?, ?, ?)');
    FAQS.forEach(([q, a], i) => fq.run(q, a, i));
    setSetting(db, 'site', {
      heroTitle: 'اختيارات العائلة في وجهة واحدة',
      heroText: 'أزياء للعائلة، وفساتين للمناسبات، وأحذية وحقائب، ومفروشات وألعاب، وقرطاسية ومستلزمات مدرسية، مع عروض تتابعها بسهولة وتوصيل لجميع مناطق المملكة.',
      about: 'في المدينة المنورة، يجمع ماك سنتر اختيارات العائلة في وجهة تسوق واحدة. من أزياء العائلة وفساتين المناسبات إلى الأحذية والحقائب، ومن المفروشات والألعاب إلى القرطاسية والمستلزمات المدرسية، تجد اختيارات تناسب يومك ومناسباتك واحتياجات الدراسة والإبداع.',
      about2: 'وتكتمل التجربة مع ماك سنتر ومجمع عادل الدولي بفرعَي قباء والدائري؛ لتتعرف على الأقسام والعروض المتاحة في كل فرع، وتصل إلى خدمة العملاء بسهولة. وإذا كنت خارج المدينة، يمكنك الاستفسار والطلب عبر واتساب والاستفادة من التوصيل لجميع مناطق المملكة.',
      socials: { snapchat: '', instagram: '', tiktok: '', x: '' },
      deliveryNote: 'تذكر رسوم التوصيل ومدده بوضوح عند الطلب.',
    });
    setSetting(db, 'messaging', { weeklyCap: 2, sendWindow: ['10:00', '22:00'], costPerMarketing: 0.0455, providerFeePerMessage: 0, currency: 'USD' });
    setSetting(db, 'tickets', { firstResponseMinutes: 30, urgentMinutes: 15, escalateAfterMinutes: 30 });
    setSetting(db, 'reviews', { autoReplyEnabled: false, autoReplyApprovedBy: null, ackLowRatings: false });
  });
}

function hydrateBranch(b, sectionIds, now) {
  if (!b) return null;
  const branch = {
    ...b,
    hours: json.parse(b.hours, null),
    exceptions: json.parse(b.exceptions, []),
    services: json.parse(b.services, []),
    sectionIds,
  };
  branch.status = openStatus(branch, now);
  return branch;
}

export function listBranches(db, { includeInactive = false, now = new Date() } = {}) {
  const rows = db.prepare(`SELECT * FROM branches ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();
  const links = db.prepare('SELECT branch_id, section_id FROM branch_sections').all();
  return rows.map((b) => hydrateBranch(b, links.filter((l) => l.branch_id === b.id).map((l) => l.section_id), now));
}

export function getBranch(db, { id, slug }) {
  const b = id != null
    ? db.prepare('SELECT * FROM branches WHERE id = ?').get(id)
    : db.prepare('SELECT * FROM branches WHERE slug = ?').get(slug);
  if (!b) return null;
  const ids = db.prepare('SELECT section_id FROM branch_sections WHERE branch_id = ?').all(b.id).map((r) => r.section_id);
  return hydrateBranch(b, ids);
}

export function listSections(db, { includeInactive = false } = {}) {
  const rows = db.prepare(`SELECT * FROM sections ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();
  const links = db.prepare('SELECT branch_id, section_id FROM branch_sections').all();
  return rows.map((s) => ({ ...s, branchIds: links.filter((l) => l.section_id === s.id).map((l) => l.branch_id) }));
}

export function listFaqs(db, { includeInactive = false } = {}) {
  return db.prepare(`SELECT * FROM faqs ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();
}

export function siteSettings(db) {
  return getSetting(db, 'site', {});
}

const PHONE_RE = /^05\d{8}$/;

export function saveBranch(db, id, input, { canEditCore = true } = {}) {
  const errors = {};
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').replace(/\D/g, '');
  if (canEditCore) {
    if (!name) errors.name = 'اسم الفرع مطلوب';
    if (!PHONE_RE.test(phone)) errors.phone = 'رقم جوال سعودي يبدأ بـ 05 ومن 10 أرقام';
  }
  let hours = null;
  if (input.hours) {
    try { hours = validateHours(input.hours); } catch { errors.hours = 'صيغة الدوام غير صحيحة'; }
  }
  // روابط الخريطة والتقييم تظهر للعملاء؛ نقبل روابط Google فقط
  const googleUrl = (v) => !v || /^https:\/\/([\w-]+\.)*(google\.[a-z.]+|goo\.gl|g\.page)(\/|$)/i.test(String(v).trim());
  if (!googleUrl(input.maps_url)) errors.maps_url = 'رابط خرائط Google يبدأ بـ https://';
  if (!googleUrl(input.google_review_url)) errors.google_review_url = 'رابط تقييم Google يبدأ بـ https://';
  const exceptions = Array.isArray(input.exceptions) ? input.exceptions.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.from)) : [];
  if (Object.keys(errors).length) fail(400, 'راجع الحقول المطلوبة', errors);

  return tx(db, () => {
    const services = JSON.stringify((input.services || []).filter((s) => s in SERVICE_LABELS));
    const common = [String(input.tagline || ''), String(input.address || ''), String(input.maps_url || ''),
      String(input.google_review_url || ''), hours ? JSON.stringify(hours) : null, JSON.stringify(exceptions), services];
    if (id) {
      if (canEditCore) {
        db.prepare(`UPDATE branches SET name=?, brand=?, short_name=?, phone=?, whatsapp=?, active=?, sort=?,
          google_location_id=?, lat=?, lng=? WHERE id=?`).run(
          name, String(input.brand || name), String(input.short_name || name), phone, '966' + phone.slice(1),
          input.active === false ? 0 : 1, Number(input.sort || 0), input.google_location_id || null,
          input.lat == null || input.lat === '' ? null : Number(input.lat), input.lng == null || input.lng === '' ? null : Number(input.lng), id);
      }
      db.prepare(`UPDATE branches SET tagline=?, address=?, maps_url=?, google_review_url=?, hours=?, exceptions=?, services=?,
        image=COALESCE(?, image), updated_at=datetime('now') WHERE id=?`).run(...common, input.image || null, id);
    } else {
      const slug = slugify(input.slug || name);
      if (db.prepare('SELECT 1 FROM branches WHERE slug = ?').get(slug)) fail(400, 'الرابط مستخدم لفرع آخر', { slug: 'مستخدم' });
      id = Number(db.prepare(`INSERT INTO branches (slug, name, brand, short_name, phone, whatsapp, sort, tagline, address, maps_url,
        google_review_url, hours, exceptions, services, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        slug, name, String(input.brand || name), String(input.short_name || name), phone, '966' + phone.slice(1),
        Number(input.sort || 99), ...common, input.image || null).lastInsertRowid);
    }
    if (Array.isArray(input.sectionIds)) {
      db.prepare('DELETE FROM branch_sections WHERE branch_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO branch_sections (branch_id, section_id) VALUES (?, ?)');
      for (const sid of input.sectionIds) ins.run(id, Number(sid));
    }
    return getBranch(db, { id });
  });
}

export function saveSection(db, id, input) {
  const name = String(input.name || '').trim();
  if (!name) fail(400, 'اسم القسم مطلوب', { name: 'مطلوب' });
  const art = ['fashion', 'dress', 'bags', 'home', 'toys', 'stationery'].includes(input.art) ? input.art : 'fashion';
  if (id) {
    db.prepare(`UPDATE sections SET name=?, tagline=?, description=?, art=?, sort=?, active=?, image=COALESCE(?, image) WHERE id=?`)
      .run(name, String(input.tagline || ''), String(input.description || ''), art, Number(input.sort || 0), input.active === false ? 0 : 1, input.image || null, id);
    if (input.removeImage) db.prepare('UPDATE sections SET image = NULL WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM sections WHERE id = ?').get(id);
  }
  const slug = slugify(input.slug || name);
  const r = db.prepare('INSERT INTO sections (slug, name, tagline, description, art, sort, image) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(slug, name, String(input.tagline || ''), String(input.description || ''), art, Number(input.sort || 99), input.image || null);
  return db.prepare('SELECT * FROM sections WHERE id = ?').get(r.lastInsertRowid);
}

export function saveFaq(db, id, input) {
  const q = String(input.question || '').trim(), a = String(input.answer || '').trim();
  if (!q || !a) fail(400, 'السؤال والإجابة مطلوبان');
  if (id) db.prepare('UPDATE faqs SET question=?, answer=?, sort=?, active=? WHERE id=?').run(q, a, Number(input.sort || 0), input.active === false ? 0 : 1, id);
  else id = Number(db.prepare('INSERT INTO faqs (question, answer, sort) VALUES (?, ?, ?)').run(q, a, Number(input.sort || 99)).lastInsertRowid);
  return db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
}

export function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function inquiryText(branch, { section, offer } = {}) {
  let t = `السلام عليكم، أتواصل من موقع ماك سنتر بخصوص ${branch.name}`;
  if (offer) t += `، عرض «${offer.title}»`;
  if (section) t += `، قسم ${section.name}`;
  return t + '.';
}
