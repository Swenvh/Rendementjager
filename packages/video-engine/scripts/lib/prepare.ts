/**
 * Content pipeline for one reel: storyboard.json + finance-engine → voice-over (cached) → real-timed
 * captions and scene timeline → validated props.json + metadata.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildReelCalculation, formatEur, formatPercent, type MonthlyContributionInput } from '@rj/finance-engine';
import { brand, resolveLogo } from '@rj/brand';
import { LocalFallbackProvider, selectProvider, synthesizeScript, toCaptionPages, type VoiceTrack } from '@rj/voice-engine';
import { reelCalculationFromEngine } from '../../src/calc/from-finance-engine.js';
import { templateCSchema, type TemplateCProps } from '../../src/schemas.js';
import { ASSETS_BRAND, CONTENT_SCRIPTS, PUBLIC_DIR, REPO_DIR, VOICE_CACHE } from './paths.js';
import { syncStaticAssets } from '../copy-fonts.js';

export interface Storyboard {
  slug: string;
  title: string;
  template: 'TemplateC';
  calculation: { overrides: Partial<MonthlyContributionInput> };
  onScreen: {
    kicker: string;
    hookLines: string[];
    hookHighlightLine: number;
    assumptionsFootnote: string;
    risks: { title: string; items: string[] };
    footnote: string;
    cta: string;
  };
  scenes: { id: string; visual: string; segments: { id: string; text: string; pauseAfterMs?: number }[] }[];
}

/** "€ 250" (NBSP) → "€250" so captions keep the amount as one word. */
const tight = (s: string) => s.replace(/€ /g, '€');

/** Spoken rounding that never overstates: 292.363 → "ruim €292.000", 161.800 → "bijna €162.000". */
export function roundedEuroPhrase(v: number): string {
  const floor = Math.floor(v / 1000) * 1000;
  return v - floor < 500 ? `ruim ${tight(formatEur(floor))}` : `bijna ${tight(formatEur(floor + 1000))}`;
}

export function buildTokens(overrides: Partial<MonthlyContributionInput> = {}): Record<string, string> {
  const r = buildReelCalculation(overrides);
  const t = r.result.totals;
  const n = r.result.input;
  return {
    annualReturn: formatPercent(n.annualReturn),
    monthlyContribution: tight(r.display.monthlyContribution),
    years: r.display.years,
    totalContributed: tight(r.display.totalContributed),
    endValue: tight(r.display.endValue),
    endValueSpoken: roundedEuroPhrase(t.endValueNominal),
    growth: tight(r.display.growth),
    growthSpoken: roundedEuroPhrase(t.growth),
    inflationRate: n.inflationRate === null ? 'ONBEKEND' : formatPercent(n.inflationRate),
    endValueRealSpoken: t.endValueReal === null ? 'ONBEKEND' : roundedEuroPhrase(t.endValueReal),
  };
}

export function fillTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const v = tokens[k];
    if (v === undefined) throw new Error(`Unknown token {{${k}}}`);
    if (v === 'ONBEKEND') throw new Error(`Token {{${k}}} has no value in the calculation`);
    return v;
  });
}

/** Scene windows from voice timings: a scene starts just before its first line, ends where the next starts. */
export function scenesFromTrack(sb: Storyboard, track: VoiceTrack, outroHoldMs: number) {
  const bySeg = new Map(track.segments.map((s) => [s.id, s]));
  const starts = sb.scenes.map((sc, i) => (i === 0 ? 0 : Math.max(0, bySeg.get(sc.segments[0]!.id)!.startMs - 250)));
  const totalMs = track.durationMs + outroHoldMs;
  return { totalMs, scenes: sb.scenes.map((sc, i) => ({ id: sc.id, startMs: starts[i]!, endMs: i + 1 < starts.length ? starts[i + 1]! : totalMs })) };
}

export interface PreparedContent {
  dir: string;
  props: TemplateCProps;
  metadata: Record<string, unknown>;
  track: VoiceTrack;
  inputProps: TemplateCProps & { brandLogoFile: string };
}

export async function prepareContent(slug: string): Promise<PreparedContent> {
  if (!/^[A-Za-z0-9][\w.-]*$/.test(slug) || slug.includes('..')) throw new Error(`Invalid content slug "${slug}"`);
  const dir = join(CONTENT_SCRIPTS, slug);
  const sb = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8')) as Storyboard;
  if (sb.template !== 'TemplateC') throw new Error(`Template ${sb.template} not wired into the pipeline yet`);
  syncStaticAssets();

  const tokens = buildTokens(sb.calculation.overrides);
  const segments = sb.scenes.flatMap((sc) => sc.segments.map((s) => ({ ...s, text: fillTokens(s.text, tokens) })));

  // Cost control: the paid brand voice is used only when explicitly enabled.
  const provider = process.env.RJ_TTS_PROVIDER === 'elevenlabs' ? selectProvider() : new LocalFallbackProvider();
  if (!provider.isConfigured()) throw new Error(`TTS provider ${provider.id} is not available (install espeak-ng for the local fallback)`);
  const genDir = join(PUBLIC_DIR, 'generated', slug);
  mkdirSync(genDir, { recursive: true });
  const track = await synthesizeScript(provider, segments, {
    cacheDir: VOICE_CACHE,
    outPath: join(genDir, 'voice.wav'),
    leadInMs: 350,
    defaultPauseMs: 300,
    tailMs: 400,
  });

  const outroHoldMs = 1600;
  const timeline = scenesFromTrack(sb, track, outroHoldMs);
  const captions = toCaptionPages(track.segments, { maxWords: 4, maxChars: 22 });
  const calculation = reelCalculationFromEngine(sb.calculation.overrides);

  const props: TemplateCProps = templateCSchema.parse({
    timeline,
    voice: { src: `generated/${slug}/voice.wav`, provider: track.provider, brandVoice: track.brandVoice, durationMs: track.durationMs },
    captions,
    footnote: { text: sb.onScreen.footnote },
    cta: { text: sb.onScreen.cta, tagline: 'Meer inzicht.' },
    kicker: sb.onScreen.kicker,
    hookLines: sb.onScreen.hookLines.map((l) => fillTokens(l, tokens)),
    hookHighlightLine: sb.onScreen.hookHighlightLine,
    calculation,
    assumptionsFootnote: fillTokens(sb.onScreen.assumptionsFootnote, tokens),
    risks: sb.onScreen.risks,
  });

  const logo = resolveLogo((f) => existsSync(join(ASSETS_BRAND, f)));
  const metadata = {
    slug,
    title: sb.title,
    template: sb.template,
    preparedAt: new Date().toISOString(),
    durationMs: timeline.totalMs,
    calculation: { engine: '@rj/finance-engine', function: 'buildReelCalculation', overrides: sb.calculation.overrides, tokens },
    voice: {
      provider: track.provider,
      brandVoice: track.brandVoice,
      voice: track.voice,
      label: track.brandVoice ? 'brand voice' : 'LOCAL FALLBACK (espeak-ng), NOT the brand voice: replace with ElevenLabs before publishing',
      audioFile: relative(REPO_DIR, track.audioPath),
      qa: track.qa,
      segments: track.segments.map((s) => ({ id: s.id, text: s.text, spokenText: s.spokenText, startMs: s.startMs, endMs: s.endMs, durationMs: s.durationMs, cacheHit: s.cacheHit, wordTimingSource: s.wordTimingSource })),
    },
    captions: { pages: captions.length, timing: 'segment durations measured with ffprobe; word timings within a segment estimated by spoken length' },
    logo: { file: logo.file, isPlaceholder: logo.isPlaceholder },
    illustrativeVisuals: ['risks scene line chart "Koersen schommelen" (badged Illustratief, not data)'],
  };
  writeFileSync(join(dir, 'props.json'), JSON.stringify(props, null, 2) + '\n');
  return { dir, props, metadata, track, inputProps: { ...props, brandLogoFile: logo.file } };
}
