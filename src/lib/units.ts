// Units for every number a person types in a tool: clicking the unit converts what is already typed
// (cm ⇄ in, cm ⇄ ft + in for height, kg ⇄ lb, min ⇄ h). Plain functions, no page code (tests/units.test.mjs).
// The field is src/components/UnitField.astro on built pages, or createUnitField() (src/scripts/unit-fields.ts) on
// screens built in the browser (trainers, trackers); either way the page reads the base unit with unitValue(). Rule in CLAUDE.md ("Units everywhere").

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

export interface FieldOptions {
  id: string;          // id of the main box (the inches box of ft + in is `${id}-in`)
  kind: Kind;
  label: string;       // what the number is, for screen readers: "Height", "Walking: time a day"
  placeholder: number; // in the base unit; converted with the unit
  per?: string;        // shown after the unit, e.g. "/day"
}

const esc = (v: string | number) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Words of a unit field, for a translated page (src/i18n/): w('English with {placeholders}', vars). English by default. */
export type Words = (en: string, vars?: Record<string, string | number>) => string;
const english: Words = (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

/** The HTML of a unit field, shared by UnitField.astro (built pages) and createUnitField() (screens built in the browser,
 *  such as trainers and trackers), so both look and behave the same. Styles: src/styles/units.css (loaded on every page). */
export function unitFieldHTML({ id, kind, label, placeholder, per = '' }: FieldOptions, w: Words = english): string {
  const [unit, next] = KINDS[kind];
  const ftin = KINDS[kind].includes('ftin');
  const box = (boxId: string, aria: string, ph: string) =>
    `<input data-uf type="number" inputmode="decimal" step="any" min="0" autocomplete="off" id="${esc(boxId)}" placeholder="${esc(ph)}" aria-label="${esc(aria)}" />`;
  const name = (u: UnitId) => w(NAME[u]);
  return `<div class="uf" data-unit-field data-kind="${kind}" data-unit="${unit}" data-ph="${esc(placeholder)}" data-per="${esc(per)}" data-label="${esc(label)}">`
    + `<div class="uf-box">${box(id, w('{label} in {unit}', { label, unit: name(unit) }), toDisplay(placeholder, kind, unit)[0])}`
    + `<button type="button" class="uf-unit" title="${esc(w('Switch to {unit}', { unit: name(next) }))}" aria-label="${esc(w('Unit: {unit}. Switch to {next}', { unit: name(unit), next: name(next) }))}">`
    + `<span class="uf-label">${LABEL[unit]}${esc(per)}</span><span class="uf-swap" aria-hidden="true">⇄</span></button></div>`
    + (ftin ? `<div class="uf-box" hidden>${box(`${id}-in`, w('{label}: inches', { label }), '')}<span class="uf-fixed">in</span></div>` : '')
    + '</div>';
}
