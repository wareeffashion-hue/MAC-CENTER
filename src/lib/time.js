// توقيت الرياض ثابت على UTC+3 دون توقيت صيفي، فنحسب بالإزاحة مباشرة
const OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES = { sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة', sat: 'السبت' };

// يحول لحظة زمنية إلى مكونات تقويم الرياض
export function riyadhParts(date = new Date()) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    day: DAYS[d.getUTCDay()],
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

// لحظة UTC المقابلة لتاريخ ودقيقة بتوقيت الرياض
export function riyadhInstant(dateStr, minutes) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + minutes * 60000 - OFFSET_MS);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOf(dateStr) {
  return DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

// "2026-10-09 18:30" بتوقيت الرياض → ISO
export function riyadhLocalToIso(local) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(String(local || ''));
  if (!m) return null;
  return riyadhInstant(m[1], toMinutes(m[2])).toISOString();
}

export function isoToRiyadhLocal(iso) {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + OFFSET_MS);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function sqlNow(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// تنسيق عربي للتاريخ والوقت مع أرقام عربية مشرقية حسب اختيار الواجهة
const fmtDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long' });

export function formatDate(iso) {
  const t = Date.parse(String(iso).includes('T') || String(iso).endsWith('Z') ? iso : `${String(iso).replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? '' : fmtDate.format(new Date(t));
}

export function formatTime(date) { return fmtTime.format(date); }
export function formatWeekday(date) { return fmtWeekday.format(date); }

export function formatMinutes(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const period = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}
