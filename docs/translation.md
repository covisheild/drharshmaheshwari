# Translations: Indian languages on the site

Plan agreed with Harsh on 11 Oct 2026. Phase 1 (Hindi) is built; other languages follow the same pipeline.

## Settled decisions

- **The URL decides the language**, as it decides the mode: `/hi/...` is Hindi, everything else English. Nothing is stored in the
  browser, and there is no automatic redirect by browser language. A shared link opens in the language it was sent in.
- **One small language button** in the header (globe + `EN` / `हिं`), on For Everyone pages only. It opens a list of languages in
  their own script; each links to the same page in that language, or to that language's home page when the page is not translated.
- **English is the original.** Every translated page says so, links to the English page, and offers "Report a translation error".
- **What is translated:** every For Everyone page: home, Learn (guides), Blog, Tools and **every calculator, results included** (BMI,
  Activity check, IDRS, STOP-Bang), Books list, Videos list, About, Disclaimer, Privacy, Support, and the header and footer
  (Harsh, 11 Oct 2026: "Hindi support is not there in tools / calculators / blogs / guides").
- **What stays English:** For Doctors (all of it), every book and the book reader, references and publications (citations), the
  account page, RSS and `llms.txt`. Translated pages mark links to English-only pages "अंग्रेज़ी में" (in English).
- **Validated questionnaires** (STOP-Bang, IPAQ short form, IDRS): their Hindi wording here is this site's AI translation, not a
  published validated Hindi version. If a validated Hindi version is adopted later, its wording replaces ours in `hi.json`.
- **Register:** everyday spoken language a family would use, not textbook Sanskritised/Persianised words. Common English health
  words stay as people say them (BMI, ब्लड शुगर, डायबिटीज़). Digits 0-9 only (never Devanagari digits): medical numbers must read
  the same in every language. Units as in English.
- **Quality without a native proofreader** (Harsh, 11 Oct 2026): Harsh reads Hindi; for every other language the site relies on
  AI only, through the pipeline below. No colleague review is assumed.
- **Label** (decision 5): "Translated from English with AI assistance and checked. The English page is the original: if the two
  differ, follow the English." Once Harsh has read a language's pages: "...checked by the author." (`checkedBy` in
  `src/i18n/languages.ts`, or per guide in its front matter).
- **A language goes live only when Harsh says so.** Until then `live: false` builds it on preview builds only (any branch except
  `main`), like drafts. Production is unchanged.

## How it works (code)

| What | Where |
|---|---|
| Languages, `langOf()`, live flag, label | `src/i18n/languages.ts` |
| Which pages exist in which language, links | `src/i18n/routes.ts` (`LOCAL_PAGES`, `localHref`, `hasPage`) |
| Words of pages, header, footer | `src/i18n/<lang>.json`: English text → translation. `t('...')` in code, `<T>...</T>` around inline HTML |
| Words a page script shows (calculator results) | `w('...')` (`src/i18n/client.ts`); `<ClientWords sources={[...]}>` sends the translations of every `w('...')` in the listed files, of the unit fields, and of every library text that has an entry |
| Guides and blog posts | `src/content/i18n/<lang>/<collection>/<slug>.md` (collection `translations`) |
| Routes | `src/pages/[lang]/...`: each imports the English page; the page reads the language from the URL |
| Glossary, banned words | `src/i18n/glossary/<lang>.json` |
| Fonts | `public/fonts/noto-sans-devanagari-wght.woff2` (loaded only by pages with Devanagari: `unicode-range`) |
| Share pictures | `scripts/og/integration.mjs` (Hindi labels from the dictionary; satori shapes Devanagari correctly) |

The English text is the dictionary key. When English wording changes, its old translation no longer matches, so the page shows
the new English (marked invisibly) instead of an out-of-date translation, and the tests fail until it is translated again.
A translated guide records the fingerprint of the English file it came from (`source:`); when the English changes, the Hindi
page shows the English with a note ("the English changed recently...") until it is redone. **An out-of-date medical translation is
never shown.**

## The pipeline: every new or changed text, every language

1. **English final.** Translate only text Harsh has approved in English (drafts may be translated, they stay drafts).
2. **Translate.** `WORKERS_CI_BRANCH=preview npm run build && npm run i18n:missing -- hi --json` lists every English string a
   language's pages still show; add each to `src/i18n/<lang>.json`. For a guide, write `src/content/i18n/<lang>/<coll>/<slug>.md`
   (same structure, same numbers, links to translated pages get `/<lang>`), then `npm run i18n:status -- --stamp <file>`.
   Use the glossary terms; keep every number, unit and link exactly; keep the meaning, hedges ("on average", "may") and every "not".
3. **Automated checks:** `npm run i18n:check` (also in `npm test`). Fails on: a number changed, added or dropped; a link changed;
   a placeholder or inline tag lost; a glossary term not used; an untranslated English sentence; a banned word (दान = donation,
   Devanagari digits, "free" on book pages); a guide whose headings, list items, table rows, quotes, bold spans or paragraphs differ
   in count from the English. Warns on a length ratio out of range and on fewer negations than the English.
4. **Back-translation (meaning).** Two separate agents: the first sees only the translation and translates it back to English
   (with notes on anything unnatural); the second compares that with the original English and grades every change in meaning
   CRITICAL (a clinical fact, number, threshold, negation, who it applies to, risk, action, certainty), MODERATE (a non-clinical
   claim, a dropped or added qualifier or sentence) or MINOR. **Fix every CRITICAL and MODERATE finding**, re-run steps 3-4 on what
   changed, and record the result in `docs/translation-qa/<lang>-<date>.md`.
5. **Build and look.** `WORKERS_CI_BRANCH=preview npm run build && npm test` (the built-page checks run when the language is
   built), screenshots at 390 px and desktop, no sideways scroll.
6. **Human check where possible.** Hindi: Harsh reads the preview and his corrections go into the calibration log
   (`docs/translation-qa/hi-calibration.md`). Other languages: AI only; publish when steps 3-5 are clean.

## Hindi as the calibration language

Hindi goes through exactly the same pipeline as every other language, and is then read by Harsh. Each error he finds is logged with
its grade. Errors per 1,000 words, and especially critical errors that the pipeline missed, estimate how well the AI-only pipeline
works for languages nobody here can read. If Hindi shows critical errors that steps 3-4 did not catch, fix the pipeline (a new
automated check, a stricter comparison prompt) before publishing any other language.

## Adding a language

1. Add it to `LANGS` in `src/i18n/languages.ts` (`live: false`), its dictionary `src/i18n/<code>.json` (start `{}`) to `DICTS` in
   `src/i18n/t.ts` and to `scripts/og/integration.mjs`, the sitemap locales in `astro.config.mjs`, and its font (Noto Sans
   <script>, variable, its own `unicode-range`) to `src/styles/fonts.css`, the font stacks in `tokens.css`, and the share picture
   fonts. Typography adjustments go with `:lang(<code>)` in `global.css`.
2. Write `src/i18n/glossary/<code>.json` first (terms, register, banned words): every page reuses it, so it carries most of the risk.
3. Run the pipeline on every page. Right-to-left scripts (Urdu) need the layout mirrored: a separate piece of work.
4. Going live: Harsh says so → `live: true`.

## Roll-out

| Phase | Status |
|---|---|
| 1. Machinery + Hindi | Built 11 Oct 2026, preview only. Waiting for Harsh's reading (calibration). |
| 1b. Calculators in Hindi | Done 11 Oct 2026: BMI, Activity check, IDRS, STOP-Bang, with their results |
| 2. Pilot: Bengali, Marathi, Tamil | After Hindi calibration |
| 3. Telugu, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese | |
| 4. Urdu (right to left) | |
