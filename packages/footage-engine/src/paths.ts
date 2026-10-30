import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Footage library root. RJ_FOOTAGE_DIR overrides it (tests, a library on another disk). */
export function footageRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.RJ_FOOTAGE_DIR ? resolve(env.RJ_FOOTAGE_DIR) : join(REPO_ROOT, 'assets', 'footage');
}
export const manifestPath = (root: string) => join(root, 'manifest.json');
