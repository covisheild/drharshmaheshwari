// Runs on every page (Base.astro): registers the app's service worker (/sw.js, scripts/pwa/sw.js), keeps the browser's
// install offer for the Install buttons (home page, /app/) instead of letting it pop up, keeps the light material offline
// as Settings say (auto.ts), and after a new site build brings saved books and trainers up to date (only the files
// that changed). Nothing downloads on Data Saver.

import { getSettings, keepsAnything, noteLanguage, resetSettings, standalone } from './settings';

// One id per build, set in astro.config.mjs; saved packs remember the build they came from.
declare const __BUILD_ID__: string;

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
declare global { interface Window { drhmInstall?: InstallPrompt | null } }

export function startApp() {
  noteLanguage(location.pathname);
  // No pop-ups: the browser's own install banner is held back; the Install buttons offer the same install.
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.drhmInstall = e as InstallPrompt;
    dispatchEvent(new Event('drhm:installable'));
  });
  addEventListener('appinstalled', () => {
    window.drhmInstall = null;
    dispatchEvent(new Event('drhm:installed'));
    // Installed again after an earlier installation: start clean, as a new app would (the old copies are still in the
    // browser's storage, because Android keeps a removed web app's data with the browser).
    if (flag(INSTALLED)) void clearOffline();
  });

  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const go = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    void watchInstall().then(refreshSaved);
    // A moment later, so the page itself loads first.
    setTimeout(() => { void keepLight(); }, 4000);
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

const quiet = () => !navigator.onLine || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** One tab at a time. */
async function locked(name: string, run: () => Promise<unknown>) {
  if (navigator.locks) await navigator.locks.request(name, { ifAvailable: true }, (lock) => (lock ? run().catch(() => {}) : undefined));
  else await run().catch(() => {});
}

async function keepLight() {
  if (quiet() || !('caches' in window)) return;
  // Nothing wanted and nothing kept: nothing to load.
  if (!keepsAnything(getSettings()) && !(await caches.keys()).some((k) => /^pack:(base|guides|tools|trackers|evidence|blog)-/.test(k))) return;
  const { autoSync } = await import('./auto');
  await locked('drhm-offline-auto', () => autoSync());
}

async function refreshSaved() {
  if (quiet()) return;
  if (!('caches' in window) || !(await caches.keys()).some((k) => k.startsWith('pack:'))) return;
  const packs = await import('./packs');
  if (!(await packs.anyStale(__BUILD_ID__))) return;
  await locked('drhm-offline-refresh', () => packs.refreshPacks());
}

// ---------- a removed app leaves nothing behind (Harsh, 12 Oct 2026) ----------
// Removing the app from an Android phone does not clear what it kept: the data belongs to the browser. So the site checks,
// when it opens in the browser, whether the app is still installed (getInstalledRelatedApps, Chrome; the manifest's
// related_applications names the app itself). Its "not installed" is trusted only on a device where the same check has
// once said "installed", and only on the live site (the manifest names the live address). Then everything kept for offline
// use, and the choices about it, are removed. iPhone and iPad remove a home-screen app's data themselves.
const INSTALLED = 'app:installed';   // this device has run the installed app
const SEEN = 'app:install-seen';     // the check has reported the app as installed here
const LIVE = 'https://drharshmaheshwari.com';

function flag(k: string, set?: boolean): boolean {
  try {
    if (set === true) localStorage.setItem(k, '1');
    else if (set === false) localStorage.removeItem(k);
    return localStorage.getItem(k) === '1';
  } catch { return false; }
}

/** Removes everything this site keeps for offline use (books, trainers, the light material) and resets those choices. */
export async function clearOffline() {
  if ('caches' in window) for (const k of await caches.keys()) if (!k.startsWith('shell-')) await caches.delete(k);
  resetSettings();
}

async function watchInstall() {
  if (standalone()) flag(INSTALLED, true);
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (location.origin !== LIVE || !nav.getInstalledRelatedApps || !flag(INSTALLED)) return;
  const apps = await nav.getInstalledRelatedApps().catch(() => null);
  if (!apps) return;
  if (apps.length) { flag(SEEN, true); return; }
  if (flag(SEEN) && !standalone()) {
    await clearOffline();
    flag(INSTALLED, false);
    flag(SEEN, false);
  }
}
