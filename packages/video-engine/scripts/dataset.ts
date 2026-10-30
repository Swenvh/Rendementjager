/**
 * npm run dataset -- import <file.json|file.csv> [--sort] [--draft] [--dry-run]
 *     [CSV only: --id s --title t --subject products|macro|other --metric m --unit percent|eur|number --direction desc|asc --value-label l [--subtitle s] [--source-name n --source-url u]]
 * npm run dataset -- validate <file>
 *
 * Validates an OWNER-PROVIDED dataset (per-row source, as-of date and period; sorted order; % formatting), normalises it and
 * writes data/datasets/<id>.json. With --draft it also creates a Template D draft in content/scripts/<date>-ranglijst-<id>/
 * together with compliance.json. Product rankings by past performance are flagged for the compliance-reviewer (before G3).
 * This tool never downloads or invents data.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { TABLE_DISCLAIMER_NL } from '../src/calc/matrix.js';
import { datasetFromCsv, sortDataset, validateDataset, type Dataset, type DatasetSubject, type DatasetUnit } from '../src/dataset.js';
import { arg, positional } from './lib/args.js';
import { CONTENT_SCRIPTS, REPO_DIR } from './lib/paths.js';

const has = (name: string) => process.argv.includes(`--${name}`);
const cmd = positional()[0];
const file = positional()[1];

function load(path: string): { raw: unknown; errors: string[] } {
  const text = readFileSync(path, 'utf8');
  if (path.toLowerCase().endsWith('.csv')) {
    const need = ['id', 'title', 'subject', 'metric', 'unit', 'direction', 'value-label'];
    const missing = need.filter((k) => !arg(k));
    if (missing.length) return { raw: null, errors: [`CSV needs ${missing.map((m) => `--${m}`).join(', ')}`] };
    const sourceName = arg('source-name');
    const sourceUrl = arg('source-url');
    const r = datasetFromCsv(text, {
      id: arg('id')!, title: arg('title')!, subtitle: arg('subtitle'), subject: arg('subject') as DatasetSubject, metric: arg('metric')!,
      unit: arg('unit') as DatasetUnit, sortDirection: arg('direction') as 'asc' | 'desc', valueLabel: arg('value-label')!,
      source: sourceName && sourceUrl ? { name: sourceName, url: sourceUrl } : undefined,
    });
    return { raw: r.dataset, errors: r.errors };
  }
  return { raw: JSON.parse(text), errors: [] };
}

function draftFiles(ds: Dataset, date: string) {
  const slug = `${date}-ranglijst-${ds.id}`;
  const dir = join(CONTENT_SCRIPTS, slug);
  if (existsSync(join(dir, 'storyboard.json'))) throw new Error(`${dir} already exists: not overwritten`);
  mkdirSync(dir, { recursive: true });
  const hostname = new URL(ds.source.url).hostname.replace(/^www\./, '');
  const storyboard = {
    slug,
    title: ds.title,
    template: 'TemplateD',
    table: { kind: 'dataset', datasetFile: `data/datasets/${ds.id}.json` },
    onScreen: { kicker: 'Ranglijst', cta: 'Volg @rendementjager voor meer inzicht' },
    scenes: [
      { id: 'table', visual: 'Titelblok (lichte label), kolomkop, rijen een voor een; voetregel met disclaimer en bron.', segments: [{ id: 's01', text: `${ds.title}. Peildatum ${ds.asOfDate}, periode ${ds.period}. Rendementen uit het verleden bieden geen garantie voor de toekomst.`, pauseAfterMs: 450 }] },
      { id: 'cta', visual: 'Branded outro met CTA.', segments: [{ id: 's02', text: 'Volg @rendementjager voor meer inzicht.' }] },
    ],
  };
  const caption = [
    ds.title,
    '',
    `Bron: ${ds.source.name} (${hostname}), peildatum ${ds.asOfDate}, periode ${ds.period}.`,
    ds.subtitle ?? '',
    '',
    TABLE_DISCLAIMER_NL,
    '',
    'Volg @rendementjager voor meer inzicht.',
    '',
    '#beleggen #financieleeducatie',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const compliance = {
    status: ds.subject === 'products' ? 'ESCALATION_REQUIRED' : 'STANDARD_G3',
    escalateToComplianceReviewer: ds.subject === 'products',
    reviewer: 'compliance-reviewer',
    reason: ds.subject === 'products' ? 'Ranking of products by past performance: reads as a recommendation / invites cherry-picking. Needs a compliance-reviewer verdict before G3 (docs/EDITORIAL_POLICY.md).' : 'Not a product ranking.',
    dataset: `data/datasets/${ds.id}.json`,
  };
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(storyboard, null, 2) + '\n');
  writeFileSync(join(dir, 'caption.md'), caption + '\n');
  writeFileSync(join(dir, 'compliance.json'), JSON.stringify(compliance, null, 2) + '\n');
  writeFileSync(join(dir, 'script.md'), [`# ${ds.title}`, '', '- Template: D "Ranglijst" · 1080x1920 · 30 fps', `- Data: aangeleverd door de eigenaar (${ds.source.name}), peildatum ${ds.asOfDate}, periode ${ds.period}`, `- Status: CONCEPT. Compliance: ${compliance.status}`, '', `Alle ${ds.rows.length} rijen komen uit data/datasets/${ds.id}.json met bron, peildatum en periode per rij. Niets is aangevuld of geschat.`, ''].join('\n'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify({ slug, title: ds.title, template: 'TemplateD', preparedAt: null, compliance }, null, 2) + '\n');
  return { slug, dir, compliance };
}

if ((cmd !== 'import' && cmd !== 'validate') || !file) {
  console.error('Usage: npm run dataset -- import <file.json|file.csv> [--sort] [--draft] [--dry-run]   |   validate <file>');
  process.exit(1);
}
const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
if (!existsSync(path)) throw new Error(`File not found: ${path}`);
const { raw, errors: loadErrors } = load(path);
let candidate = raw as Dataset | null;
if (candidate && has('sort')) candidate = sortDataset(candidate);
const result = candidate ? validateDataset(candidate) : { ok: false, errors: [] as string[], warnings: [] as string[], dataset: undefined, compliance: undefined };
const errors = [...loadErrors, ...result.errors];
for (const w of result.warnings) console.log(`WARN  ${w}`);
if (errors.length || !result.dataset) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\n${basename(path)}: REJECTED (${errors.length} problem${errors.length === 1 ? '' : 's'}). Nothing written.`);
  process.exit(2);
}
const ds = result.dataset;
console.log(`${basename(path)}: OK, ${ds.rows.length} rows, ${ds.metric}, period ${ds.period}, as of ${ds.asOfDate}, source ${ds.source.name}`);
if (result.compliance?.escalateToComplianceReviewer) console.log(`COMPLIANCE FLAG: ${result.compliance.reason}`);
if (cmd === 'import' && !has('dry-run')) {
  const out = join(REPO_DIR, 'data', 'datasets', `${ds.id}.json`);
  mkdirSync(join(REPO_DIR, 'data', 'datasets'), { recursive: true });
  writeFileSync(out, JSON.stringify(ds, null, 2) + '\n');
  console.log(`written ${out.replace(REPO_DIR + '/', '')}`);
  if (has('draft')) {
    const d = draftFiles(ds, arg('date') ?? new Date().toISOString().slice(0, 10));
    console.log(`draft  ${d.dir.replace(REPO_DIR + '/', '')} (compliance: ${d.compliance.status})`);
  }
}
