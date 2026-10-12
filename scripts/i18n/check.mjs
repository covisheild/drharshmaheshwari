// Runs the automated translation checks (scripts/i18n/checks.mjs) on every dictionary and translated guide, and prints
// errors and warnings. `npm run i18n:check` (all languages) or `npm run i18n:check -- <lang>`. tests/i18n.test.mjs runs the same checks and fails on any error.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { checkArticle, checkPair, splitMd } from './checks.mjs';

const root = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

export function runChecks(only) {
  const out = [];
  for (const lang of readdirSync(join(root, 'src/i18n/glossary')).map((f) => f.replace('.json', '')).filter((l) => !only || l === only)) {
    const glossary = JSON.parse(read(`src/i18n/glossary/${lang}.json`));
    const dict = JSON.parse(read(`src/i18n/${lang}.json`));
    for (const [en, tr] of Object.entries(dict)) {
      if (!tr) continue;
      out.push({ lang, where: `${lang}.json "${en.slice(0, 70)}${en.length > 70 ? '…' : ''}"`, ...checkPair(en, tr, glossary, { lang }) });
    }
    const dir = join(root, 'src/content/i18n', lang);
    if (!existsSync(dir)) continue;
    for (const coll of readdirSync(dir)) for (const f of readdirSync(join(dir, coll))) {
      const en = splitMd(read(`src/content/${coll}/${f}`), yaml.load);
      const tr = splitMd(read(`src/content/i18n/${lang}/${coll}/${f}`), yaml.load);
      out.push({ lang, where: `${lang}/${coll}/${f}`, ...checkArticle(en, tr, glossary, { lang }) });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let errors = 0;
  for (const r of runChecks(process.argv[2])) { // `npm run i18n:check -- ta`: one language only
    for (const e of r.errors) { console.log(`ERROR ${r.where}: ${e}`); errors++; }
    for (const w of r.warnings) console.log(`warn  ${r.where}: ${w}`);
  }
  console.log(errors ? `${errors} errors` : 'no errors');
  process.exitCode = errors ? 1 : 0;
}
