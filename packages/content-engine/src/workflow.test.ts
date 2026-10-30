import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepository, type Repository } from '@rj/database';
import { captionHash, newId, nowIso, sha256 } from '@rj/shared';
import { WorkflowError, WorkflowService } from './index.js';

let repo: Repository;
let wf: WorkflowService;
const ASSET = sha256('video-v1');
const ASSET2 = sha256('video-v2');
const CAPTION = 'Wat doet €250 per maand? Aannames in de video. #geldincijfers';

beforeEach(() => {
  repo = createSqliteRepository(':memory:');
  wf = new WorkflowService(repo, { env: {} });
});
afterEach(async () => {
  await repo.close();
});

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof WorkflowError && e.code === code);
}

async function addBrief(contentId: string): Promise<void> {
  const now = nowIso();
  await repo.researchBriefs.insert({ id: newId('rb'), contentId, topic: 't', kind: 'evergreen', summary: 's', keyFacts: [], status: 'draft', createdBy: 'research-analyst', createdAt: now, updatedAt: now });
}

/** Drives a fresh item to the requested point using only legitimate calls. */
async function driveTo(point: 'SCRIPT_READY' | 'FACT_CHECK' | 'APPROVED_FOR_PRODUCTION' | 'QA_REVIEW' | 'READY_FOR_EDITOR' | 'APPROVED_FOR_PUBLISHING') {
  const item = await wf.createContentIdea({ title: `Test ${newId()}`, pillar: 'test', template: 'C' }, 'content-strategist');
  const id = item.id;
  await wf.transition(id, 'RESEARCHING', 'research-analyst', 'start');
  await addBrief(id);
  await wf.transition(id, 'RESEARCHED', 'research-analyst', 'brief done');
  await wf.recordApproval('G1', id, 'content-strategist');
  await wf.transition(id, 'SCRIPTING', 'editorial-copywriter', 'write');
  const rev = await wf.addScriptRevision(id, { hook: 'Hook', body: 'Body', cta: 'Volg voor meer' }, 'editorial-copywriter');
  await wf.transition(id, 'SCRIPT_READY', 'editorial-copywriter', 'v1 klaar');
  if (point === 'SCRIPT_READY') return { id, rev };
  await wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: rev.id });
  await wf.transition(id, 'FACT_CHECK', 'content-strategist', 'naar factcheck');
  if (point === 'FACT_CHECK') return { id, rev };
  await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id });
  await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
  await wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'cijfers kloppen');
  if (point === 'APPROVED_FOR_PRODUCTION') return { id, rev };
  await wf.transition(id, 'AUDIO_GENERATING', 'voice-producer', 'tts');
  await wf.transition(id, 'RENDERING', 'video-engineer', 'render');
  await wf.setVideoAsset(id, { path: 'output/reels/x.mp4', sha256: ASSET }, 'video-engineer');
  await wf.transition(id, 'RENDERED', 'video-engineer', 'done');
  await wf.transition(id, 'QA_REVIEW', 'qa-engineer', 'qa');
  if (point === 'QA_REVIEW') return { id, rev };
  await wf.recordApproval('G4', id, 'qa-engineer', { assetSha256: ASSET });
  await wf.transition(id, 'READY_FOR_EDITOR', 'qa-engineer', 'qa ok');
  await wf.setCaption(id, CAPTION, 'distribution-manager');
  if (point === 'READY_FOR_EDITOR') return { id, rev };
  await wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET, captionHash: captionHash(CAPTION) });
  await wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'goedgekeurd');
  return { id, rev };
}

describe('transition map', () => {
  it('allows the happy path end-to-end and logs every step', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    const pub = await wf.schedulePublication(id, { platform: 'instagram', scheduledAt: '2026-11-01T18:00:00.000Z', assetSha256: ASSET, captionText: CAPTION }, 'distribution-manager');
    expect((await repo.contentItems.get(id))!.stage).toBe('SCHEDULED');
    const done = await wf.markPublished(id, { publicationId: pub.id, externalId: 'ig_123' }, 'distribution-manager');
    expect(done.status).toBe('published');
    expect((await repo.contentItems.get(id))!.stage).toBe('PUBLISHED');
    const log = await wf.getAuditLog(id);
    const transitions = log.filter((l) => l.action === 'transition').map((l) => l.toStage);
    expect(transitions).toEqual([
      'IDEA', 'RESEARCHING', 'RESEARCHED', 'SCRIPTING', 'SCRIPT_READY', 'FACT_CHECK', 'APPROVED_FOR_PRODUCTION',
      'AUDIO_GENERATING', 'RENDERING', 'RENDERED', 'QA_REVIEW', 'READY_FOR_EDITOR', 'APPROVED_FOR_PUBLISHING', 'SCHEDULED', 'PUBLISHED',
    ]);
    for (const l of log) {
      expect(l.actorId).toBeTruthy();
      expect(l.createdAt).toMatch(/^\d{4}-/);
      expect(l.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects skipping stages and logs the denied attempt', async () => {
    const item = await wf.createContentIdea({ title: 'Skip', pillar: 'p' }, 'content-strategist');
    await expectCode(wf.transition(item.id, 'PUBLISHED', 'owner', 'yolo'), 'INVALID_TRANSITION');
    await expectCode(wf.transition(item.id, 'SCRIPTING', 'owner', 'skip'), 'INVALID_TRANSITION');
    const denied = (await wf.getAuditLog(item.id)).filter((l) => l.action === 'transition_denied');
    expect(denied).toHaveLength(2);
    expect((await repo.contentItems.get(item.id))!.stage).toBe('IDEA');
  });

  it('requires a reason, a known actor and a known stage', async () => {
    const item = await wf.createContentIdea({ title: 'Val', pillar: 'p' }, 'content-strategist');
    await expectCode(wf.transition(item.id, 'RESEARCHING', 'research-analyst', '  '), 'INVALID_INPUT');
    await expectCode(wf.transition(item.id, 'RESEARCHING', 'hacker', 'x'), 'INVALID_ACTOR');
    await expectCode(wf.transition(item.id, 'NOPE' as never, 'owner', 'x'), 'INVALID_INPUT');
    await expectCode(wf.transition('missing', 'RESEARCHING', 'owner', 'x'), 'NOT_FOUND');
  });

  it('dedupes topics on create', async () => {
    await wf.createContentIdea({ title: 'Wat is een ETF?', pillar: 'p' }, 'content-strategist');
    await expectCode(wf.createContentIdea({ title: 'wat is een etf', pillar: 'p' }, 'content-strategist'), 'DUPLICATE_TOPIC');
  });
});

describe('gates', () => {
  it('G1 needs a research brief and an allowed approver', async () => {
    const item = await wf.createContentIdea({ title: 'G1', pillar: 'p' }, 'content-strategist');
    await wf.transition(item.id, 'RESEARCHING', 'research-analyst', 'r');
    await wf.transition(item.id, 'RESEARCHED', 'research-analyst', 'r');
    await expectCode(wf.recordApproval('G1', item.id, 'content-strategist'), 'INVALID_INPUT');
    await addBrief(item.id);
    await expectCode(wf.recordApproval('G1', item.id, 'video-engineer'), 'NOT_AUTHORIZED');
    await expectCode(wf.transition(item.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
    await wf.recordApproval('G1', item.id, 'content-strategist');
    await wf.transition(item.id, 'SCRIPTING', 'editorial-copywriter', 'go');
  });

  it('G2/G3 must name the CURRENT script revision', async () => {
    const { id, rev } = await driveTo('SCRIPT_READY');
    await expectCode(wf.recordApproval('G2', id, 'content-strategist'), 'INVALID_INPUT');
    await expectCode(wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: 'sr_fake' }), 'BINDING_MISMATCH');
    await expectCode(wf.transition(id, 'FACT_CHECK', 'content-strategist', 'x'), 'GATE_NOT_SATISFIED');
    await wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: rev.id });
    await wf.transition(id, 'FACT_CHECK', 'content-strategist', 'x');
  });

  it('fact-checker may not be the script author (separation of duties)', async () => {
    const item = await wf.createContentIdea({ title: 'Self', pillar: 'p' }, 'content-strategist');
    const rev = await wf.addScriptRevision(item.id, { hook: 'h', body: 'b' }, 'fact-checker');
    await expectCode(wf.recordApproval('G3', item.id, 'fact-checker', { scriptRevisionId: rev.id }), 'SELF_REVIEW');
    const denied = (await wf.getAuditLog(item.id)).filter((l) => l.action === 'approval_denied');
    expect(denied).toHaveLength(1);
  });

  it('G3 needs both fact-check and compliance (or owner)', async () => {
    const { id, rev } = await driveTo('FACT_CHECK');
    await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id });
    await expectCode(wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'x'), 'GATE_NOT_SATISFIED');
    await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
    await wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'x');
  });

  it('a G3 rejection blocks the gate and moves the item to REVISION_REQUIRED', async () => {
    const { id, rev } = await driveTo('FACT_CHECK');
    await expectCode(wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id, decision: 'rejected' }), 'INVALID_INPUT');
    await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
    await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id, decision: 'rejected', notes: 'rendement 7% zonder bron' });
    expect((await repo.contentItems.get(id))!.stage).toBe('REVISION_REQUIRED');
    expect((await wf.gateStatus(id)).G3.satisfied).toBe(false);
  });

  it('only the owner can grant G5, bound to asset + caption hash', async () => {
    const { id } = await driveTo('READY_FOR_EDITOR');
    const cap = captionHash(CAPTION);
    for (const actor of ['chief-of-staff', 'distribution-manager', 'qa-engineer', 'system', 'worker']) {
      await expectCode(wf.recordApproval('G5', id, actor, { assetSha256: ASSET, captionHash: cap }), 'NOT_AUTHORIZED');
    }
    await expectCode(wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET2, captionHash: cap }), 'BINDING_MISMATCH');
    await expectCode(wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET, captionHash: captionHash('ander') }), 'BINDING_MISMATCH');
    await expectCode(wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET }), 'INVALID_INPUT');
    await expectCode(wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'x'), 'GATE_NOT_SATISFIED');
    await wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET, captionHash: cap });
    await wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'x');
  });
});

describe('invalidation', () => {
  it('script change after G3 invalidates G2 and G3 (and blocks production)', async () => {
    const { id } = await driveTo('APPROVED_FOR_PRODUCTION');
    const v2 = await wf.addScriptRevision(id, { hook: 'Hook 2', body: 'Body 2' }, 'editorial-copywriter');
    expect(v2.version).toBe(2);
    const g = await wf.gateStatus(id);
    expect(g.G2.satisfied).toBe(false);
    expect(g.G3.satisfied).toBe(false);
    expect(g.G1.satisfied).toBe(true);
    const inv = await repo.approvals.list({ contentId: id, status: 'invalidated' });
    expect(inv.map((a) => a.gate).sort()).toEqual(['G2', 'G3', 'G3']);
    await expectCode(wf.transition(id, 'AUDIO_GENERATING', 'voice-producer', 'x'), 'GATE_NOT_SATISFIED');
    // all revisions kept
    const revs = await repo.scriptRevisions.list({ contentId: id }, { orderBy: 'version' });
    expect(revs.map((r) => r.version)).toEqual([1, 2]);
    expect(revs[0]!.body).toBe('Body');
  });

  it('asset change after G5 invalidates G4/G5, demotes to QA_REVIEW and cancels the schedule', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    const pub = await wf.schedulePublication(id, { platform: 'instagram', scheduledAt: '2026-11-01T18:00:00Z', assetSha256: ASSET, captionText: CAPTION }, 'distribution-manager');
    await wf.setVideoAsset(id, { path: 'output/reels/x2.mp4', sha256: ASSET2 }, 'video-engineer');
    const item = (await repo.contentItems.get(id))!;
    expect(item.stage).toBe('QA_REVIEW');
    expect(item.scheduledAt).toBeNull();
    expect((await repo.publications.get(pub.id))!.status).toBe('cancelled');
    const g = await wf.gateStatus(id);
    expect(g.G4.satisfied).toBe(false);
    expect(g.G5.satisfied).toBe(false);
    await expectCode(wf.markPublished(id, { publicationId: pub.id }, 'distribution-manager'), 'BINDING_MISMATCH');
  });

  it('caption change after G5 invalidates G5 only', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    await wf.setCaption(id, CAPTION + ' extra', 'distribution-manager');
    expect((await repo.contentItems.get(id))!.stage).toBe('READY_FOR_EDITOR');
    const g = await wf.gateStatus(id);
    expect(g.G5.satisfied).toBe(false);
    expect(g.G4.satisfied).toBe(true);
    await expectCode(wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'x'), 'GATE_NOT_SATISFIED');
  });

  it('whitespace-only caption edit keeps G5', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    await wf.setCaption(id, `  ${CAPTION}  `, 'distribution-manager');
    expect((await wf.gateStatus(id)).G5.satisfied).toBe(true);
  });

  it('re-approving an old asset hash after a new render is not enough', async () => {
    const { id } = await driveTo('READY_FOR_EDITOR');
    await wf.setVideoAsset(id, { path: 'b.mp4', sha256: ASSET2 }, 'video-engineer');
    await expectCode(wf.recordApproval('G5', id, 'owner', { assetSha256: ASSET, captionHash: captionHash(CAPTION) }), 'BINDING_MISMATCH');
  });
});

describe('publishing bypass attempts', () => {
  it('cannot schedule without G5', async () => {
    const { id } = await driveTo('READY_FOR_EDITOR');
    await expectCode(wf.transition(id, 'SCHEDULED', 'owner', 'x'), 'INVALID_TRANSITION');
    await expectCode(
      wf.schedulePublication(id, { platform: 'ig', scheduledAt: '2026-11-01T18:00:00Z', assetSha256: ASSET, captionText: CAPTION }, 'distribution-manager'),
      'INVALID_TRANSITION',
    );
  });

  it('cannot schedule a different file than the approved one (hash recomputed from file)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rj-wf-'));
    try {
      const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
      const file = join(dir, 'other.mp4');
      writeFileSync(file, 'not the approved video');
      await expectCode(
        wf.schedulePublication(id, { platform: 'ig', scheduledAt: '2026-11-01T18:00:00Z', filePath: file, captionText: CAPTION }, 'distribution-manager'),
        'BINDING_MISMATCH',
      );
      const good = join(dir, 'good.mp4');
      writeFileSync(good, 'video-v1');
      const pub = await wf.schedulePublication(id, { platform: 'ig', scheduledAt: '2026-11-01T18:00:00Z', filePath: good, captionText: CAPTION }, 'distribution-manager');
      expect(pub.videoAssetSha256).toBe(ASSET);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cannot schedule a different caption', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    await expectCode(
      wf.schedulePublication(id, { platform: 'ig', scheduledAt: '2026-11-01T18:00:00Z', assetSha256: ASSET, captionText: 'Koop nu!' }, 'distribution-manager'),
      'BINDING_MISMATCH',
    );
  });

  it('non-publishing actors cannot schedule even with G5', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    await expectCode(wf.transition(id, 'SCHEDULED', 'video-engineer', 'x'), 'NOT_AUTHORIZED');
    await expectCode(wf.transition(id, 'PUBLISHED', 'worker', 'x'), 'NOT_AUTHORIZED');
  });

  it('a G5 row inserted by a non-owner directly in the DB does not count', async () => {
    const { id } = await driveTo('READY_FOR_EDITOR');
    await repo.approvals.insert({
      id: newId('ap'), contentId: id, gate: 'G5', actorId: 'chief-of-staff', decision: 'approved', status: 'valid',
      scriptRevisionId: null, assetSha256: ASSET, captionHash: captionHash(CAPTION), notes: 'forged', createdAt: nowIso(), invalidatedAt: null, invalidationReason: null,
    });
    await expectCode(wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'x'), 'GATE_NOT_SATISFIED');
  });

  it('published content cannot change script, asset or caption', async () => {
    const { id } = await driveTo('APPROVED_FOR_PUBLISHING');
    await wf.transition(id, 'PUBLISHED', 'owner', 'handmatig gepost');
    await expectCode(wf.setCaption(id, 'nieuw', 'owner'), 'ALREADY_PUBLISHED');
    await expectCode(wf.setVideoAsset(id, { path: 'c.mp4', sha256: ASSET2 }, 'owner'), 'ALREADY_PUBLISHED');
    await expectCode(wf.addScriptRevision(id, { hook: 'h', body: 'b' }, 'owner'), 'ALREADY_PUBLISHED');
  });
});

describe('emergency stop', () => {
  it('blocks transitions except to FAILED/ARCHIVED; only owner lifts it', async () => {
    const item = await wf.createContentIdea({ title: 'Stop', pillar: 'p' }, 'content-strategist');
    await wf.setEmergencyStop(true, 'chief-of-staff', 'kosten lopen op');
    await expectCode(wf.transition(item.id, 'RESEARCHING', 'research-analyst', 'x'), 'EMERGENCY_STOP');
    await expectCode(wf.setEmergencyStop(false, 'chief-of-staff', 'klaar'), 'NOT_AUTHORIZED');
    await wf.transition(item.id, 'FAILED', 'chief-of-staff', 'gestopt');
    await wf.transition(item.id, 'ARCHIVED', 'chief-of-staff', 'archief');
    await wf.setEmergencyStop(false, 'owner', 'opgelost');
    await wf.transition(item.id, 'IDEA', 'owner', 'terug');
  });

  it('env RJ_EMERGENCY_STOP=1 also blocks', async () => {
    const stopped = new WorkflowService(repo, { env: { RJ_EMERGENCY_STOP: '1' } });
    const item = await stopped.createContentIdea({ title: 'Env stop', pillar: 'p' }, 'content-strategist');
    await expectCode(stopped.transition(item.id, 'RESEARCHING', 'research-analyst', 'x'), 'EMERGENCY_STOP');
    expect((await stopped.canTransition(item.id, 'FAILED', 'owner')).allowed).toBe(true);
  });
});
