// One section of a standalone book, as a static JSON file the reader fetches when the section nears the screen.
import type { APIRoute } from 'astro';
import { readerSectionEntries } from '../../../../../lib/reader-books';

export async function getStaticPaths() {
  return Promise.all(readerSectionEntries().map(async (e) => ({ params: { slug: e.slug, section: e.section }, props: { data: await e.load() } })));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
