/** npm run render -w @rj/video-engine -- --content <slug> */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { arg } from './lib/args.js';
import { findBrowserExecutable } from './lib/browser.js';
import { getBundle } from './lib/bundle.js';
import { OUTPUT_REELS, REPO_DIR } from './lib/paths.js';
import { prepareContent } from './lib/prepare.js';
import { runMediaQa } from './qa.js';

const slug = arg('content');
if (!slug) {
  console.error('Usage: npm run render -w @rj/video-engine -- --content <slug>');
  process.exit(1);
}

const t0 = Date.now();
const prepared = await prepareContent(slug);
const tPrep = Date.now();
console.log(`prepared ${slug}: voice ${prepared.track.provider} (brandVoice=${prepared.track.brandVoice}), ${prepared.track.durationMs} ms, audio QA ${prepared.track.qa.voice === 'none' ? 'n/a (voiceless)' : prepared.track.qa.pass ? 'PASS' : 'FAIL'}`);
console.log(`background: ${(prepared.metadata.background as { mode: string }).mode}`);
if (!prepared.track.qa.pass) console.warn('audio QA issues:', prepared.track.qa.issues);

const serveUrl = await getBundle();
const browserExecutable = findBrowserExecutable();
const composition = await selectComposition({ serveUrl, id: prepared.composition, inputProps: prepared.inputProps, browserExecutable });
mkdirSync(OUTPUT_REELS, { recursive: true });
const outFile = join(OUTPUT_REELS, `${slug}.mp4`);
let lastPct = -10;
await renderMedia({
  serveUrl,
  composition,
  inputProps: prepared.inputProps,
  codec: 'h264',
  crf: 18,
  pixelFormat: 'yuv420p',
  // bt709 + limited (tv) range: JPEG frames otherwise produce full-range yuvj420p, which some players/IG mis-handle.
  colorSpace: 'bt709',
  audioCodec: 'aac',
  audioBitrate: '192k',
  imageFormat: 'jpeg',
  jpegQuality: 92,
  outputLocation: outFile,
  browserExecutable,
  overwrite: true,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      console.log(`render ${pct}%`);
    }
  },
});
const renderMs = Date.now() - tPrep;
const sha256 = createHash('sha256').update(readFileSync(outFile)).digest('hex');
const qa = await runMediaQa(outFile, { expectedDurationMs: prepared.props.timeline.totalMs, voice: prepared.track.provider === 'none' ? 'none' : 'present' });

const metadata = {
  ...prepared.metadata,
  render: {
    file: relative(REPO_DIR, outFile),
    sha256,
    sizeBytes: statSync(outFile).size,
    composition: prepared.composition,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
    codec: 'h264',
    renderedAt: new Date().toISOString(),
    prepareMs: tPrep - t0,
    renderMs,
  },
  mediaQa: { report: relative(REPO_DIR, qa.reportPath), pass: qa.pass, issues: qa.issues },
};
writeFileSync(join(prepared.dir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`rendered ${relative(REPO_DIR, outFile)} in ${(renderMs / 1000).toFixed(1)}s; media QA ${qa.pass ? 'PASS' : 'FAIL'}`);
if (!qa.pass) console.warn(qa.issues);
