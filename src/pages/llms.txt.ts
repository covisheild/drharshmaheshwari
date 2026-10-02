// llms.txt: a plain-text guide to this site for AI models (https://llmstxt.org).
import { SITE } from '../consts';
import { articles, books, bookUrl, SECTION, type ArticleCollection } from '../lib/content';
import { TOOLS } from '../data/tools';
import { TRAINERS, trainerBase } from '../trainers/registry';

export async function GET() {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    `${SITE.name} is a physician (MBBS, King George's Medical University, Lucknow) and MD Community Medicine resident at AIIMS Raipur, India. The site publishes evidence-based material on obesity and its downstream diseases (type 2 diabetes, fatty liver, hypertension, cardiovascular disease), with India-specific cut-offs. Public guides are in plain language; clinician pages are referenced evidence syntheses. Every article lists its references and a last-reviewed date.`,
    '',
    `The site has two sections. For Everyone (${SITE.url}/) has plain-language guides and tools for the public. For Doctors (${SITE.url}/doctors/) has evidence syntheses, clinical skill trainers, clinical tools and books for health professionals.`,
    '',
    `Full text of all articles: ${SITE.url}/llms-full.txt`,
    '',
  ];
  const sections: [ArticleCollection, string][] = [['learn', 'Guides for the public'], ['clinicians', 'For Doctors: evidence syntheses'], ['blog', 'Blog']];
  for (const [name, heading] of sections) {
    const list = (await articles(name)).filter((e) => !e.data.draft);
    if (!list.length) continue;
    lines.push(`## ${heading}`, '');
    for (const e of list) lines.push(`- [${e.data.title}](${SITE.url}${SECTION[name].base}${e.id}/): ${e.data.description}`);
    lines.push('');
  }
  lines.push('## Tools', '', `- [BMI & waist calculator (Indian cut-offs)](${SITE.url}/tools/bmi-calculator/): BMI with Asian/Indian cut-offs (overweight 23–24.9, obesity ≥25 kg/m²), waist-to-height ratio (risk from 0.5) and waist cut-offs (90 cm men, 80 cm women).`);
  for (const t of TOOLS.filter((x) => x.href && x.href !== '/tools/bmi-calculator/')) lines.push(`- [${t.title}](${SITE.url}${t.href}): ${t.text}`);
  lines.push('', '## For Doctors: clinical trainers', '');
  for (const t of TRAINERS.filter((x) => x.status === 'ready')) lines.push(`- [${t.title}](${SITE.url}${trainerBase(t)}): ${t.summary}${t.id === 'auscultation' ? ' 16 heart and lung findings (S3, S4, systolic and diastolic murmurs, AF, AV block, crackles, wheeze, rhonchi, pleural rub) from the HLS-CMDS dataset (CC BY 4.0), with a Learn page per finding and a five-level quiz.' : ''}`);
  lines.push('');
  const bookList = (await books()).filter((b) => !b.data.draft);
  if (bookList.length) {
    lines.push('## Free books', '');
    for (const b of bookList) lines.push(`- [${b.data.title}](${SITE.url}${bookUrl(b)}): ${b.data.description}`);
    lines.push('');
  }
  lines.push('## Optional', '', `- [About ${SITE.name}](${SITE.url}/about/)`, `- [Medical disclaimer](${SITE.url}/disclaimer/)`, '');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
