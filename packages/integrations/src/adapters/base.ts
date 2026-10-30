import { redact } from '../redact.js';
import type { AdapterContext, ConfigValidation, ConnectionTest, FetchLike, ProviderAdapter, ProviderKind, ProviderMode, ProviderStatus } from '../types.js';

export interface BaseSpec {
  id: string;
  kind: ProviderKind;
  requiredEnv: readonly string[];
  /** Extra validation of present values (return problem strings; never include the value). */
  validate?: (env: NodeJS.ProcessEnv) => string[];
}

/**
 * Shared behaviour: mode resolution, config validation by env NAME, redacted lastError.
 * Live mode is opt-in: configured AND RJ_INTEGRATIONS_LIVE=1 (or ctx.mode = 'live').
 * Paid/publishing actions are never triggered by `testConnection()`.
 */
export abstract class BaseAdapter implements ProviderAdapter {
  readonly id: string;
  readonly kind: ProviderKind;
  protected readonly env: NodeJS.ProcessEnv;
  protected readonly fetchImpl: FetchLike | undefined;
  protected lastError: string | null = null;
  private readonly forcedMode: ProviderMode | undefined;

  constructor(
    protected readonly spec: BaseSpec,
    ctx: AdapterContext = {},
  ) {
    this.id = spec.id;
    this.kind = spec.kind;
    this.env = ctx.env ?? process.env;
    this.fetchImpl = ctx.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    this.forcedMode = ctx.mode;
  }

  validateConfig(): ConfigValidation {
    const missing = this.spec.requiredEnv.filter((k) => !this.env[k] || this.env[k]!.trim() === '');
    const problems = missing.length === 0 ? (this.spec.validate?.(this.env) ?? []) : [];
    return { ok: missing.length === 0 && problems.length === 0, missing: [...missing], problems };
  }

  get mode(): ProviderMode {
    if (this.forcedMode === 'disabled' || this.forcedMode === 'mock') return this.forcedMode;
    const configured = this.validateConfig().ok;
    if (this.forcedMode === 'live') return configured ? 'live' : 'disabled';
    return configured && this.env.RJ_INTEGRATIONS_LIVE === '1' ? 'live' : 'mock';
  }

  protected recordError(err: unknown): string {
    const msg = redact(err instanceof Error ? err.message : String(err), [], this.env);
    this.lastError = msg;
    return msg;
  }

  protected abstract liveTest(): Promise<ConnectionTest>;

  async testConnection(): Promise<ConnectionTest> {
    const mode = this.mode;
    if (mode === 'mock') return { ok: true, mode, tested: false, message: 'mock: geen live verbinding getest' };
    if (mode === 'disabled') return { ok: false, mode, tested: false, message: `disabled: ${this.validateConfig().missing.join(', ') || 'uitgeschakeld'}` };
    try {
      const r = await this.liveTest();
      if (r.ok) this.lastError = null;
      return r;
    } catch (err) {
      return { ok: false, mode, tested: true, message: this.recordError(err) };
    }
  }

  status(): ProviderStatus {
    const v = this.validateConfig();
    const mode = this.mode;
    const note =
      mode === 'live'
        ? 'live'
        : mode === 'mock'
          ? v.ok
            ? 'mock: geconfigureerd, live staat uit (RJ_INTEGRATIONS_LIVE=1 om aan te zetten)'
            : `mock: ontbreekt ${v.missing.join(', ')}`
          : 'disabled';
    return { id: this.id, kind: this.kind, configured: v.ok, mode, lastError: this.lastError, note };
  }

  protected requireFetch(): FetchLike {
    if (!this.fetchImpl) throw new Error('fetch is not available in this runtime');
    return this.fetchImpl;
  }
}
