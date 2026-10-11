// Unit tests for FIB-4 (src/lib/fib4.ts): the formula and the fatty-liver cut-offs, with the age-65 lower cut-off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fib4, fib4Band, lakhToSI } from '../src/lib/fib4.ts';

test('formula: age x AST / (platelets x sqrt(ALT))', () => {
  assert.equal(fib4({ age: 50, ast: 40, alt: 64, platelets: 200 }), (50 * 40) / (200 * 8)); // 1.25
  assert.ok(Math.abs(fib4({ age: 60, ast: 55, alt: 49, platelets: 150 }) - 3.1429) < 1e-4);
});

test('platelets in lakh/mm³ convert to 10^9/L', () => {
  assert.equal(lakhToSI(2.5), 250);
  assert.equal(lakhToSI(1.2), 120);
});

test('bands under 65: below 1.30 low, 1.30-2.67 indeterminate, above 2.67 high (INASL)', () => {
  assert.deepEqual([1.29, 1.3, 2.67, 2.68, 4].map((v) => fib4Band(v, 50).band), ['low', 'indeterminate', 'indeterminate', 'high', 'high']);
  assert.equal(fib4Band(1.296, 50).band, 'indeterminate', 'classified as shown: 1.296 is displayed as 1.30');
});

test('from 65 years the lower cut-off is 2.0', () => {
  assert.deepEqual([1.5, 1.99, 2.0, 2.68].map((v) => fib4Band(v, 65).band), ['low', 'low', 'indeterminate', 'high']);
  assert.equal(fib4Band(1.5, 64).band, 'indeterminate');
  assert.equal(fib4Band(1.5, 70).lower, 2);
});
