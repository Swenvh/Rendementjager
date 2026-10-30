import { futureValueOfMonthlyContributions } from './compound.js';

/**
 * Planning helpers for the "15 ideas" document (loan/annuity, early vs late, 25x rule, time to target,
 * compounding frequency, budget split, buffer, stepped saving, drawdown recovery).
 *
 * CONVENTIONS (same spirit as compound.ts): returns are effective per year unless a function says
 * "nominal"; everything is nominal euros, before tax, and hypothetical. Results are unrounded floats.
 */

function assertFinite(name: string, v: number, min = 0): void {
  if (!Number.isFinite(v) || v < min) throw new RangeError(`${name} must be a finite number >= ${min}`);
}
function assertYears(years: number): void {
  if (!Number.isInteger(years) || years < 0 || years > 100) throw new RangeError('years must be an integer 0..100');
}

/** Lump sum, effective yearly return r and yearly cost rate c: amount * ((1 + r)(1 - c))^years. */
export function lumpSumFutureValue(input: { amount: number; years: number; annualReturn: number; annualCostRate?: number }): number {
  assertFinite('amount', input.amount);
  assertYears(input.years);
  const c = input.annualCostRate ?? 0;
  if (!Number.isFinite(input.annualReturn) || input.annualReturn <= -1) throw new RangeError('annualReturn must be > -1');
  if (!Number.isFinite(c) || c < 0 || c >= 1) throw new RangeError('annualCostRate must be in [0, 1)');
  return input.amount * Math.pow((1 + input.annualReturn) * (1 - c), input.years);
}

export type CompoundingPeriods = 1 | 4 | 12 | 52 | 365;

/**
 * Compounding frequency comparison on a lump sum with a NOMINAL yearly rate: P * (1 + rate/n)^(n*years).
 * `effectiveAnnualRate` = (1 + rate/n)^n - 1.
 */
export function compoundingFrequencyValue(input: { principal: number; years: number; nominalRate: number; periodsPerYear: number }): {
  endValue: number;
  effectiveAnnualRate: number;
} {
  assertFinite('principal', input.principal);
  assertYears(input.years);
  if (!Number.isFinite(input.nominalRate) || input.nominalRate <= -1) throw new RangeError('nominalRate must be > -1');
  if (!Number.isInteger(input.periodsPerYear) || input.periodsPerYear < 1) throw new RangeError('periodsPerYear must be an integer >= 1');
  const n = input.periodsPerYear;
  const factor = Math.pow(1 + input.nominalRate / n, n);
  return { endValue: input.principal * Math.pow(factor, input.years), effectiveAnnualRate: factor - 1 };
}

export interface ContributeThenHoldInput {
  monthlyContribution: number;
  contributionYears: number;
  /** Years after the last contribution during which the balance only grows. */
  holdYears: number;
  annualReturn: number;
}
export interface ContributeThenHoldResult {
  contributed: number;
  valueAtEndOfContributions: number;
  endValue: number;
  growth: number;
}

/** Monthly contributions (end of month, effective rate) for N years, then the balance grows alone for `holdYears`. */
export function contributeThenHold(input: ContributeThenHoldInput): ContributeThenHoldResult {
  assertYears(input.holdYears);
  const fv = futureValueOfMonthlyContributions({
    monthlyContribution: input.monthlyContribution,
    years: input.contributionYears,
    annualReturn: input.annualReturn,
    compounding: 'monthly',
    timing: 'end',
    rateConvention: 'effective',
  });
  const atEnd = fv.totals.endValueNominal;
  const endValue = atEnd * Math.pow(1 + input.annualReturn, input.holdYears);
  return { contributed: fv.totals.contributed, valueAtEndOfContributions: atEnd, endValue, growth: endValue - fv.totals.contributed };
}

export interface EarlyVsLateInput {
  monthlyContribution: number;
  /** Total years from the early starter's first contribution to the end date. */
  totalYears: number;
  /** Years the early starter contributes (then stops and lets it grow). */
  earlyContributionYears: number;
  /** The late starter starts this many years later and contributes until the end date. */
  lateStartsAfterYears: number;
  annualReturn: number;
}
export interface EarlyVsLateResult {
  early: ContributeThenHoldResult;
  late: ContributeThenHoldResult;
  /** early.endValue - late.endValue (can be negative). */
  difference: number;
}

/**
 * Two hypothetical savers, same monthly amount, same end date. The early one contributes for
 * `earlyContributionYears` then stops; the late one starts `lateStartsAfterYears` later and contributes until the end.
 */
export function earlyVsLate(input: EarlyVsLateInput): EarlyVsLateResult {
  if (input.earlyContributionYears > input.totalYears || input.lateStartsAfterYears > input.totalYears)
    throw new RangeError('contribution/delay years must not exceed totalYears');
  const early = contributeThenHold({
    monthlyContribution: input.monthlyContribution,
    contributionYears: input.earlyContributionYears,
    holdYears: input.totalYears - input.earlyContributionYears,
    annualReturn: input.annualReturn,
  });
  const late = contributeThenHold({
    monthlyContribution: input.monthlyContribution,
    contributionYears: input.totalYears - input.lateStartsAfterYears,
    holdYears: 0,
    annualReturn: input.annualReturn,
  });
  return { early, late, difference: early.endValue - late.endValue };
}

export interface LoanInput {
  principal: number;
  /** NOMINAL yearly interest rate; monthly rate = rate / 12. */
  annualRate: number;
  months: number;
  /** Extra repayment per month on top of the annuity payment (default 0). */
  extraMonthly?: number;
}
export interface LoanResult {
  /** Regular annuity payment per month (without the extra repayment). */
  monthlyPayment: number;
  /** Months until the balance is zero (< input.months when extra repayments are made). */
  monthsToRepay: number;
  totalInterest: number;
  totalPaid: number;
  /** Payment in the last month (can be lower than the regular one). */
  lastPayment: number;
}

/** Annuity loan: constant payment P*i/(1-(1+i)^-n), month-end payments, i = nominal rate / 12. */
export function annuityLoan(input: LoanInput): LoanResult {
  assertFinite('principal', input.principal);
  assertFinite('annualRate', input.annualRate);
  const extra = input.extraMonthly ?? 0;
  assertFinite('extraMonthly', extra);
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 1200) throw new RangeError('months must be an integer 1..1200');
  const i = input.annualRate / 12;
  const n = input.months;
  const payment = i === 0 ? input.principal / n : (input.principal * i) / (1 - Math.pow(1 + i, -n));
  let balance = input.principal;
  let totalInterest = 0;
  let paid = 0;
  let months = 0;
  let last = 0;
  while (balance > 1e-9 && months < 1200) {
    const interest = balance * i;
    const pay = Math.min(payment + extra, balance + interest);
    balance = balance + interest - pay;
    totalInterest += interest;
    paid += pay;
    last = pay;
    months++;
  }
  return { monthlyPayment: payment, monthsToRepay: months, totalInterest, totalPaid: paid, lastPayment: last };
}

/** Financial-independence rule of thumb: target = annual expenses / withdrawal rate (4% -> 25x). */
export function independenceTarget(input: { annualExpenses: number; withdrawalRate: number }): { target: number; multiple: number } {
  assertFinite('annualExpenses', input.annualExpenses);
  if (!Number.isFinite(input.withdrawalRate) || input.withdrawalRate <= 0 || input.withdrawalRate >= 1)
    throw new RangeError('withdrawalRate must be in (0, 1)');
  const multiple = 1 / input.withdrawalRate;
  return { target: input.annualExpenses * multiple, multiple };
}

export interface TimeToTargetResult {
  /** First month-end at which the balance is >= target; null when not reached within `maxMonths`. */
  months: number | null;
  years: number | null;
  /** Remaining months after full years (0..11). */
  remainderMonths: number | null;
  contributed: number | null;
  endValue: number | null;
}

/** Months until monthly contributions (end of month, effective yearly rate, no costs) reach the target. */
export function timeToTarget(input: { target: number; monthlyContribution: number; annualReturn: number; startAmount?: number; maxMonths?: number }): TimeToTargetResult {
  assertFinite('target', input.target);
  assertFinite('monthlyContribution', input.monthlyContribution);
  const start = input.startAmount ?? 0;
  assertFinite('startAmount', start);
  if (!Number.isFinite(input.annualReturn) || input.annualReturn <= -1) throw new RangeError('annualReturn must be > -1');
  const max = input.maxMonths ?? 1200;
  const g = Math.pow(1 + input.annualReturn, 1 / 12);
  let v = start;
  for (let m = 0; m <= max; m++) {
    if (v >= input.target - 1e-9) {
      return { months: m, years: Math.floor(m / 12), remainderMonths: m % 12, contributed: start + input.monthlyContribution * m, endValue: v };
    }
    v = v * g + input.monthlyContribution;
  }
  return { months: null, years: null, remainderMonths: null, contributed: null, endValue: null };
}

export interface BudgetSplit {
  needs: number;
  wants: number;
  savings: number;
}

/** Rule-of-thumb split of a net monthly income (default 50/30/20), whole cents, parts add up exactly. */
export function budgetSplit(netMonthlyIncome: number, shares: { needs: number; wants: number; savings: number } = { needs: 0.5, wants: 0.3, savings: 0.2 }): BudgetSplit {
  assertFinite('netMonthlyIncome', netMonthlyIncome);
  const total = shares.needs + shares.wants + shares.savings;
  if (Math.abs(total - 1) > 1e-9) throw new RangeError('shares must add up to 1');
  const cents = Math.round(netMonthlyIncome * 100);
  const needs = Math.round(cents * shares.needs);
  const wants = Math.round(cents * shares.wants);
  const savings = cents - needs - wants;
  return { needs: needs / 100, wants: wants / 100, savings: savings / 100 };
}

/** Emergency buffer: monthly expenses x months, and how many months of saving it takes to build it. */
export function emergencyBuffer(input: { monthlyExpenses: number; bufferMonths: number; monthlySaving?: number }): { target: number; monthsToBuild: number | null } {
  assertFinite('monthlyExpenses', input.monthlyExpenses);
  assertFinite('bufferMonths', input.bufferMonths);
  const target = input.monthlyExpenses * input.bufferMonths;
  const s = input.monthlySaving;
  if (s === undefined) return { target, monthsToBuild: null };
  assertFinite('monthlySaving', s);
  return { target, monthsToBuild: s === 0 ? null : Math.ceil(target / s - 1e-9) };
}

/** Daily amount to an average monthly amount: daily * 365 / 12. */
export function dailyToMonthly(daily: number): number {
  assertFinite('daily', daily);
  return (daily * 365) / 12;
}

export interface SteppedSavingInput {
  initialMonthly: number;
  /** Extra monthly amount added at the start of every year after the first. */
  yearlyStep: number;
  years: number;
  annualReturn: number;
}
export interface SteppedSavingResult {
  contributed: number;
  endValue: number;
  growth: number;
  /** Monthly amount in the final year. */
  finalMonthly: number;
}

/** Month-end contributions that rise by `yearlyStep` each year; effective monthly rate from the yearly return. */
export function steppedSaving(input: SteppedSavingInput): SteppedSavingResult {
  assertFinite('initialMonthly', input.initialMonthly);
  assertFinite('yearlyStep', input.yearlyStep);
  assertYears(input.years);
  if (!Number.isFinite(input.annualReturn) || input.annualReturn <= -1) throw new RangeError('annualReturn must be > -1');
  const g = Math.pow(1 + input.annualReturn, 1 / 12);
  let v = 0;
  let contributed = 0;
  for (let y = 0; y < input.years; y++) {
    const m = input.initialMonthly + input.yearlyStep * y;
    for (let k = 0; k < 12; k++) {
      v = v * g + m;
      contributed += m;
    }
  }
  return {
    contributed,
    endValue: v,
    growth: v - contributed,
    finalMonthly: input.years === 0 ? 0 : input.initialMonthly + input.yearlyStep * (input.years - 1),
  };
}

/** Gain needed after a fall of `drop` (0.5 = -50%) to be back at the old level: 1/(1-drop) - 1. */
export function recoveryRequired(drop: number): number {
  if (!Number.isFinite(drop) || drop < 0 || drop >= 1) throw new RangeError('drop must be in [0, 1)');
  return 1 / (1 - drop) - 1;
}

export interface LumpSumCostComparison {
  low: number;
  high: number;
  /** low - high (euros, >= 0 when lowCostRate <= highCostRate). */
  difference: number;
  /** difference as share of `low` (0..1). */
  differenceShare: number;
}

/** Same lump sum twice, differing only in the yearly cost rate (e.g. 0.002 vs 0.015); cost as (1+r)(1-c). */
export function lumpSumCostComparison(input: { amount: number; years: number; annualReturn: number; lowCostRate: number; highCostRate: number }): LumpSumCostComparison {
  if (!(input.lowCostRate <= input.highCostRate)) throw new RangeError('lowCostRate must be <= highCostRate');
  const low = lumpSumFutureValue({ ...input, annualCostRate: input.lowCostRate });
  const high = lumpSumFutureValue({ ...input, annualCostRate: input.highCostRate });
  return { low, high, difference: low - high, differenceShare: low === 0 ? 0 : (low - high) / low };
}
