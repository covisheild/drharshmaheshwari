// Wires every UnitField (src/components/UnitField.astro): clicking the unit converts what is typed into the next unit.
// State lives on the element (data-unit, data-base), not in this module, so a page script that imports
// unitValue() reads the same thing even if the bundler gives it its own copy of this file.
import { LABEL, NAME, nextUnit, toDisplay, fromDisplay, type Kind, type UnitId } from '../lib/units';

const rootOf = (id: string) => document.getElementById(id)?.closest<HTMLElement>('[data-unit-field]') ?? null;
const boxes = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('input[data-uf]')];
const typed = (root: HTMLElement) => fromDisplay(boxes(root).map((b) => b.value), root.dataset.kind as Kind, root.dataset.unit as UnitId);

/** The value of the UnitField whose main box has this id, in its base unit (cm, kg, min or h); NaN if empty. */
export function unitValue(id: string): number {
  const root = rootOf(id);
  if (!root) return NaN;
  const b = root.dataset.base;
  return b === undefined ? typed(root) : b === '' ? NaN : Number(b);
}

function setUnit(root: HTMLElement, unit: UnitId) {
  const kind = root.dataset.kind as Kind, per = root.dataset.per ?? '';
  const [main, second] = boxes(root);
  root.dataset.unit = unit;
  const btn = root.querySelector<HTMLButtonElement>('.uf-unit')!;
  btn.querySelector('.uf-label')!.textContent = LABEL[unit] + (unit === 'ftin' ? '' : per);
  const next = nextUnit(kind, unit);
  btn.setAttribute('aria-label', `Unit: ${NAME[unit]}. Switch to ${NAME[next]}`);
  btn.title = `Switch to ${NAME[next]}`;
  const ph = Number(root.dataset.ph);
  const phs = toDisplay(ph, kind, unit);
  main.placeholder = phs[0];
  main.setAttribute('aria-label', `${root.dataset.label} in ${unit === 'ftin' ? 'feet' : NAME[unit]}`);
  if (second) {
    second.closest<HTMLElement>('.uf-box')!.hidden = unit !== 'ftin';
    second.placeholder = phs[1] ?? '';
  }
}

function wire(root: HTMLElement) {
  if (root.dataset.wired) return;
  root.dataset.wired = '1';
  setUnit(root, root.dataset.unit as UnitId);
  root.addEventListener('input', () => {
    if (root.dataset.converting) return;
    const v = typed(root);
    root.dataset.base = Number.isFinite(v) ? String(v) : '';
  });
  root.querySelector('.uf-unit')!.addEventListener('click', () => {
    const kind = root.dataset.kind as Kind;
    const base = unitValue(boxes(root)[0].id);
    const next = nextUnit(kind, root.dataset.unit as UnitId);
    setUnit(root, next);
    const shown = toDisplay(base, kind, next);
    boxes(root).forEach((b, i) => { b.value = shown[i] ?? ''; });
    // Keep the exact value (no drift from rounding when switching back and forth); tell the calculator.
    root.dataset.base = Number.isFinite(base) ? String(base) : '';
    root.dataset.converting = '1';
    boxes(root)[0].dispatchEvent(new Event('input', { bubbles: true }));
    delete root.dataset.converting;
  });
  root.closest('form')?.addEventListener('reset', () => setTimeout(() => { root.dataset.base = ''; }));
}

export function initUnitFields() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-unit-field]')) wire(root);
}
