import { describe, expect, it } from 'vitest';
import {
  AGENT_IDS,
  ContentIdeaSchema,
  GATES,
  PIPELINE_STAGES,
  allowedNextStages,
  captionHash,
  isTransitionAllowed,
  newId,
  normalizeTopic,
  requiredGatesFor,
  sha256,
  topicHash,
} from './index.js';

describe('pipeline stages', () => {
  it('has the 18 contract stages in order', () => {
    expect(PIPELINE_STAGES).toHaveLength(18);
    expect(PIPELINE_STAGES[0]).toBe('IDEA');
    expect(PIPELINE_STAGES[15]).toBe('PUBLISHED');
  });
  it('allows the happy path and blocks skips', () => {
    expect(isTransitionAllowed('IDEA', 'RESEARCHING')).toBe(true);
    expect(isTransitionAllowed('IDEA', 'SCRIPTING')).toBe(false);
    expect(isTransitionAllowed('IDEA', 'PUBLISHED')).toBe(false);
    expect(isTransitionAllowed('RENDERED', 'SCHEDULED')).toBe(false);
    expect(isTransitionAllowed('APPROVED_FOR_PUBLISHING', 'SCHEDULED')).toBe(true);
  });
  it('FAILED and ARCHIVED reachable from everywhere except self/archived->failed', () => {
    for (const s of PIPELINE_STAGES) {
      expect(isTransitionAllowed(s, 'ARCHIVED')).toBe(s !== 'ARCHIVED');
      expect(isTransitionAllowed(s, 'FAILED')).toBe(s !== 'FAILED' && s !== 'ARCHIVED');
    }
    expect(allowedNextStages('PUBLISHED')).toEqual(['FAILED', 'ARCHIVED']);
  });
  it('publishing stages require G5', () => {
    expect(requiredGatesFor('SCHEDULED')).toContain('G5');
    expect(requiredGatesFor('PUBLISHED')).toContain('G5');
    expect(requiredGatesFor('IDEA')).toEqual([]);
  });
});

describe('gates and agents', () => {
  it('only owner approves G5', () => {
    expect(GATES.G5.approvers).toEqual(['owner']);
    expect(GATES.G3.approverMustNotBeAuthor).toBe(true);
  });
  it('lists 14 agents incl. owner', () => {
    expect(AGENT_IDS).toHaveLength(14);
    expect(AGENT_IDS).toContain('owner');
  });
});

describe('hash + ids', () => {
  it('sha256 known vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('caption hash ignores whitespace-only edits but not text edits', () => {
    expect(captionHash('Hallo  wereld\r\n')).toBe(captionHash('Hallo wereld'));
    expect(captionHash('Hallo wereld!')).not.toBe(captionHash('Hallo wereld'));
  });
  it('topic normalisation dedupes word order, accents, euro sign', () => {
    expect(normalizeTopic('Wat doet €250 per maand beleggen?')).toBe(normalizeTopic('beleggen: 250 euro maand'));
    expect(topicHash('Inflatie uitgelegd')).toBe(topicHash('inflatie UITGELEGD!'));
    expect(normalizeTopic('Café crème')).toBe('cafe creme');
  });
  it('ids are 26-char sortable and unique', () => {
    const a = newId(undefined, 1_000);
    const b = newId(undefined, 2_000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
    expect(newId('ci')).toMatch(/^ci_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
  it('schemas reject invalid stage', () => {
    expect(ContentIdeaSchema.safeParse({ stage: 'NOPE' }).success).toBe(false);
  });
});

import { resolveAgentId } from './index.js';
describe('agent aliases', () => {
  it('maps agent file names to canonical ids', () => {
    expect(resolveAgentId('financial-fact-checker')).toBe('fact-checker');
    expect(resolveAgentId('remotion-video-engineer.md')).toBe('video-engineer');
    expect(resolveAgentId('audio-voice-producer')).toBe('voice-producer');
    expect(resolveAgentId('qa-reliability-engineer')).toBe('qa-engineer');
    expect(resolveAgentId('owner')).toBe('owner');
    expect(resolveAgentId('nobody')).toBeNull();
  });
});
