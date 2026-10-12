// The "Save for offline" control (OfflineSave.astro): one per book or trainer, also listed on Settings.
// Hidden where the browser cannot keep files (no Cache Storage or service worker); everything else is in packs.ts.

import { OutOfSpace, formatBytes, packIndex, packState, removePack, savePack, supported } from './packs';
import { w } from '../i18n/client';

// Words via w() (src/i18n/client.ts): English on English pages; a translated page lists this file in <ClientWords>.
const what = (kind: string) => (kind === 'trainer' ? w('Practise without internet, with all the recordings.') : w('Read it without internet.'));

export function mountOfflineSave(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-offline-pack]:not([data-mounted])').forEach((el) => { void mount(el); });
}

async function mount(el: HTMLElement) {
  el.dataset.mounted = '1';
  if (!supported()) { el.hidden = true; return; }
  const id = el.dataset.offlinePack!;
  const kind = el.dataset.offlineKind ?? 'book';
  const main = el.querySelector<HTMLButtonElement>('.ofl-main')!;
  const remove = el.querySelector<HTMLButtonElement>('.ofl-remove')!;
  const bar = el.querySelector<HTMLElement>('.ofl-bar')!;
  const fill = bar.querySelector<HTMLElement>('i')!;
  const note = el.querySelector<HTMLElement>('.ofl-note')!;
  let expected = 0, approx = true;
  try {
    const p = (await packIndex()).packs.find((x) => x.id === id);
    if (!p) { el.hidden = true; return; }
    expected = p.bytes; approx = p.approx;
  } catch { /* offline: sizes unknown */ }
  const size = () => (expected ? (approx ? w('About {size}', { size: formatBytes(expected) }) : formatBytes(expected)) : '');
  let running: AbortController | null = null;

  const show = (s: { label: string; icon?: 'down' | 'stop' | 'done'; busy?: boolean; disabled?: boolean; removable?: boolean; percent?: number | null; text: string; done?: boolean }) => {
    main.innerHTML = `${ICONS[s.icon ?? 'down']}<span>${s.label}</span>`;
    main.disabled = !!s.disabled;
    main.classList.toggle('ofl-saved', !!s.done);
    main.setAttribute('aria-busy', String(!!s.busy));
    remove.hidden = !s.removable;
    bar.hidden = s.percent == null;
    if (s.percent != null) fill.style.width = `${s.percent}%`;
    note.textContent = s.text;
  };

  const idle = async () => {
    const st = await packState(id, expected);
    if (st.saved && st.done) show({ label: w('Saved for offline'), icon: 'done', done: true, removable: true, text: w('{size} on this device. Updates itself.', { size: formatBytes(st.bytes) }) });
    else if (st.saved) show({ label: w('Continue saving'), removable: true, percent: st.percent, text: w('Partly saved ({percent}%). Continue to finish, or remove it.', { percent: String(st.percent) }) });
    else show({ label: w('Save for offline'), text: size() ? w('{size}. {what}', { size: size(), what: what(kind) }) : what(kind) });
  };

  const save = async () => {
    if (!navigator.onLine) { note.textContent = w('You are offline. Connect to the internet to save.'); return; }
    running = new AbortController();
    show({ label: w('Stop'), icon: 'stop', busy: true, percent: 0, text: w('Saving for offline…') });
    try {
      await savePack(id, (done, total) => {
        const pc = total ? Math.min(99, Math.round((done / total) * 100)) : 0;
        fill.style.width = `${pc}%`;
        note.textContent = w('Saving for offline… {percent}%', { percent: String(pc) });
      }, running.signal);
      running = null;
      await idle();
    } catch (err) {
      const stopped = running?.signal.aborted;
      running = null;
      await idle();
      if (!stopped) note.textContent = err instanceof OutOfSpace
        ? w('Not enough space on this device. Free some space, then continue.')
        : navigator.onLine ? w('Saving stopped: some files did not download. Try again.') : w('Saving stopped: the internet connection was lost. Continue when you are back online.');
    }
  };

  main.addEventListener('click', () => {
    if (running) { running.abort(); return; }
    if (main.classList.contains('ofl-saved')) return;
    void save();
  });
  remove.addEventListener('click', async () => {
    if (!confirm(w('Remove it from this device? You can save it again any time.'))) return;
    running?.abort();
    await removePack(id);
    await idle();
  });
  await idle();
  el.classList.remove('ofl-wait');
}

const svg = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const ICONS = {
  down: svg('M12 4v11M7 10l5 5 5-5M5 20h14'),
  stop: svg('M7 7h10v10H7z'),
  done: svg('M5 12.5l4.5 4.5L19 7.5'),
};
