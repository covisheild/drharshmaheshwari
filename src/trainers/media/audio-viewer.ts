// Audio viewer: play/pause, waveform with playhead, seeking, speed, and labelled spans.
//
// - Plays through a plain <audio> element: R2 audio needs no CORS for playback, and it plays with the
//   iPhone silent switch on. Clips are never looped (a looped 15 s clip puts a false beat at the join).
// - The waveform comes from pre-generated peaks (see peaks.ts); the audio is never decoded in the browser.
//   Without peaks (missing file, or R2 not sending CORS headers) it shows a plain progress bar instead.
// - setCues(false) hides the waveform shape and spans, e.g. during a quiz, where the shape of AF or
//   crackles would give the answer away. Position and seeking still work.
// - Only one viewer plays at a time on a page.

import type { AudioMedia, LoadOptions, MediaViewer } from '../core/media';
import { loadPeaks, type Peaks } from './peaks';

const SPEEDS = [0.5, 0.75, 1, 1.25];
const viewers = new Set<AudioViewer>();

const fmt = (s: number) => {
  if (!Number.isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export class AudioViewer implements MediaViewer<AudioMedia> {
  private audio = new Audio();
  private media: AudioMedia | null = null;
  private peaks: Peaks | null = null;
  private cues = true;
  private raf = 0;
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private wave: HTMLElement;
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
      <div class="av-controls">
        <button type="button" class="av-play" aria-pressed="false"><span class="av-icon" aria-hidden="true">▶</span> <span class="av-text">Play</span></button>
        <span class="av-time">0:00 / 0:00</span>
        <label class="av-speed">Speed <select>${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}×</option>`).join('')}</select></label>
      </div>`;
    root.replaceChildren(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.wave = this.el.querySelector('.av-wave')!;
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
    this.labelEl.textContent = opts.label ?? '';
    delete this.el.dataset.error;
    this.audio.src = media.src;
    this.audio.playbackRate = Number(this.speed.value);
    this.audio.preservesPitch = true;
    this.update();
    if (media.peaks) {
      const url = media.peaks;
      loadPeaks(url).then((p) => { if (this.media?.peaks === url) { this.peaks = p; this.draw(); } });
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

    const seekTo = (clientX: number) => {
      const r = this.wave.getBoundingClientRect();
      const d = this.duration();
      if (!d) return;
      a.currentTime = Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * d;
      this.update();
    };
    this.wave.addEventListener('pointerdown', (e) => {
      this.wave.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
      const move = (ev: PointerEvent) => seekTo(ev.clientX);
      const up = () => { this.wave.removeEventListener('pointermove', move); this.wave.removeEventListener('pointerup', up); };
      this.wave.addEventListener('pointermove', move);
      this.wave.addEventListener('pointerup', up);
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
    const c = this.canvas, w = this.wave.clientWidth, h = this.wave.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(this.el);
    const played = css.getPropertyValue('--wave-played').trim() || '#0f6e64';
    const rest = css.getPropertyValue('--wave').trim() || '#999';
    const d = this.duration();
    const x = d ? (this.audio.currentTime / d) * w : 0;
    const mid = h / 2;

    if (this.peaks && this.cues) {
      const { data, points } = this.peaks;
      const cover = d ? Math.min(this.peaks.duration / d, 1) : 1; // peaks may end a hair before the audio
      for (let px = 0; px < w; px++) {
        const i0 = Math.floor((px / w / cover) * points), i1 = Math.max(i0 + 1, Math.floor(((px + 1) / w / cover) * points));
        if (i0 >= points) break;
        let lo = 0, hi = 0;
        for (let i = i0; i < Math.min(i1, points); i++) { lo = Math.min(lo, data[2 * i]); hi = Math.max(hi, data[2 * i + 1]); }
        g.fillStyle = px < x ? played : rest;
        g.fillRect(px, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
      }
    } else {
      // No waveform (or cues hidden): a plain track that still shows position.
      g.fillStyle = rest; g.fillRect(0, mid - 3, w, 6);
      g.fillStyle = played; g.fillRect(0, mid - 3, x, 6);
    }
    if (this.cues && this.media?.spans?.length && d) {
      g.font = '600 11px Inter, system-ui, sans-serif';
      for (const s of this.media.spans) {
        const x0 = (s.start / d) * w, x1 = (s.end / d) * w;
        g.fillStyle = 'rgb(127 127 127 / .14)'; g.fillRect(x0, 0, x1 - x0, h);
        g.fillStyle = played; g.fillText(s.label, x0 + 3, 12);
      }
    }
    g.fillStyle = css.getPropertyValue('--wave-head').trim() || '#000';
    g.fillRect(Math.min(x, w - 2), 0, 2, h);
  }
}
