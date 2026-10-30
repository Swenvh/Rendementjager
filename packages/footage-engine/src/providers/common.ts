import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Licence } from '../manifest.js';

export type Orientation = 'portrait' | 'landscape';

export interface Candidate {
  provider: 'pexels' | 'pixabay';
  externalId: string;
  title: string;
  pageUrl: string;
  author: string;
  durationS: number;
  width: number;
  height: number;
  downloadUrl: string;
  licence: Licence;
  licenceUrl: string;
}

export interface FileOption {
  url: string;
  width: number;
  height: number;
}

export const orientationOf = (w: number, h: number): Orientation => (h >= w ? 'portrait' : 'landscape');

/**
 * Pick the download for 9:16 use. Portrait: smallest file that is at least 1080 wide (else the largest).
 * Landscape is cropped to the middle 9:16, so only a tall source stays sharp: prefer >= 2160 high, else the largest.
 */
export function chooseFile(files: FileOption[]): FileOption | null {
  const ok = files.filter((f) => f.url.startsWith('https://') && f.width > 0 && f.height > 0);
  if (!ok.length) return null;
  const portrait = ok.filter((f) => f.height >= f.width);
  if (portrait.length) {
    const big = portrait.filter((f) => f.width >= 1080).sort((a, b) => a.width - b.width);
    return big[0] ?? portrait.sort((a, b) => b.width - a.width)[0]!;
  }
  const big = ok.filter((f) => f.height >= 2160).sort((a, b) => a.height - b.height);
  return big[0] ?? ok.sort((a, b) => b.height - a.height)[0]!;
}

const DOWNLOAD_HOSTS = [/(^|\.)pexels\.com$/, /(^|\.)pixabay\.com$/, /(^|\.)vimeocdn\.com$/, /(^|\.)vimeo\.com$/];

/** Only https downloads from the providers' own hosts. */
export function assertDownloadUrl(u: string): URL {
  const url = new URL(u);
  if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.some((re) => re.test(url.hostname))) throw new Error(`Refusing download from unexpected host ${url.hostname}`);
  return url;
}

/** Error text for a failed API call. Never includes the URL (Pixabay carries the key in the query string). */
export async function getJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch {
    throw new Error(`${label}: network error`);
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

export async function downloadTo(fetchImpl: typeof fetch, url: string, dest: string): Promise<void> {
  assertDownloadUrl(url);
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`download: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}
