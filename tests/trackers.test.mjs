// Unit tests for the BP and blood sugar trackers (src/lib/trackers.ts): the alert lines approved by Harsh on 11 Oct 2026,
// each tested on both sides of its boundary, plus averages, units, age and time. See docs/trackers-plan.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOn, isAdult, bpAverage, bpAlert, askToRepeat, sugarAlert, alertOf, alertText, homeWeekAverage, toMgdl, toMmol,
  fromInputs, toInputs, formatWhen, sugarShown, validReading, validPerson, bmiFor,
} from '../src/lib/trackers.ts';

const T = Date.UTC(2026, 9, 11, 4, 30); // 11 Oct 2026, 10:00 am in India
const bp = (values, extra = {}) => ({ id: 'reading-1', person: 'person-1', kind: 'bp', setting: 'home', values, at: T, tz: 330, created: T, updated: T, ...extra });
const sugar = (test, value, extra = {}) => ({ id: 'reading-2', person: 'person-1', kind: 'sugar', test, sample: 'meter', value, unit: test === 'hba1c' ? 'pct' : 'mgdl', at: T, tz: 330, created: T, updated: T, ...(test === 'hba1c' ? { sample: 'lab' } : {}), ...extra });

test('BP alert: SBP 180 or DBP 110 and above; 179/109 is not', () => {
  assert.equal(bpAlert(bp([{ s: 179, d: 109 }])), null);
  assert.equal(bpAlert(bp([{ s: 180, d: 80 }])), 'high');
  assert.equal(bpAlert(bp([{ s: 150, d: 110 }])), 'high');
  assert.equal(bpAlert(bp([{ s: 150, d: 109 }])), null);
});

test('BP: no alert for low readings (Harsh, 11 Oct 2026)', () => {
  assert.equal(bpAlert(bp([{ s: 82, d: 50 }])), null);
});

test('BP: a very high first reading asks for a repeat; the sitting is judged on its average', () => {
  assert.equal(askToRepeat([{ s: 184, d: 100 }]), true);
  assert.equal(askToRepeat([{ s: 170, d: 100 }]), false);
  assert.equal(askToRepeat([{ s: 184, d: 100 }, { s: 172, d: 96 }]), false, 'already repeated');
  assert.deepEqual(bpAverage([{ s: 184, d: 100, p: 80 }, { s: 172, d: 96 }]), { s: 178, d: 98, p: 80 });
  assert.equal(bpAlert(bp([{ s: 184, d: 100 }, { s: 172, d: 96 }])), null, 'average 178/98: the alert goes');
  assert.equal(bpAlert(bp([{ s: 186, d: 100 }, { s: 182, d: 96 }])), 'high', 'average 184/98: it stays');
});

test('sugar alert: below 54 severely low, below 70 low, 300 and above very high; HbA1c never alerts', () => {
  assert.equal(sugarAlert({ test: 'rbs', value: 53 }), 'very-low');
  assert.equal(sugarAlert({ test: 'rbs', value: 54 }), 'low');
  assert.equal(sugarAlert({ test: 'fbs', value: 69 }), 'low');
  assert.equal(sugarAlert({ test: 'fbs', value: 70 }), null);
  assert.equal(sugarAlert({ test: 'ppbs', value: 299 }), null);
  assert.equal(sugarAlert({ test: 'ppbs', value: 300 }), 'high');
  assert.equal(sugarAlert({ test: 'hba1c', value: 14 }), null);
  assert.equal(alertText(sugar('rbs', 320)).title, 'Very high sugar');
  assert.equal(alertText(bp([{ s: 190, d: 100 }])).title, 'Very high reading');
  assert.equal(alertOf(sugar('rbs', 40, { deleted: T })), null, 'a deleted reading never alerts');
});

test('mmol/L and mg/dL', () => {
  assert.equal(Math.round(toMgdl(3.9)), 70);
  assert.equal(Math.round(toMgdl(7)), 126);
  assert.equal(toMmol(126).toFixed(1), '7.0');
  assert.equal(sugarShown(sugar('fbs', toMgdl(6.1), { unit: 'mmol' })), '6.1 mmol/L');
  assert.equal(sugarShown(sugar('hba1c', 6.5)), '6.5 %');
});

test('age from the month of birth; adults only', () => {
  const now = new Date(2026, 9, 11);
  assert.equal(ageOn('2008-10', now), 18);
  assert.equal(ageOn('2008-11', now), 17);
  assert.equal(isAdult('2008-10', now), true);
  assert.equal(isAdult('2008-11', now), false);
  assert.equal(ageOn('2008-13', now), null);
  assert.equal(validPerson({ id: 'person-1', label: 'Papa', born: '2010-01', sex: 'm', created: T, updated: T }), false);
  assert.equal(validPerson({ id: 'person-1', label: 'Papa', born: '1958-01', sex: 'm', created: T, updated: T }), true);
});

test('home BP: the mean of home sittings in the 7 days up to the latest; clinic readings left out', () => {
  const day = 86_400_000;
  const rs = [
    bp([{ s: 160, d: 100 }], { id: 'old-1', at: T - 10 * day }), // more than 7 days before the latest
    bp([{ s: 130, d: 80 }], { id: 'h-1', at: T - 6 * day }),
    bp([{ s: 140, d: 90 }, { s: 136, d: 86 }], { id: 'h-2', at: T }),
    bp([{ s: 170, d: 100 }], { id: 'c-1', at: T, setting: 'clinic' }),
  ];
  const w = homeWeekAverage(rs);
  assert.equal(w.n, 2);
  assert.deepEqual(w.avg, { s: 134, d: 84, p: null });
});

test('time: entered as the clock read in India, shown back the same way anywhere', () => {
  const at = fromInputs('2026-10-11', '07:45', 330);
  assert.equal(at, Date.UTC(2026, 9, 11, 2, 15));
  assert.deepEqual(toInputs(at, 330), { date: '2026-10-11', time: '07:45' });
  assert.equal(formatWhen(at, 330), '11 Oct 2026, 7:45 am');
  assert.equal(formatWhen(fromInputs('2026-10-11', '00:05', 330), 330), '11 Oct 2026, 12:05 am');
});

test('readings outside sensible ranges are refused', () => {
  assert.equal(validReading(bp([{ s: 120, d: 80 }])), true);
  assert.equal(validReading(bp([{ s: 80, d: 80 }])), false, 'SBP must be above DBP');
  assert.equal(validReading(bp([{ s: 120, d: 80 }, { s: 120, d: 80 }, { s: 120, d: 80 }, { s: 120, d: 80 }])), false, 'at most 3 per sitting');
  assert.equal(validReading(sugar('fbs', 650)), false);
  assert.equal(validReading(sugar('hba1c', 6.5, { sample: 'meter' })), false, 'HbA1c is a lab test');
  assert.equal(validReading({ ...sugar('fbs', 100), note: 'x'.repeat(301) }), false);
});

test('BMI from the latest weight and the height', () => {
  const p = { id: 'person-1', label: 'Me', born: '1990-01', sex: 'm', heightCm: 170, created: T, updated: T };
  const w = (kg, at) => ({ id: `w-${kg}-x`, person: 'person-1', kind: 'weight', kg, at, tz: 330, created: T, updated: T });
  assert.equal(bmiFor(p, [w(80, T - 1000), w(72.3, T)]), 25);
  assert.equal(bmiFor({ ...p, heightCm: null }, [w(72.3, T)]), null);
});
