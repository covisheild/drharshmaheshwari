// Auscultation Trainer: findings, teaching notes, recordings and levels.
// Recordings come from scripts/trainers/auscultation/prepare.py (HLS-CMDS v2, CC BY 4.0).

import data from '../../data/trainers/auscultation/recordings.json';
import { FILES_URL } from '../../consts';
import type { Level, Option, QuestionSet } from '../core/engine';
import type { AudioMedia, Span } from '../core/media';

export interface Finding extends Option {
  /** Permanent URL segment of the finding's Learn page. Never change one once published. */
  slug: string;
  system: 'heart' | 'lung';
  /** What to listen for. Teaching text; reviewed by Harsh before release. */
  listen: string;
  /** What it usually means. */
  means: string;
}

export interface Recording {
  id: string;
  kind: 'heart' | 'lung' | 'mix';
  heart?: string;
  lung?: string;
  site: string;
  sex: string;
  secs: number;
  parts?: { heart?: string; lung?: string };
  /** Labelled stretches (S1, S2, murmur...) once someone annotates the recording. None yet. */
  spans?: Span[];
}

export const FINDINGS: Finding[] = [
  { id: 'heart.normal', slug: 'normal-heart-sounds', system: 'heart', group: 'heart.normal', label: 'Normal heart sounds',
    listen: 'Two sounds per beat: S1 ("lub") then S2 ("dub"). At a normal rate the pause after S2 (diastole) is longer than the pause after S1 (systole). Nothing in either pause.',
    means: 'The baseline. Compare every abnormal sound against it.' },
  { id: 'heart.s3', slug: 's3', system: 'heart', group: 'heart.extra', label: 'S3 (third heart sound)',
    listen: 'A dull, low extra sound just after S2, early in diastole: "lub-dub-da", the rhythm of "Ken-tuc-ky". Very low-pitched: use headphones, not a phone speaker.',
    means: 'Rapid filling of a large, volume-loaded ventricle. Can be normal in children and young adults; in older adults it suggests heart failure.' },
  { id: 'heart.s4', slug: 's4', system: 'heart', group: 'heart.extra', label: 'S4 (fourth heart sound)',
    listen: 'A low extra sound just before S1, at the very end of diastole: "da-lub-dub", the rhythm of "Ten-nes-see".',
    means: 'The atrium pushing blood into a stiff ventricle, as in hypertension, left ventricular hypertrophy or ischaemia. It cannot occur in atrial fibrillation.' },
  { id: 'heart.esm', slug: 'early-systolic-murmur', system: 'heart', group: 'heart.systolic', label: 'Early systolic murmur',
    listen: 'A murmur that begins with S1 and fades away by mid-systole. The second half of systole and S2 are clear.',
    means: 'Seen with a small ventricular septal defect, or acute mitral or tricuspid regurgitation.' },
  { id: 'heart.msm', slug: 'mid-systolic-murmur', system: 'heart', group: 'heart.systolic', label: 'Mid-systolic murmur',
    listen: 'Starts a moment after S1, swells and fades (a "diamond"), and ends before S2. The small gap after S1 is the clue.',
    means: 'Ejection murmur: blood flowing out across the aortic or pulmonary valve, as in aortic stenosis, pulmonary stenosis or a flow murmur.' },
  { id: 'heart.lsm', slug: 'late-systolic-murmur', system: 'heart', group: 'heart.systolic', label: 'Late systolic murmur',
    listen: 'S1 and early systole are clear; the murmur starts in mid-to-late systole and runs up to S2.',
    means: 'Classically mitral valve prolapse, sometimes after a click; also papillary muscle dysfunction.' },
  { id: 'heart.ldm', slug: 'late-diastolic-murmur', system: 'heart', group: 'heart.diastolic', label: 'Late diastolic murmur',
    listen: 'A low rumble at the end of diastole that runs into S1 (presystolic). Systole is clear.',
    means: 'Classically mitral stenosis in sinus rhythm, where atrial contraction pushes blood through the narrow valve.' },
  { id: 'heart.af', slug: 'atrial-fibrillation', system: 'heart', group: 'heart.rate', label: 'Atrial fibrillation',
    listen: 'Beats arrive at irregular intervals with no pattern, and S1 changes in loudness. Try tapping along: you cannot predict the next beat.',
    means: 'Atrial fibrillation; confirm with an ECG.' },
  { id: 'heart.tachy', slug: 'tachycardia', system: 'heart', group: 'heart.rate', label: 'Tachycardia',
    listen: 'Regular but fast. Diastole shortens until the two pauses sound almost equal. Count the beats in the 15-second clip and multiply by 4: over 100 per minute.',
    means: 'A fast regular rate; the cause (fever, pain, anaemia, thyroid, arrhythmia) is found clinically.' },
  { id: 'heart.avb', slug: 'av-block', system: 'heart', group: 'heart.rate', label: 'AV block',
    listen: 'Listen for a slow rate, pauses where a beat is missing, or S1 that varies in loudness. The dataset does not say which degree of block each recording is.',
    means: 'Delayed or blocked conduction from atria to ventricles; the degree is made on an ECG.' },
  { id: 'lung.normal', slug: 'normal-breath-sounds', system: 'lung', group: 'lung.normal', label: 'Normal breath sounds',
    listen: 'A soft, low rustle. Inspiration is longer and louder; expiration is shorter and fades early. No gap between them, nothing added.',
    means: 'Normal vesicular breath sounds: the baseline for every chest.' },
  { id: 'lung.wheeze', slug: 'wheeze', system: 'lung', group: 'lung.continuous', label: 'Wheeze',
    listen: 'A continuous, musical, high-pitched whistle, usually loudest in expiration.',
    means: 'Narrowed small airways: asthma, COPD, sometimes heart failure.' },
  { id: 'lung.rhonchi', slug: 'rhonchi', system: 'lung', group: 'lung.continuous', label: 'Rhonchi',
    listen: 'A continuous, low-pitched snoring or rattling sound. It may change or clear after a cough.',
    means: 'Secretions in the larger airways (bronchitis, pneumonia). Many guidelines now call this a "low-pitched wheeze".' },
  { id: 'lung.fine', slug: 'fine-crackles', system: 'lung', group: 'lung.crackles', label: 'Fine crackles',
    listen: 'Brief, soft, high-pitched pops, like Velcro pulled apart or hair rubbed between fingers, in mid-to-late inspiration. They do not clear with a cough.',
    means: 'Interstitial lung disease (fibrosis) or fluid in the alveoli in early heart failure.' },
  { id: 'lung.coarse', slug: 'coarse-crackles', system: 'lung', group: 'lung.crackles', label: 'Coarse crackles',
    listen: 'Louder, lower, longer bubbling pops, early in inspiration and often in expiration too. They may change after a cough.',
    means: 'Secretions in the airways: bronchiectasis, pneumonia, COPD.' },
  { id: 'lung.rub', slug: 'pleural-rub', system: 'lung', group: 'lung.rub', label: 'Pleural rub',
    listen: 'A grating or creaking sound, like leather rubbing, in both inspiration and expiration. It sounds close to the ear and stops if the breath is held.',
    means: 'Inflamed pleural surfaces rubbing together: pleurisy, pneumonia, pulmonary embolism.' },
];

export const NORMAL = { heart: 'heart.normal', lung: 'lung.normal' } as const;

const extra: Option[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'abnormal', label: 'Abnormal' },
];
export const OPTIONS = new Map<string, Option>([...FINDINGS, ...extra].map((o) => [o.id, o]));
export const FINDING = new Map(FINDINGS.map((f) => [f.id, f]));

export const RECORDINGS = (data.recordings as Recording[]);
export const BY_ID = new Map(RECORDINGS.map((r) => [r.id, r]));
export const VERSION = data.set;
export const src = (id: string) => `${FILES_URL}/trainers/auscultation/${data.set}/${id}.mp3`;
/** Peaks sit next to the audio: hs/F_N_A.mp3 -> hs/F_N_A.peaks.json (made by prepare.py). */
export const media = (r: Recording): AudioMedia => ({
  kind: 'audio', src: src(r.id), peaks: `${FILES_URL}/trainers/auscultation/${data.set}/${r.id}.peaks.json`, duration: r.secs, spans: r.spans,
});
export const MIX_SLUG = 'heart-and-lungs-together';
export const findingBySlug = (slug: string) => FINDINGS.find((f) => f.slug === slug);

/** Single-sound recordings of a finding; the original solo recordings first. */
export function examples(findingId: string): Recording[] {
  const system = FINDING.get(findingId)!.system;
  return RECORDINGS.filter((r) => r.kind === system && r[system] === findingId)
    .sort((a, b) => Number(a.id.startsWith('mix/')) - Number(b.id.startsWith('mix/')));
}

export const ids = (system: 'heart' | 'lung') => FINDINGS.filter((f) => f.system === system).map((f) => f.id);
const solo = (r: Recording) => r.kind !== 'mix';
const finding = (r: Recording) => (r.kind === 'lung' ? r.lung! : r.heart!);
const lookAlike = (r: Recording) => ['heart.extra', 'heart.systolic', 'heart.rate', 'lung.continuous', 'lung.crackles'].includes(FINDING.get(finding(r))!.group!);

export const LEVELS: Level<Recording>[] = [
  { id: 'normal', title: 'Normal or not?', blurb: 'Heart or lungs: is anything abnormal? Learn what normal sounds like first.',
    pool: (rs) => rs.filter(solo),
    asks: [{ key: 'normal', prompt: 'Is this normal?', choices: ['normal', 'abnormal'],
      answer: (r) => (finding(r) === NORMAL[r.kind as 'heart' | 'lung'] ? 'normal' : 'abnormal') }] },
  { id: 'lungs', title: 'Lung sounds', blurb: 'Name the breath sound: six choices.',
    pool: (rs) => rs.filter((r) => r.kind === 'lung'),
    asks: [{ key: 'lung', prompt: 'What do you hear?', choices: ids('lung'), answer: (r) => r.lung! }] },
  { id: 'heart', title: 'Heart sounds', blurb: 'Extra sounds, murmurs and rhythms: four choices from ten.',
    pool: (rs) => rs.filter((r) => r.kind === 'heart'),
    asks: [{ key: 'heart', prompt: 'What do you hear?', choices: ids('heart'), n: 4, answer: (r) => r.heart! }] },
  { id: 'close', title: 'Close calls', blurb: 'Look-alikes side by side: S3 or S4, fine or coarse crackles, wheeze or rhonchi, which systolic murmur.',
    pool: (rs) => rs.filter((r) => solo(r) && lookAlike(r)),
    asks: [{ key: 'finding', prompt: 'Which one is it?', choices: (r) => ids(r.kind as 'heart' | 'lung'), n: 3, near: true, answer: finding }] },
  { id: 'mixed', title: 'Heart and lungs together', blurb: 'A real chest has both. Name the heart sound and the lung sound in the same recording.',
    pool: (rs) => rs.filter((r) => r.kind === 'mix'),
    asks: [
      { key: 'heart', prompt: 'Heart', choices: ids('heart'), n: 4, answer: (r) => r.heart! },
      { key: 'lung', prompt: 'Lungs', choices: ids('lung'), n: 4, answer: (r) => r.lung! },
    ] },
];

/** Practice sets: every finding of a system, waveform visible, never counted towards levels. */
export const PRACTICE: QuestionSet<Recording>[] = [
  { id: 'practice-heart', title: 'Heart sounds', blurb: 'All ten heart findings, four choices at a time.',
    pool: (rs) => rs.filter((r) => r.kind === 'heart'),
    asks: [{ key: 'heart', prompt: 'What do you hear?', choices: ids('heart'), n: 4, answer: (r) => r.heart! }] },
  { id: 'practice-lungs', title: 'Lung sounds', blurb: 'All six breath sounds side by side.',
    pool: (rs) => rs.filter((r) => r.kind === 'lung'),
    asks: [{ key: 'lung', prompt: 'What do you hear?', choices: ids('lung'), answer: (r) => r.lung! }] },
  { id: 'practice-mixed', title: 'Heart and lungs together', blurb: 'Pick out both sounds in one recording, as at the bedside.',
    pool: (rs) => rs.filter((r) => r.kind === 'mix'),
    asks: [
      { key: 'heart', prompt: 'Heart', choices: ids('heart'), n: 4, answer: (r) => r.heart! },
      { key: 'lung', prompt: 'Lungs', choices: ids('lung'), n: 4, answer: (r) => r.lung! },
    ] },
];
