// Share pictures (WhatsApp, Telegram, X, LinkedIn link previews): one 1200x630 card per page, drawn after the build from each page's
// own title and description, in the page's audience colour (src/data/theme.json). Written to /og/<page path>.png; Base.astro points
// og:image at the same name. Nothing to maintain: a new page gets its own picture by itself.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const FONTS = () => [
  { name: 'Outfit', data: font('@fontsource/outfit', 'outfit-latin-600-normal.woff'), weight: 600, style: 'normal' },
  { name: 'DM Sans', data: font('@fontsource/dm-sans', 'dm-sans-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'DM Sans', data: font('@fontsource/dm-sans', 'dm-sans-latin-500-normal.woff'), weight: 500, style: 'normal' },
];

const SECTION = { blog: 'Blog', learn: 'Guides', books: 'Books', tools: 'Tools', videos: 'Videos', about: 'About', evidence: 'Evidence', trainers: 'Trainers' };
const MODE = { everyone: 'For Everyone', doctors: 'For Doctors' };
const SITE_NAME = 'Dr. Harsh Maheshwari';
const TAGLINE = 'Physician & public health researcher working to reverse obesity in India';

const unescapeHtml = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? unescapeHtml(m[1]) : '';
};
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', boxSizing: 'border-box', ...style }, children } });

function card({ eyebrow, title, description, hue }) {
  const size = title.length > 90 ? 52 : title.length > 56 ? 64 : 78;
  return h('div', {
    width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: '68px 80px', color: '#f3f5f9', fontFamily: 'DM Sans',
    backgroundColor: '#07090d',
    backgroundImage: `radial-gradient(circle at 92% -8%, hsla(${hue}, 85%, 52%, 0.55), rgba(7,9,13,0) 58%), radial-gradient(circle at -6% 108%, hsla(${hue}, 85%, 52%, 0.22), rgba(7,9,13,0) 50%)`,
  }, [
    h('div', { flexDirection: 'column', width: 1040 }, [
      h('div', { fontSize: 26, fontWeight: 500, letterSpacing: 4, textTransform: 'uppercase', color: `hsl(${hue}, 100%, 78%)`, marginBottom: 30 }, eyebrow),
      h('div', { fontFamily: 'Outfit', fontWeight: 600, fontSize: size, lineHeight: 1.08, letterSpacing: -1.5 }, title),
      description ? h('div', { fontSize: 32, lineHeight: 1.4, color: '#a9b0be', marginTop: 28 }, clip(description, 175)) : '',
    ]),
    h('div', { alignItems: 'center', justifyContent: 'space-between', width: 1040, fontSize: 28 }, [
      h('div', { fontFamily: 'Outfit', fontWeight: 600, fontSize: 30, color: '#f3f5f9' }, SITE_NAME),
      h('div', { color: '#8a92a3' }, 'drharshmaheshwari.com'),
    ]),
  ]);
}

export default function ogImages({ theme, palettes }) {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, pages, logger }) => {
        const root = fileURLToPath(dir);
        const fonts = FONTS();
        let n = 0;
        for (const { pathname } of pages) {
          const path = pathname.replace(/\/$/, '');
          const html = readFileSync(join(root, path, path === '404' ? '../404.html' : 'index.html'), 'utf8');
          const mode = (html.match(/<html[^>]*data-mode="(\w+)"/) ?? [])[1] === 'doctors' ? 'doctors' : 'everyone';
          const palette = palettes.find((p) => p.id === theme.fixed[mode]) ?? palettes[0];
          const hue = (html.match(/--pal-h:(\d+)/) ?? [])[1] ?? palette.hue;
          const segs = path.split('/').filter(Boolean);
          const section = SECTION[segs[0] === 'doctors' ? segs[1] : segs[0]];
          const home = segs.length === 0 || (segs.length === 1 && segs[0] === 'doctors');
          const title = home ? TAGLINE : meta(html, 'og:title') || SITE_NAME;
          const description = home ? '' : meta(html, 'og:description');
          const eyebrow = [section, MODE[mode]].filter(Boolean).join(' · ');
          const svg = await satori(card({ eyebrow, title, description, hue }), { width: 1200, height: 630, fonts });
          const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
          const out = join(root, 'og', (path || 'index') + '.png');
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, png);
          n++;
        }
        logger.info(`${n} share pictures written to /og/`);
      },
    },
  };
}
