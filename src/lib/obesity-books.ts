// The Obesity Expertise series, as written by obesity-course/check/web/export.py into
// src/data/books/obesity-expertise/. Book metadata is loaded eagerly (small); a book's sections are
// loaded only by the static endpoint that serves them to the reader, one file per section.

import type { Book, Section, Series } from '../reader/types';
import seriesJson from '../data/books/obesity-expertise/series.json';

const bookFiles = import.meta.glob<Book>('../data/books/obesity-expertise/*/book.json', { eager: true, import: 'default' });
const sectionFiles = import.meta.glob<Section>('../data/books/obesity-expertise/*/sections/*.json', { import: 'default' });

export const SERIES_URL = '/doctors/books/obesity-expertise/';
export const series = seriesJson as Series;

/** Books exported to the site, in series order. */
export const obesityBooks: Book[] = Object.values(bookFiles).sort((a, b) => a.number - b.number);

export const bookById = (id: string) => obesityBooks.find((b) => b.id === id);

/** [{ book, section, load }] for every exported section. */
export function sectionEntries() {
  return Object.entries(sectionFiles).map(([path, load]) => {
    const m = path.match(/obesity-expertise\/([^/]+)\/sections\/([^/]+)\.json$/)!;
    return { book: m[1], section: m[2], load };
  });
}

/** The site-wide override for where figures are fetched from (local testing without R2), else the book's own. */
export const figureBase = (b: Book) => (import.meta.env.PUBLIC_BOOK_FIGURES as string | undefined) || b.figureBase;
