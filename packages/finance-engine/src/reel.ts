import {
  type FutureValueResult,
  type MonthlyContributionInput,
  type ScenarioResult,
  futureValueOfMonthlyContributions,
  returnScenarios,
} from './compound.js';
import { formatEur, formatPercent } from './format.js';

/** The standard AFM-style risk warning used under every return calculation. */
export const RISK_WARNING_NL = "Let op! Beleggen brengt risico's met zich mee. Je kunt (een deel van) je inleg verliezen.";

export const REEL_250_INPUT: Readonly<MonthlyContributionInput> = {
  monthlyContribution: 250,
  years: 30,
  annualReturn: 0.07,
  compounding: 'monthly',
  timing: 'end',
  rateConvention: 'effective',
  annualCostRate: 0,
  inflationRate: 0.02,
};

export interface ReelCalculation {
  id: 'reel-250-per-maand-30-jaar';
  title: string;
  input: MonthlyContributionInput;
  result: FutureValueResult;
  /** Pre-formatted nl-NL strings for on-screen text (U+00A0 after "€"). */
  display: {
    monthlyContribution: string;
    years: string;
    totalContributed: string;
    endValue: string;
    growth: string;
    endValueReal: string | null;
    annualReturn: string;
    inflationRate: string | null;
  };
  /** Dutch assumption lines to show on screen / in the caption. */
  assumptions: string[];
  /** Same calculation at other returns (sensitivity), baseline first. */
  scenarios: ScenarioResult[];
  riskWarning: string;
  /** Yearly series for charts: [{year, contributed, valueNominal, growth, valueReal}]. */
  series: FutureValueResult['series'];
}

/**
 * Everything the "Wat doet €250 per maand beleggen over 30 jaar?" Reel (template C, GELD IN
 * CIJFERS) needs: inputs, results, chart series and the assumptions to state on screen.
 * 7% is an ASSUMED average yearly return (not a promise); costs and taxes are excluded.
 */
export function buildReelCalculation(overrides: Partial<MonthlyContributionInput> = {}): ReelCalculation {
  const input: MonthlyContributionInput = { ...REEL_250_INPUT, ...overrides };
  const result = futureValueOfMonthlyContributions(input);
  const n = result.input;
  const t = result.totals;
  const months = n.years * 12;
  const display = {
    monthlyContribution: formatEur(n.monthlyContribution),
    years: `${n.years} jaar`,
    totalContributed: formatEur(t.contributed),
    endValue: formatEur(t.endValueNominal),
    growth: formatEur(t.growth),
    endValueReal: t.endValueReal === null ? null : formatEur(t.endValueReal),
    annualReturn: formatPercent(n.annualReturn),
    inflationRate: n.inflationRate === null ? null : formatPercent(n.inflationRate),
  };
  const assumptions = [
    `Inleg: ${display.monthlyContribution} per maand, ${months} maanden (${display.years}), totaal ${display.totalContributed}.`,
    `Aangenomen gemiddeld rendement: ${display.annualReturn} per jaar. Dit is een aanname, geen garantie; echte rendementen schommelen en kunnen negatief zijn.`,
    n.compounding === 'monthly'
      ? n.rateConvention === 'effective'
        ? `Rente-op-rente per maand; de maandrente is afgeleid van ${display.annualReturn} per jaar (effectief).`
        : `Rente-op-rente per maand met ${display.annualReturn} / 12 per maand (nominaal).`
      : `Rendement wordt één keer per jaar bijgeschreven.`,
    n.timing === 'end' ? 'Inleg aan het einde van elke maand.' : 'Inleg aan het begin van elke maand.',
    n.annualCostRate > 0
      ? `Kosten: ${formatPercent(n.annualCostRate)} per jaar over het belegde vermogen.`
      : 'Zonder kosten (fondskosten, transactiekosten) en zonder belasting (box 3).',
    ...(display.endValueReal && display.inflationRate
      ? [`Met ${display.inflationRate} inflatie per jaar is ${display.endValue} over ${display.years} ongeveer ${display.endValueReal} in euro's van nu.`]
      : ['Inflatie is niet meegerekend.']),
    'Rendementen uit het verleden bieden geen garantie voor de toekomst.',
  ];
  return {
    id: 'reel-250-per-maand-30-jaar',
    title: 'Wat doet €250 per maand beleggen over 30 jaar?',
    input,
    result,
    display,
    assumptions,
    scenarios: returnScenarios(input, [n.annualReturn, 0.04, 0]),
    riskWarning: RISK_WARNING_NL,
    series: result.series,
  };
}
