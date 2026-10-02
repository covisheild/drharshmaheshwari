// Every trainer on the site. Lists, navigation and the sitemap read this; adding a trainer means one entry
// here, a folder in src/trainers/<id>/ and its pages under src/pages/<mode>/trainers/<slug>/.

import { section } from '../lib/modes';
import type { TrainerMeta } from './core/types';

export const TRAINERS: TrainerMeta[] = [
  { id: 'auscultation', mode: 'doctors', slug: 'auscultation', title: 'Auscultation Trainer', short: 'Auscultation', media: 'audio', status: 'ready',
    summary: 'Heart and lung sounds from recordings: learn each sound, then practise, quiz and review.' },
  { id: 'ecg', mode: 'doctors', slug: 'ecg', title: 'ECG Trainer', short: 'ECG', media: 'ecg', status: 'soon',
    summary: 'Read rhythms and patterns on 12-lead ECGs.' },
  { id: 'chest-xray', mode: 'doctors', slug: 'chest-xray', title: 'Chest X-ray Trainer', short: 'Chest X-ray', media: 'image', status: 'soon',
    summary: 'Spot common findings on chest radiographs.' },
];

export const trainerBase = (t: TrainerMeta) => `${section(t.mode, 'trainers')}${t.slug}/`;
export const trainer = (id: string) => TRAINERS.find((t) => t.id === id)!;
