import { createHash } from 'node:crypto';
import type { Clip } from './manifest.js';

/** Stable 32-bit hash of a string. */
export function hash32(s: string): number {
  return createHash('sha256').update(s).digest().readUInt32BE(0);
}

/**
 * Deterministic rotation. `allSlugs` is the order the Reels are made/posted in (callers pass date-sorted folder names, then the plan order). The i-th
 * slug gets clip (offset + i) mod n over the id-sorted clips: neighbours never share a background when
 * n >= 2. `offset` is a hash of the first slug, so different series do not all start at clip 0.
 * Returns null when the library is empty (the caller falls back to the animated background).
 */
export function pickClipForSlug(clips: Clip[], slug: string, allSlugs: string[] = []): Clip | null {
  if (!clips.length) return null;
  const sortedClips = [...clips].sort((a, b) => (a.id < b.id ? -1 : 1));
  const slugs = [...new Set([...allSlugs, slug])]; // order is the caller's (posting/plan order)
  const i = slugs.indexOf(slug);
  const offset = hash32(slugs[0]!) % sortedClips.length;
  return sortedClips[(offset + i) % sortedClips.length]!;
}

/** Clip duration (s) and crossfade (s) used to decide how many clips a Reel needs. */
export const CHAIN_FADE_S = 1;
/** Clips reserved per Reel in the rotation (a 60 s Reel of 10 s clips needs 6). */
export const CHAIN_STRIDE = 6;

/** How many clips (cross-faded, never looped) cover `totalS`, given a typical clip length. */
export function clipsNeeded(totalS: number, clipS: number, fadeS = CHAIN_FADE_S): number {
  if (totalS <= clipS) return 1;
  return 1 + Math.ceil((totalS - clipS) / Math.max(1, clipS - fadeS));
}

/**
 * A chain of DIFFERENT clips for one Reel (consecutive in the id-sorted ring, starting at this slug's
 * rotation slot). Slot of the i-th slug = offset + i * CHAIN_STRIDE (6), so neighbouring Reels of up to 6 clips share no clip while the
 * library has at least 12 clips (smaller libraries wrap around). Never repeats a clip inside one Reel: if the library has fewer
 * clips than `count`, the chain is shorter and the animated background covers the rest.
 */
export function pickClipChain(clips: Clip[], slug: string, allSlugs: string[], count: number): Clip[] {
  if (!clips.length || count < 1) return [];
  const sortedClips = [...clips].sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = sortedClips.length;
  const slugs = [...new Set([...allSlugs, slug])]; // order is the caller's (posting/plan order)
  const i = slugs.indexOf(slug);
  const offset = hash32(slugs[0]!) % n;
  const take = Math.min(count, n);
  return Array.from({ length: take }, (_, k) => sortedClips[(offset + i * CHAIN_STRIDE + k) % n]!);
}
