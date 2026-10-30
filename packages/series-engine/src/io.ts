import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repository } from '@rj/database';
import type { WorkflowService } from '@rj/content-engine';
import { WorkflowError } from '@rj/content-engine';
import { newId, topicHash } from '@rj/shared';
import type { ExistingRef } from './planner.js';
import { buildItem } from './build.js';
import type { Claim, ExperimentTags, HookPattern, SeriesItem, TopicParams } from './types.js';
import { canonical } from './util.js';

/** Machine-readable record stored in ContentIdea.notes (no schema change needed). */
export interface SeriesNotes {
  rj: 'series/1';
  slug: string;
  topicKey: string;
  contentHash: string;
  propsHash: string;
  trial: true;
  tags: ExperimentTags;
  /** Grid point: lets Mission Control recompute every number from the finance-engine. */
  params: TopicParams;
}

export function parseSeriesNotes(notes: string | null | undefined): SeriesNotes | null {
  if (!notes || !notes.startsWith('{')) return null;
  try {
    const n = JSON.parse(notes) as Partial<SeriesNotes>;
    return n && n.rj === 'series/1' && typeof n.contentHash === 'string' && n.tags && n.params ? (n as SeriesNotes) : null;
  } catch {
    return null;
  }
}

/** series.json: the canonical experiment + calculation record next to the script (render does not overwrite it). */
export interface SeriesRecord {
  version: 1;
  slug: string;
  title: string;
  hook: string;
  kind: string;
  topicKey: string;
  hookPattern: HookPattern;
  pillar: string;
  series: string;
  trial: true;
  tags: ExperimentTags;
  contentHash: string;
  propsHash: string;
  hashtags: string[];
  claims: Claim[];
}

export function recordOf(item: SeriesItem): SeriesRecord {
  return {
    version: 1,
    slug: item.slug,
    title: item.title,
    hook: item.hook,
    kind: item.kind,
    topicKey: item.topicKey,
    hookPattern: item.hookPattern,
    pillar: item.pillar,
    series: item.seriesName,
    trial: true,
    tags: item.tags,
    contentHash: item.contentHash,
    propsHash: item.propsHash,
    hashtags: item.hashtags,
    claims: item.claims,
  };
}

const pretty = (v: unknown) => JSON.stringify(JSON.parse(canonical(v)), null, 2) + '\n';

/** Writes content/scripts/<slug>/ (deterministic bytes). Returns the folder, or null when it already exists with the same content hash. */
export function writeItemFiles(item: SeriesItem, outDir: string): string | null {
  const dir = join(outDir, item.slug);
  if (existsSync(join(dir, 'series.json'))) {
    try {
      const prev = JSON.parse(readFileSync(join(dir, 'series.json'), 'utf8')) as SeriesRecord;
      if (prev.contentHash === item.contentHash) return null;
    } catch {
      /* unreadable: overwrite */
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'script.md'), item.scriptMd);
  writeFileSync(join(dir, 'caption.md'), item.caption + '\n');
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(item.storyboard, null, 2) + '\n');
  writeFileSync(join(dir, 'series.json'), pretty(recordOf(item)));
  // The renderer rewrites metadata.json with render details; series.json stays untouched.
  writeFileSync(join(dir, 'metadata.json'), pretty({ slug: item.slug, title: item.title, template: item.storyboard.template, series: item.seriesName, trial: true, tags: item.tags, preparedAt: null }));
  return dir;
}

/** Hashes already generated into a folder (so file-only runs also dedupe). */
export function existingFromFolders(outDir: string): ExistingRef[] {
  if (!existsSync(outDir)) return [];
  const refs: ExistingRef[] = [];
  for (const name of readdirSync(outDir)) {
    const f = join(outDir, name, 'series.json');
    if (!existsSync(f)) continue;
    try {
      const r = JSON.parse(readFileSync(f, 'utf8')) as SeriesRecord;
      refs.push({ contentHash: r.contentHash, topicKey: r.topicKey, hookPattern: r.hookPattern, topicHash: topicHash(r.title) });
    } catch {
      /* ignore */
    }
  }
  return refs;
}

/** Hashes of every ContentIdea row (series rows with their content hash, others by topic hash). */
export async function existingFromDb(repo: Repository): Promise<ExistingRef[]> {
  const rows = await repo.contentItems.list();
  return rows.map((r) => {
    const n = parseSeriesNotes(r.notes);
    return n ? { contentHash: n.contentHash, topicKey: n.topicKey, hookPattern: n.tags.hookPattern, topicHash: r.topicHash } : { topicHash: r.topicHash };
  });
}

export interface RegisterResult {
  contentId: string;
  scriptRevisionId: string;
  claims: number;
}

export const SERIES_ACTOR = 'editorial-copywriter';

/**
 * Registers a generated draft: ContentIdea (stage IDEA), immutable ScriptRevision, caption,
 * Storyboard and one FinancialClaim per number. It NEVER approves a gate and never changes the
 * stage: IDEA -> SCRIPTING needs G1 (a research brief with approved sources), which a reviewer
 * grants; G2/G3 follow on the script revision created here.
 */
export async function registerItem(repo: Repository, wf: WorkflowService, item: SeriesItem, actor: string = SERIES_ACTOR): Promise<RegisterResult | 'duplicate'> {
  const notes: SeriesNotes = { rj: 'series/1', slug: item.slug, topicKey: item.topicKey, contentHash: item.contentHash, propsHash: item.propsHash, trial: true, tags: item.tags, params: item.params };
  let idea;
  try {
    idea = await wf.createContentIdea(
      {
        title: item.title,
        pillar: item.pillar,
        // content_items.template is limited to A/B/C by a DB CHECK; Template D items are stored without it (the storyboard says D).
        template: item.kind === 'table' ? undefined : 'C',
        series: item.seriesName,
        hook: item.hook,
        angle: `Variantgroep ${item.tags.variantGroup} · variant ${item.tags.variantIndex + 1} · hookpatroon ${item.hookPattern}`,
        priority: 50,
        notes: JSON.stringify(notes),
      },
      actor,
    );
  } catch (err) {
    if (err instanceof WorkflowError && err.code === 'DUPLICATE_TOPIC') return 'duplicate';
    throw err;
  }
  const spoken = item.storyboard.scenes.flatMap((s) => s.segments.map((x) => x.text));
  const cta = spoken[spoken.length - 1] ?? null;
  const rev = await wf.addScriptRevision(
    idea.id,
    {
      hook: item.hook,
      body: spoken.slice(1, -1).join('\n'),
      cta,
      onScreenText: [...item.storyboard.onScreen.hookLines, ...item.storyboard.onScreen.risks.items, item.storyboard.onScreen.footnote],
      captionText: item.caption,
      changeNote: `series-engine ${item.topicKey} (${item.hookPattern}) content ${item.contentHash.slice(0, 12)}`,
      title: item.title,
    },
    actor,
  );
  await wf.setCaption(idea.id, item.caption, actor);
  const now = new Date().toISOString();
  await repo.storyboards.insert({ id: newId('sb'), contentId: idea.id, scriptRevisionId: rev.id, template: item.kind === 'table' ? 'D' : 'C', scenes: item.storyboard.scenes, createdBy: actor as 'editorial-copywriter', createdAt: now });
  for (const c of item.claims) {
    await repo.financialClaims.insert({
      id: newId('fc'),
      contentId: idea.id,
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
  return { contentId: idea.id, scriptRevisionId: rev.id, claims: item.claims.length };
}

/**
 * Recomputes the item from its grid point with the current finance-engine and compares the content
 * hash: false means a number, hook or caption no longer matches what the engine produces today.
 */
export function verifySeriesNotes(notes: SeriesNotes): { ok: boolean; expected: string; actual: string } {
  const again = buildItem(notes.params, notes.tags.hookPattern, '2000-01-01');
  return { ok: again.contentHash === notes.contentHash, expected: notes.contentHash, actual: again.contentHash };
}
