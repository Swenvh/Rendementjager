import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository, type Repository } from '@rj/database';
import { planSeries, registerItem, writeItemFiles } from '@rj/series-engine';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { createDeps, type AppDeps } from '../server/context.js';
import { METHOD_ACTION_HEADER, METHOD_ACTION_VALUE, METHOD_CONFIRMATION } from '../server/routes/methods.js';

let dir: string;
let repo: Repository;
let deps: AppDeps;
let app: Hono;
const OWNER = { [METHOD_ACTION_HEADER]: METHOD_ACTION_VALUE };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rj-methods-'));
  repo = createSqliteRepository(join(dir, 't.sqlite'));
  deps = createDeps(repo, { env: {}, root: dir });
  app = createApp(deps);
});
afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

describe('methodebriefs API', () => {
  it('lists 3 briefs, owner approval covers real series items of that kind only, never bypasses G2-G5', async () => {
    await call('POST', '/api/methods/ensure', {});
    const plan = planSeries({ kinds: ['compounding', 'cost', 'inflation'], count: 9, date: '2026-11-02' });
    const byKind: Record<string, string[]> = {};
    for (const item of plan.items) {
      writeItemFiles(item, join(dir, 'content', 'scripts'));
      const r = await registerItem(repo, deps.workflow, item);
      if (r === 'duplicate') throw new Error('dup');
      (byKind[item.tags.kind] ??= []).push(r.contentId);
    }
    const list = await call('GET', '/api/methods');
    expect(list.json.methods.map((m: any) => m.kind)).toEqual(['compounding', 'cost', 'inflation']);
    const comp = list.json.methods[0];
    expect(comp.unverifiedCount).toBe(comp.sources.length);
    expect(comp.items).toMatchObject({ preScript: byKind.compounding!.length, g1Valid: 0 });

    const body = { briefId: comp.brief.id, briefHash: comp.hash, confirmation: METHOD_CONFIRMATION, acknowledgeUnverified: true };
    // no owner header / wrong actor / wrong confirmation / no acknowledgement / stale hash
    expect((await call('POST', '/api/methods/compounding/approve', body)).status).toBe(403);
    expect((await call('POST', '/api/methods/compounding/approve', { ...body, actorId: 'chief-of-staff' }, OWNER)).status).toBe(403);
    expect((await call('POST', '/api/methods/compounding/approve', { ...body, confirmation: 'ja' }, OWNER)).status).toBe(400);
    expect((await call('POST', '/api/methods/compounding/approve', { ...body, acknowledgeUnverified: false }, OWNER)).status).toBe(400);
    expect((await call('POST', '/api/methods/compounding/approve', { ...body, briefHash: 'a'.repeat(64) }, OWNER)).status).toBe(409);
    // wrong series kind
    expect((await call('POST', '/api/methods/cost/approve', body, OWNER)).status).toBe(409);
    expect(await repo.approvals.count({ gate: 'G1' })).toBe(0);

    const ok = await call('POST', '/api/methods/compounding/approve', body, OWNER);
    expect(ok.status).toBe(200);
    expect(ok.json.approvedItemIds.sort()).toEqual([...byKind.compounding!].sort());
    const after = await call('GET', '/api/methods');
    expect(after.json.methods[0].items.g1Valid).toBe(byKind.compounding!.length);
    expect(after.json.methods[1].items.g1Valid).toBe(0);
    // G2-G5 remain: the item is still at IDEA
    const item = await repo.contentItems.get(byKind.compounding![0]!);
    expect(item!.stage).toBe('IDEA');
    expect((await deps.workflow.gateStatus(item!.id)).G2.satisfied).toBe(false);
  });
});
