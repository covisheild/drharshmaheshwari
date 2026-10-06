// Standalone books in the reader: a book that is not part of a series. Each lives in
// src/data/books/<slug>/ (book.json, sections/*.json, written by its converter, e.g. scripts/books/statistics/export.py)
// and has a Markdown entry in src/content/books/<slug>.md (cover, PDF, licence, who it is for) with the same slug.
// Having both is all a new book needs: it then appears in the lists and opens in the reader at /doctors/books/<slug>/,
// with its review at /doctors/books/<slug>/review/. (The Obesity Expertise series has its own pages: lib/obesity-books.ts.)

import type { Book, Section } from '../reader/types';

const bookFiles = import.meta.glob<Book>('../data/books/*/book.json', { eager: true, import: 'default' });
const sectionFiles = import.meta.glob<Section>('../data/books/*/sections/*.json', { import: 'default' });

/** Standalone books that have text on the site, keyed by slug (the folder name). */
export const readerBooks: Record<string, Book> = Object.fromEntries(
  Object.entries(bookFiles).map(([path, book]) => [path.match(/data\/books\/([^/]+)\/book\.json$/)![1], book]),
);

export const readerBook = (slug: string): Book | undefined => readerBooks[slug];

/** [{ slug, section, load }] for every exported section of every standalone book. */
export function readerSectionEntries() {
  return Object.entries(sectionFiles).map(([path, load]) => {
    const m = path.match(/data\/books\/([^/]+)\/sections\/([^/]+)\.json$/)!;
    return { slug: m[1], section: m[2], load };
  });
}

/** The site-wide override for where figures are fetched from (local testing without R2), else the book's own. */
export const readerFigureBase = (b: Book) => (import.meta.env.PUBLIC_BOOK_FIGURES as string | undefined) || b.figureBase;
