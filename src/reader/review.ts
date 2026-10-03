// A book's Review: spaced repetition over what you have met in the book, using the trainers' scheduler
// (src/trainers/core/schedule.ts, FSRS). Two kinds of item:
//   - questions you marked in the reader (exercises `-e<n>`, practice `-p<n>`): missed last time = due now;
//     otherwise due when predicted recall falls to 90%;
//   - must-know points (`-k<n>`) of sections you have read to the end: new ones join at most NEW_PER_DAY a day,
//     then follow the same schedule. You recall the point, open it, and mark yourself.
// Nothing extra is stored: the schedule is rebuilt from the marks each time, on every device alike.

import { dueItems, nextDue } from '../trainers/core/schedule';
import { lines, numberParagraphs } from './render';
import { sectionOf } from './store';
import { SyncedBookStore } from './sync';
import type { Block, OutlinePart, Section } from './types';

export const NEW_PER_DAY = 10;
interface Data { outline: OutlinePart[]; sectionsBase: string; figureBase: string; bookUrl: string }

export function dueCount(store: { get(): { attempts: readonly import('../trainers/core/progress').Attempt[] } }) {
  return dueItems(store.get().attempts).length;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function mountReview() {
  const root = document.getElementById('rv');
  if (!root) return;
  const data = JSON.parse(document.getElementById('rv-data')!.textContent!) as Data;
  const store = new SyncedBookStore(root.dataset.book!, root.dataset.version!);
  const box = root.querySelector<HTMLElement>('.rv-card')!;
  const count = root.querySelector<HTMLElement>('.rv-count')!;
  const sections = data.outline.flatMap((p) => p.sections);
  const title = new Map(sections.map((s) => [s.id, `${s.label} · ${s.title}`]));
  const cache = new Map<string, Promise<Section>>();
  const load = (id: string) => {
    if (!cache.has(id)) cache.set(id, fetch(`${data.sectionsBase}${id}.json`).then((r) => r.json() as Promise<Section>));
    return cache.get(id)!;
  };

  await Promise.race([store.ready(), new Promise((r) => setTimeout(r, 4000))]);

  // The queue: due items first (missed, then most overdue), then today's new must-know points.
  const st = store.get();
  const queue: string[] = dueItems(st.attempts).map((d) => d.item).filter((i) => title.has(sectionOf(i)));
  const tried = new Set(st.attempts.map((a) => a.item));
  const today = new Date().toDateString();
  const firstSeen = new Map<string, number>();
  for (const a of st.attempts) if (!firstSeen.has(a.item)) firstSeen.set(a.item, a.t);
  const newToday = [...firstSeen].filter(([i, t]) => /-k\d+$/.test(i) && new Date(t).toDateString() === today).length;
  let room = Math.max(0, NEW_PER_DAY - newToday);
  for (const s of sections) {
    if (!room) break;
    if (!st.done.includes(s.id)) continue;
    const sec = await load(s.id);
    const mk = sec.blocks.find((b) => b.t === 'mustknow') as Extract<Block, { t: 'mustknow' }> | undefined;
    mk?.points.forEach((_, k) => { const id = `${s.id}-k${k + 1}`; if (room && !tried.has(id) && !queue.includes(id)) { queue.push(id); room--; } });
  }

  let i = 0;
  let marked = 0;
  const show = async () => {
    if (i >= queue.length) return finish();
    count.textContent = `${i + 1} of ${queue.length}`;
    const item = queue[i];
    const sid = sectionOf(item);
    const sec = await load(sid);
    const kind = item.match(/-([epk])(\d+)$/)!;
    const n = Number(kind[2]);
    let head = '', front = '', back = '';
    if (kind[1] === 'k') {
      const mk = sec.blocks.find((b) => b.t === 'mustknow') as Extract<Block, { t: 'mustknow' }>;
      const p = mk.points[n - 1];
      head = `Must-know point ${n} of ${mk.points.length}${p.tag ? ` · ${esc(p.tag.replace('_', ' '))}` : ''}`;
      front = `<p class="rv-ask">What is must-know point ${n} of this section? Say it to yourself, then open it.</p>`;
      back = `<div class="c">${p.html}</div>`;
    } else {
      const b = sec.blocks.find((x) => x.t === (kind[1] === 'e' ? 'exercise' : 'practice') && x.n === n) as Extract<Block, { t: 'exercise' | 'practice' }> | undefined;
      if (!b) { i++; return show(); } // a question that a new version of the book no longer has
      head = kind[1] === 'e' ? `Exercise ${n} · ${esc((b as { type: string }).type)}` : `Practice ${n}`;
      front = `<div class="c">${b.prompt}</div>`;
      back = `<div class="c">${b.answer}</div>`;
    }
    box.innerHTML = lines(`<div class="q">
      <div class="q-head"><span class="q-n">${esc(title.get(sid) ?? '')}</span></div>
      <p class="rv-kind">${head}</p>${front}
      <button type="button" class="q-reveal" aria-expanded="false">${kind[1] === 'k' ? 'Show the point' : 'Show worked answer'}</button>
      <div class="q-ans" hidden><div class="q-ans-label">${kind[1] === 'k' ? 'The point' : 'Worked answer'}</div>${back}
        <div class="q-self" role="group" aria-label="How did you do?"><span>How did you do?</span>
          <button type="button" data-mark="got">Got it</button><button type="button" data-mark="missed">Missed it</button></div></div>
      <p class="rv-src"><a href="${data.bookUrl}#${sid}">Open this section in the book</a></p>
    </div>`);
    numberParagraphs(box);
    const reveal = box.querySelector<HTMLButtonElement>('.q-reveal')!;
    reveal.addEventListener('click', () => {
      box.querySelector<HTMLElement>('.q-ans')!.hidden = false;
      reveal.hidden = true;
      box.querySelector<HTMLButtonElement>('[data-mark="got"]')!.focus();
    });
    box.querySelectorAll<HTMLButtonElement>('[data-mark]').forEach((btn) => btn.addEventListener('click', () => {
      store.setPractice(item, { mark: btn.dataset.mark as 'got' | 'missed' }, 'review');
      marked++;
      i++;
      void show();
    }));
    reveal.focus();
  };
  const finish = () => {
    count.textContent = '';
    const next = nextDue(store.get().attempts);
    const when = next ? new Date(next.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    box.innerHTML = `<div class="rv-done">
      <p><b>${marked ? `Done: ${marked} reviewed.` : 'Nothing to review right now.'}</b></p>
      <p>${next ? `Next review: ${when} (${next.count} item${next.count === 1 ? '' : 's'}).` : queue.length || marked ? '' : 'Mark practice problems in the book, or read a section to the end, and they will come back here when it helps to see them again.'}</p>
      <p><a href="${data.bookUrl}">Back to the book</a></p></div>`;
  };
  await show();
}
