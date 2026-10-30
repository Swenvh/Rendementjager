import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO_DIR = resolve(PKG_DIR, '..', '..');
export const PUBLIC_DIR = join(PKG_DIR, 'public');
export const ENTRY = join(PKG_DIR, 'src', 'index.ts');
export const ASSETS_BRAND = join(REPO_DIR, 'assets', 'brand');
export const CONTENT_SCRIPTS = join(REPO_DIR, 'content', 'scripts');
export const OUTPUT_REELS = join(REPO_DIR, 'output', 'reels');
export const OUTPUT_COVERS = join(REPO_DIR, 'output', 'covers');
export const VOICE_CACHE = join(REPO_DIR, '.cache', 'voice');
