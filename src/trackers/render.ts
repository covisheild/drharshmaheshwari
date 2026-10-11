// What a person's readings look like: summary tiles, charts and lists for BP, sugar and weight. Used by the patient's own
// page (/trackers/person/, with alerts and edit buttons) and the doctor's view (/trackers/view/, without either).

import {
  LINES, SAMPLE_NAME, SETTING_NAME, TEST_NAME, alertText, bmiFor, bpAverage, bpOf, bpShown, formatWhen, homeWeekAverage, latest,
  sugarOf, sugarShown, weightOf, type BpReading, type Person, type Reading, type SugarReading, type SugarTest, type YesNo,
} from '../lib/trackers';
import { chartSvg } from './chart';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Opts { alerts: boolean; editable: boolean; width?: number }

const tile = (label: string, value: string, sub = '') =>
  `<div class="tk-tile"><span class="tk-tl">${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

const YN: Record<YesNo, string> = { yes: 'Yes', no: 'No', unsure: 'Not sure' };
export function historyLine(p: Pick<Person, 'htn' | 'dm' | 'meds'>): string {
  const bits: string[] = [];
  if (p.htn) bits.push(`Known high BP: ${YN[p.htn]}`);
  if (p.dm) bits.push(`Known diabetes: ${YN[p.dm]}`);
  if (p.meds) bits.push(`On medicines for either: ${YN[p.meds]}`);
  return bits.join(' · ');
}

function alertBox(r: Reading) {
  const a = alertText(r);
  return a ? `<div class="tk-alert" role="note"><b>${esc(a.title)}.</b> ${esc(a.text)}</div>` : '';
}

function row(r: Reading, o: Opts, value: string, detail: string) {
  const a = o.alerts ? alertText(r) : null;
  return `<li class="tk-row${a ? ' has-alert' : ''}" data-id="${esc(r.id)}">
    <span class="tk-when">${esc(formatWhen(r.at, r.tz, !(r.kind === 'sugar' && r.test === 'hba1c')))}</span>
    <span class="tk-val">${value}${a ? ` <span class="tk-flag" title="${esc(a.title)}">${esc(a.title)}</span>` : ''}</span>
    <span class="tk-detail">${detail}${r.note ? ` · <i>${esc(r.note)}</i>` : ''}</span>
    ${o.editable ? `<span class="tk-acts"><button type="button" class="tk-link" data-edit="${esc(r.id)}">Edit</button><button type="button" class="tk-link" data-del="${esc(r.id)}">Delete</button></span>` : ''}
  </li>`;
}

const list = (items: string[], empty: string) =>
  items.length ? `<ol class="tk-list" reversed>${items.reverse().join('')}</ol>` : `<p class="muted small">${empty}</p>`;

export function bpSection(rs: Reading[], o: Opts): string {
  const all = bpOf(rs);
  const week = homeWeekAverage(rs);
  const clinic = latest(all.filter((r) => r.setting === 'clinic'));
  const tiles = [
    week ? tile('Home, 7-day average', bpShown(week.avg), `${week.n} sitting${week.n > 1 ? 's' : ''}, ${esc(formatWhen(week.from, 330, false))} – ${esc(formatWhen(week.to, 330, false))}`) : tile('Home, 7-day average', '—', 'No home readings yet'),
    clinic ? tile('Latest at the clinic', bpShown(bpAverage(clinic.values)), esc(formatWhen(clinic.at, clinic.tz))) : tile('Latest at the clinic', '—', 'None yet'),
  ];
  const chart = all.length ? chartSvg({
    label: 'Blood pressure', unit: 'mmHg', floor: [70, 150], width: o.width,
    lines: [LINES.bp.clinic.s, LINES.bp.clinic.d, LINES.bp.home.s, LINES.bp.home.d],
    points: all.map((r) => { const v = bpAverage(r.values); return { t: r.at, v: v.s, v2: v.d, hollow: r.setting === 'clinic', alert: o.alerts && !!alertText(r) }; }),
  }) : '';
  const items = all.map((r: BpReading) => {
    const v = bpAverage(r.values);
    const each = r.values.length > 1 ? ` (average of ${r.values.map(bpShown).join(', ')})` : '';
    return row(r, o, `${bpShown(v)} <small>mmHg</small>`, `${esc(SETTING_NAME[r.setting])}${v.p ? ` · pulse ${v.p}` : ''}${esc(each)}`);
  });
  return `<div class="tk-tiles">${tiles.join('')}</div>
    ${chart ? `<figure class="tk-chart">${chart}<figcaption><span class="tk-key"><i class="dot"></i> Home or work</span> <span class="tk-key"><i class="dot hollow"></i> Clinic</span>${o.alerts ? ' <span class="tk-key"><i class="ring"></i> Alert</span>' : ''} <span class="tk-key">Each bar: top = systolic, bottom = diastolic</span></figcaption></figure>` : ''}
    ${list(items, 'No blood pressure readings yet.')}`;
}

export function sugarSection(rs: Reading[], o: Opts): string {
  const tests: SugarTest[] = ['fbs', 'ppbs', 'rbs', 'hba1c'];
  const last = (t: SugarTest) => latest(sugarOf(rs, t));
  const tiles = tests.map((t) => { const r = last(t); return tile(TEST_NAME[t], r ? sugarShown(r) : '—', r ? `${esc(formatWhen(r.at, r.tz, t !== 'hba1c'))}${t !== 'hba1c' ? ` · ${SAMPLE_NAME[r.sample]}` : ''}` : 'None yet'); });
  const charts = tests.map((t) => {
    const s = sugarOf(rs, t);
    if (!s.length) return '';
    const pct = t === 'hba1c';
    const line = LINES.sugar[t];
    return `<figure class="tk-chart"><figcaption class="tk-ctitle">${esc(TEST_NAME[t])}</figcaption>${chartSvg({
      label: TEST_NAME[t], unit: pct ? '%' : 'mg/dL', width: o.width && o.width > 900 ? (o.width - 16) / 2 : o.width, floor: pct ? [5, 7] : [70, 140], decimals: pct ? 1 : 0, lines: line ? [line] : [],
      points: s.map((r) => ({ t: r.at, v: r.value, hollow: r.sample === 'meter', alert: o.alerts && !!alertText(r) })),
    })}</figure>`;
  }).join('');
  const items = sugarOf(rs).map((r: SugarReading) => row(r, o, sugarShown(r), `${esc(TEST_NAME[r.test])}${r.test !== 'hba1c' ? ` · ${SAMPLE_NAME[r.sample]}` : ''}`));
  return `<div class="tk-tiles tk-tiles-4">${tiles.join('')}</div>
    ${charts ? `<div class="tk-charts">${charts}</div><p class="tk-key-row small muted"><span class="tk-key"><i class="dot"></i> Lab</span> <span class="tk-key"><i class="dot hollow"></i> Glucometer</span>${o.alerts ? ' <span class="tk-key"><i class="ring"></i> Alert</span>' : ''}</p>` : ''}
    ${list(items, 'No sugar readings yet.')}`;
}

export function weightSection(p: Pick<Person, 'heightCm'> & Partial<Person>, rs: Reading[], o: Opts): string {
  const all = weightOf(rs);
  const w = latest(all);
  const bmi = bmiFor({ ...(p as Person) }, rs);
  const tiles = [tile('Latest weight', w ? `${w.kg} kg` : '—', w ? esc(formatWhen(w.at, w.tz, false)) : 'None yet'),
    tile('BMI', bmi ? String(bmi) : '—', bmi ? 'Indian cut-offs: overweight 23, obesity 25' : p.heightCm ? 'Add a weight' : 'Add height to see BMI')];
  const chart = all.length > 1 ? `<figure class="tk-chart">${chartSvg({ label: 'Weight', unit: 'kg', width: o.width, floor: [Math.min(...all.map((r) => r.kg)) - 2, Math.max(...all.map((r) => r.kg)) + 2], decimals: 0, points: all.map((r) => ({ t: r.at, v: r.kg })) })}</figure>` : '';
  const items = all.map((r) => row(r, o, `${r.kind === 'weight' ? r.kg : ''} kg`, ''));
  return `<div class="tk-tiles">${tiles.join('')}</div>${chart}${list(items, 'No weights yet.')}`;
}

export { alertBox };
