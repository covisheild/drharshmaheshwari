// Contracts every trainer implements. The shell, the question runner and the progress views are written
// against these, so a new trainer (ECG, X-ray, pathology) supplies data and a media viewer, not new UI.

import type { Mode } from '../../lib/modes';
import type { Engine, Part } from './engine';
import type { Media } from './media';

export type Section = 'home' | 'learn' | 'practice' | 'quiz' | 'review' | 'progress';

export const SECTIONS: { id: Section; label: string; path: string }[] = [
  { id: 'home', label: 'Home', path: '' },
  { id: 'learn', label: 'Learn', path: 'learn/' },
  { id: 'practice', label: 'Practice', path: 'practice/' },
  { id: 'quiz', label: 'Quiz', path: 'quiz/' },
  { id: 'review', label: 'Review', path: 'review/' },
  { id: 'progress', label: 'Progress', path: 'progress/' },
];

export interface TrainerMeta {
  id: string;            // stable; used in storage keys and (later) the database
  mode: Mode;
  slug: string;          // URL segment under the mode's /trainers/
  title: string;
  /** Shown in the app bar on narrow screens. */
  short: string;
  summary: string;
  /** What the trainer shows. Only 'audio' has a viewer so far. */
  media: Media['kind'] | 'ecg' | 'image' | 'slide';
  status: 'ready' | 'soon';
}

/** What a trainer gives the shared UI. `I` is the trainer's item type (a recording, an ECG, an image). */
export interface TrainerAdapter<I extends { id: string }> {
  meta: TrainerMeta;
  version: string;                 // content version, stored with every attempt
  engine: Engine<I>;
  media(item: I): Media;
  /** Teaching text shown after an answer, for one part of a question. */
  explain(item: I, part: Part<I>): { title: string; body: string };
  /** Extra sounds/images to compare after an answer (another example, the learner's choice, parts of a mix). */
  compare(item: I, parts: { answer: string; chosen: string }[]): { label: string; media: Media }[];
}
