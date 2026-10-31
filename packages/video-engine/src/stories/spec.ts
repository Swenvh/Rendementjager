// Pure (Node-safe) builder of the Instagram Story sets: no Remotion imports. Every number comes from the claims of the ideas sheet
// (content/ideas/<date>-15-ideeen.json: finance-engine values with calculationRef) and is formatted with the same formatter as the Reels.
import { FORBIDDEN_BRAND_NAMES, FORBIDDEN_PHRASES, ON_SCREEN_LABEL, formatValue, type Idea, type IdeasDocument, type Unit } from '@rj/content-ideas';
import { STORY_CTA, STORY_FOOTER, STORY_TEASER, type StoryKind } from './layout';
import { storyFrameSchema, type StoryFrameProps } from './schema';

type Claim = Idea['claims'][number];

interface StoryDef {
  /** Question for the "Vraag" frame (plain Dutch, answer withheld). */
  question: string;
  /** Claim shown as the answer; `{key}` in answerLine is replaced by the formatted claim. */
  answer: string;
  answerLine: string;
  /** Poll buckets: "Minder dan lo / Tussen lo en hi / Meer dan hi" in the unit of the answer claim (months for durations, fractions for %). */
  poll: [number, number];
  quick: { label: string; key: string; line: string };
}

/** Per idea id. Ideas without data (14: template awaiting the owner's dataset) have no entry and are skipped. */
export const STORY_DEFS: Record<number, StoryDef> = {
  1: {
    question: 'Je zet €10.000 weg tegen 6% rente per jaar. Wat is het na 30 jaar als de rente elke dag wordt bijgeschreven?',
    answer: 'r4-y30', answerLine: 'Bij bijschrijving per jaar: {r1-y30}', poll: [50000, 60000],
    quick: { label: '6% rente, elke dag bijgeschreven', key: 'r4-eff', line: 'Zo hoog is de rente effectief per jaar. Bijschrijven per jaar geeft {r1-eff}.' },
  },
  2: {
    question: 'Twee denkbeeldige beleggers leggen elk €200 per maand in. De ene begint 10 jaar later. Wat heeft die laatste na 40 jaar?',
    answer: 'r2-end', answerLine: 'De eerste, die 10 jaar eerder begon: {r1-end}', poll: [150000, 250000],
    quick: { label: 'Eerst 10 jaar inleggen, dan laten staan', key: 'r3-end', line: 'Inleg: {r3-contributed}. Daarna 30 jaar laten staan, zonder extra inleg.' },
  },
  3: {
    question: 'Je zet €10.000 weg tegen 6% per jaar vóór kosten. Wat blijft er na 30 jaar over bij 1,5% kosten per jaar?',
    answer: 'r3-y30', answerLine: 'Bij 0,2% kosten per jaar: {r2-y30}', poll: [30000, 45000],
    quick: { label: 'Wat 1,5% kosten per jaar schelen', key: 'r4-y30', line: 'Zo veel minder heb je na 30 jaar bij 1,5% dan bij 0,2% kosten per jaar.' },
  },
  4: {
    question: '€10.000 staat 20 jaar stil, zonder rente. De inflatie is 3% per jaar. Wat is het dan nog waard in euro\'s van nu?',
    answer: 'r2-y20', answerLine: 'Na 30 jaar nog: {r2-y30}', poll: [4000, 7000],
    quick: { label: '4% inflatie, 30 jaar lang', key: 'r3-y30', line: 'Zo veel is €10.000 dan nog waard in euro\'s van nu.' },
  },
  5: {
    question: 'Je legt 20 jaar lang €200 per maand in (totaal €48.000). Wat is het waard bij 4% rendement per jaar?',
    answer: 'r4-end', answerLine: 'Bij 0%: {r2-end}. Bij 6%: {r5-end}', poll: [55000, 70000],
    quick: { label: 'Rendement onder nul', key: 'r1-end', line: 'Bij -2% per jaar blijft er na 20 jaar minder over dan de inleg van €48.000.' },
  },
  6: {
    question: 'Je hebt €2.500 netto per maand. Hoeveel is 20% daarvan, voor sparen en aflossen?',
    answer: 'r3-amount', answerLine: '50% noodzaak: {r1-amount}. 30% wensen: {r2-amount}', poll: [300, 450],
    quick: { label: 'De 50/30/20-regel in euro\'s', key: 'r1-amount', line: 'per maand voor vaste lasten en noodzaak (50% van €2.500 netto).' },
  },
  7: {
    question: 'Je geeft €2.000 per maand uit. Hoeveel is een buffer van 6 maanden uitgaven?',
    answer: 'r4-target', answerLine: 'Opbouwen met €250 per maand duurt {r4-build}', poll: [8000, 10000],
    quick: { label: 'Een buffer van 3 maanden uitgaven', key: 'r1-build', line: 'Zo lang duurt het om {r1-target} apart te zetten met €250 per maand.' },
  },
  8: {
    question: 'Je leent €5.000 tegen 12% rente per jaar en betaalt het in 60 maanden terug. Hoeveel rente betaal je in totaal?',
    answer: 'r3-r12', answerLine: 'Bij 6% rente per jaar: {r3-r6}', poll: [1000, 1500],
    quick: { label: '€5.000 lenen, 36 maanden, 6% rente', key: 'pay6-36', line: 'per maand: aflossing en rente samen.' },
  },
  9: {
    question: '€4 per dag is €121,67 per maand. Wat is dat na 30 jaar waard bij 6% rendement per jaar?',
    answer: 'r3-end', answerLine: 'Daarvan is {r3-contributed} zelf ingelegd', poll: [60000, 100000],
    quick: { label: '€4 per dag, 20 jaar lang', key: 'r2-end', line: 'Daarvan is {r2-contributed} inleg. De rest is hypothetisch rendement.' },
  },
  10: {
    question: 'Je legt €100 per maand in in plaats van €10.000 in één keer. Wat is dat na 30 jaar waard bij 6% per jaar?',
    answer: 'r2-y30', answerLine: 'Totale inleg: {r3-y30}. In één keer: {r1-y30}', poll: [60000, 90000],
    quick: { label: '€10.000 in één keer', key: 'r1-y30', line: 'Zo veel is het na 30 jaar, zonder extra inleg.' },
  },
  11: {
    question: 'Je uitgaven zijn €30.000 per jaar. Welk vermogen hoort bij de 4%-regel (25 keer je jaaruitgaven)?',
    answer: 'r2-r4', answerLine: 'Bij 3% (±33 keer): {r2-r3}', poll: [500000, 700000],
    quick: { label: '25 keer je uitgaven', key: 'r1-r4', line: 'is het bedrag bij €24.000 uitgaven per jaar en de 4%-regel.' },
  },
  12: {
    question: 'Je legt €100 per maand in. Elk jaar krijg je €100 netto per maand erbij en zet de helft apart. Wat is het na 10 jaar bij 6%?',
    answer: 'r2-end', answerLine: 'Zonder verhoging apart te zetten: {r1-end}', poll: [25000, 40000],
    quick: { label: 'De helft van elke verhoging apart', key: 'final-monthly-50', line: 'per maand in jaar 10: €100 begin, elk jaar €50 extra.' },
  },
  13: {
    question: 'Je spaart €500 per maand voor €100.000. Hoe lang duurt het bij 4% rendement per jaar?',
    answer: 'r2-r4', answerLine: 'Zonder rendement: {r2-r0}', poll: [120, 180],
    quick: { label: '€1.000 per maand, 7% per jaar', key: 'r4-r7', line: 'Zo lang duurt het om €100.000 te bereiken.' },
  },
  15: {
    question: 'Je €10.000 daalt 50% in waarde. Hoeveel procent moet het daarna stijgen om weer op €10.000 te zijn?',
    answer: 'r4-need', answerLine: 'Na de daling is het nog {r4-after} waard', poll: [0.6, 0.9],
    quick: { label: 'Na een daling van 70%', key: 'r5-need', line: 'Zo veel procent moet het stijgen om weer op €10.000 te komen.' },
  },
};

export interface StoryFrame {
  /** File prefix: 01 vraag, 02 antwoord, 03 reel-teaser (one posting sequence), 04 quick-fact (stands alone). */
  order: number;
  kind: StoryKind;
  props: StoryFrameProps;
  /** Claims whose formatted value is on the frame (used by the tests to compare with the engine). */
  claimKeys: string[];
}

export interface StoryStickers {
  poll: { options: [string, string, string]; correct: 'A' | 'B' | 'C' };
  /** All suggested sticker and text lines, in posting order. */
  lines: string[];
}

export interface StorySet {
  ideaId: number;
  slug: string;
  title: string;
  frames: StoryFrame[];
  stickers: StoryStickers;
}

export const NUMBER_RE = /\d[\d.]*(?:,\d+)?/g;
/** "€10.000" -> "10000", "6,17%" -> "6,17": comparable number tokens of a text. */
export const numberTokens = (t: string): string[] => (t.match(NUMBER_RE) ?? []).map((n) => n.replace(/\./g, ''));

export const fmtClaim = (c: Claim): string => formatValue(c.unit as Unit, c.value);

function claimMap(idea: Idea): Map<string, Claim> {
  return new Map(idea.claims.map((c) => [c.key, c]));
}

function fill(template: string, claims: Map<string, Claim>, used: string[]): string {
  return template.replace(/\{([a-z0-9-]+)\}/gi, (_m, key: string) => {
    const c = claims.get(key);
    if (!c) throw new Error(`story text refers to unknown claim "${key}": ${template}`);
    used.push(key);
    return fmtClaim(c);
  });
}

const fmtThreshold = (unit: Unit, v: number): string => (unit === 'pct1' || unit === 'pct0' || unit === 'pct2' ? formatValue('pct0', v) : formatValue(unit, v));

/** Allowed number tokens for one idea: everything the idea sheet itself shows (title, subtitle, inputs, assumptions, claims). */
export function allowedNumbers(idea: Idea): Set<string> {
  const texts = [idea.title, idea.onScreen.title, idea.onScreen.subtitle, ...Object.values(idea.inputs ?? {}), ...idea.assumptions, ...idea.claims.map((c) => c.text), ...idea.claims.map(fmtClaim)];
  return new Set(texts.flatMap((t) => numberTokens(String(t))));
}

/** Text rules shared with the ideas schema: no other accounts' names, no forbidden phrases. Returns the problems found. */
export function textProblems(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    if (FORBIDDEN_BRAND_NAMES.test(t)) out.push(`other account's name in: ${t}`);
    for (const re of FORBIDDEN_PHRASES) if (re.test(t)) out.push(`forbidden phrase ${re} in: ${t}`);
  }
  return out;
}

export function buildStorySet(idea: Idea, background: StoryFrameProps['background'] = null): StorySet | null {
  const def = STORY_DEFS[idea.id];
  if (!def) return null;
  const claims = claimMap(idea);
  const kicker = ON_SCREEN_LABEL[idea.category];
  const hypo = idea.involvesReturns ? 'Hypothetisch' : 'Rekenvoorbeeld';
  const need = (k: string): Claim => {
    const c = claims.get(k);
    if (!c) throw new Error(`idea ${idea.id}: claim ${k} missing`);
    return c;
  };
  const common = { kicker, footer: STORY_FOOTER, background } as const;
  const assumptions = idea.onScreen.subtitle;
  const frame = (order: number, kind: StoryKind, props: Omit<StoryFrameProps, 'kind' | 'kicker' | 'footer' | 'background'>, claimKeys: string[]): StoryFrame => ({
    order, kind, claimKeys, props: storyFrameSchema.parse({ kind, ...common, ...props }),
  });

  const answer = need(def.answer);
  const usedAnswer: string[] = [def.answer];
  const answerLine = fill(def.answerLine, claims, usedAnswer);
  const usedQuick: string[] = [def.quick.key];
  const quickLine = fill(def.quick.line, claims, usedQuick);
  const quick = need(def.quick.key);

  const [lo, hi] = def.poll;
  const unit = answer.unit as Unit;
  const options: [string, string, string] = [`Minder dan ${fmtThreshold(unit, lo)}`, `Tussen ${fmtThreshold(unit, lo)} en ${fmtThreshold(unit, hi)}`, `Meer dan ${fmtThreshold(unit, hi)}`];
  const correct = answer.value < lo ? 'A' : answer.value <= hi ? 'B' : 'C';

  const frames: StoryFrame[] = [
    frame(1, 'vraag', { label: def.question, assumptions }, []),
    frame(2, 'antwoord', {
      label: idea.onScreen.title, eyebrow: `Antwoord (${hypo.toLowerCase()})`, big: [{ text: fmtClaim(answer), tone: 'lime' }], line: answerLine, assumptions,
    }, usedAnswer),
    frame(3, 'reel-teaser', {
      label: idea.onScreen.title, big: [{ text: 'Nieuw:', tone: 'surface' }, { text: STORY_TEASER.replace('Nieuw: ', ''), tone: 'lime' }], line: 'Kort uitgelegd, met alle aannames.', cta: STORY_CTA,
    }, []),
    frame(4, 'quick-fact', {
      label: def.quick.label, eyebrow: hypo, big: [{ text: fmtClaim(quick), tone: quick.value < 0 ? 'red' : 'lime' }], line: quickLine, assumptions,
    }, usedQuick),
  ];

  const lines = [
    `Story 1 (vraag): plaats in de lege band onderaan (ongeveer y 1290-1590) een van deze stickers.`,
    `  Poll: A) ${options[0]} / B) ${options[1]} / C) ${options[2]}`,
    `  Quiz (alternatief): dezelfde drie opties, juiste optie: ${correct} (kies die pas in de quiz-sticker, niet in de tekst)`,
    `  Slider (alternatief): vraag "Wat denk jij?", emoji naar keuze`,
    `  Vragen-sticker (alternatief): "Wat denk jij? Laat het weten."`,
    `Story 2 (antwoord): plaats een reactie-emoji-slider of een vragen-sticker ("Verrast? Stel je vraag.") in de lege band. Antwoord: ${correct}) ${options[correct === 'A' ? 0 : correct === 'B' ? 1 : 2]}.`,
    `Story 3 (reel-teaser): plaats pas ná publicatie van de Reel een link-sticker of de Reel-sticker in de lege band. Er staat bewust geen link op de afbeelding.`,
    `Story 4 (quick-fact, losse story): optioneel een emoji-slider ("Verrassend?") in de lege band.`,
    `Onderwijs, geen advies. Opties zijn gokjes om mee te raden, geen feiten of verwachtingen.`,
  ];
  return { ideaId: idea.id, slug: idea.slug, title: idea.title, frames, stickers: { poll: { options, correct }, lines } };
}

export function buildAllStorySets(doc: IdeasDocument, ids?: number[]): StorySet[] {
  const out: StorySet[] = [];
  for (const idea of doc.ideas) {
    if (ids && !ids.includes(idea.id)) continue;
    const set = buildStorySet(idea);
    if (set) out.push(set);
  }
  return out;
}

export const frameTexts = (p: StoryFrameProps): string[] => [p.kicker, p.label, p.eyebrow, ...(p.big ?? []).map((b) => b.text), p.line, p.assumptions, p.cta, p.footer].filter((t): t is string => !!t);

/** Build-time and test-time checks of one set: forbidden names/phrases, numbers equal the engine, only known numbers on screen. Returns the problems found. */
export function setProblems(idea: Idea, set: StorySet, evaluate: (ref: string) => number): string[] {
  const problems: string[] = [];
  const claims = claimMap(idea);
  const allowed = allowedNumbers(idea);
  for (const f of set.frames) {
    const texts = frameTexts(f.props);
    problems.push(...textProblems(texts));
    // Numbers equal the engine: every claim used on a frame re-evaluates to the stored value and its text is on the frame.
    for (const key of f.claimKeys) {
      const c = claims.get(key)!;
      const fresh = evaluate(c.calculationRef);
      if (Math.abs(fresh - c.value) > 1e-6 * Math.max(1, Math.abs(c.value))) problems.push(`claim ${key} no longer equals the engine (${fresh} vs ${c.value})`);
      const shown = formatValue(c.unit as Unit, fresh);
      if (!texts.some((t) => t.includes(shown))) problems.push(`frame ${f.kind}: "${shown}" (claim ${key}) is not on the frame`);
    }
    for (const t of texts) for (const n of numberTokens(t)) if (!allowed.has(n)) problems.push(`frame ${f.kind}: number ${n} in "${t}" is not in the idea sheet`);
    if (f.kind !== 'vraag' && f.claimKeys.length === 0 && f.kind !== 'reel-teaser') problems.push(`frame ${f.kind} shows no engine number`);
  }
  const vraag = set.frames.find((f) => f.kind === 'vraag')!;
  const answer = claims.get(STORY_DEFS[idea.id]!.answer)!;
  if (frameTexts(vraag.props).some((t) => t.includes(fmtClaim(answer)))) problems.push('the Vraag frame reveals the answer');
  problems.push(...textProblems(set.stickers.lines));
  return problems;
}
