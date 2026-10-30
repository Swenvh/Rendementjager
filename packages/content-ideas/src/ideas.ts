import { RISK_WARNING_NL, contributeThenHold, futureValueOfMonthlyContributions, lumpSumFutureValue, steppedSaving } from '@rj/finance-engine';
import { type Calc, type Unit, calc, eur, eur2, formatValue } from './calc.js';
import { CTA_TEXT, type Idea, type IdeaColumn, type IdeaRow, type IdeasDocument } from './schema.js';

export const IDEAS_DATE = '2026-10-30';
const CALC_SOURCE = 'eigen rekenvoorbeeld met @rj/finance-engine';
const FOOT_RET = 'Rekenvoorbeeld, geen garantie of advies.';
const FOOT_PLAIN = 'Rekenvoorbeeld, geen persoonlijk advies.';
const PAST = 'Rendementen uit het verleden bieden geen garantie voor de toekomst. Geen beleggingsadvies.';
const HYPO = 'Dit is een hypothetisch rekenvoorbeeld, geen garantie en geen advies.';
const PLAIN_DISCLAIMER = 'Dit is een rekenvoorbeeld om iets uit te leggen, geen persoonlijk advies. Jouw situatie is anders.';

// ---------- builders ----------

const lab = (key: string, label: string): IdeaColumn => ({ key, label, kind: 'label', unit: 'text' });
const val = (key: string, label: string, unit: Unit): IdeaColumn => ({ key, label, kind: 'value', unit });

type RowSpec = { label: string; vals: Record<string, Calc>; highlight?: boolean; textCells?: Record<string, string> };

function buildRows(cols: IdeaColumn[], specs: RowSpec[]): IdeaRow[] {
  const labelKey = cols[0]!.key;
  return specs.map((s) => {
    const cells: Record<string, string> = { [labelKey]: s.label, ...(s.textCells ?? {}) };
    const values: Record<string, number> = {};
    const refs: Record<string, string> = {};
    for (const c of cols) {
      const v = s.vals[c.key];
      if (!v) continue;
      values[c.key] = v.value;
      refs[c.key] = v.ref;
      cells[c.key] = formatValue(c.unit, v.value);
    }
    return { cells, values, refs, highlight: s.highlight ?? false, placeholder: false };
  });
}

function claimsFromTable(cols: IdeaColumn[], rows: IdeaRow[]): Idea['claims'] {
  const out: Idea['claims'] = [];
  rows.forEach((r, i) => {
    for (const c of cols) {
      const v = r.values[c.key];
      if (v === undefined) continue;
      out.push({ key: `r${i + 1}-${c.key}`, text: `${r.cells[cols[0]!.key]} / ${c.label}: ${r.cells[c.key]}`, value: v, unit: c.unit, calculationRef: r.refs[c.key]!, role: 'result' });
    }
  });
  return out;
}

const hooks = (v: string, s: string, c: string): Idea['hooks'] => [
  { pattern: 'vraag', text: v },
  { pattern: 'stelling', text: s },
  { pattern: 'contrast', text: c },
];

const FMT: Record<'D' | 'C' | 'A', string> = { D: 'Template D (tabel)', C: 'Template C (grafiek)', A: 'Template A (uitleg)' };

interface StoryInput {
  format: 'D' | 'C' | 'A';
  title: string;
  subtitle: string;
  footer: string;
  rowLabels: string[];
  highlightLabel?: string;
  /** Template C: what the lines show. Template A: the three big numbers. */
  lines?: string[];
  endNotes?: string[];
  stats?: string[];
  lesson?: string;
}

function storyboard(s: StoryInput): Idea['storyboard'] {
  const o = (second: number, visual: string, onScreen: string) => ({ second, visual, onScreen });
  const cta = [
    o(9, 'Drone-achtergrond dimt licht, branded outro (geen voortgangsbalk)', CTA_TEXT),
    o(10, 'Outro blijft staan met de tagline', CTA_TEXT),
  ];
  if (s.format === 'D') {
    const perSecond: string[][] = [[], [], [], [], [], [], []];
    s.rowLabels.forEach((l, i) => perSecond[Math.min(6, Math.floor((i * 5) / Math.max(1, s.rowLabels.length)) + 2)]!.push(l));
    const sec = (n: number) => perSecond[n]!.join(' / ');
    return [
      o(1, 'Drone-achtergrond (rustig), lichte titelbox schuift in beeld', s.title),
      o(2, 'Eén korte regel met de aannames komt eronder', s.subtitle),
      o(3, `Kolomkoppen verschijnen; eerste rij(en): ${sec(2) || s.rowLabels[0]}`, sec(2) || s.rowLabels[0]!),
      o(4, (sec(3) ? `Volgende rij(en) komen in: ${sec(3)}` : 'Tabel staat compleet in beeld; korte pauze om te lezen'), sec(3)),
      o(5, (sec(4) ? `Volgende rij(en): ${sec(4)}` : 'Tabel staat compleet in beeld'), sec(4)),
      o(6, (sec(5) ? `Volgende rij(en): ${sec(5)}` : 'Tabel staat compleet in beeld'), sec(5)),
      o(7, (sec(6) ? `Laatste rij(en): ${sec(6)}` : 'Tabel staat compleet in beeld'), sec(6)),
      o(8, `${s.highlightLabel ? `Rij "${s.highlightLabel}" licht lime op; ` : ''}tabel blijft staan met voetregel`, s.footer),
      ...cta,
    ];
  }
  if (s.format === 'C') {
    const [a, b, c] = s.lines ?? [];
    return [
      o(1, 'Drone-achtergrond, hooktekst in een lichte titelbox', s.title),
      o(2, 'Assen en aannames komen in beeld; de lijn(en) beginnen op nul', s.subtitle),
      o(3, `Lijn "${a}" begint te tekenen (jaar 0 tot 10)`, ''),
      o(4, `${b ? `Tweede lijn "${b}" begint mee te tekenen` : 'Lijn loopt door'}`, ''),
      o(5, 'Lijnen lopen door; jaartallen schuiven langs de x-as', ''),
      o(6, `${c ? `Derde lijn "${c}" komt erbij` : 'Lijnen naderen het einde'}`, ''),
      o(7, 'Eindpunten verschijnen met een label', (s.endNotes ?? []).join(' / ')),
      o(8, 'De tabel-samenvatting komt onder de grafiek met voetregel', s.footer),
      ...cta,
    ];
  }
  const [x, y, z] = s.stats ?? [];
  return [
    o(1, 'Drone-achtergrond, hooktekst in groot wit label', s.title),
    o(2, 'Aannames in één regel onder de titel', s.subtitle),
    o(3, 'Eerste grote getal schuift in', x ?? ''),
    o(4, 'Eerste getal blijft staan, korte uitleg eronder', x ?? ''),
    o(5, 'Tweede grote getal schuift in', y ?? ''),
    o(6, 'Tweede getal blijft staan, korte uitleg eronder', y ?? ''),
    o(7, 'Derde getal of de les van het voorbeeld', z ?? s.lesson ?? ''),
    o(8, 'Les in één zin, voetregel met het rekenvoorbeeld', `${s.lesson ?? ''} ${s.footer}`.trim()),
    ...cta,
  ];
}

function caption(a: {
  title: string;
  bullets: string[];
  extra?: string[];
  returns: boolean;
  hashtags: string[];
}): string {
  return [
    a.title,
    '',
    'Een rekenvoorbeeld:',
    ...a.bullets.map((b) => `• ${b}`),
    `• Bron: ${CALC_SOURCE}, peildatum ${IDEAS_DATE}`,
    ...(a.extra && a.extra.length ? ['', ...a.extra] : []),
    '',
    ...(a.returns ? [PAST, HYPO, RISK_WARNING_NL] : [PLAIN_DISCLAIMER]),
    '',
    `${CTA_TEXT}.`,
    '',
    a.hashtags.join(' '),
  ].join('\n');
}

const RET_NOTE = 'effectief per jaar, per maand verrekend, inleg aan het eind van de maand, nominaal, vóór kosten, belasting en inflatie';
const TAX_NOTE = 'Belasting (zoals box 3) is niet meegerekend; verifieer actuele regels voor het belastingjaar waarin je dit leest.';
const NO_TAX_CLAIM = 'Geen belastingcijfers noemen. Wordt box 3 of een ander belastingstelsel genoemd: "verifieer actuele regels, jaar X" en bron Belastingdienst/Rijksoverheid.';

function yearly(fn: (y: number) => number, years: number): { x: number; y: number }[] {
  return Array.from({ length: years + 1 }, (_, y) => ({ x: y, y: Math.round(fn(y) * 100) / 100 }));
}
const mvOf = (m: number, years: number, r: number) =>
  futureValueOfMonthlyContributions({ monthlyContribution: m, years, annualReturn: r, compounding: 'monthly', timing: 'end', rateConvention: 'effective' });
const fvIn = (m: number, years: number, r: number) => ({ monthlyContribution: m, years, annualReturn: r, compounding: 'monthly', timing: 'end', rateConvention: 'effective', annualCostRate: 0 });
const nl = (r: number) => `${r * 100}%`.replace('.', ',');

// ---------- the 15 ideas ----------

function idea01(): Idea {
  const cols = [lab('label', 'Rente bijgeschreven'), val('y10', 'Na 10 jaar', 'eur'), val('y30', 'Na 30 jaar', 'eur'), val('eff', 'Effectief per jaar', 'pct2')];
  const freq: [string, number][] = [['Per jaar', 1], ['Per maand', 12], ['Per week', 52], ['Per dag', 365]];
  const specs: RowSpec[] = freq.map(([label, n]) => ({
    label,
    highlight: n === 365,
    vals: {
      y10: calc('compoundingFrequencyValue', { principal: 10000, years: 10, nominalRate: 0.06, periodsPerYear: n }, 'endValue'),
      y30: calc('compoundingFrequencyValue', { principal: 10000, years: 30, nominalRate: 0.06, periodsPerYear: n }, 'endValue'),
      eff: calc('compoundingFrequencyValue', { principal: 10000, years: 10, nominalRate: 0.06, periodsPerYear: n }, 'effectiveAnnualRate'),
    },
  }));
  const rows = buildRows(cols, specs);
  const title = 'Rente per jaar of per dag: wat scheelt het?';
  const subtitle = '€10.000 bij 6% nominaal per jaar. Vóór kosten en belasting.';
  const hashtags = ['#renteoprente', '#beleggen', '#financieleeducatie', '#vermogensopbouw', '#geldzaken'];
  const d10 = specs[3]!.vals.y10!.value - specs[0]!.vals.y10!.value;
  const d30 = specs[3]!.vals.y30!.value - specs[0]!.vals.y30!.value;
  return {
    id: 1, slug: 'rente-per-dag-of-per-jaar', status: 'IDEA', category: 'Beurswijzer', format: 'D', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Rente per dag of per jaar bijgeschreven: scheelt dat veel?', 'Hoe vaker rente wordt bijgeschreven, hoe meer er groeit.', 'Zelfde rente, andere bijschrijving: zo groot is het verschil.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_RET, rowLabels: freq.map((f) => f[0]), highlightLabel: 'Per dag' }),
    inputs: { startbedrag: '€10.000 eenmalig', rente: '6% nominaal per jaar', bijschrijving: 'per jaar, maand, week of dag', looptijden: '10 en 30 jaar' },
    assumptions: [
      'Eenmalig €10.000, geen extra inleg. Hypothetisch nominaal rendement van 6% per jaar (de rente wordt door de bijschrijffrequentie gedeeld: 6%/n per periode).',
      'Nominaal, zonder kosten, belasting en inflatie.',
      'Per dag = 365 bijschrijvingen per jaar, per week = 52, per maand = 12.',
      'Hoe echte producten rente bijschrijven (en tegen welk percentage) is ONBEKEND en niet onderzocht; het voorbeeld zegt daar niets over.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        'Startbedrag: €10.000, eenmalig',
        'Hypothetische rente: 6% nominaal per jaar, bijgeschreven per jaar, maand, week of dag; zonder kosten, belasting en inflatie',
        `Voorbeeld: na 10 jaar is het verschil tussen per jaar en per dag ${eur(d10)}, na 30 jaar ${eur(d30)}`,
      ],
      extra: ['Het verschil komt doordat je rente over rente vaker krijgt. Het verschil wordt groter naarmate de looptijd langer is.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Percentage en frequenties zijn voorbeeldwaarden; geen suggestie dat een product zo werkt. Geen aanbieders noemen.',
      'Vermeld "nominaal" op het scherm of in de caption; het effectieve percentage staat in de laatste kolom.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening). Voor de uitleg van nominaal versus effectief rendement: een officiele uitleg (bijv. DNB/AFM/Rijksoverheid); URL en datum nog te verifieren.'],
    dataNeeded: null,
    background: { clipId: 'windmolens-01', location: 'Windmolens, Nederland', reason: 'Draaiende wieken passen bij "het blijft draaien"; rustig en herkenbaar.', inManifest: false },
    sustainability: { score: 4, rationale: 'Eén parameterrooster (bedrag x rente x looptijd) levert veel varianten; de uitleg blijft hetzelfde.', variants: 'Bedrag (1.000/5.000/10.000/25.000) x rente (3/4/6/8%) = 16 tabellen', overlapWithExistingSeries: 'Raakt "Geld in cijfers: rente op rente", maar toont bijschrijffrequentie, niet maandinleg' },
  };
}

function idea02(): Idea {
  const base = { monthlyContribution: 200, totalYears: 40, earlyContributionYears: 40, lateStartsAfterYears: 10, annualReturn: 0.06 };
  const stop = { ...base, earlyContributionYears: 10 };
  const cols = [lab('label', 'Voorbeeld'), val('contributed', 'Inleg', 'eur'), val('end', 'Na 40 jaar', 'eur')];
  const specs: RowSpec[] = [
    { label: 'Start op 25', highlight: true, vals: { contributed: calc('earlyVsLate', base, 'early.contributed'), end: calc('earlyVsLate', base, 'early.endValue') } },
    { label: 'Start op 35', vals: { contributed: calc('earlyVsLate', base, 'late.contributed'), end: calc('earlyVsLate', base, 'late.endValue') } },
    { label: 'Start op 25, stop na 10 jaar', vals: { contributed: calc('earlyVsLate', stop, 'early.contributed'), end: calc('earlyVsLate', stop, 'early.endValue') } },
  ];
  const rows = buildRows(cols, specs);
  const fv40 = mvOf(200, 40, 0.06);
  const fv30 = mvOf(200, 30, 0.06);
  const lateSeries = yearly((y) => (y <= 10 ? 0 : fv30.series[y - 10]!.valueNominal), 40);
  const title = '10 jaar eerder beginnen: wat scheelt het?';
  const subtitle = '€200 per maand, 6% per jaar, 40 jaar. Vóór kosten en belasting.';
  const hashtags = ['#vroegbeginnen', '#renteoprente', '#beleggen', '#financieleeducatie', '#vermogensopbouw'];
  const e = specs[0]!.vals.end!.value;
  const l = specs[1]!.vals.end!.value;
  const s = specs[2]!.vals.end!.value;
  return {
    id: 2, slug: 'vroeg-of-laat-beginnen', status: 'IDEA', category: 'Beurswijzer', format: 'C', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Wat scheelt het als je 10 jaar eerder begint?', 'Tijd werkt mee: 10 jaar eerder beginnen verandert het eindbedrag.', 'Twee keer hetzelfde maandbedrag, maar 10 jaar verschil in start.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'C', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), lines: ['Start op 25', 'Start op 35', 'Start op 25, stop na 10 jaar'], endNotes: [`Start op 25: ${eur(e)}`, `Start op 35: ${eur(l)}`] }),
    inputs: { maandbedrag: '€200', looptijd: '40 jaar (jaar 0 tot 40)', rendement: '6% effectief per jaar (hypothetisch)', persoonA: 'start op jaar 0 (denkbeeldig "25")', persoonB: 'start 10 jaar later (denkbeeldig "35")' },
    assumptions: [
      'Twee denkbeeldige beleggers, geen echte personen of ervaringen. "25" en "35" zijn voorbeeldleeftijden; de einddatum is 40 jaar na de start van de eerste.',
      `Beide leggen €200 per maand in, aan het eind van de maand. Hypothetisch rendement 6% ${RET_NOTE}.`,
      'Derde rij: dezelfde vroege starter stopt na 10 jaar met inleggen en laat het geld 30 jaar staan.',
      'Er is niets aangenomen over pensioenleeftijd of werkende jaren.',
    ],
    table: { columns: cols, rows },
    chart: {
      title: 'Waarde per jaar (€)', unit: 'eur', xLabel: 'Jaar',
      series: [
        { label: 'Start op 25', points: fv40.series.map((p) => ({ x: p.year, y: Math.round(p.valueNominal * 100) / 100 })) },
        { label: 'Start op 35', points: lateSeries },
        { label: 'Start op 25, stop na 10 jaar', points: yearly((y) => contributeThenHold({ monthlyContribution: 200, contributionYears: Math.min(y, 10), holdYears: Math.max(0, y - 10), annualReturn: 0.06 }).endValue, 40) },
      ],
      calculation: 'futureValueOfMonthlyContributions({monthlyContribution:200,years:40|30,annualReturn:0.06,...}).series; Start op 35 is 10 jaar vertraagd; derde lijn: contributeThenHold({contributionYears:min(jaar,10),holdYears:max(0,jaar-10)})',
    },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        'Inleg: €200 per maand, aan het eind van de maand; twee denkbeeldige beleggers',
        `Hypothetisch rendement: 6% ${RET_NOTE}`,
        `Start op 25 (40 jaar inleggen): ${eur(e)}. Start op 35 (30 jaar inleggen): ${eur(l)}`,
        `Start op 25 en na 10 jaar stoppen met inleggen: ${eur(s)}`,
      ],
      extra: ['De vroege starter legt 10 jaar langer in en heeft daarnaast 10 jaar langer rente-op-rente. Het voorbeeld laat zien hoe tijd meetelt, niet wat jij moet doen.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Duidelijk "denkbeeldige beleggers" benoemen; geen verzonnen personen met naam of verhaal.',
      'Niet suggereren dat later beginnen "te laat" is; toon neutraal. Geen urgentie of FOMO ("begin nu").',
      'Derde rij toont dat stoppen na 10 jaar niet hetzelfde is als blijven inleggen: nuance laten staan.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening).'],
    dataNeeded: null,
    background: { clipId: 'tulpen-01', location: 'Tulpenvelden', reason: 'Groei en seizoenen; past bij het thema tijd.', inManifest: false },
    sustainability: { score: 5, rationale: 'Maandbedrag, startverschil en rendement zijn vrije parameters; het formaat is direct herkenbaar.', variants: 'Maandbedrag (100/200/500) x vertraging (5/10/15 jaar) x rendement (4/6/8%) = 27', overlapWithExistingSeries: 'Geen; bestaande reeksen vergelijken geen startmomenten' },
  };
}

function idea03(): Idea {
  const hs = [10, 20, 30];
  const cols = [lab('label', 'Kosten per jaar'), val('y10', 'Na 10 jaar', 'eur'), val('y20', 'Na 20 jaar', 'eur'), val('y30', 'Na 30 jaar', 'eur')];
  const cmp = (years: number) => ({ amount: 10000, years, annualReturn: 0.06, lowCostRate: 0.002, highCostRate: 0.015 });
  const mk = (path: string, label: string, highlight = false): RowSpec => ({ label, highlight, vals: Object.fromEntries(hs.map((y) => [`y${y}`, calc('lumpSumCostComparison', cmp(y), path)])) });
  const zero: RowSpec = { label: 'Zonder kosten', vals: Object.fromEntries(hs.map((y) => [`y${y}`, calc('lumpSumFutureValue', { amount: 10000, years: y, annualReturn: 0.06, annualCostRate: 0 }, 'result')])) };
  const specs = [zero, mk('low', '0,2% kosten'), mk('high', '1,5% kosten'), mk('difference', 'Verschil', true)];
  const rows = buildRows(cols, specs);
  const title = 'Kosten van 0,2% of 1,5%: wat scheelt het?';
  const subtitle = '€10.000 eenmalig, 6% per jaar vóór kosten. Voorbeeldpercentages.';
  const hashtags = ['#beleggingskosten', '#etf', '#beleggen', '#financieleeducatie', '#vermogensopbouw'];
  const d30 = specs[3]!.vals.y30!.value;
  const share30 = calc('lumpSumCostComparison', cmp(30), 'differenceShare');
  return {
    id: 3, slug: 'kosten-02-of-15-procent', status: 'IDEA', category: 'Beurswijzer', format: 'D', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Wat doet 1,3 procentpunt aan kosten over 30 jaar?', 'Kleine kostenverschillen tellen mee, omdat ze elk jaar terugkomen.', '0,2% of 1,5% per jaar: klein getal, groot effect na 30 jaar.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), highlightLabel: 'Verschil' }),
    inputs: { startbedrag: '€10.000 eenmalig', rendement: '6% effectief per jaar vóór kosten (hypothetisch)', kosten: '0,2% en 1,5% per jaar (voorbeeld)', looptijden: '10, 20 en 30 jaar' },
    assumptions: [
      'Eenmalig €10.000, geen extra inleg. Hypothetisch rendement 6% effectief per jaar vóór kosten.',
      'Kosten per jaar over het belegde bedrag, gerekend als (1 + rendement) x (1 - kosten) per jaar; dus niet "rendement min kosten".',
      '0,2% en 1,5% zijn voorbeeldpercentages, geen opgave van bestaande producten of aanbieders.',
      'Nominaal, zonder belasting en inflatie.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        'Startbedrag: €10.000, eenmalig',
        'Hypothetisch rendement: 6% effectief per jaar vóór kosten; kosten 0,2% of 1,5% per jaar over het belegde bedrag (voorbeeldpercentages)',
        `Voorbeeld: na 30 jaar is het verschil ${eur(d30)} (${formatValue('pct0', share30.value)} van het bedrag bij 0,2% kosten)`,
        'Nominaal, zonder belasting en inflatie',
      ],
      extra: ['Kosten kunnen per product verschillen en bestaan uit meer dan één onderdeel. Kijk bij echte producten naar de officiële kosteninformatie van de aanbieder.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Geen fondsen, brokers of producten noemen of vergelijken; 0,2% en 1,5% blijven voorbeeldpercentages.',
      'Niet zeggen "kies de goedkoopste"; het voorbeeld laat alleen het rekeneffect zien.',
      'Vermeld de rekenmethode (1+r)(1-c) in de caption.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening). Optioneel: officiele uitleg over kosteninformatie bij beleggen (AFM); URL en datum nog te verifieren.'],
    dataNeeded: null,
    background: { clipId: 'rotterdam-01', location: 'Rotterdam', reason: 'Haven en skyline: zakelijk en rekenend, past bij kosten.', inManifest: false },
    sustainability: { score: 4, rationale: 'Parameterrooster van bedrag, rendement en kostenparen; vergelijking is makkelijk te herhalen.', variants: 'Bedrag (5.000/10.000/25.000) x kostenpaar (0,2-1,5 / 0,2-1,0 / 0,5-2,0) = 9 tabellen', overlapWithExistingSeries: 'Raakt de "cost"-reeks, maar toont een eenmalig bedrag in plaats van maandinleg' },
  };
}

function idea04(): Idea {
  const hs = [10, 20, 30];
  const cols = [lab('label', 'Inflatie per jaar'), val('y10', 'Na 10 jaar', 'eur'), val('y20', 'Na 20 jaar', 'eur'), val('y30', 'Na 30 jaar', 'eur')];
  const mk = (p: number, highlight = false): RowSpec => ({ label: `${nl(p)} per jaar`, highlight, vals: Object.fromEntries(hs.map((y) => [`y${y}`, calc('realValueOfAmount', { amount: 10000, years: y, inflationRate: p }, 'result')])) });
  const specs = [mk(0.02), mk(0.03, true), mk(0.04)];
  const rows = buildRows(cols, specs);
  const title = '€10.000 die stilstaat: wat is het later waard?';
  const subtitle = "In euro's van nu, bij 2%, 3% of 4% inflatie per jaar.";
  const hashtags = ['#inflatie', '#koopkracht', '#geldzaken', '#financieleeducatie', '#sparen'];
  const v2 = specs[0]!.vals.y20!.value;
  const v3 = specs[1]!.vals.y20!.value;
  return {
    id: 4, slug: 'inflatie-10000-stilstaand', status: 'IDEA', category: 'Koerstijgers', format: 'A', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Wat is €10.000 over 20 jaar nog waard?', 'Hetzelfde bedrag koopt later minder: dat is inflatie.', '€10.000 staat er over 20 jaar nog, maar wat is het dan waard?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'A', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), stats: [`Na 20 jaar bij 2%: ${eur(v2)}`, `Na 20 jaar bij 3%: ${eur(v3)}`, 'Het bedrag blijft €10.000; de koopkracht daalt'], lesson: 'Inflatie werkt ook als je niets doet.' }),
    inputs: { bedrag: '€10.000 dat niet groeit', inflatie: '2%, 3% of 4% per jaar (hypothetisch)', looptijden: '10, 20 en 30 jaar' },
    assumptions: [
      'Het bedrag groeit niet (0% rendement); alleen de prijzen stijgen met het genoemde percentage per jaar, elk jaar hetzelfde.',
      "Waarde in euro's van nu = bedrag / (1 + inflatie) ^ jaren.",
      'De percentages zijn voorbeeldwaarden; de werkelijke inflatie wisselt per jaar en per soort uitgaven. Actuele cijfers: CBS (verifieer).',
      'Geen belasting en geen rente op het bedrag meegerekend.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        '€10.000 dat niet groeit; prijzen stijgen elk jaar met 2%, 3% of 4% (voorbeeldpercentages)',
        "Waarde in euro's van nu = bedrag / (1 + inflatie) ^ jaren",
        `Voorbeeld: bij 2% inflatie is €10.000 na 20 jaar ongeveer ${eur(v2)} waard, bij 3% ongeveer ${eur(v3)}`,
      ],
      extra: ['Dit zegt niets over wat je met geld moet doen; het laat alleen zien wat inflatie met koopkracht doet. Actuele inflatiecijfers publiceert het CBS (verifieer).'],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Geen advies om te beleggen of te sparen "tegen inflatie"; alleen het rekeneffect tonen.',
      'Geen actuele of historische inflatiecijfers noemen zonder CBS-bron en peildatum.',
      'De hook "wat is het waard" vermijdt het woord "verlies" als zeker feit; het gaat om koopkracht.',
    ],
    sourcesNeeded: ['Voor een eventuele vergelijking met echte inflatie: CBS (inflatiecijfers), met URL, peildatum en periode. Niet nodig voor het rekenvoorbeeld zelf.'],
    dataNeeded: null,
    background: { clipId: 'amsterdam-nacht-01', location: 'Amsterdam bij nacht', reason: 'Stad bij nacht: nuchter, wat gedempt; past bij een serieus onderwerp.', inManifest: false },
    sustainability: { score: 4, rationale: 'Bedrag x looptijd x inflatie geeft veel tabellen; kleine variatie in framing (koopkracht, boodschappen) mogelijk.', variants: 'Bedrag (1.000/10.000/50.000) x inflatiesets (2-3-4 / 1-2-5) = 6 tabellen', overlapWithExistingSeries: 'Raakt de "inflation"-reeks (maandinleg); hier een eenmalig bedrag zonder rendement' },
  };
}

function idea05(): Idea {
  const rates = [-0.02, 0, 0.02, 0.04, 0.06];
  const cols = [lab('label', 'Rendement per jaar'), val('end', 'Eindwaarde', 'eur'), val('growth', 'Groei', 'eur')];
  const specs: RowSpec[] = rates.map((r) => ({
    label: `${nl(r)} per jaar`,
    vals: { end: calc('futureValueOfMonthlyContributions', fvIn(200, 20, r), 'totals.endValueNominal'), growth: calc('futureValueOfMonthlyContributions', fvIn(200, 20, r), 'totals.growth') },
  }));
  const rows = buildRows(cols, specs);
  const title = '€200 per maand, 20 jaar: vijf mogelijke rendementen';
  const subtitle = 'Inleg €48.000. Rendementen zijn aannames. Vóór kosten en belasting.';
  const hashtags = ['#sparenofbeleggen', '#beleggen', '#sparen', '#financieleeducatie', '#geldzaken'];
  const r0 = specs[1]!.vals.end!.value;
  const r2 = specs[2]!.vals.end!.value;
  const r6 = specs[4]!.vals.end!.value;
  const rm = specs[0]!.vals.end!.value;
  return {
    id: 5, slug: 'sparen-of-beleggen-scenarios', status: 'IDEA', category: 'Finance op orde', format: 'D', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Sparen of beleggen? Eerst: wat kan het verschil zijn?', 'Hetzelfde maandbedrag geeft heel verschillende uitkomsten.', 'Bij 2% en bij 6% leg je evenveel in, maar eindig je ergens anders.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), highlightLabel: undefined }),
    inputs: { maandbedrag: '€200', looptijd: '20 jaar', totaleInleg: '€48.000', rendementen: '-2%, 0%, 2%, 4%, 6% effectief per jaar (hypothetisch)' },
    assumptions: [
      `€200 per maand gedurende 20 jaar (totaal €48.000). Hypothetische rendementen ${RET_NOTE}.`,
      'De percentages zijn aannames, geen rentetarieven of verwachtingen. Welke rente of welk rendement een product geeft, is ONBEKEND en niet onderzocht.',
      'Rendement kan ook negatief zijn: de eerste rij toont een jaarlijkse min van 2%.',
      'Geen bescherming of garantie bij beleggen meegerekend; geen beschrijving van spaarproducten.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        '€200 per maand, aan het eind van de maand, 20 jaar lang (totaal €48.000)',
        `Hypothetische rendementen van -2% tot 6% ${RET_NOTE}`,
        `Voorbeeld: bij 0% is het eindbedrag ${eur(r0)}, bij 2% ${eur(r2)}, bij 6% ${eur(r6)}; bij -2% per jaar ${eur(rm)}`,
      ],
      extra: ['Sparen en beleggen verschillen in risico, kosten, toegankelijkheid en regels. Dit voorbeeld rekent alleen met aangenomen percentages en zegt niet welke je moet kiezen.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Titel en hooks mogen geen keuze aanraden ("beleg liever"). De rij met een negatief rendement moet in beeld blijven (geen cherry-picking).',
      'Percentages nooit als spaarrente of fondsrendement van een product presenteren.',
      'Geen actuele spaarrentes noemen zonder bron (DNB/aanbieder) en peildatum.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening). Voor een uitspraak over actuele spaarrentes: DNB-statistiek met peildatum; niet nodig in dit voorbeeld.'],
    dataNeeded: null,
    background: { clipId: 'polders-01', location: 'Polders', reason: 'Rustige, vlakke polders; past bij geduld en tijd.', inManifest: false },
    sustainability: { score: 4, rationale: 'Maandbedrag x looptijd x rendementsset geeft veel tabellen met vast verhaal.', variants: 'Maandbedrag (100/200/500) x looptijd (10/20/30) x set (-2..6 / 0..8) = 18', overlapWithExistingSeries: 'Raakt "Tabel in cijfers"; hier staan rendementen in de rijen en een negatief scenario' },
  };
}

function idea06(): Idea {
  const income = 2500;
  const cols = [lab('label', 'Potje'), val('share', 'Deel', 'text'), val('amount', 'Per maand', 'eur')];
  const parts: [string, string, 'needs' | 'wants' | 'savings', boolean][] = [
    ['Vaste lasten en noodzaak', '50%', 'needs', false],
    ['Wensen', '30%', 'wants', false],
    ['Sparen en aflossen', '20%', 'savings', true],
  ];
  const specs: RowSpec[] = parts.map(([label, share, key, hl]) => ({ label, highlight: hl, textCells: { share }, vals: { amount: calc('budgetSplit', { netMonthlyIncome: income }, key) } }));
  const rows = buildRows(cols, specs);
  const title = '50/30/20-regel: zo ziet €2.500 netto eruit';
  const subtitle = 'Vuistregel voor uitleg, geen advies. Jouw verdeling kan anders zijn.';
  const hashtags = ['#budget', '#5030', '#financieleorde', '#geldzaken', '#financieleeducatie'];
  return {
    id: 6, slug: 'budgetregel-50-30-20', status: 'IDEA', category: 'Finance op orde', format: 'A', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Hoe verdeel je je inkomen met de 50/30/20-regel?', 'De 50/30/20-regel is een vuistregel, geen wet.', 'Veel mensen hebben meer dan 50% vaste lasten. Hoe werkt de regel dan?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'A', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), stats: [`50%: ${eur(specs[0]!.vals.amount!.value)} vaste lasten`, `30%: ${eur(specs[1]!.vals.amount!.value)} wensen`, `20%: ${eur(specs[2]!.vals.amount!.value)} sparen en aflossen`], lesson: 'Een vuistregel om mee te rekenen, geen voorschrift.' }),
    inputs: { nettoMaandinkomen: '€2.500 (voorbeeld, geen gemiddelde)', verdeling: '50% noodzaak / 30% wensen / 20% sparen en aflossen' },
    assumptions: [
      'Het netto maandinkomen van €2.500 is een gekozen voorbeeld, geen gemiddeld of normaal inkomen.',
      '50/30/20 is een vuistregel voor een eerste indeling; de herkomst en precieze definitie van de categorieën zijn nog te verifieren voordat de bron wordt genoemd.',
      'Wat onder "noodzaak" valt (huur, energie, verzekeringen, boodschappen) verschilt per huishouden.',
      'Geen rendement, geen belasting en geen toeslagen meegerekend.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        'Netto maandinkomen: €2.500 (voorbeeld, geen gemiddelde)',
        `Verdeling: 50% naar vaste lasten en noodzaak (${eur(specs[0]!.vals.amount!.value)}), 30% naar wensen (${eur(specs[1]!.vals.amount!.value)}), 20% naar sparen en aflossen (${eur(specs[2]!.vals.amount!.value)})`,
        'Een vuistregel: voor veel huishoudens past de verdeling niet precies',
      ],
      extra: ['Heb je minder ruimte dan de regel aangeeft? Dan is dat geen falen; de regel is alleen een startpunt om naar je uitgaven te kijken.'],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet als persoonlijk budgetadvies presenteren; "vuistregel" en "voorbeeld" blijven zichtbaar.',
      'Geen herkomst of auteur van de regel noemen voordat die is geverifieerd.',
      'Geen schuldhulp-, toeslag- of belastingclaims; wie in financiele problemen zit kan naar erkende hulp worden verwezen (bron: officiele hulporganisaties, te verifieren).',
    ],
    sourcesNeeded: ['Herkomst/definitie van de 50/30/20-regel: een controleerbare bron (te zoeken en te verifieren). Voor huishoudcijfers: Nibud/CBS, alleen met URL en peildatum.'],
    dataNeeded: null,
    background: { clipId: 'zaanse-schans-01', location: 'Zaanse Schans', reason: 'Huisjes en molens: huishouden, vertrouwd en overzichtelijk.', inManifest: false },
    sustainability: { score: 3, rationale: 'Inkomens en verdelingen zijn te varieren, maar de uitleg is eenmalig; veel herhaling voelt snel hetzelfde.', variants: 'Inkomen (€1.800/€2.500/€3.200) x verdeling (50/30/20, 60/20/20, 70/20/10) = 9', overlapWithExistingSeries: 'Geen' },
  };
}

function idea07(): Idea {
  const exp = 2000;
  const saving = 250;
  const cols = [lab('label', 'Buffer'), val('target', 'Bedrag', 'eur'), val('build', 'Opbouwen bij €250', 'duration')];
  const specs: RowSpec[] = [3, 4, 5, 6].map((m) => ({
    label: `${m} maanden uitgaven`,
    vals: { target: calc('emergencyBuffer', { monthlyExpenses: exp, bufferMonths: m, monthlySaving: saving }, 'target'), build: calc('emergencyBuffer', { monthlyExpenses: exp, bufferMonths: m, monthlySaving: saving }, 'monthsToBuild') },
  }));
  const rows = buildRows(cols, specs);
  const title = 'Noodbuffer: hoeveel is 3 tot 6 maanden uitgaven?';
  const subtitle = 'Voorbeeld: €2.000 uitgaven per maand en €250 per maand apart.';
  const hashtags = ['#noodbuffer', '#sparen', '#financieleorde', '#geldzaken', '#financieleeducatie'];
  return {
    id: 7, slug: 'noodbuffer-rekenvoorbeeld', status: 'IDEA', category: 'Finance op orde', format: 'D', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Hoeveel geld heb je nodig als er iets onverwachts gebeurt?', 'Een noodbuffer reken je uit in maanden uitgaven, niet in een vast bedrag.', 'Drie maanden uitgaven of zes: wat is het verschil in bedrag en tijd?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), highlightLabel: undefined }),
    inputs: { uitgavenPerMaand: '€2.000 (voorbeeld)', bufferInMaanden: '3, 4, 5 en 6', apartPerMaand: '€250 (voorbeeld)' },
    assumptions: [
      'Maandelijkse uitgaven van €2.000 en €250 per maand apart zijn gekozen voorbeelden, geen gemiddelden.',
      'Buffer = maandelijkse uitgaven x aantal maanden. Opbouwtijd = buffer / maandbedrag, naar boven afgerond op hele maanden.',
      'Zonder rente en zonder extra inkomsten of uitgaven in de tussentijd.',
      '"3 tot 6 maanden" is een veelgebruikte vuistregel; de bron en de actuele adviezen daarvoor zijn nog te verifieren voordat ze genoemd worden.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        'Uitgaven: €2.000 per maand (voorbeeld). Buffer = uitgaven x aantal maanden',
        'Opbouwen met €250 per maand, zonder rente, afgerond op hele maanden',
        `Voorbeeld: 3 maanden is ${eur(specs[0]!.vals.target!.value)} en kost ${formatValue('duration', specs[0]!.vals.build!.value)} sparen; 6 maanden is ${eur(specs[3]!.vals.target!.value)} en kost ${formatValue('duration', specs[3]!.vals.build!.value)}`,
      ],
      extra: ['Hoeveel buffer bij jou past hangt af van je vaste lasten, werk en gezin. Dit voorbeeld laat alleen zien hoe je het uitrekent.'],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet als persoonlijk advies ("jij hebt 6 maanden nodig"); alleen rekenmethode en voorbeeld.',
      'Geen productaanbeveling voor spaarrekeningen; geen rentecijfers zonder bron.',
      'De vuistregel "3-6 maanden" pas noemen na verificatie bij Nibud of een andere officiele bron.',
    ],
    sourcesNeeded: ['Bron voor de vuistregel "3 tot 6 maanden uitgaven" (bijv. Nibud): te zoeken, URL en datum te verifieren. Niet nodig voor de rekenmethode.'],
    dataNeeded: null,
    background: { clipId: 'kinderdijk-01', location: 'Kinderdijk', reason: 'Dijken en molens beschermen tegen water: beeld voor een buffer.', inManifest: false },
    sustainability: { score: 3, rationale: 'Uitgaven en maandbedragen zijn te varieren; thema blijft smal.', variants: 'Uitgaven (€1.500/€2.000/€3.000) x maandbedrag (€100/€250/€500) = 9', overlapWithExistingSeries: 'Geen' },
  };
}

function idea08(): Idea {
  const terms = [24, 36, 60];
  const cols = [lab('label', 'Looptijd'), val('r6', 'Rente totaal bij 6%', 'eur'), val('r12', 'Rente totaal bij 12%', 'eur')];
  const specs: RowSpec[] = terms.map((n) => ({
    label: `${n} maanden`,
    vals: {
      r6: calc('annuityLoan', { principal: 5000, annualRate: 0.06, months: n }, 'totalInterest'),
      r12: calc('annuityLoan', { principal: 5000, annualRate: 0.12, months: n }, 'totalInterest'),
    },
    highlight: n === 36,
  }));
  const rows = buildRows(cols, specs);
  const title = '€5.000 lenen: wat kost de rente?';
  const subtitle = 'Annuïteit, rente nominaal per jaar. Voorbeeldrentes, geen aanbod.';
  const hashtags = ['#lenen', '#aflossen', '#schulden', '#financieleorde', '#financieleeducatie'];
  const pay6 = calc('annuityLoan', { principal: 5000, annualRate: 0.06, months: 36 }, 'monthlyPayment');
  const pay12 = calc('annuityLoan', { principal: 5000, annualRate: 0.12, months: 36 }, 'monthlyPayment');
  const ex = { principal: 5000, annualRate: 0.12, months: 60, extraMonthly: 50 };
  const exMonths = calc('annuityLoan', ex, 'monthsToRepay');
  const exInt = calc('annuityLoan', ex, 'totalInterest');
  const baseInt = specs[2]!.vals.r12!;
  return {
    id: 8, slug: 'lening-5000-rentekosten', status: 'IDEA', category: 'Finance op orde', format: 'D', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Wat betaalt een lening van €5.000 aan rente?', 'Een langere looptijd verlaagt je maandlast, maar verhoogt de rente.', 'Lage maandlast of lage rentekosten: je krijgt zelden allebei.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), highlightLabel: '36 maanden' }),
    inputs: { lening: '€5.000', looptijden: '24, 36 en 60 maanden', rentes: '6% en 12% nominaal per jaar (voorbeeld)', extraAflossing: '€50 per maand (variant)' },
    assumptions: [
      'Annuïteitenlening: elke maand dezelfde betaling (rente + aflossing) aan het eind van de maand.',
      'Maandrente = jaarrente / 12 (nominaal). Kosten, boetes en verzekeringen zijn niet meegerekend.',
      '6% en 12% zijn voorbeeldpercentages, geen aanbod en niet representatief voor een bestaande aanbieder; wettelijke maxima en actuele regels zijn niet onderzocht (verifieer).',
      'Geen advies om te lenen of niet te lenen.',
    ],
    table: { columns: cols, rows },
    claims: [
      ...claimsFromTable(cols, rows),
      { key: 'pay6-36', text: 'Maandlast bij 6%, 36 maanden', value: pay6.value, unit: 'eur2', calculationRef: pay6.ref, role: 'result' },
      { key: 'pay12-36', text: 'Maandlast bij 12%, 36 maanden', value: pay12.value, unit: 'eur2', calculationRef: pay12.ref, role: 'result' },
      { key: 'extra-months', text: 'Variant: 12%, 60 maanden, €50 extra per maand: aantal maanden tot afgelost', value: exMonths.value, unit: 'duration', calculationRef: exMonths.ref, role: 'result' },
      { key: 'extra-interest', text: 'Variant: totale rente met €50 extra per maand', value: exInt.value, unit: 'eur', calculationRef: exInt.ref, role: 'result' },
    ],
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        'Lening van €5.000 als annuïteit: elke maand dezelfde betaling; rente nominaal per jaar gedeeld door 12',
        'Voorbeeldrentes van 6% en 12%; zonder kosten, boetes of verzekeringen',
        `Voorbeeld: bij 36 maanden is de maandlast ${eur2(pay6.value)} (6%) of ${eur2(pay12.value)} (12%)`,
        `Variant: bij 12% en 60 maanden met €50 extra aflossen per maand ben je na ${formatValue('duration', exMonths.value)} klaar en betaal je ${eur(exInt.value)} rente in plaats van ${eur(baseInt.value)}`,
      ],
      extra: ['Voor een echte lening gelden de voorwaarden van de aanbieder en de geldende regels voor krediet; die kunnen afwijken van dit voorbeeld.'],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Geen kredietaanbieders of leenproducten noemen; geen aansporing om te lenen. Kredietreclame kent regels (verifieer actuele Wft-voorschriften voordat er een percentage als "aanbod" oogt).',
      'De rentes expliciet "voorbeeld" noemen en nooit als marktrente presenteren.',
      'Niet-speculatief en sober van toon; geen schuldenverhaal met personen.',
      'Wettelijke kostenvoorschriften (bijv. het totale kostenpercentage, JKP) niet vereenvoudigen tot een eigen claim; in dit rekenvoorbeeld alleen rente.',
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening). Voor uitspraken over echte kredietrentes of regels: AFM/Rijksoverheid, met URL en peildatum.'],
    dataNeeded: null,
    background: { clipId: 'haarlem-01', location: 'Haarlem', reason: 'Rustig stadsbeeld; nuchter en niet dramatisch.', inManifest: false },
    sustainability: { score: 4, rationale: 'Bedrag x looptijd x rente geeft veel tabellen; de variant extra aflossen is een tweede lijn.', variants: 'Bedrag (€2.500/€5.000/€10.000) x rentesets (4-8 / 6-12 / 8-15%) x extra aflossing = 18', overlapWithExistingSeries: 'Geen' },
  };
}

function idea09(): Idea {
  const monthly = calc('dailyToMonthly', { daily: 4 }, 'result');
  const hs = [10, 20, 30];
  const cols = [lab('label', 'Na'), val('contributed', 'Inleg', 'eur'), val('end', 'Eindwaarde', 'eur')];
  const specs: RowSpec[] = hs.map((y) => ({
    label: `${y} jaar`,
    highlight: y === 30,
    vals: { contributed: calc('futureValueOfMonthlyContributions', fvIn(monthly.value, y, 0.06), 'totals.contributed'), end: calc('futureValueOfMonthlyContributions', fvIn(monthly.value, y, 0.06), 'totals.endValueNominal') },
  }));
  const rows = buildRows(cols, specs);
  const fv = mvOf(monthly.value, 30, 0.06);
  const title = '€4 per dag: wat wordt dat na 10, 20 en 30 jaar?';
  const subtitle = '€4 per dag is €121,67 per maand. 6% per jaar, vóór kosten en belasting.';
  const hashtags = ['#kleinebedragen', '#renteoprente', '#beleggen', '#financieleeducatie', '#geldzaken'];
  return {
    id: 9, slug: 'koffie-4-euro-per-dag', status: 'IDEA', category: 'Finance op orde', format: 'C', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Wat wordt €4 per dag over 30 jaar?', 'Kleine dagelijkse bedragen tellen op, ook zonder dat je het merkt.', '€4 is bijna niets op een dag, maar over 30 jaar is het een rekensom.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'C', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), lines: ['Waarde', 'Inleg'], endNotes: [`Na 30 jaar: ${eur(specs[2]!.vals.end!.value)}`, `Inleg: ${eur(specs[2]!.vals.contributed!.value)}`] }),
    inputs: { perDag: '€4', perMaand: '€121,67 (€4 x 365 / 12)', rendement: '6% effectief per jaar (hypothetisch)', looptijden: '10, 20 en 30 jaar' },
    assumptions: [
      `€4 per dag, 365 dagen per jaar, is €121,67 per maand. Het bedrag wordt aan het eind van de maand belegd. Hypothetisch rendement 6% ${RET_NOTE}.`,
      'Geen oordeel over koffie of andere uitgaven; het voorbeeld laat alleen zien hoe kleine bedragen optellen.',
      'Het bedrag kan alleen worden belegd als het ook echt overblijft; dit is geen aanmoediging om op uitgaven te bezuinigen.',
      'Geen kosten, belasting en inflatie meegerekend.',
    ],
    table: { columns: cols, rows },
    chart: {
      title: 'Waarde en inleg per jaar (€)', unit: 'eur', xLabel: 'Jaar',
      series: [
        { label: 'Waarde', points: fv.series.map((p) => ({ x: p.year, y: Math.round(p.valueNominal * 100) / 100 })) },
        { label: 'Inleg', points: fv.series.map((p) => ({ x: p.year, y: Math.round(p.contributed * 100) / 100 })) },
      ],
      calculation: 'futureValueOfMonthlyContributions({monthlyContribution:4*365/12,years:30,annualReturn:0.06,...}).series',
    },
    claims: [...claimsFromTable(cols, rows), { key: 'monthly', text: '€4 per dag per maand (4 x 365 / 12)', value: monthly.value, unit: 'eur2', calculationRef: monthly.ref, role: 'assumption' }],
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        '€4 per dag is gemiddeld €121,67 per maand (€4 x 365 dagen / 12), belegd aan het eind van elke maand',
        `Hypothetisch rendement: 6% ${RET_NOTE}`,
        `Voorbeeld: na 30 jaar is de inleg ${eur(specs[2]!.vals.contributed!.value)} en het eindbedrag ${eur(specs[2]!.vals.end!.value)}`,
      ],
      extra: ['Het gaat niet om koffie: elke kleine, terugkerende uitgave of inleg kun je zo doorrekenen. Wat voor jou past, hangt van je eigen situatie af.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet moraliseren of bezuinigen aanraden; de toon blijft neutraal. Koffie is een voorbeeld, geen merk.',
      'Niet suggereren dat dit bedrag "verloren gaat" of dat de kijker een fout maakt.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening).'],
    dataNeeded: null,
    background: { clipId: 'amsterdam-01', location: 'Amsterdam', reason: 'Herkenbare stad met grachten; past bij dagelijks leven en koffie.', inManifest: false },
    sustainability: { score: 5, rationale: 'Elke dagelijkse uitgave (lunch, abonnement, snack) is een nieuwe variant met dezelfde opzet.', variants: 'Bedrag per dag (€2/€4/€8) x rendement (4/6/8%) x uitgavesoort = 20+', overlapWithExistingSeries: 'Raakt "Geld in cijfers" (maandinleg), maar met een dagelijks bedrag als haakje' },
  };
}

function idea10(): Idea {
  const hs = [10, 20, 30];
  const cols = [lab('label', 'Voorbeeld'), val('y10', 'Na 10 jaar', 'eur'), val('y20', 'Na 20 jaar', 'eur'), val('y30', 'Na 30 jaar', 'eur')];
  const lump = (y: number) => calc('lumpSumFutureValue', { amount: 10000, years: y, annualReturn: 0.06, annualCostRate: 0 }, 'result');
  const mo = (y: number, path: string) => calc('futureValueOfMonthlyContributions', fvIn(100, y, 0.06), path);
  const specs: RowSpec[] = [
    { label: '€10.000 in één keer', vals: Object.fromEntries(hs.map((y) => [`y${y}`, lump(y)])) },
    { label: '€100 per maand', highlight: true, vals: Object.fromEntries(hs.map((y) => [`y${y}`, mo(y, 'totals.endValueNominal')])) },
    { label: 'Inleg bij €100 per maand', vals: Object.fromEntries(hs.map((y) => [`y${y}`, mo(y, 'totals.contributed')])) },
  ];
  const rows = buildRows(cols, specs);
  const mv = mvOf(100, 30, 0.06);
  const title = '€10.000 in één keer of €100 per maand?';
  const subtitle = '6% per jaar, vóór kosten en belasting. Totale inleg verschilt.';
  const hashtags = ['#beleggen', '#maandelijksinleggen', '#renteoprente', '#financieleeducatie', '#vermogensopbouw'];
  return {
    id: 10, slug: 'eenmalig-of-maandelijks', status: 'IDEA', category: 'Beurswijzer', format: 'C', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('€10.000 in één keer of €100 per maand: wat is het verschil?', 'Een eenmalig bedrag en een maandbedrag groeien op een andere manier.', '€10.000 begint hoog, €100 per maand haalt in. Wanneer?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'C', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), lines: ['€10.000 in één keer', '€100 per maand'], endNotes: [`Na 30 jaar: ${eur(specs[0]!.vals.y30!.value)}`, `Na 30 jaar: ${eur(specs[1]!.vals.y30!.value)}`] }),
    inputs: { eenmalig: '€10.000 op dag 1', maandelijks: '€100 per maand, aan het eind van de maand', rendement: '6% effectief per jaar (hypothetisch)', looptijden: '10, 20 en 30 jaar' },
    assumptions: [
      `Hypothetisch rendement 6% ${RET_NOTE}.`,
      'De totale inleg verschilt: €10.000 eenmalig tegenover €12.000, €24.000 of €36.000 bij €100 per maand. Daarom staat de inleg in de derde rij.',
      'Het voorbeeld vergelijkt geen "beter of slechter"; het laat zien dat tijd en timing van inleg meetellen.',
      'Geen kosten, belasting en inflatie meegerekend.',
    ],
    table: { columns: cols, rows },
    chart: {
      title: 'Waarde per jaar (€)', unit: 'eur', xLabel: 'Jaar',
      series: [
        { label: '€10.000 in één keer', points: yearly((y) => lumpSumFutureValue({ amount: 10000, years: y, annualReturn: 0.06 }), 30) },
        { label: '€100 per maand', points: mv.series.map((p) => ({ x: p.year, y: Math.round(p.valueNominal * 100) / 100 })) },
      ],
      calculation: 'lumpSumFutureValue({amount:10000,years:0..30,annualReturn:0.06}) en futureValueOfMonthlyContributions({monthlyContribution:100,years:30,annualReturn:0.06,...}).series',
    },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        '€10.000 in één keer (dag 1) tegenover €100 per maand, aan het eind van de maand',
        `Hypothetisch rendement: 6% ${RET_NOTE}`,
        `Voorbeeld: na 10 jaar ${eur(specs[0]!.vals.y10!.value)} (eenmalig) tegenover ${eur(specs[1]!.vals.y10!.value)} (maandelijks); na 30 jaar ${eur(specs[0]!.vals.y30!.value)} tegenover ${eur(specs[1]!.vals.y30!.value)}`,
        'Totale inleg: €10.000 tegenover €12.000 (10 jaar), €24.000 (20 jaar) of €36.000 (30 jaar)',
      ],
      extra: ['Wat bij jou past hangt af van wat je kunt missen en wanneer. Dit voorbeeld rekent alleen met aannames.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet de uitkomst als "beste strategie" presenteren; geen aansporing om het geld in één keer te beleggen of te spreiden.',
      'Het verschil in totale inleg moet zichtbaar zijn (derde rij), anders is de vergelijking oneerlijk.',
      NO_TAX_CLAIM,
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening). Als de uitleg over "in één keer versus spreiden" historische onderzoeken noemt: bronnen apart verifieren.'],
    dataNeeded: null,
    background: { clipId: 'amsterdam-dam-01', location: 'Amsterdam, de Dam', reason: 'Centrale plek in Amsterdam; past bij "grote stap versus kleine stappen".', inManifest: false },
    sustainability: { score: 4, rationale: 'Eenmalig bedrag x maandbedrag x looptijd x rendement; het vergelijkingsformat is herkenbaar.', variants: 'Eenmalig (5.000/10.000/25.000) x maandbedrag (100/250/500) = 9', overlapWithExistingSeries: 'Geen' },
  };
}

function idea11(): Idea {
  const spend = [24000, 30000, 36000];
  const cols = [lab('label', 'Uitgaven per jaar'), val('r4', 'Bij 4% (25x)', 'eur'), val('r3', 'Bij 3% (±33x)', 'eur')];
  const specs: RowSpec[] = spend.map((a) => ({
    label: eur(a),
    highlight: a === 30000,
    vals: { r4: calc('independenceTarget', { annualExpenses: a, withdrawalRate: 0.04 }, 'target'), r3: calc('independenceTarget', { annualExpenses: a, withdrawalRate: 0.03 }, 'target') },
  }));
  const rows = buildRows(cols, specs);
  const title = 'Financiële vrijheid: wat is 25 keer je uitgaven?';
  const subtitle = 'Vuistregel: jaaruitgaven delen door 4%. Geen garantie, geen advies.';
  const hashtags = ['#financieleonafhankelijkheid', '#4procentregel', '#fire', '#financieleeducatie', '#vermogensopbouw'];
  return {
    id: 11, slug: 'vuistregel-25x-uitgaven', status: 'IDEA', category: 'Finance op orde', format: 'A', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Hoeveel vermogen heb je nodig om van je vermogen te leven?', 'De 4%-regel is een vuistregel, geen belofte.', 'Van 4% opnemen naar 25 keer sparen: dezelfde som, twee kanten.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'A', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), stats: [`${eur(30000)} per jaar x 25 = ${eur(specs[1]!.vals.r4!.value)}`, `Bij 3% opnemen: ${eur(specs[1]!.vals.r3!.value)}`, 'Een rekensom, geen voorspelling'], lesson: 'Een vuistregel met veel kanttekeningen.' }),
    inputs: { uitgavenPerJaar: '€24.000, €30.000 of €36.000 (voorbeelden)', opneemPercentage: '4% (25x) en 3% (±33x)' },
    assumptions: [
      'Streefbedrag = jaaruitgaven / opneempercentage: bij 4% is dat 25 keer, bij 3% ongeveer 33,3 keer de jaaruitgaven.',
      'De 4%-regel is een vuistregel uit (waarschijnlijk Amerikaans) onderzoek over lange periodes; de herkomst en geldigheid voor Nederland zijn nog te verifieren voordat de bron wordt genoemd.',
      'Kanttekeningen die in beeld of caption moeten: geen garantie, rendementen en inflatie schommelen, de volgorde van goede en slechte jaren telt mee, de looptijd (hoeveel jaar) is cruciaal, kosten en belasting zijn niet meegerekend.',
      'De uitgavenbedragen zijn voorbeelden, geen gemiddelden.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        'Streefbedrag = jaarlijkse uitgaven gedeeld door het opneempercentage (4% geeft 25x, 3% geeft ongeveer 33x)',
        'Voorbeelduitgaven van €24.000, €30.000 en €36.000 per jaar',
        `Voorbeeld: bij €30.000 uitgaven per jaar is het streefbedrag ${eur(specs[1]!.vals.r4!.value)} (4%) of ${eur(specs[1]!.vals.r3!.value)} (3%)`,
      ],
      extra: [
        'Let op de kanttekeningen: dit is een vuistregel en geen garantie. Beleggingsopbrengsten en inflatie schommelen, de volgorde van goede en slechte jaren speelt mee, kosten en belasting zijn niet meegerekend en het gaat over een langere periode dan je nu kunt overzien.',
        TAX_NOTE,
      ],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Bij elke vermelding: "vuistregel", "geen garantie". Nooit "dit is wat je nodig hebt" of een persoonlijke streefsom suggereren.',
      'De bron van de 4%-regel (onderzoek, periode, land, aannames) eerst verifieren; tot die tijd niet noemen en geen claim "dit werkt historisch".',
      'Geen veilige-opneemclaims en geen pensioen- of AOW-uitspraken; box 3 en pensioenregels alleen noemen met "verifieer actuele regels, jaar X".',
      'Geen urgentie ("stop met werken"); toon neutraal, FIRE-jargon vermijden of uitleggen.',
    ],
    sourcesNeeded: ['Onderzoeksbron voor de 4%-regel (auteurs, jaar, markt, periode) en een Nederlandse bron voor kanttekeningen: te zoeken en te verifieren; tot die tijd geen bronvermelding in beeld.'],
    dataNeeded: null,
    background: { clipId: 'veere-01', location: 'Veere', reason: 'Rustige havenstad; sfeer van overzicht en rust.', inManifest: false },
    sustainability: { score: 3, rationale: 'Uitgavenreeks x percentage geeft varianten, maar het thema is gevoelig en vraagt telkens kanttekeningen.', variants: 'Uitgaven (€18.000 tot €48.000) x percentage (3/3,5/4%) = 15', overlapWithExistingSeries: 'Geen' },
  };
}

function idea12(): Idea {
  const base = (step: number, years = 10) => ({ initialMonthly: 100, yearlyStep: step, years, annualReturn: 0.06 });
  const cols = [lab('label', 'Van elke verhoging'), val('contributed', 'Inleg', 'eur'), val('end', 'Na 10 jaar', 'eur')];
  const specs: RowSpec[] = [
    { label: 'Niets apart', vals: { contributed: calc('steppedSaving', base(0), 'contributed'), end: calc('steppedSaving', base(0), 'endValue') } },
    { label: '50% (+€50 per jaar)', highlight: true, vals: { contributed: calc('steppedSaving', base(50), 'contributed'), end: calc('steppedSaving', base(50), 'endValue') } },
    { label: '100% (+€100 per jaar)', vals: { contributed: calc('steppedSaving', base(100), 'contributed'), end: calc('steppedSaving', base(100), 'endValue') } },
  ];
  const rows = buildRows(cols, specs);
  const line = (step: number) => yearly((y) => steppedSaving(base(step, y)).endValue, 10);
  const title = 'Salarisverhoging: wat als je de helft belegt?';
  const subtitle = '€100 per maand, elk jaar €100 netto erbij. 10 jaar, 6% per jaar.';
  const hashtags = ['#salarisverhoging', '#beleggen', '#lifestyleinflatie', '#financieleorde', '#financieleeducatie'];
  const fin = calc('steppedSaving', base(50), 'finalMonthly');
  return {
    id: 12, slug: 'salarisverhoging-helft-apart', status: 'IDEA', category: 'Finance op orde', format: 'C', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Wat als je de helft van elke salarisverhoging apart zet?', 'Je inleg mag meegroeien met je inkomen; dat telt op.', 'Je loon stijgt, je inleg blijft gelijk. Wat verandert er als dat anders is?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'C', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), lines: ['Niets apart', '50% van elke verhoging', '100% van elke verhoging'], endNotes: [`Niets apart: ${eur(specs[0]!.vals.end!.value)}`, `50%: ${eur(specs[1]!.vals.end!.value)}`] }),
    inputs: { startInleg: '€100 per maand', verhoging: '€100 netto per maand erbij, één keer per jaar (voorbeeld)', apartGezet: '0%, 50% of 100% van elke verhoging', looptijd: '10 jaar', rendement: '6% effectief per jaar (hypothetisch)' },
    assumptions: [
      `Startinleg €100 per maand. Elk jaar vanaf jaar 2 komt er netto €100 per maand bij; 0%, 50% (€50) of 100% (€100) daarvan wordt extra ingelegd. Hypothetisch rendement 6% ${RET_NOTE}.`,
      'De verhoging van €100 netto per maand elk jaar is een gekozen voorbeeld, geen verwachting van een salarisontwikkeling.',
      'In het laatste jaar is de maandinleg bij 50% gestegen tot €550 per maand; bij 100% tot €1.000 per maand. Of dat haalbaar is, hangt van je situatie af.',
      'Geen kosten, belasting en inflatie meegerekend.',
    ],
    table: { columns: cols, rows },
    chart: {
      title: 'Waarde per jaar (€)', unit: 'eur', xLabel: 'Jaar',
      series: [
        { label: 'Niets apart', points: line(0) },
        { label: '50% van elke verhoging', points: line(50) },
        { label: '100% van elke verhoging', points: line(100) },
      ],
      calculation: 'steppedSaving({initialMonthly:100,yearlyStep:0|50|100,years:0..10,annualReturn:0.06}).endValue',
    },
    claims: [...claimsFromTable(cols, rows), { key: 'final-monthly-50', text: 'Maandinleg in jaar 10 bij 50% van elke verhoging', value: fin.value, unit: 'eur', calculationRef: fin.ref, role: 'result' }],
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        'Start: €100 per maand. Elk jaar vanaf jaar 2 netto €100 per maand erbij (voorbeeld); 0%, 50% of 100% daarvan wordt extra ingelegd',
        `Hypothetisch rendement: 6% ${RET_NOTE}`,
        `Voorbeeld: na 10 jaar ${eur(specs[0]!.vals.end!.value)} (niets extra), ${eur(specs[1]!.vals.end!.value)} (50%) of ${eur(specs[2]!.vals.end!.value)} (100%)`,
        `Bij 50% is de maandinleg in jaar 10 gestegen tot ${eur(fin.value)}`,
      ],
      extra: ['Het gaat om een idee om mee te rekenen, geen advies om je uitgaven te verlagen of je inkomen te besteden. Of een verhoging overblijft, hangt van je eigen situatie af.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet adviseren om een percentage van het salaris te beleggen; het is een rekenvoorbeeld met "als je dat zou doen".',
      'Voorbeeldverhoging (€100 netto per jaar) niet als normale loonstijging presenteren.',
      'Geen belasting- of loonclaims (schijven, netto/bruto); bij vermelding "verifieer actuele regels, jaar X".',
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening).'],
    dataNeeded: null,
    background: { clipId: 'den-haag-01', location: 'Den Haag', reason: 'Werkstad met kantoren; past bij salaris.', inManifest: false },
    sustainability: { score: 4, rationale: 'Startinleg x stap x aandeel x looptijd; herkenbaar thema dat mensen in hun leven tegenkomen.', variants: 'Startinleg (50/100/250) x stap (50/100) x aandeel (25/50/100%) = 18', overlapWithExistingSeries: 'Geen' },
  };
}

function idea13(): Idea {
  const amounts = [250, 500, 750, 1000];
  const rates: [string, number, string][] = [['r0', 0, 'Zonder rendement'], ['r4', 0.04, 'Bij 4%'], ['r7', 0.07, 'Bij 7%']];
  const cols = [lab('label', 'Per maand'), ...rates.map(([k, , l]) => val(k, l, 'duration'))];
  const specs: RowSpec[] = amounts.map((m) => ({
    label: eur(m),
    highlight: m === 500,
    vals: Object.fromEntries(rates.map(([k, r]) => [k, calc('timeToTarget', { target: 100000, monthlyContribution: m, annualReturn: r }, 'months')])),
  }));
  const rows = buildRows(cols, specs);
  const title = 'Hoe lang duurt het om €100.000 te bereiken?';
  const subtitle = 'Inleg per maand, rendement per jaar (hypothetisch). Vóór kosten en belasting.';
  const hashtags = ['#100000euro', '#vermogensopbouw', '#renteoprente', '#financieleeducatie', '#beleggen'];
  return {
    id: 13, slug: 'tijd-tot-100000-euro', status: 'IDEA', category: 'Beurswijzer', format: 'D', dataOrigin: 'calculated', involvesReturns: true,
    hooks: hooks('Hoe lang duurt het om €100.000 op te bouwen?', 'Je maandbedrag en je rendement bepalen samen hoe lang het duurt.', 'Zonder rendement duurt het veel langer dan met rendement. Hoeveel langer?'),
    title,
    onScreen: { title, subtitle, footer: FOOT_RET, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: FOOT_RET, rowLabels: specs.map((x) => x.label), highlightLabel: '€500' }),
    inputs: { doel: '€100.000', beginsaldo: '€0', maandbedragen: '€250, €500, €750, €1.000', rendementen: '0%, 4% en 7% effectief per jaar (hypothetisch)' },
    assumptions: [
      `Doel €100.000, beginsaldo €0, inleg aan het eind van de maand. Hypothetische rendementen ${RET_NOTE}.`,
      'Looptijd = eerste maand waarin het saldo het doel haalt of overschrijdt.',
      'De rij "Zonder rendement" is alleen sparen zonder groei (€100.000 / maandbedrag).',
      'De rendementen zijn aannames, geen verwachtingen. Inflatie blijft buiten beeld: €100.000 later is minder waard dan nu.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: true, hashtags,
      bullets: [
        'Doel: €100.000, beginsaldo €0, inleg per maand aan het eind van de maand',
        `Hypothetische rendementen: 0%, 4% en 7% ${RET_NOTE}`,
        `Voorbeeld: €500 per maand duurt ${formatValue('duration', specs[1]!.vals.r0!.value)} zonder rendement, ${formatValue('duration', specs[1]!.vals.r4!.value)} bij 4% en ${formatValue('duration', specs[1]!.vals.r7!.value)} bij 7%`,
      ],
      extra: ['Het is een rekenvoorbeeld: echte rendementen verlopen niet vlak, en het kan ook langer duren of niet lukken.', TAX_NOTE],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Niet suggereren dat €100.000 haalbaar of nodig is; het is een rekendoel. Geen "word rijk"-taal.',
      'Rij "Zonder rendement" laten staan: laat zien wat rendement doet zonder het te beloven.',
      'Inflatie noemen in caption (zit erin). Belasting alleen met "verifieer actuele regels, jaar X".',
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening).'],
    dataNeeded: null,
    background: { clipId: 'kinderdijk-02', location: 'Kinderdijk', reason: 'Lange rij molens langs het water: tijd en geduld.', inManifest: false },
    sustainability: { score: 5, rationale: 'Doelbedrag x maandbedrag x rendement; elk doel (€10.000, €50.000, €250.000, €1 miljoen) is een nieuwe aflevering.', variants: 'Doel (10k/50k/100k/250k/1M) x maandbedragen x rendementsset = 15+', overlapWithExistingSeries: 'Raakt "Tabel in cijfers", maar keert de vraag om: tijd in plaats van eindbedrag' },
  };
}

function idea14(): Idea {
  const names = ['ETF A', 'ETF B', 'ETF C', 'ETF D', 'ETF E', 'ETF F', 'ETF G', 'ETF H', 'ETF I', 'ETF J'];
  const cols = [lab('name', 'Naam ETF'), val('ret', 'Rendement, periode', 'text'), val('ter', 'Kosten per jaar', 'text')];
  const rows: IdeaRow[] = names.map((n) => ({
    cells: { name: `[${n}: naam uit dataset]`, ret: '[DATA NODIG]', ter: '[DATA NODIG]' },
    values: {}, refs: {}, highlight: false, placeholder: true,
  }));
  const title = 'ETF-ranglijst: rendement over {periode}';
  const subtitle = 'Bron: {bron}. Peildatum: {peildatum}. Alleen verleden.';
  const hashtags = ['#etf', '#beleggen', '#etfs', '#financieleeducatie', '#rendement'];
  return {
    id: 14, slug: 'etf-ranglijst-sjabloon', status: 'IDEA', category: 'Beurswijzer', format: 'D', dataOrigin: 'template-awaiting-data', involvesReturns: true,
    hooks: hooks('Welke ETF’s hadden de afgelopen {periode} het hoogste rendement?', 'Een ranglijst laat het verleden zien, niet wat er komt.', 'Bovenaan in {periode}: wat zegt dat, en wat niet?'),
    title,
    onScreen: { title, subtitle, footer: 'Verleden geeft geen garantie. Geen advies.', cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'D', title, subtitle, footer: 'Verleden geeft geen garantie. Geen advies.', rowLabels: names.map((n) => `[${n}]`), highlightLabel: undefined }),
    inputs: { status: 'SJABLOON: wacht op dataset van de eigenaar', periode: '{periode}', bron: '{bron}', peildatum: '{peildatum}' },
    assumptions: [
      'Geen enkel getal, naam of rendement in dit sjabloon is echt; alles tussen [] of {} wordt pas ingevuld met een door de eigenaar aangeleverde dataset.',
      'Eén periode per ranglijst, sortering gecontroleerd, per rij bron, peildatum en periode (Redactiebeleid sectie 7.3).',
      'Rendement uit het verleden; vóór of na kosten, in welke valuta en met of zonder herbelegging moet in de dataset staan.',
      'De referentie van de eigenaar (screenshot van een ETF-ranglijst-Reel van een ander account: 20 ETF’s, 5-jaarsrendement, drone-achtergrond, witte labels) is het uitgangspunt voor de opmaak; de inhoud niet.',
    ],
    table: { columns: cols, rows, sortDirection: 'desc' },
    claims: [],
    caption: [
      'ETF-ranglijst: rendement over {periode}',
      '',
      'Wat je ziet (invullen met de dataset):',
      '• Bron: {bron}, peildatum {peildatum}, periode {periode}; rendement {vóór/na kosten}, in {valuta}',
      '• Selectie: {welke ETF’s en waarom deze selectie}',
      '• Dit is een lijst van rendementen uit het verleden, geen aanbeveling of advies om iets te kopen of te verkopen.',
      '',
      PAST,
      'Dit is een overzicht van het verleden, geen garantie en geen advies.',
      RISK_WARNING_NL,
      '',
      `${CTA_TEXT}.`,
      '',
      hashtags.join(' '),
    ].join('\n'),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Een ranglijst van producten op historisch rendement gaat naar de compliance-reviewer vóór G3 (Redactiebeleid 7.3): risico op lezen als aanbeveling en op cherry-picking (periode, universum).',
      'Geen cijfers uit het geheugen of door een agent invullen; alleen een dataset die de eigenaar importeert (`npm run dataset -- import`, met flag subject: products).',
      'Zichtbaar op het scherm: bron, peildatum en periode; footer met de standaard disclaimer. Zonder die drie blijft het item REVISION_REQUIRED.',
      'Veiliger varianten om te overwegen: ranglijst van indices of regio’s (macro/index) in plaats van producten, of kosten (TER) uit officiële factsheets; ook dan bron en peildatum.',
    ],
    sourcesNeeded: ['Officiële factsheets of de uitgever van de ETF’s (of een door de eigenaar gekozen databron) met URL, peildatum en periode per rij.'],
    dataNeeded: {
      fromOwner: true,
      items: [
        'Bron per rij (naam + URL), bij voorkeur de officiële factsheet of uitgever',
        'Peildatum per rij (ISO-datum)',
        'Periode per rij (bijvoorbeeld 5 jaar) en dezelfde periode voor de hele lijst',
        'Rendementsdefinitie: totaalrendement of per jaar, vóór of na kosten, valuta, herbelegging van dividend',
        'Universum en selectiecriterium: welke ETF’s staan in de lijst en waarom (om cherry-picking uit te sluiten)',
      ],
      complianceEscalation: 'Product-ranglijst op historisch rendement: escaleren naar de compliance-reviewer vóór G3; zonder verdict geen G3. Bij twijfel of een juridisch oordeel nodig is beslist de eigenaar (Redactiebeleid sectie 6 en 7.3).',
      importCommand: 'npm run dataset -- import <bestand> (zie docs/EDITORIAL_POLICY.md 7.3)',
    },
    background: { clipId: 'amsterdam-drone-02', location: 'Amsterdam (drone)', reason: 'Dichtst bij de referentie van de eigenaar: een drone-beeld met witte labels erop.', inManifest: false },
    sustainability: { score: 3, rationale: 'Zeer herhaalbaar (periode, selectie, categorie), maar elke aflevering heeft een nieuwe dataset, eigenaarsinvoer en compliance-controle nodig.', variants: 'Periode (1/3/5/10 jaar) x selectie (wereld/regio/thema) = 12; plus variant "koersbewegingen/stijgers en dalers van de week" met eigen dataset', overlapWithExistingSeries: 'Geen; bestaande reeksen zijn alle berekend' },
  };
}

function idea15(): Idea {
  const drops = [0.1, 0.2, 0.3, 0.5, 0.7];
  const cols = [lab('label', 'Daling'), val('after', '€10.000 wordt', 'eur'), val('need', 'Herstel nodig', 'pct1')];
  const specs: RowSpec[] = drops.map((d) => ({
    label: `-${formatValue('pct0', d)}`,
    highlight: d === 0.5,
    vals: { after: calc('lumpSumFutureValue', { amount: 10000, years: 1, annualReturn: -d }, 'result'), need: calc('recoveryRequired', { drop: d }, 'result') },
  }));
  const rows = buildRows(cols, specs);
  const title = 'Na -50% heb je +100% nodig om terug te zijn';
  const subtitle = 'Rekenvoorbeeld met €10.000. Geen voorspelling van koersen.';
  const hashtags = ['#beurs', '#koersdaling', '#risico', '#financieleeducatie', '#beleggen'];
  return {
    id: 15, slug: 'daling-en-herstel', status: 'IDEA', category: 'Koerstijgers', format: 'A', dataOrigin: 'calculated', involvesReturns: false,
    hooks: hooks('Hoeveel moet een koers stijgen na een daling van 50%?', 'Een daling van 50% vraagt een stijging van 100% om terug te zijn.', '-10% en -50% lijken ver uit elkaar, het herstel nog meer.'),
    title,
    onScreen: { title, subtitle, footer: FOOT_PLAIN, cta: CTA_TEXT, progressBar: false },
    storyboard: storyboard({ format: 'A', title, subtitle, footer: FOOT_PLAIN, rowLabels: specs.map((x) => x.label), stats: ['€10.000 daalt 50%: nog €5.000', 'Terug naar €10.000 vraagt +100%', 'Hoe dieper de daling, hoe groter het herstel'], lesson: 'Rekenen met dalingen: een daling en een stijging van hetzelfde percentage heffen elkaar niet op.' }),
    inputs: { bedrag: '€10.000', dalingen: '10%, 20%, 30%, 50% en 70%' },
    assumptions: [
      'Zuivere rekenkunde: nodig herstel = 1 / (1 - daling) - 1. Er is geen rendement, kosten of belasting aangenomen.',
      'Het voorbeeld zegt niets over de kans of grootte van koersdalingen of herstel.',
      'Een daling betreft de waarde van één belegging of portefeuille; dividenden en nieuwe inleg zijn buiten beschouwing gelaten.',
      'Geen historische dalingen of herstelperioden genoemd; die zouden een bron en peildatum nodig hebben.',
    ],
    table: { columns: cols, rows },
    claims: claimsFromTable(cols, rows),
    caption: caption({
      title, returns: false, hashtags,
      bullets: [
        'Rekenregel: nodig herstel = 1 / (1 - daling) - 1',
        'Startbedrag €10.000; dalingen van 10% tot 70%',
        `Voorbeeld: na een daling van 50% heb je nog ${eur(specs[3]!.vals.after!.value)}; om terug te zijn op €10.000 is een stijging van ${formatValue('pct0', specs[3]!.vals.need!.value)} nodig`,
      ],
      extra: ['Dit is rekenkunde, geen voorspelling. Hoe vaak, hoe diep en hoe lang koersen dalen kun je niet uit dit voorbeeld afleiden.'],
    }),
    hashtags, cta: CTA_TEXT,
    compliance: [
      'Geen koersdalingen uit het verleden noemen zonder bron en peildatum. Geen angst of urgentie ("crash komt eraan").',
      'Geen advies om te verkopen of te blijven zitten; alleen rekenkunde.',
      'Kan later worden gekoppeld aan een marktdata-aflevering (dalingen per index) via de eigenaarsdataset en compliance-controle.',
    ],
    sourcesNeeded: ['Geen externe bron voor de cijfers (eigen berekening).'],
    dataNeeded: null,
    background: { clipId: 'marken-01', location: 'Marken', reason: 'Vlak water en dijk; rustig beeld bij een nuchtere uitleg over dalingen.', inManifest: false },
    sustainability: { score: 3, rationale: 'De rekensom is één keer uit te leggen; varianten zijn beperkt (andere percentages, andere bedragen) en kunnen snel op elkaar lijken.', variants: 'Dalingensets (10-20-30 / 40-50-60 / 70-80-90%) x bedrag = 6; koppelbaar aan marktdata-aflevering', overlapWithExistingSeries: 'Geen' },
  };
}

export function buildIdeasDocument(): IdeasDocument {
  const ideas = [idea01(), idea02(), idea03(), idea04(), idea05(), idea06(), idea07(), idea08(), idea09(), idea10(), idea11(), idea12(), idea13(), idea14(), idea15()];
  return {
    schemaVersion: 1,
    date: IDEAS_DATE,
    language: 'nl',
    owner: 'Rendementjager (@rendementjager)',
    note: 'Vijftien uitgewerkte Reel-ideeën met verschillende rekenvoorbeelden. Ideeën zijn niet gerenderd en niet in de pipeline geregistreerd; de eigenaar beoordeelt ze eerst. Alle bedragen komen uit @rj/finance-engine (zie calculationRef per cel).',
    categoryInspirationAssumption: 'AANNAME (inspiratiebronnen, geen labels: deze namen zijn accounts van anderen, staan alleen in dit interne document en nooit op beeld, in captions of hashtags; op beeld gebruikt Rendementjager eigen labels: Beleggen, Persoonlijke financiën, Markt): de categorieën Koerstijgers (markt en koersbewegingen), Finance op orde (persoonlijke financiën) en Beurswijzer (beleggen, ETF-lijsten, tabellen) zijn gebaseerd op het soort Nederlandse finance-accounts dat de eigenaar volgt. Instagram is vanuit deze omgeving niet bereikbaar: die accounts zijn niet bekeken. De enige referentie is het screenshot van de eigenaar van een Beurswijzer-Reel (ranglijst van 20 ETF’s met 5-jaarsrendement, drone-achtergrond, witte labels).',
    globalAssumptions: [
      'Alle rendementen en rentes zijn hypothetisch (aannames), geen verwachting of garantie.',
      'Standaard: effectief rendement per jaar, per maand verrekend, inleg aan het eind van de maand, nominaal (zonder inflatie), vóór kosten en belasting. Afwijkingen staan per idee.',
      'Geen Nederlandse belastingcijfers: wordt box 3 of een andere regel genoemd, dan met "verifieer actuele regels, jaar X".',
      'Onderwijs, geen advies; geen productnamen, geen aanbevelingen.',
      'Achtergrondclips komen uit het plan assets/footage/plans/nl-scenic.json; het manifest bevat nog geen clips (bestanden nog niet binnen), dus geen enkele clip is al beschikbaar.',
    ],
    ideas,
  };
}
