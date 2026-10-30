import { z } from 'zod';

export const AGENT_IDS = [
  'research-analyst',
  'content-strategist',
  'editorial-copywriter',
  'fact-checker',
  'compliance-reviewer',
  'creative-director',
  'video-engineer',
  'voice-producer',
  'automation-engineer',
  'distribution-manager',
  'growth-analyst',
  'qa-engineer',
  'chief-of-staff',
  'owner',
] as const;

export const AgentIdSchema = z.enum(AGENT_IDS);
export type AgentId = z.infer<typeof AgentIdSchema>;

/** Non-agent actors that may write audit rows (the worker, migrations, seed). */
export const SYSTEM_ACTORS = ['system', 'worker'] as const;
export const ActorIdSchema = z.enum([...AGENT_IDS, ...SYSTEM_ACTORS]);
export type ActorId = z.infer<typeof ActorIdSchema>;

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

/**
 * Agent definition file names (`.claude/agents/<name>.md`) that differ from the canonical ids.
 * Files not listed here use the id itself as file name.
 */
export const AGENT_FILE_ALIASES: Readonly<Record<string, AgentId>> = {
  'financial-fact-checker': 'fact-checker',
  'remotion-video-engineer': 'video-engineer',
  'audio-voice-producer': 'voice-producer',
  'qa-reliability-engineer': 'qa-engineer',
};

/** Resolves an agent id or agent file name (with or without ".md") to the canonical id, or null. */
export function resolveAgentId(nameOrId: string): AgentId | null {
  const n = nameOrId.trim().replace(/\.md$/, '');
  if (isAgentId(n)) return n;
  return AGENT_FILE_ALIASES[n] ?? null;
}
