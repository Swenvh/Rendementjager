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

import { METHOD_BRIEFS, METHOD_KINDS, isUnverifiedSource, methodBriefHash, methodBriefTopic, methodKindOfTopic, renderMethodBriefMarkdown } from './index.js';

describe('method briefs', () => {
  it('every definition is a valid brief on the approved registry, hypothetical only, with UNVERIFIED flags', () => {
    for (const kind of METHOD_KINDS) {
      const d = METHOD_BRIEFS[kind];
      expect(validateResearchBrief(d.input, NOW)).toMatchObject({ ok: true, warnings: [] });
      expect(d.input.sources.length).toBeGreaterThanOrEqual(2);
      expect(d.input.summary).toMatch(/HYPOTHETISCH/);
      expect(d.input.summary).toMatch(/finance-engine/);
      expect(d.input.sources.every((s) => isUnverifiedSource({ excerpt: s.excerpt }))).toBe(true);
      expect(methodKindOfTopic(d.input.topic)).toBe(kind);
    }
  });
  it('ensureMethodBriefs is idempotent, stores draft briefs with sources, never approves', async () => {
    const first = await svc.ensureMethodBriefs();
    expect(first.every((r) => r.created)).toBe(true);
    expect((await svc.ensureMethodBriefs()).every((r) => !r.created)).toBe(true);
    expect(await repo.researchBriefs.count()).toBe(3);
    for (const kind of METHOD_KINDS) {
      const m = (await svc.getMethodBrief(kind))!;
      expect(m.brief).toMatchObject({ status: 'draft', topic: methodBriefTopic(kind), contentId: null });
      expect(m.sources.length).toBe(METHOD_BRIEFS[kind].input.sources.length);
      expect(m.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(renderMethodBriefMarkdown(kind, m.brief, m.sources)).toContain(`brief_hash: ${m.hash}`);
    }
  });
  it('hash changes on any content or source change, not on source order or ids', async () => {
    await svc.ensureMethodBriefs();
    const m = (await svc.getMethodBrief('cost'))!;
    expect(methodBriefHash(m.brief, [...m.sources].reverse())).toBe(m.hash);
    expect(methodBriefHash({ ...m.brief, summary: m.brief.summary + '.' }, m.sources)).not.toBe(m.hash);
    expect(methodBriefHash(m.brief, [{ ...m.sources[0]!, excerpt: 'verified' }, ...m.sources.slice(1)])).not.toBe(m.hash);
  });
  it('updateBrief replaces sources, resets to draft, changes hash, and rejects unapproved domains', async () => {
    await svc.ensureMethodBriefs();
    const m = (await svc.getMethodBrief('inflation'))!;
    await repo.researchBriefs.update(m.brief.id, { status: 'approved' });
    const input = { ...METHOD_BRIEFS.inflation.input, summary: METHOD_BRIEFS.inflation.input.summary + ' extra' };
    await svc.updateBrief(m.brief.id, input, 'research-analyst');
    const after = (await svc.getMethodBrief('inflation'))!;
    expect(after.brief.status).toBe('draft');
    expect(after.hash).not.toBe(m.hash);
    await expect(svc.updateBrief(m.brief.id, { ...input, sources: [{ url: 'https://randomblog.nl/x', title: 'x' }] }, 'research-analyst')).rejects.toBeInstanceOf(ResearchValidationError);
  });
});
