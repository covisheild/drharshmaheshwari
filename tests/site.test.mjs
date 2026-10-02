// Static checks on the built site (dist/client). No dependencies: run `npm run build && npm test`.
// Covers: every URL published before the two-mode redesign still works (directly or by redirect),
// the mode comes from the URL, navigation stays inside its mode, no internal link is broken, and the
// trainer's routes and attribution are in place.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/client/', import.meta.url).pathname;

// Every URL production served on 1 Oct 2026 (built from main 855f55b). Never remove one.
const PUBLISHED = [
  '/', '/about/', '/blog/', '/books/', '/books/statistics-first-principles-to-regression/', '/clinicians/',
  '/disclaimer/', '/learn/', '/privacy/', '/tools/', '/tools/bmi-calculator/', '/videos/',
  '/rss.xml', '/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap-index.xml', '/sitemap-0.xml', '/404.html',
];

const TRAINER = '/doctors/trainers/auscultation/';
const TRAINER_ROUTES = ['', 'learn/', 'practice/', 'quiz/', 'review/', 'progress/'].map((p) => TRAINER + p);
const FINDING_SLUGS = ['normal-heart-sounds', 's3', 's4', 'early-systolic-murmur', 'mid-systolic-murmur', 'late-systolic-murmur',
  'late-diastolic-murmur', 'atrial-fibrillation', 'tachycardia', 'av-block', 'normal-breath-sounds', 'wheeze', 'rhonchi',
  'fine-crackles', 'coarse-crackles', 'pleural-rub', 'heart-and-lungs-together'];

// ---------- helpers ----------
const fileFor = (url) => {
  const p = join(DIST, decodeURIComponent(url));
  if (url.endsWith('/')) return existsSync(join(p, 'index.html')) ? join(p, 'index.html') : null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  return existsSync(join(p, 'index.html')) ? join(p, 'index.html') : null;
};

const redirects = readFileSync(join(DIST, '_redirects'), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => { const [from, to, status] = l.split(/\s+/); return { from, to, status: Number(status) }; });

/** Where a URL ends up: itself if it exists, else its redirect target (followed), else null. */
function resolve(url, depth = 0) {
  if (depth > 5) return null;
  for (const r of redirects) {
    if (r.from.endsWith('*')) {
      const prefix = r.from.slice(0, -1);
      if (url.startsWith(prefix)) return resolve(r.to.replace(':splat', url.slice(prefix.length)), depth + 1);
    } else if (r.from === url) return resolve(r.to, depth + 1);
  }
  return fileFor(url) ? url : null;
}

function pages(dir = DIST, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}
const urlOf = (file) => '/' + file.slice(DIST.length).replace(/index\.html$/, '').replace(/\\/g, '/');
const html = new Map(pages().map((f) => [urlOf(f), readFileSync(f, 'utf8')]));
const navHrefs = (doc) => [...(doc.match(/<ul class="nav-links"[\s\S]*?<\/ul>/)?.[0] ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

// ---------- tests ----------
test('every previously published URL still works, directly or through a 301', () => {
  for (const url of PUBLISHED) {
    const end = resolve(url);
    assert.ok(end, `${url} is broken`);
    if (end !== url) assert.ok(redirects.some((r) => r.status === 301 && (r.from === url || url.startsWith(r.from.replace(/\*$/, '')))), `${url} redirects without a 301`);
  }
  assert.equal(resolve('/clinicians/'), '/doctors/evidence/');
  assert.equal(resolve('/clinicians/any-old-article/'), null, 'redirect target pattern stays inside /doctors/evidence/');
  assert.equal(resolve('/books/statistics-first-principles-to-regression/'), '/doctors/books/statistics-first-principles-to-regression/');
  assert.equal(resolve('/books/statistics-first-principles-to-regression'), '/doctors/books/statistics-first-principles-to-regression/');
});

test('the mode comes from the URL', () => {
  for (const [url, doc] of html) {
    if (url === '/404.html') continue;
    const mode = doc.match(/<html[^>]*data-mode="([a-z]+)"/)?.[1];
    assert.equal(mode, url.startsWith('/doctors/') ? 'doctors' : 'everyone', `${url} has data-mode=${mode}`);
  }
});

test('every page has the mode switch with the exact labels, marking the current mode', () => {
  for (const [url, doc] of html) {
    if (url === '/404.html') continue;
    const sw = doc.match(/<nav class="mode-switch"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(sw, `${url} has no mode switch`);
    assert.match(sw, /href="\/"[^>]*>For Everyone</, url);
    assert.match(sw, /href="\/doctors\/"[^>]*>For Doctors</, url);
    const current = sw.match(/aria-current="true"[^>]*>([^<]+)</)?.[1];
    assert.equal(current, url.startsWith('/doctors/') ? 'For Doctors' : 'For Everyone', url);
    assert.doesNotMatch(doc, />\s*General\s*</, `${url} uses the word "General" as a label`);
  }
});

test('header navigation stays inside the current mode', () => {
  for (const [url, doc] of html) {
    const hrefs = navHrefs(doc);
    if (!hrefs.length) continue; // trainer pages use the app shell instead
    for (const h of hrefs) {
      if (url.startsWith('/doctors/')) assert.ok(h.startsWith('/doctors/'), `${url}: doctors nav links to ${h}`);
      else assert.ok(!h.startsWith('/doctors/'), `${url}: everyone nav links to ${h}`);
    }
  }
  assert.deepEqual(navHrefs(html.get('/doctors/')), ['/doctors/evidence/', '/doctors/trainers/', '/doctors/tools/', '/doctors/books/', '/doctors/videos/']);
  assert.deepEqual(navHrefs(html.get('/')), ['/learn/', '/tools/', '/books/', '/videos/', '/blog/', '/about/']);
});

test('no internal link is broken', () => {
  const broken = [];
  for (const [url, doc] of html) {
    for (const [, href] of doc.matchAll(/href="(\/[^"#?]*)/g)) {
      if (href.startsWith('//') || href.startsWith('/_astro/')) continue;
      if (!resolve(href)) broken.push(`${url} -> ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('the trainer lives at /doctors/trainers/auscultation/ with every section and Learn page', () => {
  for (const r of TRAINER_ROUTES) assert.ok(html.has(r), `missing ${r}`);
  for (const s of FINDING_SLUGS) assert.ok(html.has(`${TRAINER}learn/${s}/`), `missing learn page ${s}`);
  assert.ok(!existsSync(join(DIST, 'tools/trainers')), 'the prototype URL /tools/trainers/ must not be built');
});

test('every trainer page has the section nav (current section marked) and the CC BY attribution', () => {
  for (const [url, doc] of html) {
    if (!url.startsWith(TRAINER)) continue;
    const nav = doc.match(/<nav class="t-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${url} has no trainer nav`);
    assert.equal([...nav.matchAll(/<a /g)].length, 6, url);
    const section = url === TRAINER ? 'Home' : { 'learn/': 'Learn', 'practice/': 'Practice', 'quiz/': 'Quiz', 'review/': 'Review', 'progress/': 'Progress' }[url.slice(TRAINER.length).split('/')[0] + '/'];
    assert.match(nav, new RegExp(`aria-current="page"[^>]*>[\\s\\S]*?<span>${section}</span>`), `${url} should mark ${section}`);
    assert.match(doc, /creativecommons\.org\/licenses\/by\/4\.0/, `${url} lacks the CC BY 4.0 link`);
    assert.match(doc, /10\.1109\/IEEEDATA\.2025\.3566012/, `${url} lacks the dataset citation`);
  }
});

test('sitemap and llms.txt point to the new locations only', () => {
  const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
  assert.match(sitemap, /\/doctors\/trainers\/auscultation\//);
  assert.match(sitemap, /\/doctors\/books\/statistics-first-principles-to-regression\//);
  assert.doesNotMatch(sitemap, /\/clinicians\//);
  assert.doesNotMatch(sitemap, /drharshmaheshwari\.com\/books\/statistics/);
  assert.doesNotMatch(sitemap, /\/tools\/trainers\//);
  const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
  assert.match(llms, /\/doctors\/trainers\/auscultation\//);
  assert.match(llms, /\/doctors\/books\/statistics-first-principles-to-regression\//);
});
