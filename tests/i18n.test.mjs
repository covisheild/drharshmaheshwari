// Translations (src/i18n/, docs/translation.md). Source checks always run; checks on the built Hindi pages run when the
// build has them (Hindi is built on preview builds until it is live: `WORKERS_CI_BRANCH=preview npm run build && npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks } from '../scripts/i18n/check.mjs';
import { checkPair } from '../scripts/i18n/checks.mjs';
import { fingerprint } from '../src/i18n/fingerprint.ts';
import { LANGS, langOf, basePath } from '../src/i18n/languages.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/client/');
const glossary = JSON.parse(readFileSync(join(ROOT, 'src/i18n/glossary/hi.json'), 'utf8'));

test('every translation passes the automated checks (numbers, links, glossary, structure, banned words, untranslated English)', () => {
  const failed = runChecks().filter((r) => r.errors.length);
  assert.deepEqual(failed.map((r) => `${r.where}: ${r.errors.join('; ')}`), []);
});

test('the checks catch planted errors (negative controls)', () => {
  const g = glossary;
  const en = 'For Indian adults, a BMI of 23 to 24.9 is overweight. See the <a href="/learn/">guides</a>.';
  const ok = 'भारतीय वयस्कों में BMI 23 से 24.9 अधिक वज़न है। <a href="/hi/learn/">गाइड</a> देखें।';
  assert.deepEqual(checkPair(en, ok, g).errors, [], 'the correct translation passes');
  const caught = (tr, what) => assert.ok(checkPair(en, tr, g).errors.some((e) => e.includes(what)), `missed: ${what} in ${tr}`);
  caught(ok.replace('23', '25'), 'numbers differ');
  caught(ok.replace('24.9', '24'), 'numbers differ');
  caught(ok.replace('अधिक वज़न', 'मोटा'), 'glossary');
  caught(ok.replace('href="/hi/learn/"', 'href="/hi/tools/"'), 'links differ');
  caught(ok.replace('<a href="/hi/learn/">गाइड</a>', 'गाइड'), 'links differ');
  caught(ok.replace('देखें', 'see all the other guides here'), 'untranslated English');
  caught(ok + ' दान दें।', 'banned');
  caught(ok.replace('23', '२३'), 'numbers differ');
  assert.ok(checkPair('Do not stop a prescribed medicine.', 'डॉक्टर की लिखी दवा बंद करें।', g).warnings.some((w) => w.includes('negations')), 'a lost "not" is flagged');
});

test('every translated guide was made from the current English (fingerprints match)', async () => {
  for (const l of LANGS.filter((x) => x.code !== 'en')) {
    const dir = join(ROOT, 'src/content/i18n', l.code);
    if (!existsSync(dir)) continue;
    for (const coll of readdirSync(dir)) for (const f of readdirSync(join(dir, coll))) {
      const enFile = join(ROOT, 'src/content', coll, f);
      assert.ok(existsSync(enFile), `${l.code}/${coll}/${f} has no English file`);
      const src = readFileSync(join(dir, coll, f), 'utf8').match(/^source: "?([0-9a-f]+)"?/m)?.[1];
      assert.equal(src, await fingerprint(readFileSync(enFile, 'utf8')), `${l.code}/${coll}/${f} is out of date: the English changed. Retranslate, check, then npm run i18n:status -- --stamp <file>`);
    }
  }
});

test('the dictionary has no empty entries, and every glossary term is used consistently', () => {
  const dict = JSON.parse(readFileSync(join(ROOT, 'src/i18n/hi.json'), 'utf8'));
  assert.deepEqual(Object.entries(dict).filter(([, v]) => !v).map(([k]) => k), []);
  assert.equal(langOf('/hi/learn/x/'), 'hi');
  assert.equal(langOf('/learn/x/'), 'en');
  assert.equal(langOf('/doctors/'), 'en');
  assert.equal(basePath('/hi/'), '/');
  assert.equal(basePath('/hi/learn/x/'), '/learn/x/');
});

// ---------- built pages ----------
const built = existsSync(join(DIST, 'hi/index.html'));
const pages = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out); else if (name === 'index.html') out.push(p);
  }
  return out;
};
const urlOf = (f) => '/' + f.slice(DIST.length).replace(/index\.html$/, '');
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>/g, ' ')
  .replace(/<(\w+)[^>]*\blang="en(-IN)?"[^>]*>[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

test('built Hindi pages: Hindi throughout, nothing left untranslated, linked to their English pages', { skip: !built && 'no Hindi pages in this build (preview builds only)' }, () => {
  const hi = pages(join(DIST, 'hi')).map((f) => [urlOf(f), readFileSync(f, 'utf8')]);
  assert.ok(hi.length >= 10, `only ${hi.length} Hindi pages`);
  for (const [url, doc] of hi) {
    assert.match(doc, /<html lang="hi-IN"/, `${url} lang`);
    assert.doesNotMatch(doc, /⁣|i18n-missing/, `${url} shows English where the dictionary has no Hindi (npm run i18n:missing)`);
    const en = basePath(url);
    assert.match(doc, new RegExp(`<link rel="alternate" hreflang="en-IN" href="https://drharshmaheshwari.com${en}"`), `${url} hreflang to English`);
    assert.match(doc, new RegExp(`<link rel="alternate" hreflang="hi-IN" href="https://drharshmaheshwari.com${url}"`), `${url} hreflang to itself`);
    assert.match(doc, /class="tr-note[^"]*"/, `${url} lacks the translation note`);
    assert.match(doc, new RegExp(`class="tr-note[\\s\\S]*?href="${en}"`), `${url}: the note links to the English page`);
    const text = visible(doc);
    const runs = [...text.matchAll(/(?:\b[A-Za-z][A-Za-z'’-]+\b[ ,]+){3,}[A-Za-z][A-Za-z'’-]+/g)].map((m) => m[0].trim());
    assert.deepEqual(runs, [], `${url} has English text outside lang="en"`);
    for (const ban of glossary.banned) assert.doesNotMatch(text, new RegExp(ban.pattern), `${url}: ${ban.why}`);
    // Header: the mode switch in Hindi, For Everyone pointing to the Hindi home; the language menu offers English.
    const sw = doc.match(/<nav class="mode-switch"[\s\S]*?<\/nav>/)[0];
    const links = [...sw.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]);
    assert.deepEqual(links, [['/hi/', 'सबके लिए'], ['/doctors/', 'डॉक्टरों के लिए']], url);
    assert.match(doc, new RegExp(`class="lang-list"[\\s\\S]*?href="${en}"[^>]*hreflang="en-IN"`), `${url}: language menu links to the English page`);
    const nav = [...(doc.match(/<ul class="nav-links"[\s\S]*?<\/ul>/)?.[0] ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(nav, ['/hi/learn/', '/hi/tools/', '/hi/blog/', '/hi/about/'], `${url} nav stays in Hindi`);
  }
  // Book pages never call the books free, in Hindi either.
  const books = readFileSync(join(DIST, 'hi/books/index.html'), 'utf8');
  for (const ban of glossary.bannedOnBookPages) assert.doesNotMatch(visible(books), new RegExp(ban.pattern), `/hi/books/: ${ban.why}`);
  // The guides and blog post are in Hindi, with the English references kept in English.
  for (const url of ['/hi/learn/bmi-cut-offs-for-indians/', '/hi/learn/waist-to-height-ratio/', '/hi/blog/interpretation-of-the-world/']) {
    const doc = readFileSync(join(DIST, url, 'index.html'), 'utf8');
    assert.match(doc, /<h1>[^<]*[ऀ-ॿ]/, `${url} title in Hindi`);
    assert.match(doc, /"inLanguage":"hi-IN"/, `${url} schema.org language`);
    if (url.includes('/learn/')) assert.match(doc, /<ol lang="en">/, `${url} references kept in English`);
  }
});

test('built English pages offer Hindi when it is built, and are otherwise unchanged by it', { skip: !built && 'no Hindi pages in this build' }, () => {
  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.match(home, /<html lang="en-IN"/);
  assert.match(home, /<link rel="alternate" hreflang="hi-IN" href="https:\/\/drharshmaheshwari\.com\/hi\/"/);
  assert.match(home, /class="lang-list"[\s\S]*?href="\/hi\/"[^>]*hreflang="hi-IN"/);
  assert.doesNotMatch(home, /class="tr-note/, 'English pages carry no translation note');
  // For Doctors stays English: no language menu, no Hindi alternates.
  const doc = readFileSync(join(DIST, 'doctors/index.html'), 'utf8');
  assert.doesNotMatch(doc, /class="lang-menu"/);
  assert.doesNotMatch(doc, /hreflang="hi-IN"/);
  // A page without a Hindi version (the account page, English on purpose) offers the Hindi home page instead.
  const calc = readFileSync(join(DIST, 'account/index.html'), 'utf8');
  assert.match(calc, /class="lang-list"[\s\S]*?href="\/hi\/"[^>]*hreflang="hi-IN"/);
  assert.doesNotMatch(calc, /hreflang="hi-IN" href=/);
});

test('production builds carry no Hindi until it is live', { skip: built && 'this is a preview build' }, () => {
  const hiLive = LANGS.find((l) => l.code === 'hi').live;
  if (hiLive) return;
  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.doesNotMatch(home, /class="lang-menu"|hreflang="hi-IN"/, 'no language menu or Hindi links while Hindi is not live');
});

// Every For Everyone page has a Hindi version, so a visitor reading in Hindi never falls back to English halfway through.
// The exceptions are deliberate (docs/translation.md): the account page (it belongs to the trainers and the book reader,
// which are English) and single book pages (books are always in English). A new For Everyone page must either be added
// to LOCAL_PAGES (src/i18n/routes.ts) with its words translated, or be listed here with the reason.
const ENGLISH_ONLY = [/^\/account\/$/, /^\/books\/[^/]+\/$/, /^\/404\//];
test('every For Everyone page has a Hindi page', { skip: !built && 'no Hindi pages in this build' }, () => {
  const missing = pages(DIST).map(urlOf)
    .filter((u) => !u.startsWith('/doctors/') && !u.startsWith('/hi/') && !u.startsWith('/og/') && !ENGLISH_ONLY.some((r) => r.test(u)))
    .filter((u) => !existsSync(join(DIST, 'hi', u, 'index.html')));
  assert.deepEqual(missing, [], 'For Everyone pages without a Hindi version');
});

// A Hindi page links to the Hindi version of every page that has one: a reader who chose Hindi stays in Hindi.
// Only the translation note's "Read in English" and the language menu point to English on purpose.
test('Hindi pages link to Hindi pages wherever one exists', { skip: !built && 'no Hindi pages in this build' }, () => {
  const wrong = [];
  for (const f of pages(join(DIST, 'hi'))) {
    const doc = readFileSync(f, 'utf8').replace(/<aside class="tr-note[\s\S]*?<\/aside>|<ul class="lang-list"[\s\S]*?<\/ul>|<link [^>]*>/g, '');
    for (const [, href] of doc.matchAll(/href="(\/[^"#?]*)/g)) {
      if (href.startsWith('/hi/') || href.startsWith('/_astro/') || href.startsWith('/og/') || /\.\w+$/.test(href)) continue;
      if (existsSync(join(DIST, 'hi', href, 'index.html'))) wrong.push(`${urlOf(f)} -> ${href}`);
    }
  }
  assert.deepEqual([...new Set(wrong)], []);
});

// The calculators show texts that their calculation libraries write in English (verdicts, labels); the page translates them
// as it shows them. Every such text needs a Hindi entry, or the Hindi page would show it in English.
// Internal values (ids, not shown) are listed here.
const INTERNAL = new Set(['half height', ' (above the range)']);
test('every text a calculation library shows has a Hindi translation', () => {
  const dict = JSON.parse(readFileSync(join(ROOT, 'src/i18n/hi.json'), 'utf8'));
  const libs = new Set();
  for (const f of readdirSync(join(ROOT, 'src/pages/tools'))) {
    for (const m of readFileSync(join(ROOT, 'src/pages/tools', f), 'utf8').matchAll(/'(\/src\/lib\/[\w-]+\.ts)'/g)) libs.add(m[1]);
  }
  assert.ok(libs.size >= 4, `only ${libs.size} calculation libraries found`);
  const missing = [];
  for (const lib of libs) {
    const src = readFileSync(join(ROOT, lib), 'utf8');
    for (const [, s] of src.matchAll(/'((?:\\.|[^'\\\n])*)'/g)) if (/[A-Za-z]{3,} [A-Za-z]/.test(s) && !INTERNAL.has(s) && !(s in dict)) missing.push(`${lib}: ${s}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});
