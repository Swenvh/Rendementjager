import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the rendementjager repo root (packages/database/src -> ../../..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Resolves a path against the repo root unless it is absolute. */
export function repoPath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

/** DB path from RJ_DB_PATH (default data/rendementjager.sqlite), resolved against the repo root. */
export function defaultDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return repoPath(env.RJ_DB_PATH && env.RJ_DB_PATH.trim() !== '' ? env.RJ_DB_PATH : 'data/rendementjager.sqlite');
}
