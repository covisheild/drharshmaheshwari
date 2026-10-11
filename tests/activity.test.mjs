// Unit tests for the activity check (src/lib/activity.ts): IPAQ-SF scoring (protocol of Nov 2005) and the WHO
// targets by age (WHO 2020; WHO 2019 for under-5s). Worked examples sit on each boundary. See docs/activity-check-plan.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipaqScore, whoAdult, whoYouth, whoTeen, whoUnder5 } from '../src/lib/activity.ts';

const b = (days, minutes = null) => ({ days, minutes });
const none = { vigorous: b(0), moderate: b(0), walking: b(0) };
const status = (r, id) => r.checks.find((c) => c.id === id)?.status;

// ---------- IPAQ ----------

test('IPAQ: the protocol\'s own worked example (30 min, 5 days each) gives 2295 MET-min', () => {
  const r = ipaqScore({ vigorous: b(5, 30), moderate: b(5, 30), walking: b(5, 30) });
  assert.equal(r.ok, true);
  assert.equal(r.walking.met, 495); assert.equal(r.moderate.met, 600); assert.equal(r.vigorous.met, 1200);
  assert.equal(r.total, 2295);
  assert.equal(r.level, 'high'); // vigorous on 3+ days and >= 1500
});

test('IPAQ: no answer yet, or nothing at all', () => {
  assert.deepEqual(ipaqScore({ ...none, walking: b(null) }), { ok: false, reason: 'unanswered' });
  assert.deepEqual(ipaqScore({ ...none, walking: b(3) }), { ok: false, reason: 'unanswered' }, 'days without minutes');
  const r = ipaqScore(none);
  assert.equal(r.level, 'low'); assert.equal(r.total, 0);
});

test('IPAQ: High by vigorous 3+ days, at 1499 vs 1500 MET-min', () => {
  // 3 days x 62.5 min x 8 = 1500: use moderate to fine-tune instead.
  // vigorous 3 x 60 x 8 = 1440; + moderate 1 x 15 x 4 = 60 -> 1500.
  assert.equal(ipaqScore({ vigorous: b(3, 60), moderate: b(1, 15), walking: b(0) }).level, 'high');
  // moderate 1 x 14.75 not possible in whole minutes: use walking 0, moderate 1 x 14 -> 1496.
  const r = ipaqScore({ vigorous: b(3, 60), moderate: b(1, 14), walking: b(0) });
  assert.equal(r.total, 1496);
  assert.equal(r.level, 'moderate'); // falls to Moderate (vigorous 3 days >= 20 min)
});

test('IPAQ: High by 7+ days and 3000 MET-min (days added across kinds)', () => {
  // moderate 4 x 180 x 4 = 2880; walking 3 x 20 x 3.3 = 198 -> 3078, 7 days
  const hi = ipaqScore({ vigorous: b(0), moderate: b(4, 180), walking: b(3, 20) });
  assert.equal(hi.level, 'high');
  // same volume on 6 days only -> not High
  const mod = ipaqScore({ vigorous: b(0), moderate: b(4, 180), walking: b(2, 30) });
  assert.equal(mod.level, 'moderate');
  // 7 days but 2999.x -> not High: moderate 7 x 107 x 4 = 2996
  assert.equal(ipaqScore({ vigorous: b(0), moderate: b(7, 107), walking: b(0) }).total, 2996);
  assert.equal(ipaqScore({ vigorous: b(0), moderate: b(7, 107), walking: b(0) }).level, 'moderate');
});

test('IPAQ: Moderate by vigorous 3 days of at least 20 minutes (19 is not enough)', () => {
  assert.equal(ipaqScore({ ...none, vigorous: b(3, 20) }).level, 'moderate');
  assert.equal(ipaqScore({ ...none, vigorous: b(3, 19) }).level, 'low');
  assert.equal(ipaqScore({ ...none, vigorous: b(2, 60) }).level, 'low');
});

test('IPAQ: Moderate by 5 days of moderate and/or walking of 30+ minutes', () => {
  assert.equal(ipaqScore({ ...none, moderate: b(2, 30), walking: b(3, 30) }).level, 'moderate');
  assert.equal(ipaqScore({ ...none, moderate: b(2, 30), walking: b(3, 29) }).level, 'low', 'walking under 30 min: only 2 days count, and 471 MET-min');
});

test('IPAQ: Moderate by 5 days and 600 MET-min, at 599 vs 600', () => {
  // walking 5 x 37 x 3.3 = 610.5 -> moderate; 5 x 36 x 3.3 = 594 -> but 36 >= 30 already counts as criterion b.
  // Use mixed short bouts: vigorous 2 x 20 x 8 = 320 + moderate 3 x 23 x 4 = 276 -> 596 (low); 3 x 24 x 4 = 288 -> 608 (moderate)
  assert.equal(ipaqScore({ vigorous: b(2, 20), moderate: b(3, 23), walking: b(0) }).level, 'low');
  assert.equal(ipaqScore({ vigorous: b(2, 20), moderate: b(3, 24), walking: b(0) }).level, 'moderate');
  // 600 exactly: moderate 5 x 30 x 4 (criterion b also true) - check total
  assert.equal(ipaqScore({ ...none, moderate: b(5, 30) }).total, 600);
});

test('IPAQ cleaning: under 10 minutes a day is zero, over 180 is cut to 180, over 16 hours is excluded', () => {
  const r = ipaqScore({ vigorous: b(0), moderate: b(0), walking: b(7, 9) });
  assert.equal(r.walking.days, 0); assert.equal(r.total, 0); assert.equal(r.level, 'low');
  assert.equal(r.notes.length, 1);
  const t = ipaqScore({ vigorous: b(0), moderate: b(1, 600), walking: b(6, 10) });
  assert.equal(t.moderate.minutes, 180);
  assert.equal(t.moderate.met, 720);
  assert.notEqual(t.level, 'high', 'the protocol\'s own example: truncation stops a 12-hour day making someone High');
  assert.deepEqual(ipaqScore({ vigorous: b(1, 400), moderate: b(1, 400), walking: b(1, 161) }), { ok: false, reason: 'over16h' });
  assert.equal(ipaqScore({ vigorous: b(1, 400), moderate: b(1, 400), walking: b(1, 160) }).ok, true, '960 exactly is allowed');
});

// ---------- WHO adults ----------

test('WHO adult: moderate-equivalent = moderate + walking + 2 x vigorous; 149 vs 150; 300 upper', () => {
  const a = (vig, mod, walk) => whoAdult('adult', { vigorous: vig, moderate: mod, walking: walk, strengthDays: 2 });
  let r = a(b(0), b(0), b(5, 30));
  assert.equal(r.aerobic.minutes, 150); assert.equal(status(r, 'aerobic'), 'met'); assert.equal(status(r, 'upper'), 'not');
  r = a(b(1, 4), b(0), b(1, 141)); // 8 + 141 = 149
  assert.equal(r.aerobic.minutes, 149); assert.equal(status(r, 'aerobic'), 'not');
  assert.match(r.aerobic.gap, /^1 more minutes? a week/);
  r = a(b(3, 25), b(0), b(0)); // 75 vigorous = 150
  assert.equal(r.aerobic.minutes, 150); assert.equal(status(r, 'aerobic'), 'met');
  r = a(b(3, 50), b(0), b(0)); // 150 vigorous = 300
  assert.equal(status(r, 'upper'), 'met');
});

test('WHO adult: every minute counts (no 10-minute rule), unlike the IPAQ score', () => {
  const ans = { vigorous: b(0), moderate: b(0), walking: b(7, 9), strengthDays: 0 };
  assert.equal(whoAdult('adult', ans).aerobic.minutes, 63);
  assert.equal(ipaqScore(ans).total, 0);
});

test('WHO adult: strength on 2+ days; 65+ also balance on 3+ days', () => {
  const base = { ...none, strengthDays: 1 };
  assert.equal(status(whoAdult('adult', base), 'strength'), 'not');
  assert.equal(status(whoAdult('adult', { ...base, strengthDays: 2 }), 'strength'), 'met');
  assert.equal(status(whoAdult('adult', base), 'balance'), undefined);
  assert.equal(status(whoAdult('older', { ...base, balanceDays: 2 }), 'balance'), 'not');
  assert.equal(status(whoAdult('older', { ...base, balanceDays: 3 }), 'balance'), 'met');
  assert.equal(status(whoAdult('older', { ...base, balanceDays: null }), 'balance'), 'unknown');
});

test('WHO pregnancy: 150 minimum, no upper target, any strengthening counts', () => {
  const r = whoAdult('adult', { vigorous: b(0), moderate: b(5, 30), walking: b(0), strengthDays: 1, pregnant: true });
  assert.equal(status(r, 'aerobic'), 'met'); assert.equal(status(r, 'upper'), undefined); assert.equal(status(r, 'strength'), 'met');
  assert.equal(r.aerobic.upper, undefined);
  assert.equal(r.notes.length, 1);
  assert.equal(status(whoAdult('older', { ...none, strengthDays: 2, pregnant: true }), 'upper'), 'not', 'the pregnancy option is only for 18-64');
});

// ---------- WHO children and adolescents ----------

test('WHO 5-17: average 60 a day across the week = 420 a week; vigorous and strength on 3+ days', () => {
  let r = whoYouth({ mvpaWeekMin: 420, vigorousDays: 3, strengthDays: 3 });
  assert.deepEqual(r.checks.map((c) => c.status), ['met', 'met', 'met']);
  r = whoYouth({ mvpaWeekMin: 419, vigorousDays: 2, strengthDays: 2 });
  assert.deepEqual(r.checks.map((c) => c.status), ['not', 'not', 'not']);
  assert.match(r.aerobic.gap, /^1 more minute/);
  // an average, not every day: 4 days of 105 minutes reaches it
  assert.equal(whoYouth({ mvpaWeekMin: 4 * 105, vigorousDays: 0, strengthDays: 0 }).checks[0].status, 'met');
});

test('WHO 15-17: IPAQ answers give the child figures (no doubling of vigorous)', () => {
  const r = whoTeen({ vigorous: b(3, 40), moderate: b(2, 60), walking: b(7, 30), strengthDays: 3 });
  assert.equal(r.aerobic.minutes, 120 + 120 + 210); // 450
  assert.equal(r.aerobic.target, 420);
  assert.equal(status(r, 'vigorous'), 'met');
  assert.equal(status(whoTeen({ ...none, strengthDays: 0 }), 'vigorous'), 'not');
});

// ---------- WHO under 5 ----------

test('WHO under 1: tummy time if not yet mobile, floor play if mobile; no screens; sleep by age', () => {
  let r = whoUnder5('infant', { mobile: false, tummyMin: 30, restrained: false, screenMin: 0, sleepH: 15 });
  assert.deepEqual(r.checks.map((c) => [c.id, c.status]), [['tummy', 'met'], ['restrained', 'met'], ['screen', 'met'], ['sleep', 'met']]);
  r = whoUnder5('infant', { mobile: false, tummyMin: 29, restrained: true, screenMin: 5, sleepH: 13 });
  assert.deepEqual(r.checks.map((c) => c.status), ['not', 'not', 'not', 'not']);
  assert.equal(status(whoUnder5('infant', { older: true, sleepH: 13 }), 'sleep'), 'met', '4-11 months: 12-16 h');
  assert.equal(status(whoUnder5('infant', { mobile: true, floorPlay: true }), 'play'), 'met');
  assert.equal(status(whoUnder5('infant', {}), 'play'), 'unknown');
});

test('WHO 1-2 years: 180 min any intensity; screens none at 1, up to 1 hour at 2; sleep 11-14', () => {
  assert.equal(status(whoUnder5('toddler', { activeMin: 179 }), 'active'), 'not');
  assert.equal(status(whoUnder5('toddler', { activeMin: 180 }), 'active'), 'met');
  assert.equal(status(whoUnder5('toddler', { screenMin: 30 }), 'screen'), 'not');
  assert.equal(status(whoUnder5('toddler', { older: true, screenMin: 60 }), 'screen'), 'met');
  assert.equal(status(whoUnder5('toddler', { older: true, screenMin: 61 }), 'screen'), 'not');
  assert.equal(status(whoUnder5('toddler', { sleepH: 14 }), 'sleep'), 'met');
  assert.equal(status(whoUnder5('toddler', { sleepH: 15 }), 'sleep'), 'not');
});

test('WHO 3-4 years: 180 min of which 60 energetic; screens up to 1 hour; sleep 10-13', () => {
  const r = whoUnder5('preschool', { activeMin: 180, mvpaMin: 59, restrained: false, screenMin: 60, sleepH: 10 });
  assert.deepEqual(r.checks.map((c) => [c.id, c.status]), [['active', 'met'], ['mvpa', 'not'], ['restrained', 'met'], ['screen', 'met'], ['sleep', 'met']]);
});
