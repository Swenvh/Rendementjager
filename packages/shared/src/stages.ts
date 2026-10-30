import { z } from 'zod';

/** Pipeline stages, in order. Source of truth: docs/BUILD_CONTRACT.md. */
export const PIPELINE_STAGES = [
  'IDEA',
  'RESEARCHING',
  'RESEARCHED',
  'SCRIPTING',
  'SCRIPT_READY',
  'FACT_CHECK',
  'REVISION_REQUIRED',
  'APPROVED_FOR_PRODUCTION',
  'AUDIO_GENERATING',
  'RENDERING',
  'RENDERED',
  'QA_REVIEW',
  'READY_FOR_EDITOR',
  'APPROVED_FOR_PUBLISHING',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
] as const;

export const PipelineStageSchema = z.enum(PIPELINE_STAGES);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** Stages that can always be reached (also during an emergency stop). */
export const ESCAPE_STAGES: readonly PipelineStage[] = ['FAILED', 'ARCHIVED'];

/**
 * Allowed forward/backward moves. FAILED and ARCHIVED are additionally reachable from every
 * stage except themselves (see `isTransitionAllowed`).
 */
export const STAGE_TRANSITIONS: Readonly<Record<PipelineStage, readonly PipelineStage[]>> = {
  IDEA: ['RESEARCHING'],
  RESEARCHING: ['RESEARCHED', 'IDEA'],
  RESEARCHED: ['SCRIPTING', 'RESEARCHING'],
  SCRIPTING: ['SCRIPT_READY', 'RESEARCHING'],
  SCRIPT_READY: ['FACT_CHECK', 'REVISION_REQUIRED', 'SCRIPTING'],
  FACT_CHECK: ['APPROVED_FOR_PRODUCTION', 'REVISION_REQUIRED'],
  REVISION_REQUIRED: ['SCRIPTING', 'RESEARCHING'],
  APPROVED_FOR_PRODUCTION: ['AUDIO_GENERATING', 'REVISION_REQUIRED'],
  AUDIO_GENERATING: ['RENDERING', 'APPROVED_FOR_PRODUCTION'],
  RENDERING: ['RENDERED', 'APPROVED_FOR_PRODUCTION'],
  RENDERED: ['QA_REVIEW'],
  QA_REVIEW: ['READY_FOR_EDITOR', 'RENDERING', 'REVISION_REQUIRED'],
  READY_FOR_EDITOR: ['APPROVED_FOR_PUBLISHING', 'RENDERING', 'REVISION_REQUIRED'],
  APPROVED_FOR_PUBLISHING: ['SCHEDULED', 'PUBLISHED', 'READY_FOR_EDITOR'],
  SCHEDULED: ['PUBLISHED', 'APPROVED_FOR_PUBLISHING'],
  PUBLISHED: [],
  FAILED: ['IDEA', 'RESEARCHING', 'SCRIPTING', 'APPROVED_FOR_PRODUCTION', 'RENDERING'],
  ARCHIVED: ['IDEA'],
};

export function isTransitionAllowed(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return false;
  if (ESCAPE_STAGES.includes(to)) return from !== 'ARCHIVED' || to !== 'FAILED';
  return STAGE_TRANSITIONS[from].includes(to);
}

export function allowedNextStages(from: PipelineStage): PipelineStage[] {
  return PIPELINE_STAGES.filter((to) => isTransitionAllowed(from, to));
}
