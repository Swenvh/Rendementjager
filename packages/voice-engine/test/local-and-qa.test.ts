import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalFallbackProvider, audioQa, synthesizeScript, detectSilences } from '../src/index.js';

const has = (c: string) => { try { execFileSync('which', [c]); return true; } catch { return false; } };
const canRun = has('ffmpeg') && has('espeak-ng');

describe.skipIf(!has('ffmpeg'))('audio QA', () => {
  it('detects silence > 1.5s and clipping', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-qa-'));
    const f = join(dir, 'gap.wav');
    // 1s loud square-ish tone (clips), 2s silence, 1s tone
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=1,volume=8', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=1',
      '-filter_complex', '[0:a]aresample=48000,aformat=channel_layouts=mono[a];[2:a]aresample=48000,aformat=channel_layouts=mono[c];[a][1:a][c]concat=n=3:v=0:a=1', f]);
    const silences = await detectSilences(f);
    expect(silences).toHaveLength(1);
    expect(silences[0]!.durationS).toBeGreaterThan(1.9);
    const r = await audioQa(f);
    expect(r.clipping).toBe(true);
    expect(r.pass).toBe(false);
  });
});

describe.skipIf(!canRun)('LocalFallbackProvider + synthesizeScript (real espeak-ng)', () => {
  it('produces a labelled, normalized, cached track with real segment durations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-local-'));
    const p = new LocalFallbackProvider();
    expect(p.brandVoice).toBe(false);
    const segs = [{ id: 's1', text: 'Stel: €250 per maand.' }, { id: 's2', text: 'Dertig jaar lang, 7% per jaar.' }];
    const track = await synthesizeScript(p, segs, { cacheDir: join(dir, 'cache'), outPath: join(dir, 'vo.wav') });
    expect(track.provider).toBe('local-fallback');
    expect(track.brandVoice).toBe(false);
    expect(track.segments[0]!.spokenText).toContain('tweehonderdvijftig euro');
    expect(track.segments[0]!.durationMs).toBeGreaterThan(500);
    expect(track.segments[1]!.startMs).toBeGreaterThan(track.segments[0]!.endMs);
    expect(track.qa.outputLufs).not.toBeNull();
    expect(Math.abs(track.qa.outputLufs! + 16)).toBeLessThan(1.5);
    expect(track.qa.clipping).toBe(false);
    const again = await synthesizeScript(p, segs, { cacheDir: join(dir, 'cache'), outPath: join(dir, 'vo2.wav') });
    expect(again.segments.every((s) => s.cacheHit)).toBe(true);
  }, 60_000);
});
