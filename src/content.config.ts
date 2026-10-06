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

export const collections = { learn, clinicians, blog, books };
