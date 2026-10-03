// Finding a highlight again after the book changed (src/reader/anchor.ts). Run by `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAnchor, resolve, trimRange, CONTEXT } from '../src/reader/anchor.ts';

const text = 'Risk is a number.\nA ratio compares two quantities. The ratio of 3 to 4 is 0.75.\nA rate has time in its denominator.';
const at = (s) => [text.indexOf(s), text.indexOf(s) + s.length];

test('an anchor keeps the quote and a few words either side', () => {
  const [s, e] = at('compares two');
  const a = makeAnchor(text, s, e);
  assert.equal(a.quote, 'compares two');
  assert.equal(a.before, 'sk is a number.\nA ratio ', 'the 24 characters before, across the paragraph break');
  assert.equal(a.after, ' quantities. The ratio o', 'cut at 24 characters');
  assert.ok(a.before.length <= CONTEXT && a.after.length <= CONTEXT);
});

test('the stored range is used when the same words are still there', () => {
  const [s, e] = at('The ratio of 3 to 4');
  assert.deepEqual(resolve(text, makeAnchor(text, s, e)), { start: s, end: e, moved: false });
});

test('after an edit that moves the text, the quote is found where it went', () => {
  const [s, e] = at('A rate has time');
  const a = makeAnchor(text, s, e);
  const newer = 'A new first paragraph was added in version 1.3.\n' + text;
  const r = resolve(newer, a);
  assert.equal(newer.slice(r.start, r.end), 'A rate has time');
  assert.equal(r.moved, true);
});

test('of several matches the one with the same neighbours wins, not the first', () => {
  const t1 = 'the ratio. First thing. The ratio. Second thing, the ratio. Third.';
  const second = t1.indexOf('Second thing, ') + 'Second thing, '.length;
  const a = makeAnchor(t1, second, second + 'the ratio'.length);
  const t2 = 'Preface. ' + t1; // moved, so the stored range no longer fits
  const r = resolve(t2, a);
  assert.equal(r.start, t2.indexOf('Second thing, ') + 'Second thing, '.length);
});

test('re-spaced text is still found; the range maps back to the original', () => {
  const [s, e] = at('compares two quantities');
  const a = makeAnchor(text, s, e);
  const respaced = text.replace('compares two quantities', 'compares\ntwo   quantities').replace('Risk', 'Risk  ');
  const r = resolve(respaced, a);
  assert.equal(respaced.slice(r.start, r.end), 'compares\ntwo   quantities');
});

test('words that are gone give null: the highlight is listed as "text changed", not placed wrongly', () => {
  const [s, e] = at('A rate has time');
  assert.equal(resolve(text.replace('A rate has time', 'Incidence has duration'), makeAnchor(text, s, e)), null);
  assert.equal(resolve(text, { start: 0, end: 0, quote: '', before: '', after: '' }), null);
});

test('a highlight never starts or ends on a space or line break', () => {
  assert.deepEqual(trimRange('  ab cd \n', 0, 9), [2, 7]);
  assert.deepEqual(trimRange('   ', 0, 3), [3, 3]);
});

test('the notes export: a heading per section, quoted passages, notes, and the licence line', async () => {
  const { notesMarkdown } = await import('../src/reader/notes.ts');
  const book = { id: 'B0', title: 'Book 0 · Ground floor', version: '1.2', url: 'https://drharshmaheshwari.com/doctors/books/obesity-expertise/b0/', licence: 'CC BY-NC-SA 4.0', author: 'Dr Harsh Maheshwari' };
  const md = notesMarkdown(book, [
    { label: 'A5', title: 'Ratios', text: 'a ratio compares two quantities', note: '' },
    { label: 'A5', title: 'Ratios', text: 'first line\nsecond line', note: ' My note\n ' },
    { label: 'A6', title: 'Powers', text: '10^(-3) is one thousandth', note: 'check' },
  ], new Date('2026-10-03'));
  assert.match(md, /^# Notes: Book 0 · Ground floor\n\nVersion 1.2 · exported 3 October 2026 · https:/);
  assert.equal(md.match(/^## A5 · Ratios$/gm).length, 1, 'one heading for the two passages in A5');
  assert.match(md, /> first line\n> second line\n\nMy note\n/);
  assert.match(md, /^## A6 · Powers$/m);
  assert.match(md, /> 10\^\(-3\) is one thousandth/);
  assert.match(md, /shared under CC BY-NC-SA 4\.0/);
  assert.match(notesMarkdown(book, []), /No highlights yet\./);
});
