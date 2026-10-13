// The site's languages. The URL decides the language, like the mode: /hi/... is Hindi, everything else is English.
// The language the reader chooses in the menu is remembered (only its code, Base.astro); a link from outside opens in the language it was sent in.
// Only For Everyone pages are translated; For Doctors, the books and the calculators stay in English (docs/translation.md).
// Pure data, no build-time imports: tests import this file directly.

export type Lang = 'en' | 'hi' | 'mr' | 'bn' | 'or' | 'ta' | 'te' | 'kn' | 'ml' | 'ur' | 'gu' | 'pa' | 'as';

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
  /** date formatting locale; -u-nu-latn keeps digits 0-9 (Marathi and Bengali would otherwise use their own digits) */
  dates: string;
  /** false: built only on preview builds, until Harsh approves the language for the live site. */
  live: boolean;
  /** Who has checked this language's pages: 'ai' (the automated checks and back-translation only) or 'author' (Harsh read them). */
  checkedBy: 'ai' | 'author';
  /** The script's Unicode block, for checks ("is this text in the language's script?"). */
  script: string;
  /** Full stop, where the code itself ends a sentence. */
  stop: string;
  /** Writing direction: 'rtl' for Urdu (<html dir="rtl">; the layout mirrors, src/styles/global.css). */
  dir?: 'ltr' | 'rtl';
  /** The part of "For Everyone" / "For Doctors" that phones hide to make room (English hides the leading "For "). */
  modeAffix: { text: string; at: 'start' | 'end' };
}

export const LANGS: LangInfo[] = [
  { code: 'en', name: 'English', short: 'EN', english: 'English', html: 'en-IN', og: 'en_IN', dates: 'en-IN', live: true, checkedBy: 'author', script: 'A-Za-z', stop: '.', modeAffix: { text: 'For ', at: 'start' } },
  { code: 'hi', name: 'हिन्दी', short: 'हिं', english: 'Hindi', html: 'hi-IN', og: 'hi_IN', dates: 'hi-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0900-\\u097F', stop: '।', modeAffix: { text: ' के लिए', at: 'end' } },
  // Phase 2 (Harsh, 11 Oct 2026): the four South Indian languages, Marathi, Bengali and Odia. Live 12 Oct 2026 (Harsh).
  { code: 'mr', name: 'मराठी', short: 'म', english: 'Marathi', html: 'mr-IN', og: 'mr_IN', dates: 'mr-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0900-\\u097F', stop: '.', modeAffix: { text: '', at: 'end' } },
  { code: 'bn', name: 'বাংলা', short: 'বা', english: 'Bengali', html: 'bn-IN', og: 'bn_IN', dates: 'bn-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0980-\\u09FF', stop: '।', modeAffix: { text: '', at: 'end' } },
  { code: 'or', name: 'ଓଡ଼ିଆ', short: 'ଓ', english: 'Odia', html: 'or-IN', og: 'or_IN', dates: 'or-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0B00-\\u0B7F', stop: '।', modeAffix: { text: '', at: 'end' } },
  { code: 'ta', name: 'தமிழ்', short: 'த', english: 'Tamil', html: 'ta-IN', og: 'ta_IN', dates: 'ta-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0B80-\\u0BFF', stop: '.', modeAffix: { text: '', at: 'end' } },
  { code: 'te', name: 'తెలుగు', short: 'తె', english: 'Telugu', html: 'te-IN', og: 'te_IN', dates: 'te-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0C00-\\u0C7F', stop: '.', modeAffix: { text: '', at: 'end' } },
  { code: 'kn', name: 'ಕನ್ನಡ', short: 'ಕ', english: 'Kannada', html: 'kn-IN', og: 'kn_IN', dates: 'kn-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0C80-\\u0CFF', stop: '.', modeAffix: { text: '', at: 'end' } },
  { code: 'ml', name: 'മലയാളം', short: 'മ', english: 'Malayalam', html: 'ml-IN', og: 'ml_IN', dates: 'ml-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0D00-\\u0D7F', stop: '.', modeAffix: { text: '', at: 'end' } },
  // Urdu (Harsh, 11 Oct 2026): right to left, Nastaliq. Live 12 Oct 2026 (Harsh).
  { code: 'ur', name: 'اردو', short: 'ار', english: 'Urdu', html: 'ur-IN', og: 'ur_IN', dates: 'ur-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF', stop: '۔', dir: 'rtl', modeAffix: { text: '', at: 'end' } },
  // Phase 4 (Harsh, 12 Oct 2026): Gujarati, Punjabi (Gurmukhi) and Assamese (Bengali script). Live once every test and check passes.
  { code: 'gu', name: 'ગુજરાતી', short: 'ગુ', english: 'Gujarati', html: 'gu-IN', og: 'gu_IN', dates: 'gu-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0A80-\\u0AFF', stop: '.', modeAffix: { text: '', at: 'end' } },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', short: 'ਪੰ', english: 'Punjabi', html: 'pa-IN', og: 'pa_IN', dates: 'pa-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0A00-\\u0A7F', stop: '।', modeAffix: { text: '', at: 'end' } },
  { code: 'as', name: 'অসমীয়া', short: 'অ', english: 'Assamese', html: 'as-IN', og: 'as_IN', dates: 'as-IN-u-nu-latn', live: true, checkedBy: 'ai', script: '\\u0980-\\u09FF', stop: '।', modeAffix: { text: '', at: 'end' } },
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
