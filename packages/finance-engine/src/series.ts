import { type FutureValueResult, type MonthlyContributionInput, futureValueOfMonthlyContributions } from './compound.js';

/**
 * Helpers for the series generator (@rj/series-engine). Pure and deterministic; every number a
 * generated script shows must come from here or from `compound.ts`.
 */

export interface CostComparison {
  lowCostRate: number;
  highCostRate: number;
  low: FutureValueResult;
  high: FutureValueResult;
  /** End value (nominal) low-cost minus high-cost, in euros (>= 0 when lowCostRate <= highCostRate). */
  difference: number;
  /** Same difference as share of the low-cost end value (0..1). */
  differenceShare: number;
  /** Difference in growth only is identical to `difference` (contributions are equal in both scenarios). */
  contributed: number;
}

/** Same plan twice, differing only in the yearly cost rate (e.g. 0.002 vs 0.015). */
export function compareAnnualCosts(base: Omit<MonthlyContributionInput, 'annualCostRate'>, lowCostRate: number, highCostRate: number): CostComparison {
  if (!(lowCostRate <= highCostRate)) throw new RangeError('lowCostRate must be <= highCostRate');
  const low = futureValueOfMonthlyContributions({ ...base, annualCostRate: lowCostRate });
  const high = futureValueOfMonthlyContributions({ ...base, annualCostRate: highCostRate });
  const difference = low.totals.endValueNominal - high.totals.endValueNominal;
  return {
    lowCostRate,
    highCostRate,
    low,
    high,
    difference,
    differenceShare: low.totals.endValueNominal === 0 ? 0 : difference / low.totals.endValueNominal,
    contributed: low.totals.contributed,
  };
}

/** Value in today's euros of a nominal amount that is received after `years`: amount / (1 + p)^years. */
export function realValueOfAmount(amount: number, years: number, inflationRate: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount must be a finite number >= 0');
  if (!Number.isInteger(years) || years < 0 || years > 100) throw new RangeError('years must be an integer 0..100');
  if (!Number.isFinite(inflationRate) || inflationRate <= -1) throw new RangeError('inflationRate must be > -1');
  return amount / Math.pow(1 + inflationRate, years);
}

/** Purchasing power lost on a fixed nominal amount after `years` (euros, >= 0 for inflation >= 0). */
export function purchasingPowerLoss(amount: number, years: number, inflationRate: number): number {
  return amount - realValueOfAmount(amount, years, inflationRate);
}
