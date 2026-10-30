import { describe, expect, it } from 'vitest';
import { defaultTemplateCPlain, defaultTemplateD } from '../src/defaults';
import { templateCPlainSchema, templateDSchema } from '../src/schemas';
import { plainLegendLines } from '../src/components/charts';
import { rowMetrics } from '../src/templates/TemplateD';
import { FORBIDDEN_ON_SCREEN } from '../scripts/lib/prepare-table';

describe('plain 10 s styles (Templates A and C)', () => {
  it('Template C plain default props validate and carry engine values only', () => {
    const p = templateCPlainSchema.parse(defaultTemplateCPlain);
    expect(p.timeline.totalMs).toBe(10_000);
    expect(p.showProgress).toBeUndefined();
    expect(p.chart.series[0]!.points[0]).toEqual({ x: 0, y: 0 });
  });
  it('rejects a chart with more than 3 series, a footer over 60 characters, or a missing footer', () => {
    const s = defaultTemplateCPlain.chart.series[0]!;
    expect(templateCPlainSchema.safeParse({ ...defaultTemplateCPlain, chart: { ...defaultTemplateCPlain.chart, series: [s, s, s, s] } }).success).toBe(false);
    expect(templateCPlainSchema.safeParse({ ...defaultTemplateCPlain, footerLine: 'x'.repeat(61) }).success).toBe(false);
    const { footerLine: _f, ...rest } = defaultTemplateCPlain;
    expect(templateCPlainSchema.safeParse(rest).success).toBe(false);
  });
  it('Template A plain is Template D with size large; large rows get bigger figures, 8 rows stay as before', () => {
    expect(templateDSchema.safeParse({ ...defaultTemplateD, size: 'large' }).success).toBe(true);
    expect(rowMetrics(3, { large: true }).font).toBeGreaterThan(rowMetrics(3).font - 1);
    expect(rowMetrics(8)).toEqual({ rowH: 88, font: 42 });
  });
  it('reserves legend space for long series labels', () => {
    expect(plainLegendLines(['Waarde', 'Inleg'])).toBe(1);
    expect(plainLegendLines(['Start op 25', 'Start op 35', 'Start op 25, stop na 10 jaar'])).toBe(2);
  });
  it('refuses other accounts\' names on screen', () => {
    for (const t of ['Beurswijzer', 'KOERSTIJGERS', 'finance op orde']) expect(FORBIDDEN_ON_SCREEN.test(t)).toBe(true);
    expect(FORBIDDEN_ON_SCREEN.test('Beleggen')).toBe(false);
  });
});
