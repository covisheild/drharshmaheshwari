// TrackerStore: the BP and blood sugar readings of the signed-in account, as the browser sees them (docs/trackers-plan.md).
//
// The trackers need an account, so the account copy is the real one. The browser keeps a copy (`tracker:v1`) so the
// page opens at once and a reading typed with no signal is not lost; it is cleared on sign-out and when another person
// signs in on the same browser (clearLocalProgress / claimLocalProgress). Pages never touch localStorage directly.
//
// Sync follows the book reader, sized for the free Cloudflare plan:
//  * Delta download: after the first full download, each page load asks only for rows received since the cursor
//    (`since`, two minutes behind the server clock, so a change still being saved is picked up next time).
//  * Batched upload: each change is saved here at once and noted in an outbox; the outbox is sent a moment after the
//    last change, and straight away when the tab is hidden or closed. Newest `updated` wins; a deletion sticks.

import type { Person, Reading } from '../lib/trackers';

const KEY = 'tracker:v1';
const OVERLAP = 120_000;

export type SyncState = 'syncing' | 'synced' | 'offline';
interface Copy {
  people: Record<string, Person>;
  readings: Record<string, Reading>;
  since: number;
  /** Outbox: id -> the `updated` that still has to reach the account. */
  out: { people: Record<string, number>; readings: Record<string, number> };
}
const empty = (): Copy => ({ people: {}, readings: {}, since: 0, out: { people: {}, readings: {} } });

/** Short random ids made in the browser, so saving the same reading twice stores it once. */
export const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The newer edit wins; once deleted, always deleted. */
function merge<T extends { updated: number; deleted?: number | null }>(mine: T | undefined, theirs: T): T {
  if (!mine) return theirs;
  const winner = theirs.updated > mine.updated ? theirs : mine;
  const deleted = mine.deleted ?? theirs.deleted ?? null;
  return deleted ? { ...winner, deleted } : winner;
}

export class TrackerStore {
  /** Milliseconds. Tests shorten it. */
  static timing = { quiet: 1500 };
  state: SyncState = 'syncing';
  private copy: Copy;
  private listeners = new Set<() => void>();
  private timer = 0;
  private sending: Promise<void> | null = null;

  constructor() {
    this.copy = this.read();
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(true); });
    addEventListener('pagehide', () => this.flush(true));
  }

  private read(): Copy {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Copy | null;
      if (c && c.people && c.readings && c.out) return c;
    } catch { /* storage unavailable or damaged */ }
    return empty();
  }
  private write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.copy)); } catch { /* full or unavailable: the outbox still goes up while the page is open */ }
    for (const fn of this.listeners) fn();
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private setState(s: SyncState) { if (this.state !== s) { this.state = s; for (const fn of this.listeners) fn(); } }

  // ---------- reading ----------
  people(): Person[] {
    return Object.values(this.copy.people).filter((p) => !p.deleted)
      .sort((a, b) => Number(!!b.self) - Number(!!a.self) || a.created - b.created);
  }
  person(id: string): Person | null { const p = this.copy.people[id]; return p && !p.deleted ? p : null; }
  readings(person: string): Reading[] {
    return Object.values(this.copy.readings).filter((r) => r.person === person && !r.deleted).sort((a, b) => a.at - b.at);
  }
  reading(id: string): Reading | null { const r = this.copy.readings[id]; return r && !r.deleted ? r : null; }
  get unsent() { return Object.keys(this.copy.out.people).length + Object.keys(this.copy.out.readings).length; }

  // ---------- changing ----------
  putPerson(p: Person) {
    this.copy.people[p.id] = { ...p, updated: Math.max(Date.now(), p.updated) };
    this.copy.out.people[p.id] = this.copy.people[p.id].updated;
    this.changed();
  }
  removePerson(id: string) {
    const p = this.copy.people[id];
    if (!p) return;
    const t = Date.now();
    this.copy.people[id] = { ...p, updated: t, deleted: t };
    this.copy.out.people[id] = t;
    for (const r of Object.values(this.copy.readings)) {
      if (r.person === id && !r.deleted) { this.copy.readings[r.id] = { ...r, updated: t, deleted: t }; this.copy.out.readings[r.id] = t; }
    }
    this.changed();
  }
  putReading(r: Reading) {
    this.copy.readings[r.id] = { ...r, updated: Math.max(Date.now(), r.updated) } as Reading;
    this.copy.out.readings[r.id] = this.copy.readings[r.id].updated;
    this.changed();
  }
  removeReading(id: string) {
    const r = this.copy.readings[id];
    if (!r) return;
    const t = Date.now();
    this.copy.readings[id] = { ...r, updated: t, deleted: t } as Reading;
    this.copy.out.readings[id] = t;
    this.changed();
  }
  private changed() {
    this.write();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), TrackerStore.timing.quiet);
  }

  // ---------- sync ----------
  /** Brings in what is new in the account, then sends what this browser has not sent yet. */
  async sync(): Promise<void> {
    this.setState('syncing');
    try {
      for (let guard = 0; guard < 20; guard++) {
        const res = await fetch(`/api/trackers${this.copy.since ? `?since=${this.copy.since}` : ''}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json() as { people: Person[]; readings: Reading[]; now: number; next: number; more: boolean };
        for (const p of body.people) this.copy.people[p.id] = merge(this.copy.people[p.id], p);
        for (const r of body.readings) this.copy.readings[r.id] = merge(this.copy.readings[r.id], r);
        this.copy.since = Math.max(0, (body.more ? body.next : body.now - OVERLAP));
        this.write();
        if (!body.more) break;
      }
      await this.flush();
    } catch {
      this.setState('offline');
    }
  }

  /** Sends the outbox. `leaving`: the page is closing, so the request must outlive it. */
  flush(leaving = false): Promise<void> {
    clearTimeout(this.timer);
    const { out } = this.copy;
    const people = Object.keys(out.people).map((id) => this.copy.people[id]).filter(Boolean);
    const readings = Object.keys(out.readings).map((id) => this.copy.readings[id]).filter(Boolean);
    if (!people.length && !readings.length) { if (this.state !== 'offline') this.setState('synced'); return Promise.resolve(); }
    if (this.sending && !leaving) return this.sending.then(() => this.flush());
    const sent = { people: { ...out.people }, readings: { ...out.readings } };
    const body = JSON.stringify({ people: people.slice(0, 100), readings: readings.slice(0, 400) });
    this.setState('syncing');
    const go = fetch('/api/trackers', { method: 'POST', credentials: 'same-origin', keepalive: leaving && body.length < 60_000, headers: { 'content-type': 'application/json' }, body })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        // Only what was sent and not changed again since leaves the outbox.
        for (const p of people.slice(0, 100)) if (this.copy.out.people[p.id] === sent.people[p.id]) delete this.copy.out.people[p.id];
        for (const r of readings.slice(0, 400)) if (this.copy.out.readings[r.id] === sent.readings[r.id]) delete this.copy.out.readings[r.id];
        this.write();
        this.setState(this.unsent ? 'syncing' : 'synced');
        if (this.unsent) setTimeout(() => this.flush(), 0);
      })
      .catch(() => this.setState('offline'))
      .finally(() => { this.sending = null; });
    this.sending = go;
    return go;
  }
}

// ---------- share links (always online: the server holds them) ----------
export interface Share { id: string; token: string; person: string; scope: { bp: boolean; sugar: boolean; weight: boolean }; created: number; expires: number | null; stopped: number | null; opened: number | null }

const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `error ${res.status}`);
  return data as T;
};
export const listShares = () => api<{ shares: Share[] }>('GET', '/api/trackers/shares').then((r) => r.shares);
export const makeShare = (person: string, scope: Share['scope'], days: 30 | 90 | 0) => api<{ share: Share }>('POST', '/api/trackers/shares', { person, scope, days }).then((r) => r.share);
export const stopShare = (id: string) => api<{ ok: true }>('DELETE', `/api/trackers/shares/${id}`);
export const shareUrl = (s: Share) => `${location.origin}/trackers/view/#${s.token}`;
