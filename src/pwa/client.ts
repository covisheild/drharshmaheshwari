// Runs on every page (Base.astro): registers the app's service worker (/sw.js, scripts/pwa/sw.js), keeps the
// browser's install offer for the /app/ page instead of letting it pop up, and after a new site build brings books
// and trainers saved for offline up to date (only the files that changed; never on Data Saver).

// One id per build, set in astro.config.mjs; saved packs remember the build they came from.
declare const __BUILD_ID__: string;

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
declare global { interface Window { drhmInstall?: InstallPrompt | null } }

export function startApp() {
  // No pop-ups: the browser's own install banner is held back; /app/ offers the same install as a plain button.
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
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

async function refreshSaved() {
  if (!navigator.onLine || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  if (!('caches' in window) || !(await caches.keys()).some((k) => k.startsWith('pack:'))) return;
  const packs = await import('./packs');
  if (!(await packs.anyStale(__BUILD_ID__))) return;
  const run = () => packs.refreshPacks().catch(() => {});
  // One tab at a time.
  if (navigator.locks) await navigator.locks.request('drhm-offline-refresh', { ifAvailable: true }, (lock) => (lock ? run() : undefined));
  else await run();
}
