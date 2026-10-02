// One section of one book, as a static JSON file the reader fetches when the section nears the screen.
import type { APIRoute } from 'astro';
import { sectionEntries } from '../../../../../../lib/obesity-books';

export async function getStaticPaths() {
  return Promise.all(sectionEntries().map(async (e) => ({ params: { book: e.book, section: e.section }, props: { data: await e.load() } })));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
