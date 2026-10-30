export * from './types.js';
export * from './redact.js';
export * from './retry.js';
export * from './adapters/base.js';
export * from './adapters/anthropic.js';
export * from './adapters/buffer.js';
export * from './adapters/n8n.js';
export * from './adapters/google-sheets.js';

import { AnthropicAdapter } from './adapters/anthropic.js';
import { BufferAdapter } from './adapters/buffer.js';
import { GoogleSheetsAdapter } from './adapters/google-sheets.js';
import { N8nAdapter } from './adapters/n8n.js';
import type { AdapterContext, ProviderAdapter, ProviderStatus } from './types.js';

export function createAdapters(ctx: AdapterContext = {}) {
  return {
    anthropic: new AnthropicAdapter(ctx),
    buffer: new BufferAdapter(ctx),
    n8n: new N8nAdapter(ctx),
    googleSheets: new GoogleSheetsAdapter(ctx),
  };
}

/** Status of every integration for Mission Control (configured true/false only, never values). */
export function getProviderStatuses(ctx: AdapterContext = {}): ProviderStatus[] {
  return (Object.values(createAdapters(ctx)) as ProviderAdapter[]).map((a) => a.status());
}
