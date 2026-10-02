// BookProgressStore: where you are in a book, your bookmarks and your practice marks.
//
// Local first, like the trainers' LocalProgressStore: everything is kept in this browser under
// `book:<id>:v1`, so reading never needs an account. Account sync (Phase 2) wraps this the way
// SyncedProgressStore wraps LocalProgressStore; the UI only ever talks to this interface.
// Locations are section id + paragraph index + fraction (types.ts), never a page or a percentage, so they
// survive a new version of the book. `percent` is kept only to draw progress bars.

import type { Location } from './types';

export interface Bookmark { id: string; loc: Location; snippet: string; label: string; created: number }
export interface PracticeMark { mark: 'got' | 'missed'; confidence?: number; t: number }
export interface BookState {
  version: string;
  loc: Location | null;
  percent: number;
  updated: number;
  /** Section ids read to the end at least once. */
  done: string[];
  bookmarks: Bookmark[];
  /** Keyed `<section id>:<e|p><n>`, e.g. `b0-r0-c05:p3`. */
  practice: Record<string, PracticeMark>;
}

export interface ReaderPrefs { size: number; width: number }

const key = (book: string) => `book:${book}:v1`;
const PREFS = 'reader:prefs:v1';
export const DEFAULT_PREFS: ReaderPrefs = { size: 2, width: 1 };

function read<T>(k: string): T | null {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or full: reading still works */ }
}

const empty = (version: string): BookState =>
  ({ version, loc: null, percent: 0, updated: 0, done: [], bookmarks: [], practice: {} });

export class BookProgressStore {
  private state: BookState;
  private listeners = new Set<() => void>();

  constructor(readonly book: string, readonly version: string) {
    const saved = read<BookState>(key(book));
    this.state = saved ? { ...empty(version), ...saved } : empty(version);
  }

  get(): Readonly<BookState> { return this.state; }

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
    const full: Bookmark = { ...b, id: Math.random().toString(36).slice(2, 10), created: Date.now() };
    this.state = { ...this.state, bookmarks: [...this.state.bookmarks, full] };
    this.save();
    return full;
  }

  removeBookmark(id: string) {
    this.state = { ...this.state, bookmarks: this.state.bookmarks.filter((b) => b.id !== id) };
    this.save();
  }

  setPractice(id: string, mark: PracticeMark) {
    this.state = { ...this.state, practice: { ...this.state.practice, [id]: mark } };
    this.save();
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  private save() {
    write(key(this.book), this.state);
    for (const fn of this.listeners) fn();
  }

  /** Every book this browser has opened, for the series page's "Continue reading" row. */
  static all(): Record<string, BookState> {
    const out: Record<string, BookState> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = localStorage.key(i)?.match(/^book:(.+):v1$/);
        if (m) { const s = read<BookState>(m[0]); if (s) out[m[1]] = s; }
      }
    } catch { /* storage blocked: no row */ }
    return out;
  }

  static prefs(): ReaderPrefs { return { ...DEFAULT_PREFS, ...(read<ReaderPrefs>(PREFS) ?? {}) }; }
  static setPrefs(p: ReaderPrefs) { write(PREFS, p); }
}
