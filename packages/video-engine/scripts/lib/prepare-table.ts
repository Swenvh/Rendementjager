/**
 * Content pipeline for a table / ranking Reel (Template D). Two data origins:
 *  - calculated: a matrix from @rj/finance-engine (monthly amount x years -> nominal end value), fully deterministic;
 *  - provided: a validated owner dataset (data/datasets/<id>.json, made by `npm run dataset -- import`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brand, resolveLogo } from '@rj/brand';
import { buildMatrixTable, CALCULATED_SOURCE, TABLE_DISCLAIMER_NL, TABLE_FOOTER_NL, TABLE_OUTRO_MS, tableSubtitleNl, tableTotalMs } from '../../src/calc/matrix.js';
import { datasetToTable, validateDataset, type Dataset } from '../../src/dataset.js';
import { templateCPlainSchema, templateDSchema, type TemplateDProps } from '../../src/schemas.js';
import { syncStaticAssets } from '../copy-fonts.js';
import { ASSETS_BRAND, REPO_DIR } from './paths.js';
import { resolveBackground, voiceMetadata, voiceTrackFor, type PreparedContent } from './prepare.js';

export type TableSpec =
  | { kind: 'matrix'; annualReturn: number; amounts: number[]; horizons: number[]; title: string; subtitle?: string; durationS?: number }
  | { kind: 'dataset'; datasetFile: string }
  | InlineTableSpec;

/**
 * Plain 10 s style from an approved idea sheet (content/ideas via `npm run ideas -- import`): the cells are already
 * formatted from finance-engine values at import (numbers and calculation refs are kept in series.json / the claims).
 * `chart` present = Template C plain (line chart + summary table); `size: 'large'` = Template A plain; else Template D.
 */
export interface InlineTableSpec {
  kind: 'inline';
  title: string;
  subtitle?: string;
  columns: { key: string; label: string; kind: 'label' | 'value' }[];
  rows: { cells: Record<string, string>; highlight?: boolean }[];
  assumptions: string[];
  footerLine: string;
  disclaimer: string;
  size?: 'normal' | 'large';
  chart?: { xLabel: string; unit: 'eur'; series: { label: string; points: { x: number; y: number }[] }[] };
  durationS?: number;
  claimCount?: number;
  ideaId?: number;
}

export interface TableStoryboard {
  slug: string;
  title: string;
  template: 'TemplateA' | 'TemplateC' | 'TemplateD';
  background?: { clipIds: string[] };
  table: TableSpec;
  onScreen: { kicker: string; cta: string; footnote?: string };
  scenes: { id: string; visual: string; segments: { id: string; text: string; pauseAfterMs?: number }[] }[];
}

const CTA_HOLD_MS = 3500;
/** Time the viewer needs: lead-in, one row every 0.45 s, then a hold to read the whole table. */
export const tableSceneMs = (rows: number) => 2500 + rows * 450 + 3500;

/** Names of other accounts (inspiration sources) must never be shown on a Reel. */
export const FORBIDDEN_ON_SCREEN = /beurswijzer|koerstijgers|finance\s+op\s+orde/i;

export async function prepareTable(slug: string, dir: string, sb: TableStoryboard): Promise<PreparedContent> {
  if (FORBIDDEN_ON_SCREEN.test(`${sb.onScreen.kicker} ${sb.title} ${JSON.stringify(sb.table)}`)) throw new Error(`${slug}: on-screen text mentions another account's name (beurswijzer, koerstijgers, finance op orde): use our own labels`);
  syncStaticAssets();
  const dateFromSlug = /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? new Date().toISOString().slice(0, 10);
  let table: Pick<TemplateDProps, 'columns' | 'rows' | 'source' | 'asOfDate' | 'dataOrigin' | 'assumptions' | 'title' | 'subtitle' | 'sortDirection'>;
  let extra: Record<string, unknown>;
  if (sb.table.kind === 'matrix') {
    const m = buildMatrixTable({ annualReturn: sb.table.annualReturn, amounts: sb.table.amounts, horizons: sb.table.horizons });
    table = { columns: m.columns, rows: m.rows, source: CALCULATED_SOURCE, asOfDate: dateFromSlug, dataOrigin: 'calculated', assumptions: m.assumptions, title: sb.table.title, subtitle: sb.table.subtitle ?? tableSubtitleNl(sb.table.annualReturn) };
    extra = { calculation: { engine: '@rj/finance-engine', function: 'futureValueOfMonthlyContributions', spec: { annualReturn: sb.table.annualReturn, amounts: sb.table.amounts, horizons: sb.table.horizons }, cells: m.cells.length } };
  } else if (sb.table.kind === 'inline') {
    const t = sb.table;
    table = { columns: t.columns, rows: t.rows, source: CALCULATED_SOURCE, asOfDate: dateFromSlug, dataOrigin: 'calculated', assumptions: t.assumptions, title: t.title, subtitle: t.subtitle };
    extra = { calculation: { engine: '@rj/finance-engine', source: 'content/ideas idea sheet', ideaId: t.ideaId ?? null, claims: t.claimCount ?? null }, style: t.chart ? 'plain-chart (Template C)' : t.size === 'large' ? 'plain-explain (Template A)' : 'plain-table (Template D)' };
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
  // Calculated tables are short by design (default 10 s, no narration): table reveal + hold, then a short outro.
  const calculated = sb.table.kind === 'matrix' || sb.table.kind === 'inline';
  const outroMs = calculated ? TABLE_OUTRO_MS : CTA_HOLD_MS;
  const tableMs = calculated
    ? tableTotalMs(sb.table.kind !== 'dataset' ? sb.table.durationS : undefined) - outroMs
    : Math.max(tableSceneMs(table.rows.length), (() => {
        const cta = sb.scenes.find((s) => s.id === 'cta')?.segments[0];
        const t = cta && track.segments.find((x) => x.id === cta.id);
        return t ? Math.max(0, t.startMs - 250) : 0;
      })());
  const timeline = { totalMs: tableMs + outroMs, scenes: [{ id: 'table', startMs: 0, endMs: tableMs }, { id: 'cta', startMs: tableMs, endMs: tableMs + outroMs }] };
  const bg = resolveBackground(slug, timeline.totalMs, sb.background?.clipIds);

  const common = {
    timeline,
    voice: { src: track.audioPath ? `generated/${slug}/voice.wav` : null, provider: track.provider, brandVoice: track.brandVoice, durationMs: track.durationMs },
    // Narration captions are not shown on table Reels: the rows fill the screen.
    captions: [],
    footnote: { text: sb.table.kind === 'inline' ? sb.table.disclaimer : TABLE_DISCLAIMER_NL },
    cta: { text: sb.onScreen.cta, tagline: 'Meer inzicht.' },
    background: bg.props,
    kicker: sb.onScreen.kicker,
    ...table,
  };
  let props: PreparedContent['props'];
  let composition: PreparedContent['composition'] = 'TemplateD';
  if (sb.table.kind === 'inline' && sb.table.chart) {
    composition = 'TemplateCPlain';
    props = templateCPlainSchema.parse({ ...common, chart: sb.table.chart, disclaimer: sb.table.disclaimer, footerLine: sb.table.footerLine });
  } else {
    if (sb.table.kind === 'inline' && sb.table.size === 'large') composition = 'TemplateAPlain';
    props = templateDSchema.parse({
      ...common,
      disclaimer: sb.table.kind === 'inline' ? sb.table.disclaimer : TABLE_DISCLAIMER_NL,
      ...(calculated ? { footerLine: sb.table.kind === 'inline' ? sb.table.footerLine : TABLE_FOOTER_NL } : {}),
      ...(sb.table.kind === 'inline' && sb.table.size ? { size: sb.table.size } : {}),
    });
  }
  writeFileSync(join(dir, 'props.json'), JSON.stringify(props, null, 2) + '\n');
  const logo = resolveLogo((f) => existsSync(join(ASSETS_BRAND, f)));
  const metadata = {
    slug,
    title: sb.title,
    template: sb.template,
    preparedAt: new Date().toISOString(),
    durationMs: timeline.totalMs,
    table: { origin: table.dataOrigin, rows: table.rows.length, columns: table.columns.map((c) => c.key), source: table.source, asOfDate: table.asOfDate, assumptions: table.assumptions, disclaimer: sb.table.kind === 'inline' ? sb.table.disclaimer : TABLE_DISCLAIMER_NL, ...extra },
    voice: voiceMetadata(track, sel.reason),
    background: bg.info,
    captions: { pages: 0, timing: 'no narration captions on table Reels (rows fill the screen)' },
    logo: { file: logo.file, isPlaceholder: logo.isPlaceholder },
    brand: brand.handle,
  };
  return { dir, props, metadata, track, composition, inputProps: { ...props, brandLogoFile: logo.file } };
}
