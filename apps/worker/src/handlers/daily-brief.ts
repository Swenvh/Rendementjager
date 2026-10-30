import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Repository, repoPath } from '@rj/database';
import { getProviderStatuses } from '@rj/integrations';
import { GATES, type GateId, PIPELINE_STAGES, type PipelineStage } from '@rj/shared';
import type { JobHandler } from '../runner.js';

/** Stages where the item waits for a gate decision, and which gate. */
export const AWAITING_APPROVAL: Readonly<Partial<Record<PipelineStage, GateId>>> = {
  RESEARCHED: 'G1',
  SCRIPT_READY: 'G2',
  FACT_CHECK: 'G3',
  QA_REVIEW: 'G4',
  READY_FOR_EDITOR: 'G5',
};

export interface DailyBriefData {
  date: string;
  generatedAt: string;
  emergencyStop: boolean;
  pipeline: Record<PipelineStage, number>;
  totalItems: number;
  awaitingApproval: { id: string; title: string; stage: PipelineStage; gate: GateId; gateLabel: string }[];
  failedJobs: { id: string; type: string; contentId: string | null; lastError: string | null; finishedAt: string | null }[];
  queuedJobs: number;
  runningJobs: number;
  upcomingScheduled: { id: string; title: string; scheduledAt: string; platform: string | null }[];
  costs: { todayCents: number | null; monthCents: number | null; estimatedShareToday: boolean | null };
  integrations: { id: string; configured: boolean; mode: string }[];
}

/** Amsterdam calendar date (YYYY-MM-DD) for file names. */
export function amsterdamDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function collectDailyBrief(repo: Repository, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<DailyBriefData> {
  const items = await repo.contentItems.list({}, { orderBy: 'priority', desc: true });
  const pipeline = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<PipelineStage, number>;
  for (const i of items) pipeline[i.stage]++;
  const awaitingApproval = items
    .filter((i) => AWAITING_APPROVAL[i.stage])
    .map((i) => {
      const gate = AWAITING_APPROVAL[i.stage]!;
      return { id: i.id, title: i.title, stage: i.stage, gate, gateLabel: GATES[gate].label };
    });
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const failed = await repo.jobs.list({ status: 'failed', finishedAt: { op: 'gte', value: since } }, { orderBy: 'finishedAt', desc: true, limit: 20 });
  const nowIso = now.toISOString();
  const scheduledItems = items
    .filter((i) => i.stage === 'SCHEDULED' && i.scheduledAt && i.scheduledAt >= nowIso)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const upcomingScheduled = [];
  for (const i of scheduledItems) {
    const pub = await repo.publications.first({ contentId: i.id, status: 'scheduled' });
    upcomingScheduled.push({ id: i.id, title: i.title, scheduledAt: i.scheduledAt!, platform: pub?.platform ?? null });
  }
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const todayCents = await repo.costRecords.sum('amountCents', { createdAt: { op: 'gte', value: dayStart } });
  const monthCents = await repo.costRecords.sum('amountCents', { createdAt: { op: 'gte', value: monthStart } });
  const estimates = todayCents === null ? null : (await repo.costRecords.count({ createdAt: { op: 'gte', value: dayStart }, isEstimate: true })) > 0;
  const stopFlag = ['1', 'true', 'yes', 'on'].includes((env.RJ_EMERGENCY_STOP ?? '').toLowerCase()) || (await repo.getConfig<boolean>('emergency_stop')) === true;
  return {
    date: amsterdamDate(now),
    generatedAt: nowIso,
    emergencyStop: stopFlag,
    pipeline,
    totalItems: items.length,
    awaitingApproval,
    failedJobs: failed.map((j) => ({ id: j.id, type: j.type, contentId: j.contentId, lastError: j.lastError, finishedAt: j.finishedAt })),
    queuedJobs: await repo.jobs.count({ status: 'queued' }),
    runningJobs: await repo.jobs.count({ status: 'running' }),
    upcomingScheduled,
    costs: { todayCents, monthCents, estimatedShareToday: estimates },
    integrations: getProviderStatuses({ env }).map((s) => ({ id: s.id, configured: s.configured, mode: s.mode })),
  };
}

const eur = (cents: number | null) =>
  cents === null ? 'geen data' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export function renderDailyBrief(d: DailyBriefData): string {
  const L: string[] = [];
  L.push(`# Daily brief ${d.date}`, '', `Gegenereerd: ${d.generatedAt} (automatisch uit de database; geen verzonnen cijfers).`, '');
  if (d.emergencyStop) L.push('> **NOODSTOP ACTIEF.** De worker verwerkt geen jobs en transities zijn geblokkeerd (behalve FAILED/ARCHIVED).', '');
  L.push('## Pipeline', '');
  if (d.totalItems === 0) L.push('Geen content items in de database.');
  else {
    L.push('| Stage | Aantal |', '| --- | ---: |');
    for (const [stage, n] of Object.entries(d.pipeline)) if (n > 0) L.push(`| ${stage} | ${n} |`);
    L.push('', `Totaal: ${d.totalItems}`);
  }
  L.push('', '## Wacht op goedkeuring', '');
  if (d.awaitingApproval.length === 0) L.push('Niets.');
  for (const a of d.awaitingApproval) L.push(`- **${a.gate}** (${a.gateLabel}): ${a.title} — ${a.stage} \`${a.id}\`${a.gate === 'G5' ? ' ← jouw goedkeuring' : ''}`);
  L.push('', '## Gepland', '');
  if (d.upcomingScheduled.length === 0) L.push('Niets gepland.');
  for (const s of d.upcomingScheduled) L.push(`- ${s.scheduledAt}: ${s.title}${s.platform ? ` (${s.platform})` : ''}`);
  L.push('', '## Jobs', '', `In de wachtrij: ${d.queuedJobs}. Bezig: ${d.runningJobs}.`, '');
  if (d.failedJobs.length === 0) L.push('Geen mislukte jobs in de laatste 7 dagen.');
  else {
    L.push('Mislukt (laatste 7 dagen):');
    for (const j of d.failedJobs) L.push(`- ${j.type} \`${j.id}\`${j.contentId ? ` (content \`${j.contentId}\`)` : ''}: ${j.lastError ?? 'onbekende fout'}`);
  }
  L.push('', '## Kosten', '');
  L.push(`- Vandaag (UTC): ${eur(d.costs.todayCents)}${d.costs.estimatedShareToday ? ' (deels schatting)' : ''}`);
  L.push(`- Deze maand: ${eur(d.costs.monthCents)}`);
  L.push('', '## Integraties', '');
  for (const i of d.integrations) L.push(`- ${i.id}: ${i.mode}${i.configured ? ' (geconfigureerd)' : ' (niet geconfigureerd)'}`);
  L.push('');
  return L.join('\n');
}

export interface DailyBriefHandlerOptions {
  /** Output directory (default output/reports, relative to repo root). */
  outDir?: string;
}

export function createDailyBriefHandler(options: DailyBriefHandlerOptions = {}): JobHandler {
  return async ({ repo, now, env }) => {
    const data = await collectDailyBrief(repo, now(), env);
    const dir = repoPath(options.outDir ?? env.RJ_REPORTS_DIR ?? 'output/reports');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${data.date}-daily-brief.md`);
    writeFileSync(path, renderDailyBrief(data), 'utf8');
    return { result: { path, totalItems: data.totalItems, awaiting: data.awaitingApproval.length, failedJobs: data.failedJobs.length } };
  };
}
