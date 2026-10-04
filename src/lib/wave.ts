// A heart-sound picture: a waveform with S1 and S2 marked. Illustrative only (not a real recording); drawn at build time.
const lub = (t: number, c: number, a: number, s: number) => a * Math.exp(-(((t - c) / s) ** 2));
export const WAVE_LABELS: [number, string][] = [[.12, 'S1'], [.45, 'S2'], [1.12, 'S1'], [1.45, 'S2'], [2.12, 'S1'], [2.45, 'S2']];
export function wave(H = 190) {
  const N = 360, mid = H / 2, sc = H * .36;
  let sig = '', env = '';
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * 3, ph = t % 1, amp = lub(ph, .12, 1, .028) + lub(ph, .45, .72, .024) + lub(ph, .26, .22, .05);
    const y = mid - amp * sc * Math.sin(k * 2.3) * (.55 + .45 * Math.sin(k * .9)), x = ((k / N) * 600).toFixed(1);
    sig += `${k ? 'L' : 'M'}${x} ${y.toFixed(1)}`; env += `${k ? 'L' : 'M'}${x} ${(mid - amp * sc).toFixed(1)}`;
  }
  return { sig, env, mid };
}
