// BMI arithmetic for /tools/bmi-calculator/: Indian adult cut-offs and targets; children on the IAP 2015 charts (5 to 17) and WHO (2 to 4).
// Pure functions, no DOM: the page's script calls them and tests/bmi.test.mjs checks them.
import LMS from '../data/who-bmi-lms.json' with { type: 'json' };
import IAP from '../data/iap-bmi-2015.json' with { type: 'json' };
import WAIST from '../data/indian-waist-children.json' with { type: 'json' };

export type Sex = 'm' | 'f';

export const bmiOf = (kg: number, cm: number) => kg / (cm / 100) ** 2;
export const kgAt = (bmi: number, cm: number) => bmi * (cm / 100) ** 2;

// ---------- Adults (18 and over): Asian/Indian cut-offs ----------

/** Target BMI for adults: the middle of the Indian healthy range (Harsh's choice, 11 Oct 2026). */
export const TARGET_BMI = [21, 22] as const;
/** Indian abdominal obesity cut-offs (Misra 2009). */
export const WAIST_CUT = { m: 90, f: 80 } as const;

export function adultCategory(bmi: number): Verdict {
  if (bmi < 18.5) return { label: 'Underweight', tone: 'warn' };
  if (bmi < 23) return { label: 'Normal for Indian adults', tone: 'ok' };
  if (bmi < 25) return { label: 'Overweight (Indian cut-off: 23–24.9)', tone: 'warn' };
  return { label: bmi < 30 ? 'Obesity (Indian cut-off: 25 or more)' : 'Obesity (BMI 30 or more)', tone: 'risk' };
}

/** Target weight range (BMI 21–22) for a height, in kg. */
export const targetWeight = (cm: number): [number, number] => [kgAt(TARGET_BMI[0], cm), kgAt(TARGET_BMI[1], cm)];

/** Largest healthy waist: under the Indian cut-off for the sex and under half the height, whichever is smaller. */
export function maxWaist(cm: number, sex: Sex): { cm: number; by: 'cut-off' | 'half height' } {
  const half = cm / 2, cut = WAIST_CUT[sex];
  return half < cut ? { cm: half, by: 'half height' } : { cm: cut, by: 'cut-off' };
}

// ---------- Children (2 to 17 years): Indian charts where they exist ----------
// Waist, 2 to 17 years: Indian percentiles (Khadilkar 2014), cut-off at the 70th.
// 5 to 17 years: IAP 2015 charts for Indian children (overweight from the adult-equivalent 23 line, obesity from 27,
// thinness below the 3rd percentile). 2 to 4 years: WHO Child Growth Standards 2006, which IAP recommends under 5.

/** Ages covered, in completed months. Under 2, WHO uses weight-for-length instead; from 18, the adult cut-offs apply. */
export const CHILD_MONTHS = [24, 215] as const;
/** From this age (months) the IAP 2015 charts apply. */
export const IAP_FROM = 60;

export interface Verdict { label: string; tone: 'ok' | 'warn' | 'risk' }

/** IAP 2015 lines at an age, interpolated between the half-yearly rows of the paper's Tables VI and VII. */
export interface IapLines { p3: number; p5: number; p10: number; p25: number; p50: number; ow: number; ob: number }
export function iapLines(months: number, sex: Sex): IapLines {
  const t = (sex === 'm' ? IAP.boys : IAP.girls) as number[][];
  const years = Math.min(Math.max(months / 12, 5), 18);
  const i = Math.min(Math.floor((years - 5) * 2), t.length - 2), f = (years - t[i][0]) / 0.5;
  const v = (k: number) => t[i][k] + (t[i + 1][k] - t[i][k]) * f;
  return { p3: v(1), p5: v(2), p10: v(3), p25: v(4), p50: v(5), ow: v(6), ob: v(7) };
}

export function iapCategory(bmi: number, l: IapLines): Verdict {
  if (bmi < l.p3) return { label: 'Thinness (below the 3rd percentile)', tone: 'warn' };
  if (bmi >= l.ob) return { label: 'Obesity (IAP: adult-equivalent 27 or more)', tone: 'risk' };
  if (bmi >= l.ow) return { label: 'Overweight (IAP: adult-equivalent 23 or more)', tone: 'warn' };
  return { label: 'Healthy weight for age', tone: 'ok' };
}

/** Where the BMI falls on the IAP chart, in words. The 23 and 27 lines sit near the 71st and 90th percentiles in boys, 75th and 95th in girls. */
export function iapBand(bmi: number, l: IapLines, sex: Sex): string {
  const [owP, obP] = sex === 'm' ? ['71st', '90th'] : ['75th', '95th'];
  const lines: [number, string][] = [[l.p3, '3rd percentile'], [l.p5, '5th percentile'], [l.p10, '10th percentile'], [l.p25, '25th percentile'],
    [l.p50, '50th percentile'], [l.ow, `overweight line (about the ${owP} percentile)`], [l.ob, `obesity line (about the ${obP} percentile)`]];
  if (bmi < lines[0][0]) return 'below the 3rd percentile';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (bmi >= lines[i][0]) return i === lines.length - 1 ? `at or above the ${lines[i][1]}` : `between the ${lines[i][1]} and the ${lines[i + 1][1]}`;
  }
  return '';
}

type Row = [number, number, number, number]; // month, L, M, S
const table = (sex: Sex) => (sex === 'm' ? LMS.boys : LMS.girls) as Row[];

/** WHO L, M, S at an age in months (may be fractional), interpolated between the monthly rows (24 to 60 months). */
export function lmsAt(months: number, sex: Sex): [number, number, number] {
  const t = table(sex), first = t[0][0];
  const i = Math.min(Math.max(Math.floor(months) - first, 0), t.length - 1);
  const a = t[i], b = t[Math.min(i + 1, t.length - 1)], f = Math.min(Math.max(months - a[0], 0), 1);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

const bmiAtZ = (z: number, [l, m, s]: [number, number, number]) => m * (1 + l * s * z) ** (1 / l);

/** WHO z-score, with WHO's restricted calculation beyond ±3 SD (as in the WHO anthro software). */
export function zScore(bmi: number, months: number, sex: Sex): number {
  const lms = lmsAt(months, sex), [l, m, s] = lms;
  const z = ((bmi / m) ** l - 1) / (s * l);
  if (z > 3) { const sd3 = bmiAtZ(3, lms), sd23 = sd3 - bmiAtZ(2, lms); return 3 + (bmi - sd3) / sd23; }
  if (z < -3) { const sd3 = bmiAtZ(-3, lms), sd23 = bmiAtZ(-2, lms) - sd3; return -3 + (bmi - sd3) / sd23; }
  return z;
}

/** BMI at a WHO z-score for an age. */
export const bmiAt = (z: number, months: number, sex: Sex) => bmiAtZ(z, lmsAt(months, sex));

/** WHO categories for children under 5 (Child Growth Standards 2006). */
export function whoUnder5Category(z: number): Verdict {
  if (z < -3) return { label: 'Severely wasted (below −3 SD)', tone: 'risk' };
  if (z < -2) return { label: 'Wasted (below −2 SD)', tone: 'warn' };
  if (z > 3) return { label: 'Obesity (above +3 SD)', tone: 'risk' };
  if (z > 2) return { label: 'Overweight (above +2 SD)', tone: 'warn' };
  if (z > 1) return { label: 'Possible risk of overweight (above +1 SD)', tone: 'warn' };
  return { label: 'Healthy weight for age', tone: 'ok' };
}

/** Healthy BMI-for-age: IAP from the 3rd percentile up to the adult-equivalent 23 line; WHO under 5 from −2 SD up to +1 SD. */
export const childHealthyBmi = (months: number, sex: Sex): [number, number] => {
  if (months >= IAP_FROM) { const l = iapLines(months, sex); return [l.p3, l.ow]; }
  return [bmiAt(-2, months, sex), bmiAt(1, months, sex)];
};

/** Indian waist percentiles for a child's completed year of age (Khadilkar 2014, 2 to 17 years): 50th, 70th (cut-off), 75th, 90th, in cm. */
export function childWaistLines(months: number, sex: Sex): { p50: number; p70: number; p75: number; p90: number } {
  const t = (sex === 'm' ? WAIST.boys : WAIST.girls) as number[][];
  const r = t[Math.min(Math.max(Math.floor(months / 12) - 2, 0), t.length - 1)];
  return { p50: r[1], p70: r[2], p75: r[3], p90: r[4] };
}

/** Child's waist against the Indian percentiles: the 70th percentile marks risk of metabolic syndrome. */
export function childWaistCategory(waist: number, months: number, sex: Sex): Verdict {
  const l = childWaistLines(months, sex);
  if (waist >= l.p90) return { label: '90th percentile or above: high risk', tone: 'risk' };
  if (waist >= l.p70) return { label: '70th to 90th percentile: increased risk', tone: 'warn' };
  return { label: 'Below the 70th percentile: no increased risk', tone: 'ok' };
}

/** Percentile (0–100) of a z-score: standard normal distribution (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
export function percentile(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 50 * (1 + Math.sign(z) * erf);
}
