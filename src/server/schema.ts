// The D1 schema. Applied automatically and idempotently (CREATE ... IF NOT EXISTS) the first time each
// Worker instance touches the database, so there is no manual migration step. To change a table later,
// add a new numbered statement list to MIGRATIONS; never edit one that has shipped.

export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`,
    // Only a SHA-256 hash of the session token is stored: a copy of the database cannot be used to sign in.
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
    // One row per answer, keyed by the id made in the browser, so uploading an answer twice stores it once.
    `CREATE TABLE IF NOT EXISTS attempts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trainer TEXT NOT NULL,
      id TEXT NOT NULL,
      t INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS attempts_user_trainer ON attempts(user_id, trainer, t)`,
    `CREATE TABLE IF NOT EXISTS prefs (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trainer TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, trainer)
    )`,
    `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`,
  ],
  // 2: the book reader (docs/book-reader-plan.md). Where you are in each book, and your bookmarks. Practice
  // marks reuse `attempts` with trainer = 'book-<id>'. A location is JSON {s, p, f}: section id, paragraph,
  // fraction, so it survives a new version of the book. `done` is the JSON list of sections read to the end. A deleted bookmark keeps its row with deleted_at set,
  // so the deletion reaches your other devices instead of the bookmark coming back from one of them.
  [
    `CREATE TABLE IF NOT EXISTS reading_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL,
      book_version TEXT NOT NULL,
      location TEXT NOT NULL,
      percent REAL NOT NULL,
      done TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, book_id)
    )`,
    `CREATE TABLE IF NOT EXISTS bookmarks (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL,
      id TEXT NOT NULL,
      location TEXT NOT NULL,
      label TEXT NOT NULL,
      snippet TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS bookmarks_user_book ON bookmarks(user_id, book_id)`,
    // The address of the person's Google profile picture, shown small in the reader's top bar (Harsh,
    // 3 Oct 2026). Only a link Google gives at sign-in; the picture itself is never copied here.
    `ALTER TABLE users ADD COLUMN picture TEXT`,
  ],
];

let applied: Promise<void> | null = null;

/** Brings the database up to the latest schema once per Worker instance. */
export function ensureSchema(db: D1Database): Promise<void> {
  applied ??= (async () => {
    const current = await db.prepare('SELECT MAX(version) AS v FROM schema_version').first<{ v: number | null }>()
      .then((r) => r?.v ?? 0).catch(() => 0);
    for (let v = current; v < MIGRATIONS.length; v++) {
      await db.batch([...MIGRATIONS[v].map((sql) => db.prepare(sql)), db.prepare('INSERT INTO schema_version (version) VALUES (?)').bind(v + 1)]);
    }
  })().catch((e) => { applied = null; throw e; });
  return applied;
}
