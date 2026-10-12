// Settings (/settings/): this device's choices. Kept in this browser only, never sent anywhere. Pages read and change them
// only through this file (the theme keeps its own key, `theme`, read before first paint by Base.astro).
//
// What the app keeps on the device for use without internet, one switch per kind (Harsh, 12 Oct 2026: the person
// chooses what is stored). A switch not touched yet follows a default: on in the installed app, off in a plain browser
// tab, so a one-time visitor never downloads more than the pages they open. Books and trainers are separate: each is
// saved only when the person turns it on (packs.ts).
// The second language kept offline (English is always kept): the last language other than English this device read the
// site in, else the browser's own language if the site has it, else none.
// A new setting: a field here, its default, and a row on the Settings page.

import { LANGS, langOf } from '../i18n/languages';

/** The kinds of light material, as the build groups them (scripts/pwa/integration.mjs). */
export const KEEP = ['guides', 'tools', 'trackers', 'blog', 'evidence'] as const;
export type Keep = (typeof KEEP)[number];

export interface AppSettings {
  /** Kept on the device for use without internet. */
  keep: Record<Keep, boolean>;
  /** The language kept offline besides English: a language code, or 'none'. */
  lang2: string;
}

const KEY = 'app:settings:v2';
const LAST_LANG = 'app:lang';

export const standalone = () => {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; }
};

interface Stored { keep?: Partial<Record<Keep, boolean>>; lang2?: string }
function stored(): Stored {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function save(s: Stored) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  dispatchEvent(new Event('drhm:settings'));
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

/** Languages other than English that the site has live (preview builds pass their own list from the page). */
export const otherLanguages = () => LANGS.filter((l) => l.code !== 'en' && l.live).map((l) => l.code as string);

export function getSettings(available = otherLanguages()): AppSettings {
  const s = stored();
  const app = standalone();
  const keep = Object.fromEntries(KEEP.map((k) => [k, s.keep?.[k] ?? app])) as Record<Keep, boolean>;
  const lang2 = s.lang2 && (s.lang2 === 'none' || available.includes(s.lang2)) ? s.lang2 : detectedLang(available);
  return { keep, lang2 };
}

/** Is anything kept automatically? */
export const keepsAnything = (s: AppSettings) => KEEP.some((k) => s.keep[k]);

/** Has this device made any choice about what to keep (rather than following the default)? */
export const chosen = () => Object.keys(stored().keep ?? {}).length > 0;

export function setKeep(k: Keep, on: boolean) {
  const s = stored();
  save({ ...s, keep: { ...s.keep, [k]: on } });
}

export function setLang2(code: string) {
  save({ ...stored(), lang2: code });
}

/** Back to the defaults (a new installation of the app starts here). */
export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  dispatchEvent(new Event('drhm:settings'));
}

/** Called on every page: remembers a language other than English that this device reads the site in. */
export function noteLanguage(path: string) {
  const l = langOf(path);
  if (l === 'en') return;
  try { localStorage.setItem(LAST_LANG, l); } catch { /* storage unavailable */ }
}

// ---------- theme: system, light or dark (the key Base.astro reads before first paint) ----------
export type Theme = 'system' | 'light' | 'dark';
export function getTheme(): Theme {
  try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export function setTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch { /* storage unavailable */ }
  document.documentElement.dataset.theme = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
