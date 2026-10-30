import { LICENCE_URLS } from '../manifest.js';
import { chooseFile, getJson, type Candidate } from './common.js';

/**
 * Pixabay Videos API (official): GET https://pixabay.com/api/videos/?key=<PIXABAY_API_KEY>&q=...
 * Licence: Pixabay Content License (https://pixabay.com/service/license-summary/).
 * UNTESTED against the live API (blocked in the build sandbox); tested with a mocked transport.
 */
interface PixabayHit {
  id: number;
  pageURL: string;
  tags?: string;
  duration: number;
  user?: string;
  videos?: Record<string, { url?: string; width?: number; height?: number }>;
}

export async function searchPixabay(o: { query: string; perPage: number; apiKey: string; fetchImpl: typeof fetch }): Promise<Candidate[]> {
  const u = new URL('https://pixabay.com/api/videos/');
  u.searchParams.set('key', o.apiKey);
  u.searchParams.set('q', o.query);
  u.searchParams.set('video_type', 'film');
  u.searchParams.set('per_page', String(Math.min(200, Math.max(3, o.perPage))));
  const json = (await getJson(o.fetchImpl, u.toString(), {}, 'Pixabay API')) as { hits?: PixabayHit[] };
  const out: Candidate[] = [];
  for (const h of json.hits ?? []) {
    const file = chooseFile(Object.values(h.videos ?? {}).filter((f) => f.url).map((f) => ({ url: f.url!, width: f.width ?? 0, height: f.height ?? 0 })));
    if (!file) continue;
    out.push({
      provider: 'pixabay',
      externalId: String(h.id),
      title: h.tags?.trim() || `Pixabay video ${h.id}`,
      pageUrl: h.pageURL,
      author: h.user?.trim() || 'Pixabay',
      durationS: h.duration,
      width: file.width,
      height: file.height,
      downloadUrl: file.url,
      licence: 'Pixabay Content License',
      licenceUrl: LICENCE_URLS['Pixabay Content License'],
    });
  }
  return out;
}
