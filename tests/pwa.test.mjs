// The installable app (PWA): manifest, icons, service worker and the "Save for offline" packs, checked on dist/client.
// Run after `npm run build`. The browser side (install, save, read offline) is in tests/e2e.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/client/', import.meta.url).pathname;
const read = (f) => readFileSync(join(DIST, f), 'utf8');
const png = (f) => { const b = readFileSync(join(DIST, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest: installable, one app, short name DrHM, every icon exists at its stated size', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.short_name, 'DrHM');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  const icons = [...m.icons, ...m.shortcuts.flatMap((s) => s.icons ?? [])];
  for (const i of icons) {
    const [w, h] = png(i.src.slice(1));
    assert.equal(`${w}x${h}`, i.sizes, `${i.src} size`);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512'));
  for (const s of m.shortcuts) assert.ok(existsSync(join(DIST, s.url, 'index.html')), `shortcut ${s.url}`);
  assert.deepEqual(png('icons/apple-touch-icon.png'), [180, 180]);
});

test('every page links the manifest and the Apple icon; /app/ is in every footer', () => {
  for (const f of ['index.html', 'doctors/index.html', 'doctors/books/statistics-first-principles-to-regression/index.html', 'doctors/trainers/auscultation/index.html']) {
    const html = read(f);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/, f);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/, f);
  }
  assert.match(read('index.html'), /<footer class="site-footer"[\s\S]*href="\/app\/"[\s\S]*<\/footer>/);
  assert.ok(existsSync(join(DIST, 'app/index.html')));
  assert.match(read('offline/index.html'), /<meta name="robots" content="noindex"/);
  assert.doesNotMatch(read('sitemap-0.xml'), /\/offline\//);
});

test('service worker: never touches /api/, its offline shell exists, and it is never cached by the browser', () => {
  const sw = read('sw.js');
  assert.match(sw, /p\.startsWith\('\/api\/'\)[^\n]*return;/, '/api/ passes straight through');
  assert.doesNotMatch(sw, /__BUILD__|__SHELL__/, 'template filled in');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\n]*\]);/)[1]);
  assert.ok(shell.includes('/offline/'));
  for (const u of shell) assert.ok(existsSync(join(DIST, u.endsWith('/') ? `${u}index.html` : u)), `shell file ${u}`);
  const build = sw.match(/const BUILD = "([^"]+)"/)[1];
  assert.equal(JSON.parse(read('offline/packs.json')).build, build, 'packs and worker come from the same build');
  const headers = read('_headers');
  assert.match(headers, /\/sw\.js\n\s+Cache-Control: no-cache/);
  assert.match(headers, /\/offline\/packs\/\*\n\s+Cache-Control: no-cache/);
});

test('service worker: icons are never served from a kept copy, and old kept icons are dropped (a new logo must reach every device)', () => {
  const sw = read('sw.js');
  const cacheFirst = sw.match(/if \(p\.startsWith\('\/_astro\/'\)[^\n]*respondWith\(asset\(req\)\)/)[0];
  assert.doesNotMatch(cacheFirst, /\/icons\//, 'a fixed icon file name served cache-first shows the old logo for ever');
  assert.match(sw, /startsWith\('\/icons\/'\)\) await assets\.delete\(r\)/, 'activation drops icons kept by earlier workers');
});

test('offline packs: one per reader book and per trainer; site files exist with matching hashes; no PDFs or zips', () => {
  const { packs } = JSON.parse(read('offline/packs.json'));
  const ids = packs.map((p) => p.id);
  assert.ok(ids.includes('book-stats') && ids.includes('book-b0') && ids.includes('trainer-auscultation'), ids.join());
  for (const p of packs) {
    const def = JSON.parse(read(`offline/packs/${p.id}.json`));
    assert.equal(def.open, p.open);
    if (p.kind !== 'blog') assert.ok(def.files.some((f) => f.u === p.open), `${p.id} holds its own page`);
    for (const f of def.files) {
      assert.doesNotMatch(f.u, /\.(pdf|zip)$/i, `${p.id}: ${f.u}`);
      if (f.x) { assert.match(f.u, /^https:\/\/files\.drharshmaheshwari\.com\//); continue; }
      const file = join(DIST, f.u.endsWith('/') ? `${f.u}index.html` : f.u);
      assert.ok(existsSync(file), `${p.id}: ${f.u} missing`);
    }
    assert.equal(p.bytes, def.files.reduce((a, f) => a + f.b, 0));
  }
  // The Statistics book: every section, all 79 figures, the review page, and the scripts the reader runs.
  const stats = JSON.parse(read('offline/packs/book-stats.json'));
  const book = JSON.parse(readFileSync(new URL('../src/data/books/statistics-first-principles-to-regression/book.json', import.meta.url), 'utf8'));
  const secs = book.outline.flatMap((p) => p.sections.map((s) => `${book.url}sections/${s.id}.json`));
  for (const s of secs) assert.ok(stats.files.some((f) => f.u === s), `missing ${s}`);
  assert.equal(stats.files.filter((f) => f.u.includes('/figures/')).length, 79);
  assert.ok(stats.files.some((f) => f.u === `${book.url}review/`));
  assert.ok(stats.files.some((f) => /^\/_astro\/BookReader.*\.js$/.test(f.u)));
  // The trainer: every recording and its waveform.
  const t = JSON.parse(read('offline/packs/trainer-auscultation.json'));
  const recs = JSON.parse(readFileSync(new URL('../src/data/trainers/auscultation/recordings.json', import.meta.url), 'utf8')).recordings;
  assert.equal(t.files.filter((f) => f.u.endsWith('.mp3')).length, recs.length);
  assert.equal(t.files.filter((f) => f.u.endsWith('.peaks.json')).length, recs.length);
  assert.ok(!t.files.some((f) => f.u.endsWith('offline-media.json')));
});

test('a book in the reader and a trainer home offer Save for offline; other pages do not download anything', () => {
  assert.match(read('doctors/books/statistics-first-principles-to-regression/index.html'), /data-offline-pack="book-stats"/);
  assert.match(read('doctors/trainers/auscultation/index.html'), /data-offline-pack="trainer-auscultation"/);
  assert.doesNotMatch(read('doctors/trainers/auscultation/practice/index.html'), /data-offline-pack=/);
  assert.doesNotMatch(read('index.html'), /data-offline-pack=/);
});

test('automatic packs: one per kind and language, each file stored once, nothing optional or online-only', () => {
  const { packs } = JSON.parse(read('offline/packs.json'));
  const ids = packs.map((p) => p.id);
  for (const id of ['base-en', 'guides-en', 'tools-en', 'trackers-en', 'evidence-en', 'blog-en', 'base-hi', 'guides-hi', 'tools-hi', 'trackers-hi', 'blog-hi'])
    assert.ok(ids.includes(id), `${id} missing (${ids.join()})`);
  const files = (id) => JSON.parse(read(`offline/packs/${id}.json`)).files.map((f) => f.u);
  const base = files('base-en');
  for (const u of ['/', '/doctors/', '/settings/', '/app/', '/blog/']) assert.ok(base.includes(u), `base-en lacks ${u}`);
  assert.ok(files('guides-en').includes('/learn/'), 'guides-en has the guides');
  for (const u of ['/tools/bmi-calculator/', '/tools/activity-check/', '/tools/stop-bang/', '/tools/indian-diabetes-risk-score/']) assert.ok(files('tools-en').includes(u), `tools-en lacks ${u}`);
  assert.ok(files('trackers-en').includes('/trackers/') && files('trackers-en').includes('/trackers/person/'), 'trackers-en has the trackers');
  assert.ok(files('evidence-en').includes('/doctors/evidence/'), 'evidence-en has the evidence pages');
  assert.ok(files('base-hi').includes('/hi/') && files('tools-hi').includes('/hi/tools/bmi-calculator/') && files('trackers-hi').includes('/hi/trackers/'));
  const auto = packs.filter((p) => /^(base|guides|tools|trackers|evidence|blog)$/.test(p.kind));
  const seen = new Map();
  for (const p of auto) for (const u of files(p.id)) {
    assert.doesNotMatch(u, /\/videos\/|^\/account\/|\/trackers\/view\/|\/offline\/$/, `${p.id} must not hold ${u}`);
    assert.ok(!u.startsWith('/doctors/books/obesity-expertise/b0/') && !u.startsWith('/doctors/trainers/auscultation/'), `${p.id} holds an optional pack's page ${u}`);
    if (p.lang !== 'en' && !u.startsWith(`/${p.lang}/`) && /\/$/.test(u)) assert.fail(`${p.id} holds a page of another language: ${u}`);
    // Stored once: a file in base-en is in no other pack; a file in a language's base is in none of that language's kinds.
    if (seen.has(u)) {
      const other = seen.get(u);
      assert.ok(!(other === 'base-en' || p.id === 'base-en'), `${u} is in ${other} and ${p.id}`);
      if (other.startsWith('base-') || p.id.startsWith('base-')) assert.notEqual(other.split('-')[1], p.id.split('-')[1], `${u} is in ${other} and ${p.id}`);
    }
    seen.set(u, p.id);
  }
  const blog = JSON.parse(read('offline/packs/blog-en.json')).files;
  const posts = blog.filter((f) => /^\/blog\/[^/]+\/$/.test(f.u));
  assert.ok(posts.length >= 1);
  for (const f of posts) assert.match(f.d ?? '', /^\d{4}-\d{2}-\d{2}$/, `${f.u} has its publication date`);
  assert.ok(blog.every((f) => f.d !== undefined || /^\/(_astro|fonts|icons)\//.test(f.u)), 'only shared scripts, styles and fonts go undated');
  const shell = JSON.parse(read('sw.js').match(/const SHELL = (\[[^\n]*\]);/)[1]);
  assert.ok(shell.includes('/hi/offline/'), 'the Hindi offline page is in the shell');
  assert.doesNotMatch(read('sw.js'), /keep\(PAGES/, 'pages just opened are not kept: only what Settings keep');
});

test('a removed app leaves nothing behind: the manifest names the app for the installed-app check', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.deepEqual(m.related_applications, [{ platform: 'webapp', url: 'https://drharshmaheshwari.com/manifest.webmanifest' }]);
  assert.equal(m.prefer_related_applications, false);
});

test('the header has no theme button; Settings is the last item of the menu', () => {
  for (const f of ['index.html', 'doctors/index.html', 'hi/index.html']) {
    const head = read(f).match(/<header class="site-header"[\s\S]*?<\/header>/)[0];
    assert.doesNotMatch(head, /theme-toggle|app-gear/, `${f}: theme button or gear in the header`);
    assert.match(head, /<li class="nav-settings"><a href="(\/hi)?\/settings\/"/, `${f}: Settings in the menu`);
  }
});

test('the 6-month rule: blogCutoff and the date filter keep the last 6 calendar months only', async () => {
  const { blogCutoff } = await import('../src/pwa/auto.ts');
  assert.equal(blogCutoff(new Date('2026-10-12T10:00:00')), '2026-04-12');
  assert.equal(blogCutoff(new Date('2027-01-31T10:00:00')), '2026-07-31');
  const keep = (d, now) => d >= blogCutoff(new Date(now));
  assert.ok(keep('2026-04-12', '2026-10-12T10:00:00'), 'exactly 6 months old is kept');
  assert.ok(!keep('2026-04-11', '2026-10-12T10:00:00'), 'older is removed');
});

test('Settings: a clean main list of categories; each category with many options is its own screen', () => {
  for (const f of ['settings/index.html', 'hi/settings/index.html']) {
    const doc = read(f);
    const main = doc.match(/<div class="sg-screen" data-screen="main">[\s\S]*?<\/div>\s*<section class="sg-screen"/)[0];
    for (const k of ['content', 'books', 'trainers', 'storage']) {
      assert.match(main, new RegExp(`data-open="${k}"`), `${f}: main list has ${k}`);
      assert.match(doc, new RegExp(`<section class="sg-screen" data-screen="${k}"[^>]*hidden>`), `${f}: ${k} is a screen of its own, closed at first`);
    }
    assert.doesNotMatch(main, /data-keep=|data-packs=|id="sg-clear"/, `${f}: switches and storage actions are inside their categories, not on the main list`);
  }
  const { packs } = JSON.parse(read('offline/packs.json'));
  const groups = new Set(packs.filter((p) => p.kind === 'book').map((p) => p.group));
  assert.ok(groups.has('Obesity Expertise') && groups.size >= 2, `books are grouped by series or shelf (${[...groups]})`);
});
