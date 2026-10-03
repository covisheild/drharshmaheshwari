// SyncedBookStore: BookProgressStore plus an account copy, the way SyncedProgressStore works for trainers.
//
// The browser copy is always what the page reads, so reading stays instant and works offline. When someone
// is signed in, each page load downloads the account copy (place, bookmarks, sections read, practice marks),
// merges it in and uploads whatever the account lacks; after that each change uploads in the background.
// Signed out, or with accounts switched off, it is exactly BookProgressStore.
//
// If the account holds a newer place in another section than this browser had, `onElsewhere` is called
// once with it, so the reader can ask "You reached C9 on another device. Jump there?".

import { account, claimLocalProgress } from '../trainers/core/account';
import type { Attempt } from '../trainers/core/progress';
import { BookProgressStore, type Bookmark, type PracticeMark } from './store';
import type { Location } from './types';

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline';
interface Remote {
  progress: { version: string; loc: Location; percent: number; updated: number; done: string[] } | null;
  bookmarks: Bookmark[];
}

export class SyncedBookStore extends BookProgressStore {
  state_: SyncState = 'off';
  signedIn = false;
  private started: Promise<void>;
  private elsewhere: ((loc: Location, updated: number) => void) | null = null;
  private pending: Location | null = null;

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
    if (this.signedIn) void this.upload({ progress: this.progressBody() });
  }

  override markDone(section: string) {
    const had = this.get().done.includes(section);
    super.markDone(section);
    if (!had && this.signedIn && this.get().loc) void this.upload({ progress: this.progressBody() });
  }

  override addBookmark(b: Omit<Bookmark, 'id' | 'created'>) {
    const full = super.addBookmark(b);
    if (this.signedIn) void this.upload({ bookmarks: [full] });
    return full;
  }

  override removeBookmark(id: string) {
    super.removeBookmark(id);
    const b = this.get().bookmarks.find((x) => x.id === id);
    if (b && this.signedIn) void this.upload({ bookmarks: [b] });
  }

  override setPractice(id: string, mark: Omit<PracticeMark, 't'> & { t?: number }, activity: 'practice' | 'review' = 'practice') {
    const a = super.setPractice(id, mark, activity);
    if (this.signedIn) void this.uploadAttempts([a]);
    return a;
  }

  private progressBody() {
    const s = this.get();
    return s.loc ? { version: this.version, loc: s.loc, percent: s.percent, updated: s.updated || Date.now(), done: s.done } : undefined;
  }

  private setState(st: SyncState) { this.state_ = st; this.save(); }

  private async upload(body: { progress?: unknown; bookmarks?: Bookmark[] }) {
    if (body.progress === undefined && !body.bookmarks?.length) return true;
    try {
      const r = await fetch(`/api/books/${this.slug}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      return true;
    } catch { this.setState('offline'); return false; }
  }

  private async uploadAttempts(attempts: Attempt[]) {
    for (let i = 0; i < attempts.length; i += 1000) {
      try {
        const r = await fetch(`/api/progress/${this.trainer}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attempts: attempts.slice(i, i + 1000) }) });
        if (!r.ok) throw new Error(String(r.status));
      } catch { this.setState('offline'); return false; }
    }
    return true;
  }

  /** Downloads the account copy, merges it in, uploads what the account lacks. Safe to run again. */
  async sync() {
    this.setState('syncing');
    try {
      const opts = { credentials: 'same-origin' as const, headers: { accept: 'application/json' } };
      const [rb, ra] = await Promise.all([fetch(`/api/books/${this.slug}`, opts), fetch(`/api/progress/${this.trainer}`, opts)]);
      if (rb.status === 401) { this.signedIn = false; this.setState('off'); return; }
      if (!rb.ok || !ra.ok) throw new Error('download');
      const remote = (await rb.json()) as Remote;
      const remoteAttempts = ((await ra.json()) as { attempts: Attempt[] }).attempts;
      const before = this.get();
      const p = remote.progress;
      if (p && p.updated > before.updated && before.loc && p.loc.s !== before.loc.s) {
        // Somewhere else is further on (or elsewhere): ask, rather than move the page under the reader.
        if (this.elsewhere) this.elsewhere(p.loc, p.updated); else this.pending = p.loc;
      }
      const onServer = new Set(remoteAttempts.map((a) => a.id));
      const missingAttempts = before.attempts.filter((a) => !onServer.has(a.id));
      const serverMarks = new Map(remote.bookmarks.map((b) => [b.id, b]));
      const missingMarks = before.bookmarks.filter((b) => !serverMarks.has(b.id) || (b.deleted && !serverMarks.get(b.id)!.deleted));
      // A newer place from another device is not applied to the page here; the reader decides (onElsewhere).
      // The stored place does take the newer one, so the series page and the next visit agree.
      this.merge({ progress: p, bookmarks: remote.bookmarks, attempts: remoteAttempts });
      const ok = (await this.upload({ progress: this.progressBody(), bookmarks: missingMarks })) && (await this.uploadAttempts(missingAttempts));
      this.setState(ok ? 'synced' : 'offline');
    } catch { this.setState('offline'); }
  }

  private async start() {
    const a = await account();
    if (!a.enabled || !a.user) return;
    // On a shared computer, another person's reading in this browser is cleared, never merged into this account.
    claimLocalProgress(a.user.email);
    this.reload();
    this.signedIn = true;
    await this.sync();
    addEventListener('online', () => { if (this.state_ === 'offline') void this.sync(); });
  }
}
