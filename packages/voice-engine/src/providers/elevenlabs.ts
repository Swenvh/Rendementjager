import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeDurationMs } from '../ffmpeg.js';
import type { SegmentAudio, SynthesizeOptions, TtsProvider, WordTiming } from '../types.js';

export interface ElevenLabsConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  baseUrl?: string;
  outputFormat?: string;
  fetchImpl?: typeof fetch;
  /** Measure duration of the written file. Overridable in tests. */
  probe?: (file: string) => Promise<number>;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface WithTimestampsResponse {
  audio_base64: string;
  alignment?: Alignment | null;
  normalized_alignment?: Alignment | null;
}

/** Group character-level alignment into word timings (ms). */
export function alignmentToWords(al: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let cur: WordTiming | null = null;
  al.characters.forEach((ch, i) => {
    const start = Math.round((al.character_start_times_seconds[i] ?? 0) * 1000);
    const end = Math.round((al.character_end_times_seconds[i] ?? 0) * 1000);
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: ch, startMs: start, endMs: end };
    else {
      cur.text += ch;
      cur.endMs = end;
    }
  });
  if (cur) words.push(cur);
  return words;
}

export class ElevenLabsProvider implements TtsProvider {
  readonly id = 'elevenlabs' as const;
  readonly brandVoice = true;
  readonly normalizeTarget = 'default' as const;
  private readonly cfg: Required<Omit<ElevenLabsConfig, 'apiKey' | 'voiceId'>> & { apiKey?: string; voiceId?: string };

  constructor(cfg: ElevenLabsConfig = {}) {
    this.cfg = {
      apiKey: cfg.apiKey ?? process.env.ELEVENLABS_API_KEY,
      voiceId: cfg.voiceId ?? process.env.ELEVENLABS_VOICE_ID,
      modelId: cfg.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
      baseUrl: cfg.baseUrl ?? 'https://api.elevenlabs.io',
      outputFormat: cfg.outputFormat ?? 'mp3_44100_128',
      fetchImpl: cfg.fetchImpl ?? fetch,
      probe: cfg.probe ?? probeDurationMs,
    };
  }

  get voice(): string {
    return `${this.cfg.voiceId ?? 'unset'}:${this.cfg.modelId}`;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey && this.cfg.voiceId);
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<SegmentAudio> {
    if (!this.isConfigured()) throw new Error('ElevenLabs is not configured (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)');
    const url = `${this.cfg.baseUrl}/v1/text-to-speech/${encodeURIComponent(this.cfg.voiceId!)}/with-timestamps?output_format=${this.cfg.outputFormat}`;
    const res = await this.cfg.fetchImpl(url, {
      method: 'POST',
      headers: { 'xi-api-key': this.cfg.apiKey!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        text,
        model_id: this.cfg.modelId,
        ...(opts.previousText ? { previous_text: opts.previousText } : {}),
        ...(opts.nextText ? { next_text: opts.nextText } : {}),
      }),
    });
    if (!res.ok) {
      // Never include request headers (API key) in errors.
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs request failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as WithTimestampsResponse;
    await mkdir(opts.outDir, { recursive: true });
    const audioPath = join(opts.outDir, `${opts.fileStem}.mp3`);
    await writeFile(audioPath, Buffer.from(json.audio_base64, 'base64'));
    const al = json.alignment ?? json.normalized_alignment ?? null;
    return { audioPath, durationMs: await this.cfg.probe(audioPath), words: al ? alignmentToWords(al) : null };
  }
}
