// Spaced repetition for Review (FSRS, via the ts-fsrs package). Shared by every trainer.
//
// Nothing extra is stored: each item's memory state is rebuilt by replaying its attempts in order, so the
// schedule is the same on every device that has the same attempts, and improving the scheduler later
// changes it for everyone without migrating data. An answer counts as "Good" when right and "Again" when
// wrong. Items answered wrong last time are due straight away; the rest come back when FSRS predicts the
// chance of remembering them has fallen to 90%.

import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { Attempt } from './progress';

// No same-day learning steps: a quiz asks the same items many times a day, and wrong answers are due
// immediately anyway. Intervals are capped at a year.
const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false, enable_short_term: false });

export interface ItemSchedule {
  item: string;
  /** The set the item was last asked in (Review asks it there again). */
  set: string;
  card: Card;
  lastCorrect: boolean;
  lastT: number;
}

/** Memory state for every item that has been answered at least once. */
export function scheduleItems(attempts: readonly Attempt[]): Map<string, ItemSchedule> {
  const out = new Map<string, ItemSchedule>();
  const sorted = [...attempts].sort((a, b) => a.t - b.t);
  for (const a of sorted) {
    const prev = out.get(a.item);
    const card = scheduler.next(prev?.card ?? createEmptyCard(new Date(a.t)), new Date(a.t), a.correct ? Rating.Good : Rating.Again).card;
    out.set(a.item, { item: a.item, set: a.set, card, lastCorrect: a.correct, lastT: a.t });
  }
  return out;
}

export const isDue = (s: ItemSchedule, now: number) => !s.lastCorrect || s.card.due.getTime() <= now;

/** Items to review now: missed last time first (newest first), then the most overdue. */
export function dueItems(attempts: readonly Attempt[], now = Date.now()): ItemSchedule[] {
  return [...scheduleItems(attempts).values()].filter((s) => isDue(s, now)).sort((a, b) =>
    a.lastCorrect !== b.lastCorrect ? (a.lastCorrect ? 1 : -1)
      : !a.lastCorrect ? b.lastT - a.lastT
      : a.card.due.getTime() - b.card.due.getTime());
}

/** When the next item that is not yet due becomes due, and how many fall due then (same day). */
export function nextDue(attempts: readonly Attempt[], now = Date.now()): { at: number; count: number } | null {
  const later = [...scheduleItems(attempts).values()].filter((s) => !isDue(s, now)).map((s) => s.card.due.getTime()).sort((a, b) => a - b);
  if (!later.length) return null;
  const day = new Date(later[0]).toDateString();
  return { at: later[0], count: later.filter((t) => new Date(t).toDateString() === day).length };
}
