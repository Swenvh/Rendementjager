import { voicelessAudioQa } from './audio-qa.js';
import { estimateWordTimings } from './captions.js';
import { normalizeForSpeech } from './normalize.js';
import type { ScriptSegmentInput, TimedSegment, VoiceTrack } from './types.js';

/**
 * Reading-speed model for voiceless Reels (captions only). Deterministic: the same script always
 * gives the same timings, no audio, no network, no randomness.
 *
 *   segment duration = max(minSegmentMs, spokenWords * msPerWord + commas * commaMs)
 *
 * `spokenWords` counts words of the speech-normalized text, so "€250" counts as
 * "tweehonderdvijftig euro" (2 words) and "7%" as "zeven procent": numbers get the time a viewer needs to
 * read and take them in. 360 ms/word is ~167 words per minute, a calm pace for on-screen text
 * (comfortable silent reading is faster, but viewers also have to look at the chart). Pauses between
 * segments, lead-in and tail work as in the voiced pipeline.
 */
export const READING_SPEED = { msPerWord: 360, commaMs: 120, minSegmentMs: 1600 } as const;

export interface VoicelessOptions {
  leadInMs?: number;
  defaultPauseMs?: number;
  tailMs?: number;
  msPerWord?: number;
}

export function readingDurationMs(text: string, msPerWord: number = READING_SPEED.msPerWord): number {
  const spoken = normalizeForSpeech(text);
  const words = spoken.split(/\s+/).filter(Boolean).length;
  const commas = (spoken.match(/[,;:]/g) ?? []).length;
  return Math.max(READING_SPEED.minSegmentMs, Math.round(words * msPerWord + commas * READING_SPEED.commaMs));
}

/** Lay a script out on a timeline without any audio: segment timings from reading speed. */
export function buildVoicelessTrack(segments: ScriptSegmentInput[], opts: VoicelessOptions = {}): VoiceTrack {
  if (!segments.length) throw new Error('No segments');
  const leadInMs = opts.leadInMs ?? 350;
  const defaultPause = opts.defaultPauseMs ?? 300;
  const tailMs = opts.tailMs ?? 400;
  const msPerWord = opts.msPerWord ?? READING_SPEED.msPerWord;
  const timed: TimedSegment[] = [];
  let t = leadInMs;
  for (const seg of segments) {
    const durationMs = readingDurationMs(seg.text, msPerWord);
    const startMs = t;
    const endMs = startMs + durationMs;
    timed.push({
      id: seg.id, text: seg.text, spokenText: normalizeForSpeech(seg.text), startMs, endMs, durationMs, cacheHit: false,
      words: estimateWordTimings(seg.text, startMs, durationMs), wordTimingSource: 'reading-speed',
    });
    t = endMs + (seg.pauseAfterMs ?? defaultPause);
  }
  const durationMs = timed[timed.length - 1]!.endMs + tailMs;
  return { provider: 'none', brandVoice: false, voice: 'none', audioPath: null, durationMs, leadInMs, segments: timed, qa: voicelessAudioQa(durationMs), timingSource: 'reading-speed' };
}
