/**
 * npm run publish -- export <contentId>    build output/publish/<slug>/ (refuses without a valid owner G5)
 * npm run publish -- verify <contentId>    recompute hashes, refuse (exit 1) if G5 is missing or stale
 * npm run publish -- due [--run]           enqueue publish_due jobs for due scheduled items (--run also processes the queue)
 * npm run publish -- status                caps, mode, staged items
 */
import { openRepository } from '@rj/database';
import { registerDefaultHandlers } from './handlers/index.js';
import { enqueueDuePublications, exportPackage, loadPublishConfig, makeDeps, publishCapacity, verifyPackage } from './publishing.js';
import { Worker } from './runner.js';

const [cmd, arg, ...rest] = process.argv.slice(2);
const repo = openRepository();
let code = 0;
try {
  const deps = makeDeps(repo);
  if (cmd === 'export' && arg) {
    const { dir, manifest } = await exportPackage(deps, arg);
    console.log(`package ready: ${dir}\n  video sha256 ${manifest.video.sha256}\n  caption hash ${manifest.caption.hash}\n  G5 approval  ${manifest.g5ApprovalId}`);
  } else if (cmd === 'verify' && arg) {
    const v = await verifyPackage(deps, arg);
    for (const c of v.checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: ${c.detail}`);
    console.log(v.ok ? 'VERIFIED: package matches the owner-approved video and caption.' : `REFUSED: ${v.reasons.length} check(s) failed. Do not post this package.`);
    if (!v.ok) code = 1;
  } else if (cmd === 'due') {
    const r = await enqueueDuePublications(deps);
    console.log(`publish_due: ${r.created} queued, ${r.requeued} re-queued after deferral`);
    if (rest.includes('--run') || arg === '--run') {
      const s = await registerDefaultHandlers(new Worker(repo)).runOnce();
      console.log(`processed ${s.processed}: ${s.succeeded.length} ok, ${s.failed.length} failed, ${s.retried.length} retry scheduled`);
    }
  } else if (cmd === 'status') {
    const cfg = loadPublishConfig();
    console.log(JSON.stringify({ config: { ...cfg, publicBaseUrl: cfg.publicBaseUrl ? 'set' : null }, capacity: await publishCapacity(deps) }, null, 2));
  } else {
    console.error('usage: npm run publish -- export|verify <contentId> | due [--run] | status');
    code = 2;
  }
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  code = 1;
} finally {
  await repo.close();
}
process.exit(code);
