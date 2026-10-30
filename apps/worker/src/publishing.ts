import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { WorkflowError, WorkflowService, isEmergencyStopActive, sha256File } from '@rj/content-engine';
import { REPO_ROOT, type Repository } from '@rj/database';
import { InstagramGraphAdapter, PublishAmbiguousError, redact } from '@rj/integrations';
import { type ActorId, type ContentIdea, type Publication, type VideoAsset, captionHash as hashCaption, newId } from '@rj/shared';
import { enqueueJob } from './queue.js';
import { NonRetryableError, type JobHandler } from './runner.js';

/*
 * Phase 5 publishing. Two routes, both strictly behind a valid owner G5:
 *  - manual (default, always works): export a publish package, the owner posts it by hand and records the URL;
 *  - live Instagram (InstagramGraphAdapter): only with RJ_PUBLISH_MODE=instagram + RJ_INTEGRATIONS_LIVE=1 +
 *    credentials + RJ_PUBLIC_MEDIA_BASE_URL + the owner's live consent. UNTESTED against the real Meta API.
 * Nothing here approves a gate, edits a stage directly or posts a file whose hash differs from the approval.
 */

export const PUBLISH_PLATFORM = 'instagram';
export const PACKAGE_FILES = ['video.mp4', 'cover.png', 'caption.txt', 'hashtags.txt', 'schedule.txt', 'manifest.json'] as const;
export type PackageFile = (typeof PACKAGE_FILES)[number];
const SLUG = /^[A-Za-z0-9][\w.-]*$/;
export const INSTAGRAM_REEL_URL = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]{5,40}\/?(\?[A-Za-z0-9_=&.%-]*)?$/;

export interface PublishConfig {
  mode: 'manual' | 'instagram';
  dailyCap: number;
  minSpacingMin: number;
  publicBaseUrl: string | null;
  maxAttempts: number;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`);
  return n;
}

export function loadPublishConfig(env: NodeJS.ProcessEnv = process.env): PublishConfig {
  return {
    mode: env.RJ_PUBLISH_MODE === 'instagram' ? 'instagram' : 'manual',
    dailyCap: Math.floor(num(env, 'RJ_DAILY_PUBLISH_CAP', 10)),
    minSpacingMin: num(env, 'RJ_PUBLISH_MIN_SPACING_MIN', 60),
    publicBaseUrl: env.RJ_PUBLIC_MEDIA_BASE_URL?.trim() || null,
    maxAttempts: Math.floor(num(env, 'RJ_PUBLISH_MAX_ATTEMPTS', 3)),
  };
}

export interface PublishDeps {
  repo: Repository;
  workflow: WorkflowService;
  env: NodeJS.ProcessEnv;
  root: string;
  now: () => Date;
  /** Injected in tests (mock transport); default: built from env. */
  adapter?: InstagramGraphAdapter;
  /** Returns the sha256 of the bytes served at a public URL (live mode only; injected in tests). */
  hostedHash?: (url: string) => Promise<string>;
}

export function makeDeps(repo: Repository, options: Partial<PublishDeps> = {}): PublishDeps {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  return { repo, workflow: options.workflow ?? new WorkflowService(repo, { env, now }), env, root: options.root ?? REPO_ROOT, now, adapter: options.adapter, hostedHash: options.hostedHash };
}

// ------------------------------------------------------------------ helpers

function underRoot(root: string, p: string): string {
  const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rootReal = existsSync(root) ? realpathSync(root) : resolve(root);
  const real = existsSync(abs) ? realpathSync(abs) : abs;
  if (real !== rootReal && !real.startsWith(rootReal + sep)) throw new NonRetryableError('video path is outside the repository');
  return real;
}

export function slugOf(deps: PublishDeps, item: ContentIdea, asset: VideoAsset | null): string {
  const fromAsset = asset ? basename(asset.path).replace(/\.mp4$/i, '') : null;
  const slug = fromAsset && SLUG.test(fromAsset) ? fromAsset : null;
  if (!slug) throw new NonRetryableError(`cannot derive a safe slug for ${item.id}`);
  return slug;
}

export function extractHashtags(caption: string): string[] {
  return [...new Set(caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

/** Next 18:00 Europe/Amsterdam strictly after `from` (a suggestion only). */
export function suggestedTime(from: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' });
  for (let day = 0; day < 3; day++) {
    for (const utcHour of [16, 17]) {
      const c = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + day, utcHour, 0, 0));
      if (fmt.format(c) === '18' && c.getTime() > from.getTime()) return c;
    }
  }
  return new Date(from.getTime() + 24 * 3_600_000);
}

async function audit(deps: PublishDeps, contentId: string | null, actorId: string, reason: string, details: Record<string, unknown>): Promise<void> {
  await deps.repo.auditLog.insert({ id: newId('al'), contentId, action: 'publication', fromStage: null, toStage: null, actorId, reason: redact(reason, [], deps.env), details: details as never, createdAt: deps.now().toISOString() });
}

async function errorLog(deps: PublishDeps, contentId: string | null, jobId: string | null, message: string, details: Record<string, unknown> = {}): Promise<void> {
  await deps.repo.errorLogs.insert({ id: newId('err'), scope: 'publish', contentId, jobId, message: redact(message, [], deps.env), details: details as never, createdAt: deps.now().toISOString() });
}

// ------------------------------------------------------------------ binding verification

export interface Binding {
  ok: boolean;
  reasons: string[];
  item: ContentIdea | null;
  asset: VideoAsset | null;
  filePath: string | null;
  assetSha256: string | null;
  captionHash: string | null;
  approvalId: string | null;
}

/**
 * Recomputes the sha256 of the video file on disk and the caption hash, and requires a valid owner G5
 * bound to exactly those hashes (and equal to the item's current hashes and, if given, the publication's).
 */
export async function verifyBinding(deps: PublishDeps, contentId: string, publication?: Publication | null): Promise<Binding> {
  const reasons: string[] = [];
  const empty: Binding = { ok: false, reasons, item: null, asset: null, filePath: null, assetSha256: null, captionHash: null, approvalId: null };
  const item = await deps.repo.contentItems.get(contentId);
  if (!item) return { ...empty, reasons: ['content item not found'] };
  const asset = item.currentVideoAssetId ? await deps.repo.videoAssets.get(item.currentVideoAssetId) : null;
  const out: Binding = { ...empty, item, asset };
  if (!asset || !item.currentAssetSha256) reasons.push('no current video asset');
  if (item.captionText === null || item.captionHash === null) reasons.push('no caption');
  if (reasons.length) return out;
  let filePath: string;
  try {
    filePath = underRoot(deps.root, asset!.path);
  } catch (e) {
    return { ...out, reasons: [(e as Error).message] };
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return { ...out, reasons: ['the video file is missing on disk'] };
  const fileSha = await sha256File(filePath);
  const capHash = hashCaption(item.captionText!);
  out.filePath = filePath;
  out.assetSha256 = fileSha;
  out.captionHash = capHash;
  if (fileSha !== item.currentAssetSha256) reasons.push('video file on disk differs from the approved asset (re-rendered or edited after approval)');
  if (capHash !== item.captionHash) reasons.push('caption differs from the approved caption hash');
  if (publication && (publication.videoAssetSha256 !== fileSha || publication.captionHash !== capHash)) reasons.push('publication record does not match the current file/caption');
  const g5 = await deps.workflow.gateStatus(contentId);
  if (!g5.G5.satisfied) reasons.push(`G5: ${g5.G5.reason}`);
  // Independent check of the approval row itself (defence in depth: do not trust gate state alone).
  const approvals = await deps.repo.approvals.list({ contentId, gate: 'G5', status: 'valid', decision: 'approved' });
  const match = approvals.find((a) => a.actorId === 'owner' && a.assetSha256 === fileSha && a.captionHash === capHash && a.invalidatedAt === null);
  if (!match) reasons.push('no valid owner G5 approval for exactly this video hash and caption hash');
  else out.approvalId = match.id;
  if (publication && match && publication.approvalId !== match.id && !approvals.some((a) => a.id === publication.approvalId && a.actorId === 'owner' && a.assetSha256 === fileSha && a.captionHash === capHash))
    reasons.push('publication is bound to a different approval than a current owner G5');
  out.ok = reasons.length === 0;
  return out;
}

// ------------------------------------------------------------------ package export / verify

export interface Manifest {
  version: 1;
  contentId: string;
  slug: string;
  title: string;
  platform: string;
  video: { file: 'video.mp4'; sha256: string; bytes: number };
  cover: { file: 'cover.png'; sha256: string } | null;
  caption: { file: 'caption.txt'; hash: string };
  hashtags: string[];
  suggestedTime: string;
  scheduledAt: string | null;
  g5ApprovalId: string;
  createdAt: string;
  note: string;
}

export const packageDir = (root: string, slug: string) => join(root, 'output', 'publish', slug);

/** Builds output/publish/<slug>/ for an item with a valid G5. Refuses otherwise. */
export async function exportPackage(deps: PublishDeps, contentId: string): Promise<{ dir: string; manifest: Manifest }> {
  const item = await deps.repo.contentItems.get(contentId);
  if (!item) throw new WorkflowError('NOT_FOUND', 'Content item not found');
  if (!['APPROVED_FOR_PUBLISHING', 'SCHEDULED', 'PUBLISHED'].includes(item.stage)) throw new WorkflowError('GATE_NOT_SATISFIED', `Stage ${item.stage}: a publish package needs owner approval (APPROVED_FOR_PUBLISHING or later)`);
  const pub = await deps.repo.publications.first({ contentId, status: { op: 'in', value: ['scheduled', 'published'] } }, { orderBy: 'createdAt', desc: true });
  const b = await verifyBinding(deps, contentId);
  if (!b.ok || !b.asset || !b.filePath || !b.assetSha256 || !b.captionHash || !b.approvalId) throw new WorkflowError('GATE_NOT_SATISFIED', `Publish package refused: ${b.reasons.join('; ')}`, { reasons: b.reasons });
  const slug = slugOf(deps, item, b.asset);
  const dir = packageDir(deps.root, slug);
  mkdirSync(dir, { recursive: true });
  for (const f of PACKAGE_FILES) rmSync(join(dir, f), { force: true });
  copyFileSync(b.filePath, join(dir, 'video.mp4'));
  const copiedSha = await sha256File(join(dir, 'video.mp4'));
  if (copiedSha !== b.assetSha256) {
    rmSync(dir, { recursive: true, force: true });
    throw new WorkflowError('BINDING_MISMATCH', 'Copied video hash differs from the approved hash (file changed during export)');
  }
  const coverSrc = join(deps.root, 'output', 'covers', `${slug}.png`);
  let cover: Manifest['cover'] = null;
  if (existsSync(coverSrc)) {
    copyFileSync(coverSrc, join(dir, 'cover.png'));
    cover = { file: 'cover.png', sha256: await sha256File(join(dir, 'cover.png')) };
  }
  const caption = item.captionText!;
  const tags = extractHashtags(caption);
  const when = pub?.scheduledAt ?? suggestedTime(deps.now()).toISOString();
  writeFileSync(join(dir, 'caption.txt'), caption);
  writeFileSync(join(dir, 'hashtags.txt'), tags.join(' ') + '\n');
  const local = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'full', timeStyle: 'short' }).format(new Date(when));
  writeFileSync(join(dir, 'schedule.txt'), `${pub?.scheduledAt ? 'Ingepland' : 'Voorgestelde tijd'}: ${local} (Europe/Amsterdam)\nISO: ${when}\n`);
  const manifest: Manifest = {
    version: 1,
    contentId,
    slug,
    title: item.title,
    platform: PUBLISH_PLATFORM,
    video: { file: 'video.mp4', sha256: copiedSha, bytes: statSync(join(dir, 'video.mp4')).size },
    cover,
    caption: { file: 'caption.txt', hash: b.captionHash },
    hashtags: tags,
    suggestedTime: when,
    scheduledAt: pub?.scheduledAt ?? null,
    g5ApprovalId: b.approvalId,
    createdAt: deps.now().toISOString(),
    note: 'Post exactly these files. Verify with: npm run publish -- verify <contentId>. Any change to video or caption invalidates the owner approval (G5).',
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await audit(deps, contentId, 'distribution-manager', `publish package exported to output/publish/${slug}`, { event: 'package_exported', slug, videoSha256: copiedSha, captionHash: b.captionHash, approvalId: b.approvalId });
  return { dir, manifest };
}

export function findManifest(root: string, contentId: string): { dir: string; manifest: Manifest } | null {
  const base = join(root, 'output', 'publish');
  if (!existsSync(base)) return null;
  for (const slug of readdirSync(base)) {
    const mp = join(base, slug, 'manifest.json');
    if (!SLUG.test(slug) || !existsSync(mp)) continue;
    try {
      const m = JSON.parse(readFileSync(mp, 'utf8')) as Manifest;
      if (m.contentId === contentId) return { dir: join(base, slug), manifest: m };
    } catch {
      /* unreadable manifest */
    }
  }
  return null;
}

export interface PackageVerification {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  reasons: string[];
}

/** Recomputes the package hashes and refuses if G5 is missing or stale. */
export async function verifyPackage(deps: PublishDeps, contentId: string): Promise<PackageVerification> {
  const checks: PackageVerification['checks'] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const found = findManifest(deps.root, contentId);
  if (!found) {
    add('manifest', false, 'no publish package for this item (run: npm run publish -- export <contentId>)');
    return { ok: false, checks, reasons: [checks[0]!.detail] };
  }
  const { dir, manifest } = found;
  const vp = join(dir, 'video.mp4');
  const cp = join(dir, 'caption.txt');
  const videoSha = existsSync(vp) ? await sha256File(vp) : null;
  add('video sha256', videoSha === manifest.video.sha256, videoSha ? `${videoSha.slice(0, 12)} vs manifest ${manifest.video.sha256.slice(0, 12)}` : 'video.mp4 missing');
  const capHash = existsSync(cp) ? hashCaption(readFileSync(cp, 'utf8')) : null;
  add('caption hash', capHash === manifest.caption.hash, capHash ? `${capHash.slice(0, 12)} vs manifest ${manifest.caption.hash.slice(0, 12)}` : 'caption.txt missing');
  if (manifest.cover) {
    const cov = join(dir, 'cover.png');
    add('cover sha256', existsSync(cov) && (await sha256File(cov)) === manifest.cover.sha256, 'cover.png');
  }
  const item = await deps.repo.contentItems.get(contentId);
  add('item exists', !!item, item ? item.stage : 'not found');
  if (item) {
    add('package matches current asset', item.currentAssetSha256 === manifest.video.sha256, 'item asset hash vs package');
    add('package matches current caption', item.captionHash === manifest.caption.hash, 'item caption hash vs package');
    const g5 = await deps.workflow.gateStatus(contentId);
    add('G5 valid (owner, current hashes)', g5.G5.satisfied, g5.G5.reason);
    const ap = await deps.repo.approvals.get(manifest.g5ApprovalId);
    add('manifest approval is a valid owner G5', !!ap && ap.gate === 'G5' && ap.actorId === 'owner' && ap.decision === 'approved' && ap.status === 'valid' && ap.assetSha256 === manifest.video.sha256 && ap.captionHash === manifest.caption.hash, ap ? `${ap.id} ${ap.status}` : 'approval not found');
  }
  const reasons = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  return { ok: reasons.length === 0, checks, reasons };
}

// ------------------------------------------------------------------ staging + live consent

export interface Staged {
  stagedAt: string;
  reason: string;
}
export const stagedKey = (publicationId: string) => `publish_staged:${publicationId}`;
export async function getStaged(repo: Repository, publicationId: string): Promise<Staged | null> {
  return repo.getConfig<Staged>(stagedKey(publicationId));
}

export async function setLiveConsent(deps: PublishDeps, on: boolean, actorId: string): Promise<void> {
  if (actorId !== 'owner') throw new WorkflowError('NOT_AUTHORIZED', 'Only the owner can switch live Instagram publishing on or off');
  await deps.repo.setConfig('publish_live_consent', { on, at: deps.now().toISOString() }, actorId);
  await audit(deps, null, actorId, `live publishing consent ${on ? 'ON' : 'OFF'}`, { event: 'live_consent', on });
}
export async function hasLiveConsent(repo: Repository): Promise<boolean> {
  return (await repo.getConfig<{ on?: boolean }>('publish_live_consent'))?.on === true;
}

// ------------------------------------------------------------------ guards

async function isDuplicateHash(deps: PublishDeps, pub: Publication): Promise<string | null> {
  const same = await deps.repo.publications.list({ videoAssetSha256: pub.videoAssetSha256 });
  for (const o of same) {
    if (o.id === pub.id) continue;
    if (o.status === 'published') return `asset hash already published (${o.id}${o.url ? ` ${o.url}` : ''})`;
    if (o.status === 'scheduled' && (await getStaged(deps.repo, o.id))) return `asset hash already staged for manual posting (${o.id})`;
  }
  if (pub.contentId) {
    const mine = await deps.repo.publications.list({ contentId: pub.contentId, status: 'published' });
    if (mine.some((o) => o.id !== pub.id)) return 'this content item was already published';
  }
  return null;
}

/** Publications published or staged within the last 24 h (rolling) with their timestamp. */
async function recentActivity(deps: PublishDeps, excludeId: string): Promise<Date[]> {
  const since = deps.now().getTime() - 24 * 3_600_000;
  const out: Date[] = [];
  for (const p of await deps.repo.publications.list({ status: { op: 'in', value: ['published', 'scheduled'] } })) {
    if (p.id === excludeId) continue;
    let at: string | null = null;
    if (p.status === 'published') at = p.publishedAt;
    else at = (await getStaged(deps.repo, p.id))?.stagedAt ?? null;
    if (at && Date.parse(at) > since) out.push(new Date(at));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export interface Capacity {
  usedLast24h: number;
  dailyCap: number;
  lastAt: string | null;
  nextAllowedAt: string | null;
}
export async function publishCapacity(deps: PublishDeps, excludeId = ''): Promise<Capacity> {
  const cfg = loadPublishConfig(deps.env);
  const recent = await recentActivity(deps, excludeId);
  const last = recent.at(-1) ?? null;
  const spacingEnd = last ? new Date(last.getTime() + cfg.minSpacingMin * 60_000) : null;
  const capEnd = recent.length >= cfg.dailyCap && cfg.dailyCap > 0 ? new Date(recent[recent.length - cfg.dailyCap]!.getTime() + 24 * 3_600_000) : null;
  const next = [spacingEnd, capEnd].filter((d): d is Date => !!d && d.getTime() > deps.now().getTime()).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { usedLast24h: recent.length, dailyCap: cfg.dailyCap, lastAt: last?.toISOString() ?? null, nextAllowedAt: next?.toISOString() ?? null };
}

// ------------------------------------------------------------------ manual published

/** The owner posted the package by hand: validates the URL, re-checks G5 and records the post. */
export async function markManualPublished(deps: PublishDeps, contentId: string, url: string, actorId = 'owner'): Promise<Publication> {
  const clean = url.trim();
  if (!INSTAGRAM_REEL_URL.test(clean)) throw new WorkflowError('INVALID_INPUT', 'URL must look like https://www.instagram.com/reel/<code>/');
  const pub = await deps.repo.publications.first({ contentId, status: 'scheduled' }, { orderBy: 'createdAt', desc: true });
  if (!pub) throw new WorkflowError('NOT_FOUND', 'No scheduled publication for this item: schedule it first');
  const b = await verifyBinding(deps, contentId, pub);
  if (!b.ok) throw new WorkflowError('BINDING_MISMATCH', `Not recorded: ${b.reasons.join('; ')}`, { reasons: b.reasons });
  const dup = await isDuplicateHash(deps, pub);
  if (dup) throw new WorkflowError('ALREADY_PUBLISHED', `Duplicate post guard: ${dup}`);
  const code = /\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/.exec(clean)![1]!;
  const done = await deps.workflow.markPublished(contentId, { publicationId: pub.id, externalId: `manual:${code}`, url: clean }, actorId);
  await audit(deps, contentId, actorId, 'manually published; URL recorded', { event: 'manual_published', publicationId: pub.id, url: clean });
  return done;
}

// ------------------------------------------------------------------ publish_due

export type DueOutcome =
  | { outcome: 'published'; publicationId: string; externalId: string; url: string | null }
  | { outcome: 'staged'; publicationId: string; note: string }
  | { outcome: 'deferred'; publicationId: string; reason: string; retryAt: string | null }
  | { outcome: 'skipped'; publicationId: string; reason: string };

async function failPublication(deps: PublishDeps, pub: Publication, reason: string, jobId: string | null): Promise<never> {
  await deps.repo.publications.update(pub.id, { status: 'failed', updatedAt: deps.now().toISOString() });
  await audit(deps, pub.contentId, 'distribution-manager', `publication ${pub.id} not published: ${reason}`, { event: 'refused', publicationId: pub.id, reason });
  await errorLog(deps, pub.contentId, jobId, `publication ${pub.id} refused: ${reason}`, { publicationId: pub.id });
  throw new NonRetryableError(reason);
}

/**
 * Processes one due publication. Throws NonRetryableError for refusals (the Publication is marked failed and an
 * ErrorLog row is written), other errors are retried by the worker (cap: job maxAttempts), and the worker writes
 * the ErrorLog when the cap is reached. Deferrals (caps, spacing, emergency stop) return `deferred`.
 */
export async function processDuePublication(deps: PublishDeps, publicationId: string, jobId: string | null = null): Promise<DueOutcome> {
  const cfg = loadPublishConfig(deps.env);
  const pub = await deps.repo.publications.get(publicationId);
  if (!pub) throw new NonRetryableError('publication not found');
  if (pub.status !== 'scheduled') return { outcome: 'skipped', publicationId, reason: `publication is ${pub.status}` };
  if (!pub.scheduledAt || Date.parse(pub.scheduledAt) > deps.now().getTime()) return { outcome: 'deferred', publicationId, reason: 'not due yet', retryAt: pub.scheduledAt };
  if (await isEmergencyStopActive(deps.repo, deps.env)) return { outcome: 'deferred', publicationId, reason: 'emergency stop active', retryAt: null };
  const item = await deps.repo.contentItems.get(pub.contentId);
  if (!item || item.stage !== 'SCHEDULED') return failPublication(deps, pub, `item is not SCHEDULED (stage ${item?.stage ?? 'missing'})`, jobId);

  const b = await verifyBinding(deps, pub.contentId, pub);
  if (!b.ok) return failPublication(deps, pub, `approval/hash check failed: ${b.reasons.join('; ')}`, jobId);
  const dup = await isDuplicateHash(deps, pub);
  if (dup) return failPublication(deps, pub, `duplicate post guard: ${dup}`, jobId);

  const cap = await publishCapacity(deps, pub.id);
  if (cfg.dailyCap === 0 || cap.usedLast24h >= cfg.dailyCap) return { outcome: 'deferred', publicationId, reason: `daily publish cap reached (${cap.usedLast24h}/${cfg.dailyCap} in 24 h)`, retryAt: cap.nextAllowedAt };
  if (cap.nextAllowedAt) return { outcome: 'deferred', publicationId, reason: `minimum spacing ${cfg.minSpacingMin} min since the last post`, retryAt: cap.nextAllowedAt };

  const adapter = deps.adapter ?? new InstagramGraphAdapter({ env: deps.env });
  const live = cfg.mode === 'instagram' && adapter.mode === 'live' && (await hasLiveConsent(deps.repo)) && !!cfg.publicBaseUrl;
  const slug = slugOf(deps, item, b.asset);

  if (!live) {
    await exportPackage(deps, pub.contentId);
    const why = cfg.mode !== 'instagram' ? 'manual mode' : adapter.mode !== 'live' ? 'live adapter not enabled (mock/disabled)' : !cfg.publicBaseUrl ? 'RJ_PUBLIC_MEDIA_BASE_URL not set' : 'owner has not enabled live publishing';
    await deps.repo.setConfig(stagedKey(pub.id), { stagedAt: deps.now().toISOString(), reason: why } satisfies Staged, 'distribution-manager');
    await audit(deps, pub.contentId, 'distribution-manager', `staged for manual posting (${why})`, { event: 'staged', publicationId: pub.id, slug });
    return { outcome: 'staged', publicationId, note: why };
  }

  // Live: the hosted bytes must be exactly the approved file.
  const videoUrl = `${cfg.publicBaseUrl!.replace(/\/+$/, '')}/${encodeURIComponent(slug)}/video.mp4`;
  const hash = deps.hostedHash ?? defaultHostedHash;
  let hosted: string;
  try {
    hosted = await hash(videoUrl);
  } catch (e) {
    throw new Error(`hosted video not reachable: ${redact((e as Error).message, [], deps.env)}`); // retryable
  }
  if (hosted !== b.assetSha256) return failPublication(deps, pub, 'the hosted video differs from the approved video hash (upload the exact package file)', jobId);
  try {
    const r = await adapter.publishReel({ videoUrl, caption: item.captionText!, ownerConfirmed: true });
    if (r.mode !== 'live') return failPublication(deps, pub, 'adapter returned a mock result in live mode; not recorded as published', jobId);
    try {
      await deps.workflow.markPublished(pub.contentId, { publicationId: pub.id, externalId: r.mediaId, url: r.permalink }, 'distribution-manager');
    } catch (e) {
      await errorLog(deps, pub.contentId, jobId, `POSTED on Instagram (media ${r.mediaId}) but recording failed: ${(e as Error).message}`, { publicationId: pub.id, mediaId: r.mediaId });
      throw new NonRetryableError(`posted (media ${r.mediaId}) but could not be recorded: ${(e as Error).message}`);
    }
    await audit(deps, pub.contentId, 'distribution-manager', 'published via Instagram API', { event: 'published', publicationId: pub.id, mediaId: r.mediaId, url: r.permalink });
    return { outcome: 'published', publicationId, externalId: r.mediaId, url: r.permalink };
  } catch (e) {
    if (e instanceof NonRetryableError) throw e;
    if (e instanceof PublishAmbiguousError) return failPublication(deps, pub, `${e.message} (container ${e.containerId}); do NOT retry before checking the account`, jobId);
    throw e;
  }
}

async function defaultHostedHash(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('hosted URL must be https');
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 300 * 1024 * 1024) throw new Error('hosted file too large');
  return createHash('sha256').update(buf).digest('hex');
}

// ------------------------------------------------------------------ job wiring

export function createPublishDueHandler(options: Partial<PublishDeps> = {}): JobHandler {
  return async ({ job, repo, env, now }) => {
    const publicationId = (job.payload as { publicationId?: string } | null)?.publicationId;
    if (!publicationId) throw new NonRetryableError('payload.publicationId is required');
    const deps = makeDeps(repo, { ...options, env: options.env ?? env, now: options.now ?? now });
    const result = await processDuePublication(deps, publicationId, job.id);
    return { result };
  };
}

/**
 * Enqueues one publish_due job per due scheduled publication (key: publish_due:<contentId>:<scheduledAt>).
 * A job that finished as `deferred` is re-queued under the same key, so a slot is never processed twice
 * but a deferral is retried.
 */
export async function enqueueDuePublications(deps: PublishDeps): Promise<{ created: number; requeued: number; items: string[] }> {
  const due = await deps.repo.publications.list({ status: 'scheduled', scheduledAt: { op: 'lte', value: deps.now().toISOString() } }, { orderBy: 'scheduledAt' });
  const cfg = loadPublishConfig(deps.env);
  let created = 0;
  let requeued = 0;
  const items: string[] = [];
  for (const p of due) {
    const key = `publish_due:${p.contentId}:${p.scheduledAt}`;
    const { job, created: isNew } = await enqueueJob(deps.repo, { type: 'publish_due', idempotencyKey: key, contentId: p.contentId, payload: { publicationId: p.id }, maxAttempts: cfg.maxAttempts, estimatedCostCents: 0 }, deps.env);
    if (isNew) created++;
    else if (job.status === 'succeeded' && (job.result as { outcome?: string } | null)?.outcome === 'deferred') {
      await deps.repo.jobs.update(job.id, { status: 'queued', attempts: 0, lastError: null, runAfter: deps.now().toISOString(), finishedAt: null });
      requeued++;
    } else continue;
    items.push(p.contentId);
  }
  return { created, requeued, items };
}
