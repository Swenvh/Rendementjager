/**
 * npm run stories -- build [--ids 1,2,3] [--ideas content/ideas/2026-10-30-15-ideeen.json] [--date 2026-10-31]
 *
 * Instagram Story frames (1080x1920 PNG stills) for the ideas sheet: per idea Vraag -> Antwoord -> Reel-teaser (one posting
 * sequence) plus a standalone Quick fact. Output: output/stories/<idea-slug>/NN-<kind>.png + stickers.txt, then (full build) the zip
 * output/reports/<date>-stories.zip, the contact sheet <date>-stories-overzicht.png and docs/STORIES.md (7-day schedule).
 * Numbers come from the claims of the ideas sheet (@rj/finance-engine); the build fails on a forbidden name/phrase, an unknown number
 * or text that does not fit (Story media check, like Template D). Nothing is published; stickers and links are added in the app.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import { resolveLogo } from '@rj/brand';
import { evaluateRef, ideasDocumentSchema } from '@rj/content-ideas';
import { arg, positional } from './lib/args.js';
import { findBrowserExecutable } from './lib/browser.js';
import { getBundle } from './lib/bundle.js';
import { ASSETS_BRAND, REPO_DIR } from './lib/paths.js';
import { resolveBackground } from './lib/prepare.js';
import { syncStaticAssets } from './copy-fonts.js';
import { KIND_FILE } from '../src/stories/layout.js';
import { buildAllStorySets, setProblems, type StorySet } from '../src/stories/spec.js';

const command = positional()[0] ?? 'build';
if (command !== 'build') {
  console.error('Usage: npm run stories -- build [--ids 1,2,3] [--ideas <file>] [--date YYYY-MM-DD]');
  process.exit(1);
}
const date = arg('date') ?? '2026-10-31';
const ideasFile = join(REPO_DIR, arg('ideas') ?? 'content/ideas/2026-10-30-15-ideeen.json');
const ids = arg('ids')?.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
const outDir = join(REPO_DIR, 'output', 'stories');
const reports = join(REPO_DIR, 'output', 'reports');

const doc = ideasDocumentSchema.parse(JSON.parse(readFileSync(ideasFile, 'utf8')));
const sets = buildAllStorySets(doc, ids);
if (!sets.length) throw new Error(`no stories to build (ids: ${ids?.join(',') ?? 'all'}; idea 14 has no data and is skipped)`);

// 1. Text and number checks before any rendering.
const problems = sets.flatMap((s) => setProblems(doc.ideas.find((i) => i.id === s.ideaId)!, s, evaluateRef).map((p) => `idea ${s.ideaId}: ${p}`));
if (problems.length) {
  console.error(`Story checks failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// 2. Background: a still from the licensed footage when clips exist (DroneBackground), else the animated dark-green fallback.
syncStaticAssets();
const bg = resolveBackground('stories', 5000, undefined);
console.log(`background: ${bg.info.mode}${bg.props ? '' : ` (${(bg.info as { reason?: string }).reason ?? ''})`}`);
const withBg = buildAllStorySets(doc, ids).map((s) => ({ ...s, frames: s.frames.map((f) => ({ ...f, props: { ...f.props, background: bg.props } })) }));

// 3. Render. A failing media check (text that does not fit, content in the safe zones or the sticker band) fails the build.
const serveUrl = await getBundle();
const browserExecutable = findBrowserExecutable();
const brandLogoFile = resolveLogo((f) => existsSync(join(ASSETS_BRAND, f))).file;
const jobs = withBg.flatMap((s) => s.frames.map((f) => ({ set: s, frame: f, out: join(outDir, s.slug, `${String(f.order).padStart(2, '0')}-${KIND_FILE[f.kind]}.png`) })));
for (const s of withBg) rmSync(join(outDir, s.slug), { recursive: true, force: true });
let done = 0;
const CONCURRENCY = 3;
for (let i = 0; i < jobs.length; i += CONCURRENCY) {
  await Promise.all(
    jobs.slice(i, i + CONCURRENCY).map(async (j) => {
      mkdirSync(join(outDir, j.set.slug), { recursive: true });
      const inputProps = { ...j.frame.props, brandLogoFile };
      const composition = await selectComposition({ serveUrl, id: 'Story', inputProps, browserExecutable });
      await renderStill({ serveUrl, composition, inputProps, frame: 0, output: j.out, imageFormat: 'png', browserExecutable, overwrite: true });
      done++;
    }),
  );
  process.stdout.write(`\rrendered ${done}/${jobs.length}`);
}
console.log('');

// 4. Sticker suggestions per sequence.
for (const s of withBg) writeFileSync(join(outDir, s.slug, 'stickers.txt'), stickersTxt(s));

function stickersTxt(s: StorySet): string {
  return [
    `Idee ${s.ideaId}: ${s.title}`,
    `Volgorde: 01-vraag, 02-antwoord, 03-reel-teaser (reeks). 04-quick-fact staat los.`,
    `Alle stickers voeg je zelf toe in Instagram, in de lege band (ongeveer 300 px hoog, onder het midden). Er staat geen nep-sticker of link op de afbeeldingen.`,
    '',
    ...s.stickers.lines,
    '',
  ].join('\n');
}

if (ids) {
  console.log(`partial build (--ids ${ids.join(',')}): ${relative(REPO_DIR, outDir)}; zip, contact sheet and schedule are made by a full build`);
  process.exit(0);
}

// 5. Schedule, contact sheet, zip.
const schedule = scheduleMd(withBg);
writeFileSync(join(REPO_DIR, 'docs', 'STORIES.md'), schedule);
mkdirSync(reports, { recursive: true });
const stage = join(REPO_DIR, 'output', 'tmp', `${date}-stories`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const thumbs: string[] = [];
for (const s of withBg) {
  mkdirSync(join(stage, s.slug), { recursive: true });
  for (const f of s.frames) {
    const name = `${String(f.order).padStart(2, '0')}-${KIND_FILE[f.kind]}.png`;
    copyFileSync(join(outDir, s.slug, name), join(stage, s.slug, name));
  }
  copyFileSync(join(outDir, s.slug, 'stickers.txt'), join(stage, s.slug, 'stickers.txt'));
}
writeFileSync(join(stage, `${date}-stories-schema.md`), schedule);
for (const s of withBg) {
  for (const f of s.frames) {
    const thumb = join(stage, `thumb-${String(s.ideaId).padStart(2, '0')}-${f.order}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(outDir, s.slug, `${String(f.order).padStart(2, '0')}-${KIND_FILE[f.kind]}.png`), '-vf', `scale=216:384,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${s.ideaId}.${f.order}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5`, thumb]);
    thumbs.push(thumb);
  }
}
const sheet = join(reports, `${date}-stories-overzicht.png`);
const cols = 8;
const list = join(stage, 'thumbs.txt');
writeFileSync(list, thumbs.map((f) => `file '${f}'\nduration 1`).join('\n') + '\n');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `tile=${cols}x${Math.ceil(thumbs.length / cols)}:padding=10:margin=10:color=0x0B1F17`, '-frames:v', '1', sheet]);
const zip = join(reports, `${date}-stories.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', 'thumb-*.png', 'thumbs.txt'], { cwd: stage });
console.log(`${jobs.length} frames, ${withBg.length} sequences\nzip: ${relative(REPO_DIR, zip)}\ncontact sheet: ${relative(REPO_DIR, sheet)}\nschedule: docs/STORIES.md`);

function scheduleMd(all: StorySet[]): string {
  const byId = new Map(all.map((s) => [s.ideaId, s]));
  const week1 = [9, 2, 4, 6, 3, 15, 13].filter((i) => byId.has(i));
  const rest = all.map((s) => s.ideaId).filter((i) => !week1.includes(i));
  const row = (day: number, a: StorySet, b?: StorySet) =>
    `| ${day} | ${a.ideaId}. ${a.title} | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | ${b ? `${b.ideaId}. ${b.title}` : '-'} |`;
  const table = (seq: number[], facts: number[]) =>
    [
      '| Dag | Reeks (idee) | Ochtend | Middag | Avond | Tussendoor: quick fact (los) |',
      '| --- | --- | --- | --- | --- | --- |',
      ...seq.map((id, i) => row(i + 1, byId.get(id)!, byId.get(facts[i] ?? -1))),
    ].join('\n');
  return `# Instagram Stories: set en 7-dagen-schema

Gegenereerd door \`npm run stories -- build\` (video-engine). Alles is concept: niets is gepubliceerd of ingepland. De eigenaar plaatst de Stories zelf in de app.

## Wat zit erin

Per idee (14 van de 15; idee 14 heeft nog geen data) vier beelden van 1080x1920, in \`output/stories/<idee-slug>/\`:

- \`01-vraag.png\`: de vraag, het antwoord staat er niet op (een groot vraagteken).
- \`02-antwoord.png\`: het echte getal, met label Hypothetisch of Rekenvoorbeeld.
- \`03-reel-teaser.png\`: "Nieuw: zie de Reel", zonder link (de link-sticker plaats je zelf, pas als de Reel live staat).
- \`04-quick-fact.png\`: een los feit met één groot getal (staat los van de reeks).
- \`stickers.txt\`: poll-, quiz-, slider- en vragen-tekst om in te typen.

Reeks = 01, 02 en 03 achter elkaar. Alle getallen komen uit \`@rj/finance-engine\` via de claims in \`content/ideas/2026-10-30-15-ideeen.json\`; geen andere accounts' namen, geen verboden zinnen, voetregel op elk beeld: "Rekenvoorbeeld, geen garantie of advies."

## Veilige zones en stickerruimte

- Boven 250 px en onder 250 px staat niets belangrijks (profielbalk en antwoordbalk van Instagram). Het logo met @rendementjager staat net onder 250 px.
- Tussen ongeveer y 1290 en y 1590 (300 px, onder het midden) is bewust niets getekend: daar zet je zelf een poll-, vragen-, quiz-, slider- of link-sticker.
- De build mislukt als tekst niet past, wordt afgekapt, kleiner wordt dan de minimale leesbare maat of in de veilige zones of de stickerband komt.

## Schema week 1 (voorstel, geen data over beste tijden)

${table(week1, rest)}

Elke dag: ochtend de vraag met een poll of quiz, middag het antwoord (laat de stemmen zien), avond de teaser nadat de Reel van die dag is gepubliceerd. Geen Reel gepubliceerd? Sla de teaser over. De quick fact plaats je op een rustig moment.

## Schema week 2 (rollen omgedraaid)

${table(rest, week1)}

## Afspraken

- Onderwijs, geen advies; de opties in polls zijn gokjes, geen verwachtingen.
- De ideeën zijn nog niet door de vijf gates; de eigenaar beslist wat live gaat. Niets wordt automatisch gepubliceerd.
- Opnieuw bouwen: \`npm run stories -- build\` (alles) of \`npm run stories -- build --ids 1,2,3\` (deel; zonder zip en schema).
`;
}
