import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowService, sha256File } from '@rj/content-engine';
import { createSqliteRepository, type Repository } from '@rj/database';
import { ResearchService } from '@rj/research-engine';
import { enqueueJob, renderInputHash, enqueueRenderBatch, Worker, registerDefaultHandlers, type RenderFn } from './index.js';

let repo: Repository;
let root: string;
let wf: WorkflowService;
const baseEnv: NodeJS.ProcessEnv = { RJ_RENDER_CONCURRENCY: '2', RJ_RENDER_ITEM_RETRIES: '1', RJ_DAILY_COST_CAP_EUR: '5', RJ_PER_JOB_COST_CAP_EUR: '1', RJ_JOB_BACKOFF_MS: '0' };

beforeEach(() => {
  repo = createSqliteRepository(':memory:');
  root = mkdtempSync(join(tmpdir(), 'rj-batch-'));
  wf = new WorkflowService(repo, { env: baseEnv });
});
afterEach(async () => {
  await repo.close();
  rmSync(root, { recursive: true, force: true });
});

/** Walks an item to APPROVED_FOR_PRODUCTION with real G1/G2/G3 (test fixtures only) and writes its storyboard. */
async function approvedItem(n: number): Promise<{ contentId: string; slug: string }> {
  const title = `Testonderwerp rekenvoorbeeld ${n}`;
  const slug = `2026-11-02-test-${n}`;
  const idea = await wf.createContentIdea({ title, pillar: 'vermogensopbouw', template: 'C' }, 'content-strategist');
  const id = idea.id;
  await wf.transition(id, 'RESEARCHING', 'research-analyst', 'test');
  await new ResearchService(repo).createBrief({ topic: title, kind: 'evergreen', summary: 's', keyFacts: ['f'], sources: [{ url: 'https://www.afm.nl/nl-nl/consumenten', title: 'AFM (test)' }], contentId: id }, 'research-analyst');
  await wf.transition(id, 'RESEARCHED', 'research-analyst', 'test');
  await wf.recordApproval('G1', id, 'content-strategist');
  await wf.transition(id, 'SCRIPTING', 'editorial-copywriter', 'test');
  const rev = await wf.addScriptRevision(id, { hook: 'h', body: 'b', captionText: 'c' }, 'editorial-copywriter');
  await wf.transition(id, 'SCRIPT_READY', 'editorial-copywriter', 'test');
  await wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: rev.id });
  await wf.transition(id, 'FACT_CHECK', 'chief-of-staff', 'test');
  await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id });
  await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
  await wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'chief-of-staff', 'test');
  mkdirSync(join(root, 'content', 'scripts', slug), { recursive: true });
  writeFileSync(join(root, 'content', 'scripts', slug, 'storyboard.json'), JSON.stringify({ slug, title, template: 'TemplateC', n }));
  return { contentId: id, slug };
}

function fakeRender(opts: { delayMs?: number; failTimes?: Map<string, number> } = {}) {
  const state = { calls: [] as string[], inFlight: 0, maxInFlight: 0 };
  const fn: RenderFn = async (slug, { root: r, signal }) => {
    state.calls.push(slug);
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, opts.delayMs ?? 15);
        signal.addEventListener('abort', () => (clearTimeout(t), rej(new Error('aborted'))), { once: true });
      });
      const left = opts.failTimes?.get(slug) ?? 0;
      if (left > 0) {
        opts.failTimes!.set(slug, left - 1);
        throw new Error('simulated render crash');
      }
      mkdirSync(join(r, 'output', 'reels'), { recursive: true });
      const file = join(r, 'output', 'reels', `${slug}.mp4`);
      writeFileSync(file, `fake mp4 for ${slug} #${state.calls.length}`);
      return { mp4Path: file, sha256: await sha256File(file), width: 1080, height: 1920, durationMs: 50_000 };
    } finally {
      state.inFlight--;
    }
  };
  return { fn, state };
}

function runBatch(items: { contentId: string; slug: string }[], env: NodeJS.ProcessEnv, render: RenderFn) {
  const e = { ...baseEnv, ...env };
  const worker = registerDefaultHandlers(new Worker(repo, { env: e, config: { backoffBaseMs: 0 }, log: { info() {}, warn() {}, error() {} } }), { renderBatch: { root, render } });
  return enqueueJob(repo, { type: 'render_batch', idempotencyKey: `b-${Math.random()}`, payload: { items }, timeoutMs: 60_000 }, e).then(async ({ job }) => {
    const summary = await worker.runOnce();
    return { summary, job: (await repo.jobs.get(job.id))! };
  });
}

describe('render_batch', () => {
  it('never runs more renders at once than RJ_RENDER_CONCURRENCY and moves items to QA_REVIEW', async () => {
    const items = await Promise.all([1, 2, 3, 4, 5, 6].map(approvedItem));
    const { fn, state } = fakeRender();
    const { job } = await runBatch(items, { RJ_RENDER_CONCURRENCY: '2' }, fn);
    expect(job.status).toBe('succeeded');
    expect(state.maxInFlight).toBe(2);
    const res = job.result as { rendered: number; maxInFlight: number };
    expect(res.rendered).toBe(6);
    expect(res.maxInFlight).toBe(2);
    for (const i of items) {
      const row = (await repo.contentItems.get(i.contentId))!;
      expect(row.stage).toBe('QA_REVIEW');
      expect(row.currentAssetSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(await repo.approvals.count({ gate: 'G4' })).toBe(0);
    expect(await repo.approvals.count({ gate: 'G5' })).toBe(0);
    expect(await repo.renderJobs.count({ status: 'succeeded' })).toBe(6);
  });

  it('concurrency 1 and 4 are honoured', async () => {
    const items = await Promise.all([1, 2, 3, 4, 5].map(approvedItem));
    const one = fakeRender();
    await runBatch(items.slice(0, 2), { RJ_RENDER_CONCURRENCY: '1' }, one.fn);
    expect(one.state.maxInFlight).toBe(1);
    const four = fakeRender();
    await runBatch(items.slice(2), { RJ_RENDER_CONCURRENCY: '4' }, four.fn);
    expect(four.state.maxInFlight).toBe(3);
  });

  it('skips identical input hashes (idempotent) and re-renders when the storyboard changes', async () => {
    const [a] = await Promise.all([approvedItem(1)]);
    const first = fakeRender();
    await runBatch([a], {}, first.fn);
    expect(first.state.calls).toHaveLength(1);
    const sha1 = (await repo.contentItems.get(a.contentId))!.currentAssetSha256;
    // Same input hash: nothing renders again, the existing MP4 is reused.
    await repo.contentItems.update(a.contentId, { stage: 'APPROVED_FOR_PRODUCTION' });
    const second = fakeRender();
    const { job } = await runBatch([a], {}, second.fn);
    expect(second.state.calls).toHaveLength(0);
    expect((job.result as { reused: number }).reused).toBe(1);
    expect((await repo.contentItems.get(a.contentId))!.currentAssetSha256).toBe(sha1);
    // Changed storyboard = new input hash = real render again.
    const before = renderInputHash(root, a.slug, baseEnv);
    writeFileSync(join(root, 'content', 'scripts', a.slug, 'storyboard.json'), JSON.stringify({ changed: true }));
    expect(renderInputHash(root, a.slug, baseEnv)).not.toBe(before);
    await repo.contentItems.update(a.contentId, { stage: 'APPROVED_FOR_PRODUCTION' });
    const third = fakeRender();
    await runBatch([a], {}, third.fn);
    expect(third.state.calls).toHaveLength(1);
    // The TTS provider is part of the input hash.
    expect(renderInputHash(root, a.slug, { RJ_TTS_PROVIDER: 'elevenlabs' })).not.toBe(renderInputHash(root, a.slug, {}));
  });

  it('a tampered MP4 is not reused', async () => {
    const a = await approvedItem(1);
    await runBatch([a], {}, fakeRender().fn);
    writeFileSync(join(root, 'output', 'reels', `${a.slug}.mp4`), 'edited by hand');
    await repo.contentItems.update(a.contentId, { stage: 'APPROVED_FOR_PRODUCTION' });
    const again = fakeRender();
    await runBatch([a], {}, again.fn);
    expect(again.state.calls).toHaveLength(1);
  });

  it('retries a crashing render up to RJ_RENDER_ITEM_RETRIES, then gives up on that item only', async () => {
    const [a, b] = await Promise.all([approvedItem(1), approvedItem(2)]);
    const fails = new Map([[a.slug, 5]]);
    const r = fakeRender({ failTimes: fails });
    const { job } = await runBatch([a, b], { RJ_RENDER_ITEM_RETRIES: '1' }, r.fn);
    expect(r.state.calls.filter((s) => s === a.slug)).toHaveLength(2);
    const res = job.result as { failed: number; rendered: number };
    expect(res).toMatchObject({ failed: 1, rendered: 1 });
    expect((await repo.contentItems.get(a.contentId))!.stage).toBe('APPROVED_FOR_PRODUCTION');
    expect((await repo.contentItems.get(b.contentId))!.stage).toBe('QA_REVIEW');
    expect(await repo.errorLogs.count({ scope: 'worker:render_batch' })).toBe(1);
    // transient failure succeeds within the retry cap
    const c = await approvedItem(3);
    const ok = fakeRender({ failTimes: new Map([[c.slug, 1]]) });
    await runBatch([c], { RJ_RENDER_ITEM_RETRIES: '1' }, ok.fn);
    expect((await repo.contentItems.get(c.contentId))!.stage).toBe('QA_REVIEW');
  });

  it('enforces the per-render time cap', async () => {
    const a = await approvedItem(1);
    const slow = fakeRender({ delayMs: 500 });
    const { job } = await runBatch([a], { RJ_RENDER_JOB_TIMEOUT_MS: '1000', RJ_RENDER_ITEM_RETRIES: '0' }, slow.fn);
    expect((job.result as { rendered: number }).rendered).toBe(1);
    // with a cap below the render time (min 1000ms is enforced), a hung render is aborted
    const b = await approvedItem(2);
    const hung: RenderFn = (_s, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')), { once: true }));
    const r = await runBatch([b], { RJ_RENDER_JOB_TIMEOUT_MS: '1000', RJ_RENDER_ITEM_RETRIES: '0' }, hung);
    expect((r.job.result as { failed: number }).failed).toBe(1);
  }, 10_000);

  it('stops at the daily render-minutes cap and defers the rest', async () => {
    const items = await Promise.all([1, 2, 3, 4].map(approvedItem));
    const r = fakeRender();
    const { job } = await runBatch(items, { RJ_RENDER_DAILY_MINUTES_CAP: '8', RJ_RENDER_MINUTES_PER_REEL: '4', RJ_RENDER_CONCURRENCY: '1' }, r.fn);
    const res = job.result as { rendered: number; skipped: number; stoppedBy: string };
    expect(res.rendered).toBe(2);
    expect(res.skipped).toBe(2);
    expect(res.stoppedBy).toBe('daily-minutes-cap');
    for (const i of items.slice(2)) expect((await repo.contentItems.get(i.contentId))!.stage).toBe('APPROVED_FOR_PRODUCTION');
  });

  it('refuses a batch whose estimated cost per Reel exceeds the per-job cap, and respects the daily cost cap', async () => {
    const a = await approvedItem(1);
    const refused = await runBatch([a], { RJ_RENDER_COST_PER_REEL_CENTS: '150', RJ_PER_JOB_COST_CAP_EUR: '1' }, fakeRender().fn);
    expect(refused.job.status).toBe('failed');
    const items = await Promise.all([2, 3, 4].map(approvedItem));
    const r = await runBatch(items, { RJ_RENDER_COST_PER_REEL_CENTS: '40', RJ_DAILY_COST_CAP_EUR: '1', RJ_RENDER_CONCURRENCY: '1' }, fakeRender().fn);
    const res = r.job.result as { rendered: number; stoppedBy: string };
    expect(res.rendered).toBe(2);
    expect(res.stoppedBy).toBe('daily-cost-cap');
  });

  it('respects the emergency stop: nothing starts, also when it is switched on mid-batch', async () => {
    const items = await Promise.all([1, 2, 3, 4].map(approvedItem));
    const stopped = fakeRender();
    const whole = await runBatch(items, { RJ_EMERGENCY_STOP: '1' }, stopped.fn);
    expect(stopped.state.calls).toHaveLength(0);
    expect(whole.summary.emergencyStop).toBe(true);
    // mid-batch: the fake render flips the stop switch during the first render (fresh items, the first job is still queued)
    const items2 = await Promise.all([11, 12, 13, 14].map(approvedItem));
    for (const j of await repo.jobs.list({ status: 'queued' })) await repo.jobs.update(j.id, { status: 'cancelled' });
    let flipped = false;
    const r = fakeRender({ delayMs: 20 });
    const flipping: RenderFn = async (slug, o) => {
      if (!flipped) {
        flipped = true;
        await wf.setEmergencyStop(true, 'chief-of-staff', 'test stop');
      }
      return r.fn(slug, o);
    };
    const { job } = await runBatch(items2, { RJ_RENDER_CONCURRENCY: '1' }, flipping);
    const res = job.result as { rendered: number; skipped: number; stoppedBy: string };
    expect(res.stoppedBy).toBe('emergency-stop');
    expect(res.skipped).toBe(3);
    expect(r.state.calls.length).toBe(1);
  });

  it('refuses items without valid G2+G3 or in the wrong stage', async () => {
    const a = await approvedItem(1);
    const idea = await wf.createContentIdea({ title: 'Nog geen script rekenvoorbeeld', pillar: 'vermogensopbouw' }, 'content-strategist');
    mkdirSync(join(root, 'content', 'scripts', 'x'), { recursive: true });
    writeFileSync(join(root, 'content', 'scripts', 'x', 'storyboard.json'), '{}');
    const r = fakeRender();
    const { job } = await runBatch([a, { contentId: idea.id, slug: 'x' }, { contentId: 'nope', slug: 'y' }], {}, r.fn);
    const res = job.result as { rendered: number; skipped: number; items: { reason?: string }[] };
    expect(res.rendered).toBe(1);
    expect(res.skipped).toBe(2);
    expect(r.state.calls).toEqual([a.slug]);
    // G3 invalidated by a new script revision after approval -> the item is not rendered
    const b = await approvedItem(2);
    await wf.addScriptRevision(b.contentId, { hook: 'changed', body: 'changed' }, 'editorial-copywriter');
    const r2 = fakeRender();
    await runBatch([b], {}, r2.fn);
    expect(r2.state.calls).toHaveLength(0);
  });

  it('rejects invalid slugs in the payload', async () => {
    const a = await approvedItem(1);
    const r = fakeRender();
    const { job } = await runBatch([{ contentId: a.contentId, slug: '../etc' }], {}, r.fn);
    expect(job.status).toBe('failed');
    expect(r.state.calls).toHaveLength(0);
  });

  it('enqueueRenderBatch picks only items with G2+G3 and is idempotent per day', async () => {
    const a = await approvedItem(1);
    await approvedItem(2);
    const q = await enqueueRenderBatch(repo, { root, env: baseEnv, limit: 1 });
    expect(q.items).toHaveLength(1);
    expect(q.created).toBe(true);
    expect((await enqueueRenderBatch(repo, { root, env: baseEnv, limit: 1 })).created).toBe(false);
    expect(q.items[0]!.contentId).toBeTruthy();
    void a;
    const job = (await repo.jobs.get(q.jobId!))!;
    expect(job.type).toBe('render_batch');
    expect(job.timeoutMs).toBeGreaterThan(60_000);
  });
});
