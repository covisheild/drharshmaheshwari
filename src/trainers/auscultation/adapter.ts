// Connects the auscultation content to the shared trainer UI (src/trainers/ui/).

import { Engine } from '../core/engine';
import { SyncedProgressStore } from '../core/sync';
import type { TrainerAdapter } from '../core/types';
import { trainer } from '../registry';
import { listenFor } from './notes';
import { BY_ID, FINDING, LEVELS, NORMAL, OPTIONS, PRACTICE, RECORDINGS, VERSION, examples, media, type Recording } from './config';

const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

/** The real finding behind an answer: for "normal / abnormal" questions it is the recording's own finding. */
const findingFor = (r: Recording, key: string) =>
  key === 'heart' ? r.heart! : key === 'lung' ? r.lung! : r.kind === 'lung' ? r.lung! : r.heart!;

export const adapter: TrainerAdapter<Recording> = {
  meta: trainer('auscultation'),
  version: VERSION,
  engine: new Engine(RECORDINGS, LEVELS, OPTIONS, PRACTICE),
  media,

  explain(r, part) {
    const f = FINDING.get(findingFor(r, part.ask.key))!;
    return { title: f.label, body: listenFor(f.id) };
  },

  compare(r, parts) {
    const out: { label: string; media: ReturnType<typeof media> }[] = [];
    const exclude = new Set([r.id, r.parts?.heart, r.parts?.lung]);
    // Parts follow the question's asks: a mix asks heart then lungs; a single recording asks about its own system.
    const asks = r.kind === 'mix' ? ['heart', 'lung'] : [r.kind];
    parts.forEach((p, i) => {
      const truth = findingFor(r, asks[i] ?? r.kind);
      const other = pick(examples(truth).filter((x) => !exclude.has(x.id)));
      if (other) out.push({ label: `Another: ${FINDING.get(truth)!.label}`, media: media(other) });
      if (p.chosen !== p.answer) {
        const yours = FINDING.has(p.chosen) ? pick(examples(p.chosen)) : examples(NORMAL[r.kind === 'lung' ? 'lung' : 'heart'])[0];
        if (yours) out.push({ label: FINDING.has(p.chosen) ? `Your answer: ${FINDING.get(p.chosen)!.label}` : 'Normal, to compare', media: media(yours) });
      }
    });
    const heart = r.parts?.heart && BY_ID.get(r.parts.heart), lung = r.parts?.lung && BY_ID.get(r.parts.lung);
    if (heart) out.push({ label: 'Heart only', media: media(heart) });
    if (lung) out.push({ label: 'Lungs only', media: media(lung) });
    return out;
  },
};

export const store = () => new SyncedProgressStore('auscultation', VERSION);
