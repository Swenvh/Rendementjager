import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ffprobeProber, loadManifest, normalizePlan, planIssues, sliceClips, usableClips, type PlanClip, type PlanSource, type SlicePlan } from '../src/index.js';

const has = (c: string) => { try { execFileSync('which', [c]); return true; } catch { return false; } };

const source = (id: string, clips: PlanClip[], extra: Partial<PlanSource> = {}): PlanSource => ({
  id, title: 'SYNTHETIC TEST VIDEO (ffmpeg testsrc)', url: 'https://example.org/synthetic', author: 'ffmpeg testsrc', retrievedDate: '2026-10-30', licence: 'Owner-provided',
  rightsNote: 'Owner declares rights held; not independently verified', clips, ...extra,
});
const plan = (clips: PlanClip[]): SlicePlan => ({ clipDurationS: 4, sources: [source('syn', clips)] });

describe('plan validation', () => {
  it('requires Owner-provided, rightsNote, ids, starts and locations', () => {
    expect(planIssues(plan([{ id: 'a-01', start: 1, location: 'x' }]))).toEqual([]);
    expect(planIssues(plan([{ id: 'A', start: 1, location: '' }])).length).toBe(2);
    const p = plan([{ id: 'a-01', start: 1, location: 'x' }]);
    expect(planIssues({ ...p, sources: [{ ...p.sources[0]!, rightsNote: '' }] }).join()).toMatch(/rightsNote/);
    expect(planIssues({ clipDurationS: 4, sources: [source('a', [{ id: 'x-01', start: 1, location: 'x' }]), source('b', [{ id: 'x-01', start: 1, location: 'x' }])] }).join()).toMatch(/duplicate clip id/);
  });
  it('refuses clips that overlap an avoided range (title card, end screen)', () => {
    const p: SlicePlan = { clipDurationS: 10, sources: [source('a', [{ id: 'a-01', start: 5, location: 'x' }, { id: 'a-02', start: 355, location: 'x' }, { id: 'a-03', start: 31, location: 'x' }], { avoid: [{ from: 0, to: 11, why: 'title card' }, { from: 358, to: 999, why: 'end screen' }] })] };
    const issues = planIssues(p);
    expect(issues).toHaveLength(2);
    expect(issues.join()).toMatch(/a-01.*title card/);
    expect(issues.join()).toMatch(/a-02.*end screen/);
  });
  it('old single-source plans still load', () => {
    const n = normalizePlan({ source: { title: 't', url: 'https://x.org', author: 'a', retrievedDate: '2026-10-30', licence: 'Owner-provided', rightsNote: 'r' }, clips: [{ id: 'a-01', start: 1, location: 'x' }] });
    expect(n.sources).toHaveLength(1);
    expect(planIssues(n)).toEqual([]);
  });
  it('the shipped plan is valid', () => {
    const shipped: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'assets', 'footage', 'plans', 'nl-scenic.json'), 'utf8')) as SlicePlan;
    const p = normalizePlan(shipped);
    expect(planIssues(p)).toEqual([]);
    expect(p.sources.map((x) => [x.id, x.clips.length])).toEqual([['scenic-relaxation-nl', 15], ['drone-snap-amsterdam', 8], ['woerden-short', 1]]);
    expect(p.sources.every((x) => x.licence === 'Owner-provided' && x.rightsNote === 'Owner declares rights held; not independently verified')).toBe(true);
  });
});

describe.skipIf(!has('ffmpeg'))('slice (real ffmpeg, SYNTHETIC 16:9 test video, never in the real manifest)', () => {
  it('cuts portrait 1080x1920 30 fps H.264 clips without audio and writes valid manifest entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-slice-'));
    const input = join(dir, 'synthetic-16x9.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=12', '-f', 'lavfi', '-i', 'sine=f=300:d=12', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);
    const root = join(dir, 'footage');
    const two: SlicePlan = { clipDurationS: 4, sources: [source('syn', [{ id: 'test-01', start: 1, location: 'Synthetic' }, { id: 'test-02', start: 6, location: 'Synthetic' }, { id: 'te-late', start: 11, location: 'Synthetic' }]), source('other', [{ id: 'other-01', start: 0, location: 'Synthetic' }])] };
    const res = await sliceClips({ inputs: { syn: input }, plan: two, root });
    expect(res.made).toEqual(['test-01', 'test-02']);
    expect(res.missingSources.map((m) => m.id)).toEqual(['other']);
    expect(res.failed.map((f) => f.id)).toEqual(['te-late']);
    const p = await ffprobeProber()(join(root, 'nl', 'test-01.mp4'));
    expect(p).toMatchObject({ width: 1080, height: 1920, hasAudio: false });
    expect(p.fps).toBeCloseTo(30, 1);
    expect(p.durationS).toBeCloseTo(4, 0);
    const m = loadManifest(root);
    expect(m.clips[0]).toMatchObject({ licence: 'Owner-provided', provider: 'owner', sourceId: 'syn', rightsNote: 'Owner declares rights held; not independently verified', width: 1080, height: 1920 });
    expect(usableClips(root).map((c) => c.id)).toEqual(['test-01', 'test-02']);
    const again = await sliceClips({ inputs: { syn: input }, plan: plan([{ id: 'test-01', start: 1, location: 'Synthetic' }]), root });
    expect(again.skipped).toEqual(['test-01']);
  }, 60_000);
});
