import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CTA_TEXT, FORBIDDEN_BRAND_NAMES, ON_SCREEN_LABEL, ideasDocumentSchema, evaluateRef, formatValue, type Idea, type IdeasDocument, type Unit } from '@rj/content-ideas';
import type { Repository } from '@rj/database';
import { WorkflowError, type WorkflowService } from '@rj/content-engine';
import { newId } from '@rj/shared';
import { SERIES_ACTOR } from './io.js';
import { canonical, hashOf } from './util.js';

/**
 * Idea import: turns the worked-out Reel ideas (content/ideas/<date>-15-ideeen.json, validated by `ideasDocumentSchema`)
 * into ContentIdea drafts (stage IDEA) with script revision, caption, storyboard and claims, and writes
 * content/scripts/<date>-<slug>/ like the series generator does. It never approves a gate and never moves the stage.
 * Idempotent: an idea whose content hash is already registered (DB or folder) is skipped.
 */

export type IdeaTemplate = 'A' | 'C' | 'D';
const TEMPLATE_ID: Record<IdeaTemplate, 'TemplateA' | 'TemplateC' | 'TemplateD'> = { A: 'TemplateA', C: 'TemplateC', D: 'TemplateD' };
export const IDEA_SERIES = 'Ideeën 2026-10-30';
const PILLAR: Record<Idea['category'], string> = { Beurswijzer: 'beleggen-etfs', 'Finance op orde': 'persoonlijke-financien', Koerstijgers: 'markt-economie' };
const TABLE_DISCLAIMER = 'Rendementen uit het verleden bieden geen garantie voor de toekomst. Geen beleggingsadvies.';
const NON_RETURNS_DISCLAIMER = 'Educatief rekenvoorbeeld. Geen persoonlijk advies.';

export interface IdeaClaim {
  key: string;
  claimText: string;
  value: number;
  unit: 'EUR' | 'percent' | 'months';
  role: 'result' | 'assumption';
  calculationRef: string;
}

export interface IdeaStoryboard {
  slug: string;
  title: string;
  template: 'TemplateA' | 'TemplateC' | 'TemplateD';
  series: string;
  language: 'nl';
  ideaId: number;
  table: Record<string, unknown>;
  background?: { clipIds: string[] };
  onScreen: { kicker: string; cta: string; footnote: string };
  scenes: { id: string; visual: string; segments: { id: string; text: string; pauseAfterMs?: number }[] }[];
}

export interface IdeaDraft {
  ideaId: number;
  slug: string;
  title: string;
  hook: string;
  pillar: string;
  template: IdeaTemplate;
  storyboard: IdeaStoryboard;
  scriptMd: string;
  caption: string;
  hashtags: string[];
  claims: IdeaClaim[];
  contentHash: string;
  propsHash: string;
  /** Registered in the DB / written to disk only when null. Template ideas without data are blocked. */
  blocked: string | null;
}

const claimUnit = (u: Unit): IdeaClaim['unit'] => (u === 'eur' || u === 'eur2' ? 'EUR' : u === 'duration' ? 'months' : 'percent');

/** "Zonder rendement" -> "Bij 0%", "Bij 4% rendement" -> "Bij 4%": same meaning, fits a column header. */
const HEADER_ON_SCREEN: Record<string, string> = {
  'Rente bijgeschreven': 'Rente',
  'Effectief per jaar': 'Effectief',
  'Kosten per jaar': 'Kosten',
  'Inflatie per jaar': 'Inflatie',
  'Rendement per jaar': 'Rendement',
  'Opbouwen bij €250': 'Bij €250',
  'Rente totaal bij 6%': 'Rente bij 6%',
  'Rente totaal bij 12%': 'Rente bij 12%',
  'Uitgaven per jaar': 'Uitgaven',
  'Van elke verhoging': 'Verhoging',
  'Zonder rendement': 'Bij 0%',
  'Na 10 jaar': 'Na 10 jaar',
};
export function compactLabel(label: string): string {
  const known = HEADER_ON_SCREEN[label];
  if (known) return known;
  if (label.length <= 14) return label;
  return label.replace(/\s+rendement$/i, '');
}
/** Long row labels that do not fit a column are shortened for the video only. */
export function compactRowLabel(text: string): string {
  return text
    .replace(/^Vaste lasten en noodzaak$/, 'Vaste lasten')
    .replace(/^Start op 25, stop na 10 jaar$/, 'Start 25, stop na 10 jr')
    .replace(/^Inleg bij €100 per maand$/, 'Inleg €100 p.m.')
    .replace(/^€10\.000 in één keer$/, '€10.000 eenmalig')
    .replace(/^(\d+%) \(\+€(\d+) per jaar\)$/, '$1 (+€$2/jr)');
}
/** "12 jaar en 11 mnd" -> "12 jr 11 mnd". */
export function compactDuration(text: string): string {
  return text.replace(/ jaar en /, ' jr ').replace(/ jaar$/, ' jr');
}

/** Fails when any displayed cell or claim differs from what the finance-engine gives today. */
export function verifyIdeaNumbers(idea: Idea): string[] {
  const problems: string[] = [];
  idea.table.rows.forEach((row, i) => {
    for (const col of idea.table.columns) {
      if (col.kind !== 'value' || col.unit === 'text') continue;
      const ref = row.refs[col.key];
      const shown = row.cells[col.key];
      if (!ref || shown === undefined) {
        problems.push(`idea ${idea.id} row ${i + 1} "${col.key}": no calculation ref`);
        continue;
      }
      const engine = evaluateRef(ref);
      if (formatValue(col.unit, engine) !== shown) problems.push(`idea ${idea.id} row ${i + 1} "${col.key}": shows ${shown} but the engine gives ${formatValue(col.unit, engine)}`);
      if (Math.abs(engine - (row.values[col.key] ?? NaN)) > 1e-6 * Math.max(1, Math.abs(engine))) problems.push(`idea ${idea.id} row ${i + 1} "${col.key}": stored value differs from the engine`);
    }
  });
  for (const c of idea.claims) {
    const engine = evaluateRef(c.calculationRef);
    if (Math.abs(engine - c.value) > 1e-6 * Math.max(1, Math.abs(engine))) problems.push(`idea ${idea.id} claim ${c.key}: value ${c.value} differs from the engine (${engine})`);
  }
  if (idea.chart) {
    // Chart end points must equal the cited summary: the last point of each series is an engine value shown in the table.
    for (const s of idea.chart.series) if (s.points.some((p) => !Number.isFinite(p.y))) problems.push(`idea ${idea.id} chart series "${s.label}" has a non-finite point`);
  }
  return problems;
}

/** One idea -> everything the pipeline needs. Date independent except the folder name. */
export function buildIdeaDraft(idea: Idea, date: string): IdeaDraft {
  const template = idea.format;
  const slug = `${date}-${idea.slug}`;
  const blocked = idea.dataOrigin === 'template-awaiting-data' ? `wacht op data van de eigenaar: ${idea.dataNeeded?.importCommand ?? 'zie dataNeeded'}` : null;
  const claims: IdeaClaim[] = idea.claims.map((c) => ({
    key: c.key,
    claimText: c.text,
    value: c.unit.startsWith('pct') ? c.value * 100 : c.value,
    unit: claimUnit(c.unit),
    role: c.role,
    calculationRef: c.calculationRef,
  }));
  // On-screen text must fit a 860 px wide table: long column headers and "12 jaar en 11 mnd" are shortened for the video only
  // (the caption and claims keep the full wording).
  const wide = idea.table.columns.length >= 4;
  const columns = idea.table.columns.map((c) => ({ key: c.key, label: wide ? compactLabel(c.label).replace(/^Na (\d+ jaar)$/, '$1') : compactLabel(c.label), kind: c.kind }));
  const durationKeys = new Set(idea.table.columns.filter((c) => c.unit === 'duration').map((c) => c.key));
  const rows = idea.table.rows.map((r) => ({
    cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, durationKeys.has(k) ? compactDuration(v) : compactRowLabel(v)])),
    highlight: r.highlight,
  }));
  const disclaimer = idea.involvesReturns ? TABLE_DISCLAIMER : NON_RETURNS_DISCLAIMER;
  const table: Record<string, unknown> = {
    kind: 'inline',
    title: idea.onScreen.title,
    subtitle: idea.onScreen.subtitle,
    columns,
    rows,
    assumptions: idea.assumptions.slice(0, 4),
    footerLine: idea.onScreen.footer,
    disclaimer,
    durationS: 10,
    claimCount: claims.length,
    ideaId: idea.id,
    ...(template === 'A' ? { size: 'large' } : {}),
    ...(template === 'C' && idea.chart ? { chart: { xLabel: idea.chart.xLabel, unit: idea.chart.unit, series: idea.chart.series.map((s) => ({ label: s.label, points: s.points })) } } : {}),
  };
  const storyboard: IdeaStoryboard = {
    slug,
    title: idea.title,
    template: TEMPLATE_ID[template],
    series: IDEA_SERIES,
    language: 'nl',
    ideaId: idea.id,
    table,
    onScreen: { kicker: ON_SCREEN_LABEL[idea.category], cta: CTA_TEXT, footnote: idea.onScreen.footer },
    scenes: [
      {
        id: 'table',
        visual: template === 'C' ? 'Titelblok, een korte regel, lijngrafiek die zich tekent, daaronder de samenvattingstabel; een korte voetregel.' : 'Titelblok, een korte regel, kolomkop en rijen een voor een; een korte voetregel.',
        segments: [{ id: 's01', text: `${idea.onScreen.title}. ${idea.onScreen.subtitle}`, pauseAfterMs: 450 }, { id: 's02', text: idea.onScreen.footer, pauseAfterMs: 450 }],
      },
      { id: 'cta', visual: 'Branded outro met CTA.', segments: [{ id: 's03', text: CTA_TEXT }] },
    ],
  };
  const shown = [storyboard.onScreen.kicker, idea.title, idea.caption, ...idea.hashtags, JSON.stringify(table)];
  if (shown.some((t) => FORBIDDEN_BRAND_NAMES.test(t))) throw new Error(`idea ${idea.id}: on-screen text, caption or hashtags mention another account's name (beurswijzer, koerstijgers, finance op orde)`);
  const contentHash = hashOf({ v: 1, id: idea.id, format: idea.format, title: idea.title, onScreen: idea.onScreen, table: idea.table, chart: idea.chart ?? null, claims: idea.claims, caption: idea.caption, hooks: idea.hooks });
  const propsHash = hashOf({ template: storyboard.template, table, onScreen: storyboard.onScreen, scenes: storyboard.scenes });
  const scriptMd = [
    `# ${idea.title}`,
    '',
    `- Idee ${idea.id} · Template ${template} (${template === 'D' ? 'tabel' : template === 'C' ? 'grafiek + tabel' : 'uitleg, grotere cijfers'}), plain 10 s stijl · 1080x1920 · 30 fps · 10 s · stemloos`,
    `- Label op beeld: ${ON_SCREEN_LABEL[idea.category]} · herhaalbaarheid ${idea.sustainability.score}/5`,
    '- Status: CONCEPT (nog geen G1/G2/G3/G4/G5). Elke cel en claim is een aanroep van `@rj/finance-engine`; zie `idea.json` (calculationRef per claim).',
    `- Op het scherm: titel, regel "${idea.onScreen.subtitle}", voetregel "${idea.onScreen.footer}", CTA "${CTA_TEXT}"`,
    '',
    '## Hooks (alternatieven voor de caption/titel)',
    ...idea.hooks.map((h) => `- ${h.pattern}: ${h.text}`),
    '',
    '## Storyboard (10 s)',
    '| Sec | Beeld | Op het scherm |',
    '| --- | --- | --- |',
    ...idea.storyboard.map((s) => `| ${s.second} | ${s.visual} | ${s.onScreen} |`),
    '',
    '## Aannames',
    ...idea.assumptions.map((a) => `- ${a}`),
    '',
    '## Compliance-notities',
    ...idea.compliance.map((c) => `- ${c}`),
    '',
    `Achtergrond-suggestie: ${idea.background.location} (${idea.background.clipId}, niet in de footage-manifest; zonder clips valt de Reel terug op de donkergroene animatie).`,
    '',
  ].join('\n');
  return { ideaId: idea.id, slug, title: idea.title, hook: idea.hooks[0]!.text, pillar: PILLAR[idea.category], template, storyboard, scriptMd, caption: idea.caption, hashtags: idea.hashtags, claims, contentHash, propsHash, blocked };
}

export function parseIdeasFile(path: string): IdeasDocument {
  return ideasDocumentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** All drafts of a document (verified against the engine). Throws when a number does not match. */
export function buildIdeaDrafts(doc: IdeasDocument, opts: { ids?: number[] } = {}): IdeaDraft[] {
  const picked = doc.ideas.filter((i) => !opts.ids || opts.ids.includes(i.id));
  const problems = picked.filter((i) => i.dataOrigin === 'calculated').flatMap(verifyIdeaNumbers);
  if (problems.length) throw new Error(`Ideas do not match the finance-engine:\n- ${problems.join('\n- ')}`);
  return picked.map((i) => buildIdeaDraft(i, doc.date));
}

export interface IdeaNotes {
  rj: 'idea/1';
  ideaId: number;
  slug: string;
  contentHash: string;
  propsHash: string;
  template: IdeaTemplate;
  sourceFile: string;
}
export function parseIdeaNotes(notes: string | null | undefined): IdeaNotes | null {
  if (!notes || !notes.startsWith('{')) return null;
  try {
    const n = JSON.parse(notes) as Partial<IdeaNotes>;
    return n && n.rj === 'idea/1' && typeof n.contentHash === 'string' ? (n as IdeaNotes) : null;
  } catch {
    return null;
  }
}

const pretty = (v: unknown) => JSON.stringify(JSON.parse(canonical(v)), null, 2) + '\n';

/** Writes content/scripts/<slug>/ (deterministic bytes). Returns the folder, or null when it already holds the same content and props hash. */
export function writeIdeaFiles(d: IdeaDraft, outDir: string): string | null {
  const dir = join(outDir, d.slug);
  if (existsSync(join(dir, 'idea.json'))) {
    try {
      const prev = JSON.parse(readFileSync(join(dir, 'idea.json'), 'utf8')) as { contentHash?: string; propsHash?: string };
      if (prev.contentHash === d.contentHash && prev.propsHash === d.propsHash && existsSync(join(dir, 'storyboard.json'))) return null;
    } catch {
      /* unreadable: overwrite */
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'script.md'), d.scriptMd);
  writeFileSync(join(dir, 'caption.md'), d.caption + '\n');
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(d.storyboard, null, 2) + '\n');
  writeFileSync(join(dir, 'idea.json'), pretty({ version: 1, ideaId: d.ideaId, slug: d.slug, title: d.title, hook: d.hook, template: d.template, pillar: d.pillar, series: IDEA_SERIES, contentHash: d.contentHash, propsHash: d.propsHash, hashtags: d.hashtags, claims: d.claims }));
  writeFileSync(join(dir, 'metadata.json'), pretty({ slug: d.slug, title: d.title, template: d.storyboard.template, series: IDEA_SERIES, preparedAt: null }));
  return dir;
}

export type IdeaRegisterResult = { status: 'created'; contentId: string; scriptRevisionId: string; claims: number } | { status: 'unchanged'; contentId: string } | { status: 'changed'; contentId: string; reason: string };

/**
 * Registers a draft: ContentIdea (stage IDEA), immutable ScriptRevision, caption, Storyboard and one FinancialClaim
 * per number (calculationRef -> finance-engine). Never approves a gate and never changes the stage.
 * Same content hash already registered = 'unchanged'. Same title with another hash = 'changed' (nothing overwritten;
 * the idea sheet was edited, the owner decides).
 */
export async function registerIdea(repo: Repository, wf: WorkflowService, d: IdeaDraft, sourceFile: string, actor: string = SERIES_ACTOR): Promise<IdeaRegisterResult> {
  const notes: IdeaNotes = { rj: 'idea/1', ideaId: d.ideaId, slug: d.slug, contentHash: d.contentHash, propsHash: d.propsHash, template: d.template, sourceFile };
  let item;
  try {
    item = await wf.createContentIdea(
      {
        title: d.title,
        pillar: d.pillar,
        // content_items.template is limited to A/B/C by a DB CHECK; Template D items are stored without it (the storyboard says D).
        template: d.template === 'D' ? undefined : d.template,
        series: IDEA_SERIES,
        hook: d.hook,
        angle: `Idee ${d.ideaId} · Template ${d.template} · plain 10 s`,
        priority: 50,
        notes: JSON.stringify(notes),
      },
      actor,
    );
  } catch (err) {
    if (err instanceof WorkflowError && err.code === 'DUPLICATE_TOPIC') {
      const existingId = (err.details as { existingId?: string } | undefined)?.existingId;
      const row = existingId ? await repo.contentItems.get(existingId) : null;
      const have = parseIdeaNotes(row?.notes);
      if (row && have?.contentHash === d.contentHash) return { status: 'unchanged', contentId: row.id };
      return { status: 'changed', contentId: row?.id ?? '', reason: row ? (have ? 'idea sheet content changed since the first import' : 'a different item already has this title') : 'topic exists' };
    }
    throw err;
  }
  const spoken = d.storyboard.scenes.flatMap((s) => s.segments.map((x) => x.text));
  const rev = await wf.addScriptRevision(
    item.id,
    {
      hook: d.hook,
      body: spoken.slice(0, -1).join('\n'),
      cta: spoken[spoken.length - 1] ?? null,
      onScreenText: [d.title, String(d.storyboard.table.subtitle ?? ''), d.storyboard.onScreen.footnote],
      captionText: d.caption,
      changeNote: `ideas import ${d.ideaId} (template ${d.template}) content ${d.contentHash.slice(0, 12)}`,
      title: d.title,
    },
    actor,
  );
  await wf.setCaption(item.id, d.caption, actor);
  const now = new Date().toISOString();
  await repo.storyboards.insert({ id: newId('sb'), contentId: item.id, scriptRevisionId: rev.id, template: d.template, scenes: d.storyboard.scenes, createdBy: actor as 'editorial-copywriter', createdAt: now });
  for (const c of d.claims) {
    await repo.financialClaims.insert({
      id: newId('fc'),
      contentId: item.id,
      scriptRevisionId: rev.id,
      claimText: c.claimText,
      value: c.value,
      unit: c.unit,
      sourceId: null,
      calculationRef: c.calculationRef,
      status: 'unverified',
      createdAt: now,
    });
  }
  return { status: 'created', contentId: item.id, scriptRevisionId: rev.id, claims: d.claims.length };
}

