import type { Repository } from '@rj/database';
import { type ActorId, ActorIdSchema, type ResearchBrief, type Source, newId, topicHash, normalizeTopic } from '@rj/shared';
import { findApprovedSource, hostnameOf } from './sources.js';

export interface BriefSourceInput {
  url: string;
  title: string;
  /** ISO date. Required for current-news briefs. */
  publishedAt?: string | null;
  /** ISO date the source was read (default: now). */
  accessedAt?: string;
  excerpt?: string | null;
}

export interface ResearchBriefInput {
  topic: string;
  kind: 'evergreen' | 'current_news';
  summary: string;
  keyFacts: string[];
  sources: BriefSourceInput[];
  contentId?: string | null;
}

export interface BriefValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Max age of the newest source in a current-news brief. */
export const CURRENT_NEWS_MAX_AGE_DAYS = 30;

/**
 * Validates a brief: at least one source, every source on the approved registry (https), every
 * key fact present, at least one tier-1 source. Current-news briefs: every source needs a valid
 * publishedAt, none in the future, and the newest within CURRENT_NEWS_MAX_AGE_DAYS.
 */
export function validateResearchBrief(input: ResearchBriefInput, now: Date = new Date()): BriefValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.topic?.trim()) errors.push('topic is verplicht');
  if (!input.summary?.trim()) errors.push('summary is verplicht');
  if (!Array.isArray(input.keyFacts) || input.keyFacts.length === 0) errors.push('minstens één keyFact is verplicht');
  if (!input.sources?.length) errors.push('minstens één bron is verplicht');
  const tiers: number[] = [];
  for (const [i, s] of (input.sources ?? []).entries()) {
    const label = `bron ${i + 1} (${hostnameOf(s.url) ?? s.url})`;
    if (!s.url?.startsWith('https://')) errors.push(`${label}: moet https zijn`);
    const approved = findApprovedSource(s.url ?? '');
    if (!approved) errors.push(`${label}: staat niet in het register van goedgekeurde bronnen`);
    else tiers.push(approved.tier);
    if (!s.title?.trim()) errors.push(`${label}: titel ontbreekt`);
    if (s.publishedAt != null && Number.isNaN(Date.parse(s.publishedAt))) errors.push(`${label}: publishedAt is geen geldige datum`);
    if (input.kind === 'current_news') {
      if (!s.publishedAt) errors.push(`${label}: publicatiedatum is verplicht bij actueel nieuws`);
      else if (Date.parse(s.publishedAt) > now.getTime() + 86_400_000) errors.push(`${label}: publicatiedatum ligt in de toekomst`);
    }
  }
  if (tiers.length > 0 && !tiers.includes(1)) warnings.push('geen tier-1 (primaire) bron; cijfers in beeld vereisen een primaire bron');
  if (input.kind === 'current_news' && errors.length === 0) {
    const newest = Math.max(...input.sources.map((s) => Date.parse(s.publishedAt!)));
    if (now.getTime() - newest > CURRENT_NEWS_MAX_AGE_DAYS * 86_400_000)
      errors.push(`nieuwste bron is ouder dan ${CURRENT_NEWS_MAX_AGE_DAYS} dagen; geen actueel nieuws`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export class ResearchValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Research brief ongeldig: ${errors.join('; ')}`);
    this.name = 'ResearchValidationError';
  }
}

export interface ResearchServiceOptions {
  now?: () => Date;
}

export class ResearchService {
  private readonly now: () => Date;
  constructor(
    private readonly repo: Repository,
    options: ResearchServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Validates and stores the brief (status draft) with its sources. Throws on validation errors. */
  async createBrief(input: ResearchBriefInput, actorId: string): Promise<{ brief: ResearchBrief; sources: Source[]; warnings: string[] }> {
    const actor: ActorId = ActorIdSchema.parse(actorId);
    const v = validateResearchBrief(input, this.now());
    if (!v.ok) throw new ResearchValidationError(v.errors);
    const ts = this.now().toISOString();
    return this.repo.transaction(async (tx) => {
      if (input.contentId && !(await tx.contentItems.get(input.contentId))) throw new Error(`content ${input.contentId} not found`);
      const brief = await tx.researchBriefs.insert({
        id: newId('rb'),
        contentId: input.contentId ?? null,
        topic: input.topic.trim(),
        kind: input.kind,
        summary: input.summary,
        keyFacts: input.keyFacts,
        status: 'draft',
        createdBy: actor,
        createdAt: ts,
        updatedAt: ts,
      });
      const sources: Source[] = [];
      for (const s of input.sources) {
        const approved = findApprovedSource(s.url)!;
        sources.push(
          await tx.sources.insert({
            id: newId('src'),
            briefId: brief.id,
            url: s.url,
            domain: hostnameOf(s.url)!,
            title: s.title,
            publisher: approved.name,
            publishedAt: s.publishedAt ?? null,
            accessedAt: s.accessedAt ?? ts,
            trustTier: approved.tier,
            excerpt: s.excerpt ?? null,
            createdAt: ts,
          }),
        );
      }
      return { brief, sources, warnings: v.warnings };
    });
  }

  async getBrief(id: string): Promise<{ brief: ResearchBrief; sources: Source[] } | null> {
    const brief = await this.repo.researchBriefs.get(id);
    if (!brief) return null;
    return { brief, sources: await this.repo.sources.list({ briefId: id }, { orderBy: 'id' }) };
  }

  /** Reuse: latest non-rejected brief whose topic normalizes to the same hash (cache rule). */
  async findReusableBrief(topic: string): Promise<ResearchBrief | null> {
    const norm = normalizeTopic(topic);
    const briefs = await this.repo.researchBriefs.list({ status: { op: 'ne', value: 'rejected' } }, { orderBy: 'createdAt', desc: true });
    return briefs.find((b) => normalizeTopic(b.topic) === norm) ?? null;
  }

  /** Topic dedupe against existing content items (normalized content hash). */
  async findDuplicateTopic(topic: string): Promise<{ id: string; title: string; stage: string } | null> {
    const hit = await this.repo.contentItems.first({ topicHash: topicHash(topic) });
    return hit ? { id: hit.id, title: hit.title, stage: hit.stage } : null;
  }

  /** Splits candidate topics into new ones and duplicates (of existing items or each other). */
  async dedupeTopics(topics: readonly string[]): Promise<{ unique: string[]; duplicates: { topic: string; duplicateOf: string }[] }> {
    const seen = new Map<string, string>();
    const unique: string[] = [];
    const duplicates: { topic: string; duplicateOf: string }[] = [];
    for (const t of topics) {
      const h = topicHash(t);
      const existing = await this.findDuplicateTopic(t);
      if (existing) duplicates.push({ topic: t, duplicateOf: existing.title });
      else if (seen.has(h)) duplicates.push({ topic: t, duplicateOf: seen.get(h)! });
      else {
        seen.set(h, t);
        unique.push(t);
      }
    }
    return { unique, duplicates };
  }
}
