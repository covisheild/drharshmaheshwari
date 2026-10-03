// Tests for /api/ (src/server/api.ts) against a real local D1 database (Miniflare, via Wrangler) and a
// fake Google token endpoint. Run with: node --import ./tests/ts-hooks.mjs --test tests/api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import { handleApi } from '../src/server/api.ts';

const ORIGIN = 'https://drharshmaheshwari.com';
const CLIENT = 'test-client.apps.googleusercontent.com';
let proxy, env;

before(async () => {
  proxy = await getPlatformProxy({ configPath: new URL('./wrangler.test.jsonc', import.meta.url).pathname, persist: false });
  env = { DB: proxy.env.DB, GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'secret' };
});
after(() => proxy?.dispose());

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (claims) => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;
const req = (path, init = {}) => new Request(ORIGIN + path, init);
const cookiesOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

/** Runs the whole sign-in flow with a fake Google; returns the session cookie. */
async function signIn({ sub = 'google-1', email = 'a@example.org', name = 'Dr A', tamper = (c) => c, ret = '/doctors/trainers/auscultation/progress/' } = {}) {
  const start = await handleApi(req(`/api/auth/google?return=${encodeURIComponent(ret)}`), env);
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin + google.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = google.searchParams;
  assert.equal(q.get('client_id'), CLIENT);
  assert.equal(q.get('redirect_uri'), `${ORIGIN}/api/auth/callback`);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('scope'), 'openid email profile');
  let sent;
  const fakeFetch = async (url, init) => {
    sent = { url, body: new URLSearchParams(init.body) };
    return Response.json({ id_token: idToken(tamper({ iss: 'https://accounts.google.com', aud: CLIENT, sub, email, email_verified: true, name, nonce: q.get('nonce'), exp: Math.floor(Date.now() / 1000) + 3600 })) });
  };
  const cb = await handleApi(req(`/api/auth/callback?code=abc&state=${q.get('state')}`, { headers: { cookie: cookiesOf(start) } }), env, { fetch: fakeFetch, now: Date.now });
  return { cb, sent, sid: cb.headers.getSetCookie().find((c) => c.startsWith('sid='))?.split(';')[0] };
}

const post = (path, sid, body, origin = ORIGIN) => handleApi(req(path, { method: 'POST', headers: { cookie: sid, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
const attempt = (id, t, extra = {}) => ({ id, trainer: 'auscultation', version: 'hls-cmds-v2', item: 'H01', set: 'l1', activity: 'quiz', parts: [{ answer: 's3', chosen: 's3' }], correct: true, t, ...extra });

test('/api/health reports which settings exist, never their values', async () => {
  assert.deepEqual(await (await handleApi(req('/api/health'), {})).json(), { worker: true, db: false, googleClientId: false, googleClientSecret: false, accounts: false });
  const body = await (await handleApi(req('/api/health'), env)).text();
  assert.deepEqual(JSON.parse(body), { worker: true, db: true, googleClientId: true, googleClientSecret: true, accounts: true });
  assert.ok(!body.includes(env.GOOGLE_CLIENT_SECRET), 'no secret value');
  assert.ok(!body.includes(CLIENT), 'no client id value');
});

test('accounts are off until the database and Google credentials are configured', async () => {
  const res = await handleApi(req('/api/me'), {});
  assert.deepEqual(await res.json(), { enabled: false, user: null });
  assert.equal((await handleApi(req('/api/auth/google'), { DB: env.DB })).status, 404);
});

test('Google sign-in: PKCE code exchange, session cookie, return to the same page', async () => {
  const { cb, sent, sid } = await signIn();
  assert.equal(sent.url, 'https://oauth2.googleapis.com/token');
  assert.equal(sent.body.get('grant_type'), 'authorization_code');
  assert.ok(sent.body.get('code_verifier')?.length >= 43, 'PKCE verifier sent');
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/doctors/trainers/auscultation/progress/#signin=ok');
  assert.ok(sid, 'session cookie set');
  const raw = cb.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Lax/); assert.match(raw, /Secure/);
  const me = await (await handleApi(req('/api/me', { headers: { cookie: sid } }), env)).json();
  assert.deepEqual(me, { enabled: true, user: { name: 'Dr A', email: 'a@example.org', picture: null } });
  const row = await env.DB.prepare('SELECT token_hash FROM sessions LIMIT 1').first();
  assert.ok(!row.token_hash.includes(sid.slice(4)), 'only a hash of the session token is stored');
});

test('sign-in is refused on a bad state, wrong audience, wrong nonce, unverified email or expired token', async () => {
  for (const tamper of [(c) => ({ ...c, aud: 'someone-else' }), (c) => ({ ...c, nonce: 'x' }), (c) => ({ ...c, email_verified: false }), (c) => ({ ...c, exp: 1 }), (c) => ({ ...c, iss: 'https://evil.example' })]) {
    const { cb, sid } = await signIn({ sub: 'google-x', tamper });
    assert.match(cb.headers.get('location'), /#signin=error$/);
    assert.equal(sid, undefined);
  }
  const start = await handleApi(req('/api/auth/google'), env);
  const cb = await handleApi(req('/api/auth/callback?code=abc&state=forged', { headers: { cookie: cookiesOf(start) } }), env, { fetch: () => assert.fail('must not call Google'), now: Date.now });
  assert.match(cb.headers.get('location'), /#signin=error$/);
});

test('the return address can only be a page on this site', async () => {
  for (const ret of ['//evil.example/x', 'https://evil.example/', '/\\evil.example']) {
    const { cb } = await signIn({ sub: 'google-r', ret });
    assert.equal(cb.headers.get('location'), '/#signin=ok');
  }
});

test('progress: upload is idempotent, download returns it, other users and other sites cannot touch it', async () => {
  const { sid } = await signIn({ sub: 'google-p', email: 'p@example.org' });
  const { sid: other } = await signIn({ sub: 'google-q', email: 'q@example.org' });
  const batch = [attempt('a1', 1000), attempt('a2', 2000, { correct: false })];
  assert.equal((await post('/api/progress/auscultation', sid, { attempts: batch, prefs: { unlockAll: true } })).status, 200);
  assert.equal((await post('/api/progress/auscultation', sid, { attempts: batch })).status, 200, 'same answers again');
  const got = await (await handleApi(req('/api/progress/auscultation', { headers: { cookie: sid } }), env)).json();
  assert.deepEqual(got.attempts.map((a) => a.id), ['a1', 'a2']);
  assert.deepEqual(got.prefs, { unlockAll: true });
  const theirs = await (await handleApi(req('/api/progress/auscultation', { headers: { cookie: other } }), env)).json();
  assert.deepEqual(theirs.attempts, []);
  assert.equal((await post('/api/progress/auscultation', sid, { attempts: [attempt('a3', 3000)] }, 'https://evil.example')).status, 403);
  assert.equal((await post('/api/progress/auscultation', '', { attempts: [attempt('a3', 3000)] })).status, 401);
  assert.equal((await post('/api/progress/auscultation', sid, { attempts: [{ ...attempt('a4', 4000), trainer: 'ecg' }] })).status, 400);
  assert.equal((await post('/api/progress/auscultation', sid, { attempts: [attempt('x'.repeat(65), 1)] })).status, 400);
  const del = await handleApi(req('/api/progress/auscultation', { method: 'DELETE', headers: { cookie: sid, origin: ORIGIN } }), env);
  assert.equal(del.status, 200);
  assert.deepEqual((await (await handleApi(req('/api/progress/auscultation', { headers: { cookie: sid } }), env)).json()).attempts, []);
});

test('sign out ends the session; deleting the account removes the person and all their data', async () => {
  const { sid } = await signIn({ sub: 'google-d', email: 'd@example.org' });
  await post('/api/progress/auscultation', sid, { attempts: [attempt('d1', 1)], prefs: { unlockAll: false } });
  const { sid: second } = await signIn({ sub: 'google-d', email: 'd@example.org' });
  const out = await post('/api/auth/logout', sid, {});
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await (await handleApi(req('/api/me', { headers: { cookie: sid } }), env)).json()).user, null);
  assert.ok((await (await handleApi(req('/api/me', { headers: { cookie: second } }), env)).json()).user, 'other device stays signed in');
  const del = await handleApi(req('/api/account', { method: 'DELETE', headers: { cookie: second, origin: ORIGIN } }), env);
  assert.equal(del.status, 200);
  for (const table of ['users', 'sessions', 'attempts', 'prefs']) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} IN (SELECT id FROM users WHERE google_sub = 'google-d')`).first();
    assert.equal(r.n, 0, table);
  }
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM attempts WHERE id = 'd1'`).first()).n, 0, 'answers deleted');
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE google_sub = 'google-d'`).first()).n, 0, 'user deleted');
});

test('books: reading place (newest wins), bookmarks (deletions stick), practice marks, and deleting it all', async () => {
  const { sid } = await signIn({ sub: 'google-b', email: 'b@example.org' });
  const { sid: other } = await signIn({ sub: 'google-c', email: 'c@example.org' });
  const get = async (s = sid, book = 'b0') => {
    const body = await (await handleApi(req(`/api/books/${book}`, { headers: { cookie: s } }), env)).json();
    assert.equal(typeof body.now, 'number', 'the server clock comes with every download (the delta cursor)');
    delete body.now;
    return body;
  };
  const loc = (s, p = 0, f = 0) => ({ s, p, f });
  assert.deepEqual(await get(), { progress: null, bookmarks: [], highlights: [] });

  assert.equal((await post('/api/books/b0', sid, { progress: { version: '1.2', loc: loc('b0-r0-c05', 3, 0.5), percent: 0.1, updated: 2000 } })).status, 200);
  assert.equal((await post('/api/books/b0', sid, { progress: { version: '1.2', loc: loc('b0-r0-c02'), percent: 0.02, updated: 1000 } })).status, 200, 'an older place');
  assert.deepEqual((await get()).progress, { version: '1.2', loc: loc('b0-r0-c05', 3, 0.5), percent: 0.1, updated: 2000, done: [] }, 'the older place does not win');
  await post('/api/books/b0', sid, { progress: { version: '1.2', loc: loc('b0-r0-c02'), percent: 0.02, updated: 1500, done: ['b0-r0-c01', 'b0-r0-c02'] } });
  assert.deepEqual((await get()).progress.done, ['b0-r0-c01', 'b0-r0-c02'], 'sections read to the end arrive even from an older place');
  assert.equal((await get()).progress.loc.s, 'b0-r0-c05', 'while the newer place stays');
  await post('/api/books/b0', sid, { progress: { version: '1.2', loc: loc('b0-r0-c09'), percent: 0.2, updated: 3000 } });
  assert.equal((await get()).progress.loc.s, 'b0-r0-c09', 'a newer place wins');

  const mark = { id: 'm1', loc: loc('b0-r0-c05', 2), label: 'A5', snippet: 'A ratio compares two quantities', created: 1500 };
  assert.equal((await post('/api/books/b0', sid, { bookmarks: [mark, mark] })).status, 200, 'the same bookmark twice');
  assert.deepEqual((await get()).bookmarks, [{ ...mark, deleted: null }]);
  await post('/api/books/b0', sid, { bookmarks: [{ ...mark, deleted: 5000 }] });
  await post('/api/books/b0', sid, { bookmarks: [mark] });
  assert.equal((await get()).bookmarks[0].deleted, 5000, 'a deletion is not undone by a device that still had the bookmark');

  assert.deepEqual(await get(other), { progress: null, bookmarks: [], highlights: [] }, 'another person sees nothing');
  assert.equal((await post('/api/books/b0', sid, { progress: { version: '1.2', loc: { s: 'X Y', p: 0, f: 0 }, percent: 0, updated: 1 } })).status, 400);
  assert.equal((await post('/api/books/b0', sid, { bookmarks: [{ ...mark, id: 'm2', snippet: 'x'.repeat(201) }] })).status, 400);
  assert.equal((await post('/api/books/B0!', sid, {})).status, 404);
  assert.equal((await post('/api/books/b0', sid, { progress: { version: '1.2', loc: loc('b0-r0-c01'), percent: 0, updated: 9000 } }, 'https://evil.example')).status, 403);

  const practice = { id: 'k1', trainer: 'book-b0', version: '1.2', item: 'b0-r0-c05:p3', set: 'b0-r0-c05', activity: 'practice', parts: [], correct: false, t: 4000 };
  assert.equal((await post('/api/progress/book-b0', sid, { attempts: [practice] })).status, 200, 'practice marks use the attempts table');

  const del = await handleApi(req('/api/books/b0', { method: 'DELETE', headers: { cookie: sid, origin: ORIGIN } }), env);
  assert.equal(del.status, 200);
  assert.deepEqual(await get(), { progress: null, bookmarks: [], highlights: [] });
  assert.deepEqual((await (await handleApi(req('/api/progress/book-b0', { headers: { cookie: sid } }), env)).json()).attempts, []);

  await post('/api/books/s01-r1', sid, { progress: { version: '1.2', loc: loc('s01-r1-c01'), percent: 0, updated: 1 }, bookmarks: [{ ...mark, id: 'm9' }] });
  await handleApi(req('/api/account', { method: 'DELETE', headers: { cookie: sid, origin: ORIGIN } }), env);
  for (const table of ['reading_progress', 'bookmarks']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE book_id = 's01-r1'`).first()).n, 0, `${table} deleted with the account`);
  }
});

test('the Google profile picture address is kept only when Google hosts it', async () => {
  const me = async (sid) => (await (await handleApi(req('/api/me', { headers: { cookie: sid } }), env)).json()).user;
  const pic = 'https://lh3.googleusercontent.com/a/abc=s96-c';
  const { sid } = await signIn({ sub: 'google-pic', email: 'pic@example.org', tamper: (c) => ({ ...c, picture: pic }) });
  assert.equal((await me(sid)).picture, pic);
  const { sid: bad } = await signIn({ sub: 'google-pic2', email: 'pic2@example.org', tamper: (c) => ({ ...c, picture: 'https://evil.example/x.png' }) });
  assert.equal((await me(bad)).picture, null);
});

test('progress delta: ?since returns only answers that arrived after that server time, from a full page onward', async () => {
  const { sid } = await signIn({ sub: 'google-delta', email: 'delta@example.org' });
  const at = (t) => ({ fetch, now: () => t });
  const send = (t, attempts) => handleApi(req('/api/progress/book-b0', { method: 'POST', headers: { cookie: sid, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ attempts }) }), env, at(t));
  const ask = async (query, t = 99_000) => (await handleApi(req(`/api/progress/book-b0${query}`, { headers: { cookie: sid } }), env, at(t))).json();
  const mk = (id, t) => ({ id, trainer: 'book-b0', version: '1.2', item: 'b0-r0-c05-p1', set: 'b0-r0-c05', activity: 'practice', parts: [], correct: true, t });

  // The answer's own time (t) can be old: a phone that was offline sends yesterday's answers today. What counts is when the server got them.
  await send(1000, [mk('a1', 10), mk('a2', 20)]);
  await send(5000, [mk('a3', 5)]);

  const full = await ask('');
  assert.deepEqual(full.attempts.map((a) => a.id).sort(), ['a1', 'a2', 'a3'], 'no cursor: everything, as the trainers ask');
  assert.equal(full.now, 99_000);
  const delta = await ask('?since=3000');
  assert.deepEqual(delta.attempts.map((a) => a.id), ['a3'], 'only what arrived after 3000, though its own time is the oldest');
  assert.equal(delta.next, 99_000);
  assert.equal(delta.prefs, null);
  assert.deepEqual((await ask('?since=5000')).attempts, [], 'nothing new');
  assert.equal((await ask('?since=junk')).attempts.length, 3, 'a bad cursor is a full download, not an error');

  await send(6000, [mk('a1', 10), mk('a4', 30)]); // a1 again: already stored, so it is not "new"
  assert.deepEqual((await ask('?since=5500')).attempts.map((a) => a.id), ['a4']);
});

test('a delta download reads only the new rows (D1 bills rows read)', async () => {
  const { sid } = await signIn({ sub: 'google-rows', email: 'rows@example.org' });
  const batch = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, trainer: 'book-b1', version: '1.2', item: `b1-c01-p${i}`, set: 'b1-c01', activity: 'practice', parts: [], correct: true, t: i }));
  await handleApi(req('/api/progress/book-b1', { method: 'POST', headers: { cookie: sid, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ attempts: batch }) }), env, { fetch, now: () => 1000 });
  const rowsRead = async (query, ...extra) => {
    const row = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind('google-rows').first();
    const res = await env.DB.prepare(query).bind(row.id, 'book-b1', ...extra).all();
    return res.meta.rows_read;
  };
  const full = await rowsRead('SELECT data FROM attempts WHERE user_id = ? AND trainer = ? ORDER BY t DESC LIMIT 5000');
  const delta = await rowsRead('SELECT data FROM attempts WHERE user_id = ? AND trainer = ? AND received_at > ? ORDER BY received_at LIMIT 5000', 40_000);
  assert.ok(full >= 300, `a full download reads every row (${full})`);
  assert.ok(delta <= 5, `a delta with nothing new reads next to nothing (${delta})`);
});

test('highlights and notes: newest edit wins, a deletion sticks, only the new ones come in a delta, and limits hold', async () => {
  const { sid } = await signIn({ sub: 'google-hl', email: 'hl@example.org' });
  const { sid: other } = await signIn({ sub: 'google-hl2', email: 'hl2@example.org' });
  const at = (t) => ({ fetch, now: () => t });
  const send = (t, highlights, s = sid, origin = ORIGIN) => handleApi(req('/api/books/b0', { method: 'POST', headers: { cookie: s, origin, 'content-type': 'application/json' }, body: JSON.stringify({ highlights }) }), env, at(t));
  const ask = async (query = '', t = 90_000, s = sid) => (await handleApi(req(`/api/books/b0${query}`, { headers: { cookie: s } }), env, at(t))).json();
  const hl = (id, extra = {}) => ({ id, sec: 'b0-r0-c05', start: 10, end: 30, para: 2, quote: 'a ratio compares two', before: 'Remember: ', after: ' quantities', text: 'a ratio compares two', colour: 0, note: '', version: '1.2', created: 100, updated: 100, ...extra });

  assert.equal((await send(1000, [hl('h1'), hl('h2', { start: 40, end: 60 })])).status, 200);
  assert.equal((await send(1000, [hl('h1'), hl('h2', { start: 40, end: 60 })])).status, 200, 'the same highlights again');
  const all = (await ask()).highlights;
  assert.deepEqual(all.map((h) => h.id), ['h1', 'h2']);
  assert.deepEqual(all[0], { ...hl('h1'), deleted: null }, 'what went in comes back (anchor included)');

  // Edits follow the newest `updated`, whichever device's request arrives last.
  await send(2000, [hl('h1', { colour: 2, note: 'second thought', updated: 300 })]);
  await send(3000, [hl('h1', { colour: 1, note: 'older edit', updated: 200 })]);
  const h1 = (await ask()).highlights.find((h) => h.id === 'h1');
  assert.deepEqual([h1.colour, h1.note, h1.updated], [2, 'second thought', 300], 'an older edit arriving later does not win');
  assert.equal(h1.quote, 'a ratio compares two', 'the anchor is never changed by an edit');

  // Delta: only what arrived after the cursor; stored rows are not re-sent.
  await send(5000, [hl('h3', { start: 70, end: 90, created: 400, updated: 400 })]);
  assert.deepEqual((await ask('?since=4000')).highlights.map((h) => h.id), ['h3']);
  assert.deepEqual((await ask('?since=5000')).highlights, []);
  assert.deepEqual((await ask('')).highlights.map((h) => h.id).sort(), ['h1', 'h2', 'h3'], 'no cursor: all');

  // A deletion is kept and never undone, even by a device that still has the highlight.
  await send(6000, [hl('h2', { deleted: 500, updated: 500 })]);
  await send(7000, [hl('h2', { colour: 3, updated: 900 })]);
  const h2 = (await ask()).highlights.find((h) => h.id === 'h2');
  assert.equal(h2.deleted, 500, 'still deleted');
  assert.ok((await ask('?since=5500')).highlights.some((h) => h.id === 'h2' && h.deleted), 'and the deletion reaches other devices as a delta');

  // Other people see nothing; other sites and bad input are refused.
  assert.deepEqual((await ask('', 90_000, other)).highlights, []);
  assert.equal((await send(8000, [hl('x1')], sid, 'https://evil.example')).status, 403);
  for (const bad of [hl('b1', { colour: 4 }), hl('b1', { end: 10 }), hl('b1', { quote: '' }), hl('b1', { quote: 'x'.repeat(2001) }), hl('b1', { note: 'n'.repeat(2001) }), hl('b1', { sec: 'No Way' }), hl('', {}), hl('b1', { start: -1 })]) {
    assert.equal((await send(8000, [bad])).status, 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal((await send(8000, Array.from({ length: 201 }, (_, i) => hl(`many${i}`)))).status, 413, 'too many in one request');

  // Deleting the book's data, and the account, removes them.
  const del = await handleApi(req('/api/books/b0', { method: 'DELETE', headers: { cookie: sid, origin: ORIGIN } }), env);
  assert.equal(del.status, 200);
  assert.deepEqual((await ask()).highlights, []);
  await send(9000, [hl('gone', { sec: 'b0-r0-c09' })]);
  await handleApi(req('/api/account', { method: 'DELETE', headers: { cookie: sid, origin: ORIGIN } }), env);
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM highlights WHERE id = 'gone'`).first()).n, 0, 'deleted with the account');
});

test('a delta download of highlights reads only the new rows', async () => {
  const { sid } = await signIn({ sub: 'google-hlrows', email: 'hlrows@example.org' });
  const batch = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}`, sec: 'b0-r0-c05', start: i * 30, end: i * 30 + 20, para: 1, quote: 'q'.repeat(10), before: '', after: '', text: 'q', colour: 0, note: '', version: '1.2', created: i + 1, updated: i + 1 }));
  await handleApi(req('/api/books/b0', { method: 'POST', headers: { cookie: sid, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ highlights: batch }) }), { ...env }, { fetch, now: () => 1000 });
  const row = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind('google-hlrows').first();
  const rows = async (q, ...x) => (await env.DB.prepare(q).bind(row.id, 'b0', ...x).all()).meta.rows_read;
  assert.ok(await rows('SELECT id FROM highlights WHERE user_id = ? AND book_id = ?') >= 150, 'a full download reads every highlight');
  const delta = await rows('SELECT id FROM highlights WHERE user_id = ? AND book_id = ? AND received_at > ?', 40_000);
  assert.ok(delta <= 5, `a delta with nothing new reads next to nothing (${delta})`);
});
