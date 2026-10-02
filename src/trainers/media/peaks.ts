// Pre-generated waveform data. Files use the audiowaveform JSON format (version 2, as written by BBC's
// audiowaveform tool and read by peaks.js), so they can be produced or reused by standard tools:
//   { version: 2, channels: 1, sample_rate, samples_per_pixel, bits: 8, length, data: [min, max, ...] }
// They are made by scripts/trainers/<trainer>/prepare.py and stored next to the audio on R2.

export interface Peaks {
  /** Seconds of audio covered. */
  duration: number;
  /** Interleaved min/max per point, scaled to -1..1. */
  data: Float32Array;
  points: number;
}

const cache = new Map<string, Promise<Peaks | null>>();

/** Fetch and parse a peaks file. Resolves to null (never rejects) when it is missing or blocked, so a
 *  viewer can fall back to a plain progress bar. Each URL is fetched once per page. */
export function loadPeaks(url: string): Promise<Peaks | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { mode: 'cors' })
      .then((r) => (r.ok ? r.json() : null))
      .then(parse)
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

function parse(j: any): Peaks | null {
  if (!j || j.version !== 2 || j.channels !== 1 || !Array.isArray(j.data) || !j.sample_rate || !j.samples_per_pixel) return null;
  const scale = j.bits === 16 ? 32768 : 128;
  const data = Float32Array.from(j.data as number[], (v) => v / scale);
  const points = Math.floor(data.length / 2);
  return { duration: (points * j.samples_per_pixel) / j.sample_rate, data, points };
}
