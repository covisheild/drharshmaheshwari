// The recordings "Save for offline" keeps on a device (scripts/pwa/integration.mjs reads this after the build and
// leaves it out of the pack). Sizes are estimates for the progress bar: MP3 at 32 kbps, peaks about 2.4 KB a second.
import { RECORDINGS, media } from '../../../../trainers/auscultation/config';

export function GET() {
  const files = RECORDINGS.flatMap((r) => {
    const m = media(r);
    return [{ u: m.src, b: Math.round(r.secs * 4000) + 1000 }, ...(m.peaks ? [{ u: m.peaks, b: Math.round(r.secs * 2400) }] : [])];
  });
  return new Response(JSON.stringify({ files }), { headers: { 'Content-Type': 'application/json' } });
}
