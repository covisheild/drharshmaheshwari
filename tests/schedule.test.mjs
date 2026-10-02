// Spaced repetition (src/trainers/core/schedule.ts): what Review asks, and when items come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueItems, nextDue, scheduleItems } from '../src/trainers/core/schedule.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 9);
let n = 0;
const at = (item, correct, t, set = 'l1') => ({ id: `a${n++}`, trainer: 'auscultation', version: 'v', item, set, activity: 'quiz', parts: [], correct, t });

test('an item answered wrong last time is due straight away, whatever happened before', () => {
  const log = [at('A', true, T0), at('A', true, T0 + 3 * DAY), at('A', false, T0 + 10 * DAY)];
  assert.deepEqual(dueItems(log, T0 + 10 * DAY + 1000).map((d) => d.item), ['A']);
});

test('an item answered right is not due at once, and comes back after a gap of days', () => {
  const log = [at('A', true, T0)];
  assert.equal(dueItems(log, T0 + 60_000).length, 0);
  const next = nextDue(log, T0 + 60_000);
  assert.ok(next && next.at - T0 >= DAY, `first gap should be at least a day, got ${(next.at - T0) / DAY} days`);
  assert.deepEqual(dueItems(log, next.at).map((d) => d.item), ['A']);
});

test('each further right answer, given when due, lengthens the gap', () => {
  const log = [at('A', true, T0)];
  const gaps = [];
  for (let i = 0; i < 4; i++) {
    const due = scheduleItems(log).get('A').card.due.getTime();
    gaps.push(due - log.at(-1).t);
    log.push(at('A', true, due));
  }
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `gaps should grow: ${gaps.map((g) => (g / DAY).toFixed(1))}`);
  assert.ok(scheduleItems(log).get('A').card.due.getTime() - log.at(-1).t <= 366 * DAY, 'capped at a year');
});

test('a lapse after a long streak shortens the next gap', () => {
  const good = [at('A', true, T0), at('A', true, T0 + 3 * DAY), at('A', true, T0 + 12 * DAY)];
  const before = scheduleItems(good).get('A').card.stability;
  const lapsed = [...good, at('A', false, T0 + 40 * DAY), at('A', true, T0 + 40 * DAY + 60_000)];
  assert.ok(scheduleItems(lapsed).get('A').card.stability < before);
});

test('order: missed items first (newest first), then the most overdue; the schedule ignores input order', () => {
  const log = [at('old', true, T0), at('older', true, T0 - 5 * DAY), at('m1', false, T0 + 1000), at('m2', false, T0 + 2000)];
  const now = T0 + 200 * DAY;
  assert.deepEqual(dueItems(log, now).map((d) => d.item), ['m2', 'm1', 'older', 'old']);
  assert.deepEqual(dueItems([...log].reverse(), now).map((d) => d.item), ['m2', 'm1', 'older', 'old']);
  assert.equal(dueItems(log, now).find((d) => d.item === 'm1').set, 'l1');
});
