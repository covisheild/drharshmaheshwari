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
if (started) {
  execSync(`npx astro preview --port ${PORT}`, { stdio: 'ignore' });
  // The preview server keeps starting in the background; wait until it answers.
  for (let i = 0; i < 60; i++) { if (await fetch(BASE + '/').then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 500)); }
}
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
    // Columns with ink well away from the midline: the waveform has hundreds; the plain progress bar
    // (no peaks) has only the playhead and none of the rest.
    const drawn = await page.$eval('.av-wave canvas', (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, band = c.height * 0.15, cols = new Set();
      for (let y = 0; y < c.height; y++) if (Math.abs(y - c.height / 2) > band) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 64) cols.add(x);
      return cols.size / c.width;
    });
    if (MEDIA) check(drawn > 0.05, `${name} learn page draws the waveform from peaks (${(drawn * 100).toFixed(0)}% of columns)`);
    check(await page.$eval('.av-play', (b) => b.getAttribute('aria-pressed') === 'true'), `${name} learn example plays`);
    // seeking by click: on the whole-clip strip when the close-up is shown, else on the progress bar
    if (MEDIA) check(await page.isVisible('.av-overview'), `${name} learn page shows the close-up and the whole-clip strip`);
    const target = (await page.isVisible('.av-overview')) ? '.av-overview' : '.av-wave';
    const box = await page.$eval(target, (w) => { const r = w.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
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

  // ---------- Book reader (/doctors/books/obesity-expertise/) ----------
  const R = '/doctors/books/obesity-expertise/b0/';
  for (const theme of ['light', 'dark']) {
    const ctx = await context({ width: 1280, height: 900 }, { theme });
    const page = await ctx.newPage();
    await page.goto(BASE + R);
    const res = await page.evaluate(() => {
      const rd = document.getElementById('rd'); const probe = document.createElement('span'); rd.append(probe);
      const rgb = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color.match(/[\d.]+/g).map(Number).slice(0, 3); };
      const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const pairs = [['--ink', '--bg'], ['--ink-2', '--bg'], ['--ink-3', '--bg'], ['--ink-3', '--surface-2'], ['--b-ink', '--bg'], ['--b-ink', '--b-tint'],
        ['--mk', '--mk-tint'], ['--q', '--surface'], ['--warn-c', '--bg'], ['--brand-ink', '--b-ink']];
      return { bg: getComputedStyle(rd).backgroundColor, pairs: pairs.map(([a, b]) => [a, b, ratio(a, b)]) };
    });
    for (const [a, b, r] of res.pairs) check(r >= 4.5, `reader contrast ${theme}: ${a} on ${b} = ${r.toFixed(2)}`);
    check(res.bg === (theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'), `reader background is ${theme === 'dark' ? 'pure black' : 'white'} (${res.bg})`);
    await ctx.close();
  }
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await context(vp);
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + R + '#b0-r0-c06');
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(800);
    check(/^A6 /.test(await page.locator('#rd-where').textContent()), `${name}: a section link lands on that section (A6)`);
    check(await overflow(page) <= 0, `${name}: reader has no sideways scroll`);
    const sup = await page.locator('.rd-body sup').count();
    check(sup > 0, `${name}: superscripts render as <sup>`);
    const raw = await page.evaluate(() => [...document.querySelectorAll('.rd-body')].map((b) => b.textContent).join('').match(/\^/g)?.length ?? 0);
    check(raw === 0, `${name}: no raw caret reaches the page`);
    // Practice: try, then reveal, then mark.
    const q = page.locator('#b0-r0-c06 .q-practice').first();
    await q.locator('.q-reveal').click();
    check(await q.locator('.q-ans').isVisible(), `${name}: practice answer opens`);
    await q.locator('[data-mark="got"]').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('book:B0:v1')).practice);
    check(Object.values(saved).some((m) => m.mark === 'got'), `${name}: practice mark is kept`);
    // Glossary tap.
    await page.locator('#b0-r0-c06 dfn').first().click();
    check(await page.locator('#rd-pop').isVisible() && /First taught/.test(await page.locator('#rd-pop').textContent()), `${name}: tapping a term shows its plain-words definition`);
    await page.keyboard.press('Escape');
    // Bookmark, then text size keeps the place.
    await page.locator('#rd-mark').click();
    check((await page.evaluate(() => JSON.parse(localStorage.getItem('book:B0:v1')).bookmarks.length)) === 1, `${name}: bookmark is saved`);
    const before = await page.locator('#rd-where').textContent();
    await page.locator('#rd-aa').click();
    await page.locator('[data-size="4"]').click();
    await page.waitForTimeout(600);
    check(await page.locator('#rd-where').textContent() === before, `${name}: a new text size keeps the place (${before})`);
    // Reload: resumes where you were.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.goto(BASE + R);
    await page.waitForTimeout(1200);
    const back = await page.locator('#rd-where').textContent();
    check(back === before, `${name}: reopening the book returns to your place (${back})`);
    check(errs.length === 0, `${name}: reader has no script errors ${errs.join(' | ')}`);
    // Review: the question just marked comes back; marking it there records a review.
    // (Changed from the Review page: the book page saves its own copy when it is left.)
    await page.goto(BASE + R + 'review/');
    await page.evaluate(() => { const k = 'book:B0:v1'; const s = JSON.parse(localStorage.getItem(k)); s.attempts.forEach((a) => { a.correct = false; }); s.attempts.forEach((a) => { s.practice[a.item].mark = 'missed'; }); s.done = []; localStorage.setItem(k, JSON.stringify(s)); });
    await page.reload();
    await page.waitForSelector('.rv-card .q, .rv-done');
    check(await page.locator('.rv-card .q').count() === 1, `${name}: Review shows the missed question`);
    check((await page.locator('.rv-count').textContent()).includes('of'), `${name}: Review counts its items`);
    await page.locator('.rv-card .q-reveal').click();
    await page.locator('.rv-card [data-mark="got"]').click();
    await page.waitForSelector('.rv-done');
    check(/Done: 1 reviewed/.test(await page.locator('.rv-done').textContent()), `${name}: Review finishes and says what was done`);
    const reviewed = await page.evaluate(() => JSON.parse(localStorage.getItem('book:B0:v1')).attempts.filter((a) => a.activity === 'review').length);
    check(reviewed === 1, `${name}: the review mark is recorded`);
    check(await overflow(page) <= 0, `${name}: Review has no sideways scroll`);
    check(await page.locator('.rd-bar .rd-dl').count() === 0, `${name}: no PDF button in the top bar`);
    await page.goto(BASE + '/doctors/books/obesity-expertise/');
    check(await page.locator('#continue').isVisible(), `${name}: series page shows Continue reading after reading`);
    check(await overflow(page) <= 0, `${name}: series page has no sideways scroll`);
    await ctx.close();
  }

  // ---------- Statistics book in the reader (/doctors/books/statistics-first-principles-to-regression/read/) ----------
  const SB = '/doctors/books/statistics-first-principles-to-regression/';
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await context(vp);
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + SB);
    check(await page.locator(`a.btn[href="${SB}read/"]`).count() === 1, `${name}: the book's page offers "Read online"`);
    await page.goto(BASE + SB + 'read/#c04-s02');
    await page.waitForSelector('#c04-s02 .rd-body[data-state="done"]');
    await page.waitForTimeout(700);
    check(/^4\.2 /.test(await page.locator('#rd-where').textContent()), `${name}: a section link lands on that section (4.2)`);
    check(await overflow(page) <= 0, `${name}: Statistics reader has no sideways scroll`);
    const sec = page.locator('#c04-s02');
    check(await sec.locator('h4.hd[data-num="4.2.1"]').count() === 1, `${name}: the book's own sub-headings are there (4.2.1)`);
    check((await sec.locator('.lab span').allTextContents()).includes('Simplified Explanation'), `${name}: the book's own labels are used as written`);
    check(await sec.locator('figure img').count() >= 3, `${name}: figures are in the page`);
    check(await sec.locator('figure img').first().getAttribute('alt') !== '', `${name}: a figure has its alt text`);
    // A checkpoint: try, then reveal the model answer, then mark.
    const q = sec.locator('.q-checkpoint').first();
    await q.locator('.q-reveal').click();
    check(await q.locator('.q-ans').isVisible() && /Hide model answer/.test(await q.locator('.q-reveal').textContent()), `${name}: a checkpoint's model answer opens`);
    await q.locator('[data-mark="missed"]').click();
    const marks = await page.evaluate(() => JSON.parse(localStorage.getItem('book:stats:v1')).practice);
    check(marks['c04-s02-q1']?.mark === 'missed', `${name}: the checkpoint mark is kept`);
    // A § reference goes to its place and offers the way back.
    await page.locator('#c04-s02 a.xref', { hasText: '§4.3.1' }).first().click();
    await page.waitForSelector('#c04-s03 .rd-body[data-state="done"]');
    await page.waitForTimeout(700);
    check(/^4\.3 /.test(await page.locator('#rd-where').textContent()), `${name}: a § link goes to that section (4.3)`);
    check(await page.locator('#rd-toast [data-go]').isVisible(), `${name}: a § jump offers the way back`);
    await page.locator('#rd-toast [data-go]').click();
    await page.waitForTimeout(500);
    check(/^4\.2 /.test(await page.locator('#rd-where').textContent()), `${name}: "Back to where you were" returns to 4.2`);
    // R code and its output, and the references list.
    await page.goto(BASE + SB + 'read/#c09-s01');
    await page.waitForSelector('#c09-s01 .rd-body[data-state="done"]');
    check(await page.locator('#c09-s01 pre.sourceCode').count() > 0 && await page.locator('#c09-s01 pre.output').count() > 0, `${name}: R code and its output are in code boxes`);
    await page.goto(BASE + SB + 'read/#refs');
    await page.waitForSelector('#refs .rd-body[data-state="done"]');
    check(await page.locator('#refs ol li').count() > 200, `${name}: the references list is there`);
    check(await page.locator('#refs a.xref').count() === 0, `${name}: NIST § numbers in the references are not turned into links`);
    check(errs.length === 0, `${name}: Statistics reader has no script errors ${errs.join(' | ')}`);
    // Review: the missed checkpoint question comes back.
    await page.goto(BASE + SB + 'read/review/');
    await page.waitForSelector('.rv-card .q, .rv-done');
    check(/Checkpoint 4\.1 · question 1 of 3/.test(await page.locator('.rv-card .rv-kind').textContent()), `${name}: Review brings back the missed checkpoint question`);
    await page.locator('.rv-card .q-reveal').click();
    check(/Model answer/.test(await page.locator('.rv-card .q-ans-label').textContent()), `${name}: Review shows its model answer`);
    check(await overflow(page) <= 0, `${name}: Statistics Review has no sideways scroll`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (started) try { execSync('npx astro preview stop', { stdio: 'ignore' }); } catch {}
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
