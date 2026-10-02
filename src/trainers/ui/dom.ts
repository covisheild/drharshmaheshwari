// Tiny DOM helper used by the trainer UI: h('button', { class: 'opt', onclick }, 'text', child).
// Text is always set as text (never HTML), so labels from data cannot inject markup.
type Kid = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k) el.append(k);
  return el;
}

export const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const pct = (s: { n: number; correct: number }) => (s.n ? Math.round((100 * s.correct) / s.n) : 0);
