// The book reader on /doctors/books/obesity-expertise/<book>/.
//
// One long page. Section headings are in the HTML; each section's body is fetched and rendered when it
// comes within a screen or so of view, and until then holds a placeholder sized from its word count.
// Anything that changes height above the reading line (a section rendering, a font arriving, a new text size)
// would move the text you are reading, so the reader keeps its own scroll anchor: the paragraph at the
// reading line, held at the same height on screen whenever the layout changes. Everything you do here (place, bookmarks, practice marks, text size) is stored
// through BookProgressStore; signing in is never needed.

import { numberParagraphs, renderSection } from './render';
import { BookProgressStore, type ReaderPrefs } from './store';
import type { GlossaryEntry, Location, OutlinePart, Reference, Section } from './types';

interface PageData { outline: OutlinePart[]; references: { part: string; items: Reference[]; note: string | null }[]; glossary: GlossaryEntry[]; sizes: number[] }

const WIDTHS = [30, 36, 44]; // line width, in em of the body text
const SAVE_AFTER = 2500;     // ms after scrolling stops

export function startReader() {
  const found = document.getElementById('rd');
  if (!found) return;
  const root: HTMLElement = found;
  const data = JSON.parse(document.getElementById('rd-data')!.textContent!) as PageData;
  const bookId = root.dataset.book!;
  const store = new BookProgressStore(bookId, root.dataset.version!);
  const base = root.dataset.sections!;
  const figures = root.dataset.figures!;
  const bar = root.querySelector<HTMLElement>('.rd-bar')!;
  const secs = [...root.querySelectorAll<HTMLElement>('.rd-sec')];
  const byId = new Map(secs.map((s) => [s.dataset.sec!, s]));
  const words = secs.map((s) => Number(s.dataset.words) || 0);
  const totalWords = words.reduce((a, b) => a + b, 0) || 1;
  const before = words.map((_, i) => words.slice(0, i).reduce((a, b) => a + b, 0));
  const tocLinks = new Map([...root.querySelectorAll<HTMLAnchorElement>('.rd-toc a[data-sec]')].map((a) => [a.dataset.sec!, a]));
  const where = document.getElementById('rd-where')!;
  document.documentElement.classList.add('reading');

  const topline = () => bar.getBoundingClientRect().bottom + 12;

  // ---------------------------------------------------------------- text size and line width
  let prefs: ReaderPrefs = BookProgressStore.prefs();
  const applyPrefs = () => {
    root.style.setProperty('--rd-size', `${data.sizes[prefs.size] ?? data.sizes[2]}px`);
    const px = data.sizes[prefs.size] ?? data.sizes[2];
    root.style.setProperty('--rd-measure', `${(WIDTHS[prefs.width] ?? WIDTHS[1]) * px}px`);
    root.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === prefs.size)));
    root.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.width) === prefs.width)));
    sizePlaceholders();
  };

  // ---------------------------------------------------------------- lazy sections
  const loading = new Map<string, Promise<void>>();

  function sizePlaceholders() {
    const sample = root.querySelector<HTMLElement>('.rd-main')!;
    const font = parseFloat(getComputedStyle(root).getPropertyValue('--rd-size')) || 18;
    const width = Math.min(sample.clientWidth - 32, font * (WIDTHS[prefs.width] ?? 36));
    const perLine = Math.max(4, width / (font * 0.5) / 6.1);
    for (const s of secs) {
      const body = s.querySelector<HTMLElement>('.rd-body')!;
      if (body.dataset.state === 'done') continue;
      body.style.height = `${Math.round((Number(s.dataset.words) / perLine) * font * 1.65 * 1.3)}px`;
    }
  }

  function load(id: string): Promise<void> {
    const sec = byId.get(id);
    if (!sec) return Promise.resolve();
    const body = sec.querySelector<HTMLElement>('.rd-body')!;
    if (body.dataset.state === 'done') return Promise.resolve();
    if (!loading.has(id)) {
      body.dataset.state = 'loading';
      loading.set(id, fetch(`${base}${id}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Section>;
      }).then((json) => {
        body.innerHTML = renderSection(json, figures);
        body.style.height = '';
        body.dataset.state = 'done';
        numberParagraphs(body);
        restorePractice(body);
        // Correct now, in the same task as the change: a scroll event handled before the ResizeObserver
        // runs would otherwise take the shifted position as the new anchor.
        keepAnchor();
        scheduleScrub();
      }).catch(() => {
        body.dataset.state = 'error';
        body.innerHTML = `<p class="rd-err">This section did not load. <button type="button" class="rd-retry">Try again</button></p>`;
        body.style.height = '';
        loading.delete(id);
      }));
    }
    return loading.get(id)!;
  }

  root.addEventListener('click', (e) => {
    const retry = (e.target as HTMLElement).closest('.rd-retry');
    if (retry) { const s = retry.closest<HTMLElement>('.rd-sec'); if (s) void load(s.dataset.sec!); }
  });

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) void load((en.target as HTMLElement).dataset.sec!);
  }, { rootMargin: '150% 0px 150% 0px' });
  secs.forEach((s) => io.observe(s));

  // ---------------------------------------------------------------- keep your place through reflow
  let anchor: { el: HTMLElement; top: number } | null = null;
  function anchorAt(): HTMLElement | null {
    const y = topline();
    let sec: HTMLElement | null = null;
    for (const s of secs) { if (s.getBoundingClientRect().top <= y) sec = s; else break; }
    if (!sec) return null;
    for (const el of sec.querySelectorAll<HTMLElement>('[data-p]')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > y) return el;
    }
    const body = sec.querySelector<HTMLElement>('.rd-body')!;
    return body.getBoundingClientRect().bottom > y ? body : sec.querySelector<HTMLElement>('h3');
  }
  const captureAnchor = (el = anchorAt()) => { anchor = el ? { el, top: el.getBoundingClientRect().top } : null; };
  let restoring = false;
  const keepAnchor = () => {
    if (!anchor || !anchor.el.isConnected) return;
    const d = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(d) > 0.5) { const y0 = scrollY; window.scrollBy({ top: d, behavior: 'instant' }); restoring = scrollY !== y0; }
  };
  const ro = new ResizeObserver(() => { keepAnchor(); scheduleScrub(); });
  root.querySelectorAll<HTMLElement>('.rd-body, .rd-front, .rd-about').forEach((el) => ro.observe(el));
  addEventListener('scroll', () => { if (restoring) { restoring = false; return; } captureAnchor(); }, { passive: true });

  // ---------------------------------------------------------------- where am I
  function current(): { loc: Location; percent: number; index: number } | null {
    const y = topline();
    let idx = -1;
    for (let i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top <= y) idx = i; else break; }
    if (idx < 0) return null;
    const sec = secs[idx];
    const r = sec.getBoundingClientRect();
    const secFrac = Math.max(0, Math.min(1, (y - r.top) / Math.max(1, r.height)));
    let loc: Location = { s: sec.dataset.sec!, p: 0, f: 0 };
    for (const el of sec.querySelectorAll<HTMLElement>('[data-p]')) {
      const er = el.getBoundingClientRect();
      if (er.height === 0) continue;
      if (er.bottom > y) { loc = { s: sec.dataset.sec!, p: Number(el.dataset.p), f: Math.max(0, Math.min(1, (y - er.top) / er.height)) }; break; }
    }
    return { loc, percent: (before[idx] + secFrac * words[idx]) / totalWords, index: idx };
  }

  /** Go to a place. `head`: to the section's heading (outline links), not its first paragraph. */
  async function jumpTo(loc: Location, head = false) {
    const sec = byId.get(loc.s);
    if (!sec) return;
    await load(loc.s);
    if (head) {
      // The heading sits just under the bar; `current()` then reads this section, not the one above.
      window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - topline() + 12, behavior: 'instant' });
      captureAnchor(sec.querySelector<HTMLElement>('h3')!);
      return;
    }
    let el = sec.querySelector<HTMLElement>(`[data-p="${loc.p}"]`);
    // A paragraph inside a closed worked answer has no height; go to its question instead.
    if (el && el.getBoundingClientRect().height === 0) el = el.closest<HTMLElement>('.q') ?? el;
    const target = el ?? sec;
    const r = target.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + (el ? loc.f * r.height : 0) - topline(), behavior: 'instant' });
    // Sections above may still render and shift the page; the anchor holds this place through that.
    captureAnchor(target);
  }

  let activeSec = '';
  let saveTimer = 0;
  function onScroll() {
    // The mode strip above the bar scrolls away; the rail and the scroll line start where the bar ends.
    root.style.setProperty('--top', `${Math.max(0, bar.getBoundingClientRect().bottom)}px`);
    const c = current();
    const id = c ? c.loc.s : '';
    if (id !== activeSec) {
      tocLinks.get(activeSec)?.removeAttribute('aria-current');
      activeSec = id;
      const a = tocLinks.get(id);
      if (a) {
        a.setAttribute('aria-current', 'location');
        if (!root.classList.contains('side-open')) a.scrollIntoView({ block: 'nearest' });
      }
      const s = byId.get(id);
      where.textContent = s ? `${s.dataset.label} · ${s.querySelector('h3 span:last-child')?.textContent ?? ''}` : '';
      // Reading past a section's end counts it as read.
      if (c && c.index > 0) store.markDone(secs[c.index - 1].dataset.sec!);
    }
    updateMarkButton(c?.loc);
    scheduleScrub();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, SAVE_AFTER);
  }
  function save() {
    const c = current();
    if (c) store.setLocation(c.loc, c.percent);
  }
  addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
  addEventListener('resize', () => { sizePlaceholders(); scheduleScrub(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  addEventListener('pagehide', save);

  // ---------------------------------------------------------------- outline drawer
  const menu = root.querySelector<HTMLButtonElement>('.rd-menu')!;
  const scrim = root.querySelector<HTMLElement>('.rd-scrim')!;
  const side = root.querySelector<HTMLElement>('.rd-side')!;
  const drawer = () => matchMedia('(max-width: 1099px)').matches;
  const setSide = (open: boolean) => {
    root.classList.toggle('side-open', open);
    menu.setAttribute('aria-expanded', String(open));
    scrim.hidden = !open || !drawer();
    if (open && drawer()) tocLinks.get(activeSec)?.scrollIntoView({ block: 'center' });
  };
  // Phones and tablets: a drawer. Desktop: the rail is always there; the button hides or shows it.
  menu.addEventListener('click', () => {
    if (drawer()) setSide(!root.classList.contains('side-open'));
    else menu.setAttribute('aria-expanded', String(!root.classList.toggle('side-closed')));
  });
  scrim.addEventListener('click', () => setSide(false));
  side.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-sec]');
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, '', `#${a.dataset.sec}`);
    if (drawer()) setSide(false);
    void jumpTo({ s: a.dataset.sec!, p: 0, f: 0 }, true);
  });
  side.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((t) => t.addEventListener('click', () => {
    side.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    side.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  }));

  // ---------------------------------------------------------------- bookmarks
  const markBtn = document.getElementById('rd-mark') as HTMLButtonElement;
  const marksList = side.querySelector<HTMLOListElement>('.rd-marks ol')!;
  const near = (a: Location, b: Location) => a.s === b.s && a.p === b.p;
  function updateMarkButton(loc?: Location) {
    const on = !!loc && store.get().bookmarks.some((b) => near(b.loc, loc));
    markBtn.setAttribute('aria-pressed', String(on));
    markBtn.setAttribute('aria-label', on ? 'Remove this bookmark' : 'Bookmark this place');
  }
  function drawMarks() {
    const bms = [...store.get().bookmarks].sort((a, b) => b.created - a.created);
    side.querySelector<HTMLElement>('.rd-marks .rd-empty')!.hidden = bms.length > 0;
    marksList.innerHTML = bms.map((b) => `<li><a href="#${b.loc.s}" data-bm="${b.id}"><span class="n">${b.label}</span><span class="t">${escapeHtml(b.snippet)}</span></a><button type="button" data-rm="${b.id}" aria-label="Remove bookmark">×</button></li>`).join('');
  }
  markBtn.addEventListener('click', () => {
    const c = current();
    if (!c) return;
    const existing = store.get().bookmarks.find((b) => near(b.loc, c.loc));
    if (existing) store.removeBookmark(existing.id);
    else {
      const el = byId.get(c.loc.s)?.querySelector<HTMLElement>(`[data-p="${c.loc.p}"]`);
      const text = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      store.addBookmark({ loc: c.loc, label: byId.get(c.loc.s)!.dataset.label!, snippet: text.length > 90 ? `${text.slice(0, 88)}…` : text });
    }
    drawMarks();
    updateMarkButton(c.loc);
  });
  marksList.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rm = t.closest<HTMLButtonElement>('[data-rm]');
    if (rm) { store.removeBookmark(rm.dataset.rm!); drawMarks(); updateMarkButton(current()?.loc); return; }
    const a = t.closest<HTMLAnchorElement>('[data-bm]');
    if (!a) return;
    e.preventDefault();
    const b = store.get().bookmarks.find((x) => x.id === a.dataset.bm);
    if (b) { if (drawer()) setSide(false); void jumpTo(b.loc); }
  });
  drawMarks();

  // ---------------------------------------------------------------- Aa
  const aa = document.getElementById('rd-aa') as HTMLButtonElement;
  const panel = document.getElementById('rd-aa-panel')!;
  aa.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; aa.setAttribute('aria-expanded', String(!panel.hidden)); });
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    const keep = current()?.loc;
    if (b.dataset.size) prefs = { ...prefs, size: Number(b.dataset.size) };
    if (b.dataset.width) prefs = { ...prefs, width: Number(b.dataset.width) };
    BookProgressStore.setPrefs(prefs);
    applyPrefs();
    if (keep) void jumpTo(keep);
  });
  document.addEventListener('click', () => { if (!panel.hidden) { panel.hidden = true; aa.setAttribute('aria-expanded', 'false'); } });

  // ---------------------------------------------------------------- fast-scroll line
  const scrub = document.getElementById('rd-scrub')!;
  const ticks = scrub.querySelector<HTMLElement>('.rd-ticks')!;
  const thumb = scrub.querySelector<HTMLElement>('.rd-thumb')!;
  const slabel = scrub.querySelector<HTMLElement>('.rd-scrub-label')!;
  let scrubQueued = false;
  function scheduleScrub() {
    if (scrubQueued) return;
    scrubQueued = true;
    requestAnimationFrame(() => { scrubQueued = false; drawScrub(); });
  }
  const docH = () => document.documentElement.scrollHeight;
  function drawScrub() {
    const H = docH();
    const max = Math.max(1, H - innerHeight);
    if (ticks.childElementCount !== secs.length) {
      ticks.innerHTML = secs.map((s, i) => `<i${i === 0 || s.dataset.part !== secs[i - 1].dataset.part ? ' class="p"' : ''}></i>`).join('');
    }
    const kids = ticks.children as HTMLCollectionOf<HTMLElement>;
    secs.forEach((s, i) => { kids[i].style.top = `${Math.min(100, (s.offsetTop / max) * 100)}%`; });
    thumb.style.top = `${Math.min(100, (scrollY / max) * 100)}%`;
  }
  function sectionAtScroll(y: number) {
    let pick = secs[0];
    for (const s of secs) { if (s.offsetTop <= y + topline() + 1) pick = s; else break; }
    return pick;
  }
  let dragging = false;
  const dragTo = (clientY: number) => {
    const r = scrub.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const y = frac * Math.max(1, docH() - innerHeight);
    window.scrollTo({ top: y, behavior: 'instant' });
    const s = sectionAtScroll(y);
    slabel.innerHTML = `<b>${s.dataset.label}</b> ${s.querySelector('h3 span:last-child')?.innerHTML ?? ''}`;
    slabel.style.top = `${clientY - r.top}px`;
  };
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    scrub.classList.add('drag');
    slabel.hidden = false;
    dragTo(e.clientY);
  });
  scrub.addEventListener('pointermove', (e) => { if (dragging) dragTo(e.clientY); });
  const endDrag = () => { dragging = false; scrub.classList.remove('drag'); slabel.hidden = true; };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);

  // ---------------------------------------------------------------- practice: try, then reveal
  function restorePractice(body: HTMLElement) {
    const marks = store.get().practice;
    body.querySelectorAll<HTMLElement>('.q').forEach((q) => {
      const m = marks[q.dataset.q!];
      if (!m) return;
      q.querySelectorAll<HTMLButtonElement>('[data-mark]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mark === m.mark)));
      const inp = q.querySelector<HTMLInputElement>('.q-conf-in');
      if (inp && m.confidence != null) inp.value = String(m.confidence);
      q.dataset.marked = m.mark;
    });
  }
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rev = t.closest<HTMLButtonElement>('.q-reveal');
    if (rev) {
      const ans = document.getElementById(rev.getAttribute('aria-controls')!)!;
      ans.hidden = !ans.hidden;
      rev.setAttribute('aria-expanded', String(!ans.hidden));
      rev.textContent = ans.hidden ? 'Show worked answer' : 'Hide worked answer';
      scheduleScrub();
      return;
    }
    const mk = t.closest<HTMLButtonElement>('[data-mark]');
    if (mk) {
      const q = mk.closest<HTMLElement>('.q')!;
      const conf = q.querySelector<HTMLInputElement>('.q-conf-in')?.value;
      store.setPractice(q.dataset.q!, { mark: mk.dataset.mark as 'got' | 'missed', confidence: conf ? Number(conf) : undefined, t: Date.now() });
      q.querySelectorAll<HTMLButtonElement>('[data-mark]').forEach((b) => b.setAttribute('aria-pressed', String(b === mk)));
      q.dataset.marked = mk.dataset.mark;
    }
  });

  // ---------------------------------------------------------------- glossary and reference pop-ups
  const pop = document.getElementById('rd-pop')!;
  const popBody = pop.querySelector<HTMLElement>('.rd-pop-body')!;
  let popFor: HTMLElement | null = null;
  function openPop(anchor: HTMLElement, html: string) {
    popBody.innerHTML = html;
    pop.hidden = false;
    popFor = anchor;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(360, innerWidth - 24);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
    pop.style.top = `${below ? r.bottom + 8 : Math.max(topline(), r.top - 8 - pop.offsetHeight)}px`;
    (pop.querySelector('.rd-pop-x') as HTMLElement).focus({ preventScroll: true });
  }
  const closePop = () => { if (!pop.hidden) { pop.hidden = true; popFor?.focus({ preventScroll: true }); popFor = null; } };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.rd-pop-x')) { closePop(); return; }
    if (t.closest('#rd-pop')) return;
    const d = t.closest<HTMLElement>('dfn[data-g]');
    if (d) {
      const g = data.glossary[Number(d.dataset.g)];
      if (g) openPop(d, `<p class="pop-k">Glossary</p>${g.senses.map((s) => `<p class="pop-t">${escapeHtml(s.term)}</p><p>${s.plain}</p><p class="pop-w">First taught in ${escapeHtml(s.where)}</p>`).join('')}`);
      return;
    }
    const c = t.closest<HTMLButtonElement>('.cite');
    if (c) {
      const refs = data.references.find((r) => r.part === c.dataset.part) ?? data.references[0];
      const nums = (c.dataset.refs ?? '').split(',').map(Number);
      const items = refs?.items.filter((i) => nums.includes(i.n)) ?? [];
      openPop(c, `<p class="pop-k">References</p><ol class="pop-refs">${items.map((i) => `<li value="${i.n}">${i.html}</li>`).join('')}</ol>`);
      return;
    }
    closePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePop(); setSide(false); if (!panel.hidden) { panel.hidden = true; aa.focus(); } }
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).matches?.('dfn[data-g]')) { e.preventDefault(); (e.target as HTMLElement).click(); }
  });
  addEventListener('scroll', () => { if (!pop.hidden && popFor && !popFor.matches('dfn, .cite')) closePop(); }, { passive: true });
  // Glossary terms are focusable for keyboard readers.
  new MutationObserver(() => root.querySelectorAll<HTMLElement>('dfn[data-g]:not([tabindex])').forEach((d) => { d.tabIndex = 0; d.setAttribute('role', 'button'); }))
    .observe(root, { childList: true, subtree: true });

  // ---------------------------------------------------------------- start
  applyPrefs();
  const saved = store.get().loc;
  const resume = document.getElementById('rd-resume')!;
  if (saved && byId.has(saved.s)) {
    const s = byId.get(saved.s)!;
    resume.hidden = false;
    resume.innerHTML = `You were reading <a href="#${saved.s}">${s.dataset.label} · ${s.querySelector('h3 span:last-child')?.innerHTML ?? ''}</a> (${Math.round(store.get().percent * 100)}% through).`;
    resume.querySelector('a')!.addEventListener('click', (e) => { e.preventDefault(); void jumpTo(saved); });
  }
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && byId.has(hash)) void jumpTo({ s: hash, p: 0, f: 0 }, true);
  else if (saved && byId.has(saved.s) && !hash) void jumpTo(saved);
  onScroll();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
