// The book reader's progress store and its account sync (src/reader/store.ts, src/reader/sync.ts), with a
// pretend browser (localStorage, fetch) and a pretend account server. Run by `npm test`.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage keeps its items as own properties, as browsers do (Object.keys(localStorage) lists them).
const mem = new Map();
const ls = {};
for (const [k, fn] of Object.entries({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true }); },
  removeItem: (k) => { mem.delete(k); delete ls[k]; },
  key: (i) => [...mem.keys()][i] ?? null,
})) Object.defineProperty(ls, k, { value: fn, enumerable: false });
Object.defineProperty(ls, 'length', { get: () => mem.size, enumerable: false });
globalThis.localStorage = ls;
const clear = () => { for (const k of [...mem.keys()]) ls.removeItem(k); };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};

let server;
globalThis.fetch = async (url, init = {}) => {
  const path = String(url);
  const method = init.method ?? 'GET';
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/api/me') return reply({ enabled: true, user: server.user });
  if (!server.user) return reply({ error: 'signed out' }, 401);
  if (path.startsWith('/api/books/')) {
    if (method === 'GET') return reply({ progress: server.progress, bookmarks: server.bookmarks });
    const b = JSON.parse(init.body);
    if (b.progress && (!server.progress || b.progress.updated > server.progress.updated)) server.progress = b.progress;
    for (const m of b.bookmarks ?? []) { const i = server.bookmarks.findIndex((x) => x.id === m.id); if (i < 0) server.bookmarks.push(m); else server.bookmarks[i] = { ...server.bookmarks[i], deleted: server.bookmarks[i].deleted ?? m.deleted }; }
    return reply({ ok: true });
  }
  if (path.startsWith('/api/progress/')) {
    if (method === 'GET') return reply({ attempts: server.attempts, prefs: null });
    for (const a of JSON.parse(init.body).attempts) if (!server.attempts.some((x) => x.id === a.id)) server.attempts.push(a);
    return reply({ ok: true });
  }
  return reply({ error: 'not found' }, 404);
};

// /api/me is asked once per page load (account() keeps the answer), so the signed-out case is its own page
// load: SIGNED_OUT=1 in a child run of this file.
const signedOut = process.env.SIGNED_OUT === '1';

const { BookProgressStore } = await import('../src/reader/store.ts');
const { SyncedBookStore } = await import('../src/reader/sync.ts');
const loc = (s, p = 0, f = 0) => ({ s, p, f });

beforeEach(() => { clear(); server = { user: signedOut ? null : { name: 'Dr A', email: 'a@example.org', picture: null }, progress: null, bookmarks: [], attempts: [] }; });

test('marks saved before marks had a history become attempts once', () => {
  mem.set('book:B0:v1', JSON.stringify({ version: '1.2', loc: null, percent: 0, updated: 0, done: [], bookmarks: [], practice: { 'b0-r0-c05-p3': { mark: 'missed', t: 100 } } }));
  const s = new BookProgressStore('B0', '1.2');
  assert.deepEqual(s.get().attempts.map((a) => [a.item, a.set, a.correct, a.t, a.trainer]), [['b0-r0-c05-p3', 'b0-r0-c05', false, 100, 'book-b0']]);
  assert.equal(new BookProgressStore('B0', '1.2').get().attempts.length, 1, 'not adopted twice');
});

test('a deleted bookmark is kept as deleted, and only live ones are shown', () => {
  const s = new BookProgressStore('B0', '1.2');
  const b = s.addBookmark({ loc: loc('b0-r0-c05', 2), label: 'A5', snippet: 'x' });
  s.removeBookmark(b.id);
  assert.equal(s.bookmarks().length, 0);
  assert.ok(s.get().bookmarks[0].deleted > 0);
});

test('signing in merges the account copy both ways and asks before moving to a place reached elsewhere', { skip: signedOut }, async () => {
  // This browser: reading A5, one bookmark, one practice mark.
  const local = new BookProgressStore('B0', '1.2');
  local.setLocation(loc('b0-r0-c05', 1), 0.1);
  const mine = local.addBookmark({ loc: loc('b0-r0-c05', 1), label: 'A5', snippet: 'mine' });
  local.setPractice('b0-r0-c05-p1', { mark: 'got' });
  // The account: further on (C9) from another device, a bookmark of its own, a deletion of ours, a mark of its own.
  server.progress = { version: '1.2', loc: loc('b0-r0-c23', 4, 0.2), percent: 0.4, updated: Date.now() + 1000, done: ['b0-r0-c01', 'b0-r0-c22'] };
  server.bookmarks = [{ id: 'theirs', loc: loc('b0-r0-c23'), label: 'C9', snippet: 'theirs', created: 5, deleted: null }, { ...mine, deleted: 99 }];
  server.attempts = [{ id: 'x1', trainer: 'book-b0', version: '1.2', item: 'b0-r0-c23-p2', set: 'b0-r0-c23', activity: 'practice', parts: [], correct: false, t: 7 }];

  const s = new SyncedBookStore('B0', '1.2');
  const asked = [];
  s.onElsewhere((l) => asked.push(l.s));
  await s.ready();
  assert.equal(s.state_, 'synced');
  assert.deepEqual(asked, ['b0-r0-c23'], 'asked once about the place reached on the other device');
  assert.deepEqual(s.bookmarks().map((b) => b.id), ['theirs'], "the other device's bookmark arrives; ours, deleted there, stays deleted");
  assert.equal(s.get().practice['b0-r0-c23-p2'].mark, 'missed', "the other device's mark arrives");
  assert.ok(s.get().done.includes('b0-r0-c22'), 'sections read elsewhere count as read here');
  assert.ok(server.attempts.some((a) => a.item === 'b0-r0-c05-p1'), 'our mark reached the account');

  // After sync, each change uploads straight away.
  s.addBookmark({ loc: loc('b0-r0-c06'), label: 'A6', snippet: 'new' });
  s.setPractice('b0-r0-c06-p1', { mark: 'missed' });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(server.bookmarks.some((b) => b.label === 'A6'));
  assert.ok(server.attempts.some((a) => a.item === 'b0-r0-c06-p1'));
});

test('another person signing in on this browser never inherits the reading kept here', { skip: signedOut }, async () => {
  mem.set('account:owner', 'someone-else@example.org');
  const local = new BookProgressStore('B0', '1.2');
  local.addBookmark({ loc: loc('b0-r0-c05'), label: 'A5', snippet: 'theirs' });
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  assert.equal(s.bookmarks().length, 0, 'cleared, not merged');
  assert.equal(server.bookmarks.length, 0, 'and nothing of theirs reached this account');
});

test('signed out, nothing is sent anywhere', async (t) => {
  if (!signedOut) {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--import', './tests/ts-hooks.mjs', '--test', '--test-name-pattern=signed out', new URL(import.meta.url).pathname],
      { env: { ...process.env, SIGNED_OUT: '1' }, stdio: 'pipe' });
    return;
  }
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  s.addBookmark({ loc: loc('b0-r0-c05'), label: 'A5', snippet: 'x' });
  s.setPractice('b0-r0-c05-p1', { mark: 'got' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.state_, 'off');
  assert.equal(s.bookmarks().length, 1, 'kept in this browser');
  assert.equal(server.bookmarks.length + server.attempts.length, 0);
});
