import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepository, seed, type Repository } from '@rj/database';
import { newId } from '@rj/shared';
import {
  NonRetryableError,
  Worker,
  cancelJob,
  collectDailyBrief,
  createWorkspaceScriptHandler,
  enqueueJob,
  registerDefaultHandlers,
  renderDailyBrief,
  retryJob,
} from './index.js';

let repo: Repository;
let dir: string;
const env = { RJ_DAILY_COST_CAP_EUR: '5', RJ_MONTHLY_COST_CAP_EUR: '50', RJ_PER_JOB_COST_CAP_EUR: '1', RJ_MAX_CONCURRENT_JOBS: '2', RJ_MAX_RETRIES: '2' };

beforeEach(() => {
  repo = createSqliteRepository(':memory:');
  dir = mkdtempSync(join(tmpdir(), 'rj-worker-'));
});
afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});

function worker(extraEnv: Record<string, string> = {}, config = {}) {
  return new Worker(repo, { env: { ...env, ...extraEnv }, config: { backoffBaseMs: 0, ...config }, log: { info() {}, warn() {}, error() {} } });
}

describe('queue', () => {
  it('idempotency key is unique', async () => {
    const a = await enqueueJob(repo, { type: 'daily_brief', idempotencyKey: 'k' }, env);
    const b = await enqueueJob(repo, { type: 'daily_brief', idempotencyKey: 'k' }, env);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    expect(a.job.maxAttempts).toBe(3);
    expect(await repo.jobs.count()).toBe(1);
  });
  it('cancel and retry', async () => {
    const { job } = await enqueueJob(repo, { type: 'daily_brief', idempotencyKey: 'c' }, env);
    expect(await cancelJob(repo, job.id)).toBe(true);
    expect((await repo.jobs.get(job.id))!.status).toBe('cancelled');
    expect(await worker().runOnce()).toMatchObject({ processed: 0 });
    expect(await retryJob(repo, job.id)).toBe(true);
    expect((await repo.jobs.get(job.id))!.status).toBe('queued');
  });
});

describe('runner', () => {
  it('runs a job and records cost', async () => {
    const w = worker().register('render_cover', async () => ({ result: { ok: 1 }, cost: { provider: 'test', kind: 'render', amountCents: 12, isEstimate: true } }));
    const { job } = await enqueueJob(repo, { type: 'render_cover', idempotencyKey: 'r1', estimatedCostCents: 12 }, env);
    const s = await w.runOnce();
    expect(s.succeeded).toEqual([job.id]);
    const done = (await repo.jobs.get(job.id))!;
    expect(done).toMatchObject({ status: 'succeeded', attempts: 1, result: { ok: 1 } });
    expect(await repo.costRecords.sum('amountCents', { jobId: job.id })).toBe(12);
  });

  it('retries with backoff up to the cap, then fails and logs an error', async () => {
    let calls = 0;
    const w = worker({}, { backoffBaseMs: 60_000 }).register('media_qa', async () => {
      calls++;
      throw new Error('flaky');
    });
    const { job } = await enqueueJob(repo, { type: 'media_qa', idempotencyKey: 'f', maxAttempts: 2 }, env);
    let s = await w.runOnce();
    expect(s.retried).toEqual([job.id]);
    const queued = (await repo.jobs.get(job.id))!;
    expect(queued.status).toBe('queued');
    expect(Date.parse(queued.runAfter)).toBeGreaterThan(Date.now() + 50_000);
    s = await w.runOnce();
    expect(s.processed).toBe(0); // not due yet
    await repo.jobs.update(job.id, { runAfter: new Date().toISOString() });
    s = await w.runOnce();
    expect(s.failed).toEqual([job.id]);
    expect(calls).toBe(2);
    expect((await repo.jobs.get(job.id))!).toMatchObject({ status: 'failed', attempts: 2, lastError: 'flaky' });
    expect(await repo.errorLogs.count({ jobId: job.id })).toBe(1);
  });

  it('non-retryable errors and unknown handlers fail immediately', async () => {
    const w = worker().register('media_qa', async () => {
      throw new NonRetryableError('bad payload');
    });
    const a = await enqueueJob(repo, { type: 'media_qa', idempotencyKey: 'n' }, env);
    const b = await enqueueJob(repo, { type: 'collect_metrics', idempotencyKey: 'u' }, env);
    const s = await w.runOnce();
    expect(s.failed.sort()).toEqual([a.job.id, b.job.id].sort());
    expect((await repo.jobs.get(b.job.id))!.lastError).toMatch(/no handler/);
  });

  it('enforces the per-job timeout', async () => {
    let aborted = false;
    const w = worker().register('render_video', ({ signal }) => new Promise((res) => {
      signal.addEventListener('abort', () => { aborted = true; res(); });
    }));
    const { job } = await enqueueJob(repo, { type: 'render_video', idempotencyKey: 't', timeoutMs: 30, maxAttempts: 1 }, env);
    await w.runOnce();
    expect(aborted).toBe(true);
    expect((await repo.jobs.get(job.id))!.lastError).toMatch(/timed out/);
  });

  it('respects the concurrency cap', async () => {
    let active = 0;
    let peak = 0;
    const w = worker().register('render_video', async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
    });
    for (let i = 0; i < 5; i++) await enqueueJob(repo, { type: 'render_video', idempotencyKey: `c${i}` }, env);
    const s = await w.runOnce();
    expect(s.succeeded).toHaveLength(5);
    expect(peak).toBe(2);
  });

  it('cost caps: per-job refuses permanently, daily cap defers', async () => {
    const w = worker().register('generate_audio', async () => ({}));
    const big = await enqueueJob(repo, { type: 'generate_audio', idempotencyKey: 'big', estimatedCostCents: 150 }, env);
    await repo.costRecords.insert({ id: newId('cost'), contentId: null, jobId: null, provider: 'x', kind: 'tts', amountCents: 450, currency: 'EUR', units: null, isEstimate: false, createdAt: new Date().toISOString() });
    const over = await enqueueJob(repo, { type: 'generate_audio', idempotencyKey: 'over', estimatedCostCents: 80 }, env);
    const free = await enqueueJob(repo, { type: 'generate_audio', idempotencyKey: 'free', estimatedCostCents: 0 }, env);
    const s = await w.runOnce();
    expect(s.failed).toEqual([big.job.id]);
    expect((await repo.jobs.get(big.job.id))!.lastError).toMatch(/per-job cap/);
    expect(s.deferredByCostCap).toEqual([over.job.id]);
    expect((await repo.jobs.get(over.job.id))!.status).toBe('queued');
    expect(s.succeeded).toEqual([free.job.id]);
  });

  it('emergency stop (env or config flag) processes nothing', async () => {
    const w0 = worker().register('render_video', async () => ({}));
    await enqueueJob(repo, { type: 'render_video', idempotencyKey: 'e' }, env);
    expect(await worker({ RJ_EMERGENCY_STOP: '1' }).register('render_video', async () => ({})).runOnce()).toMatchObject({ emergencyStop: true, processed: 0 });
    await repo.setConfig('emergency_stop', true, 'owner');
    expect(await w0.runOnce()).toMatchObject({ emergencyStop: true, processed: 0 });
    await repo.setConfig('emergency_stop', false, 'owner');
    expect((await w0.runOnce()).succeeded).toHaveLength(1);
  });

  it('secrets in errors are redacted', async () => {
    const secret = 'sk-ant-api03-VERYSECRETVALUE123';
    const w = worker({ ANTHROPIC_API_KEY: secret }).register('media_qa', async () => {
      throw new NonRetryableError(`call failed with ${secret}`);
    });
    const { job } = await enqueueJob(repo, { type: 'media_qa', idempotencyKey: 's' }, env);
    await w.runOnce();
    expect((await repo.jobs.get(job.id))!.lastError).not.toContain(secret);
  });
});

describe('shell handlers', () => {
  it('fail clearly as "not available" when the workspace script is missing', async () => {
    const w = worker().register('generate_audio', createWorkspaceScriptHandler({ workspace: '@rj/voice-engine', script: 'does-not-exist' }));
    const { job } = await enqueueJob(repo, { type: 'generate_audio', idempotencyKey: 'na', contentId: 'ci_x' }, env);
    await w.runOnce();
    expect((await repo.jobs.get(job.id))!).toMatchObject({ status: 'failed', attempts: 1 });
    expect((await repo.jobs.get(job.id))!.lastError).toMatch(/not available/);
  });
  it('builds the npm command with --content (runner stubbed)', async () => {
    const calls: string[][] = [];
    const h = createWorkspaceScriptHandler({ workspace: '@rj/video-engine', script: 'render' }, { run: async (cmd, args) => (calls.push([cmd, ...args]), { code: 0, output: 'ok' }) });
    const w = worker().register('render_video', h);
    await enqueueJob(repo, { type: 'render_video', idempotencyKey: 'sh', contentId: 'ci_1', payload: { slug: 'reel-250' } }, env);
    expect((await w.runOnce()).succeeded).toHaveLength(1);
    expect(calls[0]).toEqual(['npm', 'run', 'render', '-w', '@rj/video-engine', '--', '--content', 'reel-250']);
  });
});

describe('daily brief', () => {
  it('reports "geen data" for costs and real counts from the seeded DB', async () => {
    await seed(repo);
    const data = await collectDailyBrief(repo, new Date('2026-10-25T08:00:00Z'), {});
    expect(data.pipeline.IDEA).toBe(6);
    expect(data.costs).toEqual({ todayCents: null, monthCents: null, estimatedShareToday: null });
    expect(data.integrations.every((i) => i.mode === 'mock')).toBe(true);
    const md = renderDailyBrief(data);
    expect(md).toContain('Vandaag (UTC): geen data');
    expect(md).toContain('| IDEA | 6 |');
    expect(md).toContain('Niets gepland.');
  });
  it('job writes output/reports/<date>-daily-brief.md', async () => {
    const w = registerDefaultHandlers(worker(), { dailyBrief: { outDir: dir } });
    await enqueueJob(repo, { type: 'daily_brief', idempotencyKey: 'db' }, env);
    const s = await w.runOnce();
    expect(s.succeeded).toHaveLength(1);
    const job = (await repo.jobs.list())[0]!;
    const path = (job.result as { path: string }).path;
    expect(path).toMatch(/\d{4}-\d{2}-\d{2}-daily-brief\.md$/);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('# Daily brief');
  });
  it('collect_metrics fails as not available (never fabricates metrics)', async () => {
    const w = registerDefaultHandlers(worker());
    const { job } = await enqueueJob(repo, { type: 'collect_metrics', idempotencyKey: 'cm' }, env);
    await w.runOnce();
    expect((await repo.jobs.get(job.id))!.lastError).toMatch(/not available/);
    expect(await repo.analyticsSnapshots.count()).toBe(0);
  });
});
