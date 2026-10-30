import { annuityFutureValue, buildReelCalculation, periodGrowthFactor, type MonthlyContributionInput } from '@rj/finance-engine';
import type { ReelCalculation } from '../schemas';

/**
 * Maps @rj/finance-engine output to the video props shape (integer cents). Pure, so it runs both in
 * Node (render pipeline) and in the Remotion bundle (studio default props). No number is typed by hand.
 */
export function reelCalculationFromEngine(overrides: Partial<MonthlyContributionInput> = {}): ReelCalculation {
  const r = buildReelCalculation(overrides);
  const n = r.result.input;
  const c = r.result.totalsCents;
  const cents = (v: number) => Math.round(v * 100);
  if (n.compounding !== 'monthly') throw new Error('monthly series requires monthly compounding');
  // Same closed-form as the engine's yearly series (annuityFutureValue with the engine's growth factor),
  // evaluated at every month: no interpolation anywhere.
  const g = periodGrowthFactor(n);
  const monthly = Array.from({ length: n.years * 12 + 1 }, (_, m) => ({
    month: m,
    contributedCents: cents(n.monthlyContribution * m),
    valueCents: cents(annuityFutureValue(n.monthlyContribution, g, m, n.timing)),
  }));
  return {
    engine: '@rj/finance-engine',
    monthlyContributionCents: cents(n.monthlyContribution),
    years: n.years,
    annualReturnPct: Number((n.annualReturn * 100).toFixed(4)),
    contributionTiming: n.timing === 'end' ? 'end-of-month' : 'start-of-month',
    compounding: `${n.compounding}/${n.rateConvention}`,
    series: r.series.map((s) => ({ year: s.year, contributedCents: cents(s.contributed), valueCents: cents(s.valueNominal) })),
    monthly,
    totalContributedCents: c.contributed,
    finalValueCents: c.endValueNominal,
    growthCents: c.growth,
    inflation:
      n.inflationRate !== null && c.endValueReal !== null
        ? { annualRatePct: Number((n.inflationRate * 100).toFixed(4)), realFinalValueCents: c.endValueReal }
        : null,
    assumptionsNote: r.assumptions.join(' '),
  };
}
