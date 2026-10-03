// "Copy for AI" without any AI on this site: the button builds a question about the passage (or the section heading) and
// puts it on the clipboard. The reader pastes it into whichever assistant they use, on their own terms; nothing is sent
// from here and nothing is stored here. (Opening ChatGPT, Claude or Gemini from the button was tried and removed,
// Harsh 3 Oct 2026: Claude shows a caution notice for any filled-in link, Gemini takes no question from a link.)
//
// Off until switched on under Aa. Hosting an assistant ourselves is a different thing (it needs sign-in, per-person
// limits, a monthly budget switch and a passage-only prompt first) and is parked; see docs/book-reader-plan.md.

import type { ReaderPrefs } from './store';

export type AiTask = ReaderPrefs['aiTask'];

const TASKS: Record<AiTask, string> = {
  explain: 'Explain this in plain words, then tell me the one thing to remember and why it matters in practice.',
  clinical: 'Explain why this matters in clinical practice, with one realistic example, and where it most often goes wrong.',
  quiz: 'Ask me three short questions on this, one at a time. Wait for my answer each time, then correct me.',
  challenge: 'Challenge this: what are the strongest objections or exceptions, and what would change the conclusion?',
};

export interface AskInput {
  /** "Book 0 · Ground floor" */
  book: string;
  series: string;
  author: string;
  /** Section label and title: "A6", "Powers, roots and scientific notation". */
  label: string;
  title: string;
  /** The passage; absent when asking about the heading alone. */
  text?: string;
  note?: string;
}

/** The question. Pure, so it is tested without a browser. */
export function buildPrompt(i: AskInput, task: AiTask): string {
  const where = `section ${i.label}, "${i.title}"`;
  const head = `I am a health professional studying "${i.book}" from the ${i.series} series by ${i.author} (drharshmaheshwari.com), ${where}.`;
  const out = [head, ''];
  if (i.text?.trim()) out.push('Passage:', '"""', i.text.trim(), '"""', '');
  else out.push('I have not pasted the text of the section.', '');
  if (i.note?.trim()) out.push(`My note on it: ${i.note.trim()}`, '');
  out.push(TASKS[task], '');
  out.push(i.text?.trim()
    ? 'Use the passage as your starting point. If you go beyond it, say so, and do not invent references or numbers.'
    : 'Explain the concept in general, do not claim to quote the book, and do not invent references or numbers.');
  return out.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Copies the question and says so through `say`. */
export async function ask(task: AiTask, input: AskInput, say: (html: string) => void) {
  const copied = await copyText(buildPrompt(input, task));
  say(copied ? '<p>Question copied. Paste it into your AI.</p>' : '<p>Could not copy. Select the passage and copy it yourself.</p>');
}
