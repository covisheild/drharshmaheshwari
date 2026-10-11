// Activity check: physical activity targets by age (ICMR-NIN 2024 from 5 years; WHO under 5 and in pregnancy),
// and the IPAQ short form score.
// Plain functions, no page code, so tests/activity.test.mjs can check them directly.
// Sources and settled decisions: docs/activity-check-plan.md.
//   ICMR-NIN Dietary Guidelines for Indians 2024, Guideline 10.
//   WHO 2020 guidelines on physical activity and sedentary behaviour (Bull et al., Br J Sports Med 2020;54:1451-62).
//   WHO 2019 guidelines on physical activity, sedentary behaviour and sleep for children under 5 years of age.
//   IPAQ Research Committee, Guidelines for data processing and analysis of the IPAQ, November 2005.

export type AgeGroup = 'infant' | 'toddler' | 'preschool' | 'child' | 'teen' | 'adult' | 'older';

export const AGE_GROUPS: { id: AgeGroup; label: string }[] = [
  { id: 'infant', label: 'Under 1' },
  { id: 'toddler', label: '1–2 years' },
  { id: 'preschool', label: '3–4 years' },
  { id: 'child', label: '5–14 years' },
  { id: 'teen', label: '15–19 years' },
  { id: 'adult', label: '20–60 years' },
  { id: 'older', label: 'Over 60' },
];

/** IPAQ applies from 15 years (tested in ages 15–69). */
export const usesIpaq = (g: AgeGroup) => g === 'teen' || g === 'adult' || g === 'older';

/** One kind of activity in the last 7 days: on how many days, and how many minutes in total on such a day. */
export interface Bout { days: number | null; minutes: number | null }

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const dayCount = (d: number) => Math.min(Math.max(Math.round(d), 0), 7);
/** A kind of activity is answered once its days are known, and, if any, its minutes. */
export const answered = (b: Bout) => known(b.days) && (dayCount(b.days) === 0 || (known(b.minutes) && b.minutes >= 0));
/** Minutes a week, every minute counted (WHO 2020: activity of any length counts). */
export const weekly = (b: Bout) => (answered(b) && dayCount(b.days!) > 0 ? dayCount(b.days!) * b.minutes! : 0);

// ---------- IPAQ short form ----------

export const MET = { walking: 3.3, moderate: 4.0, vigorous: 8.0 } as const;
export type IpaqLevel = 'high' | 'moderate' | 'low';
export interface IpaqAnswers { vigorous: Bout; moderate: Bout; walking: Bout }
export interface IpaqPart { days: number; minutes: number; met: number }
export type IpaqResult =
  | { ok: true; vigorous: IpaqPart; moderate: IpaqPart; walking: IpaqPart; total: number; level: IpaqLevel; reason: string; notes: string[] }
  | { ok: false; reason: 'unanswered' | 'over16h' };

export function ipaqScore(a: IpaqAnswers): IpaqResult {
  const kinds = ['vigorous', 'moderate', 'walking'] as const;
  if (!kinds.every((k) => answered(a[k]))) return { ok: false, reason: 'unanswered' };
  const notes: string[] = [];
  const raw = kinds.map((k) => { const d = dayCount(a[k].days!); return { k, days: d, minutes: d ? a[k].minutes! : 0 }; });

  // 7.2 Outliers: walking + moderate + vigorous time over 960 minutes (16 hours) a day is excluded.
  if (raw.reduce((s, r) => s + r.minutes, 0) > 960) return { ok: false, reason: 'over16h' };

  const part = {} as Record<(typeof kinds)[number], IpaqPart>;
  for (const r of raw) {
    let { days, minutes } = r;
    // 7.3 Less than 10 minutes a day counts as zero, days included.
    if (days && minutes < 10) { notes.push(`${cap(r.k)}: under 10 minutes a day, so not counted in the IPAQ score.`); days = 0; minutes = 0; }
    // 7.4 More than 180 minutes a day is cut to 180.
    if (minutes > 180) { notes.push(`${cap(r.k)}: counted as 180 minutes a day (the IPAQ maximum).`); minutes = 180; }
    part[r.k] = { days, minutes, met: MET[r.k] * minutes * days };
  }
  const { vigorous: v, moderate: m, walking: w } = part;
  const total = v.met + m.met + w.met;
  // 7.6 Days are added across the three kinds (they may fall on the same day; the protocol adds them anyway).
  const allDays = v.days + m.days + w.days;

  let level: IpaqLevel = 'low', reason = 'Does not meet the criteria for Moderate or High.';
  if (v.days >= 3 && total >= 1500) { level = 'high'; reason = 'Vigorous activity on 3 or more days and at least 1500 MET-minutes a week.'; }
  else if (allDays >= 7 && total >= 3000) { level = 'high'; reason = '7 or more days of activity and at least 3000 MET-minutes a week.'; }
  else if (v.days >= 3 && v.minutes >= 20) { level = 'moderate'; reason = 'Vigorous activity on 3 or more days, at least 20 minutes a day.'; }
  else if ((m.minutes >= 30 ? m.days : 0) + (w.minutes >= 30 ? w.days : 0) >= 5) { level = 'moderate'; reason = 'Moderate activity or walking, at least 30 minutes a day, on 5 or more days.'; }
  else if (allDays >= 5 && total >= 600) { level = 'moderate'; reason = '5 or more days of activity and at least 600 MET-minutes a week.'; }
  return { ok: true, vigorous: v, moderate: m, walking: w, total: Math.round(total), level, reason, notes };
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------- Targets: ICMR-NIN 2024 from 5 years (India first); WHO where ICMR-NIN gives no numbers ----------
// ICMR-NIN Dietary Guidelines for Indians 2024, Guideline 10 (pp. 69-72): children and adolescents (>5-19 years),
// adults (>19-60), elderly (>60). It gives no numbers for under-5s or pregnancy, so those use WHO (2019, 2020).

export type Status = 'met' | 'not' | 'unknown';
export type Source = 'ICMR-NIN' | 'WHO';
export interface Check { id: string; label: string; status: Status; detail: string }
export interface Aerobic {
  value: number;            // adults: moderate-equivalent minutes a week; 5-19: days with 60+ minutes
  target: number;           // the minimum
  upper?: number;           // adults: upper end of the range (60 minutes on 5 days = 300)
  max: number;              // right end of the page's bar
  unit: string;             // what `value` means, for the page
  gap?: string;             // what would close the gap
}
export interface TargetResult { source: Source; checks: Check[]; aerobic?: Aerobic; notes: string[] }

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const perDay = (weekMin: number, n = 7) => Math.ceil(weekMin / n);
const daysCheck = (src: Source, id: string, label: string, got: number | null | undefined, need: number): Check =>
  !known(got) ? { id, label, status: 'unknown', detail: `${src}: ${need} or more days a week.` }
    : { id, label, status: got >= need ? 'met' : 'not', detail: `${days(dayCount(got))} a week; ${src}: ${need} or more.` };

export interface AdultAnswers extends IpaqAnswers { strengthDays: number | null; balanceDays?: number | null; pregnant?: boolean }

/** Days with any of the three kinds of activity. IPAQ does not record whether kinds fall on the same day,
 *  so they are added and capped at 7, as the IPAQ protocol does (section 7.6). */
export const activeDays = (a: IpaqAnswers) => Math.min(7, (['vigorous', 'moderate', 'walking'] as const).reduce((s, k) => s + (weekly(a[k]) > 0 ? dayCount(a[k].days!) : 0), 0));

/** Adults (20-60, ICMR-NIN) and over 60 (ICMR-NIN), or pregnant / after birth (WHO).
 *  Moderate-equivalent minutes = moderate + walking + 2 x vigorous (ICMR-NIN: 30 min moderate or 15 min vigorous a day). */
export function checkAdult(group: 'adult' | 'older', a: AdultAnswers): TargetResult {
  const pregnant = group === 'adult' && !!a.pregnant;
  const src: Source = pregnant ? 'WHO' : 'ICMR-NIN';
  const checks: Check[] = [], notes: string[] = [];
  let aerobic: Aerobic | undefined;
  const ready = answered(a.vigorous) && answered(a.moderate) && answered(a.walking);
  const target = 150, upper = 300, needDays = 5;
  const label = pregnant ? 'Aerobic activity, 150 minutes a week' : 'Aerobic activity, 30 minutes on 5 or more days';
  if (ready) {
    const minutes = weekly(a.moderate) + weekly(a.walking) + 2 * weekly(a.vigorous);
    const d = activeDays(a);
    const enough = minutes >= target && (pregnant || d >= needDays);
    aerobic = { value: minutes, target, upper: pregnant ? undefined : upper, max: 450, unit: 'moderate-intensity minutes a week (vigorous minutes count double)' };
    if (minutes < target) {
      const need = target - minutes;
      aerobic.gap = `${need} more minutes a week of brisk walking or other moderate activity (about ${perDay(need)} a day), or about ${Math.ceil(need / 2)} minutes of vigorous activity.`;
    } else if (!enough) {
      aerobic.gap = `Spread the same activity over 5 or more days (now ${days(d)}): 30 minutes a day, or 15 of vigorous activity.`;
    }
    checks.push({ id: 'aerobic', label, status: enough ? 'met' : 'not',
      detail: pregnant ? `${minutes} of ${target} minutes a week.` : `${minutes} of ${target} minutes a week, on ${days(d)}. ICMR-NIN: 30-60 minutes of moderate activity (or 15 of vigorous) on at least 5 days.` });
    if (!pregnant) checks.push({ id: 'upper', label: 'Aerobic activity, upper target (60 minutes on 5 days)', status: minutes >= upper ? 'met' : 'not', detail: `${minutes} of ${upper} minutes a week.` });
  } else {
    checks.push({ id: 'aerobic', label, status: 'unknown', detail: pregnant ? 'WHO: at least 150 minutes a week of moderate activity.' : 'ICMR-NIN: 30-60 minutes of moderate activity, or 15 of vigorous, on at least 5 days a week.' });
  }
  if (pregnant) {
    checks.push(known(a.strengthDays)
      ? { id: 'strength', label: 'Muscle-strengthening activity', status: a.strengthDays >= 1 ? 'met' : 'not', detail: `${days(dayCount(a.strengthDays))} a week. WHO: include some (no set number of days); gentle stretching may help too.` }
      : { id: 'strength', label: 'Muscle-strengthening activity', status: 'unknown', detail: 'WHO: include some (no set number of days).' });
    notes.push('ICMR-NIN gives no number for pregnancy (it advises enough exercise with 2-3 hours of rest in the day), so this uses WHO: at least 150 minutes of moderate activity a week, if you have no medical reason to avoid it. Vigorous activity is fine if you did it regularly before pregnancy.');
  } else {
    checks.push(daysCheck(src, 'strength', 'Muscle strengthening, all major muscle groups', a.strengthDays, 2));
  }
  if (group === 'older') checks.push(daysCheck(src, 'balance', 'Strength and balance activities', a.balanceDays, 3));
  return { source: src, checks, aerobic, notes };
}

export interface YouthAnswers { days60: number | null; vigorousDays: number | null; strengthDays: number | null }

/** 5-19 years (ICMR-NIN): at least 60 minutes of moderate-to-vigorous activity every day; vigorous and strength on 3+ days.
 *  Asked directly: on how many of the last 7 days was there 60 minutes or more in total. */
export function checkYouth(a: YouthAnswers): TargetResult {
  const checks: Check[] = [];
  let aerobic: Aerobic | undefined;
  const label = 'Energetic activity, 60 minutes every day';
  if (known(a.days60)) {
    const d = dayCount(a.days60);
    aerobic = { value: d, target: 7, max: 7, unit: `of 7 days with 60 minutes or more of energetic activity` };
    if (d < 7) aerobic.gap = `${7 - d} more ${7 - d === 1 ? 'day' : 'days'} a week with 60 minutes of energetic activity.`;
    checks.push({ id: 'aerobic', label, status: d >= 7 ? 'met' : 'not', detail: `${days(d)} of 7. ICMR-NIN: a minimum of 60 minutes a day.` });
  } else {
    checks.push({ id: 'aerobic', label, status: 'unknown', detail: 'ICMR-NIN: a minimum of 60 minutes of moderate-to-vigorous activity a day.' });
  }
  checks.push(daysCheck('ICMR-NIN', 'vigorous', 'Vigorous activity', a.vigorousDays, 3));
  checks.push(daysCheck('ICMR-NIN', 'strength', 'Strength training (muscles and bones)', a.strengthDays, 3));
  return { source: 'ICMR-NIN', checks, aerobic, notes: [] };
}

/** 15-19: vigorous days come from the IPAQ answers; the 60-minute days are asked as for 5-14. */
export function checkTeen(a: IpaqAnswers & { days60: number | null; strengthDays: number | null }): TargetResult {
  const vigDays = answered(a.vigorous) ? (weekly(a.vigorous) > 0 ? dayCount(a.vigorous.days!) : 0) : null;
  return checkYouth({ days60: a.days60, vigorousDays: vigDays, strengthDays: a.strengthDays });
}

// ---------- Under 5 (WHO 2019, a typical 24 hours) ----------

export interface Under5Answers {
  older?: boolean;            // infant: 4–11 months (else 0–3); toddler: 2 years (else 1 year)
  mobile?: boolean | null;    // infant: crawling or moving about
  tummyMin?: number | null;   // infant not yet mobile
  floorPlay?: boolean | null; // infant who moves: active several times a day
  activeMin?: number | null;  // 1–4 years: all activity, any intensity, minutes a day
  mvpaMin?: number | null;    // 3–4 years: of which energetic
  restrained?: boolean | null; // kept in a pram, high chair, car seat or carrier for more than 1 hour at a stretch
  screenMin?: number | null;  // sedentary screen time, minutes a day
  sleepH?: number | null;     // sleep in 24 hours, naps included
}

export const SLEEP: Record<string, [number, number]> = { infant0: [14, 17], infant4: [12, 16], toddler: [11, 14], preschool: [10, 13] };

export function checkUnder5(group: 'infant' | 'toddler' | 'preschool', a: Under5Answers): TargetResult {
  const checks: Check[] = [];
  const yesNo = (id: string, label: string, v: boolean | null | undefined, good: boolean, detail: string): Check =>
    ({ id, label, status: v == null ? 'unknown' : v === good ? 'met' : 'not', detail });

  if (group === 'infant') {
    if (a.mobile === false) {
      checks.push(known(a.tummyMin)
        ? { id: 'tummy', label: 'Tummy time', status: a.tummyMin >= 30 ? 'met' : 'not', detail: `${a.tummyMin} minutes a day; WHO: at least 30, spread through the day while awake.` }
        : { id: 'tummy', label: 'Tummy time', status: 'unknown', detail: 'WHO: at least 30 minutes a day, spread through the day while awake.' });
    } else {
      checks.push(yesNo('play', 'Active several times a day (floor play)', a.mobile == null ? null : a.floorPlay, true, 'WHO: active several times a day in a variety of ways, especially interactive floor play.'));
    }
  } else {
    const label = 'Physical activity, any intensity';
    checks.push(known(a.activeMin)
      ? { id: 'active', label, status: a.activeMin >= 180 ? 'met' : 'not', detail: `${a.activeMin} of 180 minutes a day, spread through the day.` }
      : { id: 'active', label, status: 'unknown', detail: 'WHO: at least 180 minutes a day, spread through the day.' });
    if (group === 'preschool') {
      checks.push(known(a.mvpaMin)
        ? { id: 'mvpa', label: 'Of which energetic (moderate to vigorous)', status: a.mvpaMin >= 60 ? 'met' : 'not', detail: `${a.mvpaMin} of 60 minutes a day.` }
        : { id: 'mvpa', label: 'Of which energetic (moderate to vigorous)', status: 'unknown', detail: 'WHO: at least 60 of the 180 minutes.' });
    }
  }

  checks.push(yesNo('restrained', 'Not strapped in for more than 1 hour at a time', a.restrained, false, 'Pram, stroller, high chair, car seat or carrier. WHO: no more than 1 hour at a stretch.'));

  const screenMax = group === 'infant' || (group === 'toddler' && !a.older) ? 0 : 60;
  const screenRule = screenMax === 0 ? 'WHO: no screen time at this age.' : 'WHO: no more than 1 hour a day; less is better.';
  checks.push(known(a.screenMin)
    ? { id: 'screen', label: 'Screen time', status: a.screenMin <= screenMax ? 'met' : 'not', detail: `${a.screenMin} minutes a day. ${screenRule}` }
    : { id: 'screen', label: 'Screen time', status: 'unknown', detail: screenRule });

  const [lo, hi] = SLEEP[group === 'infant' ? (a.older ? 'infant4' : 'infant0') : group];
  checks.push(known(a.sleepH)
    ? { id: 'sleep', label: 'Sleep, naps included', status: a.sleepH >= lo && a.sleepH <= hi ? 'met' : 'not', detail: `${a.sleepH} hours in 24; WHO: ${lo}–${hi} hours${a.sleepH > hi ? ' (above the range)' : ''}.` }
    : { id: 'sleep', label: 'Sleep, naps included', status: 'unknown', detail: `WHO: ${lo}–${hi} hours in 24, with regular sleep and wake-up times.` });

  return { source: 'WHO', checks, notes: ['ICMR-NIN gives no activity numbers for children under 5, so this uses the WHO 2019 guideline.'] };
}
