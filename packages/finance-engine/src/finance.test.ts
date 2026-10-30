import { describe, expect, it } from 'vitest';
import {
  RISK_WARNING_NL,
  annuityFutureValue,
  buildReelCalculation,
  compareScenarios,
  formatEur,
  formatEurCents,
  formatPercent,
  futureValueOfMonthlyContributions,
  type MonthlyContributionInput,
} from './index.js';

/** Independent brute-force month-by-month simulation (no closed form). */
function bruteForceMonthly(m: number, years: number, monthlyRate: number, start: boolean, monthlyCostFactor = 1): number {
  let v = 0;
  for (let k = 0; k < years * 12; k++) {
    if (start) v += m;
    v = v * (1 + monthlyRate) * monthlyCostFactor;
    if (!start) v += m;
  }
  return v;
}
function bruteForceAnnual(m: number, years: number, r: number, start: boolean): number {
  let v = 0;
  for (let y = 0; y < years; y++) {
    if (start) v += 12 * m;
    v *= 1 + r;
    if (!start) v += 12 * m;
  }
  return v;
}

const base: MonthlyContributionInput = { monthlyContribution: 250, years: 30, annualReturn: 0.07, compounding: 'monthly', timing: 'end' };

describe('€250/month, 30 years, 7%', () => {
  it('effective convention (default), end of month: closed form == brute force', () => {
    const i = Math.pow(1.07, 1 / 12) - 1;
    const expected = bruteForceMonthly(250, 30, i, false);
    const r = futureValueOfMonthlyContributions(base);
    expect(r.input.rateConvention).toBe('effective');
    expect(r.totals.endValueNominal).toBeCloseTo(expected, 6);
    expect(r.totals.contributed).toBe(90_000);
    expect(r.totals.growth).toBeCloseTo(expected - 90_000, 6);
    // Regression pin (also verified by hand: 250 * ((1.07^30) - 1) / (1.07^(1/12) - 1)).
    expect(r.totalsCents.endValueNominal).toBe(29_236_315);
    expect(formatEur(r.totals.endValueNominal)).toBe('€\u00a0292.363');
  });

  it('nominal convention r/12 matches brute force (€ 304.993)', () => {
    const expected = bruteForceMonthly(250, 30, 0.07 / 12, false);
    const r = futureValueOfMonthlyContributions({ ...base, rateConvention: 'nominal' });
    expect(r.totals.endValueNominal).toBeCloseTo(expected, 6);
    expect(r.totalsCents.endValueNominal).toBe(30_499_275);
  });

  it('start-of-month timing matches brute force for both conventions', () => {
    const i = Math.pow(1.07, 1 / 12) - 1;
    expect(futureValueOfMonthlyContributions({ ...base, timing: 'start' }).totals.endValueNominal).toBeCloseTo(
      bruteForceMonthly(250, 30, i, true),
      6,
    );
    expect(
      futureValueOfMonthlyContributions({ ...base, timing: 'start', rateConvention: 'nominal' }).totals.endValueNominal,
    ).toBeCloseTo(bruteForceMonthly(250, 30, 0.07 / 12, true), 6);
  });

  it('annual compounding matches brute force (start and end)', () => {
    for (const timing of ['start', 'end'] as const) {
      const r = futureValueOfMonthlyContributions({ ...base, compounding: 'annual', timing });
      expect(r.periodsPerYear).toBe(1);
      expect(r.totals.endValueNominal).toBeCloseTo(bruteForceAnnual(250, 30, 0.07, timing === 'start'), 6);
    }
  });

  it('costs reduce the result and match brute force', () => {
    const c = 0.002;
    const r = futureValueOfMonthlyContributions({ ...base, annualCostRate: c });
    const g = Math.pow(1.07 * (1 - c), 1 / 12);
    expect(r.totals.endValueNominal).toBeCloseTo(bruteForceMonthly(250, 30, g - 1, false), 6);
    expect(r.totals.endValueNominal).toBeLessThan(futureValueOfMonthlyContributions(base).totals.endValueNominal);
  });

  it('real value deflates by (1+p)^years; null when no inflation given', () => {
    const r = futureValueOfMonthlyContributions({ ...base, inflationRate: 0.02 });
    expect(r.totals.endValueReal).toBeCloseTo(r.totals.endValueNominal / Math.pow(1.02, 30), 6);
    expect(futureValueOfMonthlyContributions(base).totals.endValueReal).toBeNull();
  });

  it('series has years 0..30, monotonic, ends at the total', () => {
    const r = futureValueOfMonthlyContributions(base);
    expect(r.series).toHaveLength(31);
    expect(r.series[0]).toEqual({ year: 0, contributed: 0, valueNominal: 0, growth: 0, valueReal: null });
    for (let y = 1; y <= 30; y++) {
      expect(r.series[y]!.valueNominal).toBeGreaterThan(r.series[y - 1]!.valueNominal);
      expect(r.series[y]!.valueNominal).toBeCloseTo(bruteForceMonthly(250, y, Math.pow(1.07, 1 / 12) - 1, false), 6);
    }
    expect(r.series[30]!.valueNominal).toBe(r.totals.endValueNominal);
  });
});

describe('edge cases', () => {
  it('0% return = sum of contributions; 0 years = 0', () => {
    expect(futureValueOfMonthlyContributions({ ...base, annualReturn: 0 }).totals.endValueNominal).toBeCloseTo(90_000, 9);
    expect(futureValueOfMonthlyContributions({ ...base, years: 0 }).totals.endValueNominal).toBe(0);
    expect(annuityFutureValue(100, 1, 12, 'start')).toBe(1200);
  });
  it('negative return works', () => {
    const r = futureValueOfMonthlyContributions({ ...base, annualReturn: -0.02 });
    expect(r.totals.growth).toBeLessThan(0);
  });
  it('rejects invalid input', () => {
    expect(() => futureValueOfMonthlyContributions({ ...base, monthlyContribution: -1 })).toThrow(RangeError);
    expect(() => futureValueOfMonthlyContributions({ ...base, years: 2.5 })).toThrow(RangeError);
    expect(() => futureValueOfMonthlyContributions({ ...base, annualReturn: -1 })).toThrow(RangeError);
    expect(() => futureValueOfMonthlyContributions({ ...base, annualCostRate: 1 })).toThrow(RangeError);
    expect(() => futureValueOfMonthlyContributions({ ...base, monthlyContribution: Number.NaN })).toThrow(RangeError);
  });
});

describe('scenarios', () => {
  it('first scenario is the baseline', () => {
    const res = compareScenarios([
      { label: '7%', input: base },
      { label: '4%', input: { ...base, annualReturn: 0.04 } },
    ]);
    expect(res[0]!.deltaVsBaseline).toBe(0);
    expect(res[1]!.deltaVsBaseline).toBeLessThan(0);
    expect(compareScenarios([])).toEqual([]);
  });
});

describe('nl-NL formatting (actual Intl output, NBSP after €)', () => {
  it('formats whole euros, cents, negatives, percents', () => {
    expect(formatEur(304976.4)).toBe('€\u00a0304.976');
    expect(formatEur(304976.4, { plainSpace: true })).toBe('€ 304.976');
    expect(formatEur(1234.5, { decimals: 2 })).toBe('€\u00a01.234,50');
    expect(formatEur(-1234.5, { decimals: 2 })).toBe('€\u00a0-1.234,50');
    expect(formatEurCents(12345)).toBe('€\u00a0123,45');
    expect(formatPercent(0.07)).toBe('7%');
    expect(formatPercent(0.0225)).toBe('2,25%');
    expect(() => formatEur(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('buildReelCalculation', () => {
  it('returns assumptions, series and Dutch lines for the €250 Reel', () => {
    const reel = buildReelCalculation();
    expect(reel.input).toMatchObject({ monthlyContribution: 250, years: 30, annualReturn: 0.07 });
    expect(reel.display.endValue).toBe('€\u00a0292.363');
    expect(reel.display.totalContributed).toBe('€\u00a090.000');
    expect(reel.display.growth).toBe('€\u00a0202.363');
    expect(reel.series).toHaveLength(31);
    expect(reel.assumptions.join(' ')).toMatch(/geen garantie/);
    expect(reel.assumptions.join(' ')).toMatch(/box 3/);
    expect(reel.assumptions.join(' ')).toMatch(/inflatie/);
    expect(reel.riskWarning).toBe(RISK_WARNING_NL);
    expect(reel.scenarios.map((s) => s.input.annualReturn)).toEqual([0.07, 0.04, 0]);
    expect(reel.scenarios[2]!.result.totals.endValueNominal).toBeCloseTo(90_000, 6);
    expect(reel.display.endValueReal).toBe(
      formatEur(reel.result.totals.endValueNominal / Math.pow(1.02, 30)),
    );
  });
});
