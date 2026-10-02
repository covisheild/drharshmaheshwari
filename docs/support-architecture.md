# Support, purchases and entitlements: architecture

Status: **design only.** `/support/` exists with payments switched off (`PAYMENTS_ENABLED = false` in
`src/lib/support.ts`). No payment provider, API credentials, webhooks, D1 tables or recurring mandates exist.
Provider research below was gathered on 2 October 2026; re-check every figure before signing up.

## 1. Three concepts that never mix

| Concept | What it is | What it grants |
|---|---|---|
| **Contribution** | Voluntary support of the project: one-time or recurring | Nothing. No access, no feature, no advice |
| **Purchase** (future) | Payment for a named, priced product, e.g. "ECG Trainer Pro" | Whatever the product's entitlement rule says |
| **Entitlement** (future) | A user's right to use a feature, from a purchase or a manual grant | Access, checked with `hasEntitlement(user, 'ecg-pro')` |

- Contributions and purchases are different tables, different code paths and different UI. A contribution
  never creates an entitlement as a side effect.
- A supporter perk, if ever wanted, is an explicit product decision written down as a rule
  ("grant `supporter-badge` to …"), implemented in the entitlement service, not in payment code.
- Application code asks only `hasEntitlement(key)`. It never looks at amounts, providers or payment status.

## 2. Product rules for `/support/`

- Shared page at `/support/` (root, like `/about/`), linked from the footer in both modes and by one quiet
  line at the end of trainer pages and book pages. No banners, pop-ups, countdowns, urgency or guilt.
- Exact title "Support this project"; subheading "Help keep this project free and support its continued
  development." Words: *support*, *contribution*. Never *donation* or *charity* in the product UI.
- One-time: ₹100, ₹250, ₹500, custom (₹10–₹50,000). Button states the action: "Support with ₹250".
- Recurring: ₹20/week ("One coffee a week"), ₹50/week, ₹100/month, ₹250/month, custom (₹20–₹5,000) with
  weekly/monthly. The yearly total is always shown: weekly ×52 as "≈" (a year is slightly over 52 weeks),
  monthly ×12 as "=". Nothing recurring is ever pre-selected; recurring requires an explicit authorisation
  checkbox naming the amount and frequency.
- No account needed. Email only for the receipt and (recurring) the manage/cancel link.
- No consumer refund policy on the page. Cancelling stops future payments. Exceptional corrections
  (duplicate charge, unauthorised transaction, processing error, accidental recurring charge, provider
  dispute, admin error) are handled on request through the contact address; successful contributions
  otherwise stay recorded as completed.
- No public supporters list in the first version.
- INR and Indian payment methods only. No foreign contributions at this stage.

## 3. Payment architecture (to build at activation)

```
Browser ── POST /api/support/intents ──► Worker API ── PaymentProvider adapter ──► provider
   │          (amount, kind, email)        │ D1: supporter, contribution/mandate = created
   │◄────────── checkout parameters ───────┘
   ├──► provider checkout (UPI app / card authentication)
   └──► /support/thanks/?ref=<random>  shows "Confirming…", polls GET /api/support/status/<ref>

provider ── webhook ──► POST /api/payments/webhook/<provider>
                         verify signature → store raw event (unique per provider event id) → 200
                         → idempotent handler → allowed state transition → D1 → receipt email
cron (daily) ── reconcile: provider payments/mandates/refunds since T−3 days vs D1 → fix gaps, report
```

- **The browser never declares success.** The return URL only prompts the server to ask the provider
  (`fetchPayment`). A payment is `succeeded` only from a signature-verified webhook or a server-to-server fetch.
- Same Cloudflare Worker, a few on-demand API routes (`prerender = false`); every page stays static.
- Code layout (no provider names outside `providers/`):
  - `src/server/payments/domain/`: types and state machines in our vocabulary
  - `src/server/payments/providers/`: `PaymentProvider` interface + one adapter per provider
  - `src/server/payments/services/`: create intent, handle event, cancel, correct/reverse, reconcile
  - `src/server/payments/repo/`: D1 queries
  - `src/pages/api/...`: thin routes

```ts
interface PaymentProvider {
  readonly id: string;                                            // 'razorpay' | 'cashfree' | ...
  createOneTimePayment(i: { amountPaise: number; ref: string; customer: CustomerRef }): Promise<CheckoutParams>;
  createRecurringMandate(i: { amountPaise: number; interval: 'week' | 'month'; ref: string; customer: CustomerRef }): Promise<CheckoutParams>;
  cancelMandate(providerMandateId: string): Promise<void>;
  fetchPayment(providerPaymentId: string): Promise<NormalizedPayment>;
  fetchMandate(providerMandateId: string): Promise<NormalizedMandate>;
  verifyWebhook(req: Request, secret: string): Promise<NormalizedEvent[]>;   // throws on bad signature
  reverse(i: { providerPaymentId: string; amountPaise: number; reason: CorrectionReason }): Promise<NormalizedReversal>;
  listSince(t: Date): Promise<{ payments: NormalizedPayment[]; mandates: NormalizedMandate[]; reversals: NormalizedReversal[] }>;
}
```

Normalised events: `payment.succeeded`, `payment.failed`, `mandate.authorized`, `mandate.active`,
`mandate.paused`, `mandate.resumed`, `mandate.halted`, `mandate.cancelled`, `mandate.completed`,
`charge.succeeded`, `charge.failed`, `reversal.processed`, `dispute.opened`, `dispute.closed`.

Adapters call provider REST APIs with `fetch` and verify webhook HMACs with Web Crypto
(`crypto.subtle`), so they run in Workers without Node SDKs.

### State machines

- **Contribution (one-time):** `created → pending → succeeded | failed | expired` (unpaid after 24 h);
  `succeeded → corrected` (full or partial reversal) only through the correction flow.
- **Mandate:** `created → pending_authorization → active ⇄ paused → active`; `active → halted` (provider
  retries exhausted) `→ active` (re-authorised) or `cancelled`; any → `cancelled`; `→ completed` (end date).
  `cancelled_by`: supporter | provider | bank_or_upi_app | admin.
- **Recurring charge:** each successful collection is its own contribution (`kind = recurring`,
  `mandate_id`, `period_start`). Attempts are payment rows; failures keep their failure code.

### Cases

| Case | Handling |
|---|---|
| Weekly / monthly | Provider-managed schedule (subscription/plan) rather than charging ourselves; the provider sends the pre-debit notice |
| Custom amounts | Validated server-side; whole paise; recurring kept far below the ₹15,000 no-AFA limit |
| Cancellation | Manage link (single-use, hashed, expiring token; re-request by email without revealing whether the email exists) → provider `cancelMandate` → webhook confirms. Cancellation in the UPI app or bank arrives as a webhook |
| Failed recurring payment | Provider retries within its rules; after it halts, one email with a re-authorise link, then nothing |
| Exceptional correction | Admin-only, with a reason code; provider reversal API; a reversal row is added, records are never edited or deleted |
| Webhooks | Signature check → raw event stored, unique `(provider, provider_event_id)` → 200 quickly → handler applies only allowed, newer transitions; when unsure, re-fetch from the provider (events arrive out of order and twice) |
| Reconciliation | Daily Cron Trigger; gaps filled with `source = 'reconcile'` events; mismatches listed in an admin report; settlement reports bring in fees and tax |
| Receipts | Numbered per financial year (e.g. `DHM/2026-27/000123`), "Contribution receipt", provider payment id and UTR; says it is not a tax-deduction receipt |

### Security

- Provider keys and webhook secrets as Worker secrets; separate test and live provider accounts; Preview
  builds use test keys via the `previews` block in `wrangler.jsonc`, production uses live keys.
- No card or UPI credentials ever reach our code (provider checkout, tokenisation by the provider).
- Turnstile on the support form; Cloudflare rate-limiting binding on `/api/support/*`; webhook route accepts
  only POST with a valid signature.
- Admin (`/admin/`) behind Cloudflare Access, separate from user accounts; every admin action in `audit_log`.
- A Content-Security-Policy listing only the chosen provider's checkout origins, added at activation.
- Raw webhook payloads trimmed of personal data before storage; kept for a fixed period (e.g. 2 years).

## 4. Accounts (future Google sign-in + D1)

- People who pay are **supporters** (identified by email). People who sign in are **users**. A supporter has
  an optional `user_id`.
- Supporting never requires an account; an account never requires supporting.
- Linking needs proof of email ownership **and** explicit confirmation: a signed-in user with a verified
  Google email equal to the supporter's email clicks "Link my contributions", or the user opens a manage
  link (proves the mailbox) while signed in and confirms. Never automatic on an email match. Unlinking allowed.
- Purchases and entitlements, unlike contributions, require an account (an entitlement belongs to a user).

## 5. D1 entities

```
users 1─0..1 supporters 1─* provider_customers
supporters 1─* mandates 1─* contributions (recurring)        supporters 1─* contributions (one-time)
contributions 1─* payment_attempts 1─* reversals
provider_events ── references payment_attempt / mandate / reversal it touched
users 1─* purchases 1─* payment_attempts                       (future; separate from contributions)
users 1─* entitlements ◄── purchase | grant                    (never ◄── contribution)
manage_tokens ─► supporters     audit_log     reconciliation_runs     receipt_sequences
```

| Table | Key columns |
|---|---|
| `users` | id, email, email_verified, name, created_at (auth phase) |
| `supporters` | id, email_normalized UNIQUE, name?, user_id? → users, linked_at?, created_at, anonymised_at? |
| `provider_customers` | id, supporter_id, provider, provider_customer_id; UNIQUE(provider, provider_customer_id) |
| `mandates` | id, public_ref UNIQUE, supporter_id, provider, provider_mandate_id UNIQUE, amount_paise, currency, interval (week/month), interval_count, method (upi_autopay/card), status, next_charge_at?, authorized_at?, cancelled_at?, cancelled_by?, cancel_reason?, created_at |
| `contributions` | id, public_ref UNIQUE (random), supporter_id, kind (one_time/recurring), mandate_id?, period_start?, amount_paise, currency, status, receipt_no? UNIQUE, succeeded_at?, created_at |
| `payment_attempts` | id, contribution_id? / purchase_id? (exactly one), provider, provider_payment_id UNIQUE, provider_order_id?, amount_paise, currency, status, method, failure_code?, fee_paise?, tax_paise?, utr?, captured_at?, created_at |
| `reversals` | id, payment_attempt_id, provider_reversal_id UNIQUE, amount_paise, reason (duplicate/unauthorised/processing_error/accidental_recurring/dispute/admin_error), status, requested_by, created_at, processed_at? |
| `provider_events` | id, provider, provider_event_id, type, source (webhook/reconcile), payload (trimmed JSON), received_at, processed_at?, error?; UNIQUE(provider, provider_event_id) |
| `manage_tokens` | id, supporter_id, token_hash, purpose, expires_at, used_at? |
| `receipt_sequences` | financial_year PK, next_no |
| `reconciliation_runs` | id, provider, window_start, window_end, checked, fixed, mismatches (JSON), ran_at |
| `audit_log` | id, actor, action, target, detail (JSON), at |
| `products` (future) | id, key (e.g. `ecg-pro`), name, price_paise, currency, entitlement_key, entitlement_days?, active |
| `purchases` (future) | id, user_id, product_id, amount_paise, currency, status, created_at |
| `entitlements` (future) | id, user_id, key, source_type (purchase/grant), source_id, starts_at, ends_at?, revoked_at? |

Money is always integer paise plus `currency` (`INR`). Provider names appear only in the `provider` column.
A deletion request anonymises the supporter's personal details; financial rows are kept for the period
accounting law requires (to be confirmed professionally).

### Effect on the current code (none required now)

- `ProgressStore` and the trainer engine stay payment-free. When accounts arrive, `SyncedProgressStore` uses
  `users`; it never reads contributions.
- Paid trainer features will be gated by an API that calls `hasEntitlement`, so paid content cannot be a
  public prerendered page or a file in the public R2 bucket (`files.drharshmaheshwari.com` is public). Paid
  media will need a private bucket and short-lived signed URLs. Free content is unaffected.
- `TrainerMeta` can later gain an optional `requires?: string` (entitlement key) without changing trainers
  that are free.

## 6. Provider research (2 October 2026)

| | Razorpay | Cashfree | PhonePe PG | PayU | Stripe |
|---|---|---|---|---|---|
| One-time UPI | Yes; 2% platform fee + GST despite zero MDR [R1] | Yes; platform fee 1.95%–2.0% (by plan) [C1] | Yes; standard 1.99% (currently promotional "Free") [P1] | Yes; UPI merchant pricing "varies" [U1] | Invite-only in India [S1] |
| One-time cards | 2% + GST [R1] | 1.95%–2.0% [C1] | 1.99% [P1] | 2% + GST (domestic) [U1] | – |
| UPI AutoPay | Yes (Subscriptions; all major UPI apps) [R2] | Yes [C2] | Yes [P1] | Yes [U2] | – |
| Weekly mandates | Yes ("daily, weekly, monthly…") [R2][R3] | UPI AutoPay: daily, weekly, monthly, ad-hoc; cards: weekly, monthly, yearly, ad-hoc [C2] | Not stated for its product; ask | Custom cycles [U2] | – |
| Card recurring | Yes ("Subscriptions on cards is live again") [R2] | Yes (Visa, Mastercard; RuPay listed for limits) [C2] | Yes [P2] | Yes [U2] | – |
| Recurring fee | **+0.9% per subscription payment** (limited-time 0.5%) on top of platform fee, + GST [R2] | **₹7.50 per mandate + ₹5 per debit < ₹1,000** (₹15 per debit ≥ ₹1,000) for UPI AutoPay; ₹7.50 + ₹7.50 for cards/e-mandate [C1] | Not published; ask | Not published; ask | – |
| Customer cancel | `subscription.cancelled` webhook [R3] | Pause/cancel in UPI app [C2] | – | – | – |
| Webhooks / retries | `subscription.pending` / `halted` events, automatic retries [R2] | Webhooks; **no replay of subscription webhooks**, poll the charge API instead [C2] | Yes | Yes | – |
| Individual onboarding | "Individual/Unregistered business" with personal PAN [R4] | Proprietorship-level proof [third-party, unverified] | Unknown; ask | Unknown; ask | No |
| Settlement | Typically T+1 [R1] | Varies by plan | – | T+2 standard [U1] | – |

All five can be called from a Worker over HTTPS. Stripe is excluded: new Indian businesses cannot sign up
directly [S1].

### Regulation that applies whichever provider is chosen

- RBI e-mandate framework (2026): recurring transactions up to **₹15,000** per transaction need no additional
  factor of authentication [RBI1][RBI2]; the customer is notified at least 24 hours before each debit and can
  cancel or modify the mandate [P2]. Card and UPI AutoPay limits of ₹15,000 without AFA are also listed by
  Cashfree [C2].
- UPI MDR from **15 October 2026**: 0.4% (capped at ₹300) on merchant UPI payments **above ₹2,000**; merchants
  receiving under ₹1 lakh a month are exempt [N1][N2]. Nearly all contributions here are below ₹2,000, so this
  barely applies; the gateways' **platform fees apply regardless**: "UPI is free" means zero MDR, not zero
  gateway cost [R1].

### The economics of ₹20 a week

Cost of collecting, including 18% GST on fees (one-off mandate fees excluded except where noted):

| Contribution | Razorpay Subscriptions (2% + 0.9%) + GST ≈ 3.42% | Cashfree UPI AutoPay (₹5 + GST = ₹5.90 per debit) |
|---|---|---|
| ₹20/week (₹1,040/yr) | ≈ ₹0.68 per debit, ≈ ₹36/yr (3.4%) | ₹5.90 per debit = **29.5%**, ≈ ₹307/yr + ₹8.85 mandate fee |
| ₹50/week (₹2,600/yr) | ≈ ₹1.71 per debit (3.4%) | ₹5.90 = 11.8% |
| ₹100/month (₹1,200/yr) | ≈ ₹3.42 (3.4%) | ₹5.90 = 5.9% |
| ₹250/month (₹3,000/yr) | ≈ ₹8.55 (3.4%) | ₹5.90 = 2.4% |

**Conclusion:** with any provider charging a **flat fee per debit**, ₹20/week is economically inefficient:
about 30% of the contribution goes to the gateway. With a **percentage-only** provider the cost is ~3.4%
whatever the amount, and ₹20/week is acceptable. Weekly collection still has non-fee costs: 52 pre-debit
notices a year to the supporter, 52 chances of failure and retry, and more reconciliation rows.

Alternatives if the chosen provider charges flat fees: drop weekly presets and make **₹100/month** the
smallest recurring option; or keep the "one coffee a week" idea but collect **monthly** ("₹90/month, about
₹20 a week"), which keeps the framing and divides fixed costs by four.

### Recommendation

**Provisional: Razorpay**, because it is the only option found with published percentage-only recurring
pricing (which keeps ₹20/week viable), weekly plans, UPI AutoPay and card mandates, documented subscription
webhooks including `halted`, and documented onboarding for individuals without business registration. It is
**not** yet a clear fit; before choosing, get written answers to:

1. Does Razorpay Subscriptions offer **UPI AutoPay to an individual/unregistered account**? (One Razorpay doc
   page lists only cards for Subscriptions [R5]; the product page lists UPI and e-mandate [R2].)
2. Is the business category "voluntary contributions to an educational website" accepted, and under which
   category/MCC? (Wording on the account must be truthful.)
3. Any minimum amount, mandate-registration fee, or per-debit floor that applies to ₹20 debits?
4. The current subscription add-on rate after the promotion, and settlement timing.

Ask PhonePe PG for its UPI AutoPay pricing as a comparison; it may be competitive but publishes no recurring
rates. Use Cashfree only if its flat per-debit fees are waived, or with monthly-only recurring.

### Sources

- [R1] Razorpay pricing: https://razorpay.com/pricing/
- [R2] Razorpay Subscriptions (pricing, UPI AutoPay, webhooks): https://razorpay.com/subscriptions/
- [R3] Razorpay Subscriptions FAQs: https://razorpay.com/docs/payments/subscriptions/faqs/
- [R4] Razorpay account set-up (individual/unregistered, personal PAN): https://razorpay.com/docs/payments/set-up
- [R5] Razorpay Subscriptions supported payment methods: https://razorpay.com/docs/payments/subscriptions/supported-payment-methods/
- [C1] Cashfree payment gateway charges: https://www.cashfree.com/payment-gateway-charges/
- [C2] Cashfree Subscriptions FAQs: https://www.cashfree.com/docs/payments/subscription/faq
- [P1] PhonePe PG pricing: https://www.phonepe.com/business-solutions/payment-gateway/pricing/
- [P2] PhonePe PG, subscription payments in India (June 2026): https://business.phonepe.com/articles/how-to-accept-subscription-payments-in-india-upi-auto-pay-vs-e-nach-vs-cards
- [U1] PayU pricing: https://payu.in/pricing/
- [U2] PayU recurring payments: https://payu.in/recurring-payments-suite/
- [S1] Stripe, invite-only in India: https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india
- [RBI1] RBI, Digital Payments – E-mandate Framework, 2026: https://m.rbi.org.in/scripts/BS_ViewMasDirections.aspx?id=13374
- [RBI2] Livemint, RBI updates e-mandate norms: https://www.livemint.com/money/personal-finance/rbi-updates-e-mandate-norms-no-otp-needed-for-recurring-payments-up-to-15-000-heres-what-it-means-for-users-11776822756977.html
- [N1] The Hindu, 0.4% MDR on UPI above ₹2,000: https://www.thehindu.com/business/npci-introduces-04-percent-mdr-charge-on-upi-payments-above-rs-2000-exempts-small-merchants-person-to-person-transfers/article71468913.ece
- [N2] Hindustan Times, UPI merchant charges from 15 October: https://www.hindustantimes.com/ht-explainers/upi-merchant-transactions-charges-mdr-who-pays-who-does-not-rs-2000-digital-payments-exempt-googlepay-rupay-101789482019344.html

Figures from provider pages change often and some are promotional; PhonePe's own guide still mentions a
₹5,000 card AFA threshold that RBI raised to ₹15,000, so treat secondary summaries with care.

## 7. Questions for professionals and institutions (do not block the architecture)

The product is designed as voluntary project support. Its legal and tax classification is an operational
decision for later. Calling money a "support contribution" does not by itself change how tax or income rules
apply to it.

1. **Employment terms:** whether residency/service rules at AIIMS Raipur permit receiving such contributions.
2. **Tax and form of receipt:** how contributions are treated for income tax; when GST registration applies;
   whether to receive as an individual, a proprietorship, or later a Section 8 company/trust (only a
   registered entity with 80G approval could ever issue tax-deduction receipts).
3. **Provider category:** the truthful business description and category for the gateway account.
4. **Professional conduct:** keep contributions wholly separate from anything clinical so nothing can read as
   a fee for medical services (NMC rules).
5. **Foreign money:** not accepted now; take advice (including FCRA) before ever accepting it.
6. **Data protection (DPDP Act):** notice and consent wording, retention of financial records versus
   deletion requests, and a grievance contact.

## 8. What waits for what

| Waits for Google auth + D1 | Waits for payment activation |
|---|---|
| `users` table, sessions, `/account/` | Provider account, KYC, written answers above |
| Linking supporters to users (proof + confirmation) | `supporters`, `mandates`, `contributions`, `payment_attempts`, `reversals`, `provider_events`, `manage_tokens`, `receipt_sequences`, `audit_log`, `reconciliation_runs` |
| `purchases`, `products`, `entitlements`, `hasEntitlement()` | API routes, webhooks, Turnstile, rate limits, CSP, cron reconciliation, receipts and email provider |
| Private R2 bucket + signed URLs for paid media | Test-mode end-to-end run on Preview, then live keys on production only |
| Showing a signed-in user their contributions | Switching `PAYMENTS_ENABLED` on, in the same release as the working API |
