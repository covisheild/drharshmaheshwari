// Picks the viewer for a kind of media. New kinds (ECG traces, images, slides) register here.
import type { Media, MediaViewer } from '../core/media';
import { AudioViewer } from './audio-viewer';

export function createViewer(kind: Media['kind'], root: HTMLElement): MediaViewer {
  switch (kind) {
    case 'audio': return new AudioViewer(root);
  }
}
