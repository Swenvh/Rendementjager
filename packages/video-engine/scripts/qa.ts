/**
 * Media QA (gate G4 input): npm run qa -w @rj/video-engine -- <mp4> [--frames-dir <dir>]
 * ffprobe checks format; frames are sampled and checked for blank (low-variance) images.
 * Writes <mp4 without ext>.qa.json and keeps representative frames in <name>.frames/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { measureLoudness, volumeStats } from '@rj/voice-engine';
import { arg, positional } from './lib/args.js';
import { CONTENT_SCRIPTS, REPO_DIR } from './lib/paths.js';

export interface FrameCheck {
  timeS: number;
  label: string;
  file: string | null;
  mean: number;
  stdDev: number;
  blank: boolean;
}

export interface MediaQaReport {
  file: string;
  checkedAt: string;
  pass: boolean;
  issues: string[];
  video: { codec: string | null; width: number | null; height: number | null; fps: number | null; pixFmt: string | null; durationS: number | null };
  audio: { present: boolean; codec: string | null; sampleRate: number | null; integratedLufs: number | null; maxVolumeDb: number | null; meanVolumeDb: number | null; silent: boolean | null };
  expectedDurationMs: number | null;
  frames: FrameCheck[];
  reportPath: string;
}

interface ProbeStream { codec_type: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; pix_fmt?: string; sample_rate?: string }

const rate = (r?: string) => {
  if (!r) return null;
  const [a, b] = r.split('/').map(Number);
  return b ? a! / b : a!;
};

/** Grayscale statistics of one frame, sampled at 108x192 straight from ffmpeg. */
function frameStats(file: string, timeS: number): { mean: number; stdDev: number } {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', timeS.toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=108:192,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  let sum = 0;
  for (const v of buf) sum += v;
  const mean = sum / buf.length;
  let sq = 0;
  for (const v of buf) sq += (v - mean) ** 2;
  return { mean, stdDev: Math.sqrt(sq / buf.length) };
}

/** Pick sample times: late in each scene (animations settled) when props exist, else evenly spaced. */
function sampleTimes(file: string, durationS: number): { timeS: number; label: string }[] {
  const slug = basename(file).replace(/\.mp4$/, '');
  const propsPath = join(CONTENT_SCRIPTS, slug, 'props.json');
  if (existsSync(propsPath)) {
    const props = JSON.parse(readFileSync(propsPath, 'utf8')) as { timeline: { scenes: { id: string; startMs: number; endMs: number }[] } };
    return props.timeline.scenes.map((s) => ({ timeS: (s.startMs + (s.endMs - s.startMs) * 0.72) / 1000, label: s.id }));
  }
  return [0.1, 0.25, 0.4, 0.55, 0.7, 0.9].map((p, i) => ({ timeS: durationS * p, label: `t${i}` }));
}

export async function runMediaQa(file: string, opts: { expectedDurationMs?: number; framesDir?: string } = {}): Promise<MediaQaReport> {
  const abs = resolve(file);
  const issues: string[] = [];
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', abs]).toString()) as {
    streams: ProbeStream[];
    format: { duration?: string };
  };
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  const durationS = probe.format.duration ? Number(probe.format.duration) : null;
  const fps = rate(v?.avg_frame_rate) ?? rate(v?.r_frame_rate);
  const video = { codec: v?.codec_name ?? null, width: v?.width ?? null, height: v?.height ?? null, fps, pixFmt: v?.pix_fmt ?? null, durationS };
  if (video.codec !== 'h264') issues.push(`video codec ${video.codec}, expected h264`);
  if (video.width !== 1080 || video.height !== 1920) issues.push(`resolution ${video.width}x${video.height}, expected 1080x1920`);
  if (fps === null || Math.abs(fps - 30) > 0.01) issues.push(`fps ${fps}, expected 30`);
  if (video.pixFmt !== 'yuv420p') issues.push(`pixel format ${video.pixFmt}, expected yuv420p`);
  if (!durationS || durationS < 3) issues.push(`duration ${durationS}s too short`);
  if (durationS && durationS > 90) issues.push(`duration ${durationS}s longer than 90s reel limit`);
  if (opts.expectedDurationMs && durationS && Math.abs(durationS * 1000 - opts.expectedDurationMs) > 250)
    issues.push(`duration ${durationS}s differs from expected ${(opts.expectedDurationMs / 1000).toFixed(2)}s`);

  let audio: MediaQaReport['audio'] = { present: false, codec: null, sampleRate: null, integratedLufs: null, maxVolumeDb: null, meanVolumeDb: null, silent: null };
  if (!a) issues.push('no audio stream');
  else {
    const vol = await volumeStats(abs);
    const loud = await measureLoudness(abs).catch(() => null);
    const silent = vol.maxVolumeDb === null || vol.maxVolumeDb < -40;
    audio = {
      present: true, codec: a.codec_name ?? null, sampleRate: a.sample_rate ? Number(a.sample_rate) : null,
      integratedLufs: loud && Number.isFinite(loud.integratedLufs) ? loud.integratedLufs : null,
      maxVolumeDb: vol.maxVolumeDb, meanVolumeDb: vol.meanVolumeDb, silent,
    };
    if (silent) issues.push('audio stream is silent');
    if (audio.integratedLufs !== null && (audio.integratedLufs < -20 || audio.integratedLufs > -12)) issues.push(`audio loudness ${audio.integratedLufs} LUFS outside -20..-12`);
  }

  const framesDir = opts.framesDir ?? join(dirname(abs), `${basename(abs, '.mp4')}.frames`);
  if (existsSync(framesDir)) for (const f of readdirSync(framesDir)) if (f.endsWith('.png')) rmSync(join(framesDir, f));
  mkdirSync(framesDir, { recursive: true });
  const frames: FrameCheck[] = [];
  const times = durationS ? sampleTimes(abs, durationS) : [];
  times.forEach(({ timeS, label }, i) => {
    const st = frameStats(abs, timeS);
    const blank = st.stdDev < 4;
    if (blank) issues.push(`blank frame at ${timeS.toFixed(2)}s (${label}), std dev ${st.stdDev.toFixed(2)}`);
    const out = join(framesDir, `${String(i + 1).padStart(2, '0')}-${label}-${timeS.toFixed(1)}s.png`);
    // Keep 6 representative frames, half size (540x960) so they stay small.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', timeS.toFixed(3), '-i', abs, '-frames:v', '1', '-vf', 'scale=540:960', out]);
    frames.push({ timeS: Number(timeS.toFixed(3)), label, file: relative(REPO_DIR, out), mean: Number(st.mean.toFixed(2)), stdDev: Number(st.stdDev.toFixed(2)), blank });
  });

  const reportPath = join(dirname(abs), `${basename(abs, '.mp4')}.qa.json`);
  const report: MediaQaReport = {
    file: relative(REPO_DIR, abs), checkedAt: new Date().toISOString(), pass: issues.length === 0, issues,
    video, audio, expectedDurationMs: opts.expectedDurationMs ?? null, frames, reportPath: relative(REPO_DIR, reportPath),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  return { ...report, reportPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = positional()[0];
  if (!file) {
    console.error('Usage: npm run qa -w @rj/video-engine -- <file.mp4> [--frames-dir <dir>]');
    process.exit(1);
  }
  const r = await runMediaQa(resolve(process.env.INIT_CWD ?? process.cwd(), file), { framesDir: arg('frames-dir') });
  console.log(JSON.stringify({ pass: r.pass, issues: r.issues, video: r.video, audio: r.audio, report: r.reportPath }, null, 2));
  process.exit(r.pass ? 0 : 2);
}
