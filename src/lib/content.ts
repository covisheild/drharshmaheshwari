import { getCollection } from 'astro:content';
import { SHOW_DRAFTS } from '../consts';
import { MODES, section, type Mode } from './modes';

export type ArticleCollection = 'learn' | 'clinicians' | 'blog';

// The `clinicians` collection keeps its folder name (src/content/clinicians/) but is published as
// For Doctors > Evidence. Old /clinicians/ URLs redirect there (public/_redirects).
export const SECTION: Record<ArticleCollection, { label: string; base: string; audience: string; mode: Mode }> = {
  learn: { label: 'Learn', base: '/learn/', audience: 'Patient', mode: 'everyone' },
  clinicians: { label: 'Evidence', base: '/doctors/evidence/', audience: 'Clinician', mode: 'doctors' },
  blog: { label: 'Blog', base: '/blog/', audience: 'Patient', mode: 'everyone' },
};

export const modeHome = (mode: Mode) => MODES[mode].home;

/** Published entries (plus drafts on preview builds), newest first. */
export async function articles(name: ArticleCollection) {
  const all = await getCollection(name, ({ data }) => SHOW_DRAFTS || !data.draft);
  return all.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

/** Books for one audience, or all books when no mode is given. */
export async function books(mode?: Mode) {
  const all = await getCollection('books', ({ data }) => (SHOW_DRAFTS || !data.draft) && (!mode || data.mode === mode));
  return all.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

export const bookUrl = (b: { id: string; data: { mode: Mode } }) => `${section(b.data.mode, 'books')}${b.id}/`;

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
