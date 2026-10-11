// Translations (src/i18n/, docs/translation.md). Source checks always run; checks on built pages run for every language the
// build has (a language that is not live yet is built on preview builds only: `WORKERS_CI_BRANCH=preview npm run build && npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks } from '../scripts/i18n/check.mjs';
import { checkPair } from '../scripts/i18n/checks.mjs';
import { fingerprint } from '../src/i18n/fingerprint.ts';
import { LANGS, langOf, basePath } from '../src/i18n/languages.ts';
import { MODES } from '../src/lib/modes.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/client/');
const glossaryOf = (code) => JSON.parse(readFileSync(join(ROOT, `src/i18n/glossary/${code}.json`), 'utf8'));
const dictOf = (code) => JSON.parse(readFileSync(join(ROOT, `src/i18n/${code}.json`), 'utf8'));
const glossary = glossaryOf('hi');
// Languages whose translation has begun (a glossary exists): they must pass every source check.
const STARTED = LANGS.filter((l) => l.code !== 'en' && existsSync(join(ROOT, `src/i18n/glossary/${l.code}.json`)));

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

test('the dictionaries have no empty entries, and the language of a URL is read correctly', () => {
  for (const l of STARTED) assert.deepEqual(Object.entries(dictOf(l.code)).filter(([, v]) => !v).map(([k]) => k), [], `${l.code}.json`);
  assert.equal(langOf('/ta/learn/x/'), 'ta');
  assert.equal(langOf('/hi/learn/x/'), 'hi');
  assert.equal(langOf('/learn/x/'), 'en');
  assert.equal(langOf('/doctors/'), 'en');
  assert.equal(basePath('/hi/'), '/');
  assert.equal(basePath('/hi/learn/x/'), '/learn/x/');
});

// ---------- built pages ----------
const pages = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out); else if (name === 'index.html') out.push(p);
  }
  return out;
};
const urlOf = (f) => '/' + f.slice(DIST.length).replace(/index\.html$/, '');
// The language menu is left out: each language's entry is written in that language.
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>|<ul class="lang-list"[\s\S]*?<\/ul>/g, ' ')
  .replace(/<(\w+)[^>]*\blang="en(-IN)?"[^>]*>[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
// The languages this build has (all live ones; every one on a preview build) whose translation has begun.
const BUILT = existsSync(DIST) ? STARTED.filter((l) => existsSync(join(DIST, l.code, 'index.html'))) : [];

// Every For Everyone page has a version in each language, so a reader never falls back to English halfway through.
// The exceptions are deliberate (docs/translation.md): the account page (it belongs to the trainers and the book reader,
// which are English) and single book pages (books are always in English). A new For Everyone page must either be added
// to LOCAL_PAGES (src/i18n/routes.ts) with its words translated, or be listed here with the reason.
// /trackers/view/ is the doctor's view of a shared link: read by a doctor, so it stays English like the rest of For Doctors.
const ENGLISH_ONLY = [/^\/account\/$/, /^\/books\/[^/]+\/$/, /^\/404\//, /^\/trackers\/view\//];
const LANG_DIR = new RegExp(`^/(${LANGS.filter((l) => l.code !== 'en').map((l) => l.code).join('|')})/`);

for (const l of BUILT) {
  const code = l.code, g = glossaryOf(code), dict = dictOf(code), own = new RegExp(`[${g.script}]`);

  test(`built ${l.english} pages: ${l.english} throughout, nothing left untranslated, linked to their English pages`, () => {
    const all = pages(join(DIST, code)).map((f) => [urlOf(f), readFileSync(f, 'utf8')]);
    assert.ok(all.length >= 10, `only ${all.length} ${l.english} pages`);
    for (const [url, doc] of all) {
      assert.match(doc, new RegExp(`<html lang="${l.html}"`), `${url} lang`);
      // The language menu writes each language's note in that language, so it is checked on that language's own pages.
      assert.doesNotMatch(doc.replace(/<ul class="lang-list"[\s\S]*?<\/ul>/, ''), /\u2063|i18n-missing/, `${url} shows English where the dictionary has no translation (npm run i18n:missing -- ${code})`);
      const en = basePath(url);
      assert.match(doc, new RegExp(`<link rel="alternate" hreflang="en-IN" href="https://drharshmaheshwari.com${en}"`), `${url} hreflang to English`);
      assert.match(doc, new RegExp(`<link rel="alternate" hreflang="${l.html}" href="https://drharshmaheshwari.com${url}"`), `${url} hreflang to itself`);
      assert.match(doc, new RegExp(`class="tr-note[\\s\\S]*?href="${en}"`), `${url}: the translation note links to the English page`);
      const text = visible(doc);
      const runs = [...text.matchAll(/(?:\b[A-Za-z][A-Za-z'’-]+\b[ ,]+){3,}[A-Za-z][A-Za-z'’-]+/g)].map((m) => m[0].trim());
      assert.deepEqual(runs, [], `${url} has English text outside lang="en"`);
      for (const ban of g.banned) assert.doesNotMatch(text, new RegExp(ban.pattern), `${url}: ${ban.why}`);
      // Header: the mode switch in the language, For Everyone pointing to this language's home; the language menu offers English.
      const sw = doc.match(/<nav class="mode-switch"[\s\S]*?<\/nav>/)[0];
      const links = [...sw.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]);
      assert.deepEqual(links, [[`/${code}/`, dict['For Everyone']], ['/doctors/', dict['For Doctors']]], url);
      assert.match(doc, new RegExp(`class="lang-list"[\\s\\S]*?href="${en}"[^>]*hreflang="en-IN"`), `${url}: language menu links to the English page`);
      const nav = [...(doc.match(/<ul class="nav-links"[\s\S]*?<\/ul>/)?.[0] ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(nav, MODES.everyone.nav.map((n) => `/${code}${n.href}`), `${url} nav stays in ${l.english}`);
    }
    // Book pages never call the books free, in any language.
    const books = readFileSync(join(DIST, code, 'books/index.html'), 'utf8');
    for (const ban of g.bannedOnBookPages ?? []) assert.doesNotMatch(visible(books), new RegExp(ban.pattern), `/${code}/books/: ${ban.why}`);
    // Guides and blog posts are translated, with the English references kept in English.
    for (const url of [`/${code}/learn/bmi-cut-offs-for-indians/`, `/${code}/learn/waist-to-height-ratio/`, `/${code}/blog/interpretation-of-the-world/`]) {
      if (!existsSync(join(DIST, url, 'index.html'))) continue; // a draft guide is built on preview builds only
      const doc = readFileSync(join(DIST, url, 'index.html'), 'utf8');
      assert.match(doc, new RegExp(`<h1>[^<]*[${g.script}]`), `${url} title in ${l.english}`);
      assert.match(doc, new RegExp(`"inLanguage":"${l.html}"`), `${url} schema.org language`);
      if (url.includes('/learn/')) assert.match(doc, /<ol lang="en">/, `${url} references kept in English`);
    }
    assert.ok(own.test(visible(readFileSync(join(DIST, code, 'index.html'), 'utf8'))), `/${code}/ is in its own script`);
  });

  test(`every For Everyone page has a ${l.english} page`, () => {
    const missing = pages(DIST).map(urlOf)
      .filter((u) => !u.startsWith('/doctors/') && !LANG_DIR.test(u) && !u.startsWith('/og/') && !ENGLISH_ONLY.some((r) => r.test(u)))
      .filter((u) => !existsSync(join(DIST, code, u, 'index.html')));
    assert.deepEqual(missing, [], `For Everyone pages without a ${l.english} version`);
  });

  // A page links to the same language's version of every page that has one: a reader who chose a language stays in it.
  // Only the translation note's "Read in English" and the language menu point elsewhere on purpose.
  test(`${l.english} pages link to ${l.english} pages wherever one exists`, () => {
    const wrong = [];
    for (const f of pages(join(DIST, code))) {
      const doc = readFileSync(f, 'utf8').replace(/<aside class="tr-note[\s\S]*?<\/aside>|<ul class="lang-list"[\s\S]*?<\/ul>|<link [^>]*>/g, '');
      for (const [, href] of doc.matchAll(/href="(\/[^"#?]*)/g)) {
        if (href.startsWith(`/${code}/`) || href.startsWith('/_astro/') || href.startsWith('/og/') || /\.\w+$/.test(href)) continue;
        if (existsSync(join(DIST, code, href, 'index.html'))) wrong.push(`${urlOf(f)} -> ${href}`);
      }
    }
    assert.deepEqual([...new Set(wrong)], []);
  });
}

test('built English pages offer every built language, and For Doctors stays English', { skip: !BUILT.length && 'no other language in this build' }, () => {
  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.match(home, /<html lang="en-IN"/);
  assert.doesNotMatch(home, /class="tr-note/, 'English pages carry no translation note');
  for (const l of BUILT) {
    assert.match(home, new RegExp(`<link rel="alternate" hreflang="${l.html}" href="https://drharshmaheshwari\\.com/${l.code}/"`));
    assert.match(home, new RegExp(`class="lang-list"[\\s\\S]*?href="/${l.code}/"[^>]*hreflang="${l.html}"`));
  }
  const doc = readFileSync(join(DIST, 'doctors/index.html'), 'utf8');
  assert.doesNotMatch(doc, /class="lang-menu"/);
  assert.doesNotMatch(doc, /hreflang="(?!en-IN|x-default)/);
  // A page without translations (the account page, English on purpose) offers each language's home page instead.
  const acct = readFileSync(join(DIST, 'account/index.html'), 'utf8');
  for (const l of BUILT) assert.match(acct, new RegExp(`class="lang-list"[\\s\\S]*?href="/${l.code}/"[^>]*hreflang="${l.html}"`));
  assert.doesNotMatch(acct, /<link rel="alternate" hreflang="(?!en-IN)/);
});

test('a production build carries only the live languages', { skip: existsSync(DIST) ? false : 'no build' }, () => {
  const preview = LANGS.some((l) => !l.live && existsSync(join(DIST, l.code, 'index.html')));
  if (preview) return; // a preview build carries every language
  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  for (const l of LANGS.filter((x) => !x.live)) assert.doesNotMatch(home, new RegExp(`hreflang="${l.html}"`), `${l.english} is not live yet`);
});

// The calculators show texts that their calculation libraries write in English (verdicts, labels); the page translates them
// as it shows them. Every such text needs a translation in each language, or that language's page would show it in English.
// Internal values (ids, not shown) are listed here.
const INTERNAL = new Set(['half height', ' (above the range)']);
test('every text a calculation library shows has a translation in every language', () => {
  const libs = new Set();
  for (const f of readdirSync(join(ROOT, 'src/pages/tools'))) {
    for (const m of readFileSync(join(ROOT, 'src/pages/tools', f), 'utf8').matchAll(/'(\/src\/lib\/[\w-]+\.ts)'/g)) libs.add(m[1]);
  }
  assert.ok(libs.size >= 4, `only ${libs.size} calculation libraries found`);
  for (const l of STARTED) {
    const dict = dictOf(l.code), missing = [];
    for (const lib of libs) {
      const src = readFileSync(join(ROOT, lib), 'utf8');
      for (const [, s] of src.matchAll(/'((?:\\.|[^'\\\n])*)'/g)) if (/[A-Za-z]{3,} [A-Za-z]/.test(s) && !INTERNAL.has(s) && !(s in dict)) missing.push(`${lib}: ${s}`);
    }
    assert.deepEqual([...new Set(missing)], [], l.code);
  }
});
