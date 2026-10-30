import { futureValueOfMonthlyContributions, formatEur, formatPercent, RISK_WARNING_NL, type MonthlyContributionInput } from '@rj/finance-engine';
import type { TemplateDProps } from '../schemas';

/** Disclaimer shown in the footer of every table Reel. */
export const TABLE_DISCLAIMER_NL = 'Rendementen uit het verleden bieden geen garantie voor de toekomst. Geen beleggingsadvies.';

export const CALCULATED_SOURCE = { name: 'Eigen rekenvoorbeeld met @rj/finance-engine' } as const;

export interface MatrixSpec {
  /** Hypothetical effective return per year as a fraction (0.07 = 7%). */
  annualReturn: number;
  /** Monthly contributions in whole euros (one row each). */
  amounts: number[];
  /** Horizons in years (one value column each). */
  horizons: number[];
}

export interface MatrixTable {
  columns: TemplateDProps['columns'];
  rows: TemplateDProps['rows'];
  assumptions: string[];
  /** Engine calls behind the cells, for claims / audit. */
  cells: { amount: number; years: number; endValueNominal: number; contributed: number }[];
}

const eurTight = (v: number) => formatEur(v).replace(/€[\s ]*/, '€');

/**
 * Matrix: monthly contribution x years -> nominal end value. Every cell is one @rj/finance-engine call
 * (end-of-month contributions, monthly compounding of the effective yearly rate, no costs, no tax, no inflation).
 * Deterministic: no numbers are typed by hand.
 */
export function buildMatrixTable(spec: MatrixSpec): MatrixTable {
  const cells: MatrixTable['cells'] = [];
  const rows: TemplateDProps['rows'] = spec.amounts.map((amount, ri) => {
    const rowCells: Record<string, string> = { amount: eurTight(amount) };
    spec.horizons.forEach((years) => {
      const input: MonthlyContributionInput = {
        monthlyContribution: amount, years, annualReturn: spec.annualReturn, compounding: 'monthly', timing: 'end',
        rateConvention: 'effective', annualCostRate: 0,
      };
      const t = futureValueOfMonthlyContributions(input).totals;
      rowCells[`y${years}`] = eurTight(Math.round(t.endValueNominal));
      cells.push({ amount, years, endValueNominal: t.endValueNominal, contributed: t.contributed });
    });
    // Highlight the middle row (the "250 per maand" style reference row) only once: never more than one lime row.
    return { cells: rowCells, highlight: ri === Math.floor(spec.amounts.length / 2) };
  });
  return {
    columns: [{ key: 'amount', label: 'Inleg p/m', kind: 'label' }, ...spec.horizons.map((y) => ({ key: `y${y}`, label: `${y} jaar`, kind: 'value' as const }))],
    rows,
    assumptions: [`Rekenvoorbeeld: ${formatPercent(spec.annualReturn)} effectief per jaar (hypothetisch)`, 'inleg aan het eind van de maand', 'nominaal, zonder kosten, belasting en inflatie'],
    cells,
  };
}

export { RISK_WARNING_NL };
