// The signed-in person, as the browser sees it. Accounts are optional: they only keep trainer and book
// progress across devices. When the site has accounts switched off (or /api/ can't be reached), everything here
// reports "off" and the trainers keep progress in the browser.

export interface AccountUser { name: string | null; email: string; picture?: string | null }
export interface Account { enabled: boolean; user: AccountUser | null }

const OWNER_KEY = 'account:owner'; // whose progress this browser's trainer copies belong to

let current: Promise<Account> | null = null;

export function account(): Promise<Account> {
  current ??= fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : { enabled: false, user: null }))
    .then((a: Account) => ({ enabled: !!a.enabled, user: a.user ?? null }))
    .catch(() => ({ enabled: false, user: null }));
  return current;
}

export const signInHref = (returnTo = location.pathname) => `/api/auth/google?return=${encodeURIComponent(returnTo)}`;

const send = (method: string, path: string) =>
  fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });

/** Removes this browser's copies of trainer and book-reader progress (they stay in the account). */
export function clearLocalProgress() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('trainer:') || k.startsWith('book:')) localStorage.removeItem(k);
    localStorage.removeItem(OWNER_KEY);
  } catch { /* storage unavailable */ }
}

export async function signOut() {
  const r = await send('POST', '/api/auth/logout');
  if (!r.ok) throw new Error('sign-out failed');
  clearLocalProgress();
}

export async function deleteAccount() {
  const r = await send('DELETE', '/api/account');
  if (!r.ok) throw new Error('delete failed');
  clearLocalProgress();
}

/** Called once signed in: if this browser's progress belongs to someone else, it is cleared first, so one
 *  person's answers never merge into another's account on a shared computer. */
export function claimLocalProgress(email: string) {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== email) clearLocalProgress();
    localStorage.setItem(OWNER_KEY, email);
  } catch { /* storage unavailable */ }
}

/** Reads and clears the #signin=ok / #signin=error marker the sign-in flow leaves on the return page. */
export function signInResult(): 'ok' | 'error' | null {
  const m = location.hash.match(/^#signin=(ok|error)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1] as 'ok' | 'error';
}
