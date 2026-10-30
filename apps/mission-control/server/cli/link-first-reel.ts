/**
 * npm run link-first-reel -w @rj/mission-control
 *
 * Links the seeded IDEA item "Wat doet €250 per maand beleggen over 30 jaar?" to the files that
 * already exist on disk: the rendered MP4 (real sha256 computed here), its cover, and the caption
 * from content/scripts/<slug>/caption.md. Goes through WorkflowService (setVideoAsset, setCaption)
 * so everything is audited. It does NOT approve any gate and does NOT change the stage: the item
 * stays honest (IDEA, no G1–G5) until the real research, review and owner approval happen.
 * Idempotent: re-running with unchanged files changes nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256File, WorkflowService } from '@rj/content-engine';
import { openRepository, REPO_ROOT } from '@rj/database';
import { captionHash, newId, topicHash } from '@rj/shared';

// Optional first argument: another content slug (title read from content/scripts/<slug>/metadata.json).
const SLUG = process.argv[2] ?? '2026-10-23-250-per-maand-30-jaar';
const TITLE =
  process.argv[2] === undefined
    ? 'Wat doet €250 per maand beleggen over 30 jaar?'
    : (JSON.parse(readFileSync(join(REPO_ROOT, 'content', 'scripts', SLUG, 'metadata.json'), 'utf8')) as { title: string }).title;
const ACTOR = 'chief-of-staff';

const video = join(REPO_ROOT, 'output', 'reels', `${SLUG}.mp4`);
const cover = join(REPO_ROOT, 'output', 'covers', `${SLUG}.png`);
const captionFile = join(REPO_ROOT, 'content', 'scripts', SLUG, 'caption.md');
const qaFile = join(REPO_ROOT, 'output', 'reels', `${SLUG}.qa.json`);

const repo = openRepository();
const wf = new WorkflowService(repo);
try {
  const item = await repo.contentItems.first({ topicHash: topicHash(TITLE) });
  if (!item) throw new Error(`Seeded item "${TITLE}" not found: run npm run db:seed first`);
  if (!existsSync(video)) throw new Error(`Missing ${relative(REPO_ROOT, video)}`);

  const sha = await sha256File(video);
  const qa = existsSync(qaFile) ? (JSON.parse(readFileSync(qaFile, 'utf8')) as { video?: { width?: number; height?: number; durationS?: number } }) : null;
  let assetId = item.currentVideoAssetId;
  if (item.currentAssetSha256 !== sha) {
    const asset = await wf.setVideoAsset(
      item.id,
      {
        path: relative(REPO_ROOT, video),
        sha256: sha,
        durationMs: qa?.video?.durationS ? Math.round(qa.video.durationS * 1000) : null,
        width: qa?.video?.width ?? null,
        height: qa?.video?.height ?? null,
      },
      ACTOR,
    );
    assetId = asset.id;
    console.log(`video asset registered: ${asset.id} sha256 ${sha}`);
  } else console.log(`video asset already current (sha256 ${sha})`);

  if (existsSync(cover) && assetId) {
    const coverSha = await sha256File(cover);
    const existing = await repo.thumbnailAssets.first({ contentId: item.id, sha256: coverSha });
    if (!existing) {
      await repo.thumbnailAssets.insert({ id: newId('th'), contentId: item.id, videoAssetId: assetId, path: relative(REPO_ROOT, cover), sha256: coverSha, createdAt: new Date().toISOString() });
      console.log(`cover registered: sha256 ${coverSha}`);
    } else console.log('cover already registered');
  }

  if (existsSync(captionFile)) {
    const caption = readFileSync(captionFile, 'utf8').trim();
    const fresh = (await repo.contentItems.get(item.id))!;
    if (fresh.captionHash !== captionHash(caption)) {
      await wf.setCaption(item.id, caption, ACTOR);
      console.log(`caption set from ${relative(REPO_ROOT, captionFile)} (hash ${captionHash(caption)})`);
    } else console.log('caption already current');
  }

  const final = (await repo.contentItems.get(item.id))!;
  const gates = await wf.gateStatus(item.id);
  console.log(`stage ${final.stage} (unchanged); gates satisfied: ${Object.values(gates).filter((g) => g.satisfied).map((g) => g.gate).join(', ') || 'none'}`);
} finally {
  await repo.close();
}
