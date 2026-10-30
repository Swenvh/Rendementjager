import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { chooseFile, fetchFromProvider, fetchYoutubeCc, isCcBy, loadManifest, type Prober } from '../src/index.js';

// UNTESTED against the live services (pexels.com, pixabay.com, youtube.com are blocked in the build sandbox).
// These tests use a mocked HTTP transport / mocked yt-dlp output only.

const probe: Prober = async () => ({ width: 1080, height: 1920, durationS: 14.5, hasAudio: false, fps: 30 });
const mp4 = () => new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200 });

const pexelsBody = {
  videos: [
    { id: 111, width: 2160, height: 3840, duration: 15, url: 'https://www.pexels.com/video/aerial-polder-111/', user: { name: 'Piet Pilot' }, video_files: [
      { file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/video-files/111/a.mp4' },
      { file_type: 'video/mp4', width: 2160, height: 3840, link: 'https://videos.pexels.com/video-files/111/b.mp4' },
      { file_type: 'video/webm', width: 540, height: 960, link: 'https://videos.pexels.com/video-files/111/c.webm' }] },
    { id: 222, width: 3840, height: 2160, duration: 20, url: 'https://www.pexels.com/video/windmills-222/', user: { name: 'Kees Kijker' }, video_files: [
      { file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/video-files/222/a.mp4' },
      { file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/video-files/222/b.mp4' }] },
  ],
};

describe('chooseFile', () => {
  it('portrait: smallest >= 1080 wide; landscape: prefers 4K', () => {
    expect(chooseFile([{ url: 'https://a/1', width: 540, height: 960 }, { url: 'https://a/2', width: 1080, height: 1920 }, { url: 'https://a/3', width: 2160, height: 3840 }])!.url).toBe('https://a/2');
    expect(chooseFile([{ url: 'https://a/1', width: 1920, height: 1080 }, { url: 'https://a/2', width: 3840, height: 2160 }])!.url).toBe('https://a/2');
    expect(chooseFile([{ url: 'http://a/1', width: 1920, height: 1080 }])).toBeNull();
  });
});

describe('fetch --provider pexels (mocked transport)', () => {
  it('uses the official endpoint + Authorization header, downloads, writes valid manifest entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rj-px-'));
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).startsWith('https://api.videos.pexels.com/') ? new Response(JSON.stringify(pexelsBody), { status: 200 }) : mp4();
    });
    const r = await fetchFromProvider({ provider: 'pexels', query: 'polder', count: 2, root, env: { PEXELS_API_KEY: 'k-123' }, fetchImpl: fetchImpl as never, probe, today: '2026-10-30', location: 'Polder, Nederland' });
    expect(r.added).toEqual(['pexels-111', 'pexels-222']);
    expect(calls[0]!.url).toContain('https://api.videos.pexels.com/videos/search?query=polder&orientation=portrait');
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('k-123');
    expect(calls.map((c) => c.url)).toContain('https://videos.pexels.com/video-files/111/a.mp4'); // portrait 1080 chosen over 4K
    const m = loadManifest(root);
    expect(m.clips[0]).toMatchObject({ licence: 'Pexels License', licenceUrl: 'https://www.pexels.com/license/', author: 'Piet Pilot', sourceUrl: 'https://www.pexels.com/video/aerial-polder-111/', retrievedDate: '2026-10-30', durationS: 14.5 });
    // idempotent
    const again = await fetchFromProvider({ provider: 'pexels', query: 'polder', count: 2, root, env: { PEXELS_API_KEY: 'k-123' }, fetchImpl: fetchImpl as never, probe });
    expect(again.added).toEqual([]);
  });
  it('refuses without a key and never leaks it in errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rj-px-'));
    await expect(fetchFromProvider({ provider: 'pexels', query: 'x', count: 1, root, env: {} })).rejects.toThrow(/PEXELS_API_KEY is not set/);
    const bad = vi.fn(async () => new Response('no', { status: 401 }));
    await expect(fetchFromProvider({ provider: 'pixabay', query: 'x', count: 1, root, env: { PIXABAY_API_KEY: 'secret-key' }, fetchImpl: bad as never })).rejects.toThrow(/HTTP 401/);
    await expect(fetchFromProvider({ provider: 'pixabay', query: 'x', count: 1, root, env: { PIXABAY_API_KEY: 'secret-key' }, fetchImpl: bad as never })).rejects.not.toThrow(/secret-key/);
  });
  it('refuses downloads from unexpected hosts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rj-px-'));
    const body = { videos: [{ id: 5, width: 1080, height: 1920, duration: 9, url: 'https://www.pexels.com/video/a-5/', video_files: [{ file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://evil.example.com/a.mp4' }] }] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const r = await fetchFromProvider({ provider: 'pexels', query: 'x', count: 1, root, env: { PEXELS_API_KEY: 'k' }, fetchImpl: fetchImpl as never, probe });
    expect(r.added).toEqual([]);
    expect(r.skipped[0]!.reason).toMatch(/unexpected host/);
  });
});

describe('fetch --provider pixabay (mocked transport)', () => {
  it('maps hits, prefers portrait, records the Pixabay licence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rj-pb-'));
    const body = { hits: [
      { id: 9, pageURL: 'https://pixabay.com/videos/mill-9/', tags: 'mill, windmill', duration: 22, user: 'molenaar', videos: { large: { url: 'https://cdn.pixabay.com/video/9-large.mp4', width: 3840, height: 2160 } } },
      { id: 8, pageURL: 'https://pixabay.com/videos/tower-8/', tags: 'tower', duration: 12, user: 'toren', videos: { large: { url: 'https://cdn.pixabay.com/video/8-large.mp4', width: 1080, height: 1920 } } },
    ] };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (String(url).startsWith('https://pixabay.com/api/videos/') ? new Response(JSON.stringify(body), { status: 200 }) : mp4()));
    const r = await fetchFromProvider({ provider: 'pixabay', query: 'windmolens', count: 2, root, env: { PIXABAY_API_KEY: 'k' }, fetchImpl: fetchImpl as never, probe, today: '2026-10-30' });
    expect(r.added).toEqual(['pixabay-8', 'pixabay-9']);
    expect(loadManifest(root).clips.find((c) => c.id === 'pixabay-9')).toMatchObject({ licence: 'Pixabay Content License', licenceUrl: 'https://pixabay.com/service/license-summary/', author: 'molenaar' });
  });
});

describe('youtube-cc (mocked yt-dlp output)', () => {
  const meta = (license: string | null | undefined) => JSON.stringify({ id: 'AbC123xyz_-', title: 'Dutch Windmills 4K', channel: 'Scenic NL', webpage_url: 'https://www.youtube.com/watch?v=AbC123xyz_-', license, duration: 600 });
  const runner = (license: string | null | undefined, log: string[][] = []) => async (cmd: string, args: string[]) => {
    log.push([cmd, ...args]);
    if (cmd === 'yt-dlp' && args.includes('--dump-single-json')) return { stdout: meta(license), stderr: '' };
    return { stdout: '', stderr: '' };
  };
  it('isCcBy only accepts Creative Commons Attribution', () => {
    expect(isCcBy('Creative Commons Attribution license (reuse allowed)')).toBe(true);
    expect(isCcBy('Standard YouTube License')).toBe(false);
    expect(isCcBy('')).toBe(false);
    expect(isCcBy(null)).toBe(false);
    expect(isCcBy('Creative Commons Attribution-NonCommercial')).toBe(false);
  });
  it('REFUSES standard licence or missing licence field, before any download', async () => {
    for (const lic of ['Standard YouTube License', null, undefined]) {
      const root = mkdtempSync(join(tmpdir(), 'rj-yt-'));
      const log: string[][] = [];
      await expect(fetchYoutubeCc({ url: 'https://youtu.be/AbC123xyz_-', root, run: runner(lic, log), probe })).rejects.toThrow(/Refused/);
      expect(log.some((l) => !l.includes('--dump-single-json') && l[0] === 'yt-dlp')).toBe(false);
      expect(loadManifest(root).clips).toEqual([]);
    }
  });
  it('refuses non-YouTube URLs', async () => {
    await expect(fetchYoutubeCc({ url: 'https://example.com/v', root: tmpdir(), run: runner('x'), probe })).rejects.toThrow(/youtube/);
  });
  it('CC BY: video only, manifest entry with mandatory credit line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rj-yt-'));
    const log: string[][] = [];
    const base = runner('Creative Commons Attribution license (reuse allowed)', log);
    const run = async (cmd: string, args: string[]) => {
      if (cmd === 'ffmpeg') {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(args[args.length - 1]!, 'v');
      }
      if (cmd === 'yt-dlp' && !args.includes('--dump-single-json')) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(args[args.indexOf('-o') + 1]!.replace('%(ext)s', 'mp4'), 'raw');
      }
      return base(cmd, args);
    };
    const clip = await fetchYoutubeCc({ url: 'https://youtu.be/AbC123xyz_-', root, run, probe, today: '2026-10-30', location: 'Kinderdijk' });
    expect(clip).toMatchObject({ id: 'ytcc-abc123xyz', licence: 'CC BY', creditRequired: true, author: 'Scenic NL', creditLine: 'Beeld: Dutch Windmills 4K van Scenic NL (CC BY)', retrievedDate: '2026-10-30' });
    const dl = log.find((l) => l[0] === 'yt-dlp' && l.includes('-f'))!;
    expect(dl[dl.indexOf('-f') + 1]).toMatch(/^bv\*/); // video-only format
    expect(log.find((l) => l[0] === 'ffmpeg')).toContain('-an');
    expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).clips).toHaveLength(1);
  });
});
