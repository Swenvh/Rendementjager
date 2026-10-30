import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowService } from '@rj/content-engine';
import { createSqliteRepository } from '@rj/database';
import { buildReelCalculation, formatPercent } from '@rj/finance-engine';
import { topicHash } from '@rj/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clip } from '@rj/footage-engine';
import { applyBackground } from './background.js';
import { buildItem } from './build.js';
import { CONTENT_MIX, allocate, estimateRender, planWeek, weeklyTargetFromEnv } from './capacity.js';
import { allTopics, enumerateTopics, topicKey } from './grids.js';
import { existingFromDb, existingFromFolders, parseSeriesNotes, registerItem, writeItemFiles } from './io.js';
import { lintCopy, requiredDisclaimers } from './lint.js';
import { capacity, differingDimensions, planSeries, spacingViolations } from './planner.js';
import { HOOK_PATTERNS, type SeriesItem } from './types.js';
import { eurRoundings } from './util.js';

const DATE = '2026-11-02';

function everyItem(): SeriesItem[] {
  return allTopics().flatMap((t) => HOOK_PATTERNS.map((p) => buildItem(t, p, DATE)));
}
const textsOf = (i: SeriesItem) => [i.title, i.caption, i.storyboard.onScreen.footnote, i.storyboard.onScreen.assumptionsFootnote, ...i.storyboard.onScreen.risks.items, ...i.storyboard.scenes.flatMap((s) => s.segments.map((x) => x.text))];

describe('grids and capacity', () => {
  it('has the documented number of topics and drafts', () => {
    expect(enumerateTopics('compounding')).toHaveLength(60);
    expect(enumerateTopics('cost')).toHaveLength(45);
    expect(enumerateTopics('inflation')).toHaveLength(30);
    const c = capacity(undefined, 3);
    expect(c.topics).toBe(135);
    expect(c.drafts).toBe(405);
    expect(capacity(undefined, 2).drafts).toBe(270);
    expect(new Set(allTopics().map(topicKey)).size).toBe(135);
  });
  it('compounding grid covers 50..1000 x 10/20/30 x 4/6/7/8%', () => {
    const t = enumerateTopics('compounding');
    expect(new Set(t.map((x) => x.monthly))).toEqual(new Set([50, 100, 250, 500, 1000]));
    expect(new Set(t.map((x) => x.years))).toEqual(new Set([10, 20, 30]));
    expect(new Set(t.map((x) => x.annualReturn))).toEqual(new Set([0.04, 0.06, 0.07, 0.08]));
  });
});

describe('item building', () => {
  const items = everyItem();

  it('is deterministic (same input, same bytes and hashes)', () => {
    const a = buildItem(enumerateTopics('cost')[7]!, 'contrast', DATE);
    const b = buildItem(enumerateTopics('cost')[7]!, 'contrast', DATE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.contentHash).toBe(b.contentHash);
    // The content hash does not depend on the date; the slug does.
    const c = buildItem(enumerateTopics('cost')[7]!, 'contrast', '2027-01-01');
    expect(c.contentHash).toBe(a.contentHash);
    expect(c.slug).not.toBe(a.slug);
  });

  it('gives all 405 drafts a unique content hash, slug and topic hash (title)', () => {
    expect(items).toHaveLength(405);
    expect(new Set(items.map((i) => i.contentHash)).size).toBe(405);
    expect(new Set(items.map((i) => i.slug)).size).toBe(405);
    expect(new Set(items.map((i) => topicHash(i.title))).size).toBe(405);
  });

  it('every on-screen hook fits in at most 4 lines and the storyboard keeps the template scene ids', () => {
    for (const i of items) {
      expect(i.storyboard.onScreen.hookLines.length).toBeLessThanOrEqual(4);
      expect(i.storyboard.onScreen.hookHighlightLine).toBeLessThan(i.storyboard.onScreen.hookLines.length);
      expect(i.storyboard.scenes.map((s) => s.id)).toEqual(['hook', 'assumptions', 'growth', 'result', 'risks', 'cta']);
      expect(i.storyboard.onScreen.risks.items.length).toBeLessThanOrEqual(4);
      expect(JSON.stringify(i.storyboard)).not.toContain('{{');
    }
  });

  it('every number in script, caption and on-screen text comes from a claim linked to the engine', () => {
    for (const i of items) {
      const eurClaims = i.claims.filter((c) => c.unit === 'EUR').flatMap((c) => eurRoundings(c.value));
      const pctClaims = new Set(i.claims.filter((c) => c.unit === 'percent').map((c) => formatPercent(c.value / 100)));
      const yearClaims = new Set(i.claims.filter((c) => c.unit === 'years').map((c) => c.value));
      for (const text of textsOf(i)) {
        for (const m of text.matchAll(/€\s?([\d.]+)/g)) {
          const v = Number(m[1]!.replace(/\./g, ''));
          expect(eurClaims, `${i.slug}: ${m[0]} in "${text}"`).toContain(v);
        }
        for (const m of text.matchAll(/(\d+(?:,\d+)?)%/g)) expect(pctClaims, `${i.slug}: ${m[0]}`).toContain(formatPercent(Number(m[1]!.replace(',', '.')) / 100));
        for (const m of text.matchAll(/(\d+) jaar/g)) expect(yearClaims, `${i.slug}: ${m[0]}`).toContain(Number(m[1]));
      }
      for (const c of i.claims) expect(c.calculationRef).toMatch(/^@rj\/finance-engine:\w+\(.*\)#.+/);
    }
  });

  it('claims equal what the renderer computes from the storyboard overrides (buildReelCalculation)', () => {
    for (const i of items) {
      const calc = buildReelCalculation(i.storyboard.calculation!.overrides as never);
      const t = calc.result.totals;
      const val = (k: string) => i.claims.find((c) => c.key === k)?.value;
      if (i.kind === 'compounding') {
        expect(val('end')).toBe(t.endValueNominal);
        expect(val('growth')).toBe(t.growth);
        expect(val('real')).toBe(t.endValueReal);
        expect(val('contributed')).toBe(t.contributed);
      } else if (i.kind === 'cost') {
        expect(val('endHigh')).toBe(t.endValueNominal);
        expect(val('endLow')!).toBeGreaterThan(val('endHigh')!);
        expect(val('difference')).toBeCloseTo(val('endLow')! - val('endHigh')!, 6);
      } else {
        expect(val('real')).toBe(t.endValueReal);
        expect(val('contributed')).toBe(t.endValueNominal);
        expect(val('loss')).toBeCloseTo(t.endValueNominal - t.endValueReal!, 6);
      }
    }
  });

  it('spoken amounts never overstate beyond the next rounding step and the hook never promises', () => {
    for (const i of items) {
      expect(lintCopy(textsOf(i).join('\n')), i.slug).toEqual([]);
      expect(requiredDisclaimers(i.caption), i.slug).toEqual([]);
      expect(textsOf(i).join(' ')).not.toMatch(/Meer vermogen|Meer vrijheid/i);
      expect(i.caption).toContain('Let op! Beleggen brengt risico');
      expect(i.hashtags.length).toBe(5);
    }
  });

  it('labels the return as hypothetical and effective in every compounding and cost script', () => {
    for (const i of items.filter((x) => x.kind !== 'inflation')) {
      const all = textsOf(i).join(' ');
      expect(all).toMatch(/hypothetisch/i);
      expect(all).toMatch(/effectief per jaar/);
    }
  });

  it('carries the experiment tags and trial flag', () => {
    const i = items[0]!;
    expect(i.tags).toMatchObject({ trial: true, template: 'C' });
    expect(typeof i.tags.durationS).toBe('number');
    expect(i.tags.variantGroup).toBe(i.topicKey.replace(/:/g, '-'));
    const variants = items.filter((x) => x.topicKey === i.topicKey);
    expect(variants.map((v) => v.tags.variantIndex).sort()).toEqual([0, 1, 2]);
  });

  it('lint catches the forbidden phrases', () => {
    expect(lintCopy('Meer vermogen. Meer vrijheid.')).not.toEqual([]);
    expect(lintCopy('Dit rendement is gegarandeerd')).not.toEqual([]);
    expect(lintCopy('Koop nu ETF X, mis het niet')).not.toEqual([]);
    expect(lintCopy('Dit is geen garantie voor de toekomst')).toEqual([]);
  });
});

describe('planner', () => {
  const base = { kinds: ['compounding', 'cost', 'inflation'] as const, date: DATE };

  it('is deterministic', () => {
    const a = planSeries({ ...base, count: 60 });
    const b = planSeries({ ...base, count: 60 });
    expect(a.items.map((i) => i.contentHash)).toEqual(b.items.map((i) => i.contentHash));
  });

  it('plans 120+ items per week without breaking the variation rules', () => {
    const p = planSeries({ ...base, count: 150, variantsPerTopic: 3 });
    expect(p.items).toHaveLength(150);
    expect(spacingViolations(p.items)).toEqual([]);
    expect(new Set(p.items.map((i) => i.contentHash)).size).toBe(150);
  });

  it('every consecutive pair differs in at least two of kind, hook pattern, amount, horizon', () => {
    const p = planSeries({ ...base, count: 200, variantsPerTopic: 3 });
    for (let k = 1; k < p.items.length; k++) expect(differingDimensions(p.items[k - 1]!, p.items[k]!)).toBeGreaterThanOrEqual(2);
  });

  it('never uses the same hook pattern three times in a row and keeps variants of one topic apart', () => {
    const p = planSeries({ ...base, count: 120, variantsPerTopic: 3, minVariantGap: 6 });
    for (let k = 2; k < p.items.length; k++) {
      const [a, b, c] = [p.items[k - 2]!, p.items[k - 1]!, p.items[k]!];
      expect(a.hookPattern === b.hookPattern && b.hookPattern === c.hookPattern).toBe(false);
    }
    const last = new Map<string, number>();
    p.items.forEach((it, idx) => {
      const prev = last.get(it.topicKey);
      if (prev !== undefined) expect(idx - prev).toBeGreaterThanOrEqual(6);
      last.set(it.topicKey, idx);
    });
  });

  it('respects variantsPerTopic (A/B groups of 2 or 3, never more)', () => {
    for (const v of [1, 2, 3]) {
      const p = planSeries({ ...base, count: 500, variantsPerTopic: v });
      const per = new Map<string, number>();
      for (const i of p.items) per.set(i.topicKey, (per.get(i.topicKey) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(v);
      expect(p.items.length).toBeLessThanOrEqual(135 * v);
    }
  });

  it('stops short with an explanation instead of breaking rules when the grid is exhausted', () => {
    const p = planSeries({ ...base, count: 1000, variantsPerTopic: 3 });
    expect(p.items.length).toBeLessThanOrEqual(404);
    expect(p.items.length).toBeGreaterThan(300);
    expect(p.shortfall[0]).toMatch(/Slechts/);
    expect(spacingViolations(p.items)).toEqual([]);
  });

  it('respects the per-series maximum', () => {
    const p = planSeries({ ...base, count: 60, maxPerKind: 10 });
    expect(p.stats.perKind.compounding ?? 0).toBeLessThanOrEqual(10);
    expect(p.stats.perKind.cost ?? 0).toBeLessThanOrEqual(10);
    expect(p.items.length).toBe(30);
  });

  it('single kind plans stay in that kind and mix hook patterns', () => {
    const p = planSeries({ kinds: ['cost'], count: 30, date: DATE });
    expect(p.items.every((i) => i.kind === 'cost')).toBe(true);
    expect(new Set(p.items.map((i) => i.hookPattern)).size).toBe(3);
    expect(spacingViolations(p.items)).toEqual([]);
  });

  it('dedupes against existing content hashes, topic hashes and the hand-made first Reel', () => {
    const first = planSeries({ ...base, count: 40 });
    const taken = first.items.slice(0, 20);
    const second = planSeries({ ...base, count: 40, existing: taken.map((i) => ({ contentHash: i.contentHash, topicKey: i.topicKey, hookPattern: i.hookPattern, topicHash: topicHash(i.title) })) });
    const secondHashes = new Set(second.items.map((i) => i.contentHash));
    for (const t of taken) expect(secondHashes.has(t.contentHash)).toBe(false);
    // A row that only shares the title (e.g. a manual idea) also blocks it.
    const third = planSeries({ ...base, count: 40, existing: [{ topicHash: topicHash(first.items[0]!.title) }] });
    expect(third.items.map((i) => i.title)).not.toContain(first.items[0]!.title);
    // Hand-made first Reel: compounding 250/30/7% question is never generated.
    const all = planSeries({ kinds: ['compounding'], count: 500, variantsPerTopic: 3, date: DATE });
    expect(all.items.some((i) => i.topicKey === 'compounding:250:30:r7' && i.hookPattern === 'question')).toBe(false);
  });

  it('continues spacing across the seam with previous items', () => {
    const first = planSeries({ ...base, count: 10 });
    const next = planSeries({ ...base, count: 10, previous: first.items, existing: first.items.map((i) => ({ contentHash: i.contentHash })) });
    expect(spacingViolations([first.items.at(-1)!, ...next.items])).toEqual([]);
  });
});

describe('weekly capacity planner', () => {
  it('allocates the content mix exactly (largest remainder)', () => {
    expect(allocate(30, CONTENT_MIX.map((m) => m.share))).toEqual([9, 8, 6, 4, 3]);
    expect(allocate(100, CONTENT_MIX.map((m) => m.share))).toEqual([30, 25, 20, 15, 10]);
    for (const n of [1, 7, 25, 33, 101, 250]) expect(allocate(n, CONTENT_MIX.map((m) => m.share)).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('reads RJ_WEEKLY_TARGET (default 30, no hard cap)', () => {
    expect(weeklyTargetFromEnv({})).toBe(30);
    expect(weeklyTargetFromEnv({ RJ_WEEKLY_TARGET: '120' })).toBe(120);
    expect(() => weeklyTargetFromEnv({ RJ_WEEKLY_TARGET: '0' })).toThrow();
    expect(() => weeklyTargetFromEnv({ RJ_WEEKLY_TARGET: 'veel' })).toThrow();
  });

  it('plans 120 Reels: mix respected, news are placeholders, series items are real drafts', () => {
    const w = planWeek({ target: 120, date: '2026-11-04', variantsPerTopic: 3, env: {} });
    expect(w.weekStart).toBe('2026-11-02');
    expect(w.slots).toHaveLength(120);
    expect(w.perPillar['markt-economie']!.news).toBe(24);
    expect(w.slots.filter((s) => s.type === 'news').every((s) => s.placeholder && !s.item)).toBe(true);
    expect(w.perPillar['vermogensopbouw']!.planned).toBe(36);
    expect(w.perPillar['vermogensopbouw']!.series).toBe(36);
    expect(w.slots.filter((s) => s.type === 'series').every((s) => s.item && !s.placeholder)).toBe(true);
    expect(w.slots.map((s) => s.day).every((d) => d >= '2026-11-02' && d <= '2026-11-08')).toBe(true);
    const items = w.slots.flatMap((s) => (s.item ? [s.item] : []));
    expect(new Set(items.map((i) => i.contentHash)).size).toBe(items.length);
    expect(spacingViolations(items)).toEqual([]);
    expect(w.render.reels).toBe(w.slots.filter((s) => !s.placeholder).length);
  });

  it('uses existing evergreen ideas for fouten-mythes before placeholders', () => {
    const w = planWeek({ target: 30, date: '2026-11-04', evergreen: [{ id: 'ci_1', title: 'Mythe: beleggen is gokken', pillar: 'fouten-mythes' }], env: {} });
    const mythes = w.slots.filter((s) => s.pillar === 'fouten-mythes');
    expect(mythes).toHaveLength(3);
    expect(mythes.filter((s) => s.contentId === 'ci_1')).toHaveLength(1);
    expect(mythes.filter((s) => s.placeholder)).toHaveLength(2);
  });

  it('turns exhausted series supply into explicit placeholders', () => {
    const w = planWeek({ target: 1000, date: '2026-11-04', variantsPerTopic: 1, env: {} });
    expect(w.slots).toHaveLength(1000);
    expect(w.slots.some((s) => s.type === 'evergreen' && s.placeholder)).toBe(true);
    expect(w.warnings.join(' ')).toMatch(/Slechts/);
  });

  it('estimates render hours from env', () => {
    expect(estimateRender(30, {})).toEqual({ reels: 30, minutesPerReel: 4, concurrency: 2, sequentialHours: 2, bestCaseHours: 1 });
    expect(estimateRender(100, { RJ_RENDER_CONCURRENCY: '4', RJ_RENDER_MINUTES_PER_REEL: '5' }).sequentialHours).toBe(8.3);
  });
});

describe('files and registration', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rj-series-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes deterministic folders and dedupes on re-run', () => {
    const item = buildItem(enumerateTopics('inflation')[3]!, 'statement', DATE);
    const out = join(dir, 'scripts');
    expect(writeItemFiles(item, out)).not.toBeNull();
    expect(readdirSync(join(out, item.slug)).sort()).toEqual(['caption.md', 'metadata.json', 'script.md', 'series.json', 'storyboard.json']);
    const first = readFileSync(join(out, item.slug, 'series.json'), 'utf8');
    expect(writeItemFiles(item, out)).toBeNull();
    expect(readFileSync(join(out, item.slug, 'series.json'), 'utf8')).toBe(first);
    expect(existingFromFolders(out)[0]!.contentHash).toBe(item.contentHash);
    const sb = JSON.parse(readFileSync(join(out, item.slug, 'storyboard.json'), 'utf8'));
    expect(sb.template).toBe('TemplateC');
    expect(sb.calculation.overrides.annualReturn).toBe(0);
  });

  it('registers ContentIdea + ScriptRevision + claims at stage IDEA and approves nothing', async () => {
    const repo = createSqliteRepository(join(dir, 'test.sqlite'));
    const wf = new WorkflowService(repo, { env: {} });
    try {
      const plan = planSeries({ kinds: ['compounding', 'cost', 'inflation'], count: 9, date: DATE });
      for (const item of plan.items) expect(await registerItem(repo, wf, item)).not.toBe('duplicate');
      const rows = await repo.contentItems.list();
      expect(rows).toHaveLength(9);
      for (const r of rows) {
        expect(r.stage).toBe('IDEA');
        expect(r.currentScriptRevisionId).not.toBeNull();
        expect(r.captionHash).not.toBeNull();
        expect(r.currentAssetSha256).toBeNull();
        const n = parseSeriesNotes(r.notes)!;
        expect(n.trial).toBe(true);
        expect(n.tags.template).toBe('C');
        expect((await repo.financialClaims.list({ contentId: r.id })).every((c) => c.status === 'unverified' && c.calculationRef?.startsWith('@rj/finance-engine:'))).toBe(true);
      }
      expect(await repo.approvals.count()).toBe(0);
      expect(await repo.financialClaims.count()).toBe(plan.items.reduce((s, i) => s + i.claims.length, 0));
      expect(await repo.scriptRevisions.count()).toBe(9);
      // second registration of the same drafts is a no-op (duplicate topic)
      expect(await registerItem(repo, wf, plan.items[0]!)).toBe('duplicate');
      // dedupe against ContentIdea rows
      const existing = await existingFromDb(repo);
      const next = planSeries({ kinds: ['compounding', 'cost', 'inflation'], count: 9, date: DATE, existing });
      const used = new Set(plan.items.map((i) => i.contentHash));
      expect(next.items.every((i) => !used.has(i.contentHash))).toBe(true);
    } finally {
      await repo.close();
    }
  });
});

describe('Tabel in cijfers (Template D series)', () => {
  const topics = enumerateTopics('table');
  it('has 8 topics, opt-in only (default kinds unchanged)', () => {
    expect(topics).toHaveLength(8);
    expect(capacity(undefined, 3).topics).toBe(135);
    expect(new Set(topics.map(topicKey)).size).toBe(8);
  });
  const items = topics.flatMap((t) => HOOK_PATTERNS.map((p) => buildItem(t, p, DATE)));
  it('24 unique, deterministic drafts; title fits the label; every cell is a finance-engine claim', () => {
    expect(new Set(items.map((i) => i.contentHash)).size).toBe(24);
    expect(new Set(items.map((i) => i.slug)).size).toBe(24);
    expect(new Set(items.map((i) => topicHash(i.title))).size).toBe(24);
    for (const i of items) {
      expect(i.title.length).toBeLessThanOrEqual(72);
      expect(i.storyboard.template).toBe('TemplateD');
      expect(i.tags.template).toBe('D');
      expect(i.claims.filter((c) => c.role === 'result')).toHaveLength(i.params.amounts!.length * i.params.horizons!.length);
      expect(i.claims.every((c) => c.calculationRef.startsWith('@rj/finance-engine:'))).toBe(true);
      expect(requiredDisclaimers(i.caption)).toEqual([]);
      expect(textsOf(i).flatMap(lintCopy)).toEqual([]);
    }
    expect(JSON.stringify(buildItem(topics[3]!, 'contrast', DATE))).toBe(JSON.stringify(buildItem(topics[3]!, 'contrast', DATE)));
  });
  it('planSeries can plan the table kind', () => {
    const p = planSeries({ kinds: ['table'], count: 6, date: DATE });
    expect(p.items).toHaveLength(6);
    expect(p.items.every((i) => i.kind === 'table')).toBe(true);
  });
});

describe('background assignment (footage manifest)', () => {
  const clip = (id: string, over: Partial<Clip> = {}): Clip => ({ id, file: `nl/${id}.mp4`, title: id, author: 'Eigenaar', licence: 'Owner-provided', retrievedDate: '2026-10-30', location: 'NL', durationS: 10, width: 1080, height: 1920, ...over });
  const lib = ['a-01', 'b-01', 'c-01', 'd-01', 'e-01', 'f-01', 'g-01', 'h-01', 'i-01', 'j-01', 'k-01', 'l-01'].map((id) => clip(id));
  const mk = (kind: 'compounding' | 'table', n: number) => {
    const plan = planSeries({ kinds: [kind], count: n, date: DATE });
    return plan.items;
  };
  it('empty library: nothing set, caption untouched', () => {
    const [item] = mk('compounding', 1);
    const before = item!.caption;
    expect(applyBackground(item!, [], [item!.slug])).toBeNull();
    expect(item!.storyboard.background).toBeUndefined();
    expect(item!.caption).toBe(before);
  });
  it('is deterministic, never repeats a clip inside one Reel and rotates between neighbours', () => {
    const a = mk('compounding', 4);
    const b = mk('compounding', 4);
    const slugs = a.map((i) => i.slug); // plan order
    const ra = a.map((i) => applyBackground(i, lib, slugs)!.clipIds);
    const rb = b.map((i) => applyBackground(i, lib, slugs)!.clipIds);
    expect(ra).toEqual(rb);
    for (const ids of ra) expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ra.length; i++) expect(ra[i]!.some((id) => ra[i - 1]!.includes(id))).toBe(false);
  });
  it('contentHash is unaffected; CC BY credit goes into the caption (above the hashtags), Pexels does not', () => {
    const [item] = mk('compounding', 1);
    const hash = item!.contentHash;
    const cc = [clip('cc-01', { licence: 'CC BY', title: 'Dutch Windmills', author: 'Scenic NL', creditRequired: true })];
    const r = applyBackground(item!, cc, [item!.slug])!;
    expect(r.captionCreditLines).toEqual(['Beeld: Dutch Windmills van Scenic NL (CC BY)']);
    expect(item!.contentHash).toBe(hash);
    const lines = item!.caption.split('\n');
    expect(lines.at(-1)!.startsWith('#')).toBe(true);
    expect(item!.caption).toContain('Beeld: Dutch Windmills van Scenic NL (CC BY)');
    const [other] = mk('table', 1);
    const r2 = applyBackground(other!, [clip('px-01', { licence: 'Pexels License' })], [other!.slug])!;
    expect(r2.captionCreditLines).toEqual([]);
    expect(r2.allCredits[0]).toMatch(/Pexels/);
    expect(other!.storyboard.background!.clipIds).toEqual(['px-01']);
  });
});
