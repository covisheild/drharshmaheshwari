# Working on this site with Gemini (Jules, Antigravity, Gemini CLI) or any other coding agent

Written 16 Oct 2026, when Harsh's Claude subscription was ending and he moved to Gemini Pro. For Harsh first; the agent's own
instructions are in `AGENTS.md` (loaded automatically by Jules) and `GEMINI.md` (Gemini CLI, Antigravity).
Tool names and menus change; if something below does not match the screen, the idea still holds.

## The idea in one minute

- The website is files on GitHub. Any agent can edit them. What keeps the site safe is not the agent but **three checks that do not depend on who wrote the code**:
  1. **The tests** (`npm test`, 208 checks: every old URL still works, contrast, units, translations, accounts, offline app). GitHub now runs them on every pull request (the **Check** workflow) and shows a green tick or red cross.
  2. **The Preview**: every branch and pull request gets its own copy of the site on Cloudflare. You look at it before anything goes live.
  3. **You merge**. Nothing reaches `drharshmaheshwari.com` until you press Merge on a pull request into `main`.
- So the routine is always: **ask → agent opens a pull request → green tick + Preview looks right → Merge.**

## One-time setup: Jules (the cloud agent; closest to how Claude Code worked here)

1. Open **jules.google**, sign in with the Google account that has the Gemini Pro plan.
2. **Connect GitHub**: install Jules's GitHub app on the `covisheild` account and allow the repositories `drharshmaheshwari` (and `obesity-course`, if you want it there too).
3. Choose the repository `covisheild/drharshmaheshwari`. Base branch: **`main`**.
4. Open the repository's **Configuration / Environment** settings and paste this as the **setup script**, then run it so Jules keeps the prepared machine:

   ```
   node -v
   npm ci --no-audit --no-fund
   WORKERS_CI_BRANCH=preview npm run build
   ```

   It should finish in 2 to 3 minutes. If it complains about the Node version, put `nvm install 22 && nvm use 22` as the first line (the site uses Node 22; `.nvmrc`).
5. Jules reads `AGENTS.md` by itself. In your **first** task, also say: "Read AGENTS.md and CLAUDE.md fully first."
6. **Test it with something harmless** before trusting it with real work (below, "First task").

## First task (do this once)

> Read AGENTS.md and CLAUDE.md fully. Then run `WORKERS_CI_BRANCH=preview npm run build` and `npm test` and tell me how many tests pass. Change nothing except: on the Support page, nothing. Do not edit any file. Reply with the numbers and anything that surprised you.

Expected: 208 tests, 0 failures. If it says anything else, the setup script is the first thing to fix (ask Jules or any agent: "the setup is not working, here is the error").

Then a tiny real change, e.g.: "On the About page, fix the typo X. Open a pull request." Check that the pull request shows the Check workflow (green), a Cloudflare Preview link, and a description in the layout from `AGENTS.md`. Merge it. That one round trip proves the whole route.

## How to ask (task templates)

Keep **one pull request = one purpose**. Paste real text, not summaries. Always end with "Open a pull request; do not push to main."

**Small change or bug**
> On `/tools/bmi-calculator/` the target-weight line says X; it should say Y (reason). Fix it, including the translations of any English text you change. Follow AGENTS.md. Open a pull request.

**Publish from Website Desk (replaces "Publish from Website Desk" with Claude, which read Notion itself)**
Open the row in Notion, copy the whole page, and paste:
> Publish this Website Desk row. Type: Article (public). Slug: ... Here is the full Notion page: [paste]. Follow "Publish from Website Desk" in CLAUDE.md steps 2-5, but do not touch Notion and do not push to main: open a pull request. Put the Notion update (Live URL, Last published, Publish-log line) at the end of the pull request for me to paste. Images and attachments: I have attached them / the links are [..]; save them into the repo, Notion links expire.

Then you do step 6 by hand in Notion: untick 🚀 Publish, Stage = Live, Live URL, Last published, a line in Publish log. (Never edit the Notion text to match the site; the flow is one way.)

**A new calculator or tool**
> Build a new tool: [name]. Source/guideline: [paste or link]. India-first cut-offs. Use `UnitField` for every number with a unit. It must have a page in every language (AGENTS.md section 5). Read `docs/design-direction.md` and copy how `src/pages/tools/bmi-calculator.astro` and its tests are built. Add tests in `tests/`.

**A book (PDF on R2)**
You upload the PDF to R2 yourself (file name with no spaces) and put the `https://files.drharshmaheshwari.com/books/...` link in the task. Ask the agent to check the link returns a PDF (`curl -I`); if its machine has no internet, open the link yourself and say so in the task.

## Translations (the part that needs extra care)

The English-to-12-languages rule is unchanged (`docs/translation.md`). With Claude, a separate agent did the **blind back-translation**. One Jules task cannot do that for its own work. So it is two tasks:

1. **Task A, translate.** The agent updates all languages and runs `npm run i18n:check`. Its pull request lists the changed strings under "Translation: back-translation still needed".
2. **Task B, blind check**, in a **fresh** conversation (a new Jules task or a new Gemini chat) that has **not** seen the English or Task A's reasoning. Give it only the translated strings of one language and ask:
   > Translate each of these [language] strings back into English, literally. Add a note where the [language] reads unnatural, and grade each string: reads as written in the language / reads as translated.
   
   Then give those English back-translations **and** the original English to another fresh chat:
   > Compare each pair. Grade every difference CRITICAL (clinical fact, number, threshold, negation, who it applies to, risk, action, certainty), MODERATE (non-clinical claim, dropped or added qualifier) or MINOR. List only CRITICAL and MODERATE.
   
   Send the CRITICAL and MODERATE list back to the agent from Task A to fix, and ask it to save the result in `docs/translation-qa/<lang>-<date>.md`.
3. Clinical safety strings (alerts, thresholds, first aid, pregnancy, children) get their own second blind round.
4. Hindi: you read the Preview yourself, as before. Your corrections go to `docs/translation-qa/hi-calibration.md`.

Until Task B is done for a language, leave that pull request unmerged if it changes medical wording; for purely non-clinical text it is your call. An out-of-date translation shows the English page instead, which is the safe fallback, so a delay never shows wrong medicine.

## Checking and merging (every time)

1. In the pull request: the **Check** workflow is green (it ran the build and all tests). If red, paste the error into the same Jules task and say "fix this".
2. Open the **Preview link** (the Cloudflare comment or check on the pull request). Look at the pages named under "Pages to check", on your phone and on a computer, in light and dark, and in Hindi if the text is For Everyone.
3. Read "Needs Harsh's clinical review". Anything listed there is yours to approve.
4. Press **Merge**. The live site updates in a few minutes.
5. Paste the "Notion update" block into Notion.
6. If something is wrong after merging: GitHub shows a **Revert** button on the merged pull request; it makes a new pull request that undoes it.

## Gemini CLI or Antigravity instead (interactive, on your own computer)

1. Install Git and Node 22. Clone: `git clone https://github.com/covisheild/drharshmaheshwari`, then `cd drharshmaheshwari`, `npm ci`.
2. Install and start it in that folder (`gemini` for the CLI; or open the folder in Antigravity). `GEMINI.md` is loaded automatically and pulls in `AGENTS.md` and `CLAUDE.md`. In the CLI, `/memory show` lists what it loaded; check that all three are there.
3. Create a branch first (`git switch -c some-name`), never work on `main`, and finish with a pull request.
4. This route can also run `npm run dev` and `npm run test:e2e` (install Playwright once), which the cloud agent may not manage.
5. To let the CLI read Notion directly, add the Notion MCP server in the CLI's settings (`~/.gemini/settings.json`, `mcpServers`). Then "Publish from Website Desk" works as in CLAUDE.md, except that the result still goes through a pull request.

## What was Claude's and does not carry over

- **Reading Notion and updating the rows by itself.** Now: you paste in, and paste out (or use the CLI with the Notion MCP).
- **Pushing to `main` directly.** Now: pull request and Merge. (This is safer, not a loss.)
- **Subagents and skills** (blind back-translation, audits, the obesity-course pipeline). Now: separate fresh chats, as above, or smaller steps.
- **Checking its own work in a real browser** (screenshots at 390 px, `test:e2e`). Ask the agent to try; if it cannot, you do the Preview check on a phone. This is the biggest practical gap. Always look at the Preview.
- **Long memory of past decisions.** All of the decisions that matter are in `CLAUDE.md` and `docs/`. When you make a **new** standing decision, tell the agent: "Add this to CLAUDE.md under the right heading, with the date and 'Harsh'" so that it survives into the next chat. Jules does not remember between tasks.

## The `obesity-course` repository

It has its own `AGENTS.md`/`GEMINI.md`. Its pipeline (one book per chat, with Opus-class subagents) was designed for Claude; a single Jules task is suited only to small bounded jobs there (fix the defect list for one section, a build check, a document edit). The one rule holds for every agent: **a claim without a source that was actually opened is never written down as fact, and `verified.opened` is set to true only by whoever opened the source.**

## If an agent goes wrong

- It changed things you did not ask: "Revert everything outside [the files/pages I named]."
- It says tests failed and wants to skip them: say no. The tests are the safety net.
- It says it cannot do something (no browser, no internet): that is fine; ask it to say so in the pull request and do the check yourself.
- Cheap trick for any doubt: "Show me exactly which files you changed and why, in plain English."
