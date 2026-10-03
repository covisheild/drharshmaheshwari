// "Statistics: From First Principles to Regression", as written by scripts/books/statistics/export.py into
// src/data/books/statistics-first-principles-to-regression/. The same book format as the Obesity Expertise
// books (src/reader/types.ts); one book, no series. Sections load one file each, as in lib/obesity-books.ts.

import type { Book, Section } from '../reader/types';
import bookJson from '../data/books/statistics-first-principles-to-regression/book.json';

const sectionFiles = import.meta.glob<Section>('../data/books/statistics-first-principles-to-regression/sections/*.json', { import: 'default' });

export const statsBook = bookJson as Book;
export const STATS_LANDING = '/doctors/books/statistics-first-principles-to-regression/';

/** [{ section, load }] for every exported section. */
export function statsSectionEntries() {
  return Object.entries(sectionFiles).map(([path, load]) => ({ section: path.match(/\/([^/]+)\.json$/)![1], load }));
}

/** The site-wide override for where figures are fetched from (local testing without R2), else the book's own. */
export const statsFigureBase = () => (import.meta.env.PUBLIC_BOOK_FIGURES as string | undefined) || statsBook.figureBase;
