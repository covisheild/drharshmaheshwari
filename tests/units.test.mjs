// Unit tests for the unit conversions behind every UnitField (src/lib/units.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, nextUnit, toDisplay, fromDisplay, toFtIn, show, unitFieldHTML } from '../src/lib/units.ts';

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

test('the field markup is one source for built pages and browser-built screens (trainers, trackers)', () => {
  const h = unitFieldHTML({ id: 'hcm', kind: 'height', label: 'Height', placeholder: 165 });
  assert.match(h, /data-unit-field data-kind="height" data-unit="cm"/);
  assert.equal((h.match(/<input data-uf /g) ?? []).length, 2, 'height has a feet box and an inches box');
  assert.match(h, /id="hcm-in"/);
  const m = unitFieldHTML({ id: 'x', kind: 'minutes', label: 'A "quoted" <label>', placeholder: 30, per: '/day' });
  assert.match(m, /<span class="uf-label">min\/day<\/span>/);
  assert.doesNotMatch(m, /"quoted"|<label>/, 'attribute text is escaped');
});

// Rule (CLAUDE.md, "Units everywhere"): no number box anywhere in the source, including screens that trainers and
// trackers build in the browser, may skip the unit field. A box with nothing to convert says so with data-unitless.
test('source guard: every number box in src/ is a unit field or marked data-unitless', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : /\.(astro|ts|tsx|js|mjs|html)$/.test(n) && files.push(f); } };
  walk(new URL('../src/', import.meta.url).pathname);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const tag of text.match(/<input\b[^>]*>/g) ?? []) {
      if (/type=["'{]?number/.test(tag) && !/data-(uf|unitless)\b/.test(tag)) bad.push(`${f}: ${tag.slice(0, 100)}`);
    }
    text.split('\n').forEach((line, i) => {
      if (/\.type\s*=\s*['"]number['"]|type:\s*['"]number['"]|setAttribute\(\s*['"]type['"]\s*,\s*['"]number['"]/.test(line) && !/unitless/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, [], 'use UnitField / createUnitField, or add data-unitless if the number has no unit to convert');
});
