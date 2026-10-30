import { newId } from '@rj/shared';
import { assertOk, withRetry } from '../retry.js';
import type { AdapterContext, ConnectionTest } from '../types.js';
import { BaseAdapter } from './base.js';

/*
 * n8n webhook trigger. The webhook URL itself is a secret (anyone with it can trigger the flow),
 * so it is redacted from logs. testConnection() does NOT call the webhook (that would run the
 * workflow); it only validates the URL shape. Self-hosted n8n or n8n Cloud both work.
 */
export class N8nAdapter extends BaseAdapter {
  constructor(ctx: AdapterContext = {}) {
    super(
      {
        id: 'n8n',
        kind: 'automation',
        requiredEnv: ['N8N_WEBHOOK_URL'],
        validate: (env) => {
          try {
            const u = new URL(env.N8N_WEBHOOK_URL!);
            return u.protocol === 'https:' ? [] : ['N8N_WEBHOOK_URL moet https gebruiken'];
          } catch {
            return ['N8N_WEBHOOK_URL is geen geldige URL'];
          }
        },
      },
      ctx,
    );
  }

  protected async liveTest(): Promise<ConnectionTest> {
    return { ok: true, mode: 'live', tested: false, message: 'URL geldig; webhook niet aangeroepen (zou de workflow starten)' };
  }

  async trigger(event: string, payload: Record<string, unknown>): Promise<{ id: string; mode: 'live' | 'mock' }> {
    if (this.mode !== 'live') return { id: `mock_${newId()}`, mode: 'mock' };
    try {
      await withRetry(async () => {
        const res = await this.requireFetch()(this.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event, payload }),
        });
        assertOk(res, 'n8n webhook');
      });
      return { id: newId('n8n'), mode: 'live' };
    } catch (err) {
      throw new Error(this.recordError(err));
    }
  }
}
