import { getCollection } from 'astro:content';
import { SHOW_DRAFTS } from '../consts';

export type ArticleCollection = 'learn' | 'clinicians' | 'blog';

export const SECTION: Record<ArticleCollection, { label: string; base: string; audience: string }> = {
  learn: { label: 'Learn', base: '/learn/', audience: 'Patient' },
  clinicians: { label: 'For Clinicians', base: '/clinicians/', audience: 'Clinician' },
  blog: { label: 'Blog', base: '/blog/', audience: 'Patient' },
};

/** Published entries (plus drafts on preview builds), newest first. */
export async function articles(name: ArticleCollection) {
  const all = await getCollection(name, ({ data }) => SHOW_DRAFTS || !data.draft);
  return all.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

export async function books() {
  const all = await getCollection('books', ({ data }) => SHOW_DRAFTS || !data.draft);
  return all.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
