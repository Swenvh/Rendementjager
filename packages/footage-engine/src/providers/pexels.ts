import { LICENCE_URLS } from '../manifest.js';
import { chooseFile, getJson, type Candidate, type Orientation } from './common.js';

/**
 * Pexels Videos API (official): GET https://api.videos.pexels.com/videos/search, header
 * `Authorization: <PEXELS_API_KEY>`. Licence: Pexels License (https://www.pexels.com/license/).
 * UNTESTED against the live API (blocked in the build sandbox); tested with a mocked transport.
 */
interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  user?: { name?: string };
  video_files?: { file_type?: string; width?: number; height?: number; link?: string }[];
}

export async function searchPexels(o: { query: string; orientation: Orientation; perPage: number; apiKey: string; fetchImpl: typeof fetch }): Promise<Candidate[]> {
  const u = new URL('https://api.videos.pexels.com/videos/search');
  u.searchParams.set('query', o.query);
  u.searchParams.set('orientation', o.orientation);
  u.searchParams.set('per_page', String(Math.min(80, Math.max(1, o.perPage))));
  const json = (await getJson(o.fetchImpl, u.toString(), { Authorization: o.apiKey }, 'Pexels API')) as { videos?: PexelsVideo[] };
  const out: Candidate[] = [];
  for (const v of json.videos ?? []) {
    const file = chooseFile((v.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.link).map((f) => ({ url: f.link!, width: f.width ?? 0, height: f.height ?? 0 })));
    if (!file) continue;
    const slug = /\/video\/([^/]+?)-\d+\/?$/.exec(v.url)?.[1];
    out.push({
      provider: 'pexels',
      externalId: String(v.id),
      title: slug ? slug.replace(/-/g, ' ') : `Pexels video ${v.id}`,
      pageUrl: v.url,
      author: v.user?.name?.trim() || 'Pexels',
      durationS: v.duration,
      width: file.width,
      height: file.height,
      downloadUrl: file.url,
      licence: 'Pexels License',
      licenceUrl: LICENCE_URLS['Pexels License'],
    });
  }
  return out;
}
