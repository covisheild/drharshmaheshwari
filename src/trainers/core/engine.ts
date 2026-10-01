// Trainer engine shared by every clinical trainer (auscultation now; ECG, X-ray, fundus later).
// A trainer supplies: answer options (findings), items (one recording / image each), and levels.
// The engine builds questions, balances them, picks wrong options, and tracks mastery.
// It knows nothing about audio or images: the page renders `item` however it likes.

import type { Progress, Answer } from './progress';

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

export interface Level<I> {
  id: string;
  title: string;
  blurb: string;
  pool(items: I[]): I[];
  asks: Ask<I>[];
}

export interface Part<I> { ask: Ask<I>; answer: string; options: string[] }
export interface Question<I> { level: Level<I>; item: I; parts: Part<I>[] }

export const ROUND = 10;      // questions per round
export const MASTERY = { window: 10, pass: 0.8 }; // next level opens at 80% of the last 10

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T>(xs: T[]): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const isCorrect = (a: Answer) => a.parts.every((p) => p.answer === p.chosen);

export class Engine<I extends { id: string }> {
  constructor(
    readonly items: I[],
    readonly levels: Level<I>[],
    readonly options: Map<string, Option>,
  ) {}

  label(id: string) { return this.options.get(id)?.label ?? id; }

  /** Pick the next item: each answer class is equally likely (so rare findings come up as often as
   *  common ones), weighted up for classes the learner gets wrong; never an item already in this round. */
  question(level: Level<I>, progress: Progress, used: Set<string>): Question<I> {
    const pool = level.pool(this.items);
    const first = level.asks[0];
    const byClass = new Map<string, I[]>();
    for (const it of pool) {
      if (used.has(it.id)) continue;
      const c = first.answer(it);
      byClass.set(c, [...(byClass.get(c) ?? []), it]);
    }
    if (!byClass.size) used.clear();
    const classes = byClass.size ? [...byClass.keys()] : [...new Set(pool.map((it) => first.answer(it)))];
    const recent = progress.answers.filter((a) => a.level === level.id).slice(-200);
    const weight = (c: string) => {
      const seen = recent.filter((a) => a.parts[0].answer === c);
      const wrong = seen.filter((a) => !isCorrect(a)).length;
      return 1 + 2 * (seen.length ? wrong / seen.length : 0.5);
    };
    const weights = classes.map(weight);
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    const c = classes[weights.findIndex((w) => (r -= w) < 0)] ?? classes[0];
    const item = pick(byClass.get(c) ?? pool.filter((it) => first.answer(it) === c));
    return { level, item, parts: level.asks.map((ask) => this.part(ask, item)) };
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

  levelScore(levelId: string, progress: Progress) {
    const last = progress.answers.filter((a) => a.level === levelId).slice(-MASTERY.window);
    return { n: last.length, correct: last.filter(isCorrect).length };
  }

  mastered(levelId: string, progress: Progress) {
    const s = this.levelScore(levelId, progress);
    return s.n >= MASTERY.window && s.correct / s.n >= MASTERY.pass;
  }

  unlocked(index: number, progress: Progress) {
    return progress.unlockAll || index === 0 || this.mastered(this.levels[index - 1].id, progress);
  }

  /** Accuracy for every option ever asked, and the most common mix-ups (answer -> chosen). */
  stats(progress: Progress) {
    const per = new Map<string, { n: number; correct: number }>();
    const mixups = new Map<string, number>();
    for (const a of progress.answers) for (const p of a.parts) {
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
