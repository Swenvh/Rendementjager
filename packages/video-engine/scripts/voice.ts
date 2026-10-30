/**
 * npm run voice -w @rj/video-engine -- --content <slug>
 * Voice-over only (no video render): storyboard + finance-engine tokens -> cached TTS track,
 * audio QA, props.json. Wraps prepareContent() so the worker's generate_audio job uses the same
 * entry point as `render`. Without RJ_TTS_PROVIDER=elevenlabs (+ key) the Reel is voiceless: reading-speed timings, no audio file.
 */
import { relative } from 'node:path';
import { arg } from './lib/args.js';
import { REPO_DIR } from './lib/paths.js';
import { prepareContent } from './lib/prepare.js';

const slug = arg('content');
if (!slug) {
  console.error('Usage: npm run voice -w @rj/video-engine -- --content <slug>');
  process.exit(1);
}
const { track } = await prepareContent(slug);
console.log(
  `voice ${slug}: provider ${track.provider} (brandVoice=${track.brandVoice}), ${track.durationMs} ms, ` +
    `audio QA ${track.qa.voice === 'none' ? 'n/a (voiceless)' : track.qa.pass ? 'PASS' : 'FAIL'}` +
    (track.audioPath ? ` -> ${relative(REPO_DIR, track.audioPath)}` : ' (no audio file)'),
);
if (!track.qa.pass) {
  console.error('audio QA issues:', track.qa.issues);
  process.exit(2);
}
