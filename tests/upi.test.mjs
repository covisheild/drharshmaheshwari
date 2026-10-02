// Unit tests for the UPI link builder (src/lib/support.ts, imported directly: Node strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPI_CONFIG, upiUri } from '../src/lib/support.ts';

const cfg = { upiId: 'someone.name@okbank', payeeName: 'Dr. Harsh Maheshwari', note: 'Support drharshmaheshwari.com', amountInQr: true };

test('builds an NPCI-style upi://pay URI with every value percent-encoded', () => {
  const u = upiUri(250, cfg);
  assert.equal(u, 'upi://pay?pa=someone.name%40okbank&pn=Dr.%20Harsh%20Maheshwari&am=250.00&cu=INR&tn=Support%20drharshmaheshwari.com');
  assert.doesNotMatch(u, /\+| /, 'spaces must be %20, never + or raw');
  const q = new URL(u.replace('upi://', 'https://x/')).searchParams;
  assert.equal(q.get('pa'), 'someone.name@okbank');
  assert.equal(q.get('pn'), 'Dr. Harsh Maheshwari');
  assert.equal(q.get('am'), '250.00');
  assert.equal(q.get('cu'), 'INR');
});

test('leaves the amount out when none is chosen, or when amounts must not go in the QR', () => {
  assert.doesNotMatch(upiUri(undefined, cfg), /[?&]am=/);
  assert.doesNotMatch(upiUri(250, { ...cfg, amountInQr: false }), /[?&]am=/);
});

test('encodes awkward characters in the name and note', () => {
  const u = upiUri(100, { ...cfg, payeeName: 'A & B / C?', note: 'Thanks #1 = 100%' });
  assert.match(u, /pn=A%20%26%20B%20%2F%20C%3F&/);
  assert.match(u, /tn=Thanks%20%231%20%3D%20100%25$/);
});

test('the committed configuration never contains a placeholder UPI ID', () => {
  const id = UPI_CONFIG.upiId.trim();
  assert.ok(id === '' || !/example|test|xxx|placeholder|yourname|abc@/i.test(id), `suspicious UPI ID: ${id}`);
});
