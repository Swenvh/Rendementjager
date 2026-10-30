import { buildReelCalculation } from '@rj/finance-engine';
import { describe, expect, it } from 'vitest';
import { reelCalculationFromEngine } from '../src/calc/from-finance-engine';
import { defaultTemplateB, defaultTemplateC } from '../src/defaults';
import { templateBSchema, templateCSchema } from '../src/schemas';
import { buildTokens, fillTokens, roundedEuroPhrase } from '../scripts/lib/prepare';

describe('reel calculation mapping', () => {
  it('uses @rj/finance-engine numbers in cents', () => {
    const c = reelCalculationFromEngine();
    expect(c.engine).toBe('@rj/finance-engine');
    expect(c.totalContributedCents).toBe(9_000_000);
    expect(Math.round(c.finalValueCents / 100)).toBe(292_363);
    expect(c.series).toHaveLength(31);
    expect(c.contributionTiming).toBe('end-of-month');
    expect(c.inflation?.annualRatePct).toBe(2);
  });
  it('default props validate; Template B requires source + date', () => {
    expect(() => templateCSchema.parse(defaultTemplateC)).not.toThrow();
    expect(() => templateBSchema.parse(defaultTemplateB)).not.toThrow();
    expect(() => templateBSchema.parse({ ...defaultTemplateB, source: { ...defaultTemplateB.source, publishedAt: '' } })).toThrow();
  });
});

describe('script tokens', () => {
  it('spoken rounding never overstates', () => {
    expect(roundedEuroPhrase(292_363)).toBe('ruim €292.000');
    expect(roundedEuroPhrase(161_800)).toBe('bijna €162.000');
  });
  it('fills tokens from the calculation and rejects unknown ones', () => {
    const t = buildTokens();
    expect(fillTokens('{{monthlyContribution}} · {{annualReturn}}', t)).toBe('€250 · 7%');
    expect(() => fillTokens('{{nope}}', t)).toThrow();
  });
});

describe('growth scene values come from the engine series', () => {
  const engine = buildReelCalculation();
  const calc = reelCalculationFromEngine();
  it('monthly value at every whole year equals the engine yearly series', () => {
    for (const y of engine.series) {
      const m = calc.monthly[y.year * 12]!;
      expect(m.valueCents).toBe(Math.round(y.valueNominal * 100));
      expect(m.contributedCents).toBe(Math.round(y.contributed * 100));
    }
  });
  it('year 29 is the true value, not an interpolation', () => {
    expect(calc.monthly[29 * 12]!.valueCents).toBe(Math.round(engine.series[29]!.valueNominal * 100));
    expect(Math.round(calc.monthly[29 * 12]!.valueCents / 100)).not.toBe(280_576);
  });
  it('monthly series ends at the final value and is strictly increasing', () => {
    expect(calc.monthly.at(-1)!.valueCents).toBe(calc.finalValueCents);
    for (let i = 1; i < calc.monthly.length; i++) expect(calc.monthly[i]!.valueCents).toBeGreaterThan(calc.monthly[i - 1]!.valueCents);
  });
});
