import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../consts';
import { articles, SECTION, type ArticleCollection } from '../lib/content';

export async function GET(context: APIContext) {
  const names: ArticleCollection[] = ['learn', 'clinicians', 'blog'];
  const items = (await Promise.all(names.map(async (n) =>
    (await articles(n)).filter((e) => !e.data.draft).map((e) => ({
      title: e.data.title, description: e.data.description, pubDate: e.data.published,
      link: `${SECTION[n].base}${e.id}/`, categories: [SECTION[n].label, ...e.data.topic],
    }))))).flat().sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
  return rss({ title: SITE.name, description: SITE.description, site: context.site!, items, customData: '<language>en-in</language>' });
}
