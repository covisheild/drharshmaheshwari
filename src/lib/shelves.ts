// Subject shelves on /doctors/books/ (src/data/book-shelves.ts) with the books that belong to each.
import type { CollectionEntry } from 'astro:content';
import { SHELVES, type Shelf } from '../data/book-shelves';
import { books, bookUrl } from './content';

export interface ShelfWithBooks extends Shelf { url: string; books: CollectionEntry<'books'>[] }

export const shelfUrl = (s: { slug: string }) => `/doctors/books/${s.slug}/`;

/** Every shelf in display order, with its published books (oldest first, so a shelf reads in the order it grew). */
export async function shelves(): Promise<ShelfWithBooks[]> {
  const all = (await books('doctors')).slice().sort((a, b) => a.data.published.valueOf() - b.data.published.valueOf());
  for (const b of all) {
    if (b.data.shelf && !SHELVES.some((s) => s.slug === b.data.shelf)) throw new Error(`${b.id}: unknown shelf "${b.data.shelf}" (src/data/book-shelves.ts)`);
  }
  return SHELVES.map((s) => ({ ...s, url: shelfUrl(s), books: all.filter((b) => b.data.shelf === s.slug) }));
}

export const shelfOf = (entry: CollectionEntry<'books'>) => SHELVES.find((s) => s.slug === entry.data.shelf);

export { bookUrl };
