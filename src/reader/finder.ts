// The "Find a subject" combobox on the Obesity Expertise page (components/books/SubjectFinder.astro). Typing
// narrows the list by number or title words; choosing a subject swaps "The path" shelf for that subject's
// books (the .subject-panel blocks rendered in index.astro); choosing All brings the shelf back. Nothing is stored.

export function mountFinder() {
  const root = document.querySelector<HTMLElement>('.finder');
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const list = root.querySelector<HTMLElement>('[role="listbox"]')!;
  const empty = root.querySelector<HTMLElement>('.finder-empty')!;
  const status = document.getElementById('finder-status')!;
  const opts = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const shelf = document.getElementById('path-shelf')!;
  const note = document.getElementById('path-note');
  const panels = [...document.querySelectorAll<HTMLElement>('.subject-panel')];

  let selected = opts[0]; // All
  let active: HTMLElement | null = null;
  const label = (o: HTMLElement) => o.dataset.label ?? 'All';
  const shown = () => opts.filter((o) => !o.hidden);

  const setActive = (o: HTMLElement | null) => {
    active?.classList.remove('active');
    active = o;
    if (o) { o.classList.add('active'); input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };

  const filter = (q: string) => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    // A number matches a subject's number from its start ("1" finds 1, 10 to 19); words match anywhere in the title.
    const hit = (o: HTMLElement, t: string) => (/^\d+$/.test(t) ? o.dataset.n!.startsWith(t) : o.dataset.search!.includes(t));
    for (const o of opts) o.hidden = o.dataset.key === '' ? terms.length > 0 : !terms.every((t) => hit(o, t));
    const n = shown().length;
    empty.hidden = n > 0;
    status.textContent = terms.length ? (n ? `${n} subject${n > 1 ? 's' : ''} match` : 'No subject matches') : '';
    setActive(n ? shown()[0] : null);
  };

  const open = () => {
    if (!list.hidden) return;
    filter('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(selected);
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(null);
    input.value = label(selected);
  };

  const choose = (o: HTMLElement) => {
    selected = o;
    opts.forEach((x) => x.setAttribute('aria-selected', String(x === o)));
    const key = o.dataset.key!;
    shelf.hidden = !!key;
    if (note) note.hidden = !!key;
    for (const p of panels) p.hidden = p.dataset.key !== key;
    status.textContent = key ? `Showing ${label(o)}: ${o.querySelector('.o-s')?.textContent ?? ''}` : 'Showing the whole path';
    close();
  };

  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (list.hidden) { open(); input.select(); } });
  input.addEventListener('input', () => {
    if (list.hidden) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    filter(input.value);
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    // Typing while the list is closed replaces the chosen subject's label instead of editing it.
    if (list.hidden && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.select();
    const vis = shown();
    const i = active ? vis.indexOf(active) : -1;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); else if (vis.length) setActive(vis[Math.min(i + 1, vis.length - 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!list.hidden && vis.length) setActive(vis[Math.max(i - 1, 0)]); }
    else if (e.key === 'Enter') { if (!list.hidden && active) { e.preventDefault(); choose(active); } }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(); } }
  });
  // Keep focus in the input while the list is tapped, so the blur above does not close it before the click lands.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (o && !o.hidden) choose(o);
  });
  list.addEventListener('mousemove', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (o && o !== active) setActive(o);
  });
}
