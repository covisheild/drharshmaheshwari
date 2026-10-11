// Which pages exist in which language, and links between them.
// A language page lives at /<lang><English path>. It exists when the English page is in LOCAL_PAGES (translated through the
// dictionary) or is a guide/blog post with a translation in src/content/i18n/<lang>/<collection>/<slug>.md.
// Everything else (For Doctors, books, calculators, account) stays English: links to it from a language page go to the English page.
import { getCollection, type CollectionEntry } from 'astro:content';
import { SHOW_DRAFTS } from '../consts';
import { articles } from '../lib/content';
import { LANGS, inLang, type Lang } from './languages';
import { fingerprint } from './fingerprint';
import { translate } from './t';

/** Languages built in this build: English always; another language when live, or on a preview build. */
export const builtLangs = () => LANGS.filter((l) => l.code === 'en' || l.live || SHOW_DRAFTS);
export const otherLangs = () => builtLangs().filter((l) => l.code !== 'en');
export const isBuilt = (lang: Lang) => builtLangs().some((l) => l.code === lang);

/** getStaticPaths for a page that every built language has. */
export const langPaths = () => otherLangs().map((l) => ({ params: { lang: l.code } }));

/** English pages that every built language also has (their words come from the dictionary). */
export const LOCAL_PAGES = ['/', '/learn/', '/blog/', '/tools/', '/tools/bmi-calculator/', '/tools/indian-diabetes-risk-score/', '/tools/stop-bang/', '/books/', '/videos/', '/about/', '/disclaimer/', '/privacy/', '/support/'];

const TRANSLATED = new Set(Object.keys(import.meta.glob('/src/content/i18n/*/*/*.md')).map((k) => {
  const [, , , , lang, coll, file] = k.split('/');
  return `/${lang}/${coll}/${file.replace(/\.md$/, '')}/`;
}));

/** Does this English path have a page in `lang`? */
export function hasPage(lang: Lang, path: string): boolean {
  if (lang === 'en') return true;
  return isBuilt(lang) && (LOCAL_PAGES.includes(path) || TRANSLATED.has(inLang(lang, path)));
}

/** A link for a page in `lang`: its own language's page when there is one, else the English page. */
export function localHref(lang: Lang, href: string): string {
  if (lang === 'en' || !href.startsWith('/') || href.startsWith('//')) return href;
  const [, path, rest] = href.match(/^([^?#]*)(.*)$/)!;
  return hasPage(lang, path) ? inLang(lang, path) + rest : href;
}

// ---------- translated guides and blog posts ----------
export type TranslatedCollection = 'learn' | 'blog';
const RAW = import.meta.glob('/src/content/{learn,blog}/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface LocalArticle {
  entry: CollectionEntry<TranslatedCollection>;
  /** The translation, when there is one. */
  tr?: CollectionEntry<'translations'>;
  /** The English changed after it was translated: the page shows the English with a note. */
  stale: boolean;
}

/** Every built English guide/post, with its translation into `lang` (if any). */
export async function localArticles(collection: TranslatedCollection, lang: Lang): Promise<LocalArticle[]> {
  const english = await articles(collection);
  const trs = await getCollection('translations');
  return Promise.all(english.map(async (entry) => {
    const tr = trs.find((x) => x.id === `${lang}/${collection}/${entry.id}`);
    const stale = !!tr && tr.data.source !== await fingerprint(RAW[`/src/content/${collection}/${entry.id}.md`] ?? '');
    return { entry: entry as CollectionEntry<TranslatedCollection>, tr, stale };
  }));
}

/** getStaticPaths for /<lang>/<collection>/<slug>/: every translated (or once translated) guide. */
export async function articlePaths(collection: TranslatedCollection) {
  const out = [];
  for (const l of otherLangs()) {
    for (const a of await localArticles(collection, l.code)) if (a.tr) out.push({ params: { lang: l.code, slug: a.entry.id }, props: a });
  }
  return out;
}

/** The card for a guide in a list: translated when it can be, else the English, marked as English. */
export function articleCard(lang: Lang, base: string, a: LocalArticle) {
  const local = a.tr && !a.stale;
  const d = local ? { ...a.entry.data, ...a.tr!.data } : a.entry.data;
  return {
    href: a.tr ? inLang(lang, `${base}${a.entry.id}/`) : `${base}${a.entry.id}/`,
    title: d.title, description: d.description, date: a.entry.data.published,
    topic: local ? d.topic[0] : d.topic[0] ? translate(lang, d.topic[0]) : undefined,
    draft: a.entry.data.draft, english: lang !== 'en' && !(a.tr && !a.stale),
  };
}
