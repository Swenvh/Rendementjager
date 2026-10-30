import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { audioQa, normalizeLoudness } from './audio-qa.js';
import { cacheKey, VoiceCache } from './cache.js';
import { estimateWordTimings } from './captions.js';
import { run } from './ffmpeg.js';
import { normalizeForSpeech } from './normalize.js';
import type { ScriptSegmentInput, TimedSegment, TtsProvider, VoiceTrack, WordTiming } from './types.js';

export interface SynthesizeScriptOptions {
  cacheDir: string;
  /** Final normalized track (wav). */
  outPath: string;
  leadInMs?: number;
  defaultPauseMs?: number;
  tailMs?: number;
  targetLufs?: number;
}

/**
 * Synthesize a script segment by segment (cached by text hash), lay the segments out on a
 * timeline with their REAL measured durations, mix into one track, loudness-normalize and QA it.
 */
export async function synthesizeScript(
  provider: TtsProvider,
  segments: ScriptSegmentInput[],
  opts: SynthesizeScriptOptions,
): Promise<VoiceTrack> {
  if (!segments.length) throw new Error('No segments');
  const cache = new VoiceCache(opts.cacheDir);
  const leadInMs = opts.leadInMs ?? 300;
  const defaultPause = opts.defaultPauseMs ?? 350;
  const tailMs = opts.tailMs ?? 700;
  const workDir = join(opts.cacheDir, 'work');

  const timed: TimedSegment[] = [];
  const files: string[] = [];
  let t = leadInMs;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const spokenText = normalizeForSpeech(seg.text, provider.normalizeTarget);
    const key = cacheKey(provider.id, provider.voice, spokenText);
    let entry = await cache.get(key);
    const cacheHit = entry !== null;
    if (!entry) {
      const audio = await provider.synthesize(spokenText, {
        outDir: workDir,
        fileStem: key,
        previousText: segments[i - 1] ? normalizeForSpeech(segments[i - 1]!.text, provider.normalizeTarget) : undefined,
        nextText: segments[i + 1] ? normalizeForSpeech(segments[i + 1]!.text, provider.normalizeTarget) : undefined,
      });
      entry = await cache.put({ key, provider: provider.id, voice: provider.voice, normalizedText: spokenText, sourcePath: audio.audioPath, durationMs: audio.durationMs, words: audio.words });
    }
    const startMs = t;
    const endMs = startMs + entry.durationMs;
    const displayWords = seg.text.split(/\s+/).filter(Boolean);
    let words: WordTiming[];
    let wordTimingSource: TimedSegment['wordTimingSource'];
    if (entry.words && entry.words.length === displayWords.length) {
      words = entry.words.map((w, j) => ({ text: displayWords[j]!, startMs: startMs + w.startMs, endMs: startMs + w.endMs }));
      wordTimingSource = 'provider';
    } else {
      words = estimateWordTimings(seg.text, startMs, entry.durationMs, provider.normalizeTarget);
      wordTimingSource = 'estimated';
    }
    timed.push({ id: seg.id, text: seg.text, spokenText, startMs, endMs, durationMs: entry.durationMs, cacheHit, words, wordTimingSource });
    files.push(entry.audioPath);
    t = endMs + (seg.pauseAfterMs ?? defaultPause);
  }
  const lastEnd = timed[timed.length - 1]!.endMs;
  const durationMs = lastEnd + tailMs;

  // Mix: each segment delayed to its start, summed, padded to the full duration.
  await mkdir(dirname(opts.outPath), { recursive: true });
  const mixPath = join(workDir, `mix-${Date.now()}.wav`);
  const inputs = files.flatMap((f) => ['-i', f]);
  const chains = timed.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${s.startMs}|${s.startMs}[a${i}]`);
  const mix = `${timed.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timed.length}:normalize=0:dropout_transition=0,apad,atrim=0:${(durationMs / 1000).toFixed(3)}[out]`;
  await run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', [...chains, mix].join(';'), '-map', '[out]', '-ar', '48000', '-ac', '1', mixPath]);

  const measured = await normalizeLoudness(mixPath, opts.outPath, opts.targetLufs ?? -16);
  const qa = await audioQa(opts.outPath, { targetLufs: opts.targetLufs ?? -16, inputLufs: measured.integratedLufs });
  return { provider: provider.id, brandVoice: provider.brandVoice, voice: provider.voice, audioPath: opts.outPath, durationMs, leadInMs, segments: timed, qa };
}
