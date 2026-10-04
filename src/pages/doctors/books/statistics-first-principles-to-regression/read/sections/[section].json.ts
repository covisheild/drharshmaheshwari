// One section of the Statistics book, as a static JSON file the reader fetches when the section nears the screen.
import type { APIRoute } from 'astro';
import { statsSectionEntries } from '../../../../../../lib/stats-book';

export async function getStaticPaths() {
  return Promise.all(statsSectionEntries().map(async (e) => ({ params: { section: e.section }, props: { data: await e.load() } })));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
