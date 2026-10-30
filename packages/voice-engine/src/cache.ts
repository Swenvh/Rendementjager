import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { WordTiming } from './types.js';

/** sha256(provider + voice + normalized text): same input never synthesized twice. */
export function cacheKey(provider: string, voice: string, normalizedText: string): string {
  return createHash('sha256').update(`${provider}\u0000${voice}\u0000${normalizedText}`).digest('hex');
}

export interface CacheEntry {
  key: string;
  provider: string;
  voice: string;
  normalizedText: string;
  audioPath: string;
  durationMs: number;
  words: WordTiming[] | null;
  createdAt: string;
}

const exists = async (p: string) => access(p).then(() => true, () => false);

export class VoiceCache {
  constructor(readonly dir: string) {}

  async get(key: string): Promise<CacheEntry | null> {
    const meta = join(this.dir, `${key}.json`);
    if (!(await exists(meta))) return null;
    const entry = JSON.parse(await readFile(meta, 'utf8')) as CacheEntry;
    return (await exists(entry.audioPath)) ? entry : null;
  }

  /** Copy the audio into the cache and store its metadata. */
  async put(entry: Omit<CacheEntry, 'audioPath' | 'createdAt'> & { sourcePath: string }): Promise<CacheEntry> {
    await mkdir(this.dir, { recursive: true });
    const audioPath = join(this.dir, `${entry.key}${extname(entry.sourcePath) || '.wav'}`);
    if (entry.sourcePath !== audioPath) await copyFile(entry.sourcePath, audioPath);
    const { sourcePath: _s, ...rest } = entry;
    const full: CacheEntry = { ...rest, audioPath, createdAt: new Date().toISOString() };
    await writeFile(join(this.dir, `${entry.key}.json`), JSON.stringify(full, null, 2));
    return full;
  }
}
