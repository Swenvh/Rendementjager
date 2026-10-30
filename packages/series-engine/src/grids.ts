import type { SeriesKind, TopicParams } from './types.js';

/**
 * Parameter grids. Each grid point is one calculation topic; every topic can be told with three
 * hook patterns (question / statement / contrast), so unique drafts = topics x 3.
 * Returns are HYPOTHETICAL averages (effective per year), never forecasts.
 */
export const GRIDS = {
  compounding: { monthly: [50, 100, 250, 500, 1000], years: [10, 20, 30], returns: [0.04, 0.06, 0.07, 0.08] },
  cost: {
    monthly: [50, 100, 250, 500, 1000],
    years: [10, 20, 30],
    annualReturn: 0.07,
    // [low, high] yearly cost rate; every pair has a distinct high rate (keeps titles unique).
    pairs: [
      [0.002, 0.015],
      [0.002, 0.01],
      [0.002, 0.008],
    ] as const,
  },
  inflation: { monthly: [50, 100, 250, 500, 1000], years: [10, 20, 30], rates: [0.02, 0.03] },
} as const;

/** Stable key for a topic, e.g. `compounding:250:30:r7`. */
export function topicKey(p: TopicParams): string {
  const r = (x: number) => String(Math.round(x * 10_000) / 100).replace('.', '_');
  switch (p.kind) {
    case 'compounding':
      return `compounding:${p.monthly}:${p.years}:r${r(p.annualReturn)}`;
    case 'cost':
      return `cost:${p.monthly}:${p.years}:r${r(p.annualReturn)}:c${r(p.costLow!)}-${r(p.costHigh!)}`;
    case 'inflation':
      return `inflation:${p.monthly}:${p.years}:p${r(p.inflation!)}`;
  }
}

export function enumerateTopics(kind: SeriesKind): TopicParams[] {
  const out: TopicParams[] = [];
  if (kind === 'compounding') {
    const g = GRIDS.compounding;
    for (const monthly of g.monthly) for (const years of g.years) for (const annualReturn of g.returns) out.push({ kind, monthly, years, annualReturn });
  } else if (kind === 'cost') {
    const g = GRIDS.cost;
    for (const monthly of g.monthly)
      for (const years of g.years) for (const [costLow, costHigh] of g.pairs) out.push({ kind, monthly, years, annualReturn: g.annualReturn, costLow, costHigh });
  } else {
    const g = GRIDS.inflation;
    for (const monthly of g.monthly) for (const years of g.years) for (const inflation of g.rates) out.push({ kind, monthly, years, annualReturn: 0, inflation });
  }
  return out;
}

export function allTopics(): TopicParams[] {
  return (['compounding', 'cost', 'inflation'] as const).flatMap(enumerateTopics);
}
