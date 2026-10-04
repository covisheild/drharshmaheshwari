// Site-wide effects, all optional: drifting dust that scatters and curls around the cursor (or a finger), and the glow that follows
// the pointer across big cards. Without a pointer, or with "reduce motion" set, the dust just drifts or sits still. Cheap on phones:
// fewer grains, capped pixel density, paused when off screen or when the tab is hidden.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

// ---- the pointer, shared by every dust canvas ----
const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, burst: 0, lx: null as number | null, ly: 0, lt: 0 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function move(x: number, y: number) {
  const n = performance.now();
  if (ptr.lx !== null) {
    const dt = Math.max((n - ptr.lt) / 1000, 0.008);
    ptr.vx = clamp(ptr.vx * 0.5 + ((x - ptr.lx) / dt) * 0.5, -2600, 2600);
    ptr.vy = clamp(ptr.vy * 0.5 + ((y - ptr.ly) / dt) * 0.5, -2600, 2600);
  }
  ptr.lx = x; ptr.ly = y; ptr.lt = n; ptr.x = x; ptr.y = y;
}
const gone = () => { ptr.x = ptr.y = -9999; ptr.lx = null; };
addEventListener('pointermove', (e) => move(e.clientX, e.clientY), { passive: true });
addEventListener('pointerdown', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.burst = 1; }, { passive: true });
// A finger that drags to scroll cancels pointer events, so follow touches directly as well.
addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { move(t.clientX, t.clientY); ptr.burst = 0.6; } }, { passive: true });
addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchend', gone, { passive: true });
addEventListener('touchcancel', gone, { passive: true });
root.addEventListener('mouseleave', gone);

// ---- colour of the dust: --dust-c, re-read when the theme or the palette changes ----
const probe = document.createElement('i');
probe.setAttribute('aria-hidden', 'true');
probe.style.cssText = 'position:absolute;visibility:hidden;width:0;height:0;color:var(--dust-c)';
document.body.appendChild(probe);
let rgb = '150,200,255';
const readColour = () => { const m = getComputedStyle(probe).color.match(/[\d.]+/g); if (m) rgb = `${Math.round(+m[0])},${Math.round(+m[1])},${Math.round(+m[2])}`; };
readColour();
new MutationObserver(readColour).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });

// ---- dust ----
interface Grain { x: number; y: number; vx: number; vy: number; s: number; v: number; a: number; ph: number; spin: number; b: number }
interface Field { c: HTMLCanvasElement; visible: boolean; step(t: number, dt: number): void }
const fields: Field[] = [];

function dust(c: HTMLCanvasElement) {
  const g = c.getContext('2d'); if (!g) return;
  const base = +(c.dataset.count ?? 200), spread = +(c.dataset.spread ?? 1), R = 170;
  let W = 0, H = 0, grains: Grain[] = [];
  const size = () => {
    const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    W = r.width; H = r.height; c.width = Math.max(1, W * dpr); c.height = Math.max(1, H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const spawn = (p: Grain, anywhere: boolean) => { p.x = W * (0.5 + (Math.random() - 0.5) * spread); p.y = anywhere ? Math.random() * H : H + 6; p.vx = 0; p.vy = -p.v; };
  const seed = () => {
    const n = Math.round(base * clamp(innerWidth / 1100, 0.35, 1));   // fewer grains on a phone
    grains = Array.from({ length: n }, () => { const p = { s: 1.6 + Math.random() * 2.8, v: 5 + Math.random() * 13, a: 0.25 + Math.random() * 0.6, ph: Math.random() * 6.28, spin: Math.random() < 0.5 ? -1 : 1, b: 0 } as Grain; spawn(p, true); return p; });
  };
  const draw = (t: number) => {
    g.clearRect(0, 0, W, H);
    for (const p of grains) {
      const al = clamp(p.a * (0.55 + 0.45 * Math.sin(t / 900 + p.ph)) + p.b * 0.55, 0, 1), s = p.s * (1 + p.b * 0.7);
      g.fillStyle = `rgba(${rgb},${al.toFixed(3)})`; g.fillRect(p.x, p.y, s, s);
    }
  };
  const field: Field = {
    c, visible: true,
    step(t, dt) {
      const r = c.getBoundingClientRect(), mx = ptr.x - r.left, my = ptr.y - r.top, R2 = R * R;
      for (const p of grains) {
        p.b *= 0.9;
        const tvx = Math.sin(p.y * 0.008 + t * 0.0003 + p.ph) * 11, tvy = -p.v + Math.cos(p.x * 0.008 - t * 0.00025 + p.ph) * 6;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, f2 = f * f, nx = dx / d, ny = dy / d, k = 1 + ptr.burst * 3.2;
          p.vx += nx * f2 * 3600 * k * dt; p.vy += ny * f2 * 3600 * k * dt;              // pushed away
          p.vx += -ny * f * 1500 * p.spin * dt; p.vy += nx * f * 1500 * p.spin * dt;      // curled, each grain its own way
          const follow = Math.min(dt * 9, 1) * f; p.vx += (ptr.vx * 0.55 - p.vx) * follow; p.vy += (ptr.vy * 0.55 - p.vy) * follow;  // dragged along
          p.b = Math.max(p.b, f);
        }
        const relax = 1 - Math.exp(-dt * 1.7); p.vx += (tvx - p.vx) * relax; p.vy += (tvy - p.vy) * relax;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < -8) spawn(p, false); else if (p.y > H + 40) p.y = -6;
        if (p.x < -10) p.x = W + 8; else if (p.x > W + 10) p.x = -8;
      }
      draw(t);
    },
  };
  size(); seed(); draw(0);
  addEventListener('resize', () => { size(); seed(); draw(0); });
  if (!reduce) { new IntersectionObserver((es) => { field.visible = es[0].isIntersecting; }).observe(c); fields.push(field); }
}
document.querySelectorAll<HTMLCanvasElement>('canvas.dust').forEach(dust);
if (!reduce && fields.length) {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!document.hidden) for (const f of fields) if (f.visible) f.step(now, dt);
    ptr.vx *= Math.pow(0.02, dt); ptr.vy *= Math.pow(0.02, dt); ptr.burst = Math.max(0, ptr.burst - dt * 2.2);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---- glow that follows the pointer across big cards ----
document.addEventListener('pointermove', (e) => {
  const card = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.bcard');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`); card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });
