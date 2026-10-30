import { z } from 'zod';

/**
 * Schema of content/ideas/<date>-15-ideeen.json. Importable by series-engine later (see docs/SERIES.md).
 * Mirrors the Template D table shape of @rj/video-engine (2-4 columns, 3-20 rows) so a table idea maps 1:1.
 */

export const CATEGORIES = ['Koerstijgers', 'Finance op orde', 'Beurswijzer'] as const;
/**
 * The three category names above are INSPIRATION sources (names of other accounts), used only inside the internal
 * ideas document. They must never appear on screen, in captions, hooks or hashtags. On screen the brand uses its own
 * neutral labels (see ON_SCREEN_LABEL).
 */
export const FORBIDDEN_BRAND_NAMES = /beurswijzer|koerstijgers|finance\s+op\s+orde/i;
export const ON_SCREEN_LABEL: Record<(typeof CATEGORIES)[number], string> = { Beurswijzer: 'Beleggen', 'Finance op orde': 'Persoonlijke financiën', Koerstijgers: 'Markt' };

export const FORMATS = ['D', 'C', 'A'] as const;
export const UNITS = ['text', 'eur', 'eur2', 'pct0', 'pct1', 'pct2', 'duration'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date (YYYY-MM-DD) required');

/** The one CTA style of the brand. */
export const CTA_TEXT = 'Meer tips? Volg @rendementjager';

/** Phrases that are automatic compliance failures in on-screen text, hooks and captions (EDITORIAL_POLICY section 2). */
export const FORBIDDEN_PHRASES: readonly RegExp[] = [
  /\bkoop\b/i,
  /\bverkoop\b/i,
  /\bstap nu in\b/i,
  /\bgegarandeerd/i,
  /\bzeker rendement/i,
  /\bmis het niet\b/i,
  /\bbinnen no-time\b/i,
  /\bsnel rijk\b/i,
];

const columnSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  label: z.string().min(1).max(40),
  kind: z.enum(['label', 'value']),
  unit: z.enum(UNITS),
});

const rowSchema = z.object({
  cells: z.record(z.string(), z.string().min(1)),
  /** Raw numeric values per value column (unit-dependent: euros, fraction for pct, months for duration). */
  values: z.record(z.string(), z.number().finite()),
  /** `@rj/finance-engine:<fn>(<json input>)#<path>` per value cell; re-evaluated by the tests. */
  refs: z.record(z.string(), z.string()),
  highlight: z.boolean().default(false),
  placeholder: z.boolean().default(false),
});

const tableSchema = z.object({
  columns: z.array(columnSchema).min(2).max(4),
  rows: z.array(rowSchema).min(3).max(20),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

const chartSchema = z.object({
  title: z.string().min(1),
  unit: z.literal('eur'),
  xLabel: z.string(),
  series: z
    .array(z.object({ label: z.string().min(1), points: z.array(z.object({ x: z.number(), y: z.number().finite() })).min(2) }))
    .min(1)
    .max(3),
  calculation: z.string().min(1),
});

const claimSchema = z.object({
  key: z.string().min(1),
  text: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(UNITS),
  calculationRef: z.string().min(1),
  role: z.enum(['result', 'assumption']),
});

const hookSchema = z.object({
  pattern: z.enum(['vraag', 'stelling', 'contrast']),
  text: z.string().min(8).max(90),
});

const storyboardSchema = z.object({
  second: z.number().int().min(1).max(10),
  visual: z.string().min(5),
  onScreen: z.string(),
});

const dataNeededSchema = z.object({
  /** Always true for template ideas: the owner must supply a dataset before anything is built. */
  fromOwner: z.literal(true),
  items: z.array(z.string().min(3)).min(3),
  complianceEscalation: z.string().min(20),
  importCommand: z.string().min(5),
});

export const ideaSchema = z
  .object({
    id: z.number().int().min(1).max(99),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    status: z.literal('IDEA'),
    category: z.enum(CATEGORIES),
    format: z.enum(FORMATS),
    /** 'calculated': every number from @rj/finance-engine. 'template-awaiting-data': no numbers at all. */
    dataOrigin: z.enum(['calculated', 'template-awaiting-data']),
    involvesReturns: z.boolean(),
    hooks: z.array(hookSchema).length(3),
    title: z.string().min(5).max(72),
    onScreen: z.object({
      title: z.string().min(5).max(72),
      subtitle: z.string().max(140),
      footer: z.string().max(60),
      cta: z.literal(CTA_TEXT),
      progressBar: z.literal(false),
    }),
    storyboard: z.array(storyboardSchema).length(10),
    inputs: z.record(z.string(), z.union([z.string(), z.number()])),
    assumptions: z.array(z.string().min(5)).min(2),
    table: tableSchema,
    chart: chartSchema.optional(),
    claims: z.array(claimSchema),
    caption: z.string().min(200),
    hashtags: z.array(z.string().regex(/^#[a-z0-9]+$/)).min(5).max(8),
    cta: z.literal(CTA_TEXT),
    compliance: z.array(z.string().min(5)).min(2),
    sourcesNeeded: z.array(z.string().min(5)).min(1),
    dataNeeded: dataNeededSchema.nullable(),
    background: z.object({
      clipId: z.string().min(3),
      location: z.string().min(3),
      reason: z.string().min(5),
      inManifest: z.literal(false),
    }),
    sustainability: z.object({
      score: z.number().int().min(1).max(5),
      rationale: z.string().min(10),
      variants: z.string().min(5),
      overlapWithExistingSeries: z.string().min(3),
    }),
  })
  .superRefine((idea, ctx) => {
    const add = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
    const seconds = idea.storyboard.map((s) => s.second);
    if (seconds.some((s, i) => s !== i + 1)) add('storyboard must cover seconds 1..10 in order', ['storyboard']);
    const keys = idea.table.columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length) add('duplicate column keys', ['table', 'columns']);
    if (idea.table.columns[0]?.kind !== 'label') add('first column must be a label column', ['table', 'columns', 0]);
    if (!idea.table.columns.some((c) => c.kind === 'value')) add('at least one value column', ['table', 'columns']);

    const everyText = [idea.title, idea.onScreen.title, idea.onScreen.subtitle, idea.onScreen.footer, idea.caption, ...idea.hooks.map((h) => h.text), ...idea.storyboard.map((s) => s.onScreen)];
    for (const t of everyText) for (const re of FORBIDDEN_PHRASES) if (re.test(t)) add(`forbidden phrase ${re} in: ${t.slice(0, 60)}`);
    for (const t of [...everyText, ...idea.hashtags, ...idea.hooks.map((h) => h.text)]) if (FORBIDDEN_BRAND_NAMES.test(t)) add(`other accounts' names may not appear on screen, in hooks, captions or hashtags: ${t.slice(0, 60)}`);

    if (!/geen (beleggings|persoonlijk )?advies|geen advies/i.test(idea.caption)) add('caption needs the "geen advies" disclaimer', ['caption']);
    if (idea.involvesReturns) {
      if (!/geen garantie voor de toekomst/i.test(idea.caption)) add('caption needs the past-results disclaimer', ['caption']);
      if (!/Beleggen brengt risico/i.test(idea.caption)) add('caption needs the risk warning', ['caption']);
      if (idea.dataOrigin === 'calculated' && !/hypothetisch/i.test(idea.caption)) add('caption must label returns as hypothetisch', ['caption']);
    }
    if (!idea.caption.includes(CTA_TEXT)) add('caption must contain the CTA', ['caption']);

    const rowKeys = (r: z.infer<typeof rowSchema>) => Object.keys(r.cells);
    idea.table.rows.forEach((r, i) => {
      for (const k of keys) if (!r.cells[k]) add(`row ${i + 1} has no cell for column "${k}"`, ['table', 'rows', i, 'cells', k]);
      if (rowKeys(r).some((k) => !keys.includes(k))) add(`row ${i + 1} has a cell for an unknown column`, ['table', 'rows', i]);
    });

    if (idea.dataOrigin === 'calculated') {
      if (idea.dataNeeded !== null) add('calculated ideas carry no dataNeeded', ['dataNeeded']);
      if (idea.claims.length === 0) add('calculated ideas need claims', ['claims']);
      idea.table.rows.forEach((r, i) => {
        for (const c of idea.table.columns) {
          if (c.kind !== 'value' || c.unit === 'text') continue;
          if (r.values[c.key] === undefined || !r.refs[c.key]) add(`row ${i + 1} column "${c.key}": value and calculation ref required`, ['table', 'rows', i]);
        }
        if (r.placeholder) add('calculated ideas have no placeholder rows', ['table', 'rows', i]);
      });
    } else {
      if (idea.dataNeeded === null) add('template ideas need dataNeeded', ['dataNeeded']);
      if (idea.claims.length > 0) add('template ideas must not carry claims (no numbers without owner data)', ['claims']);
      if (idea.chart) add('template ideas must not carry chart data', ['chart']);
      if (idea.dataNeeded && !/compliance-reviewer/.test(idea.dataNeeded.complianceEscalation)) add('escalation must name the compliance-reviewer', ['dataNeeded']);
      const items = (idea.dataNeeded?.items ?? []).join(' ').toLowerCase();
      for (const must of ['bron', 'peildatum', 'periode']) if (!items.includes(must)) add(`dataNeeded must ask for "${must}"`, ['dataNeeded', 'items']);
      idea.table.rows.forEach((r, i) => {
        if (!r.placeholder) add('template tables must be all placeholder rows', ['table', 'rows', i]);
        if (Object.keys(r.values).length > 0) add('placeholder rows carry no values', ['table', 'rows', i]);
        if (Object.values(r.cells).some((c) => /\d/.test(c))) add('placeholder cells must not contain digits', ['table', 'rows', i]);
      });
      if (/\d/.test(idea.onScreen.title.replace(/\{[^}]+\}/g, ''))) add('template titles carry no numbers (use {placeholders})', ['onScreen', 'title']);
    }
  });

export const ideasDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    date: isoDate,
    language: z.literal('nl'),
    owner: z.string(),
    note: z.string().min(20),
    categoryInspirationAssumption: z.string().min(20),
    globalAssumptions: z.array(z.string().min(5)).min(3),
    ideas: z.array(ideaSchema).length(15),
  })
  .superRefine((doc, ctx) => {
    const ids = doc.ideas.map((i) => i.id);
    const slugs = doc.ideas.map((i) => i.slug);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate idea ids', path: ['ideas'] });
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: 'custom', message: 'duplicate idea slugs', path: ['ideas'] });
    const clips = doc.ideas.map((i) => i.background.clipId);
    if (new Set(clips).size !== clips.length) ctx.addIssue({ code: 'custom', message: 'each idea gets its own background clip', path: ['ideas'] });
    const titles = doc.ideas.map((i) => i.title);
    if (new Set(titles).size !== titles.length) ctx.addIssue({ code: 'custom', message: 'duplicate titles', path: ['ideas'] });
  });

export type Idea = z.infer<typeof ideaSchema>;
export type IdeasDocument = z.infer<typeof ideasDocumentSchema>;
export type IdeaRow = z.infer<typeof rowSchema>;
export type IdeaColumn = z.infer<typeof columnSchema>;
