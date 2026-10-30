/**
 * npm run footage -- list
 * npm run footage -- validate
 * npm run footage -- pick --slug <slug>
 * npm run footage -- slice --plan assets/footage/plans/nl-scenic.json (--input <file> | --input <sourceId>=<file> | --input-dir <dir>) [--only id,id] [--force]
 * npm run footage -- fetch --provider pexels|pixabay --query "..." --count N [--location "..."]
 * npm run footage -- fetch --provider youtube-cc --url <https://youtu.be/...> [--location "..."]
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchFromProvider } from './fetch.js';
import { footageRoot, REPO_ROOT } from './paths.js';
import { captionCreditLine, creditLineOf, loadManifest, validateManifest } from './manifest.js';
import { pickClipChain, clipsNeeded } from './pick.js';
import { loadPlan, sliceClips } from './slice.js';
import { fetchYoutubeCc } from './youtube-cc.js';

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

/** All values of a repeatable flag. */
function multi(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]!);
  return out;
}

function orphans(root: string, known: Set<string>): string[] {
  const dir = join(root, 'nl');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(mp4|mov|webm)$/i.test(f) && !known.has(`nl/${f}`));
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const root = footageRoot();
  const inCwd = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

  if (cmd === 'list' || cmd === 'validate') {
    const m = loadManifest(root);
    const v = validateManifest(m, { root, checkFiles: true });
    const orph = orphans(root, new Set(m.clips.map((c) => c.file)));
    if (!m.clips.length) console.log('Manifest is empty: Reels use the animated dark-green background (no footage configured).');
    for (const r of v.reports) {
      const c = r.clip;
      console.log(`${r.usable ? 'OK  ' : 'FAIL'} ${r.id.padEnd(24)} ${String(c.licence).padEnd(24)} ${c.width}x${c.height} ${c.durationS}s  ${c.location}`);
      for (const i of r.issues) console.log(`       - ${i}`);
    }
    for (const f of orph) console.log(`WARN nl/${f} has no manifest entry: it will NOT be used`);
    console.log(`\n${v.usable.length}/${m.clips.length} clips usable (${root})`);
    if (cmd === 'validate' && !v.ok) process.exitCode = 1;
    return;
  }

  if (cmd === 'pick') {
    const slug = flags.get('slug');
    if (!slug) throw new Error('--slug is required');
    const m = loadManifest(root);
    const usable = validateManifest(m, { root, checkFiles: true }).usable;
    const scripts = join(REPO_ROOT, 'content', 'scripts');
    const all = existsSync(scripts) ? readdirSync(scripts).filter((d) => existsSync(join(scripts, d, 'storyboard.json'))).sort() : [];
    const n = clipsNeeded(Number(flags.get('duration') ?? 50), 10);
    const chain = pickClipChain(usable, slug, all, n);
    if (!chain.length) console.log('none: no usable clips, the animated dark-green background is used');
    for (const c of chain) console.log(`${c.id}  ${c.file}  ${c.durationS}s  credit: ${creditLineOf(c)}${captionCreditLine(c) ? ' (REQUIRED in caption.md)' : ''}`);
    return;
  }

  if (cmd === 'slice') {
    const planPath = flags.get('plan');
    if (!planPath) throw new Error('Usage: footage slice --plan <plan.json> (--input <file> | --input <sourceId>=<file> ... | --input-dir <dir>) [--only id,id] [--force]');
    const plan = loadPlan(inCwd(planPath));
    const inputs: Record<string, string> = {};
    for (const v of multi(process.argv.slice(2), 'input')) {
      const eq = v.indexOf('=');
      if (eq > 0 && !existsSync(inCwd(v))) inputs[v.slice(0, eq)] = inCwd(v.slice(eq + 1));
      else if (plan.sources.length === 1) inputs[plan.sources[0]!.id] = inCwd(v);
      else throw new Error('this plan has several sources: use --input <sourceId>=<file> or --input-dir <dir>');
    }
    const dir = flags.get('input-dir');
    if (dir)
      for (const s of plan.sources)
        for (const ext of ['mp4', 'mkv', 'webm', 'mov'] as const) {
          const f = join(inCwd(dir), `${s.id}.${ext}`);
          if (!inputs[s.id] && existsSync(f)) inputs[s.id] = f;
        }
    const res = await sliceClips({ inputs, plan, root, only: flags.get('only')?.split(',').map((x) => x.trim()), force: flags.has('force') });
    console.log(`made ${res.made.length}: ${res.made.join(', ') || '-'}\nskipped (already there; --force to redo) ${res.skipped.length}: ${res.skipped.join(', ') || '-'}`);
    for (const m of res.missingSources) console.log(`NO FILE for source "${m.id}" (${m.url}): download it yourself and name it ${m.id}.mp4 in the --input-dir, or pass --input ${m.id}=<file>`);
    for (const f of res.failed) console.log(`FAILED ${f.id}: ${f.reason}`);
    if (res.failed.length) process.exitCode = 1;
    return;
  }

  if (cmd === 'fetch') {
    const provider = flags.get('provider');
    if (provider === 'youtube-cc') {
      const url = flags.get('url');
      if (!url) throw new Error('--url is required for youtube-cc');
      const c = await fetchYoutubeCc({ url, root, location: flags.get('location') });
      console.log(`added ${c.id} (${c.licence}). Credit line (REQUIRED in caption.md): ${creditLineOf(c)}\nThe owner must confirm the licence on the video page (${c.sourceUrl}).`);
      return;
    }
    if (provider !== 'pexels' && provider !== 'pixabay') throw new Error('--provider must be pexels, pixabay or youtube-cc');
    const query = flags.get('query');
    if (!query) throw new Error('--query is required');
    const r = await fetchFromProvider({ provider, query, count: Number(flags.get('count') ?? 3), root, location: flags.get('location') });
    console.log(`added ${r.added.length}: ${r.added.join(', ') || '-'}`);
    for (const s of r.skipped) console.log(`skipped ${s.id}: ${s.reason}`);
    console.log('Check each new entry (location, title) in assets/footage/manifest.json, then run: npm run footage -- validate');
    return;
  }

  console.log('Usage: npm run footage -- <list|validate|pick --slug s|slice --input f --plan p|fetch --provider pexels|pixabay|youtube-cc ...>');
  process.exitCode = cmd ? 1 : 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
