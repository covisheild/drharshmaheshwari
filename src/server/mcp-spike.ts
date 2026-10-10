// Voice-tutor feasibility spike (docs/voice-tutor-plan.md, Milestone 0). A throwaway MCP server at /api/mcp-spike,
// switched on only where MCP_SPIKE = "on" (Preview builds, wrangler.jsonc `previews.vars`), never in production.
//
// It answers one question: does Claude on Android, in voice mode, call a custom connector's tools (read and write),
// and which way of showing a figure reaches the screen? So it has no sign-in (anyone with the preview address can call
// it; it holds nothing private: Chapters 1-5 text that is already public, and test notes), and it is hand-written:
// stateless Streamable HTTP, each POST is one JSON-RPC message answered with plain JSON, no sessions, no SSE.
// The real tutor (Milestones 1-4) replaces it; delete this file and its route then.

import book from '../data/books/statistics-first-principles-to-regression/book.json' with { type: 'json' };

export interface SpikeEnv {
  DB?: D1Database;
  ASSETS?: { fetch(req: Request | string): Promise<Response> };
}

/** Outside reads, replaceable in tests. */
export interface SpikeDeps {
  /** A section of the Statistics book as exported (`/doctors/books/<slug>/sections/<id>.json`), or null if absent. */
  section: (id: string) => Promise<Section | null>;
  /** The bytes of a figure on R2, or null. */
  figure: (file: string) => Promise<Uint8Array | null>;
  now: () => number;
}

interface Block { t: string; role?: string; label?: string; html?: string; level?: number; num?: string; points?: { html: string }[];
  questions?: { n: number; prompt: string; answer: string }[]; id?: string; src?: string; alt?: string; caption?: string; w?: number; h?: number }
interface Section { id: string; label: string; title: string; blocks: Block[] }

const BOOK = 'statistics-first-principles-to-regression';
const BOOK_VERSION = '3.1';
const SITE = 'https://drharshmaheshwari.com';
const FIGURES = `https://files.drharshmaheshwari.com/books/${BOOK}/figures/`;
const VIEWER = 'ui://drhm/figure-viewer';
// Claude's limit is ~150,000 characters per tool result; leave room for the text around the image.
const MAX_IMAGE_B64 = 140_000;
const MAX_NOTES = 500;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];

// The spike covers Chapters 1-5. Their sections, from the book's own outline: label ("2.4", or "2" for a chapter's overview) → id and title.
const CHAPTERS = (book.outline as { id: string; title: string; sections: { id: string; label: string; title: string }[] }[])
  .filter((p) => /^[1-5]$/.test(p.id));
const SECTIONS = new Map(CHAPTERS.flatMap((p) => p.sections.map((x) => [x.label, x] as const)));
const SECTION_IDS = new Set([...SECTIONS.values()].map((x) => x.id));
const CONCEPT_PATTERN = '^stats:[1-5](\\.\\d{1,2}){0,4}$';
const FIGURE_PATTERN = '^stats:fig:c0[1-5](-s\\d{2})?:[a-z0-9-]{1,40}$';

const RULES = `You are a friendly, patient spoken tutor for "Statistics: From First Principles to Regression" by Dr. Harsh Maheshwari (version ${BOOK_VERSION}). You are talking with a doctor who is walking outdoors.

Source
- The book text returned by these tools is the only source of truth. Never invent a claim, example or quotation. If asked something the book does not cover here, say so in one sentence.
- When you start a concept, read the book's Definition word for word first. Then explain it in your own words, using the book's own example. Say "the book puts it like this" before any word-for-word quote.

Talking
- Talk like a tutor in conversation, not like a lecturer. Two or three sentences per turn, then hand the turn back.
- Check understanding by asking, not telling: "What do you think…?", "Why would that be?"
- If the learner says "stop", "wait", "one minute", "hold on" or "pause": reply with only "Okay." and nothing else. Then wait silently until they speak again.
- Never end a turn with filler such as "I'm here whenever you're ready" or "let me know if you have questions".

Questions and answers
- Ask the book's checkpoint questions, one at a time, using the whole question as written. If a question has several parts, ask all its parts together or one part at a time, but never answer any part yourself.
- The learner often pauses to think. If an answer sounds unfinished (trails off, "umm", half a sentence, only one part of a several-part question), say only "Go on" or "Take your time" and wait. Treat the answer as finished only when it is clearly complete, or the learner says "done", "that's it" or "I don't know".
- Only after the answer is finished, call get_answer_key for that question and judge the answer against it: correct, partly correct or incorrect. Say what was right first, then what was missing, in two or three sentences. If the learner says "I don't know", give one hint first; give the answer only if they ask for it.
- Never state an answer, or any part of one, before the learner has finished trying.

Figures
- Only say a figure is shown if show_figure or open_figure_viewer returned it. Otherwise say you could not show it and describe its caption.
- When you show a figure, also show its full-size link and say "tap the link to zoom".

Other
- Say symbols aloud: x̄ "x-bar", μ "mu", σ "sigma", p̂ "p-hat".
- After the learner has answered at least two questions on a concept, call save_note once with your judgement.`;

// ---------- book text ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const cells = (row: string) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => plain(m[1]).replace(/\s+/g, ' '));
/** Tables read row by row, each cell labelled with its column heading ("Design: Cohort; Unit: Individuals; …"),
 *  which makes sense when spoken; a cell-per-line dump does not. */
function tables(html: string): string {
  return html.replace(/<table[\s\S]*?<\/table>/g, (t) => {
    const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    const head = rows.length && /<th/.test(rows[0]) ? cells(rows.shift()!) : [];
    const lines = rows.map((r) => cells(r).map((c, i) => (head[i] ? `${head[i]}: ${c}` : c)).join('; '));
    return `<p>${lines.map((l) => `- ${l}`).join('<br>')}</p>`;
  });
}

/** The book's HTML as plain text, word for word: list items on their own lines, paragraphs separated by a blank line. */
export function plain(html: string): string {
  return tables(html)
    .replace(/<li[^>]*>/g, '\n- ').replace(/<\/(p|ul|ol|div|h\d)>/g, '\n\n').replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** `stats:1.3` → section `c01-s03`; `stats:1.1.1` → the part of `c01-s01` under heading 1.1.1; `stats:2` → Chapter 2's
 *  overview. Chapters 1-5 only (the spike). */
export function locate(conceptId: string): { section: string; num: string } | null {
  const m = /^stats:([1-5](?:\.\d{1,2}){0,4})$/.exec(conceptId);
  if (!m) return null;
  const parts = m[1].split('.');
  const sec = SECTIONS.get(parts.slice(0, 2).join('.'));
  return sec ? { section: sec.id, num: m[1] } : null;
}

/** A figure's id names its section, so it can be found with one read: `stats:fig:c04-s03:ch04-histogram`. */
const figureId = (section: string, src: string) => `stats:fig:${section}:${src.replace(/\.png$/, '')}`;

/** The blocks of one concept: a section's own opening (before its first heading), or a heading and what follows it
 *  until the next heading that is not inside it. */
export function conceptBlocks(sec: Section, num: string): { title: string; blocks: Block[] } | null {
  if (num === sec.label) {
    const first = sec.blocks.findIndex((b) => b.t === 'heading');
    return { title: sec.title, blocks: first < 0 ? sec.blocks : sec.blocks.slice(0, first) };
  }
  const start = sec.blocks.findIndex((b) => b.t === 'heading' && b.num === num);
  if (start < 0) return null;
  const rest = sec.blocks.slice(start + 1);
  const end = rest.findIndex((b) => b.t === 'heading' && !(b.num ?? '').startsWith(num + '.'));
  return { title: plain(sec.blocks[start].html ?? ''), blocks: end < 0 ? rest : rest.slice(0, end) };
}

function conceptText(id: string, num: string, sec: Section, c: { title: string; blocks: Block[] }) {
  const out: string[] = [`BOOK: Statistics: From First Principles to Regression, version ${BOOK_VERSION}`,
    `CONCEPT: ${id} (§${num} ${c.title}; section ${sec.label} ${sec.title})`, `SOURCE: ${SITE}/doctors/books/${BOOK}/#${sec.id}`, ''];
  const figures: { id: string; caption: string }[] = [];
  const subs: string[] = [];
  // A section's opening stops at its first heading: name the parts that follow, so the tutor can go on to them.
  const parts = num === sec.label ? sec.blocks.filter((b) => b.t === 'heading').map((b) => `stats:${b.num} ${plain(b.html ?? '')}`) : [];
  for (const b of c.blocks) {
    if (b.t === 'prose' && b.html) out.push(`[${b.label ?? 'Text'}]`, plain(b.html), '');
    else if (b.t === 'mustknow') out.push(`[${b.label ?? 'Must-Know'}]`, ...(b.points ?? []).map((p) => `- ${plain(p.html)}`), '');
    else if (b.t === 'heading') { subs.push(`stats:${b.num}`); out.push(`== §${b.num} ${plain(b.html ?? '')} ==`, ''); }
    else if (b.t === 'figure' && b.src) {
      const fid = figureId(sec.id, b.src);
      figures.push({ id: fid, caption: plain(b.caption ?? '') });
      out.push(`[Figure ${fid}] ${plain(b.caption ?? '')} (call show_figure to show it)`, '');
    } else if (b.t === 'checkpoint') {
      out.push(`[${b.label ?? 'Checkpoint'}: questions to ask, one at a time, whole question as written]`);
      for (const q of b.questions ?? []) out.push(`Q${q.n}. ${plain(q.prompt)}`);
      out.push('(The answers are not included here. After the learner has finished answering, call get_answer_key with this concept and the question number.)', '');
    }
  }
  if (subs.length) out.push(`Sub-concepts inside this one: ${subs.join(', ')}`);
  if (parts.length) out.push(`This section continues in these concepts (call get_concept for each): ${parts.join('; ')}`);
  return { text: out.join('\n').trim(), figures };
}

// ---------- tools ----------
const TOOLS = [
  {
    name: 'get_concept',
    title: 'Get a concept from the Statistics book',
    description: 'Returns the exact book text of one concept from Chapters 1-5 of "Statistics: From First Principles to Regression" '
      + '(definition, explanation, example, must-know points, figures and checkpoint questions, without their answers), plus the tutor rules. '
      + 'Concept ids are "stats:" plus the book\'s section number, e.g. stats:1.3 (Parameter vs Statistic), stats:2.2.1, stats:3 (Chapter 3 overview). '
      + 'Chapters: 1 Foundations of Data, 2 Central Tendency, 3 Dispersion, 4 Data Visualisation, 5 Foundations of Probability. Use list_concepts to find ids.',
    inputSchema: { type: 'object', properties: { concept_id: { type: 'string', description: 'e.g. "stats:1.3"', pattern: CONCEPT_PATTERN } }, required: ['concept_id'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_concepts',
    title: 'List the concepts in the Statistics book',
    description: 'Without a chapter: lists Chapters 1-5 and their sections with concept ids. With a chapter (1-5): lists every concept in it, '
      + 'including sub-headings, with how many figures and checkpoint questions each has. Use it to find a concept id or to plan a lesson.',
    inputSchema: { type: 'object', properties: { chapter: { type: 'integer', minimum: 1, maximum: 5 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_answer_key',
    title: 'Get the book\'s answer to a checkpoint question',
    description: 'Returns the book\'s model answer to one checkpoint question, for judging the learner\'s answer. '
      + 'Call it ONLY after the learner has finished answering that question (or has asked for the answer). Never call it before asking the question.',
    inputSchema: {
      type: 'object',
      properties: { concept_id: { type: 'string', pattern: CONCEPT_PATTERN }, question: { type: 'integer', minimum: 1, maximum: 999, description: 'The question number, e.g. 7 for Q7' } },
      required: ['concept_id', 'question'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'show_figure',
    title: 'Show a figure from the book',
    description: 'Returns the original figure image from the book (as an image), with its caption and a link to open it. Use the figure id from get_concept, e.g. "stats:fig:c01-s05:ch01-designs".',
    inputSchema: { type: 'object', properties: { figure_id: { type: 'string', pattern: FIGURE_PATTERN } }, required: ['figure_id'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'open_figure_viewer',
    title: 'Open a figure in a viewer',
    description: 'Opens the original figure in an on-screen viewer inside the conversation (an interactive view), with its caption. Same figure ids as show_figure.',
    inputSchema: { type: 'object', properties: { figure_id: { type: 'string', pattern: FIGURE_PATTERN } }, required: ['figure_id'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: VIEWER }, 'ui/resourceUri': VIEWER },
  },
  {
    name: 'save_note',
    title: 'Save a tutor note',
    description: 'Saves a short note on how the learner did on a concept, on drharshmaheshwari.com. Call it after the learner has answered at least two questions on the concept.',
    inputSchema: {
      type: 'object',
      properties: {
        concept_id: { type: 'string', pattern: CONCEPT_PATTERN },
        result: { type: 'string', enum: ['correct', 'partly correct', 'incorrect'], description: 'Your overall judgement of the learner\'s answers' },
        note: { type: 'string', maxLength: 300, description: 'What the learner understood or confused, in one or two sentences' },
      },
      required: ['concept_id', 'result', 'note'], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'list_notes',
    title: 'List saved tutor notes',
    description: 'Lists the tutor notes saved on drharshmaheshwari.com, newest first. Use it at the start of a conversation to continue where the learner left off.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
interface ToolResult { content: Content[]; structuredContent?: Record<string, unknown>; isError?: boolean }
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The figure's caption, from the section its id names. */
async function figureInfo(id: string, deps: SpikeDeps) {
  const m = /^stats:fig:(c0[1-5](?:-s\d{2})?):([a-z0-9-]{1,40})$/.exec(id);
  if (!m || !SECTION_IDS.has(m[1])) return null;
  const sec = await deps.section(m[1]);
  const b = sec?.blocks.find((x) => x.t === 'figure' && x.src === `${m[2]}.png`);
  return b ? { file: b.src!, caption: plain(b.caption ?? ''), alt: b.alt ?? '', w: b.w, h: b.h, url: FIGURES + b.src } : null;
}

/** list_concepts: the outline of Chapters 1-5, or every concept of one chapter with its figure and question counts. */
async function listConcepts(chapter: unknown, deps: SpikeDeps) {
  if (chapter === undefined) {
    return CHAPTERS.map((p) => [p.title, ...p.sections.map((x) => `  stats:${x.label}  ${x.label === p.id ? 'Overview' : x.title}`)].join('\n')).join('\n\n')
      + '\n\nCall list_concepts with a chapter number to see the sub-concepts inside each section.';
  }
  const p = CHAPTERS.find((x) => x.id === String(chapter));
  if (!p) return null;
  const lines = [p.title];
  for (const x of p.sections) {
    const sec = await deps.section(x.id);
    if (!sec) continue;
    // Count what belongs to each concept: blocks before the first heading go to the section, the rest to their heading.
    let cur = { id: `stats:${x.label}`, title: x.label === p.id ? 'Overview' : x.title, depth: 0, figs: 0, qs: 0 };
    const rows = [cur];
    for (const b of sec.blocks) {
      if (b.t === 'heading') { cur = { id: `stats:${b.num}`, title: plain(b.html ?? ''), depth: (b.num ?? '').split('.').length - 2, figs: 0, qs: 0 }; rows.push(cur); }
      else if (b.t === 'figure') cur.figs++;
      else if (b.t === 'checkpoint') cur.qs += b.questions?.length ?? 0;
    }
    for (const r of rows) {
      const extra = [r.figs && `${r.figs} figure${r.figs > 1 ? 's' : ''}`, r.qs && `${r.qs} question${r.qs > 1 ? 's' : ''}`].filter(Boolean).join(', ');
      lines.push(`${'  '.repeat(r.depth + 1)}${r.id}  ${r.title}${extra ? `  (${extra})` : ''}`);
    }
  }
  return lines.join('\n');
}

const ensureNotes = (db: D1Database) => db.prepare(
  'CREATE TABLE IF NOT EXISTS spike_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, concept TEXT NOT NULL, result TEXT NOT NULL, note TEXT NOT NULL)').run();

async function callTool(name: string, args: Record<string, unknown>, env: SpikeEnv, deps: SpikeDeps): Promise<ToolResult> {
  if (name === 'get_concept') {
    const loc = typeof args.concept_id === 'string' ? locate(args.concept_id) : null;
    if (!loc) return text('Unknown concept id. Use "stats:" plus a section number from Chapters 1-5, e.g. stats:1.3; list_concepts shows them all.', true);
    const sec = await deps.section(loc.section);
    const c = sec && conceptBlocks(sec, loc.num);
    if (!sec || !c) return text(`No concept ${args.concept_id} in Chapters 1-5; list_concepts shows them all.`, true);
    const { text: body } = conceptText(args.concept_id as string, loc.num, sec, c);
    return text(`TUTOR RULES\n${RULES}\n\n${body}`);
  }
  if (name === 'list_concepts') {
    const out = await listConcepts(args.chapter, deps);
    return out ? text(out) : text('Chapter must be a number from 1 to 5.', true);
  }
  if (name === 'get_answer_key') {
    const loc = typeof args.concept_id === 'string' ? locate(args.concept_id) : null;
    const sec = loc && await deps.section(loc.section);
    const c = sec && conceptBlocks(sec, loc!.num);
    const qs = (blocks: Block[]) => blocks.flatMap((b) => (b.t === 'checkpoint' ? b.questions ?? [] : [])).find((x) => x.n === args.question);
    // A section's checkpoint comes after its last sub-heading, so look in the whole section if the concept itself lacks it.
    const q = c && (qs(c.blocks) ?? qs(sec!.blocks));
    if (!q) return text(`No question ${String(args.question)} in concept ${String(args.concept_id)}.`, true);
    return text(`ANSWER KEY (book's model answer) for Q${q.n}: ${plain(q.answer)}\nJudge the learner's finished answer against it. Say what was right first, then what was missing.`);
  }
  if (name === 'show_figure' || name === 'open_figure_viewer') {
    const f = typeof args.figure_id === 'string' ? await figureInfo(args.figure_id, deps) : null;
    if (!f) return text('Unknown figure id. Use the figure id exactly as get_concept gave it, e.g. stats:fig:c01-s05:ch01-designs.', true);
    const sc = { figure_id: args.figure_id, url: f.url, caption: f.caption, alt: f.alt, w: f.w, h: f.h };
    if (name === 'open_figure_viewer') return { content: [{ type: 'text', text: `Figure opened in the viewer (tap the picture to zoom). Caption: ${f.caption}\nFull size, zoomable (show this link to the learner): ${f.url}` }], structuredContent: sc };
    const bytes = await deps.figure(f.file);
    const data = bytes && b64(bytes);
    if (!data) return { content: [{ type: 'text', text: `The figure image could not be loaded. Caption: ${f.caption}\nFull size, zoomable (show this link to the learner): ${f.url}` }] };
    if (data.length > MAX_IMAGE_B64) return { content: [{ type: 'text', text: `The figure is too large to send as an image (${bytes!.length} bytes). Caption: ${f.caption}\nFull size, zoomable (show this link to the learner): ${f.url}` }] };
    return { content: [{ type: 'image', data, mimeType: 'image/png' }, { type: 'text', text: `Figure (original from the book, ${bytes!.length} bytes). Caption: ${f.caption}\nFull size, zoomable (show this link to the learner): ${f.url}` }] };
  }
  if (name === 'save_note' || name === 'list_notes') {
    if (!env.DB) return text('No database on this deployment.', true);
    await ensureNotes(env.DB);
    if (name === 'list_notes') {
      const rows = await env.DB.prepare('SELECT t, concept, result, note FROM spike_notes ORDER BY t DESC LIMIT 20').all<{ t: number; concept: string; result: string; note: string }>();
      if (!rows.results.length) return text('No notes saved yet.');
      return text(rows.results.map((r) => `${new Date(r.t).toISOString().slice(0, 16).replace('T', ' ')} UTC  ${r.concept}  ${r.result}: ${r.note}`).join('\n'));
    }
    const concept = typeof args.concept_id === 'string' ? args.concept_id : '';
    const result = args.result;
    const note = typeof args.note === 'string' ? args.note.replace(/<[^>]*>/g, '').trim() : '';
    if (!locate(concept) || !['correct', 'partly correct', 'incorrect'].includes(result as string) || !note || note.length > 300) return text('Invalid note: concept_id, result and a note of up to 300 characters are needed.', true);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM spike_notes').first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_NOTES) return text('The test notebook is full.', true);
    await env.DB.prepare('INSERT INTO spike_notes (t, concept, result, note) VALUES (?, ?, ?, ?)').bind(deps.now(), concept, result, note).run();
    return text(`Saved on drharshmaheshwari.com: ${concept} — ${result}.`);
  }
  return text(`Unknown tool ${name}.`, true);
}

// ---------- the figure viewer (MCP App) ----------
// The in-frame client is the MCP Apps SDK's prebuilt browser bundle, pinned to the version Claude's quickstart was
// verified with (https://claude.com/docs/connectors/building/mcp-apps/quickstart).
const VIEWER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Figure</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0; padding: 12px; }
  #pan { overflow: auto; border-radius: 8px; background: #fff; max-height: 80vh; }
  img { display: block; width: 100%; height: auto; cursor: zoom-in; }
  #pan.z img { width: 250%; max-width: none; cursor: zoom-out; }
  .hint { opacity: .7; font-size: 12px; }
  p { margin: 10px 0 0; }
  a { color: inherit; }
</style></head>
<body>
<div id="fig">Loading the figure…</div>
<script type="module">
  import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@1.7.5/dist/src/app-with-deps.js";
  const app = new App({ name: "Figure viewer", version: "1.0.0" });
  app.ontoolresult = ({ structuredContent: sc, content }) => {
    const box = document.getElementById("fig");
    if (!sc || !sc.url) { box.textContent = content?.[0]?.text ?? "No figure."; return; }
    const img = Object.assign(document.createElement("img"), { src: sc.url, alt: sc.alt || "" });
    if (sc.w && sc.h) { img.width = sc.w; img.height = sc.h; }
    const pan = Object.assign(document.createElement("div"), { id: "pan" });
    pan.append(img);
    img.onclick = (e) => {
      const r = img.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      pan.classList.toggle("z");
      // Keep the tapped point under the finger after zooming in.
      if (pan.classList.contains("z")) requestAnimationFrame(() => { pan.scrollLeft = fx * img.offsetWidth - pan.clientWidth / 2; pan.scrollTop = fy * img.offsetHeight - pan.clientHeight / 2; });
    };
    const hint = Object.assign(document.createElement("p"), { className: "hint", textContent: "Tap the picture to zoom in or out; drag to move around." });
    const cap = document.createElement("p"); cap.textContent = sc.caption || "";
    const link = Object.assign(document.createElement("a"), { href: sc.url, textContent: "Open the original", target: "_blank", rel: "noopener" });
    const p2 = document.createElement("p"); p2.append(link);
    box.replaceChildren(pan, hint, cap, p2);
  };
  await app.connect();
</script>
</body></html>`;

const RESOURCES = [{ uri: VIEWER, name: 'figure-viewer', title: 'Figure viewer', description: 'Shows a figure from the book', mimeType: 'text/html;profile=mcp-app' }];

// ---------- JSON-RPC over Streamable HTTP ----------
interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
const reply = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: body === null ? { 'cache-control': 'no-store' } : { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const ok = (id: Rpc['id'], result: unknown) => reply({ jsonrpc: '2.0', id, result });
const err = (id: Rpc['id'], code: number, message: string, status = 200) => reply({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);

export function defaultDeps(req: Request, env: SpikeEnv): SpikeDeps {
  return {
    section: async (id) => {
      if (!env.ASSETS || !SECTION_IDS.has(id)) return null;
      const res = await env.ASSETS.fetch(new Request(new URL(`/doctors/books/${BOOK}/sections/${id}.json`, req.url)));
      return res.ok ? ((await res.json()) as Section) : null;
    },
    figure: async (file) => {
      const res = await fetch(FIGURES + file).catch(() => null);
      return res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    now: () => Date.now(),
  };
}

export async function handleMcpSpike(req: Request, env: SpikeEnv, deps: SpikeDeps = defaultDeps(req, env)): Promise<Response> {
  if (req.method !== 'POST') return err(null, -32000, 'Method not allowed.', 405);
  let msg: Rpc;
  try { msg = await req.json(); } catch { return err(null, -32700, 'Parse error', 400); }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(null, -32600, 'Invalid request', 400);
  // A notification (no id) or a response from the client: accepted, nothing to answer.
  if (msg.id === undefined || msg.id === null) return reply(null, 202);
  const p = msg.params ?? {};
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
        return ok(msg.id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'drharshmaheshwari-tutor-spike', title: 'Dr Harsh Maheshwari books (test)', version: '0.0.1' },
          instructions: RULES,
        });
      }
      case 'ping': return ok(msg.id, {});
      case 'tools/list': return ok(msg.id, { tools: TOOLS });
      case 'tools/call': {
        const name = typeof p.name === 'string' ? p.name : '';
        if (!TOOLS.some((t) => t.name === name)) return err(msg.id, -32602, `Unknown tool: ${name}`);
        const args = p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments as Record<string, unknown> : {};
        return ok(msg.id, await callTool(name, args, env, deps));
      }
      case 'resources/list': return ok(msg.id, { resources: RESOURCES });
      case 'resources/templates/list': return ok(msg.id, { resourceTemplates: [] });
      case 'prompts/list': return ok(msg.id, { prompts: [] });
      case 'resources/read': {
        if (p.uri !== VIEWER) return err(msg.id, -32002, 'Resource not found');
        return ok(msg.id, { contents: [{ uri: VIEWER, mimeType: 'text/html;profile=mcp-app', text: VIEWER_HTML,
          _meta: { ui: { csp: { resourceDomains: ['https://unpkg.com', 'https://files.drharshmaheshwari.com'] } } } }] });
      }
      default: return err(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    console.error('mcp-spike error', msg.method, e);
    return err(msg.id, -32603, 'Internal error');
  }
}
