/**
 * npm run concepts:package -- [--date 2026-10-30]
 *
 * Packages the rendered idea drafts for the owner's review: output/reports/<date>-concept-reels.zip (per Reel a folder with the
 * MP4, the cover and captions.txt) and a contact sheet with one frame per Reel (<date>-concept-reels-overzicht.png).
 * Reads content/scripts/<slug>/idea.json (written by `npm run ideas -- import`). Nothing is approved or published.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arg } from './lib/args.js';
import { CONTENT_SCRIPTS, OUTPUT_COVERS, OUTPUT_REELS, REPO_DIR } from './lib/paths.js';

const date = arg('date') ?? '2026-10-30';
const reports = join(REPO_DIR, 'output', 'reports');
const stage = join(REPO_DIR, 'output', 'tmp', `${date}-concept-reels`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(reports, { recursive: true });

interface Idea { ideaId: number; slug: string; title: string }
const ideas = readdirSync(CONTENT_SCRIPTS)
  .filter((d) => d.startsWith(`${date}-`) && existsSync(join(CONTENT_SCRIPTS, d, 'idea.json')))
  .map((d) => JSON.parse(readFileSync(join(CONTENT_SCRIPTS, d, 'idea.json'), 'utf8')) as Idea)
  .sort((a, b) => a.ideaId - b.ideaId);

const missing: string[] = [];
const frames: string[] = [];
for (const i of ideas) {
  const mp4 = join(OUTPUT_REELS, `${i.slug}.mp4`);
  const cover = join(OUTPUT_COVERS, `${i.slug}.png`);
  const caption = join(CONTENT_SCRIPTS, i.slug, 'caption.md');
  if (![mp4, cover, caption].every(existsSync)) { missing.push(i.slug); continue; }
  const nn = String(i.ideaId).padStart(2, '0');
  const dir = join(stage, `${nn}-${i.slug.replace(`${date}-`, '')}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(mp4, join(dir, `${nn}-${i.slug.replace(`${date}-`, '')}.mp4`));
  copyFileSync(cover, join(dir, 'cover.png'));
  writeFileSync(join(dir, 'captions.txt'), `${i.title}\n\n${readFileSync(caption, 'utf8').trim()}\n`);
  const frame = join(stage, `frame-${nn}.png`);
  // One frame per Reel, taken when the table / chart is complete (7 s of 10), with the idea number in the corner.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '7', '-i', mp4, '-frames:v', '1', '-vf', `scale=270:480,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${i.ideaId}':x=8:y=8:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`, frame]);
  frames.push(frame);
}
if (missing.length) console.warn(`not packaged (no MP4/cover/caption yet): ${missing.join(', ')}`);

const sheet = join(reports, `${date}-concept-reels-overzicht.png`);
const cols = 7;
const rows = Math.ceil(frames.length / cols);
const list = join(stage, 'frames.txt');
writeFileSync(list, frames.map((f) => `file '${f}'\nduration 1`).join('\n') + '\n');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `tile=${cols}x${rows}:padding=10:margin=10:color=0x0B1F17`, '-frames:v', '1', sheet]);

const zip = join(reports, `${date}-concept-reels.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', 'frame-*.png', 'frames.txt'], { cwd: stage });
console.log(`${frames.length} Reels in ${zip.replace(REPO_DIR + '/', '')}\ncontact sheet: ${sheet.replace(REPO_DIR + '/', '')}`);
