// Sign-in UI for the trainers: a small control in the app bar, and the account card on the Progress page.
// Nothing shows while accounts are switched off on the site.

import { account, deleteAccount, signInHref, signInResult, signOut } from '../core/account';
import type { ProgressStore } from '../core/progress';
import type { SyncedProgressStore } from '../core/sync';
import { h } from './dom';

const initial = (u: { name: string | null; email: string }) => (u.name || u.email).trim().charAt(0).toUpperCase();

/** App bar: "Sign in", or the person's initial linking to their account card. */
export async function mountAccountBadge(el: HTMLElement, progressHref: string) {
  const result = signInResult();
  const a = await account();
  if (!a.enabled) return;
  el.replaceChildren(a.user
    ? h('a', { class: 't-avatar', href: `${progressHref}#account`, title: `Signed in as ${a.user.email}`, 'aria-label': `Your account (${a.user.email})` }, initial(a.user))
    : h('a', { class: 't-signin', href: signInHref() }, 'Sign in'));
  if (result === 'error') {
    const note = h('p', { class: 't-note warn t-flash', role: 'alert' }, 'Sign-in did not complete. Please try again.');
    document.querySelector('.t-head')?.append(note);
  }
}

/** Progress page: where progress is kept, and sign in / sign out / delete account. */
export async function mountAccountCard(el: HTMLElement, store: ProgressStore) {
  const a = await account();
  const synced = store as Partial<SyncedProgressStore>;
  const privacy = h('a', { href: '/privacy/#accounts' }, 'What is stored');
  const render = () => {
    if (!a.enabled) { el.replaceChildren(h('p', { class: 'muted' }, 'Saved in this browser only; nothing is sent anywhere.')); return; }
    if (!a.user) {
      el.replaceChildren(h('div', { class: 'card t-account-card', id: 'account' },
        h('p', {}, h('b', {}, 'Saved in this browser only. '), 'Sign in to keep your progress and review schedule across your devices. Your answers so far come with you.'),
        h('div', { class: 't-row' }, h('a', { class: 'btn btn-primary', href: signInHref() }, 'Sign in with Google'), privacy)));
      return;
    }
    const status = { syncing: 'Syncing…', synced: 'Saved to your account.', offline: 'Not synced right now (no connection); your answers are kept here and will upload later.', off: '' }[synced.state ?? 'off'];
    el.replaceChildren(h('div', { class: 'card t-account-card', id: 'account' },
      h('p', {}, 'Signed in as ', h('b', {}, a.user.name || a.user.email), a.user.name ? ` (${a.user.email})` : '', '. ', h('span', { class: 'muted', role: 'status' }, status)),
      h('div', { class: 't-row' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
          try { await signOut(); location.reload(); } catch { alert('Could not sign out. Please try again.'); }
        } }, 'Sign out'),
        h('button', { class: 'btn-link', type: 'button', onclick: async () => {
          if (!confirm('Delete your account? This permanently deletes your name, email, all your trainer progress and your book reading places, bookmarks and marks from this site, on every device. It cannot be undone.')) return;
          try { await deleteAccount(); alert('Your account and all its data have been deleted.'); location.reload(); } catch { alert('Could not delete the account. Please try again.'); }
        } }, 'Delete account'),
        privacy)));
  };
  render();
  store.subscribe(render);
}
