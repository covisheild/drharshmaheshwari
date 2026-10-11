// Units for every number a person types in a tool: clicking the unit converts what is already typed
// (cm ⇄ in, cm ⇄ ft + in for height, kg ⇄ lb, min ⇄ h). Plain functions, no page code (tests/units.test.mjs).
// The field itself is src/components/UnitField.astro; calculators read the value in the base unit with
// unitValue() from src/scripts/unit-fields.ts. Rule in CLAUDE.md ("Units in tools").

export type UnitId = 'cm' | 'in' | 'ftin' | 'kg' | 'lb' | 'min' | 'h';
export type Kind = 'height' | 'length' | 'weight' | 'minutes' | 'hours';

/** The units a field offers, in the order a click cycles through them; the first is the base unit the calculator gets. */
export const KINDS: Record<Kind, UnitId[]> = {
  height: ['cm', 'ftin'],
  length: ['cm', 'in'],
  weight: ['kg', 'lb'],
  minutes: ['min', 'h'],
  hours: ['h', 'min'],
};

export const LABEL: Record<UnitId, string> = { cm: 'cm', in: 'in', ftin: 'ft', kg: 'kg', lb: 'lb', min: 'min', h: 'h' };
export const NAME: Record<UnitId, string> = { cm: 'centimetres', in: 'inches', ftin: 'feet and inches', kg: 'kilograms', lb: 'pounds', min: 'minutes', h: 'hours' };

// Size of one unit in its dimension's reference (cm, kg, minute). ft + in is handled on its own.
const SIZE: Record<Exclude<UnitId, 'ftin'>, number> = { cm: 1, in: 2.54, kg: 1, lb: 0.45359237, min: 1, h: 60 };
const DECIMALS: Record<UnitId, number> = { cm: 1, in: 1, ftin: 1, kg: 1, lb: 1, min: 0, h: 2 };

export const baseOf = (kind: Kind) => KINDS[kind][0];
export const nextUnit = (kind: Kind, unit: UnitId) => { const u = KINDS[kind]; return u[(u.indexOf(unit) + 1) % u.length]; };

/** Rounded for showing, without trailing zeros: 1.50 -> "1.5", 65.0 -> "65". */
export const show = (v: number, unit: UnitId) => (Number.isFinite(v) ? String(Number(v.toFixed(DECIMALS[unit]))) : '');

/** Centimetres to whole feet and inches (inches rounded to 1 decimal; 11.96 in becomes the next foot). */
export function toFtIn(cm: number): [number, number] {
  const total = Number((cm / 2.54).toFixed(1));
  return [Math.floor(total / 12), Number((total - Math.floor(total / 12) * 12).toFixed(1))];
}

/** A value in the base unit, as the boxes of `unit` should show it (ft + in uses two boxes). */
export function toDisplay(base: number, kind: Kind, unit: UnitId): string[] {
  if (!Number.isFinite(base)) return unit === 'ftin' ? ['', ''] : [''];
  const ref = base * SIZE[baseOf(kind) as Exclude<UnitId, 'ftin'>];
  if (unit === 'ftin') return toFtIn(ref).map((v) => show(v, 'ftin'));
  return [show(ref / SIZE[unit], unit)];
}

/** What is typed in the boxes of `unit`, in the base unit (NaN if empty). Feet without inches means 0 inches. */
export function fromDisplay(values: string[], kind: Kind, unit: UnitId): number {
  const n = values.map((v) => (v.trim() === '' ? NaN : Number(v)));
  let ref: number;
  if (unit === 'ftin') {
    if (!Number.isFinite(n[0]) && !Number.isFinite(n[1])) return NaN;
    ref = ((Number.isFinite(n[0]) ? n[0] : 0) * 12 + (Number.isFinite(n[1]) ? n[1] : 0)) * 2.54;
  } else ref = n[0] * SIZE[unit];
  return ref / SIZE[baseOf(kind) as Exclude<UnitId, 'ftin'>];
}
