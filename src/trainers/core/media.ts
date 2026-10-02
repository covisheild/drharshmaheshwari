// Media descriptors and the viewer contract. A trainer describes what to show; a viewer shows it.
// Only audio exists today. ECG traces, images and whole-slide pathology will add their own `kind`
// and viewer without changing the question runner.

/** A labelled stretch of a recording, e.g. S1, S2 or a murmur, in seconds. */
export interface Span { start: number; end: number; label: string; kind?: string }

export interface AudioMedia {
  kind: 'audio';
  src: string;
  /** Pre-generated waveform (audiowaveform JSON v2) stored next to the audio on R2. Optional: the viewer
   *  shows a plain progress bar when it is missing or cannot be fetched. */
  peaks?: string;
  duration?: number;
  spans?: Span[];
}

export type Media = AudioMedia;

export interface LoadOptions {
  autoplay?: boolean;
  /** Shown above the media, e.g. "Example 2 of 12" or "Your answer: S3". */
  label?: string;
}

export interface MediaViewer<M extends Media = Media> {
  load(media: M, opts?: LoadOptions): void;
  /** Hide visual cues (waveform shape, labelled spans) that would give an answer away. */
  setCues(visible: boolean): void;
  stop(): void;
  destroy(): void;
}
