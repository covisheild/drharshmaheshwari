// Unit tests for the Indian Diabetes Risk Score (src/lib/idrs.ts), against the scoring table of Mohan et al. 2005.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agePoints, waistPoints, band, idrs } from '../src/lib/idrs.ts';

test('age: <35 = 0, 35-49 = 20, 50 or more = 30', () => {
  assert.deepEqual([20, 34, 35, 49, 50, 80].map(agePoints), [0, 0, 20, 20, 30, 30]);
});

test('waist uses different cut-offs for women and men', () => {
  assert.deepEqual([79, 80, 89, 89.9, 90, 120].map((w) => waistPoints(w, 'f')), [0, 10, 10, 10, 20, 20]);
  assert.deepEqual([89, 90, 99, 99.9, 100, 120].map((w) => waistPoints(w, 'm')), [0, 10, 10, 10, 20, 20]);
});

test('risk bands: <30 low, 30-50 moderate, 60 or more high', () => {
  assert.deepEqual([0, 20, 30, 50, 60, 100].map(band), ['low', 'low', 'moderate', 'moderate', 'high', 'high']);
});

test('totals run from 0 to 100', () => {
  assert.equal(idrs({ age: 25, sex: 'm', waist: 80, activity: 'both', family: 'none' }).score, 0);
  const max = idrs({ age: 60, sex: 'f', waist: 95, activity: 'none', family: 'both' });
  assert.equal(max.score, 100);
  assert.equal(max.changeable, 50);
  assert.equal(idrs({ age: 40, sex: 'm', waist: 92, activity: 'one', family: 'one' }).score, 60);
});
