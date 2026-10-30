import { z } from 'zod';

export const wordSchema = z.object({ text: z.string(), startMs: z.number(), endMs: z.number() });

export const captionPageSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  segmentId: z.string(),
  words: z.array(wordSchema),
});

export const voiceSchema = z.object({
  /** Path relative to the Remotion public dir, or null for a silent preview. */
  src: z.string().nullable(),
  /** 'none' = voiceless Reel (captions only). There is no local/robotic voice. */
  provider: z.enum(['elevenlabs', 'none']),
  brandVoice: z.boolean(),
  durationMs: z.number(),
});

/**
 * Drone background: a chain of DIFFERENT licensed clips (never looped) cross-faded across the Reel.
 * `src` is relative to the Remotion public dir (copied from the footage library by the pipeline).
 */
export const backgroundClipSchema = z.object({
  clipId: z.string(),
  src: z.string(),
  durationS: z.number().positive(),
  /** Horizontal crop focus 0..100 for landscape sources. */
  focusX: z.number().min(0).max(100).optional(),
  /** Credit line recorded for the clip (required in the caption when the licence asks for it). */
  credit: z.string(),
  creditRequired: z.boolean(),
  licence: z.string(),
});
export const backgroundSchema = z.object({
  clips: z.array(backgroundClipSchema).min(1),
  /** Cross-fade between clips, ms. */
  fadeMs: z.number().int().min(200).max(3000).default(1000),
});
export type BackgroundProps = z.infer<typeof backgroundSchema>;

export const sceneTimingSchema = z.object({ id: z.string(), startMs: z.number(), endMs: z.number() });

export const timelineSchema = z.object({
  totalMs: z.number().positive(),
  scenes: z.array(sceneTimingSchema).min(1),
});

export const footnoteSchema = z.object({ text: z.string(), source: z.string().optional() });

const shellSchema = z.object({
  timeline: timelineSchema,
  voice: voiceSchema,
  captions: z.array(captionPageSchema),
  footnote: footnoteSchema,
  cta: z.object({ text: z.string(), tagline: z.string() }),
  /** null/absent = animated dark-green fallback background. */
  background: backgroundSchema.nullable().optional(),
  /** Segmented progress bar: off by default in every template. */
  showProgress: z.boolean().optional(),
  /** Show the dim "Illustratief" hint etc. Always on for illustrative visuals. */
});

/** Real calculation produced by @rj/finance-engine (or the temporary local module). */
export const reelCalculationSchema = z.object({
  engine: z.literal('@rj/finance-engine'),
  monthlyContributionCents: z.number().int().nonnegative(),
  years: z.number().int().positive(),
  annualReturnPct: z.number(),
  contributionTiming: z.enum(['start-of-month', 'end-of-month']),
  compounding: z.string(),
  series: z
    .array(z.object({ year: z.number().int().nonnegative(), contributedCents: z.number(), valueCents: z.number() }))
    .min(2),
  /** Month-by-month values (month 0..years*12) from the same engine formula; used for the growth scene. */
  monthly: z.array(z.object({ month: z.number().int().nonnegative(), contributedCents: z.number(), valueCents: z.number() })).min(2),
  totalContributedCents: z.number(),
  finalValueCents: z.number(),
  growthCents: z.number(),
  inflation: z.object({ annualRatePct: z.number(), realFinalValueCents: z.number() }).nullable(),
  assumptionsNote: z.string(),
});
export type ReelCalculation = z.infer<typeof reelCalculationSchema>;

// ---------- Template C: "Geld in cijfers" ----------
export const templateCSchema = shellSchema.extend({
  kicker: z.string(),
  hookLines: z.array(z.string()).min(1).max(4),
  hookHighlightLine: z.number().int().nonnegative(),
  calculation: reelCalculationSchema,
  assumptionsFootnote: z.string(),
  risks: z.object({ title: z.string(), items: z.array(z.string()).min(1).max(4) }),
});
export type TemplateCProps = z.infer<typeof templateCSchema>;

// ---------- Template A: "Rendement in 30 seconden" ----------
export const templateASchema = shellSchema.extend({
  kicker: z.string(),
  hookLines: z.array(z.string()).min(1).max(4),
  hookHighlightLine: z.number().int().nonnegative(),
  chart: z.object({
    title: z.string(),
    /** true → chart is labelled "Illustratief" on screen. Real data must carry a source in footnote. */
    illustrative: z.boolean(),
    unit: z.enum(['eur', 'pct', 'index']),
    points: z.array(z.object({ label: z.string(), value: z.number() })).min(2),
  }),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).min(1).max(3),
  takeaway: z.string(),
});
export type TemplateAProps = z.infer<typeof templateASchema>;

// ---------- Template B: "De markt uitgelegd" ----------
export const templateBSchema = shellSchema.extend({
  kicker: z.string(),
  headline: z.string(),
  /** Required: every market explainer cites its source and publication date. */
  source: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'ISO date required'),
  }),
  candles: z.object({
    title: z.string(),
    illustrative: z.boolean(),
    data: z.array(z.object({ label: z.string(), open: z.number(), high: z.number(), low: z.number(), close: z.number() })).min(3),
  }),
  points: z.array(z.string()).min(1).max(4),
});
export type TemplateBProps = z.infer<typeof templateBSchema>;

export const FPS = 30;
export const msToFrame = (ms: number, fps = FPS) => Math.round((ms / 1000) * fps);

// ---------- Template D: "Ranglijst" / "Tabel in cijfers" ----------
export const tableSourceSchema = z.object({ name: z.string().min(1), url: z.string().url() });

export const tableColumnSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  label: z.string().min(1),
  /** 'value' columns are right-aligned, tabular and clear of the right-hand IG icons. */
  kind: z.enum(['label', 'value']),
});

export const tableRowSchema = z.object({
  cells: z.record(z.string(), z.string().min(1)),
  highlight: z.boolean().optional(),
  /** Numeric sort key (percent points, euros...). When present on all rows the order is verified. */
  sortValue: z.number().finite().optional(),
  /** Required per row for provided (market) data. */
  source: tableSourceSchema.optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.string().min(1).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date (YYYY-MM-DD) required');

/**
 * Table / ranking Reel. Mandatory: title, columns, rows, source, asOfDate, dataOrigin, disclaimer.
 * 'provided' (market data) data is rejected unless EVERY row carries its own source, as-of date and period,
 * the global source has a URL, and the rows are in the stated order. Figures are never invented: calculated
 * tables come from @rj/finance-engine, provided tables from an owner dataset (npm run dataset).
 */
export const templateDSchema = shellSchema
  .extend({
    kicker: z.string(),
    title: z.string().min(1).max(72),
    subtitle: z.string().max(140).optional(),
    columns: z.array(tableColumnSchema).min(2).max(4),
    rows: z.array(tableRowSchema).min(3).max(20),
    source: z.object({ name: z.string().min(1), url: z.string().url().optional() }),
    asOfDate: isoDate,
    dataOrigin: z.enum(['calculated', 'provided']),
    disclaimer: z.string().min(20),
    /** Optional short footer shown on screen instead of disclaimer + source (the full texts stay in props/metadata/caption). */
    footerLine: z.string().max(60).optional(),
    /** Assumptions shown on screen for calculated tables (rate, timing, costs, tax). */
    assumptions: z.array(z.string().min(1)).max(4).default([]),
    sortDirection: z.enum(['asc', 'desc']).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.dataOrigin === 'calculated' && t.assumptions.length === 0) ctx.addIssue({ code: 'custom', message: 'calculated tables must state their assumptions (kept in props/metadata/caption)', path: ['assumptions'] });
    if (t.footerLine && t.dataOrigin !== 'calculated') ctx.addIssue({ code: 'custom', message: 'footerLine is only for calculated tables; provided data keeps the full disclaimer and source on screen', path: ['footerLine'] });
    if ([t.subtitle, ...(t.dataOrigin === 'provided' ? t.assumptions : [])].filter(Boolean).join(' · ').length > 150) ctx.addIssue({ code: 'custom', message: 'info line must fit two lines (150 characters)', path: ['subtitle'] });
    const keys = t.columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'duplicate column keys', path: ['columns'] });
    if (!t.columns.some((c) => c.kind === 'value')) ctx.addIssue({ code: 'custom', message: 'at least one value column', path: ['columns'] });
    t.rows.forEach((r, i) => {
      for (const k of keys) if (!r.cells[k]) ctx.addIssue({ code: 'custom', message: `row ${i + 1} has no value for column "${k}"`, path: ['rows', i, 'cells', k] });
    });
    if (t.dataOrigin === 'provided') {
      if (!t.source.url) ctx.addIssue({ code: 'custom', message: 'provided data needs source.url', path: ['source', 'url'] });
      t.rows.forEach((r, i) => {
        if (!r.source) ctx.addIssue({ code: 'custom', message: `row ${i + 1}: provided data needs a source per row`, path: ['rows', i, 'source'] });
        if (!r.asOfDate) ctx.addIssue({ code: 'custom', message: `row ${i + 1}: provided data needs asOfDate per row`, path: ['rows', i, 'asOfDate'] });
        if (!r.period) ctx.addIssue({ code: 'custom', message: `row ${i + 1}: provided data needs the period per row`, path: ['rows', i, 'period'] });
      });
    }
    if (t.sortDirection && t.rows.every((r) => r.sortValue !== undefined)) {
      for (let i = 1; i < t.rows.length; i++) {
        const a = t.rows[i - 1]!.sortValue!;
        const b = t.rows[i]!.sortValue!;
        if (t.sortDirection === 'desc' ? b > a : b < a) ctx.addIssue({ code: 'custom', message: `rows are not sorted ${t.sortDirection} at row ${i + 1}`, path: ['rows', i] });
      }
    }
  });
export type TemplateDProps = z.infer<typeof templateDSchema>;
