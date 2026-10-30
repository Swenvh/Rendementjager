export type ProviderKind = 'llm' | 'scheduler' | 'automation' | 'spreadsheet';
export type ProviderMode = 'live' | 'mock' | 'disabled';

export interface ProviderStatus {
  id: string;
  kind: ProviderKind;
  /** true when the required env vars are present. Never contains the values. */
  configured: boolean;
  mode: ProviderMode;
  /** Redacted. */
  lastError: string | null;
  /** Short human note, e.g. "mock: geen ANTHROPIC_API_KEY". */
  note: string;
}

export interface ConfigValidation {
  ok: boolean;
  /** Names of missing/invalid env vars (names only, never values). */
  missing: string[];
  problems: string[];
}

export interface ConnectionTest {
  ok: boolean;
  mode: ProviderMode;
  /** null when the provider cannot be tested without side effects. */
  tested: boolean;
  message: string;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly kind: ProviderKind;
  validateConfig(): ConfigValidation;
  testConnection(): Promise<ConnectionTest>;
  status(): ProviderStatus;
}

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface AdapterContext {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  /** Force a mode; default: 'live' if configured and RJ_INTEGRATIONS_LIVE=1, else 'mock'. */
  mode?: ProviderMode;
}
