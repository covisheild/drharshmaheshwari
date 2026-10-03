// The reader's account line, at the foot of the contents panel. Accounts are optional and only keep your
// place, bookmarks and practice marks across devices; nothing shows while the site has accounts switched off.

import { account, deleteAccount, signInHref, signInResult, signOut } from '../trainers/core/account';
import type { SyncedBookStore } from './sync';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function mountReaderAccount(el: HTMLElement, store: SyncedBookStore) {
  const result = signInResult();
  const a = await account();
  if (!a.enabled) return;
  const render = () => {
    if (!a.user) {
      el.innerHTML = `<p>Your place, bookmarks and practice marks are saved in this browser.</p>
        <p><a class="rd-acct-in" href="${esc(signInHref())}">Sign in with Google</a> to keep them on every device.
        <a href="/privacy/#accounts">What is stored</a></p>`;
      return;
    }
    const status = { syncing: 'Syncing…', synced: 'Saved to your account.', offline: 'Not synced right now; saved here and will upload later.', off: '' }[store.state_];
    el.innerHTML = `<p>Signed in as <b>${esc(a.user.name || a.user.email)}</b>. <span role="status">${status}</span></p>
      <p><button type="button" data-out>Sign out</button> · <button type="button" data-del>Delete account</button> · <a href="/privacy/#accounts">What is stored</a></p>`;
    el.querySelector('[data-out]')!.addEventListener('click', async () => {
      try { await signOut(); location.reload(); } catch { alert('Could not sign out. Please try again.'); }
    });
    el.querySelector('[data-del]')!.addEventListener('click', async () => {
      if (!confirm('Delete your account? This permanently deletes your name, email, your reading places, bookmarks and practice marks, and all your trainer progress from this site, on every device. It cannot be undone.')) return;
      try { await deleteAccount(); alert('Your account and all its data have been deleted.'); location.reload(); } catch { alert('Could not delete the account. Please try again.'); }
    });
  };
  render();
  store.subscribe(render);
  if (result === 'error') alert('Sign-in did not complete. Please try again.');
}

/** Top bar: a small "Sign in", or the person's Google picture (their initial if there is none). Opens the
 *  account line in the contents panel. Empty while accounts are switched off. */
export async function mountReaderMe(el: HTMLElement, openAccount: () => void) {
  const a = await account();
  if (!a.enabled) return;
  if (!a.user) {
    el.innerHTML = `<a class="rd-signin" href="${esc(signInHref())}">Sign in</a>`;
    return;
  }
  const who = a.user.name || a.user.email;
  const initial = esc(who.trim().charAt(0).toUpperCase());
  el.innerHTML = `<button type="button" class="rd-avatar" aria-label="Your account (${esc(a.user.email)})" title="Signed in as ${esc(a.user.email)}">${
    a.user.picture ? `<img src="${esc(a.user.picture)}" alt="" width="28" height="28" referrerpolicy="no-referrer" loading="lazy">` : ''}<span>${initial}</span></button>`;
  const img = el.querySelector('img');
  img?.addEventListener('error', () => img.remove());
  el.querySelector('button')!.addEventListener('click', openAccount);
}
