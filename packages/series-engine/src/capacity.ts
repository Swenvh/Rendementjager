import { planSeries, type ExistingRef } from './planner.js';
import { SERIES_KINDS, type SeriesItem, type SeriesKind } from './types.js';

/** Content mix from CLAUDE.md (starting point). */
export const CONTENT_MIX = [
  { pillar: 'vermogensopbouw', label: 'Vermogensopbouw', share: 0.3 },
  { pillar: 'beleggen-etfs', label: "Beleggen / ETF's", share: 0.25 },
  { pillar: 'markt-economie', label: 'Markt en economie', share: 0.2 },
  { pillar: 'persoonlijke-financien', label: 'Persoonlijke financiën', share: 0.15 },
  { pillar: 'fouten-mythes', label: 'Fouten en mythes', share: 0.1 },
] as const;

/** Which series kind feeds which pillar. markt-economie and fouten-mythes are never series-generated. */
export const PILLAR_KIND: Partial<Record<string, SeriesKind>> = {
  vermogensopbouw: 'compounding',
  'beleggen-etfs': 'cost',
  'persoonlijke-financien': 'inflation',
};

export const DEFAULT_WEEKLY_TARGET = 30;

export function weeklyTargetFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RJ_WEEKLY_TARGET;
  if (raw === undefined || raw.trim() === '') return DEFAULT_WEEKLY_TARGET;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error('RJ_WEEKLY_TARGET must be a positive integer');
  return n;
}

export interface RenderEstimate {
  reels: number;
  minutesPerReel: number;
  concurrency: number;
  /** One render after the other. */
  sequentialHours: number;
  /** Best case if the CPU scales with the concurrency (measure first: 4 CPUs, ~4 min per Reel alone). */
  bestCaseHours: number;
}

export function estimateRender(reels: number, env: NodeJS.ProcessEnv = process.env): RenderEstimate {
  const minutesPerReel = Number(env.RJ_RENDER_MINUTES_PER_REEL ?? 4) || 4;
  const concurrency = Math.max(1, Math.floor(Number(env.RJ_RENDER_CONCURRENCY ?? 2) || 2));
  const round = (x: number) => Math.round(x * 10) / 10;
  return { reels, minutesPerReel, concurrency, sequentialHours: round((reels * minutesPerReel) / 60), bestCaseHours: round((reels * minutesPerReel) / 60 / concurrency) };
}

export interface EvergreenIdea {
  id: string;
  title: string;
  pillar: string;
}

export type SlotType = 'series' | 'evergreen' | 'news';

export interface WeekSlot {
  n: number;
  day: string;
  pillar: string;
  type: SlotType;
  /** Human label (Dutch). */
  label: string;
  /** series: a planned (not yet registered) draft */
  item?: SeriesItem;
  /** evergreen: an existing idea */
  contentId?: string;
  /** placeholders must be filled by agents (research brief first for news) and are never auto-generated */
  placeholder: boolean;
  note?: string;
}

export interface WeekPlan {
  target: number;
  weekStart: string;
  slots: WeekSlot[];
  perPillar: Record<string, { planned: number; series: number; evergreen: number; news: number; placeholders: number }>;
  render: RenderEstimate;
  warnings: string[];
}

/** Largest-remainder allocation of `total` over the shares. */
export function allocate(total: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  const raw = shares.map((s) => (s / sum) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]!++;
    left--;
  }
  return base;
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface WeekOptions {
  target?: number;
  /** Any date in the target week (default: today). */
  date: string;
  existing?: readonly ExistingRef[];
  evergreen?: readonly EvergreenIdea[];
  variantsPerTopic?: number;
  maxPerKind?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Plans one week: `target` Reels split over the content mix. Series pillars get generated drafts
 * (not yet registered), fouten-mythes gets existing evergreen ideas, markt-economie gets
 * placeholders for current-news explainers (those need a research brief with dated sources and are
 * filled by agents, never auto-generated). Missing supply becomes an explicit placeholder.
 */
export function planWeek(options: WeekOptions): WeekPlan {
  const env = options.env ?? process.env;
  const target = options.target ?? weeklyTargetFromEnv(env);
  const weekStart = mondayOf(options.date);
  const counts = allocate(target, CONTENT_MIX.map((m) => m.share));
  const want = new Map(CONTENT_MIX.map((m, i) => [m.pillar as string, counts[i]!]));

  const seriesKinds = SERIES_KINDS.filter((k) => (want.get(Object.entries(PILLAR_KIND).find(([, v]) => v === k)![0]) ?? 0) > 0);
  const weights: Partial<Record<SeriesKind, number>> = {};
  const caps: Partial<Record<SeriesKind, number>> = {};
  for (const [pillar, kind] of Object.entries(PILLAR_KIND)) {
    weights[kind!] = want.get(pillar) ?? 0;
    caps[kind!] = want.get(pillar) ?? 0;
  }
  const seriesTotal = seriesKinds.reduce((s, k) => s + (weights[k] ?? 0), 0);
  const plan = planSeries({
    kinds: seriesKinds,
    count: seriesTotal,
    date: weekStart,
    variantsPerTopic: options.variantsPerTopic,
    maxPerKind: Object.fromEntries(seriesKinds.map((k) => [k, Math.min(caps[k] ?? 0, options.maxPerKind ?? Infinity)])),
    weights,
    existing: options.existing,
  });
  const warnings = [...plan.shortfall];

  const evergreen = [...(options.evergreen ?? [])];
  // Series items keep the planner's order (that order satisfies the spacing rule across kinds).
  const pillarOf = Object.fromEntries(Object.entries(PILLAR_KIND).map(([p, k]) => [k!, p]));
  const quota = new Map(Object.entries(pillarOf).map(([k, p]) => [k, want.get(p) ?? 0]));
  const used: Record<string, number> = {};
  const seriesOrdered: Omit<WeekSlot, 'n' | 'day'>[] = [];
  for (const it of plan.items) {
    if ((used[it.kind] ?? 0) >= (quota.get(it.kind) ?? 0)) continue;
    used[it.kind] = (used[it.kind] ?? 0) + 1;
    seriesOrdered.push({ pillar: pillarOf[it.kind]!, type: 'series', label: it.title, item: it, placeholder: false });
  }
  const entries: Omit<WeekSlot, 'n' | 'day'>[] = [];
  const seriesQueue = seriesOrdered;
  const other: Omit<WeekSlot, 'n' | 'day'>[] = [];
  for (const m of CONTENT_MIX) {
    const n = want.get(m.pillar) ?? 0;
    const kind = PILLAR_KIND[m.pillar];
    if (kind) {
      const items = plan.items.filter((it) => it.kind === kind).slice(0, n);
      for (let i = items.length; i < n; i++) {
        const idea = evergreen.shift();
        other.push(idea ? { pillar: m.pillar, type: 'evergreen', label: idea.title, contentId: idea.id, placeholder: false, note: `${kind}-reeks uitgeput of beperkt; bestaand evergreen-idee` } : { pillar: m.pillar, type: 'evergreen', label: `Evergreen-idee nodig (${m.label})`, placeholder: true, note: `${kind}-reeks levert geen nieuwe unieke items meer binnen de variatieregels` });
      }
    } else if (m.pillar === 'markt-economie') {
      for (let i = 0; i < n; i++)
        other.push({ pillar: m.pillar, type: 'news', label: `Actualiteit-explainer ${i + 1} (onderwerp volgt uit onderzoek)`, placeholder: true, note: 'Template B; vereist research brief met gedateerde bronnen (G1). Wordt door agents ingevuld, nooit automatisch gegenereerd.' });
    } else {
      for (let i = 0; i < n; i++) {
        const idea = evergreen.shift();
        other.push(idea ? { pillar: m.pillar, type: 'evergreen', label: idea.title, contentId: idea.id, placeholder: false } : { pillar: m.pillar, type: 'evergreen', label: `Fouten/mythes-idee nodig (${m.label})`, placeholder: true, note: 'Evergreen; agents leveren een idee met bronnen (G1)' });
      }
    }
  }
  // Interleave: spread the non-series slots evenly through the series order.
  const total = seriesQueue.length + other.length;
  let si = 0;
  let oi = 0;
  for (let i = 0; i < total; i++) {
    const wantOther = Math.round(((i + 1) * other.length) / total) - Math.round((i * other.length) / total) > 0;
    if ((wantOther && oi < other.length) || si >= seriesQueue.length) entries.push(other[oi++]!);
    else entries.push(seriesQueue[si++]!);
  }
  const slots: WeekSlot[] = entries.map((e, i) => ({ ...e, n: i + 1, day: addDays(weekStart, Math.floor((i * 7) / Math.max(1, total))) }));

  const perPillar: WeekPlan['perPillar'] = {};
  for (const m of CONTENT_MIX) perPillar[m.pillar] = { planned: 0, series: 0, evergreen: 0, news: 0, placeholders: 0 };
  for (const s of slots) {
    const p = perPillar[s.pillar]!;
    p.planned++;
    p[s.type]++;
    if (s.placeholder) p.placeholders++;
  }
  const withRender = slots.filter((s) => !s.placeholder).length;
  if (slots.some((s) => s.type === 'news')) warnings.push('Actualiteit-slots zijn placeholders: vul ze via onderzoek (research-topics) met een brief en gedateerde bronnen.');
  return { target, weekStart, slots, perPillar, render: estimateRender(withRender, env), warnings };
}
