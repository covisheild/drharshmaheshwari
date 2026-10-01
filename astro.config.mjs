// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://drharshmaheshwari.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  prefetch: true,
  // The site is fully static and never uses Astro sessions. Without this, the Cloudflare adapter adds a
  // SESSION KV binding with no ID, which Worker Previews reject (code 10021).
  session: false,
  adapter: cloudflare(),
});
