// Unit tests for the unit conversions behind every UnitField (src/lib/units.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, nextUnit, toDisplay, fromDisplay, toFtIn, show } from '../src/lib/units.ts';

test('each kind starts with its base unit and a click cycles through its units', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(KINDS).map(([k, u]) => [k, u[0]])), { height: 'cm', length: 'cm', weight: 'kg', minutes: 'min', hours: 'h' });
  assert.equal(nextUnit('height', 'cm'), 'ftin'); assert.equal(nextUnit('height', 'ftin'), 'cm');
  assert.equal(nextUnit('minutes', 'min'), 'h'); assert.equal(nextUnit('hours', 'h'), 'min');
});

test('length: cm <-> inches', () => {
  assert.deepEqual(toDisplay(85, 'length', 'in'), ['33.5']);
  assert.equal(fromDisplay(['34'], 'length', 'in'), 86.36);
  assert.deepEqual(toDisplay(86.36, 'length', 'cm'), ['86.4']);
});

test('height: cm <-> feet and inches (two boxes; feet alone means 0 inches)', () => {
  assert.deepEqual(toDisplay(165, 'height', 'ftin'), ['5', '5']);
  assert.deepEqual(toDisplay(182.88, 'height', 'ftin'), ['6', '0']);
  assert.deepEqual(toFtIn(182.8), [6, 0], '71.97 in rounds to 72.0, so the next foot');
  assert.ok(Math.abs(fromDisplay(['5', '7'], 'height', 'ftin') - 170.18) < 1e-9);
  assert.ok(Math.abs(fromDisplay(['6', ''], 'height', 'ftin') - 182.88) < 1e-9);
  assert.ok(Number.isNaN(fromDisplay(['', ''], 'height', 'ftin')));
});

test('weight: kg <-> lb', () => {
  assert.deepEqual(toDisplay(66, 'weight', 'lb'), ['145.5']);
  assert.ok(Math.abs(fromDisplay(['150'], 'weight', 'lb') - 68.0389) < 1e-4);
});

test('time: minutes <-> hours, both ways', () => {
  assert.deepEqual(toDisplay(90, 'minutes', 'h'), ['1.5']);
  assert.deepEqual(toDisplay(45, 'minutes', 'h'), ['0.75']);
  assert.equal(fromDisplay(['1.5'], 'minutes', 'h'), 90);
  assert.deepEqual(toDisplay(7.5, 'hours', 'min'), ['450']);
  assert.equal(fromDisplay(['30'], 'hours', 'min'), 0.5);
});

test('empty stays empty; shown values have no trailing zeros', () => {
  assert.deepEqual(toDisplay(NaN, 'weight', 'lb'), ['']);
  assert.ok(Number.isNaN(fromDisplay([''], 'weight', 'kg')));
  assert.equal(show(65.0, 'in'), '65'); assert.equal(show(1.50, 'h'), '1.5');
});
