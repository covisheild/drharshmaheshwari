// The calculator picture on the home page: cycles through example people and animates the numbers (visual only).
import { PEOPLE, readout } from '../lib/bmi-demo';

const win = document.querySelector<HTMLElement>('[data-demo]');
if (win) {
  const $ = (s: string) => win.querySelector<HTMLElement>(s)!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = (el: HTMLElement, s: [string, string]) => { el.textContent = s[0]; el.className = `bm-state ${s[1]}`; };
  let shown = { bmi: 0, whtr: 0, waist: 0 }, raf = 0, i = 0, held = false;
  const paint = (o: typeof shown) => { $('[data-bmi]').textContent = o.bmi.toFixed(1); $('[data-whtr]').textContent = o.whtr.toFixed(2); $('[data-waist]').textContent = `${Math.round(o.waist)} cm`; };
  const show = (n: number, first: boolean) => {
    const p = PEOPLE[n], r = readout(p);
    $('[data-oh]').textContent = `${p.h} cm`; $('[data-ow]').textContent = `${p.w} kg`; $('[data-owa]').textContent = `${p.wa} cm`;
    ([['h', r.h], ['w', r.w], ['wa', r.wa]] as const).forEach(([k, v]) => { $(`[data-t="${k}"]`).style.width = `calc(${v}% + 9px)`; $(`[data-k="${k}"]`).style.left = `${v}%`; });
    $('[data-sx="m"]').className = p.s === 'm' ? 'on' : ''; $('[data-sx="f"]').className = p.s === 'f' ? 'on' : '';
    set($('[data-sbmi]'), r.sBmi); set($('[data-swhtr]'), r.sWhtr); set($('[data-swaist]'), r.sWaist);
    $('.bm-scale').style.setProperty('--p', r.marker);
    const to = { bmi: r.bmi, whtr: r.whtr, waist: p.wa };
    if (reduce) { shown = to; paint(to); return; }
    const from = { ...shown }, t0 = performance.now(), dur = first ? 1400 : 900;
    cancelAnimationFrame(raf);
    const step = (now: number) => {
      const q = Math.min((now - t0) / dur, 1), e = 1 - (1 - q) ** 3;
      shown = { bmi: from.bmi + (to.bmi - from.bmi) * e, whtr: from.whtr + (to.whtr - from.whtr) * e, waist: from.waist + (to.waist - from.waist) * e };
      paint(shown); if (q < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  win.addEventListener('pointerenter', () => { held = true; }); win.addEventListener('pointerleave', () => { held = false; });
  win.addEventListener('focusin', () => { held = true; }); win.addEventListener('focusout', () => { held = false; });
  // start when the window first scrolls into view, so the count-up is seen
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); show(0, true); if (!reduce) setInterval(() => { if (!held && !document.hidden) { i = (i + 1) % PEOPLE.length; show(i, false); } }, 4800); } }, { threshold: 0.25 }).observe(win);
}
