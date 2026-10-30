/**
 * npm run methods -- seed [--out content/research/methods]   create the 3 method briefs (draft) in the DB + write markdown
 * npm run methods -- list                                     show id, status, hash and UNVERIFIED count per brief
 *
 * Never approves anything: G1 for series is the owner's action in Mission Control (Methodebrieven).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT, openRepository } from '@rj/database';
import { ResearchService } from './briefs.js';
import { METHOD_KINDS, isUnverifiedSource, renderMethodBriefMarkdown } from './methods.js';

const [cmd = 'list', ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
const outDir = outIdx >= 0 && rest[outIdx + 1] ? resolve(process.cwd(), rest[outIdx + 1]!) : join(REPO_ROOT, 'content', 'research', 'methods');

const repo = openRepository();
try {
  const svc = new ResearchService(repo);
  if (cmd === 'seed') await svc.ensureMethodBriefs('research-analyst');
  else if (cmd !== 'list') throw new Error(`Unknown command "${cmd}" (seed|list)`);
  if (cmd === 'seed') mkdirSync(outDir, { recursive: true });
  for (const kind of METHOD_KINDS) {
    const m = await svc.getMethodBrief(kind);
    if (!m) {
      console.log(`${kind}: no method brief (run: npm run methods -- seed)`);
      continue;
    }
    console.log(`${kind}: ${m.brief.id} status=${m.brief.status} hash=${m.hash} sources=${m.sources.length} unverified=${m.sources.filter(isUnverifiedSource).length}`);
    if (cmd === 'seed') writeFileSync(join(outDir, `${kind}.md`), renderMethodBriefMarkdown(kind, m.brief, m.sources));
  }
} finally {
  await repo.close();
}
