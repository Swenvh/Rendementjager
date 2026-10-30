import type { Repository } from '@rj/database';
import { isEmergencyStopActive } from '@rj/content-engine';
import { type Job, type JobType, newId } from '@rj/shared';
import { createSafeLogger, redact, type SafeLogger } from '@rj/integrations';
import { type WorkerConfig, loadWorkerConfig } from './config.js';

export interface HandlerContext {
  job: Job;
  repo: Repository;
  /** Aborted on timeout; long-running handlers must honour it. */
  signal: AbortSignal;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  log: SafeLogger;
}

export interface HandlerResult {
  result?: unknown;
  /** Actual cost incurred, recorded as a CostRecord. Omit when no paid service was used. */
  cost?: { provider: string; kind: string; amountCents: number; isEstimate: boolean; units?: number | null };
}

export type JobHandler = (ctx: HandlerContext) => Promise<HandlerResult | void>;

/** Throw this for failures that must not be retried (missing script, invalid payload, ...). */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class JobTimeoutError extends Error {
  constructor(ms: number) {
    super(`job timed out after ${ms} ms`);
    this.name = 'JobTimeoutError';
  }
}

export interface RunSummary {
  emergencyStop: boolean;
  processed: number;
  succeeded: string[];
  failed: string[];
  retried: string[];
  /** Jobs left queued because a daily/monthly cost cap would be exceeded. */
  deferredByCostCap: string[];
}

export interface WorkerOptions {
  env?: NodeJS.ProcessEnv;
  config?: Partial<WorkerConfig>;
  now?: () => Date;
  log?: SafeLogger;
}

function startOfUtcDay(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
function startOfUtcMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export class Worker {
  private readonly handlers = new Map<JobType, JobHandler>();
  readonly config: WorkerConfig;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;
  private readonly log: SafeLogger;

  constructor(
    private readonly repo: Repository,
    options: WorkerOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.config = { ...loadWorkerConfig(this.env), ...options.config };
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? createSafeLogger('worker', undefined, this.env);
  }

  register(type: JobType, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  registeredTypes(): JobType[] {
    return [...this.handlers.keys()];
  }

  async isEmergencyStopped(): Promise<boolean> {
    return isEmergencyStopActive(this.repo, this.env);
  }

  /** Spend in cents (UTC day/month). null = no cost records at all in the window. */
  async spend(): Promise<{ todayCents: number | null; monthCents: number | null }> {
    const now = this.now();
    return {
      todayCents: await this.repo.costRecords.sum('amountCents', { createdAt: { op: 'gte', value: startOfUtcDay(now) } }),
      monthCents: await this.repo.costRecords.sum('amountCents', { createdAt: { op: 'gte', value: startOfUtcMonth(now) } }),
    };
  }

  /** Returns a refusal reason, or null when the job fits within all caps. */
  async costCapViolation(job: Job): Promise<{ permanent: boolean; reason: string } | null> {
    const est = job.estimatedCostCents;
    if (est > this.config.perJobCostCapCents)
      return { permanent: true, reason: `estimated cost ${est}c exceeds per-job cap ${this.config.perJobCostCapCents}c` };
    if (est === 0) return null;
    const { todayCents, monthCents } = await this.spend();
    if ((todayCents ?? 0) + est > this.config.dailyCostCapCents)
      return { permanent: false, reason: `daily cost cap ${this.config.dailyCostCapCents}c would be exceeded` };
    if ((monthCents ?? 0) + est > this.config.monthlyCostCapCents)
      return { permanent: false, reason: `monthly cost cap ${this.config.monthlyCostCapCents}c would be exceeded` };
    return null;
  }

  private backoff(attempt: number): number {
    return Math.min(this.config.backoffMaxMs, this.config.backoffBaseMs * Math.pow(2, Math.max(0, attempt - 1)));
  }

  private async fail(job: Job, message: string, retry: boolean, summary: RunSummary): Promise<void> {
    const now = this.now();
    const msg = redact(message, [], this.env);
    if (retry && job.attempts < job.maxAttempts) {
      await this.repo.jobs.update(job.id, {
        status: 'queued',
        lastError: msg,
        runAfter: new Date(now.getTime() + this.backoff(job.attempts)).toISOString(),
      });
      summary.retried.push(job.id);
      this.log.warn(`job ${job.id} (${job.type}) attempt ${job.attempts}/${job.maxAttempts} failed, retry scheduled: ${msg}`);
      return;
    }
    await this.repo.jobs.update(job.id, { status: 'failed', lastError: msg, finishedAt: now.toISOString() });
    await this.repo.errorLogs.insert({
      id: newId('err'),
      scope: `worker:${job.type}`,
      contentId: job.contentId,
      jobId: job.id,
      message: msg,
      details: { attempts: job.attempts, maxAttempts: job.maxAttempts },
      createdAt: now.toISOString(),
    });
    summary.failed.push(job.id);
    this.log.error(`job ${job.id} (${job.type}) failed: ${msg}`);
  }

  private async execute(queued: Job, summary: RunSummary): Promise<void> {
    const violation = await this.costCapViolation(queued);
    if (violation) {
      if (violation.permanent) {
        const claimed = await this.repo.jobs.claim(queued.id, this.now().toISOString());
        if (claimed) await this.fail(claimed, `refused: ${violation.reason}`, false, summary);
      } else {
        await this.repo.jobs.update(queued.id, { lastError: `deferred: ${violation.reason}` });
        summary.deferredByCostCap.push(queued.id);
      }
      return;
    }
    const job = await this.repo.jobs.claim(queued.id, this.now().toISOString());
    if (!job) return; // another worker took it
    summary.processed++;
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.fail(job, `no handler registered for job type "${job.type}"`, false, summary);
      return;
    }
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new JobTimeoutError(job.timeoutMs));
        controller.abort();
      }, job.timeoutMs);
    });
    try {
      const out = (await Promise.race([
        handler({ job, repo: this.repo, signal: controller.signal, env: this.env, now: this.now, log: this.log }),
        timeout,
      ])) as HandlerResult | void;
      const finishedAt = this.now().toISOString();
      if (out?.cost) {
        await this.repo.costRecords.insert({
          id: newId('cost'),
          contentId: job.contentId,
          jobId: job.id,
          provider: out.cost.provider,
          kind: out.cost.kind,
          amountCents: Math.round(out.cost.amountCents),
          currency: 'EUR',
          units: out.cost.units ?? null,
          isEstimate: out.cost.isEstimate,
          createdAt: finishedAt,
        });
      }
      await this.repo.jobs.update(job.id, { status: 'succeeded', result: out?.result ?? null, lastError: null, finishedAt });
      summary.succeeded.push(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.fail(job, message, !(err instanceof NonRetryableError), summary);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Processes every job that is due right now (status queued, runAfter <= now), at most
   * `maxConcurrentJobs` at a time (minus jobs already running elsewhere), then returns.
   */
  async runOnce(): Promise<RunSummary> {
    const summary: RunSummary = { emergencyStop: false, processed: 0, succeeded: [], failed: [], retried: [], deferredByCostCap: [] };
    if (await this.isEmergencyStopped()) {
      summary.emergencyStop = true;
      this.log.warn('emergency stop active: no jobs processed');
      return summary;
    }
    const due = await this.repo.jobs.list(
      { status: 'queued', runAfter: { op: 'lte', value: this.now().toISOString() } },
      { orderBy: 'createdAt' },
    );
    const runningElsewhere = await this.repo.jobs.count({ status: 'running' });
    const slots = Math.max(0, this.config.maxConcurrentJobs - runningElsewhere);
    let index = 0;
    const lane = async () => {
      while (index < due.length) {
        if (await this.isEmergencyStopped()) {
          summary.emergencyStop = true;
          return;
        }
        if (index >= due.length) return;
        const job = due[index++]!;
        await this.execute(job, summary);
      }
    };
    await Promise.all(Array.from({ length: Math.min(slots, due.length) }, lane));
    return summary;
  }
}
