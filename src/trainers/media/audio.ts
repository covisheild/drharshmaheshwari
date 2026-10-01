// One shared <audio> element for the whole page: starting a sound stops the previous one.
// A plain media element (not Web Audio) plays from another origin without CORS and ignores the
// iPhone silent switch. Clips are not looped: a 15-second recording looped would put a false
// pause or extra beat at the join, which is exactly what a rhythm trainer must not do.

const el = typeof Audio !== 'undefined' ? new Audio() : null;
let current: HTMLElement | null = null;

function release() {
  if (current) { current.classList.remove('playing'); current.style.setProperty('--p', '0'); current.setAttribute('aria-pressed', 'false'); }
  current = null;
}

if (el) {
  el.preload = 'auto';
  el.addEventListener('timeupdate', () => {
    if (current && el.duration) current.style.setProperty('--p', String(el.currentTime / el.duration));
  });
  el.addEventListener('ended', release);
  el.addEventListener('error', () => {
    if (current) current.dataset.error = 'Could not load this sound. Check your connection.';
    release();
  });
}

/** Play `src`, showing progress on `button`. Pressing the same button again stops it. */
export function play(src: string, button?: HTMLElement) {
  if (!el) return;
  const same = current === button && !el.paused;
  el.pause();
  release();
  if (same) return;
  if (button) { current = button; button.classList.add('playing'); button.setAttribute('aria-pressed', 'true'); delete button.dataset.error; }
  if (el.src !== src) el.src = src;
  el.currentTime = 0;
  el.play().catch(() => release());
}

export function stop() { el?.pause(); release(); }

const warmed = new Set<string>();
/** Fetch the next clip in the background so it starts instantly. */
export function preload(src: string) {
  if (warmed.has(src) || typeof Audio === 'undefined') return;
  warmed.add(src);
  const a = new Audio();
  a.preload = 'auto';
  a.src = src;
}
