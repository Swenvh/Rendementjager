import { type ContentIdea, newId, nowIso, topicHash } from '@rj/shared';
import type { Repository } from './repository.js';

export interface SeedIdea {
  title: string;
  pillar: string;
  template: ContentIdea['template'];
  series: string | null;
  priority: number;
  notes: string | null;
}

/**
 * The only seeded content: the real first Reel plus evergreen IDEA topics from the brief.
 * No metrics, publications, approvals or scripts are seeded (never fabricate data).
 */
export const SEED_IDEAS: readonly SeedIdea[] = [
  {
    title: 'Wat doet €250 per maand beleggen over 30 jaar?',
    pillar: 'geld-in-cijfers',
    template: 'C',
    series: 'GELD IN CIJFERS',
    priority: 100,
    notes: 'Eerste Reel. Alle bedragen uit @rj/finance-engine buildReelCalculation(); aannames in beeld.',
  },
  { title: 'Wat is een ETF?', pillar: 'beleggen-basis', template: null, series: null, priority: 50, notes: 'Evergreen' },
  { title: 'Samengestelde rente uitgelegd', pillar: 'beleggen-basis', template: null, series: null, priority: 50, notes: 'Evergreen' },
  { title: 'Wat doet inflatie met je spaargeld?', pillar: 'geld-basis', template: null, series: null, priority: 50, notes: 'Evergreen' },
  { title: 'Waarom spreiden bij beleggen?', pillar: 'beleggen-basis', template: null, series: null, priority: 50, notes: 'Evergreen' },
  { title: 'Wat kosten beleggingskosten je op lange termijn?', pillar: 'beleggen-basis', template: null, series: null, priority: 50, notes: 'Evergreen' },
];

export interface SeedResult {
  inserted: string[];
  skipped: string[];
}

/** Idempotent: ideas whose topic hash already exists are skipped. */
export async function seed(repo: Repository): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], skipped: [] };
  await repo.transaction(async (tx) => {
    for (const idea of SEED_IDEAS) {
      const hash = topicHash(idea.title);
      if (await tx.contentItems.first({ topicHash: hash })) {
        result.skipped.push(idea.title);
        continue;
      }
      const now = nowIso();
      const id = newId('ci');
      await tx.contentItems.insert({
        id,
        title: idea.title,
        pillar: idea.pillar,
        template: idea.template,
        series: idea.series,
        hook: null,
        angle: null,
        stage: 'IDEA',
        topicHash: hash,
        priority: idea.priority,
        scheduledAt: null,
        currentScriptRevisionId: null,
        currentVideoAssetId: null,
        currentAssetSha256: null,
        captionText: null,
        captionHash: null,
        notes: idea.notes,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now,
      });
      await tx.auditLog.insert({
        id: newId('al'),
        contentId: id,
        action: 'transition',
        fromStage: null,
        toStage: 'IDEA',
        actorId: 'system',
        reason: 'seed: initial content idea',
        details: null,
        createdAt: now,
      });
      result.inserted.push(idea.title);
    }
  });
  return result;
}
