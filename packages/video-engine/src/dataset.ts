/**
 * Owner-provided market-data datasets for ranking Reels (Template D, dataOrigin 'provided').
 * Nothing here fetches or recalls figures: a dataset is a file the owner supplies (JSON or CSV) with a source,
 * as-of date and period on every row. The validator refuses anything incomplete, unsorted or mis-formatted.
 */
export type DatasetUnit = 'percent' | 'eur' | 'number';
export type DatasetSubject = 'products' | 'macro' | 'other';

export interface DatasetRow {
  cells: Record<string, string>;
  value: number;
  source: { name: string; url: string };
  asOfDate: string;
  period: string;
}

export interface Dataset {
  version: 1;
  id: string;
  title: string;
  subtitle?: string;
  /** 'products' = funds/ETFs/stocks ranked by past results: compliance escalation applies. */
  subject: DatasetSubject;
  metric: string;
  unit: DatasetUnit;
  sortDirection: 'asc' | 'desc';
  /** Label of the value column, e.g. "Rendement 2025". */
  valueLabel: string;
  columns: { key: string; label: string }[];
  source: { name: string; url: string };
  asOfDate: string;
  period: string;
  rows: DatasetRow[];
}

export interface DatasetCompliance {
  /** true = must go to the compliance-reviewer before G3 (docs/EDITORIAL_POLICY.md). */
  escalateToComplianceReviewer: boolean;
  reviewer: 'compliance-reviewer';
  reason: string;
}

export interface DatasetValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  dataset?: Dataset;
  compliance?: DatasetCompliance;
}

const MINUS = '−';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z][a-zA-Z0-9]*$/;

/** nl-NL display of one value. Percent keeps one decimal and an explicit sign: "+12,3%" / "−4,2%". */
export function formatDatasetValue(unit: DatasetUnit, v: number): string {
  if (unit === 'percent') {
    const n = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v));
    return `${v < 0 ? MINUS : '+'}${n}%`;
  }
  if (unit === 'eur') return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v).replace(/€\s/, '€');
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(v);
}

const validDate = (s: unknown, today: Date): s is string => {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getTime() <= today.getTime() + 24 * 3600_000;
};
const httpsUrl = (s: unknown): s is string => {
  try {
    return typeof s === 'string' && new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};
const str = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && !/^(todo|tbd|onbekend|unknown|n\/a|\?+)$/i.test(s.trim());

export function validateDataset(raw: unknown, opts: { today?: Date; maxAgeDays?: number } = {}): DatasetValidation {
  const today = opts.today ?? new Date();
  const maxAge = opts.maxAgeDays ?? 45;
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = raw as Partial<Dataset> | null;
  if (!d || typeof d !== 'object') return { ok: false, errors: ['dataset is not an object'], warnings };
  if (!str(d.id) || !/^[a-z0-9][a-z0-9-]*$/.test(d.id)) errors.push('id must be a lowercase slug');
  if (!str(d.title)) errors.push('title missing');
  if (!str(d.metric)) errors.push('metric missing (what is ranked, e.g. "Totaalrendement")');
  if (!str(d.valueLabel)) errors.push('valueLabel missing');
  if (!['products', 'macro', 'other'].includes(d.subject as string)) errors.push('subject must be products, macro or other (products = funds/ETFs/stocks: compliance escalation)');
  if (!['percent', 'eur', 'number'].includes(d.unit as string)) errors.push('unit must be percent, eur or number');
  if (d.sortDirection !== 'asc' && d.sortDirection !== 'desc') errors.push('sortDirection must be asc or desc');
  if (!Array.isArray(d.columns) || !d.columns.length) errors.push('columns missing (label columns, e.g. ticker, naam)');
  else for (const c of d.columns) if (!c || !KEY.test(c.key ?? '') || !str(c.label)) errors.push(`column ${JSON.stringify(c)} needs a camelCase key and a label`);
  if (!d.source || !str(d.source.name) || !httpsUrl(d.source.url)) errors.push('source needs a name and an https URL');
  if (!validDate(d.asOfDate, today)) errors.push('asOfDate missing or not a valid YYYY-MM-DD date in the past');
  else if ((today.getTime() - new Date(`${d.asOfDate}T00:00:00Z`).getTime()) / 86_400_000 > maxAge) warnings.push(`asOfDate ${d.asOfDate} is more than ${maxAge} days old: check that the data is still current`);
  if (!str(d.period)) errors.push('period missing (e.g. "1 jan 2025 t/m 31 dec 2025" or "5 jaar")');

  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (rows.length < 3) errors.push(`needs at least 3 rows (got ${rows.length})`);
  if (rows.length > 20) errors.push(`at most 20 rows fit on screen (got ${rows.length})`);
  if (rows.length >= 3 && rows.length < 8) warnings.push('fewer than 8 rows: a short list reads as cherry-picking; prefer 8-20');
  const labelKeys = Array.isArray(d.columns) ? d.columns.map((c) => c?.key) : [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const n = i + 1;
    if (!r || typeof r !== 'object') return void errors.push(`row ${n}: not an object`);
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) errors.push(`row ${n}: value is not a number`);
    for (const k of labelKeys) if (!str(r.cells?.[k as string])) errors.push(`row ${n}: missing ${String(k)}`);
    if (!r.source || !str(r.source.name) || !httpsUrl(r.source.url)) errors.push(`row ${n}: source (name + https URL) missing`);
    if (!validDate(r.asOfDate, today)) errors.push(`row ${n}: asOfDate missing or invalid`);
    if (!str(r.period)) errors.push(`row ${n}: period missing`);
    const id = labelKeys.map((k) => r.cells?.[k as string]).join('|').toLowerCase();
    if (seen.has(id)) errors.push(`row ${n}: duplicate entry "${id}"`);
    seen.add(id);
    if (d.unit === 'percent' && typeof r.value === 'number' && Math.abs(r.value) > 1000) warnings.push(`row ${n}: ${r.value}% looks like a ratio or a typo`);
  });
  if (d.sortDirection && !errors.some((e) => e.includes('value is not a number'))) {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!.value;
      const b = rows[i]!.value;
      if (d.sortDirection === 'desc' ? b > a : b < a) {
        errors.push(`not sorted ${d.sortDirection}: row ${i + 1} (${b}) breaks the order after row ${i} (${a}); fix the file or use --sort`);
        break;
      }
    }
  }
  const dates = new Set(rows.map((r) => r?.asOfDate));
  const periods = new Set(rows.map((r) => r?.period));
  if (dates.size > 1) warnings.push('rows have different as-of dates: the ranking compares unlike dates');
  if (periods.size > 1) errors.push('rows have different periods: a ranking must compare the same period');
  if (str(d.period) && periods.size === 1 && !periods.has(d.period)) errors.push('row periods differ from the dataset period');

  const compliance: DatasetCompliance = {
    escalateToComplianceReviewer: d.subject === 'products',
    reviewer: 'compliance-reviewer',
    reason: d.subject === 'products'
      ? 'Ranking of products by past performance: reads as a recommendation and invites cherry-picking. Escalate to the compliance-reviewer before G3.'
      : 'Not a product ranking; normal G3 applies.',
  };
  return { ok: errors.length === 0, errors, warnings, dataset: errors.length ? undefined : (d as Dataset), compliance };
}

/** Sort rows by value in the stated direction (deterministic, stable on ties). */
export function sortDataset(d: Dataset): Dataset {
  const dir = d.sortDirection === 'desc' ? -1 : 1;
  return { ...d, rows: d.rows.map((r, i) => ({ r, i })).sort((a, b) => dir * (a.r.value - b.r.value) || a.i - b.i).map((x) => x.r) };
}

/** Minimal CSV parser (comma or semicolon, double quotes). */
export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"', i++);
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) (out.push(cur.trim()), (cur = ''));
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

export interface CsvMeta {
  id: string;
  title: string;
  subtitle?: string;
  subject: DatasetSubject;
  metric: string;
  unit: DatasetUnit;
  sortDirection: 'asc' | 'desc';
  valueLabel: string;
  source?: { name: string; url: string };
}

/** CSV columns: any label columns + value, source_name, source_url, as_of_date, period. Numbers use "." or ",". */
export function datasetFromCsv(text: string, meta: CsvMeta): { dataset: unknown; errors: string[] } {
  const grid = parseCsv(text);
  const errors: string[] = [];
  if (grid.length < 2) return { dataset: null, errors: ['CSV needs a header and rows'] };
  const head = grid[0]!.map((h) => h.trim());
  const special = ['value', 'source_name', 'source_url', 'as_of_date', 'period'];
  for (const s of special) if (!head.includes(s)) errors.push(`CSV column "${s}" missing`);
  const labelCols = head.filter((h) => !special.includes(h));
  const col = (r: string[], name: string) => r[head.indexOf(name)] ?? '';
  const rows: DatasetRow[] = grid.slice(1).map((r) => ({
    cells: Object.fromEntries(labelCols.map((h) => [h, col(r, h)])),
    value: Number(col(r, 'value').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')),
    source: { name: col(r, 'source_name'), url: col(r, 'source_url') },
    asOfDate: col(r, 'as_of_date'),
    period: col(r, 'period'),
  }));
  const distinct = new Map(rows.map((r) => [`${r.source.name}|${r.source.url}`, r.source]));
  const source = meta.source ?? (distinct.size === 1 ? [...distinct.values()][0]! : undefined);
  if (!source) errors.push('rows have different sources: give the dataset source with --source-name and --source-url');
  const d = { version: 1, ...meta, source, columns: labelCols.map((h) => ({ key: h, label: h.charAt(0).toUpperCase() + h.slice(1) })), asOfDate: rows[0]?.asOfDate, period: rows[0]?.period, rows };
  return { dataset: d, errors };
}

/** Dataset -> Template D table (columns, rows with display strings). */
export function datasetToTable(d: Dataset) {
  return {
    columns: [...d.columns.map((c) => ({ key: c.key, label: c.label, kind: 'label' as const })), { key: 'value', label: d.valueLabel, kind: 'value' as const }],
    rows: d.rows.map((r) => ({ cells: { ...r.cells, value: formatDatasetValue(d.unit, r.value) }, sortValue: r.value, source: r.source, asOfDate: r.asOfDate, period: r.period })),
  };
}
