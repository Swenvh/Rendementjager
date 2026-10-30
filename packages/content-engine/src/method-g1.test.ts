import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepository, type Repository } from '@rj/database';
import { METHOD_BRIEFS, ResearchService, methodBriefTopic, type MethodKind } from '@rj/research-engine';
import { WorkflowError, WorkflowService, METHOD_G1_MARKER } from './index.js';

let repo: Repository;
let wf: WorkflowService;
let research: ResearchService;
beforeEach(async () => {
  repo = createSqliteRepository(':memory:');
  wf = new WorkflowService(repo, { env: {} });
  research = new ResearchService(repo);
  await research.ensureMethodBriefs();
});
afterEach(async () => repo.close());

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof WorkflowError && e.code === code);
}
async function seriesItem(kind: MethodKind, n: number) {
  const notes = JSON.stringify({ rj: 'series/1', tags: { kind }, params: {}, contentHash: `h${n}` });
  return wf.createContentIdea({ title: `Reeks ${kind} ${n}`, pillar: 'vermogensopbouw', template: 'C', series: kind, notes }, 'content-strategist');
}
async function ready(id: string) {
  await wf.transition(id, 'RESEARCHING', 'research-analyst', 'start');
  await wf.transition(id, 'RESEARCHED', 'research-analyst', 'methode');
}
async function brief(kind: MethodKind) {
  const m = (await research.getMethodBrief(kind))!;
  return { id: m.brief.id, hash: m.hash };
}
const ack = { acknowledgeUnverified: true };

describe('G1 for series items via an owner-approved method brief', () => {
  it('without owner approval, a series item cannot reach SCRIPTING', async () => {
    const it1 = await seriesItem('compounding', 1);
    await ready(it1.id);
    await expectCode(wf.transition(it1.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
  });

  it('one owner approval covers all items of the kind, and only that kind', async () => {
    const a = await seriesItem('compounding', 1);
    const b = await seriesItem('compounding', 2);
    const c = await seriesItem('cost', 1);
    for (const i of [a, b, c]) await ready(i.id);
    const br = await brief('compounding');
    const r = await wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner');
    expect(r.approvedItemIds.sort()).toEqual([a.id, b.id].sort());
    await wf.transition(a.id, 'SCRIPTING', 'editorial-copywriter', 'go');
    await wf.transition(b.id, 'SCRIPTING', 'editorial-copywriter', 'go');
    await expectCode(wf.transition(c.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
    expect((await repo.approvals.list({ contentId: a.id, gate: 'G1' }))[0]).toMatchObject({ actorId: 'owner', decision: 'approved' });
    expect((await repo.researchBriefs.get(br.id))!.status).toBe('approved');
    // idempotent: second call approves nothing new
    expect((await wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner')).approvedItemIds).toEqual([]);
  });

  it('every agent actor is refused (and audited); no approval row is written', async () => {
    const a = await seriesItem('inflation', 1);
    await ready(a.id);
    const br = await brief('inflation');
    for (const actor of ['chief-of-staff', 'content-strategist', 'research-analyst', 'fact-checker', 'system', 'worker'])
      await expectCode(wf.approveMethodBriefForSeries('inflation', { briefId: br.id, briefHash: br.hash, ...ack }, actor), 'NOT_AUTHORIZED');
    expect(await repo.approvals.count({ gate: 'G1' })).toBe(0);
    expect((await repo.researchBriefs.get(br.id))!.status).toBe('draft');
    expect((await repo.auditLog.list({ action: 'approval_denied' })).length).toBeGreaterThanOrEqual(6);
  });

  it('an agent cannot forge the marker through recordApproval, even with its own brief', async () => {
    const a = await seriesItem('cost', 1);
    await ready(a.id);
    const br = await brief('cost');
    const notes = `${METHOD_G1_MARKER}${JSON.stringify({ v: 1, briefId: br.id, briefHash: br.hash, kind: 'cost' })}`;
    await expectCode(wf.recordApproval('G1', a.id, 'chief-of-staff', { notes }), 'NOT_AUTHORIZED');
    await expectCode(wf.recordApproval('G1', a.id, 'owner', { notes }), 'NOT_AUTHORIZED');
    // the generic path still needs a brief of the item itself: the method brief (contentId null) does not count
    await expectCode(wf.recordApproval('G1', a.id, 'chief-of-staff'), 'INVALID_INPUT');
  });

  it('a hand-inserted marker row from an agent never counts', async () => {
    const a = await seriesItem('cost', 1);
    await ready(a.id);
    const br = await brief('cost');
    await repo.researchBriefs.update(br.id, { status: 'approved' });
    await repo.approvals.insert({ id: 'ap_forged', contentId: a.id, gate: 'G1', actorId: 'chief-of-staff', decision: 'approved', status: 'valid', scriptRevisionId: null, assetSha256: null, captionHash: null, notes: `${METHOD_G1_MARKER}${JSON.stringify({ v: 1, briefId: br.id, briefHash: br.hash, kind: 'cost' })}`, createdAt: new Date().toISOString(), invalidatedAt: null, invalidationReason: null });
    expect((await wf.gateStatus(a.id)).G1.satisfied).toBe(false);
    await expectCode(wf.transition(a.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
  });

  it('a stale brief hash is refused', async () => {
    const a = await seriesItem('compounding', 1);
    await ready(a.id);
    const br = await brief('compounding');
    await expectCode(wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: 'f'.repeat(64), ...ack }, 'owner'), 'BINDING_MISMATCH');
    expect(await repo.approvals.count({ gate: 'G1' })).toBe(0);
  });

  it('a brief of the wrong series kind is refused', async () => {
    const a = await seriesItem('compounding', 1);
    await ready(a.id);
    const wrong = await brief('cost');
    await expectCode(wf.approveMethodBriefForSeries('compounding', { briefId: wrong.id, briefHash: wrong.hash, ...ack }, 'owner'), 'BINDING_MISMATCH');
    // an ordinary (non-method) brief is refused too
    const now = new Date().toISOString();
    await repo.researchBriefs.insert({ id: 'rb_other', contentId: null, topic: 'Iets anders', kind: 'evergreen', summary: 's', keyFacts: ['f'], status: 'approved', createdBy: 'research-analyst', createdAt: now, updatedAt: now });
    await expectCode(wf.approveMethodBriefForSeries('compounding', { briefId: 'rb_other', briefHash: 'a'.repeat(64), ...ack }, 'owner'), 'BINDING_MISMATCH');
  });

  it('a G1 recorded for kind A does not count for an item of kind B', async () => {
    const a = await seriesItem('compounding', 1);
    const c = await seriesItem('cost', 1);
    await ready(a.id);
    await ready(c.id);
    const br = await brief('compounding');
    await wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner');
    // copy the compounding approval onto the cost item (as a DB-level forgery would)
    const src = (await repo.approvals.list({ contentId: a.id, gate: 'G1' }))[0]!;
    await repo.approvals.insert({ ...src, id: 'ap_copy', contentId: c.id });
    expect((await wf.gateStatus(c.id)).G1.satisfied).toBe(false);
  });

  it('changing the brief invalidates G1 for all linked items; re-approval needs the new hash', async () => {
    const items = [await seriesItem('inflation', 1), await seriesItem('inflation', 2)];
    for (const i of items) await ready(i.id);
    const br = await brief('inflation');
    await wf.approveMethodBriefForSeries('inflation', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner');
    for (const i of items) expect((await wf.gateStatus(i.id)).G1.satisfied).toBe(true);

    await research.updateBrief(br.id, { ...METHOD_BRIEFS.inflation.input, keyFacts: [...METHOD_BRIEFS.inflation.input.keyFacts, 'Extra kernfeit'] }, 'research-analyst');
    for (const i of items) {
      const g1 = (await wf.gateStatus(i.id)).G1;
      expect(g1.satisfied).toBe(false);
      expect(g1.reason).toMatch(/methodebrief/);
      await expectCode(wf.transition(i.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
    }
    expect(await wf.invalidateStaleMethodApprovals()).toBe(2);
    expect(await repo.approvals.count({ gate: 'G1', status: 'invalidated' })).toBe(2);

    await expectCode(wf.approveMethodBriefForSeries('inflation', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner'), 'BINDING_MISMATCH');
    const fresh = await brief('inflation');
    const r = await wf.approveMethodBriefForSeries('inflation', { briefId: fresh.id, briefHash: fresh.hash, ...ack }, 'owner');
    expect(r.approvedItemIds).toHaveLength(2);
    await wf.transition(items[0]!.id, 'SCRIPTING', 'editorial-copywriter', 'go');
  });

  it('un-approving (revoke) the brief stops all links; only the owner may revoke', async () => {
    const a = await seriesItem('compounding', 1);
    await ready(a.id);
    const br = await brief('compounding');
    await wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner');
    await expectCode(wf.revokeMethodBrief(br.id, 'chief-of-staff', 'nee'), 'NOT_AUTHORIZED');
    expect((await wf.gateStatus(a.id)).G1.satisfied).toBe(true);
    expect(await wf.revokeMethodBrief(br.id, 'owner', 'bronnen nog niet gecontroleerd')).toBe(1);
    expect((await wf.gateStatus(a.id)).G1.satisfied).toBe(false);
  });

  it('UNVERIFIED sources need an explicit acknowledgement', async () => {
    const a = await seriesItem('cost', 1);
    await ready(a.id);
    const br = await brief('cost');
    await expectCode(wf.approveMethodBriefForSeries('cost', { briefId: br.id, briefHash: br.hash }, 'owner'), 'INVALID_INPUT');
    expect(await repo.approvals.count({ gate: 'G1' })).toBe(0);
  });

  it('method-brief G1 does not replace G2-G5, and non-series items are untouched', async () => {
    const plain = await wf.createContentIdea({ title: 'Losse vraag over ETFs', pillar: 'beleggen' }, 'content-strategist');
    const s = await seriesItem('compounding', 1);
    await ready(s.id);
    await ready(plain.id);
    const br = await brief('compounding');
    const r = await wf.approveMethodBriefForSeries('compounding', { briefId: br.id, briefHash: br.hash, ...ack }, 'owner');
    expect(r.approvedItemIds).toEqual([s.id]);
    await wf.transition(s.id, 'SCRIPTING', 'editorial-copywriter', 'go');
    await wf.addScriptRevision(s.id, { hook: 'h', body: 'b' }, 'editorial-copywriter');
    await wf.transition(s.id, 'SCRIPT_READY', 'editorial-copywriter', 'klaar');
    await expectCode(wf.transition(s.id, 'FACT_CHECK', 'content-strategist', 'skip G2'), 'GATE_NOT_SATISFIED');
    await expectCode(wf.transition(plain.id, 'SCRIPTING', 'editorial-copywriter', 'go'), 'GATE_NOT_SATISFIED');
    expect(methodBriefTopic('cost')).toMatch(/cost/);
  });
});
