// SyncedProgressStore: the same ProgressStore the trainer UI already uses, plus an account copy.
//
// The browser copy (LocalProgressStore) is always what the UI reads, so answering stays instant and works
// offline. When someone is signed in, each page load downloads the account copy, merges it in, and uploads
// whatever the account lacks; each new answer then uploads straight away. Attempt ids make every upload
// safe to repeat. Signed out, or with accounts switched off, it behaves exactly like LocalProgressStore.

import { account, claimLocalProgress } from './account';
import { LocalProgressStore, type Attempt, type Prefs, type ProgressStore } from './progress';

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline';

const BATCH = 1000; // the server's per-request limit

export class SyncedProgressStore implements ProgressStore {
  private local: LocalProgressStore;
  private listeners = new Set<() => void>();
  private signedIn = false;
  private started: Promise<void>;
  state: SyncState = 'off';

  constructor(readonly trainer: string, version: string) {
    this.local = new LocalProgressStore(trainer, version);
    this.local.subscribe(() => this.emit());
    this.started = typeof window === 'undefined' ? Promise.resolve() : this.start();
  }

  ready() { return this.started; }
  attempts() { return this.local.attempts(); }
  prefs() { return this.local.prefs(); }

  record(a: Omit<Attempt, 'id' | 't' | 'trainer'>) {
    const full = this.local.record(a);
    if (this.signedIn) void this.upload([full]);
    return full;
  }

  setPrefs(p: Partial<Prefs>) {
    this.local.setPrefs(p);
    if (this.signedIn) void this.upload([], this.local.prefs());
  }

  reset() {
    if (this.signedIn) {
      // The account copy is deleted first; if that fails, nothing is reset (or it would come back on sync).
      void fetch(`/api/progress/${this.trainer}`, { method: 'DELETE', credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error(); this.local.reset(); })
        .catch(() => { this.setState('offline'); alert('Could not reset: no connection to your account. Please try again.'); });
    } else this.local.reset();
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const fn of this.listeners) fn(); }
  private setState(s: SyncState) { this.state = s; this.emit(); }

  /** Downloads the account copy, merges it in, and uploads what the account lacks. Safe to run again. */
  async sync() {
    this.setState('syncing');
    try {
      const r = await fetch(`/api/progress/${this.trainer}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (r.status === 401) { this.signedIn = false; this.setState('off'); return; }
      if (!r.ok) throw new Error(String(r.status));
      const remote = (await r.json()) as { attempts: Attempt[]; prefs: Prefs | null };
      const onServer = new Set(remote.attempts.map((a) => a.id));
      const missing = this.local.attempts().filter((a) => !onServer.has(a.id));
      // Account preferences win; a first sign-in uploads this browser's.
      const prefsToSend = remote.prefs ? undefined : this.local.prefs();
      this.local.merge(remote.attempts, remote.prefs);
      for (let i = 0; i < missing.length || (i === 0 && prefsToSend); i += BATCH) {
        if (!(await this.upload(missing.slice(i, i + BATCH), i === 0 ? prefsToSend : undefined, false))) throw new Error('upload');
      }
      this.setState('synced');
    } catch { this.setState('offline'); }
  }

  private async start() {
    const a = await account();
    if (!a.enabled || !a.user) return;
    claimLocalProgress(a.user.email);
    this.signedIn = true;
    await this.sync();
    // Back online, or back to this tab: catch up on anything that failed to upload.
    addEventListener('online', () => void this.sync());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.state === 'offline') void this.sync(); });
  }

  private async upload(attempts: Attempt[], prefs?: Prefs, mark = true) {
    try {
      const r = await fetch(`/api/progress/${this.trainer}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(prefs ? { attempts, prefs } : { attempts }),
      });
      if (!r.ok) throw new Error(String(r.status));
      if (mark && this.state !== 'synced') this.setState('synced');
      return true;
    } catch {
      if (mark) this.setState('offline');
      return false;
    }
  }
}
