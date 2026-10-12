// The installable app (PWA), written after every build:
//   /icons/*.png            every icon size, drawn from public/icons/app-icon.svg
//   /offline/packs.json     what can be saved for offline: one pack per book in the reader and per trainer
//   /offline/packs/<id>.json  each pack's files, with a content hash per site file so an update downloads only what changed
//   /sw.js                  the service worker (scripts/pwa/sw.js) with this build's id and its offline shell
//
// A pack is declared by the page that offers it: <OfflineSave> (src/components/OfflineSave.astro) writes
// data-offline-pack / -title / -root / -kind on the page. The pack is every file the site serves under its root
// (pages, section text, data files; never PDFs or zips), every script, style, font and image those pages load,
// the book's figures (from its section files and data-figures), and for a trainer the media it lists in
// <root>/offline-media.json. Nothing here downloads anything to anyone's device; see src/pwa/packs.ts.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ICON = fileURLToPath(new URL('../../public/icons/app-icon.svg', import.meta.url));
const SW = fileURLToPath(new URL('./sw.js', import.meta.url));
// Estimates for files on R2, whose size the build cannot see. Shown as "about".
const FIGURE_BYTES = 120_000;
const SKIP = /\.(pdf|zip)$/i;

export default function pwa({ build, kill = false }) {
  return {
    name: 'pwa',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        await icons(root);
        const files = walk(root);
        const packs = writePacks(root, files, build);
        const shell = ['/offline/', ...[...files.keys()].filter((u) => /^\/[a-z]{2}\/offline\/$/.test(u)), '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
        const shellAll = [...new Set(shell.flatMap((u) => [u, ...deps(root, files, u)]))];
        const sw = kill ? KILL : readFileSync(SW, 'utf8').replace("'__BUILD__'", JSON.stringify(build)).replace('__SHELL__', JSON.stringify(shellAll));
        writeFileSync(join(root, 'sw.js'), sw);
        logger.info(kill ? 'sw.js: KILL SWITCH (unregisters the app on every device)' : `sw.js (build ${build}), ${packs.length} offline packs: ${packs.map((p) => `${p.id} ${(p.bytes / 1e6).toFixed(1)} MB`).join(', ')}`);
      },
    },
  };
}

async function icons(root) {
  const svg = readFileSync(ICON);
  const out = join(root, 'icons');
  mkdirSync(out, { recursive: true });
  const png = (size) => sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 });
  // "any": rounded corners, for desktop and launchers that show the icon as it is. "maskable" and Apple: full square,
  // the system cuts its own shape.
  const rounded = async (size) => {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}"/></svg>`);
    return png(size).composite([{ input: mask, blend: 'dest-in' }]).toBuffer();
  };
  for (const s of [96, 192, 512]) writeFileSync(join(out, `icon-${s}.png`), await rounded(s));
  for (const s of [192, 512]) await png(s).toFile(join(out, `maskable-${s}.png`));
  await png(180).flatten({ background: '#07090d' }).toFile(join(out, 'apple-touch-icon.png'));
}

/** url -> file for everything the site serves. */
function walk(root) {
  const map = new Map();
  const go = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) go(p);
      else {
        let u = '/' + p.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
        if (u.endsWith('/index.html')) u = u.slice(0, -'index.html'.length);
        map.set(u, p);
      }
    }
  };
  go(root);
  return map;
}

const known = (files, u) => files.has(u) ? u : files.has(`${u}/`) ? `${u}/` : null;

/** Every site file a page (or script, or style sheet) loads, followed through imports. */
function deps(root, files, start, seen = new Set()) {
  const out = new Set();
  const visit = (u) => {
    if (seen.has(u)) return;
    seen.add(u);
    const file = files.get(u);
    if (!file) return;
    const text = /\.(html|css|js|mjs)$/.test(file) ? readFileSync(file, 'utf8') : '';
    const found = [];
    const base = u.endsWith('/') ? u : posix.dirname(u) + '/';
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/<(script|link|img|source|video|audio)\b[^>]*>/g)) {
        const tag = m[0];
        if (m[1] === 'link' && /rel="(canonical|alternate|sitemap|prefetch)"/.test(tag)) continue;
        for (const a of tag.matchAll(/\s(?:src|href)="([^"]+)"/g)) found.push(a[1]);
        for (const a of tag.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of a[1].split(',')) found.push(part.trim().split(/\s+/)[0]);
      }
    } else if (file.endsWith('.css')) {
      for (const m of text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) found.push(m[2]);
    } else if (/\.m?js$/.test(file)) {
      for (const m of text.matchAll(/["'`]((?:\.{1,2}\/|\/?_astro\/)[\w.\-/]+\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg))["'`]/g)) {
        found.push(m[1].startsWith('_astro/') ? `/${m[1]}` : m[1]);
      }
    }
    for (const f of found) {
      if (/^(https?:|data:|mailto:|#|\/\/)/.test(f)) continue;
      const abs = posix.normalize(f.startsWith('/') ? f : base + f).split(/[?#]/)[0];
      if (abs.startsWith('/og/')) continue;
      const k = known(files, abs);
      if (k && !k.endsWith('/')) { out.add(k); visit(k); }
    }
  };
  visit(start);
  return out;
}

const hash = (file) => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) ?? [])[1];
const unescapeHtml = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function writePacks(root, files, build) {
  const decl = new Map();
  for (const [u, file] of files) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<[a-z]+\b[^>]*\sdata-offline-pack="([a-z0-9-]+)"[^>]*>/g)) {
      const tag = m[0];
      const d = { id: m[1], title: unescapeHtml(attr(tag, 'data-offline-title') ?? m[1]), kind: attr(tag, 'data-offline-kind') ?? 'book', root: attr(tag, 'data-offline-root') ?? u };
      const prev = decl.get(d.id);
      if (prev && prev.root !== d.root) throw new Error(`offline pack ${d.id} declared with two roots: ${prev.root}, ${d.root}`);
      decl.set(d.id, d);
    }
  }
  const index = [];
  mkdirSync(join(root, 'offline', 'packs'), { recursive: true });
  for (const d of [...decl.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!files.has(d.root)) throw new Error(`offline pack ${d.id}: ${d.root} is not a page`);
    const urls = new Set();
    const remote = new Map(); // url -> estimated bytes
    for (const u of files.keys()) {
      if (!u.startsWith(d.root) || SKIP.test(u) || u === `${d.root}offline-media.json`) continue;
      urls.add(u);
      if (u.endsWith('/')) for (const x of deps(root, files, u)) urls.add(x);
    }
    // A book's figures: the reader's data-figures base + every figure block in its section files.
    const page = readFileSync(files.get(d.root), 'utf8');
    const figBase = (page.match(/<div class="rd"[^>]*\sdata-figures="([^"]*)"/) ?? [])[1];
    if (figBase) {
      for (const u of urls) {
        if (!/\/sections\/[^/]+\.json$/.test(u)) continue;
        const json = JSON.parse(readFileSync(files.get(u), 'utf8'));
        for (const b of json.blocks ?? []) if (b.t === 'figure' && b.src) remote.set(unescapeHtml(figBase) + b.src, FIGURE_BYTES);
      }
    }
    // A trainer's media, listed by its own endpoint (e.g. src/pages/doctors/trainers/auscultation/offline-media.json.ts).
    const mediaList = files.get(`${d.root}offline-media.json`);
    if (mediaList) for (const f of JSON.parse(readFileSync(mediaList, 'utf8')).files) remote.set(f.u, f.b);

    const list = [
      ...[...urls].sort().map((u) => { const f = files.get(u); return { u, h: hash(f), b: statSync(f).size }; }),
      ...[...remote].map(([u, b]) => ({ u, b, x: 1 })),
    ];
    const bytes = list.reduce((a, f) => a + f.b, 0);
    writeFileSync(join(root, 'offline', 'packs', `${d.id}.json`), JSON.stringify({ id: d.id, title: d.title, kind: d.kind, open: d.root, build, files: list }));
    index.push({ id: d.id, title: d.title, kind: d.kind, open: d.root, bytes, count: list.length, approx: remote.size > 0 });
  }
  index.push(...autoPacks(root, files, build, [...decl.values()].map((d) => d.root)));
  writeFileSync(join(root, 'offline', 'packs.json'), JSON.stringify({ build, packs: index }));
  return index;
}

// ---------- automatic packs: the light material, kept by the app without asking (src/pwa/auto.ts, App settings) ----------
// core-<lang>: every page in that language except what is optional or needs the network: the books in the reader and the
// trainers (their own packs, saved only on request), videos (online only), blog posts (below), the account page, a
// doctor's shared tracker view, and the offline page itself (already in the worker's shell).
// blog-<lang>: each blog post with its publication date (d); the device keeps only the last 6 months (auto.ts).
const NOT_AUTO = [/\/videos\//, /^(\/[a-z]{2})?\/offline\/$/, /^\/account\/$/, /\/trackers\/view\//, /^\/404\.html$/, /^\/api\//];
const BLOG_POST = /^(\/[a-z]{2})?\/blog\/[^/]+\/$/;
const langOfPath = (u) => (u.match(/^\/([a-z]{2})\//) ?? [])[1] ?? 'en';

function autoPacks(root, files, build, optionalRoots) {
  const pages = [...files.keys()].filter((u) => u.endsWith('/') && !NOT_AUTO.some((r) => r.test(u)) && !optionalRoots.some((r) => u.startsWith(r)));
  const langs = [...new Set(pages.map(langOfPath))].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
  const out = [];
  const entry = (u, d) => { const f = files.get(u); return { u, h: hash(f), b: statSync(f).size, ...(d ? { d } : {}) }; };
  const write = (id, kind, lang, open, list) => {
    const bytes = list.reduce((a, f) => a + f.b, 0);
    const title = kind === 'core' ? 'Guides, calculators and trackers' : 'Blog posts from the last 6 months';
    writeFileSync(join(root, 'offline', 'packs', `${id}.json`), JSON.stringify({ id, title, kind, lang, open, build, files: list }));
    out.push({ id, title, kind, lang, open, bytes, count: list.length, approx: false });
  };
  for (const lang of langs) {
    const mine = pages.filter((u) => langOfPath(u) === lang);
    const home = lang === 'en' ? '/' : `/${lang}/`;
    // Core: the pages and everything they load.
    const core = new Set();
    for (const u of mine.filter((x) => !BLOG_POST.test(x))) { core.add(u); for (const x of deps(root, files, u)) core.add(x); }
    write(`core-${lang}`, 'core', lang, home, [...core].sort().map((u) => entry(u)));
    // Blog: each post dated; its own pictures share its date, shared scripts and fonts have none (always kept).
    const posts = mine.filter((x) => BLOG_POST.test(x));
    if (!posts.length) continue;
    const dated = new Map();
    for (const u of posts) {
      const html = readFileSync(files.get(u), 'utf8');
      const d = (html.match(/"datePublished":"(\d{4}-\d{2}-\d{2})/) ?? [])[1];
      if (!d) throw new Error(`blog post ${u} has no datePublished`);
      dated.set(u, d);
      for (const x of deps(root, files, u)) {
        if (/^\/(_astro|fonts|icons)\//.test(x)) { if (!dated.has(x)) dated.set(x, ''); }
        else if ((dated.get(x) ?? '') < d) dated.set(x, d); // a picture shared by two posts lives as long as the newer
      }
    }
    write(`blog-${lang}`, 'blog', lang, lang === 'en' ? '/blog/' : `/${lang}/blog/`, [...dated].sort().map(([u, d]) => entry(u, d)));
  }
  return out;
}

// Emergency switch (astro.config.mjs: pwa({ kill: true })): replaces the app's worker on every device with one that
// deletes everything this site kept and unregisters itself; the site then works as a plain website.
const KILL = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
`;

export { deps as _deps, walk as _walk };
