// Writes src/data/palettes.json: the 36 theme colours, one every 10 degrees around the colour wheel.
// Each colour carries two lightness values worked out so that text and buttons stay readable (WCAG 4.5:1):
//   ld  = lightness of the colour when used as a filled button on the dark theme (dark ink on top)
//   ll  = lightness of the colour on the light theme, as text and as a filled button (white ink on top)
// Run: node scripts/design/palettes.mjs      (tests/palettes.test.mjs re-checks every colour)
import { writeFileSync } from 'node:fs';

export const NAMES = ['Red', 'Scarlet', 'Vermilion', 'Orange', 'Amber', 'Gold', 'Yellow', 'Citron', 'Chartreuse', 'Lime', 'Fern', 'Green',
  'Emerald', 'Jade', 'Mint', 'Sea', 'Turquoise', 'Teal', 'Aqua', 'Cyan', 'Sky', 'Azure', 'Cobalt', 'Ion', 'Blue', 'Indigo', 'Violet', 'Purple',
  'Amethyst', 'Orchid', 'Magenta', 'Fuchsia', 'Pink', 'Rose', 'Raspberry', 'Ruby'];

export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
export const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

// The surfaces the colours sit on (keep in step with src/styles/tokens.css).
export const SURF = {
  dark: { bg: hex('#050608'), card: hex('#0c0e13'), card2: hex('#11141b'), ink: hex('#04070c') },
  light: { bg: hex('#f5f6fa'), card: hex('#ffffff'), card2: hex('#f0f2f8'), ink: hex('#ffffff') },
};
export const DARK_TEXT = { s: 100, l: 78 };   // accent text on the dark theme
export const DARK_FILL = { s: 92 };           // filled buttons on the dark theme
export const LIGHT = { s: 80 };               // accent text and fills on the light theme
export const softDark = (h) => hsl(h, 55, 16);
export const softLight = (h) => hsl(h, 100, 94);

export function build() {
  return NAMES.map((name, i) => {
    const h = i * 10;
    let ld = 56; while (ld < 84 && contrast(hsl(h, DARK_FILL.s, ld), SURF.dark.ink) < 4.7) ld++;
    let ll = 46; while (ll > 18 && Math.min(contrast(hsl(h, LIGHT.s, ll), SURF.light.card2), contrast(hsl(h, LIGHT.s, ll), SURF.light.bg), contrast(hsl(h, LIGHT.s, ll), SURF.light.ink), contrast(hsl(h, LIGHT.s, ll), softLight(h))) < 4.7) ll--;
    return { id: name.toLowerCase(), n: i + 1, name, hue: h, ld, ll };
  });
}
if (process.argv[1] && process.argv[1].endsWith('palettes.mjs')) {
  const p = build();
  writeFileSync(new URL('../../src/data/palettes.json', import.meta.url), JSON.stringify(p, null, 1) + '\n');
  console.log(p.length, 'colours written; lightest light-theme L:', Math.max(...p.map((x) => x.ll)), 'darkest:', Math.min(...p.map((x) => x.ll)));
}
