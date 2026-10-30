import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { InstagramGraphAdapter } from '@rj/integrations';
import { isEmergencyStopActive } from '@rj/content-engine';
import { enqueueDuePublications, exportPackage, findManifest, getStaged, hasLiveConsent, loadPublishConfig, makeDeps, markManualPublished, PACKAGE_FILES, publishCapacity, setLiveConsent, verifyPackage } from '@rj/worker';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppDeps, resolveSlug } from '../context.js';
import { ApiError, parseBody } from '../errors.js';

const MIME: Record<string, string> = { 'video.mp4': 'video/mp4', 'cover.png': 'image/png', 'caption.txt': 'text/plain; charset=utf-8', 'hashtags.txt': 'text/plain; charset=utf-8', 'schedule.txt': 'text/plain; charset=utf-8', 'manifest.json': 'application/json' };
const ManualPublished = z.object({ url: z.string().trim().min(10).max(300), actorId: z.literal('owner').default('owner') });
const LiveConsent = z.object({ on: z.boolean(), actorId: z.string().default('owner') });

/** Publicatie page API: package export/download, manual publish, live consent, publication log. Nothing here approves G5. */
export function publishRoutes(deps: AppDeps) {
  const app = new Hono();
  const pd = () => makeDeps(deps.repo, { env: deps.env, root: deps.root, now: deps.now, workflow: deps.workflow });

  app.get('/', async (c) => {
    const d = pd();
    const cfg = loadPublishConfig(deps.env);
    const items = await deps.repo.contentItems.list({ stage: { op: 'in', value: ['APPROVED_FOR_PUBLISHING', 'SCHEDULED', 'PUBLISHED'] } }, { orderBy: 'updatedAt', desc: true });
    const rows = [];
    for (const item of items) {
      const pubs = await deps.repo.publications.list({ contentId: item.id }, { orderBy: 'createdAt', desc: true });
      const pub = pubs.find((p) => p.status === 'scheduled' || p.status === 'published') ?? pubs[0] ?? null;
      const staged = pub && pub.status === 'scheduled' ? await getStaged(deps.repo, pub.id) : null;
      const found = findManifest(deps.root, item.id);
      const g5 = (await deps.workflow.gateStatus(item.id)).G5;
      rows.push({
        id: item.id,
        title: item.title,
        stage: item.stage,
        slug: await resolveSlug(deps, item),
        videoSha256: item.currentAssetSha256,
        captionHash: item.captionHash,
        g5: { valid: g5.satisfied, reason: g5.reason },
        publication: pub,
        staged,
        state: item.stage === 'PUBLISHED' ? 'published' : staged ? 'staged' : item.stage === 'SCHEDULED' ? 'scheduled' : 'approved',
        package: found ? { slug: found.manifest.slug, files: PACKAGE_FILES.filter((f) => f !== 'cover.png' || found.manifest.cover), suggestedTime: found.manifest.suggestedTime, createdAt: found.manifest.createdAt } : null,
      });
    }
    const adapter = new InstagramGraphAdapter({ env: deps.env }).status();
    const audit = await deps.repo.auditLog.list({ action: 'publication' }, { orderBy: 'createdAt', desc: true, limit: 50 });
    const errors = await deps.repo.errorLogs.list({ scope: 'publish' }, { orderBy: 'createdAt', desc: true, limit: 20 });
    return c.json({
      items: rows,
      config: { mode: cfg.mode, dailyCap: cfg.dailyCap, minSpacingMin: cfg.minSpacingMin, publicBaseUrlSet: cfg.publicBaseUrl !== null },
      capacity: await publishCapacity(d),
      live: { adapterMode: adapter.mode, adapterConfigured: adapter.configured, adapterNote: adapter.note, consent: await hasLiveConsent(deps.repo), tested: false },
      emergencyStop: await isEmergencyStopActive(deps.repo, deps.env),
      log: audit.map((a) => ({ id: a.id, at: a.createdAt, contentId: a.contentId, actorId: a.actorId, reason: a.reason, event: (a.details as { event?: string } | null)?.event ?? null })),
      errors: errors.map((e) => ({ id: e.id, at: e.createdAt, contentId: e.contentId, message: e.message })),
    });
  });

  app.post('/due', async (c) => c.json(await enqueueDuePublications(pd())));

  app.post('/live-consent', async (c) => {
    const body = await parseBody(c, LiveConsent);
    await setLiveConsent(pd(), body.on, body.actorId);
    return c.json({ consent: await hasLiveConsent(deps.repo) });
  });

  app.post('/:id/package', async (c) => {
    const { manifest } = await exportPackage(pd(), c.req.param('id'));
    return c.json({ manifest }, 201);
  });

  app.post('/:id/verify', async (c) => c.json(await verifyPackage(pd(), c.req.param('id'))));

  app.post('/:id/manual-published', async (c) => {
    const body = await parseBody(c, ManualPublished);
    return c.json({ publication: await markManualPublished(pd(), c.req.param('id'), body.url, body.actorId) });
  });

  /** Download one allowlisted file of the package (no path input: file must be one of PACKAGE_FILES). */
  app.get('/:id/package/:file', async (c) => {
    const file = c.req.param('file');
    if (!(PACKAGE_FILES as readonly string[]).includes(file)) throw new ApiError('NOT_FOUND', 'Not found');
    const found = findManifest(deps.root, c.req.param('id'));
    if (!found) throw new ApiError('NOT_FOUND', 'No publish package for this item');
    const p = join(found.dir, file);
    if (!existsSync(p)) throw new ApiError('NOT_FOUND', 'Not found');
    const real = realpathSync(p);
    if (!real.startsWith(realpathSync(found.dir) + sep) || !statSync(real).isFile()) throw new ApiError('NOT_FOUND', 'Not found');
    return c.body(Readable.toWeb(createReadStream(real)) as ReadableStream, 200, {
      'Content-Type': MIME[file]!,
      'Content-Length': String(statSync(real).size),
      'Content-Disposition': `attachment; filename="${found.manifest.slug}-${file}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
  });

  return app;
}
