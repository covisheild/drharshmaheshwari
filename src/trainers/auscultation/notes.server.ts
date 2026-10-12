// Build time only: the teaching notes from src/content/trainers/auscultation/, checked against the findings.
import { getCollection } from 'astro:content';
import { FINDINGS } from './config';

export type Note = { finding: string; title: string; listen: string; means: string; references: { text: string; url?: string }[] };

let cache: Map<string, Note> | null = null;

/** Every finding's note, keyed by finding id. Fails the build if a finding has no note, or a note's file name
 *  or finding id doesn't match a finding. */
export async function notesByFinding(): Promise<Map<string, Note>> {
  if (cache) return cache;
  const entries = await getCollection('auscultationNotes');
  const map = new Map<string, Note>();
  for (const e of entries) {
    const f = FINDINGS.find((x) => x.id === e.data.finding);
    if (!f) throw new Error(`Teaching note ${e.id}.md names an unknown finding "${e.data.finding}"`);
    if (f.slug !== e.id) throw new Error(`Teaching note for ${f.id} must be named ${f.slug}.md, not ${e.id}.md`);
    map.set(f.id, e.data);
  }
  const missing = FINDINGS.filter((f) => !map.has(f.id)).map((f) => `${f.slug}.md`);
  if (missing.length) throw new Error(`Missing teaching notes: ${missing.join(', ')}`);
  return (cache = map);
}
