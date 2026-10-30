import {
  annuityLoan,
  budgetSplit,
  compoundingFrequencyValue,
  dailyToMonthly,
  earlyVsLate,
  emergencyBuffer,
  formatPercent,
  futureValueOfMonthlyContributions,
  independenceTarget,
  lumpSumCostComparison,
  lumpSumFutureValue,
  realValueOfAmount,
  recoveryRequired,
  steppedSaving,
  timeToTarget,
} from '@rj/finance-engine';
import type { UNITS } from './schema.js';

export type Unit = (typeof UNITS)[number];

/** Every finance-engine function an idea may cite, with a single JSON object as input. */
export const REGISTRY = {
  futureValueOfMonthlyContributions: (i: any) => futureValueOfMonthlyContributions(i),
  lumpSumFutureValue: (i: any) => lumpSumFutureValue(i),
  lumpSumCostComparison: (i: any) => lumpSumCostComparison(i),
  compoundingFrequencyValue: (i: any) => compoundingFrequencyValue(i),
  earlyVsLate: (i: any) => earlyVsLate(i),
  annuityLoan: (i: any) => annuityLoan(i),
  independenceTarget: (i: any) => independenceTarget(i),
  timeToTarget: (i: any) => timeToTarget(i),
  budgetSplit: (i: any) => budgetSplit(i.netMonthlyIncome),
  emergencyBuffer: (i: any) => emergencyBuffer(i),
  dailyToMonthly: (i: any) => dailyToMonthly(i.daily),
  steppedSaving: (i: any) => steppedSaving(i),
  realValueOfAmount: (i: any) => realValueOfAmount(i.amount, i.years, i.inflationRate),
  recoveryRequired: (i: any) => recoveryRequired(i.drop),
} as const;
export type FnName = keyof typeof REGISTRY;

export interface Calc {
  value: number;
  ref: string;
}

function getPath(obj: unknown, path: string): unknown {
  if (path === 'result') return obj;
  return path.split('.').reduce<unknown>((o, k) => (o === null || o === undefined ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** Runs one finance-engine function and returns the number at `path` plus its machine-readable reference. */
export function calc(fn: FnName, input: Record<string, unknown>, path: string): Calc {
  const out = getPath(REGISTRY[fn](input), path);
  if (typeof out !== 'number' || !Number.isFinite(out)) throw new Error(`calc ${fn}#${path} did not give a finite number (got ${String(out)})`);
  return { value: out, ref: `@rj/finance-engine:${fn}(${JSON.stringify(input)})#${path}` };
}

/** Re-evaluates a reference string (used by the tests to prove every number is reproducible). */
export function evaluateRef(ref: string): number {
  const m = /^@rj\/finance-engine:([A-Za-z]+)\((.*)\)#([A-Za-z0-9_.]+)$/s.exec(ref);
  if (!m) throw new Error(`bad calculationRef: ${ref}`);
  const fn = m[1] as FnName;
  if (!(fn in REGISTRY)) throw new Error(`unknown finance-engine function in ref: ${fn}`);
  const input = JSON.parse(m[2]!) as Record<string, unknown>;
  const out = getPath(REGISTRY[fn](input), m[3]!);
  if (typeof out !== 'number') throw new Error(`ref did not evaluate to a number: ${ref}`);
  return out;
}

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** On-screen formats: "€9.006", "-€4.120", "11,1%", "3 jaar en 4 mnd" (same style as the table Reel). */
export function formatValue(unit: Unit, v: number): string {
  switch (unit) {
    case 'eur':
    case 'eur2': {
      const body = unit === 'eur' ? nf0.format(Math.abs(v)) : nf2.format(Math.abs(v));
      const rounded = unit === 'eur' ? Math.round(v) : Math.round(v * 100) / 100;
      return `${rounded < 0 ? '-' : ''}€${body}`;
    }
    case 'pct0':
      return formatPercent(v, 0);
    case 'pct1':
      return formatPercent(v, 1);
    case 'pct2':
      return new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    case 'duration': {
      const months = Math.round(v);
      const y = Math.floor(months / 12);
      const mo = months % 12;
      if (y === 0) return `${mo} mnd`;
      return mo === 0 ? `${y} jaar` : `${y} jaar en ${mo} mnd`;
    }
    case 'text':
      return String(v);
  }
}

/** Euro helper for caption/storyboard strings. */
export const eur = (v: number): string => formatValue('eur', v);
export const eur2 = (v: number): string => formatValue('eur2', v);
