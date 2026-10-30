/**
 * npm run series -- plan     --kind <compounding|cost|inflation|all> --count N [--variants 1..3] [--date yyyy-mm-dd] [--json]
 * npm run series -- generate --kind <k> --count N [--out content/scripts] [--no-db]
 * npm run series -- week     [--target N] [--date yyyy-mm-dd] [--json]
 * npm run series -- capacity
 *
 * `plan` and `week` are dry runs (they write nothing). `generate` writes content/scripts/<date>-<slug>/ and registers
 * ContentIdea + ScriptRevision + FinancialClaim rows (stage IDEA at most; it never approves a gate).
 */
import { join } from 'node:path';
import { WorkflowService, isEmergencyStopActive } from '@rj/content-engine';
import { REPO_ROOT, defaultDbPath, openRepository, type Repository } from '@rj/database';
import { existsSync } from 'node:fs';
import { estimateRender, planWeek, weeklyTargetFromEnv, CONTENT_MIX } from './capacity.js';
import { existingFromDb, existingFromFolders, parseSeriesNotes, registerItem, writeItemFiles } from './io.js';
import { capacity, planSeries, spacingViolations, type Plan } from './planner.js';
import { SERIES_KINDS, type SeriesKind } from './types.js';

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags.set(k!, v);
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) flags.set(k!, argv[++i]!);
      else flags.set(k!, 'true');
    } else positional.push(a);
  }
  return { flags, positional };
}

function kindsOf(v: string | undefined): SeriesKind[] {
  if (!v || v === 'all') return [...SERIES_KINDS];
  const out = v.split(',').map((x) => x.trim());
  for (const k of out) if (!(SERIES_KINDS as readonly string[]).includes(k)) throw new Error(`Unknown --kind "${k}" (use ${SERIES_KINDS.join(', ')}, all)`);
  return out as SeriesKind[];
}

const today = () => new Date().toISOString().slice(0, 10);
const intFlag = (v: string | undefined, name: string, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
  return n;
};

async function openDb(): Promise<Repository | null> {
  return existsSync(defaultDbPath()) ? openRepository() : null;
}

function printPlan(plan: Plan, json: boolean) {
  if (json) {
    console.log(JSON.stringify({ requested: plan.requested, planned: plan.items.length, shortfall: plan.shortfall, stats: plan.stats, items: plan.items.map((i) => ({ slug: i.slug, title: i.title, kind: i.kind, tags: i.tags, contentHash: i.contentHash })) }, null, 2));
    return;
  }
  console.log(`Plan: ${plan.items.length} van ${plan.requested} gevraagde items (alleen dry run, niets geschreven)\n`);
  plan.items.forEach((i, n) => {
    console.log(`${String(n + 1).padStart(3)}  ${i.kind.padEnd(11)} ${i.hookPattern.padEnd(9)} €${String(i.tags.amount).padStart(4)}/mnd ${String(i.tags.horizon).padStart(2)}j ${String(i.tags.ratePct).padStart(4)}%  ~${String(i.tags.durationS).padStart(4)}s  ${i.title}`);
  });
  const bad = spacingViolations(plan.items);
  const est = estimateRender(plan.items.length);
  console.log(`\nPer reeks: ${JSON.stringify(plan.stats.perKind)} · per hookpatroon: ${JSON.stringify(plan.stats.perPattern)}`);
  console.log(`Variatie: spacing-regel (>= 2 verschillen tussen opeenvolgende items) ${bad.length === 0 ? 'OK' : `GESCHONDEN op positie ${bad.join(', ')}`}; overgeslagen als duplicaat: ${plan.stats.skippedDuplicates}`);
  console.log(`Render-schatting: ${est.reels} Reels x ${est.minutesPerReel} min = ${est.sequentialHours} uur achter elkaar (4 CPU's); best case bij concurrency ${est.concurrency}: ${est.bestCaseHours} uur (eerst meten)`);
  for (const s of plan.shortfall) console.log(`LET OP: ${s}`);
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const date = flags.get('date') ?? today();
  const json = flags.has('json');
  const variants = intFlag(flags.get('variants') ?? process.env.RJ_SERIES_VARIANTS, 'variants', 2);
  const maxPerKind = flags.has('max-per-kind') ? intFlag(flags.get('max-per-kind'), 'max-per-kind', 0) : undefined;
  const outDir = flags.get('out') ? join(process.cwd(), flags.get('out')!) : join(REPO_ROOT, 'content', 'scripts');

  if (cmd === 'capacity') {
    const c = capacity(SERIES_KINDS, variants);
    console.log(JSON.stringify({ variantsPerTopic: variants, ...c }, null, 2));
    return;
  }

  if (cmd === 'plan' || cmd === 'generate') {
    const kinds = kindsOf(flags.get('kind'));
    const count = intFlag(flags.get('count'), 'count', 10);
    const repo = await openDb();
    try {
      const existing = [...existingFromFolders(outDir), ...(repo ? await existingFromDb(repo) : [])];
      const plan = planSeries({ kinds, count, date, variantsPerTopic: variants, maxPerKind, existing });
      if (cmd === 'plan') return printPlan(plan, json);
      if (!repo) throw new Error(`Database not found at ${defaultDbPath()}: run npm run db:migrate first (or set RJ_DB_PATH)`);
      if (await isEmergencyStopActive(repo, process.env)) throw new Error('Emergency stop is active: nothing generated');
      const wf = new WorkflowService(repo);
      let created = 0;
      let skipped = 0;
      for (const item of plan.items) {
        const reg = await registerItem(repo, wf, item);
        if (reg === 'duplicate') {
          skipped++;
          continue;
        }
        writeItemFiles(item, outDir);
        created++;
      }
      console.log(`Gegenereerd: ${created} drafts (${skipped} overgeslagen als duplicaat) in ${outDir}`);
      console.log('Stage: IDEA met script, caption, storyboard en financiële claims. Geen enkele poort is goedgekeurd (G1 t/m G5 volgen via reviewers en de eigenaar).');
      for (const s of plan.shortfall) console.log(`LET OP: ${s}`);
    } finally {
      await repo?.close();
    }
    return;
  }

  if (cmd === 'week') {
    const repo = await openDb();
    try {
      const existing = [...existingFromFolders(outDir), ...(repo ? await existingFromDb(repo) : [])];
      const evergreen = repo
        ? (await repo.contentItems.list({ stage: 'IDEA' }, { orderBy: 'priority', desc: true }))
            .filter((r) => !parseSeriesNotes(r.notes) && r.series === null)
            .map((r) => ({ id: r.id, title: r.title, pillar: r.pillar }))
        : [];
      const target = flags.has('target') ? intFlag(flags.get('target'), 'target', 0) : weeklyTargetFromEnv();
      const wp = planWeek({ target, date, existing, evergreen, variantsPerTopic: variants, maxPerKind });
      if (json) return console.log(JSON.stringify({ ...wp, slots: wp.slots.map((s) => ({ ...s, item: s.item ? { slug: s.item.slug, tags: s.item.tags, contentHash: s.item.contentHash } : undefined })) }, null, 2));
      console.log(`Weekplan vanaf ${wp.weekStart}: doel ${wp.target} Reels (RJ_WEEKLY_TARGET)\n`);
      for (const m of CONTENT_MIX) {
        const p = wp.perPillar[m.pillar]!;
        console.log(`${m.label.padEnd(24)} ${String(p.planned).padStart(3)}  (reeks ${p.series}, evergreen ${p.evergreen}, nieuws ${p.news}, placeholders ${p.placeholders})`);
      }
      console.log('');
      for (const s of wp.slots) console.log(`${String(s.n).padStart(3)} ${s.day} ${s.type.padEnd(9)} ${s.placeholder ? '[PLACEHOLDER] ' : ''}${s.label}`);
      const r = wp.render;
      console.log(`\nRender: ${r.reels} Reels (zonder placeholders) x ${r.minutesPerReel} min = ${r.sequentialHours} uur achter elkaar; best case bij concurrency ${r.concurrency}: ${r.bestCaseHours} uur`);
      for (const w of wp.warnings) console.log(`LET OP: ${w}`);
    } finally {
      await repo?.close();
    }
    return;
  }

  console.log('Gebruik: npm run series -- <plan|generate|week|capacity> [--kind compounding|cost|inflation|all] [--count N] [--variants 1..3] [--target N] [--date yyyy-mm-dd] [--out dir] [--json]');
  process.exitCode = cmd ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
