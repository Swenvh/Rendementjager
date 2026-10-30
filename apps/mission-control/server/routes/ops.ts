import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isEmergencyStopActive } from '@rj/content-engine';
import { defaultDbPath } from '@rj/database';
import { getProviderStatuses } from '@rj/integrations';
import { AGENT_FILE_ALIASES, AGENT_IDS, type AgentId, GATES, type JobType, JobStatusSchema, JobTypeSchema, type PipelineStage } from '@rj/shared';
import { voiceStatus } from '@rj/voice-engine';
import { amsterdamDate, cancelJob, collectDailyBrief, enqueueJob, loadWorkerConfig, retryJob } from '@rj/worker';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppDeps, resolveSlug } from '../context.js';
import { ApiError, parseBody } from '../errors.js';

/** Production jobs may only run once the script passed G2+G3 (video-engine must not render earlier). */
const PRODUCTION_STAGES: readonly PipelineStage[] = ['APPROVED_FOR_PRODUCTION', 'AUDIO_GENERATING', 'RENDERING', 'RENDERED', 'QA_REVIEW', 'READY_FOR_EDITOR'];
const PRODUCTION_JOBS: readonly JobType[] = ['generate_audio', 'render_video', 'render_cover'];

/** Which agent owns which deterministic job type (for the Agents view). */
export const JOB_AGENT: Readonly<Record<JobType, AgentId>> = {
  generate_audio: 'voice-producer',
  render_video: 'video-engineer',
  render_batch: 'video-engineer',
  render_cover: 'video-engineer',
  media_qa: 'qa-engineer',
  collect_metrics: 'growth-analyst',
  publish_due: 'distribution-manager',
  daily_brief: 'chief-of-staff',
};

const ROLE: Readonly<Partial<Record<AgentId, string>>> = {
  'research-analyst': 'Bereidt G1 voor (research brief, bronnen)',
  'content-strategist': 'G2-beoordelaar, planning',
  'editorial-copywriter': 'Schrijft scripts (bereidt G2 voor)',
  'fact-checker': 'G3 (feiten)',
  'compliance-reviewer': 'G3 (compliance)',
  'creative-director': 'Storyboard, visuele review',
  'video-engineer': 'Templates en renders',
  'voice-producer': 'Voice-over (bereidt G4 voor)',
  'automation-engineer': 'Jobs en workflows',
  'distribution-manager': 'Publiceert pas na G5',
  'growth-analyst': 'Analytics (alleen echte data)',
  'qa-engineer': 'G4 (media-QA)',
  'chief-of-staff': 'Coördinatie, daily brief',
  owner: 'Hoofdredacteur: enige die G5 geeft',
};

const Enqueue = z.object({
  type: JobTypeSchema,
  contentId: z.string().min(1).nullable().optional(),
  slug: z.string().regex(/^[A-Za-z0-9][\w.-]*$/).refine((s) => !s.includes('..')).optional(),
  idempotencyKey: z.string().min(3).max(200).optional(),
});

const EmergencyStop = z.object({ on: z.boolean(), reason: z.string().trim().min(3).max(500), actorId: z.string().default('owner') });

export function jobRoutes(deps: AppDeps) {
  const app = new Hono();
  const { repo } = deps;

  app.get('/', async (c) => {
    const status = c.req.query('status');
    const contentId = c.req.query('contentId');
    const jobs = await repo.jobs.list(
      { ...(status ? { status: JobStatusSchema.parse(status) } : {}), ...(contentId ? { contentId } : {}) },
      { orderBy: 'createdAt', desc: true, limit: 200 },
    );
    return c.json({ jobs });
  });

  app.post('/', async (c) => {
    const body = await parseBody(c, Enqueue);
    if (await isEmergencyStopActive(repo, deps.env)) throw new ApiError('EMERGENCY_STOP', 'Emergency stop is active: no new jobs');
    let slug = body.slug;
    let contentId = body.contentId ?? null;
    if (PRODUCTION_JOBS.includes(body.type) || body.type === 'media_qa') {
      if (!contentId) throw new ApiError('INVALID_INPUT', `${body.type} needs a contentId`);
      const item = await repo.contentItems.get(contentId);
      if (!item) throw new ApiError('NOT_FOUND', `Content item ${contentId} not found`);
      if (PRODUCTION_JOBS.includes(body.type) && !PRODUCTION_STAGES.includes(item.stage))
        throw new ApiError('GATE_NOT_SATISFIED', `${body.type} needs G2+G3 (stage APPROVED_FOR_PRODUCTION or later); current stage ${item.stage}`, { stage: item.stage });
      slug ??= (await resolveSlug(deps, item)) ?? undefined;
      if (!slug) throw new ApiError('INVALID_INPUT', 'No content slug found (content/scripts/<slug>/storyboard.json)');
      contentId = item.id;
    }
    const key = body.idempotencyKey ?? `${body.type}:${contentId ?? '-'}:${amsterdamDate(deps.now())}`;
    const { job, created } = await enqueueJob(repo, { type: body.type, idempotencyKey: key, contentId, payload: slug ? { slug } : {} }, deps.env);
    return c.json({ job, created }, created ? 201 : 200);
  });

  app.post('/:id/cancel', async (c) => {
    const ok = await cancelJob(repo, c.req.param('id'));
    if (!ok) throw new ApiError('CONFLICT', 'Only queued jobs can be cancelled');
    return c.json({ job: await repo.jobs.get(c.req.param('id')) });
  });

  app.post('/:id/retry', async (c) => {
    const ok = await retryJob(repo, c.req.param('id'));
    if (!ok) throw new ApiError('CONFLICT', 'Only failed or cancelled jobs can be retried');
    return c.json({ job: await repo.jobs.get(c.req.param('id')) });
  });

  return app;
}

export function agentRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get('/', async (c) => {
    const agentDir = join(deps.root, '.claude', 'agents');
    const files = existsSync(agentDir) ? readdirSync(agentDir).filter((f) => f.endsWith('.md')) : [];
    const fileFor = (id: AgentId) => files.find((f) => f.replace(/\.md$/, '') === id || AGENT_FILE_ALIASES[f.replace(/\.md$/, '')] === id) ?? null;
    const agents = [];
    for (const id of AGENT_IDS) {
      const lastTask = await deps.repo.agentTasks.first({ agentId: id }, { orderBy: 'createdAt', desc: true });
      const jobTypes = (Object.entries(JOB_AGENT) as [JobType, AgentId][]).filter(([, a]) => a === id).map(([t]) => t);
      const lastJob = jobTypes.length ? await deps.repo.jobs.first({ type: { op: 'in', value: jobTypes } }, { orderBy: 'createdAt', desc: true }) : null;
      const queued = jobTypes.length ? await deps.repo.jobs.count({ type: { op: 'in', value: jobTypes }, status: 'queued' }) : 0;
      const lastActivity = await deps.repo.auditLog.first({ actorId: id }, { orderBy: 'id', desc: true });
      const latest = [lastTask?.status, lastJob?.status].filter(Boolean);
      const status = latest.includes('running') ? 'running' : latest.includes('failed') ? 'failed' : latest.length || lastActivity ? 'idle' : 'never';
      agents.push({
        id,
        file: id === 'owner' ? null : fileFor(id),
        role: ROLE[id] ?? null,
        gates: Object.values(GATES).filter((g) => (g.approvers as readonly string[]).includes(id)).map((g) => g.id),
        status,
        jobTypes,
        queuedJobs: queued,
        lastTask,
        lastJob,
        lastActivity,
      });
    }
    return c.json({ agents });
  });
  return app;
}

export function systemRoutes(deps: AppDeps) {
  const app = new Hono();
  const { repo, env } = deps;

  app.get('/brief', async (c) => c.json({ brief: await collectDailyBrief(repo, deps.now(), env) }));

  app.get('/system', async (c) => {
    const cfg = loadWorkerConfig(env);
    const envStop = ['1', 'true', 'yes', 'on'].includes((env.RJ_EMERGENCY_STOP ?? '').trim().toLowerCase());
    const dbStop = (await repo.getConfig<boolean>('emergency_stop')) === true;
    const voice = voiceStatus(env);
    return c.json({
      providers: [
        ...getProviderStatuses({ env }).map((s) => ({ id: s.id, kind: s.kind, configured: s.configured, mode: s.mode, note: s.note })),
        { id: 'elevenlabs', kind: 'tts', configured: voice.elevenlabs.configured, mode: voice.mode === 'elevenlabs' ? 'live' : 'disabled', note: 'Merkstem (betaald): alleen met RJ_TTS_PROVIDER=elevenlabs en sleutel. Zonder: Reels zijn stemloos (ondertitels op leestempo).' },
      ],
      costCaps: {
        dailyCents: cfg.dailyCostCapCents,
        monthlyCents: cfg.monthlyCostCapCents,
        perJobCents: cfg.perJobCostCapCents,
        maxConcurrentJobs: cfg.maxConcurrentJobs,
        maxRetries: cfg.maxRetries,
      },
      emergencyStop: { active: envStop || dbStop, env: envStop, db: dbStop },
      database: { path: relative(deps.root, defaultDbPath(env)) || defaultDbPath(env), dialect: repo.dialect },
    });
  });

  app.post('/system/emergency-stop', async (c) => {
    const body = await parseBody(c, EmergencyStop);
    await deps.workflow.setEmergencyStop(body.on, body.actorId, body.reason);
    return c.json({ emergencyStop: { db: body.on, active: await isEmergencyStopActive(repo, env) } });
  });

  app.get('/logs', async (c) => {
    const [errors, audit] = await Promise.all([
      repo.errorLogs.list({}, { orderBy: 'createdAt', desc: true, limit: 100 }),
      repo.auditLog.list({}, { orderBy: 'id', desc: true, limit: 100 }),
    ]);
    return c.json({ errors, audit });
  });

  return app;
}
