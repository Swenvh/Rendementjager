export interface WorkerConfig {
  dailyCostCapCents: number;
  monthlyCostCapCents: number;
  perJobCostCapCents: number;
  maxConcurrentJobs: number;
  maxRetries: number;
  defaultTimeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`);
  return n;
}

/** Caps from env (EUR -> cents). Defaults follow .claude/rules/cost-control.md. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    dailyCostCapCents: Math.round(num(env, 'RJ_DAILY_COST_CAP_EUR', 5) * 100),
    monthlyCostCapCents: Math.round(num(env, 'RJ_MONTHLY_COST_CAP_EUR', 50) * 100),
    perJobCostCapCents: Math.round(num(env, 'RJ_PER_JOB_COST_CAP_EUR', 1) * 100),
    maxConcurrentJobs: Math.max(1, Math.floor(num(env, 'RJ_MAX_CONCURRENT_JOBS', 2))),
    maxRetries: Math.floor(num(env, 'RJ_MAX_RETRIES', 3)),
    defaultTimeoutMs: Math.floor(num(env, 'RJ_JOB_TIMEOUT_MS', 15 * 60_000)),
    backoffBaseMs: Math.floor(num(env, 'RJ_JOB_BACKOFF_MS', 30_000)),
    backoffMaxMs: Math.floor(num(env, 'RJ_JOB_BACKOFF_MAX_MS', 30 * 60_000)),
  };
}
