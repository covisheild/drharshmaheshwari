// STOP-Bang scoring (src/lib/stop-bang.ts) against the published bands and stepwise rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopBang } from '../src/lib/stop-bang.ts';

const all = (v) => Object.fromEntries('stopbang'.split('').map((k) => [k, v]));

test('score counts each yes once', () => {
  assert.equal(stopBang(all(false)).score, 0);
  assert.equal(stopBang(all(true)).score, 8);
});

test('bands: 0-2 low, 3-4 intermediate, 5-8 high', () => {
  assert.equal(stopBang({ s: true, a: true }).risk, 'low');
  assert.equal(stopBang({ s: true, a: true, p: true }).risk, 'intermediate'); // STOP 2, no male/BMI/neck
  assert.equal(stopBang({ s: true, t: true, o: true, p: true }).risk, 'intermediate'); // STOP 4 alone
  assert.equal(stopBang({ s: true, t: true, o: true, p: true, a: true }).risk, 'high');
});

test('3-4 with STOP >= 2 plus male, BMI > 35 or large neck is high', () => {
  for (const k of ['g', 'b', 'n']) {
    const r = stopBang({ s: true, t: true, [k]: true });
    assert.equal(r.score, 3);
    assert.equal(r.risk, 'high', k);
    assert.ok(r.byRule);
  }
  assert.equal(stopBang({ s: true, g: true, a: true }).risk, 'intermediate'); // STOP only 1
});
