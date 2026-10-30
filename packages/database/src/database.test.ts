import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, nowIso, sha256, topicHash } from '@rj/shared';
import { createSqliteRepository, loadMigrations, migrate, openSqlite, seed, SEED_IDEAS, TABLES, toSnake } from './index.js';

const dirs: string[] = [];
function tempDb(): string {
  const d = mkdtempSync(join(tmpdir(), 'rj-db-'));
  dirs.push(d);
  return join(d, 'test.sqlite');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function idea(title: string) {
  const now = nowIso();
  return {
    id: newId('ci'), title, pillar: 'test', template: null, series: null, hook: null, angle: null,
    stage: 'IDEA' as const, topicHash: topicHash(title), priority: 0, scheduledAt: null,
    currentScriptRevisionId: null, currentVideoAssetId: null, currentAssetSha256: null,
    captionText: null, captionHash: null, notes: null, createdBy: 'system' as const, createdAt: now, updatedAt: now,
  };
}

describe('migrations', () => {
  it('every schema field has a column in its table', () => {
    const db = openSqlite(':memory:');
    migrate(db);
    for (const spec of Object.values(TABLES)) {
      const cols = (db.prepare(`PRAGMA table_info(${spec.table})`).all() as { name: string }[]).map((c) => c.name);
      const fields = Object.keys(spec.schema.shape).map(toSnake);
      expect(cols.sort(), spec.table).toEqual(fields.sort());
    }
    db.close();
  });
  it('is idempotent and recorded in schema_migrations', () => {
    const db = openSqlite(':memory:');
    const first = migrate(db);
    expect(first.length).toBe(loadMigrations().length);
    expect(migrate(db)).toEqual([]);
    db.close();
  });
});

describe('sqlite repository', () => {
  it('persists across close/reopen', async () => {
    const path = tempDb();
    const repo = createSqliteRepository(path);
    const row = await repo.contentItems.insert(idea('Persistentie test'));
    await repo.setConfig('emergency_stop', false, 'owner');
    await repo.close();
    const again = createSqliteRepository(path);
    expect(await again.contentItems.get(row.id)).toEqual(row);
    expect(await again.getConfig('emergency_stop')).toBe(false);
    await again.close();
  });

  it('filters, orders, counts and sums (sum of nothing is null)', async () => {
    const repo = createSqliteRepository(':memory:');
    await repo.contentItems.insert({ ...idea('a'), priority: 1 });
    await repo.contentItems.insert({ ...idea('b'), priority: 5, stage: 'RESEARCHING' });
    expect(await repo.contentItems.count({ stage: 'IDEA' })).toBe(1);
    expect((await repo.contentItems.list({}, { orderBy: 'priority', desc: true }))[0]!.title).toBe('b');
    expect(await repo.contentItems.count({ stage: { op: 'in', value: ['IDEA', 'RESEARCHING'] } })).toBe(2);
    expect(await repo.contentItems.count({ scheduledAt: null })).toBe(2);
    expect(await repo.costRecords.sum('amountCents')).toBeNull();
    await repo.close();
  });

  it('rejects invalid rows via the zod schema and duplicate topic hashes', async () => {
    const repo = createSqliteRepository(':memory:');
    await expect(repo.contentItems.insert({ ...idea('x'), stage: 'NOPE' as never })).rejects.toThrow();
    await repo.contentItems.insert(idea('dubbel'));
    await expect(repo.contentItems.insert(idea('Dubbel!'))).rejects.toThrow(/UNIQUE/);
    await repo.close();
  });

  it('script revisions and audit log are append-only', async () => {
    const repo = createSqliteRepository(':memory:');
    const ci = await repo.contentItems.insert(idea('rev'));
    const now = nowIso();
    const script = await repo.scripts.insert({ id: newId('sc'), contentId: ci.id, title: 't', currentRevisionId: null, authorId: 'editorial-copywriter', createdAt: now, updatedAt: now });
    const rev = await repo.scriptRevisions.insert({ id: newId('sr'), scriptId: script.id, contentId: ci.id, version: 1, hook: 'h', body: 'b', cta: null, onScreenText: ['x'], captionText: null, sha256: sha256('b'), authorId: 'editorial-copywriter', changeNote: null, createdAt: now });
    await expect(repo.scriptRevisions.update(rev.id, { body: 'changed' })).rejects.toThrow(/immutable/);
    const al = await repo.auditLog.insert({ id: newId('al'), contentId: ci.id, action: 'transition', fromStage: null, toStage: 'IDEA', actorId: 'system', reason: 'r', details: { a: 1 }, createdAt: now });
    await expect(repo.auditLog.delete(al.id)).rejects.toThrow(/append-only/);
    expect((await repo.auditLog.get(al.id))!.details).toEqual({ a: 1 });
    await repo.close();
  });

  it('transactions roll back and serialize other operations', async () => {
    const repo = createSqliteRepository(':memory:');
    await expect(
      repo.transaction(async (tx) => {
        await tx.contentItems.insert(idea('rollback'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.contentItems.count()).toBe(0);
    let inside = false;
    const t = repo.transaction(async (tx) => {
      inside = true;
      await new Promise((r) => setTimeout(r, 20));
      await tx.contentItems.insert(idea('tx'));
      inside = false;
    });
    const countDuring = repo.contentItems.count().then((n) => ({ n, inside }));
    await t;
    expect(await countDuring).toEqual({ n: 1, inside: false });
    await repo.close();
  });

  it('job claim is atomic', async () => {
    const repo = createSqliteRepository(':memory:');
    const now = nowIso();
    const job = await repo.jobs.insert({ id: newId('job'), type: 'daily_brief', idempotencyKey: 'k1', contentId: null, payload: {}, status: 'queued', attempts: 0, maxAttempts: 3, timeoutMs: 1000, estimatedCostCents: 0, runAfter: now, lastError: null, result: null, createdAt: now, startedAt: null, finishedAt: null });
    const [a, b] = await Promise.all([repo.jobs.claim(job.id, now), repo.jobs.claim(job.id, now)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await repo.jobs.get(job.id))!.attempts).toBe(1);
    await repo.close();
  });
});

describe('seed', () => {
  it('inserts only the real first Reel + evergreen ideas at IDEA, idempotently, no metrics', async () => {
    const path = tempDb();
    const repo = createSqliteRepository(path);
    const r1 = await seed(repo);
    expect(r1.inserted).toHaveLength(SEED_IDEAS.length);
    await repo.close();
    const again = createSqliteRepository(path);
    const r2 = await seed(again);
    expect(r2.inserted).toHaveLength(0);
    const items = await again.contentItems.list();
    expect(items.every((i) => i.stage === 'IDEA')).toBe(true);
    const first = items.find((i) => i.title === 'Wat doet €250 per maand beleggen over 30 jaar?');
    expect(first?.template).toBe('C');
    expect(first?.series).toBe('GELD IN CIJFERS');
    expect(await again.publications.count()).toBe(0);
    expect(await again.analyticsSnapshots.count()).toBe(0);
    expect(await again.approvals.count()).toBe(0);
    await again.close();
  });
});
