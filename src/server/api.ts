// Every /api/ request: Google sign-in, sessions, trainer progress sync, account deletion.
//
// The site stays static; only /api/ runs code. Accounts are optional and exist only to keep trainer
// progress across devices. Stored per person: Google's account id, email and name, and their trainer
// answers. No Google access token is kept. If the database or the Google credentials are not configured,
// /api/me says accounts are off and the trainers quietly keep progress in the browser, as before.

import './d1';
import { ensureSchema } from './schema';

export interface Env {
  DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Outside calls, replaceable in tests. */
export interface Deps { fetch: typeof fetch; now: () => number }
const DEFAULT_DEPS: Deps = { fetch: (...a) => fetch(...a), now: () => Date.now() };

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SESSION_DAYS = 180;
const DAY = 86_400_000;
export const LIMITS = { batch: 1000, perTrainer: 20_000, download: 5000, attemptBytes: 4096, prefsBytes: 2048 };
const TRAINER_ID = /^[a-z0-9-]{1,40}$/;

// ---------- small helpers ----------
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const redirect = (to: string, cookies: string[] = []) => {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
};
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

function cookie(name: string, value: string, url: URL, maxAge: number, path = '/') {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`;
}
function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
/** Only same-site paths, so the return address can't send people elsewhere. */
const safeReturn = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') && !r.includes('\\') ? r : '/');

const enabled = (env: Env): env is Required<Env> => !!(env.DB && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// ---------- sessions ----------
interface User { id: string; email: string; name: string | null }

async function currentUser(req: Request, env: Required<Env>, deps: Deps): Promise<User | null> {
  const token = readCookie(req, 'sid');
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.last_seen_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
  ).bind(await sha256(token)).first<User & { last_seen_at: number; expires_at: number }>();
  if (!row) return null;
  const now = deps.now();
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return null;
  }
  if (now - row.last_seen_at > DAY) await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, row.id).run();
  return { id: row.id, email: row.email, name: row.name };
}

/** State-changing requests must come from this site's own pages. */
const sameOrigin = (req: Request, url: URL) => req.headers.get('origin') === url.origin;

// ---------- Google sign-in (authorization code flow with PKCE, state and nonce) ----------
async function startGoogle(req: Request, url: URL, env: Required<Env>) {
  const state = random(), verifier = random(48), nonce = random();
  const ret = safeReturn(url.searchParams.get('return'));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/auth/callback`, response_type: 'code',
    scope: 'openid email profile', state, nonce, code_challenge: await sha256(verifier), code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  const pending = b64url(new TextEncoder().encode(JSON.stringify({ state, verifier, nonce, ret })));
  return redirect(`${GOOGLE_AUTH}?${q}`, [cookie('oauth', pending, url, 600, '/api/auth/')]);
}

async function finishGoogle(req: Request, url: URL, env: Required<Env>, deps: Deps) {
  const clear = cookie('oauth', '', url, 0, '/api/auth/');
  let pending: { state: string; verifier: string; nonce: string; ret: string };
  try { pending = JSON.parse(fromB64url(readCookie(req, 'oauth') ?? '')); } catch { return redirect('/#signin=error', [clear]); }
  const fail = () => redirect(`${safeReturn(pending.ret)}#signin=error`, [clear]);
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.get('state') !== pending.state) return fail();

  const res = await deps.fetch(GOOGLE_TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/callback`, grant_type: 'authorization_code', code_verifier: pending.verifier,
    }),
  }).catch(() => null);
  if (!res?.ok) return fail();
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without
  // checking the signature (Google's OpenID Connect guide allows this); every claim is still validated.
  let claims: { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean | string; name?: string; nonce?: string; exp?: number };
  try { claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64url(((await res.json()) as { id_token: string }).id_token.split('.')[1]), (c) => c.charCodeAt(0)))); }
  catch { return fail(); }
  const now = deps.now();
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss ?? '') || claims.aud !== env.GOOGLE_CLIENT_ID
    || !claims.sub || !claims.email || !(claims.email_verified === true || claims.email_verified === 'true')
    || claims.nonce !== pending.nonce || !claims.exp || claims.exp * 1000 < now) return fail();

  await ensureSchema(env.DB);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const token = random();
  await env.DB.batch([
    existing
      ? env.DB.prepare('UPDATE users SET email = ?, name = ?, last_seen_at = ? WHERE id = ?').bind(claims.email, claims.name ?? null, now, id)
      : env.DB.prepare('INSERT INTO users (id, google_sub, email, name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, claims.sub, claims.email, claims.name ?? null, now, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), id, now, now + SESSION_DAYS * DAY),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);
  return redirect(`${safeReturn(pending.ret)}#signin=ok`, [clear, cookie('sid', token, url, SESSION_DAYS * 86400)]);
}

// ---------- progress ----------
interface AttemptIn { id: string; trainer: string; item: string; t: number; [k: string]: unknown }
const validAttempt = (a: unknown, trainer: string): a is AttemptIn => {
  if (!a || typeof a !== 'object') return false;
  const x = a as AttemptIn;
  return typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 64 && x.trainer === trainer
    && typeof x.item === 'string' && x.item.length <= 128 && Number.isFinite(x.t) && JSON.stringify(x).length <= LIMITS.attemptBytes;
};

async function getProgress(env: Required<Env>, user: User, trainer: string) {
  const rows = await env.DB.prepare('SELECT data FROM attempts WHERE user_id = ? AND trainer = ? ORDER BY t DESC LIMIT ?')
    .bind(user.id, trainer, LIMITS.download).all<{ data: string }>();
  const prefs = await env.DB.prepare('SELECT data FROM prefs WHERE user_id = ? AND trainer = ?').bind(user.id, trainer).first<{ data: string }>();
  return json({ attempts: rows.results.map((r) => JSON.parse(r.data)).reverse(), prefs: prefs ? JSON.parse(prefs.data) : null });
}

async function putProgress(req: Request, env: Required<Env>, user: User, trainer: string, deps: Deps) {
  let body: { attempts?: unknown[]; prefs?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  if (attempts.length > LIMITS.batch) return json({ error: 'too many attempts in one request' }, 413);
  if (!attempts.every((a) => validAttempt(a, trainer))) return json({ error: 'invalid attempt' }, 400);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ? AND trainer = ?').bind(user.id, trainer).first<{ n: number }>();
  if ((count?.n ?? 0) + attempts.length > LIMITS.perTrainer) return json({ error: 'storage limit reached' }, 413);
  const stmts = (attempts as AttemptIn[]).map((a) =>
    env.DB.prepare('INSERT OR IGNORE INTO attempts (user_id, trainer, id, t, data) VALUES (?, ?, ?, ?, ?)').bind(user.id, trainer, a.id, a.t, JSON.stringify(a)));
  if (body.prefs !== undefined) {
    const p = JSON.stringify(body.prefs);
    if (!body.prefs || typeof body.prefs !== 'object' || p.length > LIMITS.prefsBytes) return json({ error: 'invalid prefs' }, 400);
    stmts.push(env.DB.prepare('INSERT INTO prefs (user_id, trainer, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, trainer) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .bind(user.id, trainer, p, deps.now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, stored: attempts.length });
}

// ---------- router ----------
export async function handleApi(req: Request, env: Env, deps: Deps = DEFAULT_DEPS): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  // Which settings this deployment has (yes/no only, never values): lets a person check a deployment from the browser.
  if (path === '/api/health') return json({ worker: true, db: !!env.DB, googleClientId: !!env.GOOGLE_CLIENT_ID, googleClientSecret: !!env.GOOGLE_CLIENT_SECRET, accounts: enabled(env) });
  if (!enabled(env)) return path === '/api/me' ? json({ enabled: false, user: null }) : json({ error: 'accounts are not enabled' }, 404);
  try {
    if (path === '/api/auth/google' && req.method === 'GET') return startGoogle(req, url, env);
    if (path === '/api/auth/callback' && req.method === 'GET') return finishGoogle(req, url, env, deps);

    await ensureSchema(env.DB);
    const user = await currentUser(req, env, deps);
    if (path === '/api/me' && req.method === 'GET') return json({ enabled: true, user: user && { name: user.name, email: user.email } });

    if (req.method !== 'GET' && !sameOrigin(req, url)) return json({ error: 'cross-site request refused' }, 403);
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const token = readCookie(req, 'sid');
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      return json({ ok: true }, 200, { 'set-cookie': cookie('sid', '', url, 0) });
    }
    if (!user) return json({ error: 'not signed in' }, 401);

    if (path === '/api/account' && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run(); // sessions, attempts, prefs cascade
      return json({ ok: true }, 200, { 'set-cookie': cookie('sid', '', url, 0) });
    }
    const m = path.match(/^\/api\/progress\/([^/]+)$/);
    if (m) {
      const trainer = m[1];
      if (!TRAINER_ID.test(trainer)) return json({ error: 'unknown trainer' }, 404);
      if (req.method === 'GET') return getProgress(env, user, trainer);
      if (req.method === 'POST') return putProgress(req, env, user, trainer, deps);
      if (req.method === 'DELETE') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM attempts WHERE user_id = ? AND trainer = ?').bind(user.id, trainer),
          env.DB.prepare('DELETE FROM prefs WHERE user_id = ? AND trainer = ?').bind(user.id, trainer),
        ]);
        return json({ ok: true });
      }
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error('api error', path, e);
    return json({ error: 'server error' }, 500);
  }
}
