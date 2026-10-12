// App settings (/app/settings/): this device's choices for the app. Kept in this browser only, never sent anywhere.
// Pages read and change them only through this file. A choice not made yet follows a default:
//  * Keeping the light material offline (guides, calculators, trackers; recent blog posts): on in the installed app,
//    off in a plain browser tab, so a one-time visitor never downloads more than the pages they open.
//  * The second language kept offline (English is always kept): the last language other than English this device read
//    the site in, else the browser's own language if the site has it, else none.
// New settings go here (one field, its default) and on the settings page.

import { LANGS, langOf } from '../i18n/languages';

export interface AppSettings {
  /** Guides, calculators, trackers and the other light pages, kept offline. */
  essentials: boolean;
  /** Blog posts from the last 6 months, kept offline (older ones are removed). */
  blog: boolean;
  /** The language kept offline besides English: a language code, or 'none'. */
  lang2: string;
}

const KEY = 'app:settings:v1';
const LAST_LANG = 'app:lang';

export const standalone = () => {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; }
};

function stored(): Partial<AppSettings> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

/** The second language this device seems to read, or 'none'. Only languages built into this site count. */
export function detectedLang(available: string[]): string {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_LANG); } catch { /* storage unavailable */ }
  if (last && available.includes(last)) return last;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.slice(0, 2).toLowerCase();
    if (code !== 'en' && available.includes(code)) return code;
  }
  return 'none';
}

/** Languages other than English that the site has (live ones; preview builds may add more on their pages). */
export const otherLanguages = () => LANGS.filter((l) => l.code !== 'en' && l.live).map((l) => l.code as string);

export function getSettings(available = otherLanguages()): AppSettings {
  const s = stored();
  const app = standalone();
  const lang2 = s.lang2 && (s.lang2 === 'none' || available.includes(s.lang2)) ? s.lang2 : detectedLang(available);
  return { essentials: s.essentials ?? app, blog: s.blog ?? app, lang2 };
}

/** Has this choice been made on this device (rather than following its default)? */
export const isChosen = (k: keyof AppSettings) => k in stored();

export function setSetting<K extends keyof AppSettings>(k: K, v: AppSettings[K]) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...stored(), [k]: v })); } catch { /* storage unavailable */ }
  dispatchEvent(new Event('drhm:settings'));
}

/** Called on every page: remembers a language other than English that this device reads the site in. */
export function noteLanguage(path: string) {
  const l = langOf(path);
  if (l === 'en') return;
  try { localStorage.setItem(LAST_LANG, l); } catch { /* storage unavailable */ }
}
