import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const reference = z.object({ text: z.string(), url: z.string().url().optional() });

// Learn (public), For Clinicians and Blog share one article shape.
const article = z.object({
  title: z.string(),
  description: z.string().max(170),
  published: z.coerce.date(),
  reviewed: z.coerce.date().optional(),
  topic: z.array(z.string()).default([]),
  keyPoints: z.array(z.string()).default([]),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  references: z.array(reference).default([]),
  draft: z.boolean().default(false),
});

const learn = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/learn' }), schema: article });
const clinicians = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/clinicians' }), schema: article });
const blog = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog' }), schema: article });

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string().max(170),
    audience: z.string(),
    published: z.coerce.date(),
    pages: z.number().optional(),
    size: z.string().optional(), // shown on the download button, e.g. '9.5 MB'
    pdf: z.string(), // path under /public/books/ or an external URL
    cover: z.string().optional(),
    // For doctors' books: the subject shelf it sits on (a slug from src/data/book-shelves.ts); the shelf's page lists it.
    shelf: z.string().optional(),
    // Datasets that go with the book: the address of their page.
    datasets: z.string().optional(),
    // Optional page colours taken from the cover: main (text/buttons on light), second (gradient partner), onDark (main in dark mode).
    theme: z.object({ main: z.string(), second: z.string(), onDark: z.string() }).optional(),
    license: z.string().default('CC BY-NC-SA 4.0'),
    // Which audience the book is for; decides whether it lives at /books/ or /doctors/books/.
    mode: z.enum(['everyone', 'doctors']).default('everyone'),
    contents: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Translations of guides and blog posts: src/content/i18n/<lang>/<collection>/<slug>.md (id "hi/learn/<slug>"). Only the words
// are translated; dates, references and draft status come from the English file. `source` is the fingerprint of the English
// file it was translated from (src/i18n/fingerprint.ts): when the English changes, the translation is not shown until redone.
const translations = defineCollection({
  loader: glob({ pattern: '*/*/*.md', base: './src/content/i18n' }),
  schema: z.object({
    source: z.string(),
    translated: z.coerce.date(),
    title: z.string(),
    description: z.string(),
    topic: z.array(z.string()).default([]),
    keyPoints: z.array(z.string()).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    // Overrides the language's checkedBy (src/i18n/languages.ts) for this page: 'author' once Harsh has read it.
    checkedBy: z.enum(['ai', 'author']).optional(),
  }),
});


// Teaching notes for the Auscultation Trainer: one file per finding, named by its permanent slug.
// Clinical content: Harsh reviews every change before it reaches main. Every note needs at least one reference.
const auscultationNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/trainers/auscultation' }),
  schema: z.object({
    finding: z.string(),       // the finding id in src/trainers/auscultation/config.ts
    title: z.string(),
    listen: z.string(),        // what to listen for (also shown after each quiz answer)
    means: z.string(),         // what it usually means
    references: z.array(reference).min(1),
  }),
});

export const collections = { learn, clinicians, blog, books, translations, auscultationNotes };
