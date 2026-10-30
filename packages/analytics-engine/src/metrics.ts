/**
 * Derived metrics. Rule: unavailable input -> null output, never 0. Division by a zero
 * denominator also yields null (rate undefined), not 0 or Infinity.
 */

export interface MetricInputs {
  reach: number | null;
  views?: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
}

export interface DerivedMetrics {
  /** (likes + comments + shares + saves) / reach. */
  engagementPerReached: number | null;
  /** follows / reach * 1000. */
  followsPer1000Reached: number | null;
  /** shares / reach. */
  shareRate: number | null;
  /** saves / reach. */
  saveRate: number | null;
}

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined, scale = 1): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * scale;
}

/** Sum that is null if ANY part is null (a partial engagement total would be misleading). */
export function strictSum(values: readonly (number | null | undefined)[]): number | null {
  let s = 0;
  for (const v of values) {
    if (v == null) return null;
    s += v;
  }
  return s;
}

export function deriveMetrics(m: MetricInputs): DerivedMetrics {
  return {
    engagementPerReached: ratio(strictSum([m.likes, m.comments, m.shares, m.saves]), m.reach),
    followsPer1000Reached: ratio(m.follows, m.reach, 1000),
    shareRate: ratio(m.shares, m.reach),
    saveRate: ratio(m.saves, m.reach),
  };
}

export type DerivedMetricKey = keyof DerivedMetrics;
export const DERIVED_METRIC_KEYS: readonly DerivedMetricKey[] = ['engagementPerReached', 'followsPer1000Reached', 'shareRate', 'saveRate'];
