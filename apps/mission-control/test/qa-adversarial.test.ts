import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository, type Repository } from '@rj/database';
import { captionHash, sha256 } from '@rj/shared';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { createDeps, type AppDeps } from '../server/context.js';
import { OWNER_ACTION_HEADER, OWNER_ACTION_VALUE, OWNER_CONFIRMATION } from '../server/routes/content.js';

// Test fixtures only (temp DB + temp files); nothing here is real content or real metrics.
const ENV: NodeJS.ProcessEnv = { RJ_DAILY_COST_CAP_EUR: '5', RJ_MONTHLY_COST_CAP_EUR: '50' };
const CAPTION = 'Testcaption: hypothetisch rekenvoorbeeld, geen advies.';
const VIDEO = 'output/reels/test-reel.mp4';

let dir: string;
let dbPath: string;
let repo: Repository;
let deps: AppDeps;
let app: Hono;

function open() {
  repo = createSqliteRepository(dbPath);
  deps = createDeps(repo, { env: ENV, root: dir });
  app = createApp(deps);
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const post = (path: string, body: unknown, headers?: Record<string, string>) => call('POST', path, body, headers);
const ownerHeaders = { [OWNER_ACTION_HEADER]: OWNER_ACTION_VALUE };

async function step(id: string, to: string, actorId = 'chief-of-staff') {
  const r = await post(`/api/content/${id}/transition`, { to, reason: `test: to ${to}`, actorId });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

/** Walks a fresh item to READY_FOR_EDITOR with real G1–G4 approvals via the API + services. */
async function readyForEditor(): Promise<{ id: string; assetSha: string; capHash: string }> {
  const created = await post('/api/content', { title: 'Testonderwerp samengestelde rente', pillar: 'beleggen-basis', template: 'C' });
  expect(created.status).toBe(201);
  const id = created.json.item.id as string;
  await step(id, 'RESEARCHING', 'research-analyst');
  await deps.research.createBrief(
    { topic: 'Testonderwerp samengestelde rente', kind: 'evergreen', summary: 'test brief', keyFacts: ['test feit'], sources: [{ url: 'https://www.afm.nl/nl-nl/consumenten', title: 'AFM consumenten (test)' }], contentId: id },
    'research-analyst',
  );
  await step(id, 'RESEARCHED', 'research-analyst');
  expect((await post(`/api/content/${id}/approvals`, { gate: 'G1', actorId: 'content-strategist' })).status).toBe(201);
  await step(id, 'SCRIPTING');
  const rev = await deps.workflow.addScriptRevision(id, { hook: 'Testhook?', body: 'Testbody.', captionText: CAPTION }, 'editorial-copywriter');
  await step(id, 'SCRIPT_READY', 'editorial-copywriter');
  expect((await post(`/api/content/${id}/approvals`, { gate: 'G2', actorId: 'content-strategist', scriptRevisionId: rev.id })).status).toBe(201);
  await step(id, 'FACT_CHECK');
  expect((await post(`/api/content/${id}/approvals`, { gate: 'G3', actorId: 'fact-checker', scriptRevisionId: rev.id })).status).toBe(201);
  expect((await post(`/api/content/${id}/approvals`, { gate: 'G3', actorId: 'compliance-reviewer', scriptRevisionId: rev.id })).status).toBe(201);
  await step(id, 'APPROVED_FOR_PRODUCTION');
  await step(id, 'AUDIO_GENERATING', 'voice-producer');
  await step(id, 'RENDERING', 'video-engineer');
  const bytes = Buffer.from('fake-mp4-bytes-for-test-' + id);
  writeFileSync(join(dir, VIDEO), bytes);
  const assetSha = sha256(bytes);
  await deps.workflow.setVideoAsset(id, { path: VIDEO, sha256: assetSha }, 'video-engineer');
  await step(id, 'RENDERED', 'video-engineer');
  await step(id, 'QA_REVIEW', 'qa-engineer');
  expect((await post(`/api/content/${id}/approvals`, { gate: 'G4', actorId: 'qa-engineer', assetSha256: assetSha })).status).toBe(201);
  await step(id, 'READY_FOR_EDITOR', 'qa-engineer');
  expect((await post(`/api/content/${id}/caption`, { captionText: CAPTION, actorId: 'distribution-manager' })).status).toBe(200);
  return { id, assetSha, capHash: captionHash(CAPTION) };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rj-mc-'));
  mkdirSync(join(dir, 'output', 'reels'), { recursive: true });
  mkdirSync(join(dir, 'output', 'covers'), { recursive: true });
  dbPath = join(dir, 'test.sqlite');
  open();
});

afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});


describe('QA adversarial', () => {
  it('script change after G5 blocks scheduling and publishing (G2/G3 invalid) even at APPROVED_FOR_PUBLISHING', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    const ok = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders);
    expect(ok.status).toBe(201);
    await step(id, 'APPROVED_FOR_PUBLISHING', 'owner');
    await deps.workflow.addScriptRevision(id, { hook: 'Nieuwe hook', body: 'Nieuwe body' }, 'editorial-copywriter');
    const sched = await post(`/api/content/${id}/schedule`, { scheduledAt: '2099-01-01T10:00:00+01:00', actorId: 'distribution-manager' });
    expect(sched.status).toBe(409);
    const direct = await post(`/api/content/${id}/transition`, { to: 'SCHEDULED', reason: 'bypass poging', actorId: 'owner' });
    expect(direct.status).toBe(400);
    await expect(deps.workflow.transition(id, 'SCHEDULED', 'owner', 'bypass poging')).rejects.toMatchObject({ code: 'GATE_NOT_SATISFIED' });
    await expect(deps.workflow.transition(id, 'PUBLISHED', 'owner', 'bypass poging')).rejects.toMatchObject({ code: 'GATE_NOT_SATISFIED' });
  });

  it('service-level transition to SCHEDULED/PUBLISHED without G5 is refused for every actor', async () => {
    const { id } = await readyForEditor();
    for (const a of ['owner', 'distribution-manager', 'automation-engineer', 'chief-of-staff'])
      for (const to of ['SCHEDULED', 'PUBLISHED', 'APPROVED_FOR_PUBLISHING'] as const)
        await expect(deps.workflow.transition(id, to, a, 'bypass')).rejects.toBeDefined();
    expect((await repo.contentItems.get(id))!.stage).toBe('READY_FOR_EDITOR');
  });

  it('forged G5 via recordApproval with non-owner actor or via generic endpoint is refused', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    for (const a of ['chief-of-staff', 'distribution-manager', 'compliance-reviewer'])
      await expect(deps.workflow.recordApproval('G5', id, a, { assetSha256: assetSha, captionHash: capHash })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    const r = await post(`/api/content/${id}/approvals`, { gate: 'G5', actorId: 'owner', assetSha256: assetSha });
    expect(r.status).toBe(403);
    const r2 = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash });
    expect(r2.status).toBe(403);
  });

  it('emergency stop blocks the schedule endpoint and job creation but a G5 decision is still recordable (documented)', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    await post('/api/system/emergency-stop', { on: true, reason: 'qa test', actorId: 'qa-engineer' });
    const ap = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders);
    // record whatever happens; asserted below so the report states facts
    expect([201, 423]).toContain(ap.status);
    const t = await post(`/api/content/${id}/transition`, { to: 'APPROVED_FOR_PUBLISHING', reason: 'qa test stop', actorId: 'owner' });
    expect(t.status).toBe(423);
    const j = await post('/api/jobs', { type: 'daily_brief' });
    expect(j.status).toBe(423);
    console.log('G5 during emergency stop ->', ap.status);
  });

  it('raw repository writes skip the service (documented gap: no DB-level guard)', async () => {
    const { id } = await readyForEditor();
    await repo.contentItems.update(id, { stage: 'SCHEDULED' });
    console.log('RAW repo stage write accepted ->', (await repo.contentItems.get(id))!.stage);
  });

  it('CSRF: a cross-site "simple" POST (text/plain) is refused, and rebinding hosts are refused', async () => {
    const created = await app.request('/api/content', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body: JSON.stringify({ title: 'Geplaatst door vreemde pagina', pillar: 'beleggen-basis' }),
    });
    expect(created.status).toBe(415);
    const stop = await app.request('/api/system/emergency-stop', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ on: false, reason: 'csrf poging' }),
    });
    expect(stop.status).toBe(415);
    const rebind = await app.request('http://evil.example:8787/api/health', { method: 'GET' });
    expect(rebind.status).toBe(403);
    const okHost = await app.request('http://127.0.0.1:8787/api/health', { method: 'GET' });
    expect(okHost.status).toBe(200);
    const ok = await app.request('/api/content', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ title: 'Legitiem onderwerp', pillar: 'beleggen-basis' }) });
    expect(ok.status).toBe(201);
  });
});
