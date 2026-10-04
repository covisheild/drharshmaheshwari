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
  const u = new URL(String(url), 'http://x');
  const path = u.pathname;
  const method = init.method ?? 'GET';
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const now = () => server.clock ?? Date.now();
  if (path === '/api/me') return reply({ enabled: true, user: server.user });
  if (!server.user) return reply({ error: 'signed out' }, 401);
  const log = (extra = {}) => server.requests.push({ method, path, since: u.searchParams.get('since'), keepalive: !!init.keepalive, ...extra });
  if (method === 'POST' && server.fail > 0) { server.fail--; log({ failed: true }); return reply({ error: 'down' }, 500); }
  if (path.startsWith('/api/books/')) {
    if (method === 'GET') {
      const since = Number(u.searchParams.get('since')) || 0;
      const hl = since ? server.highlights.filter((h) => (h.received ?? 0) > since) : server.highlights;
      log({ highlightsReturned: hl.length });
      return reply({ now: now(), progress: server.progress, bookmarks: server.bookmarks, highlights: hl });
    }
    const b = JSON.parse(init.body);
    log({ bookmarks: b.bookmarks?.length ?? 0, progress: !!b.progress, highlights: b.highlights?.length ?? 0 });
    for (const h of b.highlights ?? []) {
      const i = server.highlights.findIndex((x) => x.id === h.id);
      if (i < 0) server.highlights.push({ ...h, received: now() });
      else { const o = server.highlights[i]; server.highlights[i] = { ...o, colour: h.updated > o.updated ? h.colour : o.colour, note: h.updated > o.updated ? h.note : o.note, updated: Math.max(h.updated, o.updated), deleted: o.deleted ?? h.deleted ?? null, received: now() }; }
    }
    if (b.progress && (!server.progress || b.progress.updated > server.progress.updated)) server.progress = b.progress;
    for (const m of b.bookmarks ?? []) { const i = server.bookmarks.findIndex((x) => x.id === m.id); if (i < 0) server.bookmarks.push(m); else server.bookmarks[i] = { ...server.bookmarks[i], deleted: server.bookmarks[i].deleted ?? m.deleted }; }
    return reply({ ok: true });
  }
  if (path.startsWith('/api/progress/')) {
    if (method === 'GET') {
      const since = Number(u.searchParams.get('since')) || 0;
      const rows = since ? server.attempts.filter((a) => (a.received ?? 0) > since) : server.attempts;
      log({ returned: rows.length });
      return reply({ attempts: rows, prefs: null, now: now(), next: now() });
    }
    const sent = JSON.parse(init.body).attempts;
    log({ attempts: sent.length });
    for (const a of sent) if (!server.attempts.some((x) => x.id === a.id)) server.attempts.push({ ...a, received: now() });
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
// Real waits are 10 s / 30 s / 60 s; tests use milliseconds.
const REAL = { ...SyncedBookStore.timing };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  clear();
  SyncedBookStore.timing = { quiet: 20, max: 60, place: 80, resync: 0 };
  server = { user: signedOut ? null : { name: 'Dr A', email: 'a@example.org', picture: null }, progress: null, bookmarks: [], highlights: [], attempts: [], requests: [], fail: 0, clock: undefined };
});

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

  // After sync, changes upload together a moment after the last one.
  s.addBookmark({ loc: loc('b0-r0-c06'), label: 'A6', snippet: 'new' });
  s.setPractice('b0-r0-c06-p1', { mark: 'missed' });
  await wait(60);
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

// ---------------------------------------------------------------- delta sync and batched upload (3 Oct 2026)

const mark = (n) => ({ loc: loc('b0-r0-c05', n), label: 'A5', snippet: `m${n}` });
const uploads = () => server.requests.filter((r) => r.method === 'POST');

test('changes are uploaded together after a quiet moment, not one request each', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  server.requests.length = 0;
  for (let i = 0; i < 5; i++) { s.addBookmark(mark(i)); s.setPractice(`b0-r0-c05-p${i}`, { mark: 'got' }); }
  await wait(5);
  assert.equal(uploads().length, 0, 'nothing is sent while changes keep coming');
  await wait(60);
  assert.deepEqual(uploads().map((r) => [r.path, r.bookmarks ?? r.attempts]), [['/api/books/b0', 5], ['/api/progress/book-b0', 5]], 'one request for the bookmarks, one for the marks');
  assert.equal(s.get().out.bookmarks.length + s.get().out.attempts.length, 0, 'the outbox is empty after');
  assert.equal(server.bookmarks.length, 5);
});

test('a change made again and again is still uploaded within the maximum wait', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  server.requests.length = 0;
  const end = Date.now() + 120;
  let i = 0;
  while (Date.now() < end) { s.addBookmark(mark(i++)); await wait(8); } // quieter than `quiet` never happens
  assert.ok(uploads().length >= 1, 'it did not wait for ever');
  await wait(80); // let the last batch go, so it cannot land in the next test
});

test('the reading place alone is not sent every time it moves', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  server.requests.length = 0;
  for (let i = 0; i < 6; i++) { s.setLocation(loc('b0-r0-c05', i), 0.1); await wait(5); }
  assert.equal(uploads().length, 0, 'scrolling sends nothing at first');
  await wait(100);
  assert.equal(uploads().length, 1, 'then the latest place once');
  assert.equal(server.progress.loc.p, 5);
});

test('the second visit downloads only what is new since the first', { skip: signedOut }, async () => {
  const old = (id, received) => ({ id, trainer: 'book-b0', version: '1.2', item: `b0-r0-c0${id}-p1`, set: 'b0-r0-c0' + id, activity: 'practice', parts: [], correct: true, t: received, received });
  const base = 1_800_000_000_000;
  server.clock = base;
  server.attempts = [old('1', base - 3_600_000), old('2', base - 3_000_000), old('3', base - 2_400_000)];
  const first = new SyncedBookStore('B0', '1.2');
  await first.ready();
  assert.equal(first.get().attempts.length, 3, 'a first visit downloads everything');
  assert.equal(server.requests.find((r) => r.path === '/api/progress/book-b0').since, null);
  assert.ok(first.get().since > 0, 'and remembers how far it has got');

  server.clock = base + 600_000;
  server.attempts.push(old('4', server.clock)); // another device answers one more
  server.requests.length = 0;
  const second = new SyncedBookStore('B0', '1.2'); // the next page load
  await second.ready();
  const get = server.requests.find((r) => r.method === 'GET' && r.path === '/api/progress/book-b0');
  assert.ok(Number(get.since) > 0, 'it asks for a delta');
  assert.equal(get.returned, 1, 'and gets only the one new answer, not all four');
  assert.deepEqual(second.get().attempts.map((a) => a.id).sort(), ['1', '2', '3', '4'], 'which joins the others');
  assert.equal(second.get().practice['b0-r0-c04-p1'].mark, 'got');
});

test('a change before the account is known makes the next sync a full one', { skip: signedOut }, async () => {
  const base = 1_800_000_000_000;
  server.clock = base;
  const first = new SyncedBookStore('B0', '1.2');
  await first.ready();
  assert.ok(first.get().since);
  server.requests.length = 0;
  const next = new SyncedBookStore('B0', '1.2');
  next.addBookmark(mark(1)); // before /api/me has answered: no outbox exists yet, so nothing may trust the cursor
  await next.ready();
  assert.equal(server.requests.find((r) => r.method === 'GET').since, null, 'full download, not a delta');
  assert.ok(server.bookmarks.some((b) => b.snippet === 'm1'), 'and the bookmark reached the account');
});

test('when the network fails the changes stay queued and go next time', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  server.fail = 1;
  s.addBookmark(mark(1));
  s.setPractice('b0-r0-c05-p1', { mark: 'missed' });
  assert.equal(await s.flush(), false);
  assert.equal(s.state_, 'offline');
  assert.equal(s.get().out.bookmarks.length, 1, 'the bookmark is still queued');
  assert.equal(server.bookmarks.length, 0);
  assert.equal(await s.flush(), true);
  assert.equal(s.state_, 'synced');
  assert.equal(server.bookmarks.length, 1);
  assert.equal(server.attempts.length, 1);
  assert.equal(s.get().out.bookmarks.length + s.get().out.attempts.length, 0);
});

test('closing the tab sends a small first part, the rest follows on the next visit', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  for (let i = 0; i < 100; i++) s.setPractice(`b0-r0-c05-p${i}`, { mark: 'got' });
  server.requests.length = 0;
  await s.flush(true);
  const sent = uploads().find((r) => r.path === '/api/progress/book-b0');
  assert.ok(sent.keepalive, 'sent so that the browser lets it finish');
  assert.equal(sent.attempts, 60, 'at most what fits a keepalive request');
  assert.equal(s.get().out.attempts.length, 40, 'forty are still queued');
  await s.flush();
  assert.equal(server.attempts.length, 100);
});

test('timing defaults are 10 s quiet, 30 s at most, a place at most once a minute', () => {
  assert.deepEqual({ quiet: REAL.quiet, max: REAL.max, place: REAL.place }, { quiet: 10_000, max: 30_000, place: 60_000 });
});

// ---------------------------------------------------------------- highlights and notes

const hl = (extra = {}) => ({ sec: 'b0-r0-c05', start: 10, end: 30, para: 2, quote: 'a ratio compares two', before: 'Remember: ', after: ' quantities', text: 'a ratio compares two', colour: 0, ...extra });

test('a deleted highlight is kept as deleted and only live ones are listed; an edit moves its time on', () => {
  const s = new BookProgressStore('B0', '1.2');
  const h = s.addHighlight(hl());
  assert.equal(h.note, '');
  const t0 = h.updated;
  const e = s.updateHighlight(h.id, { colour: 2, note: 'check this' });
  assert.deepEqual([e.colour, e.note], [2, 'check this']);
  assert.ok(e.updated > t0, 'every edit has a later time, even within the same millisecond');
  s.removeHighlight(h.id);
  assert.equal(s.highlights().length, 0);
  assert.ok(s.get().highlights[0].deleted > 0);
  assert.equal(s.updateHighlight(h.id, { note: 'too late' }), null, 'a deleted highlight is not edited');
});

test('highlights from another device merge: newest edit wins, a deletion is never undone, the anchor stays', { skip: signedOut }, async () => {
  const mine = new BookProgressStore('B0', '1.2');
  const a = mine.addHighlight(hl({ colour: 0 }));
  const b = mine.addHighlight(hl({ start: 40, end: 60, quote: 'other words here ok' }));
  server.highlights = [
    { ...a, colour: 3, note: 'from the phone', updated: a.updated + 5000, deleted: null, received: 1 },
    { ...b, deleted: Date.now(), updated: b.updated + 10, received: 1 },
    { id: 'theirs', sec: 'b0-r0-c06', start: 0, end: 5, para: 0, quote: 'Their', before: '', after: ' text', text: 'Their', colour: 1, note: '', version: '1.2', created: 5, updated: 5, deleted: null, received: 1 },
  ];
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  const by = Object.fromEntries(s.get().highlights.map((h) => [h.id, h]));
  assert.deepEqual([by[a.id].colour, by[a.id].note], [3, 'from the phone'], 'the newer edit from the other device wins');
  assert.equal(by[a.id].quote, 'a ratio compares two', 'the anchor is untouched');
  assert.ok(by[b.id].deleted, 'deleted elsewhere stays deleted here');
  assert.ok(by.theirs, 'their highlight arrives');
  assert.deepEqual(s.highlights().map((h) => h.id).sort(), [a.id, 'theirs'].sort());
});

test('highlights are uploaded in the batch, edits and deletions too, and the second visit downloads only new ones', { skip: signedOut }, async () => {
  const base = 1_800_000_000_000;
  server.clock = base;
  const first = new SyncedBookStore('B0', '1.2');
  await first.ready();
  server.requests.length = 0;
  const x = first.addHighlight(hl());
  first.addHighlight(hl({ start: 50, end: 70, quote: 'second highlight text' }));
  first.updateHighlight(x.id, { note: 'typed slowly' });
  first.updateHighlight(x.id, { note: 'typed slowly, then more' });
  await wait(70);
  assert.deepEqual(uploads().map((r) => [r.path, r.highlights]), [['/api/books/b0', 2]], 'one request holds both (the edits are one entry)');
  assert.equal(server.highlights.find((h) => h.id === x.id).note, 'typed slowly, then more');
  first.removeHighlight(x.id);
  await first.flush();
  assert.ok(server.highlights.find((h) => h.id === x.id).deleted, 'the deletion reached the account');

  server.clock = base + 300_000;
  await first.sync(); // a later visit: the cursor moves on, past everything uploaded so far
  server.clock = base + 600_000;
  server.highlights.push({ id: 'phone1', sec: 'b0-r0-c06', start: 0, end: 5, para: 0, quote: 'Their', before: '', after: '', text: 'Their', colour: 1, note: 'n', version: '1.2', created: 5, updated: 5, deleted: null, received: server.clock });
  server.requests.length = 0;
  const second = new SyncedBookStore('B0', '1.2');
  await second.ready();
  const get = server.requests.find((r) => r.method === 'GET' && r.path === '/api/books/b0');
  assert.ok(Number(get.since) > 0);
  assert.equal(get.highlightsReturned, 1, 'only the one new highlight is downloaded');
  assert.ok(second.highlights().some((h) => h.id === 'phone1'));
});

test('highlights made while the account was not known are found by the first full comparison', { skip: signedOut }, async () => {
  const s0 = new SyncedBookStore('B0', '1.2');
  await s0.ready();
  const s = new SyncedBookStore('B0', '1.2');
  s.addHighlight(hl({ quote: 'made too early to notice' })); // before /api/me answered
  await s.ready();
  assert.ok(server.highlights.some((h) => h.quote === 'made too early to notice'));
});

test('closing the tab sends only as many highlights as a keepalive request can hold', { skip: signedOut }, async () => {
  const s = new SyncedBookStore('B0', '1.2');
  await s.ready();
  for (let i = 0; i < 12; i++) s.addHighlight(hl({ start: i * 40, end: i * 40 + 20, quote: `highlight number ${i} text` }));
  server.requests.length = 0;
  await s.flush(true);
  assert.equal(uploads().find((r) => r.path === '/api/books/b0').highlights, 5, 'five at most (about 6 KB each at the limit, 64 KB in all)');
  assert.equal(s.get().out.highlights.length, 7);
  await s.flush();
  assert.equal(server.highlights.length, 12);
});
