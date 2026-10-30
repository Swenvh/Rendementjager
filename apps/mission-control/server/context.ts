import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { WorkflowService } from '@rj/content-engine';
import { REPO_ROOT, type Repository, repoPath } from '@rj/database';
import { ResearchService } from '@rj/research-engine';
import type { ContentIdea } from '@rj/shared';

/** Everything a route needs. Built once per app; tests pass a temp repo and env. */
export interface AppDeps {
  repo: Repository;
  workflow: WorkflowService;
  research: ResearchService;
  env: NodeJS.ProcessEnv;
  /** Repo root used to resolve output/, content/ and assets/ (default: the real repo root). */
  root: string;
  now: () => Date;
  /** Absolute path of the built UI (dist/) to serve, or null (dev: Vite serves the UI). */
  uiDist: string | null;
}

export interface CreateDepsOptions {
  env?: NodeJS.ProcessEnv;
  root?: string;
  now?: () => Date;
  uiDist?: string | null;
}

export function createDeps(repo: Repository, options: CreateDepsOptions = {}): AppDeps {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  return {
    repo,
    workflow: new WorkflowService(repo, { env, now }),
    research: new ResearchService(repo, { now }),
    env,
    root: options.root ?? REPO_ROOT,
    now,
    uiDist: options.uiDist ?? null,
  };
}

/** Resolves a repo-relative path (as stored in the DB) against the app root. */
export function rootPath(deps: AppDeps, p: string): string {
  return deps.root === REPO_ROOT ? repoPath(p) : p.startsWith('/') ? p : join(deps.root, p);
}

/**
 * Content slug (folder name under content/scripts and file stem under output/): taken from the
 * current video asset path, else from content/scripts/<slug>/storyboard.json whose title matches.
 */
export async function resolveSlug(deps: AppDeps, item: ContentIdea): Promise<string | null> {
  if (item.currentVideoAssetId) {
    const asset = await deps.repo.videoAssets.get(item.currentVideoAssetId);
    if (asset) return basename(asset.path).replace(/\.mp4$/i, '');
  }
  const dir = join(deps.root, 'content', 'scripts');
  if (!existsSync(dir)) return null;
  for (const slug of readdirSync(dir)) {
    const sb = join(dir, slug, 'storyboard.json');
    if (!existsSync(sb)) continue;
    try {
      const parsed = JSON.parse(readFileSync(sb, 'utf8')) as { title?: string };
      if (parsed.title?.trim() === item.title.trim()) return slug;
    } catch {
      /* unreadable storyboard: ignore */
    }
  }
  return null;
}

/** Reads content/scripts/<slug>/<file> if it exists (script.md, caption.md). */
export function readContentFile(deps: AppDeps, slug: string | null, file: string): string | null {
  if (!slug || !/^[\w.-]+$/.test(slug)) return null;
  const p = join(deps.root, 'content', 'scripts', slug, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}
