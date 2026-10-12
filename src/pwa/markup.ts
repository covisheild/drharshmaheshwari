// The "Save for offline" control's HTML: written at build time by OfflineSave.astro, and in the browser by /app/.
// Its space is kept from the first paint (invisible until ready), so the text below never moves: the book reader holds
// the reader's place by the layout. scripts/pwa/integration.mjs reads the data-offline-* attributes of the built pages to find every pack.

export interface PackRef { id: string; title: string; root: string; kind: string; /** Heading it is listed under in Settings (a series or shelf). */ group?: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** `tr`: the page's words (w() in the browser); English by default. */
export const offlineSaveHtml = (p: PackRef, tr: (en: string) => string = (en) => en) =>
  `<div class="ofl ofl-wait" data-offline-pack="${esc(p.id)}" data-offline-title="${esc(p.title)}" data-offline-root="${esc(p.root)}" data-offline-kind="${esc(p.kind)}"${p.group ? ` data-offline-group="${esc(p.group)}"` : ''}>` +
  '<div class="ofl-row"><button type="button" class="btn btn-ghost ofl-main"><span>' + tr('Save for offline') + '</span></button>' +
  '<button type="button" class="ofl-remove" hidden>' + tr('Remove') + '</button></div>' +
  '<div class="ofl-bar" hidden><i></i></div><p class="ofl-note" aria-live="polite"></p></div>';
