// /trackers/person/#<id>: one person's readings. Add, edit and delete BP, sugar and weight; charts and lists; the
// soft alert (on this screen only); share links for the doctor; CSV download. The person is chosen by the address
// hash, so one static page serves everyone.

import qrcode from 'qrcode-generator';
import {
  ageOn, askToRepeat, bmiFor, bpAverage, fromInputs, isAdult, toInputs, validBp, validSugar,
  LIMITS, RANGE, SAMPLE_NAME, SETTING_NAME, TEST_NAME, type BpReading, type BpValue, type Person, type Reading,
  type SugarReading, type SugarTest, type WeightReading,
} from '../lib/trackers';
import { alertBox, bpSection, esc, historyLine, sugarSection, weightSection } from './render';
import { w } from '../i18n/client';
import { langOf } from '../i18n/languages';
import { TrackerStore, listShares, makeShare, newId, shareUrl, stopShare, type Share } from './store';
import { unitFieldHTML, type Kind as UnitKind } from '../lib/units';
import { initUnitFields, setUnitValue, unitShown, unitValue } from '../scripts/unit-fields';

type Kind = 'bp' | 'sugar' | 'weight';
const STATUS = { syncing: w('Saving…'), synced: w('Saved to your account.'), offline: w('Not connected: saved on this device and will upload when you are back online.') };
// Links stay in the page's language: /hi/trackers/ from /hi/trackers/person/ (src/i18n/routes.ts, LOCAL_PAGES).
const LANG_PREFIX = langOf(location.pathname) === 'en' ? '' : `/${langOf(location.pathname)}`;
const HOME = `${LANG_PREFIX}/trackers/`;
// Fixed texts from src/lib/trackers.ts shown here (listed for src/components/ClientWords.astro; render.ts lists the rest):
// w('Fasting (FBS)') w('2 h after a meal (PPBS)') w('Random (RBS)') w('HbA1c') w("Doctor's clinic") w('Home or work')
const tzNow = () => -new Date().getTimezoneOffset();
// Every number with a unit converts on a click of its unit (CLAUDE.md, "Units everywhere"): BP mmHg/kPa, sugar mg/dL/mmol/L,
// weight kg/lb, height cm/ft+in. The page reads them in the base unit with unitValue().
const uf = (id: string, kind: UnitKind, label: string, placeholder: number) => unitFieldHTML({ id, kind, label, placeholder }, w);
const field = (label: string, html: string) => `<div class="tk-f"><span>${label}</span>${html}</div>`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString(document.documentElement.lang || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function mountPerson(root: HTMLElement, store: TrackerStore, id: string) {
  let open: { kind: Kind; edit?: Reading; asked?: boolean; rows?: number } | null = null;
  let flash: { kind: Kind; html: string } | null = null;
  let editingPerson = false;
  let shares: Share[] | null = null;
  let shareMsg = '';
  let qrFor = '';

  const person = () => store.person(id);

  // ---------- forms ----------
  const when = (r?: Reading, timeOptional = false) => {
    const v = r ? toInputs(r.at, r.tz) : toInputs(Date.now(), tzNow());
    return `<div class="tk-grid">
      <label class="tk-f">${w('Date')}<input type="date" name="date" value="${v.date}" max="${toInputs(Date.now(), tzNow()).date}" required></label>
      <label class="tk-f">${w('Time')}${timeOptional ? ` <span class="tk-hint">${w('(optional)')}</span>` : ''}<input type="time" name="time" value="${v.time}"></label>
    </div>`;
  };
  const note = (r?: Reading) => `<label class="tk-f">${w('Note')} <span class="tk-hint">${w('(optional, e.g. "missed my tablet")')}</span><input name="note" maxlength="${LIMITS.note}" value="${esc(r?.note ?? '')}" autocomplete="off"></label>`;
  const buttons = (label = w('Save')) => `<p class="tk-err" role="alert" hidden></p><div class="tk-row-btns"><button class="btn btn-primary" type="submit">${label}</button><button class="btn btn-ghost" type="button" data-cancel>${w('Cancel')}</button></div>`;

  function bpForm(r?: BpReading, rows = r?.values.length ?? 1, asked = false) {
    const vals: (BpValue | null)[] = Array.from({ length: rows }, (_, i) => r?.values[i] ?? null);
    const setting = r?.setting ?? 'home';
    return `<form class="tk-form" data-form="bp" novalidate>
      <h3>${r ? w('Edit blood pressure') : w('Add blood pressure')}</h3>
      <fieldset><legend>${w('Where was it measured?')}</legend><div class="tk-seg">
        ${(['home', 'clinic'] as const).map((s) => `<label><input type="radio" name="setting" value="${s}" ${s === setting ? 'checked' : ''}><span>${w(SETTING_NAME[s])}</span></label>`).join('')}
      </div></fieldset>
      ${vals.map((v, i) => `<fieldset><legend>${rows > 1 ? w('Reading {n}', { n: i + 1 }) : w('Reading')}</legend><div class="tk-grid">
        ${field(w('Systolic (top)'), uf(`tk-s${i}`, 'pressure', w('Reading {n}: systolic', { n: i + 1 }), 120))}
        ${field(w('Diastolic (bottom)'), uf(`tk-d${i}`, 'pressure', w('Reading {n}: diastolic', { n: i + 1 }), 80))}
        <label class="tk-f">${w('Pulse')} <span class="tk-hint">${w('(optional, per minute)')}</span><input name="p${i}" type="number" data-unitless inputmode="numeric" min="${RANGE.p[0]}" max="${RANGE.p[1]}" value="${v?.p ?? ''}" placeholder="72"></label>
      </div></fieldset>`).join('')}
      ${asked ? `<div class="tk-alert" role="note">${w('<b>This reading is very high.</b> Sit quietly and measure again after 1–2 minutes, and enter it as reading 2. The two are averaged. If you cannot measure again now, just save.')}</div>` : ''}
      ${rows < LIMITS.bpPerSitting ? `<button type="button" class="tk-link" data-more>${w('+ Another reading at this sitting')}</button>` : ''}
      ${when(r)}${note(r)}
      <p class="small muted" style="margin:0">${w('Sit for 5 minutes first, back supported, feet flat, arm resting at heart level. Take two readings 1 minute apart and enter both.')}</p>
      ${buttons()}
    </form>`;
  }

  function sugarForm(r?: SugarReading, test: SugarTest = r?.test ?? 'fbs') {
    const pct = test === 'hba1c';
    const shown = r && r.test === 'hba1c' ? r.value.toFixed(1) : '';
    return `<form class="tk-form" data-form="sugar" novalidate>
      <h3>${r ? w('Edit blood sugar') : w('Add blood sugar')}</h3>
      <fieldset><legend>${w('Which test?')}</legend><div class="tk-seg">
        ${(['fbs', 'ppbs', 'rbs', 'hba1c'] as const).map((t) => `<label><input type="radio" name="test" value="${t}" ${t === test ? 'checked' : ''}><span>${w(TEST_NAME[t])}</span></label>`).join('')}
      </div></fieldset>
      ${pct ? '' : `<fieldset><legend>${w('How was it measured?')}</legend><div class="tk-seg">
        ${(['lab', 'meter'] as const).map((s) => `<label><input type="radio" name="sample" value="${s}" ${s === (r?.sample ?? 'lab') ? 'checked' : ''}><span>${s === 'lab' ? w('Lab blood test') : w('Glucometer (finger-prick)')}</span></label>`).join('')}
      </div></fieldset>`}
      <div class="tk-grid">
        ${pct ? `<label class="tk-f">${w('HbA1c in %')}<input name="value" type="number" data-unitless inputmode="decimal" step="0.1" value="${shown}" placeholder="6.2"></label>`
          : field(w('Value'), uf('tk-glu', 'glucose', w('Blood sugar'), 110))}
      </div>
      ${test === 'ppbs' ? `<p class="small muted" style="margin:0">${w('2 hours after the start of a meal.')}</p>` : ''}
      ${when(r, pct)}${note(r)}${buttons()}
    </form>`;
  }

  function weightForm(r?: WeightReading) {
    return `<form class="tk-form" data-form="weight" novalidate>
      <h3>${r ? w('Edit weight') : w('Add weight')}</h3>
      ${field(w('Weight'), uf('tk-kg', 'weight', w('Weight'), 66))}
      ${when(r, true)}${note(r)}${buttons()}
    </form>`;
  }

  function personForm(p: Person) {
    const [y, m] = p.born.split('-');
    const months = [w('January'), w('February'), w('March'), w('April'), w('May'), w('June'), w('July'), w('August'), w('September'), w('October'), w('November'), w('December')];
    const sel = (n: 'htn' | 'dm' | 'meds', l: string) => `<label class="tk-f">${l}<select name="${n}">${[['', '—'], ['yes', w('Yes')], ['no', w('No')], ['unsure', w('Not sure')]].map(([v, t]) => `<option value="${v}" ${(p[n] ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    return `<form class="tk-form" data-form="person" novalidate>
      <h3>${w('Edit details')}</h3>
      <label class="tk-f">${w('Name')}<input name="label" maxlength="${LIMITS.label}" value="${esc(p.label)}" required></label>
      <div class="tk-grid">
        <label class="tk-f">${w('Month of birth')}<select name="month">${months.map((n, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${v === m ? 'selected' : ''}>${n}</option>`; }).join('')}</select></label>
        <label class="tk-f">${w('Year of birth')}<input name="year" type="number" data-unitless inputmode="numeric" value="${y}"></label>
      </div>
      <fieldset><legend>${w('Sex')}</legend><div class="tk-seg"><label><input type="radio" name="sex" value="m" ${p.sex === 'm' ? 'checked' : ''}><span>${w('Male')}</span></label><label><input type="radio" name="sex" value="f" ${p.sex === 'f' ? 'checked' : ''}><span>${w('Female')}</span></label></div></fieldset>
      ${field(`${w('Height')} <span class="tk-hint">${w('(optional)')}</span>`, uf('tk-eheight', 'height', w('Height'), 165))}
      <div class="tk-grid">${sel('htn', w('Known high BP?'))}${sel('dm', w('Known diabetes?'))}${sel('meds', w('On medicines for either?'))}</div>
      ${buttons()}
      <p class="small" style="margin:0"><button type="button" class="tk-link danger" data-remove>${w('Remove {name} and all their readings', { name: esc(p.label) })}</button></p>
    </form>`;
  }

  // ---------- drawing ----------
  function draw(keep = false) {
    const kept = keep ? snapshot() : null;
    const p = person();
    if (!p) {
      root.innerHTML = `<div class="tk-card"><p>${store.state === 'syncing' ? w('Loading…') : w('This person is not in your trackers (they may have been removed).')}</p><p><a href="${HOME}">${w('All trackers')}</a></p></div>`;
      return;
    }
    document.title = w('{name} · Trackers · Dr. Harsh Maheshwari', { name: p.label });
    const h1 = document.querySelector('.page-head h1');
    if (h1) h1.textContent = p.label;
    const rs = store.readings(id);
    const age = ageOn(p.born, new Date());
    const bmi = bmiFor(p, rs);
    const o = { alerts: true, editable: true, width: root.clientWidth - 42 };
    const sec = (kind: Kind, title: string, body: string) => `<section class="tk-card" id="tk-${kind}">
      <div class="tk-sec-head"><h2>${title}</h2><button class="btn btn-ghost" type="button" data-open="${kind}">${w('+ Add')}</button></div>
      ${flash?.kind === kind ? flash.html : ''}
      ${open?.kind === kind ? `<div class="tk-card" style="margin:.75rem 0;background:var(--surface-2)">${formFor(open.kind)}</div>` : ''}
      <div style="margin-top:1rem">${body}</div>
    </section>`;
    root.innerHTML = `
      <section class="tk-card">
        <p class="muted" style="margin:0">${w('{age} years', { age: String(age) })} · ${p.sex === 'm' ? w('Male') : w('Female')}${p.heightCm ? ` · ${p.heightCm} cm` : ''}${bmi ? ` · ${w('BMI {bmi}', { bmi })}` : ''}</p>
        ${historyLine(p) ? `<p class="small muted" style="margin:.35rem 0 0">${esc(historyLine(p))}</p>` : ''}
        ${editingPerson ? `<div style="margin-top:1rem">${personForm(p)}</div>` : `<p class="small" style="margin:.6rem 0 0"><button type="button" class="tk-link" data-editperson>${w('Edit details')}</button></p>`}
        <div class="tk-add" style="margin-top:1rem">
          <button class="btn btn-primary" type="button" data-open="bp">${w('+ Blood pressure')}</button>
          <button class="btn btn-primary" type="button" data-open="sugar">${w('+ Blood sugar')}</button>
          <button class="btn btn-ghost" type="button" data-open="weight">${w('+ Weight')}</button>
        </div>
        <p class="tk-status" style="margin-top:.75rem">${STATUS[store.state]}</p>
      </section>
      ${sec('bp', w('Blood pressure'), bpSection(rs, o))}
      ${sec('sugar', w('Blood sugar'), sugarSection(rs, o))}
      ${sec('weight', w('Weight'), weightSection(p, rs, o))}
      <section class="tk-card" id="tk-share">${shareHtml(p)}</section>
      <p class="small"><button type="button" class="tk-link" data-csv>${w('Download all readings (CSV)')}</button> · <a href="${HOME}">${w('All trackers')}</a></p>`;
    initUnitFields(root);
    fill(p, kept);
    wire();
  }

  /** What is typed in the unit fields, by id (base units), so a redraw of the same form keeps it. */
  function snapshot() {
    const m = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-unit-field] input[data-uf]:first-child').forEach((b) => { if (b.id) m.set(b.id, unitValue(b.id)); });
    return m;
  }
  /** Puts the reading being edited (or what was typed before a redraw) into the unit fields. */
  function fill(p: Person, kept: Map<string, number> | null) {
    const e = open?.edit;
    if (e?.kind === 'bp') e.values.forEach((v, i) => { setUnitValue(`tk-s${i}`, v.s); setUnitValue(`tk-d${i}`, v.d); });
    if (e?.kind === 'sugar' && e.test !== 'hba1c') setUnitValue('tk-glu', e.value);
    if (e?.kind === 'weight') setUnitValue('tk-kg', e.kg);
    if (editingPerson) setUnitValue('tk-eheight', p.heightCm ?? null);
    if (kept) for (const [k, v] of kept) if (Number.isFinite(v)) setUnitValue(k, v);
  }

  function formFor(kind: Kind) {
    const e = open?.edit;
    if (kind === 'bp') return bpForm(e as BpReading | undefined, open?.rows ?? (e as BpReading | undefined)?.values.length ?? 1, open?.asked);
    if (kind === 'sugar') return sugarForm(e as SugarReading | undefined, (open as { test?: SugarTest }).test ?? (e as SugarReading | undefined)?.test);
    return weightForm(e as WeightReading | undefined);
  }

  // ---------- share ----------
  function shareHtml(p: Person) {
    const mine = (shares ?? []).filter((s) => s.person === p.id && !s.stopped && (!s.expires || s.expires > Date.now()));
    const what = (s: Share) => [s.scope.bp && w('BP'), s.scope.sugar && w('sugar'), s.scope.weight && w('weight')].filter(Boolean).join(', ');
    const isMe = p.label === 'Me' || p.label === w('Me');
    return `<h2>${w('Share with my doctor')}</h2>
      <p class="muted">${isMe ? w('Your doctor opens the link (or scans the QR code) and sees your latest readings each time, with no sign-in. <b>Anyone with the link can see these readings until you stop it.</b>')
        : w('Your doctor opens the link (or scans the QR code) and sees {name}’s latest readings each time, with no sign-in. <b>Anyone with the link can see these readings until you stop it.</b>', { name: esc(p.label) })}</p>
      ${shareMsg ? `<p class="tk-saved" role="status">${esc(shareMsg)}</p>` : ''}
      ${shares === null ? `<p class="muted small">${w('Loading links…')}</p>` : mine.length ? `<ul class="tk-shares">${mine.map((s) => `<li class="tk-share">
        <div><b>${esc(what(s))}</b> · ${w('made {date}', { date: fmtDate(s.created) })} · ${s.expires ? w('lasts until {date}', { date: fmtDate(s.expires) }) : w('until you stop it')} · ${s.opened ? w('last opened {date}', { date: fmtDate(s.opened) }) : w('not opened yet')}</div>
        <code>${esc(shareUrl(s))}</code>
        <div class="tk-row-btns">
          <button class="btn btn-ghost" type="button" data-copy="${s.id}">${w('Copy link')}</button>
          <button class="btn btn-ghost" type="button" data-qr="${s.id}">${qrFor === s.id ? w('Hide QR code') : w('Show QR code')}</button>
          <a class="btn btn-ghost" href="https://wa.me/?text=${encodeURIComponent(w('My readings: {url}', { url: shareUrl(s) }))}" target="_blank" rel="noopener noreferrer">${w('WhatsApp')}</a>
          <button class="tk-link danger" type="button" data-stop="${s.id}">${w('Stop this link')}</button>
        </div>
        ${qrFor === s.id ? `<div class="tk-qr">${qrSvg(shareUrl(s))}</div>` : ''}
      </li>`).join('')}</ul>` : `<p class="small muted">${w('No links yet.')}</p>`}
      <form class="tk-form" data-form="share" novalidate style="margin-top:1rem">
        <fieldset><legend>${w('Make a new link: what to include')}</legend><div class="tk-grid">
          <label class="tk-check"><input type="checkbox" name="bp" checked> <span>${w('Blood pressure')}</span></label>
          <label class="tk-check"><input type="checkbox" name="sugar" checked> <span>${w('Blood sugar')}</span></label>
          <label class="tk-check"><input type="checkbox" name="weight"> <span>${w('Weight')}</span></label>
        </div></fieldset>
        <label class="tk-f" style="max-width:20rem">${w('How long it works')}<select name="days"><option value="30">${w('{n} days', { n: 30 })}</option><option value="90" selected>${w('{n} days', { n: 90 })}</option><option value="0">${w('Until I stop it')}</option></select></label>
        <p class="small muted" style="margin:0">${w('The doctor sees the name, age, sex, height, the health history above, and the readings with their notes, for the last year (older ones on request). Alert notes are not shown.')}</p>
        <p class="tk-err" role="alert" hidden></p>
        <div class="tk-row-btns"><button class="btn btn-primary" type="submit">${w('Make a link')}</button></div>
      </form>`;
  }

  function qrSvg(text: string) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace('<svg ', `<svg role="img" aria-label="${esc(w('QR code for the share link'))}" `);
  }

  async function loadShares() {
    try { shares = await listShares(); } catch { shares = []; shareMsg = w('Could not load your links (no connection?).'); }
    draw();
  }

  // ---------- saving ----------
  function readWhen(f: HTMLFormElement, timeOptional: boolean): number | string {
    const fd = new FormData(f);
    const date = String(fd.get('date') ?? ''), time = String(fd.get('time') ?? '') || (timeOptional ? '09:00' : '');
    if (!date) return w('Please enter the date.');
    if (!time) return w('Please enter the time.');
    const at = fromInputs(date, time, tzNow());
    if (at === null) return w('Please check the date and time.');
    if (at > Date.now() + 5 * 60_000) return w('The date and time cannot be in the future.');
    return at;
  }

  function saved(kind: Kind, r: Reading) {
    const box = alertBox(r);
    flash = { kind, html: `<div role="status" style="display:grid;gap:.6rem;margin-top:.75rem"><p class="tk-saved" style="margin:0">${w('Saved.')}</p>${box}</div>` };
    open = null;
    draw();
    document.getElementById(`tk-${kind}`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function submit(f: HTMLFormElement) {
    const kind = f.dataset.form as Kind | 'person' | 'share';
    const fd = new FormData(f);
    const err = (m: string) => { const e = f.querySelector<HTMLElement>('.tk-err')!; e.textContent = m; e.hidden = false; };
    const now = Date.now();
    const edit = open?.edit;
    const base = { id: edit?.id ?? newId(), person: id, tz: edit?.tz ?? tzNow(), note: String(fd.get('note') ?? '').trim().slice(0, LIMITS.note), created: edit?.created ?? now, updated: now };
    if (kind === 'bp') {
      const rows = open?.rows ?? 1;
      const values: BpValue[] = [];
      for (let i = 0; i < rows; i++) {
        const s = Math.round(unitValue(`tk-s${i}`)), d = Math.round(unitValue(`tk-d${i}`)), p = fd.get(`p${i}`) ? Number(fd.get(`p${i}`)) : null;
        if (Number.isNaN(s) && Number.isNaN(d) && i > 0) continue; // an empty extra row is ignored
        const v = { s, d, p };
        const nums = { n: i + 1, s0: RANGE.s[0], s1: RANGE.s[1], d0: RANGE.d[0], d1: RANGE.d[1], p0: RANGE.p[0], p1: RANGE.p[1] };
        if (!validBp(v)) return err(p !== null
          ? w('Please check reading {n}: systolic {s0}–{s1}, diastolic {d0}–{d1}, systolic higher than diastolic, pulse {p0}–{p1}.', nums)
          : w('Please check reading {n}: systolic {s0}–{s1}, diastolic {d0}–{d1}, systolic higher than diastolic.', nums));
        values.push(p === null ? { s, d } : v);
      }
      if (!values.length) return err(w('Please enter the reading.'));
      const at = readWhen(f, false);
      if (typeof at === 'string') return err(at);
      if (!edit && !open?.asked && askToRepeat(values)) {
        // Very high: ask for a second reading 1-2 minutes later before saving (the form keeps what was typed).
        open = { kind: 'bp', asked: true, rows: 2, edit: { ...base, kind: 'bp', setting: fd.get('setting') === 'clinic' ? 'clinic' : 'home', values, at } as BpReading };
        draw();
        document.querySelector<HTMLInputElement>('#tk-bp input[name=s1]')?.focus();
        open.edit = undefined; // still a new reading
        return;
      }
      const r: BpReading = { ...base, kind: 'bp', setting: fd.get('setting') === 'clinic' ? 'clinic' : 'home', values, at };
      store.putReading(r);
      return saved('bp', r);
    }
    if (kind === 'sugar') {
      const test = String(fd.get('test')) as SugarTest;
      const pct = test === 'hba1c';
      const unit = pct ? 'pct' : unitShown('tk-glu') === 'mmol' ? 'mmol' : 'mgdl';
      const typed = pct ? (fd.get('value') ? Number(fd.get('value')) : NaN) : unitValue('tk-glu'); // mg/dL whatever unit was shown
      if (!Number.isFinite(typed)) return err(w('Please enter the value.'));
      const value = Math.round(typed * 10) / 10;
      if (!validSugar(test, value)) return err(pct ? w('HbA1c should be between {lo} and {hi} %.', { lo: RANGE.pct[0], hi: RANGE.pct[1] })
        : w('Blood sugar should be between {lo} and {hi} mg/dL ({mlo}–{mhi} mmol/L).', { lo: RANGE.mgdl[0], hi: RANGE.mgdl[1], mlo: (RANGE.mgdl[0] / 18.016).toFixed(1), mhi: (RANGE.mgdl[1] / 18.016).toFixed(1) }));
      const at = readWhen(f, pct);
      if (typeof at === 'string') return err(at);
      const r: SugarReading = { ...base, kind: 'sugar', test, sample: pct ? 'lab' : fd.get('sample') === 'meter' ? 'meter' : 'lab', value, unit, at };
      store.putReading(r);
      return saved('sugar', r);
    }
    if (kind === 'weight') {
      const kg = unitValue('tk-kg');
      if (!(kg >= RANGE.kg[0] && kg <= RANGE.kg[1])) return err(w('Weight should be between {lo} and {hi} kg.', { lo: RANGE.kg[0], hi: RANGE.kg[1] }));
      const at = readWhen(f, true);
      if (typeof at === 'string') return err(at);
      const r: WeightReading = { ...base, kind: 'weight', kg: Math.round(kg * 10) / 10, at };
      store.putReading(r);
      return saved('weight', r);
    }
    if (kind === 'person') {
      const p = person()!;
      const label = String(fd.get('label') ?? '').trim(), born = `${fd.get('year')}-${fd.get('month')}`;
      const h = unitValue('tk-eheight'), height = Number.isFinite(h) ? Math.round(h * 10) / 10 : null;
      if (!label) return err(w('Please enter a name.'));
      if (!isAdult(born, new Date())) return err(w('The tracker is for adults, 18 and over.'));
      if (height !== null && !(height >= RANGE.heightCm[0] && height <= RANGE.heightCm[1])) return err(w('Height should be between {lo} and {hi} cm.', { lo: RANGE.heightCm[0], hi: RANGE.heightCm[1] }));
      const yn = (n: string) => (['yes', 'no', 'unsure'].includes(String(fd.get(n))) ? String(fd.get(n)) as 'yes' : null);
      store.putPerson({ ...p, label, born, sex: fd.get('sex') === 'f' ? 'f' : 'm', heightCm: height, htn: yn('htn'), dm: yn('dm'), meds: yn('meds'), updated: now });
      editingPerson = false;
      return draw();
    }
    if (kind === 'share') {
      const scope = { bp: !!fd.get('bp'), sugar: !!fd.get('sugar'), weight: !!fd.get('weight') };
      if (!scope.bp && !scope.sugar && !scope.weight) return err(w('Choose at least one thing to include.'));
      const days = Number(fd.get('days')) as 30 | 90 | 0;
      store.flush(); // the doctor should see the readings just added
      makeShare(id, scope, days).then((s) => { shares = [s, ...(shares ?? [])]; shareMsg = w('Link made. Copy it, show the QR code, or send it on WhatsApp.'); qrFor = s.id; draw(); })
        .catch((e: Error) => err(/unknown person/.test(e.message) ? w('Please wait a moment for this person to finish saving, then try again.') : w('Could not make the link: {error}', { error: e.message })));
    }
  }

  function csv() {
    const p = person()!;
    const rows = [['date', 'time', 'type', 'where / test', 'sample', 'systolic', 'diastolic', 'pulse', 'value', 'unit', 'note']];
    for (const r of store.readings(id)) {
      const t = toInputs(r.at, r.tz);
      if (r.kind === 'bp') r.values.forEach((v, i) => rows.push([t.date, t.time, 'BP', SETTING_NAME[r.setting], '', String(v.s), String(v.d), v.p ? String(v.p) : '', '', 'mmHg', i === 0 ? r.note ?? '' : '']));
      else if (r.kind === 'sugar') rows.push([t.date, t.time, 'Sugar', TEST_NAME[r.test], r.test === 'hba1c' ? 'Lab' : SAMPLE_NAME[r.sample], '', '', '', r.test === 'hba1c' ? r.value.toFixed(1) : String(Math.round(r.value)), r.test === 'hba1c' ? '%' : 'mg/dL', r.note ?? '']);
      else rows.push([t.date, t.time, 'Weight', '', '', '', '', '', String(r.kg), 'kg', r.note ?? '']);
    }
    const text = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `readings-${p.label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() || 'person'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- events ----------
  function wire() {
    root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => b.addEventListener('click', () => {
      open = { kind: b.dataset.open as Kind }; flash = null; draw();
      const sec = document.getElementById(`tk-${open.kind}`);
      sec?.querySelector<HTMLElement>('form input:not([type=radio]), form select')?.focus({ preventScroll: true });
      sec?.scrollIntoView({ block: 'start' });
    }));
    root.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((f) => {
      f.addEventListener('submit', (e) => { e.preventDefault(); submit(f); });
      f.querySelector('[data-cancel]')?.addEventListener('click', () => { if (f.dataset.form === 'person') editingPerson = false; else open = null; draw(); });
    });
    // Changing the sugar test redraws the form: HbA1c has no sample or unit choice, and its time is optional.
    root.querySelector<HTMLFormElement>('form[data-form=sugar]')?.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name !== 'test' || !open) return;
      (open as { test?: SugarTest }).test = t.value as SugarTest;
      draw(true);
      root.querySelector<HTMLInputElement>(`form[data-form=sugar] input[name=test][value=${t.value}]`)?.focus();
    });
    root.querySelector('[data-more]')?.addEventListener('click', () => {
      const f = root.querySelector<HTMLFormElement>('form[data-form=bp]')!;
      const keep = new FormData(f);
      open = { ...open!, rows: (open?.rows ?? 1) + 1 };
      draw(true);
      const g = root.querySelector<HTMLFormElement>('form[data-form=bp]')!;
      for (const [k, v] of keep) { const el = g.elements.namedItem(k); if (el instanceof HTMLInputElement && el.type !== 'radio') el.value = String(v); else if (el instanceof RadioNodeList) el.value = String(v); }
      g.querySelector<HTMLInputElement>(`input[name=s${(open.rows ?? 2) - 1}]`)?.focus();
    });
    root.querySelector('[data-editperson]')?.addEventListener('click', () => { editingPerson = true; draw(); });
    root.querySelector('[data-remove]')?.addEventListener('click', () => {
      const p = person()!;
      if (!confirm(w('Remove {name} and all their readings? Any links shared with a doctor stop working. This cannot be undone.', { name: p.label }))) return;
      store.removePerson(id);
      store.flush().finally(() => { location.href = HOME; });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const r = store.reading(b.dataset.edit!);
      if (!r) return;
      open = { kind: r.kind, edit: r, rows: r.kind === 'bp' ? r.values.length : undefined }; flash = null; draw();
      document.getElementById(`tk-${r.kind}`)?.scrollIntoView({ block: 'start' });
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(w('Delete this reading?'))) return;
      store.removeReading(b.dataset.del!);
    }));
    root.querySelector('[data-csv]')?.addEventListener('click', csv);
    root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const s = shares?.find((x) => x.id === b.dataset.copy);
      if (!s) return;
      try { await navigator.clipboard.writeText(shareUrl(s)); b.textContent = w('Copied'); } catch { prompt(w('Copy this link:'), shareUrl(s)); }
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-qr]').forEach((b) => b.addEventListener('click', () => { qrFor = qrFor === b.dataset.qr ? '' : b.dataset.qr!; draw(); }));
    root.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(w('Stop this link? Anyone who has it will no longer see the readings.'))) return;
      try { await stopShare(b.dataset.stop!); shares = (shares ?? []).map((s) => (s.id === b.dataset.stop ? { ...s, stopped: Date.now() } : s)); shareMsg = w('Link stopped.'); draw(); }
      catch { alert(w('Could not stop the link. Please try again.')); }
    }));
  }

  // Redraw on sync, but never while a form is being filled in (only the status line changes then).
  store.subscribe(() => {
    if (root.querySelector('form[data-form]:not([data-form=share]) input:focus, form[data-form]:not([data-form=share]) select:focus') || open || editingPerson) {
      const s = root.querySelector('.tk-status'); if (s) s.textContent = STATUS[store.state];
    } else draw();
  });
  draw();
  loadShares();
}
