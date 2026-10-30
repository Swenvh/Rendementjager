import { newId } from '@rj/shared';
import { assertOk } from '../retry.js';
import type { AdapterContext, ConnectionTest } from '../types.js';
import { BaseAdapter } from './base.js';

/*
 * Buffer (scheduling). Platform notes (code comments only; docs/INTEGRATIONS.md is owned by org-docs):
 * - Instagram via Buffer requires an Instagram Business or Creator account linked to a Facebook
 *   Page; personal accounts cannot auto-publish Reels (Buffer then sends a reminder notification).
 * - TikTok auto-publishing via Buffer needs a TikTok Business account; personal accounts get
 *   reminders only. YouTube Shorts needs a YouTube channel connected with upload scope.
 * - Buffer's legacy v1 REST API (access_token) is closed to new developer apps; new integrations
 *   may need Buffer's newer API access. Treat live mode as "stub-live" until verified by the owner.
 * - Never called without a valid G5 (enforced by @rj/content-engine schedulePublication()).
 */
export interface SchedulePostRequest {
  profileId: string;
  text: string;
  mediaUrl: string;
  scheduledAt: string;
}

export interface SchedulePostResult {
  id: string;
  mode: 'live' | 'mock';
  scheduledAt: string;
}

export class BufferAdapter extends BaseAdapter {
  constructor(ctx: AdapterContext = {}) {
    super({ id: 'buffer', kind: 'scheduler', requiredEnv: ['BUFFER_ACCESS_TOKEN'] }, ctx);
  }

  protected async liveTest(): Promise<ConnectionTest> {
    // Read-only profile lookup. Token goes in a header, never in a logged URL.
    const res = await this.requireFetch()('https://api.bufferapp.com/1/profiles.json', {
      headers: { Authorization: `Bearer ${this.env.BUFFER_ACCESS_TOKEN!}` },
    });
    assertOk(res, 'buffer profiles');
    return { ok: true, mode: 'live', tested: true, message: 'verbonden' };
  }

  /** Mock: records nothing externally and returns a "mock_" id. Live: not implemented (stub). */
  async schedulePost(req: SchedulePostRequest): Promise<SchedulePostResult> {
    if (this.mode !== 'live') return { id: `mock_${newId()}`, mode: 'mock', scheduledAt: req.scheduledAt };
    throw new Error(this.recordError(new Error('buffer live scheduling is a stub: not enabled until the owner verifies the account type and API access')));
  }
}
