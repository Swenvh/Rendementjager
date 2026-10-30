import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSqliteRepository, seed } from '@rj/database';
import { WorkflowService } from '@rj/content-engine';
import { buildReelCalculation } from '@rj/finance-engine';
import { ResearchService } from '@rj/research-engine';
import { Worker, enqueueJob, registerDefaultHandlers } from '@rj/worker';
import { captionHash, sha256 } from '@rj/shared';

const ROOT = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'rj-int-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('foundation end-to-end (file DB)', () => {
  it('seeded Reel goes IDEA -> APPROVED_FOR_PUBLISHING with real calc, survives reopen, appears in daily brief', async () => {
    const dbPath = join(dir, 'e2e.sqlite');
    let repo = createSqliteRepository(dbPath);
    await seed(repo);
    const wf = new WorkflowService(repo, { env: {} });
    const research = new ResearchService(repo);
    const item = (await repo.contentItems.first({ template: 'C' }))!;
    expect(item.title).toBe('Wat doet €250 per maand beleggen over 30 jaar?');

    await wf.transition(item.id, 'RESEARCHING', 'research-analyst', 'start');
    await research.createBrief(
      {
        contentId: item.id,
        topic: item.title,
        kind: 'evergreen',
        summary: 'Rekenvoorbeeld rente-op-rente; aannames in beeld.',
        keyFacts: ['Beleggen kent risico; rendement is niet gegarandeerd'],
        sources: [{ url: 'https://www.afm.nl/nl-nl/consumenten', title: 'AFM consumenten' }],
      },
      'research-analyst',
    );
    await wf.transition(item.id, 'RESEARCHED', 'research-analyst', 'brief klaar');
    await wf.recordApproval('G1', item.id, 'content-strategist');
    await wf.transition(item.id, 'SCRIPTING', 'editorial-copywriter', 'schrijven');

    const calc = buildReelCalculation();
    const rev = await wf.addScriptRevision(
      item.id,
      { hook: 'Wat doet €250 per maand over 30 jaar?', body: `Je legt ${calc.display.totalContributed} in. Bij ${calc.display.annualReturn} per jaar (aanname) groeit dat naar ${calc.display.endValue}.`, onScreenText: calc.assumptions },
      'editorial-copywriter',
    );
    await wf.transition(item.id, 'SCRIPT_READY', 'editorial-copywriter', 'v1');
    await wf.recordApproval('G2', item.id, 'content-strategist', { scriptRevisionId: rev.id });
    await wf.transition(item.id, 'FACT_CHECK', 'content-strategist', 'factcheck');
    await wf.recordApproval('G3', item.id, 'fact-checker', { scriptRevisionId: rev.id, notes: 'cijfers uit finance-engine' });
    await wf.recordApproval('G3', item.id, 'compliance-reviewer', { scriptRevisionId: rev.id });
    await wf.transition(item.id, 'APPROVED_FOR_PRODUCTION', 'fact-checker', 'ok');
    await wf.transition(item.id, 'AUDIO_GENERATING', 'voice-producer', 'tts');
    await wf.transition(item.id, 'RENDERING', 'video-engineer', 'render');
    const asset = sha256('fake-mp4-bytes-for-test');
    await wf.setVideoAsset(item.id, { path: 'output/reels/test.mp4', sha256: asset }, 'video-engineer');
    await wf.transition(item.id, 'RENDERED', 'video-engineer', 'klaar');
    await wf.transition(item.id, 'QA_REVIEW', 'qa-engineer', 'qa');
    await wf.recordApproval('G4', item.id, 'qa-engineer', { assetSha256: asset });
    await wf.transition(item.id, 'READY_FOR_EDITOR', 'qa-engineer', 'qa ok');
    await wf.setCaption(item.id, 'Caption test', 'distribution-manager');
    await repo.close();

    // reopen: state persisted, G5 still required from the owner
    repo = createSqliteRepository(dbPath);
    const wf2 = new WorkflowService(repo, { env: {} });
    expect((await repo.contentItems.get(item.id))!.stage).toBe('READY_FOR_EDITOR');
    const reports = join(dir, 'reports');
    const worker = registerDefaultHandlers(new Worker(repo, { env: {}, log: { info() {}, warn() {}, error() {} } }), { dailyBrief: { outDir: reports } });
    await enqueueJob(repo, { type: 'daily_brief', idempotencyKey: 'brief-1' }, {});
    const s = await worker.runOnce();
    expect(s.succeeded).toHaveLength(1);
    const job = (await repo.jobs.first({ idempotencyKey: 'brief-1' }))!;
    const md = readFileSync((job.result as { path: string }).path, 'utf8');
    expect(md).toContain('**G5**');
    expect(md).toContain('jouw goedkeuring');

    await wf2.recordApproval('G5', item.id, 'owner', { assetSha256: asset, captionHash: captionHash('Caption test') });
    await wf2.transition(item.id, 'APPROVED_FOR_PUBLISHING', 'owner', 'goedgekeurd');
    const log = await wf2.getAuditLog(item.id);
    expect(log.filter((l) => l.action === 'transition').length).toBe(13); // seed IDEA + 12 moves
    await repo.close();
  });

  it('db:migrate, db:seed and worker --once CLIs run against RJ_DB_PATH', () => {
    const env = { ...process.env, RJ_DB_PATH: join(dir, 'cli.sqlite'), RJ_REPORTS_DIR: join(dir, 'cli-reports'), RJ_EMERGENCY_STOP: '0' };
    const run = (script: string, ...args: string[]) => execFileSync('npm', ['run', '--silent', script, '--', ...args], { cwd: ROOT, env, encoding: 'utf8' });
    expect(run('db:migrate')).toMatch(/Applied: 001_init.sql/);
    expect(run('db:seed')).toContain('+ Wat doet €250 per maand beleggen over 30 jaar?');
    expect(run('db:seed')).toContain('already present');
    expect(run('worker', '--enqueue', 'daily_brief', '--run')).toMatch(/1 succeeded/);
    expect(run('worker', '--once')).toMatch(/processed 0/);
  }, 60_000);
});
