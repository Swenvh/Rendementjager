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
import { templateCPlainSchema, templateCSchema, templateDSchema } from '../src/schemas.js';

const slug = arg('content');
if (!slug) {
  console.error('Usage: npm run cover -w @rj/video-engine -- --content <slug>   (run render first: it writes props.json)');
  process.exit(1);
}
const propsPath = join(CONTENT_SCRIPTS, slug, 'props.json');
if (!existsSync(propsPath)) throw new Error(`${propsPath} missing: run npm run render first`);
syncStaticAssets();
const rawProps = JSON.parse(readFileSync(propsPath, 'utf8'));
// Table Reels (Template D) use a still of the finished table instead of CoverC.
const isTable = Array.isArray(rawProps.rows);
// Plain 10 s styles: Template C plain has a chart, Template A plain is Template D with size 'large'.
const isPlainChart = isTable && !!rawProps.chart;
const props = isPlainChart ? templateCPlainSchema.parse(rawProps) : isTable ? templateDSchema.parse(rawProps) : templateCSchema.parse(rawProps);
const compositionId = isPlainChart ? 'TemplateCPlain' : isTable ? (rawProps.size === 'large' ? 'TemplateAPlain' : 'TemplateD') : 'CoverC';
const inputProps = { ...props, brandLogoFile: resolveLogo((f) => existsSync(join(ASSETS_BRAND, f))).file };
const serveUrl = await getBundle();
const browserExecutable = findBrowserExecutable();
const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, browserExecutable });
mkdirSync(OUTPUT_COVERS, { recursive: true });
const full = join(OUTPUT_COVERS, `${slug}.png`);
const grid = join(OUTPUT_COVERS, `${slug}-grid-1080x1350.png`);
const frame = isTable ? Math.round(((props as { timeline: { scenes: { endMs: number }[] } }).timeline.scenes[0]!.endMs * 0.85 / 1000) * 30) : 0;
await renderStill({ serveUrl, composition, inputProps, frame, output: full, imageFormat: 'png', browserExecutable, overwrite: true });
// Instagram profile grid shows a centred 4:5 crop of the 9:16 cover.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', full, '-vf', 'crop=1080:1350:0:285', grid]);
console.log(`cover: ${relative(REPO_DIR, full)}\ngrid:  ${relative(REPO_DIR, grid)}`);
