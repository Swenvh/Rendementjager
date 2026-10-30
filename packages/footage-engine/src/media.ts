import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface ProbeResult {
  width: number;
  height: number;
  durationS: number;
  hasAudio: boolean;
  fps: number | null;
}

export type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export const defaultRunner: Runner = async (cmd, args) => {
  const { stdout, stderr } = await execFileP(cmd, args, { maxBuffer: 1 << 26 });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export type Prober = (file: string) => Promise<ProbeResult>;

export function ffprobeProber(run: Runner = defaultRunner): Prober {
  return async (file) => {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
    const j = JSON.parse(stdout) as { streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string }[]; format: { duration?: string } };
    const v = j.streams.find((s) => s.codec_type === 'video');
    if (!v?.width || !v.height) throw new Error(`no video stream in ${file}`);
    const [a, b] = (v.avg_frame_rate ?? '0/1').split('/').map(Number);
    return {
      width: v.width,
      height: v.height,
      durationS: Number(Number(j.format.duration ?? 0).toFixed(2)),
      hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
      fps: b ? a! / b : null,
    };
  };
}
