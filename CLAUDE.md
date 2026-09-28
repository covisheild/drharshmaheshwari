# drharshmaheshwari.com

Personal site of Dr. Harsh Maheshwari: obesity education for the public and for clinicians.
Astro static site, deployed by Cloudflare Pages from `main`. The owner is not a coder; Claude does all code work.

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
   - Evidence (clinicians) → `src/content/clinicians/<slug>.md`
   - Blog post → `src/content/blog/<slug>.md`
   - Book → `src/content/books/<slug>.md`. The PDF is **not** copied into the repo: Harsh uploads it to Cloudflare R2
     and puts its `https://files.drharshmaheshwari.com/books/...` link in the Notion page; use that link as the download URL
     (see "Large files" below). Cover image → `public/books/<slug>.<ext>` (if none is attached, render page 1 of the PDF,
     keep it under ~300 KB). Show the licence stated in the Notion page.
   - Video → append to `src/data/videos.json`
   - Timeline rows → `src/data/timeline.json`; Publication rows → `src/data/publications.json` (fetch citation from the DOI/PubMed link)
   - Page update / Site change → edit the named page or `src/consts.ts`
   - Stage = Remove from site → delete the file/entry
3. Apply `Voice & rules`: key points, question headings, references (open every one; PubMed tool for PMIDs), `reviewed` date. Download Notion images/attachments into the repo — Notion file URLs expire.
4. `npm run build` must pass; screenshot mobile (390px) and desktop; check no horizontal overflow.
5. Commit, push to `main`. Then in Notion: untick `🚀 Publish`, Stage = Live, fill Live URL (the site page, not the PDF link) and Last published, write what changed in Claude notes. Add a line to Publish log. Update Site map if a section changed.

Questions for Harsh go in the row's **Claude notes** with Stage = Needs your input.

## Large files (PDFs, books): Cloudflare R2, never git

- Bucket `drhm-files`, public at `https://files.drharshmaheshwari.com/` (R2 custom domain). Books live under `books/`.
- Never commit PDFs or other large binaries to this repo (git keeps every version forever; repo size is limited).
- Harsh uploads files himself in the Cloudflare dashboard. File names: no spaces (use `-` or `_`), because the URL is permanent.
- Harsh does not compress book PDFs (compression damages figures) — do not suggest or do it.
- Before publishing a book page, check the R2 link returns the PDF (not a 404 / "nothing here yet" page).
- Do not add a wildcard `*.drharshmaheshwari.com` route to the site Worker: it hijacks `files.` and breaks R2.
- Default book licence: CC BY-NC-SA 4.0 (adaptation allowed, share-alike), unless the Notion page says otherwise.

## Drafts

`draft: true` in frontmatter shows the page on local dev and Cloudflare preview builds (any branch other than `main`,
via `CF_PAGES_BRANCH`) and hides it on production. Starter articles written by Claude stay `draft: true` until Harsh approves.

## Rules

- NMC conduct: no testimonials, patient details, fees, appointment booking, superlatives, or "specialist" claims.
- Indian cut-offs: BMI overweight 23–24.9, obesity ≥25; waist ≥90 cm men / ≥80 cm women; WHtR risk from 0.5.
- Never change a published URL (slug). Hindi pages will live under `/hi/` (Phase 2).
- SEO/AEO plumbing is automatic: sitemap, `robots.txt` (AI crawlers allowed), `/llms.txt`, `/llms-full.txt`, RSS, schema.org JSON-LD in `Base.astro` / `Article.astro`.
- Respect `prefers-reduced-motion`; animations use the `.reveal` class.
