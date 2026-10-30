/** Error that tells the retry helper when it may try again (HTTP 429 / provider rate limit). */
export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface RetryOptions {
  /** Retries after the first attempt (default 3). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  /** 0..1 random jitter fraction (default 0.2). */
  jitter?: number;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  const code = (err as { code?: string })?.code;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(code ?? '');
}

export function backoffDelay(attempt: number, o: Required<Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'factor' | 'jitter'>>, random = Math.random): number {
  const raw = Math.min(o.maxDelayMs, o.baseDelayMs * Math.pow(o.factor, attempt - 1));
  const j = raw * o.jitter * (random() * 2 - 1);
  return Math.max(0, Math.round(raw + j));
}

/** Parses a Retry-After header (seconds or HTTP date) into ms. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Exponential backoff with jitter. A RateLimitError with retryAfterMs waits at least that long
 * (capped at maxDelayMs). Non-retryable errors are thrown immediately.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const o = {
    retries: options.retries ?? 3,
    baseDelayMs: options.baseDelayMs ?? 500,
    maxDelayMs: options.maxDelayMs ?? 30_000,
    factor: options.factor ?? 2,
    jitter: options.jitter ?? 0.2,
  };
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt > o.retries || !isRetryable(err)) throw err;
      let delay = backoffDelay(attempt, o, options.random);
      if (err instanceof RateLimitError && err.retryAfterMs !== null) delay = Math.min(o.maxDelayMs, Math.max(delay, err.retryAfterMs));
      options.onRetry?.({ attempt, delayMs: delay, error: err });
      await sleep(delay);
    }
  }
}

/** Throws HttpError / RateLimitError for non-2xx fetch responses. */
export function assertOk(res: { ok: boolean; status: number; headers: { get(name: string): string | null } }, what: string): void {
  if (res.ok) return;
  if (res.status === 429) throw new RateLimitError(`${what}: rate limited`, parseRetryAfter(res.headers.get('retry-after')));
  throw new HttpError(res.status, `${what}: HTTP ${res.status}`);
}
