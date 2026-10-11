// Unit tests for the BMI calculator's arithmetic (src/lib/bmi.ts): adult targets and WHO BMI-for-age for children.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adultCategory, childCategory, childHealthyBmi, maxWaist, percentile, targetWeight, zScore } from '../src/lib/bmi.ts';

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

test('child z-scores match WHO AnthroPlus (WHO 2007 survey example)', () => {
  // Rows of anthroplus Survey_WHO2007: age in months, BMI, WHO's z-score.
  assert.equal(zScore(21.4615074952304, 166.59, 'm').toFixed(2), '0.94');
  // The median gives z = 0; WHO M at 120 months, boys, is 16.4433.
  assert.equal(zScore(16.4433, 120, 'm').toFixed(2), '0.00');
  // Under 5 (WHO 2006 standards): boys 36 months (day 1096) median BMI 15.5986.
  assert.ok(Math.abs(zScore(15.5986, 36, 'm')) < 0.01);
});

test('WHO cut-offs differ under 5 and from 5 years', () => {
  assert.match(childCategory(1.5, 120).label, /^Overweight/);
  assert.match(childCategory(2.5, 120).label, /^Obesity/);
  assert.match(childCategory(1.5, 36).label, /^Possible risk/);
  assert.match(childCategory(2.5, 36).label, /^Overweight/);
  assert.match(childCategory(3.5, 36).label, /^Obesity/);
  assert.match(childCategory(-2.5, 120).label, /^Thinness/);
  assert.equal(childCategory(0, 120).tone, 'ok');
});

test('healthy child BMI range spans -2 to +1 SD and percentiles are sane', () => {
  const [lo, hi] = childHealthyBmi(120, 'f');
  assert.ok(Math.abs(zScore(lo, 120, 'f') + 2) < 1e-9 && Math.abs(zScore(hi, 120, 'f') - 1) < 1e-9);
  assert.equal(percentile(0).toFixed(1), '50.0');
  assert.equal(percentile(1).toFixed(1), '84.1');
  assert.equal(percentile(-2).toFixed(1), '2.3');
});
