# Trackers (BP and blood sugar): plan and settled decisions

Status: **built on branch `claude/modest-newton-4q0s6e`, not yet on `main`.** Agreed with Harsh on 11 Oct 2026. Clinical wording and cut-offs: Harsh reviews before `main`.

A place where a signed-in person logs blood pressure and blood sugar readings for themselves and adult family members,
sees them over time, gets an urgent alert for dangerous values, and shares a live read-only link with their doctor.

## Settled decisions

| Question | Decision |
|---|---|
| Sign-in | Google sign-in is required to save anything (same accounts as trainers and reader). Before sign-in the page explains the tracker and shows a sample chart. |
| Whose data | The account holder plus **adult family members** (several "people" per account). |
| Age | **18+ only.** Birth month/year that makes the person under 18 is refused with a short reason (children's BP needs height percentiles; DPDP Act needs parental consent). |
| Interpretation | **Log + urgent alerts only.** No "you have hypertension/diabetes" labels. |
| Alerts | A **soft alert on the patient's own screen only** (Harsh, 11 Oct 2026): a calm coloured note under the saved reading. Never sent to anyone else (no message, email, WhatsApp, notification), and no beeps, sounds, vibration or pop-ups. Not shown on the doctor share view. |
| Chart lines | **Keep faint, unlabelled reference lines** on the charts. |
| For Doctors | Trackers is **not** listed under For Doctors. A doctor sees readings only through a patient's share link. |
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

## Urgent alerts (sources opened 11 Oct 2026; numbers approved by Harsh 11 Oct 2026; final wording reviewed before `main`)

| Reading | Proposed alert | Basis |
|---|---|---|
| SBP ≥ 180 or DBP ≥ 110 (clinic or home) | "Very high reading. Sit quietly and measure again after 1-2 minutes. If it stays this high, contact your doctor today. If you have chest pain, breathlessness, back pain, weakness or numbness, a change in vision, or trouble speaking, go to a hospital now." | IGH-V 2025-26 "Severe ≥180 or ≥110"; ESH 2023 grade 3; MoHFW STG 2016 urgency >180/>110. Retest wait and symptom list: AHA patient page (no Indian patient-facing list found). |
| Low BP | **No alert** (Harsh, 11 Oct 2026). No guideline gives a home low-BP alert number. | — |
| Glucose < 70 mg/dL (lab or glucometer) | "Low sugar. Take 15 g of fast-acting sugar now (15 g glucose powder, or 4 teaspoons of sugar in water) and measure again after 15 minutes; repeat if still below 70. If the person is drowsy or confused, do not give anything by mouth: get help now." Below 54: same, marked "severely low". | ADA 2026 Table 6.4 (level 1 <70, level 2 <54), 15 g + recheck 15 min; RSSDI 2022 alert value <70, 15-20 g; RSSDI 2024 monitoring consensus 15 g / 15 min. ICMR 2018 gives no number. |
| Glucose ≥ 300 mg/dL | "Very high sugar. Contact your doctor today. Go to a hospital now if there is vomiting, stomach pain, fast breathing, drowsiness or confusion." | No single Indian number. CDC: stays ≥300 → emergency; RSSDI 2022 (COVID chapter) severe >300 pre-meal. ICMR 2018: ketones if >400; ADA 2026: ketones with illness if >200. |
| HbA1c | No alert (not an acute measure). | — |

Chart reference lines (faint, unlabelled): BP clinic 140/90 and home 135/85 (IGH-IV 2019, IGH-V 2025-26, ESH 2023);
FBS 126 mg/dL and HbA1c 6.5 % (ICMR 2018, RSSDI 2022, ADA 2026). No line on PPBS (a meal is not the 75 g OGTT) or RBS.

Sources opened:
- Indian Hypertension Guideline V 2025-2026. J Assoc Physicians India 2026;74(5) (japi.org).
- Indian Guidelines on Hypertension IV (2019), abridged: J Hum Hypertens 2020;34:745-58. doi:10.1038/s41371-020-0349-x (PMID 32427886).
- MoHFW Standard Treatment Guidelines: Hypertension, May 2016.
- ESH 2023: Mancia G et al. J Hypertens 2023. doi:10.1097/HJH.0000000000003480 (PMID 37345492).
- ISH 2020: Unger T et al. Hypertension 2020. doi:10.1161/HYPERTENSIONAHA.120.15026 (PMID 32370572).
- AHA/ACC 2025: Jones DW et al. Hypertension 2025;82:e212-e316. doi:10.1161/HYP.0000000000000249 (PMID 40811516).
- AHA patient page "When to call 911 about high blood pressure", reviewed 6 May 2024.
- ICMR Guidelines for Management of Type 2 Diabetes 2018; ICMR/DHR Standard Treatment Workflow, Diabetes Mellitus Type 2 (2024).
- RSSDI Clinical Practice Recommendations 2022 (official summary); RSSDI 2024 expert consensus on glucose monitoring.
- ADA Standards of Care 2026, Section 2 (doi:10.2337/dc26-S002, PMID 41358893) and Section 6 (doi:10.2337/dc26-S006, PMID 41358894).
- Hyperglycaemic crises consensus: Umpierrez GE et al. Diabetes Care 2024;47:1257. doi:10.2337/dci24-0032 (PMID 39052901).
- CDC "Treatment of Low Blood Sugar" and "Diabetic Ketoacidosis" (2024).

How the BP alert is applied: if the first reading of a sitting is at or above 180/110, the form asks for a second reading
1-2 minutes later; the alert stays only if the sitting's average is still at or above the line.

The alert appears only on the patient's screen: a soft note under the reading when it is saved, and a small mark beside that
reading in the patient's own list and chart. Nothing is sent anywhere, and there are no pop-ups, sounds, vibration or notifications.
The doctor share view shows the readings but not the alert notes or marks.

## Doctor share link (live)

- From a person's page: **Share with my doctor** → a link like `https://drharshmaheshwari.com/trackers/view/#<token>`
  plus a QR code to show in the clinic and a "Copy link" / WhatsApp button.
- **Live**: the doctor's page fetches the current readings each time it is opened (and has a Refresh button), so the same
  link always shows the latest data. No sign-in for the doctor.
- Shows: label, age, sex, height/BMI, the optional history answers; BP chart (clinic and home in different marks), home
  average of the last 7 days, latest clinic reading; sugar charts per test; latest HbA1c; list of all readings (no alert notes);
  "last reading added on ...". Printable (print stylesheet).
- Holder chooses for each link: which person (one person per link), what it includes (BP / sugar / weight), and how long it
  lasts (**30 days / 90 days (default) / until I stop it**). Holder sees each link's last-opened time and can **stop** it
  at once; a new link can be made any time.
- Security:
  - Token: 192-bit random (32 characters). It sits after `#`, so it is never in server logs, analytics or the Referer
    header; the static page sends it to `/api/trackers/shared` in a request header.
  - The token is stored as it is (not hashed, unlike session cookies), so the owner can copy the link or show its QR code
    again at the next visit. Hashing would protect nothing here: the readings a token opens sit in the same database.
  - A person called "Me" is shown to the doctor as "Patient"; month of birth and account details are never sent.
  - Read-only; responses `Cache-Control: no-store`; page `noindex`, `Referrer-Policy: no-referrer`.
  - The page says plainly: "Anyone with this link can see these readings until you stop it."
  - Optional later: a 4-digit PIN on the link (parked).
- Cost: one request and one indexed read of that person's last 12 months per opening (older data: "Show older").

## Storage and sync (D1 migration 5; never edit shipped migrations)

- `tracker_people` (user_id, id, data json, updated_at, deleted_at, received_at).
- `tracker_readings` (user_id, id, person_id, kind `bp|sugar|weight`, at (UTC ms), data json, updated_at, deleted_at,
  received_at). Indexes `(user_id, received_at)` (delta sync) and `(user_id, person_id, at)` (doctor view).
  HbA1c is a sugar reading with test `hba1c`. The JSON shapes and their checks are in `src/lib/trackers.ts` (server and browser).
- `tracker_shares` (token, id, user_id, person_id, scope json, created_at, expires_at, stopped_at, opened_at).
- Sync like highlights: client ids, newest `updated` wins, deletes kept as `deleted`, delta download `?since=`, batched
  outbox upload. All through `TrackerStore` (`src/trackers/store.ts`, browser copy `tracker:v1`, cleared on sign-out);
  the pages never touch localStorage directly. Limits: 20 people, 20,000 readings, 10 live links per person.
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

## Still open

Nothing. Build in this order: D1 migration and API, store and sync, pages, doctor view, privacy and account deletion, tests.
