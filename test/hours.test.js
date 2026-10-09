import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStatus } from '../src/lib/hours.js';

// تحويل وقت الرياض إلى لحظة UTC
const at = (local) => new Date(`${local}:00+03:00`);
const branch = (hours, exceptions = []) => ({ hours, exceptions });

// 2026-10-08 خميس، 2026-10-09 جمعة
const week = {
  sat: [['09:00', '13:00'], ['16:00', '00:30']], sun: [['09:00', '13:00'], ['16:00', '00:30']], mon: [['09:00', '13:00'], ['16:00', '00:30']],
  tue: [['09:00', '13:00'], ['16:00', '00:30']], wed: [['09:00', '13:00'], ['16:00', '00:30']], thu: [['09:00', '13:00'], ['16:00', '01:00']], fri: [['16:00', '01:00']],
};

test('بدون دوام معتمد: الحالة غير معروفة', () => {
  assert.equal(openStatus(branch(null)).known, false);
});

test('فترتان في اليوم: مفتوح في الأولى ومغلق بينهما', () => {
  assert.equal(openStatus(branch(week), at('2026-10-08T10:00')).open, true);
  const mid = openStatus(branch(week), at('2026-10-08T14:00'));
  assert.equal(mid.open, false);
  assert.match(mid.label, /يفتح اليوم 4:00 م/);
});

test('الإغلاق بعد منتصف الليل يحسب لليوم السابق', () => {
  // الخميس يغلق 1:00 فجر الجمعة
  const s = openStatus(branch(week), at('2026-10-09T00:40'));
  assert.equal(s.open, true);
  assert.match(s.label, /يغلق 1:00 ص/);
  assert.equal(openStatus(branch(week), at('2026-10-09T01:10')).open, false);
});

test('الجمعة بفترة مسائية فقط والفتح القادم صحيح', () => {
  const s = openStatus(branch(week), at('2026-10-09T10:00'));
  assert.equal(s.open, false);
  assert.match(s.label, /اليوم 4:00 م/);
  assert.equal(s.opensAt, at('2026-10-09T16:00').toISOString());
});

test('استثناء إغلاق العيد يتقدم على الدوام الأسبوعي', () => {
  const s = openStatus(branch(week, [{ from: '2026-10-08', to: '2026-10-08', label: 'العيد', periods: [] }]), at('2026-10-08T10:00'));
  assert.equal(s.open, false);
  assert.match(s.label, /غدًا/);
});

test('دوام رمضان الخاص بالأسبوع', () => {
  const ramadan = { from: '2026-10-01', to: '2026-10-20', label: 'رمضان', week: { thu: [['20:00', '03:00']] } };
  assert.equal(openStatus(branch(week, [ramadan]), at('2026-10-08T10:00')).open, false);
  assert.equal(openStatus(branch(week, [ramadan]), at('2026-10-09T02:30')).open, true);
});

test('قرب الإغلاق يُعلَّم', () => {
  assert.equal(openStatus(branch(week), at('2026-10-08T12:30')).closingSoon, true);
});
