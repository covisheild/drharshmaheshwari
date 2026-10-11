// Every guide and blog post, and its translation into each language: fresh, stale (the English changed since) or missing.
//   npm run i18n:status            list
//   npm run i18n:status -- --stamp src/content/i18n/hi/learn/x.md   write the English file's current fingerprint into a translation
// (stamp only after the translation has been brought up to date and passed the checks in docs/translation.md).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint } from '../../src/i18n/fingerprint.ts';
import { LANGS } from '../../src/i18n/languages.ts';

const root = new URL('../../', import.meta.url).pathname;
const stamp = process.argv.indexOf('--stamp');
if (stamp > 0) {
  const file = process.argv[stamp + 1];
  const [, coll, slug] = file.match(/i18n\/[a-z]{2}\/(\w+)\/([\w-]+)\.md$/) ?? [];
  if (!coll) throw new Error(`not a translation file: ${file}`);
  const fp = await fingerprint(readFileSync(join(root, 'src/content', coll, `${slug}.md`), 'utf8'));
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, /^source: .*$/m.test(text) ? text.replace(/^source: .*$/m, `source: "${fp}"`) : text.replace(/^---\n/, `---\nsource: "${fp}"\n`));
  console.log(`${file}: source ${fp}`);
  process.exit(0);
}
let stale = 0;
for (const coll of ['learn', 'blog']) {
  for (const f of readdirSync(join(root, 'src/content', coll)).filter((x) => x.endsWith('.md'))) {
    const fp = await fingerprint(readFileSync(join(root, 'src/content', coll, f), 'utf8'));
    const row = [`${coll}/${f.replace(/\.md$/, '')}`.padEnd(48), fp];
    for (const l of LANGS.filter((x) => x.code !== 'en')) {
      const tf = join(root, 'src/content/i18n', l.code, coll, f);
      if (!existsSync(tf)) { row.push(`${l.code}: missing`); continue; }
      const src = readFileSync(tf, 'utf8').match(/^source: "?([0-9a-f]+)"?/m)?.[1];
      if (src === fp) row.push(`${l.code}: fresh`); else { row.push(`${l.code}: STALE (translated from ${src})`); stale++; }
    }
    console.log(row.join('  '));
  }
}
if (stale) process.exitCode = 1;
