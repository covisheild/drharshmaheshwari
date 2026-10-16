// The app's service worker (template). scripts/pwa/integration.mjs fills in BUILD and SHELL and writes it to /sw.js
// after every build; a new build is a new file, so every installed copy picks it up by itself and takes over at once.
//
// What it does, and what it never does:
// - Pages: network first, so the app always shows the latest site when online. Without network, the copy kept on the
//   device (only what Settings keep: nothing else is stored, not even pages just opened); with a slow network that copy
//   is shown after SLOW_MS.
// - /_astro/ and /fonts/ files have hashed or fixed names: served from the device once kept. Icons are not (the logo can
//   change under the same file name): network first, like everything else.
// - /api/ (sign-in, sync) is never touched or cached.
// - Books, figures and trainer audio are never downloaded here. They are kept only when someone taps "Save for
//   offline" (src/pwa/packs.ts, one cache per book or trainer); this file only reads those caches.
// - Guides, calculators, trackers, evidence and recent blog posts are kept as Settings say (src/pwa/auto.ts), also in a
//   cache per pack; this file only reads them.
// - With no network and no kept copy: the offline page, which lists what is saved on the device.

const BUILD = '__BUILD__';
const SHELL = __SHELL__;
const SHELL_CACHE = `shell-${BUILD}`;
const ASSETS = 'assets';
const FONTS = 'fonts';
const ASSETS_MAX = 250;   // scripts, styles and images of pages opened (hashed names, so never stale)
const SLOW_MS = 4000;
const MEDIA_HOST = 'files.drharshmaheshwari.com';
const MATCH = { ignoreVary: true };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      // 'pages': copies of opened pages, kept by earlier versions; pages are now kept only as Settings say.
      if ((k.startsWith('shell-') && k !== SHELL_CACHE) || k === 'pages') await caches.delete(k);
    }
    // Icons kept by earlier versions of this worker (see the fetch handler): drop them, so the current logo is fetched.
    const assets = await caches.open(ASSETS);
    for (const r of await assets.keys()) if (new URL(r.url).pathname.startsWith('/icons/')) await assets.delete(r);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const p = url.pathname;
    if (p.startsWith('/api/') || p === '/sw.js' || p.startsWith('/offline/packs')) return;
    if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
    // Not /icons/: those keep their file names when the logo changes, so a kept copy would show the old logo for ever
    // (16 Oct 2026: the desktop and taskbar icon stayed the old one after a reinstall). Icons go network first, below.
    if (p.startsWith('/_astro/') || p.startsWith('/fonts/')) { e.respondWith(asset(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.hostname === MEDIA_HOST) { e.respondWith(media(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(font(req));
});

/** A kept copy of a page, wherever it is (a saved book or trainer, pages opened before, the shell). */
async function keptPage(href) {
  const u = new URL(href);
  u.hash = ''; u.search = '';
  const tries = [u.href];
  if (!u.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(u.pathname)) tries.push(`${u.href}/`);
  for (const t of tries) {
    const hit = await caches.match(t, { ...MATCH, ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

async function page(e) {
  const req = e.request;
  const kept = keptPage(req.url);
  const net = (async () => (await e.preloadResponse) || (await fetch(req)))();
  // Slow network and a copy on the device: show the copy.
  const slow = new Promise((resolve) => setTimeout(() => kept.then((c) => c && resolve(c)), SLOW_MS));
  try {
    return await Promise.race([net, slow]);
  } catch {
    // The offline page in the page's language (/hi/... -> /hi/offline/), else English.
    const lang = (new URL(req.url).pathname.match(/^\/([a-z]{2})\//) ?? [])[1];
    return (await kept) || (lang && (await caches.match(`/${lang}/offline/`, { cacheName: SHELL_CACHE })))
      || (await caches.match('/offline/', { cacheName: SHELL_CACHE })) || Response.error();
  }
}

async function asset(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') keep(ASSETS, req.url, res.clone(), ASSETS_MAX);
  return res;
}

/** Section text, covers, data files: always fresh when online; from a saved book when not. */
async function networkFirst(req) {
  try {
    return await fetch(req);
  } catch (err) {
    const hit = await caches.match(req, { ...MATCH, ignoreSearch: true });
    if (hit) return ranged(req, hit);
    throw err;
  }
}

/** Figures and trainer audio on R2: from a saved book or trainer if there, else straight from the network (not kept). */
async function media(req) {
  const hit = await caches.match(req.url, MATCH);
  return hit ? ranged(req, hit) : fetch(req);
}

/** Reader fonts (Google Fonts): small, kept once used, so a saved book looks the same offline. */
async function font(req) {
  const hit = await caches.match(req.url, { ...MATCH, cacheName: FONTS });
  if (hit) return hit;
  // Fetched with CORS so the copy is readable (an opaque copy would count as megabytes against the device's quota).
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) { const c = await caches.open(FONTS); await c.put(req.url, res.clone()); }
  return res;
}

async function keep(name, url, res, max) {
  const c = await caches.open(name);
  await c.put(url, res);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

/** Audio players ask for byte ranges; a kept file answers them itself (206), as the server would. */
async function ranged(req, res) {
  const range = req.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
