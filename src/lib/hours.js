import { DAYS, riyadhParts, riyadhInstant, addDays, dayOf, toMinutes, formatMinutes, DAY_NAMES } from './time.js';

/*
 * الدوام الأسبوعي: { sun: [["09:00","13:00"],["16:00","01:00"]], fri: [["16:00","24:00"]] }
 * الفترة التي تنتهي قبل بدايتها تمتد بعد منتصف الليل إلى اليوم التالي.
 * الاستثناءات: [{ from: "2026-03-01", to: "2026-03-30", label: "رمضان", week: {...} }]
 *              أو [{ from: "2026-03-30", to: "2026-03-30", label: "العيد", periods: [] }]  ← مغلق
 * الاستثناء الأحدث في القائمة يتقدم عند التداخل.
 */

export function validateHours(hours) {
  if (hours == null) return null;
  const out = {};
  for (const day of DAYS) {
    const periods = hours[day] || [];
    out[day] = periods.map((p) => normalizePeriod(p)).filter(Boolean);
  }
  return out;
}

function normalizePeriod(p) {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const a = toMinutes(p[0]), b = toMinutes(p[1]);
  if (a == null || b == null || a === b) return null;
  return [p[0], p[1]];
}

function periodsFor(dateStr, hours, exceptions) {
  for (let i = exceptions.length - 1; i >= 0; i--) {
    const ex = exceptions[i];
    if (ex.from <= dateStr && dateStr <= (ex.to || ex.from)) {
      if (Array.isArray(ex.periods)) return { periods: ex.periods, label: ex.label };
      if (ex.week) return { periods: ex.week[dayOf(dateStr)] || [], label: ex.label };
    }
  }
  return { periods: hours?.[dayOf(dateStr)] || [], label: null };
}

// يحول فترات يوم إلى نوافذ مطلقة بالدقائق من بداية ذلك اليوم
function windowsFor(dateStr, hours, exceptions) {
  const { periods, label } = periodsFor(dateStr, hours, exceptions);
  return periods.map(([s, e]) => {
    const start = toMinutes(s);
    let end = toMinutes(e);
    if (end <= start) end += 1440;
    return { dateStr, start, end, label };
  });
}

export function openStatus(branch, now = new Date()) {
  const hours = branch.hours;
  if (!hours) return { known: false };
  const exceptions = branch.exceptions || [];
  const { date, minutes } = riyadhParts(now);

  // نافذة أمس قد تمتد بعد منتصف الليل
  const windows = [
    ...windowsFor(addDays(date, -1), hours, exceptions).map((w) => ({ ...w, start: w.start - 1440, end: w.end - 1440 })),
    ...windowsFor(date, hours, exceptions),
  ];
  const current = windows.find((w) => minutes >= w.start && minutes < w.end);
  if (current) {
    const closesAt = riyadhInstant(date, current.end);
    return {
      known: true, open: true, closesAt: closesAt.toISOString(),
      label: `مفتوح الآن · يغلق ${formatMinutes(current.end)}`,
      closingSoon: current.end - minutes <= 60,
      note: current.label,
    };
  }

  for (let offset = 0; offset < 14; offset++) {
    const day = addDays(date, offset);
    const next = windowsFor(day, hours, exceptions)
      .filter((w) => offset > 0 || w.start > minutes)
      .sort((a, b) => a.start - b.start)[0];
    if (next) {
      const opensAt = riyadhInstant(day, next.start);
      const when = offset === 0 ? 'اليوم' : offset === 1 ? 'غدًا' : DAY_NAMES[dayOf(day)];
      return {
        known: true, open: false, opensAt: opensAt.toISOString(),
        label: `مغلق الآن · يفتح ${when} ${formatMinutes(next.start)}`,
        note: next.label,
      };
    }
  }
  return { known: true, open: false, label: 'مغلق حاليًا', note: null };
}

// جدول الأسبوع للعرض
export function weekTable(branch) {
  if (!branch.hours) return null;
  return DAYS.map((day) => ({
    day, name: DAY_NAMES[day],
    periods: (branch.hours[day] || []).map(([s, e]) => `${formatMinutes(toMinutes(s))} – ${formatMinutes(toMinutes(e))}`),
  }));
}

// صيغة schema.org openingHoursSpecification
export function openingHoursSpec(branch) {
  if (!branch.hours) return [];
  const map = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
  return DAYS.flatMap((d) => (branch.hours[d] || []).map(([opens, closes]) => ({
    '@type': 'OpeningHoursSpecification', dayOfWeek: map[d], opens, closes: closes === '24:00' ? '23:59' : closes,
  })));
}
