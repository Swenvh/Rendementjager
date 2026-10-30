import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheKey, VoiceCache, estimateWordTimings, toCaptionPages, type TimedSegment } from '../src/index.js';

describe('cache', () => {
  it('key is sha256 of provider + voice + normalized text', () => {
    const a = cacheKey('elevenlabs', 'voiceA', 'hallo');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey('elevenlabs', 'voiceA', 'hallo')).toBe(a);
    expect(cacheKey('other-provider', 'voiceA', 'hallo')).not.toBe(a);
    expect(cacheKey('elevenlabs', 'voiceB', 'hallo')).not.toBe(a);
    expect(cacheKey('elevenlabs', 'voiceA', 'hallo!')).not.toBe(a);
  });
  it('stores and returns entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-cache-'));
    const src = join(dir, 'x.wav');
    writeFileSync(src, 'fake');
    const cache = new VoiceCache(join(dir, 'c'));
    expect(await cache.get('k')).toBeNull();
    await cache.put({ key: 'k', provider: 'p', voice: 'v', normalizedText: 't', sourcePath: src, durationMs: 1000, words: null });
    const e = await cache.get('k');
    expect(e?.durationMs).toBe(1000);
    expect(e?.audioPath.endsWith('k.wav')).toBe(true);
  });
});

describe('captions', () => {
  it('estimated word timings fill the measured segment exactly', () => {
    const w = estimateWordTimings('Stel: €250 per maand.', 1000, 2000);
    expect(w[0]!.startMs).toBe(1000);
    expect(w[w.length - 1]!.endMs).toBe(3000);
    // "€250" is spoken long, so it gets more time than "per"
    const d = (i: number) => w[i]!.endMs - w[i]!.startMs;
    expect(d(1)).toBeGreaterThan(d(2));
  });
  it('pages never cross segments and respect limits', () => {
    const seg = (id: string, text: string, start: number): TimedSegment => ({
      id, text, spokenText: text, startMs: start, endMs: start + 3000, durationMs: 3000, cacheHit: false,
      words: estimateWordTimings(text, start, 3000), wordTimingSource: 'estimated',
    });
    const pages = toCaptionPages([seg('a', 'een twee drie vier vijf zes', 0), seg('b', 'zeven acht', 4000)], { maxWords: 4 });
    expect(pages.map((p) => p.text)).toEqual(['een twee drie vier', 'vijf zes', 'zeven acht']);
    expect(pages[2]!.segmentId).toBe('b');
    expect(pages[2]!.startMs).toBe(4000);
  });
});
