import { sha256, topicHash } from '@rj/shared';
import { buildItem } from './build.js';
import { enumerateTopics, topicKey } from './grids.js';
import { HOOK_PATTERNS, SERIES_KINDS, type HookPattern, type SeriesItem, type SeriesKind, type TopicParams } from './types.js';

export interface ExistingRef {
  contentHash?: string | null;
  topicKey?: string | null;
  hookPattern?: HookPattern | null;
  /** normalised title hash (topicHash) for ContentIdea rows without series metadata */
  topicHash?: string | null;
}

export interface PlanOptions {
  kinds: readonly SeriesKind[];
  count: number;
  /** yyyy-mm-dd, used in slugs only */
  date: string;
  /** Max hook variants (A/B) of the same calculation topic. 1..3, default 2. */
  variantsPerTopic?: number;
  /** Max items of one series kind in this plan (default: unlimited). */
  maxPerKind?: number | Partial<Record<SeriesKind, number>>;
  /** Min number of items between two variants of the same topic (default 6). */
  minVariantGap?: number;
  /** Relative weight per kind when planning several kinds (default: 3:2:1 compounding:cost:inflation). */
  weights?: Partial<Record<SeriesKind, number>>;
  /** Already registered items (ContentIdea rows / existing folders). */
  existing?: readonly ExistingRef[];
  /** Items that precede this plan (for the spacing rule at the seam). */
  previous?: readonly Pick<SeriesItem, 'kind' | 'hookPattern' | 'tags'>[];
  seed?: string;
}

export interface Plan {
  items: SeriesItem[];
  requested: number;
  /** Why fewer than requested items came out (empty when complete). */
  shortfall: string[];
  stats: {
    candidates: number;
    skippedDuplicates: number;
    skippedVariantLimit: number;
    perKind: Record<string, number>;
    perPattern: Record<string, number>;
  };
}

/** The Reels that were made by hand before the series engine existed. */
export const LEGACY_REFS: readonly ExistingRef[] = [{ topicKey: 'compounding:250:30:r7', hookPattern: 'question' }];

export const DEFAULT_WEIGHTS: Record<SeriesKind, number> = { compounding: 3, cost: 2, inflation: 1 };

type Dims = { kind: SeriesKind; pattern: HookPattern; amount: number; horizon: number };
const dimsOf = (i: Pick<SeriesItem, 'kind' | 'hookPattern' | 'tags'>): Dims => ({ kind: i.kind, pattern: i.hookPattern, amount: i.tags.amount, horizon: i.tags.horizon });

/** Number of differing dimensions among (kind, hook pattern, amount, horizon). */
export function differingDimensions(a: Pick<SeriesItem, 'kind' | 'hookPattern' | 'tags'>, b: Pick<SeriesItem, 'kind' | 'hookPattern' | 'tags'>): number {
  const x = dimsOf(a);
  const y = dimsOf(b);
  return Number(x.kind !== y.kind) + Number(x.pattern !== y.pattern) + Number(x.amount !== y.amount) + Number(x.horizon !== y.horizon);
}

export const MIN_DIFFERING_DIMENSIONS = 2;

/** Checks the spacing rule on an ordered list: every consecutive pair differs in >= 2 dimensions. */
export function spacingViolations(items: readonly Pick<SeriesItem, 'kind' | 'hookPattern' | 'tags'>[]): number[] {
  const bad: number[] = [];
  for (let i = 1; i < items.length; i++) if (differingDimensions(items[i - 1]!, items[i]!) < MIN_DIFFERING_DIMENSIONS) bad.push(i);
  return bad;
}

interface Cand {
  params: TopicParams;
  pattern: HookPattern;
  key: string;
  order: string;
}

/** Plans the next `count` items. Deterministic for the same inputs; never breaks the variation rules (it stops short instead). */
export function planSeries(options: PlanOptions): Plan {
  const { count, date } = options;
  const kinds = options.kinds.length ? options.kinds : SERIES_KINDS;
  const variants = Math.min(3, Math.max(1, options.variantsPerTopic ?? 2));
  const gap = options.minVariantGap ?? 6;
  const maxOpt = options.maxPerKind ?? Infinity;
  const capFor = (k: SeriesKind): number => (typeof maxOpt === 'number' ? maxOpt : (maxOpt[k] ?? Infinity));
  const seed = options.seed ?? 'rj1';
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const existing = [...LEGACY_REFS, ...(options.existing ?? [])];
  const takenHash = new Set(existing.map((e) => e.contentHash).filter(Boolean) as string[]);
  const takenTopicHash = new Set(existing.map((e) => e.topicHash).filter(Boolean) as string[]);
  const takenPattern = new Set(existing.filter((e) => e.topicKey && e.hookPattern).map((e) => `${e.topicKey}|${e.hookPattern}`));
  const variantCount = new Map<string, number>();
  for (const e of existing) if (e.topicKey) variantCount.set(e.topicKey, (variantCount.get(e.topicKey) ?? 0) + 1);

  const stats = { candidates: 0, skippedDuplicates: 0, skippedVariantLimit: 0, perKind: {} as Record<string, number>, perPattern: {} as Record<string, number> };
  const cands: Cand[] = [];
  for (const kind of kinds)
    for (const params of enumerateTopics(kind)) {
      const key = topicKey(params);
      for (const pattern of HOOK_PATTERNS) {
        stats.candidates++;
        cands.push({ params, pattern, key, order: sha256(`${seed}|${key}|${pattern}`) });
      }
    }
  cands.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  // Candidates are built lazily (hash needs the full item) only when considered.
  const built = new Map<Cand, SeriesItem>();
  const item = (c: Cand) => {
    let b = built.get(c);
    if (!b) built.set(c, (b = buildItem(c.params, c.pattern, date)));
    return b;
  };

  const out: SeriesItem[] = [];
  const used = new Set<Cand>();
  const perKindCount: Record<string, number> = {};
  const groupCount = new Map(variantCount);
  const lastIdx = new Map<string, number>(); // topicKey -> index in `out`
  const seq = [...(options.previous ?? [])];
  const seenHashes = new Set<string>();

  const kindDeficit = (k: SeriesKind) => {
    // How far a kind is behind its weighted share (higher = pick it sooner).
    const total = kinds.reduce((s, x) => s + (weights[x] ?? 0), 0) || 1;
    return ((weights[k] ?? 0) / total) * (out.length + 1) - (perKindCount[k] ?? 0);
  };

  const prefilter = (c: Cand): boolean => {
    if (takenPattern.has(`${c.key}|${c.pattern}`)) return false;
    return true;
  };
  const pool = cands.filter((c) => {
    if (!prefilter(c)) {
      stats.skippedDuplicates++;
      return false;
    }
    return true;
  });

  while (out.length < count) {
    const prev = seq[seq.length - 1];
    const prev2 = seq[seq.length - 2];
    let best: Cand | null = null;
    let bestScore = -Infinity;
    for (const c of pool) {
      if (used.has(c)) continue;
      if ((perKindCount[c.params.kind] ?? 0) >= capFor(c.params.kind)) continue;
      if ((groupCount.get(c.key) ?? 0) >= variants) continue;
      const li = lastIdx.get(c.key);
      if (li !== undefined && out.length - li < gap) continue;
      const it = item(c);
      if (takenHash.has(it.contentHash) || seenHashes.has(it.contentHash)) continue;
      if (takenTopicHash.has(topicHash(it.title))) continue;
      if (prev && differingDimensions(prev, it) < MIN_DIFFERING_DIMENSIONS) continue;
      // Rotation: avoid the same hook pattern three times in a row; prefer the kind that is behind its share.
      let score = kindDeficit(c.params.kind) * 10;
      if (prev && prev.hookPattern === c.pattern) score -= 5;
      if (prev && prev2 && prev2.hookPattern === c.pattern && prev.hookPattern === c.pattern) score -= 50;
      if (prev && prev.tags.amount === it.tags.amount) score -= 1;
      if (prev && prev.tags.horizon === it.tags.horizon) score -= 1;
      // Keep the hook patterns balanced over the whole plan.
      const pc = HOOK_PATTERNS.map((x) => stats.perPattern[x] ?? 0);
      score -= ((stats.perPattern[c.pattern] ?? 0) - Math.min(...pc)) * 3;
      // Prefer fresh topics over a second variant of a topic: variants come later, A/B pairs get spread out.
      score -= (groupCount.get(c.key) ?? 0) * 4;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (!best) break;
    const it = item(best);
    out.push(it);
    seq.push(it);
    used.add(best);
    seenHashes.add(it.contentHash);
    perKindCount[best.params.kind] = (perKindCount[best.params.kind] ?? 0) + 1;
    groupCount.set(best.key, (groupCount.get(best.key) ?? 0) + 1);
    lastIdx.set(best.key, out.length - 1);
    stats.perPattern[best.pattern] = (stats.perPattern[best.pattern] ?? 0) + 1;
  }
  stats.perKind = perKindCount;
  // Variant-limit skips (informational): topics already at the variant cap.
  for (const c of pool) if (!used.has(c) && (groupCount.get(c.key) ?? 0) >= variants) stats.skippedVariantLimit++;

  const shortfall: string[] = [];
  if (out.length < count)
    shortfall.push(
      `Slechts ${out.length} van ${count} items mogelijk binnen de variatieregels (varianten per onderwerp: ${variants}, min. afstand tussen varianten: ${gap}, per reeks max: ${typeof maxOpt === 'number' ? (Number.isFinite(maxOpt) ? maxOpt : 'geen') : 'per reeks ingesteld'}). Voeg rasterwaarden toe of verhoog --variants.`,
    );
  return { items: out, requested: count, shortfall, stats };
}

/** Total number of unique drafts the grids can produce (topics x hook patterns, capped by variants per topic). */
export function capacity(kinds: readonly SeriesKind[] = SERIES_KINDS, variantsPerTopic = 3): { perKind: Record<string, { topics: number; drafts: number }>; topics: number; drafts: number } {
  const perKind: Record<string, { topics: number; drafts: number }> = {};
  let topics = 0;
  let drafts = 0;
  for (const k of kinds) {
    const t = enumerateTopics(k).length;
    const d = t * Math.min(3, Math.max(1, variantsPerTopic));
    perKind[k] = { topics: t, drafts: d };
    topics += t;
    drafts += d;
  }
  return { perKind, topics, drafts };
}
