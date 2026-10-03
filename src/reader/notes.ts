// The Notes tab in the reader's side panel: every highlight in the book, in book order, with its note; tap one to go
// there. "Copy as Markdown" and "Download" give the highlights and notes as a plain text file the reader keeps.

import type { HighlightApi } from './highlights';
import { COLOURS } from './highlights';
import type { Highlight } from './store';

export interface ExportItem { label: string; title: string; text: string; note: string }
export interface ExportBook { id: string; title: string; version: string; url: string; licence: string; author: string }

/** The highlights and notes as Markdown. Pure, so it is tested without a browser. */
export function notesMarkdown(book: ExportBook, items: ExportItem[], date = new Date()): string {
  const out = [`# Notes: ${book.title}`, '', `Version ${book.version} · exported ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${book.url}`, ''];
  let last = '';
  for (const it of items) {
    const heading = `${it.label} · ${it.title}`;
    if (heading !== last) { out.push(`## ${heading}`, ''); last = heading; }
    out.push(...it.text.split('\n').map((l) => `> ${l}`.trimEnd()), '');
    if (it.note.trim()) out.push(it.note.trim(), '');
  }
  if (!items.length) out.push('No highlights yet.', '');
  out.push('---', '', `Highlighted passages are quoted from ${book.title} by ${book.author}, shared under ${book.licence}: free to copy, share and adapt for non-commercial use, with credit, under the same licence.`, '');
  return out.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const line = (s: string, max = 200) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

export interface NotesHost {
  panel: HTMLElement;
  highlights: () => Highlight[];
  api: () => HighlightApi;
  secs: Map<string, HTMLElement>;
  book: ExportBook;
  /** Closes the drawer on a phone, so the highlight can be seen. */
  leave(): void;
}

export function mountNotes(host: NotesHost) {
  const list = host.panel.querySelector<HTMLOListElement>('ol')!;
  const empty = host.panel.querySelector<HTMLElement>('.rd-empty')!;
  const tools = host.panel.querySelector<HTMLElement>('.rd-notes-tools')!;
  const status = host.panel.querySelector<HTMLElement>('.rd-notes-status')!;
  const order = new Map([...host.secs.keys()].map((id, i) => [id, i]));
  const title = (id: string) => host.secs.get(id)?.querySelector('h3 span:last-child')?.textContent?.trim() ?? '';
  const label = (id: string) => host.secs.get(id)?.dataset.label ?? '';
  const sorted = () => [...host.highlights()].sort((a, b) => (order.get(a.sec) ?? 0) - (order.get(b.sec) ?? 0) || a.start - b.start);

  let queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const hs = sorted();
      const lost = host.api().unplaced();
      empty.hidden = hs.length > 0;
      tools.hidden = hs.length === 0;
      list.innerHTML = hs.map((h) => `<li><button type="button" class="rd-nt" data-hl="${h.id}" style="--dot:var(--sw-${h.colour})">
        <span class="rd-nt-top"><i class="sw" title="${COLOURS[h.colour] ?? ''}"></i><span class="n">${esc(label(h.sec))}</span>${lost.has(h.id) ? '<span class="flag">text changed in this version</span>' : ''}</span>
        <span class="rd-nt-text">${esc(line(h.text))}</span>${h.note ? `<span class="rd-nt-body">${esc(line(h.note, 240))}</span>` : ''}</button></li>`).join('');
    });
  }

  const markdown = () => notesMarkdown(host.book, sorted().map((h) => ({ label: label(h.sec), title: title(h.sec), text: h.text, note: h.note })));
  const say = (m: string) => { status.textContent = m; setTimeout(() => { if (status.textContent === m) status.textContent = ''; }, 2500); };

  host.panel.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLButtonElement>('[data-hl]');
    if (item) { host.leave(); await host.api().show(item.dataset.hl!); return; }
    const act = t.closest<HTMLButtonElement>('[data-notes]')?.dataset.notes;
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(markdown()); say('Copied.'); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = markdown(); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.append(ta); ta.select();
        say(document.execCommand('copy') ? 'Copied.' : 'Could not copy. Use Download.');
        ta.remove();
      }
    } else if (act === 'download') {
      const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `notes-${host.book.id.toLowerCase()}.md`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('Downloaded.');
    }
  });

  return { draw };
}
