// Blocks -> HTML. The reader lays out what the converter wrote and never changes a word of it: labels are
// the book's own ("Definition", "In plain terms", ...), and the only words added are controls.
// Every element that holds the book's own content gets `.c`; its children are the paragraphs that
// reading positions count (`data-p`), in document order, whether or not an answer is open.

import type { Block, Section } from './types';

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const count = (n: number) => (n < NUM.length ? NUM[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// check/build.py PRACTICE_BANDS: what each level of a drill set asks of you.
const BAND = (level: number) => (level <= 3 ? 'mechanical' : level <= 6 ? 'applied' : level <= 8 ? 'diagnostic' : 'transfer');
const TAG: Record<string, string> = {
  misconception: 'Misconception', number: 'Number', india_deviation: 'India', boundary: 'Boundary', trap: 'Trap',
  consequence: 'Consequence', dispute: 'Dispute', move: 'Move',
};

const cites = (refs: number[] | undefined, part: string) =>
  refs?.length ? ` <button type="button" class="cite" data-part="${esc(part)}" data-refs="${refs.join(',')}" aria-label="References ${refs.join(', ')}">[${refs.join(', ')}]</button>` : '';

interface Card { t?: string; confidence?: boolean; prompt: string; answer: string }
function card(kind: 'exercise' | 'practice' | 'checkpoint', id: string, head: string, b: Card, answerWord = 'worked answer') {
  const conf = b.t === 'exercise' && b.confidence
    ? `<p class="q-conf"><label>Your confidence before you look <input type="number" inputmode="numeric" min="0" max="100" step="5" class="q-conf-in" aria-label="Your confidence, as a percentage"> %</label></p>`
    : '';
  return `<div class="q q-${kind}" data-q="${id}">
  <div class="q-head">${head}</div>
  <div class="c">${b.prompt}</div>${conf}
  <button type="button" class="q-reveal" data-word="${answerWord}" aria-expanded="false" aria-controls="${id}-a">Show ${answerWord}</button>
  <div class="q-ans" id="${id}-a" hidden><div class="q-ans-label">${cap(answerWord)}</div><div class="c">${b.answer}</div>
    <div class="q-self" role="group" aria-label="How did you do?"><span>How did you do?</span>
      <button type="button" data-mark="got">Got it</button><button type="button" data-mark="missed">Missed it</button></div>
  </div>
</div>`;
}

/** Each line of a working block becomes its own element, so a phone can wrap a long line with a hanging
 *  indent instead of hiding it off the side. The text is untouched. */
export const lines = (html: string) => html.replace(/<div class="working">\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g,
  (_, body: string) => `<div class="working">${body.split(/<br\s*\/?>\s*/).map((l) => `<span class="wl">${l}</span>`).join('')}</div>`);

export function renderSection(sec: Section, figureBase: string): string {
  const out: string[] = [];
  const practiceTotal = sec.blocks.filter((b) => b.t === 'practice').length;
  let practiceIntro = false;
  for (const b of sec.blocks) {
    switch (b.t) {
      case 'note':
        out.push(`<div class="blk note c">${b.html}</div>`);
        break;
      case 'prose': {
        const ref = cites(b.refs, sec.part);
        const html = ref ? b.html.replace(/<\/p>(?![\s\S]*<\/p>)/, `${ref}</p>`) : b.html;
        // The Statistics book continues a labelled block after a figure without repeating the label.
        out.push(`<div class="blk prose role-${b.role}">${b.label ? `<p class="lab"><span>${esc(b.label)}</span></p>` : ''}${html ? `<div class="c">${html}</div>` : ''}${
          b.numberRefs?.length ? `<p class="figsrc">Figures quoted in this illustration are from${cites(b.numberRefs, sec.part)}.</p>` : ''}</div>`);
        break;
      }
      case 'figure':
        // The enlarge button sits beside `.fig-card`, not inside it: children of a `.c` are the paragraphs reading positions count.
        out.push(`<figure class="blk fig"><div class="fig-card c"><img src="${esc(figureBase + b.src)}" alt="${esc(b.alt)}" width="${b.w}" height="${b.h}" loading="lazy" decoding="async"></div><button type="button" class="fig-zoom" aria-label="Enlarge this figure"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button><figcaption>${b.caption}</figcaption></figure>`);
        break;
      case 'mustknow':
        out.push(`<div class="blk mustknow"><p class="lab"><span>${esc(b.label ?? 'Must know points for you')}</span></p><ul class="c">${b.points.map((p) =>
          `<li>${p.html.replace(/^<p>([\s\S]*)<\/p>$/, '$1')}${p.tag && TAG[p.tag] ? ` <span class="tag">${TAG[p.tag]}</span>` : ''}</li>`).join('')}</ul></div>`);
        break;
      case 'heading': {
        // Sections are h3 on the page; the book's own ### and #### headings sit under them.
        const h = Math.min(6, b.level + 1);
        out.push(`<h${h} class="blk hd hd-${b.level}"${b.num ? ` id="n-${b.num}" data-num="${esc(b.num)}"` : ''}>${b.num ? `<span class="n">${esc(b.num)}</span> ` : ''}${b.html}</h${h}>`);
        break;
      }
      case 'checkpoint':
        out.push(`<div class="blk cp"><p class="lab"><span>${esc(b.label)}</span></p></div>`);
        b.questions.forEach((q, k) => out.push(`<div class="blk">${card('checkpoint', `${sec.id}-q${q.n}`,
          `<span class="q-n">${k + 1}</span><span class="q-type">of ${b.questions.length}</span>`, q, 'model answer')}</div>`));
        if (b.note) out.push(`<div class="blk note c"><p>${b.note}</p></div>`);
        break;
      case 'exercise':
        out.push(`<div class="blk">${card('exercise', `${sec.id}-e${b.n}`, `<span class="q-n">Exercise ${b.n}</span><span class="q-type">${esc(b.type)}</span>`, b)}</div>`);
        break;
      case 'practice':
        if (!practiceIntro) {
          practiceIntro = true;
          out.push(`<div class="blk prose role-practice"><p class="lab"><span>Practice</span></p><p class="intro">${cap(count(practiceTotal))} problem${practiceTotal === 1 ? '' : 's'} on this technique, easiest first. Work each one on paper before you open its worked answer.</p></div>`);
        }
        out.push(`<div class="blk">${card('practice', `${sec.id}-p${b.n}`, `<span class="q-n">${b.n}</span><span class="q-type">level ${b.level} · ${BAND(b.level)}</span>`, b)}</div>`);
        break;
    }
  }
  return lines(out.join('\n'));
}

/** Number the paragraphs a location can point at: each child of a top-level `.c`, in document order. */
export function numberParagraphs(body: HTMLElement) {
  let i = 0;
  for (const c of body.querySelectorAll<HTMLElement>('.c')) {
    if (c.parentElement?.closest('.c')) continue;
    const units = c.children.length ? [...c.children] as HTMLElement[] : [c];
    for (const el of units) el.dataset.p = String(i++);
  }
}
