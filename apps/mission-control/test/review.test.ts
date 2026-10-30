import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository, type Repository } from '@rj/database';
import { planSeries, registerItem, writeItemFiles } from '@rj/series-engine';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { createDeps, type AppDeps } from '../server/context.js';
import { OWNER_ACTION_HEADER, OWNER_ACTION_VALUE, OWNER_CONFIRMATION } from '../server/routes/content.js';

// Fixtures only: temp DB + temp folders. Nothing here is real content.
const ENV: NodeJS.ProcessEnv = { RJ_DAILY_COST_CAP_EUR: '5', RJ_WEEKLY_TARGET: '70' };
let dir: string;
let repo: Repository;
let deps: AppDeps;
let app: Hono;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rj-review-'));
  repo = createSqliteRepository(join(dir, 't.sqlite'));
  deps = createDeps(repo, { env: ENV, root: dir });
  app = createApp(deps);
});
afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, json };
}

async function seedSeries(count: number) {
  const plan = planSeries({ kinds: ['compounding', 'cost', 'inflation'], count, date: '2026-11-02' });
  const ids: string[] = [];
  for (const item of plan.items) {
    writeItemFiles(item, join(dir, 'content', 'scripts'));
    const r = await registerItem(repo, deps.workflow, item);
    if (r === 'duplicate') throw new Error('duplicate');
    ids.push(r.contentId);
  }
  return { plan, ids };
}

/** Real gate path for one item up to SCRIPTING (G1 with a real brief of the approved registry). */
async function toScripting(id: string, title: string) {
  await deps.workflow.transition(id, 'RESEARCHING', 'research-analyst', 'test');
  await deps.research.createBrief({ topic: title, kind: 'evergreen', summary: 's', keyFacts: ['f'], sources: [{ url: 'https://www.afm.nl/nl-nl/consumenten', title: 'AFM (test)' }], contentId: id }, 'research-analyst');
  await deps.workflow.transition(id, 'RESEARCHED', 'research-analyst', 'test');
  await deps.workflow.recordApproval('G1', id, 'content-strategist');
}

describe('review queue', () => {
  it('lists series drafts in the prep bucket with passing automated checks and experiment tags', async () => {
    const { plan } = await seedSeries(6);
    const r = await call('GET', '/api/review/queue');
    expect(r.status).toBe(200);
    expect(r.json.buckets.find((b: any) => b.id === 'prep').count).toBe(6);
    expect(r.json.items).toHaveLength(6);
    for (const it of r.json.items) {
      expect(it.autoPass).toBe(true);
      expect(it.trial).toBe(true);
      expect(it.tags.template).toBe('C');
      expect(it.checks.find((c: any) => c.id === 'numbers').ok).toBe(true);
    }
    expect(new Set(r.json.items.map((i: any) => i.contentHash))).toEqual(new Set(plan.items.map((i) => i.contentHash)));
  });

  it('filters by bucket, kind and text, and paginates', async () => {
    await seedSeries(12);
    expect((await call('GET', '/api/review/queue?bucket=G5')).json.items).toHaveLength(0);
    const cost = await call('GET', '/api/review/queue?kind=cost');
    expect(cost.json.items.every((i: any) => i.tags.kind === 'cost')).toBe(true);
    expect((await call('GET', '/api/review/queue?limit=5&offset=10')).json.items).toHaveLength(2);
    expect((await call('GET', '/api/review/queue?q=zzzgeenmatch')).json.items).toHaveLength(0);
    expect((await call('GET', '/api/review/queue?bucket=nope')).status).toBe(400);
  });

  it('detail shows script, claims with calculation refs, caption hash and the exact hashes', async () => {
    const { ids, plan } = await seedSeries(1);
    const d = await call('GET', `/api/review/item/${ids[0]}`);
    expect(d.status).toBe(200);
    expect(d.json.script.version).toBe(1);
    expect(d.json.claims.length).toBe(plan.items[0]!.claims.length);
    expect(d.json.claims.every((c: any) => c.calculationRef.startsWith('@rj/finance-engine:'))).toBe(true);
    expect(d.json.item.captionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(d.json.contentHash).toBe(plan.items[0]!.contentHash);
    expect(d.json.autoPass).toBe(true);
  });

  it('numbers check fails when the stored content no longer matches the engine (tampered notes)', async () => {
    const { ids } = await seedSeries(1);
    const row = (await repo.contentItems.get(ids[0]!))!;
    const notes = JSON.parse(row.notes!);
    notes.params.monthly += 1;
    await repo.contentItems.update(ids[0]!, { notes: JSON.stringify(notes) });
    const q = await call('GET', '/api/review/queue');
    expect(q.json.items[0].autoPass).toBe(false);
    const adv = await call('POST', '/api/review/advance', { ids: [ids[0]] });
    expect(adv.json.advanced).toBe(0);
  });
});

describe('bulk advance is safe', () => {
  it('advances only mechanical steps for items passing the checks, and never approves anything', async () => {
    const { ids, plan } = await seedSeries(3);
    for (const [i, id] of ids.entries()) await toScripting(id, plan.items[i]!.title);
    const approvalsBefore = await repo.approvals.count();
    const r1 = await call('POST', '/api/review/advance', { ids });
    expect(r1.json.advanced).toBe(3);
    expect(r1.json.results.every((x: any) => x.to === 'SCRIPTING')).toBe(true);
    const r2 = await call('POST', '/api/review/advance', { ids });
    expect(r2.json.results.every((x: any) => x.to === 'SCRIPT_READY')).toBe(true);
    // SCRIPT_READY -> FACT_CHECK needs G2 which nobody gave: refused by the workflow
    const r3 = await call('POST', '/api/review/advance', { ids });
    expect(r3.json.advanced).toBe(0);
    expect(r3.json.results[0].error).toMatch(/G2/);
    // after a reviewer's G2 on the exact revision it moves, but G3 still blocks the next step
    const row = (await repo.contentItems.get(ids[0]!))!;
    await deps.workflow.recordApproval('G2', ids[0]!, 'content-strategist', { scriptRevisionId: row.currentScriptRevisionId! });
    const r4 = await call('POST', '/api/review/advance', { ids: [ids[0]] });
    expect(r4.json.results[0]).toMatchObject({ ok: true, to: 'FACT_CHECK' });
    const r5 = await call('POST', '/api/review/advance', { ids: [ids[0]] });
    expect(r5.json.advanced).toBe(0);
    expect(await repo.approvals.count()).toBe(approvalsBefore + 1); // only the reviewer's G2 above
    expect(await repo.approvals.count({ gate: 'G5' })).toBe(0);
  });

  it('refuses items at IDEA, READY_FOR_EDITOR and beyond; there is no blanket approval route', async () => {
    const { ids } = await seedSeries(2);
    const r = await call('POST', '/api/review/advance', { ids });
    expect(r.json.advanced).toBe(0);
    expect(r.json.results[0].error).toMatch(/Geen bulkactie/);
    await repo.contentItems.update(ids[0]!, { stage: 'READY_FOR_EDITOR' });
    const g5 = await call('POST', '/api/review/advance', { ids: [ids[0]] });
    expect(g5.json.advanced).toBe(0);
    expect((await repo.contentItems.get(ids[0]!))!.stage).toBe('READY_FOR_EDITOR');
    for (const path of ['/api/review/approve', '/api/review/approve-all', '/api/review/owner-approval', '/api/review/g5']) {
      expect((await call('POST', path, { ids })).status).toBe(404);
    }
    expect(await repo.approvals.count()).toBe(0);
  });

  it('is blocked by the emergency stop and validates input', async () => {
    const { ids } = await seedSeries(1);
    expect((await call('POST', '/api/review/advance', { ids: [] })).status).toBe(400);
    expect((await call('POST', '/api/review/advance', { ids: ['x'], actorId: 'nobody' })).status).toBe(400);
    await deps.workflow.setEmergencyStop(true, 'chief-of-staff', 'test');
    expect((await call('POST', '/api/review/advance', { ids })).status).toBe(423);
  });
});

describe('G5 stays per exact hash, also in the review flow', () => {
  it('a batch of owner approvals is one call per item and each needs its own exact hashes', async () => {
    const { ids } = await seedSeries(2);
    const hashes: { asset: string; cap: string }[] = [];
    for (const [n, id] of ids.entries()) {
      const rel = `output/reels/rev-${n}.mp4`;
      mkdirSync(join(dir, 'output', 'reels'), { recursive: true });
      writeFileSync(join(dir, rel), `mp4 bytes ${n}`);
      const sha = (await import('@rj/content-engine')).sha256File;
      const asset = await sha(join(dir, rel));
      await deps.workflow.setVideoAsset(id, { path: rel, sha256: asset }, 'video-engineer');
      const item = (await repo.contentItems.get(id))!;
      hashes.push({ asset, cap: item.captionHash! });
      await repo.contentItems.update(id, { stage: 'READY_FOR_EDITOR' }); // fixture shortcut: stage only, gates stay open
    }
    const body = (i: number, over: object = {}) => ({ actorId: 'owner', confirmation: OWNER_CONFIRMATION, assetSha256: hashes[i]!.asset, captionHash: hashes[i]!.cap, ...over });
    const h = { [OWNER_ACTION_HEADER]: OWNER_ACTION_VALUE };
    // item 0 with item 1's hash is refused
    expect((await call('POST', `/api/content/${ids[0]}/owner-approval`, body(0, { assetSha256: hashes[1]!.asset }), h)).status).toBe(409);
    // missing header is refused
    expect((await call('POST', `/api/content/${ids[0]}/owner-approval`, body(0))).status).toBe(403);
    // the review queue shows exactly these hashes
    const q = await call('GET', '/api/review/queue?bucket=G5');
    expect(q.json.items.map((i: any) => i.assetSha256).sort()).toEqual(hashes.map((x) => x.asset).sort());
    expect(await repo.approvals.count({ gate: 'G5' })).toBe(0);
  });
});

describe('capacity', () => {
  it('reports no data for an empty database (null, not 0)', async () => {
    const r = await call('GET', '/api/review/capacity');
    expect(r.json).toMatchObject({ hasData: false, week: null, today: null, target: 70, dailyTarget: 10 });
  });

  it('counts scripted drafts from the database for today and this week', async () => {
    await seedSeries(4);
    const r = await call('GET', '/api/review/capacity');
    expect(r.json.hasData).toBe(true);
    expect(r.json.week).toEqual({ scripted: 4, rendered: 0, approved: 0, scheduled: 0 });
    expect(r.json.today.scripted).toBe(4);
  });
});

describe('render batch endpoint', () => {
  it('queues nothing when no item has G2+G3 and honours the emergency stop', async () => {
    await seedSeries(2);
    const r = await call('POST', '/api/review/render-batch', {});
    expect(r.json).toMatchObject({ queued: false, items: 0 });
    await deps.workflow.setEmergencyStop(true, 'chief-of-staff', 'test');
    expect((await call('POST', '/api/review/render-batch', {})).status).toBe(423);
  });
});
