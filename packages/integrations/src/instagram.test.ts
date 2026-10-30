import { describe, expect, it } from 'vitest';
import { InstagramGraphAdapter, PublishAmbiguousError, REDACTED, assertPublicHttpsUrl, type FetchLike } from './index.js';

const TOKEN = 'IGAAtokenSECRET1234567890abcdefXYZ';
const ENV = { INSTAGRAM_USER_ID: '17841400000000000', INSTAGRAM_ACCESS_TOKEN: TOKEN, RJ_INTEGRATIONS_LIVE: '1' };
const REQ = { videoUrl: 'https://media.example.com/reel.mp4', caption: 'Hallo #beleggen', ownerConfirmed: true as const };

type Resp = { status: number; body?: unknown; headers?: Record<string, string> };
/** Mock transport: queue of responses, records every call. */
function mockTransport(responses: Resp[]) {
  const calls: { url: string; method?: string; headers?: Record<string, string>; body?: string }[] = [];
  const fn = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, ...init });
    const r = responses.shift() ?? { status: 500, body: { error: { message: 'queue empty' } } };
    return { ok: r.status < 300, status: r.status, headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null }, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  }) as FetchLike;
  return { fn, calls };
}
const fast = { sleep: async () => {}, pollIntervalMs: 0, retry: { baseDelayMs: 1, jitter: 0 } };

describe('InstagramGraphAdapter config', () => {
  it('is mock by default, disabled/invalid config is reported by name only', () => {
    expect(new InstagramGraphAdapter({ env: {} }).status().mode).toBe('mock');
    expect(new InstagramGraphAdapter({ env: {} }).validateConfig().missing).toEqual(['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN']);
    const bad = new InstagramGraphAdapter({ env: { INSTAGRAM_USER_ID: 'abc', INSTAGRAM_ACCESS_TOKEN: 'zq9x' } }).validateConfig();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain('zq9x');
    expect(new InstagramGraphAdapter({ env: { ...ENV, INSTAGRAM_API_HOST: 'evil.example.com' } }).validateConfig().ok).toBe(false);
  });
  it('configured but without RJ_INTEGRATIONS_LIVE stays mock and makes no network call', async () => {
    const t = mockTransport([]);
    const a = new InstagramGraphAdapter({ env: { ...ENV, RJ_INTEGRATIONS_LIVE: '' }, fetch: t.fn }, fast);
    expect(a.status().mode).toBe('mock');
    const r = await a.publishReel(REQ);
    expect(r.mode).toBe('mock');
    expect(t.calls).toHaveLength(0);
    expect((await a.testConnection()).tested).toBe(false);
  });
  it('refuses without ownerConfirmed, with trial params, and non-public URLs', async () => {
    const a = new InstagramGraphAdapter({ env: ENV, fetch: mockTransport([]).fn }, fast);
    await expect(a.publishReel({ ...REQ, ownerConfirmed: false as never })).rejects.toThrow(/ownerConfirmed/);
    await expect(a.publishReel({ ...REQ, trial: true as never })).rejects.toThrow(/trial/);
    for (const u of ['http://x.example.com/a.mp4', 'https://localhost/a.mp4', 'https://169.254.169.254/a.mp4', 'https://u:p@x.example.com/a.mp4', 'file:///etc/passwd', 'https://[::1]/a.mp4', 'https://intranet/a.mp4'])
      expect(() => assertPublicHttpsUrl(u)).toThrow();
    expect(() => assertPublicHttpsUrl('https://media.example.com/a.mp4')).not.toThrow();
  });
});

describe('InstagramGraphAdapter live flow (mock transport only; real Meta API untested)', () => {
  it('connection test is read-only and keeps the token out of the URL', async () => {
    const t = mockTransport([{ status: 200, body: { id: '1', username: 'rendementjager' } }]);
    const r = await new InstagramGraphAdapter({ env: ENV, fetch: t.fn }, fast).testConnection();
    expect(r.ok).toBe(true);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.method).toBe('GET');
    expect(t.calls[0]!.url).not.toContain(TOKEN);
    expect(t.calls[0]!.headers!.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('happy path: container REELS -> poll -> publish -> permalink', async () => {
    const t = mockTransport([
      { status: 200, body: { id: 'c1' } },
      { status: 200, body: { status_code: 'IN_PROGRESS' } },
      { status: 200, body: { status_code: 'FINISHED' } },
      { status: 200, body: { id: 'm1' } },
      { status: 200, body: { permalink: 'https://www.instagram.com/reel/ABC123/' } },
    ]);
    const r = await new InstagramGraphAdapter({ env: ENV, fetch: t.fn }, fast).publishReel(REQ);
    expect(r).toEqual({ mode: 'live', containerId: 'c1', mediaId: 'm1', permalink: 'https://www.instagram.com/reel/ABC123/' });
    expect(t.calls[0]!.url).toMatch(/\/17841400000000000\/media$/);
    expect(t.calls[0]!.body).toContain('media_type=REELS');
    expect(t.calls[0]!.body).toContain('video_url=https%3A%2F%2Fmedia.example.com%2Freel.mp4');
    expect(t.calls[3]!.url).toMatch(/media_publish$/);
    expect(t.calls[3]!.body).toBe('creation_id=c1');
    for (const c of t.calls) expect(c.url + (c.body ?? '')).not.toContain(TOKEN);
  });

  it('retries container creation on 500 and on rate limit, honouring backoff', async () => {
    const t = mockTransport([
      { status: 500, body: { error: { message: 'boom' } } },
      { status: 400, body: { error: { code: 4, message: 'too many calls' } }, headers: { 'retry-after': '1' } },
      { status: 200, body: { id: 'c1' } },
      { status: 200, body: { status_code: 'FINISHED' } },
      { status: 200, body: { id: 'm1' } },
      { status: 500 },
    ]);
    const r = await new InstagramGraphAdapter({ env: ENV, fetch: t.fn }, fast).publishReel(REQ);
    expect(r.mediaId).toBe('m1');
    expect(r.permalink).toBeNull();
    expect(t.calls.filter((c) => c.url.endsWith('/media'))).toHaveLength(3);
  });

  it('never retries media_publish after an ambiguous 5xx (no double post)', async () => {
    const t = mockTransport([
      { status: 200, body: { id: 'c1' } },
      { status: 200, body: { status_code: 'FINISHED' } },
      { status: 503, body: { error: { message: 'unavailable' } } },
      { status: 200, body: { id: 'm1' } },
    ]);
    await expect(new InstagramGraphAdapter({ env: ENV, fetch: t.fn }, fast).publishReel(REQ)).rejects.toBeInstanceOf(PublishAmbiguousError);
    expect(t.calls.filter((c) => c.url.endsWith('/media_publish'))).toHaveLength(1);
  });

  it('container ERROR and processing timeout publish nothing', async () => {
    const t1 = mockTransport([{ status: 200, body: { id: 'c1' } }, { status: 200, body: { status_code: 'ERROR', status: 'Error: bad video' } }]);
    await expect(new InstagramGraphAdapter({ env: ENV, fetch: t1.fn }, fast).publishReel(REQ)).rejects.toThrow(/ERROR/);
    expect(t1.calls.some((c) => c.url.endsWith('media_publish'))).toBe(false);
    const t2 = mockTransport([{ status: 200, body: { id: 'c1' } }, ...Array.from({ length: 3 }, () => ({ status: 200, body: { status_code: 'IN_PROGRESS' } }))]);
    await expect(new InstagramGraphAdapter({ env: ENV, fetch: t2.fn }, { ...fast, maxPolls: 3 }).publishReel(REQ)).rejects.toThrow(/not FINISHED/);
    expect(t2.calls.some((c) => c.url.endsWith('media_publish'))).toBe(false);
  });

  it('expired token is not retried and the token never appears in errors or lastError', async () => {
    const t = mockTransport([{ status: 400, body: { error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } } }]);
    const a = new InstagramGraphAdapter({ env: ENV, fetch: t.fn }, fast);
    const err = await a.publishReel(REQ).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(TOKEN);
    expect((err as Error).message).toContain(REDACTED);
    expect(t.calls).toHaveLength(1);
    expect(a.status().lastError ?? '').not.toContain(TOKEN);
    expect(JSON.stringify(a.status())).not.toContain(TOKEN);
  });
});
