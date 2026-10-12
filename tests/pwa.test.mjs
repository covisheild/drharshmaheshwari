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

test('automatic packs: the light pages in each language, recent blog posts dated, nothing optional or online-only', () => {
  const { packs } = JSON.parse(read('offline/packs.json'));
  const ids = packs.map((p) => p.id);
  for (const id of ['core-en', 'core-hi', 'blog-en', 'blog-hi']) assert.ok(ids.includes(id), `${id} missing (${ids.join()})`);
  const core = JSON.parse(read('offline/packs/core-en.json')).files.map((f) => f.u);
  for (const u of ['/', '/learn/', '/tools/bmi-calculator/', '/tools/activity-check/', '/tools/stop-bang/', '/tools/indian-diabetes-risk-score/', '/trackers/', '/trackers/person/', '/doctors/', '/app/settings/'])
    assert.ok(core.includes(u), `core-en lacks ${u}`);
  for (const u of core) {
    assert.doesNotMatch(u, /\/videos\/|^\/hi\/|^\/account\/|\/trackers\/view\/|^\/blog\/[^/]+\/$/, `core-en must not hold ${u}`);
    assert.ok(!u.startsWith('/doctors/books/obesity-expertise/b0/') && !u.startsWith('/doctors/trainers/auscultation/'), `core-en holds an optional pack's page ${u}`);
  }
  const hi = JSON.parse(read('offline/packs/core-hi.json')).files.map((f) => f.u);
  assert.ok(hi.includes('/hi/') && hi.includes('/hi/tools/bmi-calculator/') && hi.includes('/hi/trackers/'), 'core-hi has the Hindi pages');
  assert.ok(hi.every((u) => u.startsWith('/hi/') || /^\/(_astro|fonts|icons)\/|^\/[^/]+\.\w+$/.test(u) || /^\/[a-z-]+\/[^/]+\.(svg|png|webp|jpg)$/.test(u)), 'core-hi holds only Hindi pages and what they load');
  const blog = JSON.parse(read('offline/packs/blog-en.json')).files;
  const posts = blog.filter((f) => /^\/blog\/[^/]+\/$/.test(f.u));
  assert.ok(posts.length >= 1);
  for (const f of posts) assert.match(f.d ?? '', /^\d{4}-\d{2}-\d{2}$/, `${f.u} has its publication date`);
  assert.ok(blog.every((f) => f.d !== undefined || /^\/(_astro|fonts|icons)\//.test(f.u)), 'only shared scripts, styles and fonts go undated');
  const shell = JSON.parse(read('sw.js').match(/const SHELL = (\[[^\n]*\]);/)[1]);
  assert.ok(shell.includes('/hi/offline/'), 'the Hindi offline page is in the shell');
});

test('the 6-month rule: blogCutoff and the date filter keep the last 6 calendar months only', async () => {
  const { blogCutoff } = await import('../src/pwa/auto.ts');
  assert.equal(blogCutoff(new Date('2026-10-12T10:00:00')), '2026-04-12');
  assert.equal(blogCutoff(new Date('2027-01-31T10:00:00')), '2026-07-31');
  const keep = (d, now) => d >= blogCutoff(new Date(now));
  assert.ok(keep('2026-04-12', '2026-10-12T10:00:00'), 'exactly 6 months old is kept');
  assert.ok(!keep('2026-04-11', '2026-10-12T10:00:00'), 'older is removed');
});
