import { normalizeForSpeech, type NormalizeTarget } from './normalize.js';
import type { TimedSegment, WordTiming } from './types.js';

/**
 * Spread the display words of a segment over its MEASURED duration, weighted by how long
 * each word is when spoken ("€250" weighs like "tweehonderdvijftig euro").
 */
export function estimateWordTimings(text: string, startMs: number, durationMs: number, target: NormalizeTarget = 'default'): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => normalizeForSpeech(w, target).replace(/[^\p{L}\d]/gu, '').length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = startMs;
  return words.map((w, i) => {
    const d = (durationMs * weights[i]!) / total;
    const out = { text: w, startMs: Math.round(t), endMs: Math.round(t + d) };
    t += d;
    return out;
  });
}

export interface CaptionPage {
  text: string;
  startMs: number;
  endMs: number;
  segmentId: string;
  words: WordTiming[];
}

/** Group word timings into short caption pages (never across segment boundaries). */
export function toCaptionPages(segments: TimedSegment[], opts: { maxWords?: number; maxChars?: number } = {}): CaptionPage[] {
  const maxWords = opts.maxWords ?? 4;
  const maxChars = opts.maxChars ?? 24;
  const pages: CaptionPage[] = [];
  for (const seg of segments) {
    let cur: WordTiming[] = [];
    const flush = () => {
      if (!cur.length) return;
      pages.push({
        text: cur.map((w) => w.text).join(' '),
        startMs: cur[0]!.startMs,
        endMs: cur[cur.length - 1]!.endMs,
        segmentId: seg.id,
        words: cur,
      });
      cur = [];
    };
    for (const w of seg.words) {
      const len = [...cur, w].map((x) => x.text).join(' ').length;
      if (cur.length >= maxWords || (cur.length > 0 && len > maxChars)) flush();
      cur.push(w);
      // Break after sentence punctuation for natural reading.
      if (/[.?!:;]$/.test(w.text)) flush();
    }
    flush();
  }
  return pages;
}
