import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WorkflowService, isEmergencyStopActive, sha256File } from '@rj/content-engine';
import { REPO_ROOT, type Repository } from '@rj/database';
import { type ContentIdea, type PipelineStage, newId } from '@rj/shared';
import { type EnqueueInput, enqueueJob } from '../queue.js';
import { type JobHandler, NonRetryableError } from '../runner.js';
import { loadWorkerConfig } from '../config.js';
import { amsterdamDate } from './daily-brief.js';
import { runProcess } from './shell.js';

/**
 * render_batch: renders many Reels with a concurrency cap.
 *
 * Safety rules (all enforced here, none can be switched off from the payload):
 * - only items with a valid G2 + G3 for the current script (the worker never approves a gate);
 * - emergency stop is checked before every render; once it is on, nothing new starts;
 * - idempotent: an MP4 whose sidecar `<slug>.render.json` has the same input hash (storyboard +
 *   TTS provider + template source) and an untouched file is reused, not re-rendered;
 * - caps from env: concurrency, time per render, render minutes per day, retries per item, cost
 *   per job and per day.
 */
export interface RenderBatchConfig {
  concurrency: number;
  perRenderTimeoutMs: number;
  dailyMinutesCap: number;
  itemRetries: number;
  minutesPerReel: number;
  /** Estimated paid cost per Reel in cents (0 for local render + local TTS; unknown paid TTS costs are the owner's call). */
  costPerReelCents: number;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`);
  return n;
}

export function loadRenderBatchConfig(env: NodeJS.ProcessEnv = process.env): RenderBatchConfig {
  return {
    concurrency: Math.max(1, Math.floor(num(env, 'RJ_RENDER_CONCURRENCY', 2))),
    perRenderTimeoutMs: Math.max(1000, Math.floor(num(env, 'RJ_RENDER_JOB_TIMEOUT_MS', 15 * 60_000))),
    dailyMinutesCap: num(env, 'RJ_RENDER_DAILY_MINUTES_CAP', 480),
    itemRetries: Math.floor(num(env, 'RJ_RENDER_ITEM_RETRIES', 1)),
    minutesPerReel: num(env, 'RJ_RENDER_MINUTES_PER_REEL', 4) || 4,
    costPerReelCents: Math.round(num(env, 'RJ_RENDER_COST_PER_REEL_CENTS', 0)),
  };
}

export interface BatchItem {
  contentId: string;
  slug: string;
}

export interface RenderOutcome {
  mp4Path: string;
  sha256: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
}

export type RenderFn = (slug: string, opts: { signal: AbortSignal; timeoutMs: number; root: string }) => Promise<RenderOutcome>;

export type ItemStatus = 'rendered' | 'reused' | 'failed' | 'skipped';
export interface ItemResult {
  contentId: string;
  slug: string;
  status: ItemStatus;
  reason?: string;
  inputHash?: string;
  sha256?: string;
  attempts?: number;
}

export interface BatchResult {
  requested: number;
  rendered: number;
  reused: number;
  failed: number;
  skipped: number;
  stoppedBy: 'emergency-stop' | 'daily-minutes-cap' | 'daily-cost-cap' | 'abort' | null;
  maxInFlight: number;
  items: ItemResult[];
}

/** Stages a render may start from; the worker moves the item along RENDERING -> RENDERED -> QA_REVIEW. */
const START_STAGES: readonly PipelineStage[] = ['APPROVED_FOR_PRODUCTION', 'AUDIO_GENERATING', 'RENDERING'];
const WORKER = 'worker';

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
}

function hashTree(dir: string, h: ReturnType<typeof createHash>): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) hashTree(p, h);
    else h.update(name).update(readFileSync(p));
  }
}

/** Hash of everything that decides what the MP4 looks like: storyboard, voice provider, template source. */
export function renderInputHash(root: string, slug: string, env: NodeJS.ProcessEnv = process.env): string {
  const sb = join(root, 'content', 'scripts', slug, 'storyboard.json');
  if (!existsSync(sb)) throw new NonRetryableError(`storyboard missing for ${slug}`);
  const h = createHash('sha256');
  h.update(JSON.stringify(sortKeys(JSON.parse(readFileSync(sb, 'utf8')))));
  h.update(`|tts:${env.RJ_TTS_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'local'}|`);
  const ve = join(root, 'packages', 'video-engine', 'src');
  for (const part of ['templates', 'components', 'calc']) hashTree(join(ve, part), h);
  for (const f of ['schemas.ts', 'theme.ts', 'Root.tsx']) if (existsSync(join(ve, f))) h.update(f).update(readFileSync(join(ve, f)));
  return h.digest('hex');
}

interface Sidecar {
  inputHash: string;
  sha256: string;
  renderedAt: string;
}
const sidecarPath = (root: string, slug: string) => join(root, 'output', 'reels', `${slug}.render.json`);
const mp4Path = (root: string, slug: string) => join(root, 'output', 'reels', `${slug}.mp4`);

/** The existing MP4 for this input hash, if it is still byte-identical to what was rendered. */
export async function findReusableRender(root: string, slug: string, inputHash: string): Promise<RenderOutcome | null> {
  const sc = sidecarPath(root, slug);
  const mp4 = mp4Path(root, slug);
  if (!existsSync(sc) || !existsSync(mp4)) return null;
  try {
    const rec = JSON.parse(readFileSync(sc, 'utf8')) as Sidecar;
    if (rec.inputHash !== inputHash) return null;
    const sha = await sha256File(mp4);
    return sha === rec.sha256 ? { mp4Path: mp4, sha256: sha } : null;
  } catch {
    return null;
  }
}

/** Default renderer: `npm run render -w @rj/video-engine -- --content <slug>`, then hash the MP4. */
export const defaultRender: RenderFn = async (slug, { signal, root }) => {
  const { code, output } = await runProcess('npm', ['run', 'render', '-w', '@rj/video-engine', '--', '--content', slug], { cwd: root, signal });
  if (signal.aborted) throw new Error('render aborted (time cap)');
  if (code !== 0) throw new Error(`render exited with code ${code}: ${output.slice(-400)}`);
  const file = mp4Path(root, slug);
  if (!existsSync(file)) throw new Error(`render finished but ${relative(root, file)} is missing`);
  let meta: { render?: { width?: number; height?: number; durationInFrames?: number; fps?: number } } = {};
  try {
    meta = JSON.parse(readFileSync(join(root, 'content', 'scripts', slug, 'metadata.json'), 'utf8'));
  } catch {
    /* optional */
  }
  const r = meta.render;
  return { mp4Path: file, sha256: await sha256File(file), width: r?.width ?? null, height: r?.height ?? null, durationMs: r?.durationInFrames && r.fps ? Math.round((r.durationInFrames / r.fps) * 1000) : null };
};

export interface RenderBatchOptions {
  root?: string;
  render?: RenderFn;
}

async function minutesUsedToday(repo: Repository, now: Date): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const rows = await repo.renderJobs.list({ kind: 'video', startedAt: { op: 'gte', value: start } });
  let ms = 0;
  for (const r of rows) if (r.startedAt && r.finishedAt) ms += Math.max(0, Date.parse(r.finishedAt) - Date.parse(r.startedAt));
  return ms / 60_000;
}

export function createRenderBatchHandler(options: RenderBatchOptions = {}): JobHandler {
  const root = options.root ?? REPO_ROOT;
  const render = options.render ?? defaultRender;
  return async ({ job, repo, signal, env, now, log }) => {
    const payload = (job.payload ?? {}) as { items?: unknown };
    const items: BatchItem[] = Array.isArray(payload.items)
      ? (payload.items as BatchItem[]).filter((i) => i && typeof i.contentId === 'string' && typeof i.slug === 'string' && /^[A-Za-z0-9][\w.-]*$/.test(i.slug) && !i.slug.includes('..'))
      : [];
    if (items.length === 0) throw new NonRetryableError('render_batch needs payload.items [{contentId, slug}]');
    const cfg = loadRenderBatchConfig(env);
    const worker = loadWorkerConfig(env);
    if (cfg.costPerReelCents > worker.perJobCostCapCents) throw new NonRetryableError(`estimated cost ${cfg.costPerReelCents}c per Reel exceeds the per-job cap ${worker.perJobCostCapCents}c`);
    const wf = new WorkflowService(repo, { env, now });
    const result: BatchResult = { requested: items.length, rendered: 0, reused: 0, failed: 0, skipped: 0, stoppedBy: null, maxInFlight: 0, items: [] };

    let minutesBudgetUsed = await minutesUsedToday(repo, now());
    const spentCents = (await repo.costRecords.sum('amountCents', { createdAt: { op: 'gte', value: new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate())).toISOString() } })) ?? 0;
    let plannedCostCents = 0;
    let inFlight = 0;
    let next = 0;

    const stopped = async (): Promise<NonNullable<BatchResult['stoppedBy']> | null> => {
      if (result.stoppedBy) return result.stoppedBy;
      if (signal.aborted) return (result.stoppedBy = 'abort');
      if (await isEmergencyStopActive(repo, env)) return (result.stoppedBy = 'emergency-stop');
      return null;
    };
    const skip = (item: BatchItem, reason: string) => {
      result.skipped++;
      result.items.push({ ...item, status: 'skipped', reason });
    };

    async function one(item: BatchItem): Promise<void> {
      const content = await repo.contentItems.get(item.contentId);
      if (!content) return skip(item, 'content item not found');
      if (!START_STAGES.includes(content.stage)) return skip(item, `stage ${content.stage}: only APPROVED_FOR_PRODUCTION (G2+G3) can be rendered`);
      const gates = await wf.gateStatus(item.contentId);
      if (!gates.G2.satisfied || !gates.G3.satisfied) return skip(item, 'G2 and G3 must be valid for the current script');
      let inputHash: string;
      try {
        inputHash = renderInputHash(root, item.slug, env);
      } catch (err) {
        return skip(item, err instanceof Error ? err.message : String(err));
      }

      const reused = await findReusableRender(root, item.slug, inputHash);
      if (reused) {
        await finish(content, item, reused, inputHash);
        result.reused++;
        result.items.push({ ...item, status: 'reused', inputHash, sha256: reused.sha256, reason: 'identical input hash: existing MP4 reused' });
        return;
      }
      // Budget checks only apply to real renders.
      if (minutesBudgetUsed + cfg.minutesPerReel > cfg.dailyMinutesCap) {
        result.stoppedBy ??= 'daily-minutes-cap';
        return skip(item, `daily render time cap (${cfg.dailyMinutesCap} min) reached`);
      }
      if (cfg.costPerReelCents > 0 && spentCents + plannedCostCents + cfg.costPerReelCents > worker.dailyCostCapCents) {
        result.stoppedBy ??= 'daily-cost-cap';
        return skip(item, 'daily cost cap would be exceeded');
      }
      minutesBudgetUsed += cfg.minutesPerReel; // reserve before starting (parallel lanes share the budget)
      plannedCostCents += cfg.costPerReelCents;

      if (content.stage === 'APPROVED_FOR_PRODUCTION') {
        await wf.transition(content.id, 'AUDIO_GENERATING', WORKER, 'render_batch: start');
        await wf.transition(content.id, 'RENDERING', WORKER, 'render_batch: render');
      } else if (content.stage === 'AUDIO_GENERATING') await wf.transition(content.id, 'RENDERING', WORKER, 'render_batch: render');

      const maxAttempts = 1 + cfg.itemRetries;
      let lastError = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (await stopped()) {
          await safeBack(wf, content.id);
          return skip(item, `stopped (${result.stoppedBy}) before attempt ${attempt}`);
        }
        const started = now().toISOString();
        const rj = await repo.renderJobs.insert({ id: newId('rj'), contentId: content.id, kind: 'video', status: 'running', jobId: job.id, inputHash, outputPath: null, error: null, startedAt: started, finishedAt: null, createdAt: started });
        const ctl = new AbortController();
        const onAbort = () => ctl.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => ctl.abort(), cfg.perRenderTimeoutMs);
        try {
          const out = await render(item.slug, { signal: ctl.signal, timeoutMs: cfg.perRenderTimeoutMs, root });
          if (ctl.signal.aborted) throw new Error(`render time cap ${cfg.perRenderTimeoutMs} ms exceeded`);
          mkdirSync(join(root, 'output', 'reels'), { recursive: true });
          writeFileSync(sidecarPath(root, item.slug), JSON.stringify({ inputHash, sha256: out.sha256, renderedAt: now().toISOString() } satisfies Sidecar, null, 2) + '\n');
          await repo.renderJobs.update(rj.id, { status: 'succeeded', outputPath: relative(root, out.mp4Path), finishedAt: now().toISOString() });
          await finish(content, item, out, inputHash);
          result.rendered++;
          result.items.push({ ...item, status: 'rendered', inputHash, sha256: out.sha256, attempts: attempt });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          await repo.renderJobs.update(rj.id, { status: 'failed', error: lastError.slice(0, 500), finishedAt: now().toISOString() });
          log.warn(`render ${item.slug} attempt ${attempt}/${maxAttempts} failed: ${lastError}`);
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        }
      }
      await safeBack(wf, content.id);
      await repo.errorLogs.insert({ id: newId('err'), scope: 'worker:render_batch', contentId: content.id, jobId: job.id, message: lastError.slice(0, 500) || 'render failed', details: { slug: item.slug, attempts: maxAttempts }, createdAt: now().toISOString() });
      result.failed++;
      result.items.push({ ...item, status: 'failed', reason: lastError.slice(0, 300), inputHash, attempts: maxAttempts });
    }

    /** Registers the MP4 as the item's video asset (new hash invalidates G4/G5) and moves it to QA_REVIEW. */
    async function finish(content: ContentIdea, item: BatchItem, out: RenderOutcome, _inputHash: string): Promise<void> {
      const fresh = (await repo.contentItems.get(content.id))!;
      if (fresh.currentAssetSha256 !== out.sha256)
        await wf.setVideoAsset(content.id, { path: relative(root, out.mp4Path), sha256: out.sha256, durationMs: out.durationMs ?? null, width: out.width ?? null, height: out.height ?? null }, WORKER);
      let stage = (await repo.contentItems.get(content.id))!.stage;
      if (stage === 'APPROVED_FOR_PRODUCTION') {
        await wf.transition(content.id, 'AUDIO_GENERATING', WORKER, 'render_batch: reuse existing render');
        stage = 'AUDIO_GENERATING';
      }
      if (stage === 'AUDIO_GENERATING') {
        await wf.transition(content.id, 'RENDERING', WORKER, 'render_batch: reuse existing render');
        stage = 'RENDERING';
      }
      if (stage === 'RENDERING') {
        await wf.transition(content.id, 'RENDERED', WORKER, `render_batch: ${item.slug} rendered`);
        await wf.transition(content.id, 'QA_REVIEW', WORKER, 'render_batch: ready for media QA (G4)');
      }
    }

    async function lane(): Promise<void> {
      while (next < items.length) {
        if (await stopped()) return;
        const item = items[next++]!;
        inFlight++;
        result.maxInFlight = Math.max(result.maxInFlight, inFlight);
        try {
          await one(item);
        } catch (err) {
          // An unexpected error on one item (e.g. a denied transition) must not stop the batch.
          result.failed++;
          result.items.push({ ...item, status: 'failed', reason: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
        } finally {
          inFlight--;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(cfg.concurrency, items.length) }, lane));
    // Items never reached because a stop condition ended the batch.
    const seen = new Set(result.items.map((i) => i.contentId));
    for (const item of items) if (!seen.has(item.contentId)) skip(item, `not started (${result.stoppedBy ?? 'batch ended'})`);
    log.info(`render_batch ${job.id}: ${result.rendered} rendered, ${result.reused} reused, ${result.failed} failed, ${result.skipped} skipped, max ${result.maxInFlight} parallel`);
    return { result, ...(plannedCostCents > 0 && result.rendered > 0 ? { cost: { provider: 'render', kind: 'render_batch', amountCents: cfg.costPerReelCents * result.rendered, isEstimate: true, units: result.rendered } } : {}) };
  };
}

async function safeBack(wf: WorkflowService, contentId: string): Promise<void> {
  try {
    await wf.transition(contentId, 'APPROVED_FOR_PRODUCTION', WORKER, 'render_batch: render did not finish, back to production queue');
  } catch {
    /* emergency stop or already moved: leave as is */
  }
}

/** Slug of an item: series notes, else the content/scripts folder whose storyboard has the same title. */
export function slugFor(item: ContentIdea, root: string = REPO_ROOT): string | null {
  if (item.notes?.startsWith('{')) {
    try {
      const n = JSON.parse(item.notes) as { rj?: string; slug?: string };
      if (n.rj === 'series/1' && n.slug && existsSync(join(root, 'content', 'scripts', n.slug, 'storyboard.json'))) return n.slug;
    } catch {
      /* not series notes */
    }
  }
  const dir = join(root, 'content', 'scripts');
  if (!existsSync(dir)) return null;
  for (const slug of readdirSync(dir)) {
    try {
      const sb = JSON.parse(readFileSync(join(dir, slug, 'storyboard.json'), 'utf8')) as { title?: string };
      if (sb.title?.trim() === item.title.trim()) return slug;
    } catch {
      /* skip */
    }
  }
  return null;
}

export interface EnqueueBatchOptions {
  root?: string;
  /** Max items in this batch (default: all eligible). */
  limit?: number;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

/** Collects APPROVED_FOR_PRODUCTION items with G2+G3 and queues one render_batch job (idempotent per item set and day). */
export async function enqueueRenderBatch(repo: Repository, options: EnqueueBatchOptions = {}): Promise<{ created: boolean; jobId: string | null; items: BatchItem[] }> {
  const env = options.env ?? process.env;
  const root = options.root ?? REPO_ROOT;
  const wf = new WorkflowService(repo, { env });
  const cfg = loadRenderBatchConfig(env);
  const ready = await repo.contentItems.list({ stage: 'APPROVED_FOR_PRODUCTION' }, { orderBy: 'priority', desc: true });
  const items: BatchItem[] = [];
  for (const c of ready) {
    if (options.limit !== undefined && items.length >= options.limit) break;
    const g = await wf.gateStatus(c.id);
    if (!g.G2.satisfied || !g.G3.satisfied) continue;
    const slug = slugFor(c, root);
    if (slug) items.push({ contentId: c.id, slug });
  }
  if (items.length === 0) return { created: false, jobId: null, items };
  const key = `render_batch:${amsterdamDate(options.now ?? new Date())}:${createHash('sha256').update(items.map((i) => i.contentId).sort().join(',')).digest('hex').slice(0, 16)}`;
  const timeoutMs = Math.min(24 * 3_600_000, Math.ceil(items.length / cfg.concurrency) * cfg.perRenderTimeoutMs * (1 + cfg.itemRetries) + 60_000);
  const input: EnqueueInput = { type: 'render_batch', idempotencyKey: key, payload: { items }, timeoutMs, maxAttempts: 1, estimatedCostCents: 0 };
  const { job, created } = await enqueueJob(repo, input, env);
  return { created, jobId: job.id, items };
}
