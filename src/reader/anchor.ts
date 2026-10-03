// Where a highlight is, in a way that survives a new version of the book.
//
// A section's text is the text of its numbered paragraphs (the `data-p` elements) joined by a newline. A highlight
// stores a character range in that text, and also the quoted text with a few words either side. Opening a later
// version of the book, the range is used if the same words are still there; otherwise the quote is searched for, and
// of several matches the one with the same neighbours (then the nearest) wins; a quote that was only re-spaced is
// found too. A highlight whose words are gone is not painted, but stays in the notes list marked "text changed".
//
// No DOM here, so it is tested on its own (tests/anchor.test.mjs). highlights.ts turns ranges into DOM Ranges.

export interface Anchor { start: number; end: number; quote: string; before: string; after: string }

/** Words kept either side of the quote. */
export const CONTEXT = 24;
/** Longest highlight (characters), as the server's limit. */
export const MAX_QUOTE = 2000;

export function makeAnchor(text: string, start: number, end: number): Anchor {
  return { start, end, quote: text.slice(start, end), before: text.slice(Math.max(0, start - CONTEXT), start), after: text.slice(end, end + CONTEXT) };
}

/** Moves the ends in past spaces and line breaks, so a highlight never starts or ends on one. */
export function trimRange(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}

const commonSuffix = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
const commonPrefix = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };

/** The text without whitespace, and for each of its characters where it was in the original. */
function squash(s: string) {
  const at: number[] = [];
  let out = '';
  for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i])) { out += s[i]; at.push(i); }
  return { out, at };
}

/** Where the highlight is now in `text`, or null if its words are gone. `moved`: not where it was stored. */
export function resolve(text: string, a: Anchor): { start: number; end: number; moved: boolean } | null {
  const q = a.quote;
  if (!q) return null;
  if (text.slice(a.start, a.end) === q) return { start: a.start, end: a.end, moved: false };

  const hits: number[] = [];
  for (let i = text.indexOf(q); i >= 0 && hits.length < 500; i = text.indexOf(q, i + 1)) hits.push(i);
  if (hits.length) {
    const score = (i: number) => commonSuffix(text.slice(Math.max(0, i - a.before.length), i), a.before) + commonPrefix(text.slice(i + q.length, i + q.length + a.after.length), a.after);
    let best = hits[0];
    for (const i of hits) {
      const d = score(i) - score(best);
      if (d > 0 || (d === 0 && Math.abs(i - a.start) < Math.abs(best - a.start))) best = i;
    }
    return { start: best, end: best + q.length, moved: true };
  }

  // Re-spaced or re-wrapped text: compare without whitespace.
  const t = squash(text), k = squash(q).out;
  if (!k) return null;
  let best = -1;
  for (let i = t.out.indexOf(k); i >= 0; i = t.out.indexOf(k, i + 1)) {
    if (best < 0 || Math.abs(t.at[i] - a.start) < Math.abs(t.at[best] - a.start)) best = i;
  }
  return best < 0 ? null : { start: t.at[best], end: t.at[best + k.length - 1] + 1, moved: true };
}
