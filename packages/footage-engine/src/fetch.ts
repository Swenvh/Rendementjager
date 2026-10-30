import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { clipIssues, loadManifest, saveManifest, type Clip } from './manifest.js';
import { ffprobeProber, type Prober } from './media.js';
import { downloadTo, orientationOf, type Candidate } from './providers/common.js';
import { searchPexels } from './providers/pexels.js';
import { searchPixabay } from './providers/pixabay.js';

export interface FetchOptions {
  provider: 'pexels' | 'pixabay';
  query: string;
  count: number;
  root: string;
  /** Where it was filmed. Default: the query, flagged for review. */
  location?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  probe?: Prober;
  today?: string;
}

export interface FetchResult {
  added: string[];
  skipped: { id: string; reason: string }[];
}

export const keyEnvOf = (p: 'pexels' | 'pixabay') => (p === 'pexels' ? 'PEXELS_API_KEY' : 'PIXABAY_API_KEY');

/**
 * Official-API fetch. Prefers portrait clips, then landscape (cropped to 9:16 with object-fit: cover at render
 * time). Each download becomes a manifest entry only when it passes the validator.
 * UNTESTED live: pexels.com / pixabay.com are blocked in the build sandbox.
 */
export async function fetchFromProvider(o: FetchOptions): Promise<FetchResult> {
  const env = o.env ?? process.env;
  const fetchImpl = o.fetchImpl ?? fetch;
  const probe = o.probe ?? ffprobeProber();
  const apiKey = env[keyEnvOf(o.provider)];
  if (!apiKey) throw new Error(`${keyEnvOf(o.provider)} is not set (put it in .env or the Codespaces secrets; never in chat)`);
  if (!(o.count >= 1 && o.count <= 20)) throw new Error('--count must be 1..20');

  let cands: Candidate[];
  if (o.provider === 'pexels') {
    const portrait = await searchPexels({ query: o.query, orientation: 'portrait', perPage: o.count * 2, apiKey, fetchImpl });
    const landscape = portrait.length >= o.count ? [] : await searchPexels({ query: o.query, orientation: 'landscape', perPage: o.count * 2, apiKey, fetchImpl });
    cands = [...portrait, ...landscape];
  } else {
    const all = await searchPixabay({ query: o.query, perPage: o.count * 4, apiKey, fetchImpl });
    cands = [...all.filter((c) => orientationOf(c.width, c.height) === 'portrait'), ...all.filter((c) => orientationOf(c.width, c.height) === 'landscape')];
  }

  const manifest = loadManifest(o.root);
  const res: FetchResult = { added: [], skipped: [] };
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  mkdirSync(join(o.root, 'nl'), { recursive: true });
  for (const c of cands) {
    if (res.added.length >= o.count) break;
    const id = `${c.provider}-${c.externalId}`;
    if (manifest.clips.some((m) => m.id === id)) {
      res.skipped.push({ id, reason: 'already in manifest' });
      continue;
    }
    const file = `nl/${id}.mp4`;
    const abs = join(o.root, file);
    const tmp = `${abs}.part`;
    try {
      await downloadTo(fetchImpl, c.downloadUrl, tmp);
      renameSync(tmp, abs);
      let { width, height, durationS } = c;
      try {
        const p = await probe(abs);
        width = p.width;
        height = p.height;
        durationS = p.durationS || durationS;
      } catch {
        /* keep the API-reported values */
      }
      const clip: Clip = {
        id,
        file,
        title: c.title,
        sourceUrl: c.pageUrl,
        author: c.author,
        licence: c.licence,
        licenceUrl: c.licenceUrl,
        retrievedDate: today,
        location: o.location?.trim() || `${o.query} (zoekopdracht; locatie nog controleren)`,
        durationS,
        width,
        height,
        creditRequired: false,
        provider: c.provider,
        notes: `Fetched via the official ${c.provider} API; licence as published by the provider. Credit is not required but recorded: check the provider terms page before publishing.`,
      };
      const issues = clipIssues(clip, { root: o.root, checkFile: true });
      if (issues.length) throw new Error(issues.join('; '));
      manifest.clips.push(clip);
      res.added.push(id);
    } catch (e) {
      rmSync(tmp, { force: true });
      if (existsSync(abs) && !manifest.clips.some((m) => m.id === id)) rmSync(abs, { force: true });
      res.skipped.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  saveManifest(o.root, manifest);
  return res;
}
