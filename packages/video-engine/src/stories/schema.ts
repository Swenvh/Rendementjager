import { z } from 'zod';
import { STORY_FOOTER, type StoryKind } from './layout';
import { backgroundSchema } from '../schemas';

const toneSchema = z.enum(['lime', 'surface', 'red']);

/** Props of one Story frame (still). No progress bar, no link, no sticker UI: those are added in the Instagram app. */
export const storyFrameSchema = z.object({
  kind: z.enum(['vraag', 'antwoord', 'reel-teaser', 'quick-fact']),
  /** Category label in the header (own labels: Beleggen, Persoonlijke financiën, Markt). */
  kicker: z.string().min(1).max(30),
  /** Text in the light title label. */
  label: z.string().min(1).max(140),
  /** Small pill above the number, e.g. "Hypothetisch". */
  eyebrow: z.string().max(40).optional(),
  /** The big number or phrase, one entry per line. */
  big: z.array(z.object({ text: z.string().min(1).max(40), tone: toneSchema })).max(3).optional(),
  line: z.string().max(160).optional(),
  assumptions: z.string().max(160).optional(),
  cta: z.string().max(60).optional(),
  footer: z.literal(STORY_FOOTER),
  brandLogoFile: z.string().optional(),
  background: backgroundSchema.nullable().optional(),
});
export type StoryFrameProps = z.infer<typeof storyFrameSchema>;
export type { StoryKind };
