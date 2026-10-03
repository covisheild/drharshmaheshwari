// The reader's account control, top right. Accounts are optional and only keep your place, bookmarks and
// practice marks across devices; nothing shows while the site has accounts switched off. Signed out it is a
// small "Sign in"; signed in it is the person's picture, opening a short menu: who is signed in, whether
// the reading is saved, "Your account" (/account/: sign out, delete account, what is stored) and "Sign out".
// There is no account box in the contents panel any more (Harsh, 3 Oct 2026).

import { account, signInHref, signInResult, signOut } from '../trainers/core/account';
import type { SyncedBookStore } from './sync';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STATUS = { syncing: 'Syncing…', synced: 'Saved to your account.', offline: 'Not synced right now; saved here and will upload later.', off: '' };

export async function mountReaderMe(el: HTMLElement, store: SyncedBookStore) {
  const result = signInResult();
  const a = await account();
  if (!a.enabled) return;
  if (result === 'error') alert('Sign-in did not complete. Please try again.');
  if (!a.user) {
    el.innerHTML = `<a class="rd-signin" href="${esc(signInHref())}">Sign in</a>`;
    return;
  }
  const who = a.user.name || a.user.email;
  const initial = esc(who.trim().charAt(0).toUpperCase());
  el.innerHTML = `<button type="button" class="rd-avatar" aria-label="Your account (${esc(a.user.email)})" aria-haspopup="true" aria-expanded="false" aria-controls="rd-acctmenu">${
    a.user.picture ? `<img src="${esc(a.user.picture)}" alt="" width="28" height="28" referrerpolicy="no-referrer" loading="lazy">` : ''}<span>${initial}</span></button>
    <div class="rd-acctmenu" id="rd-acctmenu" hidden>
      <p class="rd-acctmenu-who"><b>${esc(who)}</b>${a.user.name ? `<br>${esc(a.user.email)}` : ''}</p>
      <p class="rd-acctmenu-status" role="status"></p>
      <a href="/account/">Your account</a>
      <button type="button" data-out>Sign out</button>
    </div>`;
  const img = el.querySelector('img');
  img?.addEventListener('error', () => img.remove());
  const btn = el.querySelector<HTMLButtonElement>('.rd-avatar')!;
  const menu = el.querySelector<HTMLElement>('.rd-acctmenu')!;
  const status = el.querySelector<HTMLElement>('.rd-acctmenu-status')!;
  const drawStatus = () => { status.textContent = STATUS[store.state_]; status.hidden = !status.textContent; };
  drawStatus();
  store.subscribe(drawStatus);
  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => setOpen(!!menu.hidden));
  document.addEventListener('click', (e) => { if (!menu.hidden && !el.contains(e.target as Node)) setOpen(false); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
  el.querySelector('[data-out]')!.addEventListener('click', async () => {
    try { await signOut(); location.reload(); } catch { alert('Could not sign out. Please try again.'); }
  });
}
