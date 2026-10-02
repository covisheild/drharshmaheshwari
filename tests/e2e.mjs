// Browser checks for the two modes and the trainer. Uses Playwright if it is installed (it is not a
// project dependency): `npm run build && npm run test:e2e`.
//   BASE_URL   site to test (default: starts `astro preview` on port 4329, the real Workers runtime)
//   MEDIA_DIR  optional local copy of the R2 trainer folder (containing hls-cmds-v2/); requests to
//              files.drharshmaheshwari.com are then served from it, with CORS headers like R2's.

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')); } catch {
    console.log('SKIP: Playwright is not installed (npm i -g playwright).'); process.exit(0);
  }
}

const PORT = 4329;
const started = !process.env.BASE_URL;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;
if (started) execSync(`npx astro preview --port ${PORT}`, { stdio: 'ignore' });
const MEDIA = process.env.MEDIA_DIR;
const T = '/doctors/trainers/auscultation/';
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function context(viewport, { theme, peaks = true } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (MEDIA) await ctx.route('https://files.drharshmaheshwari.com/**', (r) => {
    const p = new URL(r.request().url()).pathname.replace('/trainers/auscultation/', '');
    const f = join(MEDIA, p);
    if (!existsSync(f) || (!peaks && p.endsWith('.peaks.json'))) return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } });
    const body = readFileSync(f), type = p.endsWith('.json') ? 'application/json' : 'audio/mpeg';
    // Answer range requests like R2 does: browsers need them to seek in audio.
    const range = /bytes=(\d*)-(\d*)/.exec(r.request().headers().range ?? '');
    if (range) {
      const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : body.length - 1;
      return r.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType: type,
        headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` } });
    }
    return r.fulfill({ body, contentType: type, headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' } });
  });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  return ctx;
}
const errorsOf = (page) => { const e = []; page.on('pageerror', (x) => e.push(x.message)); return e; };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

try {
  // ---------- Contrast in all four mode x theme combinations (WCAG AA, 4.5:1 for text) ----------
  for (const theme of ['light', 'dark']) for (const url of ['/', '/doctors/']) {
    const ctx = await context({ width: 1280, height: 900 }, { theme });
    const page = await ctx.newPage();
    await page.goto(BASE + url);
    const res = await page.evaluate(() => {
      const probe = document.createElement('span'); document.body.append(probe);
      const rgb = (v) => { probe.style.color = `var(${v})`; const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); return m[0] <= 1 && getComputedStyle(probe).color.startsWith('color(') ? m.slice(0, 3).map((x) => x * 255) : m.slice(0, 3); };
      const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const pairs = [['--ink', '--bg'], ['--ink-2', '--bg'], ['--ink-3', '--bg'], ['--ink-3', '--surface'], ['--brand', '--bg'], ['--brand', '--surface'],
        ['--brand-ink', '--brand'], ['--brand', '--brand-soft'], ['--accent', '--accent-soft'], ['--ok', '--ok-soft'], ['--risk', '--risk-soft'], ['--warn', '--warn-soft']];
      if (document.documentElement.dataset.mode === 'doctors') pairs.push(['--header-ink', '--header-bg'], ['--header-ink-2', '--header-bg']);
      return pairs.map(([a, b]) => [a, b, ratio(a, b)]);
    });
    for (const [a, b, r] of res) check(r >= 4.5, `contrast ${url} ${theme}: ${a} on ${b} = ${r.toFixed(2)}`);
    await ctx.close();
  }

  // ---------- Modes, navigation, redirects, no sideways scroll ----------
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await context(vp);
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    for (const url of ['/', '/learn/', '/tools/', '/tools/bmi-calculator/', '/books/', '/videos/', '/about/', '/doctors/', '/doctors/evidence/', '/doctors/trainers/', '/doctors/tools/', '/doctors/books/', '/doctors/books/statistics-first-principles-to-regression/', '/doctors/videos/', '/support/', T, `${T}learn/`, `${T}learn/s3/`, `${T}learn/heart-and-lungs-together/`, `${T}practice/`, `${T}quiz/`, `${T}review/`, `${T}progress/`]) {
      const r = await page.goto(BASE + url);
      check(r.status() === 200 && (await overflow(page)) <= 0, `${name} ${url}: 200, no sideways scroll`);
    }
    for (const [from, to] of [['/clinicians/', '/doctors/evidence/'], ['/clinicians', '/doctors/evidence/'], ['/books/statistics-first-principles-to-regression/', '/doctors/books/statistics-first-principles-to-regression/']]) {
      await page.goto(BASE + from);
      check(new URL(page.url()).pathname === to, `${name} redirect ${from} -> ${to}`);
    }
    await page.goto(BASE + '/');
    await page.click('.mode-bar a[data-mode-link="doctors"]');
    check(await page.evaluate(() => location.pathname === '/doctors/' && document.documentElement.dataset.mode === 'doctors'), `${name} mode switch goes to For Doctors`);
    check(await page.isVisible('.mode-badge'), `${name} For Doctors badge visible in header`);
    await page.click('.mode-bar a[data-mode-link="everyone"]');
    check(await page.evaluate(() => location.pathname === '/' && document.documentElement.dataset.mode === 'everyone'), `${name} mode switch back to For Everyone`);
    check(errs.length === 0, `${name} no script errors (${errs.join('; ')})`);
    await ctx.close();
  }

  // ---------- Support page: one-time UPI; closed until configured, QR/app link/copy when open ----------
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await context(vp);
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + '/support/');
    const open = (await page.getAttribute('#support-upi', 'data-open')) === 'true';
    check((await page.$$eval('input[name=amount]', (r) => r.filter((x) => x.checked).length)) === 0, `${name} support: no amount pre-selected`);
    check(!(await page.isVisible('text=Regularly')) && (await page.$$('input[name=kind]')).length === 0, `${name} support: no recurring option`);
    await page.click('text=₹250');
    check((await page.textContent('#summary')).includes('₹250, once.'), `${name} support: one-time amount shown`);
    await page.click('text=Other amount');
    await page.fill('input[name=custom]', '300');
    check((await page.textContent('#summary')).includes('₹300, once.'), `${name} support: custom amount`);
    if (!open) {
      check(await page.isVisible('text=Contributions open soon.') && (await page.$$('[data-qr]')).length === 0, `${name} support: closed, no QR or UPI details`);
    } else {
      check(await page.isVisible('.payee b'), `${name} support: payee name visible`);
      check((await page.textContent('#qr-hint')).includes('enter ₹300'), `${name} support: custom amount tells the payer which amount to enter`);
      check(await page.isVisible('[data-qr="any"]'), `${name} support: open QR shown for a custom amount`);
      check(/scan it from your gallery/.test(await page.textContent('#app-hint')), `${name} support: scan-from-gallery hint present (shown on phone user-agents)`);
      await page.click('text=₹500');
      if (await page.$('#upi-open')) {
        const href = await page.getAttribute('#upi-open', 'href');
        check(href.startsWith('upi://pay?pa=') && href.includes('am=500.00') && href.includes('cu=INR'), `${name} support: app link carries the amount`);
        check(name === 'phone' || !(await page.isVisible('#upi-open')), `${name} support: app link only on phones`);
      }
    }
    check((await overflow(page)) <= 0 && errs.length === 0, `${name} support: no sideways scroll, no script errors`);
    await ctx.close();
  }

  // ---------- Trainer ----------
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await context(vp);
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + T);
    const navPos = await page.$eval('.t-nav', (n) => getComputedStyle(n).position);
    check(name === 'phone' ? navPos === 'fixed' : navPos === 'sticky', `${name} trainer nav is a ${name === 'phone' ? 'bottom tab bar' : 'side rail'} (${navPos})`);

    // Learn: waveform drawn from peaks
    await page.goto(BASE + `${T}learn/s3/`);
    await page.click('[data-step="1"]');
    await page.waitForTimeout(1200);
    const drawn = await page.$eval('.av-wave canvas', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n / (d.length / 4); });
    if (MEDIA) check(drawn > 0.08, `${name} learn page draws the waveform from peaks (${(drawn * 100).toFixed(0)}% of pixels)`);
    check(await page.$eval('.av-play', (b) => b.getAttribute('aria-pressed') === 'true'), `${name} learn example plays`);
    // seeking by click
    const box = await page.$eval('.av-wave', (w) => { const r = w.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.mouse.click(box.x + box.w * 0.5, box.y + box.h / 2);
    check(Number(await page.getAttribute('.av-wave', 'aria-valuenow')) >= 6, `${name} clicking the waveform seeks`);
    await page.selectOption('.av-speed select', '0.5');

    // Quiz: one full round of level 1, waveform hidden until answered
    await page.goto(BASE + `${T}quiz/`);
    await page.click('.t-level button');
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('.t-opt:not(:disabled)');
      if (i === 0) check(await page.$eval('.av', (a) => a.classList.contains('cues-hidden')), `${name} quiz hides the waveform before answering`);
      await page.locator('.t-opt').first().click();
      await page.waitForSelector('.t-feedback');
      if (i === 0) check(!(await page.$eval('.av', (a) => a.classList.contains('cues-hidden'))), `${name} quiz shows the waveform after answering`);
      await page.click('.t-next');
    }
    check(await page.isVisible('.t-score'), `${name} quiz round ends with a score`);
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('trainer:auscultation:v2')));
    check(store?.v === 2 && store.attempts.length === 10 && store.attempts.every((a) => a.id && a.activity === 'quiz' && a.version === 'hls-cmds-v2'), `${name} ProgressStore saved 10 quiz attempts with ids`);

    // Review: wrong answers are offered again
    const wrong = store.attempts.filter((a) => !a.correct).length;
    await page.goto(BASE + `${T}review/`);
    if (wrong) {
      await page.click('#app .btn-primary');
      await page.waitForSelector('.t-opt:not(:disabled)');
      check(true, `${name} review starts with ${wrong} missed`);
    } else check(await page.isVisible('#app .empty'), `${name} review empty state`);

    // Practice, mixed set: two-part question with Heart only / Lungs only comparisons
    await page.goto(BASE + `${T}practice/`);
    await page.locator('.t-pick').nth(2).click();
    await page.waitForSelector('.t-ask');
    check(!(await page.$eval('.av', (a) => a.classList.contains('cues-hidden'))), `${name} practice shows the waveform before answering`);
    await page.locator('.t-ask').nth(0).locator('.t-opt').first().click();
    await page.locator('.t-ask').nth(1).locator('.t-opt').first().click();
    await page.click('text=Check');
    await page.waitForSelector('.t-feedback');
    const cmp = await page.$$eval('.t-feedback .btn-ghost', (b) => b.map((x) => x.textContent));
    check(cmp.some((t) => t.includes('Heart only')) && cmp.some((t) => t.includes('Lungs only')), `${name} mixed practice offers Heart only / Lungs only`);
    await page.click('.t-next');
    await page.click('text=Finish');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('trainer:auscultation:v2')).attempts);
    check(after.some((a) => a.activity === 'practice'), `${name} practice attempts are recorded as practice`);

    // Progress
    await page.goto(BASE + `${T}progress/`);
    check(await page.isVisible('.t-table'), `${name} progress table shows`);
    check((await overflow(page)) <= 0, `${name} progress: no sideways scroll`);
    check(errs.length === 0, `${name} trainer: no script errors (${errs.join('; ')})`);
    await ctx.close();
  }

  // ---------- Without peaks (R2 file missing or no CORS) the viewer falls back and still plays ----------
  {
    const ctx = await context({ width: 390, height: 844 }, { peaks: false });
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + `${T}learn/wheeze/`);
    await page.click('.av-play');
    await page.waitForTimeout(800);
    check(await page.$eval('.av-play', (b) => b.getAttribute('aria-pressed') === 'true') && errs.length === 0, 'viewer plays without peaks (plain progress bar)');
    await ctx.close();
  }

  // ---------- Progress saved by the first prototype (v1) is carried over ----------
  {
    const ctx = await context({ width: 1280, height: 900 });
    await ctx.addInitScript(() => {
      if (localStorage.getItem('trainer:auscultation:v2')) return;
      localStorage.setItem('trainer:auscultation:v1', JSON.stringify({ v: 1, unlockAll: true, answers: [{ level: 'normal', item: 'hs/F_N_A', parts: [{ answer: 'normal', chosen: 'abnormal' }], t: 1 }] }));
    });
    const page = await ctx.newPage();
    await page.goto(BASE + `${T}progress/`);
    const v2 = await page.evaluate(() => JSON.parse(localStorage.getItem('trainer:auscultation:v2')));
    check(v2?.attempts.length === 1 && v2.attempts[0].correct === false && v2.prefs.unlockAll === true, 'v1 progress migrated to v2');
    await ctx.close();
  }
} finally {
  await browser.close();
  if (started) try { execSync('npx astro preview stop', { stdio: 'ignore' }); } catch {}
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
