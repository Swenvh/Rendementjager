/** npm run cover -w @rj/video-engine -- --content <slug> : 1080x1920 cover + 1080x1350 grid crop. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import { resolveLogo } from '@rj/brand';
import { arg } from './lib/args.js';
import { findBrowserExecutable } from './lib/browser.js';
import { getBundle } from './lib/bundle.js';
import { ASSETS_BRAND, CONTENT_SCRIPTS, OUTPUT_COVERS, REPO_DIR } from './lib/paths.js';
import { syncStaticAssets } from './copy-fonts.js';
import { templateCSchema } from '../src/schemas.js';

const slug = arg('content');
if (!slug) {
  console.error('Usage: npm run cover -w @rj/video-engine -- --content <slug>   (run render first: it writes props.json)');
  process.exit(1);
}
const propsPath = join(CONTENT_SCRIPTS, slug, 'props.json');
if (!existsSync(propsPath)) throw new Error(`${propsPath} missing: run npm run render first`);
syncStaticAssets();
const props = templateCSchema.parse(JSON.parse(readFileSync(propsPath, 'utf8')));
const inputProps = { ...props, brandLogoFile: resolveLogo((f) => existsSync(join(ASSETS_BRAND, f))).file };
const serveUrl = await getBundle();
const browserExecutable = findBrowserExecutable();
const composition = await selectComposition({ serveUrl, id: 'CoverC', inputProps, browserExecutable });
mkdirSync(OUTPUT_COVERS, { recursive: true });
const full = join(OUTPUT_COVERS, `${slug}.png`);
const grid = join(OUTPUT_COVERS, `${slug}-grid-1080x1350.png`);
await renderStill({ serveUrl, composition, inputProps, output: full, imageFormat: 'png', browserExecutable, overwrite: true });
// Instagram profile grid shows a centred 4:5 crop of the 9:16 cover.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', full, '-vf', 'crop=1080:1350:0:285', grid]);
console.log(`cover: ${relative(REPO_DIR, full)}\ngrid:  ${relative(REPO_DIR, grid)}`);
