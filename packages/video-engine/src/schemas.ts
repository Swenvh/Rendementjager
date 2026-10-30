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
  provider: z.enum(['elevenlabs', 'local-fallback', 'none']),
  brandVoice: z.boolean(),
  durationMs: z.number(),
});

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
