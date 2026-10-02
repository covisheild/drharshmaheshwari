// The series page's two personal rows, filled from this browser's reading progress (BookProgressStore):
// "Continue reading" and "Up next for you". Without progress both stay hidden. Also the Part chips.

import { BookProgressStore, type BookState } from './store';

interface ClientBook { id: string; url: string; number: number; title: string; hue: number; requires: string[]; sections: Record<string, string>; count: number }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const name = (t: string) => t.replace(/\s*·\s*Rung \d$/, '');

/** Read to the end: every section but the last passed, and nearly all the words. */
export const finished = (b: ClientBook, s?: BookState) => !!s && s.done.length >= b.count - 1 && s.percent >= 0.95;

function card(b: ClientBook, sub: string, percent?: number) {
  return `<a class="pcard" href="${b.url}" style="--h:${b.hue}">
    <span class="pcover"><span class="pn">Book ${b.number}</span><span class="pt">${esc(name(b.title))}</span></span>
    <span class="psub">${sub}</span>
    ${percent != null ? `<span class="pbar" aria-label="${Math.round(percent * 100)}% read"><i style="width:${Math.max(3, Math.round(percent * 100))}%"></i></span>` : ''}
  </a>`;
}

export function mountSeries() {
  const books = JSON.parse(document.getElementById('series-data')!.textContent!) as ClientBook[];
  const all = BookProgressStore.all();

  const reading = books.filter((b) => all[b.id]?.loc && !finished(b, all[b.id]))
    .sort((a, b) => all[b.id].updated - all[a.id].updated);
  if (reading.length) {
    document.getElementById('continue-shelf')!.innerHTML = reading.map((b) => {
      const s = all[b.id];
      const label = b.sections[s.loc!.s] ?? '';
      return card(b, `${/^\d+$/.test(label) ? `Section ${label}` : esc(label)} · ${Math.round(s.percent * 100)}%`, s.percent);
    }).join('');
    document.getElementById('continue')!.hidden = false;
  }

  const done = new Set(books.filter((b) => finished(b, all[b.id])).map((b) => b.id));
  const upNext = books.filter((b) => !done.has(b.id) && !all[b.id]?.loc && b.requires.length > 0 && b.requires.every((r) => done.has(r)));
  if (upNext.length) {
    document.getElementById('upnext-shelf')!.innerHTML = upNext.map((b) => card(b, 'Ready to start')).join('');
    document.getElementById('upnext')!.hidden = false;
  }

  // Part chips: one open list at a time; tapping the open one closes it.
  const chips = [...document.querySelectorAll<HTMLButtonElement>('.pchip')];
  chips.forEach((c) => c.addEventListener('click', () => {
    const open = c.getAttribute('aria-selected') !== 'true';
    chips.forEach((x) => {
      const on = x === c && open;
      x.setAttribute('aria-selected', String(on));
      document.getElementById(x.getAttribute('aria-controls')!)!.hidden = !on;
    });
  }));
}
