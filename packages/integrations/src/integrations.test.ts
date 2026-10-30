import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicAdapter,
  BufferAdapter,
  GoogleSheetsAdapter,
  HttpError,
  N8nAdapter,
  REDACTED,
  RateLimitError,
  backoffDelay,
  createSafeLogger,
  getProviderStatuses,
  parseRetryAfter,
  redact,
  redactValue,
  withRetry,
  type FetchLike,
} from './index.js';

const KEY = 'sk-ant-api03-SECRETSECRETSECRET1234567890';

function fakeFetch(responses: { status: number; body?: unknown; headers?: Record<string, string> }[]): FetchLike & { calls: unknown[] } {
  const calls: unknown[] = [];
  const fn = (async (url: string, init?: unknown) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  }) as FetchLike & { calls: unknown[] };
  fn.calls = calls;
  return fn;
}

describe('redaction', () => {
  it('masks env secrets, token patterns and secret-named keys', () => {
    const env = { ANTHROPIC_API_KEY: KEY, BUFFER_ACCESS_TOKEN: 'buf-token-abcdef', RJ_EMERGENCY_STOP: '1' };
    const s = redact(`key ${KEY} and buf-token-abcdef and Bearer abc.def.ghijkl and ?access_token=xyz123&a=1`, [], env);
    expect(s).not.toContain(KEY);
    expect(s).not.toContain('buf-token-abcdef');
    expect(s).not.toContain('abc.def.ghijkl');
    expect(s).not.toContain('xyz123');
    expect(s).toContain('access_token=' + REDACTED);
    expect(redactValue({ apiKey: 'whatever', nested: { authorization: 'x', ok: 'zichtbaar' } }, [], {})).toEqual({
      apiKey: REDACTED,
      nested: { authorization: REDACTED, ok: 'zichtbaar' },
    });
  });
  it('safe logger never writes the secret', () => {
    const lines: string[] = [];
    const log = createSafeLogger('test', (l) => lines.push(l), { ANTHROPIC_API_KEY: KEY });
    log.error(`failed with ${KEY}`, { headers: { 'x-api-key': KEY }, body: `"token":"${KEY}"` });
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).not.toContain('SECRETSECRET');
  });
});

describe('retry', () => {
  it('retries retryable errors with exponential backoff, then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const r = await withRetry(
      async () => {
        if (++n < 3) throw new HttpError(503, 'down');
        return 'ok';
      },
      { baseDelayMs: 100, jitter: 0, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(r).toBe('ok');
    expect(sleeps).toEqual([100, 200]);
  });
  it('does not retry 4xx and gives up after the cap', async () => {
    const fn = vi.fn(async () => {
      throw new HttpError(400, 'bad');
    });
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toThrow('bad');
    expect(fn).toHaveBeenCalledTimes(1);
    const fn2 = vi.fn(async () => {
      throw new HttpError(500, 'x');
    });
    await expect(withRetry(fn2, { retries: 2, sleep: async () => {} })).rejects.toThrow();
    expect(fn2).toHaveBeenCalledTimes(3);
  });
  it('honours Retry-After on rate limits (capped)', async () => {
    const sleeps: number[] = [];
    let n = 0;
    await withRetry(
      async () => {
        if (n++ === 0) throw new RateLimitError('429', 5_000);
        return 1;
      },
      { baseDelayMs: 100, jitter: 0, maxDelayMs: 60_000, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps).toEqual([5_000]);
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(backoffDelay(10, { baseDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: 0 })).toBe(1000);
  });
});

describe('adapters', () => {
  it('without env everything is mock, configured false, labelled mock', () => {
    const st = getProviderStatuses({ env: {} });
    expect(st.map((s) => s.id)).toEqual(['anthropic', 'buffer', 'n8n', 'google-sheets']);
    for (const s of st) {
      expect(s.configured).toBe(false);
      expect(s.mode).toBe('mock');
      expect(s.note).toMatch(/^mock/);
    }
  });
  it('status never contains secret values', () => {
    const env = { ANTHROPIC_API_KEY: KEY, BUFFER_ACCESS_TOKEN: 'buf-token-abcdef', N8N_WEBHOOK_URL: 'https://n8n.example.com/webhook/secret-path' };
    const json = JSON.stringify(getProviderStatuses({ env }));
    expect(json).not.toContain(KEY);
    expect(json).not.toContain('buf-token-abcdef');
    expect(json).not.toContain('secret-path');
    expect(getProviderStatuses({ env }).find((s) => s.id === 'anthropic')!.configured).toBe(true);
  });
  it('configured but live not enabled stays mock; live requires RJ_INTEGRATIONS_LIVE=1', () => {
    expect(new AnthropicAdapter({ env: { ANTHROPIC_API_KEY: KEY } }).status().mode).toBe('mock');
    expect(new AnthropicAdapter({ env: { ANTHROPIC_API_KEY: KEY, RJ_INTEGRATIONS_LIVE: '1' } }).status().mode).toBe('live');
    expect(new AnthropicAdapter({ env: {}, mode: 'live' }).status().mode).toBe('disabled');
  });
  it('validates config by name only', () => {
    const v = new AnthropicAdapter({ env: { ANTHROPIC_API_KEY: 'wrong-format' } }).validateConfig();
    expect(v.ok).toBe(false);
    expect(JSON.stringify(v)).not.toContain('wrong-format');
    expect(new N8nAdapter({ env: { N8N_WEBHOOK_URL: 'http://x' } }).validateConfig().ok).toBe(false);
    expect(new GoogleSheetsAdapter({ env: { GOOGLE_SERVICE_ACCOUNT_JSON: '{}', RJ_SHEETS_SPREADSHEET_ID: 'x' } }).validateConfig().ok).toBe(false);
  });
  it('mock outputs are labelled', async () => {
    const llm = new AnthropicAdapter({ env: {} });
    const r = await llm.complete({ prompt: 'hoi' });
    expect(r.mode).toBe('mock');
    expect(r.text).toMatch(/MOCK/);
    expect(r.inputTokens).toBeNull();
    expect((await new BufferAdapter({ env: {} }).schedulePost({ profileId: 'p', text: 't', mediaUrl: 'u', scheduledAt: 'x' })).id).toMatch(/^mock_/);
    expect((await new N8nAdapter({ env: {} }).trigger('e', {})).mode).toBe('mock');
    expect((await llm.testConnection()).tested).toBe(false);
  });
  it('live test failure records a redacted lastError', async () => {
    const env = { ANTHROPIC_API_KEY: KEY, RJ_INTEGRATIONS_LIVE: '1' };
    const fetch = (async () => {
      throw new Error(`connect failed for key ${KEY}`);
    }) as unknown as FetchLike;
    const a = new AnthropicAdapter({ env, fetch });
    const t = await a.testConnection();
    expect(t.ok).toBe(false);
    expect(a.status().lastError).not.toContain(KEY);
    expect(a.status().lastError).toContain(REDACTED);
  });
  it('live completion retries on 429 then parses the response', async () => {
    const env = { ANTHROPIC_API_KEY: KEY, RJ_INTEGRATIONS_LIVE: '1' };
    const fetch = fakeFetch([
      { status: 429, headers: { 'retry-after': '0' } },
      { status: 200, body: { content: [{ type: 'text', text: 'Hallo' }], usage: { input_tokens: 3, output_tokens: 1 } } },
    ]);
    const r = await new AnthropicAdapter({ env, fetch }).complete({ prompt: 'x' });
    expect(r).toMatchObject({ text: 'Hallo', mode: 'live', inputTokens: 3 });
    expect(fetch.calls).toHaveLength(2);
  });
  it('buffer live scheduling is a stub that refuses', async () => {
    const b = new BufferAdapter({ env: { BUFFER_ACCESS_TOKEN: 'tok-123456', RJ_INTEGRATIONS_LIVE: '1' } });
    await expect(b.schedulePost({ profileId: 'p', text: 't', mediaUrl: 'u', scheduledAt: 'x' })).rejects.toThrow(/stub/);
  });
});
