// Trainer engine shared by every clinical trainer (auscultation now; ECG, X-ray, pathology later).
// A trainer supplies answer options (findings), items (one recording / image each) and question sets.
// The engine builds questions, balances them, picks wrong options and tracks mastery. It knows nothing
// about audio, images or the DOM, so it can be tested on its own.

import type { Attempt } from './progress';

export interface Option {
  id: string;
  label: string;
  /** Options in the same group are look-alikes; "near" questions draw wrong options from here first. */
  group?: string;
}

export interface Ask<I> {
  key: string;
  prompt: string;
  /** Option ids this question may offer, in the order they are shown (or chosen per item). */
  choices: string[] | ((item: I) => string[]);
  answer(item: I): string;
  /** How many options to show (default: all choices). */
  n?: number;
  /** Prefer look-alikes (same group) as the wrong options. */
  near?: boolean;
}

/** A set of questions: a quiz level (counts towards mastery) or a practice set (does not). */
export interface QuestionSet<I> {
  id: string;
  title: string;
  blurb: string;
  pool(items: I[]): I[];
  asks: Ask<I>[];
}
export type Level<I> = QuestionSet<I>;

export interface Part<I> { ask: Ask<I>; answer: string; options: string[] }
export interface Question<I> { set: QuestionSet<I>; item: I; parts: Part<I>[] }

export const ROUND = 10;                          // questions per quiz round
export const MASTERY = { window: 10, pass: 0.8 }; // a level is passed at 80% of its last 10 quiz answers

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T>(xs: readonly T[]): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export class Engine<I extends { id: string }> {
  readonly byId: Map<string, I>;

  constructor(
    readonly items: I[],
    readonly levels: Level<I>[],
    readonly options: Map<string, Option>,
    readonly practice: QuestionSet<I>[] = [],
  ) {
    this.byId = new Map(items.map((it) => [it.id, it]));
  }

  label(id: string) { return this.options.get(id)?.label ?? id; }
  set(id: string) { return [...this.levels, ...this.practice].find((s) => s.id === id); }

  /** Next question from a set: each answer class is equally likely (so rare findings come up as often as
   *  common ones), weighted up for classes the learner gets wrong; never an item already in `used`. */
  question(set: QuestionSet<I>, attempts: readonly Attempt[], used: Set<string>): Question<I> {
    const pool = set.pool(this.items);
    const first = set.asks[0];
    const byClass = new Map<string, I[]>();
    for (const it of pool) {
      if (used.has(it.id)) continue;
      const c = first.answer(it);
      byClass.set(c, [...(byClass.get(c) ?? []), it]);
    }
    if (!byClass.size) used.clear();
    const classes = byClass.size ? [...byClass.keys()] : [...new Set(pool.map((it) => first.answer(it)))];
    const recent = attempts.filter((a) => a.set === set.id).slice(-200);
    const weight = (c: string) => {
      const seen = recent.filter((a) => a.parts[0]?.answer === c);
      const wrong = seen.filter((a) => !a.correct).length;
      return 1 + 2 * (seen.length ? wrong / seen.length : 0.5);
    };
    const weights = classes.map(weight);
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    const c = classes[weights.findIndex((w) => (r -= w) < 0)] ?? classes[0];
    return this.questionFor(set, pick(byClass.get(c) ?? pool.filter((it) => first.answer(it) === c)));
  }

  /** A question about one particular item (used by Review). */
  questionFor(set: QuestionSet<I>, item: I): Question<I> {
    return { set, item, parts: set.asks.map((ask) => this.part(ask, item)) };
  }

  private part(ask: Ask<I>, item: I): Part<I> {
    const answer = ask.answer(item);
    const choices = typeof ask.choices === 'function' ? ask.choices(item) : ask.choices;
    const n = Math.min(ask.n ?? choices.length, choices.length);
    let wrong = choices.filter((id) => id !== answer);
    if (n < choices.length) {
      const group = this.options.get(answer)?.group;
      const near = ask.near && group ? shuffle(wrong.filter((id) => this.options.get(id)?.group === group)) : [];
      wrong = [...near, ...shuffle(wrong.filter((id) => !near.includes(id)))].slice(0, n - 1);
    }
    const shown = new Set([answer, ...wrong]);
    return { ask, answer, options: choices.filter((id) => shown.has(id)) };
  }

  /** Only quiz answers count towards a level; practice and review never lock or unlock anything. */
  levelScore(levelId: string, attempts: readonly Attempt[]) {
    const last = attempts.filter((a) => a.set === levelId && a.activity === 'quiz').slice(-MASTERY.window);
    return { n: last.length, correct: last.filter((a) => a.correct).length };
  }

  mastered(levelId: string, attempts: readonly Attempt[]) {
    const s = this.levelScore(levelId, attempts);
    return s.n >= MASTERY.window && s.correct / s.n >= MASTERY.pass;
  }

  unlocked(index: number, attempts: readonly Attempt[], unlockAll = false) {
    return unlockAll || index === 0 || this.mastered(this.levels[index - 1].id, attempts);
  }

  /** The level to work on next: the first open level not yet passed. */
  currentLevel(attempts: readonly Attempt[], unlockAll = false) {
    const i = this.levels.findIndex((l, k) => this.unlocked(k, attempts, unlockAll) && !this.mastered(l.id, attempts));
    return i === -1 ? this.levels.length - 1 : i;
  }

  /** Items whose most recent answer was wrong, newest first: what Review asks again. */
  toReview(attempts: readonly Attempt[]) {
    const latest = new Map<string, Attempt>();
    for (const a of attempts) latest.set(a.item, a);
    return [...latest.values()].filter((a) => !a.correct && this.byId.has(a.item) && this.set(a.set)).sort((a, b) => b.t - a.t);
  }

  /** Accuracy for every option ever asked, and the most common mix-ups (answer -> chosen). */
  stats(attempts: readonly Attempt[]) {
    const per = new Map<string, { n: number; correct: number }>();
    const mixups = new Map<string, number>();
    for (const a of attempts) for (const p of a.parts) {
      const s = per.get(p.answer) ?? { n: 0, correct: 0 };
      s.n++; if (p.answer === p.chosen) s.correct++;
      per.set(p.answer, s);
      if (p.answer !== p.chosen) mixups.set(`${p.answer}>${p.chosen}`, (mixups.get(`${p.answer}>${p.chosen}`) ?? 0) + 1);
    }
    const top = [...mixups].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, count]) => { const [answer, chosen] = k.split('>'); return { answer, chosen, count }; });
    return { per, mixups: top };
  }
}
