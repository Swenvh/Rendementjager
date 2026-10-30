/** Copies the @fontsource woff2 files and brand logo into public/ so renders need no network. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { typography } from '@rj/brand';
import { ASSETS_BRAND, PUBLIC_DIR } from './lib/paths.js';

const require = createRequire(import.meta.url);

export function syncStaticAssets(): void {
  mkdirSync(join(PUBLIC_DIR, 'fonts'), { recursive: true });
  for (const f of typography.fontFiles) {
    const pkg = f.family === 'Manrope' ? '@fontsource/manrope' : '@fontsource/inter';
    const src = join(dirname(require.resolve(`${pkg}/package.json`)), 'files', f.file);
    copyFileSync(src, join(PUBLIC_DIR, 'fonts', f.file));
  }
  mkdirSync(join(PUBLIC_DIR, 'brand'), { recursive: true });
  for (const file of ['logo-placeholder.svg', 'logo-official.svg']) {
    const src = join(ASSETS_BRAND, file);
    if (existsSync(src)) copyFileSync(src, join(PUBLIC_DIR, 'brand', file));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncStaticAssets();
  console.log('fonts + brand assets copied to', PUBLIC_DIR);
}
