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
  assert.deepEqual(me, { enabled: true, user: { name: 'Dr A', email: 'a@example.org' } });
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
