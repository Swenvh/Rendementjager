/**
 * npm run reels:rebuild [-- --all] [-- --dry-run] [-- --only slug1,slug2]
 *
 * Re-renders every existing item whose background changed (new/other footage clips in the manifest) or whose props
 * reference clips that are no longer usable, one after the other: render (with media QA), cover, then relink video,
 * cover and caption through the normal service (`link-first-reel`, which uses WorkflowService, no direct DB edits).
 * Missing credit lines (CC BY) are added to caption.md first. Gates are never approved here; a changed video or
 * caption invalidates G5 the normal way.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assertClipUsable, footageRoot, loadManifest } from '@rj/footage-engine';
import { CONTENT_SCRIPTS, OUTPUT_REELS, REPO_DIR } from './lib/paths.js';
import { resolveBackground } from './lib/prepare.js';

const has = (f: string) => process.argv.includes(`--${f}`);

interface Meta { durationMs?: number; background?: { mode?: string; clips?: { clipId: string }[] } }

export function desiredClipIds(slug: string, durationMs: number, storyboardClipIds: string[] | undefined, root = footageRoot()): string[] {
  const bg = resolveBackground(slug, durationMs, storyboardClipIds, { root });
  return bg.props ? bg.props.clips.map((c) => c.clipId) : [];
}

/** Append missing credit lines above the hashtag paragraph. */
export function ensureCredits(captionFile: string, lines: string[]): boolean {
  if (!lines.length || !existsSync(captionFile)) return false;
  const text = readFileSync(captionFile, 'utf8').trimEnd();
  const missing = [...new Set(lines)].filter((l) => !text.includes(l));
  if (!missing.length) return false;
  const parts = text.split('\n\n');
  const last = parts.pop() ?? '';
  writeFileSync(captionFile, [...parts, missing.join('\n'), last].join('\n\n') + '\n');
  return true;
}

function sh(args: string[]): number {
  return spawnSync('npm', args, { cwd: REPO_DIR, stdio: 'inherit', env: process.env }).status ?? 1;
}

function main() {
  const root = footageRoot();
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1]?.split(',') : undefined);
  const slugs = readdirSync(CONTENT_SCRIPTS).filter((d) => existsSync(join(CONTENT_SCRIPTS, d, 'storyboard.json')) && (!only || only.includes(d))).sort();
  const todo: { slug: string; why: string }[] = [];
  for (const slug of slugs) {
    const dir = join(CONTENT_SCRIPTS, slug);
    const metaFile = join(dir, 'metadata.json');
    const meta: Meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
    if (!existsSync(join(OUTPUT_REELS, `${slug}.mp4`)) && !has('all')) continue; // never rendered: not an "existing" Reel
    const sb = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8')) as { background?: { clipIds: string[] } };
    const durationMs = meta.durationMs ?? 40_000;
    const want = desiredClipIds(slug, durationMs, sb.background?.clipIds, root);
    const had = meta.background?.clips?.map((c) => c.clipId) ?? [];
    if (has('all')) todo.push({ slug, why: '--all' });
    else if (want.join() !== had.join()) todo.push({ slug, why: `achtergrond ${had.length ? had.join('+') : 'geanimeerd'} -> ${want.length ? want.join('+') : 'geanimeerd'}` });
    else if (had.length) {
      try {
        const m = loadManifest(root);
        for (const id of had) assertClipUsable(m.clips.find((c) => c.id === id)!, root);
      } catch (e) {
        todo.push({ slug, why: `clip niet meer bruikbaar: ${e instanceof Error ? e.message : e}` });
      }
    }
  }
  if (!todo.length) return console.log('Niets te herbouwen: alle Reels gebruiken al de huidige achtergrond.');
  console.log(`Te herbouwen (${todo.length}):\n${todo.map((t) => `  ${t.slug}: ${t.why}`).join('\n')}`);
  if (has('dry-run')) return;

  const results: { slug: string; ok: boolean; note: string }[] = [];
  for (const { slug } of todo) {
    console.log(`\n=== ${slug} ===`);
    if (sh(['run', 'render', '-w', '@rj/video-engine', '--', '--content', slug]) !== 0) { results.push({ slug, ok: false, note: 'render mislukt' }); continue; }
    const meta = JSON.parse(readFileSync(join(CONTENT_SCRIPTS, slug, 'metadata.json'), 'utf8')) as { mediaQa?: { pass: boolean; issues: string[] }; background?: { captionCreditLines?: string[] } };
    if (ensureCredits(join(CONTENT_SCRIPTS, slug, 'caption.md'), meta.background?.captionCreditLines ?? [])) console.log('bronvermelding aan caption.md toegevoegd');
    sh(['run', 'cover', '-w', '@rj/video-engine', '--', '--content', slug]);
    const linked = sh(['run', 'link-first-reel', '-w', '@rj/mission-control', '--', slug]) === 0;
    results.push({ slug, ok: !!meta.mediaQa?.pass, note: `media-QA ${meta.mediaQa?.pass ? 'geslaagd' : 'GEFAALD'}; ${linked ? 'gekoppeld in Mission Control' : 'niet gekoppeld (item staat niet in de database: npm run db:seed of series generate)'}` });
  }
  console.log('\nResultaat:');
  for (const r of results) console.log(`  ${r.ok ? 'OK  ' : 'FOUT'} ${relative(REPO_DIR, join(OUTPUT_REELS, `${r.slug}.mp4`))}  ${r.note}`);
  console.log('Open het dashboard (npm run dev) en kijk op de pagina Review. Een gewijzigde video of caption maakt eerdere eigenaarsgoedkeuring (G5) ongeldig; keur opnieuw goed.');
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
