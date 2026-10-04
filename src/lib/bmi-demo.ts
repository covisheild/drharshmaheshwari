// The calculator picture on the For Everyone home page. It is only a picture: it shows example people, one after another,
// worked out with the same Indian cut-offs as the real calculator (/tools/bmi-calculator/). Used for the first view at build time
// and by src/scripts/home-demo.ts for the animation, so the numbers are right even without JavaScript.

export interface Person { h: number; w: number; wa: number; s: 'm' | 'f' }
export const PEOPLE: Person[] = [
  { h: 170, w: 78, wa: 92, s: 'm' }, { h: 162, w: 52, wa: 70, s: 'f' }, { h: 176, w: 71, wa: 85, s: 'm' }, { h: 158, w: 66, wa: 86, s: 'f' },
];
export const BMI_MIN = 16, BMI_MAX = 36;
export const pct = (v: number) => Math.max(0, Math.min(100, ((v - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100));
export const ZONES_GLOBAL: [number, number, string][] = [[16, 18.5, 'z-low'], [18.5, 25, 'z-ok'], [25, 30, 'z-over'], [30, 36, 'z-obese']];
export const ZONES_INDIA: [number, number, string][] = [[16, 18.5, 'z-low'], [18.5, 23, 'z-ok'], [23, 25, 'z-over'], [25, 36, 'z-obese']];
export const TICKS = [18.5, 23, 25, 30];
export const RANGES = { h: [140, 200], w: [40, 140], wa: [60, 130] } as const;

export type State = [label: string, cls: string];
export function readout(p: Person) {
  const bmi = p.w / (p.h / 100) ** 2, whtr = p.wa / p.h, cut = p.s === 'm' ? 90 : 80;
  const sBmi: State = bmi < 18.5 ? ['Underweight', 's-low'] : bmi < 23 ? ['Healthy range', 's-ok'] : bmi < 25 ? ['Overweight', 's-over'] : ['Obesity', 's-obese'];
  const sWhtr: State = whtr < 0.5 ? ['Below 0.5: good', 's-ok'] : whtr < 0.6 ? ['Increased risk', 's-over'] : ['High risk', 's-obese'];
  const sWaist: State = p.wa < cut ? [`Under ${cut} cm`, 's-ok'] : ['Abdominal obesity', 's-obese'];
  const at = (v: number, [lo, hi]: readonly [number, number]) => (((v - lo) / (hi - lo)) * 100).toFixed(1);
  return { bmi, whtr, sBmi, sWhtr, sWaist, marker: (pct(bmi) / 100).toFixed(4),
    h: at(p.h, RANGES.h), w: at(p.w, RANGES.w), wa: at(p.wa, RANGES.wa) };
}
