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
/**
 * A highlight, with an optional note. Where it is: the section, and a character range in that section's text
 * (anchor.ts), plus the quoted text and a few words either side, so a new version of the book can still find it.
 * `updated` changes with the colour, the note or the deletion; the newest edit wins on every device, and a
 * deletion is kept (marked) so it reaches the other devices.
 */
export interface Highlight {
  id: string;
  sec: string;
  start: number;
  end: number;
  /** Paragraph the highlight starts in (to jump to it). */
  para: number;
  quote: string;
  before: string;
  after: string;
  /** The quoted text as it reads (superscripts as ^, no citation numbers), for lists, export and AI. */
  text: string;
  colour: number;
  note: string;
  version: string;
  created: number;
  updated: number;
  deleted?: number | null;
}
/** What this browser has changed that the account has not been told yet (sync.ts uploads it in batches). */
export interface Outbox { progress: boolean; bookmarks: string[]; attempts: string[]; highlights: string[] }
export interface BookState {
  version: string;
  loc: Location | null;
  percent: number;
  updated: number;
  /** Section ids read to the end at least once. */
  done: string[];
  /** Every bookmark, including deleted ones (kept, marked, so a deletion reaches the account). */
  bookmarks: Bookmark[];
  /** Every highlight, including deleted ones. */
  highlights: Highlight[];
  /** The last mark for each question, keyed `<section id>-<e|p><n>` (exercise or practice) or `-k<n>` (a must-know point in Review). */
  practice: Record<string, PracticeMark>;
  /** Every mark, oldest first: the Review schedule is rebuilt from these. */
  attempts: Attempt[];
  /** Server time (ms) up to which this browser has everything the account holds; absent until a first full download. */
  since?: number;
  out: Outbox;
}

/** What selecting text does: show the small bar, highlight at once in the chosen colour, or nothing. */
export type SelectMode = 'bar' | 'quick' | 'off';
export interface ReaderPrefs {
  size: number; width: number;
  select: SelectMode;
  /** The colour (0-3) a highlight gets unless another is picked. */
  colour: number;
  /** Show the Note button in the bar. */
  note: boolean;
  /** Show highlights in the text. */
  show: boolean;
}

const key = (book: string) => `book:${book}:v1`;
const PREFS = 'reader:prefs:v1';
const KEEP = 5000;
export const DEFAULT_PREFS: ReaderPrefs = { size: 2, width: 1, select: 'bar', colour: 0, note: true, show: true };

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

export const emptyOutbox = (): Outbox => ({ progress: false, bookmarks: [], attempts: [], highlights: [] });
const empty = (version: string): BookState =>
  ({ version, loc: null, percent: 0, updated: 0, done: [], bookmarks: [], highlights: [], practice: {}, attempts: [], out: emptyOutbox() });
/** A saved copy from an older version of the reader gets every field the newer one expects. */
const restore = (version: string, saved: Partial<BookState> | null): BookState => {
  const s = { ...empty(version), ...(saved ?? {}) };
  return { ...s, out: { ...emptyOutbox(), ...(saved?.out ?? {}) } };
};

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
    this.state = restore(version, read<Partial<BookState>>(key(book)));
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
    this.state = restore(this.version, read<Partial<BookState>>(key(this.book)));
    this.adoptOldMarks();
  }
  /** Notes what the account has not been told yet, or forgets the cursor if nothing is going to tell it (see sync.ts). */
  protected setOut(fn: (o: Outbox) => Outbox) {
    this.state = { ...this.state, out: fn(this.state.out) };
    write(key(this.book), this.state); // bookkeeping only: nothing on screen changes, so no one is told
  }
  protected setSince(since: number | undefined) {
    this.state = { ...this.state, since };
    write(key(this.book), this.state);
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

  /** Highlights that have not been deleted, oldest first. */
  highlights(): Highlight[] { return this.state.highlights.filter((h) => !h.deleted); }

  addHighlight(h: Omit<Highlight, 'id' | 'created' | 'updated' | 'version' | 'note' | 'deleted'> & { note?: string }): Highlight {
    const now = Date.now();
    const full: Highlight = { note: '', ...h, id: newId(), version: this.version, created: now, updated: now };
    this.state = { ...this.state, highlights: [...this.state.highlights, full] };
    this.save();
    return full;
  }

  /** Changes a highlight's colour or note. */
  updateHighlight(id: string, patch: { colour?: number; note?: string }): Highlight | null {
    let out: Highlight | null = null;
    this.state = { ...this.state, highlights: this.state.highlights.map((h) => {
      if (h.id !== id || h.deleted) return h;
      out = { ...h, ...patch, updated: Math.max(Date.now(), h.updated + 1) };
      return out;
    }) };
    if (out) this.save();
    return out;
  }

  removeHighlight(id: string) {
    const now = Date.now();
    this.state = { ...this.state, highlights: this.state.highlights.map((h) => (h.id === id && !h.deleted ? { ...h, deleted: now, updated: Math.max(now, h.updated + 1) } : h)) };
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
  protected merge(remote: { progress?: { version: string; loc: Location; percent: number; updated: number; done?: string[] } | null; bookmarks?: Bookmark[]; attempts?: Attempt[]; highlights?: Highlight[] }) {
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
    if (remote.highlights?.length) {
      const byId = new Map(s.highlights.map((h) => [h.id, h]));
      for (const h of remote.highlights) {
        const mine = byId.get(h.id);
        if (!mine) { byId.set(h.id, { ...h, note: h.note ?? '', deleted: h.deleted ?? null }); continue; }
        // The anchor never changes; colour and note follow the newest edit; a deletion is never undone.
        const newer = h.updated > mine.updated ? h : mine;
        byId.set(h.id, { ...mine, colour: newer.colour, note: newer.note ?? '', updated: Math.max(h.updated, mine.updated), deleted: mine.deleted ?? h.deleted ?? null });
      }
      s.highlights = [...byId.values()].sort((a, b) => a.created - b.created);
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
        if (m) { const s = read<BookState>(m[0]); if (s) out[m[1]] = restore(s.version, s); }
      }
    } catch { /* storage blocked: no row */ }
    return out;
  }

  static prefs(): ReaderPrefs { return { ...DEFAULT_PREFS, ...(read<ReaderPrefs>(PREFS) ?? {}) }; }
  static setPrefs(p: ReaderPrefs) { write(PREFS, p); }
}
