// Support this project: the options shown on /support/ and the arithmetic behind them.
// Payments are NOT active. See docs/support-architecture.md for the design and what activation needs.

/** Off until a payment provider, the D1 records and verified webhooks exist. While false, /support/ shows
 *  the options so the experience can be reviewed, but nothing can be submitted and no money moves.
 *  Becomes an environment-driven setting only when the payment API is built. */
export const PAYMENTS_ENABLED = false;

export type Frequency = 'week' | 'month';

export interface RecurringPreset { amount: number; frequency: Frequency; note?: string }

/** Rupees. Money is handled as whole paise everywhere else (see the architecture doc). */
export const ONE_TIME_PRESETS = [100, 250, 500];

export const RECURRING_PRESETS: RecurringPreset[] = [
  { amount: 20, frequency: 'week', note: 'One coffee a week' },
  { amount: 50, frequency: 'week' },
  { amount: 100, frequency: 'month' },
  { amount: 250, frequency: 'month' },
];

/** Custom amount bounds in rupees. Recurring stays far below the ₹15,000 e-mandate limit for automatic debits. */
export const LIMITS = {
  oneTime: { min: 10, max: 50000 },
  recurring: { min: 20, max: 5000 },
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (rupees: number) => inr.format(rupees);

export const perLabel = (f: Frequency) => (f === 'week' ? 'week' : 'month');

/** How a recurring amount is shown: only the actual commitment, e.g. "₹20/week". No annualised or long-term
 *  totals are ever displayed (a product decision: keep the commitment as small as it really is). */
export const commitment = (amount: number, f: Frequency) => `${formatINR(amount)}/${perLabel(f)}`;
