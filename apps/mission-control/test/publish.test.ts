import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository, type Repository } from '@rj/database';
import { captionHash, newId, nowIso, sha256 } from '@rj/shared';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { createDeps, type AppDeps } from '../server/context.js';

// Fixtures only: temp DB + temp folders.
const CAPTION = 'Rekenvoorbeeld, geen advies. #beleggen';
let dir: string;
let repo: Repository;
let deps: AppDeps;
let app: Hono;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rj-pubapi-'));
  mkdirSync(join(dir, 'output', 'reels'), { recursive: true });
  repo = createSqliteRepository(join(dir, 't.sqlite'));
  deps = createDeps(repo, { env: {}, root: dir });
  app = createApp(deps);
});
afterEach(async () => {
  await repo.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, json, res };
}

async function approved(slug: string) {
  const wf = deps.workflow;
  writeFileSync(join(dir, 'output', 'reels', `${slug}.mp4`), `bytes-${slug}`);
  const sha = sha256(`bytes-${slug}`);
  const id = (await wf.createContentIdea({ title: `Pub ${slug}`, pillar: 'p', template: 'C' }, 'content-strategist')).id;
  await wf.transition(id, 'RESEARCHING', 'research-analyst', 's');
  const n = nowIso();
  await repo.researchBriefs.insert({ id: newId('rb'), contentId: id, topic: 't', kind: 'evergreen', summary: 's', keyFacts: [], status: 'draft', createdBy: 'research-analyst', createdAt: n, updatedAt: n });
  await wf.transition(id, 'RESEARCHED', 'research-analyst', 'b');
  await wf.recordApproval('G1', id, 'content-strategist');
  await wf.transition(id, 'SCRIPTING', 'editorial-copywriter', 'w');
  const rev = await wf.addScriptRevision(id, { hook: 'H', body: 'B', cta: 'C' }, 'editorial-copywriter');
  await wf.transition(id, 'SCRIPT_READY', 'editorial-copywriter', 'k');
  await wf.recordApproval('G2', id, 'content-strategist', { scriptRevisionId: rev.id });
  await wf.transition(id, 'FACT_CHECK', 'content-strategist', 'f');
  await wf.recordApproval('G3', id, 'fact-checker', { scriptRevisionId: rev.id });
  await wf.recordApproval('G3', id, 'compliance-reviewer', { scriptRevisionId: rev.id });
  await wf.transition(id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'ok');
  await wf.transition(id, 'AUDIO_GENERATING', 'voice-producer', 't');
  await wf.transition(id, 'RENDERING', 'video-engineer', 'r');
  await wf.setVideoAsset(id, { path: `output/reels/${slug}.mp4`, sha256: sha }, 'video-engineer');
  await wf.transition(id, 'RENDERED', 'video-engineer', 'd');
  await wf.transition(id, 'QA_REVIEW', 'qa-engineer', 'q');
  await wf.recordApproval('G4', id, 'qa-engineer', { assetSha256: sha });
  await wf.transition(id, 'READY_FOR_EDITOR', 'qa-engineer', 'ok');
  await wf.setCaption(id, CAPTION, 'distribution-manager');
  await wf.recordApproval('G5', id, 'owner', { assetSha256: sha, captionHash: captionHash(CAPTION) });
  await wf.transition(id, 'APPROVED_FOR_PUBLISHING', 'owner', 'goed');
  return { id, sha };
}

describe('/api/publish', () => {
  it('lists, packages, downloads, schedules and records a manual publication', async () => {
    const { id, sha } = await approved('p1');
    let r = await call('GET', '/api/publish');
    expect(r.status).toBe(200);
    expect(r.json.items[0]).toMatchObject({ id, state: 'approved', package: null, g5: { valid: true } });
    expect(r.json.live).toMatchObject({ adapterMode: 'mock', consent: false, tested: false });

    r = await call('POST', `/api/publish/${id}/package`, {});
    expect(r.status).toBe(201);
    expect(r.json.manifest.video.sha256).toBe(sha);
    const dl = await call('GET', `/api/publish/${id}/package/caption.txt`);
    expect(dl.status).toBe(200);
    expect(dl.json).toBe(CAPTION);
    expect(dl.res.headers.get('content-disposition')).toContain('attachment');
    for (const bad of ['..%2Fmanifest.json', 'x.txt', 'video.mp4%00']) expect((await call('GET', `/api/publish/${id}/package/${bad}`)).status).toBe(404);
    expect((await call('GET', '/api/publish/nope/package/video.mp4')).status).toBe(404);
    expect((await call('POST', `/api/publish/${id}/verify`, {})).json.ok).toBe(true);

    const future = new Date(Date.now() + 3600_000).toISOString();
    expect((await call('POST', `/api/content/${id}/schedule`, { scheduledAt: future, platform: 'instagram', actorId: 'owner' })).status).toBe(201);
    r = await call('GET', '/api/publish');
    expect(r.json.items[0].state).toBe('scheduled');

    expect((await call('POST', `/api/publish/${id}/manual-published`, { url: 'https://evil.example/reel/ABCDE12345/' })).status).toBe(400);
    expect((await call('POST', `/api/publish/${id}/manual-published`, { url: 'https://www.instagram.com/reel/ABCDE12345/' })).status).toBe(200);
    r = await call('GET', '/api/publish');
    expect(r.json.items[0]).toMatchObject({ state: 'published' });
    expect(r.json.log.some((l: any) => l.event === 'manual_published')).toBe(true);
  });

  it('refuses a package when the video changed after approval, and only the owner may toggle live consent', async () => {
    const { id } = await approved('p2');
    writeFileSync(join(dir, 'output', 'reels', 'p2.mp4'), 'changed');
    const r = await call('POST', `/api/publish/${id}/package`, {});
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.json)).toMatch(/differs from the approved/);
    expect((await call('POST', '/api/publish/live-consent', { on: true, actorId: 'distribution-manager' })).status).toBe(403);
    expect((await call('POST', '/api/publish/live-consent', { on: true, actorId: 'owner' })).json.consent).toBe(true);
  });
});
