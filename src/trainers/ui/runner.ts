// The question runner used by Practice, Quiz and Review in every trainer.
// Layout: a media workspace (any viewer) beside or above an answer panel. It knows nothing about
// auscultation; media, teaching text and comparisons come from the trainer's adapter.

import type { Question } from '../core/engine';
import type { Activity, ProgressStore } from '../core/progress';
import type { TrainerAdapter } from '../core/types';
import type { MediaViewer } from '../core/media';
import { createViewer } from '../media';
import { h } from './dom';

export interface RunOptions<I> {
  activity: Activity;
  title: string;
  /** Next question, or null when the run is over. `used` holds item ids already asked in this run. */
  next(used: Set<string>): Question<I> | null;
  /** Number of questions, shown as "Question 3 of 10". Omit for an open-ended practice run. */
  total?: number;
  /** Show visual cues (waveform shape) before the answer. Quiz and Review hide them. */
  cuesBeforeAnswer: boolean;
  onDone(score: { right: number; asked: number }): void;
  onQuit(): void;
}

export function runQuestions<I extends { id: string }>(root: HTMLElement, adapter: TrainerAdapter<I>, store: ProgressStore, opts: RunOptions<I>) {
  const used = new Set<string>();
  let asked = 0, right = 0;
  let viewer: MediaViewer | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;

  const status = h('span', { class: 't-run-status' });
  const mediaBox = h('section', { class: 't-media', 'aria-label': 'Recording' });
  const answerBox = h('section', { class: 't-answer', 'aria-label': 'Your answer' });
  const quit = h('button', { class: 'btn-link', type: 'button', onclick: () => end(true) }, opts.total ? 'Quit' : 'Finish');
  root.replaceChildren(h('div', { class: 't-run' },
    h('div', { class: 't-run-head' }, h('b', {}, opts.title), status, quit),
    h('div', { class: 't-work' }, mediaBox, answerBox)));

  const end = (quitting: boolean) => {
    viewer?.destroy();
    if (onKey) removeEventListener('keydown', onKey);
    if (quitting && opts.total) opts.onQuit(); else opts.onDone({ right, asked });
  };

  const showStatus = () => {
    status.textContent = opts.total ? `Question ${Math.min(asked + 1, opts.total)} of ${opts.total}` : `${right} right of ${asked}`;
  };

  function next() {
    if (opts.total && asked >= opts.total) return end(false);
    const q = opts.next(used);
    if (!q) return end(false);
    used.add(q.item.id);
    showStatus();
    ask(q);
  }

  function ask(q: Question<I>) {
    const media = adapter.media(q.item);
    if (!viewer) viewer = createViewer(media.kind, mediaBox);
    viewer.setCues(opts.cuesBeforeAnswer);
    viewer.load(media, { autoplay: true, label: 'Listen, then answer' });
    const started = performance.now();
    const chosen: (string | null)[] = q.parts.map(() => null);
    const multi = q.parts.length > 1;
    const check = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => submit() }, 'Check');

    const groups = q.parts.map((p, pi) => h('fieldset', { class: 't-ask' },
      h('legend', {}, p.ask.prompt),
      h('div', { class: 't-opts' }, ...p.options.map((id, oi) => h('button', {
        class: 't-opt', type: 'button', 'data-id': id, 'aria-pressed': 'false',
        onclick: (e: Event) => choose(pi, id, e.currentTarget as HTMLElement),
      }, h('kbd', { 'aria-hidden': 'true' }, multi ? '' : String(oi + 1)), adapter.engine.label(id))))));
    answerBox.replaceChildren(...groups, ...(multi ? [h('div', { class: 't-row' }, check)] : []));

    function choose(pi: number, id: string, btn: HTMLElement) {
      if (answered) return;
      chosen[pi] = id;
      btn.parentElement!.querySelectorAll('.t-opt').forEach((o) => o.setAttribute('aria-pressed', String(o === btn)));
      if (!multi) submit(); else check.disabled = chosen.includes(null);
    }

    let answered = false;
    function submit() {
      if (answered || chosen.includes(null)) return;
      answered = true;
      const parts = q.parts.map((p, i) => ({ answer: p.answer, chosen: chosen[i]! }));
      const ok = parts.every((p) => p.answer === p.chosen);
      store.record({ version: adapter.version, item: q.item.id, set: q.set.id, activity: opts.activity, parts, correct: ok, ms: Math.round(performance.now() - started) });
      asked++; if (ok) right++;
      groups.forEach((g, i) => g.querySelectorAll<HTMLButtonElement>('.t-opt').forEach((o) => {
        o.disabled = true;
        if (o.dataset.id === q.parts[i].answer) o.classList.add('right');
        else if (o.dataset.id === chosen[i]) o.classList.add('wrong');
      }));
      check.remove();
      viewer!.setCues(true);
      answerBox.append(feedback(q, parts, ok));
      answerBox.querySelector<HTMLButtonElement>('.t-next')?.focus({ preventScroll: true });
    }

    function feedback(q: Question<I>, parts: { answer: string; chosen: string }[], ok: boolean) {
      const box = h('div', { class: 't-feedback', 'aria-live': 'polite' }, h('p', { class: ok ? 't-verdict ok' : 't-verdict bad' }, ok ? 'Right.' : 'Not quite.'));
      q.parts.forEach((p) => {
        const e = adapter.explain(q.item, p);
        box.append(h('p', {}, h('b', {}, `${multi ? `${p.ask.prompt}: ` : ''}${e.title}. `), e.body));
      });
      const row = h('div', { class: 't-row' });
      for (const c of adapter.compare(q.item, parts)) {
        row.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewer!.load(c.media, { autoplay: true, label: c.label }) }, `▶ ${c.label}`));
      }
      row.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewer!.load(media, { autoplay: true, label: 'The question recording' }) }, '↻ The question again'));
      box.append(row, h('div', { class: 't-row' }, h('button', { class: 'btn btn-primary t-next', type: 'button', onclick: () => { viewer!.stop(); next(); } }, opts.total && asked >= opts.total ? 'See your score →' : 'Next →')));
      showStatus();
      return box;
    }

    // Keyboard: 1-9 picks an option (single-part questions), Enter checks or moves on.
    if (onKey) removeEventListener('keydown', onKey);
    onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [role="slider"]')) return;
      if (!multi && !answered && /^[1-9]$/.test(e.key)) {
        const btn = groups[0].querySelectorAll<HTMLElement>('.t-opt')[Number(e.key) - 1];
        if (btn) { e.preventDefault(); choose(0, btn.dataset.id!, btn); }
      } else if (e.key === 'Enter' && answered && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault(); answerBox.querySelector<HTMLButtonElement>('.t-next')?.click();
      }
    };
    addEventListener('keydown', onKey);
  }

  next();
}
