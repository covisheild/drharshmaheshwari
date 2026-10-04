// The admin colour settings: 36 colours that stay readable, a valid theme.json, and the weekly/monthly rotation
// (src/lib/theme.ts), including the inline script that applies it before first paint. Run by `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { paletteIdFor, themeScript } from '../src/lib/theme.ts';
import { build, hsl, contrast, SURF, DARK_TEXT, DARK_FILL, LIGHT, softDark, softLight, NAMES } from '../scripts/design/palettes.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const palettes = json('../src/data/palettes.json');
const theme = json('../src/data/theme.json');

test('36 colours, one every 10 degrees, and palettes.json is what the generator writes', () => {
  assert.equal(palettes.length, 36);
  assert.deepEqual(palettes.map((p) => p.hue), Array.from({ length: 36 }, (_, i) => i * 10));
  assert.deepEqual(palettes.map((p) => p.name), NAMES);
  assert.equal(new Set(palettes.map((p) => p.id)).size, 36, 'ids are unique');
  assert.deepEqual(palettes, build(), 'run: node scripts/design/palettes.mjs');
});

test('every colour keeps text and buttons at 4.5:1 or more, on the dark and the light theme', () => {
  for (const p of palettes) {
    const h = p.hue, at = (a, b, what) => assert.ok(contrast(a, b) >= 4.5, `${p.name}: ${what} = ${contrast(a, b).toFixed(2)}`);
    const dText = hsl(h, DARK_TEXT.s, DARK_TEXT.l), dFill = hsl(h, DARK_FILL.s, p.ld), lCol = hsl(h, LIGHT.s, p.ll);
    for (const [k, s] of Object.entries({ bg: SURF.dark.bg, card: SURF.dark.card, card2: SURF.dark.card2, soft: softDark(h) })) at(dText, s, `dark text on ${k}`);
    at(dFill, SURF.dark.ink, 'dark button ink on fill');
    for (const [k, s] of Object.entries({ bg: SURF.light.bg, card: SURF.light.card, card2: SURF.light.card2, soft: softLight(h) })) at(lCol, s, `light text on ${k}`);
    at(lCol, SURF.light.ink, 'white ink on light fill');
  }
});

test('theme.json is valid: known colours, a different colour for each audience at every step', () => {
  const ids = new Set(palettes.map((p) => p.id));
  assert.ok(['fixed', 'weekly', 'monthly'].includes(theme.schedule));
  assert.match(theme.start, /^\d{4}-\d{2}-\d{2}$/);
  for (const m of ['everyone', 'doctors']) {
    assert.ok(ids.has(theme.fixed[m]), `fixed ${m}`);
    assert.ok(theme.rotation[m].length >= 2, `${m} rotation has at least 2 colours`);
    for (const id of theme.rotation[m]) assert.ok(ids.has(id), `${m} rotation: ${id}`);
  }
  assert.notEqual(theme.fixed.everyone, theme.fixed.doctors, 'the two audiences have different fixed colours');
  const n = Math.max(theme.rotation.everyone.length, theme.rotation.doctors.length) * 2;
  for (let i = 0; i < n; i++) assert.notEqual(theme.rotation.everyone[i % theme.rotation.everyone.length], theme.rotation.doctors[i % theme.rotation.doctors.length], `same colour for both audiences at step ${i}`);
});

const day = (s) => Date.parse(s + 'T12:00:00+05:30');
test('weekly and monthly rotation count from start, change at midnight India time, and wrap round', () => {
  const cfg = { schedule: 'monthly', start: '2026-10-01', fixed: { everyone: 'cyan', doctors: 'violet' }, rotation: { everyone: ['a', 'b', 'c'], doctors: ['x', 'y'] } };
  assert.equal(paletteIdFor(cfg, 'everyone', day('2026-10-01')), 'a');
  assert.equal(paletteIdFor(cfg, 'everyone', day('2026-10-31')), 'a');
  assert.equal(paletteIdFor(cfg, 'everyone', day('2026-11-01')), 'b');
  assert.equal(paletteIdFor(cfg, 'everyone', day('2027-01-01')), 'a', 'wraps after the list');
  assert.equal(paletteIdFor(cfg, 'doctors', day('2026-11-15')), 'y');
  assert.equal(paletteIdFor(cfg, 'everyone', Date.parse('2026-10-31T19:00:00Z')), 'b', '00:30 on 1 Nov in India is already November');
  const w = { ...cfg, schedule: 'weekly', start: '2026-10-05' };
  assert.equal(paletteIdFor(w, 'everyone', day('2026-10-05')), 'a');
  assert.equal(paletteIdFor(w, 'everyone', day('2026-10-11')), 'a');
  assert.equal(paletteIdFor(w, 'everyone', day('2026-10-12')), 'b');
  assert.equal(paletteIdFor(w, 'everyone', day('2026-10-26')), 'a');
  assert.equal(paletteIdFor({ ...cfg, schedule: 'fixed' }, 'doctors', day('2030-01-01')), 'violet');
});

test('the inline script gives the same answer as paletteIdFor and sets the three CSS values; a fixed colour needs no script', () => {
  const cfg = { ...theme, schedule: 'monthly', start: '2026-10-01' }, realNow = Date.now;
  assert.equal(themeScript({ ...cfg, schedule: 'fixed' }, palettes, 'everyone'), '');
  for (const mode of ['everyone', 'doctors']) for (const at of ['2026-10-10', '2026-12-20', '2027-03-02']) {
    const set = {}, DateFake = { now: () => day(at) };
    vm.runInNewContext(themeScript(cfg, palettes, mode), { document: { documentElement: { style: { setProperty: (k, v) => { set[k] = v; } } } }, Date: Object.assign(Date, DateFake) });
    const p = palettes.find((x) => x.id === paletteIdFor(cfg, mode, day(at)));
    assert.deepEqual(set, { '--pal-h': p.hue, '--pal-ld': `${p.ld}%`, '--pal-ll': `${p.ll}%` }, `${mode} ${at}`);
  }
  Date.now = realNow;
});
