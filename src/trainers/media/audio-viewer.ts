// Audio viewer: play/pause, waveform with playhead, seeking, speed, and labelled spans.
//
// - Plays through a plain <audio> element: R2 audio needs no CORS for playback, and it plays with the
//   iPhone silent switch on. Clips are never looped (a looped 15 s clip puts a false beat at the join).
// - The waveform comes from pre-generated peaks (see peaks.ts); the audio is never decoded in the browser.
//   Without peaks (missing file, or R2 not sending CORS headers) it shows a plain progress bar instead.
// - Two views of the waveform: a close-up of a few seconds that follows the playhead (tap to seek, drag to
//   move along the recording), and below it the whole clip as a thin strip (tap or drag to jump).
// - Drawn at true size as thin vertical lines, never smoothed or rescaled: the picture holds only what is
//   in the peaks file.
// - setCues(false) hides the waveform shape and spans, e.g. during a quiz, where the shape of AF or
//   crackles would give the answer away. Position and seeking still work.
// - Only one viewer plays at a time on a page.

import type { AudioMedia, LoadOptions, MediaViewer } from '../core/media';
import { loadPeaks, type Peaks } from './peaks';

const SPEEDS = [0.5, 0.75, 1, 1.25];
const viewers = new Set<AudioViewer>();
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

const fmt = (s: number) => {
  if (!Number.isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export class AudioViewer implements MediaViewer<AudioMedia> {
  private audio = new Audio();
  private media: AudioMedia | null = null;
  private peaks: Peaks | null = null;
  private shape: Float32Array | null = null;
  private cues = true;
  private raf = 0;
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private wave: HTMLElement;
  private overview: HTMLElement;
  private overviewCanvas: HTMLCanvasElement;
  private playBtn: HTMLButtonElement;
  private time: HTMLElement;
  private labelEl: HTMLElement;
  private speed: HTMLSelectElement;
  private observers: { disconnect(): void }[] = [];

  constructor(root: HTMLElement) {
    this.audio.preload = 'auto';
    this.el = document.createElement('div');
    this.el.className = 'av';
    this.el.innerHTML = `
      <div class="av-label" aria-live="polite"></div>
      <div class="av-wave" role="slider" tabindex="0" aria-label="Position in recording" aria-valuemin="0">
        <canvas aria-hidden="true"></canvas>
      </div>
      <div class="av-overview" aria-hidden="true"><canvas></canvas></div>
      <div class="av-controls">
        <button type="button" class="av-play" aria-pressed="false"><span class="av-icon" aria-hidden="true">▶</span> <span class="av-text">Play</span></button>
        <span class="av-time">0:00 / 0:00</span>
        <label class="av-speed">Speed <select>${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}×</option>`).join('')}</select></label>
      </div>`;
    root.replaceChildren(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.wave = this.el.querySelector('.av-wave')!;
    this.overview = this.el.querySelector('.av-overview')!;
    this.overviewCanvas = this.overview.querySelector('canvas')!;
    this.playBtn = this.el.querySelector('.av-play')!;
    this.time = this.el.querySelector('.av-time')!;
    this.labelEl = this.el.querySelector('.av-label')!;
    this.speed = this.el.querySelector('select')!;
    viewers.add(this);
    this.bind();
  }

  load(media: AudioMedia, opts: LoadOptions = {}) {
    this.stop();
    this.media = media;
    this.peaks = null;
    this.shape = null;
    this.labelEl.textContent = opts.label ?? '';
    delete this.el.dataset.error;
    this.audio.src = media.src;
    this.audio.playbackRate = Number(this.speed.value);
    this.audio.preservesPitch = true;
    this.update();
    if (media.peaks) {
      const url = media.peaks;
      loadPeaks(url).then((p) => {
        if (this.media?.peaks !== url || !p) return;
        this.peaks = p;
        this.shape = p.data;
        this.draw();
      });
    }
    if (opts.autoplay) this.play();
  }

  setCues(visible: boolean) { this.cues = visible; this.el.classList.toggle('cues-hidden', !visible); this.draw(); }

  play() {
    for (const v of viewers) if (v !== this) v.stop();
    this.audio.playbackRate = Number(this.speed.value);
    this.audio.play().catch(() => this.sync());
  }

  stop() { this.audio.pause(); }

  destroy() {
    this.stop();
    cancelAnimationFrame(this.raf);
    for (const o of this.observers) o.disconnect();
    viewers.delete(this);
    this.el.remove();
  }

  private duration() {
    const d = this.audio.duration;
    return Number.isFinite(d) && d > 0 ? d : this.media?.duration ?? this.peaks?.duration ?? 0;
  }

  private bind() {
    const a = this.audio;
    this.playBtn.addEventListener('click', () => (a.paused ? this.play() : this.stop()));
    a.addEventListener('play', () => { this.sync(); this.loop(); });
    a.addEventListener('pause', () => this.sync());
    a.addEventListener('ended', () => { a.currentTime = 0; this.sync(); });
    a.addEventListener('loadedmetadata', () => this.update());
    a.addEventListener('error', () => { this.el.dataset.error = 'true'; this.labelEl.textContent = 'Could not load this sound. Check your connection.'; this.sync(); });
    this.speed.addEventListener('change', () => { a.playbackRate = Number(this.speed.value); });

    const clampT = (t: number) => Math.min(Math.max(t, 0), this.duration());
    // Close-up: a tap seeks to the sound under the finger; a drag moves along the recording like tape.
    this.wave.addEventListener('pointerdown', (e) => {
      if (!this.duration()) return;
      this.wave.setPointerCapture(e.pointerId);
      const r = this.wave.getBoundingClientRect(), [v0, v1] = this.view();
      const x0 = e.clientX, t0 = a.currentTime, secPerPx = (v1 - v0) / r.width;
      const zoomed = this.zoomed();
      let dragging = false;
      if (!zoomed) { a.currentTime = clampT(v0 + (x0 - r.left) * secPerPx); this.update(); }
      const move = (ev: PointerEvent) => {
        if (!zoomed) a.currentTime = clampT(v0 + (ev.clientX - r.left) * secPerPx);
        else if (dragging || Math.abs(ev.clientX - x0) > 4) { dragging = true; a.currentTime = clampT(t0 - (ev.clientX - x0) * secPerPx); }
        this.update();
      };
      const up = () => {
        if (zoomed && !dragging) a.currentTime = clampT(v0 + (x0 - r.left) * secPerPx);
        this.update();
        this.wave.removeEventListener('pointermove', move);
        this.wave.removeEventListener('pointerup', up);
        this.wave.removeEventListener('pointercancel', up);
      };
      this.wave.addEventListener('pointermove', move);
      this.wave.addEventListener('pointerup', up);
      this.wave.addEventListener('pointercancel', up);
    });
    // Whole-clip strip: tap or drag to jump anywhere.
    this.overview.addEventListener('pointerdown', (e) => {
      const seek = (clientX: number) => {
        const r = this.overview.getBoundingClientRect();
        a.currentTime = clampT(((clientX - r.left) / r.width) * this.duration());
        this.update();
      };
      this.overview.setPointerCapture(e.pointerId);
      seek(e.clientX);
      const move = (ev: PointerEvent) => seek(ev.clientX);
      const up = () => { this.overview.removeEventListener('pointermove', move); this.overview.removeEventListener('pointerup', up); this.overview.removeEventListener('pointercancel', up); };
      this.overview.addEventListener('pointermove', move);
      this.overview.addEventListener('pointerup', up);
      this.overview.addEventListener('pointercancel', up);
    });
    this.wave.addEventListener('keydown', (e) => {
      const d = this.duration();
      const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageDown: -5, PageUp: 5 };
      if (e.key in step) a.currentTime = Math.min(Math.max(a.currentTime + step[e.key], 0), d);
      else if (e.key === 'Home') a.currentTime = 0;
      else if (e.key === 'End') a.currentTime = d;
      else if (e.key === ' ' || e.key === 'Enter') (a.paused ? this.play() : this.stop());
      else return;
      e.preventDefault();
      this.update();
    });

    const ro = new ResizeObserver(() => this.draw());
    ro.observe(this.wave);
    ro.observe(this.overview);
    const mo = new MutationObserver(() => this.draw()); // theme or mode changed: colours change
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
    this.observers.push(ro, mo);
  }

  private loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => { this.update(); if (!this.audio.paused) this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }

  private sync() {
    const playing = !this.audio.paused;
    this.playBtn.setAttribute('aria-pressed', String(playing));
    this.playBtn.querySelector('.av-icon')!.textContent = playing ? '❚❚' : '▶';
    this.playBtn.querySelector('.av-text')!.textContent = playing ? 'Pause' : 'Play';
    this.el.classList.toggle('playing', playing);
    this.update();
  }

  private update() {
    const d = this.duration(), t = this.audio.currentTime;
    this.time.textContent = `${fmt(t)} / ${fmt(d)}`;
    this.wave.setAttribute('aria-valuemax', String(Math.round(d)));
    this.wave.setAttribute('aria-valuenow', String(Math.round(t)));
    this.wave.setAttribute('aria-valuetext', `${Math.round(t)} of ${Math.round(d)} seconds`);
    this.draw();
  }

  private draw() {
    this.el.classList.toggle('zoomed', this.zoomed()); // shows the whole-clip strip
    this.drawDetail();
    this.drawOverview();
  }

  /** Seconds shown in the close-up: about 140 px per second, 2.5 to 6 s. */
  private windowSecs() { return Math.min(Math.max(this.wave.clientWidth / 140, 2.5), 6); }

  /** Close-up only when there is a waveform to look at and the clip is longer than the window. */
  private zoomed() { return !!this.shape && this.cues && this.duration() > this.windowSecs() * 1.2; }

  /** Start and end (s) of what the close-up shows. It follows the playhead, which sits 30% from the left;
   *  with reduced motion it turns a page at a time instead of scrolling. */
  private view(): [number, number] {
    const d = this.duration();
    if (!this.zoomed()) return [0, d];
    const win = this.windowSecs(), t = this.audio.currentTime;
    const s = REDUCED_MOTION.matches ? Math.floor(t / (win * 0.8)) * win * 0.8 : t - win * 0.3;
    const start = Math.min(Math.max(s, 0), d - win);
    return [start, start + win];
  }

  private drawDetail() {
    const c = canvas(this.canvas, this.wave);
    if (!c) return;
    const { g, w, h } = c;
    const css = getComputedStyle(this.el);
    const col = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const played = col('--wave-played', '#0f6e64'), rest = col('--wave', '#999'), grid = col('--wave-grid', 'rgb(127 127 127 / .25)');
    const d = this.duration(), t = this.audio.currentTime;
    const [v0, v1] = this.view();
    const span = v1 - v0 || 1;
    const xOf = (s: number) => ((s - v0) / span) * w;
    const head = d ? Math.min(Math.max(xOf(t), 0), w) : 0;
    const mid = h / 2;

    if (this.shape && this.cues) {
      if (this.zoomed()) {
        // One faint line per second, labelled, so beats and gaps can be timed.
        g.font = '500 10px Inter, system-ui, sans-serif';
        for (let s = Math.ceil(v0); s < v1; s++) {
          const x = Math.round(xOf(s));
          g.fillStyle = grid; g.fillRect(x, 0, 1, h);
          g.fillStyle = col('--wave-label', '#777'); g.fillText(`${s} s`, x + 3, h - 4);
        }
      }
      g.fillStyle = grid; g.fillRect(0, Math.round(mid), w, 1);
      const path = this.trace(v0, v1, w, h, 6);
      g.fillStyle = rest; g.fill(path);
      g.save(); g.beginPath(); g.rect(0, 0, head, h); g.clip();
      g.fillStyle = played; g.fill(path);
      g.restore();
    } else {
      // No waveform (or cues hidden): a plain track that still shows position.
      g.fillStyle = rest; g.fillRect(0, mid - 3, w, 6);
      g.fillStyle = played; g.fillRect(0, mid - 3, head, 6);
    }
    if (this.cues && this.media?.spans?.length && d) {
      g.font = '600 11px Inter, system-ui, sans-serif';
      for (const s of this.media.spans) {
        if (s.end < v0 || s.start > v1) continue;
        const x0 = xOf(s.start), x1 = xOf(s.end);
        g.fillStyle = 'rgb(127 127 127 / .14)'; g.fillRect(x0, 0, x1 - x0, h);
        g.fillStyle = played; g.fillText(s.label, Math.max(x0, 0) + 3, 12);
      }
    }
    g.fillStyle = col('--wave-head', '#000');
    g.fillRect(Math.min(head, w - 2), 0, 2, h);
  }

  /** The whole clip in a thin strip, with the stretch the close-up shows marked. Hidden without a waveform. */
  private drawOverview() {
    if (!this.zoomed()) return;
    const c = canvas(this.overviewCanvas, this.overview);
    if (!c) return;
    const { g, w, h } = c;
    const css = getComputedStyle(this.el);
    const d = this.duration(), head = (this.audio.currentTime / d) * w;
    const [v0, v1] = this.view();
    g.fillStyle = css.getPropertyValue('--wave-window').trim() || 'rgb(127 127 127 / .2)';
    g.fillRect((v0 / d) * w, 0, ((v1 - v0) / d) * w, h);
    const path = this.trace(0, d, w, h, 2);
    g.fillStyle = css.getPropertyValue('--wave').trim() || '#999'; g.fill(path);
    g.save(); g.beginPath(); g.rect(0, 0, head, h); g.clip();
    g.fillStyle = css.getPropertyValue('--wave-played').trim() || '#0f6e64'; g.fill(path);
    g.restore();
    g.fillStyle = css.getPropertyValue('--wave-head').trim() || '#000';
    g.fillRect(Math.min(head, w - 2), 0, 2, h);
  }

  /** The waveform from t0 to t1 (s) across w px, at true size, as thin vertical lines from each point's
   *  minimum to its maximum. Zoomed out, one line per pixel holds the extremes of the points under it (a
   *  5 ms crackle is never averaged away); zoomed in, one line per point, at its place in time. */
  private trace(t0: number, t1: number, w: number, h: number, pad: number) {
    const shape = this.shape!, points = shape.length / 2, pps = points / this.peaks!.duration;
    const mid = h / 2, amp = mid - pad, pxPerSec = w / (t1 - t0), perPx = pps / pxPerSec;
    const path = new Path2D();
    const line = (x: number, lo: number, hi: number) => {
      const top = mid - Math.max(hi * amp, 0.5), bot = mid - Math.min(lo * amp, -0.5);
      path.rect(x, top, 1, bot - top);
    };
    if (perPx >= 1) {
      for (let px = 0; px < w; px++) {
        const p = (t0 + px / pxPerSec) * pps;
        let lo = 0, hi = 0;
        for (let i = Math.max(Math.floor(p), 0), end = Math.min(Math.ceil(p + perPx), points); i < end; i++) {
          if (shape[2 * i] < lo) lo = shape[2 * i];
          if (shape[2 * i + 1] > hi) hi = shape[2 * i + 1];
        }
        line(px, lo, hi);
      }
    } else {
      for (let i = Math.max(Math.floor(t0 * pps), 0), end = Math.min(Math.ceil(t1 * pps), points); i < end; i++) {
        line(Math.round(((i + 0.5) / pps - t0) * pxPerSec), shape[2 * i], shape[2 * i + 1]);
      }
    }
    return path;
  }
}

/** Size a canvas to its box at the screen's pixel density; null while the box has no size (hidden). */
function canvas(c: HTMLCanvasElement, box: HTMLElement) {
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}
