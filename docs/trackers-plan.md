# Trackers (BP and blood sugar): plan and settled decisions

Status: **planning, not built.** Agreed with Harsh on 11 Oct 2026. Clinical wording and cut-offs: Harsh reviews before `main`.

A place where a signed-in person logs blood pressure and blood sugar readings for themselves and adult family members,
sees them over time, gets an urgent alert for dangerous values, and shares a live read-only link with their doctor.

## Settled decisions

| Question | Decision |
|---|---|
| Sign-in | Google sign-in is required to save anything (same accounts as trainers and reader). Before sign-in the page explains the tracker and shows a sample chart. |
| Whose data | The account holder plus **adult family members** (several "people" per account). |
| Age | **18+ only.** Birth month/year that makes the person under 18 is refused with a short reason (children's BP needs height percentiles; DPDP Act needs parental consent). |
| Interpretation | **Log + urgent alerts only.** No "you have hypertension/diabetes" labels. Charts may show faint reference lines. |
| Menu | New top-level **Trackers** item in the For Everyone menu (`src/lib/modes.ts`), URL `/trackers/` (permanent). |
| Doctor sharing | **In version 1**: a live, read-only link that always shows the latest readings (details below). |
| Parked for later | Medicines log, reminders, other markers (lipids, creatinine, TSH ...), pregnancy/GDM, children. No UI or code for them now. |

## The person ("Who is this for?", entered once, editable)

- Label (e.g. "Me", "Papa"); free text, shown only to the account holder and on that person's share link.
- Month and year of birth (age is computed; must be 18+).
- Sex: male / female.
- Height (cm), optional.
- Optional: known high BP? known diabetes? on medicines for either? (yes / no / not sure). Shown on the doctor view; not used for any label.
- Adding someone other than "Me": a tick box "This person has agreed that I keep their readings here" (they are adults, so the consent is theirs).

## Readings

Every reading: date and time (default now, India time, editable; future times refused), optional note, client-made id.

**Blood pressure**
- SBP, DBP (mmHg), pulse optional.
- Where measured: **Doctor's clinic** / **Home or work**.
- One sitting may hold 1-3 readings; the sitting's value is their average (all readings kept). The form teaches the method
  (seated, 5 min rest, arm at heart level, 2 readings 1 min apart).
- Sanity range: SBP 60-280, DBP 30-180, SBP > DBP; outside asks "please check".

**Blood sugar**
- Test: FBS / PPBS (2 h after the start of a meal) / RBS / HbA1c.
- Sample: **Lab (blood from a vein)** / **Glucometer (finger-prick)**. HbA1c is lab only.
- Unit: mg/dL (default) or mmol/L (stored as mg/dL; 1 mmol/L = 18.016 mg/dL). HbA1c in %.
- HbA1c: date required, time optional.
- Sanity range: glucose 20-600 mg/dL, HbA1c 3-20 %.

**Weight** (optional, its own series, so a BMI trend comes from `src/lib/bmi.ts` with the person's height).

## Urgent alerts (proposed; Harsh to confirm each number and wording; sources to be opened before build)

| Reading | Message |
|---|---|
| SBP ≥ 180 or DBP ≥ 110 (any setting) | "This reading is very high. Sit quietly for 5 minutes and measure again. If it is still this high, or you have chest pain, breathlessness, severe headache, weakness, or trouble seeing or speaking, go to a hospital now." |
| SBP < 90 with dizziness? (needs decision: alert on number alone or not at all) | to decide |
| Glucose < 70 mg/dL | "Low sugar. Take 15 g of fast sugar now (e.g. 3 teaspoons of sugar in water) and recheck in 15 minutes. If confused or drowsy, get help now." |
| Glucose ≥ 300 mg/dL | "Very high sugar. Contact your doctor today. Go to a hospital now if vomiting, drowsy or breathing fast." |

Sources to check: Indian Guidelines on Hypertension IV (2019); ESH 2023; ISH 2020; ICMR Guidelines for Management of Type 2
Diabetes (2018); RSSDI clinical practice recommendations; ADA Standards of Care (hypoglycaemia levels <70 and <54 mg/dL).
Faint chart reference lines (no labels): clinic 140/90, home 135/85; FBS 126, HbA1c 6.5 % (India first: Indian guideline values
if they differ).

Alerts are shown on save and marked on the chart. Never pop-ups, sounds or emails.

## Doctor share link (live)

- From a person's page: **Share with my doctor** → a link like `https://drharshmaheshwari.com/trackers/view/#<token>`
  plus a QR code to show in the clinic and a "Copy link" / WhatsApp button.
- **Live**: the doctor's page fetches the current readings each time it is opened (and has a Refresh button), so the same
  link always shows the latest data. No sign-in for the doctor.
- Shows: label, age, sex, height/BMI, the optional history answers; BP chart (clinic and home in different marks), home
  average of the last 7 days, latest clinic reading; sugar charts per test; latest HbA1c; list of all readings; alerts marked;
  "last reading added on ...". Printable (print stylesheet).
- Holder chooses for each link: which person (one person per link), what it includes (BP / sugar / weight), and how long it
  lasts (**30 days / 90 days (default) / until I stop it**). Holder sees each link's last-opened time and can **stop** it
  at once; a new link can be made any time.
- Security:
  - Token: 128-bit random, only its SHA-256 hash stored (like session cookies). It sits after `#`, so it is never in server
    logs, analytics or the Referer header; the static page sends it to `/api/trackers/shared` in a request header.
  - Read-only; responses `Cache-Control: no-store`; page `noindex`, `Referrer-Policy: no-referrer`.
  - The page says plainly: "Anyone with this link can see these readings until you stop it."
  - Optional later: a 4-digit PIN on the link (parked).
- Cost: one request and one indexed read of that person's last 12 months per opening (older data: "Show older").

## Storage and sync (D1 migration 5; never edit shipped migrations)

- `tracked_people` (id, user_id, label, birth_ym, sex, height_cm, history json, consent_at, created/updated/deleted, received_at).
- `measurements` (id, user_id, person_id, kind `bp|glucose|hba1c|weight`, values json, setting/sample, measured_at (UTC ms)
  + tz offset, note, created/updated/deleted, received_at). Indexes `(user_id, received_at)` and `(person_id, measured_at)`.
- `share_links` (token_hash, user_id, person_id, scope, expires_at, revoked_at, last_opened_at, created_at).
- Sync like highlights: client ids, newest `updated` wins, deletes kept as `deleted`, delta download `?since=`, batched
  outbox upload. Store behind a `TrackerStore` (`SyncedTrackerStore`), the UI never touches localStorage directly.
- Free-plan budget: a person adds a few readings a day; far below the reader's load. No per-keystroke requests.

## Pages

- `/trackers/` list of people (+ Add person). Signed out: explanation, sample chart, Sign in.
- `/trackers/person/#<id>` (one static page, person chosen in the hash): Add BP / Add sugar / Add weight, charts, list, edit/delete, Share, Export CSV.
- `/trackers/view/#<token>` doctor's live view.
- `/account/`: deleting the account deletes people, readings and share links (share links stop at once).
- `/privacy/#trackers`: what is stored, who can see it (only you and anyone you give a link), how to stop a link, delete, export.
- Footer and back button as usual; the menu gets **Trackers**.

## Tests (when built)

- Engine (`src/lib/trackers.ts`): averages, unit conversion, age 18+ check, alert boundaries (179/180, 109/110, 69/70, 299/300).
- API: owner-only access, share token works, expired and stopped links refuse, deleted account removes everything, idempotent uploads.
- e2e: 390 px and desktop, 4.5:1 contrast in both modes, no horizontal overflow.

## Still open (Harsh)

1. Confirm the alert numbers and wording above (and whether to alert on low BP).
2. Reference lines on charts: keep (faint, unlabelled) or none?
3. List Trackers under For Doctors > Tools too? (Suggestion: no; doctor view is reached only by a patient's link.)
