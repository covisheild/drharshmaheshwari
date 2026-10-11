// Unit tests for the BMI calculator's arithmetic (src/lib/bmi.ts): adult targets, IAP 2015 charts (5-17) and WHO (2-4) for children.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adultCategory, childHealthyBmi, iapBand, iapCategory, iapLines, maxWaist, percentile, targetWeight, whoUnder5Category, zScore } from '../src/lib/bmi.ts';

test('adult target weight is BMI 21-22 at the given height', () => {
  const [lo, hi] = targetWeight(170);
  assert.equal(lo.toFixed(1), '60.7');
  assert.equal(hi.toFixed(1), '63.6');
});

test('largest healthy waist is the lower of the Indian cut-off and half the height', () => {
  assert.deepEqual(maxWaist(165, 'm'), { cm: 82.5, by: 'half height' });
  assert.deepEqual(maxWaist(190, 'm'), { cm: 90, by: 'cut-off' });
  assert.deepEqual(maxWaist(170, 'f'), { cm: 80, by: 'cut-off' });
  assert.deepEqual(maxWaist(150, 'f'), { cm: 75, by: 'half height' });
});

test('adult categories use the Indian cut-offs', () => {
  assert.equal(adultCategory(22.9).tone, 'ok');
  assert.equal(adultCategory(23).tone, 'warn');
  assert.equal(adultCategory(25).tone, 'risk');
});

test('IAP 2015 lines are read from the paper at half-year ages and interpolated between them', () => {
  // Table VI, boys 10.0 years: P3 12.9, adult-equivalent 23 = 18.0, 27 = 20.5.
  const b10 = iapLines(120, 'm');
  assert.deepEqual([b10.p3, b10.ow, b10.ob], [12.9, 18.0, 20.5]);
  // Table VII, girls 14.0 / 14.5 years: 23-line 21.8 / 22.0, so 14 years 3 months is 21.9.
  assert.equal(iapLines(171, 'f').ow.toFixed(2), '21.90');
  // 17 years 11 months stays inside the table (18.0 row): boys 23-line between 22.9 and 23.2.
  const b17 = iapLines(215, 'm').ow;
  assert.ok(b17 > 22.9 && b17 < 23.2);
});

test('IAP categories: thinness below P3, overweight from the 23 line, obesity from the 27 line', () => {
  const l = iapLines(120, 'm');
  assert.match(iapCategory(12.8, l).label, /^Thinness/);
  assert.equal(iapCategory(16, l).tone, 'ok');
  assert.match(iapCategory(18.0, l).label, /^Overweight/);
  assert.match(iapCategory(20.5, l).label, /^Obesity/);
  assert.equal(iapBand(15.0, l, 'm'), 'between the 25th percentile and the 50th percentile');
  assert.equal(iapBand(21, l, 'm'), 'at or above the obesity line (about the 90th percentile)');
  assert.deepEqual(childHealthyBmi(120, 'm'), [12.9, 18.0]);
});

test('under 5: WHO z-scores and categories (IAP recommends WHO below 5 years)', () => {
  // WHO 2006 median for boys at 36 months (day 1096) is 15.5986, so z = 0.
  assert.ok(Math.abs(zScore(15.5986, 36, 'm')) < 0.01);
  assert.match(whoUnder5Category(1.5).label, /^Possible risk/);
  assert.match(whoUnder5Category(2.5).label, /^Overweight/);
  assert.match(whoUnder5Category(3.5).label, /^Obesity/);
  assert.match(whoUnder5Category(-2.5).label, /^Wasted/);
  const [lo, hi] = childHealthyBmi(36, 'f');
  assert.ok(Math.abs(zScore(lo, 36, 'f') + 2) < 1e-9 && Math.abs(zScore(hi, 36, 'f') - 1) < 1e-9);
});

test('percentiles of z-scores are sane', () => {
  assert.equal(percentile(0).toFixed(1), '50.0');
  assert.equal(percentile(1).toFixed(1), '84.1');
  assert.equal(percentile(-2).toFixed(1), '2.3');
});
