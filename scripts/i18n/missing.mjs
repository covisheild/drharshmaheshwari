// Lists the English text that a language's pages show untranslated, from a preview build:
//   WORKERS_CI_BRANCH=preview npm run build && npm run i18n:missing -- hi
// Each line is a dictionary key (src/i18n/<lang>.json) still needed. A key with {placeholders} is printed filled in;
// write the template from the source. With --json, prints a JSON object of the keys with empty values, to paste and fill.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const lang = process.argv.find((a) => /^[a-z]{2}$/.test(a)) ?? 'hi';
const root = new URL(`../../dist/client/${lang}/`, import.meta.url).pathname;
if (!existsSync(root)) { console.error(`No ${root}: build a preview first (WORKERS_CI_BRANCH=preview npm run build).`); process.exit(1); }
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : f.endsWith('.html') && files.push(p); } };
walk(root);
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const keyOf = (en) => en.replace(/\s+data-astro-cid-[a-z0-9]+(="")?/g, '').replace(/\s+/g, ' ').trim();
const found = new Map();
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<!--i18n-missing--><span lang="en">([\s\S]*?)<\/span><!--\/i18n-missing-->/g)) found.set(keyOf(m[1]), f);
  for (const m of html.matchAll(/⁣([^⁣⁠]*)⁠/g)) {
    // JSON inside an attribute (data-words) is escaped twice.
    let k = unescape(m[1]);
    if (k.includes('\\"')) k = k.replace(/\\"/g, '"');
    found.set(keyOf(k), f);
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries([...found.keys()].map((k) => [k, ''])), null, 2));
else for (const [k, f] of found) console.log(`${f.slice(root.length)}\t${k}`);
console.error(`${found.size} untranslated in ${files.length} ${lang} pages`);
