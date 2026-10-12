// Runs on every page (Base.astro): registers the app's service worker (/sw.js, scripts/pwa/sw.js), keeps the browser's
// install offer for the Install buttons (home page, /app/) instead of letting it pop up, keeps the light material offline
// as App settings say (auto.ts), and after a new site build brings saved books and trainers up to date (only the files
// that changed). Nothing downloads on Data Saver.

import { getSettings, noteLanguage } from './settings';

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
  addEventListener('appinstalled', () => { window.drhmInstall = null; dispatchEvent(new Event('drhm:installed')); });

  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const go = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    void refreshSaved();
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
  const s = getSettings();
  // Nothing wanted and nothing kept: nothing to load.
  if (!s.essentials && !s.blog && !(await caches.keys()).some((k) => /^pack:(core|blog)-/.test(k))) return;
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
