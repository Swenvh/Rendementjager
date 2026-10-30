import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest, saveManifest } from '@rj/footage-engine';
import { buildReelCalculation } from '@rj/finance-engine';
import { describe, expect, it } from 'vitest';
import { reelCalculationFromEngine } from '../src/calc/from-finance-engine';
import { defaultTemplateB, defaultTemplateC } from '../src/defaults';
import { templateBSchema, templateCSchema } from '../src/schemas';
import { buildTokens, fillTokens, resolveBackground, roundedEuroPhrase } from '../scripts/lib/prepare';
import { runMediaQa } from '../scripts/qa';

describe('reel calculation mapping', () => {
  it('uses @rj/finance-engine numbers in cents', () => {
    const c = reelCalculationFromEngine();
    expect(c.engine).toBe('@rj/finance-engine');
    expect(c.totalContributedCents).toBe(9_000_000);
    expect(Math.round(c.finalValueCents / 100)).toBe(292_363);
    expect(c.series).toHaveLength(31);
    expect(c.contributionTiming).toBe('end-of-month');
    expect(c.inflation?.annualRatePct).toBe(2);
  });
  it('default props validate; Template B requires source + date', () => {
    expect(() => templateCSchema.parse(defaultTemplateC)).not.toThrow();
    expect(() => templateBSchema.parse(defaultTemplateB)).not.toThrow();
    expect(() => templateBSchema.parse({ ...defaultTemplateB, source: { ...defaultTemplateB.source, publishedAt: '' } })).toThrow();
  });
});

describe('script tokens', () => {
  it('spoken rounding never overstates', () => {
    expect(roundedEuroPhrase(292_363)).toBe('ruim €292.000');
    expect(roundedEuroPhrase(161_800)).toBe('bijna €162.000');
  });
  it('fills tokens from the calculation and rejects unknown ones', () => {
    const t = buildTokens();
    expect(fillTokens('{{monthlyContribution}} · {{annualReturn}}', t)).toBe('€250 · 7%');
    expect(() => fillTokens('{{nope}}', t)).toThrow();
  });
});

describe('growth scene values come from the engine series', () => {
  const engine = buildReelCalculation();
  const calc = reelCalculationFromEngine();
  it('monthly value at every whole year equals the engine yearly series', () => {
    for (const y of engine.series) {
      const m = calc.monthly[y.year * 12]!;
      expect(m.valueCents).toBe(Math.round(y.valueNominal * 100));
      expect(m.contributedCents).toBe(Math.round(y.contributed * 100));
    }
  });
  it('year 29 is the true value, not an interpolation', () => {
    expect(calc.monthly[29 * 12]!.valueCents).toBe(Math.round(engine.series[29]!.valueNominal * 100));
    expect(Math.round(calc.monthly[29 * 12]!.valueCents / 100)).not.toBe(280_576);
  });
  it('monthly series ends at the final value and is strictly increasing', () => {
    expect(calc.monthly.at(-1)!.valueCents).toBe(calc.finalValueCents);
    for (let i = 1; i < calc.monthly.length; i++) expect(calc.monthly[i]!.valueCents).toBeGreaterThan(calc.monthly[i - 1]!.valueCents);
  });
});

describe('voiceless media QA (voice: none)', () => {
  const has = (c: string) => { try { execFileSync('which', [c]); return true; } catch { return false; } };
  it.skipIf(!has('ffmpeg'))('a Reel without audio passes when voiceless and fails when a voice was expected', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-qa-'));
    const f = join(dir, 'x.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', f]);
    const none = await runMediaQa(f, { voice: 'none', framesDir: join(dir, 'f1') });
    expect(none.voice).toBe('none');
    expect(none.issues).toEqual([]);
    expect(none.pass).toBe(true);
    const expectVoice = await runMediaQa(f, { voice: 'present', framesDir: join(dir, 'f2') });
    expect(expectVoice.issues).toContain('no audio stream');
    // everything else is still checked for voiceless Reels
    const wrong = join(dir, 'wrong.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', wrong]);
    const bad = await runMediaQa(wrong, { voice: 'none', framesDir: join(dir, 'f3') });
    expect(bad.pass).toBe(false);
    expect(bad.issues.join()).toMatch(/resolution|fps/);
  }, 60_000);
});

describe('resolveBackground (footage library -> Remotion public dir)', () => {
  const mk = (ids: string[]) => {
    const root = mkdtempSync(join(tmpdir(), 'rj-bg-'));
    mkdirSync(join(root, 'nl'));
    const clips = ids.map((id) => {
      writeFileSync(join(root, 'nl', `${id}.mp4`), 'x');
      return { id, file: `nl/${id}.mp4`, title: id, sourceUrl: 'https://www.pexels.com/video/a-1/', author: 'A', licence: 'Pexels License' as const, licenceUrl: 'https://www.pexels.com/license/', retrievedDate: '2026-10-30', location: 'NL', durationS: 10, width: 1080, height: 1920 };
    });
    saveManifest(root, { version: 1, clips });
    return root;
  };
  it('empty library -> null (animated fallback)', () => {
    const r = resolveBackground('2026-10-23-a', 50_000, undefined, { root: mk([]), publicDir: mkdtempSync(join(tmpdir(), 'rj-pub-')) });
    expect(r.props).toBeNull();
    expect(r.info.mode).toBe('fallback-animated');
  });
  it('chains different clips to cover the Reel, copies them, validates the schema', () => {
    const pub = mkdtempSync(join(tmpdir(), 'rj-pub-'));
    const r = resolveBackground('2026-10-23-a', 45_000, undefined, { root: mk(['a-01', 'b-01', 'c-01', 'd-01', 'e-01', 'f-01', 'g-01']), publicDir: pub, allSlugs: ['2026-10-23-a'] });
    expect(r.props!.clips.length).toBe(5);
    expect(new Set(r.props!.clips.map((c) => c.clipId)).size).toBe(5);
    expect(existsSync(join(pub, 'footage', `${r.props!.clips[0]!.clipId}.mp4`))).toBe(true);
    expect(() => templateCSchema.parse({ ...defaultTemplateC, background: r.props })).not.toThrow();
  });
  it('uses the storyboard clips when named and still usable; ignores unusable ones', () => {
    const root = mk(['a-01', 'b-01', 'c-01']);
    const pub = mkdtempSync(join(tmpdir(), 'rj-pub-'));
    const r = resolveBackground('s', 15_000, ['b-01', 'c-01'], { root, publicDir: pub });
    expect(r.props!.clips.map((c) => c.clipId).slice(0, 2)).toEqual(['b-01', 'c-01']);
    const r2 = resolveBackground('s', 15_000, ['gone-01'], { root, publicDir: pub });
    expect(r2.info.selection).toBe('rotation');
  });
  it('a clip with a non-allowed licence is never staged', () => {
    const root = mk(['a-01']);
    const m = loadManifest(root);
    m.clips[0]!.licence = 'Standard YouTube License' as never;
    saveManifest(root, m);
    expect(resolveBackground('s', 10_000, undefined, { root, publicDir: mkdtempSync(join(tmpdir(), 'rj-pub-')) }).props).toBeNull();
  });
});
