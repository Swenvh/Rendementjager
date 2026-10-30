import { z } from 'zod';
import type { AgentId } from './agents.js';
import type { PipelineStage } from './stages.js';

export const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5'] as const;
export const GateIdSchema = z.enum(GATE_IDS);
export type GateId = z.infer<typeof GateIdSchema>;

/** What an approval must be bound to, so later changes can invalidate it. */
export type GateBinding = 'none' | 'scriptRevision' | 'asset' | 'assetAndCaption';

export interface GateDefinition {
  id: GateId;
  name: string;
  /** Dutch label for Mission Control. */
  label: string;
  description: string;
  approvers: readonly AgentId[];
  binding: GateBinding;
  /** Approver must differ from the author of the bound script revision. */
  approverMustNotBeAuthor: boolean;
}

export const GATES: Readonly<Record<GateId, GateDefinition>> = {
  G1: {
    id: 'G1',
    name: 'research',
    label: 'Onderzoek goedgekeurd',
    description: 'Research brief with approved sources exists and is accepted.',
    approvers: ['content-strategist', 'chief-of-staff', 'owner'],
    binding: 'none',
    approverMustNotBeAuthor: false,
  },
  G2: {
    id: 'G2',
    name: 'editorial',
    label: 'Redactie goedgekeurd',
    description: 'Script revision is editorially approved (hook, structure, tone, one CTA).',
    approvers: ['content-strategist', 'chief-of-staff', 'owner'],
    binding: 'scriptRevision',
    approverMustNotBeAuthor: false,
  },
  G3: {
    id: 'G3',
    name: 'fact-check-compliance',
    label: 'Feiten en compliance gecontroleerd',
    description: 'Every number and claim verified; education-not-advice and risk wording checked.',
    approvers: ['fact-checker', 'compliance-reviewer', 'owner'],
    binding: 'scriptRevision',
    approverMustNotBeAuthor: true,
  },
  G4: {
    id: 'G4',
    name: 'media-qa',
    label: 'Media-QA geslaagd',
    description: 'Rendered video passes technical and visual QA for the exact asset hash.',
    approvers: ['qa-engineer', 'owner'],
    binding: 'asset',
    approverMustNotBeAuthor: false,
  },
  G5: {
    id: 'G5',
    name: 'owner-approval',
    label: 'Goedkeuring eigenaar',
    description: 'Owner approves the exact video asset (sha256) and caption (hash) for publishing.',
    approvers: ['owner'],
    binding: 'assetAndCaption',
    approverMustNotBeAuthor: false,
  },
};

/** Gates that must be valid (bound to current script/asset/caption) to ENTER a stage. */
export const STAGE_GATE_REQUIREMENTS: Readonly<Partial<Record<PipelineStage, readonly GateId[]>>> = {
  SCRIPTING: ['G1'],
  FACT_CHECK: ['G2'],
  APPROVED_FOR_PRODUCTION: ['G2', 'G3'],
  AUDIO_GENERATING: ['G2', 'G3'],
  RENDERING: ['G2', 'G3'],
  READY_FOR_EDITOR: ['G2', 'G3', 'G4'],
  APPROVED_FOR_PUBLISHING: ['G2', 'G3', 'G4', 'G5'],
  SCHEDULED: ['G2', 'G3', 'G4', 'G5'],
  PUBLISHED: ['G2', 'G3', 'G4', 'G5'],
};

export function requiredGatesFor(stage: PipelineStage): readonly GateId[] {
  return STAGE_GATE_REQUIREMENTS[stage] ?? [];
}
