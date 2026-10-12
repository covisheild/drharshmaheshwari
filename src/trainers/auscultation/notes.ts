// In the browser: the teaching notes Notes.astro put on the page.
let notes: Record<string, { listen: string }> | null = null;

export function listenFor(findingId: string): string {
  if (!notes) {
    try { notes = JSON.parse(document.getElementById('trainer-notes')?.textContent ?? '{}'); } catch { notes = {}; }
  }
  return notes![findingId]?.listen ?? '';
}
