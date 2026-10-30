// Studio preview defaults. Silent (no voice), no captions. Template C uses the REAL finance-engine
// calculation; Templates A/B use clearly labelled illustrative example data only.
import { brand } from '@rj/brand';
import { reelCalculationFromEngine } from './calc/from-finance-engine';
import { buildMatrixTable, CALCULATED_SOURCE, TABLE_DISCLAIMER_NL, TABLE_FOOTER_NL, tableSubtitleNl } from './calc/matrix';
import { formatEur, futureValueOfMonthlyContributions } from '@rj/finance-engine';
import type { TemplateAProps, TemplateBProps, TemplateCPlainProps, TemplateCProps, TemplateDProps } from './schemas';

const scenes = (ids: [string, number][]) => {
  let t = 0;
  return ids.map(([id, ms]) => {
    const s = { id, startMs: t, endMs: t + ms };
    t += ms;
    return s;
  });
};
const timeline = (ids: [string, number][]) => {
  const s = scenes(ids);
  return { totalMs: s[s.length - 1]!.endMs, scenes: s };
};
const silent = { src: null, provider: 'none' as const, brandVoice: false, durationMs: 0 };
// Neutral tagline: the full brand promise reads as a promise of wealth/freedom in a returns context.
const cta = { text: brand.cta, tagline: 'Meer inzicht.' };

export const defaultTemplateC: TemplateCProps = {
  timeline: timeline([['hook', 3500], ['assumptions', 6500], ['growth', 7500], ['result', 7500], ['risks', 6500], ['cta', 3500]]),
  voice: silent,
  captions: [],
  footnote: { text: 'Hypothetisch rekenvoorbeeld · geen advies · bedragen exclusief kosten en belasting, inflatie alleen waar vermeld' },
  cta,
  kicker: 'Geld in cijfers',
  hookLines: ['Wat doet', '€250 per maand', 'beleggen over 30 jaar?'],
  hookHighlightLine: 1,
  calculation: reelCalculationFromEngine(),
  assumptionsFootnote: 'Rente-op-rente per maand, afgeleid van 7% effectief per jaar. Zonder kosten en belasting.',
  risks: { title: 'Let op', items: ['Hypothetisch voorbeeld, geen garantie', 'Eindbedrag is nominaal: exclusief kosten, belasting en inflatie', 'Echte rendementen schommelen, ook negatief'] },
};

export const defaultTemplateA: TemplateAProps = {
  timeline: timeline([['hook', 3000], ['chart', 6000], ['stats', 5000], ['takeaway', 4000], ['cta', 3000]]),
  voice: silent,
  captions: [],
  footnote: { text: 'VOORBEELD: illustratieve data, geen echte koersen' },
  cta,
  kicker: 'Rendement in 30 seconden',
  hookLines: ['Wat is', 'rendement', 'eigenlijk?'],
  hookHighlightLine: 1,
  chart: { title: 'Voorbeeldverloop', illustrative: true, unit: 'index', points: [100, 104, 101, 109, 113, 110, 118].map((value, i) => ({ label: `jaar ${i}`, value })) },
  stats: [{ value: '+18', label: 'Voorbeeld: indexpunten' }],
  takeaway: 'Voorbeeldtekst: vervang door een goedgekeurde boodschap.',
};

export const defaultTemplateB: TemplateBProps = {
  timeline: timeline([['hook', 3000], ['chart', 6000], ['points', 6000], ['cta', 3000]]),
  voice: silent,
  captions: [],
  footnote: { text: 'VOORBEELD: illustratieve data' },
  cta,
  kicker: 'De markt uitgelegd',
  headline: 'Voorbeeld: wat betekent een renteverlaging?',
  source: { name: 'VOORBEELDBRON (placeholder)', url: 'https://example.org/bron', publishedAt: '2026-10-01' },
  candles: {
    title: 'Voorbeeldkoers',
    illustrative: true,
    data: [
      [100, 104, 98, 103], [103, 106, 101, 102], [102, 108, 101, 107], [107, 109, 103, 104], [104, 111, 104, 110],
      [110, 113, 106, 108], [108, 115, 107, 114], [114, 116, 109, 111],
    ].map(([open, high, low, close], i) => ({ label: `d${i + 1}`, open: open!, high: high!, low: low!, close: close! })),
  },
  points: ['Voorbeeldpunt één', 'Voorbeeldpunt twee', 'Voorbeeldpunt drie'],
};

const matrix = buildMatrixTable({ annualReturn: 0.07, amounts: [50, 100, 150, 200, 250, 300, 400, 500], horizons: [10, 20, 30] });
/** Calculated table: monthly contribution x years -> end value (every cell from @rj/finance-engine). */
export const defaultTemplateD: TemplateDProps = {
  timeline: timeline([['table', 8250], ['cta', 1750]]),
  voice: silent,
  captions: [],
  footnote: { text: TABLE_DISCLAIMER_NL },
  cta,
  kicker: 'Tabel in cijfers',
  title: 'Zoveel groeit je inleg: €50 tot €500 per maand',
  subtitle: tableSubtitleNl(0.07),
  footerLine: TABLE_FOOTER_NL,
  columns: matrix.columns,
  rows: matrix.rows,
  source: CALCULATED_SOURCE,
  asOfDate: '2026-10-30',
  dataOrigin: 'calculated',
  disclaimer: TABLE_DISCLAIMER_NL,
  assumptions: matrix.assumptions,
};

const plainYears = Array.from({ length: 31 }, (_, y) => y);
const plainRun = (monthly: number) =>
  plainYears.map((y) => ({ x: y, y: y === 0 ? 0 : futureValueOfMonthlyContributions({ monthlyContribution: monthly, years: y, annualReturn: 0.06, compounding: 'monthly', timing: 'end', rateConvention: 'effective', annualCostRate: 0 }).totals.endValueNominal }));
const plainRun100 = plainRun(100);
const plainRun200 = plainRun(200);
const eurTightDefault = (v: number) => formatEur(Math.round(v)).replace(/€[\s\u00a0]*/, '€');
/** Template C plain style preview: two example lines (EUR 100 and EUR 200 per month at 6%), every point an engine value. */
export const defaultTemplateCPlain: TemplateCPlainProps = {
  timeline: timeline([['chart', 8250], ['cta', 1750]]),
  voice: silent,
  captions: [],
  footnote: { text: TABLE_DISCLAIMER_NL },
  cta,
  kicker: 'Voorbeeld',
  title: 'Twee bedragen naast elkaar',
  subtitle: '€100 en €200 per maand, 6% per jaar. Vóór kosten en belasting.',
  footerLine: TABLE_FOOTER_NL,
  chart: { xLabel: 'Jaar', unit: 'eur', series: [{ label: '€200 per maand', points: plainRun200 }, { label: '€100 per maand', points: plainRun100 }] },
  columns: [{ key: 'label', label: 'Bedrag', kind: 'label' }, { key: 'end', label: 'Na 30 jaar', kind: 'value' }],
  rows: [
    { cells: { label: '€100 per maand', end: eurTightDefault(plainRun100[30]!.y) } },
    { cells: { label: '€200 per maand', end: eurTightDefault(plainRun200[30]!.y) }, highlight: true },
    { cells: { label: 'Verschil', end: eurTightDefault(plainRun200[30]!.y - plainRun100[30]!.y) } },
  ],
  disclaimer: TABLE_DISCLAIMER_NL,
  source: CALCULATED_SOURCE,
  asOfDate: '2026-10-30',
  dataOrigin: 'calculated',
  assumptions: ['Voorbeeld voor de preview'],
};
