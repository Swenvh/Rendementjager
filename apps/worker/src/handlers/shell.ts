import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '@rj/database';
import { type JobHandler, NonRetryableError } from '../runner.js';

export interface WorkspaceScript {
  /** Workspace package name, e.g. "@rj/video-engine". */
  workspace: string;
  /** npm script name in that package, e.g. "render". */
  script: string;
}

/** Locates a workspace package directory by name (packages/* and apps/*). */
export function workspaceDir(name: string, root: string = REPO_ROOT): string | null {
  const short = name.replace(/^@rj\//, '');
  for (const base of ['packages', 'apps']) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, base, short, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === name) return join(root, base, short);
    } catch {
      /* not here */
    }
  }
  return null;
}

export function hasWorkspaceScript(target: WorkspaceScript, root: string = REPO_ROOT): boolean {
  const dir = workspaceDir(target.workspace, root);
  if (!dir) return false;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  return typeof pkg.scripts?.[target.script] === 'string';
}

export interface ShellHandlerOptions {
  root?: string;
  /** Builds the CLI args after "--" from the job (default: --content <payload.slug ?? contentId>). */
  args?: (job: Parameters<JobHandler>[0]['job']) => string[];
  /** Override the process runner (tests). */
  run?: (cmd: string, args: string[], opts: { cwd: string; signal: AbortSignal }) => Promise<{ code: number | null; output: string }>;
}

export function runProcess(cmd: string, args: string[], opts: { cwd: string; signal: AbortSignal }): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, signal: opts.signal, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const keep = (b: Buffer) => {
      output = (output + b.toString('utf8')).slice(-8000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', (err) => (err.name === 'AbortError' ? resolve({ code: null, output: output + '\n[aborted]' }) : reject(err)));
    child.on('close', (code) => resolve({ code, output }));
  });
}

function defaultArgs(job: Parameters<JobHandler>[0]['job']): string[] {
  const payload = (job.payload ?? {}) as { slug?: unknown };
  const target = typeof payload.slug === 'string' ? payload.slug : job.contentId;
  if (!target) throw new NonRetryableError('job needs a contentId or payload.slug');
  // The value reaches CLI args and path joins: allow plain slugs only (no leading dash/dot, no separators).
  if (!/^[A-Za-z0-9][\w.-]*$/.test(target) || target.includes('..')) throw new NonRetryableError('job target is not a valid slug');
  return ['--content', target];
}

/**
 * Handler that runs `npm run <script> -w <workspace> -- <args>` from the repo root. Fails with a
 * clear non-retryable "not available" error when the script does not exist (yet).
 */
export function createWorkspaceScriptHandler(target: WorkspaceScript, options: ShellHandlerOptions = {}): JobHandler {
  const root = options.root ?? REPO_ROOT;
  const run = options.run ?? runProcess;
  return async ({ job, signal }) => {
    if (!hasWorkspaceScript(target, root))
      throw new NonRetryableError(`not available: npm script "${target.script}" is missing in ${target.workspace}`);
    const args = (options.args ?? defaultArgs)(job);
    const { code, output } = await run('npm', ['run', target.script, '-w', target.workspace, '--', ...args], { cwd: root, signal });
    if (signal.aborted) throw new Error('aborted (timeout)');
    if (code !== 0) throw new Error(`${target.workspace} ${target.script} exited with code ${code}: ${output.slice(-500)}`);
    return { result: { command: `npm run ${target.script} -w ${target.workspace} -- ${args.join(' ')}`, outputTail: output.slice(-2000) } };
  };
}
