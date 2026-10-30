/**
 * Future value of a recurring monthly contribution.
 *
 * CONVENTIONS (deterministic, documented — every on-screen number must state its assumptions):
 *
 * - `annualReturn` r is a yearly rate (0.07 = 7%).
 * - `rateConvention` decides how r becomes a monthly rate i when compounding is 'monthly':
 *     'effective' (DEFAULT): i = (1 + r)^(1/12) - 1. Twelve monthly steps give exactly r per year.
 *                            This is how fund/index returns are quoted, so it is the default.
 *     'nominal':             i = r / 12. Compounding monthly then yields (1 + r/12)^12 - 1 > r per
 *                            year (7% nominal -> 7.229% effective). Many online calculators use this.
 * - `compounding`:
 *     'monthly': every month the balance grows by i; contributions are made monthly.
 *     'annual':  growth is credited once a year at r; the 12 monthly contributions of a year are
 *                treated as one lump of 12 x monthlyContribution, deposited at the start of the
 *                year ('start') or at the end of the year ('end'), i.e. no growth within the year.
 * - `timing`: 'end' (DEFAULT, ordinary annuity) = contribution after the period's growth;
 *             'start' (annuity due) = contribution before the period's growth.
 * - `annualCostRate` c (e.g. 0.002 = 0.2% TER) is charged on the balance: the net yearly growth
 *   factor is (1 + r) * (1 - c). 'effective' monthly factor = ((1 + r)(1 - c))^(1/12);
 *   'nominal' monthly factor = (1 + r/12) * (1 - c/12); 'annual' factor = (1 + r)(1 - c).
 * - `inflationRate` p: real value (in today's euros) = nominal / (1 + p)^years. Optional; null if
 *   not given.
 * - Taxes (e.g. box 3) are NOT modelled. Results are unrounded floats in euros; `totalsCents`
 *   holds the same totals rounded to whole cents.
 */

export type Compounding = 'monthly' | 'annual';
export type Timing = 'start' | 'end';
export type RateConvention = 'effective' | 'nominal';

export interface MonthlyContributionInput {
  monthlyContribution: number;
  years: number;
  annualReturn: number;
  compounding: Compounding;
  timing: Timing;
  annualCostRate?: number;
  inflationRate?: number;
  rateConvention?: RateConvention;
}

export interface NormalizedInput extends Required<Omit<MonthlyContributionInput, 'inflationRate'>> {
  inflationRate: number | null;
}

export interface YearPoint {
  year: number;
  contributed: number;
  valueNominal: number;
  growth: number;
  valueReal: number | null;
}

export interface Totals {
  contributed: number;
  endValueNominal: number;
  growth: number;
  endValueReal: number | null;
}

export interface TotalsCents {
  contributed: number;
  endValueNominal: number;
  growth: number;
  endValueReal: number | null;
}

export interface FutureValueResult {
  input: NormalizedInput;
  /** Growth factor per compounding period, net of costs (e.g. 1.005654 per month). */
  periodGrowthFactor: number;
  periodsPerYear: 12 | 1;
  totals: Totals;
  totalsCents: TotalsCents;
  /** One point per year from 0 to `years` (year 0 = nothing invested yet). */
  series: YearPoint[];
}

export function normalizeInput(input: MonthlyContributionInput): NormalizedInput {
  const n: NormalizedInput = {
    monthlyContribution: input.monthlyContribution,
    years: input.years,
    annualReturn: input.annualReturn,
    compounding: input.compounding,
    timing: input.timing,
    annualCostRate: input.annualCostRate ?? 0,
    inflationRate: input.inflationRate ?? null,
    rateConvention: input.rateConvention ?? 'effective',
  };
  if (!Number.isFinite(n.monthlyContribution) || n.monthlyContribution < 0)
    throw new RangeError('monthlyContribution must be a finite number >= 0');
  if (!Number.isInteger(n.years) || n.years < 0 || n.years > 100) throw new RangeError('years must be an integer 0..100');
  if (!Number.isFinite(n.annualReturn) || n.annualReturn <= -1) throw new RangeError('annualReturn must be > -1');
  if (!Number.isFinite(n.annualCostRate) || n.annualCostRate < 0 || n.annualCostRate >= 1)
    throw new RangeError('annualCostRate must be in [0, 1)');
  if (n.inflationRate !== null && (!Number.isFinite(n.inflationRate) || n.inflationRate <= -1))
    throw new RangeError('inflationRate must be > -1');
  if (n.compounding !== 'monthly' && n.compounding !== 'annual') throw new RangeError('compounding must be monthly|annual');
  if (n.timing !== 'start' && n.timing !== 'end') throw new RangeError('timing must be start|end');
  if (n.rateConvention !== 'effective' && n.rateConvention !== 'nominal')
    throw new RangeError('rateConvention must be effective|nominal');
  return n;
}

export function periodGrowthFactor(n: NormalizedInput): number {
  const r = n.annualReturn;
  const c = n.annualCostRate;
  if (n.compounding === 'annual') return (1 + r) * (1 - c);
  if (n.rateConvention === 'nominal') return (1 + r / 12) * (1 - c / 12);
  return Math.pow((1 + r) * (1 - c), 1 / 12);
}

/** Closed-form future value of `periods` equal payments with per-period growth factor g. */
export function annuityFutureValue(payment: number, g: number, periods: number, timing: Timing): number {
  if (periods === 0) return 0;
  const base = Math.abs(g - 1) < 1e-15 ? payment * periods : (payment * (Math.pow(g, periods) - 1)) / (g - 1);
  return timing === 'start' ? base * g : base;
}

function valueAfterYears(n: NormalizedInput, g: number, years: number): number {
  return n.compounding === 'annual'
    ? annuityFutureValue(n.monthlyContribution * 12, g, years, n.timing)
    : annuityFutureValue(n.monthlyContribution, g, years * 12, n.timing);
}

export function futureValueOfMonthlyContributions(input: MonthlyContributionInput): FutureValueResult {
  const n = normalizeInput(input);
  const g = periodGrowthFactor(n);
  const real = (v: number, y: number) => (n.inflationRate === null ? null : v / Math.pow(1 + n.inflationRate, y));
  const series: YearPoint[] = [];
  for (let y = 0; y <= n.years; y++) {
    const contributed = n.monthlyContribution * 12 * y;
    const valueNominal = valueAfterYears(n, g, y);
    series.push({ year: y, contributed, valueNominal, growth: valueNominal - contributed, valueReal: real(valueNominal, y) });
  }
  const last = series[series.length - 1]!;
  const totals: Totals = {
    contributed: last.contributed,
    endValueNominal: last.valueNominal,
    growth: last.growth,
    endValueReal: last.valueReal,
  };
  const cents = (v: number) => Math.round(v * 100);
  return {
    input: n,
    periodGrowthFactor: g,
    periodsPerYear: n.compounding === 'annual' ? 1 : 12,
    totals,
    totalsCents: {
      contributed: cents(totals.contributed),
      endValueNominal: cents(totals.endValueNominal),
      growth: cents(totals.growth),
      endValueReal: totals.endValueReal === null ? null : cents(totals.endValueReal),
    },
    series,
  };
}

export interface Scenario {
  label: string;
  input: MonthlyContributionInput;
}

export interface ScenarioResult extends Scenario {
  result: FutureValueResult;
  /** Difference in end value vs the first scenario (baseline). */
  deltaVsBaseline: number;
}

/** Runs several scenarios; the first is the baseline for `deltaVsBaseline`. */
export function compareScenarios(scenarios: readonly Scenario[]): ScenarioResult[] {
  if (scenarios.length === 0) return [];
  const results = scenarios.map((s) => ({ ...s, result: futureValueOfMonthlyContributions(s.input) }));
  const base = results[0]!.result.totals.endValueNominal;
  return results.map((r) => ({ ...r, deltaVsBaseline: r.result.totals.endValueNominal - base }));
}

/** Convenience: same input with different annual returns (e.g. [0.04, 0.07]). */
export function returnScenarios(input: MonthlyContributionInput, returns: readonly number[]): ScenarioResult[] {
  return compareScenarios(
    returns.map((r) => ({ label: `${(r * 100).toLocaleString('nl-NL')}% per jaar`, input: { ...input, annualReturn: r } })),
  );
}
