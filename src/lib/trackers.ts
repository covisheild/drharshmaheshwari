// BP and blood sugar trackers: the rules, with no page code (docs/trackers-plan.md). Tested in tests/trackers.test.mjs.
//
// Settled with Harsh, 11 Oct 2026: adults (18+) only; readings are logged and charted; the only interpretation is a soft
// alert on the patient's own screen for a dangerous reading. Nothing is ever sent to anyone because of an alert.
//   BP:    SBP >= 180 or DBP >= 110 (Indian Hypertension Guideline V 2025-26 "Severe"; ESH 2023 grade 3; MoHFW STG 2016).
//          No low-BP alert (no guideline gives a home number).
//   Sugar: below 70 mg/dL low, below 54 severely low (ADA 2026 levels 1 and 2; RSSDI 2022 alert value 70);
//          300 mg/dL or more very high (CDC; RSSDI 2022). HbA1c has no alert.
// Chart lines (faint, unlabelled): BP clinic 140/90, home 135/85; FBS 126 mg/dL; HbA1c 6.5 %.

import { bmiOf } from './bmi';

export type Sex = 'm' | 'f';
export type YesNo = 'yes' | 'no' | 'unsure';
export type BpSetting = 'clinic' | 'home';
export type SugarTest = 'fbs' | 'ppbs' | 'rbs' | 'hba1c';
export type Sample = 'lab' | 'meter';

export interface Person {
  id: string;
  label: string;
  /** Month of birth, 'YYYY-MM'. */
  born: string;
  sex: Sex;
  heightCm?: number | null;
  htn?: YesNo | null;
  dm?: YesNo | null;
  meds?: YesNo | null;
  /** When the account holder ticked "this person has agreed" (not needed for "Me"). */
  consent?: number | null;
  self?: boolean;
  created: number;
  updated: number;
  deleted?: number | null;
}

export interface BpValue { s: number; d: number; p?: number | null }
interface ReadingBase {
  id: string;
  person: string;
  /** When it was measured: UTC ms, plus the clock offset (minutes east of UTC) of the device that entered it. */
  at: number;
  tz: number;
  note?: string;
  created: number;
  updated: number;
  deleted?: number | null;
}
export interface BpReading extends ReadingBase { kind: 'bp'; setting: BpSetting; values: BpValue[] }
/** `value` is mg/dL, or % for HbA1c. `unit` is how it was typed in (shown back the same way). */
export interface SugarReading extends ReadingBase { kind: 'sugar'; test: SugarTest; sample: Sample; value: number; unit: 'mgdl' | 'mmol' | 'pct' }
export interface WeightReading extends ReadingBase { kind: 'weight'; kg: number }
export type Reading = BpReading | SugarReading | WeightReading;

export const LIMITS = { label: 40, note: 300, people: 20, bpPerSitting: 3 };

export const BP_ALERT = { s: 180, d: 110 } as const;
export const SUGAR_ALERT = { low: 70, veryLow: 54, high: 300 } as const;
export const LINES = {
  bp: { clinic: { s: 140, d: 90 }, home: { s: 135, d: 85 } },
  sugar: { fbs: 126, hba1c: 6.5 } as Partial<Record<SugarTest, number>>,
} as const;

export const RANGE = {
  s: [60, 280], d: [30, 180], p: [30, 220],
  mgdl: [20, 600], pct: [3, 20], kg: [20, 300], heightCm: [120, 230],
} as const;

export const MGDL_PER_MMOL = 18.016;
export const toMgdl = (mmol: number) => mmol * MGDL_PER_MMOL;
export const toMmol = (mgdl: number) => mgdl / MGDL_PER_MMOL;

export const TEST_NAME: Record<SugarTest, string> = {
  fbs: 'Fasting (FBS)', ppbs: '2 h after a meal (PPBS)', rbs: 'Random (RBS)', hba1c: 'HbA1c',
};
export const SETTING_NAME: Record<BpSetting, string> = { clinic: "Doctor's clinic", home: 'Home or work' };
export const SAMPLE_NAME: Record<Sample, string> = { lab: 'Lab', meter: 'Glucometer' };

const inRange = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// ---------- age ----------

/** Completed years on `now` for someone born in month 'YYYY-MM' (counted from the 1st of that month). */
export function ageOn(born: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(born);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo) age--;
  return age;
}
export const isAdult = (born: string, now: Date) => { const a = ageOn(born, now); return a !== null && a >= 18 && a <= 120; };

// ---------- BP ----------

export function validBp(v: BpValue): boolean {
  return inRange(v.s, RANGE.s) && inRange(v.d, RANGE.d) && v.s > v.d && (v.p == null || inRange(v.p, RANGE.p));
}

/** The sitting's value: the average of its readings, rounded to whole mmHg. */
export function bpAverage(values: BpValue[]): BpValue {
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const pulses = values.map((v) => v.p).filter((p): p is number => typeof p === 'number');
  return { s: avg(values.map((v) => v.s)), d: avg(values.map((v) => v.d)), p: pulses.length ? avg(pulses) : null };
}

export const bpHigh = (v: BpValue) => v.s >= BP_ALERT.s || v.d >= BP_ALERT.d;

/** The alert for a saved sitting: judged on its average, so one stray cuff reading does not alarm. */
export const bpAlert = (r: BpReading): 'high' | null => (bpHigh(bpAverage(r.values)) ? 'high' : null);

/** One reading so far and it is very high: the form asks for a second one 1-2 minutes later (AHA patient advice). */
export const askToRepeat = (values: BpValue[]) => values.length === 1 && bpHigh(values[0]);

// ---------- sugar ----------

export function validSugar(test: SugarTest, value: number): boolean {
  return test === 'hba1c' ? inRange(value, RANGE.pct) : inRange(value, RANGE.mgdl);
}

export function sugarAlert(r: Pick<SugarReading, 'test' | 'value'>): 'very-low' | 'low' | 'high' | null {
  if (r.test === 'hba1c') return null;
  if (r.value < SUGAR_ALERT.veryLow) return 'very-low';
  if (r.value < SUGAR_ALERT.low) return 'low';
  if (r.value >= SUGAR_ALERT.high) return 'high';
  return null;
}

export function alertOf(r: Reading): string | null {
  if (r.deleted) return null;
  if (r.kind === 'bp') return bpAlert(r);
  if (r.kind === 'sugar') return sugarAlert(r);
  return null;
}

/** Shown under a saved reading on the patient's own screen only. Wording: Harsh reviews before `main`. */
export const ALERT_TEXT: Record<string, { title: string; text: string }> = {
  high: {
    title: 'Very high reading',
    text: 'Sit quietly and measure again after 1–2 minutes. If it stays this high, contact your doctor today. If you have chest pain, breathlessness, back pain, weakness or numbness, a change in vision, or trouble speaking, go to a hospital now.',
  },
  'sugar-high': {
    title: 'Very high sugar',
    text: 'Contact your doctor today. Go to a hospital now if there is vomiting, stomach pain, fast breathing, drowsiness or confusion.',
  },
  low: {
    title: 'Low sugar',
    text: 'Take 15 g of fast-acting sugar now (15 g glucose powder, 4 teaspoons of sugar in water, or something sweet you have) and measure again after 15 minutes; repeat if still below 70. If the person is drowsy or confused, do not give anything by mouth: get help now.',
  },
  'very-low': {
    title: 'Severely low sugar',
    text: 'Take 15 g of fast-acting sugar now (15 g glucose powder, 4 teaspoons of sugar in water, or something sweet you have) and measure again after 15 minutes; repeat if still below 70. If the person is drowsy or confused, do not give anything by mouth: get help now.',
  },
};
export const alertText = (r: Reading) => {
  const a = alertOf(r);
  if (!a) return null;
  return ALERT_TEXT[r.kind === 'sugar' && a === 'high' ? 'sugar-high' : a];
};

// ---------- summaries ----------

const live = <T extends Reading>(rs: T[]) => rs.filter((r) => !r.deleted).sort((a, b) => a.at - b.at);
export const bpOf = (rs: Reading[]) => live(rs.filter((r): r is BpReading => r.kind === 'bp'));
export const sugarOf = (rs: Reading[], test?: SugarTest) => live(rs.filter((r): r is SugarReading => r.kind === 'sugar' && (!test || r.test === test)));
export const weightOf = (rs: Reading[]) => live(rs.filter((r): r is WeightReading => r.kind === 'weight'));

const DAY = 86_400_000;

/** Home BP: the mean of the home sittings in the 7 days up to the latest one (IGH-V and ESH measure at home for 7 days). */
export function homeWeekAverage(rs: Reading[]): { avg: BpValue; n: number; from: number; to: number } | null {
  const home = bpOf(rs).filter((r) => r.setting === 'home');
  if (!home.length) return null;
  const to = home[home.length - 1].at;
  const week = home.filter((r) => r.at > to - 7 * DAY);
  return { avg: bpAverage(week.map((r) => bpAverage(r.values))), n: week.length, from: week[0].at, to };
}

export const latest = <T extends Reading>(rs: T[]): T | null => (rs.length ? rs[rs.length - 1] : null);

export function bmiFor(p: Person, rs: Reading[]): number | null {
  const w = latest(weightOf(rs));
  return w && p.heightCm ? Math.round(bmiOf(w.kg, p.heightCm) * 10) / 10 : null;
}

// ---------- time (shown as the clock read where it was entered) ----------

/** The wall-clock parts of a reading's time, in the offset it was entered with. */
export function wallClock(at: number, tz: number) {
  const d = new Date(at + tz * 60_000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatWhen(at: number, tz: number, withTime = true): string {
  const w = wallClock(at, tz);
  const date = `${w.d} ${MONTHS[w.mo - 1]} ${w.y}`;
  if (!withTime) return date;
  const h12 = w.h % 12 || 12;
  return `${date}, ${h12}:${String(w.mi).padStart(2, '0')} ${w.h < 12 ? 'am' : 'pm'}`;
}
/** From the date and time boxes ('YYYY-MM-DD', 'HH:MM') read as local time at offset `tz` to UTC ms. */
export function fromInputs(date: string, time: string, tz: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time || '00:00');
  if (!m || !t) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - tz * 60_000;
}
export function toInputs(at: number, tz: number) {
  const w = wallClock(at, tz), p = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.y}-${p(w.mo)}-${p(w.d)}`, time: `${p(w.h)}:${p(w.mi)}` };
}

// ---------- shown values ----------

export function sugarShown(r: SugarReading): string {
  if (r.test === 'hba1c') return `${r.value.toFixed(1)} %`;
  return r.unit === 'mmol' ? `${toMmol(r.value).toFixed(1)} mmol/L` : `${Math.round(r.value)} mg/dL`;
}
export const bpShown = (v: BpValue) => `${v.s}/${v.d}`;

// ---------- validation (also run by the server on every upload) ----------

const short = (v: unknown, n: number) => typeof v === 'string' && v.length <= n;
const okId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v);
const okTime = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 8.64e15;
const okYesNo = (v: unknown) => v == null || v === 'yes' || v === 'no' || v === 'unsure';

export function validPerson(x: unknown): x is Person {
  if (!x || typeof x !== 'object') return false;
  const p = x as Person;
  return okId(p.id) && typeof p.label === 'string' && p.label.trim().length > 0 && p.label.length <= LIMITS.label
    && typeof p.born === 'string' && isAdult(p.born, new Date(p.created))
    && (p.sex === 'm' || p.sex === 'f') && (p.heightCm == null || inRange(p.heightCm, RANGE.heightCm))
    && okYesNo(p.htn) && okYesNo(p.dm) && okYesNo(p.meds) && (p.consent == null || okTime(p.consent))
    && (p.self == null || typeof p.self === 'boolean')
    && okTime(p.created) && okTime(p.updated) && (p.deleted == null || okTime(p.deleted));
}

export function validReading(x: unknown): x is Reading {
  if (!x || typeof x !== 'object') return false;
  const r = x as Reading;
  if (!okId(r.id) || !okId(r.person) || !okTime(r.at) || !Number.isInteger(r.tz) || Math.abs(r.tz) > 14 * 60
    || !short(r.note ?? '', LIMITS.note) || !okTime(r.created) || !okTime(r.updated) || (r.deleted != null && !okTime(r.deleted))) return false;
  if (r.kind === 'bp') return (r.setting === 'clinic' || r.setting === 'home') && Array.isArray(r.values)
    && r.values.length >= 1 && r.values.length <= LIMITS.bpPerSitting && r.values.every(validBp);
  if (r.kind === 'sugar') return ['fbs', 'ppbs', 'rbs', 'hba1c'].includes(r.test) && (r.sample === 'lab' || r.sample === 'meter')
    && (r.test === 'hba1c' ? r.unit === 'pct' && r.sample === 'lab' : r.unit === 'mgdl' || r.unit === 'mmol') && validSugar(r.test, r.value);
  if (r.kind === 'weight') return inRange(r.kg, RANGE.kg);
  return false;
}
