import { type DerivedMetricKey, DERIVED_METRIC_KEYS, type MetricInputs, deriveMetrics } from './metrics.js';

export interface PerformanceRecord extends MetricInputs {
  contentId: string;
  pillar: string | null;
  template: string | null;
  hook: string | null;
}

export type GroupKey = 'pillar' | 'template' | 'hook';

export interface MetricSummary {
  /** Items with a non-null value for this metric. */
  n: number;
  mean: number | null;
  median: number | null;
}

export interface GroupSummary {
  group: string;
  /** All items in the group (including those with missing data). */
  items: number;
  metrics: Record<DerivedMetricKey, MetricSummary>;
}

/** Default minimum items per group before a comparison may claim a winner. */
export const DEFAULT_MIN_SAMPLE_SIZE = 5;

export function summarize(values: readonly (number | null)[]): MetricSummary {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return { n: 0, mean: null, median: null };
  const mid = Math.floor(v.length / 2);
  return {
    n: v.length,
    mean: v.reduce((a, b) => a + b, 0) / v.length,
    median: v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2,
  };
}

/** Groups records by pillar/template/hook; items with a null key go to "(onbekend)". */
export function groupPerformance(records: readonly PerformanceRecord[], by: GroupKey): GroupSummary[] {
  const groups = new Map<string, PerformanceRecord[]>();
  for (const r of records) {
    const k = r[by] ?? '(onbekend)';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([group, rs]) => {
      const derived = rs.map((r) => deriveMetrics(r));
      const metrics = Object.fromEntries(DERIVED_METRIC_KEYS.map((k) => [k, summarize(derived.map((d) => d[k]))])) as Record<DerivedMetricKey, MetricSummary>;
      return { group, items: rs.length, metrics };
    })
    .sort((a, b) => a.group.localeCompare(b.group));
}

export interface ComparisonResult {
  metric: DerivedMetricKey;
  a: { group: string; n: number; mean: number | null };
  b: { group: string; n: number; mean: number | null };
  /** b.mean / a.mean - 1; null when not comparable. */
  relativeDifference: number | null;
  /** 'a' | 'b' when both meet the sample size; 'insufficient_data' otherwise; 'tie' when equal. */
  verdict: 'a' | 'b' | 'tie' | 'insufficient_data';
  minSampleSize: number;
  note: string;
}

/**
 * Compares two groups on one metric. Refuses to name a winner unless both groups have at least
 * `minSampleSize` items with data. This is a descriptive comparison, not a significance test.
 */
export function compareGroups(
  records: readonly PerformanceRecord[],
  by: GroupKey,
  groupA: string,
  groupB: string,
  metric: DerivedMetricKey,
  minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE,
): ComparisonResult {
  const summaries = groupPerformance(records, by);
  const get = (g: string) => summaries.find((s) => s.group === g)?.metrics[metric] ?? { n: 0, mean: null, median: null };
  const sa = get(groupA);
  const sb = get(groupB);
  const enough = sa.n >= minSampleSize && sb.n >= minSampleSize && sa.mean !== null && sb.mean !== null;
  const rel = sa.mean !== null && sb.mean !== null && sa.mean > 0 ? sb.mean / sa.mean - 1 : null;
  let verdict: ComparisonResult['verdict'] = 'insufficient_data';
  if (enough) verdict = sa.mean === sb.mean ? 'tie' : sa.mean! > sb.mean! ? 'a' : 'b';
  return {
    metric,
    a: { group: groupA, n: sa.n, mean: sa.mean },
    b: { group: groupB, n: sb.n, mean: sb.mean },
    relativeDifference: enough ? rel : null,
    verdict,
    minSampleSize,
    note: enough
      ? 'Beschrijvende vergelijking, geen significantietoets.'
      : `Te weinig data: minimaal ${minSampleSize} items met data per groep nodig (nu ${sa.n} vs ${sb.n}).`,
  };
}
