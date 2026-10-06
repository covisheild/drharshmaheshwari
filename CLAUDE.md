# drharshmaheshwari.com

Personal site of Dr. Harsh Maheshwari: obesity education for the public and for clinicians.
Astro static site, deployed as a Cloudflare Worker (static assets) from `main`; other branches get Preview deployments. The owner is not a coder; Claude does all code work.

## Two modes: For Everyone and For Doctors

- The URL decides the mode: `/` and everything not under `/doctors/` is **For Everyone**; `/doctors/...` is **For Doctors**.
  Nothing about the mode is stored in the browser. Use these exact labels; never "General".
- `src/lib/modes.ts` holds each mode's label, home, navigation and footer. `Base.astro` sets `<html data-mode>` from the URL.
- Each mode has its own Books, Videos, Tools and Trainers. Content carries its mode: books have `mode:` in frontmatter
  (`everyone` → `/books/<slug>/`, `doctors` → `/doctors/books/<slug>/`); videos have `mode` in `src/data/videos.json`;
  tools are listed in `src/data/tools.ts`; trainers in `src/trainers/registry.ts`. Evidence articles (`src/content/clinicians/`)
  are published at `/doctors/evidence/<slug>/`.
- Design tokens: `src/styles/tokens.css` (audience colour x light/dark). Components use only semantic tokens. One look for both audiences
  (Beam: Outfit headings, DM Sans text, DM Mono labels; rounded cards; floating glass header); they differ by **colour** (see "Site colours"
  below) and the "For Doctors" label in the header. Class names of the Beam components are prefixed `bm-` (`src/styles/beam.css`) so they
  cannot clash with the calculator, reader or trainers. All four combinations must keep 4.5:1 text contrast (`tests/theme.test.mjs`, `npm run test:e2e`).
- **Moved URLs get a 301 in `public/_redirects`; never delete a line there.** `tests/site.test.mjs` lists every URL
  production has served and fails if one breaks.

- **Back button** (`.back-btn` in `SiteHeader.astro`, logic in `Base.astro`, `src/lib/back.ts`): a translucent glass circle with a left arrow (no text), fixed just under the photo, on every page with the site header except the two home pages (`/`, `/doctors/`). Always visible at the top of a page (first 40 px); further down it fades 2 s after the last scroll and reappears on the next scroll (held while pointed at or focused; without JS it stays visible).
  Its link is the page one level up in the URL, so repeated presses always end at the home page. In the browser it first takes one real step back if the
  previous page is on this site; if the page was opened directly, or was itself reached by a Back jump (`sessionStorage.backTo`), it goes one level up instead.
  Trainer and book-reader pages (`chrome="app"`) keep their own top bar and back arrow. `tests/site.test.mjs` checks every page's parent chain.

## Support this project (`/support/`)

- One-time support by **direct UPI only**: QR code (generated at build time, `src/lib/upi-qr.ts`), "Copy UPI ID",
  and on phones "screenshot the QR and scan it from your gallery". The "Open your UPI app" link is off
  (`appLink: false`): apps decline link-started payments to a personal UPI ID; enable only with a merchant ID. No gateway, no backend, no records, no email, no login.
- All settings in `UPI_CONFIG` (`src/lib/support.ts`): `enabled`, `upiId`, `payeeName`, `note`, `amountInQr`, `appLink`.
  While `enabled` is false or `upiId` is empty, the page shows "Contributions open soon." Never commit a
  placeholder UPI ID: a made-up ID could belong to a real person.
- Recurring support is **parked** (future): no UI, code or infrastructure for it. Design notes stay in
  `docs/support-architecture.md`.
- Contributions are voluntary support; they never create entitlements (future paid products use purchases and
  `hasEntitlement()`). Words: "support", "contribution"; never "donation" or "charity"; no urgency or pop-ups;
  no refund-policy promises. Core educational resources are intended to remain freely accessible.

## Tests

`npm run build && npm test`: static checks on `dist/`, UPI links, the review scheduler, and `/api/` against a local D1
database with a fake Google (`tests/api.test.mjs`, `tests/wrangler.test.jsonc`; never deployed). `npm run test:e2e` (browser checks; needs Playwright installed
globally; set `MEDIA_DIR` to a local copy of the R2 trainer folder to test audio and waveforms offline).

## Source of truth: Notion → website, one way only

The Notion page **"Website Desk · drharshmaheshwari.com"** (https://app.notion.com/p/3e5e211880e2816bb5bfeed68f8c7d97)
is where Harsh writes drafts and instructions. Never edit Notion content to match the site; the flow is one way.

| Notion | ID |
|---|---|
| Content Desk (data source) | `collection://4f06c45f-4d60-4a5f-a16a-0aee045ae757` |
| Life & Work Timeline (data source) | `collection://a1753e14-bef6-4cb1-a53b-b859b1049790` |
| Site settings page | `3e5e2118-80e2-81a3-b79a-cc3534fdd572` |
| Voice & rules page | `3e5e2118-80e2-8185-9def-f52a02fc231f` |
| Site map page | `3e5e2118-80e2-814c-bd87-c9701c7132e9` |
| Publish log page | `3e5e2118-80e2-81b9-b45c-ce942ac854a7` |

### "Publish from Website Desk"

1. Query both data sources for rows with `🚀 Publish` ticked.
2. For each row, route by **Type**:
   - Article (public) → `src/content/learn/<slug>.md`
   - Evidence (clinicians) → `src/content/clinicians/<slug>.md` (published at `/doctors/evidence/<slug>/`)
   - Blog post → `src/content/blog/<slug>.md`
   - Book → `src/content/books/<slug>.md`, with `mode: doctors` if it is for health professionals. The PDF is **not** copied into the repo: Harsh uploads it to Cloudflare R2
     and puts its `https://files.drharshmaheshwari.com/books/...` link in the Notion page; use that link as the download URL
     (see "Large files" below). Cover image → `public/books/<slug>.<ext>` (if none is attached, render page 1 of the PDF,
     keep it under ~300 KB). Show the licence stated in the Notion page.
   - Video → append to `src/data/videos.json` with `mode` (`everyone` or `doctors`)
   - Timeline rows → `src/data/timeline.json`; Publication rows → `src/data/publications.json` (fetch citation from the DOI/PubMed link)
   - Page update / Site change → edit the named page or `src/consts.ts`
   - Stage = Remove from site → delete the file/entry
3. Apply `Voice & rules`: key points, question headings, references (open every one; PubMed tool for PMIDs), `reviewed` date. Download Notion images/attachments into the repo — Notion file URLs expire.
4. `npm run build` must pass; screenshot mobile (390px) and desktop; check no horizontal overflow.
5. Commit, push to `main`. Then in Notion: untick `🚀 Publish`, Stage = Live, fill Live URL (the site page, not the PDF link) and Last published, write what changed in Claude notes. Add a line to Publish log. Update Site map if a section changed.

Questions for Harsh go in the row's **Claude notes** with Stage = Needs your input.

## Deployment config (`wrangler.jsonc`)

Cloudflare Workers Builds deploys `main` (`npx wrangler deploy`) and every other branch as a Preview (`npx wrangler preview`).
`wrangler.jsonc` is the config Wrangler used to generate on each build (`@astrojs/cloudflare` adapter, assets from `dist`),
now committed so it is fixed and reviewable, plus the `previews` block that `wrangler preview` requires. Wrangler is a
local devDependency. Change production settings only on purpose; preview-only settings go inside `previews`.

## Large files (PDFs, books): Cloudflare R2, never git

- Bucket `drhm-files`, public at `https://files.drharshmaheshwari.com/` (R2 custom domain). Books live under `books/`.
- Never commit PDFs or other large binaries to this repo (git keeps every version forever; repo size is limited).
- Harsh uploads files himself in the Cloudflare dashboard. File names: no spaces (use `-` or `_`), because the URL is permanent.
- Harsh does not compress book PDFs (compression damages figures) — do not suggest or do it.
- Before publishing a book page, check the R2 link returns the PDF (not a 404 / "nothing here yet" page).
- Do not add a wildcard `*.drharshmaheshwari.com` route to the site Worker: it hijacks `files.` and breaks R2.
- Default book licence: CC BY-NC-SA 4.0 (adaptation allowed, share-alike), unless the Notion page says otherwise.

## Clinical trainers (`/doctors/trainers/`)

- A trainer is an app: `src/layouts/TrainerShell.astro` gives every trainer the same frame (app bar, side rail on desktop,
  bottom tab bar on phones) and sections, each a static page: Home, Learn (+ one page per finding), Practice, Quiz, Review, Progress.
- Shared, trainer-agnostic code: `src/trainers/core/` (engine: questions, look-alike distractors, levels; `ProgressStore`;
  media and adapter contracts), `src/trainers/ui/` (question runner and section views), `src/trainers/media/` (viewers;
  `AudioViewer` = waveform close-up that follows the playhead plus a whole-clip strip, true-size thin lines, seeking, speed, labelled spans). A new trainer adds `src/trainers/<id>/` (config +
  adapter), its pages, a registry entry, and a viewer only if it needs a new kind of media.
- Progress goes only through `ProgressStore`; the UI never touches localStorage directly. `LocalProgressStore` keeps it in
  the browser (`trainer:<id>:v2`); `SyncedProgressStore` (`core/sync.ts`, what trainers use) wraps it and, when signed in,
  merges the account copy on each page load and uploads each answer. Attempt ids make every upload idempotent.
- Review is spaced repetition (`core/schedule.ts`, FSRS via `ts-fsrs`): rebuilt from the attempts each time, nothing
  extra stored. Wrong last time = due now; otherwise due when predicted recall falls to 90% (max 1 year).

## Book reader (`/doctors/books/obesity-expertise/`)

- Plan and settled decisions: `docs/book-reader-plan.md`. For Doctors only. White and pure black themes.
- Text: `src/data/books/obesity-expertise/` (`series.json`, `<id>/book.json`, `<id>/sections/*.json`), written by
  `obesity-course/check/web/export.py --frozen --out <this repo>/src/data/books/obesity-expertise`. Never edit
  these files by hand; re-export. Book URLs use the book id (`b0`, `s01-r1`) and are permanent.
- Figures and PDFs are on R2 (`books/obesity-expertise/figures/`, `books/obesity-expertise/<ID>-v<version>.pdf`).
  `PUBLIC_BOOK_FIGURES` overrides the figure base for local testing.
- **Statistics: From First Principles to Regression** (`stats`) is read at `/doctors/books/statistics-first-principles-to-regression/read/`
  (its PDF page stays at the parent URL, which offers "Read online" through `read:` in `src/content/books/<slug>.md`). Text:
  `src/data/books/statistics-first-principles-to-regression/`, written by `scripts/books/statistics/export.py` from the
  unzipped source (`statsbook-v3.1-source.zip`: `src/`, `answers/`, `refs/`, `tools/build.py`); never edit it by hand, re-export.
  The converter parses the markdown with pandoc, cuts it at the book's own labels, pairs each checkpoint question with its model
  answer from `answers/` (the reader's "try, then reveal"; Appendix A still prints them), links each § reference, and with
  `--docx` compares every word with the released Word file. `src/99-appendix.md` in the zip is the retired v2.2 appendix: ignored.
  Figures (79 PNG) go to R2 at `books/statistics-first-principles-to-regression/figures/`: all of `figs/out/` and 17 `media0/media/imageN.png`
  (list: `--figures-out`). The In R boxes read `data/<file>.csv`: the export publishes those 17 synthetic datasets, `make_data.R`,
  a README and a zip under `public/doctors/books/<slug>/data/`, with their page at `/doctors/books/<slug>/data/` (rows, columns and the
  sections that read each file come from the book itself). The files are small text, so they live in the repo, not R2.
- `BookReader.astro` / `BookReview.astro` lay out every book's reader and review; the two series' pages only pass their own titles and links.
- Progress goes only through `BookProgressStore` (`src/reader/store.ts`, `book:<id>:v1`), never localStorage directly.
- Figures: tap the picture or its enlarge button to open the viewer (`src/reader/zoom.ts`, `#rd-zoom`): pinch, double-tap, wheel,
  `+ - 0`, arrows, Back/Esc to close. The button sits beside `.fig-card`, never inside a `.c` (children of `.c` are the numbered paragraphs).
- Signed in, `SyncedBookStore` (`src/reader/sync.ts`) syncs place, bookmarks and sections read (`/api/books/:book`) and
  practice marks (`attempts`, trainer `book-<id>`). Review (`<book>/review/`, `src/reader/review.ts`) is FSRS over those marks
  and the must-know points of sections read. The top bar has no PDF button; the PDF is offered at the start and end of a book.
- Series page: "The path" has a searchable "Subject" dropdown (`SubjectFinder.astro`, `reader/finder.ts`): All, then every subject in `series.json` order;
  choosing one shows all its books (released covers link, unreleased are faded). Built from `series.json`, so new books appear by themselves.
- **Highlights and notes** (`src/reader/highlights.ts`, `anchor.ts`, `notes.ts`). Painted with the CSS Custom Highlight API, so the
  book's HTML is never touched (paragraph numbers stay valid). A highlight is a character range in the section's text (the
  `[data-p]` paragraphs joined by `\n`) plus the quote and 24 characters either side; on a new book version it is re-found by its
  quote (`resolve`), else listed "text changed" in the Notes tab and not painted. What selecting does is the reader's choice under
  **Aa**: *Show a bar* (default: colours + Note), *Highlight* (at once in the chosen colour, nothing opens), *Nothing*; plus the
  colour, the Note and Copy buttons, and "Show my highlights" (`ReaderPrefs`, device-local). `H` highlights the selection. Tapping a highlight
  opens its card (colour, note, remove). Stored in `BookState.highlights` (deletions kept as `deleted`; newest `updated` wins),
  synced like bookmarks (D1 `highlights`, migration 4; 3 row-writes each). Notes tab: list, jump, Copy/Download Markdown.
  Colours `--hl-*`/`--sw-*` are checked for 4.5:1 in `tests/e2e.mjs`.
- **Copy for AI** (`src/reader/ai.ts`), off until switched on under Aa. No server, no cost, nothing stored: it builds a question (book,
  section, the passage or just the heading, the reader's note, one of four tasks) and puts it on the clipboard; the reader pastes it
  into their own AI. Shown in the bar, on a highlight's card and, optionally, on section headings. Opening ChatGPT/Claude/Gemini from
  the button was tried and removed (Harsh, 3 Oct 2026): Claude shows a caution notice for any filled-in link and Gemini takes no
  question from a link. Hosting an AI ourselves is parked until it has sign-in, per-person daily caps, a monthly budget switch and
  a passage-only prompt. `/privacy/` says what happens.
- **Sync is built for the Cloudflare free plan** (Worker requests 100,000/day, D1 5M rows read and 100,000 rows written/day;
  since 1 Sep 2026 D1 *fails* queries past the cap until midnight UTC, which would also break sign-in). Static pages cost nothing; only
  `/api/*` counts. So: downloads are **deltas** (`?since=<server ms>`; the cursor `since` lives in the browser copy, two minutes
  behind the server clock; `attempts.received_at` + index make the query read only new rows; a first/full download compares
  everything), and uploads are **batched** from an outbox (`out`): 10 s after the last change, at most 30 s after the first, at once
  when the tab is hidden or closed, and the reading place alone at most once a minute. A change made while signed out drops the cursor
  (next sign-in compares everything). Never add a per-keystroke or per-scroll request; D1 bills rows *scanned*, so new queries need an index.

## Accounts (optional Google sign-in) and `/api/`

- Only `/api/*` runs server code (`src/pages/api/[...path].ts` → `src/server/api.ts`); every page stays static.
- Google OAuth authorization-code flow with PKCE, state and nonce; ID-token claims validated; no Google tokens kept.
  Session: random token in an HttpOnly, SameSite=Lax cookie `sid` (180 days), only its SHA-256 hash stored.
- D1 binding `DB` (schema in `src/server/schema.ts`, applied automatically; add migrations, never edit shipped ones).
  `GOOGLE_CLIENT_ID` (var) and `GOOGLE_CLIENT_SECRET` (secret). If any is missing, `/api/me` says accounts are off and
  the trainers keep progress in the browser only, with no sign-in shown.
- Previews must use their own D1 database (`previews.d1_databases`), never production's.
- People can delete their account and all data themselves (`/account/`, linked from every footer, and the trainer Progress page); sign-out clears the browser copy.
  The book reader has no account box: signed in, the top-right picture opens a small menu (who, saved status, "Your account", "Sign out"); signed out it is a "Sign in" link.
  Keep `/privacy/#accounts` in step with what is stored.
- Auscultation audio: HLS-CMDS v2 (CC BY 4.0, Zenodo 15376628). `scripts/trainers/auscultation/prepare.py` dedupes, levels
  loudness, encodes MP3s, writes `<id>.peaks.json` waveforms (audiowaveform JSON v2) next to each MP3, and writes
  `src/data/trainers/auscultation/recordings.json`. Both MP3s and peaks are uploaded to R2 at
  `trainers/auscultation/hls-cmds-v2/`. Peaks are fetched with CORS, so the bucket's CORS policy must allow GET.
  CC BY attribution (citation, licence, list of changes) lives at `/disclaimer/#credits`; every trainer page footer links to it by name
  ("Recording credits (CC BY 4.0)", `Credits.astro`). Keep both, and keep the list of changes in step with `prepare.py`.
- Long licence and disclaimer text lives only on `/disclaimer/` ("Disclaimer and credits"); other pages carry a short link ("Disclaimer",
  "Support"). Trainer pages say "Real patients may differ: use clinical judgement", never "not for diagnosing patients".
- Finding slugs (`config.ts`) are permanent URLs. Teaching notes are clinical content: Harsh reviews changes before `main`.

## Site colours (admin only) and the Beam look

- **The colour is chosen only by Harsh** (no visitor picker). `src/data/theme.json`: `schedule` (`fixed` | `weekly` | `monthly`), `fixed` (one colour
  per audience), `rotation` (an ordered list per audience), `start` (a Monday for weekly, the 1st for monthly). Dates change at midnight India time.
  The colours are the **36 in `src/data/palettes.json`** (one per 10 degrees of the wheel, each with lightness values that keep text and buttons
  at 4.5:1; regenerate with `node scripts/design/palettes.mjs`, `tests/theme.test.mjs` checks all 36). Harsh picks with the admin colour wheel
  (`design/colour-wheel.html`, a private page, not on the site) and sends the settings text; Claude applies them to `theme.json`.
  Current choice (4 Oct 2026): fixed, For Everyone = 17 Turquoise, For Doctors = 3 Vermilion. To change colours or switch to weekly/monthly later, Harsh opens the wheel, picks, and sends the settings text; Claude pastes it into `theme.json` (the `rotation` lists are already filled in). Keep the two audiences on different colours at every step. `Base.astro` writes `--pal-h/--pal-ld/--pal-ll` on `<html>`; a rotating schedule
  adds a tiny inline script (`src/lib/theme.ts`) that corrects them before first paint. Do not hand-edit colours in components.
- **Beam look**: `docs/design-direction.md`; prototypes in `design/prototypes/` (not built). Fonts are self-hosted in `public/fonts/`
  (`src/styles/fonts.css`). The round photo stays as it is. Home pages: `src/pages/index.astro`, `src/pages/doctors/index.astro`.
- **Dust and glow** (`src/scripts/fx.ts`): `canvas.dust` grains scatter and curl around the cursor or a finger; fewer grains on phones;
  nothing runs under "reduce motion". The calculator picture is visual only (`src/lib/bmi-demo.ts`, `src/scripts/home-demo.ts`); its fields
  link to `/tools/bmi-calculator/#height|#weight|#waist|#sex`, which open with that box ready to type in. Do not break these hashes.
- The header is fixed and floating, so pages with the site chrome get `padding-top: var(--nav-space)` (`main.with-nav`); a hero that wants
  the beam behind the header pulls itself up by the same amount.

## Drafts

`draft: true` in frontmatter shows the page on local dev and Cloudflare preview builds (any branch other than `main`,
via `WORKERS_CI_BRANCH`, read in `astro.config.mjs`) and hides it on production. Starter articles written by Claude stay `draft: true` until Harsh approves.

## Rules

- NMC conduct: no testimonials, patient details, fees, appointment booking, superlatives, or "specialist" claims.
- Indian cut-offs: BMI overweight 23–24.9, obesity ≥25; waist ≥90 cm men / ≥80 cm women; WHtR risk from 0.5.
- Never change a published URL (slug). Hindi pages will live under `/hi/` (Phase 2).
- SEO/AEO plumbing is automatic: sitemap, `robots.txt` (AI crawlers allowed), `/llms.txt`, `/llms-full.txt`, RSS, schema.org JSON-LD in `Base.astro` / `Article.astro`.
- Respect `prefers-reduced-motion`; animations use the `.reveal` class.
