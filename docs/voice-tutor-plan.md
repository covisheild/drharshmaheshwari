# Voice-first AI tutor: feasibility and build plan

Status: **plan only, nothing built.** Written 10 Oct 2026 after reading this repository and the platform
documentation listed in §B. Every platform claim carries its source URL; all were checked on **10 Oct 2026**.
Labels used below: **[Verified]** = stated in official docs or in this repo; **[Inferred]** = reasoned from verified
facts but not stated anywhere; **[Test]** = can only be settled on a real Android phone.

---

## Summary (the go/no-go)

**Conditional GO for a feasibility spike. NO-GO for full development until the spike passes.**

- **Claude is the only consumer assistant whose documentation supports the whole loop on a free plan:** you add one
  custom remote MCP connector (free), sign in with OAuth, use the connector on Android, and use voice mode (free).
  Voice mode docs say connected tools "work the same way in voice mode as they do in text chat". [Verified]
- **Three things are undocumented and decide the project**: (1) whether a *custom* connector actually fires
  from Android voice mode (docs name Gmail/Calendar/Docs/Slack, never custom MCP by name); (2) whether
  a figure returned by our tool is *shown to the learner* in voice mode (docs: "Not every result can be shown on screen in
  voice mode"); (3) how the approval prompt for a write tool behaves mid-voice. All three are a half-day real-device test.
- **Gemini is out** for you: custom MCP apps are US-only and not usable in Gemini Live. **ChatGPT is out** for the free/low-cost
  goal: custom MCP needs Plus or higher, personal plans get read/fetch only (no progress writes), and MCP apps are documented as web-only.
- **Recurring infrastructure cost: ₹0.** Everything fits the current Cloudflare free plan (one Worker, the existing D1 database, R2 for figures).
  No AI API account is needed; learners use their own Claude account.
- The repo is unusually well prepared: the Statistics book is already exported as structured JSON with **concept-level headings, Definition /
  Explanation / Example / Must-Know blocks, checkpoint questions with model answers, figure metadata**, a versioned book, Google sign-in,
  D1, and an FSRS scheduler (`ts-fsrs`) already running in the codebase. The tutor reuses all of it.

Recommended next step: **Milestone 0 (the spike, ~1–2 days of Claude work + 1 walk of yours)**. If it fails, §H gives the fallbacks.

---

## A. Current-state audit (what the repo actually is)

### Stack and hosting [Verified, this repo]
| Thing | Where | Notes |
|---|---|---|
| Astro 7 static site, `@astrojs/cloudflare` adapter | `package.json`, `astro.config.mjs` | Every page prerendered; **only `/api/*` runs code** |
| One Cloudflare Worker serving static assets + `/api/*` | `wrangler.jsonc` (`main` = Astro entrypoint, `assets.directory = ./dist`, binding `ASSETS`) | Workers Builds deploys `main`; other branches → Preview with **their own D1** (`previews.d1_databases`) |
| D1 database `DB` | `wrangler.jsonc`; schema `src/server/schema.ts` (`MIGRATIONS`, `ensureSchema()` applies on first touch) | Tables: `users`, `sessions`, `attempts`, `prefs`, `reading_progress`, `bookmarks`, `highlights`, `schema_version` |
| R2 bucket `drhm-files` at `https://files.drharshmaheshwari.com/` | `CLAUDE.md`, `book.json → figureBase` | Figures: `books/statistics-first-principles-to-regression/figures/*.png` (79 PNG) |
| Only server route | `src/pages/api/[...path].ts` → `handleApi()` in `src/server/api.ts` (363 lines) | Hand-written router, no framework, no external auth library |

### Authentication [Verified, `src/server/api.ts`]
- Google OAuth authorization-code flow with PKCE, state and nonce: `startGoogle()` / `finishGoogle()`; ID-token claims validated; no Google tokens kept.
- Session = random token in HttpOnly SameSite=Lax cookie `sid` (180 days); only its SHA-256 stored (`sessions.token_hash`). `currentUser()` resolves it.
- Internal learner id = `users.id` (random UUID); `google_sub`, `email`, `name`, `picture` stored.
- CSRF defence: every non-GET request must have `Origin` = site origin (`sameOrigin()`).
- Account deletion: `DELETE /api/account` deletes the `users` row; every per-user table cascades (`ON DELETE CASCADE`). UI: `src/pages/account.astro`. Privacy text: `src/pages/privacy.astro#accounts`.
- **No bearer-token auth, no OAuth *server* (we are only a Google *client*), no rate limiting** beyond per-request size/count caps (`LIMITS`). These are the gaps the tutor must fill.

### Book content [Verified]
- Statistics book: `src/data/books/statistics-first-principles-to-regression/` → `book.json` (id `stats`, **version `3.1`**, `figureBase`, `outline` of chapters → sections with ids like `c01-s03`, labels `1.3`, word counts) and `sections/<id>.json` (157 files, 2.0 MB).
  Written by `scripts/books/statistics/export.py` from the source zip; **never hand-edited**.
- A section is `{id, label, title, part, blocks[]}`. Block types across the book: `prose` 1201 (roles `definition` 262, `explanation` 262, `example` 243, `calculation` 129, `derivation` 81, `r` 75, `text`, `misreading`, `output`), `mustknow` 265, `heading` 262, `checkpoint` 94, `figure` 79.
- **Concepts already exist as numbered headings.** Inside a section, each `heading` (`{level, num: "1.1.2.1", html}`) starts a concept with its own Definition / Simplified Explanation / Example / Must-Know quartet; `checkpoint` blocks hold questions **with model answers** (`questions[].prompt`, `.answer`). Cross-references are links with `data-sec` / `data-num` (e.g. §6.5), which give concept relationships for free.
- Example: `c01-s03` "Parameter vs Statistic" (488 words) = Definition, Explanation, Example, 4 Must-Know points, Checkpoint 1.3 (3 questions with answers), links to §6.5. Exactly the lesson in your brief.
- Figures: `{t:"figure", src:"ch01-designs.png", alt, caption, w, h}`. Chapter 1 has one: **Figure 1.1** (study designs on a time line) in `c01-s05`.
- Sections are already published as static JSON at `/doctors/books/<slug>/sections/<id>.json` (`src/pages/doctors/books/[slug]/sections/[section].json.ts`). The book text and model answers are therefore **already public**; serving them to a tutor exposes nothing new.
- Obesity Expertise: `src/data/books/obesity-expertise/<book>/sections/*.json`, same container format but different blocks (`practice`, `exercise`, one `mustknow` per section, roles `plain`/`illustration`/`breaks`). There, concept = section. Extending later needs a per-series "concept extractor", not a new pipeline.
- Lookup helpers: `src/lib/reader-books.ts` (`readerBooks`, `readerSectionEntries()`, `readerFigureBase()`).

### Progress and spaced repetition already in the code [Verified]
- `src/trainers/core/schedule.ts`: FSRS via `ts-fsrs` (`request_retention 0.9`, `maximum_interval 365`); **state rebuilt by replaying attempts**, nothing extra stored.
- Book reader progress: `src/reader/store.ts` / `sync.ts`; practice marks are `attempts` rows with `trainer = 'book-stats'`, item ids `c01-s03-q7` (checkpoint question), `-k<n>` (must-know point). Review page: `src/reader/review.ts`.
- Free-plan discipline already documented in `CLAUDE.md`: D1 bills rows *scanned*; new queries need an index; batch writes.

### Tests [Verified]
- `tests/api.test.mjs` runs `handleApi()` against a real local D1 (Miniflare via `getPlatformProxy`, `tests/wrangler.test.jsonc`) with a **fake Google**: the tutor's OAuth and tools can be tested the same way.
- `tests/site.test.mjs` (every URL ever served), `tests/e2e.mjs` (Playwright).

### Constraints from `CLAUDE.md` that shape the design
- Only `/api/*` runs code; pages stay static. Preview never touches production D1. Never edit shipped migrations. Never change a published URL.
- "Hosting an AI ourselves is parked until it has sign-in, per-person daily caps, a monthly budget switch and a passage-only prompt" (`docs/book-reader-plan.md`). The consumer-app route respects that.
- `public/_headers` sets `X-Frame-Options: SAMEORIGIN` on every page, so a tutor UI must not iframe site pages; it loads figures from R2 instead.

---

## B. Feasibility verdict

### Verified (official docs, checked 10 Oct 2026)
| Claim | Source |
|---|---|
| Custom connector (remote MCP by URL) works on Free, Pro, Max, Team, Enterprise; "On the Free plan, you can add one custom connector." | https://claude.com/docs/connectors/custom/add-unlisted ; https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-MCP |
| Connectors are "available in your conversations on the web, desktop, and mobile"; "users must add a connector on web or desktop before it appears on mobile." | https://claude.com/docs/connectors ; https://claude.com/docs/connectors/building/mcp-apps/design-guidelines.md |
| Voice mode: "a beta feature available to all plans (Free, Pro, Max, Team, and Enterprise)", on iOS and Android. "In voice mode, Claude can use the tools you've connected… Connected tools work the same way in voice mode as they do in text chat and follow the rules of your plan." "On the Free plan you can connect one tool." | https://support.claude.com/en/articles/11101966-use-voice-mode |
| "Not every result can be shown on screen in voice mode, and using several tools at once can add a short delay." Interrupting: "just start talking." "Voice conversations count toward your regular usage limits." | same |
| OAuth: Claude supports DCR and CIMD (Client ID Metadata Documents) and authless; redirect URI `https://claude.ai/api/mcp/auth_callback` covers web, desktop and mobile; RFC 9728 protected-resource metadata, discovered from a `401` with `WWW-Authenticate: Bearer resource_metadata=…`; PKCE S256; follows the 2025-03-26 / 2025-06-18 / 2025-11-25 auth specs; refreshes tokens. | https://claude.com/docs/connectors/building/authentication.md ; https://claude.com/docs/connectors/building/index.md |
| Servers may return "Text and image-based tool results"; result limit ~150,000 characters; 240 s per tool call. Not supported: resource subscriptions, sampling. | https://claude.com/docs/connectors/building/index.md |
| Interactive connectors (MCP Apps: our own HTML UI rendered in the chat) "are available for all users on Claude, Cowork, Claude Desktop, and Claude for iOS/Android"; on Android they render in a native WebView; "Claude asks for permission to display the app." | https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude ; MCP Apps design guidelines (above) |
| Tools must declare `readOnlyHint` and `destructiveHint`; "Read-only tools can run without per-call confirmation, and destructive tools always prompt." Per-tool setting: Always allow / Needs approval / Blocked. | https://claude.com/docs/connectors/building/review-criteria.md ; https://claude.com/docs/connectors/building/mcp.md |
| Claude is available in India. | https://support.claude.com/en/articles/8461763-supported-countries |
| Cloudflare: build new servers with the stateless `createMcpHandler()`; `McpAgent` (Durable Objects) is deprecated. The handler can be called from inside another handler with an already-verified `authInfo`. | https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/ ; https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/ |
| Workers rate-limiting binding is GA. Since 1 Sep 2026 D1 queries fail on the free plan once the daily row limits are passed. | https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/ ; https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ |

### Inferred (likely, not stated)
- A custom connector counts as "the one tool" Free can connect, so it behaves like Gmail in voice. *Strong inference, still unproven.*
- Our tool's image result is at least **seen by the model** (docs: image tool results are supported). Whether the learner **sees** it is not documented.
- An MCP App could show the figure on screen, but "not every result can be shown on screen in voice mode" may cover exactly this.
- Marking the save tool `readOnlyHint:false, destructiveHint:false` and setting it to **Always allow** once (in text mode, before walking) should avoid approval prompts mid-walk.

### Unresolved: must be tested on your phone [Test]
1. Does Claude Android **voice mode** call *our* custom connector's tools (read and write)?
2. When a write tool runs in voice, does an approval prompt appear, and can it be pre-approved?
3. Which figure delivery is visible in voice mode: image content in the tool result, an MCP App, or only a tappable link?
4. Does voice continue with the **screen locked / phone in pocket**? (Claude docs are silent. OpenAI documents this for ChatGPT, Anthropic does not.)
5. How long a Free-plan voice lesson lasts before the 5-hour usage limit stops it. No message count is published.
6. Does the Google sign-in inside the connector's OAuth window work (Google blocks some embedded web views)? Adding the connector happens on web/desktop, so this probably happens in a normal browser.

### Verdict per requirement
| Requirement | Verdict |
|---|---|
| Android voice | Verified available on Free |
| Connector access in voice | **Probable**: docs say tools work in voice; custom MCP in voice is untested |
| Original figure visible to learner | **Unknown**: image to the model is verified; on-screen display needs the spike; fallback is a tappable link |
| Authenticated writes | Verified on web (OAuth + write tools); **voice approval behaviour is untested** |
| No inference cost to you | Verified: the learner's own Claude plan pays for inference; your Cloudflare stays on the free plan |

---

## C. Platform comparison

| Criterion | **Claude** (Android) | **Gemini** (Live) | **ChatGPT** (Voice) | **Own voice app** (e.g. Gemini Live API + our tools) |
|---|---|---|---|---|
| Voice quality / interruptions | Good; "just start talking" interrupts; push-to-talk option [Verified docs; quality = Test] | Excellent, mature | Excellent; works with screen locked [Verified, help.openai.com/en/articles/20001274-chatgpt-voice] | Depends on build; Live API supports barge-in |
| Free plan | Voice: all plans. Usage limit resets every 5 h, count not published | Live free | Free gets "limited access" to a mini voice model | Gemini API free tier exists (data used to improve Google products) |
| Custom connector | **Yes, 1 on Free**; added on web, used on mobile | Custom MCP app **US-only, 18+, English** (support.google.com/gemini/answer/17209137) | Developer mode: **Plus/Pro only, not Free** (chatgpt.com/pricing); "MCP apps… web only" (help.openai.com/en/articles/12584461) | We are the client: any tools |
| Tools during voice | "work the same way… as in text chat" (custom MCP untested) | Live apps list has no custom apps (support.google.com/gemini/answer/15274899); Gems not usable in Live | Live "can use the plugins and connected apps available to your account"; custom MCP in voice undocumented | Yes (function calling) |
| Auth + writes | OAuth (DCR/CIMD) + write tools | DCR; writes need manual confirmation | Personal plans: **read/fetch only**; write beta = Business/Enterprise/Edu | Our existing Google sign-in |
| Original figure | Image results to the model; MCP Apps on Android; voice display untested | n/a | Widgets "through supported widgets" in Live; custom apps web-only | We show the PNG ourselves: **guaranteed** |
| Recurring cost to you | ₹0 | – | – | **Per minute of speech**: Gemini Live audio is about $0.023/min per ai.google.dev/gemini-api/docs/pricing (≈ $0.70 per 30-min walk; re-check before building); OpenAI gpt-live-1 $0.05/min |
| Effort / platform risk | Medium effort; beta feature; Free limits may change | Blocked by region | Blocked by plan for writes | High effort (real-time audio PWA, keys, caps, budget switch); lowest platform risk |

Others: Mistral Le Chat advertised custom MCP connectors on its free plan (mistral.ai/news/le-chat-mcp-connectors-memories, Sept 2025), but voice + MCP support is unverified and the product may have been renamed. Perplexity and Copilot: no official evidence of custom MCP in voice. NotebookLM interactive Audio Overviews: English-only, upload-based, **no tools and no progress writes**, so it cannot be a tutor of record.

**Conclusion:** build for Claude, but keep the tutor's logic in plain server functions with a thin MCP adapter, so a ChatGPT adapter or our own voice client can reuse them unchanged (§H).

---

## D. Recommended architecture

```
  Android phone                         Anthropic                         drharshmaheshwari.com (one Cloudflare Worker, free plan)
 ┌──────────────────┐   speech    ┌──────────────────────┐  HTTPS (Streamable HTTP, Bearer token)
 │ Claude app       │◀──────────▶│ Claude (model + voice)│──────────────────────────────▶ /api/mcp ──┐
 │ voice mode       │  figure UI  │ MCP client, OAuth     │                                          │
 └──────────────────┘◀───────────│ client (DCR/CIMD)      │──────── OAuth ──────▶ /api/oauth/*       │
                                  └──────────────────────┘   (authorize: needs the site's existing   │
                                                               Google sign-in session `sid`)          │
                                                                                                      ▼
   ┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │ src/server/api.ts router (existing)                                                                    │
   │   ├─ /api/oauth/{register,authorize,token,revoke}  src/server/oauth.ts   (new; D1 tables, hashed tokens)│
   │   ├─ /api/mcp           src/server/mcp.ts   thin adapter: createMcpHandler + 5 tools, verifies Bearer   │
   │   │                      → user_id comes ONLY from the token                                           │
   │   ├─ tutor core         src/server/tutor/{content,progress,mastery}.ts   (plain functions, tested)     │
   │   └─ /api/tutor/*       cookie-auth endpoints for the website: export, connected apps, revoke          │
   │                                                                                                         │
   │ Content (read-only, built by Astro):  env.ASSETS → /doctors/books/<slug>/sections/<id>.json (exists)    │
   │                                       env.ASSETS → /doctors/books/<slug>/concepts.json (new, build-time)│
   │ Figures: R2 https://files.drharshmaheshwari.com/books/<slug>/figures/<file>.png (exists)               │
   │ D1 (existing DB): users, sessions … + oauth_clients, oauth_grants, oauth_tokens, tutor_events,          │
   │                   concept_state (new migration 5)                                                       │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Responsibilities
- **Website / build (Astro):** stays static. One new build-time file per book, `concepts.json`: the concept index (id, number, title, section, chapter, key terms from `<strong>` in the definition, figure ids, related concepts from `data-sec` links and outline order, book version). Generated from the existing section JSON, so it is never hand-edited and follows re-exports automatically.
- **Connector server (`/api/mcp`):** inside the existing Worker and route, so there is no new deployment, domain or Worker. Stateless (`createMcpHandler`, no Durable Objects). It reads content through `env.ASSETS` (static files: no extra bundle size, no extra cost) and figures from R2 over HTTPS. Its tools are listed below.
- **Authorization server (`/api/oauth/*`):** a minimal OAuth 2.1 server on D1, written in the same style as the existing Google code. The consent step reuses the site's Google sign-in: no session means a redirect to `/api/auth/google?return=<authorize URL>`, then back.
  *Why not Cloudflare's `workers-oauth-provider` library:* it must be the Worker's default export (wrapping Astro's entrypoint) and stores grants in KV; our Worker's entrypoint is Astro's, and the account data already lives in D1. Hand-rolling is ~300 lines with tests, following `tests/api.test.mjs`. (If Harsh prefers a library, the alternative is a second small Worker at `tutor.drharshmaheshwari.com` using the library, at the cost of cross-subdomain sign-in.)
- **Progress database (D1, existing):** authoritative. `tutor_events` is append-only (history, idempotent); `concept_state` is a cache derived from the events: mastery, FSRS card, next review, misconceptions. Same philosophy as `schedule.ts`: the state can always be rebuilt from history.
- **AI assistant (Claude):** voice, conversation, explanation, question asking, judging the learner's answer against the book's model answer. It never chooses who the learner is and never sets mastery directly.

### The smallest useful tool set (5 tools)
| Tool | Hints | Input | Returns |
|---|---|---|---|
| `get_study_status` | read-only | `book?` | **Tutor rules** (versioned text, short), learner's last concept, concepts in progress, **due reviews** (top 5 with reason), suggested next concept, book version. Called first in every conversation; this is how "resume" works without chat history. |
| `find_concepts` | read-only | `query`, `book?` | ≤5 matches: `concept_id` (`stats:1.3`), number, title, chapter, one-line definition |
| `get_concept` | read-only | `concept_id` | **Exact book text** of that concept only (Definition, Explanation, Example, Must-Know, as plain text with labels), its checkpoint questions **and model answers flagged "answer key: do not reveal before the learner answers"**, figure ids + captions, related concepts (prerequisite = previous in outline, next, § cross-refs), `source_url` (reader link with anchor), `book_version`, citation |
| `show_figure` | read-only | `figure_id` | The original PNG as image content + caption + alt + direct link; plus an MCP App view if the spike shows it renders (see below) |
| `record_assessment` | **write**, not destructive, idempotent | `concept_id`, `book_version`, `items[]` (each: `kind` recall/explain/apply/discriminate, `source` checkpoint q-number or "tutor", `result` correct/partial/incorrect, `hinted` bool, ≤200-char answer summary), `misconceptions[]` (≤3, ≤120 chars), `taught` bool | Server-computed mastery level, what evidence is still missing, next review date |

`get_tutor_instructions`, `get_related_concepts`, `get_learner_progress`, `get_due_reviews` are folded into these, because each extra tool costs model context and voice latency. The rules are also put in the server's MCP `instructions` field, but are not relied on there (clients may not show it).

### Figures: how the learner actually sees them
Three channels, built in this order; the spike decides which is primary:
1. **Image content in the tool result** (base64 PNG fetched from R2). [Verified] the model receives it, so its explanation can genuinely refer to the figure. Display to the learner: [Test].
2. **MCP App** (`ui://` resource, a ~40-line HTML page showing the PNG from `files.drharshmaheshwari.com` with caption and pinch-zoom). [Verified] supported on Android in a WebView, with a "permission to display" prompt; in voice mode: [Test].
3. **Tappable link** to the figure (R2 PNG or the reader page with an anchor). Always included; it works whenever the transcript is on screen.
The tutor rules forbid saying "here is the figure" unless the tool returned an image, and require saying "I've put the figure on your screen; tap the link if you don't see it."

### Account linking, revocation, deletion, export
- **Linking:** on claude.ai (web or desktop): Settings → Connectors → Add custom connector → `https://drharshmaheshwari.com/api/mcp`. Claude registers itself (DCR, or CIMD later), opens our `/api/oauth/authorize`, the learner signs in with Google (existing flow) and sees a consent page ("Claude can read the books and save your tutor progress. It cannot see your email."). Then the connector appears in the Android app.
- **Tokens:** opaque random strings, only SHA-256 stored (as with `sessions`). Access token 1 h; refresh token 60 days, **rotated on each use** with reuse detection (reuse of an old refresh token revokes the whole grant). Auth codes single-use, 60 s, bound to client, PKCE challenge, redirect URI and `resource`.
- **Redirect allowlist:** DCR accepts registrations only with `https://claude.ai/api/mcp/auth_callback` (plus loopback URIs on preview, for MCP Inspector). A rogue client therefore cannot receive codes, which removes the main risk of open registration.
- **Revocation:** `/account/` gets a "Connected AI assistants" list (client name, linked on, last used) with **Disconnect** (deletes the grant and its tokens; the next tool call gets 401). Disconnecting in Claude does not reach us, so our own button is the real off-switch.
- **Deletion:** new tables reference `users(id) ON DELETE CASCADE`, so the existing "Delete my account" removes tutor data and grants.
- **Export:** `/account/` "Download my learning record (.xlsx)", built **in the browser** from a cookie-authenticated `GET /api/tutor/export` (your data only). No server-side spreadsheet, no shared workbook.
- **Minimum data:** the tutor never receives email/name (the tools return no PII); stored learner answers are ≤200-char summaries, never transcripts or audio.

### Security controls (what the backend enforces)
- Learner identity = the token's grant → `user_id`. **No tool has a user-id parameter.** Every query has `WHERE user_id = ?` bound from the token.
- `/api/mcp` accepts only `Authorization: Bearer`, never the `sid` cookie (so a web page cannot ride a session; CSRF is not possible). `/api/oauth/token` and `/api/mcp` are exempt from the existing `sameOrigin()` check, because Claude's servers call them without `Origin`. Everything else keeps it.
- Scopes `books:read tutor:write`; the token's `aud`/resource must equal `https://drharshmaheshwari.com/api/mcp`.
- Strict input validation in the existing style (regex ids, lengths, enums, item counts); unknown concept or stale `book_version` gives a clear error; HTML stripped from free text before storage.
- Limits: Workers rate-limit binding per grant (e.g. 60 tool calls/min) + a D1 daily cap per user on writes (e.g. 300 assessments/day) + per-IP limit on `/api/oauth/*`. The D1 free cap is account-wide, so one abusive user must not be able to exhaust it for everyone.
- Idempotency: `tutor_events` key = hash(grant, concept, normalized items, 10-min bucket), so a model retry stores once.
- Feature switch: `TUTOR_ENABLED` var plus an **allowlist of emails** for the proof of concept; unset means `/api/mcp` returns 404.
- Prompt injection: tool results contain only book text written by Harsh; learner free text is never reflected into another learner's results.

### Tutor behaviour: what instructions do vs what the backend does
| Behaviour | Instructions (model) | Backend (enforced) |
|---|---|---|
| One concept at a time, short spoken turns (≤ ~80 words), question every 1–2 turns, wait for the answer | ✔ | `get_concept` returns *one* concept (~300–600 words), not a section |
| Ground strictly in the book; quote only text from `get_concept`; say "the book doesn't cover that" | ✔ | Exact text + `source_url` + version returned; no other source offered |
| Adapt when confused; handle interruptions; resume | ✔ | `get_study_status` returns where the learner was |
| Evaluate answers against the model answer | ✔ (model's judgement) | Model answers supplied; rubric fields constrained |
| Track uncertainty; don't declare mastery early | ✔ (asks more questions) | **Mastery computed only by server** from evidence; the model cannot set it |
| Save compact assessment | ✔ (calls `record_assessment` after ≥2 answers or at the end of a concept) | Validation, idempotency, caps |
| Spaced review | ✔ (asks due items first) | FSRS schedule + due list |
| Figures | ✔ (calls when caption/explanation needs it; honest about display) | Bytes + link + UI |
| Speakable symbols (x̄ "x-bar", μ "mu", p̂ "p-hat", σ "sigma") | ✔ | Short symbol glossary included in the rules |

### Mastery scale and spaced repetition (proof-of-concept version)
Levels, computed by the server from `tutor_events`:
| Level | Meaning | Rule |
|---|---|---|
| 0 New | not met | no events |
| 1 Introduced | taught, little evidence | `taught` recorded, or <2 correct items |
| 2 Developing | partly right | some correct, but criteria for 3 not met, or the latest item incorrect |
| 3 Secure | understood today | **≥2 correct un-hinted items of ≥2 different kinds, at least one `explain` or `apply`, latest item correct, no misconception left open** |
| 4 Mastered | retained | Secure **plus a correct un-hinted retrieval ≥3 days after reaching Secure** |
An incorrect review drops a concept to 2. Partial and hinted answers never count toward 3/4.
Rationale: one right answer can be a guess, and two different kinds of question test understanding rather than recognition. Only a delayed retrieval shows memory, which is the point of spaced repetition.

Scheduling: reuse the existing FSRS settings (`ts-fsrs`, retention 0.9, max 365 days) at **concept** level, rebuilding from the events like `schedule.ts`. Per session, map the concept's evidence to one rating: any incorrect → Again; partial/hinted only → Hard; meets "Secure" → Good. "Easy" is unused in the POC. Store `next_review_at` in `concept_state` with an index `(user_id, next_review_at)` so "what's due" reads only due rows.
Later (not POC): write book checkpoint answers also as `attempts` rows (`trainer book-stats`, item `c01-s03-q7`), so the website's existing Review page reflects walk lessons.

### New D1 tables (one new migration, #5; nothing shipped is edited)
- `oauth_clients(id, name, redirect_uris, created_at)`; `oauth_grants(id, user_id→users CASCADE, client_id, scopes, created_at, last_used_at)`; `oauth_tokens(hash PK, grant_id→CASCADE, kind code|access|refresh, expires_at, used_at, data)` + index on `grant_id`.
- `tutor_events(user_id→CASCADE, id, book_id, concept_id, book_version, t, kind, data JSON, received_at, PK(user_id,id))` + index `(user_id, book_id, concept_id, t)`.
- `concept_state(user_id→CASCADE, book_id, concept_id, mastery, card JSON, last_result, last_assessed_at, next_review_at, misconceptions JSON, book_version, updated_at, PK(user_id,book_id,concept_id))` + index `(user_id, next_review_at)`.
Concurrency: events are append-only and idempotent; `concept_state` is recomputed from that concept's events (tens of rows) after each write and again on read when stale, so two simultaneous conversations converge.

### Content versioning
Concept id = `<book id>:<heading number>` (e.g. `stats:1.3`, `stats:1.1.2.1`), the book's own labels, already validated by the exporter. Every result carries `book_version` (`3.1`). If a future version renumbers headings, the export writes an alias map (`old → new`) into `concepts.json`, and events keep the version they were made under.

---

## E. Minimum viable prototype

- **Book / chapter:** Statistics, **Chapter 1**. Concepts: `stats:1.2` Population vs Sample, `stats:1.3` Parameter vs Statistic, `stats:1.1.1` Qualitative vs Quantitative Data, `stats:1.5` Study Designs (has **Figure 1.1**, `ch01-designs.png`). All have checkpoint questions with model answers.
- **Users:** you only (email allowlist), production site behind `TUTOR_ENABLED`.
- **Scripted acceptance walk (Android, voice mode, your intended plan):**
  1. "Teach me parameter versus statistic." → Claude calls `get_study_status`, `find_concepts`, `get_concept`; it explains in short turns using the book's birthweight example and asks a question.
  2. You interrupt mid-explanation with a follow-up; it answers from the book and returns.
  3. It asks Checkpoint 1.3 Q7 and one "apply" question, judges your answers, calls `record_assessment` → server replies "Secure, next review in N days".
  4. "Show me the study-design figure." → `show_figure` → Figure 1.1 visible (by whichever channel the spike proved), or an honest link.
  5. New conversation, next day: "Let's continue." → `get_study_status` returns last concept + due review; it quizzes the due item first.
  6. On the website `/account/`: the tutor record is visible; the connection can be disconnected; a disconnected connector gets "please reconnect".
- Out of scope for the MVP: Excel export, other chapters, Obesity books, reader-Review integration, directory listing.

---

## F. Phased implementation plan

Effort = Claude's build time plus your review/testing; it is not calendar time.

### Milestone 0: Feasibility spike (go/no-go). ~1–2 days + one test walk
- **Goal:** answer the six [Test] questions in §B before writing real code.
- **Files:** a throwaway branch only. `src/server/mcp-spike.ts` and a route under `/api/mcp-spike` on a **Preview** deployment (own D1), **authless**, with 4 tools: `get_concept` (hard-coded `stats:1.3` text), `show_figure` (Figure 1.1 as image content + MCP App + link), `save_note` (writes one row in a preview-only table), `list_notes`.
- **Tasks:** deploy preview → add as your one custom connector on claude.ai web → in text mode set `save_note` to Always allow → on Android, voice mode: run the scripted calls; screen on, then screen locked; note latency, prompts, what appears on screen. Repeat on desktop/web for comparison. Measure figure PNG sizes (base64 must stay well under 150k characters).
- **Stage B (½ day):** add the real OAuth flow on preview against the preview D1 (needs the preview URL added as a redirect URI in Google Cloud Console; that step is yours) to test linking from claude.ai and use from Android.
- **Acceptance:** written results table (pass/fail/screenshots) appended to this doc. **Go** if the read and write tools both work in Android voice and at least one figure channel is visible (a link counts as a minimum).
- **Cost:** ₹0. **Rollback:** delete the branch; the preview D1 table is discarded; remove the connector in Claude.

### Milestone 1: Content layer + concept index. ~2 days
- **Goal:** exact, versioned concept retrieval, independent of MCP.
- **Files:** new `src/lib/concepts.ts` (extract concepts from section JSON: headings → concept blocks, `<strong>` terms, `data-sec` relations, figures); new static route `src/pages/doctors/books/[slug]/concepts.json.ts`; `src/server/tutor/content.ts` (`findConcepts`, `getConcept`, `getFigure`, HTML→speakable plain text keeping the exact words).
- **Tests:** `tests/tutor-content.test.mjs`: every Chapter 1 concept found; text equals source text (word-for-word after tag stripping); every figure id resolves; search "parameter versus statistic" → `stats:1.3` first; `tests/site.test.mjs` unaffected.
- **Acceptance:** `npm run build && npm test` green; no change to any page.
- **Cost:** ₹0; a few KB of extra static JSON. **Rollback:** revert; nothing reads it yet.

### Milestone 2: OAuth server + account linking. ~3–4 days (the security-critical part)
- **Files:** `src/server/oauth.ts` (metadata, register, authorize + consent page, token, revoke); `src/server/schema.ts` (migration 5: oauth tables); `src/server/api.ts` (routes; `sameOrigin` exemptions); static `public/.well-known/oauth-protected-resource/api/mcp` and `public/.well-known/oauth-authorization-server/api/oauth` (+ `public/_headers` content-type rules); `src/pages/account.astro` (Connected assistants + Disconnect); `src/pages/privacy.astro#accounts` (new paragraph).
- **Tests (extend `tests/api.test.mjs` pattern):** full DCR → authorize (signed-out → Google → consent) → token → refresh rotation; PKCE mismatch, reused code, reused refresh token (grant revoked), wrong redirect URI, expired code, wrong `resource`, revoked grant → 401; account delete cascades grants; MCP Inspector against preview.
- **Acceptance:** Claude web links the account on preview; Disconnect works; tests green.
- **Dependencies:** M0 pass. Google console redirect for preview (you).
- **Cost:** ₹0 (D1 rows only). **Rollback:** migration tables are inert if routes are removed; `TUTOR_ENABLED` off hides everything.

### Milestone 3: MCP server with read tools. ~2 days
- **Files:** `src/server/mcp.ts` (`createMcpHandler`, Bearer verification → `authInfo`, 4 read tools, tutor rules text `src/server/tutor/rules.md` imported as a string, rate-limit binding); `wrangler.jsonc` (rate-limit binding, `TUTOR_ENABLED`, `TUTOR_ALLOWLIST`, in both production and `previews`); `package.json` (`agents`, `@modelcontextprotocol/server`, `zod`: verify versions and bundle size against the 3 MB free Worker limit, or hand-write the stateless JSON-RPC if they are heavy).
- **Tests:** tools/list annotations present; each tool with good/bad inputs; 401 without token carries `WWW-Authenticate … resource_metadata`; figure result under size limit; rate limit returns a clean error.
- **Acceptance:** text-mode lesson on Claude web and Android voice lesson on preview read the right concept and show the figure.
- **Cost:** ₹0. **Rollback:** flag off / revert route.

### Milestone 4: Progress, mastery, spaced repetition. ~2–3 days
- **Files:** `src/server/tutor/progress.ts` (`recordAssessment`, `studyStatus`), `src/server/tutor/mastery.ts` (levels + FSRS reuse from `ts-fsrs` with the same settings as `src/trainers/core/schedule.ts`); migration 5 tables `tutor_events`, `concept_state` (or migration 6 if 5 shipped); `record_assessment` + real `get_study_status` in `mcp.ts`.
- **Tests:** mastery table-driven tests (one correct → not Secure; two kinds incl. apply → Secure; delayed retrieval ≥3 days → Mastered; incorrect review → Developing); idempotent duplicate; user A can't read/write user B (two tokens); concurrent writes converge; daily cap; D1 query plans use the indexes.
- **Acceptance:** §E scripted walk passes end-to-end on production with you allowlisted.
- **Cost:** ₹0; ~6 D1 row writes per assessment. **Rollback:** flag off; data retained, harmless.

### Milestone 5: Your record on the website + export. ~2 days
- **Files:** `GET /api/tutor/export` (cookie auth, own data), `src/pages/account.astro` or a small `/doctors/tutor/` page: concepts table (mastery, last/next review, misconceptions), "Download .xlsx" built in the browser (small client-side writer, lazy-loaded only on click), privacy text.
- **Tests:** export contains only the caller's rows; xlsx opens (e2e download check).
- **Cost:** ₹0. **Rollback:** remove page/endpoint.

### Milestone 6: Extend (only after you have used it for 2–3 weeks)
Whole Statistics book (the concept index already covers it; the work is reviewing tutor quality on harder chapters such as derivations and R blocks, which are excluded or summarised by voice); Obesity Expertise concept extractor (concept = section; `practice`/`exercise` as questions); optional checkpoint answers into reader `attempts`; open to all signed-in users (remove allowlist) after a privacy-page update; optional CIMD; optional directory listing.

---

## G. Testing plan

| Area | Tests |
|---|---|
| Functional | Unit tests per tool function; `npm test` on every change; MCP Inspector session on preview |
| Source fidelity | Automated: `get_concept` text equals exported text word-for-word; every `figure_id` exists on R2. Manual rubric over 10 recorded lessons: no invented claim, quotes match the book, terminology ("statistic", "parameter", Greek vs Roman letters) as the book uses it, "not in the book" said when it should be |
| Voice interaction (Android, real device, **your intended plan; Free first**) | Start a lesson by voice; interrupt mid-sentence; ask an off-book question; change topic and return; answer wrongly on purpose (does it adapt and record "incorrect"?); noisy street; screen locked; poor network (tool timeout behaviour); lesson length until Free limit |
| Image display | Each channel (image result / MCP App / link) in text mode and voice mode, Android + web; model never claims a figure it didn't receive |
| Authentication | DCR, consent, Google sign-in inside the OAuth window, refresh after 1 h idle (a walk), reconnect after revoke |
| Authorization | Token for user A cannot read/write B (no id parameter exists; prove queries are bound); expired/revoked tokens; scope/audience checks; cookie alone cannot call `/api/mcp` |
| Concurrency / persistence | Same concept saved from two conversations at once; duplicate retry stored once; new conversation resumes from D1 only (fresh chat, no memory) |
| Security | Oversized/malformed inputs, HTML/script in answer summaries, unknown ids, 1,000 rapid calls (rate limit), open-redirect attempts on `/authorize`, unregistered redirect URI, refresh-token reuse, account deletion leaves no rows |
| Free-plan budget | Count Worker requests and D1 row reads/writes per lesson (observability is on); confirm a lesson stays well under 1% of daily limits |

---

## H. Risks and fallbacks

| Risk | Likelihood | Mitigation / fallback |
|---|---|---|
| Custom connector tools don't fire in Android voice | Medium (undocumented) | M0 finds out in a day. Fallback A: start the lesson in **text** (tools load the concept), then switch to voice in the same conversation (voice "works in any conversation"); save by voice or by text at the end. Fallback B: own voice client (below). |
| Write tool needs an on-screen approval mid-walk | Medium | Pre-set "Always allow"; `destructiveHint:false`; batch to one save per concept; if still prompting, save at the end of a walk |
| Figure not visible in voice | Medium-high ("not every result can be shown on screen") | Link always included; tutor says so honestly; review figures later in the website reader (already excellent) |
| Free-plan limits too small for a 60–90 min walk | Medium | Keep tool results small (one concept, not a section), few tool calls; test the real duration; else a paid Claude plan for you (user-side cost, not infrastructure) |
| Anthropic changes Free connector/voice rules (beta) | Medium over a year | The tutor core is plain functions; MCP is a thin adapter |
| Model grades answers wrongly | Medium | Model answers supplied; mastery needs ≥2 kinds + delayed retrieval; events are auditable on your record page |
| Model invents textbook claims | Low-medium | Rules + exact text + source links; fidelity rubric in testing; tool results contain only one concept so there is less to confuse |
| OAuth bugs (security) | Medium (new code) | Small surface, redirect allowlist, hashed tokens, tests for every failure path, allowlisted users during POC, `TUTOR_ENABLED` kill switch |
| D1 free cap exhausted (breaks sign-in for everyone) | Low | Per-user daily caps, rate-limit binding, indexes, small writes |
| Worker bundle exceeds free 3 MB | Low-medium | Content served via `ASSETS`, not bundled; check SDK size in M3; hand-written stateless JSON-RPC as fallback |
| Vendor lock-in | — | Content index, OAuth server and progress DB are ours and standard (OAuth 2.1, MCP). A ChatGPT adapter is the same server (read-only on personal plans today) |

**If the preferred approach fails outright:** the fallback with no platform restriction is **our own voice PWA** at `/doctors/tutor/`: phone microphone → a real-time voice model with function calling (e.g. Gemini Live API, about $0.023/min at the checked price; cheaper "mini" models exist) → **the same five tool functions** called server-side → figures rendered by our page, so display is guaranteed. Cost to you: about ₹60 per 30-minute walk at that price, plus the "parked AI" preconditions already in `docs/book-reader-plan.md` (sign-in, per-person daily cap, monthly budget switch). Effort: about 2–3 weeks more. Use it only if M0 fails or Free limits make the consumer route unusable.

---

## I. Decisions that need you

1. **Go ahead with Milestone 0 (spike)?** No production changes; a preview branch; about a day of build plus one walk of yours.
2. **Which Claude plan will you test with: Free or a paid plan?** Free uses your **one** custom-connector slot for this site. The spike answers how long a Free voice lesson lasts.
3. **Proof-of-concept access:** only you (email allowlist, recommended), or any signed-in visitor from the start?
4. **Storing short answer summaries** (≤200 characters, e.g. "confused x̄ with μ") in addition to right/wrong, to track misconceptions. Recommended yes; the privacy page would say so.
5. **Mastery rule and tutor rules:** approve the 0–4 scale above (Secure = 2 correct answers of different kinds incl. one explain/apply; Mastered = correct again ≥3 days later), and review the tutor rules text in M3. It is teaching content, so it is yours to approve.
6. **Chapter for the prototype:** Chapter 1 concepts listed in §E (recommended; it has Figure 1.1), unless you would rather walk with a chapter you are currently studying.

Things I will do without asking (reasoned defaults): DCR first, CIMD later; hand-written OAuth on D1 instead of the KV-based library; stateless MCP inside `/api/`; FSRS reuse; Excel built in the browser; no new Cloudflare products beyond a rate-limit binding.

---

## Milestone 0: spike as built (10 Oct 2026) and Harsh's test script

**Built:** `src/server/mcp-spike.ts` (hand-written stateless MCP server, no new packages), routed at `/api/mcp-spike` in
`src/server/api.ts`, switched on only by `MCP_SPIKE = "on"` in `wrangler.jsonc → previews.vars` (production returns 404).
No sign-in (stage A). Tests: `tests/mcp-spike.test.mjs` (in `npm test`).

| Tool | Kind | What it tests |
|---|---|---|
| `get_concept` | read | Any Chapter 1 concept (`stats:1.1` … `stats:1.6`, and headings like `stats:1.1.2.1`): exact book text, checkpoint questions, answer key, tutor rules |
| `show_figure` | read | Figure 1.1 as an **image** in the tool result (+ caption + link); reports its size |
| `open_figure_viewer` | read | Figure 1.1 in an **MCP App** viewer (pinned `@modelcontextprotocol/ext-apps@1.7.5` from unpkg) |
| `save_note` | **write** | Saves a judgement to the preview database (table `spike_notes`, max 500 rows) |
| `list_notes` | read | Reads the notes back: tests "continue in a new conversation" |

### Setup (once, on a computer)
1. Find the Preview URL of branch `claude/gracious-bardeen-o5bk5m` (Cloudflare dashboard → Workers → drharshmaheshwari → Deployments, or the Cloudflare check on the GitHub commit). The connector URL is `<preview URL>/api/mcp-spike`.
2. claude.ai → Settings → Connectors → **Add custom connector** → name "DrHM books (test)", URL as above, no OAuth fields.
3. In a new **text** chat on claude.ai, turn the connector on and say: *"Use get_concept for stats:1.3 and tell me the first sentence."* Approve the tool. Then open the connector's tool settings and set **save_note** (and the others) to **Always allow**.

### On the Android phone (voice mode)
| # | Say / do | Record |
|---|---|---|
| 1 | Open Claude, check the connector is on, start **voice mode**. "Teach me parameter versus statistic from Dr Harsh's book." | Did it call `get_concept`? Any prompt on screen? Delay? |
| 2 | Interrupt mid-explanation: "Wait, why Greek letters?" | Did it stop and answer from the book? |
| 3 | Answer its questions, one deliberately wrong. | Did it judge correctly against the answer key? |
| 4 | "Save how I did." (or it saves itself) | Did `save_note` run in voice? Any approval prompt? |
| 5 | "Show me the study-design figure." (it should call `show_figure`) | Was the **image visible** on screen during voice? |
| 6 | "Open it in the viewer." (`open_figure_viewer`) | Did the **viewer** appear? Permission prompt? |
| 7 | Lock the screen / phone in pocket and keep talking for 2 minutes, ask for one more tool call. | Did voice and tools continue? |
| 8 | End. Start a **new** conversation in voice: "What did we study last time?" (`list_notes`) | Did it read back the saved note? |
| 9 | Optional: a 20–30 min walk lesson. | Any usage-limit message? When? |

Send screenshots (or just pass/fail per row). **Go to Milestone 1** if rows 1, 4 and 8 pass and at least one of row 5, row 6 or the link shows the figure.

### Results
_(to be filled in after the test walk)_
