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
        ['--mk', '--mk-tint'], ['--q', '--surface'], ['--warn-c', '--bg'], ['--brand-ink', '--b-ink'],
        ['--ink', '--hl-0'], ['--ink', '--hl-1'], ['--ink', '--hl-2'], ['--ink', '--hl-3'], ['--ink', '--hl-flash']];
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

  // ---------- Figure viewer (tap a figure; pinch, double-tap, wheel, keys; Back closes it) ----------
  // The figures live on R2, which tests cannot reach: a stand-in picture of the same size is served instead.
  const FIG = `<svg xmlns="http://www.w3.org/2000/svg" width="1745" height="546"><rect width="100%" height="100%" fill="#cfe8ff"/><text x="60" y="290" font-size="90">Figure</text></svg>`;
  for (const [name, vp, touch] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route('https://files.drharshmaheshwari.com/books/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: FIG, headers: { 'access-control-allow-origin': '*' } }));
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + R + '#b0-r0-c02');
    await page.waitForSelector('#b0-r0-c02 .fig img');
    await page.waitForFunction(() => document.querySelector('#b0-r0-c02 .fig img').complete);
    const paras = await page.evaluate(() => document.querySelectorAll('#b0-r0-c02 [data-p]').length);
    const url = page.url();
    await page.locator('#b0-r0-c02 .fig-zoom').first().click();
    check(await page.locator('#rd-zoom').isVisible(), `${name}: tapping the enlarge button opens the figure viewer`);
    const scale = () => page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.rd-zoom-sheet').style.transform)?.[1] ?? 0));
    const fitted = await page.evaluate(() => [document.querySelector('.rd-zoom-sheet img').getBoundingClientRect().width, document.querySelector('.rd-zoom-stage').clientWidth]);
    check(fitted[0] > 300 && fitted[0] <= fitted[1], `${name}: the picture fits the screen (${Math.round(fitted[0])} of ${fitted[1]} px)`);
    check(await page.evaluate(() => document.activeElement?.dataset.z === 'close'), `${name}: focus moves into the viewer`);
    await page.keyboard.press('+');
    check(Math.abs(await scale() - 1.5) < .01, `${name}: + zooms in`);
    await page.keyboard.press('0');
    check(await scale() === 1, `${name}: 0 fits again`);
    await page.locator('[data-z="in"]').click(); await page.locator('[data-z="in"]').click();
    check(Math.abs(await scale() - 2.25) < .01, `${name}: the + button zooms`);
    const box = await page.locator('.rd-zoom-stage').boundingBox();
    const before = await page.evaluate(() => document.querySelector('.rd-zoom-sheet').style.transform);
    if (touch) {
      const c = await ctx.newCDPSession(page);
      const t = (type, pts) => c.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await t('touchStart', [{ x: box.x + 250, y: box.y + 200, id: 1 }]); await t('touchMove', [{ x: box.x + 150, y: box.y + 200, id: 1 }]); await t('touchEnd', []);
      check(before !== await page.evaluate(() => document.querySelector('.rd-zoom-sheet').style.transform), `${name}: dragging moves a zoomed picture`);
      await page.keyboard.press('0');
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await t('touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }]);
      await t('touchMove', [{ x: cx - 120, y: cy, id: 1 }, { x: cx + 120, y: cy, id: 2 }]); await t('touchEnd', []);
      check(await scale() > 2.4, `${name}: pinching zooms`);
      await page.keyboard.press('0');
      const tap = async () => { await t('touchStart', [{ x: cx, y: cy, id: 1 }]); await t('touchEnd', []); };
      await tap(); await page.waitForTimeout(80); await tap();
      check(await scale() > 2, `${name}: double-tap zooms in`);
      await tap(); await page.waitForTimeout(80); await tap();
      check(await scale() === 1, `${name}: double-tap again fits`);
    } else {
      await page.mouse.move(box.x + 300, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 200, { steps: 4 }); await page.mouse.up();
      check(before !== await page.evaluate(() => document.querySelector('.rd-zoom-sheet').style.transform), `${name}: dragging moves a zoomed picture`);
      await page.keyboard.press('0');
      await page.mouse.move(box.x + 400, box.y + 200); await page.mouse.wheel(0, -400);
      check(await scale() > 1.2, `${name}: the wheel zooms`);
      const y = await page.evaluate(() => scrollY); await page.mouse.wheel(0, 300);
      check(await page.evaluate(() => scrollY) === y, `${name}: the page behind does not scroll`);
    }
    await page.goBack();
    await page.waitForTimeout(200);
    check(!await page.locator('#rd-zoom').isVisible() && page.url() === url, `${name}: Back closes the viewer and stays in the book`);
    await page.locator('#b0-r0-c02 .fig img').first().click();
    check(await page.locator('#rd-zoom').isVisible(), `${name}: clicking the picture opens the viewer`);
    await page.keyboard.press('Escape');
    check(!await page.locator('#rd-zoom').isVisible() && await page.evaluate(() => document.activeElement?.classList.contains('fig-zoom')), `${name}: Escape closes it and focus returns to the figure's button`);
    check(await page.evaluate(() => document.querySelectorAll('#b0-r0-c02 [data-p]').length) === paras, `${name}: the enlarge button does not change paragraph numbers (saved places stay valid)`);
    check(await overflow(page) <= 0, `${name}: no sideways scroll with the viewer`);
    check(errs.length === 0, `${name}: figure viewer has no script errors ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ---------- Highlights and notes (selecting text, the bar, the card, options under Aa, the Notes tab) ----------
  // Text is selected from the script (a touch long-press cannot be driven here); how it feels on a real phone is checked by hand.
  const pick = (page, n, a, b, sec = 'b0-r0-c06') => page.evaluate(([sec, n, a, b]) => {
    const p = document.querySelectorAll(`#${sec} .prose .c > p`)[n];
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let pos = 0, node, sn, so, en, eo;
    while ((node = w.nextNode())) { const L = node.data.length; if (sn == null && a < pos + L) { sn = node; so = a - pos; } if (en == null && b <= pos + L) { en = node; eo = b - pos; break; } pos += L; }
    const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return r.toString();
  }, [sec, n, a, b]);
  const liveHl = async (page) => (await page.evaluate(() => JSON.parse(localStorage.getItem('book:B0:v1') ?? '{}').highlights ?? [])).filter((h) => !h.deleted);
  for (const [name, vp, touch] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, acceptDownloads: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + R + '#b0-r0-c06');
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(700);
    const quote = await pick(page, 0, 5, 40);
    await page.waitForTimeout(500);
    check(await page.locator('#rd-sel').isVisible(), `${name}: selecting text shows the bar by default`);
    const bb = await page.locator('#rd-sel').boundingBox();
    check(bb.x >= 0 && bb.x + bb.width <= vp.width && bb.y >= 0 && bb.y + bb.height <= vp.height, `${name}: the bar is on screen`);
    await page.locator('#rd-sel [data-colour="2"]').click();
    let hs = await liveHl(page);
    check(hs.length === 1 && hs[0].colour === 2 && hs[0].quote === quote, `${name}: a colour in the bar makes the highlight`);
    check(!await page.locator('#rd-sel').isVisible() && await page.evaluate(() => getSelection().isCollapsed), `${name}: the bar closes and the selection clears`);
    check(await page.evaluate(() => CSS.highlights.get('hl-2')?.size) === 1, `${name}: the highlight is painted`);
    const at = await page.evaluate(() => { const c = [...CSS.highlights.get('hl-2')][0].getClientRects()[0]; return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; });
    await (touch ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y));
    await page.waitForTimeout(150);
    check(await page.locator('#rd-hl').isVisible(), `${name}: tapping a highlight opens its card`);
    const cb = await page.locator('#rd-hl').boundingBox();
    check(cb.x >= 0 && cb.x + cb.width <= vp.width + 1 && cb.y + cb.height <= vp.height + 1, `${name}: the card is on screen`);
    await page.locator('#rd-hl .rd-hl-note').fill('Check this against the table');
    await page.waitForTimeout(700);
    check((await liveHl(page))[0].note === 'Check this against the table', `${name}: the note is saved as you type`);
    check(await page.evaluate(() => CSS.highlights.get('hl-2n')?.size) === 1, `${name}: a highlight with a note is underlined`);
    await page.locator('#rd-hl [data-colour="1"]').click();
    check((await liveHl(page))[0].colour === 1, `${name}: the card changes the colour`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await page.reload();
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(600);
    check(await page.evaluate(() => CSS.highlights.get('hl-1n')?.size) === 1, `${name}: it is painted again after reopening the book`);
    await pick(page, 1, 3, 30);
    await page.waitForTimeout(500);
    await page.locator('#rd-sel [data-act="note"]').click();
    check(await page.locator('#rd-hl').isVisible() && await page.evaluate(() => document.activeElement?.classList.contains('rd-hl-note')), `${name}: Note makes the highlight and puts the cursor in the note box`);
    await page.keyboard.type('second note');
    await page.keyboard.press('Escape');
    check((await liveHl(page)).length === 2 && (await liveHl(page))[1].note === 'second note', `${name}: closing the card keeps the note`);
    await pick(page, 2, 2, 25);
    await page.keyboard.press('h');
    check((await liveHl(page)).length === 3, `${name}: the H key highlights the selection`);
    // Options under Aa: "Highlight" makes it at once and opens nothing; "Nothing" leaves selection alone.
    await page.locator('#rd-aa').click();
    await page.locator('[data-select="quick"]').click();
    await page.mouse.click(5, 5);
    await pick(page, 3, 2, 25);
    await page.waitForTimeout(touch ? 1000 : 600);
    check((await liveHl(page)).length === 4 && !await page.locator('#rd-sel').isVisible() && !await page.locator('#rd-hl').isVisible() && await page.evaluate(() => getSelection().isCollapsed), `${name}: Highlight mode highlights at once and opens nothing`);
    await page.locator('#rd-aa').click();
    await page.locator('[data-select="off"]').click();
    await page.mouse.click(5, 5);
    await pick(page, 4, 2, 25);
    await page.waitForTimeout(700);
    check((await liveHl(page)).length === 4 && !await page.locator('#rd-sel').isVisible() && !await page.evaluate(() => getSelection().isCollapsed), `${name}: Nothing leaves selecting text to the browser`);
    await page.locator('#rd-aa').click();
    await page.locator('[data-opt="show"]').click();
    check(await page.evaluate(() => CSS.highlights.size) === 0, `${name}: "Show my highlights" off paints none`);
    await page.locator('[data-opt="show"]').click();
    check(await page.evaluate(() => CSS.highlights.size) > 0, `${name}: and on paints them again`);
    await page.mouse.click(5, 5);
    // Notes tab, Markdown export, jump to a highlight, remove
    if (touch) await page.locator('.rd-menu').click();
    await page.locator('[data-tab="notes"]').click();
    check(await page.locator('.rd-notes .rd-nt').count() === 4, `${name}: the Notes tab lists every highlight`);
    check((await page.locator('.rd-nt-body').allTextContents()).some((t) => /second note/.test(t)), `${name}: and shows the notes`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-notes="download"]').click()]);
    const md = readFileSync(await dl.path(), 'utf8');
    check(/^# Notes: Book 0/.test(md) && /^> /m.test(md) && /second note/.test(md) && /CC BY-NC-SA/.test(md), `${name}: Download gives a Markdown file of the highlights and notes`);
    await page.locator('.rd-notes .rd-nt').first().click();
    await page.waitForTimeout(500);
    check(await page.locator('#rd-hl').isVisible(), `${name}: tapping an entry goes to the highlight and opens its card`);
    check(await overflow(page) <= 0, `${name}: no sideways scroll with highlights`);
    await page.locator('#rd-hl [data-act="remove"]').click();
    check((await liveHl(page)).length === 3, `${name}: Remove deletes the highlight`);
    check(errs.length === 0, `${name}: highlights have no script errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  // A new version of the book: a highlight that moved is found again by its words; one whose words are gone is listed, not misplaced.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(BASE + R + '#b0-r0-c06');
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(600);
    for (const [n, c] of [[0, 3], [1, 2]]) { await pick(page, n, 2, 30); await page.waitForTimeout(500); await page.locator(`#rd-sel [data-colour="${c}"]`).click(); }
    await page.goto(BASE + '/about/'); // edit the saved copy from another page: the book page rewrites its own on leaving
    await page.evaluate(() => { const k = 'book:B0:v1'; const s = JSON.parse(localStorage.getItem(k)); s.highlights[0].start += 7; s.highlights[0].end += 7; s.highlights[1].quote = 'words that no longer exist in the book'; localStorage.setItem(k, JSON.stringify(s)); });
    await page.goto(BASE + R + '#b0-r0-c06');
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(800);
    check(await page.evaluate(() => CSS.highlights.get('hl-3')?.size) === 1 && !await page.evaluate(() => CSS.highlights.has('hl-2')), 'a moved highlight is found by its words; one whose words are gone is not painted');
    await page.locator('[data-tab="notes"]').click();
    await page.waitForTimeout(300);
    check((await page.locator('.rd-nt .flag').allTextContents()).some((t) => /text changed/.test(t)), 'and it is listed as "text changed in this version"');
    await ctx.close();
  }

  // ---------- Ask AI (off by default; a question on the clipboard, optionally opened in ChatGPT/Claude; nothing is sent from the site) ----------
  for (const [name, vp, touch] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(/chatgpt\.com|claude\.ai|gemini\.google\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>assistant</title>' }));
    const page = await ctx.newPage();
    const errs = errorsOf(page);
    await page.goto(BASE + R + '#b0-r0-c06');
    await page.waitForSelector('#b0-r0-c06 .rd-body[data-state="done"]');
    await page.waitForTimeout(700);
    const clip = () => page.evaluate(() => navigator.clipboard.readText());
    check(await page.locator('[data-ask-sec]').first().isHidden(), `${name}: no Ask AI button on headings until switched on`);
    await pick(page, 0, 5, 40);
    await page.waitForTimeout(500);
    check(await page.locator('#rd-sel [data-act="ask"]').isHidden(), `${name}: no Ask AI in the bar until switched on`);
    await page.mouse.click(5, 5);
    await page.locator('#rd-aa').click();
    check(await page.locator('#rd-aa-ai').isHidden(), `${name}: the AI settings are hidden until switched on`);
    await page.locator('[data-opt="ai"]').click();
    check(await page.locator('#rd-aa-ai').isVisible() && await page.locator('[data-ask-sec]').first().isVisible(), `${name}: switching it on shows its settings and the heading buttons`);
    await page.locator('[data-opt="aiHeads"]').click();
    check(await page.locator('[data-ask-sec]').first().isHidden(), `${name}: heading buttons can be turned off on their own`);
    await page.locator('[data-opt="aiHeads"]').click();
    await page.mouse.click(5, 5);
    const quote = await pick(page, 0, 5, 40);
    await page.waitForTimeout(500);
    await page.locator('#rd-sel [data-act="ask"]').click();
    await page.waitForTimeout(300);
    const q1 = await clip();
    check(q1.includes(quote) && /Passage:/.test(q1) && /section A6/.test(q1) && /Explain this in plain words/.test(q1), `${name}: Ask AI copies a question with the passage`);
    check(/copied/i.test(await page.locator('#rd-toast').textContent()), `${name}: and says so`);
    check((await liveHl(page)).length === 0, `${name}: asking does not make a highlight`);
    // Open with ChatGPT; ask it to quiz.
    await page.locator('#rd-aa').click();
    await page.locator('[data-aiwith="chatgpt"]').click();
    await page.locator('[data-aitask="quiz"]').click();
    await page.mouse.click(5, 5);
    await pick(page, 1, 3, 40);
    await page.waitForTimeout(500);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('#rd-sel [data-act="ask"]').click()]);
    check(popup.url().startsWith('https://chatgpt.com/?q=') && /three%20short%20questions/.test(popup.url()), `${name}: with ChatGPT it opens a new tab with the question filled in`);
    await popup.close();
    check(/three short questions/.test(await clip()), `${name}: and the question is also on the clipboard`);
    // A heading button, and a highlight's card.
    await page.locator('#rd-aa').click();
    await page.locator('[data-aiwith="copy"]').click();
    await page.mouse.click(5, 5);
    await page.locator('[data-ask-sec="b0-r0-c06"]').click();
    await page.waitForTimeout(300);
    check(/I have not pasted the text/.test(await clip()) && /A6/.test(await clip()), `${name}: the heading button asks about the concept alone`);
    check(await overflow(page) <= 0, `${name}: no sideways scroll with the heading buttons`);
    await pick(page, 2, 2, 25);
    await page.waitForTimeout(500);
    await page.locator('#rd-sel [data-act="note"]').click();
    await page.keyboard.type('why a minus sign?');
    await page.locator('#rd-hl [data-act="ask"]').click();
    await page.waitForTimeout(300);
    check(/My note on it: why a minus sign\?/.test(await clip()), `${name}: a highlight's card asks with its note`);
    await page.keyboard.press('Escape');
    await page.locator('#rd-aa').click();
    await page.locator('[data-opt="ai"]').click();
    check(await page.locator('[data-ask-sec]').first().isHidden() && await page.locator('#rd-aa-ai').isHidden(), `${name}: switching it off hides everything again`);
    check(errs.length === 0, `${name}: Ask AI has no script errors ${errs.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (started) try { execSync('npx astro preview stop', { stdio: 'ignore' }); } catch {}
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
