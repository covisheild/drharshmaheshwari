# AGENTS.md: start here (Jules, Gemini CLI, Antigravity, any coding agent)

This is the source of drharshmaheshwari.com: an Astro static site, deployed as a Cloudflare Worker (static assets) from `main`.
Every other branch gets a Cloudflare **Preview** deployment. The owner, Dr. Harsh Maheshwari, is a doctor and **not a coder**:
you do all the code work, and he checks the result in a browser.

## 1. Read these first, in full

1. **`CLAUDE.md`**. It is the project's complete rulebook (modes, languages, units, look, tests, the Notion publishing routine, R2 for large
   files, clinical content rules). The file has "Claude" in its name only because it was first written for Claude Code. **Every rule in it
   applies to you.** Read all of it before changing anything; do not rely on this summary.
2. The `docs/` file named for the area you are touching (`docs/translation.md`, `docs/trackers-plan.md`, `docs/book-reader-plan.md`,
   `docs/activity-check-plan.md`, `docs/design-direction.md`, `docs/support-architecture.md`, `docs/voice-tutor-plan.md`).
3. `docs/working-with-other-agents.md`: what is different when you are not Claude Code (Notion, publishing, review).

Where `CLAUDE.md` and this file differ, **this file wins**, because you work in a different environment:

| `CLAUDE.md` says | You do instead |
|---|---|
| "Commit, push to `main`" | **Never push to `main`.** Work on a branch and open a pull request into `main`. Harsh merges it after checking the Preview. |
| Read/write Notion (Website Desk, Publish log, Claude notes) | You have **no Notion access**. Harsh pastes the Notion text into your task. Do not invent Notion content. End your pull request with a **"Notion update"** block (what Harsh should tick, the Live URL, "Last published", the Publish-log line, any question for him), and he pastes it into Notion himself. |
| "Harsh reviews before `main`" (clinical content) | Same, via the pull request: list every clinical wording or number you added or changed under **"Needs Harsh's clinical review"**. |
| Skills, subagents, `.claude/` | Not available to you. Follow the written procedure in the docs yourself. |

## 2. Commands (verified on Node 22: the build takes about 1 minute, the tests about 10 seconds, and all 208 pass)

```
npm ci                                              # once per fresh machine (Node 22, see .nvmrc)
WORKERS_CI_BRANCH=preview npm run build             # the PREVIEW build: shows drafts and not-yet-live languages, like a Preview deploy
npm test                                            # runs on the built dist/, so build first, and rebuild after EVERY change
npm run check                                       # Astro type check (optional, slower)
npm run dev                                         # local preview server
npm run i18n:missing -- <lang> --json               # untranslated English strings for a language (needs the build)
npm run i18n:check                                  # the translation checks (also part of npm test)
npm run i18n:status                                 # guide translations out of date with their English
npm run test:e2e                                    # browser checks; needs Playwright installed globally. Run only if you can; say so if not
```

Always build with `WORKERS_CI_BRANCH=preview` before `npm test`: the tests expect the preview build, and that is what a branch deploys.
`dist/`, `node_modules/` and `.astro/` are never committed.

## 3. Definition of done (every pull request)

- [ ] `WORKERS_CI_BRANCH=preview npm run build` passes, then `npm test` passes with **0 failures**. Paste the final "tests / pass / fail" lines in the pull request.
- [ ] If any For Everyone English text changed: **every language's translation updated in the same pull request** (see section 5).
- [ ] No horizontal scroll at 390 px wide and on desktop (take screenshots if you can run a browser; if you cannot, say so).
- [ ] Text contrast stays at 4.5:1 in light and dark for both modes (`tests/theme.test.mjs`).
- [ ] Every number a person types that has a unit uses the unit field (section 4).
- [ ] A moved or renamed URL has a `301` line in `public/_redirects`, and no line there is ever deleted.
- [ ] The pull request description follows section 6.

If a test fails, **find the cause and fix it**. Never skip, disable, delete or loosen a test to get green, and never change a test's
expectation just to make it pass; if you believe a test is wrong, stop and explain in the pull request.

## 4. The rules that break most easily

- **Two modes by URL.** `/doctors/...` is **For Doctors**; everything else is **For Everyone**. Use exactly these labels; never "General". Nothing about the mode is stored in the browser.
- **Languages.** Every For Everyone page has a page in each of the 12 other languages (`/hi/`, `/mr/`, ... ; list in `src/i18n/languages.ts`). For Doctors, books and references stay English. English text is the dictionary key in `src/i18n/<lang>.json`.
- **Units convert on a click.** Any typed number with a unit uses `src/components/UnitField.astro` (built pages) or `createUnitField()` (pages built in the browser). A number with no unit gets `data-unitless`. `tests/units.test.mjs` and `tests/site.test.mjs` fail otherwise.
- **India first.** Indian cut-offs and charts (BMI overweight 23-24.9, obesity at 25 or more; waist 90 cm men / 80 cm women; WHtR from 0.5). WHO or other charts only where no Indian one exists, and the page says so.
- **Never change a published URL.** Moved URLs get a 301 in `public/_redirects`; `tests/site.test.mjs` lists every URL production has served.
- **Colours** come only from `src/data/theme.json` and the 36 palettes; components use only semantic tokens (`src/styles/tokens.css`). Never hard-code a colour. Right-to-left (Urdu): logical properties only (`margin-inline-start`), never `left`/`right`.
- **Words on the site.** Never "free" about books, datasets or PDFs. Say "Read online", "Download the PDF". Support is "support" or "contribution", never "donation" or "charity". NMC conduct: no testimonials, patient details, fees, appointment booking, superlatives or "specialist" claims.
- **Never commit** PDFs or other large binaries (they go to Cloudflare R2, which Harsh does himself), secrets, or a made-up UPI ID.
- **Clinical content is Harsh's.** Teaching notes, alert thresholds, tracker alerts, calculator wording, translations of any of these: cite only references you have actually opened (PubMed or the book), and never invent a reference, a number or a quotation. If you cannot verify it, say so in the pull request instead of writing it as fact.
- **Generated files are never edited by hand**: `src/data/books/**` (re-exported by script), `src/data/iap-bmi-2015.json`, `who-bmi-lms.json`, `indian-waist-children.json`, `palettes.json` (from `scripts/design/palettes.mjs`), `public/_redirects` only appended to.
- **Do not touch** `wrangler.jsonc` production settings, D1 migrations already shipped (add new ones), or sync/API rate behaviour (free-plan limits are explained in `CLAUDE.md`), unless the task says so.
- **Accounts, privacy, trackers.** If you change what is stored or shown, update `/privacy/` in step.

## 5. Translations (when English on a For Everyone page changes)

Follow `docs/translation.md` exactly. In short:

1. Build, then `npm run i18n:missing -- <lang> --json` for each language, and translate each missing string with that language's glossary (`src/i18n/glossary/<lang>.json`). Write **natively**, as a family doctor would say it in that language, not word for word. Keep every number, unit, link, placeholder and every "not".
2. For a guide or blog post, write `src/content/i18n/<lang>/<collection>/<slug>.md` and stamp it with `npm run i18n:status -- --stamp <file>`.
3. `npm run i18n:check` must pass.
4. **The blind back-translation** (step 4 of the pipeline) needs a reader who has not seen the English. You cannot be that reader for your own work.
   Say in the pull request, under **"Translation: back-translation still needed"**, which languages and which strings changed; Harsh runs it as a separate task (`docs/working-with-other-agents.md`, "Translations"). Do not claim a translation is back-translated or "checked" unless that was really done.
5. Clinical safety strings (alerts, first aid, thresholds, pregnancy, children) are the highest risk: list them separately.

If you cannot translate to the standard above, do not ship a rough translation: an out-of-date translation falls back to English by design, which is safe. Tell Harsh what is left.

## 6. Pull request description (use this layout)

```
## What changed
(plain English, 3-6 lines, written for a doctor, not a programmer)

## Pages to check on the Preview
(exact paths, e.g. /tools/bmi-calculator/ and /hi/tools/bmi-calculator/; say what to look for)

## Tests
(build and npm test results: tests / pass / fail; e2e run or not)

## Needs Harsh's clinical review
(every new or changed clinical wording, number, threshold; or "None")

## Translation: back-translation still needed
(languages and strings; or "None: no For Everyone English text changed")

## Notion update
(for Harsh to paste: Stage, Live URL, Last published, Publish-log line, questions; or "None")

## Not done / open questions
```

Keep one pull request to one purpose. Do not mix a bug fix with a redesign.
