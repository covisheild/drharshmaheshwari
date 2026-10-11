// A short fingerprint of an English source file. Each translation records the fingerprint of the English it was made from;
// when the English changes, the fingerprints differ, the old translation is not shown (the page shows the English with a
// note instead), and `npm test` fails until it is translated again. Flipping `draft:` does not count as a change.
// Web Crypto only, so it runs the same in Node (tests, scripts) and in workerd (where pages are prerendered).

export function normalise(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/^draft:.*\n/m, '').trim();
}

export async function fingerprint(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalise(raw)));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}
