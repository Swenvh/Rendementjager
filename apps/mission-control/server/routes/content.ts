import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { sha256File } from '@rj/content-engine';
import {
  ActorIdSchema,
  allowedNextStages,
  captionHash as hashCaption,
  type ContentIdea,
  GATES,
  GATE_IDS,
  PipelineStageSchema,
  TemplateIdSchema,
} from '@rj/shared';
import { AWAITING_APPROVAL } from '@rj/worker';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppDeps, readContentFile, resolveSlug, rootPath } from '../context.js';
import { ApiError, parseBody } from '../errors.js';

/** Header the UI sends only from the explicit owner-approval button (also forces a CORS preflight). */
export const OWNER_ACTION_HEADER = 'x-rj-owner-action';
export const OWNER_ACTION_VALUE = 'g5-approve-exact-version';
/** The exact sentence the owner confirms; the API requires it verbatim. */
export const OWNER_CONFIRMATION = 'Ik keur deze exacte versie goed';

const actor = ActorIdSchema.default('owner');

const CreateIdea = z.object({
  title: z.string().trim().min(3).max(200),
  pillar: z.string().trim().min(2).max(60),
  template: TemplateIdSchema.nullable().optional(),
  series: z.string().trim().max(80).nullable().optional(),
  hook: z.string().trim().max(300).nullable().optional(),
  angle: z.string().trim().max(300).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  notes: z.string().max(2000).nullable().optional(),
  actorId: actor,
});

const Transition = z.object({
  to: PipelineStageSchema,
  reason: z.string().trim().min(3).max(500),
  actorId: actor,
});

const sha = z.string().regex(/^[a-f0-9]{64}$/);

const Approval = z.object({
  gate: z.enum(GATE_IDS),
  actorId: ActorIdSchema,
  decision: z.enum(['approved', 'rejected']).default('approved'),
  notes: z.string().max(2000).optional(),
  scriptRevisionId: z.string().min(1).optional(),
  assetSha256: sha.optional(),
});

const OwnerApproval = z.object({
  actorId: z.string().optional(),
  confirmation: z.string(),
  assetSha256: sha,
  captionHash: sha,
  decision: z.enum(['approved', 'rejected']).default('approved'),
  notes: z.string().max(2000).optional(),
});

const Caption = z.object({ captionText: z.string().trim().min(1).max(2200), actorId: actor });

const Schedule = z.object({
  platform: z.string().trim().min(2).max(40).default('instagram'),
  scheduledAt: z.iso.datetime({ offset: true }),
  actorId: actor,
});

const Published = z.object({
  publicationId: z.string().min(1),
  externalId: z.string().max(200).nullable().optional(),
  url: z.url().nullable().optional(),
  actorId: actor,
});

function mediaUrl(path: string | null | undefined, kind: 'reels' | 'covers'): string | null {
  return path ? `/media/${kind}/${encodeURIComponent(basename(path))}` : null;
}

async function summary(deps: AppDeps, item: ContentIdea) {
  const gate = AWAITING_APPROVAL[item.stage] ?? null;
  return {
    ...item,
    awaitingGate: gate,
    awaitingGateLabel: gate ? GATES[gate].label : null,
    hasVideo: item.currentAssetSha256 !== null,
    hasCaption: item.captionHash !== null,
    slug: await resolveSlug(deps, item),
  };
}

async function getItem(deps: AppDeps, id: string): Promise<ContentIdea> {
  const item = await deps.repo.contentItems.get(id);
  if (!item) throw new ApiError('NOT_FOUND', `Content item ${id} not found`);
  return item;
}

/** Owner-facing dry runs of every next stage (SCHEDULED/PUBLISHED have their own endpoints). */
async function transitions(deps: AppDeps, item: ContentIdea) {
  const out = [];
  for (const to of allowedNextStages(item.stage)) {
    if (to === 'SCHEDULED' || to === 'PUBLISHED') {
      out.push({ to, allowed: false, viaEndpoint: to === 'SCHEDULED' ? 'schedule' : 'published', reasons: [to === 'SCHEDULED' ? 'Inplannen gaat via de kalender (hash wordt opnieuw gecontroleerd)' : 'Publicatie wordt geregistreerd via een geplande publicatie'], code: null });
      continue;
    }
    const check = await deps.workflow.canTransition(item.id, to, 'owner');
    out.push({ to, viaEndpoint: null, ...check });
  }
  return out;
}

export function contentRoutes(deps: AppDeps) {
  const app = new Hono();
  const { repo, workflow } = deps;

  app.get('/', async (c) => {
    const stage = c.req.query('stage');
    const filter = stage ? { stage: PipelineStageSchema.parse(stage) } : {};
    const items = await repo.contentItems.list(filter, { orderBy: 'priority', desc: true });
    return c.json({ items: await Promise.all(items.map((i) => summary(deps, i))) });
  });

  app.post('/', async (c) => {
    const body = await parseBody(c, CreateIdea);
    const { actorId, ...input } = body;
    const item = await workflow.createContentIdea(input, actorId);
    return c.json({ item: await summary(deps, item) }, 201);
  });

  app.get('/:id', async (c) => {
    const item = await getItem(deps, c.req.param('id'));
    const id = item.id;
    const slug = await resolveSlug(deps, item);
    const [revisions, gates, approvals, auditLog, videoAssets, thumbnails, publications, briefs, jobs, voiceAssets] = await Promise.all([
      repo.scriptRevisions.list({ contentId: id }, { orderBy: 'version', desc: true }),
      workflow.gateStatus(id),
      repo.approvals.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
      workflow.getAuditLog(id),
      repo.videoAssets.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
      repo.thumbnailAssets.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
      repo.publications.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
      repo.researchBriefs.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
      repo.jobs.list({ contentId: id }, { orderBy: 'createdAt', desc: true, limit: 50 }),
      repo.voiceAssets.list({ contentId: id }, { orderBy: 'createdAt', desc: true }),
    ]);
    const current = videoAssets.find((v) => v.id === item.currentVideoAssetId) ?? null;
    const cover = thumbnails.find((t) => current && t.videoAssetId === current.id) ?? thumbnails[0] ?? null;
    return c.json({
      item: await summary(deps, item),
      gateDefinitions: GATES,
      gates,
      approvals,
      auditLog: [...auditLog].reverse(),
      revisions,
      currentRevision: revisions.find((r) => r.id === item.currentScriptRevisionId) ?? null,
      scriptFile: readContentFile(deps, slug, 'script.md'),
      captionFile: readContentFile(deps, slug, 'caption.md'),
      video: current ? { ...current, url: mediaUrl(current.path, 'reels'), fileExists: existsSync(rootPath(deps, current.path)) } : null,
      videoAssets,
      cover: cover ? { ...cover, url: mediaUrl(cover.path, 'covers') } : null,
      voiceAssets,
      publications,
      briefs,
      jobs,
      transitions: await transitions(deps, item),
    });
  });

  app.post('/:id/transition', async (c) => {
    const body = await parseBody(c, Transition);
    if (body.to === 'SCHEDULED') throw new ApiError('INVALID_INPUT', 'Use POST /api/content/:id/schedule: scheduling re-hashes the file and caption');
    if (body.to === 'PUBLISHED') throw new ApiError('INVALID_INPUT', 'Use POST /api/content/:id/published with the scheduled publication');
    const item = await workflow.transition(c.req.param('id'), body.to, body.actorId, body.reason);
    return c.json({ item: await summary(deps, item) });
  });

  /** G1–G4 decisions. G5 is refused here: only the owner-approval action below can grant it. */
  app.post('/:id/approvals', async (c) => {
    const body = await parseBody(c, Approval);
    if (body.gate === 'G5')
      throw new ApiError('NOT_AUTHORIZED', 'G5 can only be granted by the owner through the owner-approval action in Mission Control');
    const approval = await workflow.recordApproval(body.gate, c.req.param('id'), body.actorId, {
      decision: body.decision,
      notes: body.notes,
      scriptRevisionId: body.scriptRevisionId,
      assetSha256: body.assetSha256,
    });
    return c.json({ approval }, 201);
  });

  /**
   * G5: the owner's explicit approval of the exact video file + caption. The server re-hashes the
   * file on disk and the stored caption, and requires both to equal what the owner reviewed.
   */
  app.post('/:id/owner-approval', async (c) => {
    if (c.req.header(OWNER_ACTION_HEADER) !== OWNER_ACTION_VALUE)
      throw new ApiError('NOT_AUTHORIZED', 'G5 can only be given from the owner-approval action in Mission Control');
    const body = await parseBody(c, OwnerApproval);
    if (body.actorId !== undefined && body.actorId !== 'owner') throw new ApiError('NOT_AUTHORIZED', `Only the owner can decide G5 (got "${body.actorId}")`);
    if (body.decision === 'approved' && body.confirmation !== OWNER_CONFIRMATION)
      throw new ApiError('INVALID_INPUT', `Confirmation must be exactly "${OWNER_CONFIRMATION}"`);
    const item = await getItem(deps, c.req.param('id'));
    if (body.decision === 'approved' && item.stage !== 'READY_FOR_EDITOR')
      throw new ApiError('GATE_NOT_SATISFIED', `G5 is given on READY_FOR_EDITOR (current stage: ${item.stage})`, { stage: item.stage });
    if (!item.currentVideoAssetId || !item.currentAssetSha256) throw new ApiError('BINDING_MISMATCH', 'No video asset registered for this item');
    const asset = await repo.videoAssets.get(item.currentVideoAssetId);
    if (!asset) throw new ApiError('BINDING_MISMATCH', 'Registered video asset row is missing');
    const file = rootPath(deps, asset.path);
    if (!existsSync(file)) throw new ApiError('BINDING_MISMATCH', 'The video file is missing on disk', { path: asset.path });
    const onDisk = await sha256File(file);
    if (onDisk !== item.currentAssetSha256)
      throw new ApiError('BINDING_MISMATCH', 'The video file on disk differs from the registered asset: re-register it and review again', { registered: item.currentAssetSha256, onDisk });
    if (body.assetSha256 !== onDisk)
      throw new ApiError('BINDING_MISMATCH', 'Stale review: the video you reviewed is not the current file', { reviewed: body.assetSha256, current: onDisk });
    if (!item.captionText) throw new ApiError('BINDING_MISMATCH', 'No caption set for this item');
    const capHash = hashCaption(item.captionText);
    if (body.captionHash !== capHash || capHash !== item.captionHash)
      throw new ApiError('BINDING_MISMATCH', 'Stale review: the caption changed since you reviewed it', { reviewed: body.captionHash, current: capHash });
    const approval = await workflow.recordApproval('G5', item.id, 'owner', {
      decision: body.decision,
      notes: body.notes,
      assetSha256: onDisk,
      captionHash: capHash,
    });
    return c.json({ approval }, 201);
  });

  app.post('/:id/caption', async (c) => {
    const body = await parseBody(c, Caption);
    const item = await workflow.setCaption(c.req.param('id'), body.captionText, body.actorId);
    return c.json({ item: await summary(deps, item) });
  });

  /** APPROVED_FOR_PUBLISHING -> SCHEDULED, or reschedule a SCHEDULED item. Rules enforced by WorkflowService. */
  app.post('/:id/schedule', async (c) => {
    const body = await parseBody(c, Schedule);
    const item = await getItem(deps, c.req.param('id'));
    if (Date.parse(body.scheduledAt) <= deps.now().getTime()) throw new ApiError('INVALID_INPUT', 'scheduledAt must be in the future');
    if (!item.currentVideoAssetId) throw new ApiError('GATE_NOT_SATISFIED', 'No video asset: nothing to schedule');
    const asset = await repo.videoAssets.get(item.currentVideoAssetId);
    if (!asset || !existsSync(rootPath(deps, asset.path))) throw new ApiError('BINDING_MISMATCH', 'The video file is missing on disk');
    if (item.captionText === null) throw new ApiError('GATE_NOT_SATISFIED', 'No caption: nothing to schedule');
    if (item.stage === 'SCHEDULED') {
      // Reschedule: step back (G2–G5 re-checked by the transition), cancel the old slot, schedule again.
      await workflow.transition(item.id, 'APPROVED_FOR_PUBLISHING', body.actorId, `reschedule to ${body.scheduledAt}`);
      for (const p of await repo.publications.list({ contentId: item.id, status: 'scheduled' }))
        await repo.publications.update(p.id, { status: 'cancelled', updatedAt: deps.now().toISOString() });
    }
    const publication = await workflow.schedulePublication(
      item.id,
      { platform: body.platform, scheduledAt: new Date(body.scheduledAt).toISOString(), filePath: rootPath(deps, asset.path), captionText: item.captionText },
      body.actorId,
    );
    return c.json({ publication, item: await summary(deps, await getItem(deps, item.id)) }, 201);
  });

  app.post('/:id/published', async (c) => {
    const body = await parseBody(c, Published);
    const publication = await workflow.markPublished(c.req.param('id'), { publicationId: body.publicationId, externalId: body.externalId ?? null, url: body.url ?? null }, body.actorId);
    return c.json({ publication });
  });

  return app;
}

/** Calendar feed: scheduled items + publications in a window, plus items that could be scheduled. */
export function calendarRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    const pubs = await deps.repo.publications.list(
      {
        status: { op: 'in', value: ['scheduled', 'published'] },
        ...(from ? { scheduledAt: { op: 'gte', value: from } } : {}),
      },
      { orderBy: 'scheduledAt' },
    );
    const inWindow = pubs.filter((p) => !to || (p.scheduledAt ?? '') < to);
    const items = await deps.repo.contentItems.list({ stage: { op: 'in', value: ['APPROVED_FOR_PUBLISHING', 'READY_FOR_EDITOR', 'SCHEDULED'] } }, { orderBy: 'priority', desc: true });
    const titles = new Map(items.map((i) => [i.id, i.title]));
    for (const p of inWindow) if (!titles.has(p.contentId)) titles.set(p.contentId, (await deps.repo.contentItems.get(p.contentId))?.title ?? p.contentId);
    return c.json({
      events: inWindow.map((p) => ({ ...p, title: titles.get(p.contentId) ?? p.contentId })),
      schedulable: items.filter((i) => i.stage === 'APPROVED_FOR_PUBLISHING').map((i) => ({ id: i.id, title: i.title, stage: i.stage })),
      blocked: items.filter((i) => i.stage === 'READY_FOR_EDITOR').map((i) => ({ id: i.id, title: i.title, stage: i.stage, reason: 'Wacht op G5 (goedkeuring eigenaar)' })),
    });
  });
  return app;
}
