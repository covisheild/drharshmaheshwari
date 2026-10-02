# Book reader: plan and decisions

Agreed with Harsh on 2 October 2026. This file is the brief for whoever builds the reader. The
decisions below are settled; do not re-ask them. Open items are listed at the end.

## What we are building

A Kindle-like way to read Harsh's books on the site, **For Doctors mode only** (both series are for
health professionals; nothing goes under For Everyone).

- **Library:** books shown on shelves that scroll sideways; clicking a cover opens the book.
- **Reader:** vertical continuous scroll; an outline that is always available (left rail on desktop,
  drawer on phones) with the current section highlighted; a fast-scroll line on the right edge with
  a tick per section and a floating section label while dragging; bookmarks; a download button that
  is always visible; text size and line width (nothing more under "Aa").
- **Themes:** white and **pure black `#000`** (for OLED) only. No sepia, no third theme. In black,
  body text is off-white (~`#d6d6d6`), not `#fff`. Follow the site's existing theme toggle
  (`ThemeToggle.astro`, `data-theme`); the reader overrides `--bg` to `#000` in dark.
  Figures with white backgrounds sit on a slightly dimmed card in black mode.
- **No highlighting** for now. Positions are stored per paragraph, so it can be added later.
- **Interactive** (Harsh wants this): the reader presents existing fields interactively; it never
  adds or rewrites content.

## Principles

1. **Render the text, not the PDF.** The PDF stays as the download; reading is reflowable text.
2. **One reader, many converters.** The reader knows one book format (below). Each source has a
   converter that writes it. Content is never changed to suit the layout (same rule as
   `obesity-course/check/pdf/make_pdf.py`).
3. **Login is optional.** Reading, downloading and the interactive parts never need it. Signing in
   only syncs progress, bookmarks and practice across devices. Do not gate the download (the books
   are CC BY-NC-SA; the reason to read on the site must be that it is better, not that it is forced).
4. **Positions survive new versions:** store a location as `record/section id + paragraph index +
   fraction`, never a page number or a percentage.

## Book format the reader reads

```
book.json          id, slug, title, series, version, date, part/hue, pdf URL, outline tree
                   (part → section → concept, with ids and word counts)
sections/<id>.json ordered blocks: heading · prose(html) · figure · table · working ·
                   practice{question, worked_answer} · mustknow{points, tag} · glossary terms
```

- Text JSON is committed in this repo (small, reviewable). Figures and PDFs go to R2 `drhm-files`
  (public at `https://files.drharshmaheshwari.com/`), per the "Large files" rule in `CLAUDE.md`.
- The fast-scroll line positions sections by word count from `book.json` and corrects itself as
  sections render (sections load lazily, so pixel heights are unknown up front).

## Sources and converters

| Series | Source | Converter |
|---|---|---|
| **Obesity Expertise** (196 books planned; 8 frozen now) | GitHub `covisheild/obesity-course`: YAML concept records in `check/records/<SUBJECT>/`, book metadata in `books/<ID>/book.yml`, build order and status in `map/BOOKS.yml`, Part colours in `check/pdf/series.yml`, glossary in `prose/GLOSSARY.md`, figures in `check/figures/` | New `check/web/export.py` in that repo. Read the **YAML records directly** (practice, worked answers, must-know points, glossary are separate fields there), not pandoc's HTML. Reuse `check/build.py`'s prose handling so superscripts and the "no raw caret or tilde" rule still hold. |
| **Statistics: From First Principles to Regression** (v3.1, live as PDF at `/doctors/books/statistics-first-principles-to-regression/`) | Harsh's source files (a zip plus a .docx) in the **private** R2 bucket `drhm-sources` under `stats/` | Converter chosen after inspecting the format. |

Frozen obesity books today: B0 (v1.2), S01-R1 (v1.2), S02-R1 (v1.1), S36-R1 (v1.1), S37-R1, S47-R1,
S55-R1, S57-R1 (v1.0). Re-check `map/BOOKS.yml`; more freeze over time.

## Showing 196 books without overwhelming anyone

- `/doctors/books/` shows the **Obesity Expertise series as one wide card** ("N of 196 out · Start
  with Book 0") beside the Statistics book. It links to `/doctors/books/obesity-expertise/`.
- **One cover per subject**, not per rung, with a small "Rung 1 · 2 · 3" switch (195 rungs → 61 covers).
- **Shelves are earned:** a Part gets its own shelf only once it has 3+ released subjects.
- The series page has at most four rows:
  1. **Continue reading** (only if there is progress, local or account).
  2. **The path** — released books in `map/BOOKS.yml` order, ending in one faint "Next: … · coming" card.
  3. **Up next for you** — books whose `prerequisites` (in `book.yml`) the reader has finished.
  4. **Browse by Part** — a row of 18 chips in the PDF cover hues with counts ("Causal inference ·
     0/17"); tapping one lists that Part. Unreleased books never take shelf space.
- Covers are generated from the Part hues in `check/pdf/series.yml` (no hand-made images).
- **Every completed (frozen) book is published.** The pipeline publishes directly; no Notion row is
  needed to trigger it (see Notion below).

## Interactivity, in order of value per effort

1. **Practice: try, then reveal** the worked answer, with a "Got it / Missed it" self-mark. *(Phase 1)*
2. **Tap a term** for its plain-words definition from `prose/GLOSSARY.md`. *(Phase 1)*
3. **Spaced review** of must-know points and practice, using the existing FSRS scheduler
   (`src/trainers/core/schedule.ts`, `ts-fsrs`). *(Phase 2)*
4. Cross-book links (e.g. to Book 0 records) that preview in place. *(Phase 3)*
5. Interactive figures drawn from the same figure specs (hover values, sliders); numbers still come
   only from the spec. *(Phase 3)*

## Accounts and sync: reuse what exists

Google sign-in, sessions, D1, account deletion and `/privacy/#accounts` already exist
(`src/server/api.ts`, `src/server/schema.ts`; see "Accounts" in `CLAUDE.md`). New work only:

- One new migration (never edit a shipped one): `reading_progress(user_id, book_id, book_version,
  location, percent, updated_at)` and `bookmarks(id, user_id, book_id, location, snippet, created_at)`.
  Practice attempts can reuse `attempts` with `trainer = 'book:<id>'`.
- A `BookProgressStore` modelled on `SyncedProgressStore` (`src/trainers/core/sync.ts`): local
  first, merged on sign-in, newest wins; a "You reached C9 on your phone — jump there?" prompt.
- Save a few seconds after scrolling stops and on `visibilitychange`.
- Update `/privacy/#accounts` to say what is stored.

## Phases

| Phase | Delivers |
|---|---|
| **0. Prototype** | `export.py` for B0 → JSON; reader page shows B0 correctly (figures, tables, superscripts, working blocks) at 390 px and desktop |
| **1. Reader** | Series page + shelves, reader (scroll, outline, fast-scroll line, white/black, Aa, bookmarks, download), local progress, practice reveal, glossary taps; all frozen obesity books |
| **2. Sync and review** | Account sync of progress/bookmarks, device-jump prompt, Review queue (FSRS) |
| **3. Statistics book and extras** | Stats converter, cross-book links, interactive figures, offline (PWA) |

Work on a branch (branches get Cloudflare Preview deployments); merge to `main` only when a phase
passes `npm run build && npm test` and the 390 px / desktop screenshots in `CLAUDE.md`.

## Infrastructure state (2 Oct 2026)

- **R2:** `drhm-files` (public, `files.drharshmaheshwari.com`) and **`drhm-sources` (private, no
  public domain; created 2 Oct 2026)**. Never put source files in `drhm-files`.
- **Session access to R2:** the environment provides `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` (S3 API at `https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`, region
  `auto`). Do not use the `AWS_*` variables the container may also carry; they are not R2's.
  The Cloudflare connector lists and creates buckets but cannot read or write objects.
- **Notion Content Desk** has two new checkbox columns: **✅ Completed** and **🌐 On website**.
  One row per completed obesity book exists (8 rows, ✅ ticked, 🌐 not yet). Claude ticks 🌐, fills
  Live URL and Last published, and sets Stage = Live when a book's reader page goes live. When a new
  book freezes, add its row with ✅ ticked. The Statistics row has both ticked; its Live URL still
  shows the old `/books/...` address (it 301-redirects; update it to `/doctors/books/...`).

## Open items

- Inspect the Statistics sources in `drhm-sources/stats/` and pick its converter.
- Confirm `R2_*` access and the network allow-list (`*.r2.cloudflarestorage.com`,
  `files.drharshmaheshwari.com`) at the start of the next session.

## Progress (2 Oct 2026, second session)

- **Phase 0 done.** `obesity-course/check/web/export.py` writes the format above (plus `series.json`) into
  `src/data/books/obesity-expertise/`; figures go to a folder for R2 (`books/obesity-expertise/figures/`).
  Glossary taps are marked at export: whole-word, from the section that teaches the term on, never for the
  everyday words listed in `EVERYDAY`. A raw caret, record id or repo path stops the export; a tilde is
  reported only (S02-R1 quotes "~90 g/day").
- **Phase 1 built on this branch:** series page, reader, all 8 frozen books, local progress, practice reveal
  with self-mark, glossary and reference pop-ups. Browser checks in `tests/e2e.mjs` ("Book reader").
- **Before merging:** upload the figures and the 8 PDFs to R2 (`books/obesity-expertise/figures/<file>` and
  `books/obesity-expertise/<ID>-v<version>.pdf`) and check each link returns the file; then tick 🌐 in Notion.
- **Blocked in the session:** the environment has no `R2_*` variables, and its "Cloudflare R2" proxy credential
  is set up as an AWS credential, so the proxy refuses to sign `*.r2.cloudflarestorage.com`;
  `files.drharshmaheshwari.com` is not on the network allow-list. The Statistics sources could not be inspected.
