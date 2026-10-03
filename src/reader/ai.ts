// "Ask AI" without any AI on this site: the button builds a question about the passage (or the section heading) and
// puts it on the clipboard; for ChatGPT and Claude it also opens a new tab with the question filled in. The reader's own
// account answers it, on their own terms; nothing is sent from here and nothing is stored here.
//
// Off until switched on under Aa. Hosting an assistant ourselves is a different thing (it needs sign-in, per-person
// limits, a monthly budget switch and a passage-only prompt first) and is parked; see docs/book-reader-plan.md.

import type { ReaderPrefs } from './store';

export type AiWith = ReaderPrefs['aiWith'];
export type AiTask = ReaderPrefs['aiTask'];

export const AI_NAMES: Record<AiWith, string> = { copy: 'your AI', chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };

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

const HOME: Record<Exclude<AiWith, 'copy'>, string> = { chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app' };
/** Longest address passed to another site; beyond it the assistant opens empty and the question is only on the clipboard. */
export const MAX_LINK = 6000;

/** Where to open the assistant, with the question filled in where the site takes it from the address; null: copy only.
 *  ChatGPT and Claude read `?q=`; Gemini has no such address, so it opens empty and the clipboard holds the question. */
export function linkFor(w: AiWith, prompt: string): { url: string; filled: boolean } | null {
  if (w === 'copy') return null;
  if (w === 'gemini') return { url: HOME.gemini, filled: false };
  const url = `${HOME[w]}?q=${encodeURIComponent(prompt)}`;
  return url.length <= MAX_LINK ? { url, filled: true } : { url: HOME[w], filled: false };
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Copies the question and, for ChatGPT and Claude, opens it in a new tab. Says what happened through `say`. */
export async function ask(w: AiWith, task: AiTask, input: AskInput, say: (html: string) => void) {
  const prompt = buildPrompt(input, task);
  const copied = await copy(prompt);
  const link = linkFor(w, prompt);
  const name = AI_NAMES[w];
  if (!link) { say(copied ? '<p>Question copied. Paste it into your AI.</p>' : '<p>Could not copy. Select the passage and copy it yourself.</p>'); return; }
  const a = document.createElement('a');
  a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.append(a); a.click(); a.remove();
  const note = !copied && !link.filled ? 'Could not copy the question.'
    : w === 'gemini' ? 'Gemini cannot take a question from a link, so the question is copied: paste it into its box (Ctrl+V, or press and hold on a phone).'
    : w === 'claude' && link.filled ? 'Claude shows its own caution notice for any question filled in from a link; the question is the one you chose, so check it and press send.'
    : link.filled ? 'The question should be filled in.' : 'The question is too long for a link, so it is copied: paste it into the box.';
  say(`<p>Opening ${name} in a new tab. ${note}</p><p class="rd-toast-sub"><a href="${link.url.length > 300 ? HOME[w as Exclude<AiWith, 'copy'>] : link.url}" target="_blank" rel="noopener noreferrer">Did it not open? Open ${name}</a></p>`);
}
