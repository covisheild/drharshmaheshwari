// The automated checks every translation must pass (docs/translation.md, step 3). Pure functions, no build needed:
// tests/i18n.test.mjs runs them on the dictionaries and the translated guides; `npm run i18n:check` prints the problems.
// They catch what a machine can catch: a changed number, a lost link, a dropped paragraph, a glossary term not used,
// an English sentence left untranslated, a banned word. Meaning is checked separately, by back-translation (step 4).

// Text without markup, links and addresses. english: false also drops text kept in English on purpose (<span lang="en">).
const strip = (s, english = true) => (english ? s : s.replace(/<span lang="en">[\s\S]*?<\/span>/g, ' '))
  .replace(/\]\([^)]*\)/g, ']')                           // markdown link targets
  .replace(/<[^>]+>/g, ' ')                               // HTML tags and their attributes
  .replace(/https?:\/\/\S+|mailto:\S+|[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
  .replace(/\{\w+\}/g, ' ')                                // {placeholders}: filled in by the program
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

// Nukta, chandrabindu and anusvara spellings vary (ज़/ज, आँ/आं): compare without them.
const fold = (s) => s.normalize('NFC').replace(/़/g, '').replace(/ँ/g, 'ं').toLowerCase();

/** Every number, in order of size, with thousands separators removed. List numbering ("1. ") is not counted. */
export function numbers(text) {
  const t = strip(text).replace(/^\s*\d+\.\s/gm, ' ');
  return [...t.matchAll(/(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, '')).sort();
}

/** Internal and external link targets, HTML and markdown. */
export function links(text) {
  return [...text.matchAll(/href="([^"]*)"|\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? m[2]);
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s) => [...s.matchAll(/<(b|i|em|strong|a|code)\b/g)].map((m) => m[1]).sort();
const latinRuns = (s) => [...strip(s, false).matchAll(/(?:\b[A-Za-z][A-Za-z'’-]*\b[ ,]+){3,}[A-Za-z][A-Za-z'’-]*/g)].map((m) => m[0].trim());
// Share of the letters that are in the language's own script (glossary "script", a Unicode range such as \\u0B80-\\u0BFF).
const scriptShare = (s, range) => {
  const t = strip(s, false);
  const own = (t.match(new RegExp(`[${range}]`, 'g')) ?? []).length, latin = (t.match(/[A-Za-z]/g) ?? []).length;
  return own + latin ? own / (own + latin) : 1;
};
const termRe = (en) => new RegExp(`(?<![\\w-])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?(?![\\w])`, 'i');

/**
 * Problems with one translated text. `kind`: 'string' (dictionary entry) or 'markdown' (a guide's body or field).
 * Returns { errors, warnings } as arrays of strings.
 */
export function checkPair(en, tr, glossary, { lang = 'hi', exempt = [] } = {}) {
  const errors = [], warnings = [];
  const a = numbers(en).join(' '), b = numbers(tr).join(' ');
  if (a !== b) errors.push(`numbers differ: English [${a}] vs translation [${b}]`);
  const la = links(en), lb = links(tr);
  if (la.length !== lb.length || la.some((h, i) => lb[i] !== h && lb[i] !== `/${lang}${h}`)) errors.push(`links differ: [${la.join(' ')}] vs [${lb.join(' ')}]`);
  if (placeholders(en).join() !== placeholders(tr).join()) errors.push(`placeholders differ: {${placeholders(en)}} vs {${placeholders(tr)}}`);
  const ta = tags(en).join(), tb = tags(tr).join();
  if (ta !== tb) errors.push(`inline markup differs: <${ta}> vs <${tb}>`);
  // Proper names (glossary "names") are transliterated, not translated: their words do not count as glossary terms.
  const plainEn = (glossary.names ?? []).reduce((t, n) => t.split(n).join(' '), strip(en));
  for (const term of glossary.terms) {
    if (exempt.includes(term.en) || !termRe(term.en).test(plainEn)) continue;
    const ok = term[lang] ?? term.tr; // the accepted forms: keyed by the language code (hi.json) or "tr"
    if (!ok.some((h) => fold(tr).includes(fold(h)))) errors.push(`glossary: "${term.en}" must be translated as ${ok.map((h) => `"${h}"`).join(' or ')}`);
  }
  for (const ban of glossary.banned) if (new RegExp(ban.pattern).test(strip(tr, false))) errors.push(`banned word /${ban.pattern}/: ${ban.why}`);
  for (const run of latinRuns(tr)) errors.push(`untranslated English: "${run}"`);
  const share = scriptShare(tr, glossary.script ?? '\\u0900-\\u097F');
  if ((strip(en).match(/[A-Za-z]{2,}/g) ?? []).length >= 5 && share < 0.5) errors.push(`mostly not in the language's script (${Math.round(share * 100)}%)`);
  const ratio = strip(tr).length / Math.max(1, strip(en).length);
  if (strip(en).length > 60 && (ratio < 0.6 || ratio > 1.8)) warnings.push(`length ratio ${ratio.toFixed(2)} (dropped or added text?)`);
  const negEn = (plainEn.match(/\b(not|no|never|don't|doesn't|cannot|can't|isn't|aren't|nothing|without)\b|n't\b/gi) ?? []).length;
  // The language's words for "not", "no", "without" (glossary "negations").
  const negTr = (glossary.negations ?? []).reduce((n, word) => n + strip(tr).split(word).length - 1, 0);
  if (negEn > negTr) warnings.push(`fewer negations (${negTr}) than the English (${negEn}): check that no "not" was lost`);
  return { errors, warnings };
}

/** Line counts of the markdown structure: headings, list items, table rows, quotes, bold spans. */
export function structure(md) {
  const lines = md.split('\n');
  return {
    headings: lines.filter((l) => /^#{1,6}\s/.test(l)).length,
    listItems: lines.filter((l) => /^\s*([-*+]|\d+\.)\s/.test(l)).length,
    tableRows: lines.filter((l) => /^\|/.test(l)).length,
    quotes: lines.filter((l) => /^>/.test(l)).length,
    bold: (md.match(/\*\*[^*]+\*\*/g) ?? []).length,
    paragraphs: md.split(/\n\s*\n/).filter((p) => p.trim()).length,
  };
}

/** A translated guide against its English: every field and the body, plus the structure. */
export function checkArticle(en, tr, glossary, opts = {}) {
  const errors = [], warnings = [];
  const add = (where, r) => { errors.push(...r.errors.map((e) => `${where}: ${e}`)); warnings.push(...r.warnings.map((w) => `${where}: ${w}`)); };
  for (const f of ['title', 'description']) add(f, checkPair(en.data[f] ?? '', tr.data[f] ?? '', glossary, opts));
  for (const f of ['keyPoints', 'faq', 'topic']) {
    const ea = en.data[f] ?? [], ta = tr.data[f] ?? [];
    if (ea.length !== ta.length) errors.push(`${f}: ${ea.length} in English, ${ta.length} translated`);
    ea.forEach((x, i) => {
      if (f === 'faq') { add(`faq ${i + 1} q`, checkPair(x.q, ta[i]?.q ?? '', glossary, opts)); add(`faq ${i + 1} a`, checkPair(x.a, ta[i]?.a ?? '', glossary, opts)); }
      else if (f === 'keyPoints') add(`key point ${i + 1}`, checkPair(x, ta[i] ?? '', glossary, opts));
    });
  }
  const se = structure(en.body), st = structure(tr.body);
  for (const k of Object.keys(se)) if (se[k] !== st[k]) errors.push(`body: ${k} ${se[k]} in English, ${st[k]} translated`);
  // The body paragraph by paragraph, so a problem is reported where it is.
  const pe = en.body.split(/\n\s*\n/).filter((p) => p.trim()), pt = tr.body.split(/\n\s*\n/).filter((p) => p.trim());
  if (pe.length === pt.length) pe.forEach((p, i) => add(`body paragraph ${i + 1}`, checkPair(p, pt[i], glossary, opts)));
  else add('body', checkPair(en.body, tr.body, glossary, opts));
  return { errors, warnings };
}

/** Splits a markdown file into its YAML front matter (parsed with `parse`) and body. */
export function splitMd(raw, parse) {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { data: parse(m[1]) ?? {}, body: m[2].trim() } : { data: {}, body: raw.trim() };
}
