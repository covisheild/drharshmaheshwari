// A moving playhead over the heart-sound pictures on the For Doctors home page (visual only).
const waves = [...document.querySelectorAll<SVGSVGElement>('svg[data-wave]')];
if (waves.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const state = waves.map((svg) => ({ svg, head: svg.querySelector<SVGLineElement>('.head')!, texts: [...svg.querySelectorAll<SVGTextElement>('text')], pos: Math.random() * 0.2, vis: true }));
  state.forEach((w) => new IntersectionObserver((es) => { w.vis = es[0].isIntersecting; }).observe(w.svg));
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    for (const w of state) {
      if (!w.vis || document.hidden) continue;
      w.pos = (w.pos + dt / 6) % 1;
      const x = w.pos * 600; w.head.setAttribute('x1', String(x)); w.head.setAttribute('x2', String(x));
      w.texts.forEach((t) => t.classList.toggle('hot', Math.abs(+t.dataset.x! - x) < 26));
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
