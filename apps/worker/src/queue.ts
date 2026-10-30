import type { Repository } from '@rj/database';
import { type Job, type JobType, JobTypeSchema, newId } from '@rj/shared';
import { loadWorkerConfig } from './config.js';

export interface EnqueueInput {
  type: JobType;
  /** Unique per logical job; enqueueing the same key twice returns the existing job. */
  idempotencyKey: string;
  contentId?: string | null;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  timeoutMs?: number;
  estimatedCostCents?: number;
  runAfter?: string;
}

export async function enqueueJob(repo: Repository, input: EnqueueInput, env: NodeJS.ProcessEnv = process.env): Promise<{ job: Job; created: boolean }> {
  const type = JobTypeSchema.parse(input.type);
  if (!input.idempotencyKey?.trim()) throw new Error('idempotencyKey is required');
  const cfg = loadWorkerConfig(env);
  return repo.transaction(async (tx) => {
    const existing = await tx.jobs.first({ idempotencyKey: input.idempotencyKey });
    if (existing) return { job: existing, created: false };
    const now = new Date().toISOString();
    const job = await tx.jobs.insert({
      id: newId('job'),
      type,
      idempotencyKey: input.idempotencyKey,
      contentId: input.contentId ?? null,
      payload: input.payload ?? {},
      status: 'queued',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? cfg.maxRetries + 1,
      timeoutMs: input.timeoutMs ?? cfg.defaultTimeoutMs,
      estimatedCostCents: input.estimatedCostCents ?? 0,
      runAfter: input.runAfter ?? now,
      lastError: null,
      result: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    });
    return { job, created: true };
  });
}

/** Cancels a queued job (running jobs finish or time out). */
export async function cancelJob(repo: Repository, id: string): Promise<boolean> {
  return repo.transaction(async (tx) => {
    const job = await tx.jobs.get(id);
    if (!job || job.status !== 'queued') return false;
    await tx.jobs.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
    return true;
  });
}

/** Re-queues a failed/cancelled job (attempts reset) — an explicit operator action. */
export async function retryJob(repo: Repository, id: string): Promise<boolean> {
  return repo.transaction(async (tx) => {
    const job = await tx.jobs.get(id);
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return false;
    await tx.jobs.update(id, { status: 'queued', attempts: 0, lastError: null, runAfter: new Date().toISOString(), finishedAt: null });
    return true;
  });
}
