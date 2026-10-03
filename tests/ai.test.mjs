// The question "Copy for AI" puts on the clipboard (src/reader/ai.ts). Run by `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/reader/ai.ts';

const input = { book: 'Book 0 · Ground floor', series: 'Obesity Expertise', author: 'Dr Harsh Maheshwari', label: 'A6', title: 'Powers, roots and scientific notation' };

test('a question about a passage names the book and section, quotes the passage and keeps the AI to it', () => {
  const p = buildPrompt({ ...input, text: '  10^(-3) is one thousandth.  ', note: 'check the sign' }, 'explain');
  assert.match(p, /"Book 0 · Ground floor" from the Obesity Expertise series by Dr Harsh Maheshwari \(drharshmaheshwari\.com\), section A6, "Powers, roots and scientific notation"/);
  assert.match(p, /Passage:\n"""\n10\^\(-3\) is one thousandth\.\n"""/);
  assert.match(p, /My note on it: check the sign/);
  assert.match(p, /Explain this in plain words/);
  assert.match(p, /Use the passage as your starting point\. If you go beyond it, say so, and do not invent references or numbers\./);
});

test('a question about the heading alone says the text was not pasted and does not claim to quote the book', () => {
  const p = buildPrompt(input, 'clinical');
  assert.match(p, /I have not pasted the text of the section\./);
  assert.match(p, /do not claim to quote the book/);
  assert.doesNotMatch(p, /Passage:|My note/);
  assert.match(p, /clinical practice/);
});

test('each task asks for something different', () => {
  const asks = ['explain', 'clinical', 'quiz', 'challenge'].map((t) => buildPrompt({ ...input, text: 'x' }, t).split('\n\n').at(-2));
  assert.equal(new Set(asks).size, 4);
  assert.match(asks[2], /three short questions/);
  assert.match(asks[3], /objections or exceptions/);
});
