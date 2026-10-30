/**
 * Content pipeline for one reel: storyboard.json + finance-engine → voice-over (cached) → real-timed
 * captions and scene timeline → validated props.json + metadata.json.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildReelCalculation, formatEur, formatPercent, type MonthlyContributionInput } from '@rj/finance-engine';
import { brand, resolveLogo } from '@rj/brand';
import { buildVoicelessTrack, selectVoice, synthesizeScript, toCaptionPages, READING_SPEED, type VoiceTrack } from '@rj/voice-engine';
import { captionCreditLine, clipsNeeded, creditLineOf, footageRoot, pickClipChain, usableClips, assertClipUsable, CHAIN_FADE_S, type Clip } from '@rj/footage-engine';
import { reelCalculationFromEngine } from '../../src/calc/from-finance-engine.js';
import { templateCSchema, type BackgroundProps, type TemplateCProps, type TemplateDProps } from '../../src/schemas.js';
import { ASSETS_BRAND, CONTENT_SCRIPTS, PUBLIC_DIR, REPO_DIR, VOICE_CACHE } from './paths.js';
import { syncStaticAssets } from '../copy-fonts.js';
import { prepareTable, type TableStoryboard } from './prepare-table.js';

export interface Storyboard {
  slug: string;
  title: string;
  template: 'TemplateC' | 'TemplateD';
  /** Clip choice made at generate time by series-engine (ids from the footage manifest). */
  background?: { clipIds: string[] };
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

export interface ResolvedBackground {
  props: BackgroundProps | null;
  /** For metadata.json: which clips, why, credit lines. */
  info: Record<string, unknown>;
}

/**
 * Pick and stage the drone background for one Reel. Uses the clips the storyboard names (series-engine) when they
 * are still usable and cover the Reel, else a deterministic rotation over the manifest. Every clip is validated
 * again here (complete entry, allowed licence, file present) and copied to public/footage/. Empty or invalid
 * library = null: the template renders its animated dark-green background.
 */
export function resolveBackground(slug: string, totalMs: number, storyboardClipIds: string[] | undefined, opts: { root?: string; publicDir?: string; allSlugs?: string[] } = {}): ResolvedBackground {
  const root = opts.root ?? footageRoot();
  const publicDir = opts.publicDir ?? PUBLIC_DIR;
  const usable = usableClips(root);
  if (!usable.length) return { props: null, info: { mode: 'fallback-animated', reason: 'no usable licensed clip in assets/footage/manifest.json' } };
  const typical = Math.round(usable.reduce((a, c) => a + c.durationS, 0) / usable.length);
  const need = clipsNeeded(totalMs / 1000, Math.max(3, typical));
  let chain: Clip[] = [];
  let source: 'storyboard' | 'rotation' = 'rotation';
  const named = (storyboardClipIds ?? []).map((id) => usable.find((c) => c.id === id)).filter((c): c is Clip => !!c);
  if (named.length && named.length === storyboardClipIds!.length) {
    chain = named;
    source = 'storyboard';
    // Extend with the next clips in rotation when the real Reel is longer than the planned chain.
    const covered = () => chain.reduce((a, c) => a + c.durationS, 0) - CHAIN_FADE_S * (chain.length - 1);
    for (const c of pickClipChain(usable, slug, opts.allSlugs ?? [], usable.length)) {
      if (covered() >= totalMs / 1000) break;
      if (!chain.some((x) => x.id === c.id)) chain.push(c);
    }
  } else {
    chain = pickClipChain(usable, slug, opts.allSlugs ?? listSlugs(), need);
  }
  const dir = join(publicDir, 'footage');
  mkdirSync(dir, { recursive: true });
  const clips = chain.map((c) => {
    assertClipUsable(c, root);
    const ext = c.file.slice(c.file.lastIndexOf('.'));
    copyFileSync(join(root, c.file), join(dir, `${c.id}${ext}`));
    return { clipId: c.id, src: `footage/${c.id}${ext}`, durationS: c.durationS, ...(c.focusX !== undefined ? { focusX: c.focusX } : {}), credit: creditLineOf(c), creditRequired: !!c.creditRequired, licence: c.licence };
  });
  const coveredS = chain.reduce((a, c) => a + c.durationS, 0) - CHAIN_FADE_S * (chain.length - 1);
  return {
    props: { clips, fadeMs: CHAIN_FADE_S * 1000 },
    info: {
      mode: 'drone-footage',
      selection: source,
      clips: chain.map((c) => ({ clipId: c.id, licence: c.licence, author: c.author, sourceUrl: c.sourceUrl ?? null, credit: creditLineOf(c), creditRequired: !!c.creditRequired, rightsNote: c.rightsNote ?? null })),
      captionCreditLines: chain.map(captionCreditLine).filter((x): x is string => !!x),
      coverageS: Number(coveredS.toFixed(1)),
      reelS: Number((totalMs / 1000).toFixed(1)),
      note: coveredS + 0.05 < totalMs / 1000 ? 'library has too few distinct clips to cover the whole Reel: the animated background shows after the last clip (clips are never looped)' : undefined,
    },
  };
}

function listSlugs(): string[] {
  return existsSync(CONTENT_SCRIPTS) ? readdirSync(CONTENT_SCRIPTS).filter((d) => existsSync(join(CONTENT_SCRIPTS, d, 'storyboard.json'))).sort() : [];
}

/**
 * Voice policy: ElevenLabs only as explicit opt-in (RJ_TTS_PROVIDER=elevenlabs + key). Otherwise the Reel is
 * VOICELESS: captions only, timings derived from the script by reading speed (deterministic). No local voice.
 */
export async function voiceTrackFor(slug: string, segments: { id: string; text: string; pauseAfterMs?: number }[]) {
  const sel = selectVoice();
  const timing = { leadInMs: 350, defaultPauseMs: 300, tailMs: 400 };
  let track: VoiceTrack;
  if (sel.provider) {
    const genDir = join(PUBLIC_DIR, 'generated', slug);
    mkdirSync(genDir, { recursive: true });
    track = await synthesizeScript(sel.provider, segments, { cacheDir: VOICE_CACHE, outPath: join(genDir, 'voice.wav'), ...timing });
  } else {
    track = buildVoicelessTrack(segments, timing);
  }
  return { track, sel };
}

export function voiceMetadata(track: VoiceTrack, reason: string) {
  return {
    provider: track.provider,
    brandVoice: track.brandVoice,
    voice: track.voice,
    mode: track.provider === 'none' ? 'voiceless' : 'brand-voice',
    label: track.brandVoice ? 'brand voice (ElevenLabs, explicit opt-in)' : `VOICELESS: captions only, timings from reading speed (${READING_SPEED.msPerWord} ms per spoken word), no audio stream. ${reason}`,
    audioFile: track.audioPath ? relative(REPO_DIR, track.audioPath) : null,
    qa: track.qa,
    segments: track.segments.map((s) => ({ id: s.id, text: s.text, spokenText: s.spokenText, startMs: s.startMs, endMs: s.endMs, durationMs: s.durationMs, cacheHit: s.cacheHit, wordTimingSource: s.wordTimingSource })),
  };
}

export interface PreparedContent {
  dir: string;
  props: TemplateCProps | TemplateDProps;
  metadata: Record<string, unknown>;
  track: VoiceTrack;
  composition: 'TemplateC' | 'TemplateD';
  inputProps: (TemplateCProps | TemplateDProps) & { brandLogoFile: string };
}

export async function prepareContent(slug: string): Promise<PreparedContent> {
  if (!/^[A-Za-z0-9][\w.-]*$/.test(slug) || slug.includes('..')) throw new Error(`Invalid content slug "${slug}"`);
  const dir = join(CONTENT_SCRIPTS, slug);
  const sb = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8')) as Storyboard;
  if (sb.template === 'TemplateD') return prepareTable(slug, dir, sb as unknown as TableStoryboard);
  if (sb.template !== 'TemplateC') throw new Error(`Template ${sb.template} not wired into the pipeline yet`);
  syncStaticAssets();

  const tokens = buildTokens(sb.calculation.overrides);
  const segments = sb.scenes.flatMap((sc) => sc.segments.map((s) => ({ ...s, text: fillTokens(s.text, tokens) })));

  const { track, sel } = await voiceTrackFor(slug, segments);

  const outroHoldMs = 1600;
  const timeline = scenesFromTrack(sb, track, outroHoldMs);
  const captions = toCaptionPages(track.segments, { maxWords: 4, maxChars: 22 });
  const calculation = reelCalculationFromEngine(sb.calculation.overrides);

  const bg = resolveBackground(slug, timeline.totalMs, sb.background?.clipIds);

  const props: TemplateCProps = templateCSchema.parse({
    timeline,
    voice: { src: track.audioPath ? `generated/${slug}/voice.wav` : null, provider: track.provider, brandVoice: track.brandVoice, durationMs: track.durationMs },
    background: bg.props,
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
    voice: voiceMetadata(track, sel.reason),
    background: bg.info,
    captions: { pages: captions.length, timing: track.timingSource === 'measured-audio' ? 'segment durations measured with ffprobe; word timings within a segment estimated by spoken length' : 'segment durations from reading speed (deterministic, see voice-engine voiceless.ts); word timings spread by spoken length' },
    logo: { file: logo.file, isPlaceholder: logo.isPlaceholder },
    illustrativeVisuals: ['risks scene line chart "Koersen schommelen" (badged Illustratief, not data)'],
  };
  writeFileSync(join(dir, 'props.json'), JSON.stringify(props, null, 2) + '\n');
  return { dir, props, metadata, track, composition: 'TemplateC', inputProps: { ...props, brandLogoFile: logo.file } };
}
