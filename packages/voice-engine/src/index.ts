export * from './types.js';
export * from './numbers.js';
export * from './normalize.js';
export * from './cache.js';
export * from './captions.js';
export * from './audio-qa.js';
export * from './synthesize.js';
export { probeDurationMs, hasBinary } from './ffmpeg.js';
export { ElevenLabsProvider, alignmentToWords, type ElevenLabsConfig } from './providers/elevenlabs.js';
export { LocalFallbackProvider, type LocalFallbackConfig } from './providers/local-fallback.js';

import { ElevenLabsProvider } from './providers/elevenlabs.js';
import { LocalFallbackProvider } from './providers/local-fallback.js';
import type { TtsProvider } from './types.js';

/**
 * ElevenLabs (brand voice) when configured via env, else the labelled local fallback.
 * Pass { forceLocal: true } to never call a paid API (cost control).
 */
export function selectProvider(opts: { forceLocal?: boolean } = {}): TtsProvider {
  const el = new ElevenLabsProvider();
  if (!opts.forceLocal && el.isConfigured()) return el;
  return new LocalFallbackProvider();
}

/** Status for dashboards: never exposes secrets. */
export function voiceStatus() {
  const el = new ElevenLabsProvider();
  const local = new LocalFallbackProvider();
  return {
    elevenlabs: { configured: el.isConfigured() },
    localFallback: { configured: local.isConfigured(), voice: local.voice, brandVoice: false },
  };
}
