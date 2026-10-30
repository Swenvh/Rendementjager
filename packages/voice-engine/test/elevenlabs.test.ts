import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsProvider, alignmentToWords, selectProvider } from '../src/index.js';

const alignment = {
  characters: [...'hallo daar'],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
};

describe('ElevenLabsProvider (mocked fetch; api.elevenlabs.io is blocked in cloud sessions)', () => {
  it('groups character alignment into words', () => {
    expect(alignmentToWords(alignment)).toEqual([
      { text: 'hallo', startMs: 0, endMs: 500 },
      { text: 'daar', startMs: 600, endMs: 1000 },
    ]);
  });

  it('calls the with-timestamps endpoint and writes the audio', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ audio_base64: Buffer.from('ID3fake').toString('base64'), alignment }), { status: 200 }),
    );
    const p = new ElevenLabsProvider({ apiKey: 'test-key', voiceId: 'voice123', modelId: 'eleven_multilingual_v2', fetchImpl: fetchImpl as unknown as typeof fetch, probe: async () => 1000 });
    expect(p.isConfigured()).toBe(true);
    expect(p.brandVoice).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'rj-el-'));
    const out = await p.synthesize('hallo daar', { outDir: dir, fileStem: 'seg1', previousText: 'vorige' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice123/with-timestamps?output_format=mp3_44100_128');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'hallo daar', model_id: 'eleven_multilingual_v2', previous_text: 'vorige' });
    expect(readFileSync(out.audioPath, 'utf8')).toBe('ID3fake');
    expect(out.durationMs).toBe(1000);
    expect(out.words).toHaveLength(2);
  });

  it('errors do not leak the API key', async () => {
    const fetchImpl = vi.fn(async () => new Response('quota exceeded', { status: 429 }));
    const p = new ElevenLabsProvider({ apiKey: 'secret-key', voiceId: 'v', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.synthesize('x', { outDir: tmpdir(), fileStem: 'x' })).rejects.toThrow(/HTTP 429/);
    await expect(p.synthesize('x', { outDir: tmpdir(), fileStem: 'x' })).rejects.not.toThrow(/secret-key/);
  });

  it('falls back to the labelled local provider when not configured', () => {
    const prev = { k: process.env.ELEVENLABS_API_KEY, v: process.env.ELEVENLABS_VOICE_ID };
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    const p = selectProvider();
    expect(p.id).toBe('local-fallback');
    expect(p.brandVoice).toBe(false);
    process.env.ELEVENLABS_API_KEY = prev.k;
    process.env.ELEVENLABS_VOICE_ID = prev.v;
    if (prev.k === undefined) delete process.env.ELEVENLABS_API_KEY;
    if (prev.v === undefined) delete process.env.ELEVENLABS_VOICE_ID;
  });
});
