// The light material the app keeps by itself, as Settings say (settings.ts): one pack per kind (guides, tools, trackers,
// evidence, blog) in English and the second language, plus the base pages (home, lists) whenever any kind is kept, so the
// app opens without internet. Blog: posts from the last 6 months only; an older post is removed from the device and opens
// only online. Books and trainers are never downloaded here, only when the person turns them on (packs.ts). Videos never.
// Runs a few seconds after a page loads (client.ts), at most once per site build, plus once a day for the blog's 6 months.

import { getSettings, keepsAnything, type Keep } from './settings';
import { isAuto, packIndex, removePack, savePack, savedPacks, type PackSummary } from './packs';

/** Today on this device, YYYY-MM-DD. */
export const today = (now = new Date()) => now.toLocaleDateString('en-CA');

/** The oldest publication date kept: 6 calendar months back from today. */
export function blogCutoff(now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 6);
  return today(d);
}

/** The automatic packs this device should hold, given its settings and what the site offers. */
export function wantedPacks(packs: PackSummary[], s = getSettings()): PackSummary[] {
  if (!keepsAnything(s)) return [];
  const langs = ['en', ...(s.lang2 !== 'none' ? [s.lang2] : [])];
  return packs.filter((p) => isAuto(p.kind) && langs.includes(p.lang ?? 'en') && (p.kind === 'base' || s.keep[p.kind as Keep]));
}

/**
 * Bring the automatic packs in line with the settings: download what is wanted and missing or out of date (only changed
 * files), remove what is no longer wanted. `force`: check every wanted pack now (the settings page's "Update now").
 */
export async function autoSync(opts: { force?: boolean; progress?: (id: string, done: number, total: number) => void } = {}) {
  const { build, packs } = await packIndex();
  const want = wantedPacks(packs);
  const ids = new Set(want.map((p) => p.id));
  const saved = await savedPacks();
  // An automatic pack's cache with no record (an interrupted removal) holds nothing usable: drop it.
  for (const k of await caches.keys()) {
    const id = k.slice(5);
    if (k.startsWith('pack:') && isAuto(id.replace(/-[a-z]{2}$/, '')) && !saved.some((p) => p.id === id)) await caches.delete(k);
  }
  for (const s of saved) if (isAuto(s.kind) && !ids.has(s.id)) await removePack(s.id);
  const day = today();
  const cutoff = blogCutoff();
  for (const p of want) {
    const s = saved.find((x) => x.id === p.id);
    const fresh = s?.done && s.build === build && (p.kind !== 'blog' || s.day === day);
    if (fresh && !opts.force) continue;
    await savePack(p.id, (d, t) => opts.progress?.(p.id, d, t), undefined,
      p.kind === 'blog' ? { keep: (f) => !f.d || f.d >= cutoff, day } : { day });
  }
}
