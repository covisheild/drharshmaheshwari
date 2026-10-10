// Tests for the voice-tutor spike (src/server/mcp-spike.ts): the MCP messages Claude sends, against the real exported
// Chapter 1 text, a local D1 database and a fake figure. Run with: node --import ./tests/ts-hooks.mjs --test tests/mcp-spike.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { handleMcpSpike, plain, locate, conceptBlocks } from '../src/server/mcp-spike.ts';
import { handleApi } from '../src/server/api.ts';

const DIR = new URL('../src/data/books/statistics-first-principles-to-regression/sections/', import.meta.url);
const sectionFromDisk = async (id) => {
  const f = new URL(`${id}.json`, DIR);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
let proxy, env, figureBytes = new Uint8Array(1000).fill(7);
const deps = { section: sectionFromDisk, figure: async () => figureBytes, now: () => 1_760_000_000_000 };

before(async () => {
  proxy = await getPlatformProxy({ configPath: new URL('./wrangler.test.jsonc', import.meta.url).pathname, persist: false });
  env = { DB: proxy.env.DB, MCP_SPIKE: 'on' };
});
after(() => proxy?.dispose());

let n = 0;
const rpc = async (method, params = {}, id = ++n) => {
  const res = await handleMcpSpike(new Request('https://preview.example/api/mcp-spike', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }), env, deps);
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
};
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).body.result;

test('switched off unless MCP_SPIKE is on; health and accounts untouched', async () => {
  const off = await handleApi(new Request('https://drharshmaheshwari.com/api/mcp-spike', { method: 'POST', body: '{}' }), {});
  assert.equal(off.status, 404);
  const health = await handleApi(new Request('https://drharshmaheshwari.com/api/health'), {});
  assert.equal(health.status, 200);
});

test('initialize, notifications and tool list follow the MCP handshake', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.ok(init.body.result.capabilities.tools);
  assert.equal((await rpc('initialize', { protocolVersion: '1999-01-01' })).body.result.protocolVersion, '2025-11-25');
  const note = await handleMcpSpike(new Request('https://x/api/mcp-spike', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), env, deps);
  assert.equal(note.status, 202);
  const tools = (await rpc('tools/list')).body.result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['get_concept', 'get_answer_key', 'show_figure', 'open_figure_viewer', 'save_note', 'list_notes']);
  for (const t of tools) {
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
  }
  assert.equal(tools.find((t) => t.name === 'save_note').annotations.readOnlyHint, false);
  assert.equal(tools.find((t) => t.name === 'open_figure_viewer')._meta.ui.resourceUri, 'ui://drhm/figure-viewer');
  assert.equal((await rpc('nope')).body.error.code, -32601);
  const get = await handleMcpSpike(new Request('https://x/api/mcp-spike'), env, deps);
  assert.equal(get.status, 405);
});

test('get_concept returns the exact book text of one concept, with questions and answer key', async () => {
  const r = await call('get_concept', { concept_id: 'stats:1.3' });
  const t = r.content[0].text;
  assert.match(t, /TUTOR RULES/);
  assert.match(t, /CONCEPT: stats:1\.3 \(§1\.3 Parameter vs Statistic/);
  // Word for word from c01-s03.json's definition.
  assert.ok(t.includes('A parameter is a numerical characteristic of a population: fixed and usually unknown.'));
  assert.match(t, /Q7\. A colleague says/);
  // The answers stay on the server until asked for, so the tutor cannot blurt them out.
  assert.doesNotMatch(t, /Only a census/);
  assert.doesNotMatch(t, /A7\./);
  assert.match(t, /call get_answer_key/);
  assert.equal(r.structuredContent.book_version, '3.1');
  assert.equal(r.isError, undefined);
});

test('get_answer_key returns one question\'s model answer, only for questions in that concept', async () => {
  const r = await call('get_answer_key', { concept_id: 'stats:1.3', question: 7 });
  assert.match(r.content[0].text, /^ANSWER KEY \(book's model answer\) for Q7: No\.\sOnly a census/);
  assert.doesNotMatch(r.content[0].text, /CBHI/); // Q9's answer is not included
  assert.equal((await call('get_answer_key', { concept_id: 'stats:1.2', question: 7 })).isError, true);
  assert.equal((await call('get_answer_key', { concept_id: 'stats:1.3', question: 99 })).isError, true);
  assert.equal((await call('get_answer_key', { concept_id: 'stats:9.9', question: 7 })).isError, true);
});

test('a heading-level concept stops at the next heading outside it', async () => {
  const t = (await call('get_concept', { concept_id: 'stats:1.1.1' })).content[0].text;
  assert.match(t, /Qualitative vs Quantitative Data/);
  assert.match(t, /Checkpoint 1\.1/);
  assert.doesNotMatch(t, /Scales of Measurement ==/);
  const scales = (await call('get_concept', { concept_id: 'stats:1.1.2' })).content[0].text;
  assert.match(scales, /§1\.1\.2\.1 Nominal Scale/);
  assert.match(scales, /Sub-concepts inside this one: stats:1\.1\.2\.1/);
});

test('every Chapter 1 section and heading resolves to a non-empty concept', async () => {
  for (let s = 1; s <= 6; s++) {
    const sec = await sectionFromDisk(`c01-s0${s}`);
    for (const num of [sec.label, ...sec.blocks.filter((b) => b.t === 'heading').map((b) => b.num)]) {
      assert.deepEqual(locate(`stats:${num}`), { section: sec.id, num }, num);
      assert.ok(conceptBlocks(sec, num).blocks.length > 0, num);
    }
  }
});

test('bad concept ids are refused', async () => {
  for (const id of ['stats:2.1', 'stats:1.9', 'c01-s03', 'stats:1.3; drop table', 42]) {
    assert.equal((await call('get_concept', { concept_id: id })).isError, true, String(id));
  }
  assert.equal((await call('get_concept', { concept_id: 'stats:1.1.9' })).isError, true);
});

test('figures: image content with caption and link; too large falls back to the link', async () => {
  const concept = await call('get_concept', { concept_id: 'stats:1.5' });
  assert.deepEqual(concept.structuredContent.figures.map((f) => f.id), ['stats:ch01-designs']);
  const r = await call('show_figure', { figure_id: 'stats:ch01-designs' });
  assert.equal(r.content[0].type, 'image');
  assert.equal(r.content[0].mimeType, 'image/png');
  assert.equal(Buffer.from(r.content[0].data, 'base64').length, 1000);
  assert.match(r.content[1].text, /Figure 1\.1\./);
  assert.match(r.content[1].text, /Full size, zoomable/);
  assert.equal(r.structuredContent.url, 'https://files.drharshmaheshwari.com/books/statistics-first-principles-to-regression/figures/ch01-designs.png');
  figureBytes = new Uint8Array(200_000);
  const big = await call('show_figure', { figure_id: 'stats:ch01-designs' });
  assert.equal(big.content.length, 1);
  assert.match(big.content[0].text, /too large.*200000 bytes/);
  figureBytes = new Uint8Array(1000).fill(7);
  const viewer = await call('open_figure_viewer', { figure_id: 'stats:ch01-designs' });
  assert.equal(viewer.structuredContent.caption.startsWith('Figure 1.1.'), true);
  assert.equal((await call('show_figure', { figure_id: 'stats:ch09-nothing' })).isError, true);
  const ui = (await rpc('resources/read', { uri: 'ui://drhm/figure-viewer' })).body.result.contents[0];
  assert.equal(ui.mimeType, 'text/html;profile=mcp-app');
  assert.match(ui.text, /ext-apps@1\.7\.5/);
  assert.ok(ui._meta.ui.csp.resourceDomains.includes('https://files.drharshmaheshwari.com'));
});

test('notes are saved, validated and listed', async () => {
  assert.equal((await call('list_notes', {})).content[0].text, 'No notes saved yet.');
  assert.match((await call('save_note', { concept_id: 'stats:1.3', result: 'partly correct', note: 'Mixed up <b>x̄</b> and μ once.' })).content[0].text, /Saved/);
  assert.equal((await call('save_note', { concept_id: 'stats:1.3', result: 'great', note: 'x' })).isError, true);
  assert.equal((await call('save_note', { concept_id: 'stats:1.3', result: 'correct', note: 'x'.repeat(301) })).isError, true);
  const list = (await call('list_notes', {})).content[0].text;
  assert.match(list, /stats:1\.3 {2}partly correct: Mixed up x̄ and μ once\./);
});

test('plain() keeps the words and decodes entities', () => {
  assert.equal(plain('<p>A &amp; B&nbsp;&#8211; <strong>C</strong></p><ul><li>one</li><li>two</li></ul>'), 'A & B – C\n\n- one\n- two');
});
