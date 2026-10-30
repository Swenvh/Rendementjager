import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isEmergencyStopActive, sha256File } from '@rj/content-engine';
import { lintCopy, parseSeriesNotes, requiredDisclaimers, verifySeriesNotes, weeklyTargetFromEnv, estimateRender, type SeriesNotes } from '@rj/series-engine';
import { ActorIdSchema, GATES, type ContentIdea, type PipelineStage } from '@rj/shared';
import { enqueueRenderBatch } from '@rj/worker';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppDeps, rootPath } from '../context.js';
import { ApiError, parseBody } from '../errors.js';

/** Readiness buckets of the review queue, in working order. */
export const BUCKETS = ['prep', 'G2', 'G3', 'render', 'G4', 'G5', 'schedule'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
  prep: 'Voorbereiding (G1)',
  G2: 'G2 Scriptreview',
  G3: 'G3 Feiten en compliance',
  render: 'Klaar om te renderen',
  G4: 'G4 Media-QA',
  G5: 'G5 Eigenaar',
  schedule: 'Klaar om in te plannen',
};

const BUCKET_OF: Partial<Record<PipelineStage, Bucket>> = {
  IDEA: 'prep',
  RESEARCHING: 'prep',
  RESEARCHED: 'prep',
  SCRIPTING: 'prep',
  REVISION_REQUIRED: 'prep',
  SCRIPT_READY: 'G2',
  FACT_CHECK: 'G3',
  APPROVED_FOR_PRODUCTION: 'render',
  AUDIO_GENERATING: 'render',
  RENDERING: 'render',
  RENDERED: 'G4',
  QA_REVIEW: 'G4',
  READY_FOR_EDITOR: 'G5',
  APPROVED_FOR_PUBLISHING: 'schedule',
};

/**
 * Bulk "naar volgende fase" is limited to mechanical steps whose gate was already decided by a reviewer
 * (the workflow re-checks the gates). Research steps (IDEA -> RESEARCHED), approvals, scheduling and
 * publishing are never bulk actions.
 */
export const BULK_NEXT: Partial<Record<PipelineStage, PipelineStage>> = {
  RESEARCHED: 'SCRIPTING',
  SCRIPTING: 'SCRIPT_READY',
  SCRIPT_READY: 'FACT_CHECK',
  FACT_CHECK: 'APPROVED_FOR_PRODUCTION',
  RENDERED: 'QA_REVIEW',
  QA_REVIEW: 'READY_FOR_EDITOR',
};

export interface Check {
  id: string;
  label: string;
  /** null = not applicable / not verifiable automatically */
  ok: boolean | null;
  detail?: string;
}

function seriesNotes(item: ContentIdea): SeriesNotes | null {
  return parseSeriesNotes(item.notes);
}

/** Automated checks. `deep` re-hashes the MP4 on disk (detail view and bulk advance only). */
export async function computeChecks(deps: AppDeps, item: ContentIdea, deep: boolean): Promise<Check[]> {
  const checks: Check[] = [];
  const notes = seriesNotes(item);
  checks.push({ id: 'script', label: 'Script (revisie) aanwezig', ok: item.currentScriptRevisionId !== null });
  const rev = item.currentScriptRevisionId ? await deps.repo.scriptRevisions.get(item.currentScriptRevisionId) : null;
  if (notes) {
    const v = verifySeriesNotes(notes);
    checks.push({ id: 'numbers', label: 'Cijfers herberekend met de finance-engine', ok: v.ok, detail: v.ok ? undefined : 'Inhoud wijkt af van de huidige berekening' });
    const claims = item.currentScriptRevisionId ? await deps.repo.financialClaims.count({ scriptRevisionId: item.currentScriptRevisionId }) : 0;
    checks.push({ id: 'claims', label: 'Claims gekoppeld aan de berekening', ok: claims > 0, detail: `${claims} claims` });
  } else checks.push({ id: 'numbers', label: 'Cijfers herberekend met de finance-engine', ok: null, detail: 'Geen reeks-item: handmatig controleren' });
  const text = [item.captionText ?? '', rev?.hook ?? '', rev?.body ?? ''].join('\n');
  const findings = lintCopy(text);
  checks.push({ id: 'lint', label: 'Geen verboden formuleringen (advies, belofte, FOMO)', ok: findings.length === 0, detail: findings.map((f) => f.rule).join('; ') || undefined });
  const missing = item.captionText ? requiredDisclaimers(item.captionText) : ['caption ontbreekt'];
  checks.push({ id: 'disclaimer', label: 'Disclaimer en risicowaarschuwing in caption', ok: missing.length === 0, detail: missing.join('; ') || undefined });
  if (item.currentAssetSha256) {
    const asset = item.currentVideoAssetId ? await deps.repo.videoAssets.get(item.currentVideoAssetId) : null;
    const file = asset ? rootPath(deps, asset.path) : null;
    const exists = !!file && existsSync(file);
    checks.push({ id: 'media-file', label: 'Videobestand aanwezig', ok: exists });
    if (deep && exists && file) {
      const onDisk = await sha256File(file);
      checks.push({ id: 'media-hash', label: 'Bestand komt overeen met geregistreerde sha256', ok: onDisk === item.currentAssetSha256 });
    }
  }
  return checks;
}

const allOk = (checks: Check[]) => checks.every((c) => c.ok === true || c.ok === null) && checks.some((c) => c.id === 'numbers' && c.ok === true);

const Advance = z.object({ ids: z.array(z.string().min(1)).min(1).max(200), actorId: ActorIdSchema.default('chief-of-staff') });
const RenderBatch = z.object({ limit: z.number().int().min(1).max(1000).optional() });

function weekWindow(now: Date): { from: string; to: string; dayFrom: string; dayTo: string } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7;
  const from = new Date(day);
  from.setUTCDate(from.getUTCDate() - dow);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);
  const dayTo = new Date(day);
  dayTo.setUTCDate(dayTo.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString(), dayFrom: day.toISOString(), dayTo: dayTo.toISOString() };
}

export function reviewRoutes(deps: AppDeps) {
  const app = new Hono();
  const { repo, workflow } = deps;

  /** Queue: items by readiness bucket with cheap automated checks. */
  app.get('/queue', async (c) => {
    const bucket = c.req.query('bucket');
    if (bucket && !(BUCKETS as readonly string[]).includes(bucket)) throw new ApiError('VALIDATION_ERROR', `Unknown bucket "${bucket}"`);
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const kind = c.req.query('kind');
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100) || 100));
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
    const all = await repo.contentItems.list({}, { orderBy: 'priority', desc: true });
    const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
    const rows: ContentIdea[] = [];
    for (const it of all) {
      const b = BUCKET_OF[it.stage];
      if (!b) continue;
      counts[b]++;
      if (bucket && b !== bucket) continue;
      const n = seriesNotes(it);
      if (kind && n?.tags.kind !== kind) continue;
      if (q && !`${it.title} ${it.series ?? ''} ${it.pillar}`.toLowerCase().includes(q)) continue;
      rows.push(it);
    }
    const page = rows.slice(offset, offset + limit);
    const items = [];
    for (const it of page) {
      const checks = await computeChecks(deps, it, false);
      const n = seriesNotes(it);
      items.push({
        id: it.id,
        title: it.title,
        stage: it.stage,
        bucket: BUCKET_OF[it.stage]!,
        series: it.series,
        pillar: it.pillar,
        tags: n?.tags ?? null,
        trial: n?.trial ?? false,
        contentHash: n?.contentHash ?? null,
        assetSha256: it.currentAssetSha256,
        captionHash: it.captionHash,
        checks,
        autoPass: n !== null && allOk(checks),
        bulkNext: BULK_NEXT[it.stage] ?? null,
        updatedAt: it.updatedAt,
      });
    }
    return c.json({ buckets: BUCKETS.map((b) => ({ id: b, label: BUCKET_LABEL[b], count: counts[b] })), total: rows.length, offset, limit, items });
  });

  /** Everything the reviewer needs on one screen. */
  app.get('/item/:id', async (c) => {
    const item = await repo.contentItems.get(c.req.param('id'));
    if (!item) throw new ApiError('NOT_FOUND', 'Content item not found');
    const n = seriesNotes(item);
    const [rev, claims, gates, asset, thumbs] = await Promise.all([
      item.currentScriptRevisionId ? repo.scriptRevisions.get(item.currentScriptRevisionId) : null,
      item.currentScriptRevisionId ? repo.financialClaims.list({ scriptRevisionId: item.currentScriptRevisionId }, { orderBy: 'id' }) : [],
      workflow.gateStatus(item.id),
      item.currentVideoAssetId ? repo.videoAssets.get(item.currentVideoAssetId) : null,
      repo.thumbnailAssets.list({ contentId: item.id }, { orderBy: 'createdAt', desc: true }),
    ]);
    const checks = await computeChecks(deps, item, true);
    const cover = thumbs.find((t) => asset && t.videoAssetId === asset.id) ?? thumbs[0] ?? null;
    let seriesFile: unknown = null;
    if (n) {
      const f = join(deps.root, 'content', 'scripts', n.slug, 'series.json');
      if (existsSync(f)) seriesFile = JSON.parse(readFileSync(f, 'utf8'));
    }
    return c.json({
      item: { id: item.id, title: item.title, stage: item.stage, bucket: BUCKET_OF[item.stage] ?? null, series: item.series, pillar: item.pillar, captionText: item.captionText, captionHash: item.captionHash, assetSha256: item.currentAssetSha256, scriptRevisionId: item.currentScriptRevisionId },
      tags: n?.tags ?? null,
      trial: n?.trial ?? false,
      contentHash: n?.contentHash ?? null,
      slug: n?.slug ?? null,
      script: rev ? { id: rev.id, version: rev.version, hook: rev.hook, body: rev.body, cta: rev.cta, onScreenText: rev.onScreenText, sha256: rev.sha256, authorId: rev.authorId } : null,
      claims: claims.map((cl) => ({ id: cl.id, claimText: cl.claimText, value: cl.value, unit: cl.unit, calculationRef: cl.calculationRef, status: cl.status })),
      gates: Object.fromEntries(Object.entries(gates).map(([g, s]) => [g, { satisfied: s.satisfied, reason: s.reason, label: GATES[g as keyof typeof GATES].label }])),
      checks,
      autoPass: n !== null && allOk(checks),
      video: asset ? { id: asset.id, sha256: asset.sha256, url: `/media/reels/${encodeURIComponent(basename(asset.path))}`, fileExists: existsSync(rootPath(deps, asset.path)), width: asset.width, height: asset.height, durationMs: asset.durationMs } : null,
      cover: cover ? { url: `/media/covers/${encodeURIComponent(basename(cover.path))}` } : null,
      seriesFile,
    });
  });

  /**
   * Bulk "naar volgende fase": only items that pass every automated check, only mechanical next steps (BULK_NEXT),
   * and always through WorkflowService (gates re-checked, audit-logged). It never records an approval; G5, scheduling
   * and publishing are not reachable from here.
   */
  app.post('/advance', async (c) => {
    const body = await parseBody(c, Advance);
    if (await isEmergencyStopActive(repo, deps.env)) throw new ApiError('EMERGENCY_STOP', 'Emergency stop is active: no bulk actions');
    const results: { id: string; ok: boolean; from?: PipelineStage; to?: PipelineStage; error?: string }[] = [];
    for (const id of [...new Set(body.ids)]) {
      const item = await repo.contentItems.get(id);
      if (!item) {
        results.push({ id, ok: false, error: 'niet gevonden' });
        continue;
      }
      const to = BULK_NEXT[item.stage];
      if (!to) {
        results.push({ id, ok: false, from: item.stage, error: `Geen bulkactie vanuit ${item.stage}` });
        continue;
      }
      const checks = await computeChecks(deps, item, true);
      if (!(seriesNotes(item) !== null && allOk(checks))) {
        results.push({ id, ok: false, from: item.stage, error: 'Automatische controles niet geslaagd: handmatig beoordelen' });
        continue;
      }
      try {
        await workflow.transition(id, to, body.actorId, `bulk review: naar volgende fase (${item.stage} -> ${to})`);
        results.push({ id, ok: true, from: item.stage, to });
      } catch (err) {
        results.push({ id, ok: false, from: item.stage, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return c.json({ results, advanced: results.filter((r) => r.ok).length, refused: results.filter((r) => !r.ok).length });
  });

  /** Queue one render_batch job for every item with G2+G3 (the worker applies concurrency, time and cost caps). */
  app.post('/render-batch', async (c) => {
    const body = await parseBody(c, RenderBatch);
    if (await isEmergencyStopActive(repo, deps.env)) throw new ApiError('EMERGENCY_STOP', 'Emergency stop is active: no new jobs');
    const r = await enqueueRenderBatch(repo, { root: deps.root, env: deps.env, limit: body.limit });
    return c.json({ queued: r.jobId !== null, created: r.created, jobId: r.jobId, items: r.items.length, estimate: estimateRender(r.items.length, deps.env) }, r.created ? 201 : 200);
  });

  /** Target vs scripted / rendered / approved / scheduled, for today and this week (UTC). null = no data at all. */
  app.get('/capacity', async (c) => {
    const now = deps.now();
    const w = weekWindow(now);
    const target = weeklyTargetFromEnv(deps.env);
    const total = await repo.contentItems.count();
    const base = { target, dailyTarget: Math.ceil(target / 7), weekFrom: w.from, weekTo: w.to, render: estimateRender(0, deps.env) };
    if (total === 0) return c.json({ ...base, hasData: false, week: null, today: null });
    async function window(from: string, to: string) {
      const inWin = <T extends { createdAt: string }>(rows: T[]) => rows.filter((r) => r.createdAt >= from && r.createdAt < to);
      const [revs, assets, approvals, pubs] = await Promise.all([
        repo.scriptRevisions.list({ createdAt: { op: 'gte', value: from } }),
        repo.videoAssets.list({ createdAt: { op: 'gte', value: from } }),
        repo.approvals.list({ gate: 'G5', decision: 'approved', createdAt: { op: 'gte', value: from } }),
        repo.publications.list({ status: { op: 'in', value: ['scheduled', 'published'] } }),
      ]);
      return {
        scripted: new Set(inWin(revs).map((r) => r.contentId)).size,
        rendered: new Set(inWin(assets).map((a) => a.contentId)).size,
        approved: new Set(inWin(approvals).filter((a) => a.actorId === 'owner').map((a) => a.contentId)).size,
        scheduled: new Set(pubs.filter((p) => p.scheduledAt && p.scheduledAt >= from && p.scheduledAt < to).map((p) => p.contentId)).size,
      };
    }
    const [week, today] = await Promise.all([window(w.from, w.to), window(w.dayFrom, w.dayTo)]);
    const waitingRender = await repo.contentItems.count({ stage: { op: 'in', value: ['APPROVED_FOR_PRODUCTION', 'AUDIO_GENERATING', 'RENDERING'] } });
    return c.json({ ...base, hasData: true, week, today, waitingRender, render: estimateRender(waitingRender, deps.env) });
  });

  return app;
}
