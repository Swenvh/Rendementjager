import { seriesKindOf } from '@rj/content-engine';
import { METHOD_KINDS, isUnverifiedSource, type MethodKind } from '@rj/research-engine';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../context.js';
import { ApiError, parseBody } from '../errors.js';

/** Header the UI sends only from the explicit "G1 goedkeuren voor serie" button (forces a CORS preflight). */
export const METHOD_ACTION_HEADER = 'x-rj-owner-action';
export const METHOD_ACTION_VALUE = 'g1-approve-method-brief';
export const METHOD_CONFIRMATION = 'Ik keur deze methodebrief goed voor de hele reeks';

const KindParam = z.enum(METHOD_KINDS);
const sha = z.string().regex(/^[a-f0-9]{64}$/);

const Approve = z.object({
  actorId: z.string().optional(),
  briefId: z.string().min(1),
  briefHash: sha,
  confirmation: z.string(),
  acknowledgeUnverified: z.boolean().default(false),
});
const Revoke = z.object({ actorId: z.string().optional(), briefId: z.string().min(1), reason: z.string().trim().min(3).max(500) });

/**
 * Method briefs (one per series kind) and the owner-only "G1 for the whole series" action. The endpoint refuses
 * every actor except the owner and needs the owner-action header plus the exact brief hash the owner reviewed.
 */
export function methodRoutes(deps: AppDeps) {
  const app = new Hono();
  const { workflow, research, repo } = deps;

  app.get('/', async (c) => {
    const items = await repo.contentItems.list({}, { orderBy: 'id' });
    const out = [];
    for (const kind of METHOD_KINDS) {
      const m = await research.getMethodBrief(kind);
      const ofKind = items.filter((i) => seriesKindOf(i) === kind);
      const prep = ofKind.filter((i) => ['IDEA', 'RESEARCHING', 'RESEARCHED'].includes(i.stage));
      let g1 = 0;
      for (const i of prep) if ((await workflow.gateStatus(i.id)).G1.satisfied) g1++;
      out.push({
        kind,
        brief: m && { id: m.brief.id, topic: m.brief.topic, status: m.brief.status, summary: m.brief.summary, keyFacts: m.brief.keyFacts, createdAt: m.brief.createdAt, updatedAt: m.brief.updatedAt },
        hash: m?.hash ?? null,
        sources: (m?.sources ?? []).map((s) => ({ id: s.id, url: s.url, title: s.title, publisher: s.publisher, trustTier: s.trustTier, accessedAt: s.accessedAt, excerpt: s.excerpt, unverified: isUnverifiedSource(s) })),
        unverifiedCount: (m?.sources ?? []).filter(isUnverifiedSource).length,
        items: { total: ofKind.length, preScript: prep.length, g1Valid: g1, g1Missing: prep.length - g1 },
      });
    }
    return c.json({ confirmation: METHOD_CONFIRMATION, methods: out });
  });

  /** Creates the missing method briefs as DRAFT (research-analyst). Approves nothing. */
  app.post('/ensure', async (c) => c.json({ briefs: await research.ensureMethodBriefs('research-analyst') }));

  app.post('/:kind/approve', async (c) => {
    if (c.req.header(METHOD_ACTION_HEADER) !== METHOD_ACTION_VALUE) throw new ApiError('NOT_AUTHORIZED', 'G1 for a series can only be given from the owner action in Mission Control');
    const kind: MethodKind = KindParam.parse(c.req.param('kind'));
    const body = await parseBody(c, Approve);
    if (body.actorId !== undefined && body.actorId !== 'owner') throw new ApiError('NOT_AUTHORIZED', `Only the owner can approve a method brief (got "${body.actorId}")`);
    if (body.confirmation !== METHOD_CONFIRMATION) throw new ApiError('INVALID_INPUT', `Confirmation must be exactly "${METHOD_CONFIRMATION}"`);
    const r = await workflow.approveMethodBriefForSeries(kind, { briefId: body.briefId, briefHash: body.briefHash, acknowledgeUnverified: body.acknowledgeUnverified }, 'owner');
    return c.json(r);
  });

  app.post('/:kind/revoke', async (c) => {
    if (c.req.header(METHOD_ACTION_HEADER) !== METHOD_ACTION_VALUE) throw new ApiError('NOT_AUTHORIZED', 'Only the owner action in Mission Control may revoke');
    KindParam.parse(c.req.param('kind'));
    const body = await parseBody(c, Revoke);
    if (body.actorId !== undefined && body.actorId !== 'owner') throw new ApiError('NOT_AUTHORIZED', 'Only the owner can revoke');
    return c.json({ invalidated: await workflow.revokeMethodBrief(body.briefId, 'owner', body.reason) });
  });

  return app;
}
