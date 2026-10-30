import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function run(cmd: string, args: string[]): Promise<ExecResult> {
  const { stdout, stderr } = await execFileP(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
  return { stdout: String(stdout), stderr: String(stderr) };
}

export async function hasBinary(cmd: string): Promise<boolean> {
  try {
    await execFileP('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

/** Real duration of a media file in ms (ffprobe). */
export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  const s = Number(stdout.trim());
  if (!Number.isFinite(s)) throw new Error(`ffprobe returned no duration for ${file}`);
  return Math.round(s * 1000);
}
