import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { probeDurationMs, run } from '../ffmpeg.js';
import type { SegmentAudio, SynthesizeOptions, TtsProvider } from '../types.js';

export interface LocalFallbackConfig {
  /** espeak-ng voice. Default: MBROLA Dutch "mb-nl2" when installed, else "nl". */
  voice?: string;
  /** Words per minute. */
  speed?: number;
  pitch?: number;
}

/** MBROLA Dutch voices sound far less robotic than the formant voice; use when present. */
function detectVoice(): string {
  return existsSync('/usr/share/mbrola/nl2/nl2') || existsSync('/usr/share/mbrola/nl2') ? 'mb-nl2' : 'nl';
}

/**
 * Local fallback TTS via espeak-ng. NOT the brand voice: output is always labelled
 * provider 'local-fallback', brandVoice false. Install: apt-get install -y espeak-ng (optional: mbrola-nl2).
 */
export class LocalFallbackProvider implements TtsProvider {
  readonly id = 'local-fallback' as const;
  readonly brandVoice = false;
  readonly normalizeTarget = 'local' as const;
  readonly voice: string;
  private readonly speed: number;
  private readonly pitch: number;

  constructor(cfg: LocalFallbackConfig = {}) {
    this.voice = cfg.voice ?? detectVoice();
    this.speed = cfg.speed ?? 158;
    this.pitch = cfg.pitch ?? 42;
  }

  isConfigured(): boolean {
    return existsSync('/usr/bin/espeak-ng') || existsSync('/usr/local/bin/espeak-ng');
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<SegmentAudio> {
    await mkdir(opts.outDir, { recursive: true });
    const raw = join(opts.outDir, `${opts.fileStem}.raw.wav`);
    const audioPath = join(opts.outDir, `${opts.fileStem}.wav`);
    await run('espeak-ng', ['-v', this.voice, '-s', String(this.speed), '-p', String(this.pitch), '-w', raw, '--', text]);
    // Resample to 48 kHz mono and trim leading/trailing silence so the measured duration is speech.
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', raw,
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=70,lowpass=f=7500',
      '-ar', '48000', '-ac', '1', audioPath,
    ]);
    return { audioPath, durationMs: await probeDurationMs(audioPath), words: null };
  }
}
