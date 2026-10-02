// Progress storage for every trainer, behind one interface.
//
// The trainer UI only ever talks to a ProgressStore. Today that is LocalProgressStore (this browser's
// localStorage). When accounts arrive, a SyncedProgressStore will implement the same interface: it keeps
// this local copy as its cache (so the UI stays instant and works offline) and uploads new attempts in
// the background. Attempts carry an id made in the browser, so uploading one twice never counts it twice.
// Nothing in the UI changes when that happens.

export type Activity = 'quiz' | 'practice' | 'review';

export interface Attempt {
  id: string;            // unique, made in the browser
  trainer: string;       // e.g. 'auscultation'
  version: string;       // content version the item came from, e.g. 'hls-cmds-v2'
  item: string;
  set: string;           // the level or practice set it was asked in
  activity: Activity;
  parts: { answer: string; chosen: string }[];
  correct: boolean;
  ms?: number;           // time to answer
  t: number;             // when, ms since epoch
}

export interface Prefs { unlockAll: boolean }

export interface ProgressStore {
  readonly trainer: string;
  /** Resolves once the store has its data (immediate for local; after the first download when synced). */
  ready(): Promise<void>;
  /** All attempts, oldest first. A snapshot: callers must not mutate it. */
  attempts(): readonly Attempt[];
  record(a: Omit<Attempt, 'id' | 't' | 'trainer'>): Attempt;
  prefs(): Prefs;
  setPrefs(p: Partial<Prefs>): void;
  reset(): void;
  /** Called after every change, including changes made in another tab. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

const KEEP = 5000; // most recent attempts kept on the device
const DEFAULT_PREFS: Prefs = { unlockAll: false };

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface Saved { v: 2; attempts: Attempt[]; prefs: Prefs }

/** Progress kept in this browser only. Storage can be blocked (private mode, cleared site data); the
 *  trainer still works then, it just forgets when the page closes. */
export class LocalProgressStore implements ProgressStore {
  private data: Saved;
  private listeners = new Set<() => void>();
  private readonly key: string;

  constructor(readonly trainer: string, private readonly version: string) {
    this.key = `trainer:${trainer}:v2`;
    this.data = this.read();
    if (typeof window !== 'undefined') {
      addEventListener('storage', (e) => {
        if (e.key !== this.key) return;
        this.data = this.read();
        this.emit();
      });
    }
  }

  ready() { return Promise.resolve(); }
  attempts() { return this.data.attempts; }
  prefs() { return this.data.prefs; }

  record(a: Omit<Attempt, 'id' | 't' | 'trainer'>): Attempt {
    const full: Attempt = { ...a, id: newId(), t: Date.now(), trainer: this.trainer };
    this.data.attempts = [...this.data.attempts, full].slice(-KEEP);
    this.write();
    return full;
  }

  setPrefs(p: Partial<Prefs>) { this.data.prefs = { ...this.data.prefs, ...p }; this.write(); }

  reset() {
    this.data = { v: 2, attempts: [], prefs: { ...DEFAULT_PREFS } };
    this.write();
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  private emit() { for (const fn of this.listeners) fn(); }

  private write() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
    this.emit();
  }

  private read(): Saved {
    const empty: Saved = { v: 2, attempts: [], prefs: { ...DEFAULT_PREFS } };
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? 'null');
      if (saved?.v === 2 && Array.isArray(saved.attempts)) return { ...empty, ...saved, prefs: { ...DEFAULT_PREFS, ...saved.prefs } };
      return this.migrateV1() ?? empty;
    } catch { return empty; }
  }

  /** The first prototype stored { v: 1, answers: [{ level, item, parts, t }], unlockAll } under ':v1'.
   *  Those were all quiz answers. Converted once; the old key is left in place, unused. */
  private migrateV1(): Saved | null {
    try {
      const old = JSON.parse(localStorage.getItem(`trainer:${this.trainer}:v1`) ?? 'null');
      if (old?.v !== 1 || !Array.isArray(old.answers)) return null;
      const attempts: Attempt[] = old.answers.map((a: { level: string; item: string; parts: Attempt['parts']; t: number }) => ({
        id: newId(), trainer: this.trainer, version: this.version, item: a.item, set: a.level, activity: 'quiz' as const,
        parts: a.parts, correct: a.parts.every((p) => p.answer === p.chosen), t: a.t,
      }));
      const saved: Saved = { v: 2, attempts, prefs: { unlockAll: !!old.unlockAll } };
      localStorage.setItem(this.key, JSON.stringify(saved));
      return saved;
    } catch { return null; }
  }
}
