// The site's languages. The URL decides the language, like the mode: /hi/... is Hindi, everything else is English.
// Nothing about the language is stored in the browser, so a shared link always opens in the language it was sent in.
// Only For Everyone pages are translated; For Doctors, the books and the calculators stay in English (docs/translation.md).
// Pure data, no build-time imports: tests import this file directly.

export type Lang = 'en' | 'hi';

export interface LangInfo {
  code: Lang;
  /** The language's own name, shown in the language menu. */
  name: string;
  /** On the language button: as short as it can be read. */
  short: string;
  english: string;
  /** <html lang>, hreflang and schema.org inLanguage. */
  html: string;
  /** og:locale */
  og: string;
  /** date formatting locale (digits stay 0-9) */
  dates: string;
  /** false: built only on preview builds, until Harsh approves the language for the live site. */
  live: boolean;
  /** Who has checked this language's pages: 'ai' (the automated checks and back-translation only) or 'author' (Harsh read them). */
  checkedBy: 'ai' | 'author';
  /** Full stop, where the code itself ends a sentence. */
  stop: string;
  /** The part of "For Everyone" / "For Doctors" that phones hide to make room (English hides the leading "For "). */
  modeAffix: { text: string; at: 'start' | 'end' };
}

export const LANGS: LangInfo[] = [
  { code: 'en', name: 'English', short: 'EN', english: 'English', html: 'en-IN', og: 'en_IN', dates: 'en-IN', live: true, checkedBy: 'author', stop: '.', modeAffix: { text: 'For ', at: 'start' } },
  { code: 'hi', name: 'हिन्दी', short: 'हिं', english: 'Hindi', html: 'hi-IN', og: 'hi_IN', dates: 'hi-IN', live: true, checkedBy: 'ai', stop: '।', modeAffix: { text: ' के लिए', at: 'end' } },
];

export const LANG = Object.fromEntries(LANGS.map((l) => [l.code, l])) as Record<Lang, LangInfo>;

/** The language a URL is in: /hi/... is Hindi, anything else English. */
export function langOf(path: string): Lang {
  const m = path.match(/^\/([a-z]{2})(\/|$)/);
  return m && m[1] !== 'en' && m[1] in LANG ? (m[1] as Lang) : 'en';
}

/** The English path behind a page: /hi/learn/x/ -> /learn/x/. */
export function basePath(path: string): string {
  const lang = langOf(path);
  return lang === 'en' ? path : path.slice(lang.length + 1) || '/';
}

/** The same path in another language (whether that page exists is for routes.ts to say). */
export const inLang = (lang: Lang, path: string) => (lang === 'en' ? path : `/${lang}${path}`);
