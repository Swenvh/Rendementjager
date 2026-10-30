import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepository, seed, type Repository } from '@rj/database';
import { ResearchService, ResearchValidationError, findApprovedSource, isApprovedUrl, validateResearchBrief, type ResearchBriefInput } from './index.js';

const NOW = new Date('2026-10-25T12:00:00Z');
let repo: Repository;
let svc: ResearchService;
beforeEach(() => {
  repo = createSqliteRepository(':memory:');
  svc = new ResearchService(repo, { now: () => NOW });
});
afterEach(async () => repo.close());

const evergreen: ResearchBriefInput = {
  topic: 'Wat doet inflatie met je spaargeld?',
  kind: 'evergreen',
  summary: 'Uitleg koopkracht.',
  keyFacts: ['Inflatie = stijging van het algemene prijsniveau'],
  sources: [{ url: 'https://www.cbs.nl/nl-nl/visualisaties/dashboard-economie/prijzen/inflatie', title: 'Inflatie (CBS)' }],
};

describe('source registry', () => {
  it('approves official domains incl. subdomains, rejects lookalikes', () => {
    expect(findApprovedSource('https://www.afm.nl/nl-nl/consumenten')?.id).toBe('afm');
    expect(findApprovedSource('https://opendata.cbs.nl/x')?.tier).toBe(1);
    expect(findApprovedSource('https://www.ecb.europa.eu/stats')?.id).toBe('ecb');
    expect(findApprovedSource('https://afm.nl.evil.com/')).toBeNull();
    expect(findApprovedSource('https://notafm.nl/')).toBeNull();
    expect(isApprovedUrl('http://www.dnb.nl/')).toBe(false);
    expect(isApprovedUrl('https://www.belastingdienst.nl/box3')).toBe(true);
  });
});

describe('brief validation', () => {
  it('accepts an evergreen brief without publication dates', () => {
    expect(validateResearchBrief(evergreen, NOW)).toMatchObject({ ok: true });
  });
  it('rejects unapproved sources and empty facts', () => {
    const v = validateResearchBrief({ ...evergreen, keyFacts: [], sources: [{ url: 'https://randomblog.nl/x', title: 'blog' }] }, NOW);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/register/);
    expect(v.errors.join(' ')).toMatch(/keyFact/);
  });
  it('current-news briefs require recent publication dates', () => {
    const base = { ...evergreen, kind: 'current_news' as const };
    expect(validateResearchBrief(base, NOW).errors.join(' ')).toMatch(/publicatiedatum is verplicht/);
    expect(validateResearchBrief({ ...base, sources: [{ ...base.sources[0]!, publishedAt: '2026-01-01' }] }, NOW).errors.join(' ')).toMatch(/ouder dan/);
    expect(validateResearchBrief({ ...base, sources: [{ ...base.sources[0]!, publishedAt: '2027-01-01' }] }, NOW).errors.join(' ')).toMatch(/toekomst/);
    expect(validateResearchBrief({ ...base, sources: [{ ...base.sources[0]!, publishedAt: '2026-10-20' }] }, NOW).ok).toBe(true);
  });
  it('warns when there is no tier-1 source', () => {
    const v = validateResearchBrief({ ...evergreen, sources: [{ url: 'https://www.nibud.nl/x', title: 'Nibud' }] }, NOW);
    expect(v.ok).toBe(true);
    expect(v.warnings).toHaveLength(1);
  });
});

describe('ResearchService', () => {
  it('stores brief + sources with tier/publisher from the registry, and finds it for reuse', async () => {
    const { brief, sources } = await svc.createBrief(evergreen, 'research-analyst');
    expect(sources[0]).toMatchObject({ domain: 'cbs.nl', trustTier: 1, accessedAt: NOW.toISOString() });
    expect((await svc.getBrief(brief.id))!.sources).toHaveLength(1);
    expect((await svc.findReusableBrief('inflatie: wat doet het met je SPAARGELD'))?.id).toBe(brief.id);
    expect(await svc.findReusableBrief('Box 3 uitgelegd')).toBeNull();
  });
  it('throws ResearchValidationError and stores nothing on invalid input', async () => {
    await expect(svc.createBrief({ ...evergreen, sources: [] }, 'research-analyst')).rejects.toBeInstanceOf(ResearchValidationError);
    expect(await repo.researchBriefs.count()).toBe(0);
  });
  it('dedupes topics against seeded content and within the batch', async () => {
    await seed(repo);
    const r = await svc.dedupeTopics(['Wat is een ETF', 'Box 3 in 2026', 'box 3 in 2026!', 'samengestelde rente uitgelegd']);
    expect(r.unique).toEqual(['Box 3 in 2026']);
    expect(r.duplicates.map((d) => d.topic)).toEqual(['Wat is een ETF', 'box 3 in 2026!', 'samengestelde rente uitgelegd']);
  });
});
