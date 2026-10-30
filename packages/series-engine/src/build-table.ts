import { RISK_WARNING_NL, futureValueOfMonthlyContributions, type MonthlyContributionInput } from '@rj/finance-engine';
import { topicKey } from './grids.js';
import { HOOK_PATTERN_NL, type Claim, type ExperimentTags, type HookPattern, type SeriesItem, type Storyboard, type TopicParams } from './types.js';
import { eur, hashOf, pct, pick } from './util.js';

/** Default Template D length in seconds (video-engine honours the same RJ_TABLE_DURATION_S). */
export const tableDurationS = (): number => {
  const env = Number(process.env.RJ_TABLE_DURATION_S);
  return Number.isFinite(env) && env > 0 ? Math.min(30, Math.max(6, env)) : 10;
};
export const TABLE_FOOTER = 'Rekenvoorbeeld, geen garantie of advies.';

/** Same disclaimer as the video footer (video-engine TABLE_DISCLAIMER_NL). */
export const TABLE_DISCLAIMER = 'Rendementen uit het verleden bieden geen garantie voor de toekomst. Geen beleggingsadvies.';
const SERIES = 'Tabel in cijfers';
const CTAS = ['Meer tips? Volg @rendementjager.', 'Meer handige tips? Volg @rendementjager.', 'Volg @rendementjager voor meer tips.'];
const HASHTAGS = ['#beleggen', '#renteoprente', '#financieleeducatie', '#vermogensopbouw', '#geldzaken'];

const range = (a: number[]) => `${eur(Math.min(...a))} tot ${eur(Math.max(...a))}`;
const years = (h: number[]) => (h.length > 1 ? `${h[0]} tot ${h[h.length - 1]} jaar` : `${h[0]} jaar`);

/** Table titles are shown in the light title label on screen: max 90 characters. */
function titleFor(p: TopicParams, pattern: HookPattern): string {
  const r = pct(p.annualReturn);
  const m = range(p.amounts!);
  const phrase = pick(`${topicKey(p)}|${pattern}`, 2);
  const t: Record<HookPattern, string[]> = {
    question: [`Wat wordt je inleg? ${m} per maand, bij ${r}`, `Hoeveel wordt ${m} per maand? Bij ${r}`],
    statement: [`Zoveel groeit je inleg: ${m} per maand, bij ${r}`, `Zo groeit ${m} per maand, bij ${r}`],
    contrast: [`Inleg vergeleken: ${m} per maand, bij ${r}`, `Inleg naast elkaar: ${m} per maand, bij ${r}`],
  };
  return t[pattern][phrase]!;
}

/**
 * "Tabel in cijfers": a matrix (monthly amount x years -> nominal end value). Every cell is one finance-engine call,
 * so the whole item is deterministic. Hook patterns vary only the title.
 */
export function buildTableItem(p: TopicParams, pattern: HookPattern, date: string): SeriesItem {
  const key = topicKey(p);
  const r = pct(p.annualReturn);
  const title = titleFor(p, pattern);
  const claims: Claim[] = [
    { key: 'return', claimText: `Hypothetisch rendement ${r} effectief per jaar (aanname)`, value: p.annualReturn * 100, unit: 'percent', role: 'assumption', calculationRef: `@rj/finance-engine:futureValueOfMonthlyContributions(annualReturn=${p.annualReturn})#input.annualReturn` },
  ];
  for (const amount of p.amounts!)
    for (const y of p.horizons!) {
      const input: MonthlyContributionInput = { monthlyContribution: amount, years: y, annualReturn: p.annualReturn, compounding: 'monthly', timing: 'end', rateConvention: 'effective', annualCostRate: 0 };
      const t = futureValueOfMonthlyContributions(input).totals;
      claims.push({
        key: `m${amount}y${y}`,
        claimText: `Bij ${eur(amount)} per maand is het eindbedrag na ${y} jaar ${eur(Math.round(t.endValueNominal))} (nominaal)`,
        value: Math.round(t.endValueNominal),
        unit: 'EUR',
        role: 'result',
        calculationRef: `@rj/finance-engine:futureValueOfMonthlyContributions(${JSON.stringify(input)})#totals.endValueNominal`,
      });
    }
  const cta = CTAS[pick(`${key}|${pattern}|cta`, CTAS.length)]!;
  const segs = [
    { id: 's01', text: `${title}. Bij ${r} per jaar, vóór kosten en belasting.`, pauseAfterMs: 450 },
    { id: 's02', text: 'Rekenvoorbeeld, geen garantie of advies.', pauseAfterMs: 450 },
  ];
  const subtitle = `Bij ${r} per jaar. Bedragen vóór kosten en belasting.`;
  const assumptions = `Rekenvoorbeeld: ${r} effectief per jaar (hypothetisch), inleg aan het eind van de maand, nominaal, zonder kosten, belasting en inflatie.`;
  const storyboard: Storyboard = {
    slug: '',
    title,
    template: 'TemplateD',
    series: SERIES,
    language: 'nl',
    table: { kind: 'matrix', annualReturn: p.annualReturn, amounts: p.amounts!, horizons: p.horizons!, title, subtitle, durationS: tableDurationS() },
    onScreen: {
      kicker: SERIES,
      hookLines: [title],
      hookHighlightLine: 0,
      assumptionsFootnote: subtitle,
      risks: { title: 'Let op', items: ['Hypothetisch voorbeeld, geen garantie', 'Nominaal: exclusief kosten, belasting en inflatie', TABLE_DISCLAIMER] },
      footnote: TABLE_FOOTER,
      cta: cta.replace(/\.$/, ''),
    },
    scenes: [
      { id: 'table', visual: 'Titelblok (licht label), een korte regel, kolomkop en rijen een voor een; een korte voetregel. Aannames en bron staan in caption en metadata.', segments: segs },
      { id: 'cta', visual: 'Branded outro met CTA.', segments: [{ id: 's03', text: cta }] },
    ],
  };
  const slug = `${date}-tabel-r${String(Math.round(p.annualReturn * 10_000) / 100).replace('.', 'k')}-m${Math.min(...p.amounts!)}-${Math.max(...p.amounts!)}-${HOOK_PATTERN_NL[pattern]}`;
  storyboard.slug = slug;
  const midRow = p.amounts![Math.floor(p.amounts!.length / 2)]!;
  const caption = [
    title,
    '',
    'Een rekenvoorbeeld:',
    `• Inleg per maand: ${range(p.amounts!)}, aan het eind van de maand`,
    `• Looptijden: ${years(p.horizons!)}`,
    `• Hypothetisch rendement: ${r} effectief per jaar, per maand verrekend; nominaal, zonder kosten, belasting en inflatie`,
    `• Bron: eigen rekenvoorbeeld met @rj/finance-engine, peildatum ${date}`,
    `• Voorbeeld: ${eur(midRow)} per maand wordt na ${p.horizons![p.horizons!.length - 1]} jaar ${eur(Math.round(claims.find((c) => c.key === `m${midRow}y${p.horizons![p.horizons!.length - 1]}`)!.value))} (nominaal, zonder kosten en belasting)`,
    '',
    TABLE_DISCLAIMER,
    'Dit is een hypothetisch rekenvoorbeeld, geen garantie en geen advies.',
    RISK_WARNING_NL,
    '',
    cta,
    '',
    HASHTAGS.join(' '),
  ].join('\n');
  const tags: ExperimentTags = {
    trial: true, kind: 'table', hookPattern: pattern, amount: Math.max(...p.amounts!), horizon: Math.max(...p.horizons!), template: 'D',
    durationS: tableDurationS(),
    variantGroup: key.replace(/[:]/g, '-'), variantIndex: (['question', 'statement', 'contrast'] as const).indexOf(pattern), ratePct: Math.round(p.annualReturn * 10_000) / 100,
  };
  const contentHash = hashOf({ v: 1, kind: 'table', topic: key, pattern, scenes: storyboard.scenes, onScreen: storyboard.onScreen, table: storyboard.table, caption, claims });
  const propsHash = hashOf({ template: storyboard.template, table: storyboard.table, onScreen: storyboard.onScreen, scenes: storyboard.scenes });
  const scriptMd = [
    `# ${title}`,
    '',
    `- Template: D "Tabel in cijfers" · 1080x1920 · 30 fps · ca. ${tags.durationS} s (schatting)`,
    `- Reeks: ${SERIES} · variantgroep ${tags.variantGroup} · hookpatroon: ${HOOK_PATTERN_NL[pattern]}`,
    '- Status: CONCEPT (nog geen G1/G2/G3/G4/G5). Elke cel is een aanroep van `@rj/finance-engine`; zie `series.json` (claims met calculationRef).',
    `- Op het scherm: regel "${subtitle}" en voetregel "${TABLE_FOOTER}"`,
    `- Aannames (niet op het scherm, wel in caption en metadata): ${assumptions}; bron: eigen rekenvoorbeeld met @rj/finance-engine, peildatum ${date}`,
    '',
    '## Gesproken tekst (per scène)',
    '| Scène | Voice-over |',
    '| --- | --- |',
    ...storyboard.scenes.map((s) => `| ${s.id} | ${s.segments.map((x) => x.text).join(' ')} |`),
    '',
  ].join('\n');
  return {
    kind: 'table', params: p, topicKey: key, hookPattern: pattern, title, hook: title, slug, pillar: 'vermogensopbouw', seriesName: SERIES, storyboard, scriptMd, caption,
    hashtags: HASHTAGS, claims, tags, contentHash, propsHash,
  };
}
