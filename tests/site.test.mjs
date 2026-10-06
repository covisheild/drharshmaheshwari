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
    // The link text is "For Everyone" / "For Doctors" (the "For " is wrapped in a span that phones hide to make room).
    const links = [...sw.matchAll(/<a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], attrs: m[2], text: m[3].replace(/<[^>]+>/g, '') }));
    assert.deepEqual(links.map((l) => [l.href, l.text]), [['/', 'For Everyone'], ['/doctors/', 'For Doctors']], url);
    const current = links.find((l) => l.attrs.includes('aria-current="true"'))?.text;
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

test('every trainer page has the section nav (current section marked) and links to the CC BY credits', () => {
  for (const [url, doc] of html) {
    if (!url.startsWith(TRAINER)) continue;
    const nav = doc.match(/<nav class="t-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${url} has no trainer nav`);
    assert.equal([...nav.matchAll(/<a /g)].length, 6, url);
    const section = url === TRAINER ? 'Home' : { 'learn/': 'Learn', 'practice/': 'Practice', 'quiz/': 'Quiz', 'review/': 'Review', 'progress/': 'Progress' }[url.slice(TRAINER.length).split('/')[0] + '/'];
    assert.match(nav, new RegExp(`aria-current="page"[^>]*>[\\s\\S]*?<span>${section}</span>`), `${url} should mark ${section}`);
    const foot = doc.match(/<footer class="t-foot"[\s\S]*?<\/footer>/)?.[0] ?? '';
    assert.match(foot, /href="\/disclaimer\/#credits"[^>]*>Recording credits \(CC BY 4\.0\)/, `${url} footer lacks the named link to the recording credits`);
    assert.match(foot, /Real patients may differ/, `${url} footer lacks the short clinical-judgement line`);
    assert.match(foot, /href="\/disclaimer\/"/, `${url} footer lacks the Disclaimer link`);
  }
});

test('/disclaimer/ carries the full CC BY credit for the recordings, the book licence and the medical disclaimer', () => {
  const doc = html.get('/disclaimer/');
  assert.ok(doc, '/disclaimer/ is built');
  const credits = doc.match(/<h2 id="credits">[\s\S]*?(?=<h2 id="support">)/)?.[0] ?? '';
  assert.match(credits, /Torabi Y, Shirani S, Reilly JP/, 'authors named');
  assert.match(credits, /10\.1109\/IEEEDATA\.2025\.3566012/, 'dataset citation');
  assert.match(credits, /zenodo\.org\/records\/15376628/, 'source link');
  assert.match(credits, /creativecommons\.org\/licenses\/by\/4\.0/, 'licence link');
  assert.match(credits, /Changes made here/, 'list of changes (CC BY requires it)');
  assert.match(doc, /<h2 id="books">[\s\S]*?creativecommons\.org\/licenses\/by-nc-sa\/4\.0/, 'book licence section');
  assert.match(doc, /<h2 id="medical">/, 'medical disclaimer section');
  assert.doesNotMatch(doc, /not for diagnosing patients/i, 'wording that would erode trust is not used');
});

test('pages stay clean: the long licence and disclaimer lines are gone from book, series, article and trainer pages', () => {
  for (const [url, doc] of html) {
    if (url === '/disclaimer/') continue;
    assert.doesNotMatch(doc, /Educational, not personal medical advice\.<\/p>|free to copy, share and adapt for non-commercial use, with credit, under the same licence|If (this|these) (book|books|trainer) helps? you|not for diagnosing patients|Progress is saved in this browser only/, `${url} still carries a long disclaimer line`);
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

test('/account/: sign out, delete account and "what is stored" live there, linked from every footer; the reader has no account box', () => {
  const page = html.get('/account/');
  assert.ok(page, '/account/ is built');
  assert.match(page, /<meta name="robots" content="noindex"/, 'the account page stays out of search');
  assert.match(page, /\/privacy\/#accounts/, 'links to what is stored');
  for (const [url, doc] of html) {
    const foot = doc.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0];
    if (foot) assert.match(foot, /href="\/account\/"/, `${url} footer lacks /account/`);
  }
  const reader = [...html].filter(([url]) => /^\/doctors\/books\/obesity-expertise\/[^/]+\/$/.test(url) && html.get(url).includes('id="rd-me"'));
  for (const [url, doc] of reader) {
    assert.doesNotMatch(doc, /id="rd-acct"/, `${url} still has the account box in the contents panel`);
    assert.doesNotMatch(doc, /Delete account/, `${url} offers Delete account`);
  }
});

test('series page: "Find a subject" lists All then every subject in planned order; each subject shows all its books, only released ones linked', () => {
  const doc = html.get('/doctors/books/obesity-expertise/');
  assert.ok(doc, 'series page is built');
  const series = JSON.parse(readFileSync(new URL('../src/data/books/obesity-expertise/series.json', import.meta.url), 'utf8'));
  const subjects = new Map();
  for (const b of series.books) { const k = b.subject ?? b.id; subjects.set(k, [...(subjects.get(k) ?? []), b]); }
  const optionKeys = [...doc.matchAll(/<li role="option"[^>]* data-key="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(optionKeys, ['', ...subjects.keys()], 'All first, then every subject in series.json order');
  // Subjects are numbered 0, 1, 2... in that order (no S01 codes), and the number is the Rung 1 cover's "Book N".
  const shown = [...doc.matchAll(/<span class="o-n"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(shown, [...subjects.keys()].map((_, i) => String(i)), 'subjects are numbered serially');
  [...subjects.values()].forEach((rungs, i) => assert.equal(rungs[0].number, i, `subject ${i} is Book ${i} at Rung 1`));
  assert.doesNotMatch(doc, /Browse by Part|class="pchip"|part-list/, 'no Part chips on the series page');
  assert.doesNotMatch(doc.match(/<ul id="finder-list"[\s\S]*?<\/ul>/)[0], />S\d\d</, 'series codes are not shown in the list');
  for (const [key, rungs] of subjects) {
    const panel = doc.match(new RegExp(`<div class="subject-panel" data-key="${key}"[^>]*>([\\s\\S]*?)</div></div></div>`))?.[1];
    assert.ok(panel, `${key} has a panel`);
    assert.equal((panel.match(/class="sp-book"/g) ?? []).length, rungs.length, `${key} shows all ${rungs.length} books`);
    for (const r of rungs) {
      const out = existsSync(join(DIST, 'doctors/books/obesity-expertise', r.slug, 'index.html'));
      assert.equal(panel.includes(`href="/doctors/books/obesity-expertise/${r.slug}/"`), out, `${r.id}: ${out ? 'released, linked' : 'unreleased, not linked'}`);
    }
  }
});

// ---------- Statistics book in the reader (scripts/books/statistics/export.py) ----------
test('Clinical Medicine is shown as in preparation, without a link, until it has a book', () => {
  const list = readFileSync(join(DIST, 'doctors/books/index.html'), 'utf8');
  assert.match(list, /<div [^>]*class="series-card[^"]*soon/, 'Clinical Medicine card missing or linked');
  assert.match(list, /Clinical Medicine/);
  assert.ok(!existsSync(join(DIST, 'doctors/books/clinical-medicine/index.html')), 'an empty shelf should not have a page');
});

test('book pages never call books "free"', () => {
  const pages = ['doctors/books/index.html', 'doctors/books/public-health/index.html', 'doctors/books/statistics-first-principles-to-regression/index.html',
    'doctors/books/obesity-expertise/index.html', 'doctors/index.html', 'books/index.html', 'index.html', 'llms.txt'];
  for (const f of pages) {
    const text = readFileSync(join(DIST, f), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    assert.doesNotMatch(text, /[Ff]ree (book|PDF|to read|to download|to copy)|free to read|free to download|\bfree books\b/, `${f} calls books free`);
  }
});

test('the Statistics book is exported whole and its links resolve', () => {
  const SB = '/doctors/books/statistics-first-principles-to-regression/';
  const base = join(DIST, SB);
  assert.ok(existsSync(join(base, 'index.html')), 'reader page missing');
  assert.ok(existsSync(join(base, 'review/index.html')), 'review page missing');
  // The book's own address is the reader (like every Obesity Expertise book): no landing page in front of it.
  const page = readFileSync(join(base, 'index.html'), 'utf8');
  assert.match(page, /class="rd" id="rd"/, 'the book address does not open the reader');
  assert.match(page, /data-sections="\/doctors\/books\/statistics-first-principles-to-regression\/sections\/"/);
  assert.ok(!existsSync(join(base, 'read/index.html')), 'the old /read/ page should be a redirect, not a second page');
  assert.equal(resolve(`${SB}read/`), SB);
  assert.equal(resolve(`${SB}read/review/`), `${SB}review/`);
  for (const [from, to] of [[`${SB}read`, SB], [`${SB}read/`, SB], [`${SB}read/review/`, `${SB}review/`], [`${SB}read/sections/c04-s02.json`, `${SB}sections/c04-s02.json`]]) {
    assert.equal(resolve(from), to, `${from} no longer reaches ${to}`);
  }
  // The books list shows a Public Health card (the subject the book is on); it opens the shelf, and the shelf opens the reader.
  const list = readFileSync(join(DIST, 'doctors/books/index.html'), 'utf8');
  assert.match(list, /<a href="\/doctors\/books\/public-health\/"[^>]*class="series-card/, 'the books list has no Public Health card');
  assert.doesNotMatch(list, /class="[^"]*"[^>]*href="\/doctors\/books\/statistics-first-principles-to-regression\/"/, 'the Statistics book is shown beside, not inside, its shelf');
  const shelf = readFileSync(join(DIST, 'doctors/books/public-health/index.html'), 'utf8');
  assert.match(shelf, new RegExp(`class="subj-cover" href="${SB}"`), 'the Public Health shelf does not open the book');
  assert.match(page, /href="\/doctors\/books\/public-health\/"/, 'the book does not link back to its shelf');
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

test('every file the Statistics book reads with read.csv("data/...") is published, and the zip holds them all', () => {
  const root = new URL('../src/data/books/statistics-first-principles-to-regression/', import.meta.url).pathname;
  const base = join(DIST, 'doctors/books/statistics-first-principles-to-regression/data/');
  assert.ok(existsSync(join(base, 'index.html')), 'datasets page missing');
  const wanted = new Set();
  for (const f of readdirSync(join(root, 'sections'))) {
    for (const m of readFileSync(join(root, 'sections', f), 'utf8').matchAll(/data\/([\w.-]+\.csv)/g)) wanted.add(m[1]);
  }
  assert.ok(wanted.size >= 15, `only ${wanted.size} data files are read in the book`);
  const listed = JSON.parse(readFileSync(join(root, 'datasets.json'), 'utf8'));
  for (const name of wanted) {
    assert.ok(existsSync(join(base, name)), `${name} is read by the book but not published`);
    assert.ok(listed.some((d) => d.file === name), `${name} is not on the datasets page`);
  }
  for (const d of listed) {
    const text = readFileSync(join(base, d.file), 'utf8');
    assert.equal(text.trim().split('\n').length - 1, d.rows, `${d.file}: row count differs`);
    assert.match(text, /^"?[\w.]+"?(,"?[\w.]+"?)*\r?\n/, `${d.file}: no header row`);
  }
  // The zip: a stored copy of every file, under data/, so that read.csv("data/<file>") works once unzipped.
  const zip = readFileSync(join(base, 'statsbook-datasets.zip'));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  for (const d of listed) assert.ok(zip.includes(Buffer.from(`data/${d.file}`)), `${d.file} is not in the zip`);
  assert.ok(zip.includes(Buffer.from('data/README.txt')) && zip.includes(Buffer.from('data/make_data.R')));
  assert.match(readFileSync(join(base, 'index.html'), 'utf8'), /synthetic teaching data/i);
});

// ---------- Back button ----------
test('Back button: on every site-chrome page except the two home pages, and every page can reach home through its parents', () => {
  const pages = [];
  const walk = (dir, url) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, `${url}${f}/`);
      else if (f === 'index.html') pages.push(url);
    }
  };
  walk(DIST, '/');
  const parent = (url) => {
    const parts = url.split('/').filter(Boolean); parts.pop();
    return parts.length ? `/${parts.join('/')}/` : '/';
  };
  for (const url of pages) {
    const html = readFileSync(fileFor(url), 'utf8');
    const hasHeader = html.includes('class="site-header"');
    const m = html.match(/<a class="back-btn" href="([^"]+)"/);
    if (url === '/' || url === '/doctors/') { assert.ok(!m, `${url} (a home page) has no Back button`); continue; }
    if (!hasHeader) continue; // trainer and reader pages bring their own top bar with a back arrow
    assert.ok(m, `${url} has a Back button`);
    assert.equal(m[1], parent(url), `${url} Back goes one level up`);
    let u = url, hops = 0;
    while (u !== '/') { u = parent(u); assert.ok(fileFor(u), `${u} exists (parent chain of ${url})`); assert.ok(++hops < 12); }
  }
});
