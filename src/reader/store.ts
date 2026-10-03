// BookProgressStore: where you are in a book, your bookmarks and your practice marks.
//
// Local first, like the trainers' LocalProgressStore: everything is kept in this browser under
// `book:<id>:v1`, so reading never needs an account. SyncedBookStore (sync.ts) extends it for people who
// sign in: the local copy stays what the page reads, and changes upload in the background. The UI only ever
// talks to this class. Locations are section id + paragraph index + fraction (types.ts), never a page or a
// percentage, so they survive a new version of the book. `percent` is kept only to draw progress bars.
//
// Practice marks are attempts in the trainers' format (trainer `book-<slug>`), so the FSRS scheduler that
// runs the trainers' Review (src/trainers/core/schedule.ts) runs the book's Review too.

import type { Attempt } from '../trainers/core/progress';
import type { Location } from './types';

export interface Bookmark { id: string; loc: Location; snippet: string; label: string; created: number; deleted?: number | null }
export interface PracticeMark { mark: 'got' | 'missed'; confidence?: number; t: number }
export interface BookState {
  version: string;
  loc: Location | null;
  percent: number;
  updated: number;
  /** Section ids read to the end at least once. */
  done: string[];
  /** Every bookmark, including deleted ones (kept, marked, so a deletion reaches the account). */
  bookmarks: Bookmark[];
  /** The last mark for each question, keyed `<section id>-<e|p><n>` (exercise or practice) or `-k<n>` (a must-know point in Review). */
  practice: Record<string, PracticeMark>;
  /** Every mark, oldest first: the Review schedule is rebuilt from these. */
  attempts: Attempt[];
}

export interface ReaderPrefs { size: number; width: number }

const key = (book: string) => `book:${book}:v1`;
const PREFS = 'reader:prefs:v1';
const KEEP = 5000;
export const DEFAULT_PREFS: ReaderPrefs = { size: 2, width: 1 };

function read<T>(k: string): T | null {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or full: reading still works */ }
}
/** `b0-r0-c05-p3` -> `b0-r0-c05`: the section a question or must-know point belongs to. */
export const sectionOf = (item: string) => item.replace(/-[epk]\d+$/, '');

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const empty = (version: string): BookState =>
  ({ version, loc: null, percent: 0, updated: 0, done: [], bookmarks: [], practice: {}, attempts: [] });

/** The last mark for each question, from the attempts. */
export function lastMarks(attempts: readonly Attempt[], known: Record<string, PracticeMark> = {}): Record<string, PracticeMark> {
  const out: Record<string, PracticeMark> = { ...known };
  for (const a of [...attempts].sort((x, y) => x.t - y.t)) {
    const prev = out[a.item];
    if (!prev || prev.t <= a.t) out[a.item] = { mark: a.correct ? 'got' : 'missed', confidence: prev?.t === a.t ? prev.confidence : undefined, t: a.t };
  }
  return out;
}

export class BookProgressStore {
  protected state: BookState;
  private listeners = new Set<() => void>();
  /** The trainer id practice marks are filed under: `book-b0`. */
  readonly trainer: string;

  readonly book: string;
  readonly version: string;

  constructor(book: string, version: string) {
    this.book = book;
    this.version = version;
    const saved = read<Partial<BookState>>(key(book));
    this.state = { ...empty(version), ...(saved ?? {}) };
    this.trainer = `book-${book.toLowerCase()}`;
    this.adoptOldMarks();
  }

  /** Marks saved before marks had a history (the first reader, 2-3 Oct 2026) become attempts, once. */
  private adoptOldMarks() {
    const have = new Set(this.state.attempts.map((a) => a.item));
    const old = Object.entries(this.state.practice).filter(([item]) => !have.has(item));
    if (!old.length) return;
    const adopted: Attempt[] = old.map(([item, m]) => ({ id: newId(), trainer: this.trainer, version: this.version, item, set: sectionOf(item),
      activity: 'practice', parts: [], correct: m.mark === 'got', t: m.t }));
    this.state = { ...this.state, attempts: [...this.state.attempts, ...adopted].sort((a, b) => a.t - b.t) };
    write(key(this.book), this.state);
  }

  get(): Readonly<BookState> { return this.state; }

  /** Re-reads the browser copy (after it was cleared because it belonged to someone else). */
  protected reload() {
    this.state = { ...empty(this.version), ...(read<Partial<BookState>>(key(this.book)) ?? {}) };
    this.adoptOldMarks();
  }
  /** Bookmarks that have not been deleted, oldest first. */
  bookmarks(): Bookmark[] { return this.state.bookmarks.filter((b) => !b.deleted); }

  setLocation(loc: Location, percent: number) {
    this.state = { ...this.state, loc, percent: Math.max(0, Math.min(1, percent)), updated: Date.now(), version: this.version };
    this.save();
  }

  markDone(section: string) {
    if (this.state.done.includes(section)) return;
    this.state = { ...this.state, done: [...this.state.done, section] };
    this.save();
  }

  addBookmark(b: Omit<Bookmark, 'id' | 'created'>) {
    const full: Bookmark = { ...b, id: newId(), created: Date.now() };
    this.state = { ...this.state, bookmarks: [...this.state.bookmarks, full] };
    this.save();
    return full;
  }

  removeBookmark(id: string) {
    this.state = { ...this.state, bookmarks: this.state.bookmarks.map((b) => (b.id === id ? { ...b, deleted: Date.now() } : b)) };
    this.save();
  }

  /** Records a mark on a question (or a must-know point in Review). `set` is the section it belongs to. */
  setPractice(id: string, mark: Omit<PracticeMark, 't'> & { t?: number }, activity: 'practice' | 'review' = 'practice') {
    const t = mark.t ?? Date.now();
    const attempt: Attempt = { id: newId(), trainer: this.trainer, version: this.version, item: id, set: sectionOf(id),
      activity, parts: [], correct: mark.mark === 'got', t };
    this.state = { ...this.state, practice: { ...this.state.practice, [id]: { ...mark, t } }, attempts: [...this.state.attempts, attempt].slice(-KEEP) };
    this.save();
    return attempt;
  }

  /** Brings in what the account holds (sync.ts). Newest place wins; bookmarks and marks are merged. */
  protected merge(remote: { progress?: { version: string; loc: Location; percent: number; updated: number; done?: string[] } | null; bookmarks?: Bookmark[]; attempts?: Attempt[] }) {
    let s = { ...this.state };
    const p = remote.progress;
    if (p && p.updated > s.updated) s = { ...s, loc: p.loc, percent: p.percent, updated: p.updated };
    if (p?.done) s.done = [...new Set([...s.done, ...p.done])];
    if (remote.bookmarks) {
      const byId = new Map(s.bookmarks.map((b) => [b.id, b]));
      for (const b of remote.bookmarks) {
        const mine = byId.get(b.id);
        byId.set(b.id, mine ? { ...mine, deleted: mine.deleted ?? b.deleted ?? null } : b);
      }
      s.bookmarks = [...byId.values()].sort((a, b) => a.created - b.created);
    }
    if (remote.attempts) {
      const seen = new Set(s.attempts.map((a) => a.id));
      s.attempts = [...s.attempts, ...remote.attempts.filter((a) => !seen.has(a.id))].sort((a, b) => a.t - b.t).slice(-KEEP);
      s.practice = lastMarks(s.attempts, s.practice);
    }
    this.state = s;
    this.save();
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  protected save() {
    write(key(this.book), this.state);
    for (const fn of this.listeners) fn();
  }

  /** Every book this browser has opened, for the series page's "Continue reading" row. */
  static all(): Record<string, BookState> {
    const out: Record<string, BookState> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = localStorage.key(i)?.match(/^book:(.+):v1$/);
        if (m) { const s = read<BookState>(m[0]); if (s) out[m[1]] = { ...empty(s.version), ...s }; }
      }
    } catch { /* storage blocked: no row */ }
    return out;
  }

  static prefs(): ReaderPrefs { return { ...DEFAULT_PREFS, ...(read<ReaderPrefs>(PREFS) ?? {}) }; }
  static setPrefs(p: ReaderPrefs) { write(PREFS, p); }
}
