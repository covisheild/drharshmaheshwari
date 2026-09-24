// Every published article as Markdown in one file, for AI models that want full text.
import { SITE } from '../consts';
import { articles, SECTION, type ArticleCollection } from '../lib/content';

export async function GET() {
  const out: string[] = [`# ${SITE.name} — full text`, '', `> ${SITE.description}`, ''];
  for (const name of ['learn', 'clinicians', 'blog'] as ArticleCollection[]) {
    for (const e of (await articles(name)).filter((x) => !x.data.draft)) {
      const d = e.data;
      out.push('---', '', `# ${d.title}`, '', `URL: ${SITE.url}${SECTION[name].base}${e.id}/`, `Author: ${SITE.name}`,
        `Published: ${d.published.toISOString().slice(0, 10)}${d.reviewed ? ` · Reviewed: ${d.reviewed.toISOString().slice(0, 10)}` : ''}`, '',
        d.description, '');
      if (d.keyPoints.length) out.push('Key points:', ...d.keyPoints.map((k) => `- ${k}`), '');
      out.push(e.body ?? '', '');
      if (d.references.length) out.push('References:', ...d.references.map((r, i) => `${i + 1}. ${r.text}${r.url ? ` ${r.url}` : ''}`), '');
    }
  }
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
