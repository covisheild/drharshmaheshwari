// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';
import { readFileSync } from 'node:fs';
import ogImages from './scripts/og/integration.mjs';

const json = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));

// Drafts show on preview builds (any branch except main), never on production. Read here, in Node:
// pages are prerendered inside workerd, where the build machine's environment variables are not visible.
// Cloudflare Workers Builds sets WORKERS_CI_BRANCH; CF_PAGES_BRANCH is the older Pages name.
const branch = process.env.WORKERS_CI_BRANCH ?? process.env.CF_PAGES_BRANCH ?? 'main';

export default defineConfig({
  site: 'https://drharshmaheshwari.com',
  trailingSlash: 'ignore',
  // Private pages (one person's readings, a doctor's shared view) stay out of the sitemap; they are also noindex.
  // Hindi pages (src/i18n/) are listed with hreflang alternates beside their English pages.
  integrations: [sitemap({ filter: (page) => !/\/trackers\/(person|view)\//.test(page), i18n: { defaultLocale: 'en', locales: { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', or: 'or-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' } } }), ogImages({ theme: json('./src/data/theme.json'), palettes: json('./src/data/palettes.json') })],
  prefetch: true,
  // The site is fully static and never uses Astro sessions. Without this, the Cloudflare adapter adds a
  // SESSION KV binding with no ID, which Worker Previews reject (code 10021).
  session: false,
  adapter: cloudflare(),
  vite: { define: { __PREVIEW_BUILD__: JSON.stringify(branch !== 'main') } },
});
