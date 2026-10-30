import { sha256 } from '@rj/shared';
import { assertOk, withRetry } from '../retry.js';
import type { AdapterContext, ConnectionTest } from '../types.js';
import { BaseAdapter } from './base.js';

export interface LlmRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}

export interface LlmResponse {
  text: string;
  mode: 'live' | 'mock';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Model id is configurable via RJ_LLM_MODEL; agents normally run as Claude Code subagents instead. */
const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Anthropic Messages API adapter. Needs ANTHROPIC_API_KEY (paid usage, owner must opt in).
 * Mock mode returns a clearly labelled deterministic placeholder — never real content.
 */
export class AnthropicAdapter extends BaseAdapter {
  constructor(ctx: AdapterContext = {}) {
    super(
      {
        id: 'anthropic',
        kind: 'llm',
        requiredEnv: ['ANTHROPIC_API_KEY'],
        validate: (env) => (env.ANTHROPIC_API_KEY!.startsWith('sk-ant-') ? [] : ['ANTHROPIC_API_KEY heeft niet het verwachte formaat']),
      },
      ctx,
    );
  }

  private get model(): string {
    return this.env.RJ_LLM_MODEL || DEFAULT_MODEL;
  }

  protected async liveTest(): Promise<ConnectionTest> {
    // GET /v1/models: free, read-only.
    const res = await this.requireFetch()('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': this.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    });
    assertOk(res, 'anthropic models');
    return { ok: true, mode: 'live', tested: true, message: 'verbonden' };
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const model = req.model ?? this.model;
    if (this.mode !== 'live') {
      return {
        text: `[MOCK LLM] Geen echte AI-output. Prompt-hash ${sha256(req.prompt).slice(0, 12)}.`,
        mode: 'mock',
        model: 'mock',
        inputTokens: null,
        outputTokens: null,
      };
    }
    try {
      return await withRetry(async () => {
        const res = await this.requireFetch()('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': this.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens ?? 1024,
            ...(req.system ? { system: req.system } : {}),
            messages: [{ role: 'user', content: req.prompt }],
          }),
        });
        assertOk(res, 'anthropic messages');
        const body = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
        return {
          text: (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''),
          mode: 'live' as const,
          model,
          inputTokens: body.usage?.input_tokens ?? null,
          outputTokens: body.usage?.output_tokens ?? null,
        };
      });
    } catch (err) {
      throw new Error(this.recordError(err));
    }
  }
}
