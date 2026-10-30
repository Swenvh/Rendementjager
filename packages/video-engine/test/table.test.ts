import { futureValueOfMonthlyContributions } from '@rj/finance-engine';
import { describe, expect, it } from 'vitest';
import { buildMatrixTable } from '../src/calc/matrix';
import { defaultTemplateD } from '../src/defaults';
import { datasetFromCsv, datasetToTable, formatDatasetValue, sortDataset, validateDataset, type Dataset } from '../src/dataset';
import { templateDSchema } from '../src/schemas';
import { rowMetrics } from '../src/templates/TemplateD';
import { tableSceneMs } from '../scripts/lib/prepare-table';

const today = new Date('2026-10-30T12:00:00Z');
const src = { name: 'Aanbieder X', url: 'https://example.org/data' };
const row = (name: string, value: number) => ({ cells: { ticker: name.slice(0, 3).toUpperCase(), naam: name }, value, source: src, asOfDate: '2026-10-15', period: 'kalenderjaar 2025' });
const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const ds = (over: Partial<Dataset> = {}): Dataset => ({
  version: 1, id: 'test-ranking', title: 'Voorbeeldlijst', subject: 'products', metric: 'Totaalrendement', unit: 'percent', sortDirection: 'desc', valueLabel: 'Rendement 2025',
  columns: [{ key: 'ticker', label: 'Ticker' }, { key: 'naam', label: 'Naam' }], source: src, asOfDate: '2026-10-15', period: 'kalenderjaar 2025',
  rows: names.map((n, i) => row(n, 20 - i * 3.7)), ...over,
});

describe('calculated matrix (Template D)', () => {
  it('every cell is one @rj/finance-engine call, nominal, stated assumptions', () => {
    const m = buildMatrixTable({ annualReturn: 0.07, amounts: [250], horizons: [30] });
    const t = futureValueOfMonthlyContributions({ monthlyContribution: 250, years: 30, annualReturn: 0.07, compounding: 'monthly', timing: 'end', rateConvention: 'effective', annualCostRate: 0 }).totals;
    expect(Math.round(t.endValueNominal)).toBe(292_363); // same figure as the first Reel
    expect(m.rows[0]!.cells.y30).toBe('€292.363');
    expect(m.assumptions.join(' ')).toMatch(/7%.*effectief.*hypothetisch/);
    expect(m.assumptions.join(' ')).toMatch(/zonder kosten, belasting en inflatie/);
  });
  it('is deterministic and highlights at most one row', () => {
    const a = buildMatrixTable({ annualReturn: 0.06, amounts: [50, 100, 250], horizons: [10, 20] });
    expect(a).toEqual(buildMatrixTable({ annualReturn: 0.06, amounts: [50, 100, 250], horizons: [10, 20] }));
    expect(a.rows.filter((r) => r.highlight)).toHaveLength(1);
  });
  it('default props validate', () => expect(() => templateDSchema.parse(defaultTemplateD)).not.toThrow());
});

describe('Template D schema', () => {
  it('rejects missing mandatory props', () => {
    for (const k of ['title', 'columns', 'rows', 'source', 'asOfDate', 'dataOrigin', 'disclaimer'] as const) {
      const p = { ...defaultTemplateD } as Record<string, unknown>;
      delete p[k];
      expect(templateDSchema.safeParse(p).success, k).toBe(false);
    }
  });
  it('rejects fewer than 3 or more than 20 rows, and rows missing a column', () => {
    expect(templateDSchema.safeParse({ ...defaultTemplateD, rows: defaultTemplateD.rows.slice(0, 2) }).success).toBe(false);
    expect(templateDSchema.safeParse({ ...defaultTemplateD, rows: Array.from({ length: 21 }, () => defaultTemplateD.rows[0]!) }).success).toBe(false);
    expect(templateDSchema.safeParse({ ...defaultTemplateD, rows: [{ cells: { amount: '€50' } }, ...defaultTemplateD.rows.slice(1)] }).success).toBe(false);
  });
  const provided = () => {
    const t = datasetToTable(ds());
    return { ...defaultTemplateD, ...t, dataOrigin: 'provided' as const, source: src, sortDirection: 'desc' as const, assumptions: [] };
  };
  it('provided data passes only with source, date and period on EVERY row', () => {
    expect(templateDSchema.safeParse(provided()).success).toBe(true);
    for (const k of ['source', 'asOfDate', 'period'] as const) {
      const p = provided();
      p.rows = p.rows.map((r, i) => (i === 3 ? { ...r, [k]: undefined } : r));
      expect(templateDSchema.safeParse(p).success, k).toBe(false);
    }
    expect(templateDSchema.safeParse({ ...provided(), source: { name: 'x' } }).success).toBe(false);
  });
  it('rejects rows that are not in the stated order', () => {
    const p = provided();
    [p.rows[1], p.rows[2]] = [p.rows[2]!, p.rows[1]!];
    expect(templateDSchema.safeParse(p).success).toBe(false);
  });
});

describe('row metrics (auto-scale)', () => {
  it('20 rows stay >= 34 px and fit; 8 rows get roomier boxes', () => {
    const a = rowMetrics(20);
    const b = rowMetrics(8);
    expect(a.font).toBeGreaterThanOrEqual(34);
    expect(a.rowH * 20 + 6 * 19).toBeLessThanOrEqual(1405 - 600);
    expect(b.rowH).toBeGreaterThan(a.rowH);
    expect(b.font).toBeLessThanOrEqual(44);
  });
  it('table scene lasts long enough for the reveal', () => expect(tableSceneMs(20)).toBeGreaterThan(tableSceneMs(8)));
});

describe('dataset validation', () => {
  it('accepts a complete, sorted dataset and flags product rankings for compliance', () => {
    const v = validateDataset(ds(), { today });
    expect(v.errors).toEqual([]);
    expect(v.compliance).toMatchObject({ escalateToComplianceReviewer: true, reviewer: 'compliance-reviewer' });
    expect(validateDataset(ds({ subject: 'macro' }), { today }).compliance!.escalateToComplianceReviewer).toBe(false);
  });
  it('rejects unsorted order', () => {
    const d = ds();
    d.rows = [d.rows[1]!, d.rows[0]!, ...d.rows.slice(2)];
    expect(validateDataset(d, { today }).errors.join()).toMatch(/not sorted desc/);
    expect(validateDataset(sortDataset(d), { today }).ok).toBe(true);
  });
  it.each([
    ['row source', (d: Dataset) => { d.rows[2]!.source = { name: '', url: '' }; }, /source/],
    ['row as-of date', (d: Dataset) => { d.rows[2]!.asOfDate = ''; }, /asOfDate/],
    ['row period', (d: Dataset) => { d.rows[2]!.period = ''; }, /period/],
    ['future as-of date', (d: Dataset) => { d.asOfDate = '2027-05-01'; }, /asOfDate/],
    ['non-number value', (d: Dataset) => { d.rows[2]!.value = Number.NaN; }, /not a number/],
    ['mixed periods', (d: Dataset) => { d.rows[2]!.period = 'kalenderjaar 2024'; }, /different periods/],
    ['too few rows', (d: Dataset) => { d.rows = d.rows.slice(0, 2); }, /at least 3/],
    ['duplicate entry', (d: Dataset) => { d.rows[3]!.cells = { ...d.rows[2]!.cells }; }, /duplicate/],
  ])('rejects %s', (_n, mutate, re) => {
    const d = ds();
    mutate(d);
    expect(validateDataset(d, { today }).errors.join()).toMatch(re);
  });
  it('warns on stale data and short lists', () => {
    const v = validateDataset(ds({ asOfDate: '2026-01-01', rows: ds().rows.slice(0, 5).map((r) => ({ ...r, asOfDate: '2026-01-01' })) }), { today });
    expect(v.ok).toBe(true);
    expect(v.warnings.join()).toMatch(/days old/);
    expect(v.warnings.join()).toMatch(/fewer than 8/);
  });
  it('formats percentages in nl-NL with an explicit sign and a real minus', () => {
    expect(formatDatasetValue('percent', 12.34)).toBe('+12,3%');
    expect(formatDatasetValue('percent', -4.25)).toBe('−4,3%'); // rounds half away per Intl; sign is U+2212
    expect(formatDatasetValue('percent', 0)).toBe('+0,0%');
  });
  it('imports CSV with per-row source/date/period and period-consistent sorting', () => {
    const csv = ['ticker;naam;value;source_name;source_url;as_of_date;period', 'AAA;Alpha;12,5;Aanbieder X;https://example.org/d;2026-10-15;2025', 'BBB;Bravo;9,1;Aanbieder X;https://example.org/d;2026-10-15;2025', 'CCC;Charlie;-2,0;Aanbieder X;https://example.org/d;2026-10-15;2025'].join('\n');
    const { dataset, errors } = datasetFromCsv(csv, { id: 'csv-test', title: 'T', subject: 'other', metric: 'M', unit: 'percent', sortDirection: 'desc', valueLabel: 'Rend.' });
    expect(errors).toEqual([]);
    const v = validateDataset(dataset, { today });
    expect(v.errors).toEqual([]);
    expect(v.dataset!.rows[2]!.value).toBe(-2);
    expect(datasetToTable(v.dataset!).rows[2]!.cells.value).toBe('−2,0%');
  });
});
