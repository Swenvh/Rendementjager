import type { AdapterContext, ConnectionTest } from '../types.js';
import { BaseAdapter } from './base.js';

/*
 * Google Sheets (content calendar / metrics export). Needs a Google Cloud service account
 * (GOOGLE_SERVICE_ACCOUNT_JSON, base64 or raw JSON) with the Sheets API enabled and the sheet
 * shared with the service-account email, plus RJ_SHEETS_SPREADSHEET_ID. No app review is needed
 * for a service account on sheets you own. Live calls need a signed JWT (not implemented yet:
 * stub-live); in Claude Code sessions the Google Sheets MCP can be used instead.
 */
export class GoogleSheetsAdapter extends BaseAdapter {
  constructor(ctx: AdapterContext = {}) {
    super(
      {
        id: 'google-sheets',
        kind: 'spreadsheet',
        requiredEnv: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'RJ_SHEETS_SPREADSHEET_ID'],
        validate: (env) => {
          const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON!.trim();
          try {
            const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as Record<string, unknown>;
            return json.client_email && json.private_key ? [] : ['GOOGLE_SERVICE_ACCOUNT_JSON mist client_email/private_key'];
          } catch {
            return ['GOOGLE_SERVICE_ACCOUNT_JSON is geen geldige JSON'];
          }
        },
      },
      ctx,
    );
  }

  protected async liveTest(): Promise<ConnectionTest> {
    return { ok: false, mode: 'live', tested: false, message: 'stub-live: Sheets API-aanroep nog niet geïmplementeerd' };
  }

  /** Mock returns the rows it would have written; live is a stub. */
  async appendRows(range: string, rows: unknown[][]): Promise<{ mode: 'live' | 'mock'; range: string; rowCount: number }> {
    if (this.mode !== 'live') return { mode: 'mock', range, rowCount: rows.length };
    throw new Error(this.recordError(new Error('google-sheets live append is a stub')));
  }
}
