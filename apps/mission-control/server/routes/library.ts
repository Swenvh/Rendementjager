import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { deriveMetrics } from '@rj/analytics-engine';
import { brand, colors, radii, resolveLogo, spacing, typography } from '@rj/brand';
import { APPROVED_SOURCES, CURRENT_NEWS_MAX_AGE_DAYS } from '@rj/research-engine';
import { Hono } from 'hono';
import type { AppDeps } from '../context.js';
import { ApiError } from '../errors.js';

const DAY = 86_400_000;

export function researchRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/sources', async (c) => {
    const stored = await deps.repo.sources.list({}, { orderBy: 'accessedAt', desc: true, limit: 500 });
    return c.json({
      registry: APPROVED_SOURCES.map((s) => ({ ...s, citedCount: stored.filter((x) => s.domains.some((d) => x.domain === d || x.domain.endsWith(`.${d}`))).length })),
      cited: stored,
    });
  });
  app.get('/briefs', async (c) => {
    const now = deps.now().getTime();
    const briefs = await deps.repo.researchBriefs.list({}, { orderBy: 'createdAt', desc: true, limit: 200 });
    const out = [];
    for (const b of briefs) {
      const sources = await deps.repo.sources.list({ briefId: b.id }, { orderBy: 'id' });
      const ageDays = Math.floor((now - Date.parse(b.createdAt)) / DAY);
      const newest = sources.map((s) => s.publishedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
      out.push({
        ...b,
        sources,
        ageDays,
        newestSourceAt: newest,
        stale: b.kind === 'current_news' && ageDays > CURRENT_NEWS_MAX_AGE_DAYS,
      });
    }
    return c.json({ briefs: out, currentNewsMaxAgeDays: CURRENT_NEWS_MAX_AGE_DAYS });
  });
  return app;
}

/** Real snapshots only. No data -> explicit empty state; null metrics stay null. */
export function analyticsRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/', async (c) => {
    const snaps = await deps.repo.analyticsSnapshots.list({}, { orderBy: 'capturedAt', desc: true, limit: 500 });
    if (snaps.length === 0)
      return c.json({ empty: true, reason: 'Nog geen echte analytics-snapshots. Er is niets gepubliceerd en geen metrics-bron gekoppeld.', snapshots: [] });
    const titles = new Map<string, string>();
    for (const s of snaps) if (!titles.has(s.contentId)) titles.set(s.contentId, (await deps.repo.contentItems.get(s.contentId))?.title ?? s.contentId);
    return c.json({ empty: false, snapshots: snaps.map((s) => ({ ...s, title: titles.get(s.contentId), derived: deriveMetrics(s) })) });
  });
  return app;
}

export function brandRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/', async (c) => {
    const brandDir = join(deps.root, 'assets', 'brand');
    const logo = resolveLogo((f) => existsSync(join(brandDir, f)));
    return c.json({
      brand,
      tokens: { colors, typography, spacing, radii },
      logo: { ...logo, url: `/media/brand/${logo.file}` },
      assets: await deps.repo.brandAssets.list({}, { orderBy: 'createdAt', desc: true }),
      templates: [
        { id: 'A', name: 'Rendement in 30 seconden', composition: 'TemplateA', description: 'Hook, grafiek (label Illustratief tenzij echte data met bron), 1-3 kerncijfers, takeaway (nog niet gekoppeld aan de render-pipeline)' },
        { id: 'B', name: 'De markt uitgelegd', composition: 'TemplateB', description: 'Kop, verplichte bron met publicatiedatum, candlestick-grafiek, max. 4 punten (nog niet gekoppeld aan de render-pipeline)' },
        { id: 'C', name: 'Geld in cijfers', composition: 'TemplateC', description: 'Rekenvoorbeeld uit @rj/finance-engine met aannames en risico\'s in beeld' },
      ],
    });
  });
  return app;
}

const MEDIA_DIRS = { reels: ['output', 'reels'], covers: ['output', 'covers'], brand: ['assets', 'brand'] } as const;
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/**
 * Serves files from output/reels, output/covers and assets/brand only. The name must be a single
 * plain file name; the resolved real path must stay inside the directory (no traversal, no symlink escape).
 * Supports HTTP Range so the video player can seek.
 */
export function mediaRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/:kind/:name', (c) => {
    const kind = c.req.param('kind') as keyof typeof MEDIA_DIRS;
    const name = c.req.param('name');
    if (!(kind in MEDIA_DIRS)) throw new ApiError('NOT_FOUND', 'Unknown media kind');
    if (!/^[\w][\w.-]*$/.test(name) || name.includes('..')) throw new ApiError('NOT_FOUND', 'Not found');
    const type = MIME[extname(name).toLowerCase()];
    if (!type) throw new ApiError('NOT_FOUND', 'Not found');
    const dir = join(deps.root, ...MEDIA_DIRS[kind]);
    const file = join(dir, name);
    if (!existsSync(file)) throw new ApiError('NOT_FOUND', 'Not found');
    const real = realpathSync(file);
    if (!real.startsWith(realpathSync(dir) + sep)) throw new ApiError('NOT_FOUND', 'Not found');
    const st = statSync(real);
    if (!st.isFile()) throw new ApiError('NOT_FOUND', 'Not found');
    const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    const range = c.req.header('range');
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, st.size - 1);
      if (start > end) return c.body(null, 416, { 'Content-Range': `bytes */${st.size}` });
      const stream = Readable.toWeb(createReadStream(real, { start, end })) as ReadableStream;
      return c.body(stream, 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) });
    }
    const stream = Readable.toWeb(createReadStream(real)) as ReadableStream;
    return c.body(stream, 200, { ...headers, 'Content-Length': String(st.size) });
  });
  return app;
}

export function listMedia(deps: AppDeps, kind: keyof typeof MEDIA_DIRS): string[] {
  const dir = join(deps.root, ...MEDIA_DIRS[kind]);
  return existsSync(dir) ? readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]) : [];
}
