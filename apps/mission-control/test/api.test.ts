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

describe('basics', () => {
  it('health, list, create idea, validation and duplicate errors', async () => {
    expect((await call('GET', '/api/health')).json.ok).toBe(true);
    const bad = await post('/api/content', { title: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('VALIDATION_ERROR');
    const ok = await post('/api/content', { title: 'Wat is een indexfonds?', pillar: 'beleggen-basis' });
    expect(ok.status).toBe(201);
    expect(ok.json.item.stage).toBe('IDEA');
    const dup = await post('/api/content', { title: 'wat is een indexfonds', pillar: 'beleggen-basis' });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('DUPLICATE_TOPIC');
    const list = await call('GET', '/api/content');
    expect(list.json.items).toHaveLength(1);
  });

  it('detail has gates, audit log and allowed transitions; denied transition returns the WorkflowError code', async () => {
    const id = (await post('/api/content', { title: 'Wat doet inflatie testje', pillar: 'geld-basis' })).json.item.id;
    const d = await call('GET', `/api/content/${id}`);
    expect(d.status).toBe(200);
    expect(Object.keys(d.json.gates)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    expect(d.json.auditLog[0].toStage).toBe('IDEA');
    expect(d.json.transitions.map((t: any) => t.to)).toEqual(['RESEARCHING', 'FAILED', 'ARCHIVED']);
    const skip = await post(`/api/content/${id}/transition`, { to: 'SCRIPTING', reason: 'skip ahead' });
    expect(skip.status).toBe(409);
    expect(skip.json.error.code).toBe('INVALID_TRANSITION');
    expect((await call('GET', '/api/content/ci_nope')).status).toBe(404);
  });

  it('analytics is an explicit empty state without snapshots; daily brief reports costs as null', async () => {
    const a = await call('GET', '/api/analytics');
    expect(a.json).toMatchObject({ empty: true, snapshots: [] });
    const b = await call('GET', '/api/brief');
    expect(b.json.brief.costs.todayCents).toBeNull();
  });

  it('system status reports configured flags only, never secret values', async () => {
    const secretDeps = createDeps(repo, { env: { ...ENV, ANTHROPIC_API_KEY: 'sk-ant-SECRET-VALUE' }, root: dir });
    const r = await createApp(secretDeps).request('/api/system');
    const text = await r.text();
    expect(text).not.toContain('SECRET-VALUE');
    const json = JSON.parse(text);
    expect(json.providers.find((p: any) => p.id === 'anthropic').configured).toBe(true);
    expect(json.costCaps.dailyCents).toBe(500);
  });
});

describe('G5 owner approval', () => {
  it('accepts the owner action bound to the current sha256 + caption hash, then allows scheduling', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    const ok = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders);
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    expect(ok.json.approval).toMatchObject({ gate: 'G5', actorId: 'owner', assetSha256: assetSha, captionHash: capHash });
    await step(id, 'APPROVED_FOR_PUBLISHING', 'owner');
    const when = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const s = await post(`/api/content/${id}/schedule`, { scheduledAt: when, platform: 'instagram' });
    expect(s.status, JSON.stringify(s.json)).toBe(201);
    expect(s.json.item.stage).toBe('SCHEDULED');
    // Reschedule (drag in the calendar) keeps the rules: new slot, old publication cancelled.
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const r = await post(`/api/content/${id}/schedule`, { scheduledAt: later });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const cal = await call('GET', '/api/calendar');
    expect(cal.json.events.filter((e: any) => e.status === 'scheduled')).toHaveLength(1);
    expect(cal.json.events[0].scheduledAt).toBe(later);
  });

  it('rejects G5 through the generic approvals endpoint, even as owner', async () => {
    const { id, assetSha } = await readyForEditor();
    const r = await post(`/api/content/${id}/approvals`, { gate: 'G5', actorId: 'owner', assetSha256: assetSha });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('NOT_AUTHORIZED');
  });

  it('rejects a non-owner actor and a request without the UI owner action', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    const body = { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash };
    const agent = await post(`/api/content/${id}/owner-approval`, { ...body, actorId: 'chief-of-staff' }, ownerHeaders);
    expect(agent.status).toBe(403);
    expect(agent.json.error.code).toBe('NOT_AUTHORIZED');
    const noHeader = await post(`/api/content/${id}/owner-approval`, body);
    expect(noHeader.status).toBe(403);
    const noConfirm = await post(`/api/content/${id}/owner-approval`, { ...body, confirmation: 'ok' }, ownerHeaders);
    expect(noConfirm.status).toBe(400);
    expect((await deps.workflow.gateStatus(id)).G5.satisfied).toBe(false);
  });

  it('rejects a stale video hash and a file that changed on disk', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    const stale = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: 'a'.repeat(64), captionHash: capHash }, ownerHeaders);
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('BINDING_MISMATCH');
    writeFileSync(join(dir, VIDEO), 'tampered bytes');
    const tampered = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders);
    expect(tampered.status).toBe(409);
    expect(tampered.json.error.code).toBe('BINDING_MISMATCH');
    expect((await deps.workflow.gateStatus(id)).G5.satisfied).toBe(false);
  });

  it('rejects approval after the caption changed (old caption hash) and G5 is invalidated by a later caption change', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    await post(`/api/content/${id}/caption`, { captionText: CAPTION + ' Gewijzigd.' });
    const r = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('BINDING_MISMATCH');
    // Approve the current caption, then change it: G5 no longer counts.
    const newHash = captionHash(CAPTION + ' Gewijzigd.');
    expect((await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: newHash }, ownerHeaders)).status).toBe(201);
    await post(`/api/content/${id}/caption`, { captionText: 'Weer anders.' });
    expect((await deps.workflow.gateStatus(id)).G5.satisfied).toBe(false);
  });

  it('refuses SCHEDULED without G5 (schedule endpoint and direct transition)', async () => {
    const { id } = await readyForEditor();
    const direct = await post(`/api/content/${id}/transition`, { to: 'SCHEDULED', reason: 'sneak' });
    expect(direct.status).toBe(400);
    const toApproved = await post(`/api/content/${id}/transition`, { to: 'APPROVED_FOR_PUBLISHING', reason: 'no G5' });
    expect(toApproved.status).toBe(409);
    expect(toApproved.json.error.code).toBe('GATE_NOT_SATISFIED');
    const s = await post(`/api/content/${id}/schedule`, { scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(s.status).toBe(409);
    expect(['GATE_NOT_SATISFIED', 'INVALID_TRANSITION']).toContain(s.json.error.code);
    expect((await repo.contentItems.get(id))!.stage).toBe('READY_FOR_EDITOR');
  });

  it('refuses G5 before READY_FOR_EDITOR', async () => {
    const id = (await post('/api/content', { title: 'Vroeg goedkeuren test', pillar: 'x-test' })).json.item.id;
    const r = await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: 'b'.repeat(64), captionHash: 'c'.repeat(64) }, ownerHeaders);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('GATE_NOT_SATISFIED');
  });
});

describe('jobs, emergency stop, media', () => {
  it('enqueues idempotently, cancels, retries; render needs G2+G3', async () => {
    const j = await post('/api/jobs', { type: 'daily_brief' });
    expect(j.status).toBe(201);
    expect((await post('/api/jobs', { type: 'daily_brief' })).json.created).toBe(false);
    const cancel = await post(`/api/jobs/${j.json.job.id}/cancel`, {});
    expect(cancel.json.job.status).toBe('cancelled');
    expect((await post(`/api/jobs/${j.json.job.id}/cancel`, {})).status).toBe(409);
    expect((await post(`/api/jobs/${j.json.job.id}/retry`, {})).json.job.status).toBe('queued');
    const id = (await post('/api/content', { title: 'Render te vroeg test', pillar: 'x-test' })).json.item.id;
    const r = await post('/api/jobs', { type: 'render_video', contentId: id, slug: 'x' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('GATE_NOT_SATISFIED');
  });

  it('emergency stop: any actor can switch on, only owner off; blocks transitions and new jobs', async () => {
    const id = (await post('/api/content', { title: 'Noodstop test onderwerp', pillar: 'x-test' })).json.item.id;
    expect((await post('/api/system/emergency-stop', { on: true, reason: 'test', actorId: 'qa-engineer' })).status).toBe(200);
    expect((await call('GET', '/api/system')).json.emergencyStop.active).toBe(true);
    const t = await post(`/api/content/${id}/transition`, { to: 'RESEARCHING', reason: 'during stop' });
    expect(t.status).toBe(423);
    expect(t.json.error.code).toBe('EMERGENCY_STOP');
    expect((await post('/api/jobs', { type: 'daily_brief' })).status).toBe(423);
    expect((await post('/api/system/emergency-stop', { on: false, reason: 'test', actorId: 'qa-engineer' })).status).toBe(403);
    expect((await post('/api/system/emergency-stop', { on: false, reason: 'owner lifts' })).status).toBe(200);
  });

  it('serves media with Range and blocks path traversal', async () => {
    writeFileSync(join(dir, 'output', 'reels', 'clip.mp4'), Buffer.from('0123456789'));
    writeFileSync(join(dir, 'secret.txt'), 'nope');
    const full = await app.request('/media/reels/clip.mp4');
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    const part = await app.request('/media/reels/clip.mp4', { headers: { range: 'bytes=2-5' } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('2345');
    for (const p of ['/media/reels/..%2F..%2Fsecret.txt', '/media/reels/%2E%2E%2Fsecret.txt', '/media/../secret.txt', '/media/reels/.hidden.mp4', '/media/etc/passwd']) {
      const r = await app.request(p);
      expect(r.status, p).toBe(404);
    }
  });
});

describe('persistence', () => {
  it('keeps items, approvals and audit log across a restart (temp DB file)', async () => {
    const { id, assetSha, capHash } = await readyForEditor();
    expect((await post(`/api/content/${id}/owner-approval`, { confirmation: OWNER_CONFIRMATION, assetSha256: assetSha, captionHash: capHash }, ownerHeaders)).status).toBe(201);
    const before = (await call('GET', `/api/content/${id}`)).json;
    await repo.close();
    open(); // new connection, new app: simulates a server restart
    const after = (await call('GET', `/api/content/${id}`)).json;
    expect(after.item.stage).toBe('READY_FOR_EDITOR');
    expect(after.gates.G5.satisfied).toBe(true);
    expect(after.auditLog.length).toBe(before.auditLog.length);
    expect(after.approvals.length).toBe(before.approvals.length);
  });
});
