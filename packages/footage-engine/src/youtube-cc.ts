import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { clipIssues, LICENCE_URLS, loadManifest, saveManifest, type Clip } from './manifest.js';
import { defaultRunner, ffprobeProber, type Prober, type Runner } from './media.js';

/** Subset of the yt-dlp JSON we read. */
export interface YtMeta {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  webpage_url?: string;
  license?: string | null;
  duration?: number;
}

/** Only YouTube's "Creative Commons Attribution license" (= CC BY) passes. Missing licence = refused. */
export function isCcBy(license: string | null | undefined): boolean {
  if (!license) return false;
  const l = license.toLowerCase();
  return l.includes('creative commons attribution') && !/non-?commercial|share-?alike|no-?deriv/.test(l);
}

const YT_HOST = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/;

export function assertYoutubeUrl(u: string): URL {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new Error('--url is not a valid URL');
  }
  if (url.protocol !== 'https:' || !YT_HOST.test(url.hostname)) throw new Error('--url must be an https youtube.com or youtu.be link');
  return url;
}

export interface YoutubeCcOptions {
  url: string;
  root: string;
  location?: string;
  run?: Runner;
  probe?: Prober;
  today?: string;
}

/**
 * CC BY YouTube videos only. Reads the metadata with yt-dlp FIRST and refuses unless the licence is
 * "Creative Commons Attribution". Downloads video only (no audio: the audio of a CC video may contain
 * third-party music) and verifies the result has no audio stream. Credit line is mandatory.
 * UNTESTED live (YouTube is blocked in the build sandbox); tested with mocked yt-dlp output.
 */
export async function fetchYoutubeCc(o: YoutubeCcOptions): Promise<Clip> {
  const run = o.run ?? defaultRunner;
  const probe = o.probe ?? ffprobeProber(run);
  const url = assertYoutubeUrl(o.url);

  const meta = JSON.parse((await run('yt-dlp', ['--dump-single-json', '--no-playlist', '--skip-download', '--', url.toString()])).stdout) as YtMeta;
  if (!meta.license) throw new Error('Refused: the video metadata has no licence field (treated as the standard YouTube licence). Only "Creative Commons Attribution" videos are allowed.');
  if (!isCcBy(meta.license)) throw new Error(`Refused: licence is "${meta.license}", not Creative Commons Attribution (CC BY).`);
  const vid = (meta.id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!vid) throw new Error('Refused: video id missing in metadata');
  const author = (meta.channel ?? meta.uploader ?? '').trim();
  if (!author || !meta.title?.trim()) throw new Error('Refused: title or channel missing in metadata');

  const id = `ytcc-${vid}`;
  const manifest = loadManifest(o.root);
  if (manifest.clips.some((c) => c.id === id)) throw new Error(`${id} is already in the manifest`);
  const file = `nl/${id}.mp4`;
  const abs = join(o.root, file);
  const raw = join(o.root, 'nl', `${id}.raw`);
  mkdirSync(join(o.root, 'nl'), { recursive: true });
  const tmp = `${abs}.part.mp4`;
  try {
    // Video-only format: no audio is downloaded. The mux below drops audio again as a second guard.
    await run('yt-dlp', ['--no-playlist', '-f', 'bv*[height<=2160]', '--merge-output-format', 'mp4', '-o', `${raw}.%(ext)s`, '--', url.toString()]);
    const rawFile = `${raw}.mp4`;
    await run('ffmpeg', ['-v', 'error', '-y', '-i', rawFile, '-an', '-c:v', 'copy', '-movflags', '+faststart', tmp]);
    rmSync(rawFile, { force: true });
    const p = await probe(tmp);
    if (p.hasAudio) throw new Error('downloaded file still has an audio stream');
    renameSync(tmp, abs);
    const clip: Clip = {
      id,
      file,
      title: meta.title.trim(),
      sourceUrl: meta.webpage_url ?? url.toString(),
      author,
      licence: 'CC BY',
      licenceUrl: LICENCE_URLS['CC BY'],
      retrievedDate: o.today ?? new Date().toISOString().slice(0, 10),
      location: o.location?.trim() || `${meta.title.trim()} (locatie nog controleren)`,
      durationS: p.durationS,
      width: p.width,
      height: p.height,
      creditRequired: true,
      creditLine: `Beeld: ${meta.title.trim()} van ${author} (CC BY)`,
      provider: 'youtube-cc',
      notes: 'Licence read from YouTube metadata via yt-dlp. The owner must confirm the licence on the video page. Muted video only: third-party content inside a CC video (music, other people\'s footage) may not be covered.',
    };
    const issues = clipIssues(clip, { root: o.root, checkFile: true });
    if (issues.length) throw new Error(`manifest entry invalid: ${issues.join('; ')}`);
    manifest.clips.push(clip);
    saveManifest(o.root, manifest);
    return clip;
  } catch (e) {
    rmSync(tmp, { force: true });
    rmSync(`${raw}.mp4`, { force: true });
    throw e;
  }
}
