// Offline packs. Books and trainers: kept on this device only when the reader taps Save for offline. Guides, calculators,
// trackers and recent blog posts: kept by the app itself, as App settings say (auto.ts, kinds 'core' and 'blog').
//
// Each pack is one Cache Storage cache (`pack:<id>`) holding the files listed in /offline/packs/<id>.json (written
// after the build by scripts/pwa/integration.mjs). The service worker only reads these caches; downloading happens
// here, in the page, one file at a time (4 at once), so a save that stops (tab closed, network lost, Cancel) simply
// continues next time from the files already kept. Nothing is ever downloaded unless someone tapped Save, except
// that a pack already saved is brought up to date after a new site build: only the files whose content changed.
// Nothing is sent anywhere and no account is involved.

/** u: URL; h: content hash (site files); b: bytes; x: on R2 (saved with CORS); d: date (YYYY-MM-DD) of a dated file (blog posts). */
export interface PackFile { u: string; h?: string; b: number; x?: 1; d?: string }
export interface PackDef { id: string; title: string; kind: string; lang?: string; open: string; build: string; files: PackFile[] }
export interface PackSummary { id: string; title: string; kind: string; lang?: string; open: string; bytes: number; count: number; approx: boolean }
interface Meta { build: string; done: boolean; saved: number; title: string; kind: string; open: string; files: Record<string, [string, number]>; day?: string }
export interface PackState { saved: boolean; done: boolean; bytes: number; percent: number }
export interface SavedPack { id: string; title: string; kind: string; open: string; bytes: number; done: boolean; saved: number; build: string; day?: string }

/** Packs the app keeps by itself (auto.ts); the others (books, trainers) only on request. */
export const isAuto = (kind: string) => kind === 'core' || kind === 'blog';

const META = '/__offline-pack-meta';
const PREFIX = 'pack:';
const PARALLEL = 4;
const cacheName = (id: string) => `${PREFIX}${id}`;

export const supported = () => typeof window !== 'undefined' && 'caches' in window && 'serviceWorker' in navigator && window.isSecureContext;

let indexP: Promise<{ build: string; packs: PackSummary[] }> | null = null;
export function packIndex() {
  indexP ??= fetch('/offline/packs.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  indexP.catch(() => { indexP = null; });
  return indexP;
}

async function readMeta(cache: Cache): Promise<Meta | null> {
  const r = await cache.match(META);
  return r ? r.json() : null;
}
const writeMeta = (cache: Cache, m: Meta) => cache.put(META, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));

const sum = (m: Meta) => Object.values(m.files).reduce((a, [, b]) => a + b, 0);

export async function packState(id: string, expected?: number): Promise<PackState> {
  if (!(await caches.has(cacheName(id)))) return { saved: false, done: false, bytes: 0, percent: 0 };
  const m = await readMeta(await caches.open(cacheName(id)));
  if (!m) return { saved: false, done: false, bytes: 0, percent: 0 };
  const bytes = sum(m);
  return { saved: true, done: m.done, bytes, percent: m.done ? 100 : expected ? Math.min(99, Math.round((bytes / expected) * 100)) : 0 };
}

export async function savedPacks(): Promise<SavedPack[]> {
  const out: SavedPack[] = [];
  for (const k of await caches.keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const m = await readMeta(await caches.open(k));
    if (m) out.push({ id: k.slice(PREFIX.length), title: m.title, kind: m.kind, open: m.open, bytes: sum(m), done: m.done, saved: m.saved, build: m.build, day: m.day });
  }
  return out.sort((a, b) => b.saved - a.saved);
}

export async function removePack(id: string) {
  await caches.delete(cacheName(id));
}

export class OutOfSpace extends Error {}

/**
 * Download what the pack lacks (or what changed since it was saved) and drop what it no longer has.
 * `progress(done, total)` is in bytes, for this run only.
 */
export interface SaveOptions {
  /** Which of the pack's files to keep on the device (the blog keeps 6 months); the rest are removed. */
  keep?: (f: PackFile) => boolean;
  /** Remembered with the pack: the day this selection was made (auto.ts re-checks dated packs each day). */
  day?: string;
}

export async function savePack(id: string, progress?: (done: number, total: number) => void, signal?: AbortSignal, opts: SaveOptions = {}): Promise<number> {
  const res = await fetch(`/offline/packs/${id}.json`, { cache: 'no-cache', signal });
  if (!res.ok) throw new Error(`pack ${id}: ${res.status}`);
  const def = (await res.json()) as PackDef;
  if (opts.keep) def.files = def.files.filter(opts.keep);
  const cache = await caches.open(cacheName(id));
  const meta: Meta = { build: '', done: false, saved: Date.now(), files: {}, ...(await readMeta(cache)), title: def.title, kind: def.kind, open: def.open };
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).href));
  const abs = (u: string) => new URL(u, location.href).href;
  const todo = def.files.filter((f) => {
    const m = meta.files[f.u];
    return !have.has(abs(f.u)) || !m || (f.h !== undefined && m[0] !== f.h);
  });
  const total = todo.reduce((a, f) => a + f.b, 0);
  let done = 0, sinceWrite = 0;
  if (todo.length) { meta.done = false; await writeMeta(cache, meta); }
  progress?.(0, total);

  const queue = [...todo];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const r = await fetch(f.u, f.x ? { mode: 'cors', credentials: 'omit', cache: 'no-cache', signal } : { cache: 'no-cache', signal });
      if (!r.ok) throw new Error(`${f.u}: ${r.status}`);
      const size = (await r.clone().arrayBuffer()).byteLength;
      try {
        await cache.put(f.u, r);
      } catch (err) {
        if ((err as DOMException)?.name === 'QuotaExceededError') throw new OutOfSpace();
        throw err;
      }
      meta.files[f.u] = [f.h ?? '', size];
      done += f.b;
      progress?.(done, total);
      if (++sinceWrite >= 20) { sinceWrite = 0; await writeMeta(cache, meta); }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, Math.max(1, todo.length)) }, worker));
  } catch (err) {
    queue.length = 0;
    await writeMeta(cache, meta).catch(() => {});
    throw err;
  }
  // Files the new version no longer has.
  const keep = new Set(def.files.map((f) => abs(f.u)));
  keep.add(abs(META));
  for (const r of await cache.keys()) if (!keep.has(new URL(r.url).href)) await cache.delete(r);
  for (const u of Object.keys(meta.files)) if (!keep.has(abs(u))) delete meta.files[u];
  Object.assign(meta, { build: def.build, done: true, saved: Date.now(), day: opts.day });
  await writeMeta(cache, meta);
  // Ask the browser not to clear saved books when the device is short of space (installed apps usually get this).
  void navigator.storage?.persist?.().catch(() => {});
  return sum(meta);
}

/**
 * After a new site build: bring every completely saved pack up to date (only changed files), and drop packs the
 * site no longer offers. Runs at most once per build per device (src/pwa/client.ts decides when).
 */
export async function refreshPacks() {
  const { packs } = await packIndex();
  const offered = new Set(packs.map((p) => p.id));
  for (const s of await savedPacks()) {
    if (isAuto(s.kind)) continue; // auto.ts keeps those
    if (!offered.has(s.id)) { await removePack(s.id); continue; }
    if (!s.done) continue; // a save the reader stopped: theirs to continue
    try { await savePack(s.id); } catch { /* offline or interrupted: next time */ }
  }
}

/** Does any saved pack come from an older build than this page? */
export async function anyStale(build: string) {
  for (const k of await caches.keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const m = await readMeta(await caches.open(k));
    if (m?.done && !isAuto(m.kind) && m.build !== build) return true;
  }
  return false;
}

export function formatBytes(n: number) {
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  return `${n < 1e7 ? (n / 1e6).toFixed(1) : Math.round(n / 1e6)} MB`;
}
