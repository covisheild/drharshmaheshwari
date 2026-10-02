// The interactive parts of the trainer sections, shared by every trainer: Home summary, Practice, Quiz,
// Review and Progress. Each mount function fills one element on a static page.

import { MASTERY, ROUND, type QuestionSet } from '../core/engine';
import type { ProgressStore } from '../core/progress';
import type { TrainerAdapter } from '../core/types';
import { h, pct } from './dom';
import { runQuestions } from './runner';

type A<I extends { id: string }> = TrainerAdapter<I>;

const scoreCard = (title: string, line: string, actions: Node[]) =>
  h('div', { class: 'card t-score' }, h('span', { class: 'eyebrow' }, title), h('p', { class: 't-big' }, line), h('div', { class: 't-row' }, ...actions));

/** Home: where you are and what to do next. */
export function mountHome<I extends { id: string }>(el: HTMLElement, a: A<I>, store: ProgressStore, base: string) {
  const render = () => {
    const at = store.attempts(), e = a.engine, prefs = store.prefs();
    const li = e.currentLevel(at, prefs.unlockAll), lv = e.levels[li];
    const passed = e.levels.filter((l) => e.mastered(l.id, at)).length;
    const review = e.toReview(at).length;
    const quizAt = at.filter((x) => x.activity === 'quiz');
    el.replaceChildren(
      h('div', { class: 't-stats' },
        h('div', { class: 't-stat' }, h('b', {}, `${passed}/${e.levels.length}`), h('span', {}, 'levels passed')),
        h('div', { class: 't-stat' }, h('b', {}, String(at.length)), h('span', {}, 'answers so far')),
        h('div', { class: 't-stat' }, h('b', {}, quizAt.length ? `${pct({ n: quizAt.length, correct: quizAt.filter((x) => x.correct).length })}%` : '–'), h('span', {}, 'quiz accuracy')),
        h('div', { class: 't-stat' }, h('b', {}, String(review)), h('span', {}, 'due for review'))),
      h('div', { class: 't-row' },
        h('a', { class: 'btn btn-primary', href: `${base}quiz/#${lv.id}` }, at.length ? `Continue: Level ${li + 1}, ${lv.title} →` : 'Start the quiz →'),
        h('a', { class: 'btn btn-ghost', href: `${base}learn/` }, 'Learn the sounds first'),
        review ? h('a', { class: 'btn btn-ghost', href: `${base}review/` }, `Review ${review} due`) : null));
  };
  render();
  store.subscribe(render);
}

/** Practice: pick a set, then open-ended questions with the waveform visible. Never affects levels. */
export function mountPractice<I extends { id: string }>(el: HTMLElement, a: A<I>, store: ProgressStore) {
  const menu = () => el.replaceChildren(
    h('p', { class: 'muted' }, 'No score, no levels: practise as long as you like. The waveform is shown, and every answer is followed by comparisons.'),
    h('div', { class: 't-cards' }, ...a.engine.practice.map((s) =>
      h('button', { class: 'card t-pick', type: 'button', onclick: () => start(s) }, h('h3', {}, s.title), h('p', {}, s.blurb), h('span', { class: 'more' }, 'Practise →')))));
  const start = (s: QuestionSet<I>) => runQuestions(el, a, store, {
    activity: 'practice', title: s.title, cuesBeforeAnswer: true,
    next: (used) => a.engine.question(s, store.attempts(), used),
    onDone: ({ right, asked }) => el.replaceChildren(scoreCard(s.title, asked ? `${right} of ${asked} right` : 'No answers yet', [
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => start(s) }, 'Keep practising'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: menu }, 'Choose another set')])),
    onQuit: menu,
  });
  menu();
}

/** Quiz: levels that open one after another; rounds of ROUND questions; waveform hidden until answered. */
export function mountQuiz<I extends { id: string }>(el: HTMLElement, a: A<I>, store: ProgressStore) {
  const e = a.engine;
  const levels = () => {
    const at = store.attempts(), unlockAll = store.prefs().unlockAll;
    el.replaceChildren(
      h('p', { class: 'muted' }, `Rounds of ${ROUND}. The waveform stays hidden until you answer. The next level opens at ${MASTERY.pass * 100}% of your last ${MASTERY.window} answers at the current level.`),
      h('ol', { class: 't-levels' }, ...e.levels.map((lv, i) => {
        const open = e.unlocked(i, at, unlockAll), s = e.levelScore(lv.id, at), done = e.mastered(lv.id, at);
        const state = done ? 'Passed' : s.n ? `Last ${s.n}: ${s.correct} right` : open ? 'Not started' : `Locked: pass level ${i} first`;
        return h('li', { class: 'card t-level', id: lv.id, 'data-state': done ? 'passed' : open ? 'open' : 'locked' },
          h('div', {}, h('span', { class: 't-level-n' }, `Level ${i + 1}`), h('h3', {}, lv.title), h('p', {}, lv.blurb), h('p', { class: 't-meta' }, state)),
          open ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => round(lv) }, s.n ? 'Play a round' : 'Start') : null);
      })));
    const target = location.hash.slice(1) && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'center' });
  };
  const round = (lv: QuestionSet<I>) => runQuestions(el, a, store, {
    activity: 'quiz', title: lv.title, total: ROUND, cuesBeforeAnswer: false,
    next: (used) => e.question(lv, store.attempts(), used),
    onDone: ({ right }) => {
      const i = e.levels.indexOf(lv), passed = e.mastered(lv.id, store.attempts());
      el.replaceChildren(scoreCard(lv.title, `${right} / ${ROUND}`, [
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => round(lv) }, 'Another round'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: levels }, 'All levels')]),
        h('p', { class: 'muted' }, passed && i < e.levels.length - 1 ? `Level ${i + 2} is open.` : passed ? 'You have passed the last level.' : `Get ${MASTERY.pass * 100}% of your last ${MASTERY.window} right to open the next level.`));
    },
    onQuit: levels,
  });
  levels();
}

/** Review: spaced repetition. Items missed last time, and items due because they are about to be forgotten,
 *  asked again in the set they came from. */
export function mountReview<I extends { id: string }>(el: HTMLElement, a: A<I>, store: ProgressStore, base: string) {
  const e = a.engine;
  let busy = false;
  const menu = () => {
    busy = false;
    const at = store.attempts(), due = e.toReview(at), missed = due.filter((d) => !d.lastCorrect).length, next = e.nextReview(at);
    const when = next ? h('p', { class: 'muted' }, `Next: ${plural(next.count, 'recording')} ${relDay(next.at)}.`) : null;
    el.replaceChildren(due.length
      ? h('div', {},
          h('p', {}, `${plural(due.length, 'recording')} due: ${[missed && `${missed} you got wrong last time`, due.length - missed && `${due.length - missed} coming back before you forget ${due.length - missed > 1 ? 'them' : 'it'}`].filter(Boolean).join(', ')}.`),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => start() }, `Review ${Math.min(due.length, ROUND)} now`),
          h('p', { class: 'muted' }, 'Spaced repetition: each recording comes back just before you are likely to forget it, at longer gaps each time you get it right.'))
      : h('div', { class: 'empty' },
          h('p', {}, at.length ? 'Nothing due right now.' : 'Nothing to review yet: answer some questions first.'), when,
          h('a', { href: `${base}quiz/` }, 'Go to the quiz →')));
  };
  const start = () => {
    busy = true;
    const due = e.toReview(store.attempts()).slice(0, ROUND);
    let i = 0;
    runQuestions(el, a, store, {
      activity: 'review', title: 'Review', total: due.length, cuesBeforeAnswer: false,
      next: () => { const d = due[i++]; return d ? e.questionFor(e.set(d.set)!, e.byId.get(d.item)!) : null; },
      onDone: ({ right, asked }) => el.replaceChildren(scoreCard('Review', `${right} of ${asked} right`, [
        h('button', { class: 'btn btn-primary', type: 'button', onclick: menu }, 'Back to review')])),
      onQuit: menu,
    });
  };
  menu();
  store.subscribe(() => { if (!busy) menu(); });
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "today", "tomorrow", "in 5 days" (or a date beyond a month). */
function relDay(t: number) {
  const day = (x: number) => Math.floor((x - new Date(x).getTimezoneOffset() * 60000) / 86400000);
  const d = day(t) - day(Date.now());
  return d <= 0 ? 'later today' : d === 1 ? 'tomorrow' : d <= 30 ? `in ${d} days` : `on ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** Progress: accuracy per finding, common mix-ups, levels, and settings. */
export function mountProgress<I extends { id: string }>(el: HTMLElement, a: A<I>, store: ProgressStore) {
  const e = a.engine;
  const render = () => {
    const at = store.attempts(), { per, mixups } = e.stats(at);
    const rows = [...e.options.values()].filter((o) => per.has(o.id) && o.group);
    el.replaceChildren(
      h('p', { class: 'muted' }, `${at.length} answers so far.`),
      rows.length ? h('table', { class: 't-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Finding'), h('th', {}, 'Asked'), h('th', {}, 'Right'), h('th', { 'aria-hidden': 'true' }, ''))),
        h('tbody', {}, ...rows.map((o) => {
          const s = per.get(o.id)!;
          return h('tr', {}, h('td', {}, o.label), h('td', {}, String(s.n)), h('td', {}, `${pct(s)}%`),
            h('td', { 'aria-hidden': 'true' }, h('div', { class: 't-bar' }, h('span', { style: `width:${pct(s)}%` }))));
        }))) : h('p', { class: 'empty' }, 'Answer some questions in Practice or Quiz to see your results here.'),
      mixups.length ? h('div', {}, h('h2', {}, 'What you mix up most'),
        h('ul', {}, ...mixups.map((m) => h('li', {}, `${e.label(m.answer)}: you said ${e.label(m.chosen)} (${m.count}×)`)))) : '',
      h('h2', {}, 'Levels'),
      h('ol', {}, ...e.levels.map((lv) => { const s = e.levelScore(lv.id, at); return h('li', {}, `${lv.title}: ${e.mastered(lv.id, at) ? 'passed' : s.n ? `${s.correct} of last ${s.n} right` : 'not started'}`); })),
      h('h2', {}, 'Settings'),
      h('label', { class: 't-check' }, h('input', { type: 'checkbox', checked: store.prefs().unlockAll, onchange: (ev: Event) => store.setPrefs({ unlockAll: (ev.target as HTMLInputElement).checked }) }), ' Open all quiz levels (if you already know the basics)'),
      h('p', {}, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { if (confirm('Delete all your answers for this trainer and start again?')) store.reset(); } }, 'Reset progress')),
    );
  };
  render();
  store.subscribe(render);
}
