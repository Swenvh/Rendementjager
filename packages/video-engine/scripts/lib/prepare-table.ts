/**
 * Content pipeline for a table / ranking Reel (Template D). Two data origins:
 *  - calculated: a matrix from @rj/finance-engine (monthly amount x years -> nominal end value), fully deterministic;
 *  - provided: a validated owner dataset (data/datasets/<id>.json, made by `npm run dataset -- import`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brand, resolveLogo } from '@rj/brand';
import { buildMatrixTable, CALCULATED_SOURCE, TABLE_DISCLAIMER_NL } from '../../src/calc/matrix.js';
import { datasetToTable, validateDataset, type Dataset } from '../../src/dataset.js';
import { templateDSchema, type TemplateDProps } from '../../src/schemas.js';
import { syncStaticAssets } from '../copy-fonts.js';
import { ASSETS_BRAND, REPO_DIR } from './paths.js';
import { resolveBackground, voiceMetadata, voiceTrackFor, type PreparedContent } from './prepare.js';

export type TableSpec =
  | { kind: 'matrix'; annualReturn: number; amounts: number[]; horizons: number[]; title: string; subtitle?: string }
  | { kind: 'dataset'; datasetFile: string };

export interface TableStoryboard {
  slug: string;
  title: string;
  template: 'TemplateD';
  background?: { clipIds: string[] };
  table: TableSpec;
  onScreen: { kicker: string; cta: string; footnote?: string };
  scenes: { id: string; visual: string; segments: { id: string; text: string; pauseAfterMs?: number }[] }[];
}

const CTA_HOLD_MS = 3500;
/** Time the viewer needs: lead-in, one row every 0.45 s, then a hold to read the whole table. */
export const tableSceneMs = (rows: number) => 2500 + rows * 450 + 3500;

export async function prepareTable(slug: string, dir: string, sb: TableStoryboard): Promise<PreparedContent> {
  syncStaticAssets();
  const dateFromSlug = /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? new Date().toISOString().slice(0, 10);
  let table: Pick<TemplateDProps, 'columns' | 'rows' | 'source' | 'asOfDate' | 'dataOrigin' | 'assumptions' | 'title' | 'subtitle' | 'sortDirection'>;
  let extra: Record<string, unknown>;
  if (sb.table.kind === 'matrix') {
    const m = buildMatrixTable({ annualReturn: sb.table.annualReturn, amounts: sb.table.amounts, horizons: sb.table.horizons });
    table = { columns: m.columns, rows: m.rows, source: CALCULATED_SOURCE, asOfDate: dateFromSlug, dataOrigin: 'calculated', assumptions: m.assumptions, title: sb.table.title, subtitle: sb.table.subtitle };
    extra = { calculation: { engine: '@rj/finance-engine', function: 'futureValueOfMonthlyContributions', spec: { annualReturn: sb.table.annualReturn, amounts: sb.table.amounts, horizons: sb.table.horizons }, cells: m.cells.length } };
  } else {
    const file = join(REPO_DIR, sb.table.datasetFile);
    if (!sb.table.datasetFile.startsWith('data/datasets/') || sb.table.datasetFile.includes('..') || !existsSync(file)) throw new Error(`dataset ${sb.table.datasetFile} not found (npm run dataset -- import <file>)`);
    const v = validateDataset(JSON.parse(readFileSync(file, 'utf8')));
    if (!v.ok || !v.dataset) throw new Error(`dataset ${sb.table.datasetFile} is invalid:\n- ${v.errors.join('\n- ')}`);
    const ds: Dataset = v.dataset;
    const t = datasetToTable(ds);
    table = {
      columns: t.columns, rows: t.rows, source: ds.source, asOfDate: ds.asOfDate, dataOrigin: 'provided', sortDirection: ds.sortDirection,
      assumptions: [`Periode: ${ds.period}`, ds.metric], title: ds.title, subtitle: ds.subtitle,
    };
    extra = { dataset: { file: sb.table.datasetFile, id: ds.id, subject: ds.subject, period: ds.period, warnings: v.warnings }, compliance: v.compliance };
  }

  const segments = sb.scenes.flatMap((sc) => sc.segments);
  const { track, sel } = await voiceTrackFor(slug, segments);
  const tableMs = Math.max(tableSceneMs(table.rows.length), (() => {
    const cta = sb.scenes.find((s) => s.id === 'cta')?.segments[0];
    const t = cta && track.segments.find((x) => x.id === cta.id);
    return t ? Math.max(0, t.startMs - 250) : 0;
  })());
  const timeline = { totalMs: tableMs + CTA_HOLD_MS, scenes: [{ id: 'table', startMs: 0, endMs: tableMs }, { id: 'cta', startMs: tableMs, endMs: tableMs + CTA_HOLD_MS }] };
  const bg = resolveBackground(slug, timeline.totalMs, sb.background?.clipIds);

  const props: TemplateDProps = templateDSchema.parse({
    timeline,
    voice: { src: track.audioPath ? `generated/${slug}/voice.wav` : null, provider: track.provider, brandVoice: track.brandVoice, durationMs: track.durationMs },
    // Narration captions are not shown on table Reels: the rows fill the screen.
    captions: [],
    footnote: { text: TABLE_DISCLAIMER_NL },
    cta: { text: sb.onScreen.cta, tagline: 'Meer inzicht.' },
    background: bg.props,
    kicker: sb.onScreen.kicker,
    ...table,
    disclaimer: TABLE_DISCLAIMER_NL,
  });
  writeFileSync(join(dir, 'props.json'), JSON.stringify(props, null, 2) + '\n');
  const logo = resolveLogo((f) => existsSync(join(ASSETS_BRAND, f)));
  const metadata = {
    slug,
    title: sb.title,
    template: sb.template,
    preparedAt: new Date().toISOString(),
    durationMs: timeline.totalMs,
    table: { origin: table.dataOrigin, rows: table.rows.length, columns: table.columns.map((c) => c.key), source: table.source, asOfDate: table.asOfDate, assumptions: table.assumptions, disclaimer: TABLE_DISCLAIMER_NL, ...extra },
    voice: voiceMetadata(track, sel.reason),
    background: bg.info,
    captions: { pages: 0, timing: 'no narration captions on table Reels (rows fill the screen)' },
    logo: { file: logo.file, isPlaceholder: logo.isPlaceholder },
    brand: brand.handle,
  };
  return { dir, props, metadata, track, composition: 'TemplateD', inputProps: { ...props, brandLogoFile: logo.file } };
}
