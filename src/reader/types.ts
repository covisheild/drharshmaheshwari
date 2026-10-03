// The book format the reader reads (docs/book-reader-plan.md). Each source has a converter that writes it;
// the Obesity Expertise books come from obesity-course/check/web/export.py, the Statistics book from
// scripts/books/statistics/export.py. HTML fields are already rendered
// (superscripts, working blocks, tables) and come from this repository, never from readers.

export interface OutlineSection { id: string; label: string; title: string; words: number; practice: number }
export interface OutlinePart { id: string; title: string; sections: OutlineSection[] }
export interface Reference { n: number; html: string }
export interface GlossaryEntry { term: string; senses: { term: string; plain: string; where: string }[] }

export interface Book {
  format: number;
  id: string;
  slug: string;
  url: string;
  series: string;
  number: number;
  title: string;
  subtitle?: string;
  coverLine?: string;
  subject?: string;
  level?: string;
  part?: string;
  hue: number;
  colours: Record<'ink' | 'accent' | 'accent2' | 'tint' | 'tint2' | 'rule', string>;
  version: string;
  date: string;
  author: string;
  licence: string;
  pdf: string;
  figureBase: string;
  /** Statistics book: the cover image (the Obesity Expertise covers are generated from the Part hue). */
  cover?: string;
  about: { why: string; howToRead?: string; prerequisites: string | null };
  blurb: string;
  requires: string[];
  words: number;
  outline: OutlinePart[];
  references: { part: string; items: Reference[]; note: string | null }[];
  glossary: GlossaryEntry[];
}

export type Block =
  | { t: 'prose'; label: string; role: string; html: string; refs?: number[]; numberRefs?: number[] }
  | { t: 'note'; html: string }
  | { t: 'figure'; src: string; alt: string; w: number; h: number; caption: string }
  | { t: 'mustknow'; label?: string; points: { html: string; tag?: string; bearing?: string }[] }
  | { t: 'exercise'; n: number; type: string; confidence: boolean; prompt: string; answer: string }
  | { t: 'practice'; n: number; level: number; prompt: string; answer: string }
  // Statistics book (scripts/books/statistics/export.py): a sub-heading inside a section, and a checkpoint:
  // the book's own questions, each with the model answer that Appendix A prints.
  | { t: 'heading'; level: number; num: string; html: string }
  | { t: 'checkpoint'; id: string; label: string; questions: { n: number; prompt: string; answer: string }[]; note: string };

export interface Section { format: number; id: string; label: string; title: string; part: string; blocks: Block[] }

export interface SeriesBook {
  number: number; id: string; slug: string; title: string; subject?: string; part: string; level: string;
  tier?: number; status: string; hue: number | null;
}
export interface Series { format: number; title: string; subtitle: string; url: string; hues: Record<string, number>; books: SeriesBook[] }

/** A place in a book that survives new versions: section id, paragraph index, fraction through it. */
export interface Location { s: string; p: number; f: number }
