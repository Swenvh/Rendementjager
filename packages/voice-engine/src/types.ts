export type ProviderId = 'elevenlabs' | 'local-fallback';

export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

/** Result of synthesizing one piece of (already normalized) text. */
export interface SegmentAudio {
  /** Absolute path of the audio file (wav or mp3). */
  audioPath: string;
  /** Real duration measured with ffprobe. */
  durationMs: number;
  /** Word timings relative to the segment start, when the provider returns them. */
  words: WordTiming[] | null;
}

export interface SynthesizeOptions {
  /** Directory the provider may write its file to. */
  outDir: string;
  /** File stem (no extension) to use. */
  fileStem: string;
  /** Text before / after, for providers that use it for prosody. */
  previousText?: string;
  nextText?: string;
}

export interface TtsProvider {
  readonly id: ProviderId;
  /** True only for the official brand voice (ElevenLabs with configured voice). */
  readonly brandVoice: boolean;
  /** Voice identifier used in cache keys and metadata (never a secret). */
  readonly voice: string;
  /** Normalization target for the dictionary. */
  readonly normalizeTarget: 'default' | 'local';
  isConfigured(): boolean;
  synthesize(normalizedText: string, opts: SynthesizeOptions): Promise<SegmentAudio>;
}

export interface ScriptSegmentInput {
  id: string;
  /** Text as shown in captions (may contain €, %). */
  text: string;
  /** Pause after this segment in ms (default 350). */
  pauseAfterMs?: number;
}

export interface TimedSegment {
  id: string;
  text: string;
  spokenText: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  cacheHit: boolean;
  /** Word timings relative to the whole track. */
  words: WordTiming[];
  /** 'provider' = returned by TTS, 'estimated' = distributed over the measured segment by length. */
  wordTimingSource: 'provider' | 'estimated';
}

export interface VoiceTrack {
  provider: ProviderId;
  brandVoice: boolean;
  voice: string;
  audioPath: string;
  durationMs: number;
  leadInMs: number;
  segments: TimedSegment[];
  qa: import('./audio-qa.js').AudioQaReport;
}
