// Highlights and notes in the book reader.
//
// A highlight is a range in a section's text (anchor.ts holds the rules for finding it again after the book
// changes). It is painted with the browser's CSS Custom Highlight API, so the book's HTML is never touched: no
// wrapping spans, paragraph numbers stay valid, and tables, superscripts and glossary terms keep working.
//
// What selecting text does is the reader's choice (Aa panel, ReaderPrefs.select):
//   bar    a small bar with the colours (and Note) appears under the selection. The default.
//   quick  the selection is highlighted at once in the chosen colour; nothing opens.
//   off    selecting text does what the browser always did.
// Tapping an existing highlight opens a small card (colour, note, remove) unless that is switched off too.
// The `h` key highlights the current selection.
//
// Everything goes through the store (store.ts / sync.ts): saved in the browser at once, uploaded in batches when signed in.

import { MAX_QUOTE, makeAnchor, resolve, trimRange } from './anchor';
import type { Highlight, ReaderPrefs } from './store';
import type { SyncedBookStore } from './sync';

export const COLOURS = ['Yellow', 'Green', 'Blue', 'Pink'];

interface Para { el: HTMLElement; start: number; end: number }
interface SectionIndex { paras: Para[]; text: string }

export interface HighlightHost {
  root: HTMLElement;
  store: SyncedBookStore;
  /** Section id -> its `.rd-sec` element, in book order. */
  secs: Map<string, HTMLElement>;
  getPrefs(): ReaderPrefs;
  setPrefs(patch: Partial<ReaderPrefs>): void;
  /** Go to a place: section, paragraph; `head` goes to the section's heading. */
  jumpTo(loc: { s: string; p: number; f: number }, head?: boolean): Promise<void>;
  topline(): number;
  /** Called when the set of highlights, or which of them could be placed, changed. */
  onChange?(): void;
  /** "Copy for AI": a question about a passage (a selection, or an existing highlight with its note). */
  ask?(a: { sec: string; text: string; note?: string }): void;
  /** Copy plain text (the selection, or a highlight's words) to the clipboard and say so. */
  copy?(text: string): void;
}

export interface HighlightApi {
  /** A section's text has just been rendered: index it and place its highlights. */
  sectionLoaded(id: string, body: HTMLElement): void;
  /** The store changed (here, or from another device). */
  refresh(): void;
  prefsChanged(): void;
  /** Jump to a highlight and open its card. */
  show(id: string): Promise<void>;
  /** Highlights that could not be placed in the loaded text (their words changed in a newer version). */
  unplaced(): Set<string>;
  /** The selection as a highlight request, for features that act on it (Copy for AI). */
  selection(): { text: string; sec: string; heading: string } | null;
}

const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

// ---------------------------------------------------------------- text <-> DOM
function indexSection(body: HTMLElement): SectionIndex {
  const paras: Para[] = [];
  let pos = 0;
  const parts: string[] = [];
  for (const el of body.querySelectorAll<HTMLElement>('[data-p]')) {
    const t = el.textContent ?? '';
    paras.push({ el, start: pos, end: pos + t.length });
    parts.push(t);
    pos += t.length + 1; // a line break between paragraphs
  }
  return { paras, text: parts.join('\n') };
}

/** The point (node, offset) as a character offset in the section's text; a point between paragraphs snaps to the nearest paragraph edge. */
function offsetOf(paras: Para[], node: Node, offset: number, isEnd: boolean): number | null {
  const probe = document.createRange();
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    probe.selectNodeContents(p.el);
    const where = probe.comparePoint(node, offset); // -1 before this paragraph, 0 inside it, 1 after it
    if (where === 0) {
      const r = document.createRange();
      r.setStart(p.el, 0);
      r.setEnd(node, offset);
      return p.start + r.toString().length;
    }
    if (where < 0) return isEnd ? (i > 0 ? paras[i - 1].end : null) : p.start;
  }
  return isEnd && paras.length ? paras[paras.length - 1].end : null;
}

/** The DOM point for a character offset inside one paragraph. */
function pointIn(el: HTMLElement, local: number, isEnd: boolean): [Node, number] | null {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let last: Text | null = null;
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const len = n.data.length;
    if (isEnd ? local <= pos + len : local < pos + len) return [n, local - pos];
    pos += len;
    last = n;
  }
  return last && local === pos ? [last, last.data.length] : null;
}

/** A DOM Range for the characters a..b of the section's text. */
function rangeFor(paras: Para[], a: number, b: number): Range | null {
  const from = paras.find((p) => a < p.end);
  let to: Para | undefined;
  for (const p of paras) { if (b > p.start) to = p; if (b <= p.end) break; }
  if (!from || !to) return null;
  const s = pointIn(from.el, Math.max(0, a - from.start), false);
  const e = pointIn(to.el, Math.min(to.end, b) - to.start, true);
  if (!s || !e) return null;
  const r = document.createRange();
  r.setStart(s[0], s[1]);
  r.setEnd(e[0], e[1]);
  return r.collapsed ? null : r;
}

/** The selected words as they read: superscripts as ^, no citation numbers, one line per line. */
export function readable(frag: DocumentFragment): string {
  const box = document.createElement('div');
  box.append(frag);
  box.querySelectorAll('.cite, button').forEach((e) => e.remove());
  const wrap = (mark: string) => (e: Element) => { const t = e.textContent ?? ''; e.replaceWith(`${mark}${t.length > 1 ? `(${t})` : t}`); };
  box.querySelectorAll('sup').forEach(wrap('^'));
  box.querySelectorAll('sub').forEach(wrap('_'));
  box.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
  box.querySelectorAll('.wl, p, li, div, tr, figcaption, h1, h2, h3, h4, blockquote').forEach((e) => e.append('\n'));
  return (box.textContent ?? '').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

const asLine = (s: string, max = 160) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); return p ? { node: p.offsetNode, offset: p.offset } : null; }
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); return r ? { node: r.startContainer, offset: r.startOffset } : null; }
  return null;
}

// ---------------------------------------------------------------- the engine
export function mountHighlights(host: HighlightHost): HighlightApi {
  const { root, store } = host;
  const sections = new Map<string, SectionIndex>();
  const ranges = new Map<string, Range>();
  const lost = new Set<string>();
  let seen: readonly Highlight[] | null = null;
  const bar = document.getElementById('rd-sel')!;
  const card = document.getElementById('rd-hl')!;
  const cardNote = card.querySelector<HTMLTextAreaElement>('.rd-hl-note')!;
  const cardQuote = card.querySelector<HTMLElement>('.rd-hl-quote')!;
  const cardSaved = card.querySelector<HTMLElement>('.rd-hl-saved')!;
  // A browser without the CSS Highlight API could make highlights but not show them: there, selecting does nothing special.
  const prefs = () => (supported() ? host.getPrefs() : { ...host.getPrefs(), select: 'off' as const });

  // ---- painting
  function place(h: Highlight) {
    const idx = sections.get(h.sec);
    if (!idx) return;
    const at = resolve(idx.text, { start: h.start, end: h.end, quote: h.quote, before: h.before, after: h.after });
    const r = at && rangeFor(idx.paras, at.start, at.end);
    if (!r) { ranges.delete(h.id); lost.add(h.id); return; }
    lost.delete(h.id);
    ranges.set(h.id, r);
  }
  function paint() {
    if (!supported()) return;
    const groups = new Map<string, Range[]>();
    if (prefs().show) {
      for (const h of store.highlights()) {
        const r = ranges.get(h.id);
        if (!r) continue;
        const name = `hl-${h.colour}${h.note ? 'n' : ''}`;
        (groups.get(name) ?? groups.set(name, []).get(name)!).push(r);
      }
    }
    for (const c of [0, 1, 2, 3]) for (const suffix of ['', 'n']) {
      const name = `hl-${c}${suffix}`;
      const rs = groups.get(name);
      if (rs) CSS.highlights.set(name, new Highlight(...rs)); else CSS.highlights.delete(name);
    }
  }
  function refresh() {
    const all = store.get().highlights;
    if (all === seen) return;
    seen = all;
    const live = new Map(store.highlights().map((h) => [h.id, h]));
    for (const id of [...ranges.keys()]) if (!live.has(id)) ranges.delete(id);
    for (const id of [...lost]) if (!live.has(id)) lost.delete(id);
    for (const h of live.values()) if (!ranges.has(h.id) && !lost.has(h.id)) place(h);
    paint();
    if (openId && !live.has(openId)) closeCard();
    host.onChange?.();
  }
  function sectionLoaded(id: string, body: HTMLElement) {
    sections.set(id, indexSection(body));
    for (const h of store.highlights()) if (h.sec === id) { ranges.delete(h.id); lost.delete(h.id); place(h); }
    paint();
    host.onChange?.();
  }

  // ---- from a selection to a highlight
  interface Picked { sec: string; start: number; end: number; range: Range }
  const bodyOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('.rd-body') ?? null;
  function pick(): Picked | { tooLong: true } | null {
    const sel = getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    const b0 = bodyOf(r.startContainer), b1 = bodyOf(r.endContainer);
    if (!b0 || !b1) return null;
    const sec = b0.closest<HTMLElement>('.rd-sec')?.dataset.sec;
    const idx = sec ? sections.get(sec) : undefined;
    if (!sec || !idx || !idx.paras.length) return null;
    const s = offsetOf(idx.paras, r.startContainer, r.startOffset, false);
    // A selection that runs into the next section is cut at the end of this one.
    const e = b1 === b0 ? offsetOf(idx.paras, r.endContainer, r.endOffset, true) : idx.paras[idx.paras.length - 1].end;
    if (s == null || e == null) return null;
    const [start, end] = trimRange(idx.text, s, e);
    if (end <= start) return null;
    if (end - start > MAX_QUOTE) return { tooLong: true };
    const range = rangeFor(idx.paras, start, end);
    return range ? { sec, start, end, range } : null;
  }

  /** Makes the highlight (or recolours the same words if they are already highlighted). */
  function create(p: Picked, colour: number): Highlight | null {
    const idx = sections.get(p.sec);
    if (!idx) return null;
    const same = store.highlights().find((h) => h.sec === p.sec && h.start === p.start && h.end === p.end);
    if (same) return store.updateHighlight(same.id, { colour });
    const a = makeAnchor(idx.text, p.start, p.end);
    const first = idx.paras.find((x) => p.start < x.end);
    return store.addHighlight({ sec: p.sec, start: p.start, end: p.end, para: Number(first?.el.dataset.p ?? 0), quote: a.quote, before: a.before, after: a.after, text: readable(p.range.cloneContents()), colour });
  }
  const clearSelection = () => getSelection()?.removeAllRanges();

  // ---- the bar under a selection
  let picked: Picked | null = null;
  const tooLongNote = () => { const t = document.getElementById('rd-toast'); if (t) { t.innerHTML = `<p>That is too long for one highlight (more than ${MAX_QUOTE.toLocaleString('en-IN')} characters). Select a shorter passage.</p><div><button type="button" data-stay>OK</button></div>`; t.hidden = false; t.querySelector('[data-stay]')!.addEventListener('click', () => { t.hidden = true; }); } };

  function placeNear(el: HTMLElement, rect: DOMRect, preferBelow = true) {
    if (matchMedia('(max-width: 700px)').matches && el === card) { el.style.left = el.style.top = ''; return; } // a sheet at the bottom
    const w = el.offsetWidth, h = el.offsetHeight;
    const touch = matchMedia('(pointer: coarse)').matches;
    const gap = touch ? 26 : 10; // phones draw selection handles under the text
    const top = host.topline();
    let y = preferBelow ? rect.bottom + gap : rect.top - h - gap;
    if (y + h > innerHeight - 8) y = rect.top - h - gap;
    if (y < top) y = Math.min(innerHeight - h - 8, rect.bottom + gap);
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))}px`;
    el.style.top = `${Math.max(top, y)}px`;
  }
  function showBar(p: Picked) {
    picked = p;
    const c = prefs();
    bar.querySelector<HTMLElement>('[data-act="note"]')!.hidden = !c.note;
    bar.querySelector<HTMLElement>('[data-act="ask"]')!.hidden = !c.ai;
    bar.querySelector<HTMLElement>('[data-act="copy"]')!.hidden = !c.copy;
    bar.querySelectorAll<HTMLElement>('[data-colour]').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.colour) === c.colour)));
    bar.hidden = false;
    reposition();
  }
  function reposition() {
    if (bar.hidden || !picked) return;
    const rects = picked.range.getClientRects();
    const last = rects[rects.length - 1] ?? picked.range.getBoundingClientRect();
    if (last.bottom < host.topline() - 4 || last.top > innerHeight) { bar.hidden = true; return; }
    placeNear(bar, last);
  }
  function hideBar() { bar.hidden = true; }

  // A button in the bar acts on pointer-up, not on click: on a phone the selection can collapse (and the bar hide) between
  // the tap and its click. While a finger or the mouse is on the bar the selection is left alone.
  let barBusy = false;
  const activate = (b: HTMLButtonElement) => {
    const p = picked;
    if (!p) return;
    if (b.dataset.colour != null) {
      const colour = Number(b.dataset.colour);
      host.setPrefs({ colour }); // the bar remembers the last colour used
      create(p, colour);
      hideBar(); clearSelection();
    } else if (b.dataset.act === 'note') {
      const h = create(p, prefs().colour);
      hideBar(); clearSelection();
      if (h) openCard(h.id, true);
    } else if (b.dataset.act === 'copy') {
      const text = readable(p.range.cloneContents()); // copying does not make a highlight
      hideBar(); clearSelection();
      host.copy?.(text);
    } else if (b.dataset.act === 'ask') {
      const text = readable(p.range.cloneContents()); // asking does not make a highlight
      hideBar(); clearSelection();
      host.ask?.({ sec: p.sec, text });
    }
  };
  bar.addEventListener('pointerdown', (e) => { barBusy = true; e.preventDefault(); }); // keeps the selection
  bar.addEventListener('pointerup', (e) => {
    barBusy = false;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b) { e.preventDefault(); activate(b); }
  });
  bar.addEventListener('pointercancel', () => { barBusy = false; });
  bar.addEventListener('click', (e) => { // the keyboard (Enter, Space): a pointer's click has already been handled
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b && e.detail === 0) activate(b);
  });

  // ---- when a selection has settled
  let settle = 0;
  let mouseDown = false;
  const evaluate = () => {
    const mode = prefs().select;
    if (mode === 'off' || mouseDown) { hideBar(); return; }
    const p = pick();
    if (!p) { hideBar(); return; }
    if ('tooLong' in p) { hideBar(); return; } // (select-all, say: only the H key explains)
    if (mode === 'quick') { create(p, prefs().colour); hideBar(); clearSelection(); return; }
    showBar(p);
  };
  document.addEventListener('selectionchange', () => {
    // While the selection is still changing nothing shows; touch handles give no pointer events, so wait for it to settle.
    if (barBusy) return;
    hideBar();
    clearTimeout(settle);
    settle = window.setTimeout(evaluate, prefs().select === 'quick' && matchMedia('(pointer: coarse)').matches ? 700 : 350);
  });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') mouseDown = true; });
  document.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { mouseDown = false; clearTimeout(settle); settle = window.setTimeout(evaluate, 0); } });
  addEventListener('scroll', () => { if (!bar.hidden) requestAnimationFrame(reposition); }, { passive: true });
  addEventListener('resize', () => { reposition(); if (openId) placeCard(); });

  // ---- the card for one highlight
  let openId: string | null = null;
  let noteTimer = 0;
  const placeCard = () => {
    const r = openId ? ranges.get(openId) : null;
    if (!r) { card.style.left = card.style.top = ''; return; }
    const rects = r.getClientRects();
    placeNear(card, rects[0] ?? r.getBoundingClientRect());
  };
  function flushNote() {
    clearTimeout(noteTimer);
    noteTimer = 0;
    if (openId && !card.hidden) {
      const h = store.highlights().find((x) => x.id === openId);
      if (h && h.note !== cardNote.value) { store.updateHighlight(openId, { note: cardNote.value }); cardSaved.textContent = 'Saved'; }
    }
  }
  function openCard(id: string, focusNote = false) {
    const h = store.highlights().find((x) => x.id === id);
    if (!h) return;
    flushNote();
    openId = id;
    cardQuote.textContent = asLine(h.text, 140);
    cardNote.value = h.note;
    cardSaved.textContent = '';
    card.querySelector<HTMLElement>('[data-act="ask"]')!.hidden = !prefs().ai;
    card.querySelector<HTMLElement>('[data-act="copy"]')!.hidden = !prefs().copy;
    card.querySelectorAll<HTMLElement>('[data-colour]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.colour) === h.colour)));
    card.hidden = false;
    placeCard();
    if (focusNote) cardNote.focus({ preventScroll: true }); else card.focus({ preventScroll: true });
  }
  function closeCard() {
    flushNote();
    // A hidden note box must not keep the keyboard: the H shortcut ignores typing in boxes.
    if (card.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    card.hidden = true;
    openId = null;
  }
  cardNote.addEventListener('input', () => { cardSaved.textContent = ''; clearTimeout(noteTimer); noteTimer = window.setTimeout(flushNote, 400); });
  cardNote.addEventListener('blur', flushNote);
  card.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || !openId) return;
    if (b.dataset.colour != null) {
      flushNote();
      store.updateHighlight(openId, { colour: Number(b.dataset.colour) });
      card.querySelectorAll<HTMLElement>('[data-colour]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    } else if (b.dataset.act === 'remove') {
      const id = openId;
      closeCard();
      store.removeHighlight(id);
    } else if (b.dataset.act === 'copy') {
      const h = store.highlights().find((x) => x.id === openId);
      if (h) host.copy?.(h.text);
    } else if (b.dataset.act === 'ask') {
      const h = store.highlights().find((x) => x.id === openId);
      flushNote();
      const note = h ? store.highlights().find((x) => x.id === openId)?.note : '';
      if (h) host.ask?.({ sec: h.sec, text: h.text, note });
    } else if (b.dataset.act === 'close') closeCard();
  });

  // ---- tapping a highlight opens its card
  function hit(x: number, y: number): string | null {
    const caret = caretAt(x, y);
    if (!caret) return null;
    const sec = bodyOf(caret.node)?.closest<HTMLElement>('.rd-sec')?.dataset.sec;
    if (!sec) return null;
    let best: Highlight | null = null;
    for (const h of store.highlights()) {
      const r = ranges.get(h.id);
      if (h.sec !== sec || !r || !r.isPointInRange(caret.node, caret.offset)) continue;
      // The caret snaps to the nearest letter, so also require the tap to be on the painted words themselves.
      if (![...r.getClientRects()].some((c) => x >= c.left - 1 && x <= c.right + 1 && y >= c.top - 1 && y <= c.bottom + 1)) continue;
      if (!best || h.end - h.start < best.end - best.start || (h.end - h.start === best.end - best.start && h.created > best.created)) best = h;
    }
    return best?.id ?? null;
  }
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!prefs().show || t.closest('button, a, dfn, input, textarea, label, #rd-hl, #rd-sel, #rd-pop, #rd-zoom') || !t.closest('.rd-body')) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const id = hit(e.clientX, e.clientY);
    if (id) openCard(id); else if (!card.hidden) closeCard();
  });
  document.addEventListener('click', (e) => { if (!card.hidden && !(e.target as HTMLElement).closest('#rd-hl, #rd-sel, .rd-body, .rd-notes')) closeCard(); });

  // ---- keys
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      if (!card.hidden) { e.stopPropagation(); closeCard(); }
      else if (!bar.hidden) { hideBar(); clearSelection(); }
      return;
    }
    if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey && !t.closest('input, textarea, [contenteditable]') && prefs().select !== 'off') {
      const p = pick();
      if (!p) return;
      e.preventDefault();
      if ('tooLong' in p) { tooLongNote(); return; }
      create(p, prefs().colour);
      hideBar(); clearSelection();
    }
  }, true);

  // On a phone the card is a sheet at the bottom: lift it above the on-screen keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const lift = () => card.style.setProperty('--kb', `${Math.max(0, innerHeight - (vv.height + vv.offsetTop))}px`);
    vv.addEventListener('resize', lift);
    vv.addEventListener('scroll', lift);
  }

  // ---- jump to one (from the notes list)
  async function show(id: string) {
    const h = store.highlights().find((x) => x.id === id);
    if (!h) return;
    await host.jumpTo({ s: h.sec, p: h.para, f: 0 }, lost.has(id) || !sections.has(h.sec));
    if (!ranges.has(id)) place(h);
    const r = ranges.get(id);
    if (r && supported()) {
      CSS.highlights.set('hl-flash', new Highlight(r));
      setTimeout(() => CSS.highlights.delete('hl-flash'), 1800);
      const top = r.getBoundingClientRect().top;
      if (top < host.topline() + 8 || top > innerHeight - 140) window.scrollBy({ top: top - host.topline() - 80, behavior: 'instant' });
    }
    openCard(id);
  }

  return {
    sectionLoaded, refresh,
    prefsChanged() { paint(); if (prefs().select === 'off') hideBar(); },
    show,
    unplaced: () => lost,
    selection() {
      const p = pick();
      if (!p || 'tooLong' in p) return null;
      const sec = host.secs.get(p.sec);
      return { text: readable(p.range.cloneContents()), sec: p.sec, heading: `${sec?.dataset.label ?? ''} · ${sec?.querySelector('h3 span:last-child')?.textContent ?? ''}` };
    },
  };
}

