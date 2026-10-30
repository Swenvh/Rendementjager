import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioQa, buildVoicelessTrack, detectSilences, readingDurationMs, toCaptionPages, voicelessAudioQa } from '../src/index.js';

const has = (c: string) => { try { execFileSync('which', [c]); return true; } catch { return false; } };

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
    expect(r.voice).toBe('present');
    expect(r.clipping).toBe(true);
    expect(r.pass).toBe(false);
  });
});

describe('voiceless track (reading-speed timings, no audio)', () => {
  const segs = [
    { id: 's1', text: 'Stel: €250 per maand, 30 jaar lang.' },
    { id: 's2', text: 'Dat is een rekenvoorbeeld, geen garantie.', pauseAfterMs: 500 },
  ];
  it('is deterministic and has no audio file', () => {
    const a = buildVoicelessTrack(segs);
    const b = buildVoicelessTrack(segs);
    expect(a).toEqual(b);
    expect(a.provider).toBe('none');
    expect(a.brandVoice).toBe(false);
    expect(a.audioPath).toBeNull();
    expect(a.timingSource).toBe('reading-speed');
    expect(a.qa.voice).toBe('none');
    expect(a.qa.pass).toBe(true);
  });
  it('lays segments out in order with lead-in, pauses and tail', () => {
    const t = buildVoicelessTrack(segs, { leadInMs: 350, defaultPauseMs: 300, tailMs: 400 });
    expect(t.segments[0]!.startMs).toBe(350);
    expect(t.segments[1]!.startMs).toBe(t.segments[0]!.endMs + 300);
    expect(t.durationMs).toBe(t.segments[1]!.endMs + 400);
    for (const s of t.segments) {
      expect(s.wordTimingSource).toBe('reading-speed');
      expect(s.words[0]!.startMs).toBe(s.startMs);
      expect(Math.abs(s.words.at(-1)!.endMs - s.endMs)).toBeLessThanOrEqual(1);
    }
    expect(toCaptionPages(t.segments).length).toBeGreaterThan(2);
  });
  it('counts numbers by how they are read (€250 = two words) and enforces a minimum', () => {
    expect(readingDurationMs('Hallo')).toBe(1600);
    expect(readingDurationMs('€250')).toBeGreaterThanOrEqual(readingDurationMs('een twee'));
    expect(readingDurationMs('een twee drie vier vijf zes zeven acht')).toBe(8 * 360);
  });
  it('voiceless QA is valid and has no file', () => {
    const q = voicelessAudioQa(5000);
    expect(q).toMatchObject({ voice: 'none', file: null, pass: true, issues: [] });
  });
});
