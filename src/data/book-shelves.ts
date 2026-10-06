// The subject shelves on /doctors/books/, next to the Obesity Expertise series. Each is shown as a big card (the same
// card as the series) and, once it holds a book, opens a page of its books at /doctors/books/<slug>/.
// A book joins a shelf with `shelf: <slug>` in its src/content/books/<slug>.md. A shelf with no books yet is shown
// as "in preparation" and links nowhere; adding its first book turns it on by itself. Shelf slugs are permanent URLs
// and must not equal a book's slug.

export interface Shelf {
  slug: string;
  title: string;
  /** One line under the title on its own page. */
  subtitle: string;
  /** The card's text. */
  text: string;
  /** Tint of the placeholder covers while the shelf is empty (hue, 0-360). */
  hue: number;
}

export const SHELVES: Shelf[] = [
  {
    slug: 'public-health',
    title: 'Public Health',
    subtitle: 'Statistics, epidemiology and research methods, derived from first principles',
    text: 'Statistics, epidemiology and research methods for doctors, built from first principles. Read online, with practice questions you can check as you go, or download each book as a PDF.',
    hue: 258,
  },
  {
    slug: 'clinical-medicine',
    title: 'Clinical Medicine',
    subtitle: 'Clinical reasoning and medicine, derived from first principles',
    text: 'Clinical medicine for doctors, written the same way: each idea derived, with practice questions you can check as you go. The first books are being written.',
    hue: 190,
  },
];
