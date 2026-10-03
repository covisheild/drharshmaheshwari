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
- ~~No highlighting for now~~ (3 Oct 2026: added, see the last section).
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

- ~~Inspect the Statistics sources and pick its converter.~~ Done 3 Oct 2026 (see the last section).
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

## Progress (3 Oct 2026): Phase 2 built

- **Phases 0 and 1 are live** (10 books). Books are published by `obesity-course`'s GitHub Actions publisher
  (`check/web/PUBLISHING.md`), which opens a site PR from `books/auto-publish`.
- **Sync.** Migration 2 (`src/server/schema.ts`): `reading_progress` (place, percent, sections read) and
  `bookmarks` (deletions kept as `deleted_at` so they reach every device), plus `users.picture`.
  `/api/books/:book` GET/POST/DELETE (`src/server/api.ts`): the newest place wins, the sections-read list only
  grows, a deleted bookmark stays deleted. Practice marks are `attempts` under trainer `book-<id>` (`-` not `:`,
  to fit the trainer-id rule), uploaded with `/api/progress/book-<id>`.
- **Client.** `src/reader/sync.ts` `SyncedBookStore` extends `BookProgressStore` the way `SyncedProgressStore`
  wraps the trainers' store: local first, merged on each page load, each change uploaded. A newer place in
  another section asks "You reached C9 on another device. Jump there? / Stay here" instead of moving the page.
  Another person's reading in the same browser is cleared, never merged (`claimLocalProgress`).
- **Review** at `/doctors/books/obesity-expertise/<book>/review/` (`src/reader/review.ts`): FSRS from
  `src/trainers/core/schedule.ts`, rebuilt from the marks. Items: questions you marked (`-e<n>`, `-p<n>`) and
  must-know points (`-k<n>`) of sections read to the end, at most 10 new a day. "N due" shows by Review in
  the contents.
- **Top bar.** The PDF button is gone (the PDF stays at the start and end of the book); in its place a small
  "Sign in", or the Google picture circle (initial if none) that opens the account line in the contents panel.
  The picture is an address at `*.googleusercontent.com`, loaded from Google, never copied.
- Tests: `tests/api.test.mjs` (books API), `tests/booksync.test.mjs` (merge and sync against a pretend
  server), `tests/e2e.mjs` (Review, top bar).

## Progress (3 Oct 2026, later): delta sync, then reader tools

Harsh asked for Kindle-like tools: highlights with notes, image zoom, and "discuss with AI". Agreed order, each a
separate commit so it can be reviewed on a Preview before `main`:

1. **Delta sync and batched upload** (done). `GET /api/books/:book` and `GET /api/progress/:trainer` take `?since=<ms of server time>`
   and return `now` (and `next`, for a full page); migration 3 adds `attempts.received_at` and its index. The client keeps a cursor and an
   outbox in the browser copy (`BookState.since`, `BookState.out`). Timing: upload 10 s after the last change (30 s at most), at once on
   tab hide, the place alone once a minute. Tests: `tests/booksync.test.mjs`, `tests/api.test.mjs` (including a rows-read check).
   The trainers still download everything on each page load (`/api/progress/<trainer>` without `since`); they can use the same cursor later.
2. Image zoom (done): `src/reader/zoom.ts`; tests in `tests/e2e.mjs` ("Figure viewer").
3. Highlights and notes (done): see "Highlights and notes" in `CLAUDE.md`. Choices Harsh asked for: nothing opens unless wanted. Under **Aa**: when selecting text show a bar / highlight at once / do nothing; colour; Note button on or off; show or hide highlights.
4. "Copy for AI" (done): copies a question (passage or heading, your note, one of four tasks) to the clipboard; no server, no cost. Under **Aa**: switch on; choose the task; heading buttons on or off. Links that open ChatGPT/Claude/Gemini were removed on 3 Oct 2026 (Claude shows a caution notice for filled-in links; Gemini takes none).
   Hosting an AI ourselves is parked: it needs sign-in, a daily cap per person, a monthly budget switch and a passage-only prompt first.

## Progress (3 Oct 2026, later): Phase 3, the Statistics converter

- **Sources.** Reached through Harsh's Drive (`Stats-book 3.1/statsbook_v3.1/`, an unzipped copy of `statsbook-v3.1-source.zip`), because
  the session still has no `R2_*` variables and `*.r2.cloudflarestorage.com` is not allowed. The source is pandoc markdown
  (`src/chNN.md`, one file per chapter, `ch15a`/`ch15b` = Chapter 15), `answers/`, `refs/*.yml`, `tools/build.py` (assembles Appendix A,
  Appendix B and References), `figs/` (matplotlib scripts and PNGs), `data/` (synthetic CSVs the In R boxes read), `plan/` and `defects/`
  (the v3.1 working notes). `src/99-appendix.md` is the retired v2.2 appendix; `build.py` does not use it.
- **Converter** `scripts/books/statistics/export.py`: pandoc's AST, cut at the book's labels (Definition, Simplified Explanation,
  Illustration / Example, Derivation, Worked Calculation, In R, Common Misreading, Must-Know Notes, Checkpoint). 157 sections: front
  matter (5), each chapter's overview plus its n.n sections, Appendix A by chapter, Appendix B, References. Verified word for word against
  the released v3.1 Word file (175,432 words; 143 tokens differ, all list markers, Word's table-of-contents placeholder and section numbers).
- **Reader additions** (all backwards compatible): `heading` and `checkpoint` blocks, a label-less continuation of a labelled block,
  a must-know label, `-q<n>` item ids for checkpoint questions (Review handles them; must-know points now number across a section's
  several lists), `§` links that jump and offer "Back to where you were", `BookReader.astro` / `BookReview.astro` shared by both series.
- **Findings for the next edition (not changed here).** Appendix B's package column, built with R's `find()`, names the first *attached*
  package, so ten rows are misleading: `cov()` is shown as pROC, `Surv()` and `vif()` as rms, `update()`, `as.matrix()` and `unname()` as
  Matrix, `calibrate()` as survey, `power.t.test()` and `power.prop.test()` as "base R" (they are `stats`), `ageadjust.direct()` is epitools.
  The converter pins the ten rows to what v3.1 prints (`V31_APPENDIX_B_PACKAGES`); fix them in `build.py` and drop the pin.
- **Still to do for Phase 3:** cross-book links (Statistics ↔ Book 0), interactive figures (the `figs/*.py` scripts hold the data), offline (PWA),
  **Done later the same day:** the 17 datasets are published with a page, a zip and `make_data.R` (`/doctors/books/<slug>/data/`).
  Harsh uploaded the 79 figures to R2; the session cannot reach `files.drharshmaheshwari.com`, so they are unchecked from here.
  **Before merging:** open the Preview and confirm the figures load; then Notion (Statistics row: 🌐, Live URL, Last published).
