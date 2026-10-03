// Tap a figure to look at it close up: pinch, double-tap or scroll-wheel to zoom, drag to move, buttons and
// keys for the same. The viewer is one element on the page (#rd-zoom); the figure itself is never changed.
//
// On a phone the Back button closes the viewer instead of leaving the book (one history entry is added while it is
// open). Focus goes into the viewer and returns to the figure's button when it closes.

const MAX_ABS = 10;     // never more than 10x the fitted size
const STEP = 1.5;       // the + and - buttons
const DOUBLE_TAP = 300; // ms

export function mountZoom(root: HTMLElement) {
  const found = document.getElementById('rd-zoom');
  if (!found) return;
  const box: HTMLElement = found;
  const stage = box.querySelector<HTMLElement>('.rd-zoom-stage')!;
  const sheet = box.querySelector<HTMLElement>('.rd-zoom-sheet')!;
  const img = sheet.querySelector<HTMLImageElement>('img')!;
  const cap = box.querySelector<HTMLElement>('.rd-zoom-cap')!;
  const buttons = [...box.querySelectorAll<HTMLButtonElement>('.rd-zoom-tools button')];

  let opener: HTMLElement | null = null;
  let pushed = false;
  let s = 1, tx = 0, ty = 0;
  const open = () => !box.hidden;

  /** Sizes the picture to fill the screen (never more than 3x its own size); zooming scales it from there. */
  function fitImage(w: number, h: number) {
    if (!w || !h) return;
    const k = Math.min(3, (stage.clientWidth - 28) / w, (stage.clientHeight - 28) / h);
    img.style.width = `${Math.max(40, Math.round(w * k))}px`;
    img.style.height = `${Math.max(40, Math.round(h * k))}px`;
  }
  let natural = { w: 0, h: 0 };

  const maxScale = () => Math.min(MAX_ABS, Math.max(3, ((img.naturalWidth || img.clientWidth) / Math.max(1, img.clientWidth)) * 1.5));
  /** Keeps the picture from being dragged away: when it is bigger than the screen its edge stops at the screen edge. */
  function clamp() {
    s = Math.max(1, Math.min(maxScale(), s));
    const w = sheet.offsetWidth * s, h = sheet.offsetHeight * s;
    const mx = Math.max(0, (w - stage.clientWidth) / 2), my = Math.max(0, (h - stage.clientHeight) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  }
  function draw() {
    clamp();
    sheet.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    box.dataset.zoomed = String(s > 1.01);
  }
  /** Zooms to `next`, keeping the point (cx, cy), measured from the screen centre, where it is. */
  function zoomAt(next: number, cx = 0, cy = 0) {
    const to = Math.max(1, Math.min(maxScale(), next));
    const k = to / s;
    tx = cx - (cx - tx) * k;
    ty = cy - (cy - ty) * k;
    s = to;
    draw();
  }
  const fit = () => { s = 1; tx = 0; ty = 0; draw(); };
  const centre = (clientX: number, clientY: number) => {
    const r = stage.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };

  // ---------------------------------------------------------------- open and close
  function show(fig: HTMLElement, from: HTMLElement) {
    const source = fig.querySelector<HTMLImageElement>('img');
    if (!source) return;
    opener = from;
    img.src = source.currentSrc || source.src;
    img.alt = source.alt;
    cap.innerHTML = fig.querySelector('figcaption')?.innerHTML ?? '';
    box.setAttribute('aria-label', source.alt ? `Figure: ${source.alt}` : 'Figure');
    box.hidden = false;
    natural = { w: source.naturalWidth || Number(source.getAttribute('width')) || 0, h: source.naturalHeight || Number(source.getAttribute('height')) || 0 };
    fitImage(natural.w, natural.h);
    s = 1; tx = 0; ty = 0; draw();
    // One history entry, so Back closes the viewer rather than leaving the book.
    try { history.pushState({ rdZoom: true }, ''); pushed = true; } catch { pushed = false; }
    buttons.find((b) => b.dataset.z === 'close')?.focus({ preventScroll: true });
  }
  function close(fromHistory = false) {
    if (!open()) return;
    box.hidden = true;
    img.removeAttribute('src');
    if (pushed && !fromHistory) { pushed = false; try { history.back(); } catch { /* nothing to undo */ } }
    pushed = false;
    opener?.focus({ preventScroll: true });
    opener = null;
  }
  addEventListener('popstate', () => { if (open()) close(true); });

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('.fig-zoom');
    const pic = t.closest<HTMLElement>('.fig img');
    const el = btn ?? pic;
    const fig = el?.closest<HTMLElement>('.fig');
    if (el && fig) { e.preventDefault(); show(fig, btn ?? fig.querySelector<HTMLElement>('.fig-zoom') ?? el); }
  });
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b) {
      if (b.dataset.z === 'close') close();
      else if (b.dataset.z === 'in') zoomAt(s * STEP);
      else if (b.dataset.z === 'out') zoomAt(s / STEP);
      else if (b.dataset.z === 'fit') fit();
      return;
    }
    // A tap on the dark margin around the picture closes it; a tap on the picture, or the end of a drag, does not.
    // (Where the finger landed is checked by position: with pointer capture the click is reported on the stage either way.)
    const r = sheet.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (stage.contains(e.target as Node) && outside && !moved) close();
  });

  // ---------------------------------------------------------------- touch, mouse and pen
  const pts = new Map<number, { x: number; y: number }>();
  let start = { s: 1, tx: 0, ty: 0, dist: 0, mx: 0, my: 0, px: 0, py: 0 };
  let moved = false;
  let lastType = 'mouse'; // a touch double-tap also raises `dblclick`; only the mouse's is used
  let lastTap = { t: 0, x: 0, y: 0 };
  const mid = () => {
    const [a, b] = [...pts.values()];
    return b ? centre((a.x + b.x) / 2, (a.y + b.y) / 2) : centre(a.x, a.y);
  };
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const rebase = () => {
    const m = pts.size ? mid() : { x: 0, y: 0 };
    start = { s, tx, ty, dist: pts.size > 1 ? spread() : 0, mx: m.x, my: m.y, px: m.x, py: m.y };
  };

  stage.addEventListener('pointerdown', (e) => {
    lastType = e.pointerType;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pts.size === 1) moved = false;
    rebase();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = mid();
    if (Math.abs(m.x - start.mx) + Math.abs(m.y - start.my) > 6 || (start.dist && Math.abs(spread() - start.dist) > 6)) moved = true;
    if (pts.size >= 2 && start.dist) {
      // Pinch: the point between the fingers stays between the fingers.
      const next = Math.max(1, Math.min(maxScale(), start.s * (spread() / start.dist)));
      const k = next / start.s;
      s = next;
      tx = m.x - (start.mx - start.tx) * k;
      ty = m.y - (start.my - start.ty) * k;
    } else if (pts.size === 1) {
      tx = start.tx + (m.x - start.mx);
      ty = start.ty + (m.y - start.my);
    }
    draw();
  });
  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const wasOne = pts.size === 1;
    pts.delete(e.pointerId);
    if (pts.size) rebase();
    if (e.type === 'pointerup' && wasOne && !moved) {
      const now = performance.now();
      if (now - lastTap.t < DOUBLE_TAP && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30 && e.pointerType !== 'mouse') {
        const c = centre(e.clientX, e.clientY);
        if (s > 1.05) fit(); else zoomAt(Math.min(3, maxScale()), c.x, c.y);
        lastTap = { t: 0, x: 0, y: 0 };
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', (e) => {
    if (lastType !== 'mouse') return;
    const c = centre(e.clientX, e.clientY);
    if (s > 1.05) fit(); else zoomAt(Math.min(3, maxScale()), c.x, c.y);
  });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = centre(e.clientX, e.clientY);
    zoomAt(s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), c.x, c.y);
  }, { passive: false });
  addEventListener('resize', () => { if (open()) { fitImage(natural.w, natural.h); draw(); } });

  // ---------------------------------------------------------------- keys
  document.addEventListener('keydown', (e) => {
    if (!open()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      // Keep focus inside the viewer while it is open.
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(s * STEP); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(s / STEP); }
    else if (e.key === '0') { e.preventDefault(); fit(); }
    else if (e.key.startsWith('Arrow') && s > 1.01) {
      e.preventDefault();
      const d = 80;
      if (e.key === 'ArrowLeft') tx += d; else if (e.key === 'ArrowRight') tx -= d; else if (e.key === 'ArrowUp') ty += d; else ty -= d;
      draw();
    }
  }, true);
}
