// Support this project: one-time contributions by direct UPI. No payment gateway, no backend, no records.
// Everything you might need to change is in UPI_CONFIG below. Design notes: docs/support-architecture.md.
// Recurring support is parked as a future feature; nothing on the site offers it.

export const UPI_CONFIG = {
  /** Set false to take the contribution card down (the page then shows "Contributions open soon."). */
  enabled: true,
  /** The UPI ID (VPA) that receives contributions, e.g. "name@bank". Leave empty until it is final:
   *  never put a placeholder here, a made-up ID could belong to a real person. */
  upiId: 'info.harshmaheshwari@okhdfcbank',
  /** Shown on the page and in the payer's UPI app; keep it the same as the bank-registered name. */
  payeeName: 'Harsh Maheshwari',
  /** Note pre-filled in the UPI app (keep it short; some apps cut long notes). */
  note: 'Support drharshmaheshwari.com',
  /** Put the chosen amount into the QR and the app link. Set false if the receiving UPI ID is a merchant
   *  ID whose QR must not carry an amount; the page then tells people which amount to enter. */
  amountInQr: true,
  /** Show "Open your UPI app" on phones. Off for a personal UPI ID: Google Pay and PhonePe decline payments
   *  started from a web link to a personal ID above a few rupees ("bank limit exceeded"), while QR scans work.
   *  Turn on only with a merchant UPI ID, after testing a real payment through the link. */
  appLink: false,
};

/** Rupees. */
export const ONE_TIME_PRESETS = [100, 250, 500];
export const LIMITS = { min: 10, max: 50000 };

const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/** The page shows the UPI details only when switched on and a valid UPI ID is set. */
export const supportOpen = () => UPI_CONFIG.enabled && VPA.test(UPI_CONFIG.upiId.trim());

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (rupees: number) => inr.format(rupees);

/** A UPI payment URI (NPCI UPI linking format): upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…
 *  Every value is percent-encoded (spaces as %20, not "+", which some UPI apps show literally).
 *  The amount is written with two decimals, as UPI apps expect. Without an amount the payer types it. */
export function upiUri(amount?: number, cfg: Pick<typeof UPI_CONFIG, 'upiId' | 'payeeName' | 'note' | 'amountInQr'> = UPI_CONFIG) {
  const params: [string, string][] = [['pa', cfg.upiId.trim()], ['pn', cfg.payeeName]];
  if (amount && cfg.amountInQr) params.push(['am', amount.toFixed(2)]);
  params.push(['cu', 'INR'], ['tn', cfg.note]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
