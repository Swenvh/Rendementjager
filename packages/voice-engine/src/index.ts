export * from './types.js';
export * from './numbers.js';
export * from './normalize.js';
export * from './cache.js';
export * from './captions.js';
export * from './audio-qa.js';
export * from './synthesize.js';
export { probeDurationMs, hasBinary } from './ffmpeg.js';
import { ElevenLabsProvider } from './providers/elevenlabs.js';
import type { TtsProvider } from './types.js';
export { ElevenLabsProvider, alignmentToWords, type ElevenLabsConfig } from './providers/elevenlabs.js';
export * from './voiceless.js';

export interface VoiceSelection {
  /** null = voiceless Reel (captions only). */
  provider: TtsProvider | null;
  mode: 'elevenlabs' | 'none';
  /** Why this mode, for logs and metadata (never contains secrets). */
  reason: string;
}

/**
 * Voice policy. There is NO local/robotic voice. ElevenLabs is an explicit opt-in:
 * RJ_TTS_PROVIDER=elevenlabs AND ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID. Anything else renders voiceless.
 */
export function selectVoice(env: NodeJS.ProcessEnv = process.env): VoiceSelection {
  if (env.RJ_TTS_PROVIDER !== 'elevenlabs') return { provider: null, mode: 'none', reason: 'voiceless: ElevenLabs is opt-in (set RJ_TTS_PROVIDER=elevenlabs)' };
  const el = new ElevenLabsProvider({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, modelId: env.ELEVENLABS_MODEL_ID });
  if (!el.isConfigured()) return { provider: null, mode: 'none', reason: 'voiceless: RJ_TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID are not both set' };
  return { provider: el, mode: 'elevenlabs', reason: 'ElevenLabs brand voice (explicit opt-in)' };
}

/** Status for dashboards: never exposes secrets. */
export function voiceStatus(env: NodeJS.ProcessEnv = process.env) {
  const el = new ElevenLabsProvider({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID });
  const sel = selectVoice(env);
  return {
    elevenlabs: { configured: el.isConfigured(), optedIn: env.RJ_TTS_PROVIDER === 'elevenlabs' },
    mode: sel.mode,
    reason: sel.reason,
  };
}
