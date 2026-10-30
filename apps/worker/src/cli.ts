/**
 * npm run worker -- --once                       process due jobs once and exit (default)
 * npm run worker -- --watch [--interval 30000]   keep polling (Ctrl+C to stop)
 * npm run worker -- --enqueue daily_brief        enqueue a job (idempotent per type/content/day) and exit
 *                   [--content <id>] [--slug <slug>] [--run]   (--run also processes the queue once)
 */
import { openRepository } from '@rj/database';
import { JobTypeSchema } from '@rj/shared';
import { amsterdamDate } from './handlers/daily-brief.js';
import { registerDefaultHandlers } from './handlers/index.js';
import { enqueueJob } from './queue.js';
import { Worker } from './runner.js';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const repo = openRepository();
const worker = registerDefaultHandlers(new Worker(repo));

async function once(): Promise<void> {
  const s = await worker.runOnce();
  console.log(
    s.emergencyStop && s.processed === 0
      ? 'Emergency stop active: nothing processed.'
      : `processed ${s.processed}: ${s.succeeded.length} succeeded, ${s.failed.length} failed, ${s.retried.length} retry scheduled, ${s.deferredByCostCap.length} deferred by cost cap`,
  );
}

try {
  const enqueue = opt('enqueue');
  if (enqueue) {
    const type = JobTypeSchema.parse(enqueue);
    const contentId = opt('content') ?? null;
    const slug = opt('slug');
    const key = opt('key') ?? `${type}:${contentId ?? '-'}:${amsterdamDate(new Date())}`;
    const { job, created } = await enqueueJob(repo, { type, idempotencyKey: key, contentId, payload: slug ? { slug } : {} });
    console.log(`${created ? 'queued' : 'already exists'}: ${job.id} (${job.type}, ${job.status})`);
    if (flag('run')) await once();
  } else if (flag('watch')) {
    const interval = Number(opt('interval') ?? 30_000);
    console.log(`watching every ${interval} ms (Ctrl+C to stop)`);
    let stopping = false;
    process.on('SIGINT', () => (stopping = true));
    while (!stopping) {
      await once();
      await new Promise((r) => setTimeout(r, interval));
    }
  } else {
    await once();
  }
} finally {
  await repo.close();
}
