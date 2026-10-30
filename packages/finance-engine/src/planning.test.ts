import { describe, expect, it } from 'vitest';
import {
  annuityLoan,
  budgetSplit,
  compoundingFrequencyValue,
  contributeThenHold,
  dailyToMonthly,
  earlyVsLate,
  emergencyBuffer,
  futureValueOfMonthlyContributions,
  independenceTarget,
  lumpSumFutureValue,
  recoveryRequired,
  steppedSaving,
  timeToTarget,
} from './index.js';

describe('lumpSumFutureValue', () => {
  it('matches a year-by-year loop, with and without cost', () => {
    let v = 10_000;
    for (let y = 0; y < 30; y++) v = v * 1.06 * (1 - 0.015);
    expect(lumpSumFutureValue({ amount: 10_000, years: 30, annualReturn: 0.06, annualCostRate: 0.015 })).toBeCloseTo(v, 6);
    expect(lumpSumFutureValue({ amount: 1000, years: 10, annualReturn: 0.05 })).toBeCloseTo(1628.894627, 5);
    expect(lumpSumFutureValue({ amount: 1000, years: 0, annualReturn: 0.05 })).toBe(1000);
    expect(() => lumpSumFutureValue({ amount: 1, years: 1, annualReturn: 0.05, annualCostRate: 1 })).toThrow(RangeError);
  });
});

describe('compoundingFrequencyValue', () => {
  it('yearly compounding equals the lump sum formula; more periods give more', () => {
    const y = compoundingFrequencyValue({ principal: 10_000, years: 10, nominalRate: 0.06, periodsPerYear: 1 });
    expect(y.endValue).toBeCloseTo(lumpSumFutureValue({ amount: 10_000, years: 10, annualReturn: 0.06 }), 6);
    const m = compoundingFrequencyValue({ principal: 10_000, years: 10, nominalRate: 0.06, periodsPerYear: 12 });
    const d = compoundingFrequencyValue({ principal: 10_000, years: 10, nominalRate: 0.06, periodsPerYear: 365 });
    expect(m.endValue).toBeGreaterThan(y.endValue);
    expect(d.endValue).toBeGreaterThan(m.endValue);
    expect(d.endValue).toBeLessThan(10_000 * Math.exp(0.6)); // continuous compounding is the ceiling
    let v = 10_000;
    for (let k = 0; k < 120; k++) v *= 1 + 0.06 / 12;
    expect(m.endValue).toBeCloseTo(v, 6);
    expect(m.effectiveAnnualRate).toBeCloseTo(Math.pow(1.005, 12) - 1, 12);
  });
});

describe('contributeThenHold / earlyVsLate', () => {
  it('matches a month-by-month simulation', () => {
    const r = contributeThenHold({ monthlyContribution: 200, contributionYears: 10, holdYears: 30, annualReturn: 0.06 });
    const g = Math.pow(1.06, 1 / 12);
    let v = 0;
    for (let k = 0; k < 480; k++) v = k < 120 ? v * g + 200 : v * g;
    expect(r.endValue).toBeCloseTo(v, 5);
    expect(r.contributed).toBe(24_000);
  });
  it('early starter who keeps going beats the late starter; one who stops after 10 years is close', () => {
    const r = earlyVsLate({ monthlyContribution: 200, totalYears: 40, earlyContributionYears: 40, lateStartsAfterYears: 10, annualReturn: 0.06 });
    expect(r.early.contributed).toBe(96_000);
    expect(r.late.contributed).toBe(72_000);
    expect(r.late.endValue).toBeCloseTo(futureValueOfMonthlyContributions({ monthlyContribution: 200, years: 30, annualReturn: 0.06, compounding: 'monthly', timing: 'end' }).totals.endValueNominal, 6);
    expect(r.difference).toBeCloseTo(r.early.endValue - r.late.endValue, 9);
    expect(r.early.endValue).toBeGreaterThan(r.late.endValue);
    const stopper = earlyVsLate({ monthlyContribution: 200, totalYears: 40, earlyContributionYears: 10, lateStartsAfterYears: 10, annualReturn: 0.06 });
    expect(stopper.early.contributed).toBe(24_000);
    expect(stopper.early.endValue).toBeLessThan(stopper.late.endValue); // honest: 3x the contributions still wins a little
    expect(stopper.early.endValue / stopper.late.endValue).toBeGreaterThan(0.9);
    expect(() => earlyVsLate({ monthlyContribution: 1, totalYears: 5, earlyContributionYears: 6, lateStartsAfterYears: 1, annualReturn: 0.05 })).toThrow(RangeError);
  });
});

describe('annuityLoan', () => {
  it('5000 at 8% over 36 months = 156.68 per month, equal to a month-by-month schedule', () => {
    const r = annuityLoan({ principal: 5000, annualRate: 0.08, months: 36 });
    expect(r.monthlyPayment).toBeCloseTo(156.6818, 3);
    let bal = 5000;
    let interest = 0;
    for (let k = 0; k < 36; k++) {
      const i = bal * (0.08 / 12);
      interest += i;
      bal = bal + i - r.monthlyPayment;
    }
    expect(bal).toBeCloseTo(0, 6);
    expect(r.totalInterest).toBeCloseTo(interest, 6);
    expect(r.monthsToRepay).toBe(36);
    expect(r.totalPaid).toBeCloseTo(r.monthlyPayment * 36, 4);
    expect(r.totalInterest).toBeCloseTo(r.totalPaid - 5000, 6);
  });
  it('zero rate is principal / months with no interest', () => {
    const r = annuityLoan({ principal: 1200, annualRate: 0, months: 12 });
    expect(r.monthlyPayment).toBe(100);
    expect(r.totalInterest).toBe(0);
  });
  it('extra repayments shorten the loan and reduce interest', () => {
    const base = annuityLoan({ principal: 5000, annualRate: 0.08, months: 60 });
    const extra = annuityLoan({ principal: 5000, annualRate: 0.08, months: 60, extraMonthly: 50 });
    expect(extra.monthsToRepay).toBeLessThan(60);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
    expect(extra.totalPaid - 5000).toBeCloseTo(extra.totalInterest, 6);
    expect(extra.lastPayment).toBeLessThanOrEqual(extra.monthlyPayment + 50 + 1e-9);
  });
  it('rejects invalid input', () => {
    expect(() => annuityLoan({ principal: -1, annualRate: 0.05, months: 12 })).toThrow(RangeError);
    expect(() => annuityLoan({ principal: 100, annualRate: 0.05, months: 0 })).toThrow(RangeError);
  });
});

describe('independenceTarget', () => {
  it('4% means 25x annual expenses', () => {
    const r = independenceTarget({ annualExpenses: 30_000, withdrawalRate: 0.04 });
    expect(r.multiple).toBeCloseTo(25, 12);
    expect(r.target).toBeCloseTo(750_000, 6);
    expect(independenceTarget({ annualExpenses: 30_000, withdrawalRate: 0.03 }).target).toBeCloseTo(1_000_000, 6);
    expect(() => independenceTarget({ annualExpenses: 1, withdrawalRate: 0 })).toThrow(RangeError);
  });
});

describe('timeToTarget', () => {
  it('first month-end at or above the target, consistent with the closed form', () => {
    const t = timeToTarget({ target: 100_000, monthlyContribution: 500, annualReturn: 0.06 });
    expect(t.months).not.toBeNull();
    const at = (m: number) =>
      futureValueOfMonthlyContributions({ monthlyContribution: 500, years: 0, annualReturn: 0.06, compounding: 'monthly', timing: 'end' }).totals.endValueNominal + // 0
      (500 * (Math.pow(Math.pow(1.06, 1 / 12), m) - 1)) / (Math.pow(1.06, 1 / 12) - 1);
    expect(at(t.months!)).toBeGreaterThanOrEqual(100_000);
    expect(at(t.months! - 1)).toBeLessThan(100_000);
    expect(t.endValue).toBeCloseTo(at(t.months!), 6);
    expect(t.years! * 12 + t.remainderMonths!).toBe(t.months);
  });
  it('0% return is a plain division; unreachable gives nulls', () => {
    expect(timeToTarget({ target: 1200, monthlyContribution: 100, annualReturn: 0 }).months).toBe(12);
    expect(timeToTarget({ target: 1200, monthlyContribution: 0, annualReturn: 0 }).months).toBeNull();
    expect(timeToTarget({ target: 0, monthlyContribution: 0, annualReturn: 0 }).months).toBe(0);
  });
});

describe('budgetSplit', () => {
  it('50/30/20 of 2500 and parts always add up to the income in cents', () => {
    expect(budgetSplit(2500)).toEqual({ needs: 1250, wants: 750, savings: 500 });
    for (const income of [1999.99, 2345.67, 3000.01, 1]) {
      const s = budgetSplit(income);
      expect(Math.round((s.needs + s.wants + s.savings) * 100)).toBe(Math.round(income * 100));
    }
    expect(() => budgetSplit(1000, { needs: 0.5, wants: 0.5, savings: 0.5 })).toThrow(RangeError);
  });
});

describe('emergencyBuffer / dailyToMonthly', () => {
  it('computes target and months to build', () => {
    expect(emergencyBuffer({ monthlyExpenses: 2000, bufferMonths: 3 })).toEqual({ target: 6000, monthsToBuild: null });
    expect(emergencyBuffer({ monthlyExpenses: 2000, bufferMonths: 6, monthlySaving: 250 })).toEqual({ target: 12_000, monthsToBuild: 48 });
    expect(emergencyBuffer({ monthlyExpenses: 2000, bufferMonths: 3, monthlySaving: 250 }).monthsToBuild).toBe(24);
    expect(emergencyBuffer({ monthlyExpenses: 2000, bufferMonths: 3, monthlySaving: 0 }).monthsToBuild).toBeNull();
    expect(dailyToMonthly(4)).toBeCloseTo(121.6667, 4);
  });
});

describe('steppedSaving', () => {
  it('zero step equals the flat monthly future value; a step adds', () => {
    const flat = futureValueOfMonthlyContributions({ monthlyContribution: 100, years: 10, annualReturn: 0.06, compounding: 'monthly', timing: 'end' });
    const s0 = steppedSaving({ initialMonthly: 100, yearlyStep: 0, years: 10, annualReturn: 0.06 });
    expect(s0.endValue).toBeCloseTo(flat.totals.endValueNominal, 6);
    expect(s0.contributed).toBe(12_000);
    const s = steppedSaving({ initialMonthly: 100, yearlyStep: 50, years: 10, annualReturn: 0.06 });
    expect(s.finalMonthly).toBe(550);
    expect(s.contributed).toBe(12 * (100 * 10 + 50 * 45));
    expect(s.endValue).toBeGreaterThan(s0.endValue);
    expect(steppedSaving({ initialMonthly: 100, yearlyStep: 50, years: 0, annualReturn: 0.06 }).endValue).toBe(0);
  });
});

describe('recoveryRequired', () => {
  it('known points', () => {
    expect(recoveryRequired(0.5)).toBeCloseTo(1, 12);
    expect(recoveryRequired(0.1)).toBeCloseTo(1 / 9, 12);
    expect(recoveryRequired(0)).toBe(0);
    expect(() => recoveryRequired(1)).toThrow(RangeError);
  });
});

describe('lumpSumCostComparison', () => {
  it('difference is positive and equals low - high; matches the year loop', async () => {
    const { lumpSumCostComparison } = await import('./index.js');
    const r = lumpSumCostComparison({ amount: 10_000, years: 30, annualReturn: 0.06, lowCostRate: 0.002, highCostRate: 0.015 });
    let lo = 10_000;
    let hi = 10_000;
    for (let y = 0; y < 30; y++) {
      lo *= 1.06 * (1 - 0.002);
      hi *= 1.06 * (1 - 0.015);
    }
    expect(r.low).toBeCloseTo(lo, 6);
    expect(r.high).toBeCloseTo(hi, 6);
    expect(r.difference).toBeCloseTo(lo - hi, 6);
    expect(r.differenceShare).toBeCloseTo((lo - hi) / lo, 12);
    expect(() => lumpSumCostComparison({ amount: 1, years: 1, annualReturn: 0.05, lowCostRate: 0.02, highCostRate: 0.01 })).toThrow(RangeError);
  });
});
