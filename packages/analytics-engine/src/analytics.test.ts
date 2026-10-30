import { describe, expect, it } from 'vitest';
import { compareGroups, deriveMetrics, groupPerformance, ratio, strictSum, summarize, type PerformanceRecord } from './index.js';

const full = { reach: 1000, likes: 50, comments: 10, shares: 20, saves: 30, follows: 5 };

describe('deriveMetrics', () => {
  it('computes rates', () => {
    const d = deriveMetrics(full);
    expect(d.engagementPerReached).toBeCloseTo(0.11);
    expect(d.followsPer1000Reached).toBeCloseTo(5);
    expect(d.shareRate).toBeCloseTo(0.02);
    expect(d.saveRate).toBeCloseTo(0.03);
  });
  it('null inputs give null, never 0', () => {
    const d = deriveMetrics({ ...full, reach: null });
    expect(Object.values(d).every((v) => v === null)).toBe(true);
    const e = deriveMetrics({ ...full, saves: null });
    expect(e.engagementPerReached).toBeNull();
    expect(e.saveRate).toBeNull();
    expect(e.shareRate).toBeCloseTo(0.02);
  });
  it('zero reach is undefined (null), real zero counts stay 0', () => {
    expect(deriveMetrics({ ...full, reach: 0 }).shareRate).toBeNull();
    expect(deriveMetrics({ ...full, shares: 0 }).shareRate).toBe(0);
    expect(ratio(1, undefined)).toBeNull();
    expect(strictSum([1, null])).toBeNull();
    expect(summarize([null, null])).toEqual({ n: 0, mean: null, median: null });
    expect(summarize([1, 3, null, 2, 10])).toEqual({ n: 4, mean: 4, median: 2.5 });
  });
});

function rec(i: number, template: string, shares: number | null, pillar = 'beleggen-basis'): PerformanceRecord {
  return { contentId: `c${i}`, pillar, template, hook: null, reach: 1000, likes: 1, comments: 1, shares, saves: 1, follows: 1 };
}

describe('grouping + comparison', () => {
  it('groups by template and pillar, null keys as (onbekend)', () => {
    const rs = [rec(1, 'A', 10), rec(2, 'C', 20), { ...rec(3, 'C', 30), template: null }];
    const g = groupPerformance(rs, 'template');
    expect(g.map((x) => x.group)).toEqual(['(onbekend)', 'A', 'C']);
    expect(g.find((x) => x.group === 'C')!.metrics.shareRate.mean).toBeCloseTo(0.02);
    expect(groupPerformance(rs, 'pillar')).toHaveLength(1);
  });
  it('refuses a verdict below the minimum sample size', () => {
    const rs = [rec(1, 'A', 10), rec(2, 'A', 10), rec(3, 'C', 50)];
    const c = compareGroups(rs, 'template', 'A', 'C', 'shareRate');
    expect(c.verdict).toBe('insufficient_data');
    expect(c.relativeDifference).toBeNull();
    expect(c.note).toMatch(/Te weinig data/);
  });
  it('names a winner when both groups are large enough; null metrics do not count toward n', () => {
    const rs = [
      ...Array.from({ length: 5 }, (_, i) => rec(i, 'A', 10)),
      ...Array.from({ length: 5 }, (_, i) => rec(10 + i, 'C', 30)),
      rec(99, 'C', null),
    ];
    const c = compareGroups(rs, 'template', 'A', 'C', 'shareRate');
    expect(c.verdict).toBe('b');
    expect(c.b.n).toBe(5);
    expect(c.relativeDifference).toBeCloseTo(2);
    expect(compareGroups(rs.slice(0, 9), 'template', 'A', 'C', 'shareRate').verdict).toBe('insufficient_data');
  });
});
