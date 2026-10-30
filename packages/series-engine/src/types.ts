export const SERIES_KINDS = ['compounding', 'cost', 'inflation'] as const;
export type SeriesKind = (typeof SERIES_KINDS)[number];

export const HOOK_PATTERNS = ['question', 'statement', 'contrast'] as const;
export type HookPattern = (typeof HOOK_PATTERNS)[number];

export const HOOK_PATTERN_NL: Record<HookPattern, string> = { question: 'vraag', statement: 'bewering', contrast: 'contrast' };

/** One calculation topic (a point in a parameter grid). All rates are fractions (0.07 = 7%). */
export interface TopicParams {
  kind: SeriesKind;
  /** Monthly contribution in whole euros. */
  monthly: number;
  years: number;
  /** Hypothetical average return per year (effective). 0 for the inflation series (savings without return). */
  annualReturn: number;
  /** cost series only */
  costLow?: number;
  costHigh?: number;
  /** inflation series only */
  inflation?: number;
}

export interface Claim {
  key: string;
  claimText: string;
  value: number;
  unit: 'EUR' | 'percent' | 'years';
  /** 'result' = computed by the engine; 'assumption' = an input the viewer is told is hypothetical. */
  role: 'result' | 'assumption' | 'input';
  /** Machine-readable link to the exact engine call: `@rj/finance-engine:<fn>(<json input>)#<path>`. */
  calculationRef: string;
}

/** Experiment tags: what the analytics-engine compares across variants later. */
export interface ExperimentTags {
  trial: true;
  kind: SeriesKind;
  hookPattern: HookPattern;
  /** monthly amount in euros */
  amount: number;
  /** horizon in years */
  horizon: number;
  template: 'C';
  /** Estimated duration in seconds (replaced by the measured duration after rendering). */
  durationS: number;
  variantGroup: string;
  variantIndex: number;
  /** hypothetical return in percent (compounding/cost) or inflation in percent (inflation series) */
  ratePct: number;
}

export interface SceneSegment {
  id: string;
  text: string;
  pauseAfterMs?: number;
}

export interface Storyboard {
  slug: string;
  title: string;
  template: 'TemplateC';
  series: string;
  language: 'nl';
  calculation: { engine: '@rj/finance-engine'; function: 'buildReelCalculation'; overrides: Record<string, number | null> };
  onScreen: {
    kicker: string;
    hookLines: string[];
    hookHighlightLine: number;
    assumptionsFootnote: string;
    risks: { title: string; items: string[] };
    footnote: string;
    cta: string;
  };
  scenes: { id: string; visual: string; segments: SceneSegment[] }[];
}

export interface SeriesItem {
  kind: SeriesKind;
  params: TopicParams;
  topicKey: string;
  hookPattern: HookPattern;
  title: string;
  hook: string;
  /** Folder name under content/scripts: `<date>-<slug>`. */
  slug: string;
  pillar: string;
  seriesName: string;
  storyboard: Storyboard;
  scriptMd: string;
  caption: string;
  hashtags: string[];
  claims: Claim[];
  tags: ExperimentTags;
  /** sha256 over the canonical script + on-screen props + caption + claims (date independent). */
  contentHash: string;
  /** sha256 over the canonical storyboard: what the renderer consumes (date independent). */
  propsHash: string;
}
