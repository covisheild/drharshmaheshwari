// The site's colour, chosen by the admin in src/data/theme.json from the 36 colours in src/data/palettes.json.
// Visitors get no colour picker. For Everyone and For Doctors have their own colour, fixed or going round a list weekly or monthly.
import type { Mode } from './modes';

export interface Palette { id: string; n: number; name: string; hue: number; ld: number; ll: number }
export interface ThemeConfig {
  schedule: 'fixed' | 'weekly' | 'monthly'; start: string;
  fixed: Record<Mode, string>; rotation: Record<Mode, string[]>;
}

/** Which colour an audience has at a given moment (ms since 1970). Dates change at midnight India time (UTC+5:30).
 *  This function is also copied, as text, into a tiny inline script (see themeScript), so it must not use anything outside itself. */
export function paletteIdFor(cfg: ThemeConfig, mode: Mode, now: number): string {
  if (cfg.schedule === 'fixed') return cfg.fixed[mode];
  const list = cfg.rotation[mode];
  const s = new Date(cfg.start + 'T00:00:00Z'), d = new Date(now + 19800000);
  const k = cfg.schedule === 'weekly'
    ? Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - s.getTime()) / 6048e5)
    : (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + d.getUTCMonth() - s.getUTCMonth();
  return list[((k % list.length) + list.length) % list.length];
}

export const paletteFor = (cfg: ThemeConfig, palettes: Palette[], mode: Mode, now = Date.now()): Palette =>
  palettes.find((p) => p.id === paletteIdFor(cfg, mode, now)) ?? palettes[0];

/** The values the CSS reads: --pal-h (hue), --pal-ld (lightness of fills on dark), --pal-ll (lightness on light). */
export const paletteStyle = (p: Palette) => `--pal-h:${p.hue};--pal-ld:${p.ld}%;--pal-ll:${p.ll}%`;

/** Inline script for the page head. Only needed when the colour changes with the date: it corrects the build-time colour
 *  before first paint. Returns '' for a fixed colour (no script at all). */
export function themeScript(cfg: ThemeConfig, palettes: Palette[], mode: Mode): string {
  if (cfg.schedule === 'fixed') return '';
  const table = Object.fromEntries(palettes.map((p) => [p.id, [p.hue, p.ld, p.ll]]));
  return `(function(){var C=${JSON.stringify({ schedule: cfg.schedule, start: cfg.start, rotation: { [mode]: cfg.rotation[mode] } })},P=${JSON.stringify(table)},f=${paletteIdFor.toString()};` +
    `var p=P[f(C,${JSON.stringify(mode)},Date.now())];if(!p)return;var s=document.documentElement.style;s.setProperty('--pal-h',p[0]);s.setProperty('--pal-ld',p[1]+'%');s.setProperty('--pal-ll',p[2]+'%');})();`;
}
