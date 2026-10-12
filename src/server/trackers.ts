// /api/trackers: BP and blood sugar trackers (docs/trackers-plan.md). Signed in: the account's people and readings
// (delta download, batched upload, newest edit wins) and its doctor share links. Not signed in: /api/trackers/shared,
// the doctor's read-only view through a share link.
//
// Free-plan budget: a person adds a few readings a day, so uploads are rare; downloads after the first ask only
// for rows received since the last one (tracker_readings_sync). A doctor opening a link costs one request and an
// indexed read of that person's last year of readings.

import { ageOn, isAdult, validPerson, validReading, type Person, type Reading } from '../lib/trackers';

export interface TrackerUser { id: string }
type Now = () => number;

export const TRACKER_LIMITS = { batch: 500, people: 20, readings: 20_000, download: 5000, sharesPerPerson: 10, sharedDays: 365, sharedMax: 3000 };
const DAY = 86_400_000;
const SHARE_DAYS = [30, 90, 0]; // 0 = until stopped

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

const sinceOf = (url: URL) => {
  const n = Number(url.searchParams.get('since'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

async function getAll(db: D1Database, user: TrackerUser, url: URL, now: Now) {
  const since = sinceOf(url);
  const t = now();
  const people = await (since
    ? db.prepare('SELECT data, deleted_at FROM tracker_people WHERE user_id = ? AND received_at > ?').bind(user.id, since)
    : db.prepare('SELECT data, deleted_at FROM tracker_people WHERE user_id = ?').bind(user.id)).all<{ data: string; deleted_at: number | null }>();
  const readings = await (since
    ? db.prepare('SELECT data, deleted_at, received_at FROM tracker_readings WHERE user_id = ? AND received_at > ? ORDER BY received_at LIMIT ?').bind(user.id, since, TRACKER_LIMITS.download)
    : db.prepare('SELECT data, deleted_at, received_at FROM tracker_readings WHERE user_id = ? ORDER BY received_at LIMIT ?').bind(user.id, TRACKER_LIMITS.download)).all<{ data: string; deleted_at: number | null; received_at: number }>();
  const out = <T>(r: { data: string; deleted_at: number | null }) => ({ ...JSON.parse(r.data), deleted: r.deleted_at }) as T;
  // A full page means there may be more: the next ask continues from the last row instead of skipping ahead.
  const full = readings.results.length >= TRACKER_LIMITS.download;
  return json({
    now: t, more: full, next: full ? readings.results[readings.results.length - 1].received_at : t,
    people: people.results.map((r) => out<Person>(r)), readings: readings.results.map((r) => out<Reading>(r)),
  });
}

async function putAll(req: Request, db: D1Database, user: TrackerUser, now: Now) {
  let body: { people?: unknown[]; readings?: unknown[] };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const people = Array.isArray(body.people) ? body.people : [];
  const readings = Array.isArray(body.readings) ? body.readings : [];
  if (people.length + readings.length > TRACKER_LIMITS.batch) return json({ error: 'too many in one request' }, 413);
  if (!people.every(validPerson)) return json({ error: 'invalid person' }, 400);
  if (!readings.every(validReading)) return json({ error: 'invalid reading' }, 400);
  if (people.length) {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM tracker_people WHERE user_id = ? AND deleted_at IS NULL').bind(user.id).first<{ n: number }>();
    if ((n?.n ?? 0) + people.filter((p) => !p.deleted).length > TRACKER_LIMITS.people * 2) return json({ error: 'storage limit reached' }, 413);
  }
  if (readings.length) {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM tracker_readings WHERE user_id = ?').bind(user.id).first<{ n: number }>();
    if ((n?.n ?? 0) + readings.length > TRACKER_LIMITS.readings) return json({ error: 'storage limit reached' }, 413);
  }
  const received = now();
  const strip = <T extends { deleted?: number | null }>(x: T) => { const { deleted: _, ...rest } = x; return JSON.stringify(rest); };
  const stmts: D1PreparedStatement[] = [];
  for (const p of people as Person[]) {
    stmts.push(db.prepare(`INSERT INTO tracker_people (user_id, id, data, updated_at, deleted_at, received_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, id) DO UPDATE SET
        data = CASE WHEN excluded.updated_at > tracker_people.updated_at THEN excluded.data ELSE tracker_people.data END,
        updated_at = MAX(excluded.updated_at, tracker_people.updated_at),
        deleted_at = COALESCE(tracker_people.deleted_at, excluded.deleted_at),
        received_at = excluded.received_at`)
      .bind(user.id, p.id, strip(p), Math.round(p.updated), p.deleted == null ? null : Math.round(p.deleted), received));
    // A removed person's share links stop at once.
    if (p.deleted != null) stmts.push(db.prepare('UPDATE tracker_shares SET stopped_at = COALESCE(stopped_at, ?) WHERE user_id = ? AND person_id = ?').bind(received, user.id, p.id));
  }
  for (const r of readings as Reading[]) {
    stmts.push(db.prepare(`INSERT INTO tracker_readings (user_id, id, person_id, kind, at, data, updated_at, deleted_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, id) DO UPDATE SET
        person_id = CASE WHEN excluded.updated_at > tracker_readings.updated_at THEN excluded.person_id ELSE tracker_readings.person_id END,
        kind = CASE WHEN excluded.updated_at > tracker_readings.updated_at THEN excluded.kind ELSE tracker_readings.kind END,
        at = CASE WHEN excluded.updated_at > tracker_readings.updated_at THEN excluded.at ELSE tracker_readings.at END,
        data = CASE WHEN excluded.updated_at > tracker_readings.updated_at THEN excluded.data ELSE tracker_readings.data END,
        updated_at = MAX(excluded.updated_at, tracker_readings.updated_at),
        deleted_at = COALESCE(tracker_readings.deleted_at, excluded.deleted_at),
        received_at = excluded.received_at`)
      .bind(user.id, r.id, r.person, r.kind, Math.round(r.at), strip(r), Math.round(r.updated), r.deleted == null ? null : Math.round(r.deleted), received));
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true });
}

// ---------- share links ----------
interface Scope { bp: boolean; sugar: boolean; weight: boolean }
interface ShareRow { token: string; id: string; person_id: string; scope: string; created_at: number; expires_at: number | null; stopped_at: number | null; opened_at: number | null }
const shareOut = (r: ShareRow) => ({ id: r.id, token: r.token, person: r.person_id, scope: JSON.parse(r.scope) as Scope, created: r.created_at, expires: r.expires_at, stopped: r.stopped_at, opened: r.opened_at });

async function listShares(db: D1Database, user: TrackerUser) {
  const rows = await db.prepare('SELECT token, id, person_id, scope, created_at, expires_at, stopped_at, opened_at FROM tracker_shares WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(user.id).all<ShareRow>();
  return json({ shares: rows.results.map(shareOut) });
}

async function createShare(req: Request, db: D1Database, user: TrackerUser, now: Now) {
  let body: { person?: unknown; scope?: Partial<Scope>; days?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const s = body.scope ?? {};
  const scope: Scope = { bp: s.bp === true, sugar: s.sugar === true, weight: s.weight === true };
  if (typeof body.person !== 'string' || !(scope.bp || scope.sugar || scope.weight) || !SHARE_DAYS.includes(body.days as number)) return json({ error: 'invalid share' }, 400);
  const person = await db.prepare('SELECT id FROM tracker_people WHERE user_id = ? AND id = ? AND deleted_at IS NULL').bind(user.id, body.person).first<{ id: string }>();
  if (!person) return json({ error: 'unknown person' }, 404);
  const t = now();
  const n = await db.prepare('SELECT COUNT(*) AS n FROM tracker_shares WHERE user_id = ? AND person_id = ? AND stopped_at IS NULL AND (expires_at IS NULL OR expires_at > ?)')
    .bind(user.id, person.id, t).first<{ n: number }>();
  if ((n?.n ?? 0) >= TRACKER_LIMITS.sharesPerPerson) return json({ error: 'too many links: stop one first' }, 413);
  const row: ShareRow = { token: random(24), id: random(9), person_id: person.id, scope: JSON.stringify(scope), created_at: t,
    expires_at: body.days ? t + (body.days as number) * DAY : null, stopped_at: null, opened_at: null };
  await db.prepare('INSERT INTO tracker_shares (token, id, user_id, person_id, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(row.token, row.id, user.id, row.person_id, row.scope, row.created_at, row.expires_at).run();
  return json({ share: shareOut(row) });
}

async function stopShare(db: D1Database, user: TrackerUser, id: string, now: Now) {
  await db.prepare('UPDATE tracker_shares SET stopped_at = COALESCE(stopped_at, ?) WHERE user_id = ? AND id = ?').bind(now(), user.id, id).run();
  return json({ ok: true });
}

/** The doctor's view: no sign-in, only the token from the link (sent in a header, never in the address). */
export async function sharedView(req: Request, db: D1Database, url: URL, now: Now) {
  const token = req.headers.get('x-share-token') ?? '';
  const gone = () => json({ error: 'This link has been stopped or has expired.' }, 404);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return gone();
  const t = now();
  const share = await db.prepare('SELECT user_id, person_id, scope, created_at, expires_at, stopped_at, opened_at FROM tracker_shares WHERE token = ?')
    .bind(token).first<{ user_id: string; person_id: string; scope: string; created_at: number; expires_at: number | null; stopped_at: number | null; opened_at: number | null }>();
  if (!share || share.stopped_at || (share.expires_at && share.expires_at <= t)) return gone();
  const prow = await db.prepare('SELECT data FROM tracker_people WHERE user_id = ? AND id = ? AND deleted_at IS NULL').bind(share.user_id, share.person_id).first<{ data: string }>();
  if (!prow) return gone();
  const p = JSON.parse(prow.data) as Person;
  const scope = JSON.parse(share.scope) as Scope;
  const kinds = (['bp', 'sugar', 'weight'] as const).filter((k) => scope[k]);
  const all = url.searchParams.get('all') === '1';
  const from = all ? 0 : t - TRACKER_LIMITS.sharedDays * DAY;
  const rows = await db.prepare(`SELECT data FROM tracker_readings WHERE user_id = ? AND person_id = ? AND at >= ? AND deleted_at IS NULL
      AND kind IN (${kinds.map(() => '?').join(', ')}) ORDER BY at DESC LIMIT ?`)
    .bind(share.user_id, share.person_id, from, ...kinds, TRACKER_LIMITS.sharedMax).all<{ data: string }>();
  const older = all ? false : !!(await db.prepare(`SELECT 1 AS x FROM tracker_readings WHERE user_id = ? AND person_id = ? AND at < ? AND deleted_at IS NULL
      AND kind IN (${kinds.map(() => '?').join(', ')}) LIMIT 1`).bind(share.user_id, share.person_id, from, ...kinds).first());
  // When it was last opened, for the owner's list; written at most every 10 minutes.
  if (!share.opened_at || t - share.opened_at > 600_000) await db.prepare('UPDATE tracker_shares SET opened_at = ? WHERE token = ?').bind(t, token).run();
  const isAdultNow = isAdult(p.born, new Date(t));
  return json({
    now: t, scope, expires: share.expires_at, older,
    // Only what a doctor needs: no month of birth, no account details.
    // "Me" means the patient to the patient; to the doctor it is "Patient".
    person: { label: p.self && /^me$/i.test(p.label.trim()) ? 'Patient' : p.label, age: isAdultNow ? ageOn(p.born, new Date(t)) : null, sex: p.sex, heightCm: p.heightCm ?? null, htn: p.htn ?? null, dm: p.dm ?? null, meds: p.meds ?? null },
    readings: rows.results.map((r) => JSON.parse(r.data) as Reading).reverse(),
  }, 200, { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' });
}

/** Signed-in routes under /api/trackers. Returns null if the path is not one of them. */
export async function trackerRoutes(req: Request, path: string, url: URL, db: D1Database, user: TrackerUser, now: Now): Promise<Response | null> {
  if (path === '/api/trackers') {
    if (req.method === 'GET') return getAll(db, user, url, now);
    if (req.method === 'POST') return putAll(req, db, user, now);
  }
  if (path === '/api/trackers/shares') {
    if (req.method === 'GET') return listShares(db, user);
    if (req.method === 'POST') return createShare(req, db, user, now);
  }
  const m = path.match(/^\/api\/trackers\/shares\/([A-Za-z0-9_-]{6,20})$/);
  if (m && req.method === 'DELETE') return stopShare(db, user, m[1], now);
  return null;
}
