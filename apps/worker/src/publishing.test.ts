import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowService } from '@rj/content-engine';
import { createSqliteRepository, type Repository } from '@rj/database';
import { InstagramGraphAdapter, type FetchLike } from '@rj/integrations';
import { captionHash, newId, nowIso, sha256 } from '@rj/shared';
import { Worker } from './runner.js';
import { registerDefaultHandlers } from './handlers/index.js';
import { enqueueDuePublications, exportPackage, findManifest, hasLiveConsent, makeDeps, markManualPublished, processDuePublication, publishCapacity, setLiveConsent, verifyBinding, verifyPackage, type PublishDeps } from './publishing.js';

const NOW = new Date('2026-11-02T18:30:00.000Z');
const DUE = '2026-11-02T18:00:00.000Z';
const CAPTION = 'Wat doet €250 per maand? Hypothetisch voorbeeld, geen advies. #beleggen #renteoprente';
const TOKEN = 'IGAAtokenSECRET1234567890abcdefXYZ';

let dir: string;
let repo: Repository;
let wf: WorkflowService;
let env: NodeJS.ProcessEnv;
let deps: PublishDeps;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rj-publish-'));
  mkdirSync(join(dir, 'output', 'reels'), { recursive: true });
  mkdirSync(join(dir, 'output', 'covers'), { recursive: true });
  repo = createSqliteRepository(':memory:');
  env = {};
  wf = new WorkflowService(repo, { env, now: () => NOW });
  deps = makeDeps(repo, { env, root: dir, now: () => NOW, workflow: wf });
});
afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});

const reel = (slug: string) => join(dir, 'output', 'reels', `${slug}.mp4`);

/** Fixture item driven to APPROVED_FOR_PUBLISHING through legitimate calls (temp DB + temp files only). */
async function approvedItem(slug: string, bytes = `video-${slug}`, caption = CAPTION) {
  writeFileSync(reel(slug), bytes);
  writeFileSync(join(dir, 'output', 'covers', `${slug}.png`), `cover-${slug}`);
  const sha = sha256(bytes);
  const item = await wf.createContentIdea({ title: `Test ${slug} ${newId()}`, pillar: 'test', template: 'C' }, 'content-strategist');
  const id = item.id;
  await wf.transition(id, 'RESEARCHING', 'research-analyst', 'start');
  const now = nowIso();
  await repo.researchBriefs.insert({ id: newId('rb'), contentId: id, topic: 't', kind: 'evergreen', summary: 's', keyFacts: [], status: 'draft', createdBy: 'research-analyst', createdAt: now, updatedAt: now });
  await wf.transition(id, 'RESEARCHED', 'research-analyst', 'brief');
  await wf.recordApproval('G1', id, 'content-strategist');
  await wf.transition(id, 'SCRIPTING', 'editorial-copywriter', 'write');
  const rev = await wf.addScriptRevision(id, { hook: 'Hook', body: 'Body', cta: 'Volg' }, 'editorial-copywriter');
  await wf.transition(id, 'SCRIPT_READY', 'editorial-copywriter', 'klaar');
  await wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: rev.id });
  await wf.transition(id, 'FACT_CHECK', 'content-strategist', 'fc');
  await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id });
  await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
  await wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'ok');
  await wf.transition(id, 'AUDIO_GENERATING', 'voice-producer', 'tts');
  await wf.transition(id, 'RENDERING', 'video-engineer', 'render');
  await wf.setVideoAsset(id, { path: `output/reels/${slug}.mp4`, sha256: sha }, 'video-engineer');
  await wf.transition(id, 'RENDERED', 'video-engineer', 'done');
  await wf.transition(id, 'QA_REVIEW', 'qa-engineer', 'qa');
  await wf.recordApproval('G4', id, 'qa-engineer', { assetSha256: sha });
  await wf.transition(id, 'READY_FOR_EDITOR', 'qa-engineer', 'ok');
  await wf.setCaption(id, caption, 'distribution-manager');
  await wf.recordApproval('G5', id, 'owner', { assetSha256: sha, captionHash: captionHash(caption) });
  await wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'goedgekeurd');
  return { id, sha, slug };
}

async function schedule(id: string, at = DUE) {
  const item = (await repo.contentItems.get(id))!;
  const asset = (await repo.videoAssets.get(item.currentVideoAssetId!))!;
  return wf.schedulePublication(id, { platform: 'instagram', scheduledAt: at, filePath: join(dir, asset.path), captionText: item.captionText! }, 'owner');
}

const due = async (pubId: string, d = deps) => processDuePublication(d, pubId);
const withEnv = (extra: NodeJS.ProcessEnv, extraDeps: Partial<PublishDeps> = {}) => makeDeps(repo, { env: { ...env, ...extra }, root: dir, now: () => NOW, workflow: wf, ...extraDeps });

describe('publish package (manual fallback)', () => {
  it('exports video, cover, caption, hashtags, schedule and a manifest that verifies', async () => {
    const { id, sha } = await approvedItem('a');
    const { dir: pdir, manifest } = await exportPackage(deps, id);
    for (const f of ['video.mp4', 'cover.png', 'caption.txt', 'hashtags.txt', 'schedule.txt', 'manifest.json']) expect(existsSync(join(pdir, f))).toBe(true);
    expect(manifest.video.sha256).toBe(sha);
    expect(manifest.caption.hash).toBe(captionHash(CAPTION));
    expect(manifest.hashtags).toEqual(['#beleggen', '#renteoprente']);
    expect(readFileSync(join(pdir, 'caption.txt'), 'utf8')).toBe(CAPTION);
    expect((await repo.approvals.get(manifest.g5ApprovalId))!.actorId).toBe('owner');
    expect(findManifest(dir, id)!.manifest.slug).toBe('a');
    expect((await verifyPackage(deps, id)).ok).toBe(true);
  });

  it('refuses to export before G5, and verify refuses a tampered package', async () => {
    const item = await wf.createContentIdea({ title: 'Nog niet goedgekeurd', pillar: 'p' }, 'content-strategist');
    await expect(exportPackage(deps, item.id)).rejects.toThrow(/owner approval/);
    const { id } = await approvedItem('b');
    const { dir: pdir } = await exportPackage(deps, id);
    writeFileSync(join(pdir, 'video.mp4'), 'tampered');
    const v = await verifyPackage(deps, id);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/video sha256/);
    writeFileSync(join(pdir, 'video.mp4'), 'video-b');
    writeFileSync(join(pdir, 'caption.txt'), CAPTION + ' koop nu!');
    expect((await verifyPackage(deps, id)).reasons.join(' ')).toMatch(/caption hash/);
  });

  it('verify refuses when G5 became stale (caption changed after export)', async () => {
    const { id } = await approvedItem('c');
    await exportPackage(deps, id);
    await wf.setCaption(id, CAPTION + ' extra', 'distribution-manager');
    const v = await verifyPackage(deps, id);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/G5/);
    await expect(exportPackage(deps, id)).rejects.toThrow();
  });

  it('verify refuses when no package or no G5 exists', async () => {
    const { id } = await approvedItem('d');
    expect((await verifyPackage(deps, id)).ok).toBe(false);
    await exportPackage(deps, id);
    const g5 = (await repo.approvals.list({ contentId: id, gate: 'G5' }))[0]!;
    await repo.approvals.update(g5.id, { status: 'invalidated', invalidatedAt: nowIso(), invalidationReason: 'test' });
    expect((await verifyPackage(deps, id)).ok).toBe(false);
  });
});

describe('manual publishing flow', () => {
  it('due item is staged (not published), then the owner records a validated Instagram URL', async () => {
    const { id } = await approvedItem('m1');
    const pub = await schedule(id);
    const r = await due(pub.id);
    expect(r.outcome).toBe('staged');
    expect((await repo.contentItems.get(id))!.stage).toBe('SCHEDULED');
    expect(existsSync(join(dir, 'output', 'publish', 'm1', 'manifest.json'))).toBe(true);
    for (const bad of ['http://instagram.com/reel/ABCDE12345/', 'https://evil.com/reel/ABCDE12345/', 'https://instagram.com.evil.com/reel/ABCDE12345/', 'https://www.instagram.com/reel/', 'javascript:alert(1)', 'https://www.instagram.com/reel/ab/?x=<script>'])
      await expect(markManualPublished(deps, id, bad)).rejects.toThrow(/URL must look like/);
    const done = await markManualPublished(deps, id, 'https://www.instagram.com/reel/C9xYz_12AB/');
    expect(done.status).toBe('published');
    expect(done.url).toBe('https://www.instagram.com/reel/C9xYz_12AB/');
    expect((await repo.contentItems.get(id))!.stage).toBe('PUBLISHED');
    expect((await repo.auditLog.list({ contentId: id, action: 'publication' })).some((l) => (l.details as { event?: string }).event === 'manual_published')).toBe(true);
  });

  it('manual publish re-checks G5: stale file is refused', async () => {
    const { id } = await approvedItem('m2');
    await schedule(id);
    writeFileSync(reel('m2'), 'swapped-after-approval');
    await expect(markManualPublished(deps, id, 'https://www.instagram.com/reel/C9xYz_12AB/')).rejects.toThrow(/differs from the approved/);
    expect((await repo.contentItems.get(id))!.stage).toBe('SCHEDULED');
  });
});

describe('bypass attempts', () => {
  it('file re-rendered on disk after approval (stale hash): refused, publication failed, ErrorLog written', async () => {
    const { id } = await approvedItem('s1');
    const pub = await schedule(id);
    writeFileSync(reel('s1'), 'different-bytes');
    await expect(due(pub.id)).rejects.toThrow(/differs from the approved asset/);
    expect((await repo.publications.get(pub.id))!.status).toBe('failed');
    expect((await repo.errorLogs.list({ scope: 'publish' })).length).toBe(1);
    expect((await repo.contentItems.get(id))!.stage).toBe('SCHEDULED');
  });

  it('re-render through the engine after scheduling cancels the slot; nothing is published', async () => {
    const { id } = await approvedItem('s2');
    const pub = await schedule(id);
    writeFileSync(reel('s2'), 'v2');
    await wf.setVideoAsset(id, { path: 'output/reels/s2.mp4', sha256: sha256('v2') }, 'video-engineer');
    expect((await due(pub.id)).outcome).toBe('skipped');
    expect((await repo.contentItems.get(id))!.stage).not.toBe('SCHEDULED');
  });

  it('caption changed after approval: no publish, no staging', async () => {
    const { id } = await approvedItem('s3');
    const pub = await schedule(id);
    await wf.setCaption(id, CAPTION + ' nieuw', 'distribution-manager');
    expect((await due(pub.id)).outcome).toBe('skipped');
    // direct DB tampering (text changed, hash left alone) is caught by recomputing the hash
    const id2 = (await approvedItem('s3b')).id;
    const pub2 = await schedule(id2);
    await repo.contentItems.update(id2, { captionText: 'Koop nu dit fonds! Gegarandeerd 20%' });
    await expect(due(pub2.id)).rejects.toThrow(/caption differs/);
  });

  it('no G5 / invalidated G5 / G5 recorded by another actor are all refused', async () => {
    const a = await approvedItem('g1');
    const pubA = await schedule(a.id);
    const g5a = (await repo.approvals.list({ contentId: a.id, gate: 'G5' }))[0]!;
    await repo.approvals.update(g5a.id, { status: 'invalidated', invalidatedAt: nowIso(), invalidationReason: 'tamper test' });
    await expect(due(pubA.id)).rejects.toThrow(/G5/);

    const b = await approvedItem('g2');
    const pubB = await schedule(b.id);
    const g5b = (await repo.approvals.list({ contentId: b.id, gate: 'G5' }))[0]!;
    await repo.approvals.update(g5b.id, { actorId: 'chief-of-staff' });
    const bind = await verifyBinding(deps, b.id, pubB);
    expect(bind.ok).toBe(false);
    await expect(due(pubB.id)).rejects.toThrow(/G5|owner/);
    expect((await repo.publications.get(pubB.id))!.status).toBe('failed');
  });

  it('emergency stop defers everything', async () => {
    const { id } = await approvedItem('e1');
    const pub = await schedule(id);
    await wf.setEmergencyStop(true, 'owner', 'test stop');
    const r = await due(pub.id);
    expect(r).toMatchObject({ outcome: 'deferred', reason: 'emergency stop active' });
    expect(existsSync(join(dir, 'output', 'publish', 'e1'))).toBe(false);
    const viaEnv = withEnv({ RJ_EMERGENCY_STOP: '1' });
    await wf.setEmergencyStop(false, 'owner', 'weer aan');
    expect((await due(pub.id, viaEnv)).outcome).toBe('deferred');
  });

  it('duplicate asset hash is never published twice', async () => {
    const first = await approvedItem('d1', 'same-bytes');
    const pub1 = await schedule(first.id);
    expect((await due(pub1.id)).outcome).toBe('staged');
    await markManualPublished(deps, first.id, 'https://www.instagram.com/reel/AAAAA11111/');
    const second = await approvedItem('d2', 'same-bytes');
    const pub2 = await schedule(second.id);
    await expect(due(pub2.id)).rejects.toThrow(/duplicate post guard/);
    expect((await repo.publications.get(pub2.id))!.status).toBe('failed');
  });

  it('duplicate of a staged (not yet posted) asset is also refused', async () => {
    const a = await approvedItem('d3', 'same2');
    const pa = await schedule(a.id);
    expect((await due(pa.id)).outcome).toBe('staged');
    const b = await approvedItem('d4', 'same2');
    const pb = await schedule(b.id);
    await expect(withEnv({ RJ_PUBLISH_MIN_SPACING_MIN: '0' }) && due(pb.id, withEnv({ RJ_PUBLISH_MIN_SPACING_MIN: '0' }))).rejects.toThrow(/duplicate/);
  });

  it('daily cap and minimum spacing defer, with a retry time', async () => {
    const a = await approvedItem('c1');
    const b = await approvedItem('c2');
    const pa = await schedule(a.id);
    const pb = await schedule(b.id, '2026-11-02T18:10:00.000Z');
    expect((await due(pa.id)).outcome).toBe('staged');
    const spaced = await due(pb.id);
    expect(spaced).toMatchObject({ outcome: 'deferred' });
    expect((spaced as { reason: string }).reason).toMatch(/spacing 60 min/);
    expect((spaced as { retryAt: string }).retryAt).toBe(new Date(NOW.getTime() + 60 * 60_000).toISOString());
    const capDeps = withEnv({ RJ_PUBLISH_MIN_SPACING_MIN: '0', RJ_DAILY_PUBLISH_CAP: '1' });
    const capped = await due(pb.id, capDeps);
    expect((capped as { reason: string }).reason).toMatch(/daily publish cap reached \(1\/1/);
    expect(await publishCapacity(capDeps)).toMatchObject({ usedLast24h: 1, dailyCap: 1 });
    const open = withEnv({ RJ_PUBLISH_MIN_SPACING_MIN: '0', RJ_DAILY_PUBLISH_CAP: '2' });
    expect((await due(pb.id, open)).outcome).toBe('staged');
  });

  it('only the owner may enable live publishing', async () => {
    await expect(setLiveConsent(deps, true, 'distribution-manager')).rejects.toThrow(/owner/);
    expect(await hasLiveConsent(repo)).toBe(false);
    await setLiveConsent(deps, true, 'owner');
    expect(await hasLiveConsent(repo)).toBe(true);
  });
});

describe('live adapter path (mock transport; real Meta API untested)', () => {
  const LIVE_ENV = { RJ_INTEGRATIONS_LIVE: '1', RJ_PUBLISH_MODE: 'instagram', RJ_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com/reels', INSTAGRAM_USER_ID: '17841400000000000', INSTAGRAM_ACCESS_TOKEN: TOKEN };

  function transport(responses: { status: number; body?: unknown }[]) {
    const calls: { url: string; body?: string }[] = [];
    const fn = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body });
      const r = responses.shift() ?? { status: 500, body: {} };
      return { ok: r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.body, text: async () => '' };
    }) as FetchLike;
    return { fn, calls };
  }
  const happy = () => transport([{ status: 200, body: { id: 'c1' } }, { status: 200, body: { status_code: 'FINISHED' } }, { status: 200, body: { id: 'm1' } }, { status: 200, body: { permalink: 'https://www.instagram.com/reel/LIVE123456/' } }]);
  const liveDeps = (t: ReturnType<typeof transport>, hosted: (u: string) => Promise<string>) =>
    withEnv(LIVE_ENV, { adapter: new InstagramGraphAdapter({ env: { ...env, ...LIVE_ENV }, fetch: t.fn }, { sleep: async () => {}, pollIntervalMs: 0, retry: { baseDelayMs: 1 } }), hostedHash: hosted });

  it('happy path: publishes exactly once and records post id + URL', async () => {
    const { id, sha } = await approvedItem('l1');
    const pub = await schedule(id);
    const t = happy();
    const d = liveDeps(t, async (u) => {
      expect(u).toBe('https://media.example.com/reels/l1/video.mp4');
      return sha;
    });
    await setLiveConsent(d, true, 'owner');
    const r = await due(pub.id, d);
    expect(r).toMatchObject({ outcome: 'published', externalId: 'm1', url: 'https://www.instagram.com/reel/LIVE123456/' });
    const row = (await repo.publications.get(pub.id))!;
    expect(row).toMatchObject({ status: 'published', externalId: 'm1', videoAssetSha256: sha });
    expect((await repo.contentItems.get(id))!.stage).toBe('PUBLISHED');
    expect(t.calls.filter((c) => c.url.endsWith('/media_publish'))).toHaveLength(1);
    expect((await due(pub.id, d)).outcome).toBe('skipped');
    expect(t.calls.filter((c) => c.url.endsWith('/media_publish'))).toHaveLength(1);
  });

  it('without the owner consent it stages instead of posting', async () => {
    const { id, sha } = await approvedItem('l2');
    const pub = await schedule(id);
    const t = happy();
    const r = await due(pub.id, liveDeps(t, async () => sha));
    expect(r.outcome).toBe('staged');
    expect(t.calls).toHaveLength(0);
  });

  it('hosted file that differs from the approved hash is refused before any API call', async () => {
    const { id } = await approvedItem('l3');
    const pub = await schedule(id);
    const t = happy();
    const d = liveDeps(t, async () => sha256('other'));
    await setLiveConsent(d, true, 'owner');
    await expect(due(pub.id, d)).rejects.toThrow(/hosted video differs/);
    expect(t.calls).toHaveLength(0);
  });

  it('ambiguous media_publish failure is not retried and not recorded as published', async () => {
    const { id, sha } = await approvedItem('l4');
    const pub = await schedule(id);
    const t = transport([{ status: 200, body: { id: 'c1' } }, { status: 200, body: { status_code: 'FINISHED' } }, { status: 503, body: {} }]);
    const d = liveDeps(t, async () => sha);
    await setLiveConsent(d, true, 'owner');
    await expect(due(pub.id, d)).rejects.toThrow(/outcome unknown|do NOT retry/);
    expect((await repo.publications.get(pub.id))!.status).toBe('failed');
    expect(t.calls.filter((c) => c.url.endsWith('/media_publish'))).toHaveLength(1);
    expect((await repo.errorLogs.list({ scope: 'publish' })).length).toBe(1);
  });

  it('secrets never reach errors, logs or audit rows', async () => {
    const { id } = await approvedItem('l5');
    const pub = await schedule(id);
    const d = liveDeps(happy(), async () => {
      throw new Error(`fetch failed for ${TOKEN}`);
    });
    await setLiveConsent(d, true, 'owner');
    const err = await due(pub.id, d).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(TOKEN);
    const dump = JSON.stringify([await repo.errorLogs.list(), await repo.auditLog.list(), await repo.publications.list()]);
    expect(dump).not.toContain(TOKEN);
  });
});

describe('publish_due job', () => {
  it('is idempotent per item + scheduled time and re-queues a deferral under the same key', async () => {
    const { id } = await approvedItem('j1');
    const pub = await schedule(id);
    const first = await enqueueDuePublications(deps);
    expect(first).toMatchObject({ created: 1, requeued: 0 });
    expect(await enqueueDuePublications(deps)).toMatchObject({ created: 0, requeued: 0 });
    const job = (await repo.jobs.list({ type: 'publish_due' }))[0]!;
    expect(job.idempotencyKey).toBe(`publish_due:${id}:${DUE}`);

    await wf.setEmergencyStop(true, 'owner', 'stop');
    const stopped = await registerDefaultHandlers(new Worker(repo, { env, now: () => NOW }), { publish: { root: dir, workflow: wf } }).runOnce();
    expect(stopped.emergencyStop).toBe(true);
    await wf.setEmergencyStop(false, 'owner', 'weer aan');

    const capEnv = { RJ_DAILY_PUBLISH_CAP: '0' };
    await registerDefaultHandlers(new Worker(repo, { env: capEnv, now: () => NOW }), { publish: { root: dir, workflow: wf } }).runOnce();
    expect((await repo.jobs.get(job.id))!.result).toMatchObject({ outcome: 'deferred' });
    expect(await enqueueDuePublications(deps)).toMatchObject({ created: 0, requeued: 1 });

    const ok = await registerDefaultHandlers(new Worker(repo, { env, now: () => NOW }), { publish: { root: dir, workflow: wf } }).runOnce();
    expect(ok.succeeded).toHaveLength(1);
    expect((await repo.jobs.get(job.id))!.result).toMatchObject({ outcome: 'staged' });
    expect(await enqueueDuePublications(deps)).toMatchObject({ created: 0, requeued: 0 });
    expect((await repo.publications.get(pub.id))!.status).toBe('scheduled');
  });

  it('a refusal fails the job (no silent failure) and logs an error', async () => {
    const { id } = await approvedItem('j2');
    await schedule(id);
    await enqueueDuePublications(deps);
    writeFileSync(reel('j2'), 'changed');
    const s = await registerDefaultHandlers(new Worker(repo, { env, now: () => NOW }), { publish: { root: dir, workflow: wf } }).runOnce();
    expect(s.failed).toHaveLength(1);
    expect((await repo.errorLogs.list()).length).toBeGreaterThanOrEqual(1);
    expect((await repo.contentItems.get(id))!.stage).toBe('SCHEDULED');
  });
});
