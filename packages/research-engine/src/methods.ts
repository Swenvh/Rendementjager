import { createHash } from 'node:crypto';
import type { ResearchBrief, Source } from '@rj/shared';
import type { BriefSourceInput, ResearchBriefInput } from './briefs.js';

/**
 * Method briefs: one ResearchBrief per series kind (compounding, cost, inflation) that documents the
 * formula, conventions, finance-engine functions, test evidence, limitations and authoritative sources
 * behind every pure-calculation item of that kind. A method brief carries NO statistics: all parameters
 * are hypothetical and labelled as such.
 *
 * G1 for series items may be recorded by the OWNER only, pointing at (brief id, brief hash); see
 * WorkflowService.approveMethodBriefForSeries in @rj/content-engine. Nothing here approves anything.
 */
export const METHOD_KINDS = ['compounding', 'cost', 'inflation'] as const;
export type MethodKind = (typeof METHOD_KINDS)[number];

export const METHOD_TOPIC_PREFIX = 'Methodebrief reeks: ';
export const UNVERIFIED_PREFIX = 'UNVERIFIED';

export function methodBriefTopic(kind: MethodKind): string {
  return `${METHOD_TOPIC_PREFIX}${kind}`;
}

/** Returns the series kind if the topic is a method-brief topic, else null. */
export function methodKindOfTopic(topic: string): MethodKind | null {
  if (!topic.startsWith(METHOD_TOPIC_PREFIX)) return null;
  const k = topic.slice(METHOD_TOPIC_PREFIX.length);
  return (METHOD_KINDS as readonly string[]).includes(k) ? (k as MethodKind) : null;
}

/** A source whose page could not be fetched is recorded with an excerpt starting with "UNVERIFIED". */
export function isUnverifiedSource(s: { excerpt: string | null | undefined }): boolean {
  return (s.excerpt ?? '').trimStart().startsWith(UNVERIFIED_PREFIX);
}

/**
 * Content hash of a brief: topic, kind, summary, keyFacts and the sources' url/title/publisher/dates/excerpt
 * (ids, timestamps of creation and status are excluded). Any edit to the brief or its sources changes it.
 */
export function methodBriefHash(
  brief: Pick<ResearchBrief, 'topic' | 'kind' | 'summary' | 'keyFacts'>,
  sources: readonly Pick<Source, 'url' | 'title' | 'publisher' | 'publishedAt' | 'accessedAt' | 'excerpt'>[],
): string {
  const canon = {
    topic: brief.topic,
    kind: brief.kind,
    summary: brief.summary,
    keyFacts: brief.keyFacts,
    sources: [...sources]
      .map((s) => [s.url, s.title, s.publisher, s.publishedAt ?? null, s.accessedAt, s.excerpt ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/** Date the source list was compiled from search-engine results (pages themselves were NOT fetched). */
const FOUND = '2026-10-30';
const NOT_FETCHED =
  'UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang.';

function src(url: string, title: string, note: string): BriefSourceInput {
  return { url, title, accessedAt: `${FOUND}T00:00:00.000Z`, excerpt: `${NOT_FETCHED} Waarvoor: ${note}` };
}

const FINANCE_FILES = 'packages/finance-engine/src/compound.ts (futureValueOfMonthlyContributions, periodGrowthFactor, annuityFutureValue) en series.ts';

const COMMON_LIMITS = [
  'Alle parameters (inleg, looptijd, rendement, kosten, inflatie) zijn HYPOTHETISCH en gelden als rekenvoorbeeld; het zijn geen verwachtingen of voorspellingen.',
  'Geen belasting (bijv. box 3) in het model; geen valutarisico, geen schommelingen: een vast gemiddeld rendement per jaar, terwijl echte rendementen per jaar sterk wisselen en verlies mogelijk is.',
  'Dit is geen advies en geen productaanbeveling. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.',
  'De bronnen hieronder leggen de begrippen uit; er staat GEEN cijfer uit een bron in de reeks-items. Elk getal komt uit @rj/finance-engine.',
];

export interface MethodBriefDefinition {
  kind: MethodKind;
  /** Short Dutch title. */
  title: string;
  input: ResearchBriefInput;
}

function def(kind: MethodKind, title: string, summary: string, keyFacts: string[], sources: BriefSourceInput[]): MethodBriefDefinition {
  return { kind, title, input: { topic: methodBriefTopic(kind), kind: 'evergreen', summary, keyFacts, sources, contentId: null } };
}

export const METHOD_BRIEFS: Readonly<Record<MethodKind, MethodBriefDefinition>> = {
  compounding: def(
    'compounding',
    'Rente op rente (maandelijks inleggen)',
    [
      'Methode voor reeks "Geld in cijfers: rente op rente" (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetisch 4/6/7/8% effectief per jaar).',
      '',
      'Formule: maandelijks groeifactor g = (1 + r)^(1/12) (effectieve conventie, geen r/12); eindwaarde = M x (g^n - 1) / (g - 1) met n = 12 x jaren en M de maandinleg. Inleg aan het EINDE van elke maand (gewone annuïteit, timing "end"); de eerste inleg groeit dus 12 x jaren - 1 maanden.',
      'Functie: futureValueOfMonthlyContributions({monthlyContribution, years, annualReturn, compounding:"monthly", timing:"end", rateConvention:"effective", annualCostRate:0}) in ' + FINANCE_FILES + '. Uitkomsten zijn ongeronde floats; weergave via formatEur (nl-NL).',
      'Testbewijs (packages/finance-engine/src/finance.test.ts): gesloten formule == brute-force maand-voor-maand simulatie voor effectief en nominaal, begin/eind van de maand, jaarlijkse samenstelling; 0% rendement = som van inleg; 0 jaar = 0; ongeldige invoer gooit RangeError. Series-engine herberekent elk getal in zijn tests uit de calculationRef.',
      '',
      'Beperkingen:',
      ...COMMON_LIMITS.map((l) => `- ${l}`),
      '- Effectief 7% per jaar is geen nominaal 7% (maandelijks samengesteld r/12 geeft ~7,23% effectief); de video noemt "effectief per jaar".',
    ].join('\n'),
    [
      'Rente-op-rente: over eerder behaalde rente ontvang/behaal je zelf ook weer rente; bij een langere looptijd groeit het bedrag daardoor steeds sneller (concept; bron UNVERIFIED).',
      'Formule: eindwaarde = M x (g^n - 1) / (g - 1), g = (1 + r)^(1/12), inleg aan het einde van de maand (futureValueOfMonthlyContributions, getest tegen brute force).',
      'Het rendement in alle items is een HYPOTHETISCH gemiddelde (4/6/7/8% effectief per jaar), geen verwachting of historisch cijfer.',
      'Niet claimen: dat dit rendement gehaald wordt, dat een product of fonds dit oplevert, of dat belasting/kosten/schommelingen ontbreken in de praktijk.',
    ],
    [
      src(
        'https://www.wijzeringeldzaken.nl/Sparen/verschillende-spaardoelen-en-vormen/',
        'Verschillende spaardoelen en -vormen (Wijzer in geldzaken)',
        'uitleg van het rente-op-rente-effect en het effect van een klein renteverschil op lange termijn (zoekresultaat).',
      ),
      src('https://www.dnb.nl/actuele-economische-vraagstukken/rente/', 'Rente (De Nederlandsche Bank)', 'definitie van rente als vergoeding voor lenen/uitlenen en van spaarrente (zoekresultaat).'),
    ],
  ),
  cost: def(
    'cost',
    'Kosten van beleggen (kostenvergelijking)',
    [
      'Methode voor de kostenreeks (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetisch 7% effectief per jaar vóór kosten, jaarlijkse kosten 0,2% tegenover 1,5% / 1,0% / 0,8%).',
      '',
      'Kostenbehandeling: de jaarlijkse kostenvoet c wordt ingehouden op het belegde vermogen. Netto groeifactor per jaar = (1 + r) x (1 - c); maandelijks g = ((1 + r)(1 - c))^(1/12). Dit is NIET r - c: bij r = 7% en c = 1,5% is de netto groei 5,395% per jaar, niet 5,5%. Kosten worden elke maand pro rata ingehouden; in- en uitstapkosten, transactiekosten en spreads zitten niet in het model.',
      'Functies: compareAnnualCosts(base, lowCostRate, highCostRate) in packages/finance-engine/src/series.ts (twee runs van futureValueOfMonthlyContributions met alleen annualCostRate verschillend; verschil = eindwaarde laag minus hoog; inleg is gelijk). Inleg aan het einde van de maand, effectieve conventie.',
      'Testbewijs (finance.test.ts, "series helpers"): compareAnnualCosts == twee directe engine-runs; gelijke kosten geven verschil 0; omgekeerde kosten (laag > hoog) gooit RangeError; kosten verlagen het resultaat en matchen brute force (maandelijkse kostenfactor).',
      '',
      'Beperkingen:',
      ...COMMON_LIMITS.map((l) => `- ${l}`),
      '- 0,2% en 1,5% zijn hypothetische kostenpercentages om het effect van het kostenverschil te laten zien; ze zeggen niets over wat een bepaald product of een bepaalde aanbieder rekent. Geen productnamen, geen aanbeveling.',
    ].join('\n'),
    [
      'Beleggingsproducten hebben doorlopende kosten (bijv. beheer- en servicekosten) die het rendement verlagen; het verschil telt op over de jaren (concept; bronnen UNVERIFIED).',
      'Kostenbehandeling in het model: netto groeifactor per jaar = (1 + r)(1 - c), ingehouden op het vermogen; niet r - c (compareAnnualCosts, getest).',
      'Kostenpercentages (0,2% / 0,8% / 1,0% / 1,5%) en het rendement (7%) zijn HYPOTHETISCH; geen productkosten van een bestaande aanbieder.',
      'Niet claimen: dat een bepaald product/aanbieder deze kosten heeft, dat lage kosten hoger rendement garanderen, of een keuze tussen producten.',
    ],
    [
      src('https://www.afm.nl/nl-nl/consumenten/themas/zelf-beleggen/wat-kost-beleggen', 'Wat kost beleggen? (Autoriteit Financiële Markten)', 'soorten kosten van beleggen, o.a. doorlopende productkosten (zoekresultaat).'),
      src(
        'https://www.afm.nl/en/sector/themas/belangrijke-europese-wet--en-regelgeving/mifid-ii/bescherming-beleggers/kostentransparantie',
        'Transparency of costs (AFM)',
        'MiFID II-kostentransparantie: overzicht van verwachte kosten vooraf (zoekresultaat).',
      ),
    ],
  ),
  inflation: def(
    'inflation',
    'Inflatie: nominaal tegenover reëel',
    [
      'Methode voor de inflatiereeks (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetische inflatie 2% of 3% per jaar; sparen zonder rendement, 0%; plus een vast voorbeeldbedrag van 1.000 euro).',
      '',
      'Reëel tegenover nominaal: reële waarde (in euro\'s van vandaag) = nominale waarde / (1 + p)^jaren, met p de hypothetische jaarlijkse inflatie. Dit is de Fisher-relatie in de vorm van deflateren: (1 + reëel rendement) = (1 + nominaal)/(1 + p); bij 0% nominaal rendement daalt de koopkracht met factor 1/(1 + p) per jaar. De eindwaarde wordt in zijn geheel met (1 + p)^jaren gedeflateerd (inleg van latere jaren wordt dus iets te sterk gedeflateerd: een conservatieve vereenvoudiging, zichtbaar als aanname).',
      'Functies: futureValueOfMonthlyContributions({..., annualReturn:0, inflationRate:p}).totals.endValueReal en realValueOfAmount(amount, years, inflationRate) / purchasingPowerLoss in ' + FINANCE_FILES + '. Inleg aan het einde van de maand.',
      'Testbewijs (finance.test.ts): "real value deflates by (1+p)^years; null when no inflation given"; realValueOfAmount(1000, 10, 0.02) ~ 820,35 en purchasingPowerLoss ~ 179,65; validatie van invoer (RangeError); 0% rendement: nominaal == som van inleg en reëel kleiner.',
      '',
      'Beperkingen:',
      ...COMMON_LIMITS.map((l) => `- ${l}`),
      '- 2% en 3% inflatie zijn hypothetisch en geen prognose; de feitelijke inflatie (CPI/HICP) verschilt per jaar en per huishouden (eigen bestedingspatroon). De ECB streeft op middellange termijn naar 2% (HICP); dat is een doelstelling, geen voorspelling.',
    ].join('\n'),
    [
      'Inflatie is de gemiddelde prijsstijging van wat consumenten kopen, gemeten als de jaarlijkse verandering van de consumentenprijsindex (CPI); voor hetzelfde bedrag kun je minder kopen (definitie; bronnen UNVERIFIED).',
      'Reële waarde = nominale waarde / (1 + p)^jaren (Fisher-vorm; realValueOfAmount, getest: 1.000 euro na 10 jaar bij 2% ~ 820,35 euro in euro\'s van vandaag).',
      'Inflatiepercentages (2% en 3%) zijn HYPOTHETISCH rekenvoorbeelden; geen CPI-cijfer en geen prognose. Geen actuele CPI-cijfers gebruiken zonder aparte, gedateerde bron.',
      'Niet claimen: dat inflatie in de toekomst deze waarde heeft, of dat sparen/beleggen deze koopkracht beschermt.',
    ],
    [
      src('https://www.cbs.nl/nl-nl/onze-diensten/methoden/begrippen/inflatie', 'Inflatie (CBS, begrippen)', 'definitie van inflatie en berekening uit de CPI (zoekresultaat).'),
      src('https://www.cbs.nl/nl-nl/longread/diversen/2026/cpi-lange-onderzoeksbeschrijving/1-wat-meet-de-cpi-', 'Wat meet de CPI? (CBS)', 'wat de consumentenprijsindex meet (zoekresultaat).'),
      src('https://www.ecb.europa.eu/mopo/strategy/pricestab/html/index.en.html', 'Two per cent inflation target (ECB)', 'prijsstabiliteit, 2%-doelstelling op middellange termijn, HICP (zoekresultaat).'),
      src('https://www.rijksoverheid.nl/onderwerpen/koopkracht/vraag-en-antwoord/hoe-wordt-koopkracht-berekend', 'Hoe wordt koopkracht berekend? (Rijksoverheid)', 'koopkracht en inflatie (zoekresultaat).'),
      src('https://www.dnb.nl/algemeen-nieuws/achtergrond-2025/wat-is-de-impact-van-inflatie-op-loon-vermogen-en-schuld/', 'Wat is de impact van inflatie op loon, vermogen en schuld? (DNB)', 'effect van inflatie op vermogen (zoekresultaat).'),
    ],
  ),
};

/** Markdown export of a stored method brief (content/research/methods/<kind>.md). */
export function renderMethodBriefMarkdown(kind: MethodKind, brief: ResearchBrief, sources: readonly Source[]): string {
  const hash = methodBriefHash(brief, sources);
  const unverified = sources.filter(isUnverifiedSource).length;
  return [
    '---',
    `topic: "${brief.topic}"`,
    `series_kind: ${kind}`,
    `kind: ${brief.kind}`,
    `status: ${brief.status}`,
    `brief_hash: ${hash}`,
    `created_by: ${brief.createdBy}`,
    `sources: ${sources.length}`,
    `unverified_sources: ${unverified}`,
    '---',
    '',
    `# ${METHOD_BRIEFS[kind].title} (methodebrief)`,
    '',
    brief.summary,
    '',
    '## Kernfeiten en wat niet te claimen',
    ...brief.keyFacts.map((f) => `- ${f}`),
    '',
    '## Bronnen',
    ...sources.map((s) => `- [${s.title}](${s.url}) | ${s.publisher} (tier ${s.trustTier}) | opgehaald/gevonden: ${s.accessedAt.slice(0, 10)} | ${isUnverifiedSource(s) ? 'UNVERIFIED' : 'geverifieerd'}\n  ${s.excerpt ?? ''}`),
    '',
    '## Goedkeuring',
    'G1 voor reeks-items wordt uitsluitend door de eigenaar vastgelegd (Mission Control, Methodebrieven), gebonden aan de brief-hash hierboven. Elke wijziging van deze brief maakt die goedkeuring ongeldig.',
    '',
  ].join('\n');
}
