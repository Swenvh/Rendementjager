import {
  RISK_WARNING_NL,
  compareAnnualCosts,
  futureValueOfMonthlyContributions,
  realValueOfAmount,
  type MonthlyContributionInput,
} from '@rj/finance-engine';
import { buildTableItem } from './build-table.js';
import { topicKey } from './grids.js';
import { HOOK_PATTERN_NL, type Claim, type ExperimentTags, type HookPattern, type SceneSegment, type SeriesItem, type Storyboard, type TopicParams } from './types.js';
import { eur, hashOf, pct, pick, spokenEur, splitHook } from './util.js';

export const DISCLAIMER_NL =
  'Belangrijk: dit is een hypothetisch rekenvoorbeeld, geen garantie en geen advies. Rendementen uit het verleden bieden geen garantie voor de toekomst; echte rendementen schommelen en kunnen negatief zijn.';

/** Assumption for the inflation shown next to compounding / cost examples (same as the first Reel). */
export const DEFAULT_INFLATION = 0.02;
const LUMP_SUM = 1000;
const PILLAR = { compounding: 'vermogensopbouw', cost: 'beleggen-etfs', inflation: 'persoonlijke-financien', table: 'vermogensopbouw' } as const;
const SERIES_NAME = {
  compounding: 'Geld in cijfers: rente op rente',
  cost: 'Geld in cijfers: kosten',
  inflation: 'Geld in cijfers: inflatie',
  table: 'Tabel in cijfers',
} as const;
const HASHTAGS = {
  compounding: { base: ['#beleggen', '#renteoprente', '#financieleeducatie'], pool: ['#vermogensopbouw', '#geldzaken', '#beleggenvoorbeginners', '#maandelijksinleggen', '#sparenenbeleggen'] },
  cost: { base: ['#beleggen', '#beleggingskosten', '#financieleeducatie'], pool: ['#etf', '#geldzaken', '#beleggenvoorbeginners', '#kosten', '#vermogensopbouw'] },
  inflation: { base: ['#inflatie', '#sparen', '#financieleeducatie'], pool: ['#geldzaken', '#koopkracht', '#persoonlijkefinancien', '#spaargeld', '#vermogensopbouw'] },
  table: { base: ['#beleggen', '#renteoprente', '#financieleeducatie'], pool: ['#vermogensopbouw', '#geldzaken'] },
} as const;
const CTAS = [
  'Volg @rendementjager voor meer inzicht.',
  'Meer rekenvoorbeelden? Volg @rendementjager.',
  'Volg @rendementjager voor de volgende berekening.',
];

const refOf = (fn: string, input: unknown, path: string) => `@rj/finance-engine:${fn}(${JSON.stringify(input)})#${path}`;

interface Built {
  /** Input stored as `calculation.overrides` (what the renderer feeds to buildReelCalculation). */
  overrides: Record<string, number | null>;
  claims: Claim[];
  tokens: Record<string, string>;
  hooks: Record<HookPattern, string[]>;
  segments: SceneSegment[][]; // per scene after the hook: assumptions, growth, result, risks, cta
  risks: string[];
  assumptionsFootnote: string;
  footnote: string;
  captionLines: string[];
  durationNote: string;
}

function claim(key: string, claimText: string, value: number, unit: Claim['unit'], role: Claim['role'], calculationRef: string): Claim {
  return { key, claimText, value, unit, role, calculationRef };
}

function buildCompounding(p: TopicParams, v: number): Built {
  const input: MonthlyContributionInput = {
    monthlyContribution: p.monthly,
    years: p.years,
    annualReturn: p.annualReturn,
    compounding: 'monthly',
    timing: 'end',
    rateConvention: 'effective',
    annualCostRate: 0,
    inflationRate: DEFAULT_INFLATION,
  };
  const t = futureValueOfMonthlyContributions(input).totals;
  const m = eur(p.monthly);
  const r = pct(p.annualReturn);
  const infl = pct(DEFAULT_INFLATION);
  const contrib = eur(t.contributed);
  const endSp = spokenEur(t.endValueNominal);
  const growthSp = spokenEur(t.growth);
  const realSp = spokenEur(t.endValueReal!);
  const f = 'futureValueOfMonthlyContributions';
  const claims = [
    claim('monthly', `Inleg ${m} per maand`, p.monthly, 'EUR', 'input', refOf(f, input, 'input.monthlyContribution')),
    claim('years', `Looptijd ${p.years} jaar`, p.years, 'years', 'input', refOf(f, input, 'input.years')),
    claim('return', `Hypothetisch rendement ${r} effectief per jaar (aanname)`, p.annualReturn * 100, 'percent', 'assumption', refOf(f, input, 'input.annualReturn')),
    claim('inflation', `Inflatie ${infl} per jaar (aanname)`, DEFAULT_INFLATION * 100, 'percent', 'assumption', refOf(f, input, 'input.inflationRate')),
    claim('contributed', `Totale inleg ${contrib}`, t.contributed, 'EUR', 'result', refOf(f, input, 'totals.contributed')),
    claim('end', `Eindbedrag in het rekenvoorbeeld ${eur(t.endValueNominal)}`, t.endValueNominal, 'EUR', 'result', refOf(f, input, 'totals.endValueNominal')),
    claim('growth', `Waarvan rendement ${eur(t.growth)}`, t.growth, 'EUR', 'result', refOf(f, input, 'totals.growth')),
    claim('real', `Eindbedrag in geld van nu ${eur(t.endValueReal!)}`, t.endValueReal!, 'EUR', 'result', refOf(f, input, 'totals.endValueReal')),
  ];
  const q = pick(`${v}`, 2);
  return {
    overrides: { monthlyContribution: p.monthly, years: p.years, annualReturn: p.annualReturn, annualCostRate: 0, inflationRate: DEFAULT_INFLATION },
    claims,
    tokens: {},
    hooks: {
      question: [`Wat doet ${m} per maand beleggen over ${p.years} jaar bij ${r}?`, `Wat wordt ${m} per maand na ${p.years} jaar, gerekend met ${r} per jaar?`, `Hoe groot wordt ${m} per maand na ${p.years} jaar bij ${r} per jaar?`],
      statement: [`${m} per maand, ${p.years} jaar lang, ${r} per jaar: dit is het rekenvoorbeeld.`, `Rente op rente in ${p.years} jaar: rekenvoorbeeld met ${m} per maand en ${r} per jaar.`, `Elke maand ${m}, ${p.years} jaar lang, ${r} per jaar: kijk wat rente op rente doet.`],
      contrast: [`Zelf leg je ${contrib} in. Het rekenvoorbeeld rekent ${endSp} uit.`, `${contrib} inleg tegenover ${endSp} in het rekenvoorbeeld: hoe kan dat?`, `Eigen inleg ${contrib}, eindbedrag in het rekenvoorbeeld ${endSp}. Wat zit daartussen?`],
    },
    segments: [
      [
        { id: 's02', text: `We rekenen met een hypothetisch rendement van ${r} effectief per jaar.` },
        { id: 's03', text: `Je legt aan het eind van elke maand ${m} in. Het rendement wordt per maand verrekend.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's04', text: `In ${p.years} jaar leg je zelf ${contrib} in.` },
        { id: 's05', text: q === 0 ? `Door rente op rente groeit dat in dit voorbeeld naar ${endSp}.` : `Met rente op rente komt het rekenvoorbeeld uit op ${endSp}.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's06', text: `Daarvan is ${growthSp} rendement.` },
        { id: 's07', text: `Reken je met ${infl} inflatie per jaar, dan is hetzelfde eindbedrag ${realSp} in geld van nu.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's08', text: 'Dit is een rekenvoorbeeld, geen garantie. Het eindbedrag is nominaal: kosten en belasting zitten er niet in.' },
        { id: 's09', text: 'En echte rendementen schommelen: sommige jaren gaat het omlaag.', pauseAfterMs: 450 },
      ],
    ],
    risks: ['Hypothetisch voorbeeld, geen garantie', 'Eindbedrag is nominaal: exclusief kosten en belasting', 'Echte rendementen schommelen, ook negatief'],
    assumptionsFootnote: `Rente-op-rente per maand, afgeleid van ${r} effectief per jaar. Zonder kosten en belasting.`,
    footnote: 'Hypothetisch rekenvoorbeeld · geen advies · bedragen exclusief kosten en belasting, inflatie alleen waar vermeld',
    captionLines: [
      `• Inleg: ${m} aan het eind van elke maand, ${p.years} jaar lang (totaal ${contrib})`,
      `• Hypothetisch rendement: ${r} effectief per jaar, per maand verrekend`,
      `• Uitkomst: ${eur(t.endValueNominal)}, waarvan ${eur(t.growth)} rendement`,
      `• Zelfde eindbedrag in geld van nu, bij ${infl} inflatie per jaar (aanname): ongeveer ${eur(t.endValueReal!)}`,
    ],
    durationNote: 'compounding',
  };
}

function buildCost(p: TopicParams, v: number): Built {
  const base = { monthlyContribution: p.monthly, years: p.years, annualReturn: p.annualReturn, compounding: 'monthly', timing: 'end', rateConvention: 'effective' } as const;
  const cmp = compareAnnualCosts(base, p.costLow!, p.costHigh!);
  const lowT = cmp.low.totals;
  const highT = cmp.high.totals;
  const m = eur(p.monthly);
  const r = pct(p.annualReturn);
  const cl = pct(p.costLow!);
  const ch = pct(p.costHigh!);
  const contrib = eur(lowT.contributed);
  const diffSp = spokenEur(cmp.difference);
  const f = 'compareAnnualCosts';
  const ref = (path: string) => refOf(f, { base, lowCostRate: p.costLow, highCostRate: p.costHigh }, path);
  const claims = [
    claim('monthly', `Inleg ${m} per maand`, p.monthly, 'EUR', 'input', ref('low.input.monthlyContribution')),
    claim('years', `Looptijd ${p.years} jaar`, p.years, 'years', 'input', ref('low.input.years')),
    claim('return', `Hypothetisch rendement ${r} effectief per jaar, vóór kosten (aanname)`, p.annualReturn * 100, 'percent', 'assumption', ref('low.input.annualReturn')),
    claim('costLow', `Lage kosten ${cl} per jaar (aanname)`, p.costLow! * 100, 'percent', 'assumption', ref('lowCostRate')),
    claim('costHigh', `Hoge kosten ${ch} per jaar (aanname)`, p.costHigh! * 100, 'percent', 'assumption', ref('highCostRate')),
    claim('contributed', `Totale inleg ${contrib}`, lowT.contributed, 'EUR', 'result', ref('contributed')),
    claim('endLow', `Eindbedrag bij ${cl} kosten ${eur(lowT.endValueNominal)}`, lowT.endValueNominal, 'EUR', 'result', ref('low.totals.endValueNominal')),
    claim('endHigh', `Eindbedrag bij ${ch} kosten ${eur(highT.endValueNominal)}`, highT.endValueNominal, 'EUR', 'result', ref('high.totals.endValueNominal')),
    claim('difference', `Verschil ${eur(cmp.difference)}`, cmp.difference, 'EUR', 'result', ref('difference')),
  ];
  const lowSp = spokenEur(lowT.endValueNominal);
  const highSp = spokenEur(highT.endValueNominal);
  const q = pick(`${v}`, 2);
  return {
    // The video shows the HIGH-cost scenario; the low-cost end value and the difference are in the footnote.
    overrides: { monthlyContribution: p.monthly, years: p.years, annualReturn: p.annualReturn, annualCostRate: p.costHigh!, inflationRate: null },
    claims,
    tokens: {},
    hooks: {
      question: [`Wat maakt ${cl} of ${ch} kosten uit bij ${m} per maand over ${p.years} jaar?`, `Wat doen jaarlijkse kosten van ${ch} met ${m} per maand over ${p.years} jaar?`, `Hoeveel scheelt ${cl} in plaats van ${ch} kosten per jaar bij ${m} per maand over ${p.years} jaar?`],
      statement: [`Kleine kostenverschillen tellen op: ${cl} tegenover ${ch} per jaar, ${m} per maand, ${p.years} jaar lang.`, `Kosten werken als rente, maar dan andersom: ${ch} per jaar bij ${m} per maand over ${p.years} jaar.`, `Het kostenverschil tussen ${cl} en ${ch} per jaar telt door: ${m} per maand, ${p.years} jaar.`],
      contrast: [`${cl} of ${ch} kosten per jaar: ${diffSp} verschil over ${p.years} jaar.`, `Zelfde inleg van ${m} per maand, zelfde rendement, ${diffSp} verschil na ${p.years} jaar. Hoe kan dat?`, `${m} per maand, ${p.years} jaar: ${diffSp} verschil tussen ${cl} en ${ch} kosten.`],
    },
    segments: [
      [
        { id: 's02', text: `We vergelijken twee keer hetzelfde plan: ${m} per maand, ${p.years} jaar, hypothetisch ${r} per jaar vóór kosten.` },
        { id: 's03', text: `Het enige verschil zijn de jaarlijkse kosten: ${cl} tegenover ${ch}, berekend over het belegde vermogen.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's04', text: `In beeld zie je het plan met ${ch} kosten. Je legt in ${p.years} jaar zelf ${contrib} in.` },
        { id: 's05', text: q === 0 ? `Met ${ch} kosten komt het rekenvoorbeeld uit op ${highSp}.` : `Bij ${ch} kosten per jaar is het eindbedrag in dit voorbeeld ${highSp}.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's06', text: `Met ${cl} kosten zou hetzelfde plan uitkomen op ${lowSp}.` },
        { id: 's07', text: `Dat is ${diffSp} verschil, bij precies dezelfde inleg.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's08', text: 'Dit is een rekenvoorbeeld, geen garantie. Het rendement is hypothetisch en belasting is niet meegerekend.' },
        { id: 's09', text: 'Kosten zijn één factor van vele. Dit zegt niets over welk product bij jou past.', pauseAfterMs: 450 },
      ],
    ],
    risks: ['Hypothetisch voorbeeld, geen garantie', 'Belasting (box 3) is niet meegerekend', 'Kosten zijn één factor; dit is geen productadvies'],
    assumptionsFootnote: `Kosten ${ch} per jaar over het belegde vermogen, vergeleken met ${cl}. Rente-op-rente per maand, ${r} effectief per jaar vóór kosten.`,
    footnote: `Hypothetisch · geen advies · bij ${cl} kosten: ${eur(lowT.endValueNominal)} · bij ${ch} kosten: ${eur(highT.endValueNominal)} · verschil ${eur(cmp.difference)}`,
    captionLines: [
      `• Inleg: ${m} aan het eind van elke maand, ${p.years} jaar lang (totaal ${contrib})`,
      `• Hypothetisch rendement: ${r} effectief per jaar vóór kosten, per maand verrekend`,
      `• Bij ${cl} kosten per jaar: ${eur(lowT.endValueNominal)}`,
      `• Bij ${ch} kosten per jaar: ${eur(highT.endValueNominal)}`,
      `• Verschil: ${eur(cmp.difference)}`,
    ],
    durationNote: 'cost',
  };
}

function buildInflation(p: TopicParams, v: number): Built {
  const input: MonthlyContributionInput = {
    monthlyContribution: p.monthly,
    years: p.years,
    annualReturn: 0,
    compounding: 'monthly',
    timing: 'end',
    rateConvention: 'effective',
    annualCostRate: 0,
    inflationRate: p.inflation!,
  };
  const t = futureValueOfMonthlyContributions(input).totals;
  const m = eur(p.monthly);
  const i = pct(p.inflation!);
  const nominal = eur(t.contributed);
  const realSp = spokenEur(t.endValueReal!);
  const loss = t.endValueNominal - t.endValueReal!;
  const lossSp = spokenEur(loss);
  const lumpReal = realValueOfAmount(LUMP_SUM, p.years, p.inflation!);
  const lumpRealSp = spokenEur(lumpReal);
  const f = 'futureValueOfMonthlyContributions';
  const lumpRef = (path: string) => refOf('realValueOfAmount', { amount: LUMP_SUM, years: p.years, inflationRate: p.inflation }, path);
  const claims = [
    claim('monthly', `Inleg ${m} per maand`, p.monthly, 'EUR', 'input', refOf(f, input, 'input.monthlyContribution')),
    claim('years', `Looptijd ${p.years} jaar`, p.years, 'years', 'input', refOf(f, input, 'input.years')),
    claim('return', 'Rendement 0% (alleen sparen, geen rendement)', 0, 'percent', 'assumption', refOf(f, input, 'input.annualReturn')),
    claim('inflation', `Inflatie ${i} per jaar (aanname)`, p.inflation! * 100, 'percent', 'assumption', refOf(f, input, 'input.inflationRate')),
    claim('contributed', `Totaal gespaard ${nominal}`, t.contributed, 'EUR', 'result', refOf(f, input, 'totals.contributed')),
    claim('real', `Waarde in geld van nu ${eur(t.endValueReal!)}`, t.endValueReal!, 'EUR', 'result', refOf(f, input, 'totals.endValueReal')),
    claim('loss', `Koopkrachtverlies ${eur(loss)}`, loss, 'EUR', 'result', refOf(f, input, 'totals.endValueNominal - totals.endValueReal')),
    claim('lumpNow', `Een bedrag van ${eur(LUMP_SUM)} nu`, LUMP_SUM, 'EUR', 'input', lumpRef('amount')),
    claim('lumpReal', `${eur(LUMP_SUM)} is na ${p.years} jaar ${eur(lumpReal)} waard in geld van nu`, lumpReal, 'EUR', 'result', lumpRef('return')),
  ];
  const q = pick(`${v}`, 2);
  return {
    overrides: { monthlyContribution: p.monthly, years: p.years, annualReturn: 0, annualCostRate: 0, inflationRate: p.inflation! },
    claims,
    tokens: {},
    hooks: {
      question: [`Wat is ${m} per maand sparen over ${p.years} jaar nog waard bij ${i} inflatie?`, `Hoeveel koopkracht houdt ${m} per maand sparen over na ${p.years} jaar bij ${i} inflatie?`, `Hoeveel is ${nominal} sparen over ${p.years} jaar waard in geld van nu, bij ${i} inflatie?`],
      statement: [`Bij ${i} inflatie is ${m} per maand sparen over ${p.years} jaar minder waard dan het lijkt.`, `Inflatie werkt stil door: ${m} per maand sparen, ${p.years} jaar lang, ${i} per jaar.`, `Sparen zonder rendement: ${m} per maand, ${p.years} jaar, ${i} inflatie per jaar.`],
      contrast: [`Je spaart ${nominal}, maar in geld van nu is dat ongeveer ${realSp.replace(/^(ruim|bijna) /, '')}.`, `${nominal} gespaard, ${realSp} aan koopkracht in geld van nu.`, `Op papier ${nominal}, in koopkracht ${realSp}. Dat is wat ${i} inflatie doet.`],
    },
    segments: [
      [
        { id: 's02', text: 'We rekenen zonder rendement: je spaart, het bedrag groeit niet.' },
        { id: 's03', text: `Je zet aan het eind van elke maand ${m} opzij, ${p.years} jaar lang. Als aanname rekenen we met ${i} inflatie per jaar.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's04', text: `In ${p.years} jaar zet je ${nominal} opzij.` },
        { id: 's05', text: q === 0 ? `Op papier blijft dat ${nominal}, want er komt geen rendement bij.` : `Het bedrag zelf verandert niet: het blijft ${nominal}.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's06', text: `Maar bij ${i} inflatie per jaar is dat in geld van nu ${realSp}.` },
        { id: 's07', text: `Een bedrag van ${eur(LUMP_SUM)} dat blijft staan is na ${p.years} jaar nog ${lumpRealSp} waard in geld van nu.`, pauseAfterMs: 450 },
      ],
      [
        { id: 's08', text: `Dit is een rekenvoorbeeld. Inflatie is een aanname en kan hoger of lager uitvallen. Het koopkrachtverlies in dit voorbeeld is ${lossSp}.` },
        { id: 's09', text: 'Er zijn meer manieren om hiermee om te gaan, en elke keuze heeft eigen risico\'s.', pauseAfterMs: 450 },
      ],
    ],
    risks: ['Rekenvoorbeeld zonder rendement', 'Inflatie is een aanname; het werkelijke verloop wisselt', 'Dit is geen advies'],
    assumptionsFootnote: `Zonder rendement en zonder kosten. Inflatie ${i} per jaar als aanname.`,
    footnote: `Hypothetisch rekenvoorbeeld · geen advies · inflatie ${i} per jaar is een aanname`,
    captionLines: [
      `• Gespaard: ${m} aan het eind van elke maand, ${p.years} jaar lang (totaal ${nominal})`,
      '• Rendement: 0% (alleen sparen, geen rendement)',
      `• Inflatie: ${i} per jaar (aanname)`,
      `• Waarde in geld van nu: ongeveer ${eur(t.endValueReal!)}, dus ${eur(loss)} aan koopkracht minder`,
      `• Ter vergelijking: ${eur(LUMP_SUM)} die blijft staan is na ${p.years} jaar ongeveer ${eur(lumpReal)} waard in geld van nu`,
    ],
    durationNote: 'inflation',
  };
}

/** Rough duration estimate in seconds (replaced by the measured duration after rendering). */
export function estimateDurationS(segmentTexts: string[]): number {
  const words = segmentTexts.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.round((words / 2.6 + segmentTexts.length * 0.4 + 0.35 + 0.4 + 1.6) * 10) / 10;
}

const VISUALS: Record<string, string> = {
  hook: 'Kicker GELD IN CIJFERS; hook in max. 4 regels, het bedrag in lime; woorden verschijnen na elkaar.',
  assumptions: 'Titel "De aannames"; drie statkaarten: inleg per maand, looptijd, hypothetisch rendement.',
  growth: 'Teller en grafiek groeien van jaar 0 tot het einde; waarden uit de maandreeks van de finance-engine.',
  result: 'Staafvergelijking eigen inleg vs eindwaarde; kaart "Zelfde eindbedrag in geld van nu" als er inflatie is.',
  risks: 'Titel "Let op"; risicoregels; kleine lijn met label Illustratief (geen data).',
  cta: 'Branded outro met CTA.',
};

export function buildItem(params: TopicParams, pattern: HookPattern, date: string): SeriesItem {
  if (params.kind === 'table') return buildTableItem(params, pattern, date);
  const key = topicKey(params);
  const phrase = pick(`${key}|${pattern}`, 3);
  const built = params.kind === 'compounding' ? buildCompounding(params, pick(key, 2)) : params.kind === 'cost' ? buildCost(params, pick(key, 2)) : buildInflation(params, pick(key, 2));
  const hook = built.hooks[pattern][phrase]!;
  const variantGroup = key.replace(/[:]/g, '-');
  const variantIndex = (['question', 'statement', 'contrast'] as const).indexOf(pattern);
  const cta = CTAS[pick(`${key}|${pattern}|cta`, CTAS.length)]!;

  const sceneIds = ['assumptions', 'growth', 'result', 'risks'] as const;
  const scenes: Storyboard['scenes'] = [
    { id: 'hook', visual: VISUALS.hook!, segments: [{ id: 's01', text: hook, pauseAfterMs: 450 }] },
    ...sceneIds.map((id, i) => ({ id, visual: VISUALS[id]!, segments: built.segments[i]! })),
    { id: 'cta', visual: VISUALS.cta!, segments: [{ id: 's10', text: cta }] },
  ];
  const { lines, highlight } = splitHook(hook);
  const slug = `${date}-${params.kind === 'compounding' ? 'rente' : params.kind === 'cost' ? 'kosten' : 'inflatie'}-${params.monthly}pm-${params.years}j-${keyRateSlug(params)}-${HOOK_PATTERN_NL[pattern]}`;
  const storyboard: Storyboard = {
    slug,
    title: hook,
    template: 'TemplateC',
    series: SERIES_NAME[params.kind],
    language: 'nl',
    calculation: { engine: '@rj/finance-engine', function: 'buildReelCalculation', overrides: built.overrides },
    onScreen: {
      kicker: 'Geld in cijfers',
      hookLines: lines,
      hookHighlightLine: highlight,
      assumptionsFootnote: built.assumptionsFootnote,
      risks: { title: 'Let op', items: built.risks },
      footnote: built.footnote,
      cta: cta.replace(/\.$/, ''),
    },
    scenes,
  };

  const tagPool = HASHTAGS[params.kind];
  const extra = [...tagPool.pool].sort((a, b) => (pick(`${key}${a}`, 1000) - pick(`${key}${b}`, 1000))).slice(0, 2);
  const hashtags = [...tagPool.base, ...extra];
  const caption = [
    hook,
    '',
    'Een rekenvoorbeeld:',
    ...built.captionLines,
    '',
    DISCLAIMER_NL,
    RISK_WARNING_NL,
    '',
    cta,
    '',
    hashtags.join(' '),
  ].join('\n');

  const spoken = scenes.flatMap((s) => s.segments.map((x) => x.text));
  const tags: ExperimentTags = {
    trial: true,
    kind: params.kind,
    hookPattern: pattern,
    amount: params.monthly,
    horizon: params.years,
    template: 'C',
    durationS: estimateDurationS(spoken),
    variantGroup,
    variantIndex,
    ratePct: Math.round((params.kind === 'inflation' ? params.inflation! : params.annualReturn) * 10_000) / 100,
  };
  const claims = built.claims;
  const contentHash = hashOf({ v: 1, kind: params.kind, topic: key, pattern, scenes, onScreen: storyboard.onScreen, overrides: built.overrides, caption, claims });
  const propsHash = hashOf({ template: storyboard.template, calculation: storyboard.calculation, onScreen: storyboard.onScreen, scenes });

  const scriptMd = [
    `# ${hook}`,
    '',
    `- Template: C "Geld in cijfers" · 1080x1920 · 30 fps · ca. ${tags.durationS} s (schatting)`,
    `- Reeks: ${SERIES_NAME[params.kind]} · variantgroep ${variantGroup} · hookpatroon: ${HOOK_PATTERN_NL[pattern]}`,
    '- Status: CONCEPT (nog geen G1/G2/G3/G4/G5). Alle cijfers komen uit `@rj/finance-engine`; zie `series.json` (claims met calculationRef).',
    '- Trial Reel: ja. Experimenttags staan in `series.json`.',
    '',
    '## Gesproken tekst (per scène)',
    '| Scène | Voice-over |',
    '| --- | --- |',
    ...scenes.map((s) => `| ${s.id} | ${s.segments.map((x) => x.text).join(' ')} |`),
    '',
    'Gesproken bedragen zijn naar beneden afgerond ("ruim") of net erboven ("bijna"), zodat ze nooit hoger klinken dan de berekening. Op het scherm en in de caption staan de exacte bedragen.',
    '',
    '## Op het scherm',
    `- Footnote: ${storyboard.onScreen.footnote}`,
    `- Aannames: ${storyboard.onScreen.assumptionsFootnote}`,
    `- Risico's: ${storyboard.onScreen.risks.items.join(' · ')}`,
    '- Outro: tagline "Meer inzicht." (de volledige merkbelofte is bewust weggelaten).',
    '',
  ].join('\n');

  return {
    kind: params.kind,
    params,
    topicKey: key,
    hookPattern: pattern,
    title: hook,
    hook,
    slug,
    pillar: PILLAR[params.kind],
    seriesName: SERIES_NAME[params.kind],
    storyboard,
    scriptMd,
    caption,
    hashtags,
    claims,
    tags,
    contentHash,
    propsHash,
  };
}

function keyRateSlug(p: TopicParams): string {
  const n = (x: number) => String(Math.round(x * 10_000) / 100).replace('.', 'k');
  if (p.kind === 'compounding') return `r${n(p.annualReturn)}`;
  if (p.kind === 'cost') return `k${n(p.costLow!)}-${n(p.costHigh!)}`;
  return `i${n(p.inflation!)}`;
}
