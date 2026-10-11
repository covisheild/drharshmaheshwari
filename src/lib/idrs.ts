// Indian Diabetes Risk Score (MDRF-IDRS): Mohan V et al., J Assoc Physicians India 2005;53:759-63 (PMID 16334618).
// Four items, scores in steps of 10, total 0-100. Used by /tools/indian-diabetes-risk-score/ and tests/idrs.test.mjs.

export type Sex = 'm' | 'f';
export type Activity = 'both' | 'one' | 'none';   // regular exercise and strenuous work / one of the two / neither
export type Family = 'none' | 'one' | 'both';     // parents with diabetes

export const agePoints = (age: number) => (age < 35 ? 0 : age < 50 ? 20 : 30);

/** Waist in cm. Women: <80, 80-89, >=90. Men: <90, 90-99, >=100. */
export function waistPoints(waist: number, sex: Sex) {
  const cut = sex === 'm' ? 90 : 80;
  return waist < cut ? 0 : waist < cut + 10 ? 10 : 20;
}

export const ACTIVITY_POINTS: Record<Activity, number> = { both: 0, one: 20, none: 30 };
export const FAMILY_POINTS: Record<Family, number> = { none: 0, one: 10, both: 20 };

export type Band = 'low' | 'moderate' | 'high';
/** <30 low, 30-50 moderate, >=60 high (the paper's cut-off for screening). */
export const band = (score: number): Band => (score < 30 ? 'low' : score < 60 ? 'moderate' : 'high');

export interface Answers { age: number; sex: Sex; waist: number; activity: Activity; family: Family }

export function idrs(a: Answers) {
  const parts = {
    age: agePoints(a.age),
    waist: waistPoints(a.waist, a.sex),
    activity: ACTIVITY_POINTS[a.activity],
    family: FAMILY_POINTS[a.family],
  };
  const score = parts.age + parts.waist + parts.activity + parts.family;
  return { parts, score, band: band(score), changeable: parts.waist + parts.activity };
}
