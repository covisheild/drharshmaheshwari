// The "Save for offline" control's HTML: written at build time by OfflineSave.astro, and in the browser by /app/.
// Its space is kept from the first paint (invisible until ready), so the text below never moves: the book reader holds
// the reader's place by the layout. scripts/pwa/integration.mjs reads the data-offline-* attributes of the built pages to find every pack.

export interface PackRef { id: string; title: string; root: string; kind: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const offlineSaveHtml = (p: PackRef) =>
  `<div class="ofl ofl-wait" data-offline-pack="${esc(p.id)}" data-offline-title="${esc(p.title)}" data-offline-root="${esc(p.root)}" data-offline-kind="${esc(p.kind)}">` +
  '<div class="ofl-row"><button type="button" class="btn btn-ghost ofl-main"><span>Save for offline</span></button>' +
  '<button type="button" class="ofl-remove" hidden>Remove</button></div>' +
  '<div class="ofl-bar" hidden><i></i></div><p class="ofl-note" aria-live="polite"></p></div>';
