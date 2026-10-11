// What a person's readings look like: summary tiles, charts and lists for BP, sugar and weight. Used by the patient's own
// page (/trackers/person/, with alerts and edit buttons) and the doctor's view (/trackers/view/, without either).

import {
  LINES, SAMPLE_NAME, SETTING_NAME, TEST_NAME, alertText, bmiFor, bpAverage, bpOf, bpShown, formatWhen, homeWeekAverage, latest,
  sugarOf, sugarShown, weightOf, type BpReading, type Person, type Reading, type SugarReading, type SugarTest, type YesNo,
} from '../lib/trackers';
import { chartSvg } from './chart';
import { w } from '../i18n/client';

// Every word shown goes through w() (src/i18n/client.ts): on English pages (and the doctor's view) it gives back the English.
// Fixed texts from src/lib/trackers.ts, translated where they are shown (listed for src/components/ClientWords.astro):
// TEST_NAME: w('Fasting (FBS)') w('2 h after a meal (PPBS)') w('Random (RBS)') w('HbA1c')
// SETTING_NAME: w("Doctor's clinic") w('Home or work')   SAMPLE_NAME: w('Lab') w('Glucometer')
// ALERT_TEXT: w('Very high reading') w('Very high sugar') w('Low sugar') w('Severely low sugar')
// w('Sit quietly and measure again after 1–2 minutes. If it stays this high, contact your doctor today. If you have chest pain, breathlessness, back pain, weakness or numbness, a change in vision, or trouble speaking, go to a hospital now.')
// w('Contact your doctor today. Go to a hospital now if there is vomiting, stomach pain, fast breathing, drowsiness or confusion.')
// w('Take 15 g of fast-acting sugar now (15 g glucose powder, 4 teaspoons of sugar in water, or something sweet you have) and measure again after 15 minutes; repeat if still below 70 mg/dL (3.9 mmol/L). If the person is drowsy or confused, do not give anything by mouth: get help now.')
// formatWhen() months: w('Jan') w('Feb') w('Mar') w('Apr') w('May') w('Jun') w('Jul') w('Aug') w('Sep') w('Oct') w('Nov') w('Dec')

/** formatWhen() in the page's language: "11 Oct 2026, 9:05 am" rebuilt from its parts (the same English on English pages). */
export function whenText(at: number, tz: number, withTime = true): string {
  const s = formatWhen(at, tz, withTime);
  const m = /^(\d+) ([A-Z][a-z]{2}) (\d{4})(?:, (\d{1,2}:\d{2}) (am|pm))?$/.exec(s);
  if (!m) return s;
  const date = w('{d} {month} {y}', { d: m[1], month: w(m[2]), y: m[3] });
  if (!m[4]) return date;
  return m[5] === 'am' ? w('{date}, {time} am', { date, time: m[4] }) : w('{date}, {time} pm', { date, time: m[4] });
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Opts { alerts: boolean; editable: boolean; width?: number }

const tile = (label: string, value: string, sub = '') =>
  `<div class="tk-tile"><span class="tk-tl">${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

const YN = (v: YesNo) => (v === 'yes' ? w('Yes') : v === 'no' ? w('No') : w('Not sure'));
export function historyLine(p: Pick<Person, 'htn' | 'dm' | 'meds'>): string {
  const bits: string[] = [];
  if (p.htn) bits.push(w('Known high BP: {answer}', { answer: YN(p.htn) }));
  if (p.dm) bits.push(w('Known diabetes: {answer}', { answer: YN(p.dm) }));
  if (p.meds) bits.push(w('On medicines for either: {answer}', { answer: YN(p.meds) }));
  return bits.join(' · ');
}

function alertBox(r: Reading) {
  const a = alertText(r);
  return a ? `<div class="tk-alert" role="note"><b>${esc(w(a.title))}.</b> ${esc(w(a.text))}</div>` : '';
}

function row(r: Reading, o: Opts, value: string, detail: string) {
  const a = o.alerts ? alertText(r) : null;
  return `<li class="tk-row${a ? ' has-alert' : ''}" data-id="${esc(r.id)}">
    <span class="tk-when">${esc(whenText(r.at, r.tz, !(r.kind === 'sugar' && r.test === 'hba1c')))}</span>
    <span class="tk-val">${value}${a ? ` <span class="tk-flag" title="${esc(w(a.title))}">${esc(w(a.title))}</span>` : ''}</span>
    <span class="tk-detail">${detail}${r.note ? ` · <i>${esc(r.note)}</i>` : ''}</span>
    ${o.editable ? `<span class="tk-acts"><button type="button" class="tk-link" data-edit="${esc(r.id)}">${w('Edit')}</button><button type="button" class="tk-link" data-del="${esc(r.id)}">${w('Delete')}</button></span>` : ''}
  </li>`;
}

const list = (items: string[], empty: string) =>
  items.length ? `<ol class="tk-list" reversed>${items.reverse().join('')}</ol>` : `<p class="muted small">${empty}</p>`;

export function bpSection(rs: Reading[], o: Opts): string {
  const all = bpOf(rs);
  const week = homeWeekAverage(rs);
  const clinic = latest(all.filter((r) => r.setting === 'clinic'));
  const tiles = [
    week ? tile(w('Home, 7-day average'), bpShown(week.avg), week.n > 1
      ? w('{n} sittings, {from} – {to}', { n: week.n, from: esc(whenText(week.from, 330, false)), to: esc(whenText(week.to, 330, false)) })
      : w('{n} sitting, {from} – {to}', { n: week.n, from: esc(whenText(week.from, 330, false)), to: esc(whenText(week.to, 330, false)) })) : tile(w('Home, 7-day average'), '—', w('No home readings yet')),
    clinic ? tile(w('Latest at the clinic'), bpShown(bpAverage(clinic.values)), esc(whenText(clinic.at, clinic.tz))) : tile(w('Latest at the clinic'), '—', w('None yet')),
  ];
  const chart = all.length ? chartSvg({
    label: w('Blood pressure'), unit: 'mmHg', floor: [70, 150], width: o.width, words: w,
    lines: [LINES.bp.clinic.s, LINES.bp.clinic.d, LINES.bp.home.s, LINES.bp.home.d],
    points: all.map((r) => { const v = bpAverage(r.values); return { t: r.at, v: v.s, v2: v.d, hollow: r.setting === 'clinic', alert: o.alerts && !!alertText(r) }; }),
  }) : '';
  const items = all.map((r: BpReading) => {
    const v = bpAverage(r.values);
    const each = r.values.length > 1 ? ` ${w('(average of {values})', { values: r.values.map(bpShown).join(', ') })}` : '';
    return row(r, o, `${bpShown(v)} <small>mmHg</small>`, `${esc(w(SETTING_NAME[r.setting]))}${v.p ? ` · ${w('pulse {p}', { p: v.p })}` : ''}${esc(each)}`);
  });
  return `<div class="tk-tiles">${tiles.join('')}</div>
    ${chart ? `<figure class="tk-chart">${chart}<figcaption><span class="tk-key"><i class="dot"></i> ${w('Home or work')}</span> <span class="tk-key"><i class="dot hollow"></i> ${w('Clinic')}</span>${o.alerts ? ` <span class="tk-key"><i class="ring"></i> ${w('Alert')}</span>` : ''} <span class="tk-key">${w('Each bar: top = systolic, bottom = diastolic')}</span></figcaption></figure>` : ''}
    ${list(items, w('No blood pressure readings yet.'))}`;
}

export function sugarSection(rs: Reading[], o: Opts): string {
  const tests: SugarTest[] = ['fbs', 'ppbs', 'rbs', 'hba1c'];
  const last = (t: SugarTest) => latest(sugarOf(rs, t));
  const tiles = tests.map((t) => { const r = last(t); return tile(w(TEST_NAME[t]), r ? sugarShown(r) : '—', r ? `${esc(whenText(r.at, r.tz, t !== 'hba1c'))}${t !== 'hba1c' ? ` · ${w(SAMPLE_NAME[r.sample])}` : ''}` : w('None yet')); });
  const charts = tests.map((t) => {
    const s = sugarOf(rs, t);
    if (!s.length) return '';
    const pct = t === 'hba1c';
    const line = LINES.sugar[t];
    return `<figure class="tk-chart"><figcaption class="tk-ctitle">${esc(w(TEST_NAME[t]))}</figcaption>${chartSvg({
      label: w(TEST_NAME[t]), unit: pct ? '%' : 'mg/dL', words: w, width: o.width && o.width > 900 ? (o.width - 16) / 2 : o.width, floor: pct ? [5, 7] : [70, 140], decimals: pct ? 1 : 0, lines: line ? [line] : [],
      points: s.map((r) => ({ t: r.at, v: r.value, hollow: r.sample === 'meter', alert: o.alerts && !!alertText(r) })),
    })}</figure>`;
  }).join('');
  const items = sugarOf(rs).map((r: SugarReading) => row(r, o, sugarShown(r), `${esc(w(TEST_NAME[r.test]))}${r.test !== 'hba1c' ? ` · ${w(SAMPLE_NAME[r.sample])}` : ''}`));
  return `<div class="tk-tiles tk-tiles-4">${tiles.join('')}</div>
    ${charts ? `<div class="tk-charts">${charts}</div><p class="tk-key-row small muted"><span class="tk-key"><i class="dot"></i> ${w('Lab')}</span> <span class="tk-key"><i class="dot hollow"></i> ${w('Glucometer')}</span>${o.alerts ? ` <span class="tk-key"><i class="ring"></i> ${w('Alert')}</span>` : ''}</p>` : ''}
    ${list(items, w('No sugar readings yet.'))}`;
}

export function weightSection(p: Pick<Person, 'heightCm'> & Partial<Person>, rs: Reading[], o: Opts): string {
  const all = weightOf(rs);
  const last = latest(all);
  const bmi = bmiFor({ ...(p as Person) }, rs);
  const tiles = [tile(w('Latest weight'), last ? `${last.kg} kg` : '—', last ? esc(whenText(last.at, last.tz, false)) : w('None yet')),
    tile(w('BMI'), bmi ? String(bmi) : '—', bmi ? w('Indian cut-offs: overweight 23, obesity 25') : p.heightCm ? w('Add a weight') : w('Add height to see BMI'))];
  const chart = all.length > 1 ? `<figure class="tk-chart">${chartSvg({ label: w('Weight'), unit: 'kg', words: w, width: o.width, floor: [Math.min(...all.map((r) => r.kg)) - 2, Math.max(...all.map((r) => r.kg)) + 2], decimals: 0, points: all.map((r) => ({ t: r.at, v: r.kg })) })}</figure>` : '';
  const items = all.map((r) => row(r, o, `${r.kind === 'weight' ? r.kg : ''} kg`, ''));
  return `<div class="tk-tiles">${tiles.join('')}</div>${chart}${list(items, w('No weights yet.'))}`;
}

export { alertBox };
