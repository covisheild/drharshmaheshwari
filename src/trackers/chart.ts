// Small SVG charts for the trackers: readings over time, with faint unlabelled reference lines. Pure string output, so
// the same code draws the sample on /trackers/ at build time and the live charts in the browser. Colours come from
// CSS classes (trackers.css), never raw colours, so they work in every audience colour and in light and dark.

export interface Point {
  t: number;
  /** One value, or a range drawn as a bar (SBP over DBP). */
  v: number;
  v2?: number;
  /** Hollow marker (e.g. a clinic reading, or a glucometer value). */
  hollow?: boolean;
  /** A ring on the patient's own chart only. */
  alert?: boolean;
}
export interface ChartOpts {
  points: Point[];
  lines?: number[];
  /** The value axis always includes this range. */
  floor: [number, number];
  label: string;
  unit: string;
  decimals?: number;
  /** Drawn at the width it is shown, so its labels stay at their real size on a phone. */
  width?: number;
  /** The page's words (t() at build time, w() in the browser); English when left out. */
  words?: (en: string, vars?: Record<string, string | number>) => string;
}

const L = 40, R = 12, T = 16, B = 28;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;
// The words a chart shows go through o.words, so they are listed here for src/components/ClientWords.astro:
// w('Jan') w('Feb') w('Mar') w('Apr') w('May') w('Jun') w('Jul') w('Aug') w('Sep') w('Oct') w('Nov') w('Dec')
// w('{d} {month}') w('{d} {month} {yy}') w('{label}: {n} reading') w('{label}: {n} readings') w('{label}: no readings yet')
const english = (s: string, v: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function niceStep(span: number) {
  const raw = span / 5, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function chartSvg(o: ChartOpts): string {
  const W = Math.round(Math.min(900, Math.max(280, o.width ?? 640))), H = Math.round(Math.min(260, Math.max(190, W * 0.4)));
  const pts = o.points;
  const tr = o.words ?? english;
  const vals = pts.flatMap((p) => (p.v2 == null ? [p.v] : [p.v, p.v2])).concat(o.lines ?? [], o.floor);
  const step = niceStep(Math.max(...vals) - Math.min(...vals) || 10);
  const lo = Math.floor(Math.min(...vals) / step) * step, hi = Math.ceil(Math.max(...vals) / step) * step;
  const t0 = pts.length ? pts[0].t : 0, t1 = pts.length ? pts[pts.length - 1].t : 1;
  const pad = Math.max((t1 - t0) * 0.04, DAY / 2);
  const a = t0 - pad, b = t1 + pad;
  const x = (t: number) => L + ((t - a) / (b - a)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const f = (n: number) => n.toFixed(1);
  const out: string[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    out.push(`<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}"/><text class="ch-ax" x="${L - 6}" y="${f(y(v) + 4)}" text-anchor="end">${+v.toFixed(o.decimals ?? 0)}</text>`);
  }
  for (const l of o.lines ?? []) out.push(`<line class="ch-ref" x1="${L}" x2="${W - R}" y1="${f(y(l))}" y2="${f(y(l))}"/>`);
  // Date ticks under real readings (up to 5, spread along the list), so each date sits under the reading it names.
  if (pts.length) {
    const n = Math.min(W < 420 ? 3 : 5, pts.length);
    const seen = new Set<string>();
    let lastX = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = pts[n === 1 ? 0 : Math.round(((pts.length - 1) * i) / (n - 1))].t;
      const d = new Date(t + 330 * 60_000);
      const month = tr(MONTHS[d.getUTCMonth()]);
      const label = t1 - t0 > 300 * DAY ? tr('{d} {month} {yy}', { d: d.getUTCDate(), month, yy: String(d.getUTCFullYear()).slice(2) }) : tr('{d} {month}', { d: d.getUTCDate(), month });
      if (seen.has(label) || x(t) - lastX < 56) continue;
      seen.add(label); lastX = x(t);
      out.push(`<text class="ch-ax" x="${f(x(t))}" y="${H - 8}" text-anchor="middle">${label}</text>`);
    }
  }
  // A thin line joins single values in time order; ranges are drawn as bars.
  const singles = pts.filter((p) => p.v2 == null);
  if (singles.length > 1) out.push(`<polyline class="ch-line" points="${singles.map((p) => `${f(x(p.t))},${f(y(p.v))}`).join(' ')}"/>`);
  for (const p of pts) {
    const cx = f(x(p.t));
    if (p.v2 != null) out.push(`<line class="ch-bar" x1="${cx}" x2="${cx}" y1="${f(y(p.v))}" y2="${f(y(p.v2))}"/>`);
    for (const v of p.v2 == null ? [p.v] : [p.v, p.v2]) {
      out.push(`<circle class="${p.hollow ? 'ch-pt hollow' : 'ch-pt'}" cx="${cx}" cy="${f(y(v))}" r="4"/>`);
      if (p.alert) out.push(`<circle class="ch-alert" cx="${cx}" cy="${f(y(v))}" r="8"/>`);
    }
  }
  const summary = !pts.length ? tr('{label}: no readings yet', { label: o.label })
    : pts.length > 1 ? tr('{label}: {n} readings', { label: o.label, n: pts.length }) : tr('{label}: {n} reading', { label: o.label, n: pts.length });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet"><text class="ch-ax ch-unit" x="${L}" y="10">${esc(o.unit)}</text>${out.join('')}</svg>`;
}
