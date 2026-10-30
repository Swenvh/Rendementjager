import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRunner, fetchSources, isYoutubeRefusal, loadManifest, summarizeFetchSources, ytDlpSectionArgs, type Runner, type SlicePlan } from '../src/index.js';

// yt-dlp is MOCKED (YouTube is blocked in the build sandbox): UNTESTED live. ffmpeg/ffprobe are real.
const has = (c: string) => { try { execFileSync('which', [c]); return true; } catch { return false; } };
const src = (id: string, clips: { id: string; start: number }[]) => ({
  id, title: 'T', url: `https://youtu.be/${id}`, author: 'A', retrievedDate: '2026-10-30', licence: 'Owner-provided' as const,
  rightsNote: 'Owner declares rights held; not independently verified', clips: clips.map((c) => ({ ...c, location: 'NL' })),
});
const plan: SlicePlan = { clipDurationS: 4, sources: [src('aaa', [{ id: 'a-01', start: 5 }, { id: 'a-02', start: 1 }]), src('bbb', [{ id: 'b-01', start: 2 }])] };

describe('fetch-sources helpers', () => {
  it('recognises YouTube refusals', () => {
    expect(isYoutubeRefusal('ERROR: unable to download video data: HTTP Error 403: Forbidden')).toBe(true);
    expect(isYoutubeRefusal("Sign in to confirm you’re not a bot")).toBe(true);
    expect(isYoutubeRefusal('ffmpeg exploded')).toBe(false);
  });
  it('downloads only the range with margin, video only, node runtime, retries', () => {
    const a = ytDlpSectionArgs('https://youtu.be/x', 7, 20, '/t/c.%(ext)s');
    expect(a).toEqual(expect.arrayContaining(['--js-runtimes', 'node', '--retries', '5', '--download-sections', '*7.00-20.00', '--force-keyframes-at-cuts']));
    expect(a[a.indexOf('-f') + 1]).toMatch(/^bv\*/);
    expect(a.at(-2)).toBe('--');
  });
});

describe.skipIf(!has('ffmpeg'))('fetchSources with a mocked yt-dlp', () => {
  const mk = (fail: (url: string, args: string[]) => string | null) => {
    const calls: string[][] = [];
    const run: Runner = async (cmd, args) => {
      if (cmd !== 'yt-dlp') return defaultRunner(cmd, args);
      calls.push(args);
      const url = args[args.length - 1]!;
      const err = fail(url, args);
      if (err) throw Object.assign(new Error('yt-dlp failed'), { stderr: err });
      // Simulate the downloaded section: 16:9 video-only file at the -o template.
      const out = args[args.indexOf('-o') + 1]!.replace('%(ext)s', 'mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast', out]);
      return { stdout: '', stderr: '' };
    };
    return { run, calls };
  };
  it('cuts portrait clips, registers them, and one failure does not abort the run', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'rj-fs-')), 'footage');
    const { run, calls } = mk((url, args) => (url.endsWith('bbb') ? 'ERROR: HTTP Error 403: Forbidden' : args.some((a) => a.startsWith('*0.00')) ? 'boom' : null));
    const r = await fetchSources({ plan, root, run, workDir: mkdtempSync(join(tmpdir(), 'rj-w-')) });
    expect(r.total).toBe(3);
    expect(r.made).toEqual(['a-01']);
    expect(r.failed.map((f) => [f.id, f.kind])).toEqual([['a-02', 'other'], ['b-01', 'refused']]);
    const m = loadManifest(root);
    expect(m.clips.map((c) => c.id)).toEqual(['a-01']);
    expect(m.clips[0]).toMatchObject({ licence: 'Owner-provided', sourceId: 'aaa', width: 1080, height: 1920, sourceUrl: 'https://youtu.be/aaa' });
    expect(calls[0]!.join(' ')).toContain('*2.00-12.00'); // 5s start - 3s margin .. 5+4+3
    const text = summarizeFetchSources(r, 'assets/footage/plans/nl-scenic.json');
    expect(text).toContain('1 van 3 clips gelukt');
    expect(text).toContain('YouTube weigert');
    expect(text).toContain('slice --plan assets/footage/plans/nl-scenic.json --input-dir inbox');
    // a second run skips what exists
    const again = await fetchSources({ plan, root, run: mk(() => null).run, workDir: mkdtempSync(join(tmpdir(), 'rj-w-')), only: ['a-01'] });
    expect(again.skipped).toEqual(['a-01']);
    writeFileSync(join(root, 'x'), '');
  }, 90_000);
});
