/**
 * npm run ideas -- import <ideas.json> [--ids 2,6,13] [--date yyyy-mm-dd] [--out dir] [--dry-run] [--no-db]
 *
 * Registers each worked-out idea as a ContentIdea (stage IDEA, deduped by content hash) with script revision, caption,
 * storyboard and claims (calculationRef -> finance-engine) and writes content/scripts/<date>-<slug>/. Template ideas
 * without owner data (dataOrigin "template-awaiting-data") are reported as blocked and not registered.
 * Never approves a gate and never changes the stage. Idempotent.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WorkflowService, isEmergencyStopActive } from '@rj/content-engine';
import { REPO_ROOT, defaultDbPath, openRepository } from '@rj/database';
import { footageRoot, usableClips } from '@rj/footage-engine';
import { applyBackground } from './background.js';
import { buildIdeaDrafts, parseIdeasFile, registerIdea, writeIdeaFiles } from './ideas-import.js';
import type { SeriesItem } from './types.js';

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

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [cmd, file] = positional;
  if (cmd !== 'import' || !file) {
    console.log('Gebruik: npm run ideas -- import <ideas.json> [--ids 2,6,13] [--out dir] [--dry-run] [--no-db]');
    process.exitCode = cmd ? 1 : 0;
    return;
  }
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  const outDir = flags.get('out') ? resolve(process.env.INIT_CWD ?? process.cwd(), flags.get('out')!) : join(REPO_ROOT, 'content', 'scripts');
  const ids = flags.get('ids')?.split(',').map((x) => Number(x.trim()));
  if (ids?.some((n) => !Number.isInteger(n))) throw new Error('--ids must be a comma-separated list of idea numbers');
  const doc = parseIdeasFile(path);
  const drafts = buildIdeaDrafts(doc, { ids });
  const dry = flags.has('dry-run');
  const sourceFile = path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length + 1) : path;

  let clips: ReturnType<typeof usableClips> = [];
  try {
    clips = usableClips(footageRoot());
  } catch (e) {
    console.log(`LET OP: footage-manifest onleesbaar (${e instanceof Error ? e.message : e}); geen achtergrondclips gekozen.`);
  }
  const allSlugs = drafts.map((d) => d.slug);

  const repo = flags.has('no-db') || dry ? null : existsSync(defaultDbPath()) ? await openRepository() : null;
  if (!repo && !dry && !flags.has('no-db')) throw new Error(`Database not found at ${defaultDbPath()}: run npm run db:migrate first (or set RJ_DB_PATH)`);
  try {
    if (repo && (await isEmergencyStopActive(repo, process.env))) throw new Error('Emergency stop is active: nothing imported');
    const wf = repo ? new WorkflowService(repo) : null;
    const tally = { created: 0, unchanged: 0, changed: 0, blocked: 0, filesWritten: 0 };
    for (const d of drafts) {
      if (d.blocked) {
        tally.blocked++;
        console.log(`GEBLOKKEERD  idee ${String(d.ideaId).padStart(2)}  ${d.title}  (${d.blocked})`);
        continue;
      }
      // Deterministic drone-footage chain from the manifest (empty library: nothing is set, animated background is used).
      applyBackground({ slug: d.slug, tags: { durationS: 10 }, storyboard: d.storyboard, caption: d.caption } as unknown as SeriesItem, clips, allSlugs);
      if (dry) {
        console.log(`PLAN         idee ${String(d.ideaId).padStart(2)}  ${d.template}  ${d.slug}  ${d.claims.length} claims  hash ${d.contentHash.slice(0, 12)}`);
        continue;
      }
      let status = 'bestanden';
      if (repo && wf) {
        const r = await registerIdea(repo, wf, d, sourceFile);
        if (r.status === 'created') tally.created++;
        else if (r.status === 'unchanged') tally.unchanged++;
        else {
          tally.changed++;
          console.log(`WIJZIGING    idee ${d.ideaId}: ${r.reason}; niets overschreven in de database`);
          continue;
        }
        status = r.status === 'created' ? 'aangemaakt' : 'ongewijzigd';
      }
      if (writeIdeaFiles(d, outDir)) tally.filesWritten++;
      console.log(`${status.toUpperCase().padEnd(12)} idee ${String(d.ideaId).padStart(2)}  ${d.template}  ${d.slug}  ${d.claims.length} claims`);
    }
    console.log(`\nKlaar: ${tally.created} aangemaakt, ${tally.unchanged} ongewijzigd, ${tally.changed} gewijzigd (niet overschreven), ${tally.blocked} geblokkeerd; ${tally.filesWritten} mappen geschreven in ${outDir}`);
    console.log('Stage: IDEA. Geen enkele poort is goedgekeurd (G1 t/m G5 volgen via reviewers en de eigenaar).');
  } finally {
    await repo?.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
