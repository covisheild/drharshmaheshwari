// Translation lookup. The English text itself is the key: pages are written in English as before, and each other language
// has a dictionary from that English to its translation (src/i18n/<lang>.json). When the English changes, the old entry
// no longer matches, so the page shows the new English instead of an out-of-date translation, and `npm test` lists it.
//   const t = useT(Astro.url.pathname);  t('Tools')  t('Under {cut} cm', { cut: 90 })
//   <T>Text with <a href="/learn/">inline</a> markup</T>   (src/components/T.astro, same dictionary)
// A missing translation is marked so that tests and `npm run i18n:missing` can find it: the string between two invisible
// characters (U+2063 ... U+2060), or an <!--i18n-missing--> comment around a <T> block. The visitor sees the English.

import { langOf, LANG, type Lang } from './languages';
import hi from './hi.json';
import mr from './mr.json';
import bn from './bn.json';
import or from './or.json';
import ta from './ta.json';
import te from './te.json';
import kn from './kn.json';
import ml from './ml.json';
import ur from './ur.json';

export const DICTS: Partial<Record<Lang, Record<string, string>>> = { hi, mr, bn, or, ta, te, kn, ml, ur };

export const MISSING_START = '\u2063', MISSING_END = '\u2060';

/** The dictionary key for a piece of English: whitespace collapsed, Astro's scoped-style attributes removed. */
export const keyOf = (en: string) => en.replace(/\s+data-astro-cid-[a-z0-9]+(="")?/g, '').replace(/\s+/g, ' ').trim();

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

/** The translation of `en`, or undefined when there is none yet. */
export function lookup(lang: Lang, en: string): string | undefined {
  if (lang === 'en') return en;
  const hit = DICTS[lang]?.[keyOf(en)];
  return hit ? hit : undefined;
}

export function translate(lang: Lang, en: string, vars?: Record<string, string | number>): string {
  return fill(lookup(lang, en) ?? (lang === 'en' ? en : MISSING_START + en + MISSING_END), vars);
}

/** t() for the language of a page's URL. */
export const useT = (path: string) => {
  const lang = langOf(path);
  return (en: string, vars?: Record<string, string | number>) => translate(lang, en, vars);
};

/** A <T> block: the translated HTML, or the English marked as missing. */
export function translateHtml(lang: Lang, html: string): string {
  if (lang === 'en') return html;
  const hit = lookup(lang, html);
  return hit ?? `<!--i18n-missing--><span lang="en">${html}</span><!--/i18n-missing-->`;
}

export const fmtDateIn = (lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  d.toLocaleDateString(LANG[lang].dates, opts);
