// BMI arithmetic for /tools/bmi-calculator/: Indian adult cut-offs, the adult target ranges, and WHO BMI-for-age for children.
// Pure functions, no DOM: the page's script calls them and tests/bmi.test.mjs checks them.
import LMS from '../data/who-bmi-lms.json' with { type: 'json' };

export type Sex = 'm' | 'f';

export const bmiOf = (kg: number, cm: number) => kg / (cm / 100) ** 2;
export const kgAt = (bmi: number, cm: number) => bmi * (cm / 100) ** 2;

// ---------- Adults (18 and over): Asian/Indian cut-offs ----------

/** Target BMI for adults: the middle of the Indian healthy range (Harsh's choice, 11 Oct 2026). */
export const TARGET_BMI = [21, 22] as const;
/** Indian abdominal obesity cut-offs (Misra 2009). */
export const WAIST_CUT = { m: 90, f: 80 } as const;

export function adultCategory(bmi: number): { label: string; tone: 'ok' | 'warn' | 'risk' } {
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

// ---------- Children (2 to 17 years): WHO BMI-for-age ----------

/** Ages covered, in completed months. Under 2, WHO uses weight-for-length instead; from 18, the adult cut-offs apply. */
export const CHILD_MONTHS = [24, 215] as const;

type Row = [number, number, number, number]; // month, L, M, S
const table = (sex: Sex) => (sex === 'm' ? LMS.boys : LMS.girls) as Row[];

/** L, M, S at an age in months (may be fractional), interpolated between the monthly rows. */
export function lmsAt(months: number, sex: Sex): [number, number, number] {
  const t = table(sex), first = t[0][0];
  const i = Math.min(Math.max(Math.floor(months) - first, 0), t.length - 1);
  const a = t[i], b = t[Math.min(i + 1, t.length - 1)], f = Math.min(Math.max(months - a[0], 0), 1);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

const bmiAtZ = (z: number, [l, m, s]: [number, number, number]) => m * (1 + l * s * z) ** (1 / l);

/** WHO z-score, with WHO's restricted calculation beyond ±3 SD (as in the WHO anthro and anthroplus software). */
export function zScore(bmi: number, months: number, sex: Sex): number {
  const lms = lmsAt(months, sex), [l, m, s] = lms;
  const z = ((bmi / m) ** l - 1) / (s * l);
  if (z > 3) { const sd3 = bmiAtZ(3, lms), sd23 = sd3 - bmiAtZ(2, lms); return 3 + (bmi - sd3) / sd23; }
  if (z < -3) { const sd3 = bmiAtZ(-3, lms), sd23 = bmiAtZ(-2, lms) - sd3; return -3 + (bmi - sd3) / sd23; }
  return z;
}

/** BMI at a z-score for an age (used for the healthy range and the scale). */
export const bmiAt = (z: number, months: number, sex: Sex) => bmiAtZ(z, lmsAt(months, sex));

/** WHO categories: under 5 (Child Growth Standards 2006) and 5–19 years (Growth Reference 2007) use different lines. */
export function childCategory(z: number, months: number): { label: string; tone: 'ok' | 'warn' | 'risk' } {
  const under5 = months < 60;
  if (z < -3) return { label: under5 ? 'Severely wasted (below −3 SD)' : 'Severe thinness (below −3 SD)', tone: 'risk' };
  if (z < -2) return { label: under5 ? 'Wasted (below −2 SD)' : 'Thinness (below −2 SD)', tone: 'warn' };
  if (under5) {
    if (z > 3) return { label: 'Obesity (above +3 SD)', tone: 'risk' };
    if (z > 2) return { label: 'Overweight (above +2 SD)', tone: 'warn' };
    if (z > 1) return { label: 'Possible risk of overweight (above +1 SD)', tone: 'warn' };
  } else {
    if (z > 2) return { label: 'Obesity (above +2 SD)', tone: 'risk' };
    if (z > 1) return { label: 'Overweight (above +1 SD)', tone: 'warn' };
  }
  return { label: 'Healthy weight for age', tone: 'ok' };
}

/** Healthy BMI-for-age: from −2 SD up to +1 SD. */
export const childHealthyBmi = (months: number, sex: Sex): [number, number] => [bmiAt(-2, months, sex), bmiAt(1, months, sex)];

/** Percentile (0–100) of a z-score: standard normal distribution (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
export function percentile(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 50 * (1 + Math.sign(z) * erf);
}
