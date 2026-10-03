// Static checks on the built site (dist/client). No dependencies: run `npm run build && npm test`.
// Covers: every URL published before the two-mode redesign still works (directly or by redirect),
// the mode comes from the URL, navigation stays inside its mode, no internal link is broken, and the
// trainer's routes and attribution are in place.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UPI_CONFIG } from '../src/lib/support.ts';

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

test('the build deploys a real Worker (static assets + /api/ runtime), not an assets-only upload', () => {
  // Astro's Cloudflare adapter writes an assets-only config (no Worker, so no secrets or D1) when no route is
  // server-rendered. The /api/ route must keep the Worker; Wrangler deploys whatever the redirect points to.
  const redirect = JSON.parse(readFileSync(new URL('../.wrangler/deploy/config.json', import.meta.url), 'utf8'));
  assert.match(redirect.configPath, /dist\/server\/wrangler\.json$/, `deploy config is ${redirect.configPath}`);
  const cfg = JSON.parse(readFileSync(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
  assert.equal(cfg.main, 'entry.mjs');
  assert.equal(cfg.assets?.binding, 'ASSETS');
  assert.ok(!existsSync(join(DIST, 'wrangler.json')), 'no assets-only config in dist/client');
  // Previews must have their own database, never production's.
  const prod = cfg.d1_databases?.find((d) => d.binding === 'DB'), prev = cfg.previews?.d1_databases?.find((d) => d.binding === 'DB');
  assert.ok(prod?.database_id && prev?.database_id, 'DB bound for production and previews');
  assert.notEqual(prev.database_id, prod.database_id, 'previews use a separate database');
  assert.equal(cfg.vars?.GOOGLE_CLIENT_ID, cfg.previews?.vars?.GOOGLE_CLIENT_ID);
  assert.ok(!JSON.stringify(cfg).includes('GOOGLE_CLIENT_SECRET'), 'the secret is never in the config');
});

test('/support/: one-time UPI only, closed until a UPI ID is configured, linked from every footer', () => {
  const doc = html.get('/support/');
  assert.ok(doc, '/support/ is missing');
  assert.match(doc, /<h1[^>]*>Support this project<\/h1>/);
  assert.match(doc, /Help keep this project free and support its continued development\./);
  assert.match(doc, /core educational resources on this site are intended to remain freely accessible/);
  for (const a of ['₹100', '₹250', '₹500', 'Other amount']) assert.ok(doc.includes(a), `missing option ${a}`);
  assert.doesNotMatch(doc, /<input[^>]*type="radio"[^>]*checked/, 'no amount may be pre-selected');
  const open = /data-open="true"/.test(doc);
  const markup = doc.replace(/<script[\s\S]*?<\/script>/g, '');
  if (!open) {
    assert.match(doc, /Contributions open soon\./);
    assert.doesNotMatch(markup, /upi:\/\/pay|data-qr=|data-upi-id=/, 'no UPI ID, link or QR in the page while closed');
  } else {
    assert.match(doc, /data-qr="any"/, 'open QR (no amount) missing');
    assert.match(doc, /id="upi-copy"/);
    if (UPI_CONFIG.appLink) assert.match(doc, /id="upi-open"[^>]*href="upi:\/\/pay\?pa=/);
    else assert.doesNotMatch(doc, /id="upi-open"/, 'app link must be absent while appLink is off');
    assert.match(doc, /scan it from your gallery/);
  }
  const text = doc.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  // No recurring support anywhere on the page (parked feature).
  assert.doesNotMatch(text, /recurring|regularly|\bweek\b|\/week|\bmonth\b|\/month|autopay|mandate|subscri|cancel anytime/i);
  for (const banned of [/donat/i, /charit/i, /refund polic/i, /money.back/i, /only \d+ left/i, /hurry|last chance|act now|countdown/i, /tax.deductible donation/i]) {
    assert.doesNotMatch(text, banned, `support page uses ${banned}`);
  }
  assert.doesNotMatch(doc, /api\.qrserver|chart\.googleapis|quickchart|qr-code-generator|razorpay|cashfree|payu|juspay/i, 'no third-party QR service or gateway');
  for (const [url, page] of html) {
    if (url.startsWith('/doctors/trainers/auscultation/')) assert.match(page, /href="\/support\/"/, `${url} lacks the quiet support line`);
    else if (/<footer class="site-footer"/.test(page)) assert.match(page.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)[0], /href="\/support\/"/, `${url} footer lacks /support/`);
  }
});

// ---------- Statistics book in the reader (scripts/books/statistics/export.py) ----------
test('the Statistics book is exported whole and its links resolve', () => {
  const base = join(DIST, 'doctors/books/statistics-first-principles-to-regression/read/');
  assert.ok(existsSync(join(base, 'index.html')), 'reader page missing');
  assert.ok(existsSync(join(base, 'review/index.html')), 'review page missing');
  assert.match(readFileSync(join(DIST, 'doctors/books/statistics-first-principles-to-regression/index.html'), 'utf8'),
    /href="\/doctors\/books\/statistics-first-principles-to-regression\/read\/"/, "the book's page does not offer Read online");
  const dir = new URL('../src/data/books/statistics-first-principles-to-regression/', import.meta.url).pathname;
  const book = JSON.parse(readFileSync(join(dir, 'book.json'), 'utf8'));
  const sections = new Map();
  for (const f of readdirSync(join(dir, 'sections'))) {
    const s = JSON.parse(readFileSync(join(dir, 'sections', f), 'utf8'));
    assert.equal(`${s.id}.json`, f);
    sections.set(s.id, s);
  }
  const ids = book.outline.flatMap((p) => p.sections.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length, 'a section id is used twice');
  assert.deepEqual([...sections.keys()].sort(), [...ids].sort(), 'outline and section files differ');
  assert.equal(ids.length, 157);
  const checkpoints = [];
  for (const [id, s] of sections) {
    // A question's id is the section id plus -q<n>: a section id must never look like one (reader/store.ts sectionOf).
    assert.doesNotMatch(id, /-[epkq]\d+$/, `${id} could be mistaken for a question id`);
    assert.ok(existsSync(join(base, 'sections', `${id}.json`)), `${id} is not published`);
    for (const b of s.blocks) {
      if (b.t === 'figure') { assert.ok(b.alt && b.caption && b.w > 0 && b.h > 0, `${id}: a figure lacks alt, caption or size`); assert.match(b.src, /^[\w.-]+\.png$/); }
      if (b.t === 'checkpoint') for (const q of b.questions) { checkpoints.push(`${id}-q${q.n}`); assert.ok(q.prompt && q.answer, `${id}: checkpoint ${b.id} has a question without an answer`); }
      for (const h of [b.html, b.prompt, b.answer, b.caption, b.note]) {
        for (const m of String(h ?? '').matchAll(/class="xref" href="#([\w-]+)" data-sec="([\w-]+)"/g)) assert.ok(ids.includes(m[2]) && m[1] === m[2], `${id}: a § link goes nowhere (${m[1]})`);
      }
    }
  }
  assert.equal(new Set(checkpoints).size, checkpoints.length, 'two checkpoint questions share an id');
  assert.ok(checkpoints.length >= 200, `only ${checkpoints.length} checkpoint questions`);
  // Every section reaches the reader's outline with its words counted.
  for (const p of book.outline) for (const s of p.sections) assert.ok(s.words > 0 || sections.get(s.id).blocks.length === 0, `${s.id} has no words`);
});
