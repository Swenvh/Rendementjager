import { captionCreditLine, clipsNeeded, creditLineOf, pickClipChain, type Clip } from '@rj/footage-engine';
import type { SeriesItem } from './types.js';

export interface BackgroundAssignment {
  clipIds: string[];
  /** Credit lines the licences require in the caption (CC BY: always). */
  captionCreditLines: string[];
  /** Credit lines of all clips, recorded in metadata whether required or not. */
  allCredits: string[];
}

/**
 * Deterministically gives an item a chain of DIFFERENT licensed clips from the footage manifest (rotation over the
 * id-sorted library, so neighbouring items do not share a background). Empty library = null: the Reel renders with
 * the animated dark-green background. Stores the choice in the storyboard (read by the renderer, which validates
 * the clips again) and appends mandatory credit lines to the caption. contentHash is NOT changed by this.
 */
export function applyBackground(item: SeriesItem, clips: Clip[], allSlugs: string[]): BackgroundAssignment | null {
  if (!clips.length) return null;
  const typical = Math.max(3, Math.round(clips.reduce((a, c) => a + c.durationS, 0) / clips.length));
  const chain = pickClipChain(clips, item.slug, allSlugs, clipsNeeded(item.tags.durationS, typical));
  if (!chain.length) return null;
  const captionCreditLines = chain.map(captionCreditLine).filter((x): x is string => !!x);
  item.storyboard.background = { clipIds: chain.map((c) => c.id) };
  if (captionCreditLines.length) item.caption = withCreditLines(item.caption, captionCreditLines);
  return { clipIds: chain.map((c) => c.id), captionCreditLines, allCredits: chain.map(creditLineOf) };
}

/** Inserts the credit lines above the final (hashtag) paragraph. */
export function withCreditLines(caption: string, lines: string[]): string {
  const uniq = [...new Set(lines)];
  const parts = caption.split('\n\n');
  const last = parts.pop() ?? '';
  return [...parts, uniq.join('\n'), last].join('\n\n');
}
