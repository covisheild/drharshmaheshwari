// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://drharshmaheshwari.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  prefetch: true,
});
