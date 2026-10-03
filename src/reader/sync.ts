// SyncedBookStore: BookProgressStore plus an account copy, the way SyncedProgressStore works for trainers.
//
// The browser copy is always what the page reads, so reading stays instant and works offline. When someone
// is signed in, the account copy is brought in and changes are sent back, in a way that keeps the free Cloudflare
// plan (5 million D1 rows read and 100,000 Worker requests a day) far out of reach:
//
//  * Delta download. The first time (or after a sign-in on a new browser) everything is downloaded and compared.
//    After that each page load asks only "what is new since <server time>" (`since`, kept in the browser copy), so
//    a normal open reads almost no rows. The cursor is kept two minutes behind the server's clock, so a change
//    that was still being saved when we asked is picked up next time; merging the same thing twice is harmless.
//  * Batched upload. Every change is saved in the browser at once and noted in an outbox (`out`). The outbox is
//    sent after SyncedBookStore.timing.quiet ms without a change (at most `max` after the first), together, and
//    straight away when the tab is hidden or closed. Reading position alone is sent at most every `place` ms:
//    a place is worth little, and scrolling would otherwise cost a request every few seconds.
//  * A change made while signed out (or after the session expired) is in no outbox, so the cursor is dropped and
//    the next sign-in does a full comparison instead of trusting it.
//
// If the account holds a newer place in another section than this browser had, `onElsewhere` is called
// once with it, so the reader can ask "You reached C9 on another device. Jump there?".

import { account, claimLocalProgress } from '../trainers/core/account';
import type { Attempt } from '../trainers/core/progress';
import { BookProgressStore, type Bookmark, type Highlight, type PracticeMark } from './store';
import type { Location } from './types';

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline';
interface RemoteBook {
  now?: number;
  progress: { version: string; loc: Location; percent: number; updated: number; done: string[] } | null;
  bookmarks: Bookmark[];
  /** Delta: only those that arrived after `since`; without `since`, all. */
  highlights?: Highlight[];
}
interface RemoteAttempts { attempts: Attempt[]; now?: number; next?: number }

/** The cursor stays this far behind the server's clock (ms). */
const OVERLAP = 120_000;
const union = (a: string[], b: string[]) => (b.length ? [...new Set([...a, ...b])] : a);

export class SyncedBookStore extends BookProgressStore {
  /** Milliseconds. Tests shorten these. */
  static timing = { quiet: 10_000, max: 30_000, place: 60_000, resync: 60_000 };

  state_: SyncState = 'off';
  signedIn = false;
  private started: Promise<void>;
  private elsewhere: ((loc: Location, updated: number) => void) | null = null;
  private pending: Location | null = null;
  private quietTimer = 0;
  private placeTimer = 0;
  private firstChange = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private syncing: Promise<void> | null = null;
  private lastSync = 0;

  constructor(book: string, version: string) {
    super(book, version);
    this.started = typeof window === 'undefined' ? Promise.resolve() : this.start();
  }

  ready() { return this.started; }
  get slug() { return this.book.toLowerCase(); }

  /** Called once if the account's place is newer and in another section; also replays a place found earlier. */
  onElsewhere(fn: (loc: Location, updated: number) => void) {
    this.elsewhere = fn;
    if (this.pending) { fn(this.pending, this.get().updated); this.pending = null; }
  }

  override setLocation(loc: Location, percent: number) {
    super.setLocation(loc, percent);
    this.track({ progress: true }, 'place');
  }

  override markDone(section: string) {
    const had = this.get().done.includes(section);
    super.markDone(section);
    if (!had && this.get().loc) this.track({ progress: true }, 'place');
  }

  override addBookmark(b: Omit<Bookmark, 'id' | 'created'>) {
    const full = super.addBookmark(b);
    this.track({ bookmark: full.id });
    return full;
  }

  override removeBookmark(id: string) {
    super.removeBookmark(id);
    if (this.get().bookmarks.some((x) => x.id === id)) this.track({ bookmark: id });
  }

  override addHighlight(h: Parameters<BookProgressStore['addHighlight']>[0]) {
    const full = super.addHighlight(h);
    this.track({ highlight: full.id });
    return full;
  }

  override updateHighlight(id: string, patch: { colour?: number; note?: string }) {
    const out = super.updateHighlight(id, patch);
    if (out) this.track({ highlight: id });
    return out;
  }

  override removeHighlight(id: string) {
    super.removeHighlight(id);
    if (this.get().highlights.some((x) => x.id === id)) this.track({ highlight: id });
  }

  override setPractice(id: string, mark: Omit<PracticeMark, 't'> & { t?: number }, activity: 'practice' | 'review' = 'practice') {
    const a = super.setPractice(id, mark, activity);
    this.track({ attempt: a.id });
    return a;
  }

  private progressBody() {
    const s = this.get();
    return s.loc ? { version: this.version, loc: s.loc, percent: s.percent, updated: s.updated || Date.now(), done: s.done } : undefined;
  }

  private setState(st: SyncState) { this.state_ = st; this.save(); }

  // ---------------------------------------------------------------- noting and scheduling changes
  /** Notes a change in the outbox and schedules its upload. */
  protected track(what: { progress?: true; bookmark?: string; attempt?: string; highlight?: string }, when: 'now' | 'place' = 'now') {
    if (!this.signedIn) {
      // Nothing will upload this one, so the cursor can no longer be trusted: the next sign-in compares everything.
      if ((what.bookmark || what.attempt || what.highlight) && this.get().since) this.setSince(undefined);
      return;
    }
    this.setOut((o) => ({
      progress: o.progress || !!what.progress,
      bookmarks: what.bookmark ? union(o.bookmarks, [what.bookmark]) : o.bookmarks,
      attempts: what.attempt ? union(o.attempts, [what.attempt]) : o.attempts,
      highlights: what.highlight ? union(o.highlights, [what.highlight]) : o.highlights,
    }));
    this.schedule(when);
  }

  private schedule(when: 'now' | 'place') {
    if (typeof window === 'undefined') return;
    const T = SyncedBookStore.timing;
    if (when === 'place') {
      // A place alone waits for the next scheduled upload; it never makes one more frequent than `place`.
      if (!this.quietTimer && !this.placeTimer) this.placeTimer = window.setTimeout(() => { this.placeTimer = 0; void this.flush(); }, T.place);
      return;
    }
    // Something worth keeping: upload after `quiet` ms of calm, but never later than `max` ms after the first change.
    // The place rides along, so its own timer is not needed.
    clearTimeout(this.placeTimer); this.placeTimer = 0;
    const now = Date.now();
    this.firstChange ||= now;
    clearTimeout(this.quietTimer);
    this.quietTimer = window.setTimeout(() => { this.quietTimer = 0; void this.flush(); }, Math.max(0, Math.min(T.quiet, this.firstChange + T.max - now)));
  }

  private clearTimers() {
    clearTimeout(this.quietTimer); clearTimeout(this.placeTimer);
    this.quietTimer = this.placeTimer = this.firstChange = 0;
  }

  // ---------------------------------------------------------------- upload
  /** Sends the outbox now. `keepalive` (tab hidden or closing): only a small first part, which the browser lets finish. */
  flush(keepalive = false): Promise<boolean> {
    this.clearTimers();
    const run = this.chain.then(() => this.send(keepalive));
    this.chain = run.catch(() => {});
    return run;
  }

  private async post(url: string, body: unknown, keepalive: boolean) {
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive });
      if (r.status === 401) { this.signedIn = false; this.setState('off'); return false; }
      return r.ok;
    } catch { return false; }
  }

  private async send(keepalive: boolean): Promise<boolean> {
    for (let round = 0; this.signedIn && round < 100; round++) {
      const s = this.get();
      const out = s.out;
      if (!out.progress && !out.bookmarks.length && !out.attempts.length && !out.highlights.length) { if (this.state_ !== 'synced') this.setState('synced'); return true; }
      const takeMarks = out.bookmarks.slice(0, keepalive ? 40 : 200);
      const takeHighlights = out.highlights.slice(0, keepalive ? 20 : 100);
      const takeAttempts = new Set(out.attempts.slice(0, keepalive ? 60 : 1000));
      const marks = s.bookmarks.filter((b) => takeMarks.includes(b.id));
      const highlights = s.highlights.filter((h) => takeHighlights.includes(h.id));
      const attempts = s.attempts.filter((a) => takeAttempts.has(a.id));
      const progress = out.progress ? this.progressBody() : undefined;
      // Taken out of the outbox before sending: a change made while this request is in flight stays queued; on failure it all goes back.
      this.setOut((o) => ({
        progress: false,
        bookmarks: o.bookmarks.filter((id) => !takeMarks.includes(id)),
        highlights: o.highlights.filter((id) => !takeHighlights.includes(id)),
        attempts: o.attempts.filter((id) => !takeAttempts.has(id)),
      }));
      const putBack = () => this.setOut((o) => ({ progress: o.progress || out.progress, bookmarks: union(o.bookmarks, takeMarks), highlights: union(o.highlights, takeHighlights), attempts: union(o.attempts, [...takeAttempts]) }));
      let ok = true;
      if (progress || marks.length || highlights.length) {
        ok = await this.post(`/api/books/${this.slug}`, { progress, bookmarks: marks.length ? marks : undefined, highlights: highlights.length ? highlights : undefined }, keepalive);
      }
      if (ok && attempts.length) ok = await this.post(`/api/progress/${this.trainer}`, { attempts }, keepalive);
      if (!ok) { putBack(); if (this.signedIn) this.setState('offline'); return false; }
      if (keepalive) break; // the rest goes with the next load
    }
    return true;
  }

  // ---------------------------------------------------------------- download
  /** Downloads what the account has that this browser lacks, merges it in, then sends what the account lacks. Safe to run again. */
  sync(): Promise<void> {
    this.syncing ??= this.download().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async download() {
    this.setState('syncing');
    try {
      const since = this.get().since;
      const q = since ? `?since=${since}` : '';
      const opts = { credentials: 'same-origin' as const, headers: { accept: 'application/json' } };
      const [rb, ra] = await Promise.all([fetch(`/api/books/${this.slug}${q}`, opts), fetch(`/api/progress/${this.trainer}${q}`, opts)]);
      if (rb.status === 401) { this.signedIn = false; this.setState('off'); return; }
      if (!rb.ok || !ra.ok) throw new Error('download');
      const remote = (await rb.json()) as RemoteBook;
      const remoteAttempts = (await ra.json()) as RemoteAttempts;
      const before = this.get();
      const p = remote.progress;
      if (p && p.updated > before.updated && before.loc && p.loc.s !== before.loc.s) {
        // Somewhere else is further on (or elsewhere): ask, rather than move the page under the reader.
        if (this.elsewhere) this.elsewhere(p.loc, p.updated); else this.pending = p.loc;
      }
      // A first, full download holds everything, so what is missing on the other side can be worked out. A delta holds
      // only the new, so it cannot; there the outbox says what the account lacks.
      let lacking: { marks: string[]; attempts: string[]; highlights: string[] } | null = null;
      if (!since) {
        const onServer = new Set(remoteAttempts.attempts.map((a) => a.id));
        const serverMarks = new Map(remote.bookmarks.map((b) => [b.id, b]));
        const serverHighlights = new Map((remote.highlights ?? []).map((h) => [h.id, h]));
        lacking = {
          highlights: before.highlights.filter((h) => { const r = serverHighlights.get(h.id); return !r || r.updated < h.updated || (h.deleted && !r.deleted); }).map((h) => h.id),
          attempts: before.attempts.filter((a) => !onServer.has(a.id)).map((a) => a.id),
          marks: before.bookmarks.filter((b) => !serverMarks.has(b.id) || (b.deleted && !serverMarks.get(b.id)!.deleted)).map((b) => b.id),
        };
      }
      // A newer place from another device is not applied to the page here; the reader decides (onElsewhere).
      // The stored place does take the newer one, so the series page and the next visit agree.
      this.merge({ progress: p, bookmarks: remote.bookmarks, attempts: remoteAttempts.attempts, highlights: remote.highlights });
      if (lacking) this.setOut((o) => ({ progress: true, bookmarks: union(o.bookmarks, lacking!.marks), highlights: union(o.highlights, lacking!.highlights), attempts: union(o.attempts, lacking!.attempts) }));
      const upTo = Math.min(remote.now ?? NaN, remoteAttempts.next ?? remoteAttempts.now ?? NaN);
      if (Number.isFinite(upTo)) this.setSince(Math.max(1, upTo - OVERLAP));
      this.lastSync = Date.now();
      await this.flush(); // sets 'synced', or 'offline' with everything still queued
    } catch { this.setState('offline'); }
  }

  private async start() {
    const a = await account();
    if (!a.enabled || !a.user) return;
    // On a shared computer, another person's reading in this browser is cleared, never merged into this account.
    claimLocalProgress(a.user.email);
    this.reload();
    this.signedIn = true;
    this.watch();
    await this.sync();
  }

  /** Upload when the tab is hidden or closed; catch up when it comes back or the network does. */
  private watch() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush(true);
      else if (this.signedIn && Date.now() - this.lastSync > SyncedBookStore.timing.resync) void this.sync();
    });
    addEventListener('pagehide', () => { void this.flush(true); });
    addEventListener('online', () => { if (this.state_ === 'offline') void this.sync(); });
  }
}
