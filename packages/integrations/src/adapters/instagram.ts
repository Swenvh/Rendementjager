import { newId } from '@rj/shared';
import { redact } from '../redact.js';
import { HttpError, RateLimitError, parseRetryAfter, withRetry, type RetryOptions } from '../retry.js';
import type { AdapterContext, ConnectionTest } from '../types.js';
import { BaseAdapter } from './base.js';

/*
 * Instagram Reels publishing (Graph API "content publishing" flow):
 *   1. POST /{ig-user-id}/media         media_type=REELS, video_url, caption   -> container id
 *   2. GET  /{container-id}?fields=status_code                                  -> poll until FINISHED
 *   3. POST /{ig-user-id}/media_publish creation_id={container-id}              -> media id
 *   4. GET  /{media-id}?fields=permalink                                        -> post URL
 *
 * HONESTY NOTES (read before enabling):
 * - STATUS: LIVE CALLS ARE UNTESTED. graph.facebook.com / graph.instagram.com and developers.facebook.com
 *   were not reachable from the build sandbox, so endpoint names, field names, status values, error codes,
 *   quotas and permission names below come from memory of Meta's documentation and MUST be verified
 *   against the current official docs (developers.facebook.com, "Instagram Platform > Content Publishing")
 *   before the owner enables this. Everything is exercised only against a mock transport in tests.
 * - Requires an Instagram professional account (Business or Creator), a Meta developer app, and
 *   permissions that may need Meta App Review (and possibly Business Verification) before they work for
 *   accounts that are not your own app's testers. Which permission names apply depends on the login flow
 *   (Instagram Login vs Facebook Login): verify.
 * - The API fetches the video from a PUBLIC HTTPS URL (video_url). Meta must be able to download it, so
 *   a hosting step is required; this repo has none. Local file paths cannot be sent. (A resumable upload
 *   flow with rupload.facebook.com exists according to Meta docs; not implemented, unverified.)
 * - Quota: Meta documents a limit on API-published posts per rolling 24 h (a number I do not assume);
 *   `getPublishingLimit()` asks the API for the current usage. Our own cap (RJ_DAILY_PUBLISH_CAP) is
 *   enforced by the publisher, independent of Meta's.
 * - "Trial reels" (shown first to non-followers): whether and how they can be set through the API is
 *   NOT verified; this adapter refuses to send any trial parameter.
 * - Access token: long-lived token from env INSTAGRAM_ACCESS_TOKEN, sent as an Authorization: Bearer header
 *   (never in a URL, never logged). Long-lived tokens expire (documented as ~60 days) and must be refreshed
 *   by the owner; token refresh is not automated here.
 * - Publishing is never triggered by testConnection(); publishReel() additionally requires
 *   `ownerConfirmed: true` and RJ_INTEGRATIONS_LIVE=1 and credentials. The caller (publisher) must have
 *   verified G5 for the exact video hash + caption hash before calling.
 */

const ALLOWED_HOSTS = ['graph.facebook.com', 'graph.instagram.com'] as const;
/** Meta Graph error codes that mean "rate limited / too many calls" (from memory; verify). */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004, 80006]);
/** Meta Graph error codes that mean the token is invalid/expired (never retried). */
const AUTH_CODES = new Set([102, 190]);

/** media_publish failed ambiguously (5xx/timeout): the post MAY exist. Callers must not retry; check Instagram. */
export class PublishAmbiguousError extends Error {
  constructor(
    message: string,
    readonly containerId: string,
  ) {
    super(message);
    this.name = 'PublishAmbiguousError';
  }
}

export interface PublishReelRequest {
  /** Public HTTPS URL of the exact MP4 that was approved. */
  videoUrl: string;
  caption: string;
  coverUrl?: string;
  shareToFeed?: boolean;
  /** Must be true: the explicit owner action that allows a live post. */
  ownerConfirmed: boolean;
  /** Trial reels are not supported (API support unverified). */
  trial?: false;
}

export interface PublishReelResult {
  mode: 'live' | 'mock';
  containerId: string;
  mediaId: string;
  permalink: string | null;
}

export interface InstagramOptions {
  retry?: RetryOptions;
  /** Delay between status polls and their maximum number. */
  pollIntervalMs?: number;
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true; // bare IPv4 literal: refuse (public hosting needs a name)
  if (h.includes(':')) return true; // IPv6 literal
  return !h.includes('.');
}

/** Throws unless the URL is https, has no credentials and a public-looking host name. */
export function assertPublicHttpsUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('videoUrl is not a valid URL');
  }
  if (u.protocol !== 'https:') throw new Error('videoUrl must be https');
  if (u.username || u.password) throw new Error('videoUrl must not contain credentials');
  if (isPrivateHost(u.hostname)) throw new Error('videoUrl must be a public host name (no localhost, IP literal or internal name)');
  return u;
}

export class InstagramGraphAdapter extends BaseAdapter {
  private readonly opts: Required<Pick<InstagramOptions, 'pollIntervalMs' | 'maxPolls'>> & InstagramOptions;

  constructor(ctx: AdapterContext = {}, options: InstagramOptions = {}) {
    super(
      {
        id: 'instagram',
        kind: 'scheduler',
        requiredEnv: ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN'],
        validate: (env) => {
          const p: string[] = [];
          if (!/^\d{5,25}$/.test(env.INSTAGRAM_USER_ID ?? '')) p.push('INSTAGRAM_USER_ID must be the numeric Instagram user id');
          const t = env.INSTAGRAM_ACCESS_TOKEN ?? '';
          if (t.length < 20 || /\s/.test(t)) p.push('INSTAGRAM_ACCESS_TOKEN looks invalid (too short or contains whitespace)');
          const host = env.INSTAGRAM_API_HOST;
          if (host && !(ALLOWED_HOSTS as readonly string[]).includes(host)) p.push(`INSTAGRAM_API_HOST must be one of ${ALLOWED_HOSTS.join(', ')}`);
          const v = env.INSTAGRAM_API_VERSION;
          if (v && !/^v\d{1,2}\.\d$/.test(v)) p.push('INSTAGRAM_API_VERSION must look like v21.0');
          return p;
        },
      },
      ctx,
    );
    this.opts = { pollIntervalMs: 5000, maxPolls: 60, ...options };
  }

  private get base(): string {
    const host = this.env.INSTAGRAM_API_HOST || 'graph.facebook.com';
    const version = this.env.INSTAGRAM_API_VERSION || 'v21.0'; // placeholder default: verify the current version
    return `https://${host}/${version}`;
  }

  private secrets(): string[] {
    return [this.env.INSTAGRAM_ACCESS_TOKEN ?? ''].filter(Boolean);
  }

  private clean(s: string): string {
    return redact(s, this.secrets(), this.env);
  }

  private sleep(ms: number): Promise<void> {
    return (this.opts.sleep ?? ((m: number) => new Promise<void>((r) => setTimeout(r, m))))(ms);
  }

  /** One Graph call. Token only in the Authorization header. Maps errors to HttpError/RateLimitError (redacted). */
  private async call(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const f = this.requireFetch();
    const headers: Record<string, string> = { Authorization: `Bearer ${this.env.INSTAGRAM_ACCESS_TOKEN!}` };
    let url = `${this.base}${path}`;
    let body: string | undefined;
    const qs = new URLSearchParams(params).toString();
    if (method === 'GET') {
      if (qs) url += `?${qs}`;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = qs;
    }
    const res = await f(url, { method, headers, body, signal: AbortSignal.timeout(30_000) });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    if (res.ok) return json;
    const err = (json.error ?? {}) as { message?: string; code?: number; type?: string };
    const msg = this.clean(`instagram ${method} ${path.replace(/\d{6,}/g, '<id>')}: HTTP ${res.status}${err.code ? ` code ${err.code}` : ''}${err.message ? ` ${err.message}` : ''}`);
    if (res.status === 429 || (err.code !== undefined && RATE_LIMIT_CODES.has(err.code))) throw new RateLimitError(msg, parseRetryAfter(res.headers.get('retry-after')));
    if (err.code !== undefined && AUTH_CODES.has(err.code)) throw new HttpError(401, `${msg} (token invalid or expired: the owner must create a new long-lived token)`);
    throw new HttpError(res.status, msg);
  }

  protected async liveTest(): Promise<ConnectionTest> {
    const r = await withRetry(() => this.call('GET', `/${this.env.INSTAGRAM_USER_ID!}`, { fields: 'id,username' }), { retries: 1, ...this.opts.retry, sleep: this.opts.sleep });
    return { ok: true, mode: 'live', tested: true, message: `verbonden${typeof r.username === 'string' ? ` als @${this.clean(r.username)}` : ''}` };
  }

  /** Current API publishing usage (field names unverified). Read-only. */
  async getPublishingLimit(): Promise<{ quotaUsage: number | null; quotaTotal: number | null }> {
    if (this.mode !== 'live') return { quotaUsage: null, quotaTotal: null };
    const r = await withRetry(() => this.call('GET', `/${this.env.INSTAGRAM_USER_ID!}/content_publishing_limit`, { fields: 'quota_usage,config' }), { ...this.opts.retry, sleep: this.opts.sleep });
    const row = (Array.isArray(r.data) ? r.data[0] : undefined) as { quota_usage?: number; config?: { quota_total?: number } } | undefined;
    return { quotaUsage: row?.quota_usage ?? null, quotaTotal: row?.config?.quota_total ?? null };
  }

  /**
   * Mock mode: returns `mock_` ids, no network. Live mode: container -> poll -> publish -> permalink.
   * Retries: container creation and polls retry on rate limits/5xx; `media_publish` is retried ONLY on
   * explicit rate-limit answers (a 5xx or timeout there is ambiguous: the post may exist, so we stop and
   * let the operator check Instagram instead of risking a double post).
   */
  async publishReel(req: PublishReelRequest): Promise<PublishReelResult> {
    if ((req as { trial?: unknown }).trial) throw new Error('trial reels are not supported by this adapter (API support unverified)');
    if (req.ownerConfirmed !== true) throw new Error('publishReel requires ownerConfirmed: true (explicit owner action)');
    if (!req.caption.trim()) throw new Error('caption is empty');
    if (req.caption.length > 2200) throw new Error('caption exceeds 2200 characters');
    assertPublicHttpsUrl(req.videoUrl);
    if (req.coverUrl) assertPublicHttpsUrl(req.coverUrl);
    if (this.mode !== 'live') return { mode: 'mock', containerId: `mock_container_${newId()}`, mediaId: `mock_media_${newId()}`, permalink: null };
    try {
      const uid = this.env.INSTAGRAM_USER_ID!;
      const retry = { ...this.opts.retry, sleep: this.opts.sleep };
      const params: Record<string, string> = { media_type: 'REELS', video_url: req.videoUrl, caption: req.caption, share_to_feed: String(req.shareToFeed ?? true) };
      if (req.coverUrl) params.cover_url = req.coverUrl;
      const created = await withRetry(() => this.call('POST', `/${uid}/media`, params), retry);
      const containerId = String(created.id ?? '');
      if (!containerId) throw new Error('instagram: no container id in response');

      let finished = false;
      for (let i = 0; i < this.opts.maxPolls; i++) {
        const st = await withRetry(() => this.call('GET', `/${containerId}`, { fields: 'status_code,status' }), retry);
        const code = String(st.status_code ?? '');
        if (code === 'FINISHED') {
          finished = true;
          break;
        }
        if (code === 'ERROR' || code === 'EXPIRED') throw new Error(this.clean(`instagram container ${code}${typeof st.status === 'string' ? `: ${st.status}` : ''}`));
        await this.sleep(this.opts.pollIntervalMs);
      }
      if (!finished) throw new Error('instagram container not FINISHED in time (video still processing); nothing was published');

      let published: Record<string, unknown>;
      try {
        published = await withRetry(() => this.call('POST', `/${uid}/media_publish`, { creation_id: containerId }), {
          ...retry,
          isRetryable: (e) => e instanceof RateLimitError,
        });
      } catch (e) {
        // Definite client errors (4xx other than rate limit) mean nothing was published; anything else is ambiguous.
        const definite = e instanceof HttpError && e.status >= 400 && e.status < 500;
        if (definite || e instanceof RateLimitError) throw e;
        throw new PublishAmbiguousError(this.clean(`${(e as Error).message} (media_publish outcome unknown: check Instagram before retrying)`), containerId);
      }
      const mediaId = String(published.id ?? '');
      if (!mediaId) throw new Error('instagram: no media id in response');
      let permalink: string | null = null;
      try {
        const m = await this.call('GET', `/${mediaId}`, { fields: 'permalink' });
        permalink = typeof m.permalink === 'string' ? m.permalink : null;
      } catch {
        /* the post exists; the URL can be filled in later */
      }
      this.lastError = null;
      return { mode: 'live', containerId, mediaId, permalink };
    } catch (err) {
      const msg = this.recordError(err);
      if (err instanceof PublishAmbiguousError) throw new PublishAmbiguousError(msg, err.containerId);
      throw new Error(msg);
    }
  }
}
