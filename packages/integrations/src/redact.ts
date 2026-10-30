/**
 * Secret redaction. Every log line / error / status that might contain provider data goes
 * through `redact()` first. Secrets are taken from env keys that look secret, plus common
 * token patterns, so even unknown keys are masked.
 */

export const REDACTED = '[REDACTED]';

const SECRET_KEY = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|WEBHOOK|CREDENTIAL|AUTH)/i;

const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /sk-[A-Za-z0-9_-]{16,}/g, // generic "sk-" keys
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:access_token|api_key|apikey|token|key|secret|password)=)[^&\s"']+/gi,
  /("(?:access_token|api_key|apiKey|token|secret|password|authorization|x-api-key)"\s*:\s*")[^"]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Values of env vars whose NAME looks secret (length >= 6, to avoid masking "1"/"true"). */
export function secretValuesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(env)
    .filter(([k, v]) => SECRET_KEY.test(k) && typeof v === 'string' && v.length >= 6)
    .map(([, v]) => v as string)
    .sort((a, b) => b.length - a.length);
}

export function redact(input: string, extraSecrets: readonly string[] = [], env: NodeJS.ProcessEnv = process.env): string {
  let out = input;
  for (const s of [...extraSecrets, ...secretValuesFromEnv(env)]) if (s) out = out.split(s).join(REDACTED);
  for (const p of PATTERNS) {
    out = out.replace(p, (m, prefix?: string) => (typeof prefix === 'string' && m.startsWith(prefix) ? `${prefix}${REDACTED}` : REDACTED));
  }
  return out;
}

/** Deep-redacts any value (objects with secret-looking keys are masked entirely). */
export function redactValue(value: unknown, extraSecrets: readonly string[] = [], env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === 'string') return redact(value, extraSecrets, env);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, extraSecrets, env));
  if (value instanceof Error) return redact(`${value.name}: ${value.message}`, extraSecrets, env);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) && v ? REDACTED : redactValue(v, extraSecrets, env);
    return out;
  }
  return value;
}

export interface SafeLogger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/** Console logger that redacts every message and payload. */
export function createSafeLogger(scope: string, sink: (line: string) => void = (l) => console.error(l), env: NodeJS.ProcessEnv = process.env): SafeLogger {
  const write = (level: string, msg: string, data?: unknown) =>
    sink(redact(`[${level}] ${scope}: ${msg}${data === undefined ? '' : ` ${JSON.stringify(redactValue(data, [], env))}`}`, [], env));
  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}
